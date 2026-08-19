"use client";

import { useEffect, useMemo, useState } from "react";
import Ring from "@/components/Ring";
import TrendChart from "@/components/TrendChart";

type Day = {
  date: string;
  sleepMin: number | null;
  sleepStages: { deep: number; light: number; rem: number; awake: number } | null;
  hrv: number | null; rhr: number | null; respRate: number | null; spo2: number | null;
  steps: number | null; calories: number | null;
  azm: { fatBurn: number; cardio: number; peak: number; total: number } | null;
  recovery: number | null; sleepScore: number | null; sleepNeedMin: number;
  strain: number; target: { goal: number; low: number; high: number };
};

type Debug = {
  hasRefreshToken: boolean;
  tokenRefreshError: string | null;
  diag: { path: string; status: number; ok: boolean; message: string }[];
  failedCalls: number;
  totalCalls: number;
  lastRawDay: unknown;
};

const recColor = (p: number | null) =>
  p == null ? "#555" : p >= 67 ? "var(--green)" : p >= 34 ? "var(--yellow)" : "var(--red)";
const hm = (min: number | null) =>
  min == null ? "—" : `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;

export default function Page() {
  const [data, setData] = useState<{ demo: boolean; days: Day[]; debug?: Debug } | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState<"today" | "trends" | "history">("today");
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);
  const [showDebug, setShowDebug] = useState(false);

  const load = () => {
    setLoading(true);
    setErr(false);
    fetch("/api/summary", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setErr(true); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const today = data?.days.at(-1);
  const windowDays = useMemo(() => (data ? data.days.slice(-range) : []), [data, range]);
  const hasIssues = !!data?.debug && (data.debug.failedCalls > 0 || !!data.debug.tokenRefreshError || (!data.demo && !data.debug.hasRefreshToken));

  return (
    <main className="shell">
      <header className="top">
        <h1>RECOVERY</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="date mono">{today?.date ?? ""}</span>
          <button
            onClick={load}
            disabled={loading}
            aria-label="Refresh data"
            style={{
              background: "none", border: "1px solid var(--line)", borderRadius: 8,
              color: "var(--dim)", fontSize: 11, letterSpacing: "0.08em", fontWeight: 600,
              padding: "5px 10px", cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "…" : "REFRESH"}
          </button>
        </div>
      </header>

      {err && <div className="banner">Couldn't load data. <a href="#" onClick={(e) => { e.preventDefault(); load(); }}>Try again</a>.</div>}
      {data?.demo && (
        <div className="banner">
          <span>Showing demo data — connect your Google account to see your own.</span>
          <a href="/api/auth/login">Connect Google</a>
        </div>
      )}

      {!data && !err && <div className="banner">Loading…</div>}

      {data?.debug && (
        <div className="banner" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
          <div style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
            <span style={{ color: hasIssues ? "var(--red)" : "var(--dim)" }}>
              {hasIssues ? "⚠ Data issues detected" : "✓ No issues detected"} — {data.debug.totalCalls - data.debug.failedCalls}/{data.debug.totalCalls} API calls OK
            </span>
            <a href="#" onClick={(e) => { e.preventDefault(); setShowDebug(s => !s); }}>
              {showDebug ? "Hide debug" : "Show debug"}
            </a>
          </div>
          {showDebug && (
            <pre className="mono" style={{
              fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word",
              maxHeight: 320, overflowY: "auto", width: "100%", color: "#ccc",
              background: "#000", padding: 10, borderRadius: 8, marginTop: 4,
            }}>
{JSON.stringify({
  demo: data.demo,
  hasRefreshToken: data.debug.hasRefreshToken,
  tokenRefreshError: data.debug.tokenRefreshError,
  failedCalls: data.debug.diag.filter(d => !d.ok),
  lastRawDay: data.debug.lastRawDay,
}, null, 2)}
            </pre>
          )}
        </div>
      )}

      {today && (
        <>
          <section className="rings" aria-label="Today's scores">
            <Ring
              value={today.sleepScore ?? 0} max={100} color="var(--sleep)"
              label={today.sleepScore != null ? `${today.sleepScore}%` : "—"} caption="SLEEP"
            />
            <Ring
              value={today.recovery ?? 0} max={100} color={recColor(today.recovery)}
              label={today.recovery != null ? `${today.recovery}%` : "—"} caption="RECOVERY"
            />
            <Ring
              value={today.strain} max={21} color="var(--strain)"
              label={today.strain.toFixed(1)} caption="STRAIN" target={today.target}
            />
          </section>

          <nav className="tabs" aria-label="Views">
            {(["today", "trends", "history"] as const).map(t => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {t.toUpperCase()}
              </button>
            ))}
          </nav>

          {tab === "today" && (
            <>
              {today.sleepStages && (
                <div className="card">
                  <h3>SLEEP · {hm(today.sleepMin)} of {hm(today.sleepNeedMin)} needed</h3>
                  <StageBar s={today.sleepStages} />
                </div>
              )}
              <div className="metricGrid">
                <Metric k="HRV" v={today.hrv} u="ms" />
                <Metric k="RESTING HR" v={today.rhr} u="bpm" />
                <Metric k="RESPIRATORY" v={today.respRate} u="br/min" />
                <Metric k="SPO2" v={today.spo2} u="%" />
                <Metric k="STEPS" v={today.steps} u="" />
                <Metric k="CALORIES" v={today.calories} u="kcal" />
                <Metric k="ZONE MINUTES" v={today.azm?.total ?? null} u="min" />
                <Metric k="STRAIN TARGET" v={null} u="" text={`${today.target.low}–${today.target.high}`} />
              </div>
            </>
          )}

          {tab === "trends" && (
            <>
              <div className="rangeBtns">
                {[7, 30, 90].map(n => (
                  <button key={n} className={range === n ? "on" : ""} onClick={() => setRange(n)}>
                    {n}D
                  </button>
                ))}
              </div>
              <div className="card">
                <h3>RECOVERY</h3>
                <TrendChart max={100} color="#16EC06" unit="%"
                  points={windowDays.map(d => ({ date: d.date, value: d.recovery }))} />
              </div>
              <div className="card">
                <h3>SLEEP</h3>
                <TrendChart max={100} color="#7BAAF7" unit="%"
                  points={windowDays.map(d => ({ date: d.date, value: d.sleepScore }))} />
              </div>
              <div className="card">
                <h3>STRAIN</h3>
                <TrendChart max={21} color="#0093E7"
                  points={windowDays.map(d => ({ date: d.date, value: d.strain }))} />
              </div>
            </>
          )}

          {tab === "history" && (
            <div className="card">
              {[...windowDays].reverse().map(d => (
                <div className="histRow" key={d.date}>
                  <span className="d mono">{d.date.slice(5)}</span>
                  <span><i className="pill" style={{ background: recColor(d.recovery) }} /><b>{d.recovery ?? "—"}</b>{d.recovery != null && "%"}</span>
                  <span style={{ color: "var(--sleep)" }}><b>{d.sleepScore ?? "—"}</b>{d.sleepScore != null && "%"}</span>
                  <span style={{ color: "var(--strain)" }}><b>{d.strain.toFixed(1)}</b></span>
                </div>
              ))}
            </div>
          )}

          <footer className="note">
            Recovery and strain are approximations of Whoop's published methodology, not their
            proprietary algorithm — tune the weights in <span className="mono">lib/config.ts</span>.
            {" "}{!data?.demo && <a href="/api/auth/logout">Disconnect</a>}
          </footer>
        </>
      )}
    </main>
  );
}

function Metric({ k, v, u, text }: { k: string; v: number | null; u: string; text?: string }) {
  return (
    <div className="metric">
      <div className="k">{k}</div>
      <div className="v">
        {text ?? (v != null ? v.toLocaleString() : "—")} <span className="u">{u}</span>
      </div>
    </div>
  );
}

function StageBar({ s }: { s: NonNullable<Day["sleepStages"]> }) {
  const total = s.deep + s.light + s.rem + s.awake || 1;
  const seg = (v: number, c: string, label: string) => (
    <div key={label} style={{ width: `${(v / total) * 100}%`, background: c }} title={`${label} ${v}m`} />
  );
  return (
    <>
      <div className="stageBar">
        {seg(s.deep, "#3D5AFE", "Deep")}
        {seg(s.rem, "#7BAAF7", "REM")}
        {seg(s.light, "#B3CCF9", "Light")}
        {seg(s.awake, "#37393c", "Awake")}
      </div>
      <div className="legend">
        <i><span className="sw" style={{ background: "#3D5AFE" }} />Deep {s.deep}m</i>
        <i><span className="sw" style={{ background: "#7BAAF7" }} />REM {s.rem}m</i>
        <i><span className="sw" style={{ background: "#B3CCF9" }} />Light {s.light}m</i>
        <i><span className="sw" style={{ background: "#37393c" }} />Awake {s.awake}m</i>
      </div>
    </>
  );
}
