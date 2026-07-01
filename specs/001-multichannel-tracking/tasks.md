---
description: "Task list — Sistema de Trackeamento e Atribuição Multi-Canal"
---

# Tasks: Sistema de Trackeamento e Atribuição Multi-Canal (SaaS)

**Input**: Design documents from `/specs/001-multichannel-tracking/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: INCLUÍDOS — exigidos pelo Princípio VI da [constituição](../../.specify/memory/constitution.md) (unit tests do domínio crítico: regex TRK, parse UTM, atribuição, cripto, idempotência; e contract tests de cada integração/webhook).

**Organization**: Tarefas agrupadas por user story (P1→P3) para implementação e teste independentes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependências pendentes)
- **[Story]**: US1..US5 (mapeia às user stories da spec)
- Caminhos de arquivo são relativos à raiz do repositório

## Path Conventions (monorepo pnpm — ver plan.md)

`apps/dashboard` (Next.js) · `apps/tracker` (tracker.js) · `services/whatsapp-worker` (VPS) · `supabase/` (migrations+functions) · `packages/shared` · `docker/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicialização do monorepo e ferramentas

- [X] T001 Criar estrutura do monorepo (pnpm workspaces) com `apps/`, `services/`, `supabase/`, `packages/`, `docker/` em `pnpm-workspace.yaml` e `package.json` raiz
- [X] T002 [P] Configurar TypeScript base + ESLint + Prettier em `tsconfig.base.json`, `.eslintrc.cjs`, `.prettierrc`
- [X] T003 [P] Inicializar `apps/dashboard` como Next.js 15 (App Router, TS, Tailwind, shadcn/ui)
- [X] T004 [P] Inicializar `apps/tracker` com build esbuild (IIFE, minificado) em `apps/tracker/package.json` + `apps/tracker/build.mjs`
- [X] T005 [P] Inicializar `services/whatsapp-worker` (Node 20 + Fastify + BullMQ) esqueleto em `services/whatsapp-worker/src/server.ts`
- [X] T006 [P] Inicializar workspace `packages/shared` (build tsup) em `packages/shared/package.json`
- [X] T007 [P] Scaffold `docker/docker-compose.yml` (evolution-api + redis + worker)
- [X] T008 [P] Configurar runners de teste: Vitest (unit/contract) e Playwright (e2e do tracker) em `vitest.config.ts` e `playwright.config.ts`
- [X] T009 [P] Inicializar config do Supabase local em `supabase/config.toml`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Núcleo que MUST estar pronto antes de qualquer user story

**⚠️ CRITICAL**: Nenhuma user story começa antes desta fase concluir

- [X] T010 [P] `packages/shared`: constante do regex canônico `\[Ref: (TRK-[A-Z0-9]+)\]`, `parseUtm()`, gerador/validador de `TRK`, e tipos base (Lead, Click, Event, enums) em `packages/shared/src/index.ts`
- [X] T011 [P] `packages/shared`: schemas Zod do payload de `/api/track` e dos webhooks em `packages/shared/src/schemas.ts`
- [X] T012 Migration Supabase: enums + tabelas de identidade (`agency`, `tenant`, `tenant_domain`, `membership`) em `supabase/migrations/0001_core.sql`
- [X] T013 Migration Supabase: tabelas de dados (`lead`, `click`, `event`, `campaign_cost`, `integration`, `whatsapp_instance`, `conversion_dispatch`) com índices e constraints de idempotência em `supabase/migrations/0002_data.sql`
- [X] T014 Migration Supabase: `pgcrypto` + colunas cifradas (`*_enc`) + funções `encrypt_secret`/`decrypt_secret` em `supabase/migrations/0003_crypto.sql`
- [X] T015 Migration Supabase: habilitar RLS + função `visible_tenant_ids()` (SECURITY DEFINER) + policies por tabela em `supabase/migrations/0004_rls.sql`
- [X] T016 [P] `apps/dashboard`: clients Supabase server/browser + helpers de sessão em `apps/dashboard/src/lib/supabase/`
- [X] T017 `apps/dashboard`: Auth (login, aceite de convite) + guards de rota por membership (`agency_admin` vs `client_user`) em `apps/dashboard/src/app/(auth)/` e `apps/dashboard/src/lib/auth.ts`
- [X] T018 [P] Serviço de cripto (encrypt/decrypt via RPC pgcrypto) compartilhado em `apps/dashboard/src/server/crypto.ts` e `services/whatsapp-worker/src/crypto.ts`
- [X] T019 [P] Utilitários de erro + logging estruturado em `packages/shared/src/log.ts`
- [X] T020 [P] Gestão de configuração/env (validação Zod das variáveis) em `packages/shared/src/env.ts`

