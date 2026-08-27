"""
Protege el resultado de calibración del banco de escenarios sintéticos
(src/synthetic_scenarios.py). Si esto se rompe, algún cambio en fusion.py o
generate_signals.py alteró el comportamiento frente a casos con respuesta
conocida -- hay que revisar antes de seguir, no solo re-ajustar el número.
"""
from __future__ import annotations

import pandas as pd
import pytest

from src.synthetic_scenarios import build_scenarios, run_scenario


@pytest.fixture(scope="module")
def results():
    return pd.DataFrame([run_scenario(sc) for sc in build_scenarios()])


def test_all_dev_scenarios_correct(results):
    dev = results[results["split"] == "dev"]
    wrong = dev[~dev["correct"]]
    assert wrong.empty, f"Escenarios dev fallidos: {wrong['name'].tolist()}"


def test_all_test_scenarios_correct(results):
    test = results[results["split"] == "test"]
    wrong = test[~test["correct"]]
    assert wrong.empty, f"Escenarios test (held-out) fallidos: {wrong['name'].tolist()}"


def test_arrival_with_persistently_severe_values_is_not_hidden_by_cold_start(results):
    row = results[results["name"] == "G_ingresa_gravemente_alterado"].iloc[0]
    assert row["triggered"], "la baranda universal debe proteger el arranque en frío"
    assert row["peak_risk"] >= 0.80
