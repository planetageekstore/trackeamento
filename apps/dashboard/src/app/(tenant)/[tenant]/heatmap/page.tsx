import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HeatmapCanvas, type HeatCell } from "@/components/HeatmapCanvas";

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
  const kind = sp.kind === "click" ? "click" : "move";
  const bg = sp.bg?.trim() || null;
  const dims = pages.find((p) => p.page_path === selected);

  let cells: HeatCell[] = [];
  if (selected) {
    const { data: cellData } = await supabase
      .from("heatmap_cell")
      .select("grid_x, grid_y, weight")
      .eq("tenant_id", tenant)
      .eq("page_path", selected)
      .eq("kind", kind)
      .limit(8000);
    cells = (cellData ?? []).map((c) => ({
      x: c.grid_x as number,
      y: c.grid_y as number,
      w: Number(c.weight),
    }));
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
          Onde os visitantes mais passam o mouse (agregado e anônimo). Quente = mais interesse.
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
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-neutral-500">Screenshot da página (URL, opcional)</span>
              <input
                name="bg"
                defaultValue={bg ?? ""}
                placeholder="https://... (print de página inteira p/ alinhar o mapa)"
                className="rounded-lg border px-3 py-2"
              />
            </label>
            <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-white">
              Aplicar
            </button>
          </form>

          {/* Abas rápidas movimento/click */}
          <div className="flex gap-2 text-sm">
            <a
              href={linkFor({ kind: "move" })}
              className={`rounded-lg px-3 py-1 ${kind === "move" ? "bg-neutral-900 text-white" : "border"}`}
            >
              Movimento
            </a>
            <a
              href={linkFor({ kind: "click" })}
              className={`rounded-lg px-3 py-1 ${kind === "click" ? "bg-neutral-900 text-white" : "border"}`}
            >
              Cliques
            </a>
          </div>

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
