from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = ROOT / "Participantes Salud" / "01_RISA_DATA_V1_0"
KIT_ROOT = ROOT / "Participantes Salud" / "02_KIT_ENTREGA"
RESULTS_DIR = ROOT / "pipeline" / "results"
CACHE_DIR = ROOT / "pipeline" / "cache"

MASTER = DATA_ROOT / "01_master"
CLINICAL = DATA_ROOT / "02_clinical"
MONITORING = DATA_ROOT / "03_monitoring"
CONTEXT = DATA_ROOT / "04_context"
METADATA = DATA_ROOT / "05_metadata"

RESULTS_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

MODEL_VERSION = "risa-vigia-0.2.0-safety-guardrail"

# Fusable physiological/lab variables (the ones the noisy-OR risk fusor consumes).
# STEPS / ACTIVITY_LEVEL / SLEEP_STATE / SIGNAL_QUALITY_INDEX are modulators, not
# fused directly as risk evidence (see propuesta/RISA_VIGIA.md, sec. 4).
FUSABLE_VARIABLES = {"HR", "RR", "SpO2", "TEMP", "SBP", "DBP", "WEARABLE_HR",
                      "LAB_A", "LAB_B", "LAB_C", "LAB_D"}

WINDOW_HOURS = 3
MIN_PERSONAL_OBS_FOR_BASELINE = 20

# Baranda complementaria para el arranque en frío. Es NEWS2 Scale 1 para
# adultos, con las limitaciones documentadas en safety_guardrails.py. No debe
# aplicarse a pediatría, embarazo o pacientes con objetivo SpO2 Scale 2 sin una
# política clínica específica aprobada.
UNIVERSAL_SAFETY_PROFILE = "NEWS2_ADULT_SCALE_1"
