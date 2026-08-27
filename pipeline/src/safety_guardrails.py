"""Baranda de seguridad fisiológica para el arranque en frío.

La línea base personal es el motor principal de RISA Vigía. Esta capa no la
reemplaza: detecta que un paciente podría llegar ya gravemente alterado, caso
en el que su propio historial aún no basta para revelar el problema.

El perfil implementado reproduce los puntos de los parámetros disponibles de
NEWS2 Scale 1 para adultos. No cubre nivel de consciencia, oxígeno suplementario
ni la escala SpO2 2; por eso debe revisarse y aprobarse localmente antes de uso
clínico. La alerta sigue requiriendo persistencia entre ventanas, de modo que
una sola lectura extrema se trate como una medición que hay que confirmar, no
como una decisión automática.
"""
from __future__ import annotations

import math


SAFETY_FAMILY = {
    "HR": "HR",
    "WEARABLE_HR": "HR",  # no contar pulso de dos fuentes dos veces
    "RR": "RR",
    "SpO2": "SpO2",
    "SBP": "SBP",
    "TEMP": "TEMP",
}


def safety_family(variable_code: str) -> str | None:
    return SAFETY_FAMILY.get(variable_code)


def news2_scale_1_points(variable_code: str, value: float) -> int:
    """Puntaje NEWS2 Scale 1 de un parámetro disponible (0, 1, 2 o 3).

    Solo corresponde a adultos y SpO2 Scale 1. Los pacientes con objetivo de
    saturación 88–92%, embarazo, pediatría o protocolos locales distintos deben
    usar otro perfil, no estos cortes.
    """
    if value is None or not math.isfinite(float(value)):
        return 0
    value = float(value)
    family = safety_family(variable_code)
    if family == "RR":
        return 3 if value <= 8 or value >= 25 else 2 if value >= 21 else 1 if value <= 11 else 0
    if family == "SpO2":
        return 3 if value <= 91 else 2 if value <= 93 else 1 if value <= 95 else 0
    if family == "SBP":
        return 3 if value <= 90 or value >= 220 else 2 if value <= 100 else 1 if value <= 110 else 0
    if family == "HR":
        return 3 if value <= 40 or value >= 131 else 2 if value >= 111 else 1 if value <= 50 or value >= 91 else 0
    if family == "TEMP":
        return 3 if value <= 35 else 2 if value >= 39.1 else 1 if value <= 36 or value >= 38.1 else 0
    return 0


def risk_floor_from_safety_score(score: int) -> float:
    """Piso de prioridad, no una probabilidad clínica ni un diagnóstico."""
    if score >= 7:
        return 0.80  # revisión urgente
    if score >= 5:
        return 0.55  # revisión prioritaria
    if score >= 3:
        return 0.30  # vigilar y confirmar
    return 0.0
