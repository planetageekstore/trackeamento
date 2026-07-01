import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { encryptSecret } from "@/server/crypto";

function workerFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = process.env.WORKER_URL;
  const token = process.env.WORKER_SHARED_TOKEN;
  if (!base || !token) throw new Error("WORKER_URL/WORKER_SHARED_TOKEN não configurados");
  return fetch(`${base.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...init?.headers },
  });
}

/**
 * Provisiona/reconecta a instância de WhatsApp do tenant (via worker) e
 * persiste `whatsapp_instance` com a apikey cifrada. Retorna o QR para o painel.
 */
export async function connectWhatsApp(tenantId: string): Promise<{ qr: string | null }> {
  const res = await workerFetch("/instances", {
    method: "POST",
    body: JSON.stringify({ tenantId }),
  });
  if (!res.ok) throw new Error(`worker /instances => ${res.status}`);
  const data = (await res.json()) as { instanceName: string; apikey: string | null; qr: string | null };

  const supabase = createSupabaseServiceClient();
  const row: Record<string, unknown> = {
    tenant_id: tenantId,
    instance_name: data.instanceName,
    status: "connecting",
  };
  if (data.apikey) row.apikey_enc = await encryptSecret(data.apikey);

  await supabase.from("whatsapp_instance").upsert(row, { onConflict: "tenant_id" });
  return { qr: data.qr };
}

/** Consulta o estado da conexão (via worker) e atualiza o registro. */
export async function whatsappStatus(tenantId: string): Promise<string> {
  const res = await workerFetch(`/instances/${tenantId}/state`);
  if (!res.ok) throw new Error(`worker /state => ${res.status}`);
  const { state } = (await res.json()) as { state: string };

  const supabase = createSupabaseServiceClient();
  await supabase
    .from("whatsapp_instance")
    .update({ status: state, last_seen_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  return state;
}
