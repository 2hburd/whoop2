// Shared metric definitions + Day type, imported by the page and the detail modal.
// (Kept out of page.tsx because Next.js forbids non-Page exports from a page file.)

export type Day = {
  date: string;
  sleepMin: number | null;
  sleepStages: { deep: number; light: number; rem: number; awake: number } | null;
  hrv: number | null; rhr: number | null; respRate: number | null; spo2: number | null;
  steps: number | null; calories: number | null;
  azm: { fatBurn: number; cardio: number; peak: number; total: number } | null;
  recovery: number | null; sleepScore: number | null; sleepNeedMin: number;
  strain: number; target: { goal: number; low: number; high: number };
};

export type MetricKey =
  | "sleep" | "recovery" | "strain"
  | "hrv" | "rhr" | "respRate" | "spo2" | "steps" | "calories" | "azm";

export type MetricDef = {
  key: MetricKey;
  label: string;
  unit: string;
  color: string;
  max?: number;
  pick: (d: Day) => number | null;
  baselineWarn?: boolean;
};

export const METRICS: Record<MetricKey, MetricDef> = {
  sleep:    { key: "sleep", label: "SLEEP", unit: "%", color: "#7BAAF7", max: 100, pick: d => d.sleepScore },
  recovery: { key: "recovery", label: "RECOVERY", unit: "%", color: "#16EC06", max: 100, pick: d => d.recovery, baselineWarn: true },
  strain:   { key: "strain", label: "STRAIN", unit: "", color: "#0093E7", max: 21, pick: d => d.strain },
  hrv:      { key: "hrv", label: "HRV", unit: "ms", color: "#7BAAF7", pick: d => d.hrv, baselineWarn: true },
  rhr:      { key: "rhr", label: "RESTING HR", unit: "bpm", color: "#FF6B6B", pick: d => d.rhr },
  respRate: { key: "respRate", label: "RESPIRATORY", unit: "br/min", color: "#9B9BFF", pick: d => d.respRate },
  spo2:     { key: "spo2", label: "SPO2", unit: "%", color: "#6BD5E1", pick: d => d.spo2 },
  steps:    { key: "steps", label: "STEPS", unit: "", color: "#F7C948", pick: d => d.steps },
  calories: { key: "calories", label: "CALORIES", unit: "kcal", color: "#F79948", pick: d => d.calories },
  azm:      { key: "azm", label: "ZONE MINUTES", unit: "min", color: "#63C7B2", pick: d => d.azm?.total ?? null },
};
