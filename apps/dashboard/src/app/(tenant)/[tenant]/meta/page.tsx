import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { connectMetaToken } from "./actions";

export const dynamic = "force-dynamic";

export default async function MetaConfigPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireUser();
  await assertTenantAccess(tenant);

  const supabase = await createSupabaseServerClient();
  const { data: integ } = await supabase
    .from("integration")
    .select("status, account_ref, meta")
    .eq("tenant_id", tenant)
    .eq("provider", "meta")
    .maybeSingle();

  const connected = integ?.status === "connected";
  const pixelId = (integ?.meta as { pixel_id?: string } | null)?.pixel_id ?? null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <Link href={`/${tenant}`} className="text-sm text-neutral-500 hover:underline">
          ← Configuração
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Meta Ads</h1>
      </div>

      {connected && (
        <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
          ✓ Conectado — conta <code>{integ?.account_ref ?? "?"}</code>
          {pixelId ? ` · pixel ${pixelId}` : " · pixel não detectado"}
        </div>
      )}

      <section className="space-y-3 rounded-xl border bg-white p-5">
        <h2 className="font-medium">Conectar com token (recomendado)</h2>
        <p className="text-sm text-neutral-600">
          Gere um token no <b>Gerenciador de Negócios → Configurações → Usuários do sistema</b> com as
          permissões <code>ads_read</code> e <code>ads_management</code>. Tokens de usuário do sistema
          <b> não expiram</b>. Cole abaixo:
        </p>
        <form action={connectMetaToken} className="space-y-3">
          <input type="hidden" name="tenantId" value={tenant} />
          <textarea
            name="token"
            required
            rows={3}
            placeholder="Cole aqui o token de acesso do usuário do sistema"
            className="w-full rounded-lg border px-3 py-2 font-mono text-xs"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              name="adAccountId"
              placeholder="ID da conta de anúncios (opcional)"
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <input
              name="pixelId"
              placeholder="ID do pixel (opcional)"
              className="rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-neutral-500">
            Se deixar em branco, tentamos descobrir a conta e o pixel automaticamente pelo token.
          </p>
          <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">
            {connected ? "Atualizar token" : "Conectar"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-medium">Ou conectar com login do Facebook</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Alternativa via OAuth. Requer o app configurado e, para contas de terceiros, revisão do
          Meta. O token pode expirar.
        </p>
        <Link
          href={`/api/oauth/meta/start?tenant=${tenant}`}
          className="mt-3 inline-block rounded-lg border px-3 py-1.5 text-sm"
        >
          Login com Facebook
        </Link>
      </section>
    </main>
  );
}
