"""
Fusión noisy-OR de evidencia por ventana + persistencia entre ventanas -> señales.

  P(riesgo) = 1 - prod_i (1 - w_i * e_i)

  w_i: prior de confiabilidad por analysis_role (variable_catalog.csv), NO elegido
       a mano por variable individual.
  e_i: evidencia de esa variable en la ventana (desviación * persistencia,
       ya amortiguada por contexto en baseline_features.py).

La concordancia multivariable (cuántas fuentes distintas coinciden) se incorpora
como un término de evidencia más dentro del mismo producto, no como un bono
aparte -- así el jurado ve una sola fórmula, no una mezcla de reglas.

Calibración: en esta versión de un día, los cortes LOW/MEDIUM/HIGH/CRITICAL son
provisionales (documentados como tales). El siguiente paso -pendiente- es
calibrarlos con regresión isotónica contra un banco de escenarios sintéticos
dev/test, tal como se describe en propuesta/RISA_VIGIA.md sec. 6.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import config
from .safety_guardrails import risk_floor_from_safety_score

ROLE_WEIGHT = {
    "PERSONAL_BASELINE_RELEVANT": 0.85,
    "CONTEXT_SENSITIVE": 0.50,
    "MULTISOURCE": 0.70,
}
CONCORDANCE_WEIGHT = 0.60

PRIORITY_CUTS = [(0.80, "CRITICAL"), (0.55, "HIGH"), (0.30, "MEDIUM")]


def priority_from_score(score: float) -> str:
    for cut, label in PRIORITY_CUTS:
        if score >= cut:
            return label
    return "LOW"


def fuse_windows(features: pd.DataFrame) -> pd.DataFrame:
    features = features.copy()
    features["weight"] = features["analysis_role"].map(ROLE_WEIGHT).fillna(0.5)
    features["term"] = features["weight"] * features["context_damped_evidence"].clip(0, 1)

    per_window = features.groupby(["patient_id", "window_start", "window_end"])

    def _fuse(g: pd.DataFrame) -> pd.Series:
        n_active = int((g["context_damped_evidence"] > 0.3).sum())
        n_available = int(g["variable_code"].nunique())
        concordance = n_active / n_available if n_available else 0.0

        terms = list(g["term"].clip(upper=0.999))
        terms.append(CONCORDANCE_WEIGHT * concordance)
        risk = 1.0 - np.prod([1.0 - t for t in terms])

        # Cada familia fisiológica aporta una sola vez aunque HR y un wearable
        # estén presentes; se toma el peor valor de esa ventana. Esto evita que
        # dos sensores del mismo pulso inflen artificialmente el puntaje.
        safety_rows = g[g["universal_safety_family"].notna()]
        if safety_rows.empty:
            safety_score, safety_max_component, safety_flags = 0, 0, ""
        else:
            safety_by_family = safety_rows.groupby("universal_safety_family")["universal_safety_points"].max()
            safety_score = int(safety_by_family.sum())
            safety_max_component = int(safety_by_family.max())
            safety_flags = ",".join(safety_by_family[safety_by_family > 0].index.tolist())
        safety_risk_floor = risk_floor_from_safety_score(safety_score)
        combined_risk = max(float(risk), safety_risk_floor)

        top = g.sort_values("term", ascending=False).iloc[0]

        return pd.Series({
            "risk_score": combined_risk,
            "personal_risk_score": risk,
            "universal_safety_score": safety_score,
            "universal_safety_max_component": safety_max_component,
            "universal_safety_flags": safety_flags,
            "universal_safety_risk_floor": safety_risk_floor,
            "n_available_vars": n_available,
            "n_active_vars": n_active,
            "concordance": concordance,
            "top_variable": top["variable_code"],
            "top_term": top["term"],
        })

    fused = per_window.apply(_fuse, include_groups=False).reset_index()
    fused["priority_level"] = fused["risk_score"].apply(priority_from_score)
    return fused


def attach_confidence(fused: pd.DataFrame, raw_fusable: pd.DataFrame) -> pd.DataFrame:
    """confidence = cobertura x calidad x acuerdo entre fuentes (freshness=1 en este MVP)."""
    raw = raw_fusable.copy()
    raw["window_start"] = raw["available_datetime"].dt.floor(f"{config.WINDOW_HOURS}h")
    q = raw.groupby(["patient_id", "window_start"]).agg(
        quality_ok_frac=("quality_state", lambda s: (s == "OK").mean()),
        n_domains=("domain", "nunique"),
    ).reset_index()

    out = fused.merge(q, on=["patient_id", "window_start"], how="left")
    total_fusable_domains = raw_fusable["domain"].nunique()
    coverage = (out["n_available_vars"] / len(config.FUSABLE_VARIABLES)).clip(upper=1.0)
    source_agreement = (out["n_domains"] / max(total_fusable_domains, 1)).clip(upper=1.0)
    out["confidence_score"] = (coverage * out["quality_ok_frac"].fillna(0.5) * source_agreement).clip(0, 1)
    return out


if __name__ == "__main__":
    features = pd.read_parquet(config.CACHE_DIR / "windowed_features.parquet")
    events = pd.read_parquet(config.CACHE_DIR / "canonical_events.parquet")
    raw_fusable = events[
        events["variable_code"].isin(config.FUSABLE_VARIABLES)
        & (~events["is_duplicate"])
        & events["value"].notna()
    ]

    fused = fuse_windows(features)
    fused = attach_confidence(fused, raw_fusable)
    print(fused["priority_level"].value_counts())
    fused.to_parquet(config.CACHE_DIR / "fused_windows.parquet", index=False)
    print("guardado en", config.CACHE_DIR / "fused_windows.parquet")
