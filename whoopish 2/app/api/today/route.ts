// Minimal JSON for the Scriptable widget: /api/today?key=WIDGET_KEY
import { NextRequest, NextResponse } from "next/server";
import { getRefreshToken, refreshAccessToken } from "@/lib/google";
import { fetchDays } from "@/lib/health";
import { scoreDays } from "@/lib/scoring";
import { demoDays } from "@/lib/demo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (process.env.WIDGET_KEY && req.nextUrl.searchParams.get("key") !== process.env.WIDGET_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 39); // 40 days: baseline warm-up + today
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const rt = await getRefreshToken();
  let days;
  if (rt) {
    try {
      const result = await fetchDays(await refreshAccessToken(rt), fmt(start), fmt(end));
      days = result.days;
    } catch (e) {
      console.error(e);
    }
  }
  if (!days) days = demoDays(40, end);

  const t = scoreDays(days).at(-1)!;
  return NextResponse.json({
    date: t.date,
    sleep: t.sleepScore ?? 0,
    recovery: t.recovery ?? 0,
    strain: t.strain,
    target: t.target,
  });
}
