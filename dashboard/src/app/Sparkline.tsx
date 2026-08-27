"use client";

import type { HistoryPoint } from "./types";
import { PRIORITY_STYLES } from "./priority";

export default function Sparkline({ points, highlightId }: { points: HistoryPoint[]; highlightId?: string }) {
  if (points.length === 0) return null;
  const W = 560, H = 140, PAD = 24;
  const xs = (i: number) => PAD + (i / Math.max(1, points.length - 1)) * (W - PAD * 2);
  const ys = (v: number) => H - PAD - v * (H - PAD * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xs(i)} ${ys(p.risk_score)}`).join(" ");
  const area = `${path} L ${xs(points.length - 1)} ${H - PAD} L ${xs(0)} ${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución del riesgo de este paciente en el tiempo" className="w-full h-auto">
      {[0, 0.3, 0.55, 0.8, 1].map((v) => (
        <line key={v} x1={PAD} x2={W - PAD} y1={ys(v)} y2={ys(v)} stroke="var(--gauge-track)" strokeWidth="1" />
      ))}
      <path d={area} fill="var(--accent-fill)" opacity="0.15" />
      <path d={path} fill="none" stroke="var(--accent-fill)" strokeWidth="2" />
      {points.map((p, i) => {
        const style = PRIORITY_STYLES[p.priority_level];
        const active = p.signal_id === highlightId;
        return (
          <circle
            key={p.signal_id}
            cx={xs(i)}
            cy={ys(p.risk_score)}
            r={active ? 5 : 3.5}
            fill={style.hex}
            stroke="var(--background)"
            strokeWidth={active ? 2 : 1}
          />
        );
      })}
    </svg>
  );
}
