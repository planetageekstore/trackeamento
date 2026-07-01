import { env } from "../supabase.js";

const BASE = env.EVOLUTION_API_URL.replace(/\/$/, "");

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", apikey: env.EVOLUTION_API_KEY, ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`Evolution ${path} => ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface CreateInstanceResult {
  instance?: { instanceName: string };
  hash?: string | { apikey?: string };
  qrcode?: { base64?: string; code?: string };
}

/**
 * Cria (ou reusa) uma instância Evolution para o tenant e registra o webhook
 * de mensagens de entrada apontando para este worker.
 */
export function createInstance(instanceName: string, webhookUrl: string) {
  return call<CreateInstanceResult>("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: {
        url: webhookUrl,
        byEvents: false,
        events: ["MESSAGES_UPSERT"],
      },
    }),
  });
}

export interface ConnectResult {
  base64?: string; // QR em data-uri
  code?: string;
}

/** Retorna o QR code para o cliente escanear. */
export function connect(instanceName: string) {
  return call<ConnectResult>(`/instance/connect/${encodeURIComponent(instanceName)}`);
}

export interface ConnectionState {
  instance?: { state?: string };
}

/** Estado atual da conexão (`open` quando conectado). */
export function connectionState(instanceName: string) {
  return call<ConnectionState>(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
}
