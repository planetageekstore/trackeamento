"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export interface TenantOption {
  id: string;
  name: string;
}

/**
 * Cabeçalho da sidebar com troca de cliente. Mostra o cliente atual + chevron;
 * ao abrir, lista os clientes que o usuário acessa (já filtrados por RLS na
 * query do layout). Trocar preserva a página atual (troca só o segmento do
 * tenant no pathname). Com 1 cliente só, vira cabeçalho estático (sem chevron).
 */
export function TenantSwitcher({
  tenant,
  tenants,
}: {
  tenant: string;
  tenants: TenantOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const current = tenants.find((t) => t.id === tenant);
  const currentName = current?.name ?? "Cliente";
  const single = tenants.length <= 1;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Troca o segmento do tenant preservando o resto da rota atual.
  function switchTo(id: string) {
    setOpen(false);
    if (id === tenant) return;
    const parts = (pathname ?? `/${tenant}`).split("/");
    parts[1] = id; // ["", tenant, "campaigns", ...]
    router.push(parts.join("/") || `/${id}`);
  }

  if (single) {
    return (
      <div className="border-b p-4">
        <p className="text-xs uppercase tracking-wide text-neutral-400">Cliente</p>
        <p className="truncate font-semibold">{currentName}</p>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative border-b">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-4 text-left hover:bg-neutral-50"
      >
        <span className="min-w-0">
          <span className="block text-xs uppercase tracking-wide text-neutral-400">Cliente</span>
          <span className="block truncate font-semibold">{currentName}</span>
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-2 right-2 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-white py-1 shadow-lg"
        >
          {tenants.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={t.id === tenant}
              onClick={() => switchTo(t.id)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-100 ${
                t.id === tenant ? "font-medium" : "text-neutral-700"
              }`}
            >
              <span className="truncate">{t.name}</span>
              {t.id === tenant && <span className="shrink-0 text-emerald-600">✓</span>}
            </button>
          ))}
          <div className="my-1 border-t" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/tenants");
            }}
            className="w-full px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100"
          >
            Ver todos os clientes →
          </button>
        </div>
      )}
    </div>
  );
}