**Checkpoint**: Fundação pronta — user stories podem começar

---

## Phase 3: User Story 1 - Captura da origem e geração do RG do lead (Priority: P1) 🎯 MVP

**Goal**: Visitante recebe `TRK-XXXX` no 1º acesso, origem (UTMs/click ids) é registrada, e o ID persiste entre páginas — sem quebrar o site se o backend cair.

**Independent Test**: Acessar página instrumentada com `?utm_source=meta&fbclid=abc`; confirmar `TRK` no LocalStorage + `lead`+`click` no banco; navegar e manter o mesmo `TRK`; derrubar backend e a página segue funcionando.

### Tests for User Story 1

- [X] T021 [P] [US1] Unit tests: geração/validação `TRK` + `parseUtm` + `storeLocal` em `apps/tracker/tests/unit.test.ts`
- [X] T022 [P] [US1] Contract test de `POST /api/track` (202, 400, 401 domínio fora da allowlist) em `apps/dashboard/tests/contract/track.test.ts`
- [X] T023 [P] [US1] Playwright e2e: geração/persistência do `TRK` + resiliência com backend offline em `apps/tracker/tests/e2e/track.spec.ts`

### Implementation for User Story 1

- [X] T024 [P] [US1] tracker: `parseURL()` (utm_*, fbclid, gclid) em `apps/tracker/src/parseUrl.ts`
- [X] T025 [P] [US1] tracker: `storeLocal()` + `getId()` (LocalStorage `_saas_trk_id`/`_saas_trk_src`) em `apps/tracker/src/storage.ts`
- [X] T026 [US1] tracker: `initLead()` + `sendEvent()` (`sendBeacon`/keepalive, try/catch resiliente) e API global `window._saasTrk` em `apps/tracker/src/index.ts` (depende de T024, T025)
- [X] T027 [US1] tracker: loader do snippet (`data-site-key`) + build minificado ≤15KB gzip em `apps/tracker/src/loader.ts`
- [X] T028 [P] [US1] dashboard: resolvedor de tenant por `site_key` + allowlist de domínio (Origin/Referer) + rate limit em `apps/dashboard/src/server/tenant.ts`
- [X] T029 [US1] dashboard: rota `POST /api/track` (valida Zod, resolve tenant, grava) em `apps/dashboard/src/app/api/track/route.ts` (depende de T028)
- [X] T030 [P] [US1] dashboard: rota `GET /api/track/health` em `apps/dashboard/src/app/api/track/health/route.ts`
- [X] T031 [US1] dashboard: serviço de ingestão — upsert `lead` por (`tenant_id`,`tracking_code`), insere `click` (nenhum toque descartado), insere `event` PAGE_VIEW em `apps/dashboard/src/server/ingest.ts` (depende de T013, T029)
- [X] T032 [US1] dashboard: onboarding de tenant (criar cliente, gerar `site_key`, cadastrar domínios) na área agência em `apps/dashboard/src/app/(agency)/tenants/`
- [X] T033 [US1] dashboard: visão de jornada do lead (lista + timeline de eventos/cliques) em `apps/dashboard/src/app/(tenant)/[tenant]/leads/`

**Checkpoint**: US1 funcional e testável isoladamente — captura de origem + RG persistente entregues (MVP mínimo)

---

## Phase 4: User Story 2 - Hand-off e atribuição por WhatsApp (Priority: P1) 🎯 MVP

**Goal**: Botão de WhatsApp carrega `[Ref: TRK-XXXX]`; mensagem recebida é reconhecida, telefone vinculado ao lead e evento `MESSAGE_RECEIVED` registrado.

