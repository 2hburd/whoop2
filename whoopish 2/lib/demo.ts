// Deterministic demo data so the dashboard renders before OAuth is configured.
import type { DayMetrics } from "./health";

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export function demoDays(n: number, endDate: Date): DayMetrics[] {
  const r = rng(42);
  const days: DayMetrics[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    const wave = Math.sin(i / 5) * 0.5;
    const hrv = Math.round(62 + wave * 12 + (r() - 0.5) * 16);
    const rhr = Math.round(55 - wave * 3 + (r() - 0.5) * 4);
    const sleepMin = Math.round(400 + wave * 40 + (r() - 0.5) * 90);
    const deep = Math.round(sleepMin * (0.16 + r() * 0.05));
    const rem = Math.round(sleepMin * (0.2 + r() * 0.05));
    const awake = Math.round(30 + r() * 30);
    const fatBurn = Math.round(r() * 40);
    const cardio = Math.round(r() * 35);
    const peak = Math.round(r() * 12);
    days.push({
      date,
      sleepMin,
      sleepStages: { deep, rem, light: sleepMin - deep - rem, awake },
      hrv, rhr,
      respRate: Math.round((14.6 + (r() - 0.5)) * 10) / 10,
      spo2: Math.round((96 + r() * 2) * 10) / 10,
      steps: Math.round(6000 + r() * 8000),
      calories: Math.round(2200 + r() * 900),
      azm: { fatBurn, cardio, peak, total: fatBurn + cardio * 2 + peak * 2 },
    });
  }
  return days;
}
