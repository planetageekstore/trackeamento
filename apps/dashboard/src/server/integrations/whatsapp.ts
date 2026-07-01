import "server-only";

function workerFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = process.env.WORKER_URL;
  const token = process.env.WORKER_SHARED_TOKEN;
  if (!base || !token) throw new Error("WORKER_URL/WORKER_SHARED_TOKEN não configurados");
  return fetch(`${base.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...init?.headers },
  });
}

export interface WhatsappState {
  qr: string | null;
  state: string;
}

/** Conecta/retoma a sessão de WhatsApp do tenant (via worker Baileys). */
export async function connectWhatsApp(tenantId: string): Promise<WhatsappState> {
  const res = await workerFetch("/instances", {
    method: "POST",
    body: JSON.stringify({ tenantId }),
  });
  if (!res.ok) throw new Error(`worker /instances => ${res.status}`);
  return (await res.json()) as WhatsappState;
}

/** Consulta o estado atual (QR/conexão) da sessão. */
export async function whatsappStatus(tenantId: string): Promise<WhatsappState> {
  const res = await workerFetch(`/instances/${tenantId}/state`);
  if (!res.ok) throw new Error(`worker /state => ${res.status}`);
  return (await res.json()) as WhatsappState;
}