**Independent Test**: Clicar no botão e ver o marcador na URL; conectar instância Evolution por QR; enviar a mensagem e confirmar `MESSAGE_RECEIVED` atribuído com telefone no lead.

### Tests for User Story 2

- [X] T034 [P] [US2] Unit test: `interceptWhatsApp` (idempotente, preserva texto, MutationObserver) em `apps/tracker/tests/whatsapp.test.ts`
- [X] T035 [P] [US2] Unit test: extração do `TRK` via regex + normalização E.164 do telefone em `packages/shared/tests/trk.test.ts`
- [X] T036 [P] [US2] Contract test: webhook Evolution `messages.upsert` → `MESSAGE_RECEIVED` (com/sem marcador, dedup) em `services/whatsapp-worker/tests/webhook.test.ts`

### Implementation for User Story 2

- [X] T037 [US2] tracker: `interceptWhatsApp()` (reescreve href `wa.me`/`api.whatsapp.com`, idempotente + `MutationObserver` para botões dinâmicos) **e emite evento `WHATSAPP_CLICK` via `sendEvent` no clique do link instrumentado** (FR-022) em `apps/tracker/src/whatsapp.ts`
- [X] T038 [P] [US2] worker: cliente Evolution API (create/connect/connectionState) em `services/whatsapp-worker/src/evolution/client.ts`
- [X] T039 [US2] worker: BullMQ + Redis (bootstrap de fila e worker) em `services/whatsapp-worker/src/queue.ts`
- [X] T040 [US2] worker: handler `POST /webhooks/evolution` (valida token, parse mensagem, aplica regex) em `services/whatsapp-worker/src/evolution/webhook.ts` (depende de T038)
- [X] T041 [US2] worker: processamento da mensagem — match lead por `TRK`, seta `lead.phone`, insere `MESSAGE_RECEIVED` (dedup por `message.id`, não-atribuído quando sem match) em `services/whatsapp-worker/src/ingest/message.ts` (depende de T039, T040)
- [X] T042 [US2] dashboard: UI de conexão do WhatsApp (exibe QR, faz polling do status) em `apps/dashboard/src/app/(tenant)/[tenant]/whatsapp/`
- [X] T043 [US2] dashboard: persistir `whatsapp_instance` (apikey cifrada, status, phone_number, healthcheck) em `apps/dashboard/src/server/integrations/whatsapp.ts`

**Checkpoint**: US1 + US2 funcionais — laço lead→WhatsApp fechado (produto P1 completo)

---

## Phase 5: User Story 3 - Atribuição de venda no e-commerce (Nuvemshop) (Priority: P2)

**Goal**: Autorizar a loja injeta o tracker; venda paga com `TRK` vira evento `PURCHASE` atribuído ao lead/campanha.

**Independent Test**: Autorizar loja de teste → confirmar script injetado; pedido de teste com `TRK` marcado como pago → `PURCHASE` com valor atribuído; reenvio do webhook não duplica.

### Tests for User Story 3

- [X] T044 [P] [US3] Contract test: webhook `order/paid` → `PURCHASE` (extrai `TRK` da nota, dedup por `order.id`, não-atribuído sem `TRK`) em `apps/dashboard/tests/contract/nuvemshop.test.ts`

### Implementation for User Story 3

- [X] T045 [US3] dashboard: OAuth Nuvemshop (`/api/oauth/nuvemshop`) — troca `code`→token, grava cifrado em `apps/dashboard/src/app/api/oauth/nuvemshop/route.ts`
- [X] T046 [US3] dashboard: pós-autorização — `POST /scripts` (injeta tracker com site_key) + registrar webhook `order/paid` (idempotente em reautorização) em `apps/dashboard/src/server/integrations/nuvemshop.ts`
- [X] T047 [US3] dashboard: handler `POST /api/webhooks/nuvemshop` (valida HMAC, extrai `TRK`, insere `PURCHASE` com valor, dedup) em `apps/dashboard/src/app/api/webhooks/nuvemshop/route.ts` (depende de T046)
- [X] T048 [US3] tracker: garantir `window._saasTrk.getId()` para injeção no checkout + documentar uso em nota/atributo do pedido, **e emitir evento `CHECKOUT` via `sendEvent` ao entrar na página de checkout** (FR-022) em `apps/tracker/src/index.ts`
- [X] T049 [US3] dashboard: visão de vendas/conversões atribuídas por tenant em `apps/dashboard/src/app/(tenant)/[tenant]/conversions/`

