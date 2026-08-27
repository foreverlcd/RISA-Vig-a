"use client";

const START = -120; // grados
const END = 120;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`;
}

export default function RiskGauge({ value, color, label }: { value: number; color: string; label: string }) {
  const angle = START + (END - START) * Math.min(1, Math.max(0, value));
  const cx = 90, cy = 90, r = 72;

  return (
    <svg viewBox="0 0 180 130" role="img" aria-label={`Score de riesgo ${value.toFixed(2)}, ${label}`} className="w-full h-auto">
      <path d={arcPath(cx, cy, r, START, END)} fill="none" stroke="var(--gauge-track)" strokeWidth="14" strokeLinecap="round" />
      <path d={arcPath(cx, cy, r, START, angle)} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="30" fontWeight="700" fill="currentColor">
        {value.toFixed(2)}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">
        {label}
      </text>
    </svg>
  );
}
