import Link from "next/link";
import { requireUser, resolveScope } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenant } from "./actions";

export const dynamic = "force-dynamic";

interface TenantRow {
  id: string;
  name: string;
  site_key: string;
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
        ok ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-neutral-400"}`} />
      {label}
    </span>
  );
}

export default async function TenantsPage() {
  await requireUser();
  const scope = await resolveScope();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase.from("tenant").select("id, name, site_key").order("name");
  const tenants = (data ?? []) as TenantRow[];

  const [{ data: waRows }, { data: integRows }] = await Promise.all([
    supabase.from("whatsapp_instance").select("tenant_id, status"),
    supabase.from("integration").select("tenant_id, provider"),
  ]);
  const waByTenant = new Map((waRows ?? []).map((w) => [w.tenant_id, w.status]));
  const integByTenant = new Map<string, Set<string>>();
  for (const i of integRows ?? []) {
    if (!integByTenant.has(i.tenant_id)) integByTenant.set(i.tenant_id, new Set());
    integByTenant.get(i.tenant_id)!.add(i.provider);
  }
  const hasData = await Promise.all(
    tenants.map(async (t) => {
      const { count } = await supabase
        .from("event")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", t.id);
      return [t.id, (count ?? 0) > 0] as const;
    }),
  );
  const dataByTenant = new Map(hasData);

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Clientes</h1>
          <p className="text-sm text-neutral-500">Cada cliente é uma loja/site que você rastreia.</p>
        </div>
        {scope.isAgencyAdmin && (
          <Link href="/settings" className="rounded-lg border px-3 py-1.5 text-sm">
            Credenciais
          </Link>
        )}
      </div>

      <ul className="space-y-3">
        {tenants.map((t) => {
          const integrations = integByTenant.get(t.id) ?? new Set();
          return (
            <li key={t.id} className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge ok={Boolean(dataByTenant.get(t.id))} label="Recebendo dados" />
                    <Badge ok={waByTenant.get(t.id) === "open"} label="WhatsApp" />
                    <Badge ok={integrations.has("nuvemshop")} label="Nuvemshop" />
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link href={`/${t.id}`} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white">
                    Configurar
                  </Link>
                  <Link href={`/${t.id}/leads`} className="rounded-lg border px-3 py-1.5 text-sm">
                    Leads
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
        {tenants.length === 0 && <li className="text-sm text-neutral-500">Nenhum cliente ainda.</li>}
      </ul>

      {scope.isAgencyAdmin && (
        <form action={createTenant} className="space-y-3 rounded-xl border bg-white p-4">
          <h2 className="font-medium">Novo cliente</h2>
          <input name="name" placeholder="Nome do cliente" required className="w-full rounded-lg border px-3 py-2" />
          <p className="text-xs text-neutral-500">
            Você define os domínios e conecta os canais na tela de configuração depois.
          </p>
          <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-white">
            Criar cliente
          </button>
        </form>
      )}
    </main>
  );
}
