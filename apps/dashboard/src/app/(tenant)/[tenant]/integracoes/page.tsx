import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CopyBlock } from "@/components/CopyBlock";
import { addDomain, removeDomain, disconnectIntegration, syncOrders } from "../actions";
import { salvarGa4, salvarMetaTestCode, salvarConversionAction } from "./actions";
import { DispatchToggle } from "./DispatchToggle";

export const dynamic = "force-dynamic";

const TARGET_LABEL: Record<string, string> = {
  meta_capi: "Meta CAPI",
  google_offline: "Google Offline",
  ga4_mp: "GA4",
};

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
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const [{ data: t }, { data: domainRows }, { data: wa }, { data: integs }, { data: dispatchRows }] = await Promise.all([
    supabase.from("tenant").select("site_key").eq("id", tenant).maybeSingle(),
    supabase.from("tenant_domain").select("id, domain").eq("tenant_id", tenant).order("domain"),
    supabase.from("whatsapp_instance").select("status").eq("tenant_id", tenant).maybeSingle(),
    supabase.from("integration").select("provider, status, meta").eq("tenant_id", tenant),
    supabase.from("conversion_dispatch").select("target, status").eq("tenant_id", tenant).gte("updated_at", sevenDaysAgo),
  ]);

  const domains = (domainRows ?? []) as Domain[];
  const integ = new Map((integs ?? []).map((i) => [i.provider, i.status]));
  const integMeta = new Map((integs ?? []).map((i) => [i.provider, (i.meta as Record<string, unknown>) ?? {}]));
  const metaCfg = integMeta.get("meta") ?? {};
  const googleCfg = integMeta.get("google") ?? {};
  const ga4Cfg = integMeta.get("ga4") ?? {};

  // Contadores de envio (últimos 7 dias) por target.
  const counters = new Map<string, { sent: number; failed: number; skipped: number }>();
  for (const d of dispatchRows ?? []) {
    const key = d.target as string;
    const c = counters.get(key) ?? { sent: 0, failed: 0, skipped: 0 };
    if (d.status === "sent") c.sent++;
    else if (d.status === "failed") c.failed++;
    else if (d.status === "skipped") c.skipped++;
    counters.set(key, c);
  }
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

      {/* GA4 (Google Analytics 4) */}
      <section className="space-y-3 rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Google Analytics 4</h2>
          <StatusPill ok={integ.get("ga4") === "connected"} text={integ.get("ga4") === "connected" ? "conectado" : "não conectado"} />
        </div>
        <p className="text-sm text-neutral-600">
          Cole o <b>ID de medição</b> (G-XXXXXXXXXX). Para enviar conversões server-side (compras e leads do WhatsApp), informe
          também o <b>API Secret</b> — criado em <i>Admin → Fluxos de dados → Measurement Protocol</i> no GA4.
        </p>
        <form action={salvarGa4} className="space-y-3">
          <input type="hidden" name="tenantId" value={tenant} />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-neutral-700">Measurement ID</span>
              <input name="measurement_id" defaultValue={String(ga4Cfg.measurement_id ?? "")} placeholder="G-XXXXXXXXXX" className="w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-neutral-700">API Secret {ga4Cfg.api_secret_enc ? "(salvo — deixe vazio p/ manter)" : ""}</span>
              <input name="api_secret" type="password" placeholder="••••••••" className="w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" name="load_gtag" defaultChecked={Boolean(ga4Cfg.load_gtag)} className="h-4 w-4" />
            Carregar o gtag no site (só se a loja ainda não tiver GA4)
          </label>
          <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">Salvar GA4</button>
        </form>
      </section>

      {/* Envio de conversões de volta (F1 + F7) */}
      <section className="space-y-4 rounded-xl border bg-white p-5">
        <div>
          <h2 className="font-medium">Enviar conversões de volta</h2>
          <p className="text-sm text-neutral-600">
            Devolve as conversões rastreadas (compras e leads) às plataformas para otimizarem a entrega. PII sempre em hash;
            roda automaticamente a cada 15–30 min.
          </p>
        </div>

        {/* Meta CAPI */}
        <div className="space-y-2 border-t pt-3">
          <DispatchToggle
            tenant={tenant}
            provider="meta"
            label="Meta CAPI"
            connected={integ.get("meta") === "connected"}
            enabled={Boolean(metaCfg.dispatch_enabled)}
          />
          {integ.get("meta") === "connected" && (
            <form action={salvarMetaTestCode} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="tenantId" value={tenant} />
              <label className="text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Test event code (opcional, p/ validar)</span>
                <input name="test_event_code" defaultValue={String(metaCfg.test_event_code ?? "")} placeholder="TEST12345" className="rounded-lg border px-3 py-1.5 text-sm" />
              </label>
              <button className="rounded-lg border px-3 py-1.5 text-sm">Salvar</button>
            </form>
          )}
        </div>

        {/* Google Offline */}
        <div className="space-y-2 border-t pt-3">
          <DispatchToggle
            tenant={tenant}
            provider="google"
            label="Google Offline Conversions"
            connected={integ.get("google") === "connected"}
            enabled={Boolean(googleCfg.dispatch_enabled)}
          />
          {integ.get("google") === "connected" && (
            <form action={salvarConversionAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="tenantId" value={tenant} />
              <label className="text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Conversion Action (resource name)</span>
                <input name="conversion_action" defaultValue={String(googleCfg.conversion_action ?? "")} placeholder="customers/123/conversionActions/456" className="w-80 rounded-lg border px-3 py-1.5 text-sm" />
              </label>
              <button className="rounded-lg border px-3 py-1.5 text-sm">Salvar</button>
            </form>
          )}
        </div>

        {/* GA4 MP */}
        <div className="space-y-2 border-t pt-3">
          <DispatchToggle
            tenant={tenant}
            provider="ga4"
            label="GA4 (Measurement Protocol)"
            connected={integ.get("ga4") === "connected"}
            enabled={Boolean(ga4Cfg.dispatch_enabled)}
          />
        </div>

        {/* Contadores */}
        {counters.size > 0 && (
          <div className="border-t pt-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-neutral-400">Últimos 7 dias</p>
            <div className="flex flex-wrap gap-4 text-sm">
              {[...counters.entries()].map(([target, c]) => (
                <div key={target} className="rounded-lg border px-3 py-2">
                  <p className="font-medium">{TARGET_LABEL[target] ?? target}</p>
                  <p className="text-xs text-neutral-500">
                    <span className="text-emerald-600">{c.sent} enviadas</span> · {c.failed} falhas · {c.skipped} puladas
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Sincronizar vendas do Nuvemshop (fallback confiável do webhook) */}
      {integ.get("nuvemshop") === "connected" && (
        <section className="space-y-3 rounded-xl border bg-white p-5">
          <h2 className="font-medium">Sincronizar vendas do Nuvemshop</h2>
          <p className="text-sm text-neutral-600">
            Busca os pedidos <b>pagos</b> dos últimos 30 dias e registra as vendas atribuídas aos
            leads. Rode manualmente quando quiser — também roda sozinho de tempos em tempos.
          </p>
          <form action={syncOrders}>
            <input type="hidden" name="tenantId" value={tenant} />
            <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">
              Sincronizar vendas agora
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
