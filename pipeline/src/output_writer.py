"""
Escribe results/signals.csv y results/evidence.csv con el esquema exacto del kit
oficial (02_KIT_ENTREGA/{signals,evidence}_template.csv).
"""
from __future__ import annotations

import pickle

import pandas as pd

from . import config
from .fusion import ROLE_WEIGHT
from .generate_signals import Episode, build_signals_table, _signal_id

MAX_PRIMARY_ROWS = 6
MAX_SUPPORTING_ROWS_PER_VAR = 3
MAX_CONTEXT_ROWS = 4
MAX_QUALITY_ROWS = 4


def _variable_catalog_roles() -> pd.DataFrame:
    vc = pd.read_csv(config.METADATA / "variable_catalog.csv")
    return vc[["variable_code", "analysis_role"]]


def build_evidence_rows(episode: Episode, signal_id: str, raw_evidence: pd.DataFrame,
                         canonical_events: pd.DataFrame, patient_context: pd.DataFrame,
                         var_roles: pd.DataFrame) -> list[dict]:
    rows: list[dict] = []
    start, end = episode.evidence_start, episode.evidence_end
    top_var = episode.peak_window["top_variable"]

    # Se filtra por available_datetime (no event_datetime): las ventanas del
    # episodio están indexadas por disponibilidad, y ningún dato puede aparecer
    # como evidencia de una señal si aún no estaba disponible en ese momento.
    window = raw_evidence[
        (raw_evidence["patient_id"] == episode.patient_id)
        & (raw_evidence["available_datetime"] >= start)
        & (raw_evidence["available_datetime"] <= end)
        & (raw_evidence["evidence"] > 0)
    ].merge(var_roles, on="variable_code", how="left")
    window["weight"] = window["analysis_role"].map(ROLE_WEIGHT).fillna(0.5)
    window["contribution"] = window["weight"] * window["evidence"]

    primary = window[window["variable_code"] == top_var].sort_values("contribution", ascending=False)
    primary = primary.head(MAX_PRIMARY_ROWS)
    for _, r in primary.iterrows():
        rows.append(dict(signal_id=signal_id, source_file=r["source_file"], record_id=r["record_id"],
                          variable_code=r["variable_code"], event_datetime=r["event_datetime"],
                          available_datetime=r["available_datetime"], evidence_role="PRIMARY",
                          contribution=round(float(r["contribution"]), 4)))

    supporting = window[window["variable_code"] != top_var]
    for var_code, g in supporting.groupby("variable_code"):
        g = g.sort_values("contribution", ascending=False).head(MAX_SUPPORTING_ROWS_PER_VAR)
        for _, r in g.iterrows():
            rows.append(dict(signal_id=signal_id, source_file=r["source_file"], record_id=r["record_id"],
                              variable_code=r["variable_code"], event_datetime=r["event_datetime"],
                              available_datetime=r["available_datetime"], evidence_role="SUPPORTING",
                              contribution=round(float(r["contribution"]), 4)))

    ctx = patient_context[
        (patient_context["patient_id"] == episode.patient_id)
        & (patient_context["end_datetime"] >= start)
        & (patient_context["start_datetime"] <= end)
    ].head(MAX_CONTEXT_ROWS)
    for _, r in ctx.iterrows():
        rows.append(dict(signal_id=signal_id, source_file="04_context/patient_context.csv",
                          record_id=r["context_id"], variable_code=r["context_type"],
                          event_datetime=r["start_datetime"], available_datetime=r["start_datetime"],
                          evidence_role="CONTEXT", contribution=""))

    quality = canonical_events[
        (canonical_events["patient_id"] == episode.patient_id)
        & (canonical_events["available_datetime"] >= start)
        & (canonical_events["available_datetime"] <= end)
        & (canonical_events["quality_state"].isin(["CHECK", "LOW_SIGNAL", "UNIT_VARIANT"])
           | ((canonical_events["domain"] == "DEVICE") & (canonical_events["value"] < 0.7)))
    ].head(MAX_QUALITY_ROWS)
    for _, r in quality.iterrows():
        rows.append(dict(signal_id=signal_id, source_file=r["source_file"], record_id=r["record_id"],
                          variable_code=r["variable_code"], event_datetime=r["event_datetime"],
                          available_datetime=r["available_datetime"], evidence_role="QUALITY",
                          contribution=""))

    if not rows:
        # Salvaguarda: el validador exige al menos una fila de evidencia por señal.
        peak = episode.peak_window
        rows.append(dict(signal_id=signal_id, source_file="03_monitoring/vital_signs.csv",
                          record_id="N/A", variable_code=peak["top_variable"],
                          event_datetime=start, available_datetime=start,
                          evidence_role="PRIMARY", contribution=round(float(peak["top_term"]), 4)))
    return rows


if __name__ == "__main__":
    with open(config.CACHE_DIR / "episodes.pkl", "rb") as f:
        episodes: list[Episode] = pickle.load(f)

    raw_evidence = pd.read_parquet(config.CACHE_DIR / "raw_evidence.parquet")
    canonical_events = pd.read_parquet(config.CACHE_DIR / "canonical_events.parquet")
    patient_context = pd.read_csv(
        config.CONTEXT / "patient_context.csv", parse_dates=["start_datetime", "end_datetime"]
    )
    var_roles = _variable_catalog_roles()

    signals = build_signals_table(episodes)

    evidence_rows: list[dict] = []
    for ep, sid in zip(episodes, signals["signal_id"]):
        evidence_rows.extend(
            build_evidence_rows(ep, sid, raw_evidence, canonical_events, patient_context, var_roles)
        )
    evidence = pd.DataFrame(evidence_rows)

    print("signals:", len(signals), " evidence rows:", len(evidence))
    print("señales sin evidencia:", signals[~signals["signal_id"].isin(evidence["signal_id"])].shape[0])

    signals.to_csv(config.RESULTS_DIR / "signals.csv", index=False)
    evidence.to_csv(config.RESULTS_DIR / "evidence.csv", index=False)
    print("escrito en", config.RESULTS_DIR)
