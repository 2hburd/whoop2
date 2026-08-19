// ============================================================================
// SCORING CONFIG — the single place to tune every formula.
//
// Methodology sources (approximation — Whoop's exact weighting is proprietary):
// - Whoop developer docs ("WHOOP 101"): Recovery is computed from prior-day
//   sleep + physiology — HRV (single most influential input), resting heart
//   rate, sleep performance (actual vs. need), respiratory rate; SpO2 & skin
//   temp are anomaly flags. Color bands: green 67-100, yellow 34-66, red 0-33.
// - Whoop docs: Strain is 0-21, based on the Borg RPE scale, explicitly
//   non-linear (16->17 costs more than 4->5). We model that with a saturating
//   exponential over a TRIMP-style load (Banister 1991 training-impulse
//   family: load = sum of minutes weighted by heart-rate zone intensity).
// - HRV handling follows sports-science convention (e.g. Plews et al. 2013):
//   compare ln(rMSSD) against a personal rolling baseline, not raw ms.
// ============================================================================

export const SCORING = {
  // --- Baselines -----------------------------------------------------------
  BASELINE_DAYS: 30,        // rolling window for personal baselines
  MIN_BASELINE_DAYS: 5,     // below this, fall back to population priors
  PRIOR_HRV_MS: 65,         // population prior (Whoop member avg, male ~65ms)
  PRIOR_HRV_SD_LN: 0.25,
  PRIOR_RHR: 56,
  PRIOR_RHR_SD: 3.5,
  PRIOR_RESP: 15,

  // --- Recovery (0-100) ----------------------------------------------------
  // score = 100 * logistic(W_HRV*zHRV + W_RHR*zRHR + W_SLEEP*sleepTerm - respPenalty)
  W_HRV: 1.0,               // heaviest, per Whoop docs
  W_RHR: 0.55,
  W_SLEEP: 0.65,
  RESP_DEV_TOLERANCE: 1.0,  // breaths/min of deviation ignored
  RESP_PENALTY_PER_BPM: 0.35,
  Z_CLAMP: 2.5,
  LOGISTIC_SLOPE: 1.05,

  // --- Sleep need (minutes) ------------------------------------------------
  BASE_SLEEP_NEED_MIN: 468,   // 7.8h baseline need
  DEBT_LOOKBACK_DAYS: 3,
  DEBT_REPAY_FRACTION: 0.35,  // fraction of avg recent shortfall added to need
  STRAIN_NEED_MIN_PER_PT: 2.5,// extra need per point of yesterday's strain > 10

  // --- Strain (0-21) -------------------------------------------------------
  // load = fatBurnMin*1 + cardioMin*2 + peakMin*3 (falls back to AZM total)
  // strain = 21 * (1 - exp(-load / STRAIN_K))
  ZONE_WEIGHTS: { fatBurn: 1.0, cardio: 2.0, peak: 3.0 },
  STRAIN_K: 65,

  // --- Daily strain target (drives the target band on the ring) ------------
  // goal = TARGET_MIN + recovery/100 * (TARGET_MAX - TARGET_MIN), band ±2
  TARGET_MIN: 6,
  TARGET_MAX: 18,
  TARGET_BAND: 2,
};

// Google Health API data type IDs (kebab-case in URLs). If any of these 404,
// this is the place to correct them — check the data types index at
// developers.google.com/health/data-types.
export const DATA_TYPES = {
  sleep: "sleep",
  steps: "steps",
  hrv: "daily-heart-rate-variability",
  restingHeartRate: "daily-resting-heart-rate",
  breathingRate: "daily-respiratory-rate",
  spo2: "daily-oxygen-saturation",
  activeMinutes: "active-minutes",
  calories: "total-calories",
};

export const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
];

export const COLORS = {
  bg: "#0A0A0A",
  green: "#16EC06",
  yellow: "#FFDE00",
  red: "#FF0026",
  sleep: "#7BAAF7",
  strain: "#0093E7",
  track: "#242424",
  zone: "#5A5A5A",
  dim: "#8A8A8A",
};
