"""
Persistencia + histéresis entre ventanas -> episodios -> signals.csv / evidence.csv

Reglas de alert-fatigue (propuesta/RISA_VIGIA.md sec. 4-5):
  - Un episodio se abre cuando hay >=2 ventanas CONSECUTIVAS con risk_score >= ENTER_CUT.
  - Se mantiene abierto mientras no haya >=2 ventanas consecutivas por debajo de EXIT_CUT
    (histéresis: EXIT_CUT < ENTER_CUT, así no sube y baja de nivel por ruido).
  - Todo el episodio se reporta como UNA sola señal (no una alerta por ventana),
    con evidence_start/evidence_end abarcando todo el episodio.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

import pandas as pd

from . import config
from .fusion import priority_from_score

ENTER_CUT = 0.30
EXIT_CUT = 0.18
MIN_WINDOWS_TO_ENTER = 2
MIN_WINDOWS_BELOW_TO_EXIT = 2


@dataclass
class Episode:
    patient_id: str
    windows: list = field(default_factory=list)  # list of row dicts (window_start, window_end, risk_score, ...)

    @property
    def evidence_start(self):
        return self.windows[0]["window_start"]

    @property
    def evidence_end(self):
        return self.windows[-1]["window_end"]

    @property
    def peak_window(self):
        return max(self.windows, key=lambda w: w["risk_score"])

    @property
    def current_risk(self):
        # Se reporta el pico del episodio, no la última ventana: el episodio se
        # cierra precisamente cuando el riesgo ya bajó (histéresis de salida),
        # así que la última ventana subestima sistemáticamente la severidad real.
        return self.peak_window["risk_score"]

    @property
    def current_confidence(self):
        return self.peak_window["confidence_score"]


def _is_contiguous(prev_window_end, next_window_start) -> bool:
    return prev_window_end == next_window_start


def extract_episodes(fused: pd.DataFrame) -> list[Episode]:
    episodes: list[Episode] = []
    fused = fused.sort_values(["patient_id", "window_start"])

    for patient_id, g in fused.groupby("patient_id", sort=False):
        rows = g.to_dict("records")
        pending: list[dict] = []  # windows above ENTER_CUT, not yet confirmed persistent
        active: Episode | None = None
        below_run = 0

        for i, row in enumerate(rows):
            contiguous_with_prev = i > 0 and _is_contiguous(rows[i - 1]["window_end"], row["window_start"])

            if active is not None:
                if not contiguous_with_prev:
                    episodes.append(active)
                    active = None
                    below_run = 0
                    pending = []
                elif row["risk_score"] < EXIT_CUT:
                    below_run += 1
                    active.windows.append(row)
                    if below_run >= MIN_WINDOWS_BELOW_TO_EXIT:
                        episodes.append(active)
                        active = None
                        pending = []
                else:
                    below_run = 0
                    active.windows.append(row)
                continue

            # no episodio activo: acumular evidencia de entrada
            if row["risk_score"] >= ENTER_CUT and (not pending or contiguous_with_prev):
                pending.append(row)
            else:
                pending = [row] if row["risk_score"] >= ENTER_CUT else []

            if len(pending) >= MIN_WINDOWS_TO_ENTER:
                active = Episode(patient_id=patient_id, windows=list(pending))
                pending = []
                below_run = 0

        if active is not None:
            episodes.append(active)

    return episodes


def _signal_id(episode: Episode) -> str:
    key = f"{episode.patient_id}|{episode.evidence_start}|{episode.evidence_end}"
    digest = hashlib.sha1(key.encode()).hexdigest()[:10]
    return f"SIG-{episode.patient_id}-{digest}"


def _explanation(episode: Episode) -> str:
    peak = episode.peak_window
    n_windows = len(episode.windows)
    span_h = (episode.evidence_end - episode.evidence_start).total_seconds() / 3600
    safety_score = int(peak.get("universal_safety_score", 0) or 0)
    safety_note = ""
    if safety_score >= 3:
        flags = peak.get("universal_safety_flags", "") or "parámetros disponibles"
        safety_note = (
            f" Baranda universal {config.UNIVERSAL_SAFETY_PROFILE}: "
            f"puntaje {safety_score} en {flags}; requiere verificación clínica."
        )
    return (
        f"Riesgo {priority_from_score(episode.current_risk)} para {episode.patient_id}: "
        f"evidencia sostenida durante {n_windows} ventana(s) ({span_h:.0f}h). "
        f"Variable con mayor aporte: {peak['top_variable']} "
        f"(contribución={peak['top_term']:.2f}, concordancia={peak['concordance']:.2f} "
        f"con {peak['n_active_vars']}/{peak['n_available_vars']} variables disponibles). "
        f"risk_score={episode.current_risk:.3f}, confidence_score={episode.current_confidence:.3f}."
        f"{safety_note}"
    )


def build_signals_table(episodes: list[Episode]) -> pd.DataFrame:
    rows = []
    for ep in episodes:
        rows.append({
            "signal_id": _signal_id(ep),
            "patient_id": ep.patient_id,
            "decision_datetime": ep.evidence_end,
            "risk_score": round(float(ep.current_risk), 4),
            "priority_level": priority_from_score(ep.current_risk),
            "confidence_score": round(float(ep.current_confidence), 4),
            "evidence_start": ep.evidence_start,
            "evidence_end": ep.evidence_end,
            "explanation": _explanation(ep),
            "model_version": config.MODEL_VERSION,
        })
    return pd.DataFrame(rows)


if __name__ == "__main__":
    fused = pd.read_parquet(config.CACHE_DIR / "fused_windows.parquet")
    episodes = extract_episodes(fused)
    print(f"{len(fused)} ventanas evaluadas -> {len(episodes)} episodios persistentes")

    signals = build_signals_table(episodes)
    print(signals["priority_level"].value_counts())
    signals.to_parquet(config.CACHE_DIR / "signals.parquet", index=False)

    import pickle
    with open(config.CACHE_DIR / "episodes.pkl", "wb") as f:
        pickle.dump(episodes, f)
    print("guardado en", config.CACHE_DIR / "signals.parquet", "y episodes.pkl")
