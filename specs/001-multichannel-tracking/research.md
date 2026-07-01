# Phase 0 — Research & Decisões Técnicas

**Feature**: Sistema de Trackeamento e Atribuição Multi-Canal · **Data**: 2026-06-30

Todas as `NEEDS CLARIFICATION` foram resolvidas na fase `/speckit-clarify`. Este documento consolida as decisões de implementação e melhores práticas por área.

---

## R1 — Geração e persistência do Tracking ID (`TRK-XXXX`)

**Decisão**: O `TRK` é **gerado no cliente** no primeiro acesso (formato `TRK-` + 12 chars base32 Crockford, ex.: `TRK-8ZK4Q2M7XR9A`), gravado imediatamente no LocalStorage sob a chave `_saas_trk_id`, e sincronizado com o backend de forma **assíncrona e idempotente** (upsert por `tracking_code` + `tenant_id`).

**Rationale**: Atende FR-006/SC-001 (não bloquear a página nem depender do backend online). O documento original sugeria "API retorna o ID", mas gerar server-side torna a experiência dependente de rede no caminho crítico. Gerando no cliente, o tracker funciona mesmo offline e reconcilia depois. 12 chars base32 ≈ 60 bits de entropia → colisão desprezível mesmo entre tenants.

**Alternativas consideradas**: (a) ID server-side síncrono — rejeitado por violar resiliência; (b) UUID puro — funciona, mas o formato `TRK-` é requisito de domínio (aparece na mensagem do WhatsApp) e legível; (c) cookie first-party — LocalStorage foi exigido na spec e sobrevive melhor à navegação SPA.

**Notas**: persistência dupla (LocalStorage primário + fallback em cookie first-party de 1º nível para casos de SPA que limpam storage). Namespacing por site key evita conflito quando o mesmo navegador visita dois tenants.

---

## R2 — Identificação do tenant na ingestão (site key pública)

**Decisão**: Cada tenant recebe uma **site key pública** (`pk_live_...`) embutida no snippet do tracker. O endpoint `/api/track` resolve o tenant pela site key e aceita apenas origens (Origin/Referer) na allowlist de domínios do tenant.

**Rationale**: O tracker roda no navegador do visitante — não pode portar segredos. A site key é pública por natureza (como a publishable key do Stripe); a proteção real é allowlist de domínios + rate limiting + validação server-side, não sigilo da chave.

**Alternativas**: JWT assinado no cliente (impossível sem segredo no browser); sem chave, inferindo por domínio (frágil a spoofing de Referer) — rejeitados.

---

## R3 — Interceptação de WhatsApp no tracker

**Decisão**: No `DOMContentLoaded` e via `MutationObserver` (para botões inseridos dinamicamente), varrer `a[href*="wa.me"], a[href*="api.whatsapp.com"]`; parsear o `text=` existente e **acrescentar** ` [Ref: TRK-XXXX]` preservando o texto original (idempotente — não duplica se já houver o marcador). Também expõe `window._saasTrk.getId()` para checkout/e-commerce injetar em nota/atributo do pedido.

**Rationale**: Atende FR-008/FR-009. `MutationObserver` cobre sites SPA/lazy. Idempotência evita marcadores duplicados em re-render.

**Alternativas**: delegação de clique (interceptar no `click`) — mais frágil com `target=_blank`/apps nativos; reescrever `href` no load é mais previsível.

---

## R4 — WhatsApp inbound via Evolution API (QR + webhook)

**Decisão**: Uma **instância Evolution por tenant**, conectada por **QR code** exibido no painel (endpoint da Evolution `/instance/connect` → QR → status `open`). Mensagens de entrada chegam ao worker via **webhook** (`messages.upsert`). O worker aplica o regex canônico `\[Ref: (TRK-[A-Z0-9]+)\]` **na primeira mensagem** do contato, vincula o telefone ao lead e registra `MESSAGE_RECEIVED`. Estado da instância (nome + apikey) é guardado criptografado; reconexão automática com backoff.

