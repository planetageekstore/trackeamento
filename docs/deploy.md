# Deploy

Três alvos independentes: **dashboard/API** (Vercel), **tracker.js** (CDN), **worker** (VPS/Docker),
com **Supabase** como banco/auth.

## 1. Supabase

1. Criar projeto no Supabase.
2. Aplicar migrations: `supabase db push` (ou `supabase db reset` em dev, que roda o `seed.sql`).
3. Configurar a chave mestra de cripto **fora do banco**: definir `SECRETS_ENCRYPTION_KEY`
   nos ambientes do dashboard e do worker (mesmo valor).
4. Deploy da Edge Function de cron: `supabase functions deploy import-costs` e agendar
   (ex.: a cada 6h) com `APP_URL` e `CRON_SECRET` nos secrets da função.

## 2. Dashboard / API (Vercel)

- Importar `apps/dashboard` (monorepo pnpm).
- Variáveis: ver `apps/dashboard/.env.example` (Supabase, `SECRETS_ENCRYPTION_KEY`,
  `WORKER_URL`/`WORKER_SHARED_TOKEN`, credenciais Meta/Google/Nuvemshop, `CRON_SECRET`).
- Configurar os *redirect URIs* nos apps Meta/Google/Nuvemshop apontando para
  `${APP_URL}/api/oauth/{provider}`.

## 3. tracker.js (CDN)

- `pnpm --filter tracker build` gera `apps/tracker/dist/tracker.js`.
- Publicar como asset estático versionado em `/t/v1/tracker.js` (Supabase Storage + CDN,
  Vercel, ou outro). Build com `TRACKER_API_BASE=${APP_URL}` para fixar a API de ingestão.
- Snippet do cliente: `<script async src=".../t/v1/tracker.js" data-site-key="pk_live_..."></script>`.

## 4. Worker (VPS/Docker)

- `docker compose -f docker/docker-compose.yml up -d` (Evolution API + Redis + worker).
- Variáveis: ver `services/whatsapp-worker/.env.example` (Supabase service role,
  `SECRETS_ENCRYPTION_KEY`, `EVOLUTION_*`, `WEBHOOK_SHARED_TOKEN`, `WORKER_PUBLIC_URL`,
  credenciais Google para envio offline).
- `WORKER_PUBLIC_URL` deve ser alcançável pela Evolution (webhook de mensagens) e pelo
  dashboard (provisionamento de instância + `/dispatch`).

## Revisão de idempotência (T069)

Pontos onde reprocessamento não pode duplicar efeito — todos cobertos:

| Fonte | Chave de dedup | Onde |
|-------|----------------|------|
| Lead (mesmo TRK) | `unique (tenant_id, tracking_code)` + upsert | `ingest.ts`, `0002_data.sql` |
| Mensagem WhatsApp | checagem por `message.id` antes de inserir | `ingest/message.ts` |
| Venda Nuvemshop | checagem por `order:{id}` antes de inserir | `webhooks/nuvemshop` |
| Envio server-side | `unique (event_id, target)` + `claim()` não reenvia `sent` | `ingest/dispatch.ts`, `0002_data.sql` |
| Injeção de script Nuvemshop | lista antes; só injeta se ausente | `integrations/nuvemshop.ts` |
| Webhook Nuvemshop (reautorização) | lista antes; só registra se ausente | `integrations/nuvemshop.ts` |
| Custos por campanha | `unique (tenant_id, provider, campaign_id, date)` + upsert | `0002_data.sql` |

## Checklist pós-deploy

- [ ] Rodar o [quickstart.md](../specs/001-multichannel-tracking/quickstart.md) ponta a ponta.
- [ ] Validar o payload da CAPI no Gerenciador de Eventos (nota verde de EMQ — SC-004).
- [ ] Testar isolamento multi-tenant com dois usuários (SC-006).
