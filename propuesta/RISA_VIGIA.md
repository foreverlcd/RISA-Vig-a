# RISA Vigía

Motor de evidencia convergente para priorización temprana, calibrada y explicable de señales de riesgo en salud — propuesta para HealthSignal LATAM (reto RISA).

Versión: definitiva para construcción. No se modifica el enfoque, solo se detalla.

---

## 1. Idea central (una frase)

En vez de comparar cada dato contra un rango fijo ("¿está fuera de lo normal?"), el sistema aprende **qué es normal para cada paciente específico**, y solo genera una alerta cuando **varias señales se mueven mal a la vez y se mantienen así**, nunca por un valor aislado.

Esto responde directamente a la restricción central del reto: **prohibido usar umbrales estáticos**. Aquí no existe ningún "si HR > 100 → alerta". Todo pasa primero por normalización personal, y el riesgo emerge de la combinación de evidencia, no de un punto de corte.

---

## 2. Problemas del reto que resuelve

| Problema del reto | Cómo lo resuelve RISA Vigía |
|---|---|
| Fragmentación e interoperabilidad | Modelo canónico de eventos: todas las fuentes (labs, vitales, wearables, dispositivos, medicamentos, contexto) se transforman a una misma tabla larga, preservando de dónde vino cada dato. |
| Heterogeneidad y calidad de datos | Normalización de unidades, deduplicación de retransmisiones, y la calidad (`quality_flag`, `signal_quality`) se trata como **confianza**, nunca como riesgo. |
| Análisis temporal y multivariable | Línea base personal + ventanas de tendencia/persistencia + combinación de varias variables a la vez. |
| Saturación de alertas / falsas alertas | Persistencia mínima, histéresis, fusión de episodios repetidos, amortiguación por contexto (actividad, sueño). |
| Explicabilidad y trazabilidad | La fórmula de fusión de evidencia **es** la estructura de `evidence.csv` — no hay que reconstruir la explicación después, sale directo del cálculo. |
| No diagnóstico autónomo | Toda salida es score + evidencia + explicación, nunca una afirmación clínica. |

---

## 3. Datos que usa (dataset real `RISA_DATA_V1_0`)

Todas las fuentes se transforman a un modelo canónico único:

```
patient_id | encounter_id | source_file | record_id | variable_code
value | canonical_unit | event_datetime | available_datetime
quality_state | facility_id | device_id
```

### Regla de tiempo por fuente (evita usar información que "aún no existía")

| Fuente | `event_datetime` | `available_datetime` | Por qué |
|---|---|---|---|
| `laboratory_results.csv` | `sample_datetime` | `result_datetime` | El resultado tarda entre 30 y 360 min en estar disponible |
| `vital_signs.csv` | `timestamp` | `timestamp` | Gateway de monitoreo continuo, latencia casi nula |
| `wearable_observations.csv` | `timestamp` | `sync_datetime` | El wearable sincroniza después de medir |
| `device_observations.csv` | `timestamp` | `timestamp` | Igual criterio que monitoreo continuo |
| `conditions.csv` | `onset_date` | `recorded_datetime` | Antecedente vs. momento en que se registra |
| `medication_administrations.csv` | `start_datetime` | `start_datetime` | Latencia baja (fuente EHR) |

**Regla dura:** para decidir en el instante T, solo se puede usar evidencia con `available_datetime ≤ T`. Se valida automáticamente con una prueba (0 violaciones permitidas).

### Fuentes moduladoras (no se evalúan como "riesgo", ajustan la interpretación)
- `patient_context.csv` (sueño, actividad, recuperación) → puede explicar un cambio fisiológico.
- `connectivity_events.csv` → ajusta **confianza**, no riesgo (dato faltante ≠ paciente sano).
- `healthcare_facilities.csv`, `devices.csv` → confiabilidad de la fuente/sede.
- `patients.csv` (edad, `baseline_risk_profile`, `enrollment_date`) → usado solo para el arranque en frío de pacientes nuevos con poca historia.

---

## 4. Cómo se calcula el riesgo (el corazón de la propuesta)

### Paso 1 — Línea base personal
Por cada paciente y cada variable (FC, RR, SpO2, temperatura, presión, etc.) se calcula una línea base robusta (mediana + variación típica) usando **su propio historial**, no un rango poblacional.
- Paciente nuevo con poca historia → se usa un valor de arranque por grupo similar (edad, perfil de riesgo), que se va reemplazando por la línea base real del paciente a medida que llegan más datos.

