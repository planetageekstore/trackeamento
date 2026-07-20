import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/date";
import { GSO_BLOCKS, loadLibrary } from "@/server/offerV2";
import { EngineerChat } from "./EngineerChat";
import { criarGso, regenerarGsoBloco, gerarAdCopy, adicionarNota, removerNota } from "./actions";

export const dynamic = "force-dynamic";

type Tab = "engenheiro" | "copy" | "gso" | "biblioteca";

const FRAMEWORKS = ["AIDA", "PAS", "BAB", "FAB", "4 Ps", "Gatilhos mentais", "5 estágios de consciência", "Sofisticação de mercado", "Storytelling"];
const PLATFORMS = ["Meta Ads", "Google Ads", "TikTok", "Orgânico"];

function TabNav({ tenant, tab }: { tenant: string; tab: Tab }) {
  const item = (key: Tab, label: string) => (
    <Link
      href={`/${tenant}/oferta?tab=${key}`}
      className={`rounded-lg px-3 py-1.5 text-sm ${
        tab === key ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border bg-white p-1">
      {item("engenheiro", "💬 Engenheiro")}
      {item("copy", "✍️ Copy de Anúncio")}
      {item("gso", "🎯 Grand Slam Offer")}
      {item("biblioteca", "📚 Biblioteca")}
    </div>
  );
}

function ContextToggle({ label }: { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-600">
      <input type="checkbox" name="useContext" className="h-4 w-4" />
      Usar contexto do cliente <span className="text-neutral-400">({label})</span>
    </label>
  );
}

export default async function OfertaPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tenant } = await params;
  const sp = await searchParams;
  await requireUser();
  await assertTenantAccess(tenant);

  const tab = (["engenheiro", "copy", "gso", "biblioteca"].includes(sp.tab ?? "") ? sp.tab : "engenheiro") as Tab;

  const supabase = await createSupabaseServerClient();
  const [{ data: tenantRow }, { data: gso }, { data: adCopy }, library] = await Promise.all([
    supabase.from("tenant").select("name").eq("id", tenant).maybeSingle(),
    supabase.from("oferta").select("id, output_md, blocks, model, created_at").eq("tenant_id", tenant).eq("kind", "gso").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("oferta").select("id, output_md, model, created_at").eq("tenant_id", tenant).eq("kind", "ad_copy").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    loadLibrary(tenant),
  ]);
  const tenantName = (tenantRow?.name as string) ?? "Cliente";
  const noteCount = library.defaults.length + library.custom.length;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Engenharia de Oferta</h1>
          <p className="mt-1 text-sm text-neutral-500">
            IA dedicada a copy e ofertas (Hopkins, Ogilvy, Schwartz, Halbert, Hormozi). Não mexe em campanhas — só cria copy e oferta.
          </p>
        </div>
        <span className="shrink-0 text-xs text-emerald-600">📚 Biblioteca carregada — {noteCount} notas</span>
      </header>

      <TabNav tenant={tenant} tab={tab} />

      {tab === "engenheiro" && <EngineerChat tenant={tenant} />}

      {tab === "gso" && (
        <div className="space-y-6">
          <form action={criarGso} className="space-y-4 rounded-xl border bg-white p-5">
            <input type="hidden" name="tenantId" value={tenant} />
            <ContextToggle label={tenantName} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field name="produto" label="Produto / Serviço" placeholder="Ex.: funko pop" required />
              <Field name="publico" label="Público-alvo" placeholder="Ex.: jovens 18–40 fãs de cultura pop" required />
            </div>
            <Field name="problema" label="Problema / dor principal (opcional)" placeholder="Ex.: se perde nos modelos e compra repetido" />
            <Field name="preco" label="Preço / ticket de referência (opcional)" placeholder="Ex.: R$ 397" />
            <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">Construir oferta</button>
            <p className="text-xs text-neutral-400">Nunca inventamos escassez/prova social falsa — sem dado real, aparece como [placeholder].</p>
          </form>

          {gso && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Oferta gerada</h2>
                <span className="text-xs text-neutral-400">
                  {fmtDateTime(gso.created_at as string)}
                  {gso.model && ` · ${gso.model}`}
                </span>
              </div>
              {GSO_BLOCKS.map((b) => {
                const content = (gso.blocks as Record<string, string>)?.[b.key]?.trim();
                return (
                  <div key={b.key} className="rounded-lg border bg-white p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-neutral-800">
                        {b.emoji} {b.title}
                      </h3>
                      <form action={regenerarGsoBloco}>
                        <input type="hidden" name="tenantId" value={tenant} />
                        <input type="hidden" name="ofertaId" value={gso.id as string} />
                        <input type="hidden" name="blockKey" value={b.key} />
                        <button className="rounded-md border px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100">↻ Regenerar</button>
                      </form>
                    </div>
                    {content ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{content}</p>
                    ) : (
                      <p className="text-sm text-neutral-400">— (bloco vazio)</p>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}

      {tab === "copy" && (
        <div className="space-y-6">
          <form action={gerarAdCopy} className="space-y-4 rounded-xl border bg-white p-5">
            <input type="hidden" name="tenantId" value={tenant} />
            <ContextToggle label={tenantName} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field name="produto" label="Produto / Serviço" placeholder="Ex.: Curso de inglês online" required />
              <Field name="publico" label="Público-alvo" placeholder="Ex.: adultos 25–40 que querem promoção" required />
              <Field name="objetivo" label="Objetivo" placeholder="Ex.: gerar leads no WhatsApp" required />
              <Field name="tom" label="Tom" placeholder="Ex.: direto e provocador" required />
              <Field name="diferencial" label="Diferencial (opcional)" placeholder="Ex.: fluência em 6 meses ou dinheiro de volta" />
              <label className="text-sm">
                <span className="mb-1 block font-medium text-neutral-700">Plataforma</span>
                <select name="plataforma" className="w-full rounded-md border p-2 text-sm">
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-neutral-700">Framework (opcional)</span>
              <select name="framework" className="rounded-md border p-2 text-sm">
                <option value="">—</option>
                {FRAMEWORKS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">Gerar 3 variações</button>
          </form>

          {adCopy && (
            <section className="rounded-xl border bg-white p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-neutral-700">Variações geradas</h2>
                <span className="text-xs text-neutral-400">{fmtDateTime(adCopy.created_at as string)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{adCopy.output_md as string}</p>
            </section>
          )}
        </div>
      )}

      {tab === "biblioteca" && (
        <div className="space-y-6">
          <form action={adicionarNota} className="space-y-3 rounded-xl border bg-white p-5">
            <input type="hidden" name="tenantId" value={tenant} />
            <h2 className="text-sm font-medium text-neutral-700">Adicionar nota</h2>
            <Field name="title" label="Título" placeholder="Ex.: Minha headline campeã" required />
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">Conteúdo</span>
              <textarea name="content" rows={3} required className="w-full resize-y rounded-md border p-2 text-sm" />
            </label>
            <Field name="tags" label="Tags (separadas por vírgula)" placeholder="headline, oferta" />
            <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white">Adicionar</button>
          </form>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-neutral-500">Notas do cliente ({library.custom.length})</h2>
            {library.custom.length === 0 ? (
              <p className="text-sm text-neutral-400">Nenhuma nota própria ainda. As notas padrão abaixo já alimentam a IA.</p>
            ) : (
              <ul className="divide-y rounded-xl border bg-white">
                {library.custom.map((n) => (
                  <li key={n.id} className="flex items-start justify-between gap-3 p-4 text-sm">
                    <div>
                      <p className="font-medium">{n.title}</p>
                      <p className="text-neutral-600">{n.content}</p>
                      {n.tags.length > 0 && <p className="mt-1 text-xs text-neutral-400">{n.tags.join(" · ")}</p>}
                    </div>
                    <form action={removerNota}>
                      <input type="hidden" name="tenantId" value={tenant} />
                      <input type="hidden" name="noteId" value={n.id} />
                      <button className="shrink-0 rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-red-50">Remover</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="pt-2 text-sm font-medium text-neutral-500">Notas padrão ({library.defaults.length})</h2>
            <ul className="divide-y rounded-xl border bg-white">
              {library.defaults.map((n) => (
                <li key={n.title} className="p-4 text-sm">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-neutral-600">{n.content}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}

function Field({
  name,
  label,
  placeholder,
  required,
}: {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-neutral-700">{label}</span>
      <input name={name} placeholder={placeholder} required={required} className="w-full rounded-md border p-2 text-sm" />
    </label>
  );
}
