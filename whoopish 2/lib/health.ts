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

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function civil(dateStr: string, end = false) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return {
    date: { year: y, month: m, day: d },
    time: end ? { hours: 23, minutes: 59, seconds: 59, nanos: 0 } : { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
  };
}

export interface Diag {
  path: string;
  status: number;
  ok: boolean;
  message: string;
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
    // Tolerate unknown data types / gaps rather than failing the whole page.
    return null;
  }
  diag.push({ path, status: res.status, ok: true, message: "ok" });
  return res.json();
}

// Daily rollups for one data type across [start, end] (inclusive, <=90 days).
// Returns map of date -> raw metric object for that day.
async function dailyRollup(token: string, type: string, start: string, end: string, diag: Diag[]) {
  const j = await api(token, `/users/me/dataTypes/${type}/dataPoints:dailyRollUp`, diag, {
    range: { start: civil(start), end: civil(end, true) },
    windowSizeDays: 1,
  });
  const out: Record<string, any> = {};
  for (const p of j?.rollupDataPoints || []) {
    const d = p.civilStartTime?.date;
    if (!d) continue;
    const key = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
    out[key] = p;
  }
  return out;
}

// First numeric value found among likely field names — rollup payload shapes
// vary by data type, so parse defensively.
function firstNum(obj: any, names: string[]): number | null {
  if (!obj) return null;
  for (const container of Object.values(obj)) {
    if (typeof container !== "object" || container === null) continue;
    for (const n of names) {
      const v = (container as any)[n];
      if (v !== undefined && v !== null && !isNaN(Number(v))) return Number(v);
    }
  }
  return null;
}

// Sleep sessions via reconcile (page cap 25 -> paginate).
async function fetchSleep(token: string, start: string, end: string, diag: Diag[]) {
  const byDate: Record<string, { min: number; stages: DayMetrics["sleepStages"] }> = {};
  let pageToken = "";
  for (let i = 0; i < 8; i++) {
    const q = new URLSearchParams({
      filter: `sleep.interval.civil_end_time >= "${start}" AND sleep.interval.civil_end_time <= "${end}T23:59:59"`,
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
    dailyRollup(token, DATA_TYPES.hrv, start, end, diag),
    dailyRollup(token, DATA_TYPES.restingHeartRate, start, end, diag),
    dailyRollup(token, DATA_TYPES.breathingRate, start, end, diag),
    dailyRollup(token, DATA_TYPES.spo2, start, end, diag),
    dailyRollup(token, DATA_TYPES.steps, start, end, diag),
    dailyRollup(token, DATA_TYPES.calories, start, end, diag),
    dailyRollup(token, DATA_TYPES.activeMinutes, start, end, diag),
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
      hrv: firstNum(hrv[date], ["rmssdAvg", "rmssd", "dailyRmssdAvg", "valueAvg", "avg"]),
      rhr: firstNum(rhr[date], ["bpmAvg", "bpm", "restingHeartRateAvg", "valueAvg", "avg"]),
      respRate: firstNum(resp[date], ["breathsPerMinuteAvg", "breathsPerMinute", "valueAvg", "avg"]),
      spo2: firstNum(spo2[date], ["percentageAvg", "percentage", "valueAvg", "avg"]),
      steps: firstNum(steps[date], ["countSum", "count"]),
      calories: firstNum(cals[date], ["kcalSum", "kcal", "caloriesSum"]),
      azm: a ? { fatBurn, cardio, peak, total } : null,
    });
  }
  return { days, diag };
}
