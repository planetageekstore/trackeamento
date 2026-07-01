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

export default async function TenantsPage() {
  await requireUser();
  const scope = await resolveScope();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenant").select("id, name, site_key").order("name");
  const tenants = (data ?? []) as TenantRow[];
  const cdn = process.env.CDN_URL ?? process.env.APP_URL ?? "";

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <h1 className="text-xl font-semibold">Clientes</h1>

      <ul className="space-y-3">
        {tenants.map((t) => (
          <li key={t.id} className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between">
              <Link href={`/${t.id}/leads`} className="font-medium hover:underline">
                {t.name}
              </Link>
              <code className="text-xs text-neutral-500">{t.site_key}</code>
            </div>
            <pre className="mt-2 overflow-x-auto rounded bg-neutral-100 p-2 text-xs">
              {`<script async src="${cdn}/t/v1/tracker.js" data-site-key="${t.site_key}"></script>`}
            </pre>
          </li>
        ))}
        {tenants.length === 0 && <li className="text-sm text-neutral-500">Nenhum cliente ainda.</li>}
      </ul>

      {scope.isAgencyAdmin && (
        <form action={createTenant} className="space-y-3 rounded-lg border bg-white p-4">
          <h2 className="font-medium">Novo cliente</h2>
          <input name="name" placeholder="Nome do cliente" required className="w-full rounded border px-3 py-2" />
          <input
            name="domains"
            placeholder="Domínios permitidos (ex.: loja.com.br, www.loja.com.br)"
            className="w-full rounded border px-3 py-2"
          />
          <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-white">
            Criar cliente
          </button>
        </form>
      )}
    </main>
  );
}
