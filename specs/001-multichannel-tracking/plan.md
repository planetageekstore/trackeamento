# Implementation Plan: Sistema de Trackeamento e Atribuição Multi-Canal (SaaS)

**Branch**: `001-multichannel-tracking` | **Date**: 2026-06-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-multichannel-tracking/spec.md`

## Summary

Plataforma SaaS multi-tenant que gera um **RG Único (Tracking ID `TRK-XXXX`)** por visitante e amarra toda a jornada do lead — clique no anúncio (Meta/Google Ads) → navegação (Nuvemshop/landing pages) → WhatsApp → conversão (venda) — usando rastreamento *first-party* (UTMs + `fbclid`/`gclid` persistidos em LocalStorage).

**Abordagem técnica** (decidida em Clarifications):
- **Painel + API + banco**: Next.js (App Router) sobre **Supabase** (Postgres com RLS, Auth, Storage, Edge Functions + cron). Isolamento multi-tenant por RLS; hierarquia **Agência → Cliente(s)** com papéis `agency_admin`/`client_user`; tokens de terceiros criptografados em repouso.
- **Tracker first-party**: `tracker.js` leve, resiliente (não bloqueia a página se o backend cair), gera/reusa o `TRK` no LocalStorage e intercepta links de WhatsApp.
- **Ingestão de eventos**: endpoint público de coleta (`/api/track`) idempotente, identificando o tenant por uma *site key* pública embutida no snippet.
- **Componentes always-on** (VPS/Docker dedicado): **Evolution API** (sessão de WhatsApp por cliente via QR code) + **worker** que consome webhooks de mensagens, extrai `[Ref: TRK-XXXX]` e grava no Supabase.
- **Integrações**: Meta (Insights + CAPI), Google Ads (GAQL + Offline Conversions), Nuvemshop (OAuth + `POST /scripts` + webhook `order/paid`). Custos importados por cron; conversões atribuídas disparam eventos server-side repassando `fbclid`/`gclid`.
- **Atribuição**: MVP **não fixa** modelo de crédito — persiste **todos** os toques e exibe a jornada completa (crédito/janela ficam configuráveis depois).

## Technical Context

**Language/Version**: TypeScript 5.x; Node.js 20 LTS. Tracker compilado para JS ES2019 (compatibilidade ampla de navegadores).

**Primary Dependencies**:
- Painel/API: Next.js 15 (App Router, React 19), `@supabase/supabase-js`, `@supabase/ssr`, Tailwind + shadcn/ui, Zod (validação), TanStack Query.
- Worker/always-on: Node + Fastify (webhooks Evolution), Evolution API (container oficial), BullMQ + Redis (fila/retry de ingestão e envios server-side).
- Integrações: `google-ads-api` (GAQL + offline conversions), chamadas REST à Graph API do Meta (CAPI/Insights) e à API da Nuvemshop (sem SDK oficial estável → cliente HTTP próprio com Zod).
- Tracker: TypeScript puro, sem dependências de runtime; bundle via esbuild (minificado, IIFE).

**Storage**: Supabase Postgres (schema com RLS). Segredos/tokens de terceiros criptografados via `pgcrypto` + chave em Vault/env (nunca em texto claro). Redis (na VPS) apenas para fila do worker — não é fonte de verdade.

**Testing**: Vitest (unit — regex TRK, parse UTM, atribuição, cripto); Playwright (e2e do tracker em página de teste: geração/persistência do TRK, intercept WhatsApp, resiliência com backend offline); testes de contrato para `/api/track`, webhooks Nuvemshop e webhook Evolution; testes de integração das rotas de OAuth com mocks.

**Target Platform**: Navegadores modernos (tracker) · Node 20 na Vercel/Supabase Edge (painel/API) · Container Docker em VPS Linux (Evolution API + worker + Redis).

**Project Type**: Web application multi-componente (frontend/painel + serviços backend + script embarcável + serviço always-on).

**Performance Goals**:
- Tracker: **não bloqueante** (SC-001) — trabalho no `main thread` desprezível; envio de eventos via `navigator.sendBeacon`/`fetch keepalive` assíncrono; bundle ≤ 15 KB gzip.
- `/api/track`: p95 < 200 ms; aceitar e enfileirar sem processamento pesado inline.
- Importação de custos: defasagem ≤ 24 h (SC-005) via cron.
- Envio server-side (CAPI/Google): ≥ 99% aceitos sem erro de validação (SC-004).

**Constraints**:
- **Resiliência first-party** (FR-006): falha/lentidão do backend NÃO pode quebrar a navegação — tracker sempre degrada em silêncio.
- **Isolamento multi-tenant** (FR-020/FR-020a): toda tabela de dados carrega `tenant_id` e é protegida por RLS; nada cruza tenants.
- **Cripto em repouso** (FR-021): tokens Meta/Google/Nuvemshop e a sessão/instância Evolution nunca em texto claro.
- **Idempotência** (FR-014): eventos de venda/mensagem deduplicados por chave natural (order_id / message_id).
- **Sessão de WhatsApp**: reconexão automática; tolerância a quedas sem perder vínculo de leads.

**Scale/Scope**: MVP para uma agência com **dezenas de clientes (tenants)** e ordem de **milhares de eventos/dia**. Arquitetura de fila permite crescer sem reescrever o caminho de ingestão. 5 user stories (2×P1, 2×P2, 1×P3).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Avaliado contra a **constituição ratificada v1.0.0** ([constitution.md](../../.specify/memory/constitution.md)). Cada princípio vinculante é atendido pelo desenho:

| Princípio | Constituição | Status |
|-----------|--------------|--------|
| **I. Isolamento Multi-Tenant (NON-NEGOTIABLE)** | FR-020/020a | ✅ RLS + `tenant_id` em todas as tabelas; ingestão pública valida site key/domínio e seta `tenant_id` |
| **II. Segredos cifrados em repouso (NON-NEGOTIABLE)** | FR-021 | ✅ `pgcrypto` + chave em Vault/env; nunca no browser/logs |
| **III. Tracker não-intrusivo** | FR-006 / SC-001 | ✅ Envio assíncrono, sem bloqueio, falha silenciosa, bundle ≤15KB |
| **IV. Idempotência de conversões** | FR-014 | ✅ Chaves naturais + `unique` constraints |
| **V. Preservação de dados de atribuição** | FR-023 | ✅ Todos os toques persistidos; modelo de crédito adiável |
| **VI. Simplicidade e Testabilidade (YAGNI)** | boa prática | ✅ Sem modelo de atribuição complexo no MVP; unit/contract tests no domínio crítico |

**Resultado**: PASS (sem violações a justificar; a tabela Complexity Tracking permanece vazia). Re-checado pós-desenho da Fase 1: sem novas violações.

## Project Structure

### Documentation (this feature)

```text
specs/001-multichannel-tracking/
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — decisões técnicas e melhores práticas
├── data-model.md        # Fase 1 — schema físico, RLS, índices
├── quickstart.md        # Fase 1 — guia de validação ponta-a-ponta
├── contracts/           # Fase 1 — contratos de API/JS/webhooks
│   ├── track-api.md         # Endpoint público de ingestão de eventos
│   ├── tracker-js.md        # Contrato do tracker.js (funções, storage, snippet)
│   ├── integrations.md      # Meta/Google/Nuvemshop (OAuth, leitura, escrita)
│   └── whatsapp-webhook.md  # Contrato Evolution API → worker
└── tasks.md             # Fase 2 — gerado por /speckit-tasks (NÃO por /speckit-plan)
```

### Source Code (repository root)

Monorepo com workspaces (pnpm). Estrutura escolhida por haver múltiplos artefatos de deploy independentes (painel serverless, tracker estático, serviço always-on).

```text
apps/
├── dashboard/                     # Next.js (App Router) — painel + API pública
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/            # login, aceite de convite
│   │   │   ├── (agency)/         # visão agência: lista de clientes/tenants
│   │   │   ├── (tenant)/[tenant]/ # painel por cliente: leads, jornada, campanhas, conexões
│   │   │   └── api/
│   │   │       ├── track/         # POST ingestão de eventos (público, por site key)
│   │   │       ├── oauth/         # callbacks Meta / Google / Nuvemshop
│   │   │       └── webhooks/      # nuvemshop (order/paid), evolution (relay opcional)
│   │   ├── components/            # UI (shadcn) + gráficos
│   │   ├── lib/                   # clients supabase (server/browser), auth, guards RLS
│   │   └── server/               # serviços: attribution, crypto, integrações (meta/google/nuvemshop)
│   └── tests/ (unit, contract, integration)
├── tracker/                       # tracker.js first-party
│   ├── src/                       # parseURL, initLead, storeLocal, interceptWhatsApp, sendEvent
│   ├── dist/                      # bundle minificado publicado no CDN/Storage
│   └── tests/                     # unit (vitest) + e2e (playwright)
services/
└── whatsapp-worker/               # VPS/Docker — Evolution API integration + worker de fila
    ├── src/
    │   ├── evolution/            # cliente + handler de webhook de mensagens (regex TRK)
    │   ├── ingest/               # consumidores BullMQ: eventos, conversões
    │   └── senders/              # envio server-side Meta CAPI / Google Offline
    └── tests/
supabase/
├── migrations/                    # SQL: schema, RLS, índices, pgcrypto helpers
└── functions/                     # Edge Functions: cron import de custos, relays
packages/
└── shared/                        # tipos TS, event types, regex TRK, schemas Zod compartilhados
docker/
└── docker-compose.yml             # Evolution API + Redis + worker (VPS)
```

**Structure Decision**: Monorepo pnpm com quatro áreas de deploy independentes — `apps/dashboard` (Vercel/Supabase), `apps/tracker` (bundle estático servido via CDN/Supabase Storage), `services/whatsapp-worker` (VPS Docker), `supabase/` (migrations + edge functions). `packages/shared` centraliza tipos e o regex canônico `\[Ref: (TRK-[A-Z0-9]+)\]`, evitando divergência entre tracker, API e worker.

## Complexity Tracking

> Sem violações de Constitution Check. Tabela intencionalmente vazia.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
