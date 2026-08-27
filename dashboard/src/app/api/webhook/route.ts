import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.RISA_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook no configurado" }, { status: 503 });
  if (req.headers.get("x-risa-webhook-secret") !== secret) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let event: { event_type?: unknown; event_id?: unknown };
  try {
    event = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof event.event_type !== "string" || event.event_type.length === 0 || event.event_type.length > 80) {
    return NextResponse.json({ error: "event_type requerido" }, { status: 400 });
  }
  return NextResponse.json({ accepted: true, event_id: typeof event.event_id === "string" ? event.event_id : null, message: "Evento validado. Configura persistencia para incorporarlo a la cola en tiempo real." }, { status: 202 });
}
