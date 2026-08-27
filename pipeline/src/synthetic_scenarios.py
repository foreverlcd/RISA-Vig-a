"""
Banco de escenarios sintéticos para calibrar sin Gold Standard.

Cada escenario es un paciente inventado con un patrón conocido de antemano
(¿debería generar una señal, o no?). Se corren por el pipeline REAL (mismas
funciones que se usan con los datos de RISA, no una reimplementación aparte),
y se compara el resultado contra lo esperado.

Regla de honestidad metodológica (propuesta/RISA_VIGIA.md sec. 6):
  - DEV: se usa para ajustar ENTER_CUT / EXIT_CUT / umbrales.
  - TEST: nunca se toca durante el ajuste, solo se corre al final para reportar.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from . import config
from .baseline_features import compute_personal_baseline, build_windowed_features
from .fusion import fuse_windows, attach_confidence
from .generate_signals import extract_episodes

try:
    VAR_CATALOG = pd.read_csv(config.METADATA / "variable_catalog.csv").set_index("variable_code")
except FileNotFoundError:
    # El banco sintético debe poder validar la lógica en CI o en una máquina que
    # no puede conservar el dataset privado del reto. Sus escenarios solo usan
    # estas variables, por lo que un catálogo mínimo es suficiente.
    VAR_CATALOG = pd.DataFrame(
        [
            ("HR", "vital_signs", "PERSONAL_BASELINE_RELEVANT"),
            ("WEARABLE_HR", "wearables", "CONTEXT_SENSITIVE"),
            ("RR", "vital_signs", "PERSONAL_BASELINE_RELEVANT"),
            ("SpO2", "vital_signs", "PERSONAL_BASELINE_RELEVANT"),
            ("TEMP", "vital_signs", "PERSONAL_BASELINE_RELEVANT"),
            ("SBP", "vital_signs", "PERSONAL_BASELINE_RELEVANT"),
            ("DBP", "vital_signs", "PERSONAL_BASELINE_RELEVANT"),
        ],
        columns=["variable_code", "domain", "analysis_role"],
    ).set_index("variable_code")
START = pd.Timestamp("2026-01-01 00:00:00")


def _row(patient_id, variable_code, t, value):
    row = VAR_CATALOG.loc[variable_code]
    return dict(
        patient_id=patient_id, variable_code=variable_code, value=value,
        event_datetime=t, available_datetime=t,
        domain=row["domain"], analysis_role=row["analysis_role"], quality_state="OK",
    )


def _series(patient_id, variable_code, n_baseline, baseline_value, baseline_noise,
            n_event=0, event_values=None, step=pd.Timedelta(minutes=20), rng=None):
    rng = rng or np.random.default_rng(0)
    rows = []
    t = START
    for _ in range(n_baseline):
        v = baseline_value + rng.normal(0, baseline_noise)
        rows.append(_row(patient_id, variable_code, t, v))
        t += step
    for v in (event_values or []):
        rows.append(_row(patient_id, variable_code, t, v))
        t += step
    return rows


@dataclass
class Scenario:
    name: str
    split: str  # "dev" | "test"
    expect_escalation: bool
    rows: list = field(default_factory=list)
    context_rows: list = field(default_factory=list)
    description: str = ""


def _ctx_row(patient_id, context_type, start, end):
    return dict(patient_id=patient_id, context_type=context_type, start_datetime=start, end_datetime=end)


NORMAL = dict(HR=(72, 3), RR=(15, 1), SpO2=(97, 0.6), TEMP=(36.8, 0.15), SBP=(118, 4), DBP=(76, 3))


def build_scenarios() -> list[Scenario]:
    rng = np.random.default_rng(42)
    scenarios = []

    # --- DEV -----------------------------------------------------------
    pid = "PAT-SYN-A"
    rows = []
    for var, (base, noise) in NORMAL.items():
        rows += _series(pid, var, 144, base, noise, rng=rng)
    trend = {"HR": np.linspace(72, 112, 36), "RR": np.linspace(15, 27, 36), "SpO2": np.linspace(97, 88, 36)}
    for var, values in trend.items():
        rows += _series(pid, var, 0, 0, 0, event_values=list(values), rng=rng)
        for r in rows[-len(values):]:
            r["event_datetime"] += pd.Timedelta(hours=48)
            r["available_datetime"] = r["event_datetime"]
    scenarios.append(Scenario("A_deterioro_progresivo", "dev", True, rows,
                               description="HR/RR suben y SpO2 baja de forma sostenida durante 12h"))

    pid = "PAT-SYN-B"
    rows = []
    for var, (base, noise) in NORMAL.items():
        rows += _series(pid, var, 200, base, noise, rng=rng)
    spike_t = rows[-1]["event_datetime"] + pd.Timedelta(minutes=20)
    rows.append(_row(pid, "HR", spike_t, 150))
    rows.append(_row(pid, "HR", spike_t + pd.Timedelta(minutes=20), 73))
    scenarios.append(Scenario("B_pico_aislado", "dev", False, rows,
                               description="Un solo punto de HR se dispara y vuelve a la normalidad de inmediato"))

    pid = "PAT-SYN-C"
    rows = []
    for var, (base, noise) in NORMAL.items():
        rows += _series(pid, var, 144, base, noise, rng=rng)
    act_start = rows[-1]["event_datetime"] + pd.Timedelta(minutes=20)
    t = act_start
    for _ in range(9):  # ~3h de actividad física
        rows.append(_row(pid, "HR", t, 128 + rng.normal(0, 4)))
        t += pd.Timedelta(minutes=20)
    for var, (base, noise) in NORMAL.items():
        if var == "HR":
            continue
        rows += _series(pid, var, 9, base, noise, rng=rng)  # resto de vitales sin cambios durante ese lapso
    ctx = [_ctx_row(pid, "PHYSICAL_ACTIVITY", act_start, t)]
    scenarios.append(Scenario("C_explicado_por_actividad", "dev", False, rows, ctx,
                               description="HR sube durante actividad física registrada -> no debería escalar"))

    pid = "PAT-SYN-D"
    rows = []
    for var, (base, noise) in NORMAL.items():
        rows += _series(pid, var, 144, base, noise, rng=rng)
    moderate = {"HR": np.linspace(72, 92, 24), "RR": np.linspace(15, 20, 24), "SpO2": np.linspace(97, 94, 24)}
    for var, values in moderate.items():
        tmp = _series(pid, var, 0, 0, 0, event_values=list(values), rng=rng)
        for r in tmp:
            r["event_datetime"] += pd.Timedelta(hours=48)
            r["available_datetime"] = r["event_datetime"]
        rows += tmp
    scenarios.append(Scenario("D_concordancia_moderada", "dev", True, rows,
                               description="Ninguna variable sola es extrema, pero 3 se mueven juntas y persisten"))

    pid = "PAT-SYN-E"
    rows = []
    for var, (base, noise) in NORMAL.items():
        rows += _series(pid, var, 220, base, noise, rng=rng)
    scenarios.append(Scenario("E_control_estable", "dev", False, rows,
                               description="Ruido biológico normal, sin ningún evento -> control negativo puro"))

    # Sin historia previa útil: los valores ya son gravemente anómalos desde la
    # admisión. La línea base por sí sola los tomaría como población de arranque;
    # la baranda universal debe abrir una señal tras dos ventanas confirmatorias.
    pid = "PAT-SYN-G"
    rows = []
    for step in range(18):  # 6 horas, dos ventanas de 3h
        t = START + pd.Timedelta(minutes=20 * step)
        for var, value in {"HR": 136, "RR": 27, "SpO2": 90, "SBP": 86, "TEMP": 39.2}.items():
            rows.append(_row(pid, var, t, value))
    scenarios.append(Scenario("G_ingresa_gravemente_alterado", "dev", True, rows,
                               description="Sin línea base previa; alteraciones graves persistentes activan la baranda universal"))

    # --- TEST (no se toca hasta el reporte final) -----------------------
    pid = "PAT-SYN-A2"
    rows = []
    for var, (base, noise) in NORMAL.items():
        rows += _series(pid, var, 144, base, noise, rng=rng)
    trend2 = {"TEMP": np.linspace(36.8, 39.4, 36), "SBP": np.linspace(118, 84, 36), "DBP": np.linspace(76, 50, 36)}
    for var, values in trend2.items():
        tmp = _series(pid, var, 0, 0, 0, event_values=list(values), rng=rng)
        for r in tmp:
            r["event_datetime"] += pd.Timedelta(hours=48)
            r["available_datetime"] = r["event_datetime"]
        rows += tmp
    scenarios.append(Scenario("A2_fiebre_hipotension", "test", True, rows,
                               description="TEMP sube y SBP/DBP bajan de forma sostenida (variables distintas a A)"))

    pid = "PAT-SYN-B2"
    rows = []
    for var, (base, noise) in NORMAL.items():
        rows += _series(pid, var, 200, base, noise, rng=rng)
    spike_t = rows[-1]["event_datetime"] + pd.Timedelta(minutes=20)
    rows.append(_row(pid, "SpO2", spike_t, 70))
    rows.append(_row(pid, "SpO2", spike_t + pd.Timedelta(minutes=20), 97))
    scenarios.append(Scenario("B2_artefacto_spo2", "test", False, rows,
                               description="SpO2 cae a 70 en un solo punto (probable artefacto) y se recupera"))

    pid = "PAT-SYN-C2"
    rows = []
    for var, (base, noise) in NORMAL.items():
        rows += _series(pid, var, 144, base, noise, rng=rng)
    rec_start = rows[-1]["event_datetime"] + pd.Timedelta(minutes=20)
    t = rec_start
    for _ in range(9):
        rows.append(_row(pid, "WEARABLE_HR", t, 118 + rng.normal(0, 4)))
        t += pd.Timedelta(minutes=20)
    ctx = [_ctx_row(pid, "RECOVERY_PHASE", rec_start, t)]
    scenarios.append(Scenario("C2_explicado_por_recuperacion", "test", False, rows, ctx,
                               description="WEARABLE_HR elevado durante fase de recuperación registrada"))

    pid = "PAT-SYN-D2"
    rows = []
    for var, (base, noise) in NORMAL.items():
        rows += _series(pid, var, 144, base, noise, rng=rng)
    moderate2 = {"HR": np.linspace(72, 95, 24), "TEMP": np.linspace(36.8, 38.0, 24), "SBP": np.linspace(118, 100, 24)}
    for var, values in moderate2.items():
        tmp = _series(pid, var, 0, 0, 0, event_values=list(values), rng=rng)
        for r in tmp:
            r["event_datetime"] += pd.Timedelta(hours=48)
            r["available_datetime"] = r["event_datetime"]
        rows += tmp
    scenarios.append(Scenario("D2_concordancia_moderada_v2", "test", True, rows,
                               description="Variante de concordancia moderada con otra combinación de variables"))

    pid = "PAT-SYN-F2"
    rows = []
    normal_older = dict(HR=(66, 3), RR=(14, 1), SpO2=(96, 0.6), TEMP=(36.6, 0.15), SBP=(128, 4), DBP=(80, 3))
    for var, (base, noise) in normal_older.items():
        rows += _series(pid, var, 220, base, noise, rng=rng)
    scenarios.append(Scenario("F2_control_estable_v2", "test", False, rows,
                               description="Control negativo con línea base distinta (paciente 'mayor')"))

    return scenarios


def run_scenario(sc: Scenario) -> dict:
    raw = pd.DataFrame(sc.rows)
    raw = raw.sort_values(["patient_id", "variable_code", "available_datetime"])

    with_baseline = compute_personal_baseline(raw)
    ctx_df = pd.DataFrame(sc.context_rows) if sc.context_rows else pd.DataFrame(
        columns=["patient_id", "context_type", "start_datetime", "end_datetime"])
    features = build_windowed_features(with_baseline, ctx_override=ctx_df)

    fused = fuse_windows(features)
    fused = attach_confidence(fused, raw)
    episodes = extract_episodes(fused)

    triggered = len(episodes) > 0
    peak_risk = max((ep.current_risk for ep in episodes), default=fused["risk_score"].max() if len(fused) else 0.0)
    return dict(name=sc.name, split=sc.split, expected=sc.expect_escalation, triggered=triggered,
                correct=(triggered == sc.expect_escalation), peak_risk=round(float(peak_risk), 3),
                description=sc.description)


if __name__ == "__main__":
    results = [run_scenario(sc) for sc in build_scenarios()]
    df = pd.DataFrame(results)
    pd.set_option("display.width", 160)
    pd.set_option("display.max_colwidth", 45)
    print(df[["name", "split", "expected", "triggered", "correct", "peak_risk", "description"]].to_string(index=False))
    print()
    for split in ("dev", "test"):
        sub = df[df["split"] == split]
        print(f"{split.upper()}: {sub['correct'].sum()}/{len(sub)} correctos")
