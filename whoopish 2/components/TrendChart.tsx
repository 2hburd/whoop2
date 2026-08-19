"use client";

export default function TrendChart({
  points, max, color, height = 120, unit = "",
}: {
  points: { date: string; value: number | null }[];
  max: number; color: string; height?: number; unit?: string;
}) {
  const w = 600;
  const pad = { t: 8, b: 18, l: 0, r: 0 };
  const innerH = height - pad.t - pad.b;
  const n = points.length;
  const x = (i: number) => pad.l + (i / Math.max(1, n - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - Math.max(0, Math.min(1, v / max))) * innerH;

  // Build path segments, breaking on nulls (missing days).
  let d = "";
  let pen = false;
  points.forEach((p, i) => {
    if (p.value == null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
    pen = true;
  });

  const last = [...points].reverse().find(p => p.value != null);
  const gridVals = [max, max / 2];

  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {gridVals.map(g => (
        <g key={g}>
          <line x1={0} x2={w} y1={y(g)} y2={y(g)} stroke="#1e2022" strokeWidth={1} />
          <text x={w - 2} y={y(g) - 3} textAnchor="end" fill="#555" fontSize={9} className="mono">
            {g}{unit}
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {last && (
        <circle
          cx={x(points.findLastIndex(p => p.value != null))}
          cy={y(last.value as number)}
          r={3} fill={color}
        />
      )}
      <text x={0} y={height - 4} fill="#555" fontSize={9} className="mono">
        {points[0]?.date.slice(5)}
      </text>
      <text x={w} y={height - 4} textAnchor="end" fill="#555" fontSize={9} className="mono">
        {points[n - 1]?.date.slice(5)}
      </text>
    </svg>
  );
}
