"""
Construye el modelo canónico de eventos a partir de las fuentes crudas de RISA.

Reglas duras (ver propuesta/RISA_VIGIA.md):
  - event_datetime = cuándo ocurrió la medición.
  - available_datetime = cuándo esa medición pudo usarse para decidir.
  - Ninguna fila puede usarse en una decisión tomada antes de su available_datetime.
  - Las unidades se normalizan a canonical_unit vía units_catalog.csv.
  - Las retransmisiones (source_system=MONITOR_RETRANSMIT / quality_flag=RETRANSMITTED)
    se conservan para auditoría pero se marcan is_duplicate=True y se excluyen del
    cálculo de features para no duplicar su contribución analítica.
"""
from __future__ import annotations

import pandas as pd

from . import config

CANONICAL_COLUMNS = [
    "patient_id", "encounter_id", "source_file", "record_id", "variable_code",
    "domain", "analysis_role", "raw_value", "raw_unit", "value", "canonical_unit",
    "event_datetime", "available_datetime", "quality_state", "device_id",
    "facility_id", "is_duplicate",
]


def _load_units_catalog() -> pd.DataFrame:
    return pd.read_csv(config.METADATA / "units_catalog.csv")


def _load_variable_catalog() -> pd.DataFrame:
    return pd.read_csv(config.METADATA / "variable_catalog.csv")


def _convert_units(df: pd.DataFrame, units: pd.DataFrame) -> pd.DataFrame:
    """Aplica value = raw_value * conversion_factor + conversion_offset."""
    merged = df.merge(
        units[["unit_code", "canonical_unit", "conversion_factor", "conversion_offset"]],
        left_on="raw_unit", right_on="unit_code", how="left",
    )
    missing = merged["conversion_factor"].isna()
    if missing.any():
        bad_units = sorted(merged.loc[missing, "raw_unit"].unique())
        raise ValueError(f"Unidades sin entrada en units_catalog.csv: {bad_units}")
    # Variables categóricas (ACTIVITY_LEVEL, SLEEP_STATE) no tienen valor numérico:
    # se preserva su texto crudo en raw_value y "value" queda NaN para ellas.
    numeric_raw = pd.to_numeric(merged["raw_value"], errors="coerce")
    merged["value"] = numeric_raw * merged["conversion_factor"] + merged["conversion_offset"]
    return merged.drop(columns=["unit_code", "conversion_factor", "conversion_offset"])


def _attach_catalog(df: pd.DataFrame, var_catalog: pd.DataFrame) -> pd.DataFrame:
    cat = var_catalog[["variable_code", "domain", "analysis_role", "canonical_unit"]]
    out = df.merge(cat, on="variable_code", how="left", suffixes=("", "_cat"))
    # canonical_unit ya viene de units_catalog para variables físicas; para las que
    # no tengan conversión de unidad (p.ej. categóricas) se usa la del variable_catalog.
    if "canonical_unit_cat" in out.columns:
        out["canonical_unit"] = out["canonical_unit"].fillna(out["canonical_unit_cat"])
        out = out.drop(columns=["canonical_unit_cat"])
    return out


def load_vital_signs(units: pd.DataFrame, var_catalog: pd.DataFrame) -> pd.DataFrame:
    path = config.MONITORING / "vital_signs.csv"
    df = pd.read_csv(path, parse_dates=["timestamp"])
    df = df.rename(columns={
        "observation_id": "record_id", "timestamp": "event_datetime",
        "unit": "raw_unit", "value": "raw_value", "quality_flag": "quality_state",
    })
    df["available_datetime"] = df["event_datetime"]  # MONITOR_GATEWAY: NEAR_REAL_TIME (source_catalog.csv)
    df["facility_id"] = pd.NA
    df["source_file"] = "03_monitoring/vital_signs.csv"
    df["is_duplicate"] = df["source_system"].eq("MONITOR_RETRANSMIT") | df["quality_state"].eq("RETRANSMITTED")
    df = _convert_units(df, units)
    df = _attach_catalog(df, var_catalog)
    return df[CANONICAL_COLUMNS]


