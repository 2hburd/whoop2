"use client";

import { useState } from "react";
import TrendChart from "./TrendChart";
import type { Day, MetricDef } from "@/lib/metrics";

type Span = "day" | "week" | "month";

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}`;
}

// Aggregate daily values into the chosen span. "day" = last 24 entries as-is
// (one per day is all the API gives us at rollup level, so "day" shows the
// most recent stretch day-by-day); "week" = 7-day averages; "month" = 30-day.
function bucket(days: Day[], pick: (d: Day) => number | null, span: Span) {
  const pts = days.map(d => ({ date: d.date, value: pick(d) }));
  if (span === "day") return pts.slice(-14);
  const size = span === "week" ? 7 : 30;
  const groups: { date: string; value: number | null }[] = [];
  for (let i = 0; i < pts.length; i += size) {
    const slice = pts.slice(i, i + size);
    const vals = slice.map(p => p.value).filter((v): v is number => v != null);
    groups.push({
      date: slice[slice.length - 1]?.date ?? slice[0].date,
      value: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null,
    });
  }
  return groups;
}

export default function MetricDetail({
  metric, days, baselineReadyDate, onClose,
}: {
  metric: MetricDef;
  days: Day[];
  baselineReadyDate: string | null;
  onClose: () => void;
}) {
  const [span, setSpan] = useState<Span>("day");
  const points = bucket(days, metric.pick, span);

  const real = points.filter(p => p.value != null).map(p => p.value as number);
  const latest = [...points].reverse().find(p => p.value != null)?.value ?? null;
  const avg = real.length ? Math.round((real.reduce((a, b) => a + b, 0) / real.length) * 10) / 10 : null;
  const min = real.length ? Math.min(...real) : null;
  const max = real.length ? Math.max(...real) : null;
  const chartMax = metric.max ?? (max != null ? max * 1.15 : 100);

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modalHead">
          <h2 style={{ color: metric.color }}>{metric.label}</h2>
          <button className="closeBtn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="bigStat">
          <span className="bigNum">{latest != null ? latest.toLocaleString() : "—"}</span>
          <span className="bigUnit">{metric.unit}</span>
        </div>

        <div className="spanBtns">
          {(["day", "week", "month"] as Span[]).map(s => (
            <button key={s} className={span === s ? "on" : ""} onClick={() => setSpan(s)}>
              {s === "day" ? "DAY" : s === "week" ? "WEEK" : "MONTH"}
            </button>
          ))}
        </div>

        <div className="modalChart">
          <TrendChart max={chartMax} color={metric.color} unit={metric.unit} height={180} points={points} />
        </div>

        <div className="statRow">
          <div><span className="statK">AVG</span><span className="statV">{avg ?? "—"}{metric.unit}</span></div>
          <div><span className="statK">MIN</span><span className="statV">{min ?? "—"}{metric.unit}</span></div>
          <div><span className="statK">MAX</span><span className="statV">{max ?? "—"}{metric.unit}</span></div>
        </div>

        {baselineReadyDate && (
          <div className="modalNote">
            ⏳ This metric is still calibrating to your personal baseline. Treat values as rough
            until about <b>{fmtDate(baselineReadyDate)}</b> — the trend matters more than any single day right now.
          </div>
        )}
      </div>
    </div>
  );
}
