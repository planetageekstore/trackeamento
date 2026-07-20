import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdCreatives } from "@/server/integrations/meta";
import { Pagination } from "@/components/Pagination";
import { fmtDateTime } from "@/lib/date";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const deviceIcon = (d: string | null) =>
  d === "mobile" ? "📱" : d === "tablet" ? "📲" : d === "desktop" ? "💻" : "—";

interface LeadRow {
  id: string;
  tracking_code: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  last_seen_at: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  city: string | null;
  country: string | null;
}

interface SessionRow {
  lead_id: string;
  session_date: string;
  started_at: string;
  ended_at: string;
  events_count: number;
  pageviews: number;
  has_purchase: boolean;
  has_whatsapp: boolean;
}

/** Busca os anúncios de origem (Meta) para um conjunto de leads. */
async function adsForLeads(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenant: string,
  leadIds: string[],
): Promise<Record<string, { thumbnail: string | null; name: string; campaign: string | null }>> {
  const out: Record<string, { thumbnail: string | null; name: string; campaign: string | null }> = {};
  if (leadIds.length === 0) return out;
  const { data: clickRows } = await supabase
    .from("click")
    .select("lead_id, utm_content, clicked_at")
    .in("lead_id", leadIds)
    .not("utm_content", "is", null)
    .order("clicked_at", { ascending: true });
  const leadAd: Record<string, string> = {};
  for (const c of clickRows ?? []) {
    const id = String(c.utm_content ?? "");
    const lid = c.lead_id as string;
    if (/^\d{5,}$/.test(id) && !leadAd[lid]) leadAd[lid] = id;
  }
  const creatives = await getAdCreatives(tenant, Object.values(leadAd));
  for (const [lid, adId] of Object.entries(leadAd)) {
    const cr = creatives[adId];
    if (cr) out[lid] = { thumbnail: cr.thumbnail, name: cr.name, campaign: cr.campaign };
  }
  return out;
}

