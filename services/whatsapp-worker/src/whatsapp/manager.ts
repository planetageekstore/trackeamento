import { createRequire } from "node:module";
import type { WASocket } from "@whiskeysockets/baileys";
import type { Boom } from "@hapi/boom";

// Baileys é CommonJS — carrega os valores via require (ver authState.ts).
const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = createRequire(
  import.meta.url,
)("@whiskeysockets/baileys");

// Versão atual do WhatsApp Web — sem ela o WA rejeita a conexão com 405.
let cachedVersion: number[] | undefined;
async function currentVersion(): Promise<number[] | undefined> {
  if (cachedVersion) return cachedVersion;
  try {
    const { version } = await fetchLatestBaileysVersion();
    cachedVersion = version as number[];
  } catch {
    cachedVersion = undefined; // usa o default do Baileys
  }
  return cachedVersion;
}
import QRCode from "qrcode";
import pino from "pino";
import { createLogger } from "@trk/shared";
import { supabase } from "../supabase.js";
import { useSupabaseAuthState } from "./authState.js";
import { attributeMessage } from "../attribution.js";
import { dispatchConversion } from "../ingest/dispatch.js";

const log = createLogger({ mod: "whatsapp/manager" });
const baileysLogger = pino({ level: "silent" });

type SessionState = "connecting" | "open" | "close";

interface Session {
  sock: WASocket;
  qr: string | null; // data-URI do QR
  state: SessionState;
  phone: string | null;
}

const sessions = new Map<string, Session>();

async function persistInstance(tenantId: string, status: string, phone: string | null): Promise<void> {
  await supabase()
    .from("whatsapp_instance")
    .upsert(
      {
        tenant_id: tenantId,
        instance_name: `wa_${tenantId.slice(0, 8)}`,
        status,
        phone_number: phone,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
}

/** Cria/retoma a sessão Baileys do tenant e devolve o QR (se precisar escanear). */
export async function connectTenant(tenantId: string): Promise<{ qr: string | null; state: SessionState }> {
  const existing = sessions.get(tenantId);
  if (existing && existing.state === "open") return { qr: null, state: "open" };
  if (existing) return { qr: existing.qr, state: existing.state };

  const { state, saveCreds, clear } = await useSupabaseAuthState(tenantId);
  const version = await currentVersion();
  const sock: WASocket = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    logger: baileysLogger,
    browser: ["Trackeamento", "Chrome", "1.0.0"],
    markOnlineOnConnect: false,
  });

  const session: Session = { sock, qr: null, state: "connecting", phone: null };
  sessions.set(tenantId, session);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) session.qr = await QRCode.toDataURL(qr);
    if (connection === "open") {
      session.state = "open";
      session.qr = null;
      session.phone = sock.user?.id?.split(":")[0] ?? null;
      await persistInstance(tenantId, "open", session.phone);
      log.info("whatsapp conectado", { tenantId, phone: session.phone });
    } else if (connection === "close") {
      const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      session.state = "close";
      sessions.delete(tenantId);
      if (code === DisconnectReason.loggedOut) {
        await clear();
        await persistInstance(tenantId, "close", null);
        log.info("whatsapp deslogado", { tenantId });
      } else {
        // reconexão automática (rede/queda) sem perder a sessão
        setTimeout(() => connectTenant(tenantId).catch(() => {}), 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      if (m.key.fromMe) continue;
      const jid = m.key.remoteJid ?? "";
      if (jid.endsWith("@g.us") || jid.endsWith("@broadcast")) continue; // ignora grupos/status
      const text = m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? "";
      const externalId = m.key.id ?? "";
      if (!text || !externalId) continue;
      try {
        const eventId = await attributeMessage(tenantId, { text, remoteJid: jid, externalId });
        if (eventId) await dispatchConversion(eventId).catch(() => {});
      } catch (err) {
        log.error("falha ao processar mensagem", { tenantId, err: String(err) });
      }
    }
  });

  // Aguarda brevemente o QR ser emitido.
  for (let i = 0; i < 20 && !session.qr && session.state === "connecting"; i++) {
    await new Promise((r) => setTimeout(r, 150));
  }
  return { qr: session.qr, state: session.state };
}

export function getSessionState(tenantId: string): { qr: string | null; state: SessionState } {
  const s = sessions.get(tenantId);
  return s ? { qr: s.qr, state: s.state } : { qr: null, state: "close" };
}

/** Retoma sessões já autenticadas ao subir o worker (evita re-scan de QR). */
export async function resumeSessions(): Promise<void> {
  const { data } = await supabase().from("whatsapp_session").select("tenant_id");
  for (const row of data ?? []) {
    connectTenant(row.tenant_id as string).catch((err) =>
      log.error("falha ao retomar sessão", { tenantId: row.tenant_id, err: String(err) }),
    );
  }
}
