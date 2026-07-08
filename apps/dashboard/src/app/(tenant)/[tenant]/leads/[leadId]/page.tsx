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
      "tracking_code, name, phone, email, created_at, last_seen_at, device_type, os, browser, screen, language, timezone, city, region, country",
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

  // Lead que chegou pelo link da bio do Instagram (provável campanha de
  // tráfego p/ perfil — atribuição por lead não é exata, ver página Campanhas).
  const bioClick = (clicks ?? []).find(
    (c) => c.utm_content === "link_in_bio" || (c.utm_source === "ig" && c.utm_medium === "social"),
  );

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

  // Agrupa a jornada por DIA (sessões acessadas), fuso de São Paulo. Dias mais
  // recentes primeiro; dentro do dia, ordem cronológica.
  const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const byDay = new Map<string, JourneyItem[]>();
  for (const j of journey) {
    const k = dayKey(j.at);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(j);
  }
  const todayKey = dayKey(new Date().toISOString());
  const daysDesc = [...byDay.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-lg font-semibold">{lead?.tracking_code ?? "Lead"}</h1>
          {lead?.name && <p className="text-sm font-medium text-neutral-800">{lead.name}</p>}
          <p className="text-sm text-neutral-500">
            {lead?.phone ?? "sem telefone"} · {lead?.email ?? "sem e-mail"}
          </p>
          {lead && (
            <p className="mt-1 text-xs text-neutral-400">
              1º acesso: {fmtDateTime(lead.created_at)}
              {lead.last_seen_at && ` · última visita: ${fmtDateTime(lead.last_seen_at)}`}
              {" · "}
              {byDay.size} {byDay.size === 1 ? "dia" : "dias"} de acesso
            </p>
          )}
        </div>

        {/* Anúncio de origem (tráfego pago Meta) */}
        {ad ? (
          <div className="flex w-52 shrink-0 gap-2 rounded-lg border bg-white p-2 shadow-sm">
            {ad.thumbnail && (
              <img src={ad.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">Anúncio</p>
              <p className="truncate text-xs font-medium text-neutral-800" title={ad.name}>
                {ad.name}
              </p>
              {ad.campaign && (
                <p className="truncate text-[11px] text-neutral-500" title={ad.campaign}>
                  {ad.campaign}
                </p>
              )}
            </div>
          </div>
        ) : paidClick ? (
          <div className="w-52 shrink-0 rounded-lg border bg-white p-2 text-[11px] text-neutral-500 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">Tráfego pago</p>
            <p className="truncate">Campanha ID: {String(paidClick.utm_campaign ?? "—")}</p>
            <p className="text-neutral-400">Conecte o Meta p/ ver o criativo.</p>
          </div>
        ) : bioClick ? (
          <div className="w-52 shrink-0 rounded-lg border bg-white p-2 text-[11px] text-neutral-500 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-pink-600">
              Instagram · bio
            </p>
            <p className="text-neutral-600">Veio pelo link da bio do perfil.</p>
            <p className="mt-1 text-neutral-400">Provável: campanha TRAFEGO P/ PERFIL.</p>
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

      {journey.length === 0 ? (
        <p className="text-sm text-neutral-500">Jornada vazia.</p>
      ) : (
        <div className="space-y-5">
          {daysDesc.map((day) => {
            const items = byDay.get(day)!;
            const label = new Date(items[0]!.at).toLocaleDateString("pt-BR", {
              timeZone: "America/Sao_Paulo",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              weekday: "short",
            });
            return (
              <section key={day}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-neutral-900 px-3 py-0.5 text-xs font-medium text-white">
                    {day === todayKey ? "Hoje" : label}
                  </span>
                  <span className="text-xs text-neutral-400">
                    {items.length} {items.length === 1 ? "evento" : "eventos"}
                  </span>
                  <span className="h-px flex-1 bg-neutral-100" />
                </div>
                <ol className="space-y-2">
                  {items.map((j, i) => (
                    <li key={i} className="flex items-start gap-3 rounded border bg-white p-3 text-sm">
                      <span
                        className={`mt-0.5 inline-block rounded px-2 py-0.5 text-xs ${
                          j.kind === "click" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {j.label}
                      </span>
                      <span className="flex-1 break-all text-neutral-600">{j.detail}</span>
                      <time className="shrink-0 text-xs text-neutral-400">
                        {fmtDateTime(j.at, { hour: "2-digit", minute: "2-digit" })}
                      </time>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
