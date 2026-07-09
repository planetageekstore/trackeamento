import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/date";
import { OFFER_BLOCKS } from "@/server/offer";
import { criarOferta, regenerarBloco } from "./actions";

export const dynamic = "force-dynamic";

interface OfertaRow {
  id: string;
  produto: string;
  preco: string;
  output_md: string;
  blocks: Record<string, string>;
  model: string | null;
  created_at: string;
}

const FIELDS: { name: string; label: string; placeholder: string }[] = [
  { name: "nicho", label: "Nicho e Público-Alvo", placeholder: "Ex.: mulheres 30-45 que querem emagrecer sem dieta radical" },
  { name: "produto", label: "Produto / Serviço", placeholder: "Ex.: programa online de 8 semanas com acompanhamento" },
  { name: "preco", label: "Preço-Alvo", placeholder: "Ex.: R$ 497 à vista ou 12x de R$ 49" },
  { name: "roma", label: "Transformação Principal (Roma)", placeholder: "O destino final que o cliente deseja" },
  { name: "problema", label: "Problema Central", placeholder: "A dor nº 1 que a oferta resolve" },
];

export default async function OfertaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireUser();
  await assertTenantAccess(tenant);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("oferta")
    .select("id, produto, preco, output_md, blocks, model, created_at")
    .eq("tenant_id", tenant)
    .order("created_at", { ascending: false })
    .limit(20);
  const ofertas = (data ?? []) as OfertaRow[];
  const latest = ofertas[0] ?? null;
  const history = ofertas.slice(1);

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold">🧠 Engenheiro de Oferta</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Gera uma oferta irresistível para esta loja em 7 blocos (hooks, Roma &amp; USP, história,
          stack de valor, garantia, urgência e FAQ). Preencha os 5 campos e gere.
        </p>
      </header>

      {/* Formulário: 5 inputs -> gera a oferta */}
      <form action={criarOferta} className="space-y-4 rounded-lg border bg-white p-5">
        <input type="hidden" name="tenantId" value={tenant} />
        {FIELDS.map((f) => (
          <div key={f.name}>
            <label htmlFor={f.name} className="mb-1 block text-sm font-medium text-neutral-700">
              {f.label}
            </label>
            <textarea
              id={f.name}
              name={f.name}
              rows={2}
              required
              placeholder={f.placeholder}
              className="w-full resize-y rounded-md border border-neutral-300 p-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </div>
        ))}
        <button
          type="submit"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Gerar oferta
        </button>
        <p className="text-xs text-neutral-400">
          A geração usa IA e pode levar alguns segundos. Nunca inventamos urgência ou prova social
          falsa — trechos assim aparecem como <span className="font-mono">[placeholder]</span>.
        </p>
      </form>

      {/* Última oferta gerada, em blocos endereçáveis */}
      {latest && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Oferta gerada</h2>
            <span className="text-xs text-neutral-400">
              {fmtDateTime(latest.created_at)}
              {latest.model && ` · ${latest.model}`}
            </span>
          </div>

          {OFFER_BLOCKS.map((b) => {
            const content = latest.blocks?.[b.key]?.trim();
            return (
              <div key={b.key} className="rounded-lg border bg-white p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
                    <span>{b.emoji}</span>
                    {b.title}
                  </h3>
                  <form action={regenerarBloco}>
                    <input type="hidden" name="tenantId" value={tenant} />
                    <input type="hidden" name="ofertaId" value={latest.id} />
                    <input type="hidden" name="blockKey" value={b.key} />
                    <button
                      type="submit"
                      className="rounded-md border px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
                      title="Regenerar apenas este bloco"
                    >
                      ↻ Regenerar
                    </button>
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

      {/* Histórico de ofertas anteriores desta loja */}
      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-500">Ofertas anteriores</h2>
          <ul className="divide-y rounded-lg border bg-white text-sm">
            {history.map((o) => (
              <li key={o.id} className="flex items-center justify-between p-3">
                <span className="truncate text-neutral-700" title={o.produto}>
                  {o.produto}
                </span>
                <span className="shrink-0 text-xs text-neutral-400">
                  {o.preco} · {fmtDateTime(o.created_at, { day: "2-digit", month: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