function Tabs({ tenant, tab }: { tenant: string; tab: string }) {
  const item = (key: string, label: string) => (
    <Link
      href={`/${tenant}/leads?tab=${key}`}
      className={`rounded-lg px-3 py-1.5 text-sm ${
        tab === key ? "bg-neutral-900 text-white" : "border bg-white text-neutral-600 hover:bg-neutral-50"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex gap-1">
      {item("sessoes", "Sessões")}
      {item("leads", "Leads")}
    </div>
  );
}

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { tenant } = await params;
  const sp = await searchParams;
  await requireUser();
  await assertTenantAccess(tenant);

  const tab = sp.tab === "leads" ? "leads" : "sessoes";
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Leads</h1>
        <Tabs tenant={tenant} tab={tab} />
      </div>

      {tab === "sessoes" ? (
        <SessionsTab supabase={supabase} tenant={tenant} page={page} from={from} to={to} />
      ) : (
        <LeadsTab supabase={supabase} tenant={tenant} page={page} from={from} to={to} />
      )}
    </main>
  );
}

async function SessionsTab({
  supabase,
  tenant,
  page,
  from,
  to,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  tenant: string;
  page: number;
  from: number;
  to: number;
}) {
  const { data, count } = await supabase
    .from("lead_session")
    .select("lead_id, session_date, started_at, ended_at, events_count, pageviews, has_purchase, has_whatsapp", {
      count: "exact",
    })
    .eq("tenant_id", tenant)
    .order("started_at", { ascending: false })
    .range(from, to);
  const sessions = (data ?? []) as SessionRow[];

  const leadIds = [...new Set(sessions.map((s) => s.lead_id))];
  const { data: leadRows } = await supabase
    .from("lead")
    .select("id, tracking_code, name, phone, device_type")
    .in("id", leadIds.length ? leadIds : ["00000000-0000-0000-0000-000000000000"]);
  const leadById = new Map((leadRows ?? []).map((l) => [l.id as string, l]));
  const adByLead = await adsForLeads(supabase, tenant, leadIds);

  const hm = (iso: string) => fmtDateTime(iso, { hour: "2-digit", minute: "2-digit" });
  const dayLabel = (iso: string) =>
    fmtDateTime(iso, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-neutral-500">
            <th className="py-2">Lead</th>
            <th>Anúncio</th>
            <th>Dia</th>
            <th className="text-right">Horário</th>
            <th className="text-right">Eventos</th>
            <th className="text-center">Sinais</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s, i) => {
            const lead = leadById.get(s.lead_id);
            const ad = adByLead[s.lead_id];
            return (
              <tr key={`${s.lead_id}-${s.session_date}-${i}`} className="border-b">
                <td className="py-2 pr-2">
                  <Link href={`/${tenant}/leads/${s.lead_id}`} className="font-mono text-xs hover:underline">
                    {lead?.tracking_code ?? "—"}
                  </Link>
                  {(lead?.name || lead?.phone) && (
                    <span className="block text-[11px] text-neutral-500">{lead?.name ?? lead?.phone}</span>
                  )}
                </td>
                <td>
                  {ad ? (
                    <span className="flex items-center gap-2" title={ad.name}>
                      {ad.thumbnail && <img src={ad.thumbnail} alt="" className="h-7 w-7 rounded object-cover" />}
                      <span className="max-w-[120px] truncate text-xs text-neutral-600">{ad.name}</span>
                    </span>
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </td>
                <td className="text-neutral-600">{dayLabel(s.started_at)}</td>
                <td className="text-right tabular-nums text-neutral-600">
                  {hm(s.started_at)} – {hm(s.ended_at)}
                </td>
                <td className="text-right tabular-nums">
                  {s.events_count}
                  <span className="block text-[10px] text-neutral-400">{s.pageviews} páginas</span>
                </td>
                <td className="text-center">
                  <span className="inline-flex gap-1">
                    {s.has_purchase && <span title="Compra">🛒</span>}
                    {s.has_whatsapp && <span title="WhatsApp">💬</span>}
                    {!s.has_purchase && !s.has_whatsapp && <span className="text-neutral-300">—</span>}
                  </span>
                </td>
              </tr>
            );
          })}
          {sessions.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-neutral-500">
                Nenhuma sessão registrada ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <Pagination page={page} total={count ?? 0} pageSize={PAGE_SIZE} baseParams={{ tab: "sessoes" }} />
    </>
  );
}

async function LeadsTab({
  supabase,
  tenant,
  page,
  from,
  to,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  tenant: string;
  page: number;
  from: number;
  to: number;
}) {
  const { data, count } = await supabase
    .from("lead")
    .select(
      "id, tracking_code, name, phone, email, created_at, last_seen_at, device_type, os, browser, city, country",
      { count: "exact" },
    )
    .eq("tenant_id", tenant)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .range(from, to);
  const leads = (data ?? []) as LeadRow[];
  const adByLead = await adsForLeads(supabase, tenant, leads.map((l) => l.id));

  return (
    <>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-neutral-500">
            <th className="py-2">Tracking ID</th>
            <th>Anúncio</th>
            <th>Dispositivo</th>
            <th>Local</th>
            <th>Telefone</th>
            <th>Última visita</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-b">
              <td className="py-2">
                <Link href={`/${tenant}/leads/${l.id}`} className="font-mono hover:underline">
                  {l.tracking_code}
                </Link>
              </td>
              <td>
                {adByLead[l.id] ? (
                  <span className="flex items-center gap-2" title={adByLead[l.id]!.name}>
                    {adByLead[l.id]!.thumbnail && (
                      <img src={adByLead[l.id]!.thumbnail!} alt="" className="h-8 w-8 rounded object-cover" />
                    )}
                    <span className="max-w-[110px] truncate text-xs text-neutral-600">{adByLead[l.id]!.name}</span>
                  </span>
                ) : (
                  <span className="text-neutral-300">—</span>
                )}
              </td>
              <td>
                {deviceIcon(l.device_type)} {[l.os, l.browser].filter(Boolean).join(" · ") || "—"}
              </td>
              <td>{[l.city, l.country].filter(Boolean).join(", ") || "—"}</td>
              <td>{l.phone ?? "—"}</td>
              <td>
                {fmtDateTime(l.last_seen_at ?? l.created_at)}
                <span className="block text-[10px] text-neutral-400">
                  1º acesso: {fmtDateTime(l.created_at, { day: "2-digit", month: "2-digit" })}
                </span>
              </td>
            </tr>
          ))}
          {leads.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-neutral-500">
                Nenhum lead capturado ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <Pagination page={page} total={count ?? 0} pageSize={PAGE_SIZE} baseParams={{ tab: "leads" }} />
    </>
  );
}
