import pandas as pd

from src.safety_guardrails import news2_scale_1_points, risk_floor_from_safety_score
from src.generate_signals import Episode, build_signals_table


def test_news2_scale_1_available_parameter_boundaries():
    assert news2_scale_1_points("SpO2", 97) == 0
    assert news2_scale_1_points("SpO2", 90) == 3
    assert news2_scale_1_points("SBP", 86) == 3
    assert news2_scale_1_points("HR", 136) == 3
    assert news2_scale_1_points("RR", 27) == 3
    assert news2_scale_1_points("TEMP", 39.2) == 2


def test_safety_score_maps_to_a_priority_floor():
    assert risk_floor_from_safety_score(2) == 0.0
    assert risk_floor_from_safety_score(3) == 0.30
    assert risk_floor_from_safety_score(5) == 0.55
    assert risk_floor_from_safety_score(7) == 0.80


def test_official_signals_table_does_not_gain_dashboard_only_columns():
    window = {
        "window_start": pd.Timestamp("2026-01-01 00:00:00"),
        "window_end": pd.Timestamp("2026-01-01 03:00:00"),
        "risk_score": 0.80,
        "confidence_score": 0.75,
        "top_variable": "SpO2",
        "top_term": 0.0,
        "concordance": 0.0,
        "n_active_vars": 0,
        "n_available_vars": 1,
        "personal_risk_score": 0.0,
        "universal_safety_score": 7,
        "universal_safety_flags": "SpO2",
    }
    signals = build_signals_table([Episode(patient_id="PAT-SYN", windows=[window])])
    assert list(signals.columns) == [
        "signal_id", "patient_id", "decision_datetime", "risk_score", "priority_level",
        "confidence_score", "evidence_start", "evidence_end", "explanation", "model_version",
    ]
