"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

type Status = "checking" | "idle" | "connecting" | "open" | "error";

const isConnected = (s: string) => s === "open" || s === "connected";

export default function WhatsAppPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("checking");

  // Ao abrir a página, consulta o estado real. Se a sessão já está salva na
  // Uazapi, mostramos "conectado" sem pedir QR de novo.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/whatsapp/status?tenantId=${tenant}`);
        const data = (await res.json()) as { qr: string | null; state: string };
        if (!alive) return;
        setStatus(isConnected(data.state) ? "open" : "idle");
      } catch {
        if (alive) setStatus("idle");
      }
    })();
    return () => {
      alive = false;
    };
  }, [tenant]);

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
      if (isConnected(data.state)) setStatus("open");
    } catch {
      setStatus("error");
    }
  }, [tenant]);

  // Enquanto conectando, faz polling do estado e atualiza o QR.
  useEffect(() => {
    if (status !== "connecting") return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/whatsapp/status?tenantId=${tenant}`);
        const data = (await res.json()) as { qr: string | null; state: string };
        if (isConnected(data.state)) {
          setStatus("open");
          setQr(null);
        } else if (data.qr) {
          setQr(data.qr);
        }
      } catch {
        /* mantém tentando */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [status, tenant]);

  return (
    <main className="mx-auto max-w-md space-y-6 p-8">
      <h1 className="text-xl font-semibold">WhatsApp</h1>

      {status === "checking" && (
        <p className="text-sm text-neutral-500">Verificando conexão…</p>
      )}

      {status === "open" && (
        <div className="space-y-4">
          <p className="rounded bg-emerald-100 p-4 text-emerald-800">
            ✓ WhatsApp conectado. A sessão fica salva — você não precisa escanear o QR de novo.
          </p>
          <Link
            href={`/${tenant}/conversas`}
            className="inline-block rounded bg-neutral-900 px-4 py-2 text-white"
          >
            Ver conversas
          </Link>
          <details className="text-sm text-neutral-500">
            <summary className="cursor-pointer">Trocar de número / reconectar</summary>
            <p className="mt-2">
              Só use isto para conectar um número diferente — vai gerar um novo QR.
            </p>
            <button
              onClick={connect}
              className="mt-2 rounded border px-3 py-1.5 text-neutral-700 hover:bg-neutral-100"
            >
              Gerar novo QR
            </button>
          </details>
        </div>
      )}

      {(status === "idle" || status === "connecting" || status === "error") && (
        <>
          <p className="text-sm text-neutral-600">
            Clique em conectar e escaneie o QR code com o WhatsApp (Aparelhos conectados → Conectar um
            aparelho). É só na primeira vez — depois a sessão fica salva.
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
