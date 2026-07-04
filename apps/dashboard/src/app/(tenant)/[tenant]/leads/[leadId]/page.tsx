import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdCreative } from "@/server/integrations/meta";
import { fmtDateTime } from "@/lib/date";

export const dynamic = "force-dynamic";

interface JourneyItem {
  kind: "click" | "event";
  label: string;
  detail: string;
  at: string;
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ tenant: string; leadId: string }>;
}) {
  const { tenant, leadId } = await params;
  await requireUser();
  await assertTenantAccess(tenant);

  const supabase = await createSupabaseServerClient();
  const { data: lead } = await supabase
    .from("lead")
    .select(
      "tracking_code, name, phone, email, created_at, device_type, os, browser, screen, language, timezone, city, region, country",
    )
    .eq("id", leadId)
    .maybeSingle();

  const sessionRows: { label: string; value: string | null }[] = [
    { label: "Dispositivo", value: lead?.device_type ?? null },
    { label: "Sistema", value: lead?.os ?? null },
    { label: "Navegador", value: lead?.browser ?? null },
    { label: "Tela", value: lead?.screen ?? null },
    { label: "Idioma", value: lead?.language ?? null },
    { label: "Fuso", value: lead?.timezone ?? null },
    {
      label: "Local",
      value: [lead?.city, lead?.region, lead?.country].filter(Boolean).join(", ") || null,
    },
  ].filter((r) => r.value);

  const [{ data: clicks }, { data: events }] = await Promise.all([
    supabase
      .from("click")
      .select("utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid, landing_page_url, clicked_at")
      .eq("lead_id", leadId),
    supabase.from("event").select("event_type, value, event_data, occurred_at").eq("lead_id", leadId),
  ]);

  // Tráfego pago do Meta: o ID do anúncio vem no utm_content. Busca o criativo.
  const paidClick = (clicks ?? []).find(
    (c) => c.utm_content && /^\d{5,}$/.test(String(c.utm_content)),
  );
  const ad = paidClick?.utm_content
    ? await getAdCreative(tenant, String(paidClick.utm_content))
    : null;

  // Extrai o caminho (path) de uma URL para exibir a rota de forma enxuta.
  const toPath = (url: unknown): string => {
    if (typeof url !== "string" || !url) return "";
    try {
      const u = new URL(url);
      return u.pathname + u.search;
    } catch {
      return url;
    }
  };

  const journey: JourneyItem[] = [
    ...(clicks ?? []).map((c) => ({
      kind: "click" as const,
      label: "Clique / origem",
      detail: [c.utm_source && `source=${c.utm_source}`, c.utm_campaign && `campanha=${c.utm_campaign}`, c.fbclid && "fbclid", c.gclid && "gclid"]
        .filter(Boolean)
        .join(" · "),
      at: c.clicked_at as string,
    })),
    ...(events ?? []).map((e) => {
      const data = (e.event_data ?? {}) as Record<string, unknown>;
      const path = toPath(data.url);
      const detail = e.value ? `R$ ${e.value}` : path;
      return {
        kind: "event" as const,
        label: e.event_type as string,
        detail,
        at: e.occurred_at as string,
      };
    }),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-lg font-semibold">{lead?.tracking_code ?? "Lead"}</h1>
          {lead?.name && <p className="text-sm font-medium text-neutral-800">{lead.name}</p>}
          <p className="text-sm text-neutral-500">
            {lead?.phone ?? "sem telefone"} · {lead?.email ?? "sem e-mail"}
          </p>
        </div>

        {/* Anúncio de origem (tráfego pago Meta) */}
        {ad ? (
          <div className="w-60 shrink-0 rounded-xl border bg-white p-3 shadow-sm">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-blue-600">
              ◆ Anúncio de origem
            </p>
            {ad.thumbnail && (
              <img src={ad.thumbnail} alt="" className="mb-2 h-32 w-full rounded-lg object-cover" />
            )}
            <p className="text-sm font-medium leading-snug text-neutral-800">{ad.name}</p>
            {ad.campaign && <p className="mt-1 text-xs text-neutral-500">Campanha: {ad.campaign}</p>}
            {ad.adset && <p className="text-xs text-neutral-400">Conjunto: {ad.adset}</p>}
          </div>
        ) : paidClick ? (
          <div className="w-60 shrink-0 rounded-xl border bg-white p-3 text-xs text-neutral-500 shadow-sm">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-600">
              Tráfego pago
            </p>
            <p>Origem: {paidClick.utm_source ?? "—"}</p>
            {paidClick.utm_campaign && <p>Campanha ID: {String(paidClick.utm_campaign)}</p>}
            <p className="mt-1 text-neutral-400">Conecte o Meta Ads para ver o criativo.</p>
          </div>
        ) : null}
      </div>

      {sessionRows.length > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <h2 className="mb-3 text-sm font-medium text-neutral-700">Sessão (primeiro acesso)</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {sessionRows.map((r) => (
              <div key={r.label}>
                <dt className="text-xs text-neutral-400">{r.label}</dt>
                <dd className="text-neutral-700">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <ol className="space-y-2">
        {journey.map((j, i) => (
          <li key={i} className="flex items-start gap-3 rounded border bg-white p-3 text-sm">
            <span
              className={`mt-0.5 inline-block rounded px-2 py-0.5 text-xs ${
                j.kind === "click" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {j.label}
            </span>
            <span className="flex-1 text-neutral-600">{j.detail}</span>
            <time className="text-xs text-neutral-400">{fmtDateTime(j.at)}</time>
          </li>
        ))}
        {journey.length === 0 && <li className="text-sm text-neutral-500">Jornada vazia.</li>}
      </ol>
    </main>
  );
}
