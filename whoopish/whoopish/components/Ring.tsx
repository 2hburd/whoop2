"use client";

// Circular progress ring matching the validated widget design:
// track, optional in-track target zone, progress arc, exact goal marker.
export default function Ring({
  value, max, color, label, caption, size = 104,
  target,
}: {
  value: number; max: number; color: string; label: string; caption: string;
  size?: number;
  target?: { goal: number; low: number; high: number };
}) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / max));

  const arc = (from: number, to: number) => ({
    strokeDasharray: `${Math.max(0, to - from) * c} ${c}`,
    strokeDashoffset: -from * c,
  });

  const markerAngle = target ? -Math.PI / 2 + (target.goal / max) * 2 * Math.PI : 0;
  const cx = size / 2 + (target ? r * Math.cos(markerAngle) : 0);
  const cy = size / 2 + (target ? r * Math.sin(markerAngle) : 0);

  return (
    <div className="ringCell">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${caption} ${label}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#242424" strokeWidth={stroke} />
          {target && (
            <circle
              cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#5A5A5A"
              strokeWidth={stroke} strokeLinecap="round"
              style={arc(target.low / max, target.high / max)}
            />
          )}
          <circle
            className="progress"
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
            strokeWidth={stroke} strokeLinecap="round"
            style={arc(0, frac)}
          />
        </g>
        {target && <circle cx={cx} cy={cy} r={2.6} fill="#fff" />}
        <text
          x="50%" y="50%" dy="0.36em" textAnchor="middle"
          fill="#fff" fontSize={size * 0.26} fontWeight={700}
        >
          {label}
        </text>
      </svg>
      <div className="ringCap" style={{ color }}>{caption}</div>
    </div>
  );
}
