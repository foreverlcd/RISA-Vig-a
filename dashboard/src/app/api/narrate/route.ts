import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface FactorInput {
  name: string;
  direction: string;
  timing: string;
  percent: number;
}

interface NarrateRequest {
  patient_id: string;
  priority_label: string;
  risk_score: number;
  factors: FactorInput[];
}

const DEFAULT_MODEL = "openai/gpt-4o-mini";
// OpenRouter model IDs are always "proveedor/modelo" -- si la variable de
// entorno no tiene esa forma (p.ej. quedó mal configurada en el panel de
// Vercel con el nombre de la variable en vez de su valor), se ignora en
// lugar de mandarla tal cual y romper todas las llamadas.
const envModel = process.env.OPENROUTER_MODEL;
const MODEL = envModel && envModel.includes("/") ? envModel : DEFAULT_MODEL;

function buildPrompt(body: NarrateRequest): string {
  const lines = body.factors.map(
    (f) => `- ${f.name}: ${f.direction}, ${f.timing} (aporta ${f.percent}% del riesgo total)`
  );
  return [
    `Paciente: ${body.patient_id}`,
    `Nivel de riesgo ya calculado: ${body.priority_label} (score ${body.risk_score.toFixed(2)} sobre 1)`,
    `Factores contribuyentes (ya calculados por el sistema, en orden de peso):`,
    ...lines,
  ].join("\n");
}

// Grounding check: cada número que aparece en el texto generado debe poder
// rastrearse a un número que ya le dimos al modelo (porcentajes o el score).
// Si inventa un número que no le pasamos, se rechaza el texto completo.
function isGrounded(text: string, body: NarrateRequest): boolean {
  const known = new Set<string>();
  known.add(Math.round(body.risk_score * 100).toString());
  for (const f of body.factors) known.add(Math.round(f.percent).toString());

  const numbers = text.match(/\d+/g) || [];
  for (const n of numbers) {
    const val = parseInt(n, 10);
    if (val <= 1) continue; // "1 variable", "2 factores" etc, no es un dato inventado
    const asString = val.toString();
    const closeMatch = [...known].some((k) => Math.abs(parseInt(k, 10) - val) <= 2);
    if (!closeMatch && !known.has(asString)) return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY no configurada en el servidor" }, { status: 501 });
  }

  let body: NarrateRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  if (!body.patient_id || !Array.isArray(body.factors)) {
    return NextResponse.json({ error: "faltan campos" }, { status: 400 });
  }

  const prompt = buildPrompt(body);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://risa-vigia.vercel.app",
        "X-Title": "RISA Vigia",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content:
              "Redactas explicaciones clínicas breves de apoyo a la decisión, en español, a partir de evidencia YA CALCULADA por un sistema estadístico externo. Reglas estrictas: (1) usa SOLO los datos que se te dan, nunca inventes cifras, variables o hallazgos nuevos; (2) 2-3 frases, tono profesional y natural, sin jerga técnica ni fórmulas; (3) nunca emitas un diagnóstico, solo describe el patrón observado; (4) no repitas los porcentajes exactos como una lista, intégralos en la prosa de forma natural.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `OpenRouter ${res.status}: ${errText.slice(0, 200)}` }, { status: 502 });
    }

    const data = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return NextResponse.json({ error: "respuesta vacía del modelo" }, { status: 502 });
    }

    if (!isGrounded(text, body)) {
      return NextResponse.json({ error: "respuesta descartada: mencionó datos no verificables", rejected: true }, { status: 422 });
    }

    return NextResponse.json({ text, model: MODEL });
  } catch (e) {
    return NextResponse.json({ error: `fallo de red: ${String(e)}` }, { status: 502 });
  }
}
