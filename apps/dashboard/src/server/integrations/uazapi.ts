import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { encryptSecret, decryptSecret } from "@/server/crypto";
import { getAppCredentials } from "@/server/appCredentials";

interface Instance {
  serverUrl: string;
  adminToken: string;
  token: string;
  name: string;
}

async function tenantConfig(
  tenantId: string,
): Promise<{ serverUrl: string; adminToken: string } | null> {
  const supabase = createSupabaseServiceClient();
  const { data: t } = await supabase.from("tenant").select("agency_id").eq("id", tenantId).maybeSingle();
  if (!t) return null;
  const { clientId, clientSecret } = await getAppCredentials(t.agency_id, "whatsapp");
  if (!clientId || !clientSecret) return null;
  return { serverUrl: clientId.replace(/\/$/, ""), adminToken: clientSecret };
}

function uaz(server: string, path: string, init: RequestInit): Promise<Response> {
  return fetch(`${server}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

/** Instância já criada do tenant (não cria). */
async function getInstance(tenantId: string): Promise<Instance | null> {
  const cfg = await tenantConfig(tenantId);
  if (!cfg) return null;
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("whatsapp_instance")
    .select("instance_name, apikey_enc")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data?.apikey_enc || !data.instance_name) return null;
  return {
    ...cfg,
    token: await decryptSecret(data.apikey_enc as string),
    name: data.instance_name as string,
  };
}

/** Instância do tenant, criando no Uazapi se ainda não existir. */
async function ensureInstance(tenantId: string): Promise<Instance | null> {
  const existing = await getInstance(tenantId);
  if (existing) return existing;
  const cfg = await tenantConfig(tenantId);
  if (!cfg) return null;

  const name = `trk_${tenantId.replace(/-/g, "").slice(0, 16)}`;
  const res = await uaz(cfg.serverUrl, "/instance/init", {
    method: "POST",
    headers: { admintoken: cfg.adminToken },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`uazapi init => ${res.status}`);
  const j = (await res.json()) as { token?: string; instance?: { token?: string } };
  const token = j.token ?? j.instance?.token;
  if (!token) throw new Error("uazapi init sem token");

  await createSupabaseServiceClient()
    .from("whatsapp_instance")
    .upsert(
      { tenant_id: tenantId, instance_name: name, apikey_enc: await encryptSecret(token), status: "connecting" },
      { onConflict: "tenant_id" },
    );
  return { ...cfg, token, name };
}

/** Conecta a instância, configura o webhook e retorna o QR. */
export async function connectWhatsApp(
  tenantId: string,
  webhookBase: string,
): Promise<{ qr: string | null; state: string }> {
  const inst = await ensureInstance(tenantId);
  if (!inst) throw new Error("Uazapi não configurado em Credenciais");

  // Configura o webhook de mensagens de entrada (best-effort).
  await uaz(inst.serverUrl, "/webhook", {
    method: "POST",
    headers: { token: inst.token },
    body: JSON.stringify({
      url: `${webhookBase}/api/webhooks/uazapi?t=${tenantId}`,
      events: ["messages"],
      excludeMessages: ["fromMe"],
      enabled: true,
    }),
  }).catch(() => {});

  const res = await uaz(inst.serverUrl, "/instance/connect", {
    method: "POST",
    headers: { token: inst.token },
    body: "{}",
  });
  const j = (await res.json()) as { instance?: Record<string, unknown> } & Record<string, unknown>;
  const i = (j.instance ?? j) as { qrcode?: string; status?: string };
  return { qr: i.qrcode || null, state: i.status ?? "connecting" };
}

/** Estado atual (via /instance/all filtrado pela instância do tenant). */
export async function whatsappStatus(tenantId: string): Promise<{ qr: string | null; state: string }> {
  const inst = await getInstance(tenantId);
  if (!inst) return { qr: null, state: "close" };

  const res = await uaz(inst.serverUrl, "/instance/all", {
    method: "GET",
    headers: { admintoken: inst.adminToken },
  });
  if (!res.ok) return { qr: null, state: "close" };
  const all = (await res.json()) as Array<{ name?: string; status?: string; qrcode?: string; owner?: string }>;
  const me = all.find((x) => x.name === inst.name);
  if (!me) return { qr: null, state: "close" };

  const state = me.status ?? "close";
  await createSupabaseServiceClient()
    .from("whatsapp_instance")
    .update({ status: state, phone_number: me.owner || null, last_seen_at: new Date().toISOString() })
    .eq("tenant_id", tenantId);
  return { qr: me.qrcode || null, state };
}

/** Desconecta e apaga a instância no Uazapi + limpa o registro. */
export async function disconnectWhatsApp(tenantId: string): Promise<void> {
  const inst = await getInstance(tenantId);
  if (inst) {
    await uaz(inst.serverUrl, "/instance", { method: "DELETE", headers: { token: inst.token } }).catch(() => {});
  }
  await createSupabaseServiceClient().from("whatsapp_instance").delete().eq("tenant_id", tenantId);
}

/** Resolve o tenant a partir do nome da instância (usado no webhook). */
export async function tenantByInstanceName(instanceName: string): Promise<string | null> {
  const { data } = await createSupabaseServiceClient()
    .from("whatsapp_instance")
    .select("tenant_id")
    .eq("instance_name", instanceName)
    .maybeSingle();
  return (data?.tenant_id as string) ?? null;
}
