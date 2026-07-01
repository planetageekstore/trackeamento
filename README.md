# Sistema de Trackeamento e Atribuição Multi-Canal (SaaS)

Plataforma multi-tenant que gera um **RG Único (`TRK-XXXX`)** por visitante e amarra a
jornada do lead: anúncio (Meta/Google Ads) → site (Nuvemshop/landing) → WhatsApp → venda.
Rastreamento *first-party* (UTMs + `fbclid`/`gclid`), conversões atribuídas e envio
server-side (Meta CAPI / Google Offline).

Spec e decisões em [`specs/001-multichannel-tracking/`](specs/001-multichannel-tracking/).

## Arquitetura (monorepo pnpm)

| Pacote | Papel |
|--------|-------|
| `apps/dashboard` | Next.js 15 — painel + API pública (`/api/track`), OAuth, webhooks |
| `apps/tracker` | `tracker.js` first-party (esbuild, ≤15KB gzip) |
| `services/whatsapp-worker` | Serviço always-on (VPS/Docker): Evolution API + fila BullMQ + senders |
| `supabase/` | Migrations (schema + RLS + cripto) e Edge Functions |
| `packages/shared` | Tipos, regex canônico do `TRK`, UTM/telefone, Zod, logging, env |

- **Banco/Auth**: Supabase (Postgres + RLS). Isolamento multi-tenant no banco.
- **Segredos**: cifrados em repouso (pgcrypto), chave fora do banco.
- **WhatsApp**: Evolution API (não-oficial), 1 instância/tenant, conexão por QR.

## Desenvolvimento

```bash
pnpm install
supabase start && supabase db reset          # aplica migrations + seed (tenant demo pk_live_demo)
pnpm --filter @trk/shared build
pnpm --filter tracker build                  # gera apps/tracker/dist/tracker.js
pnpm --filter dashboard dev                  # http://localhost:3000
docker compose -f docker/docker-compose.yml up -d   # evolution + redis + worker
```

Variáveis de ambiente: ver `apps/dashboard/.env.example` e `services/whatsapp-worker/.env.example`.

## Testes

```bash
pnpm test                        # unit + contract (Vitest)
pnpm --filter tracker test:e2e   # Playwright (tracker) — requer build antes
```

## Fluxo de atribuição (resumo)

1. `tracker.js` gera o `TRK`, captura a origem e persiste no LocalStorage.
2. Botão de WhatsApp recebe `[Ref: TRK-XXXX]`; venda Nuvemshop carrega o `TRK` na nota.
3. Backend recebe a mensagem/venda, extrai o `TRK`, amarra ao lead e à origem.
4. Conversão atribuída dispara evento server-side (Meta CAPI / Google Offline) com
   `fbclid`/`gclid` originais.

Deploy: ver [docs/deploy.md](docs/deploy.md).
