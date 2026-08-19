import { NextRequest, NextResponse } from "next/server";
import { getRefreshToken, refreshAccessToken } from "@/lib/google";
import { fetchDays, type Diag } from "@/lib/health";
import { scoreDays } from "@/lib/scoring";
import { demoDays } from "@/lib/demo";

export const dynamic = "force-dynamic";

const FETCH_DAYS = 120; // 90 for display + 30 warm-up so baselines are ready

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
      // dailyRollUp caps ranges at 90 days -> fetch in two chunks
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
    } catch (e: any) {
      debug.tokenRefreshError = String(e?.message || e);
      console.error("Falling back to demo data:", e);
    }
  }
  if (!days) {
    demo = true;
    days = demoDays(FETCH_DAYS, end);
  }

  const scored = scoreDays(days).slice(-90); // drop warm-up
  debug.lastRawDay = days.at(-1); // unscored, straight from the API — easiest thing to eyeball
  debug.failedCalls = debug.diag.filter((d: Diag) => !d.ok).length;
  debug.totalCalls = debug.diag.length;

  return NextResponse.json({ demo, days: scored, debug });
}