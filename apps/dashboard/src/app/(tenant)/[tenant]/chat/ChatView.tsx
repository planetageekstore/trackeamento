"use client";

import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "Qual campanha teve o melhor CPL nos últimos 7 dias?",
  "Como está a evolução dos meus leads este mês?",
  "Onde estou desperdiçando verba?",
  "Quais integrações preciso conectar?",
];

export function ChatView({
  tenant,
  conversationId: initialConvId,
  initial,
}: {
  tenant: string;
  conversationId: string;
  initial: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [convId, setConvId] = useState(initialConvId);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, toolStatus]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    setStreaming(true);
    setToolStatus(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: tenant, conversationId: convId || undefined, message: text }),
      });
      if (!res.body) throw new Error("sem stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.type === "conversation") setConvId(evt.conversationId);
          else if (evt.type === "text") {
            setToolStatus(null);
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant") last.text += evt.text;
              return copy;
            });
          } else if (evt.type === "tool") setToolStatus(`consultando dados (${evt.name})…`);
          else if (evt.type === "error") {
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last && last.role === "assistant") last.text = `Erro: ${evt.error}`;
              return copy;
            });
          }
        }
      }
    } catch (e) {
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant" && !last.text) last.text = e instanceof Error ? e.message : "Falha.";
        return copy;
      });
    } finally {
      setStreaming(false);
      setToolStatus(null);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-white">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {empty && (
          <div className="mx-auto max-w-md pt-10 text-center">
            <p className="text-sm text-neutral-500">
              Pergunte sobre campanhas, leads, conversões — tenho acesso aos dados deste cliente.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800"
              }`}
            >
              {m.text || (streaming && i === messages.length - 1 ? "…" : "")}
            </div>
          </div>
        ))}
        {toolStatus && <p className="text-center text-xs text-neutral-400">{toolStatus}</p>}
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder="Pergunte sobre este cliente…"
            disabled={streaming}
            className="flex-1 resize-none rounded-lg border p-2.5 text-sm disabled:opacity-60"
          />
          <button
            onClick={() => send(input)}
            disabled={streaming || !input.trim()}
            className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm text-white disabled:opacity-50"
          >
            {streaming ? "…" : "Enviar"}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-neutral-400">Enter envia · Shift+Enter nova linha</p>
      </div>
    </div>
  );
}
