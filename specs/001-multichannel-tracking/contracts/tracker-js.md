# Contract — `tracker.js` (script first-party)

Servido versionado via CDN: `https://cdn.<saas>/t/v1/tracker.js`. Bundle IIFE, ≤15KB gzip, zero deps.

## Snippet de instalação (no site do cliente)

```html
<script async src="https://cdn.<saas>/t/v1/tracker.js" data-site-key="pk_live_ab12cd34"></script>
```

Na Nuvemshop o snippet é injetado automaticamente via `POST /scripts` (ver integrations.md).

## Storage (LocalStorage)

| Chave | Conteúdo |
|-------|----------|
| `_saas_trk_id` | Tracking ID (`TRK-XXXX`) |
| `_saas_trk_src` | primeira origem capturada (UTMs + click ids) em JSON |

## Funções (comportamento)

| Função | Responsabilidade | Requisito |
|--------|------------------|-----------|
| `parseURL()` | extrai `utm_*`, `fbclid`, `gclid` de `location.search` | FR-002 |
| `initLead()` | se não há `_saas_trk_id`, gera `TRK-` + 12 chars base32 e envia `PAGE_VIEW` assíncrono | FR-001, FR-006, FR-007 |
| `storeLocal()` | persiste `TRK` e origem no LocalStorage | FR-003, FR-005 |
| `interceptWhatsApp()` | reescreve `href` de `wa.me`/`api.whatsapp.com` acrescentando `[Ref: TRK-XXXX]` ao `text=` (idempotente); `MutationObserver` p/ botões dinâmicos | FR-008 |
| `sendEvent(type, data?)` | envia evento via `navigator.sendBeacon` (fallback `fetch` keepalive) | — |

## API global exposta

```js
window._saasTrk = {
  getId(): string,               // TRK atual (para checkout/e-commerce — FR-009)
  track(type, data): void        // eventos custom (ex.: CHECKOUT)
}
```

## Garantias

- **Não bloqueante** (SC-001): nenhum trabalho síncrono pesado; envio sempre assíncrono.
- **Resiliente** (FR-006): qualquer erro de rede/exceção é capturado (`try/catch`) e ignorado; o site nunca quebra.
- **Idempotente**: reexecução não duplica o marcador `[Ref: ...]` nem cria novo `TRK`.
- **Continuidade** (SC-007): `TRK` reutilizado entre páginas e reaberturas de aba.
