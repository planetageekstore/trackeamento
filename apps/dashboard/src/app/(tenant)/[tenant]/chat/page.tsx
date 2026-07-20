import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/date";
import { ChatView, type ChatMessage } from "./ChatView";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { tenant } = await params;
  const sp = await searchParams;
  await requireUser();
  await assertTenantAccess(tenant);

  const supabase = await createSupabaseServerClient();
  const { data: tenantRow } = await supabase.from("tenant").select("name").eq("id", tenant).maybeSingle();
  const { data: convs } = await supabase
    .from("chat_conversation")
    .select("id, title, updated_at")
    .eq("tenant_id", tenant)
    .order("updated_at", { ascending: false })
    .limit(30);

  const conversationId = sp.c ?? "";
  let initial: ChatMessage[] = [];
  if (conversationId) {
    const { data: msgs } = await supabase
      .from("chat_message")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    initial = (msgs ?? []).map((m) => ({
      role: m.role as "user" | "assistant",
      text: (m.content as { text?: string }[])?.map((b) => b.text ?? "").join("") ?? "",
    }));
  }

  return (
    <main className="mx-auto flex h-[calc(100vh-0px)] max-w-6xl gap-4 p-6">
      {/* Lista de conversas */}
      <aside className="hidden w-56 shrink-0 flex-col md:flex">
        <Link href={`/${tenant}/chat`} className="mb-2 rounded-lg bg-neutral-900 px-3 py-2 text-center text-sm text-white">
          + Nova conversa
        </Link>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {(convs ?? []).map((c) => (
            <Link
              key={c.id}
              href={`/${tenant}/chat?c=${c.id}`}
              className={`block truncate rounded-lg px-3 py-2 text-sm ${
                c.id === conversationId ? "bg-neutral-100 font-medium" : "text-neutral-600 hover:bg-neutral-50"
              }`}
              title={c.title ?? ""}
            >
              {c.title || "Conversa"}
              <span className="block text-[10px] text-neutral-400">{fmtDateTime(c.updated_at as string, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            </Link>
          ))}
          {(convs ?? []).length === 0 && <p className="px-3 py-2 text-xs text-neutral-400">Nenhuma conversa ainda.</p>}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="mb-3 text-lg font-semibold">Conversar sobre {tenantRow?.name ?? "o cliente"}</h1>
        <ChatView tenant={tenant} conversationId={conversationId} initial={initial} />
      </div>
    </main>
  );
}
