# Contract — Integrações Externas (Meta · Google Ads · Nuvemshop)

Todas as conexões guardam tokens **cifrados** (`integration.*_enc`) e expõem status (`connected`/`needs_reconnect`/`revoked`/`error`). OAuth callbacks em `/api/oauth/{provider}`.

---

## Meta Ads

**OAuth**: Facebook Login, escopos `ads_read`, `ads_management`. Guardar `access_token` long-lived + `pixel_id` + `ad_account_id` (`meta.pixel_id`, `account_ref`).

**Leitura (cron, ≤24h — SC-005)**:
`GET /v{API_VER}/{ad_account_id}/insights?level=campaign&fields=spend,impressions,ctr,cpm,campaign_id,campaign_name&time_increment=1`
→ upsert em `campaign_cost` (provider=`meta`).

**Escrita — Conversions API (FR-018)**:
`POST /v{API_VER}/{pixel_id}/events`
```json
{
  "data": [{
    "event_name": "Purchase",
    "event_time": 1751284800,
    "action_source": "website",
    "user_data": {
      "ph": ["<sha256(phone_e164)>"],
      "em": ["<sha256(email)>"],
      "fbc": "fb.1.<click_ts>.<fbclid>"
    },
    "custom_data": { "value": 199.90, "currency": "BRL" }
  }],
  "test_event_code": "TEST12345"
}
```
- `fbc` derivado do `fbclid` guardado (alta EMQ — SC-004). PII sempre SHA-256 normalizada.
- Registrar resultado em `conversion_dispatch` (target=`meta_capi`).

---

## Google Ads

**OAuth**: `refresh_token` + `Developer Token` (`meta.developer_token_ref`), `customer_id` (`account_ref`), `conversion_action` (`meta.conversion_action`).

**Leitura (cron)**: GAQL
```sql
SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks
FROM campaign WHERE segments.date DURING LAST_7_DAYS
```
→ `spend = cost_micros / 1e6`; upsert `campaign_cost` (provider=`google`).

**Escrita — Offline Click Conversions (FR-018)**:
`ConversionUploadService.UploadClickConversions` com:
```json
{
  "conversions": [{
    "gclid": "<gclid_guardado>",
    "conversion_action": "customers/123/conversionActions/456",
    "conversion_date_time": "2026-06-28 10:15:00-03:00",
    "conversion_value": 199.90,
    "currency_code": "BRL"
  }]
}
```
- `conversion_date_time` = hora do clique original (do `click`). Registrar em `conversion_dispatch` (target=`google_offline`).

---

## Nuvemshop

**OAuth (Apps Parceiros)**: `code` → `access_token` + `user_id` (loja). Guardar cifrado (`account_ref`=store id).

**Injeção de script (FR-017)**:
`POST /v1/{store_id}/scripts`
```json
{ "src": "https://cdn.<saas>/t/v1/tracker.js?sk=pk_live_ab12cd34", "event": "onload", "where": "store" }
```

**Webhook `order/paid` (FR-012)**:
- Registrar: `POST /v1/{store_id}/webhooks` `{ "event": "order/paid", "url": "https://<saas>/api/webhooks/nuvemshop" }`.
- Recebimento: validar HMAC (`x-linkedstore-hmac-sha256`); extrair `TRK` de `order.note`/atributos via regex; upsert `event` PURCHASE (`value`, `currency`), dedup por `order.id` (`external_id`).
- Sem `TRK` → `attributed=false` (FR-013).

---

## Estados de falha (FR-019)

| Situação | Ação |
|----------|------|
| Token expirado/revogado (401/190) | `integration.status = needs_reconnect`; painel exibe "reconectar"; não afeta outros tenants |
| Rate limit (429) | backoff + retry na fila; sem perda de dados |
| Erro de validação no envio | `conversion_dispatch.status=failed` + `response`; retry limitado |