### Paso 2 — Features por ventana de tiempo
Para cada variable y ventana temporal se calcula, todo normalizado entre 0 y 1:
- **Desviación** respecto a la línea base personal.
- **Tendencia** (¿va empeorando o es ruido?).
- **Persistencia** (¿se mantiene en varias mediciones o fue un pico aislado?).
- **Concordancia multivariable** (¿cuántas variables distintas se mueven mal al mismo tiempo?, normalizado por las fuentes que ese paciente realmente tiene disponibles, para no castigar a quien tiene menos dispositivos).
- **Contexto**: si hay actividad física o sueño que explique el cambio, se resta importancia.

### Paso 3 — Fusión de evidencia (noisy-OR)
Cada variable con evidencia anómala se combina con esta fórmula (estándar en razonamiento probabilístico, no inventada):

```
P(riesgo) = 1 − (1 − w₁·e₁) × (1 − w₂·e₂) × (1 − w₃·e₃) × ...
```

- `e_i` = qué tan anómala se ve esa variable (0 a 1).
- `w_i` = qué tan confiable es esa variable como indicador (0 a 1), tomado de `variable_catalog.csv` (campo `analysis_role`: variables tipo `MULTISOURCE` pesan distinto que `CONTEXT`), y luego calibrado contra escenarios de prueba, no elegido "a ojo".

**Ejemplo concreto** (FC subiendo, RR subiendo un poco, SpO2 casi normal):

| Variable | evidencia (e) | peso (w) |
|---|---|---|
| HR | 0.6 | 0.8 |
| RR | 0.4 | 0.7 |
| SpO2 | 0.1 | 0.8 |

```
P(riesgo) = 1 − (0.52 × 0.72 × 0.92) = 1 − 0.344 = 0.656
```

Ninguna variable sola era alarmante, pero combinadas dan 65.6%. Si solo hubiera subido la FC, el riesgo sería 48%. Esto reproduce exactamente lo que pide el reto: *"un cambio moderado simultáneo en varias variables puede ser más relevante que un único valor extremo"*, sin necesitar una regla escrita a mano para ese caso.

### Paso 4 — Score de confianza (separado del riesgo)
```
confianza = cobertura de datos × calidad promedio × frescura × acuerdo entre fuentes
```
Se reporta aparte (`confidence_score`, campo opcional del esquema oficial). Así se evita el error típico: tratar "no hay datos" como "no hay riesgo", o un dato de mala calidad como si fuera crítico.

### Paso 5 — Control de falsas alertas
- Persistencia mínima en 2+ ventanas antes de subir de prioridad.
- Histéresis: no sube y baja de nivel por una sola medición ruidosa.
- Episodios repetidos del mismo patrón se fusionan en una sola señal, no se duplican.
- Avisos de conectividad/calidad de datos quedan **fuera** de `signals.csv` (son un panel operativo aparte) para no mezclar "problema de infraestructura" con "señal de riesgo del paciente".

---

## 5. Explicabilidad (por diseño, no como paso extra)

Cada término `w_i·e_i` de la fórmula noisy-OR es literalmente una fila de `evidence.csv`:
- El término más grande → `evidence_role = PRIMARY`.
- Los demás con aporte relevante → `SUPPORTING`.
- Contexto que amortiguó la señal → `CONTEXT`.
- Datos de calidad que afectaron la confianza → `QUALITY`.

Flujo de explicación:
1. Se arma automáticamente una explicación determinista y verificable ("qué pasó, con qué evidencia, por qué esa prioridad").
2. Un LLM local (Ollama, modelo pequeño) solo la redacta en lenguaje natural — nunca ve datos crudos, solo la tabla de evidencia ya calculada.
3. Antes de mostrarse, se valida que cada número que menciona el LLM exista en la evidencia real; si no, se descarta el texto del LLM y se usa la plantilla determinista. Esto evita que el LLM invente hechos, algo que la guía del reto prohíbe explícitamente.

---

## 6. Cómo se valida (sin Gold Standard oculto)

Como RISA no entrega etiquetas de riesgo, se construyen escenarios sintéticos propios inyectando patrones conocidos (deterioro progresivo, pico transitorio que se normaliza solo, cambio explicado por actividad, dato de mala calidad, laboratorio tardío, etc.), inspirados en los patrones descritos en el contexto oficial de RISA.

**Regla clave para que las métricas sean creíbles:** los escenarios se dividen en dos grupos.
- **Grupo de ajuste (dev):** se usa para calibrar pesos y los cortes de LOW/MEDIUM/HIGH/CRITICAL.
- **Grupo de prueba (test):** nunca se toca durante el ajuste, solo se usa al final para reportar las métricas del pitch.

