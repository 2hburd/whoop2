// TEMP diagnostic: dumps one raw, untouched Google Health API response per
// data type so we can see the exact JSON shape. Remove once parsing is fixed.
import { NextRequest, NextResponse } from "next/server";
import { getRefreshToken, refreshAccessToken } from "@/lib/google";

export const dynamic = "force-dynamic";

const BASE = "https://health.googleapis.com/v4";

export async function GET(req: NextRequest) {
  const rt = await getRefreshToken();
  if (!rt) return NextResponse.json({ error: "no refresh token" });
  const token = await refreshAccessToken(rt);

  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 10);
  const s = start.toISOString().slice(0, 10);

  async function raw(path: string) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { status: res.status, text: text.slice(0, 500) }; }
  }

  // Grab the first data point of each type, raw and untouched.
  const [sleep, hrv, rhr, azm, steps] = await Promise.all([
    raw(`/users/me/dataTypes/sleep/dataPoints:reconcile?filter=sleep.interval.civil_end_time >= "${s}T00:00:00"&pageSize=2`),
    raw(`/users/me/dataTypes/daily-heart-rate-variability/dataPoints:reconcile?filter=daily_heart_rate_variability.date >= "${s}"&pageSize=2`),
    raw(`/users/me/dataTypes/daily-resting-heart-rate/dataPoints:reconcile?filter=daily_resting_heart_rate.date >= "${s}"&pageSize=2`),
    raw(`/users/me/dataTypes/active-zone-minutes/dataPoints:reconcile?filter=active_zone_minutes.interval.civil_start_time >= "${s}"&pageSize=3`),
    raw(`/users/me/dataTypes/steps/dataPoints:dailyRollUp`),
  ]);

  return NextResponse.json({
    sleep_first: sleep?.dataPoints?.[0] ?? sleep,
    hrv_first: hrv?.dataPoints?.[0] ?? hrv,
    rhr_first: rhr?.dataPoints?.[0] ?? rhr,
    azm_first: azm?.dataPoints?.[0] ?? azm,
  }, { headers: { "Cache-Control": "no-store" } });
}
