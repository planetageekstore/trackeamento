import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    .select("tracking_code, phone, email, created_at")
    .eq("id", leadId)
    .maybeSingle();

  const [{ data: clicks }, { data: events }] = await Promise.all([
    supabase
      .from("click")
      .select("utm_source, utm_campaign, fbclid, gclid, landing_page_url, clicked_at")
      .eq("lead_id", leadId),
    supabase.from("event").select("event_type, value, event_data, occurred_at").eq("lead_id", leadId),
  ]);

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
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="font-mono text-lg font-semibold">{lead?.tracking_code ?? "Lead"}</h1>
        <p className="text-sm text-neutral-500">
          {lead?.phone ?? "sem telefone"} · {lead?.email ?? "sem e-mail"}
        </p>
      </div>

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
            <time className="text-xs text-neutral-400">{new Date(j.at).toLocaleString("pt-BR")}</time>
          </li>
        ))}
        {journey.length === 0 && <li className="text-sm text-neutral-500">Jornada vazia.</li>}
      </ol>
    </main>
  );
}
