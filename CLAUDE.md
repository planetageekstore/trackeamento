<!-- SPECKIT START -->
# Sistema de Trackeamento e Atribuição Multi-Canal (SaaS)

**Plano atual**: [specs/001-multichannel-tracking/plan.md](specs/001-multichannel-tracking/plan.md)
Spec: [spec.md](specs/001-multichannel-tracking/spec.md) · Research: [research.md](specs/001-multichannel-tracking/research.md) · Data model: [data-model.md](specs/001-multichannel-tracking/data-model.md) · Contratos: [contracts/](specs/001-multichannel-tracking/contracts/)

## Stack (decidida em Clarifications)
- **Painel/API/banco**: Next.js 15 (App Router, TS) + **Supabase** (Postgres + RLS, Auth, Storage, Edge Functions/cron).
- **Tracker**: `tracker.js` first-party (TS→esbuild, IIFE, ≤15KB gzip), servido versionado via CDN.
- **Always-on (VPS/Docker)**: Evolution API (WhatsApp por QR, 1 instância/tenant) + worker BullMQ/Redis.
- **Integrações**: Meta (Insights + CAPI), Google Ads (GAQL + Offline Conversions), Nuvemshop (OAuth + `POST /scripts` + webhook `order/paid`).
- **Monorepo pnpm**: `apps/dashboard`, `apps/tracker`, `services/whatsapp-worker`, `supabase/`, `packages/shared`, `docker/`.

## Princípios do projeto (gates)
- Isolamento multi-tenant por RLS (`tenant_id` em tudo; hierarquia Agência→Cliente via `memberships`).
- Segredos de terceiros cifrados em repouso (`pgcrypto` + chave em Vault/env, só server-side).
- Tracker nunca degrada o site do cliente (envio assíncrono, falha silenciosa).
- Idempotência de conversões por chave natural (`order.id`/`message.id`).
- Atribuição: persistir TODOS os toques; modelo de crédito adiável (não fixado no MVP).

## Comandos
- `pnpm install` · `supabase db push` · `pnpm --filter dashboard dev` · `pnpm --filter tracker build`
- `docker compose -f docker/docker-compose.yml up -d` (Evolution + Redis + worker)
- Testes: `pnpm test` (unit) · `pnpm --filter tracker test:e2e` (Playwright) · `pnpm test:contract`

## Regex canônico (packages/shared)
`\[Ref: (TRK-[A-Z0-9]+)\]` — usado por tracker, API e worker; fonte única de verdade.
<!-- SPECKIT END -->
