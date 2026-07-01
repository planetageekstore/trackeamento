"use client";

import { use, useCallback, useEffect, useState } from "react";

type Status = "idle" | "connecting" | "open" | "close" | "error";

export default function WhatsAppPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const connect = useCallback(async () => {
    setStatus("connecting");
    setQr(null);
    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: tenant }),
      });
      if (!res.ok) throw new Error();
      const { qr } = (await res.json()) as { qr: string | null };
      setQr(qr);
    } catch {
      setStatus("error");
    }
  }, [tenant]);

  // Polling do estado enquanto conectando.
  useEffect(() => {
    if (status !== "connecting") return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/whatsapp/status?tenantId=${tenant}`);
        const { state } = (await res.json()) as { state: string };
        if (state === "open") {
          setStatus("open");
          setQr(null);
        }
      } catch {
        /* mantém tentando */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [status, tenant]);

  return (
    <main className="mx-auto max-w-md space-y-6 p-8">
      <h1 className="text-xl font-semibold">Conectar WhatsApp</h1>

      {status === "open" ? (
        <p className="rounded bg-emerald-100 p-4 text-emerald-800">✓ WhatsApp conectado.</p>
      ) : (
        <>
          <p className="text-sm text-neutral-600">
            Clique em conectar e escaneie o QR code com o WhatsApp do cliente
            (Aparelhos conectados → Conectar um aparelho).
          </p>
          <button onClick={connect} className="rounded bg-neutral-900 px-4 py-2 text-white">
            {status === "connecting" ? "Gerando QR..." : "Conectar / gerar QR"}
          </button>
          {/* QR retornado como data-URI base64 pela Evolution; <img> simples é suficiente. */}
          {qr && <img src={qr} alt="QR code do WhatsApp" className="mx-auto h-64 w-64" />}
          {status === "error" && <p className="text-sm text-red-600">Falha ao conectar. Tente de novo.</p>}
        </>
      )}
    </main>
  );
}