Sin esta separación, las métricas que se muestran en la demo estarían "hechas a la medida" del propio sistema de prueba — un error fácil de cometer y fácil de detectar por el jurado.

Métricas a reportar: recall por tipo de escenario inyectado, tasa de falsas alertas sobre controles negativos, tiempo hasta detección en deterioro progresivo, % de señales con evidencia completa (objetivo 100%), violaciones de temporalidad (objetivo 0).

---

## 7. Tecnologías

**Núcleo (obligatorio, tiene que funcionar de punta a punta):**
- Python + Polars/DuckDB + Parquet → pipeline RAW → CLEAN → FEATURES → SIGNALS, auditable por capas.
- `pandera`/`pydantic` → contratos de esquema (el dataset es "candidato no congelado", puede cambiar).
- `scikit-learn` (regresión isotónica) → calibración del score, no umbrales inventados.
- `pytest` → pruebas automáticas de invariantes (0 violaciones de temporalidad, 0 duplicados).
- **Supabase (Postgres)** → almacenamiento + API + tiempo real, sin construir auth/backend desde cero.
- **Next.js/React** → un único dashboard: cola priorizada, timeline del paciente con su línea base, y detalle de evidencia por alerta.
- **LLM local (Ollama)** → solo para redactar explicaciones, con validación anti-alucinación.

**Opcional / mejora de demo (no afecta el puntaje técnico si se deja fuera):**
- Replay en vivo del timeline vía WebSocket, para mostrar la evolución de una señal en tiempo real durante el pitch.
- ESP32/Pico simulando dispositivos, únicamente si sobra tiempo al final — no es parte del núcleo evaluado.

---

## 8. Arquitectura (resumen visual)

```
RISA Data V1.0 (CSV inmutables)
        │
        ▼
Ingesta + contratos de esquema + mapeo event/available_datetime por fuente
        │
        ▼
CLEAN: normalización de unidades, dedupe de retransmisiones, quality_state
        │
        ▼
Línea base personal por paciente × variable (arranque en frío por grupo similar)
        │
        ▼
Features normalizadas [0,1]: desviación · tendencia · persistencia ·
concordancia multivariable · contexto
        │
        ▼
FUSOR noisy-OR calibrado → risk_score + priority_level
        │                → confidence_score (aparte)
        │                → evidence.csv (mismo cálculo, no un paso extra)
        ▼
signals.csv + evidence.csv (validados con validate_submission.py)
        │
        ▼
Supabase (Postgres+RLS) ──Realtime──▶ Next.js/React (dashboard)
        │
        └── explicación determinista ──▶ LLM local (validado) ──▶ texto final
```

---

## 9. Roadmap de construcción

1. **Contratos y mapeo temporal** — validar esquemas, definir `event_datetime`/`available_datetime` por fuente, reporte de calidad inicial.
2. **Capa limpia + línea base personal** — normalización de unidades, dedupe, baseline robusto con arranque en frío.
3. **Features + fusor noisy-OR** — features normalizadas, banco de escenarios sintéticos dividido en dev/test desde este punto.
4. **Calibración + control de falsas alertas** — pesos y cortes de prioridad calibrados contra el dev set, histéresis, fusión de episodios.
5. **Entregables oficiales** — `signals.csv`, `evidence.csv`, validador oficial, explicación determinista + LLM local.
6. **Dashboard + métricas finales** — Next.js/Supabase, métricas reportadas sobre el test set nunca tocado en la calibración.
7. **(Opcional, si sobra tiempo)** — mejora visual de la demo (replay en vivo, hardware).

---

## 10. Lo que hay que poder responder si el jurado pregunta

- **¿Por qué esos pesos?** → Vienen de `variable_catalog.analysis_role` (campo oficial del dataset) y se calibran contra escenarios de prueba, no se eligen a mano.
- **¿Por qué eso no es un umbral disfrazado?** → El corte final se aplica sobre un score ya calibrado que combina múltiples variables en el tiempo, no sobre el valor crudo de una sola variable.
- **¿Cómo evitan fuga temporal?** → Regla explícita `available_datetime ≤ decision_datetime`, verificada con pruebas automáticas.
- **¿Qué pasa si el LLM se cae o inventa algo?** → Existe una explicación determinista de respaldo; el texto del LLM se descarta si menciona algo que no está en la evidencia real.
- **¿Qué pasa con pacientes con pocos datos?** → La confianza baja (lo dice `confidence_score`), pero no se les penaliza estructuralmente el riesgo por tener menos fuentes.
