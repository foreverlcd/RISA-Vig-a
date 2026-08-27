"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Signal } from "./types";
import { PRIORITY_STYLES, PRIORITY_LABEL_ES } from "./priority";

const INTERVAL_MS = 2200;
const MAX_TOASTS = 4;

interface Toast {
  key: number;
  signal: Signal;
}

export default function LiveDemo({ signals, onOpenSignal }: { signals: Signal[]; onOpenSignal: (s: Signal) => void }) {
  const [running, setRunning] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const indexRef = useRef(0);
  const keyRef = useRef(0);

  const ordered = useMemo(
    () => [...signals].sort((a, b) => a.decision_datetime.localeCompare(b.decision_datetime)),
    [signals]
  );

  useEffect(() => {
    if (!running || ordered.length === 0) return;
    const id = setInterval(() => {
      const signal = ordered[indexRef.current % ordered.length];
      indexRef.current += 1;
      const key = keyRef.current++;
      setToasts((cur) => [{ key, signal }, ...cur].slice(0, MAX_TOASTS));
      setTimeout(() => setToasts((cur) => cur.filter((t) => t.key !== key)), INTERVAL_MS * MAX_TOASTS);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [running, ordered]);

  return (
    <>
      <button
        onClick={() => setRunning((r) => !r)}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
          running ? "border-[var(--risk-critical-line)] bg-[var(--risk-critical-soft)] text-[var(--risk-critical)]" : "border-[var(--line-strong)] text-[var(--ink)] hover:bg-[var(--background)]"
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${running ? "bg-[var(--risk-critical)] animate-pulse" : "bg-[var(--muted)]"}`} />
        {running ? "Demo en vivo — detener" : "Demo en vivo"}
      </button>

      <div className="fixed top-24 right-4 z-30 flex flex-col gap-2 w-80" aria-live="polite">
        {toasts.map(({ key, signal }) => {
          const style = PRIORITY_STYLES[signal.priority_level];
          return (
            <button
              key={key}
              onClick={() => onOpenSignal(signal)}
              className={`text-left rounded-xl border bg-[var(--surface)] shadow-lg px-4 py-3 transition hover:shadow-xl motion-safe:animate-[toast-in_0.25s_ease-out] ${style.row}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.badge}`}>
                  {PRIORITY_LABEL_ES[signal.priority_level]}
                </span>
                <span className="text-[11px] text-[var(--muted)] font-mono">
                  {signal.decision_datetime.replace("T", " ").slice(0, 16)}
                </span>
              </div>
              <p className="text-sm font-medium text-[var(--ink)] mt-1">Nueva señal — {signal.patient_id}</p>
              <p className="text-xs text-[var(--muted)] truncate">{signal.explanation}</p>
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
