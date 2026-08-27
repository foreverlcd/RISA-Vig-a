"use client";

import { useState } from "react";
import type { Signal } from "./types";
import { PRIORITY_STYLES, PRIORITY_LABEL_ES, PRIORITY_DESC_ES } from "./priority";
import { VARIABLE_LABEL, VARIABLE_UNIT, VariableIcon } from "./variables";
import { factorSentence } from "./explain";
import RiskGauge from "./RiskGauge";
import Sparkline from "./Sparkline";
import AiExplanation from "./AiExplanation";

function fmt(dt: string) {
  return dt.replace("T", " ").slice(0, 16);
}

const TABS = ["Resumen", "Línea base", "Por qué", "Historial"] as const;
type Tab = (typeof TABS)[number];

export default function SignalDetail({ signal, onClose }: { signal: Signal; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("Resumen");
  const [showTechnical, setShowTechnical] = useState(false);
  const style = PRIORITY_STYLES[signal.priority_level];

  const sumTerms = signal.fusion_terms.reduce((a, t) => a + t.term, 0) || 1;
  const maxTerm = Math.max(...signal.fusion_terms.map((t) => t.term), 0.001);
  const factors = signal.fusion_terms.filter((t) => t.term > 0.02);

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-[var(--surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`sticky top-0 z-10 bg-[var(--surface)] border-b px-6 pt-4 ${style.row}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-[var(--muted)]">Paciente</p>
              <h2 className="text-xl font-semibold text-[var(--ink)]">{signal.patient_id}</h2>
              <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${style.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                {PRIORITY_LABEL_ES[signal.priority_level]} · {PRIORITY_DESC_ES[signal.priority_level]}
              </span>
            </div>
            <button onClick={onClose} className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--line)] hover:text-[var(--ink)]">
              ✕
            </button>
          </div>

          <nav className="mt-4 flex gap-1 -mb-px">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? "border-[var(--ink)] text-[var(--ink)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>

        <div className="px-6 py-5">
          {tab === "Resumen" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-[var(--line)] p-5 flex flex-col items-center">
                <RiskGauge value={signal.risk_score} color={style.hex} label={PRIORITY_LABEL_ES[signal.priority_level]} />
                <p className="text-sm text-[var(--muted)] mt-1">Nivel de riesgo detectado</p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)] mb-1">En resumen</p>
                <p className="rounded-lg border border-[var(--line)] bg-[var(--background)] p-4 text-[15px] leading-relaxed text-[var(--ink)]">
                  {factors.length > 0 ? (
                    <>
                      Se detectó una combinación de {factors.length === 1 ? "1 variable" : `${factors.length} variables`}{" "}
                      fuera de lo normal para <b>{signal.patient_id}</b>, sostenida entre el{" "}
                      <b>{fmt(signal.evidence_start)}</b> y el <b>{fmt(signal.evidence_end)}</b>. La variable con mayor
                      peso fue <b>{VARIABLE_LABEL[factors[0].variable_code] ?? factors[0].variable_code}</b>.
                    </>
                  ) : (
                    "No hay suficientes variables con evidencia relevante para describir un patrón."
                  )}
                </p>
                <div className="mt-2">
                  <AiExplanation signal={signal} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-[var(--line)] p-3">
                  <p className="text-xs text-[var(--muted)]">Certeza de los datos</p>
                  <p className="text-lg font-semibold text-[var(--ink)]">
                    {signal.confidence_score >= 0.66 ? "Alta" : signal.confidence_score >= 0.4 ? "Media" : "Baja"}
                  </p>
                  <p className="text-xs text-[var(--muted)]">qué tan completa y limpia fue la información</p>
                </div>
                <div className="rounded-lg border border-[var(--line)] p-3">
                  <p className="text-xs text-[var(--muted)]">Detectado el</p>
                  <p className="text-lg font-semibold text-[var(--ink)]">{fmt(signal.decision_datetime).slice(0, 10)}</p>
                  <p className="text-xs text-[var(--muted)]">{fmt(signal.decision_datetime).slice(11)}</p>
                </div>
              </div>

              <div
                className="rounded-lg border px-3 py-2 text-xs"
                style={{ background: "var(--caution-soft)", borderColor: "var(--caution-line)", color: "var(--caution)" }}
              >
                Esto no es un diagnóstico. Es una señal de apoyo para decidir a quién revisar primero.
              </div>
            </div>
          )}

          {tab === "Línea base" && (
            <div>
              <p className="text-sm text-[var(--muted)] mb-3">
                Así es <b>este paciente</b> normalmente, calculado con su propio historial — no un rango genérico de manual.
              </p>
              <div className="space-y-2">
                {signal.baseline.map((b) => (
                  <div key={b.variable_code} className="flex items-center gap-3 rounded-lg border border-[var(--line)] p-3">
                    <span className="flex-none w-8 h-8 rounded-full bg-[var(--line)] flex items-center justify-center">
                      <VariableIcon code={b.variable_code} className="w-4 h-4 text-[var(--muted)]" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[var(--ink)]">{VARIABLE_LABEL[b.variable_code] ?? b.variable_code}</p>
                      <p className="text-xs text-[var(--muted)]">
                        habitual: {b.baseline_median != null ? `${b.baseline_median} ${VARIABLE_UNIT[b.variable_code] ?? ""}` : "sin datos suficientes"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[var(--ink)]">{b.last_value}</p>
                      <p className="text-xs text-[var(--muted)]">última lectura</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "Por qué" && (
            <div className="space-y-5">
              <p className="text-sm text-[var(--muted)]">
                ¿Por qué el sistema marcó a este paciente como <b>{PRIORITY_LABEL_ES[signal.priority_level]}</b>?
              </p>

              <div className="space-y-2">
                {factors.map((t) => {
                  const s = factorSentence(t, signal.baseline);
                  const pct = (t.term / sumTerms) * 100;
                  return (
                    <div key={t.variable_code} className="rounded-lg border border-[var(--line)] p-3">
                      <div className="flex items-start gap-3">
                        <span className="flex-none w-8 h-8 rounded-full bg-[var(--line)] flex items-center justify-center mt-0.5">
                          <VariableIcon code={t.variable_code} className="w-4 h-4 text-[var(--muted)]" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--ink)]">
                            {s.name} {s.direction}
                          </p>
                          <p className="text-xs text-[var(--muted)]">{s.timing}</p>
                          <div className="h-1.5 rounded-full bg-[var(--line)] overflow-hidden mt-2">
                            <div className="h-full rounded-full" style={{ width: `${(t.term / maxTerm) * 100}%`, background: style.hex }} />
                          </div>
                        </div>
                        <span className="flex-none text-sm font-semibold text-[var(--ink)] tabular-nums">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
                {factors.length === 0 && (
                  <p className="text-sm text-[var(--muted)]">Sin factores individuales relevantes por encima del umbral de reporte.</p>
                )}
              </div>

              <button
                onClick={() => setShowTechnical((v) => !v)}
                className="text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)] underline underline-offset-2"
              >
                {showTechnical ? "Ocultar detalle técnico" : "Ver detalle técnico (fórmula y evidencia cruda)"}
              </button>

              {showTechnical && (
                <div className="space-y-4 border-t border-[var(--line)] pt-4">
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--background)] p-3 font-mono text-xs text-[var(--ink)] overflow-x-auto">
                    P(riesgo) = 1 − ∏ (1 − wᵢ · eᵢ) = <b>{signal.risk_score.toFixed(3)}</b>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--background)] text-[var(--muted)]">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Variable</th>
                          <th className="px-2 py-1.5 text-right">Desviación</th>
                          <th className="px-2 py-1.5 text-right">Persistencia</th>
                          <th className="px-2 py-1.5 text-right">eᵢ</th>
                          <th className="px-2 py-1.5 text-right">wᵢ</th>
                          <th className="px-2 py-1.5 text-right">wᵢ·eᵢ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line)]">
                        {signal.fusion_terms.map((t) => (
                          <tr key={t.variable_code}>
                            <td className="px-2 py-1.5 font-medium text-[var(--ink)]">{t.variable_code}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{t.deviation_evidence.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{t.persistence.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{t.context_damped_evidence.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{t.weight}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{t.term.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    Registros de evidencia originales: {signal.evidence.length} (source_file + record_id de cada uno
                    disponibles en <code>evidence.csv</code>).
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "Historial" && (
            <div>
              <p className="text-sm text-[var(--muted)] mb-3">
                Riesgo de {signal.patient_id} a lo largo de todo el monitoreo ({signal.patient_history.length} evaluaciones).
              </p>
              <div className="rounded-xl border border-[var(--line)] p-4 mb-4">
                <Sparkline points={signal.patient_history} highlightId={signal.signal_id} />
              </div>
              <div className="space-y-1.5">
                {[...signal.patient_history].reverse().map((h) => {
                  const s = PRIORITY_STYLES[h.priority_level];
                  const current = h.signal_id === signal.signal_id;
                  return (
                    <div
                      key={h.signal_id}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 ${current ? "bg-[var(--line)]" : ""}`}
                    >
                      <span className="text-sm text-[var(--ink)]">{fmt(h.decision_datetime)}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${s.badge}`}>
                        {PRIORITY_LABEL_ES[h.priority_level]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
