import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HeatmapCanvas, type HeatCell } from "@/components/HeatmapCanvas";
import { ScrollMap, type ScrollBucket } from "@/components/ScrollMap";

export const dynamic = "force-dynamic";

interface PageRow {
  page_path: string;
  width: number;
  height: number;
}

export default async function HeatmapPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ page?: string; kind?: string; bg?: string }>;
}) {
  const { tenant } = await params;
  const sp = await searchParams;
  await requireUser();
  await assertTenantAccess(tenant);

  const supabase = await createSupabaseServerClient();

  const { data: pagesData } = await supabase
    .from("heatmap_page")
    .select("page_path, width, height")
    .eq("tenant_id", tenant)
    .order("updated_at", { ascending: false });
  const pages = (pagesData ?? []) as PageRow[];

  const selected = sp.page && pages.some((p) => p.page_path === sp.page) ? sp.page : pages[0]?.page_path;
  const kind = sp.kind === "click" ? "click" : sp.kind === "scroll" ? "scroll" : "move";
  const dims = pages.find((p) => p.page_path === selected);

  // Fundo do mapa: screenshot de página inteira gerado automaticamente pela URL
  // (domínio do tenant + rota). Capturado no MESMO width da página registrada,
  // para o layout alinhar com as manchas. Campo `bg` permite sobrescrever.
  const { data: domainRow } = await supabase
    .from("tenant_domain")
    .select("domain")
    .eq("tenant_id", tenant)
    .order("domain")
    .limit(1)
    .maybeSingle();
  const domain = (domainRow?.domain as string | undefined) ?? null;
  const shotW = Math.min(Math.max(dims?.width ?? 1280, 360), 1440);
  const autoBg =
    domain && selected
      ? `https://image.thum.io/get/fullpage/width/${shotW}/noanimate/https://${domain}${selected}`
      : null;
  const bgOff = sp.bg === "off"; // permite desligar o fundo
  const bg = bgOff ? null : sp.bg?.trim() || autoBg;

  let cells: HeatCell[] = [];
  let scrollBuckets: ScrollBucket[] = [];
  if (selected) {
    const { data: cellData } = await supabase
      .from("heatmap_cell")
      .select("grid_x, grid_y, weight")
      .eq("tenant_id", tenant)
      .eq("page_path", selected)
      .eq("kind", kind)
      .limit(8000);
    const rows = cellData ?? [];
    if (kind === "scroll") {
      scrollBuckets = rows.map((c) => ({ row: c.grid_y as number, count: Number(c.weight) }));
    } else {
      cells = rows.map((c) => ({ x: c.grid_x as number, y: c.grid_y as number, w: Number(c.weight) }));
    }
  }

  const linkFor = (patch: Record<string, string>) => {
    const q = new URLSearchParams();
    if (selected) q.set("page", patch.page ?? selected);
    q.set("kind", patch.kind ?? kind);
    if (patch.bg ?? bg) q.set("bg", patch.bg ?? bg ?? "");
    return `?${q.toString()}`;
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Mapa de calor</h1>
        <p className="text-sm text-neutral-500">
          Soma de todas as sessões (anônimo) sobre o layout do site. Quente = mais mouse/cliques.
          O fundo é gerado automaticamente; na 1ª vez de cada página pode levar alguns segundos.
        </p>
      </div>

      {pages.length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-sm text-neutral-500">
          Ainda não há dados de calor. Assim que os visitantes navegarem no site com o tracker
          instalado, as páginas aparecem aqui automaticamente.
        </div>
      ) : (
        <>
          {/* Controles */}
          <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-500">Página</span>
              <select name="page" defaultValue={selected} className="rounded-lg border px-3 py-2">
                {pages.map((p) => (
                  <option key={p.page_path} value={p.page_path}>
                    {p.page_path}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-neutral-500">Tipo</span>
              <select name="kind" defaultValue={kind} className="rounded-lg border px-3 py-2">
                <option value="move">Movimento do mouse</option>
                <option value="click">Cliques</option>
                <option value="scroll">Rolagem</option>
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-neutral-500">Fundo do site (automático)</span>
              <input
                name="bg"
                defaultValue={sp.bg && sp.bg !== "off" ? sp.bg : ""}
                placeholder="gerado automático — cole uma URL de imagem p/ trocar, ou 'off' p/ ocultar"
                className="rounded-lg border px-3 py-2"
              />
            </label>
            <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-white">
              Aplicar
            </button>
          </form>

          {/* Abas rápidas */}
          <div className="flex gap-2 text-sm">
            {(
              [
                ["move", "Movimento"],
                ["click", "Cliques"],
                ["scroll", "Rolagem"],
              ] as const
            ).map(([k, label]) => (
              <a
                key={k}
                href={linkFor({ kind: k })}
                className={`rounded-lg px-3 py-1 ${kind === k ? "bg-neutral-900 text-white" : "border"}`}
              >
                {label}
              </a>
            ))}
          </div>

          {kind === "scroll" ? (
            <ScrollMap
              buckets={scrollBuckets}
              pageWidth={dims?.width ?? 0}
              pageHeight={dims?.height ?? 0}
              bg={bg}
            />
          ) : (
            <>
              <div className="text-xs text-neutral-500">
                {cells.length > 0
                  ? `${cells.length} zonas com ${kind === "click" ? "cliques" : "movimento"} em ${selected}`
                  : `Sem ${kind === "click" ? "cliques" : "movimento"} registrados nesta página ainda.`}
              </div>
              <HeatmapCanvas
                cells={cells}
                pageWidth={dims?.width ?? 0}
                pageHeight={dims?.height ?? 0}
                bg={bg}
              />
            </>
          )}

          <p className="text-xs text-neutral-400">
            Dica: para o mapa cair exatamente sobre o seu site, tire um print de{" "}
            <strong>página inteira</strong> na mesma largura em que a maioria acessa, hospede a
            imagem e cole a URL acima.
          </p>
        </>
      )}
    </main>
  );
}
