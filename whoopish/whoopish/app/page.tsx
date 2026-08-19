"use client";

import { useEffect, useMemo, useState } from "react";
import Ring from "@/components/Ring";
import TrendChart from "@/components/TrendChart";
import MetricDetail from "@/components/MetricDetail";
import { METRICS, type Day, type MetricKey } from "@/lib/metrics";

const OWNER = "Hudson"; // app title owner


type Debug = {
  hasRefreshToken: boolean; tokenRefreshError: string | null;
  diag: { path: string; status: number; ok: boolean; message: string }[];
  failedCalls: number; totalCalls: number; lastRawDay: unknown;
};

type Baselines = {
  hrvDays: number; rhrDays: number; sleepDays: number;
  readyDate: string | null; needDays: number;
};


const recColor = (p: number | null) =>
  p == null ? "#555" : p >= 67 ? "#16EC06" : p >= 34 ? "#FFDE00" : "#FF0026";
const hm = (min: number | null) =>
  min == null ? "—" : `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;


function fmtDate(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

export default function Page() {
  const [data, setData] = useState<{ demo: boolean; days: Day[]; debug?: Debug; lastSync?: string | null; baselines?: Baselines } | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState<"today" | "trends" | "history">("today");
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [detail, setDetail] = useState<MetricKey | null>(null);

  const load = () => {
    setLoading(true); setErr(false);
    fetch("/api/summary", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setErr(true); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const today = data?.days.at(-1);
  const windowDays = useMemo(() => (data ? data.days.slice(-range) : []), [data, range]);
  const hasIssues = !!data?.debug && (data.debug.failedCalls > 0 || !!data.debug.tokenRefreshError);
  const baselineReady = data?.baselines?.readyDate ?? null;

  return (
    <main className="shell">
      <header className="top">
        <div>
          <h1>{OWNER.toUpperCase()}'S FITBIT AIR</h1>
          <div className="synced mono">
            {data?.lastSync ? `Last synced ${fmtDate(data.lastSync)}` : loading ? "Syncing…" : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="date mono">{today?.date ?? ""}</span>
          <button className="refreshBtn" onClick={load} disabled={loading} aria-label="Refresh data">
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

      {/* Baseline-trust reminder */}
      {data && !data.demo && baselineReady && (
        <div className="banner baselineNote">
          <span>⏳ Recovery &amp; HRV are still calibrating to your personal baseline — don't fully trust them until about <b>{fmtDate(baselineReady)}</b> (needs ~{data.baselines?.needDays} nights of data).</span>
        </div>
      )}

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
            <pre className="debugPre mono">
{JSON.stringify({ demo: data.demo, hasRefreshToken: data.debug.hasRefreshToken, tokenRefreshError: data.debug.tokenRefreshError, failedCalls: data.debug.diag.filter(d => !d.ok), lastRawDay: data.debug.lastRawDay }, null, 2)}
            </pre>
          )}
        </div>
      )}

      {today && (
        <>
          <section className="rings" aria-label="Today's scores">
            <button className="ringBtn" onClick={() => setDetail("sleep")}>
              <Ring value={today.sleepScore ?? 0} max={100} color="#7BAAF7"
                label={today.sleepScore != null ? `${today.sleepScore}%` : "—"} caption="SLEEP" />
            </button>
            <button className="ringBtn" onClick={() => setDetail("recovery")}>
              <Ring value={today.recovery ?? 0} max={100} color={recColor(today.recovery)}
                label={today.recovery != null ? `${today.recovery}%` : "—"} caption="RECOVERY" />
            </button>
            <button className="ringBtn" onClick={() => setDetail("strain")}>
              <Ring value={today.strain} max={21} color="#0093E7"
                label={today.strain.toFixed(1)} caption="STRAIN" target={today.target} />
            </button>
          </section>

          <nav className="tabs" aria-label="Views">
            {(["today", "trends", "history"] as const).map(t => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t.toUpperCase()}</button>
            ))}
          </nav>

          {tab === "today" && (
            <>
              {today.sleepStages && (
                <button className="cardBtn" onClick={() => setDetail("sleep")}>
                  <div className="card">
                    <h3>SLEEP · {hm(today.sleepMin)} of {hm(today.sleepNeedMin)} needed</h3>
                    <StageBar s={today.sleepStages} />
                  </div>
                </button>
              )}
              <div className="metricGrid">
                {(["hrv", "rhr", "respRate", "spo2", "steps", "calories", "azm"] as MetricKey[]).map(k => {
                  const m = METRICS[k];
                  const v = m.pick(today);
                  return (
                    <button key={k} className="metricBtn" onClick={() => setDetail(k)}>
                      <div className="metric">
                        <div className="k">{m.label}</div>
                        <div className="v">
                          {v != null ? v.toLocaleString() : "—"} <span className="u">{m.unit}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
                <button className="metricBtn" onClick={() => setDetail("strain")}>
                  <div className="metric">
                    <div className="k">STRAIN TARGET</div>
                    <div className="v">{today.target.low}–{today.target.high}</div>
                  </div>
                </button>
              </div>
            </>
          )}

          {tab === "trends" && (
            <>
              <div className="rangeBtns">
                {[7, 30, 90].map(n => (
                  <button key={n} className={range === n ? "on" : ""} onClick={() => setRange(n)}>{n}D</button>
                ))}
              </div>
              {(["recovery", "sleep", "strain"] as MetricKey[]).map(k => {
                const m = METRICS[k];
                return (
                  <button key={k} className="cardBtn" onClick={() => setDetail(k)}>
                    <div className="card">
                      <h3>{m.label}</h3>
                      <TrendChart max={m.max ?? 100} color={m.color} unit={m.unit}
                        points={windowDays.map(d => ({ date: d.date, value: m.pick(d) }))} />
                    </div>
                  </button>
                );
              })}
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

      {detail && data && (
        <MetricDetail
          metric={METRICS[detail]}
          days={data.days}
          baselineReadyDate={METRICS[detail].baselineWarn ? baselineReady : null}
          onClose={() => setDetail(null)}
        />
      )}
    </main>
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
