"use client";

import { useState } from "react";
import type { Signal } from "./types";
import { PRIORITY_LABEL_ES } from "./priority";
import { factorSentence } from "./explain";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; text: string; model: string }
  | { status: "error"; message: string };

export default function AiExplanation({ signal }: { signal: Signal }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function generate() {
    setState({ status: "loading" });
    const factors = signal.fusion_terms
      .filter((t) => t.term > 0.02)
      .map((t) => {
        const s = factorSentence(t, signal.baseline);
        const sum = signal.fusion_terms.reduce((a, x) => a + x.term, 0) || 1;
        return { name: s.name, direction: s.direction, timing: s.timing, percent: Math.round((t.term / sum) * 100) };
      });

    try {
      const res = await fetch("/api/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: signal.patient_id,
          priority_label: PRIORITY_LABEL_ES[signal.priority_level],
          risk_score: signal.risk_score,
          factors,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ status: "error", message: data.error || `error ${res.status}` });
        return;
      }
      setState({ status: "done", text: data.text, model: data.model });
    } catch (e) {
      setState({ status: "error", message: String(e) });
    }
  }

  if (state.status === "idle") {
    return (
      <button
        onClick={generate}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--brand)] hover:text-[var(--brand-ink)] underline underline-offset-2"
      >
        ✨ Redactar con IA (OpenRouter)
      </button>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="rounded-lg border border-[var(--line)] bg-[var(--background)] p-4">
        <p className="shimmer-text text-[15px] leading-relaxed font-medium">La IA está redactando la explicación…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-[var(--line)] bg-[var(--background)] p-3 text-xs text-[var(--muted)]">
        No se pudo generar con IA ({state.message}). Se mantiene la explicación automática de arriba.{" "}
        <button onClick={generate} className="underline underline-offset-2 hover:text-[var(--ink)]">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--brand)", background: "var(--brand-soft)" }}>
      <p className="text-[15px] leading-relaxed" style={{ color: "var(--brand-ink)" }}>
        {state.text}
      </p>
      <p className="text-[11px] text-[var(--muted)] mt-2 font-mono">✨ generado por IA · {state.model}</p>
    </div>
  );
}
