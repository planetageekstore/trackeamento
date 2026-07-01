import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface IntegrationRow {
  provider: string;
  status: string;
}

const PROVIDERS: { key: string; label: string; startPath: (t: string) => string }[] = [
  { key: "meta", label: "Meta Ads", startPath: (t) => `/api/oauth/meta/start?tenant=${t}` },
  { key: "google", label: "Google Ads", startPath: (t) => `/api/oauth/google/start?tenant=${t}` },
  { key: "nuvemshop", label: "Nuvemshop", startPath: (t) => `/api/oauth/nuvemshop/start?tenant=${t}` },
];

export default async function ConnectionsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireUser();
  await assertTenantAccess(tenant);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("integration").select("provider, status").eq("tenant_id", tenant);
  const byProvider = new Map((data ?? []).map((i: IntegrationRow) => [i.provider, i.status]));

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-xl font-semibold">Conexões</h1>

      <ul className="space-y-3">
        {PROVIDERS.map((p) => {
          const status = byProvider.get(p.key);
          return (
            <li key={p.key} className="flex items-center justify-between rounded-lg border bg-white p-4">
              <div>
                <p className="font-medium">{p.label}</p>
                <p className="text-sm text-neutral-500">
                  {status === "connected" && "✓ Conectado"}
                  {status === "needs_reconnect" && "⚠ Reconexão necessária"}
                  {!status && "Não conectado"}
                </p>
              </div>
              <Link href={p.startPath(tenant)} className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">
                {status ? "Reconectar" : "Conectar"}
              </Link>
            </li>
          );
        })}

        <li className="flex items-center justify-between rounded-lg border bg-white p-4">
          <div>
            <p className="font-medium">WhatsApp</p>
            <p className="text-sm text-neutral-500">{byProvider.get("whatsapp") ?? "Conecte via QR code"}</p>
          </div>
          <Link href={`/${tenant}/whatsapp`} className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">
            Conectar
          </Link>
        </li>
      </ul>
    </main>
  );
}
