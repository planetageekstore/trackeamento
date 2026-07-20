"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TenantSwitcher, type TenantOption } from "@/components/TenantSwitcher";

interface Item {
  label: string;
  href: string;
  icon: string;
  exact?: boolean;
}

export function Sidebar({ tenant, tenants }: { tenant: string; tenants: TenantOption[] }) {
  const pathname = usePathname();
  const router = useRouter();

  const items: Item[] = [
    { label: "Dashboard", href: `/${tenant}`, icon: "📊", exact: true },
    { label: "Chat IA", href: `/${tenant}/chat`, icon: "💬" },
    { label: "Leads", href: `/${tenant}/leads`, icon: "👥" },
    { label: "CRM", href: `/${tenant}/crm`, icon: "📋" },
    { label: "Análise", href: `/${tenant}/analise`, icon: "📈" },
    { label: "Conversões", href: `/${tenant}/conversions`, icon: "🎯" },
    { label: "Campanhas", href: `/${tenant}/campaigns`, icon: "📣" },
    { label: "Engenheiro de Oferta", href: `/${tenant}/oferta`, icon: "🧠" },
    { label: "Mapa de calor", href: `/${tenant}/heatmap`, icon: "🔥" },
    { label: "Conversas", href: `/${tenant}/conversas`, icon: "💬" },
    { label: "WhatsApp", href: `/${tenant}/whatsapp`, icon: "🔗" },
    { label: "Integrações", href: `/${tenant}/integracoes`, icon: "🔌" },
  ];

  const isActive = (it: Item) =>
    it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(`${it.href}/`);

  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-white">
      <TenantSwitcher tenant={tenant} tenants={tenants} />

      <nav className="flex-1 space-y-1 p-3">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              isActive(it) ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            <span>{it.icon}</span>
            {it.label}
          </Link>
        ))}
      </nav>

      <div className="space-y-1 border-t p-3 text-sm">
        <Link href="/settings" className="block rounded-lg px-3 py-2 text-neutral-600 hover:bg-neutral-100">
          🔑 Credenciais
        </Link>
        <button
          onClick={signOut}
          className="block w-full rounded-lg px-3 py-2 text-left text-neutral-600 hover:bg-neutral-100"
        >
          ↩ Sair
        </button>
      </div>
    </aside>
  );
}
