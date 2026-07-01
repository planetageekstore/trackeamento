// Supabase Edge Function (Deno) — dispara a importação de custos diariamente.
// Agende via cron (ex.: dashboard do Supabase → Schedules, a cada 6h).
// É um shim: chama a rota do dashboard que concentra a lógica (single source).

Deno.serve(async () => {
  const appUrl = Deno.env.get("APP_URL");
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!appUrl || !cronSecret) {
    return new Response(JSON.stringify({ error: "APP_URL/CRON_SECRET ausentes" }), { status: 500 });
  }

  const res = await fetch(`${appUrl}/api/cron/import-costs`, {
    method: "POST",
    headers: { authorization: `Bearer ${cronSecret}` },
  });

  const body = await res.text();
  return new Response(body, { status: res.status, headers: { "content-type": "application/json" } });
});
