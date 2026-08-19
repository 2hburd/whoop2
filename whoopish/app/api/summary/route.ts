import { NextRequest, NextResponse } from "next/server";
import { getRefreshToken, refreshAccessToken } from "@/lib/google";
import { fetchDays, type Diag } from "@/lib/health";
import { scoreDays } from "@/lib/scoring";
import { demoDays } from "@/lib/demo";

export const dynamic = "force-dynamic";

const FETCH_DAYS = 120;

// How many days of real, non-null data before a metric's baseline is trustworthy.
const BASELINE_READY_DAYS = 14;

export async function GET(req: NextRequest) {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (FETCH_DAYS - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const debug: any = { hasRefreshToken: false, tokenRefreshError: null, diag: [] as Diag[] };

  const rt = await getRefreshToken();
  debug.hasRefreshToken = !!rt;
  let demo = false;
  let days;

  if (rt) {
    try {
      const token = await refreshAccessToken(rt);
      const mid = new Date(start);
      mid.setUTCDate(mid.getUTCDate() + 60);
      const midNext = new Date(mid);
      midNext.setUTCDate(midNext.getUTCDate() + 1);
      const [a, b] = await Promise.all([
        fetchDays(token, fmt(start), fmt(mid)),
        fetchDays(token, fmt(midNext), fmt(end)),
      ]);
      days = [...a.days, ...b.days];
      debug.diag = [...a.diag, ...b.diag];
      // b covers the more recent half of the range, so its sync time wins if present.
      var lastSyncTime: string | null = b.lastSyncTime || a.lastSyncTime;
    } catch (e: any) {
      debug.tokenRefreshError = String(e?.message || e);
    }
  }
  if (!days) {
    demo = true;
    days = demoDays(FETCH_DAYS, end);
  }

  const scored = scoreDays(days).slice(-90);
  debug.lastRawDay = days.at(-1);
  debug.failedCalls = debug.diag.filter((d: Diag) => !d.ok).length;
  debug.totalCalls = debug.diag.length;

  // --- Sync time: real clock-time from the latest zone-minute record if we
  // have one (continuous throughout the day), else fall back to the newest
  // day that has any real metric (date only, no time available).
  let lastSync: string | null = typeof lastSyncTime !== "undefined" ? lastSyncTime : null;
  if (!lastSync) {
    for (let i = scored.length - 1; i >= 0; i--) {
      const d = scored[i];
      if (d.hrv != null || d.rhr != null || d.sleepMin != null || d.steps != null) {
        lastSync = d.date;
        break;
      }
    }
  }

  // --- Baseline readiness: count days of real data per metric, project the
  // date each baseline becomes trustworthy (needs BASELINE_READY_DAYS). -----
  const countReal = (key: "hrv" | "rhr" | "sleepMin") =>
    scored.filter(d => (d as any)[key] != null).length;
  const projectDate = (have: number) => {
    if (have >= BASELINE_READY_DAYS) return null; // already ready
    const remaining = BASELINE_READY_DAYS - have;
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + remaining);
    return d.toISOString().slice(0, 10);
  };
  const baselines = {
    hrvDays: countReal("hrv"),
    rhrDays: countReal("rhr"),
    sleepDays: countReal("sleepMin"),
    readyDate: projectDate(Math.min(countReal("hrv"), countReal("rhr"))),
    needDays: BASELINE_READY_DAYS,
  };

  return NextResponse.json({ demo, days: scored, debug, lastSync, baselines });
}
