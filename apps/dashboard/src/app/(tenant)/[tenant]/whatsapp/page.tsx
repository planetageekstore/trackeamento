"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "checking" | "idle" | "connecting" | "error";

const isConnected = (s: string) => s === "open" || s === "connected";

export default function WhatsAppPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params);
  const router = useRouter();
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("checking");

  const goToConversas = useCallback(() => {
    router.replace(`/${tenant}/conversas`);
  }, [router, tenant]);

  // Ao abrir: se a sessão já está salva na Uazapi, vai direto pras conversas.
  // Só mostra a tela de QR quando realmente não há conexão. `?reconnect=1`
  // força a tela de QR para trocar de número.
  useEffect(() => {
    const force =
      typeof window !== "undefined" && new URLSearchParams(window.location.search).get("reconnect") === "1";
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/whatsapp/status?tenantId=${tenant}`);
        const data = (await res.json()) as { qr: string | null; state: string };
        if (!alive) return;
        if (isConnected(data.state) && !force) {
          goToConversas();
        } else {
          setStatus("idle");
        }
      } catch {
        if (alive) setStatus("idle");
      }
    })();
    return () => {
      alive = false;
    };
  }, [tenant, goToConversas]);

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
      const data = (await res.json()) as { qr: string | null; state: string };
      setQr(data.qr);
      if (isConnected(data.state)) goToConversas();
    } catch {
      setStatus("error");
    }
  }, [tenant, goToConversas]);

  // Enquanto conectando, faz polling; ao conectar, vai pras conversas.
  useEffect(() => {
    if (status !== "connecting") return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/whatsapp/status?tenantId=${tenant}`);
        const data = (await res.json()) as { qr: string | null; state: string };
        if (isConnected(data.state)) {
          clearInterval(id);
          goToConversas();
        } else if (data.qr) {
          setQr(data.qr);
        }
      } catch {
        /* mantém tentando */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [status, tenant, goToConversas]);

  return (
    <main className="mx-auto max-w-md space-y-6 p-8">
      <h1 className="text-xl font-semibold">Conectar WhatsApp</h1>

      {status === "checking" ? (
        <p className="text-sm text-neutral-500">Verificando conexão…</p>
      ) : (
        <>
          <p className="text-sm text-neutral-600">
            Escaneie o QR code com o WhatsApp (Aparelhos conectados → Conectar um aparelho). É só na
            primeira vez — depois a sessão fica salva e você cai direto nas conversas.
          </p>
          <button onClick={connect} className="rounded bg-neutral-900 px-4 py-2 text-white">
            {status === "connecting" ? "Gerando QR..." : "Conectar / gerar QR"}
          </button>
          {qr && <img src={qr} alt="QR code do WhatsApp" className="mx-auto h-64 w-64" />}
          {status === "connecting" && !qr && (
            <p className="text-sm text-neutral-500">Preparando o QR code...</p>
          )}
          {status === "error" && (
            <p className="text-sm text-red-600">Falha ao conectar. Tente de novo.</p>
          )}
        </>
      )}
    </main>
  );
}
