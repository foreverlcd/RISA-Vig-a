"""
Línea base personal + features temporales por ventana.

Para cada paciente y variable fusionable:
  1. Baseline robusto (mediana/MAD) calculado SOLO con observaciones previas
     (expanding, shift(1)) -> nunca usa el propio punto ni el futuro.
  2. Arranque en frío: si el paciente tiene menos de MIN_PERSONAL_OBS_FOR_BASELINE
     observaciones previas, se usa una mediana/MAD poblacional por variable como
     prior (simplificación de MVP: la población de referencia se calcula sobre
     todo el dataset, no de forma leakage-free; documentado como limitación
     conocida a resolver si el proyecto continúa más allá de hoy).
  3. Se agrega a ventanas fijas de config.WINDOW_HOURS por paciente x variable:
     desviación media, persistencia (fracción de puntos anómalos) y tendencia.
  4. Se amortigua por contexto (actividad física / recuperación) cuando aplica
     a variables sensibles a contexto (HR, WEARABLE_HR).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import config

MAD_SCALE = 1.4826  # factor estándar para que MAD aproxime a sigma bajo normalidad
ACTIVATION_THRESHOLD = 0.3  # evidencia mínima para contar un punto como "anómalo" en persistencia


MATERIALITY_FLOOR = 1.0  # |z| robusto por debajo de esto = variabilidad normal, evidencia 0


def _robust_evidence(z: pd.Series) -> pd.Series:
    """Transformación monótona saturante de |z| robusto -> evidencia en [0,1].

    Por debajo de MATERIALITY_FLOOR desviaciones típicas (robustas) la evidencia
    es exactamente 0: variabilidad biológica normal no debe activar nada. Solo
    a partir de ahí empieza a crecer (saturando con tanh), evitando que ruido
    de baja magnitud en 6-7 variables simultáneas se combine artificialmente
    en un riesgo alto vía el fusor noisy-OR.
    """
    excess = (z.abs() - MATERIALITY_FLOOR).clip(lower=0)
    return np.tanh(excess / 2.5)


def compute_personal_baseline(fusable: pd.DataFrame) -> pd.DataFrame:
    fusable = fusable.sort_values(["patient_id", "variable_code", "available_datetime"]).copy()

    grp = fusable.groupby(["patient_id", "variable_code"], sort=False)["value"]
    fusable["personal_median"] = grp.transform(lambda s: s.expanding(min_periods=1).median().shift(1))
    fusable["personal_mad"] = grp.transform(
        lambda s: (s - s.expanding(min_periods=1).median().shift(1)).abs()
        .expanding(min_periods=1).median().shift(1)
    )
    fusable["personal_n_prior"] = grp.cumcount()

    pop = fusable.groupby("variable_code")["value"].agg(
        pop_median="median", pop_mad=lambda s: (s - s.median()).abs().median()
    )
    fusable = fusable.merge(pop, on="variable_code", how="left")

    cold_start = fusable["personal_n_prior"] < config.MIN_PERSONAL_OBS_FOR_BASELINE
    fusable["baseline_median"] = np.where(cold_start, fusable["pop_median"], fusable["personal_median"])
    fusable["baseline_mad"] = np.where(cold_start, fusable["pop_mad"], fusable["personal_mad"])
    fusable["baseline_source"] = np.where(cold_start, "POPULATION_PRIOR", "PERSONAL")

    eps = 1e-6
    fusable["z"] = (fusable["value"] - fusable["baseline_median"]) / (fusable["baseline_mad"] * MAD_SCALE + eps)
    fusable["evidence"] = _robust_evidence(fusable["z"])
    return fusable


def _window_start(ts: pd.Series) -> pd.Series:
    return ts.dt.floor(f"{config.WINDOW_HOURS}h")


def compute_context_overlap(patient_ids: list[str]) -> pd.DataFrame:
    ctx = pd.read_csv(
        config.CONTEXT / "patient_context.csv",
        parse_dates=["start_datetime", "end_datetime"],
    )
    ctx = ctx[ctx["patient_id"].isin(patient_ids)]
    return ctx


def _context_active_fraction(window_start, window_end, ctx_patient: pd.DataFrame, context_type: str) -> float:
    if ctx_patient.empty:
        return 0.0
    sub = ctx_patient[ctx_patient["context_type"] == context_type]
    if sub.empty:
        return 0.0
    overlap = (sub["end_datetime"].clip(upper=window_end) - sub["start_datetime"].clip(lower=window_start))
    overlap = overlap.dt.total_seconds().clip(lower=0)
    total = (window_end - window_start).total_seconds()
    return float(overlap.sum() / total) if total > 0 else 0.0


def build_windowed_features(fusable_with_baseline: pd.DataFrame, ctx_override: pd.DataFrame | None = None) -> pd.DataFrame:
    df = fusable_with_baseline.copy()
    # Las ventanas se indexan por available_datetime, NO por event_datetime: una
    # decisión tomada al cierre de una ventana solo puede usar lo que ya estaba
    # disponible en ese instante (labs y wearables llegan con retraso respecto a
    # cuándo ocurrieron). Agrupar por event_datetime filtraría datos que en la
    # práctica todavía no existían para el sistema -> fuga temporal.
    df["window_start"] = _window_start(df["available_datetime"])
    df["window_end"] = df["window_start"] + pd.Timedelta(hours=config.WINDOW_HOURS)

    agg = df.groupby(["patient_id", "variable_code", "window_start", "window_end"]).agg(
        mean_evidence=("evidence", "mean"),
        max_evidence=("evidence", "max"),
        n_points=("evidence", "size"),
        n_anomalous=("evidence", lambda s: (s > ACTIVATION_THRESHOLD).sum()),
        first_value=("value", "first"),
        last_value=("value", "last"),
        analysis_role=("analysis_role", "first"),
        domain=("domain", "first"),
    ).reset_index()

    agg["persistence"] = agg["n_anomalous"] / agg["n_points"]
    agg["trend"] = np.tanh((agg["last_value"] - agg["first_value"]).abs() / (agg["first_value"].abs() + 1e-6))

    # evidencia a nivel de ventana: combina magnitud y persistencia (una desviación
    # aislada de un solo punto no basta; tiene que sostenerse en la ventana)
    agg["window_evidence"] = agg["mean_evidence"] * (0.5 + 0.5 * agg["persistence"])

    # amortiguación por contexto para variables sensibles a actividad física
    context_sensitive_vars = {"HR", "WEARABLE_HR"}
    ctx = ctx_override if ctx_override is not None else compute_context_overlap(agg["patient_id"].unique().tolist())

    def dampen(row):
        if row["variable_code"] not in context_sensitive_vars:
            return row["window_evidence"]
        ctx_p = ctx[ctx["patient_id"] == row["patient_id"]]
        activity_frac = _context_active_fraction(row["window_start"], row["window_end"], ctx_p, "PHYSICAL_ACTIVITY")
        recovery_frac = _context_active_fraction(row["window_start"], row["window_end"], ctx_p, "RECOVERY_PHASE")
        damp = max(0.0, 1.0 - 0.7 * activity_frac - 0.5 * recovery_frac)
        return row["window_evidence"] * damp

    agg["context_damped_evidence"] = agg.apply(dampen, axis=1)
    return agg


if __name__ == "__main__":
    events = pd.read_parquet(config.CACHE_DIR / "canonical_events.parquet")
    fusable = events[
        events["variable_code"].isin(config.FUSABLE_VARIABLES)
        & (~events["is_duplicate"])
        & events["value"].notna()
    ].copy()
    print("fusable rows:", len(fusable))

    with_baseline = compute_personal_baseline(fusable)
    print(with_baseline[["patient_id", "variable_code", "baseline_source"]].groupby(
        "baseline_source").size())

    features = build_windowed_features(with_baseline)
    print("window-level feature rows:", len(features))
    features.to_parquet(config.CACHE_DIR / "windowed_features.parquet", index=False)

    raw_evidence_cols = [
        "patient_id", "record_id", "source_file", "variable_code", "domain",
        "event_datetime", "available_datetime", "value", "quality_state",
        "baseline_median", "baseline_mad", "z", "evidence",
    ]
    with_baseline[raw_evidence_cols].to_parquet(config.CACHE_DIR / "raw_evidence.parquet", index=False)
    print("guardado en", config.CACHE_DIR / "windowed_features.parquet", "y raw_evidence.parquet")
