"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardData, NoSignalPatient, PriorityLevel, Signal } from "./types";
import { PRIORITY_ORDER, PRIORITY_STYLES, PRIORITY_LABEL_ES, PRIORITY_DESC_ES } from "./priority";
import { VARIABLE_LABEL } from "./variables";
import SignalDetail from "./SignalDetail";
import NoSignalDetail from "./NoSignalDetail";
import TrendView from "./TrendView";
import LiveDemo from "./LiveDemo";
import OperationsCenter from "./OperationsCenter";

const PAGE_SIZE = 20;

function topFactorSummary(s: Signal): string {
  const top = [...s.fusion_terms].sort((a, b) => b.term - a.term)[0];
  if (!top || top.term <= 0.02) return "Sin un factor individual dominante.";
  const name = VARIABLE_LABEL[top.variable_code] ?? top.variable_code;
  return top.persistence >= 0.6
    ? `${name}, sostenido en el tiempo`
    : `${name}, cambio reciente`;
}

type ViewMode = "signals" | "no_signal";
type Page = "queue" | "trend" | "operations";

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage2] = useState<Page>("queue");
  const [view, setView] = useState<ViewMode>("signals");
  const [priorityFilter, setPriorityFilter] = useState<PriorityLevel | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [pageNum, setPageNum] = useState(0);
  const [selected, setSelected] = useState<Signal | null>(null);
  const [selectedNoSignal, setSelectedNoSignal] = useState<NoSignalPatient | null>(null);

  useEffect(() => {
    fetch("/data.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.signals.filter((s) => {
      if (priorityFilter !== "ALL" && s.priority_level !== priorityFilter) return false;
      if (search && !s.patient_id.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, priorityFilter, search]);

  const filteredNoSignal = useMemo(() => {
    if (!data) return [];
    if (!search) return data.no_signal_patients;
    return data.no_signal_patients.filter((p) => p.patient_id.toLowerCase().includes(search.toLowerCase()));
  }, [data, search]);

  const rows = view === "signals" ? filtered : filteredNoSignal;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(pageNum, pageCount - 1);
  const pageRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  function selectPriority(p: PriorityLevel) {
    setPage2("queue");
    setView("signals");
    setPriorityFilter((cur) => (cur === p ? "ALL" : p));
    setPageNum(0);
  }

  function selectNoSignalCard() {
    setPage2("queue");
    setView((v) => (v === "no_signal" ? "signals" : "no_signal"));
    setPriorityFilter("ALL");
    setPageNum(0);
  }

  function openFromToast(s: Signal) {
    setPage2("queue");
    setSelected(s);
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center text-[var(--risk-critical)]">
        No se pudo cargar data.json: {error}. Corre `python -m src.export_dashboard_json` primero.
      </main>
    );
  }

  if (!data) {
    return <main className="flex min-h-screen items-center justify-center text-[var(--muted)]">Cargando…</main>;
  }

  return (
    <div className="min-h-screen flex bg-[var(--background)]">
      <aside className="hidden md:flex w-56 flex-none flex-col border-r border-[var(--line)] bg-[var(--surface)] px-4 py-6">
        <div className="flex items-center gap-2 mb-1">
          <svg viewBox="0 0 24 24" className="w-6 h-6 flex-none" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h4l2-7 4 14 2-7h6" />
          </svg>
          <p className="font-display text-base font-bold text-[var(--ink)]">RISA Vigía</p>
        </div>
        <p className="text-xs text-[var(--muted)] mb-6">Señales tempranas de riesgo</p>
        <nav className="space-y-1">
          <button
            onClick={() => setPage2("queue")}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-left transition"
            style={page === "queue" ? { background: "var(--brand)", color: "white" } : { color: "var(--ink)" }}
          >
            Pacientes a revisar
          </button>
          <button
            onClick={() => setPage2("trend")}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-left transition"
            style={page === "trend" ? { background: "var(--brand)", color: "white" } : { color: "var(--ink)" }}
          >
            Tendencia general
          </button>
          <button
            onClick={() => setPage2("operations")}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-left transition"
            style={page === "operations" ? { background: "var(--brand)", color: "white" } : { color: "var(--ink)" }}
          >
            Centro de operaciones
          </button>
        </nav>
        <div className="mt-auto text-xs text-[var(--muted)] space-y-1 pt-6 border-t border-[var(--line)]">
          <p>{data.stats.total_patients_monitored} pacientes monitoreados</p>
          <p className="font-mono">versión {data.stats.model_version}</p>
        </div>
      </aside>

      <main className="flex-1 pb-16">
        {page === "trend" ? (
          <div className="px-6 md:px-8 py-6">
            <TrendView data={data} />
          </div>
        ) : page === "operations" ? (
          <div className="px-6 md:px-8 py-6">
            <OperationsCenter data={data} />
          </div>
        ) : (
          <>
            <header className="border-b border-[var(--line)] bg-[var(--surface)] px-6 md:px-8 py-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h1 className="font-display text-xl font-bold text-[var(--ink)]">¿A quién reviso primero?</h1>
                  <p className="text-sm text-[var(--muted)] mt-1">
                    {data.stats.total_patients_monitored} pacientes monitoreados · {data.stats.total_signals} señales
                    detectadas en {data.stats.total_patients} de ellos. Toca una tarjeta para filtrar.
                  </p>
                </div>
                <LiveDemo signals={data.signals} onOpenSignal={openFromToast} />
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {PRIORITY_ORDER.filter((p) => p !== "LOW").map((p) => {
                  const active = view === "signals" && priorityFilter === p;
                  return (
                    <button
                      key={p}
                      onClick={() => selectPriority(p)}
                      className={`text-left rounded-xl border px-4 py-3 transition ${PRIORITY_STYLES[p].badge} ${
                        active ? "ring-2 ring-offset-1" : "hover:brightness-95"
                      }`}
                      style={active ? { boxShadow: "0 0 0 2px var(--ink)" } : undefined}
                    >
                      <p className="text-xs font-medium">{PRIORITY_LABEL_ES[p]}</p>
                      <p className="font-display text-2xl font-extrabold leading-tight tabular-nums">{data.stats.by_priority[p] ?? 0}</p>
                      <p className="text-[11px] opacity-80">{PRIORITY_DESC_ES[p]}</p>
                    </button>
                  );
                })}
                <button
                  onClick={selectNoSignalCard}
                  className={`text-left rounded-xl border px-4 py-3 badge-none transition ${
                    view === "no_signal" ? "ring-2 ring-offset-1" : "hover:brightness-95"
                  }`}
                  style={view === "no_signal" ? { boxShadow: "0 0 0 2px var(--ink)" } : undefined}
                >
                  <p className="text-xs font-medium">Sin alerta</p>
                  <p className="font-display text-2xl font-extrabold leading-tight tabular-nums">{data.stats.patients_without_signal}</p>
                  <p className="text-[11px] opacity-80">Nunca cruzaron el umbral de alerta</p>
                </button>
              </div>
              <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--background)] p-4">
                <p className="text-sm font-semibold text-[var(--ink)]">De millones de lecturas a una lista corta para revisar</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                  El sistema calcula qué es habitual para cada persona a partir de su historial. Solo prioriza una revisión
                  cuando varios cambios se alejan de ese patrón y se mantienen en el tiempo; así evita alertas por un dato
                  aislado, ejercicio u otra variación momentánea.
                </p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <p><span className="font-semibold text-[var(--brand)]">1.</span> Observa el patrón personal.</p>
                  <p><span className="font-semibold text-[var(--brand)]">2.</span> Busca cambios sostenidos y combinados.</p>
                  <p><span className="font-semibold text-[var(--brand)]">3.</span> Explica por qué revisar primero.</p>
                </div>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  No es un diagnóstico ni un modelo de IA entrenado: es un cálculo estadístico explicable que apoya la decisión clínica.
                </p>
              </div>
            </header>

            <div className="px-6 md:px-8 py-6">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPageNum(0); }}
                  placeholder="Buscar paciente (ej. PAT-0009)…"
                  className="rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-sm w-64 text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
                />
                {(priorityFilter !== "ALL" || view === "no_signal") && (
                  <button
                    onClick={() => { setPriorityFilter("ALL"); setView("signals"); setPageNum(0); }}
                    className="text-xs text-[var(--muted)] hover:text-[var(--ink)] underline underline-offset-2"
                  >
                    Quitar filtro
                  </button>
                )}
                <span className="text-sm text-[var(--muted)] ml-auto">{rows.length} resultados</span>
              </div>

              {view === "no_signal" && (
                <p className="text-sm text-[var(--muted)] mb-3">
                  Estos pacientes fueron monitoreados igual que los demás, pero ninguna combinación de señales cruzó el
                  umbral de alerta durante todo su seguimiento.
                </p>
              )}

              <div className="space-y-2">
                {view === "signals"
                  ? (pageRows as Signal[]).map((s) => {
                      const style = PRIORITY_STYLES[s.priority_level];
                      return (
                        <button
                          key={s.signal_id}
                          onClick={() => setSelected(s)}
                          className={`w-full text-left rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 flex items-center gap-4 hover:border-[var(--line-strong)] hover:shadow-sm transition ${style.row}`}
                        >
                          <span className={`flex-none rounded-full border px-2.5 py-1 text-xs font-semibold ${style.badge}`}>
                            {PRIORITY_LABEL_ES[s.priority_level]}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-[var(--ink)]">{s.patient_id}</p>
                            <p className="text-sm text-[var(--muted)] truncate">{topFactorSummary(s)}</p>
                          </div>
                          <div className="flex-none text-right">
                            <p className="text-xs text-[var(--muted)]">detectado</p>
                            <p className="text-sm text-[var(--ink)] font-mono">{s.decision_datetime.replace("T", " ").slice(0, 16)}</p>
                          </div>
                        </button>
                      );
                    })
                  : (pageRows as NoSignalPatient[]).map((p) => (
                      <button
                        key={p.patient_id}
                        onClick={() => setSelectedNoSignal(p)}
                        className="w-full text-left rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 flex items-center gap-4 hover:border-[var(--line-strong)] hover:shadow-sm transition border-l-4 row-none"
                      >
                        <span className="flex-none rounded-full border px-2.5 py-1 text-xs font-semibold badge-none">
                          Sin alerta
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[var(--ink)]">{p.patient_id}</p>
                          <p className="text-sm text-[var(--muted)]">Ver su línea base</p>
                        </div>
                      </button>
                    ))}
              </div>

              <div className="mt-4 flex items-center justify-between text-sm text-[var(--muted)]">
                <span>Página {currentPage + 1} de {pageCount}</span>
                <div className="flex gap-2">
                  <button
                    disabled={currentPage === 0}
                    onClick={() => setPageNum((p) => Math.max(0, p - 1))}
                    className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    disabled={currentPage >= pageCount - 1}
                    onClick={() => setPageNum((p) => Math.min(pageCount - 1, p + 1))}
                    className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {selected && <SignalDetail signal={selected} onClose={() => setSelected(null)} />}
      {selectedNoSignal && <NoSignalDetail patient={selectedNoSignal} onClose={() => setSelectedNoSignal(null)} />}
    </div>
  );
}