**Rationale**: QR é o requisito de onboarding (Clarify Q2). Webhook `messages.upsert` é o mecanismo padrão da Evolution para inbound. Processar só a 1ª mensagem do contato reduz ruído e casa com a lógica da spec.

**Alternativas**: polling de mensagens (ineficiente, latência); API oficial (não suporta QR) — rejeitadas. Provider gerenciado de terceiros — rejeitado (Clarify Q5: self-host em VPS).

**Riscos/mitigações**: risco de ban do número (aceito) → aquecimento/uso moderado; sessão cai → healthcheck + alerta no painel ("reconectar WhatsApp").

---

## R5 — Meta: Insights (leitura) + Conversions API (escrita)

**Decisão**: OAuth2 (Facebook Login) com escopo `ads_read` + `ads_management`; guardar `access_token` (long-lived) criptografado. **Leitura**: cron consulta `GET /v{ver}/{ad_account_id}/insights` (spend, impressions, ctr, cpm) por campanha/adset/ad, granularidade diária. **Escrita (CAPI)**: ao atribuir conversão, `POST /v{ver}/{pixel_id}/events` com `event_name` (`Lead`/`Purchase`), `event_time`, `action_source`, e `user_data` incluindo `fbc` derivado do `fbclid` (`fb.1.<ts>.<fbclid>`) + `fbp` quando houver, e PII com hash SHA-256 (telefone/e-mail normalizados). Usar `test_event_code` na validação (SC-004).

**Rationale**: `fbc` a partir do `fbclid` maximiza Event Match Quality (SC-004). Hash de PII é exigência da Meta. Versão da Graph API fixada em config (o `v19.0` do escopo original pode estar defasado no deploy — parametrizar).

**Alternativas**: Pixel client-side apenas — perde conversões offline (WhatsApp/venda); rejeitado. Enviar sem `fbc` — EMQ baixo; evitado.

---

## R6 — Google Ads: GAQL (leitura) + Offline Click Conversions (escrita)

**Decisão**: OAuth2 com `Developer Token` + `refresh_token` criptografado. **Leitura**: GAQL sobre `campaign`/`ad_group_ad` para `metrics.cost_micros`, `impressions`, `clicks`. **Escrita**: `ConversionUploadService.UploadClickConversions` atrelando `gclid` + `conversion_date_time` (data/hora do clique original) + `conversion_action` + `conversion_value`. Requer conversion action offline pré-configurada por cliente.

**Rationale**: Offline Click Conversions é o mecanismo canônico para amarrar conversões de WhatsApp/venda ao `gclid` guardado (FR-018). `cost_micros` precisa /1e6.

**Alternativas**: Enhanced Conversions for Leads (por e-mail/telefone hash) como complemento futuro quando não houver `gclid`; fora do MVP.

---

## R7 — Nuvemshop: OAuth + injeção de script + webhook

**Decisão**: OAuth2 de Apps Parceiros (`code` → `access_token` + `user_id` da loja, criptografados). Após autorizar: `POST /scripts` injetando o `tracker.js` no storefront (com a site key do tenant). Registrar webhook `order/paid`. No recebimento, extrair o `TRK` de **nota/atributo** do pedido, registrar `PURCHASE` com valor; deduplicar por `order.id` (FR-014). Validar assinatura HMAC do webhook.

**Rationale**: `POST /scripts` é o mecanismo oficial para injeção sem editar tema (FR-017). `order/paid` garante conversão só em venda paga (SC-003). Nota/atributo é onde o tracker consegue depositar o `TRK` no checkout.

**Alternativas**: editar tema manualmente (não escalável); webhook `order/created` (dispara antes do pagamento — geraria falso positivo) — rejeitados.

---

## R8 — Multi-tenant + hierarquia Agência→Cliente no Supabase (RLS)

**Decisão**: Toda tabela de negócio carrega `tenant_id`. Tabela `memberships(user_id, agency_id, tenant_id, role)` define escopo. Policies RLS:
- `agency_admin`: acesso a linhas cujo `tenant_id` pertence a um tenant da sua `agency_id`.
- `client_user`: acesso apenas ao seu `tenant_id`.
Funções `auth.*` do Supabase + uma função SQL `current_tenants()` (SECURITY DEFINER) que resolve os tenants visíveis ao `auth.uid()`. Endpoint público `/api/track` usa **service role** no server (bypass RLS) mas valida site key/domínio antes de escrever, sempre setando `tenant_id` correto.

