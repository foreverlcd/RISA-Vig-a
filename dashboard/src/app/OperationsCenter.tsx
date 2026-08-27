"use client";

import { useState } from "react";
import type { DashboardData } from "./types";
import NurseBriefing from "./NurseBriefing";

type RoundState = "idle" | "running" | "ready";

export default function OperationsCenter({ data }: { data: DashboardData }) {
  const [round, setRound] = useState<RoundState>("idle");
  const [copied, setCopied] = useState(false);

  function startRound() {
    setRound("running");
    window.setTimeout(() => setRound("ready"), 900);
  }

  async function copyWebhook() {
    await navigator.clipboard?.writeText(`${window.location.origin}/api/webhook`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const urgent = data.stats.by_priority.CRITICAL ?? 0;
  const high = data.stats.by_priority.HIGH ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">Centro de operaciones</p>
        <h2 className="mt-1 font-display text-2xl font-bold text-[var(--ink)]">La ronda, las integraciones y el asistente en un solo lugar</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
          Este panel convierte la cola calculada en una ronda de revisión. Está diseñado para apoyar al equipo, no para automatizar diagnósticos o acciones sobre pacientes.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--risk-critical-line)] bg-[var(--risk-critical-soft)] p-4">
          <p className="text-xs font-medium text-[var(--risk-critical)]">Primero en la ronda</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-[var(--risk-critical)]">{urgent}</p>
          <p className="text-xs text-[var(--muted)]">casos urgentes por revisar</p>
        </div>
        <div className="rounded-xl border border-[var(--risk-high-line)] bg-[var(--risk-high-soft)] p-4">
          <p className="text-xs font-medium text-[var(--risk-high)]">Después</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-[var(--risk-high)]">{high}</p>
          <p className="text-xs text-[var(--muted)]">casos de prioridad alta</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="text-xs font-medium text-[var(--muted)]">Cobertura</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-[var(--ink)]">{data.stats.total_patients_monitored}</p>
          <p className="text-xs text-[var(--muted)]">pacientes monitoreados</p>
        </div>
      </div>

      <NurseBriefing data={data} />

      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">Automatizaciones</p>
            <h3 className="mt-1 font-display text-lg font-bold text-[var(--ink)]">Ronda guiada</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">Ordena el trabajo; una persona sigue validando cada caso.</p>
          </div>
          <button
            onClick={startRound}
            disabled={round === "running"}
            className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-70"
            style={{ background: "var(--brand)" }}
          >
            {round === "running" ? "Organizando…" : round === "ready" ? "Ronda lista" : "Iniciar ronda"}
          </button>
        </div>
        <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          {[
            ["1", "Ordenar", "Prioridad y evidencia disponible."],
            ["2", "Revisar", "Abrir el caso y confirmar el patrón."],
            ["3", "Decidir", "El equipo clínico define el siguiente paso."],
          ].map(([number, title, detail], index) => (
            <li key={title} className={`rounded-lg border p-3 transition ${round === "running" && index === 0 ? "automation-pulse border-[var(--brand)]" : "border-[var(--line)]"}`}>
              <span className="font-mono text-xs text-[var(--brand)]">{number}</span>
              <p className="mt-1 font-medium text-[var(--ink)]">{title}</p>
              <p className="text-xs text-[var(--muted)]">{detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">Webhook de integración</p>
        <h3 className="mt-1 font-display text-lg font-bold text-[var(--ink)]">Puerta de entrada para sistemas externos</h3>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          El endpoint valida eventos entrantes con un secreto compartido. El MVP confirma la recepción; para actualizar la cola en tiempo real aún hace falta conectar una base de datos o una cola de mensajes.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--background)] p-3">
          <code className="min-w-0 flex-1 break-all text-xs text-[var(--ink)]">POST /api/webhook</code>
          <button onClick={copyWebhook} className="rounded-md border border-[var(--line-strong)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface)]">
            {copied ? "Copiado" : "Copiar URL"}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">Encabezado requerido: <code>x-risa-webhook-secret</code>. Evento mínimo: <code>{'{ "event_type": "signal.received" }'}</code>.</p>
      </section>
    </div>
  );
}
