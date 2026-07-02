import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CopyBlock } from "@/components/CopyBlock";
import { addDomain, removeDomain, disconnectIntegration } from "../actions";

export const dynamic = "force-dynamic";

interface Domain {
  id: string;
  domain: string;
}

function StatusPill({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className={`text-sm ${ok ? "text-emerald-600" : "text-neutral-400"}`}>
      {ok ? "● " : "○ "}
      {text}
    </span>
  );
}

function ChannelRow({
  title,
  desc,
  connected,
  statusText,
  href,
  tenant,
  provider,
}: {
  title: string;
  desc: string;
  connected: boolean;
  statusText: string;
  href: string;
  tenant: string;
  provider: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 last:border-0">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-neutral-500">{desc}</p>
      </div>
      <div className="flex items-center gap-3">
        <StatusPill ok={connected} text={statusText} />
        <Link href={href} className="rounded-lg border px-3 py-1.5 text-sm">
          {connected ? "Reconectar" : "Conectar"}
        </Link>
        {connected && (
          <form action={disconnectIntegration}>
            <input type="hidden" name="tenantId" value={tenant} />
            <input type="hidden" name="provider" value={provider} />
            <button className="text-sm text-red-600 hover:underline">Desconectar</button>
          </form>
        )}
      </div>
    </div>
  );
}

export default async function IntegracoesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireUser();
  await assertTenantAccess(tenant);

  const supabase = await createSupabaseServerClient();
  const [{ data: t }, { data: domainRows }, { data: wa }, { data: integs }] = await Promise.all([
    supabase.from("tenant").select("site_key").eq("id", tenant).maybeSingle(),
    supabase.from("tenant_domain").select("id, domain").eq("tenant_id", tenant).order("domain"),
    supabase.from("whatsapp_instance").select("status").eq("tenant_id", tenant).maybeSingle(),
    supabase.from("integration").select("provider, status").eq("tenant_id", tenant),
  ]);

  const domains = (domainRows ?? []) as Domain[];
  const integ = new Map((integs ?? []).map((i) => [i.provider, i.status]));
  const waConnected = wa?.status === "connected" || wa?.status === "open";
  const cdn = process.env.CDN_URL ?? process.env.APP_URL ?? "";
  const snippet = `<script async src="${cdn}/t/v1/tracker.js" data-site-key="${t?.site_key}"></script>`;

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <h1 className="text-xl font-semibold">Integrações</h1>

      {/* Instalação */}
      <section className="space-y-3 rounded-xl border bg-white p-5">
        <h2 className="font-medium">Instalar o rastreador no site</h2>
        <p className="text-sm text-neutral-600">
          Cole este código no <code>&lt;head&gt;</code> do site. Na <b>Nuvemshop</b>, vá em{" "}
          <b>Configurações → Códigos externos</b> e cole ali.
        </p>
        <CopyBlock code={snippet} />
      </section>

      {/* Domínios */}
      <section className="space-y-3 rounded-xl border bg-white p-5">
        <h2 className="font-medium">Domínios permitidos</h2>
        <p className="text-sm text-neutral-600">
          Só aceitamos dados vindos destes domínios (proteção contra uso indevido da chave).
        </p>
        <ul className="space-y-1">
          {domains.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded border px-3 py-1.5 text-sm">
              <span className="font-mono">{d.domain}</span>
              <form action={removeDomain}>
                <input type="hidden" name="tenantId" value={tenant} />
                <input type="hidden" name="domainId" value={d.id} />
                <button className="text-neutral-400 hover:text-red-600">remover</button>
              </form>
            </li>
          ))}
          {domains.length === 0 && <li className="text-sm text-neutral-400">Nenhum domínio ainda.</li>}
        </ul>
        <form action={addDomain} className="flex gap-2">
          <input type="hidden" name="tenantId" value={tenant} />
          <input
            name="domain"
            placeholder="ex.: planetageekstore.com.br"
            className="flex-1 rounded-lg border px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white">Adicionar</button>
        </form>
      </section>

      {/* Canais */}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="mb-2 font-medium">Canais e contas</h2>
        <ChannelRow
          title="WhatsApp"
          desc="Conecte por QR code para atribuir conversas."
          connected={waConnected}
          statusText={waConnected ? "conectado" : "não conectado"}
          href={`/${tenant}/whatsapp`}
          tenant={tenant}
          provider="whatsapp"
        />
        <ChannelRow
          title="Nuvemshop"
          desc="Captura vendas pagas para atribuição automática."
          connected={integ.get("nuvemshop") === "connected"}
          statusText={integ.has("nuvemshop") ? String(integ.get("nuvemshop")) : "não conectado"}
          href={`/api/oauth/nuvemshop/start?tenant=${tenant}`}
          tenant={tenant}
          provider="nuvemshop"
        />
        <ChannelRow
          title="Meta Ads"
          desc="Importa custos e envia conversões (CAPI)."
          connected={integ.get("meta") === "connected"}
          statusText={integ.has("meta") ? String(integ.get("meta")) : "não conectado"}
          href={`/${tenant}/meta`}
          tenant={tenant}
          provider="meta"
        />
        <ChannelRow
          title="Google Ads"
          desc="Importa custos e envia conversões offline."
          connected={integ.get("google") === "connected"}
          statusText={integ.has("google") ? String(integ.get("google")) : "não conectado"}
          href={`/api/oauth/google/start?tenant=${tenant}`}
          tenant={tenant}
          provider="google"
        />
      </section>
    </main>
  );
}
