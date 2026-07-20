import Link from "next/link";

/**
 * Paginação server-side reutilizável. Monta links preservando os demais search
 * params (aba, filtros). Página 1-based.
 */
export function Pagination({
  page,
  total,
  pageSize,
  baseParams,
}: {
  page: number;
  total: number;
  pageSize: number;
  /** Search params atuais a preservar (sem `page`). */
  baseParams?: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(baseParams ?? {})) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-4 pt-3 text-sm text-neutral-600">
      <span className="text-neutral-400">
        {from}–{to} de {total.toLocaleString("pt-BR")}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="rounded-lg border bg-white px-3 py-1.5 hover:bg-neutral-50">
            « Anterior
          </Link>
        ) : (
          <span className="rounded-lg border px-3 py-1.5 text-neutral-300">« Anterior</span>
        )}
        <span className="px-1">
          Página {page} de {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className="rounded-lg border bg-white px-3 py-1.5 hover:bg-neutral-50">
            Próxima »
          </Link>
        ) : (
          <span className="rounded-lg border px-3 py-1.5 text-neutral-300">Próxima »</span>
        )}
      </div>
    </div>
  );
}
