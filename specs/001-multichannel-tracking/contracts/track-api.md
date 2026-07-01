# Contract — Ingestão de Eventos (`/api/track`)

Endpoint público consumido pelo `tracker.js`. Idempotente, leve, responde rápido (202) e enfileira.

## POST /api/track

**Auth**: site key pública no corpo (`sk`) + validação de `Origin`/`Referer` contra a allowlist de domínios do tenant. Rate limit por site key + IP.

**Request (application/json)**:
```json
{
  "sk": "pk_live_ab12cd34",
  "trk": "TRK-8ZK4Q2M7XR9A",
  "events": [
    {
      "type": "PAGE_VIEW",
      "occurred_at": "2026-06-30T12:00:00.000Z",
      "url": "https://loja.com.br/produto/x?utm_source=meta&utm_medium=cpc&fbclid=abc",
      "referrer": "https://l.instagram.com/",
      "utm": { "source": "meta", "medium": "cpc", "campaign": "black", "content": "ad1", "term": null },
      "click_ids": { "fbclid": "abc", "gclid": null },
      "data": {}
    }
  ]
}
```

**Regras**:
- `type` ∈ `{PAGE_VIEW, WHATSAPP_CLICK, CHECKOUT}` (eventos de origem no browser). `MESSAGE_RECEIVED`/`PURCHASE` NÃO vêm por aqui (chegam por webhook).
- Batch de até N eventos; `trk` obrigatório (gerado no cliente).
- `utm`/`click_ids` só relevantes no primeiro `PAGE_VIEW` da sessão, mas aceitos em todos.

**Responses**:
| Código | Significado |
|--------|-------------|
| 202 Accepted | `{ "ok": true }` — enfileirado |
| 400 | payload inválido (Zod) |
| 401/403 | site key inválida ou domínio fora da allowlist |
| 429 | rate limit |

**Efeito (assíncrono no worker)**:
1. Upsert `lead` por (`tenant_id`, `trk`).
2. Se houver `utm`/`click_ids` novos → insere `click` (nenhum toque descartado).
3. Insere `event` correspondente.

**Não-funcional**: p95 < 200 ms; falhas do backend não devem retornar erro que quebre o tracker — o tracker ignora silenciosamente qualquer resposta ≠ 2xx (FR-006).

## GET /api/track/health
Retorna 200 `{status:"ok"}` — usado pelo tracker para decidir envio via `sendBeacon` vs. skip.
