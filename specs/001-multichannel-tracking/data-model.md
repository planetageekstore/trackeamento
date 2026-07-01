# Phase 1 — Data Model

**Feature**: Sistema de Trackeamento e Atribuição Multi-Canal · Postgres (Supabase) com RLS

Convenções: todas as tabelas de negócio têm `tenant_id uuid not null` e RLS habilitado. PKs `uuid default gen_random_uuid()`. Timestamps `timestamptz default now()`. Segredos em `bytea` cifrado (`pgcrypto`).

## Enums

```text
role_type            = { agency_admin, client_user }
integration_provider = { meta, google, nuvemshop, whatsapp }
integration_status   = { connected, needs_reconnect, revoked, error }
event_type           = { PAGE_VIEW, WHATSAPP_CLICK, MESSAGE_RECEIVED, CHECKOUT, PURCHASE, LEAD }
event_source         = { tracker, whatsapp, nuvemshop, system }
dispatch_status      = { pending, sent, failed, skipped }
dispatch_target      = { meta_capi, google_offline }
```

## Entidades

### agency
Organização operadora (topo da hierarquia).
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| name | text not null | |
| created_at | timestamptz | |

### tenant (Cliente)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| agency_id | uuid FK→agency | not null |
| name | text not null | |
| site_key | text unique not null | pública, `pk_live_...`, embutida no tracker |
| attribution_config | jsonb | modelo/janela (adiável; default `{}`) |
| created_at | timestamptz | |

### tenant_domain (allowlist de origem)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK→tenant | |
| domain | text not null | ex.: `loja.com.br` |
| unique (tenant_id, domain) | | |

### membership (vínculo usuário↔escopo)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| user_id | uuid | = `auth.users.id` |
| role | role_type not null | |
| agency_id | uuid FK→agency | preenchido p/ `agency_admin` |
| tenant_id | uuid FK→tenant | preenchido p/ `client_user` (null p/ agency_admin) |
| unique (user_id, agency_id, tenant_id) | | |

Regra: `agency_admin` ⇒ `agency_id` set, `tenant_id` null (acessa todos os tenants da agência). `client_user` ⇒ `tenant_id` set.

### integration (conexões de terceiros)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK→tenant | |
| provider | integration_provider | |
| status | integration_status | default `connected` |
| account_ref | text | ad_account_id / customer_id / store_id |
| access_token_enc | bytea | cifrado (pgcrypto) |
| refresh_token_enc | bytea | cifrado (Google) |
| meta | jsonb | pixel_id, developer_token ref, conversion_action, versão API |
| expires_at | timestamptz | |
| unique (tenant_id, provider) | | |

### whatsapp_instance
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK→tenant | unique |
| instance_name | text not null | nome na Evolution API |
| apikey_enc | bytea | cifrado |
| status | text | `open`/`connecting`/`close` |
| phone_number | text | número conectado |
| last_seen_at | timestamptz | healthcheck |

### lead (O RG Único)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK→tenant | |
| tracking_code | text not null | `TRK-XXXX` |
| phone | text | enriquecido via WhatsApp |
| email | text | enriquecido via venda |
| created_at | timestamptz | |
| unique (tenant_id, tracking_code) | | idempotência do upsert |

Índices: `(tenant_id, phone)`, `(tenant_id, created_at)`.

### click (A Origem) — todos os toques persistidos
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK→tenant | |
| lead_id | uuid FK→lead | |
| utm_source / utm_medium / utm_campaign / utm_content / utm_term | text | |
| fbclid | text | |
| gclid | text | |
| referrer | text | |
| landing_page_url | text | |
| clicked_at | timestamptz | |

Índices: `(lead_id, clicked_at)`, `(tenant_id, fbclid)`, `(tenant_id, gclid)`. **Nenhum click é descartado** (FR-023).

### event (Jornada)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK→tenant | |
| lead_id | uuid FK→lead | nullable p/ conversão não-atribuída |
| event_type | event_type | |
| source | event_source | |
| external_id | text | order.id / message.id (idempotência) |
| value | numeric(14,2) | valor monetário (PURCHASE) |
| currency | text | default `BRL` |
| event_data | jsonb | contexto (produtos, url, etc.) |
| attributed | boolean | default false |
| occurred_at | timestamptz | |
| **unique (tenant_id, source, external_id)** | | dedup de conversões (FR-014); `external_id` null para page/click |

Índices: `(lead_id, occurred_at)`, `(tenant_id, event_type, occurred_at)`.

### campaign_cost (custos importados)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK→tenant | |
| provider | integration_provider | meta/google |
| campaign_id | text | |
| campaign_name | text | |
| date | date | granularidade diária |
| spend | numeric(14,2) | |
| impressions | bigint | |
| clicks | bigint | |
| raw | jsonb | métricas extras (cpm, ctr) |
| unique (tenant_id, provider, campaign_id, date) | | upsert idempotente do cron |

### conversion_dispatch (envios server-side — rastreio + idempotência)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| tenant_id | uuid FK→tenant | |
| event_id | uuid FK→event | |
| target | dispatch_target | meta_capi / google_offline |
| status | dispatch_status | |
| match_quality | text | full / reduced (sem fbclid/gclid) |
| response | jsonb | retorno da plataforma |
| attempts | int default 0 | |
| unique (event_id, target) | | não reenvia a mesma conversão |

## Relacionamentos (resumo)

```text
agency 1──N tenant 1──N { tenant_domain, integration, lead, click, event, campaign_cost }
tenant 1──1 whatsapp_instance
lead   1──N click
lead   1──N event 1──N conversion_dispatch
membership N──1 { agency | tenant }   (escopo de acesso)
```

## RLS (política — resumo)

- Habilitar RLS em todas as tabelas com `tenant_id`.
- Função `visible_tenant_ids()` (SECURITY DEFINER) retorna os `tenant_id` acessíveis ao `auth.uid()`:
  - `agency_admin` → todos os tenants onde `tenant.agency_id = membership.agency_id`.
  - `client_user` → `membership.tenant_id`.
- Policy padrão (SELECT/INSERT/UPDATE/DELETE): `tenant_id in (select visible_tenant_ids())`.
- `agency` / `tenant`: SELECT permitido se o usuário tem membership na agência (admin) ou no tenant (client).
- **Ingestão pública** (`/api/track`, webhooks) usa **service role** no servidor (bypass RLS) e é responsável por validar site key + domínio e setar `tenant_id` correto — nunca confia em input para escopo.
- Colunas cifradas (`*_enc`) nunca retornadas ao cliente; acesso só por funções server-side.

## Validações derivadas dos requisitos

- `tracking_code` casa `^TRK-[A-Z0-9]+$` (FR-001).
- Upsert de `lead` por `(tenant_id, tracking_code)` evita duplicidade (FR-005).
- `event` sem `lead_id` resolvido ⇒ `attributed=false`, disponível para conciliação (FR-013).
- `campaign_cost` e `event` idempotentes por constraint única (FR-014).
- Toda escrita carrega `tenant_id` (FR-020) e segredos entram cifrados (FR-021).
