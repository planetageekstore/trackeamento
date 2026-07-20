"use client";

import { useState } from "react";
import { perguntarEngenheiro } from "./actions";

export function EngineerChat({ tenant }: { tenant: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSend() {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer("");
    try {
      const a = await perguntarEngenheiro({ tenantId: tenant, question });
      setAnswer(a);
    } catch (e) {
      setAnswer(e instanceof Error ? e.message : "Falha ao responder.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-5">
        {answer ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{answer}</p>
        ) : (
          <p className="text-sm text-neutral-400">
            Pergunte, peça uma headline, um ângulo, uma reescrita de copy, uma estrutura de oferta… A IA lê as notas da
            biblioteca antes de responder.
          </p>
        )}
      </div>
      <div className="flex items-end gap-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSend();
          }}
          rows={3}
          placeholder="Ex.: me dê 5 headlines no estilo Halbert para um curso de inglês…"
          className="flex-1 resize-y rounded-lg border p-3 text-sm"
        />
        <button
          onClick={onSend}
          disabled={loading}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "…" : "Enviar"}
        </button>
      </div>
      <p className="text-xs text-neutral-400">⌘/Ctrl + Enter para enviar</p>
    </div>
  );
}
