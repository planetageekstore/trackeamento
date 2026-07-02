import Link from "next/link";
import { requireUser, assertTenantAccess } from "@/lib/auth";
import { listChats, getMessages, type ChatItem } from "@/server/integrations/uazapi";

export const dynamic = "force-dynamic";

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

function fmtTime(ts: number): string {
  if (!ts) return "";
  const ms = ts < 1e12 ? ts * 1000 : ts;
  return new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Avatar({ chat }: { chat: ChatItem }) {
  if (chat.photo) {
    return <img src={chat.photo} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-600">
      {initials(chat.name)}
    </div>
  );
}

export default async function ConversasPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ chat?: string }>;
}) {
  const { tenant } = await params;
  const sp = await searchParams;
  await requireUser();
  await assertTenantAccess(tenant);

  const chats = await listChats(tenant);
  const selectedId = sp.chat ?? chats[0]?.id ?? "";
  const selected = chats.find((c) => c.id === selectedId);
  const messages = selectedId ? await getMessages(tenant, selectedId) : [];

  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Conversas</h1>

      {chats.length === 0 ? (
        <p className="rounded-lg border bg-white p-4 text-sm text-neutral-500">
          Nenhuma conversa encontrada. Conecte o WhatsApp em <b>WhatsApp</b> e aguarde as conversas
          sincronizarem.
        </p>
      ) : (
        <div className="flex h-[70vh] overflow-hidden rounded-xl border bg-white">
          {/* Lista de conversas */}
          <div className="w-72 shrink-0 overflow-y-auto border-r">
            {chats.map((c) => (
              <Link
                key={c.id}
                href={`?chat=${encodeURIComponent(c.id)}`}
                className={`flex items-center gap-3 border-b px-3 py-3 hover:bg-neutral-50 ${
                  c.id === selectedId ? "bg-neutral-100" : ""
                }`}
              >
                <Avatar chat={c} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    {c.unread > 0 && (
                      <span className="rounded-full bg-emerald-500 px-1.5 text-xs text-white">{c.unread}</span>
                    )}
                  </div>
                  <p className="truncate text-xs text-neutral-500">{c.lastMessage || c.phone}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Mensagens (somente leitura) */}
          <div className="flex flex-1 flex-col">
            {selected ? (
              <>
                <div className="flex items-center gap-3 border-b px-4 py-3">
                  <Avatar chat={selected} />
                  <div>
                    <p className="text-sm font-medium">{selected.name}</p>
                    <p className="text-xs text-neutral-500">{selected.phone}</p>
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto bg-neutral-50 p-4">
                  {messages.map((m) => (
                    <div key={m.id} className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                          m.fromMe ? "bg-emerald-100" : "bg-white border"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.text || <em className="text-neutral-400">(mídia)</em>}</p>
                        <p className="mt-1 text-right text-[10px] text-neutral-400">{fmtTime(m.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                  {messages.length === 0 && (
                    <p className="text-center text-sm text-neutral-400">Sem mensagens para exibir.</p>
                  )}
                </div>
                <div className="border-t px-4 py-2 text-center text-xs text-neutral-400">
                  Visualização somente leitura — o envio de mensagens não é permitido por aqui.
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">
                Selecione uma conversa.
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
