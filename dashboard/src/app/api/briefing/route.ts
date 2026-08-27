import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const envModel = process.env.OPENROUTER_MODEL;
const MODEL = envModel && envModel.includes("/") ? envModel : DEFAULT_MODEL;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY no configurada" }, { status: 501 });

  let body: { urgent?: unknown; high?: unknown; monitored?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  if (![body.urgent, body.high, body.monitored].every((value) => Number.isInteger(value) && Number(value) >= 0)) {
    return NextResponse.json({ error: "resumen inválido" }, { status: 400 });
  }

  const prompt = `Hay ${body.urgent} casos urgentes y ${body.high} casos altos en una población monitoreada. Redacta un briefing de turno de exactamente dos frases, sin usar cifras, nombres de pacientes, diagnósticos ni recomendaciones clínicas. Indica que se debe revisar primero la cola urgente y confirmar la evidencia con juicio clínico.`;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "RISA Vigia" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 100,
        messages: [
          { role: "system", content: "Eres un asistente de organización de turno clínico. No diagnosticas, no das tratamiento y no inventas datos. Solo redactas el resumen que ya fue determinado por un sistema externo." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ error: `OpenRouter ${response.status}` }, { status: 502 });
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return NextResponse.json({ error: "respuesta vacía" }, { status: 502 });
    return NextResponse.json({ text, model: MODEL });
  } catch {
    return NextResponse.json({ error: "fallo de red" }, { status: 502 });
  }
}
