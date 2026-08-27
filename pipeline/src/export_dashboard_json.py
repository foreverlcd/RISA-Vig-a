"""Exporta signals.csv + evidence.csv + el desglose interno (línea base personal,
features de la ventana pico, términos de la fórmula noisy-OR) a un único JSON
para el dashboard. Evita parsear CSV en el navegador y evita repetir cálculos
que ya viven en cache/ (raw_evidence.parquet, windowed_features.parquet,
episodes.pkl)."""
from __future__ import annotations

import json
import pickle

import numpy as np
import pandas as pd

from . import config
from .fusion import ROLE_WEIGHT
from .generate_signals import Episode, build_signals_table


def _clean(v):
    """NaN/NaT -> None: json.dumps con NaN es inválido para el navegador."""
    if v is None:
        return None
    if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
        return None
    if pd.isna(v):
        return None
    return v


def build_baseline_table(raw_evidence: pd.DataFrame) -> dict[str, list[dict]]:
    """Última línea base personal conocida por paciente x variable (para mostrar
    contexto en el panel; no se usa para puntuar riesgo, eso ya ocurrió antes)."""
    latest = (
        raw_evidence.sort_values("available_datetime")
        .groupby(["patient_id", "variable_code"], as_index=False)
        .last()
    )
    out: dict[str, list[dict]] = {}
    for pid, g in latest.groupby("patient_id"):
        out[pid] = [
            {
                "variable_code": r.variable_code,
                "baseline_median": _clean(round(r.baseline_median, 3)) if pd.notna(r.baseline_median) else None,
                "baseline_mad": _clean(round(r.baseline_mad, 3)) if pd.notna(r.baseline_mad) else None,
                "last_value": _clean(round(r.value, 3)),
                "as_of": str(r.available_datetime),
            }
            for r in g.itertuples()
        ]
    return out


def build_peak_window_table(episode: Episode, windowed_features: pd.DataFrame) -> list[dict]:
    peak = episode.peak_window
    rows = windowed_features[
        (windowed_features["patient_id"] == episode.patient_id)
        & (windowed_features["window_start"] == peak["window_start"])
        & (windowed_features["window_end"] == peak["window_end"])
    ]
    out = []
    for r in rows.itertuples():
        weight = ROLE_WEIGHT.get(r.analysis_role, 0.5)
        e_i = float(r.context_damped_evidence)
        out.append({
            "variable_code": r.variable_code,
            "domain": r.domain,
            "analysis_role": r.analysis_role,
            "last_value": round(float(r.last_value), 3),
            "deviation_evidence": round(float(r.mean_evidence), 3),
            "trend": round(float(r.trend), 3),
            "persistence": round(float(r.persistence), 3),
            "context_damped_evidence": round(e_i, 3),
            "weight": round(weight, 3),
            "term": round(weight * e_i, 4),
            "universal_safety_points": int(r.universal_safety_points),
        })
    out.sort(key=lambda x: x["term"], reverse=True)
    return out


if __name__ == "__main__":
    signals = pd.read_csv(config.RESULTS_DIR / "signals.csv")
    evidence = pd.read_csv(config.RESULTS_DIR / "evidence.csv")
    evidence["contribution"] = evidence["contribution"].astype(object).where(evidence["contribution"].notna(), None)

    raw_evidence = pd.read_parquet(config.CACHE_DIR / "raw_evidence.parquet")
    windowed_features = pd.read_parquet(config.CACHE_DIR / "windowed_features.parquet")
    with open(config.CACHE_DIR / "episodes.pkl", "rb") as f:
        episodes: list[Episode] = pickle.load(f)
    episode_signal_ids = build_signals_table(episodes)["signal_id"].tolist()
    episodes_by_signal = dict(zip(episode_signal_ids, episodes))

    baseline_by_patient = build_baseline_table(raw_evidence)

    evidence_by_signal: dict[str, list[dict]] = {}
    for sid, g in evidence.groupby("signal_id"):
        evidence_by_signal[sid] = g.drop(columns=["signal_id"]).to_dict("records")

    signals_records = signals.sort_values("risk_score", ascending=False).to_dict("records")
    for s in signals_records:
        sid, pid = s["signal_id"], s["patient_id"]
        s["evidence"] = evidence_by_signal.get(sid, [])
        s["baseline"] = baseline_by_patient.get(pid, [])
        ep = episodes_by_signal.get(sid)
        s["fusion_terms"] = build_peak_window_table(ep, windowed_features) if ep is not None else []
        # Metadatos de interfaz: no se escriben en signals.csv porque ese CSV
        # debe conservar exactamente el contrato del kit oficial de entrega.
        if ep is not None:
            peak = ep.peak_window
            s["personal_risk_score"] = round(float(peak.get("personal_risk_score", s["risk_score"])), 4)
            s["universal_safety_score"] = int(peak.get("universal_safety_score", 0) or 0)
            s["universal_safety_flags"] = peak.get("universal_safety_flags", "") or ""

    patients_history: dict[str, list[dict]] = {}
    for s in signals_records:
        patients_history.setdefault(s["patient_id"], []).append({
            "signal_id": s["signal_id"], "decision_datetime": s["decision_datetime"],
            "risk_score": s["risk_score"], "priority_level": s["priority_level"],
        })
    for pid, hist in patients_history.items():
        hist.sort(key=lambda r: r["decision_datetime"])

    for s in signals_records:
        s["patient_history"] = patients_history[s["patient_id"]]

    all_patients = pd.read_csv(config.MASTER / "patients.csv")
    with_signal_ids = set(signals["patient_id"].unique())
    without_signal_ids = sorted(set(all_patients["patient_id"]) - with_signal_ids)
    patients_with_signal = len(with_signal_ids)
    patients_without_signal = len(without_signal_ids)

    no_signal_patients = [
        {"patient_id": pid, "baseline": baseline_by_patient.get(pid, [])}
        for pid in without_signal_ids
    ]

    priority_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    stats = {
        "total_signals": len(signals),
        "total_patients_monitored": int(all_patients["patient_id"].nunique()),
        "total_patients": patients_with_signal,
        "patients_without_signal": int(patients_without_signal),
        "by_priority": signals["priority_level"].value_counts().reindex(
            sorted(priority_order, key=priority_order.get)).fillna(0).astype(int).to_dict(),
        "model_version": signals["model_version"].iloc[0] if len(signals) else None,
        "avg_confidence": round(float(signals["confidence_score"].mean()), 3) if len(signals) else None,
    }

    out = {"stats": stats, "signals": signals_records, "no_signal_patients": no_signal_patients}
    out_path = config.ROOT / "dashboard" / "public" / "data.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, default=str, ensure_ascii=False, allow_nan=False))
    print(f"{len(signals_records)} señales -> {out_path} ({out_path.stat().st_size / 1024:.0f} KB)")
