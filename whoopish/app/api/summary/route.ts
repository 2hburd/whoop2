import { NextRequest, NextResponse } from "next/server";
import { getRefreshToken, refreshAccessToken } from "@/lib/google";
import { fetchDays } from "@/lib/health";
import { scoreDays } from "@/lib/scoring";
import { demoDays } from "@/lib/demo";

export const dynamic = "force-dynamic";

const FETCH_DAYS = 120; // 90 for display + 30 warm-up so baselines are ready

export async function GET(req: NextRequest) {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (FETCH_DAYS - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const rt = await getRefreshToken();
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
      days = [...a, ...b];
    } catch (e) {
      console.error("Falling back to demo data:", e);
    }
  }
  if (!days) {
    demo = true;
    days = demoDays(FETCH_DAYS, end);
  }

  const scored = scoreDays(days).slice(-90); // drop warm-up
  return NextResponse.json({ demo, days: scored });
}
