import { DATA_TYPES } from "./config";

const BASE = "https://health.googleapis.com/v4";

export interface DayMetrics {
  date: string;               // YYYY-MM-DD
  sleepMin: number | null;    // minutes asleep
  sleepStages: { deep: number; light: number; rem: number; awake: number } | null;
  hrv: number | null;         // ms (rMSSD)
  rhr: number | null;         // bpm
  respRate: number | null;    // breaths/min
  spo2: number | null;        // %
  steps: number | null;
  calories: number | null;
  azm: { fatBurn: number; cardio: number; peak: number; total: number } | null;
}

export interface Diag {
  path: string;
  status: number;
  ok: boolean;
  message: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

// Split [start, end] (inclusive) into chunks no longer than maxDays.
function chunkRange(start: string, end: string, maxDays: number): [string, string][] {
  const chunks: [string, string][] = [];
  let cur = start;
  while (cur <= end) {
    const chunkEnd = addDays(cur, maxDays - 1);
    chunks.push([cur, chunkEnd > end ? end : chunkEnd]);
    cur = addDays(chunkEnd > end ? end : chunkEnd, 1);
  }
  return chunks;
}

function civil(dateStr: string, end = false) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return {
    date: { year: y, month: m, day: d },
    time: end ? { hours: 23, minutes: 59, seconds: 59, nanos: 0 } : { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
  };
}

async function api(token: string, path: string, diag: Diag[], body?: unknown) {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e: any) {
    diag.push({ path, status: 0, ok: false, message: `network error: ${e?.message || e}` });
    return null;
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 400);
    diag.push({ path, status: res.status, ok: false, message: text });
    return null;
  }
  diag.push({ path, status: res.status, ok: true, message: "ok" });
  return res.json();
}

// dailyRollUp, auto-chunked to respect the API's per-type max range
// (14 days for active-minutes/total-calories/heart-rate, 90 for the rest).
async function dailyRollup(
  token: string, type: string, start: string, end: string, diag: Diag[], maxRangeDays = 90
) {
  const out: Record<string, any> = {};
  for (const [cs, ce] of chunkRange(start, end, maxRangeDays)) {
    const j = await api(token, `/users/me/dataTypes/${type}/dataPoints:dailyRollUp`, diag, {
      range: { start: civil(cs), end: civil(ce, true) },
      windowSizeDays: 1,
    });
    for (const p of j?.rollupDataPoints || []) {
      const d = p.civilStartTime?.date;
      if (!d) continue;
      const key = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
      out[key] = p;
    }
  }
  return out;
}

// reconcile with a single lower-bound filter (the API rejects a combined
// >= / <= range on one field), then keep only entries inside [start, end]
// ourselves. Works for both interval-based types (sleep) and Daily types
// (daily-heart-rate-variability, etc.) by passing the right field name.
async function reconcileSince(
  token: string, type: string, filterField: string, start: string, end: string, diag: Diag[]
) {
  const out: Record<string, any> = {};
  let pageToken = "";
  for (let i = 0; i < 12; i++) {
    const q = new URLSearchParams({
      filter: `${filterField} >= "${start}T00:00:00"`,
    });
    if (pageToken) q.set("pageToken", pageToken);
    const j = await api(token, `/users/me/dataTypes/${type}/dataPoints:reconcile?${q}`, diag);
    if (!j) break;
    for (const p of j.dataPoints || []) {
      const record = p[Object.keys(p).find(k => k !== "dataPointName" && k !== "dataSource") || ""];
      const d = record?.date;
      if (!d) continue;
      const key = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
      if (key >= start && key <= end) out[key] = record;
    }
    pageToken = j.nextPageToken || "";
    if (!pageToken) break;
  }
  return out;
}

function firstNum(obj: any, names: string[]): number | null {
  if (!obj) return null;
  for (const n of names) {
    const v = obj[n];
    if (v !== undefined && v !== null && !isNaN(Number(v))) return Number(v);
  }
  return null;
}

