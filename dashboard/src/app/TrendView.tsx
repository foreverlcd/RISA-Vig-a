"use client";

import { useMemo } from "react";
import type { DashboardData, PriorityLevel } from "./types";
import { PRIORITY_LABEL_ES } from "./priority";

const STACK_ORDER: PriorityLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STACK_COLOR: Record<PriorityLevel, string> = {
  LOW: "var(--risk-low)",
  MEDIUM: "var(--risk-moderate)",
  HIGH: "var(--risk-high)",
  CRITICAL: "var(--risk-critical)",
};

export default function TrendView({ data }: { data: DashboardData }) {
  const byDate = useMemo(() => {
    const map = new Map<string, Record<PriorityLevel, number>>();
    for (const s of data.signals) {
      const day = s.decision_datetime.slice(0, 10);
      if (!map.has(day)) map.set(day, { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 });
      map.get(day)![s.priority_level]++;
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  const maxTotal = Math.max(...byDate.map(([, c]) => STACK_ORDER.reduce((a, p) => a + c[p], 0)), 1);
  const W = 900, H = 260, PAD_L = 32, PAD_B = 24, PAD_T = 12;
  const barGap = 3;
  const barW = (W - PAD_L) / byDate.length - barGap;
  const yScale = (v: number) => (v / maxTotal) * (H - PAD_B - PAD_T);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-[var(--ink)]">Tendencia general</h2>
        <p className="text-sm text-[var(--muted)] mt-1">
          Señales detectadas por día en los {data.stats.total_patients_monitored} pacientes monitoreados — todo el
          periodo de seguimiento, no solo lo urgente.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Señales detectadas por día, coloreadas por nivel de riesgo" className="w-full h-auto">
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1={PAD_L} x2={W}
              y1={H - PAD_B - yScale(maxTotal * f)} y2={H - PAD_B - yScale(maxTotal * f)}
              stroke="var(--line)" strokeWidth="1"
            />
          ))}
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <text key={f} x={PAD_L - 6} y={H - PAD_B - yScale(maxTotal * f) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">
              {Math.round(maxTotal * f)}
            </text>
          ))}

          {byDate.map(([day, counts], i) => {
            let yOffset = 0;
            const x = PAD_L + i * (barW + barGap);
            return (
              <g key={day}>
                {STACK_ORDER.map((p) => {
                  const h = yScale(counts[p]);
                  const y = H - PAD_B - yOffset - h;
                  yOffset += h;
                  if (counts[p] === 0) return null;
                  return <rect key={p} x={x} y={y} width={Math.max(barW, 1)} height={h} fill={STACK_COLOR[p]} />;
                })}
                {i % 5 === 0 && (
                  <text x={x} y={H - 8} fontSize="9" fill="var(--muted)">
                    {day.slice(8, 10)}/{day.slice(5, 7)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-[var(--line)]">
          {STACK_ORDER.slice().reverse().map((p) => (
            <span key={p} className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: STACK_COLOR[p] }} />
              {PRIORITY_LABEL_ES[p]}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as PriorityLevel[]).map((p) => (
          <div key={p} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--muted)]">{PRIORITY_LABEL_ES[p]}, total del mes</p>
            <p className="font-display text-2xl font-extrabold tabular-nums" style={{ color: STACK_COLOR[p] }}>
              {data.stats.by_priority[p] ?? 0}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