def load_wearable(units: pd.DataFrame, var_catalog: pd.DataFrame) -> pd.DataFrame:
    path = config.MONITORING / "wearable_observations.csv"
    df = pd.read_csv(path, parse_dates=["timestamp", "sync_datetime"])
    df = df.rename(columns={
        "wearable_observation_id": "record_id", "timestamp": "event_datetime",
        "sync_datetime": "available_datetime", "unit": "raw_unit", "value": "raw_value",
        "measurement_quality": "quality_state",
    })
    df["encounter_id"] = pd.NA
    df["facility_id"] = pd.NA
    df["source_file"] = "03_monitoring/wearable_observations.csv"
    df["is_duplicate"] = False
    df = _convert_units(df, units)
    df = _attach_catalog(df, var_catalog)
    return df[CANONICAL_COLUMNS]


def load_device_observations(units: pd.DataFrame, var_catalog: pd.DataFrame) -> pd.DataFrame:
    path = config.MONITORING / "device_observations.csv"
    df = pd.read_csv(path, parse_dates=["timestamp"])
    df = df.rename(columns={
        "device_observation_id": "record_id", "timestamp": "event_datetime",
        "unit": "raw_unit", "value": "raw_value",
    })
    df["available_datetime"] = df["event_datetime"]
    df["quality_state"] = "OK"  # estas filas SON la señal de calidad (SIGNAL_QUALITY_INDEX)
    df["facility_id"] = pd.NA
    df["source_file"] = "03_monitoring/device_observations.csv"
    df["is_duplicate"] = False
    df = _convert_units(df, units)
    df = _attach_catalog(df, var_catalog)
    return df[CANONICAL_COLUMNS]


def load_laboratory_results(units: pd.DataFrame, var_catalog: pd.DataFrame) -> pd.DataFrame:
    path = config.CLINICAL / "laboratory_results.csv"
    df = pd.read_csv(path, parse_dates=["sample_datetime", "result_datetime"])
    df = df.rename(columns={
        "lab_result_id": "record_id", "sample_datetime": "event_datetime",
        "result_datetime": "available_datetime", "test_code": "variable_code",
        "unit": "raw_unit", "result_value": "raw_value", "quality_flag": "quality_state",
    })
    df["device_id"] = pd.NA
    df["source_file"] = "02_clinical/laboratory_results.csv"
    df["is_duplicate"] = False
    df = _convert_units(df, units)
    df = _attach_catalog(df, var_catalog)
    return df[CANONICAL_COLUMNS]


def build_canonical_events() -> pd.DataFrame:
    units = _load_units_catalog()
    var_catalog = _load_variable_catalog()
    parts = [
        load_vital_signs(units, var_catalog),
        load_wearable(units, var_catalog),
        load_device_observations(units, var_catalog),
        load_laboratory_results(units, var_catalog),
    ]
    events = pd.concat(parts, ignore_index=True)
    events["raw_value"] = events["raw_value"].astype(str)
    events["event_datetime"] = pd.to_datetime(events["event_datetime"])
    events["available_datetime"] = pd.to_datetime(events["available_datetime"])

    # Invariante dura: ninguna evidencia puede estar disponible antes de ocurrir.
    bad = events["available_datetime"] < events["event_datetime"]
    if bad.any():
        raise ValueError(f"{bad.sum()} filas con available_datetime < event_datetime")

    return events


if __name__ == "__main__":
    ev = build_canonical_events()
    print(ev.shape)
    print(ev["domain"].value_counts())
    print(ev["is_duplicate"].value_counts())
    ev.to_parquet(config.CACHE_DIR / "canonical_events.parquet", index=False)
    print("guardado en", config.CACHE_DIR / "canonical_events.parquet")
