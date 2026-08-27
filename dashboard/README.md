# RISA Vigía — dashboard

Panel para revisar las señales generadas por [`pipeline/`](../pipeline).
Sin backend externo: lee un JSON estático exportado del pipeline, nada de
cuentas ni credenciales que configurar.

## Cómo correrlo en local

```bash
# 1. Genera/actualiza results/signals.csv y results/evidence.csv (ver pipeline/README.md)

# 2. Exporta esos resultados al JSON que consume el dashboard
cd ../pipeline
./.venv/bin/python -m src.export_dashboard_json   # escribe dashboard/public/data.json

# 3. Instala dependencias (una sola vez) y corre
cd ../dashboard
npm install
npm run dev      # http://localhost:3000
```

Para una build de producción local: `npm run build && npm run start`.

## Qué muestra

Diseñado para alguien sin trasfondo técnico (una enfermera/coordinador de
cuidado, no un ingeniero) — lenguaje plano por defecto, jerga técnica
(fórmula noisy-OR, eᵢ/wᵢ) escondida detrás de un "ver detalle técnico".

- **Pacientes a revisar** ("¿A quién reviso primero?"): tarjetas de nivel de
  riesgo (Urgente/Alto/Moderado/Bajo/Sin alerta) que funcionan como filtro
  con un clic, búsqueda por paciente, y cada fila con una frase resumen en
  vez de campos crudos.
- **Panel de detalle**, 4 pestañas: Resumen (gauge + frase resumen),
  Línea base (lo normal de ese paciente), Por qué (cada factor como frase,
  con barra de contribución; la fórmula técnica está oculta por defecto),
  e Historial (evolución del riesgo de ese paciente).
- **Sin alerta**: los pacientes que nunca cruzaron el umbral también se
  pueden explorar — se les muestra su línea base, no quedan "escondidos".
- **Tendencia general**: cuántas señales por día en todo el cohorte,
  coloreado por nivel — vista de conjunto, no solo por paciente.
- **Demo en vivo**: botón que simula señales llegando en tiempo real
  (toasts), útil para el pitch — no es una funcionalidad "real" de
  streaming, es un replay de datos ya calculados a ritmo acelerado.
- **Redactar con IA** (botón en la pestaña Resumen del detalle): manda la
  evidencia YA CALCULADA (nunca datos crudos) a un modelo vía OpenRouter
  para redactarla en prosa natural. Si la respuesta menciona un número que
  no coincide con ningún dato que se le dio, se descarta automáticamente
  (ver `src/app/api/narrate/route.ts`, función `isGrounded`). Sin
  `OPENROUTER_API_KEY` configurada, el botón falla con un mensaje claro y
  el resto del dashboard sigue funcionando igual — no es una dependencia dura.
- **Centro de operaciones**: concentra una ronda guiada, el asistente de
  enfermería virtual y el contrato del webhook. La ronda y el asistente ayudan
  a organizar y explicar la cola; nunca diagnostican ni ejecutan acciones sobre
  pacientes sin validación humana.

### Activar "Redactar con IA"

```bash
cp .env.local.example .env.local
# edita .env.local y pon tu clave de https://openrouter.ai/keys
npm run dev
```

En Vercel: **Project Settings → Environment Variables** → agrega
`OPENROUTER_API_KEY` (y opcionalmente `OPENROUTER_MODEL`), luego redeploy.

### Conectar un webhook

El dashboard expone `POST /api/webhook`. Para activarlo, agrega
`RISA_WEBHOOK_SECRET` en `.env.local` o en las variables de entorno de Vercel.
Cada llamada debe incluir el encabezado `x-risa-webhook-secret` y, como mínimo,
un cuerpo JSON como:

```json
{ "event_type": "signal.received", "event_id": "evt_123" }
```

El endpoint autentica y valida la recepción (`202 Accepted`). Este MVP **no
persiste ni inyecta** el evento en la cola mostrada: para eso se requiere una
base de datos o cola de mensajes y un proceso que regenere/actualice los datos.
Así se evita dar la falsa impresión de que un evento clínico ya fue procesado.

Verificado en navegador real (Playwright headless, luz y modo oscuro):
carga de datos, filtros, búsqueda, las 4 pestañas, el toggle técnico y el
modo demo, sin errores de consola.

## Diseño

Paleta y tipografía propias (Manrope + Public Sans + IBM Plex Mono),
definidas como tokens CSS en `globals.css` — no colores por defecto de
Tailwind. Ambos temas (claro/oscuro) están definidos explícitamente.

## Desplegar en Vercel

No necesita variables de entorno ni backend — es una app Next.js estándar
que sirve `public/data.json` como asset estático.

1. Sube el repo a GitHub (ver README raíz del proyecto).
2. En Vercel: **New Project** → importa el repo → **Root Directory: `dashboard`**
   (importante: el repo tiene varias carpetas, Vercel debe apuntar a esta).
3. Framework se detecta solo (Next.js). Deploy.

Para actualizar los datos en producción: regenera `public/data.json` en
local (paso 2 de arriba), commitea el archivo, y Vercel redespliega solo
con el push.

## Notas

- `public/data.json` (~26MB) **sí se versiona** a propósito, a diferencia
  de `pipeline/cache/` — es nuestro resultado derivado (señales sobre
  pacientes sintéticos), no el dataset crudo de RISA, y Vercel lo necesita
  en el repo porque no tiene acceso al pipeline de Python ni al dataset
  original para generarlo en el build.
- No usa Supabase ni ningún backend externo a propósito: evita depender de
  credenciales/cuentas. Si más adelante se quiere estado compartido entre
  viewers o ingestión en vivo real, ese es el punto natural para introducirlo.
