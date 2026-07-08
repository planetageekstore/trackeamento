import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdCreatives } from "@/server/integrations/meta";
import { fmtDateTime } from "@/lib/date";

export const dynamic = "force-dynamic";

interface LeadRow {
  id: string;
  tracking_code: string;
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

const deviceIcon = (d: string | null) =>
  d === "mobile" ? "📱" : d === "tablet" ? "📲" : d === "desktop" ? "💻" : "—";

export default async function LeadsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireUser();
  await assertTenantAccess(tenant);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("lead")
    .select("id, tracking_code, phone, email, created_at, last_seen_at, device_type, os, browser, city, country")
    .eq("tenant_id", tenant)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(100);
  const leads = (data ?? []) as LeadRow[];

  // Anúncio de origem por lead: pega o ID do anúncio (utm_content) do clique e
  // busca os criativos em lote na API do Meta.
  const adByLead: Record<string, { thumbnail: string | null; name: string; campaign: string | null }> = {};
  if (leads.length > 0) {
    const { data: clickRows } = await supabase
      .from("click")
      .select("lead_id, utm_content, clicked_at")
      .in("lead_id", leads.map((l) => l.id))
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
      if (cr) adByLead[lid] = { thumbnail: cr.thumbnail, name: cr.name, campaign: cr.campaign };
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-xl font-semibold">Leads</h1>
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
                  <span
                    className="flex items-center gap-2"
                    title={`${adByLead[l.id]!.name}${adByLead[l.id]!.campaign ? ` — ${adByLead[l.id]!.campaign}` : ""}`}
                  >
                    {adByLead[l.id]!.thumbnail && (
                      <img src={adByLead[l.id]!.thumbnail!} alt="" className="h-8 w-8 rounded object-cover" />
                    )}
                    <span className="max-w-[110px] truncate text-xs text-neutral-600">
                      {adByLead[l.id]!.name}
                    </span>
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
    </main>
  );
}