**Rationale**: RLS no Postgres é a forma mais robusta de garantir SC-006 (zero vazamento) — a política vive no banco, não na aplicação. A hierarquia híbrida (Clarify Q3) mapeia direto para `memberships`.

**Alternativas**: filtragem só na aplicação (frágil, um bug vaza dados) — rejeitado. Schema-por-tenant (isolamento físico) — over-engineering para o MVP; rejeitado por YAGNI.

---

## R9 — Criptografia de segredos em repouso

**Decisão**: Tokens de terceiros e apikey da instância Evolution guardados em coluna `bytea` cifrada com `pgcrypto` (`pgp_sym_encrypt`), chave mestra fora do banco (variável de ambiente/Supabase Vault). Acesso só via funções server-side (service role); nunca expostos ao browser nem retornados por API.

**Rationale**: Atende FR-021. Chave fora do banco garante que um dump de DB não revela os segredos.

**Alternativas**: Supabase Vault nativo (`vault.secrets`) — viável e complementar; usar como store da chave mestra. KMS externo — futuro.

---

## R10 — Ingestão, fila e idempotência

**Decisão**: `/api/track` valida (Zod) + enfileira (grava evento cru rápido) e responde 202. O **worker** (BullMQ/Redis na VPS) processa: upsert de lead, gravação de click/event, disparo de conversões server-side. Idempotência por chaves naturais: `events` únicos por (`tenant_id`, `source`, `external_id`) — `external_id` = `order.id` (Nuvemshop) ou `message.id` (Evolution); page/click events deduplicados por hash de payload + janela curta.

**Rationale**: Caminho de ingestão leve mantém p95 baixo (SC) e absorve picos; retries com backoff dão resiliência a falhas de API externa. Idempotência atende FR-014.

**Alternativas**: processamento inline síncrono — pior latência e sem retry; rejeitado. Fila gerenciada (SQS) — adiciona dependência cloud; Redis na VPS já está disponível pelo componente always-on.

---

## R11 — Entrega do `tracker.js` (CDN, first-party, versionado)

**Decisão**: Bundle minificado (esbuild, IIFE, ≤15KB gzip) publicado como asset estático versionado (`/t/v1/tracker.js`) via CDN (Supabase Storage + CDN ou Vercel edge). Snippet do cliente carrega com `async` e passa a site key via `data-` attribute. Cache longo + query de versão para invalidação.

**Rationale**: `async` + tamanho pequeno atende SC-001. Versionar evita quebrar sites ao evoluir. Servido como first-party do ponto de vista do cliente (mesmo que via CDN), sem cookies de terceiros.

**Alternativas**: script inline no tema (dificulta atualização); npm package (inviável para lojas Nuvemshop) — rejeitados.

---

## Resumo das decisões

| Área | Decisão-chave |
|------|---------------|
| TRK ID | Gerado no cliente, base32, sync assíncrono idempotente |
| Tenant na ingestão | Site key pública + allowlist de domínio |
| WhatsApp intercept | Reescrita de href + MutationObserver, idempotente |
| WhatsApp inbound | Evolution (1 instância/tenant, QR), webhook `messages.upsert` |
| Meta | OAuth `ads_read/management`; Insights (cron) + CAPI (`fbc` do `fbclid`, PII hash) |
| Google Ads | GAQL leitura; Offline Click Conversions (gclid + hora do clique) |
| Nuvemshop | OAuth + `POST /scripts` + webhook `order/paid` (dedup por order.id) |
| Multi-tenant | `tenant_id` em tudo + RLS; `memberships` para agência/cliente |
| Cripto | `pgcrypto` + chave em Vault/env, só server-side |
| Ingestão | `/api/track` → fila BullMQ/Redis → worker; idempotência por chave natural |
| Tracker delivery | Bundle esbuild ≤15KB, CDN versionado, `async` |
