"""
Invariantes duras que la propuesta promete (propuesta/RISA_VIGIA.md sec. 4, 6, 10):
  - 0 violaciones de temporalidad (available_datetime nunca después de cuando se usó).
  - Toda señal tiene al menos una fila de evidencia.
  - risk_score y confidence_score están en [0,1].
Se corren sobre resultados ya generados en pipeline/results/ (no recalcula el pipeline).
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
RESULTS = ROOT / "pipeline" / "results"
VALIDATOR = ROOT / "Participantes Salud" / "02_KIT_ENTREGA" / "validate_submission.py"
RISA_ROOT = ROOT / "Participantes Salud" / "01_RISA_DATA_V1_0"


@pytest.fixture(scope="module")
def signals():
    return pd.read_csv(RESULTS / "signals.csv", parse_dates=["decision_datetime", "evidence_start", "evidence_end"])


@pytest.fixture(scope="module")
def evidence():
    return pd.read_csv(RESULTS / "evidence.csv", parse_dates=["event_datetime", "available_datetime"])


def test_official_validator_passes():
    result = subprocess.run(
        [sys.executable, str(VALIDATOR), str(RESULTS), "--risa", str(RISA_ROOT)],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_no_temporal_leakage(signals, evidence):
    merged = evidence.merge(signals[["signal_id", "decision_datetime"]], on="signal_id", how="left")
    leaks = merged[merged["available_datetime"] > merged["decision_datetime"]]
    assert len(leaks) == 0, f"{len(leaks)} filas con available_datetime > decision_datetime"


def test_evidence_not_before_event(evidence):
    bad = evidence[evidence["available_datetime"] < evidence["event_datetime"]]
    assert len(bad) == 0, f"{len(bad)} filas con available_datetime < event_datetime"


def test_every_signal_has_evidence(signals, evidence):
    linked = set(evidence["signal_id"])
    orphans = set(signals["signal_id"]) - linked
    assert not orphans, f"{len(orphans)} señales sin evidencia: {list(orphans)[:5]}"


def test_scores_in_unit_range(signals):
    assert signals["risk_score"].between(0, 1).all()
    assert signals["confidence_score"].dropna().between(0, 1).all()


def test_evidence_end_within_decision(signals):
    assert (signals["evidence_start"] <= signals["evidence_end"]).all()
    assert (signals["evidence_end"] <= signals["decision_datetime"]).all()