**Checkpoint**: Laço de receita (venda paga) fechado para e-commerce

---

## Phase 6: User Story 4 - Conexão de contas de anúncio e leitura de custos (Priority: P2)

**Goal**: Cliente conecta Meta e Google; custos por campanha importados periodicamente e exibidos junto às conversões.

**Independent Test**: Conectar conta de teste, rodar importação e ver gasto/impressões por campanha no painel do período.

### Tests for User Story 4

- [X] T050 [P] [US4] Contract test: mapeamento Meta Insights e Google GAQL → `campaign_cost` (cost_micros/1e6, upsert idempotente) em `apps/dashboard/tests/contract/costs.test.ts`

### Implementation for User Story 4

- [X] T051 [P] [US4] dashboard: OAuth Meta (`/api/oauth/meta`, escopos `ads_read`/`ads_management`) — grava token + pixel cifrados em `apps/dashboard/src/app/api/oauth/meta/route.ts`
- [X] T052 [P] [US4] dashboard: OAuth Google Ads (`/api/oauth/google`) — grava refresh token + developer token cifrados em `apps/dashboard/src/app/api/oauth/google/route.ts`
- [X] T053 [US4] dashboard: serviço Meta Insights → upsert `campaign_cost` em `apps/dashboard/src/server/integrations/meta.ts` (depende de T051)
- [X] T054 [US4] dashboard: serviço Google Ads GAQL → upsert `campaign_cost` em `apps/dashboard/src/server/integrations/google.ts` (depende de T052)
- [X] T055 [US4] Supabase Edge Function (cron): importação agendada de custos (Meta+Google, ≤24h) em `supabase/functions/import-costs/index.ts` (depende de T053, T054)
- [X] T056 [US4] dashboard: página de conexões (status por provider, tratamento `needs_reconnect` FR-019) em `apps/dashboard/src/app/(tenant)/[tenant]/connections/`
- [X] T057 [US4] dashboard: visão consolidada custo × conversões por campanha/período em `apps/dashboard/src/app/(tenant)/[tenant]/campaigns/`

**Checkpoint**: ROI/ROAS visível — custo + conversão na mesma tela

---

## Phase 7: User Story 5 - Envio de conversões server-side (Priority: P3)

**Goal**: Conversão atribuída dispara evento server-side para Meta (CAPI, `fbc` do `fbclid`) e Google (Offline, `gclid`), repassando o click id original.

**Independent Test**: Para lead com `fbclid`/`gclid` que converteu, disparar envio e validar aceite sem erro + EMQ verde (Meta) e conversão atrelada ao `gclid`+hora (Google); reenvio bloqueado.

### Tests for User Story 5

- [X] T058 [P] [US5] Contract test: payload Meta CAPI (`fbc` derivado do `fbclid`, PII SHA-256, `test_event_code`) em `services/whatsapp-worker/tests/meta-capi.test.ts`
- [X] T059 [P] [US5] Contract test: payload Google Offline Click Conversion (`gclid` + `conversion_date_time`) em `services/whatsapp-worker/tests/google-offline.test.ts`

### Implementation for User Story 5

- [X] T060 [P] [US5] worker/senders: Meta CAPI (monta payload, hash PII, `fbc`) em `services/whatsapp-worker/src/senders/meta.ts`
- [X] T061 [P] [US5] worker/senders: Google Offline Conversions (gclid + hora do clique) em `services/whatsapp-worker/src/senders/google.ts`
- [X] T062 [US5] worker: ao registrar conversão atribuída (`MESSAGE_RECEIVED`/`PURCHASE`), enfileirar dispatch e gravar `conversion_dispatch` (dedup `unique(event_id,target)`) em `services/whatsapp-worker/src/ingest/dispatch.ts` (depende de T060, T061)
- [X] T063 [US5] worker: retry/backoff + `match_quality` (full/reduced quando sem click id) em `services/whatsapp-worker/src/senders/retry.ts`

