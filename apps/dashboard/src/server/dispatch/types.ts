/** Contexto de uma conversão a enviar (evento + lead + clique de origem). */
export interface SendContext {
  event: {
    id: string;
    kind: "purchase" | "lead";
    value: number;
    currency: string;
    occurredAt: string;
  };
  lead: { phone: string | null; email: string | null; gaClientId: string | null };
  click: { fbclid: string | null; gclid: string | null; clickedAt: string | null } | null;
}

export interface SendResult {
  ok: boolean;
  matchQuality?: string;
  response?: unknown;
  error?: string;
  /** True quando o token precisa reconectar (401/190) — pausa o provider. */
  needsReconnect?: boolean;
  /** True quando não há dado mínimo p/ enviar (ex.: sem gclid) — marca skipped. */
  skip?: boolean;
}
