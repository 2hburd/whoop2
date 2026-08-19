import { SCORING as S } from "./config";
import type { DayMetrics } from "./health";

export interface ScoredDay extends DayMetrics {
  recovery: number | null;   // 0-100
  sleepScore: number | null; // 0-100 (performance vs need)
  sleepNeedMin: number;
  strain: number;            // 0-21
  target: { goal: number; low: number; high: number };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const logistic = (x: number) => 1 / (1 + Math.exp(-x * S.LOGISTIC_SLOPE));

function meanSd(xs: number[]): { mean: number; sd: number } {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 0.001;
  return { mean, sd };
}

// Strain: TRIMP-style zone-weighted load through a saturating exponential,
// giving the documented non-linear 0-21 Borg-like behavior.
export function strainFromAzm(azm: DayMetrics["azm"]): number {
  if (!azm) return 0;
  const hasZones = azm.fatBurn + azm.cardio + azm.peak > 0;
  const load = hasZones
    ? azm.fatBurn * S.ZONE_WEIGHTS.fatBurn + azm.cardio * S.ZONE_WEIGHTS.cardio + azm.peak * S.ZONE_WEIGHTS.peak
    : azm.total; // AZM already weights cardio/peak 2x, so total is itself a load
  return Math.round(21 * (1 - Math.exp(-load / S.STRAIN_K)) * 10) / 10;
}

export function targetFromRecovery(recovery: number | null) {
  const r = recovery ?? 50;
  const goal = S.TARGET_MIN + (r / 100) * (S.TARGET_MAX - S.TARGET_MIN);
  return {
    goal: Math.round(goal * 10) / 10,
    low: Math.max(0, Math.round((goal - S.TARGET_BAND) * 10) / 10),
    high: Math.min(21, Math.round((goal + S.TARGET_BAND) * 10) / 10),
  };
}

// Score chronologically: each day's baselines use only days before it.
export function scoreDays(days: DayMetrics[]): ScoredDay[] {
  const out: ScoredDay[] = [];

  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const history = out.slice(Math.max(0, i - S.BASELINE_DAYS), i);

    // --- baselines ---------------------------------------------------------
    const hrvHist = history.map(h => h.hrv).filter((x): x is number => x != null && x > 0).map(Math.log);
    const rhrHist = history.map(h => h.rhr).filter((x): x is number => x != null && x > 0);
    const respHist = history.map(h => h.respRate).filter((x): x is number => x != null && x > 0);

    const hrvBase = hrvHist.length >= S.MIN_BASELINE_DAYS
      ? meanSd(hrvHist)
      : { mean: Math.log(S.PRIOR_HRV_MS), sd: S.PRIOR_HRV_SD_LN };
    const rhrBase = rhrHist.length >= S.MIN_BASELINE_DAYS
      ? meanSd(rhrHist)
      : { mean: S.PRIOR_RHR, sd: S.PRIOR_RHR_SD };
    const respBase = respHist.length >= 3 ? meanSd(respHist).mean : S.PRIOR_RESP;

    // --- sleep need & score ------------------------------------------------
    const recent = out.slice(Math.max(0, i - S.DEBT_LOOKBACK_DAYS), i);
    const shortfalls = recent
      .filter(h => h.sleepMin != null)
      .map(h => Math.max(0, h.sleepNeedMin - (h.sleepMin as number)));
    const debt = shortfalls.length ? shortfalls.reduce((a, b) => a + b, 0) / shortfalls.length : 0;
    const yStrain = i > 0 ? out[i - 1].strain : 0;
    const sleepNeedMin = Math.round(
      S.BASE_SLEEP_NEED_MIN + debt * S.DEBT_REPAY_FRACTION + Math.max(0, yStrain - 10) * S.STRAIN_NEED_MIN_PER_PT
    );
    const sleepScore = d.sleepMin != null
      ? Math.round(clamp((d.sleepMin / sleepNeedMin) * 100, 0, 100))
      : null;

    // --- recovery ----------------------------------------------------------
    let recovery: number | null = null;
    if (d.hrv != null || d.rhr != null || sleepScore != null) {
      const zHrv = d.hrv != null ? clamp((Math.log(d.hrv) - hrvBase.mean) / hrvBase.sd, -S.Z_CLAMP, S.Z_CLAMP) : 0;
      const zRhr = d.rhr != null ? clamp((rhrBase.mean - d.rhr) / rhrBase.sd, -S.Z_CLAMP, S.Z_CLAMP) : 0;
      const sleepTerm = sleepScore != null ? (sleepScore / 100) * 2 - 1 : 0; // -1..1
      const respDev = d.respRate != null ? Math.max(0, Math.abs(d.respRate - respBase) - S.RESP_DEV_TOLERANCE) : 0;
      const x = S.W_HRV * zHrv + S.W_RHR * zRhr + S.W_SLEEP * sleepTerm - respDev * S.RESP_PENALTY_PER_BPM;
      recovery = Math.round(clamp(logistic(x) * 100, 1, 99));
    }

    const strain = strainFromAzm(d.azm);
    out.push({ ...d, recovery, sleepScore, sleepNeedMin, strain, target: targetFromRecovery(recovery) });
  }
  return out;
}
