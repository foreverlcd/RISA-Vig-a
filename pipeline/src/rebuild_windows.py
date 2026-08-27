"""Reconstruye windowed_features.parquet desde raw_evidence.parquet ya calculado
(evita repetir el cálculo costoso de baseline cuando solo cambia la regla de
ventaneo). Ver baseline_features.build_windowed_features."""
from __future__ import annotations

import pandas as pd

from . import config
from .baseline_features import build_windowed_features

if __name__ == "__main__":
    raw = pd.read_parquet(config.CACHE_DIR / "raw_evidence.parquet")
    var_catalog = pd.read_csv(config.METADATA / "variable_catalog.csv")
    raw = raw.merge(var_catalog[["variable_code", "analysis_role"]], on="variable_code", how="left")

    features = build_windowed_features(raw)
    print("window-level feature rows:", len(features))
    features.to_parquet(config.CACHE_DIR / "windowed_features.parquet", index=False)
    print("guardado en", config.CACHE_DIR / "windowed_features.parquet")
