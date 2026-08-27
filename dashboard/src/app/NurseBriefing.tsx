"use client";

import { useState } from "react";
import type { DashboardData } from "./types";

type State = { status: "idle" | "loading" } | { status: "done"; text: string; model: string } | { status: "error" };

export default function NurseBriefing({ data }: { data: DashboardData }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const urgent = data.stats.by_priority.CRITICAL ?? 0;
  const high = data.stats.by_priority.HIGH ?? 0;

  async function prepareBriefing() {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urgent, high, monitored: data.stats.total_patients_monitored }),
      });
      const result = await response.json();
      if (!response.ok || !result.text) throw new Error("No disponible");
      setState({ status: "done", text: result.text, model: result.model });
    } catch {
      setState({ status: "error" });
    }
  }

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">Enfermera virtual</p>
          <h3 className="mt-1 font-display text-lg font-bold text-[var(--ink)]">Resumen para iniciar el turno</h3>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
            Organiza la ronda con la misma cola ya calculada. No diagnostica, no cambia prioridades y no reemplaza una decisión clínica.
          </p>
        </div>
        {state.status === "idle" && (
          <button onClick={prepareBriefing} className="rounded-lg px-3 py-2 text-sm font-medium text-white" style={{ background: "var(--brand)" }}>
            Preparar briefing
          </button>
        )}
      </div>

      {state.status === "loading" && <p className="mt-4 shimmer-text text-sm font-medium">Preparando el resumen del turno…</p>}
      {state.status === "done" && (
        <div className="mt-4 rounded-lg border p-4" style={{ borderColor: "var(--brand)", background: "var(--brand-soft)" }}>
          <p className="text-sm leading-relaxed" style={{ color: "var(--brand-ink)" }}>{state.text}</p>
          <p className="mt-2 text-[11px] text-[var(--muted)]">Redacción opcional con IA · {state.model}. Las prioridades no se modifican.</p>
        </div>
      )}
      {state.status === "error" && (
        <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--background)] p-4 text-sm text-[var(--ink)]">
          <p className="font-medium">Ronda sugerida</p>
          <p className="mt-1 text-[var(--muted)]">
            Empieza por los {urgent} casos urgentes, continúa con los {high} de prioridad alta y verifica la evidencia de cada caso antes de tomar cualquier acción.
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">Configura OPENROUTER_API_KEY para recibir también una versión redactada con IA.</p>
        </div>
      )}
    </section>
  );
}