**Checkpoint**: Loop fechado com as plataformas — todas as user stories funcionais

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Melhorias que cruzam múltiplas user stories

- [X] T064 [P] Segurança: testes de isolamento RLS (acesso cruzado negado — SC-006) + revisão de rate limit e validação HMAC/token em `apps/dashboard/tests/rls.test.ts`
- [X] T065 [P] Performance: verificar bundle do tracker <15KB gzip e p95 de `/api/track` (SC-001) em `apps/tracker/tests/size.test.ts`
- [X] T066 [P] Docs: README + guia de deploy (Vercel + VPS Docker) em `docs/deploy.md`
- [ ] T067 Rodar validação ponta-a-ponta do [quickstart.md](quickstart.md)
- [X] T068 [P] Unit tests adicionais para casos de borda de atribuição/cripto em `packages/shared/tests/edge.test.ts`
- [X] T069 Revisão de idempotência em webhooks e reautorização (Nuvemshop script/webhook não duplicam)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências
- **Foundational (Fase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **User Stories (Fases 3–7)**: dependem da Fundação; depois podem seguir em paralelo ou por prioridade (P1→P3)
- **Polish (Fase 8)**: depende das stories desejadas concluídas

### User Story Dependencies

- **US1 (P1)**: após Fundação — base do produto (gera o RG que todas as outras usam)
- **US2 (P1)**: após Fundação — independente; consome o `TRK` do US1 mas testável isolada (pode-se semear um lead)
- **US3 (P2)**: após Fundação — independente; usa `TRK` no pedido
- **US4 (P2)**: após Fundação — independente (custos não dependem de conversões)
- **US5 (P3)**: após Fundação — consome conversões atribuídas (US2/US3) e click ids (US1); melhor após elas

### Within Each User Story

- Testes escritos primeiro e devem FALHAR antes da implementação
- Models → services → endpoints → integração
- Story completa antes de passar para a próxima prioridade

### Parallel Opportunities

- Todos os `[P]` do Setup rodam em paralelo
- Na Fundação: T010, T011, T016, T018, T019, T020 em paralelo (T012–T015 são migrations sequenciais no mesmo domínio)
- Após a Fundação, US1–US4 podem ser tocadas por devs diferentes; US5 depois
- Dentro de cada story, os `[P]` (tests + models/arquivos distintos) rodam juntos

---

## Parallel Example: User Story 1

```bash
# Testes do US1 juntos:
Task T021: "Unit tests do tracker em apps/tracker/tests/unit.test.ts"
Task T022: "Contract test de /api/track em apps/dashboard/tests/contract/track.test.ts"
Task T023: "Playwright e2e em apps/tracker/tests/e2e/track.spec.ts"

# Módulos independentes do tracker juntos:
Task T024: "parseURL() em apps/tracker/src/parseUrl.ts"
Task T025: "storeLocal()+getId() em apps/tracker/src/storage.ts"
Task T028: "resolvedor de tenant em apps/dashboard/src/server/tenant.ts"
```

---

## Implementation Strategy

### MVP First

1. Fase 1 (Setup) → Fase 2 (Fundação, CRÍTICA)
2. Fase 3 (US1) → **validar**: RG + captura de origem funcionando
3. Fase 4 (US2) → **validar**: atribuição por WhatsApp
4. **PARAR e VALIDAR**: US1+US2 = produto P1 demonstrável (o coração do "cliques anônimos → leads atribuídos")

### Incremental Delivery

US1 → US2 (MVP P1) → US3 (venda e-commerce) → US4 (custos/ROI) → US5 (conversões server-side). Cada story agrega valor sem quebrar as anteriores.

---

## Notes

- `[P]` = arquivos diferentes, sem dependências
- Regex `TRK` tem fonte única em `packages/shared` (usado por tracker, API e worker)
- Verificar testes falhando antes de implementar
- Commit após cada tarefa ou grupo lógico
- Evitar: dependências cruzadas entre stories que quebrem a independência
- Total: **69 tarefas** (9 setup · 11 fundação · US1 13 · US2 10 · US3 6 · US4 8 · US5 6 · polish 6)
