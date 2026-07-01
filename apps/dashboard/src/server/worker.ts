import "server-only";

/** Pede ao worker para enfileirar o envio server-side de uma conversão (US5). */
export async function enqueueDispatch(eventId: string): Promise<void> {
  const base = process.env.WORKER_URL;
  const token = process.env.WORKER_SHARED_TOKEN;
  if (!base || !token) return; // dispatch é best-effort; sem worker, ignora
  try {
    await fetch(`${base.replace(/\/$/, "")}/dispatch`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventId }),
    });
  } catch {
    /* best-effort */
  }
}
