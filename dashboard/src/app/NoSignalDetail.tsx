"use client";

import type { NoSignalPatient } from "./types";
import { VARIABLE_LABEL, VARIABLE_UNIT, VariableIcon } from "./variables";

export default function NoSignalDetail({ patient, onClose }: { patient: NoSignalPatient; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-[var(--surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-l-4 row-none px-6 pt-4 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-[var(--muted)]">Paciente</p>
              <h2 className="font-display text-xl font-semibold text-[var(--ink)]">{patient.patient_id}</h2>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium badge-none">
                <span className="w-1.5 h-1.5 rounded-full dot-none" />
                Sin alerta · nunca cruzó el umbral de riesgo
              </span>
            </div>
            <button onClick={onClose} className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--line)] hover:text-[var(--ink)]">
              ✕
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          <p className="text-sm text-[var(--ink)]">
            El sistema no encontró ninguna combinación de señales sostenida fuera de lo normal para{" "}
            <b>{patient.patient_id}</b> durante todo su monitoreo. Esta es su línea base — lo que el sistema
            considera &quot;normal&quot; para esta persona.
          </p>

          {patient.baseline.length > 0 ? (
            <div className="space-y-2">
              {patient.baseline.map((b) => (
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
          ) : (
            <p className="text-sm text-[var(--muted)]">Sin datos de monitoreo suficientes para calcular una línea base.</p>
          )}
        </div>
      </div>
    </div>
  );
}
