# RISA Vigía

MVP para el reto HealthSignal LATAM (RISA): detección temprana de riesgo a partir
de datos heterogéneos de salud (historia clínica, laboratorio, signos vitales,
wearables), con priorización calibrada y explicable — sin depender únicamente
de umbrales estáticos.

Además de la línea base personal, la versión actual incorpora una **baranda de
seguridad universal** para el caso de arranque en frío: evita que un paciente
que ya entra muy alterado parezca “normal” solo por no tener historia previa.
Es un respaldo multiparámetro, no un diagnóstico ni un reemplazo del protocolo
clínico local; ver `pipeline/README.md` para sus límites de uso.

## Estructura del repo

- [`propuesta/RISA_VIGIA.md`](propuesta/RISA_VIGIA.md) — diseño completo de la solución:
  problema, modelo de datos, fórmula de fusión de riesgo (noisy-OR), control de
  falsas alertas, explicabilidad, arquitectura y roadmap.
- [`pipeline/`](pipeline/) — implementación real del motor (ingesta → línea base
  personal → fusión de evidencia → señales), con pruebas automáticas. Ver
  [`pipeline/README.md`](pipeline/README.md) para cómo correrlo y el estado actual.
- [`dashboard/`](dashboard/) — panel local (Next.js) para revisar las señales
  generadas: cola de priorización, filtros, y detalle de evidencia por señal.
  Ver [`dashboard/README.md`](dashboard/README.md).
- `Participantes Salud/` — dataset oficial del reto (RISA Data V1.0) y documentos
  del desafío. **No está en este repo** (ver abajo).

## Dataset

El dataset `Participantes Salud/01_RISA_DATA_V1_0` (~245MB, entregado por los
organizadores de HealthSignal LATAM) no se incluye en este repositorio —
contiene un CSV de 154MB (por encima del límite de GitHub) y es material
entregado específicamente a participantes del reto, no de redistribución libre.

Para correr el pipeline:
1. Consigue el paquete `RISA_DATA_V1.0` y el kit de entrega (`02_KIT_ENTREGA`)
   con tus credenciales de participante del hackathon.
2. Colócalo en `Participantes Salud/` respetando la estructura original
   (`01_RISA_DATA_V1_0/`, `02_KIT_ENTREGA/`, etc. — ver `pipeline/src/config.py`
   para las rutas exactas que espera el código).

## Estado

Ver [`pipeline/README.md`](pipeline/README.md) — pipeline núcleo funcional y
validado end-to-end (`VALID SUBMISSION FORMAT`, 8/8 pruebas automáticas
pasando, incluida calibración contra un banco de escenarios sintéticos).
