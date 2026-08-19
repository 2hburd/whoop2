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
      filter: `sleep.interval.civil_end_time >= "${start}T00:00:00"`,
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


// Active Zone Minutes come back as one record PER MINUTE (each with a zone and
// a value of 1-2), not a daily total — so we sum them per day per zone here.
async function fetchAzm(token: string, start: string, end: string, diag: Diag[]) {
  const byDate: Record<string, { fatBurn: number; cardio: number; peak: number; total: number }> = {};
  let latestEndTime: string | null = null; // real clock-time timestamp, for "last synced"
  let pageToken = "";
  for (let i = 0; i < 40; i++) {
    const q = new URLSearchParams({
      filter: `active_zone_minutes.interval.civil_start_time >= "${start}T00:00:00"`,
    });
    if (pageToken) q.set("pageToken", pageToken);
    const j = await api(token, `/users/me/dataTypes/active-zone-minutes/dataPoints:reconcile?${q}`, diag);
    if (!j) break;
    for (const p of j.dataPoints || []) {
      const a = p.activeZoneMinutes;
      const d = a?.interval?.civilStartTime?.date;
      if (!d) continue;
      const key = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
      const endTime = a?.interval?.endTime;
      if (endTime && (!latestEndTime || endTime > latestEndTime)) latestEndTime = endTime;
      if (key < start || key > end) continue;
      const mins = Number(a.activeZoneMinutes || 0);
      const zone = String(a.heartRateZone || "");
      const rec = byDate[key] || { fatBurn: 0, cardio: 0, peak: 0, total: 0 };
      if (zone === "FAT_BURN") rec.fatBurn += mins;
      else if (zone === "CARDIO") rec.cardio += mins;
      else if (zone === "PEAK") rec.peak += mins;
      rec.total += mins; // AZM value already counts cardio/peak minutes double
      byDate[key] = rec;
    }
    pageToken = j.nextPageToken || "";
    if (!pageToken) break;
  }
  return { byDate, latestEndTime };
}


// Steps come back as one record per sync interval (not a single daily total),
// so — same as AZM — we sum them per day here to get a genuinely live count.
async function fetchSteps(token: string, start: string, end: string, diag: Diag[]) {
  const byDate: Record<string, number> = {};
  let latestEndTime: string | null = null;
  let pageToken = "";
  for (let i = 0; i < 60; i++) {
    const q = new URLSearchParams({
      filter: `steps.interval.civil_start_time >= "${start}T00:00:00"`,
    });
    if (pageToken) q.set("pageToken", pageToken);
    const j = await api(token, `/users/me/dataTypes/steps/dataPoints:reconcile?${q}`, diag);
    if (!j) break;
    for (const p of j.dataPoints || []) {
      const s = p.steps;
      const d = s?.interval?.civilStartTime?.date;
      if (!d) continue;
      const key = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
      const endTime = s?.interval?.endTime;
      if (endTime && (!latestEndTime || endTime > latestEndTime)) latestEndTime = endTime;
      if (key < start || key > end) continue;
      const count = firstNum(s, ["count", "stepsCount", "value"]) || 0;
      byDate[key] = (byDate[key] || 0) + count;
    }
    pageToken = j.nextPageToken || "";
    if (!pageToken) break;
  }
  return { byDate, latestEndTime };
}

export async function fetchDays(token: string, start: string, end: string): Promise<{ days: DayMetrics[]; diag: Diag[]; lastSyncTime: string | null }> {
  const diag: Diag[] = [];
  const [sleep, hrv, rhr, resp, spo2, stepsResult, cals, azmResult] = await Promise.all([
    fetchSleep(token, start, end, diag),
    reconcileSince(token, DATA_TYPES.hrv, "daily_heart_rate_variability.date", start, end, diag),
    reconcileSince(token, DATA_TYPES.restingHeartRate, "daily_resting_heart_rate.date", start, end, diag),
    reconcileSince(token, DATA_TYPES.breathingRate, "daily_respiratory_rate.date", start, end, diag),
    reconcileSince(token, DATA_TYPES.spo2, "daily_oxygen_saturation.date", start, end, diag),
    fetchSteps(token, start, end, diag),
    dailyRollup(token, DATA_TYPES.calories, start, end, diag, 14),
    fetchAzm(token, start, end, diag),
  ]);

  const azm = azmResult.byDate;
  const steps = stepsResult.byDate;
  const latestEndTime = [azmResult.latestEndTime, stepsResult.latestEndTime].filter(Boolean).sort().at(-1) || null;
  const days: DayMetrics[] = [];
  for (let d = new Date(start + "T00:00:00Z"); ymd(d) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = ymd(d);
    const a = azm[date];
    const fatBurn = a?.fatBurn || 0;
    const cardio = a?.cardio || 0;
    const peak = a?.peak || 0;
    const total = a?.total || (fatBurn + cardio + peak);
    days.push({
      date,
      sleepMin: sleep[date]?.min ?? null,
      sleepStages: sleep[date]?.stages ?? null,
      hrv: firstNum(hrv[date], ["averageHeartRateVariabilityMilliseconds", "average_heart_rate_variability_milliseconds"]),
      rhr: firstNum(rhr[date], ["beatsPerMinute", "beats_per_minute"]),
      respRate: firstNum(resp[date], ["breathsPerMinute", "breaths_per_minute"]),
      spo2: firstNum(spo2[date], ["averagePercentage", "average_percentage"]),
      steps: steps[date] ?? null,
      calories: firstNum(cals[date], ["kcalSum", "kcal", "caloriesSum"]),
      azm: a ? { fatBurn, cardio, peak, total } : null,
    });
  }
  return { days, diag, lastSyncTime: latestEndTime };
}
