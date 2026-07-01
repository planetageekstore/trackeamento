"use client";

import { useState } from "react";

/** Bloco de código com botão "Copiar". */
export function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard indisponível */
    }
  }

  return (
    <div>
      {label && <p className="mb-1 text-sm font-medium text-neutral-700">{label}</p>}
      <div className="flex items-stretch gap-2">
        <pre className="flex-1 overflow-x-auto rounded-lg border bg-neutral-50 p-3 text-xs text-neutral-800">
          {code}
        </pre>
        <button
          onClick={copy}
          className="shrink-0 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-700"
        >
          {copied ? "Copiado!" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
