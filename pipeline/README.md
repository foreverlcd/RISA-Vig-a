# RISA Vigía — pipeline

Implementación del motor descrito en [`propuesta/RISA_VIGIA.md`](../propuesta/RISA_VIGIA.md).

## Cómo correrlo

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt

# 1. Ingesta canónica (vital_signs, wearables, device_observations, labs)
./.venv/bin/python -m src.canonical

# 2. Línea base personal + features por ventana (tarda ~5 min: 1.9M observaciones)
./.venv/bin/python -m src.baseline_features

# 3. Fusión noisy-OR por ventana
./.venv/bin/python -m src.fusion

# 4. Persistencia/histéresis -> episodios -> señales
./.venv/bin/python -m src.generate_signals

# 5. Escribe results/signals.csv y results/evidence.csv
./.venv/bin/python -m src.output_writer

# 6. Validación
./.venv/bin/python -m pytest tests/ -v
./.venv/bin/python "../Participantes Salud/02_KIT_ENTREGA/validate_submission.py" results --risa "../Participantes Salud/01_RISA_DATA_V1_0"
```

Si solo cambia la regla de ventaneo (no la línea base), `src/rebuild_windows.py`
reconstruye `windowed_features.parquet` desde el cache de `raw_evidence.parquet`
sin repetir el paso costoso.

## Estado actual (última corrida completa)

- 2,536,442 eventos canónicos ingeridos (vitales, wearables, dispositivos, labs).
- 1,925,539 observaciones fusionables (excluye retransmisiones y no-numéricas).
- 357,826 ventanas de 3h paciente×variable.
- 2,573 episodios persistentes (2+ ventanas consecutivas por encima del umbral de entrada).
- `signals.csv` (2,573 filas) + `evidence.csv` (60,385 filas) → **VALID SUBMISSION FORMAT**, 0 errores.
- 6/6 pruebas de invariantes pasan (`tests/test_invariants.py`): 0 fugas temporales,
  toda señal tiene evidencia enlazada, scores en [0,1].

## Calibración (banco de escenarios sintéticos)

`src/synthetic_scenarios.py` genera 10 pacientes inventados con patrón conocido
de antemano (5 "dev" para ajustar, 5 "test" held-out para reportar) y los corre
por las MISMAS funciones que procesan los datos reales de RISA. Resultado con
los cortes actuales (`ENTER_CUT=0.30`, `EXIT_CUT=0.18`, persistencia >=2 ventanas,
`PRIORITY_CUTS` en `fusion.py`): **10/10 correctos** (5/5 dev, 5/5 test), incluyendo
dos casos donde el riesgo cruzó momentáneamente el umbral de entrada pero la
histéresis lo filtró correctamente por no persistir. Protegido en
`tests/test_calibration.py` — si se toca `fusion.py`/`generate_signals.py` y esto
se rompe, hay que revisar el cambio, no solo re-ajustar el número.

Limitación conocida: solo 10 escenarios, generados con una única semilla aleatoria
y sin variar la magnitud del ruido de fondo. Suficiente para un MVP de un día;
antes de reportar recall/falsos-positivos como métrica "seria" del reto conviene
ampliar el banco (más semillas, más variantes de magnitud) y, si el margen entre
positivos y negativos se estrecha, pasar a calibración por regresión isotónica
en lugar de cortes fijos elegidos a mano.

## Otras simplificaciones conocidas de esta versión (documentadas, no ocultas)

1. **Prior poblacional de arranque en frío** (`baseline_features.py`) se calcula sobre
   todo el dataset, no de forma leakage-free variable por variable. Aceptable como
   prior de fondo, no como variable de decisión por paciente.
2. **`conditions.csv` y `medication_administrations.csv`** se documentaron en el
   mapeo temporal pero no se ingirieron aún — quedan fuera de la fusión de esta
   versión, ver `canonical.py`.
3. **Tasa de episodios** (~2.5 por paciente en 9 días) ya se validó contra 5
   escenarios negativos sintéticos (ver sección de calibración arriba), pero no
   contra los casos reales del dataset uno por uno — sigue siendo posible que
   algunos de los 2,573 episodios reales sean falsos positivos que el banco
   sintético, por ser pequeño, no alcanza a capturar.
