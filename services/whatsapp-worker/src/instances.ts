import { createInstance, connect, connectionState } from "./evolution/client.js";
import { env } from "./supabase.js";

/** Nome canônico da instância Evolution de um tenant. */
export function instanceNameFor(tenantId: string): string {
  return `tenant_${tenantId.replace(/-/g, "").slice(0, 20)}`;
}

export interface ProvisionResult {
  instanceName: string;
  apikey: string | null;
  qr: string | null;
}

/** Cria a instância (idempotente do lado da Evolution) e devolve o QR + apikey. */
export async function provisionInstance(tenantId: string): Promise<ProvisionResult> {
  const instanceName = instanceNameFor(tenantId);
  const webhookUrl = `${env.WORKER_PUBLIC_URL.replace(/\/$/, "")}/webhooks/evolution?token=${encodeURIComponent(env.WEBHOOK_SHARED_TOKEN)}`;

  let apikey: string | null = null;
  let qr: string | null = null;
  try {
    const created = await createInstance(instanceName, webhookUrl);
    apikey = typeof created.hash === "string" ? created.hash : (created.hash?.apikey ?? null);
    qr = created.qrcode?.base64 ?? null;
  } catch {
    // Já existe → apenas reconecta para obter novo QR.
  }
  if (!qr) {
    const c = await connect(instanceName);
    qr = c.base64 ?? null;
  }
  return { instanceName, apikey, qr };
}

/** Estado atual da conexão da instância do tenant. */
export async function instanceState(tenantId: string): Promise<string> {
  const state = await connectionState(instanceNameFor(tenantId));
  return state.instance?.state ?? "close";
}
