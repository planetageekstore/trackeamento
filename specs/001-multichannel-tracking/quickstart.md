# Quickstart — Validação Ponta a Ponta

Guia para subir o ambiente e validar cada user story. Detalhes de schema em [data-model.md](data-model.md); contratos em [contracts/](contracts/).

## Pré-requisitos

- Node 20 + pnpm; Docker (para Evolution API + Redis); conta Supabase (projeto criado).
- Contas de teste: Meta (app + pixel de teste), Google Ads (test account + developer token), Nuvemshop (loja de testes/partner), um número de WhatsApp para o QR.
- `.env` por app (chaves Supabase, chave mestra de cripto, URLs Evolution, credenciais OAuth).

## Setup

```bash
pnpm install
# Banco
supabase db push                      # aplica migrations (schema + RLS)
# Serviços always-on (VPS ou local)
docker compose -f docker/docker-compose.yml up -d   # evolution-api + redis + worker
# Tracker
pnpm --filter tracker build           # gera apps/tracker/dist/tracker.js
# Painel
pnpm --filter dashboard dev           # http://localhost:3000
```

## Cenários de validação

### US1 — RG do lead + captura de origem (P1)
1. Abrir a página de teste com o snippet e `?utm_source=meta&utm_medium=cpc&fbclid=abc`.
2. **Esperado**: `localStorage._saas_trk_id` = `TRK-...`; um `lead` + um `click` (com utm/fbclid) no banco.
3. Navegar para outra página → **mesmo** `TRK`, sem novo lead (SC-007).
4. Derrubar o backend e recarregar → página funciona normal, `TRK` persiste (FR-006/SC-001).

### US2 — WhatsApp hand-off + atribuição (P1)
1. Clicar no botão de WhatsApp → conferir que a URL contém `text=...%20%5BRef%3A%20TRK-...%5D`.
2. Conectar a instância Evolution pelo QR no painel; enviar do celular a mensagem pré-preenchida.
3. **Esperado**: `event` `MESSAGE_RECEIVED` `attributed=true` vinculado ao lead; `lead.phone` preenchido.
4. Enviar mensagem sem `[Ref: ...]` → `attributed=false` (conciliação).

### US3 — Venda Nuvemshop (P2)
1. Autorizar a app na loja de teste → confirmar script injetado (`GET /scripts`) e webhook registrado.
2. Fazer um pedido de teste carregando um `TRK` conhecido e marcá-lo como **pago**.
3. **Esperado**: `event` `PURCHASE` com `value` vinculado ao lead; reenvio do mesmo webhook não duplica (FR-014).

### US4 — Custos de anúncio (P2)
1. Conectar Meta e Google (OAuth) no painel.
2. Rodar o cron de importação.
3. **Esperado**: `campaign_cost` populado; painel mostra custo por campanha do período (SC-005).

### US5 — Conversões server-side (P3)
1. Para um lead com `fbclid`/`gclid` que converteu, disparar o envio.
2. **Esperado (Meta)**: evento aceito sem erro; nota **verde** na ferramenta de teste de eventos (SC-004) usando `test_event_code`.
3. **Esperado (Google)**: conversão offline aceita, atrelada ao `gclid` + hora do clique.
4. `conversion_dispatch` registra `sent`; reenvio é bloqueado por `unique(event_id, target)`.

### Isolamento multi-tenant (SC-006)
- Logar como `client_user` do Tenant A e tentar ler dados do Tenant B → **negado** por RLS.
- `agency_admin` vê todos os tenants da sua agência; nenhum de outra agência.

## Testes automatizados

```bash
pnpm test              # unit (regex TRK, parse UTM, atribuição, cripto)
pnpm --filter tracker test:e2e   # playwright: geração/persistência/intercept/resiliência
pnpm test:contract     # /api/track, webhooks nuvemshop/evolution
```