// Sleep sessions via reconcile, single lower-bound filter + client-side
// date range trim (see reconcileSince comment above for why).
async function fetchSleep(token: string, start: string, end: string, diag: Diag[]) {
  const byDate: Record<string, { min: number; stages: DayMetrics["sleepStages"] }> = {};
  let pageToken = "";
  for (let i = 0; i < 12; i++) {
    const q = new URLSearchParams({
      filter: `sleep.interval.civil_start_time >= "${start}T00:00:00"`,
    });
    if (pageToken) q.set("pageToken", pageToken);
    const j = await api(token, `/users/me/dataTypes/${DATA_TYPES.sleep}/dataPoints:reconcile?${q}`, diag);
    if (!j) break;
    for (const p of j.dataPoints || []) {
      const s = p.sleep;
      if (!s?.summary || s.metadata?.main === false) continue;
      const endT = s.interval?.endTime;
      if (!endT) continue;
      const date = ymd(new Date(endT)); // credit sleep to wake-up day
      if (date < start || date > end) continue;
      const min = Number(s.summary.minutesAsleep || 0);
      const stages = { deep: 0, light: 0, rem: 0, awake: 0 };
      for (const st of s.summary.stagesSummary || []) {
        const t = String(st.type || "").toLowerCase();
        if (t in stages) (stages as any)[t] += Number(st.minutes || 0);
      }
      const prev = byDate[date];
      if (!prev || min > prev.min) byDate[date] = { min, stages };
    }
    pageToken = j.nextPageToken || "";
    if (!pageToken) break;
  }
  return byDate;
}

export async function fetchDays(token: string, start: string, end: string): Promise<{ days: DayMetrics[]; diag: Diag[] }> {
  const diag: Diag[] = [];
  const [sleep, hrv, rhr, resp, spo2, steps, cals, azm] = await Promise.all([
    fetchSleep(token, start, end, diag),
    reconcileSince(token, DATA_TYPES.hrv, "daily_heart_rate_variability.date", start, end, diag),
    reconcileSince(token, DATA_TYPES.restingHeartRate, "daily_resting_heart_rate.date", start, end, diag),
    reconcileSince(token, DATA_TYPES.breathingRate, "daily_respiratory_rate.date", start, end, diag),
    reconcileSince(token, DATA_TYPES.spo2, "daily_oxygen_saturation.date", start, end, diag),
    dailyRollup(token, DATA_TYPES.steps, start, end, diag, 90),
    dailyRollup(token, DATA_TYPES.calories, start, end, diag, 14),
    dailyRollup(token, DATA_TYPES.activeMinutes, start, end, diag, 14),
  ]);

  const days: DayMetrics[] = [];
  for (let d = new Date(start + "T00:00:00Z"); ymd(d) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = ymd(d);
    const a = azm[date];
    const fatBurn = firstNum(a, ["fatBurnMinutes", "fatBurnMinutesSum", "moderateMinutesSum"]) || 0;
    const cardio = firstNum(a, ["cardioMinutes", "cardioMinutesSum", "vigorousMinutesSum"]) || 0;
    const peak = firstNum(a, ["peakMinutes", "peakMinutesSum"]) || 0;
    const total = firstNum(a, ["activeZoneMinutes", "activeZoneMinutesSum", "minutesSum", "countSum"]) || fatBurn + cardio + peak;
    days.push({
      date,
      sleepMin: sleep[date]?.min ?? null,
      sleepStages: sleep[date]?.stages ?? null,
      hrv: firstNum(hrv[date], ["averageHeartRateVariabilityMilliseconds", "average_heart_rate_variability_milliseconds"]),
      rhr: firstNum(rhr[date], ["beatsPerMinute", "beats_per_minute"]),
      respRate: firstNum(resp[date], ["breathsPerMinute", "breaths_per_minute"]),
      spo2: firstNum(spo2[date], ["averagePercentage", "average_percentage"]),
      steps: firstNum(steps[date], ["countSum", "count"]),
      calories: firstNum(cals[date], ["kcalSum", "kcal", "caloriesSum"]),
      azm: a ? { fatBurn, cardio, peak, total } : null,
    });
  }
  return { days, diag };
}
