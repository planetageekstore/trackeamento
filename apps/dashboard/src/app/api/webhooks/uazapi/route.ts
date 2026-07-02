import type { NextRequest } from "next/server";
import { createLogger } from "@trk/shared";
import { processWhatsappMessage } from "@/server/whatsappAttribution";
import { tenantByInstanceName } from "@/server/integrations/uazapi";

export const runtime = "nodejs";
const log = createLogger({ route: "webhooks/uazapi" });

// Extrai campos de forma tolerante (o formato exato do Uazapi é confirmado no 1º real).
type AnyObj = Record<string, unknown>;
function pick(obj: AnyObj, keys: string[]): unknown {
  for (const k of keys) {
    const v = k.split(".").reduce<unknown>((o, p) => (o as AnyObj)?.[p], obj);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function extractText(m: AnyObj): string {
  const t = pick(m, [
    "text",
    "body",
    "content",
    "message.text",
    "message.conversation",
    "message.extendedTextMessage.text",
    "message.body",
  ]);
  return typeof t === "string" ? t : "";
}

function extractPhone(m: AnyObj): string {
  const p = pick(m, ["sender", "from", "chatid", "number", "phone", "key.remoteJid", "jid"]);
  const s = typeof p === "string" ? p : "";
  return s.split("@")[0] ?? "";
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: AnyObj;
  try {
    body = (await req.json()) as AnyObj;
  } catch {
    return Response.json({ ok: true }, { status: 200 });
  }

  // Tenant: pelo query (?t=) ou pelo nome da instância no payload.
  let tenantId = req.nextUrl.searchParams.get("t");
  if (!tenantId) {
    const inst = pick(body, ["instance", "instanceName", "instance.name", "sender_instance"]);
    if (typeof inst === "string") tenantId = await tenantByInstanceName(inst);
  }
  if (!tenantId) {
    log.warn("webhook sem tenant", { keys: Object.keys(body) });
    return Response.json({ ok: true }, { status: 200 });
  }

  // Normaliza para uma lista de mensagens.
  const raw = pick(body, ["messages", "message", "data"]);
  const messages: AnyObj[] = Array.isArray(raw) ? (raw as AnyObj[]) : raw ? [raw as AnyObj] : [body];

  for (const m of messages) {
    const fromMe = Boolean(pick(m, ["fromMe", "fromme", "key.fromMe"]));
    if (fromMe) continue;
    const text = extractText(m);
    const phone = extractPhone(m);
    const id = pick(m, ["id", "messageid", "messageId", "key.id"]);
    if (!text || !phone || typeof id !== "string") continue;
    try {
      await processWhatsappMessage(tenantId, { text, rawPhone: phone, externalId: id });
    } catch (err) {
      log.error("falha ao processar msg uazapi", { err: String(err) });
    }
  }

  return Response.json({ ok: true }, { status: 200 });
}
