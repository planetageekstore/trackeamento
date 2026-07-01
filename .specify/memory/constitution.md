<!--
Sync Impact Report
==================
Version change: (template/unratified) → 1.0.0
Bump rationale: MAJOR — primeira ratificação; definição inicial de todos os princípios e governança.

Modified principles: N/A (primeira versão; template preenchido do zero)
Added sections:
  - Core Principles I–VI
  - Restrições Adicionais (Segurança & Multi-Tenancy)
  - Fluxo de Desenvolvimento & Quality Gates
  - Governance
Removed sections: nenhuma

Templates requiring updates:
  - .specify/templates/plan-template.md ✅ (Constitution Check já genérico; gates alinhados no plano 001)
  - .specify/templates/spec-template.md ✅ (nenhuma seção obrigatória nova exigida)
  - .specify/templates/tasks-template.md ✅ (categorias de tarefa compatíveis: testes/contratos/segurança)
  - specs/001-multichannel-tracking/plan.md ✅ (seção Constitution Check reflete estes princípios)

Deferred TODOs: nenhum.
-->

# Constituição — Sistema de Trackeamento e Atribuição Multi-Canal

## Core Principles

### I. Isolamento Multi-Tenant (NON-NEGOTIABLE)

Todo dado de negócio MUST carregar `tenant_id` e ser protegido por Row-Level Security no
Postgres. Nenhum caminho de leitura ou escrita pode retornar, atribuir ou influenciar dados
de um tenant a partir do escopo de outro. A hierarquia Agência → Cliente é resolvida no banco
(via `memberships` + função de escopo), nunca apenas na aplicação. Endpoints públicos e
webhooks que usam service role (bypass de RLS) MUST validar a identidade do tenant (site key +
allowlist de domínio, ou assinatura de webhook) e setar `tenant_id` explicitamente antes de
escrever — jamais confiando em input do cliente para definir escopo.

**Rationale**: um único vazamento entre clientes é catastrófico para um SaaS de dados de
marketing. Colocar a política no banco garante que um bug de aplicação não vaze dados.

### II. Segredos e Dados Sensíveis Cifrados em Repouso (NON-NEGOTIABLE)

Tokens de terceiros (Meta, Google, Nuvemshop) e a apikey/instância da Evolution API MUST ser
armazenados cifrados (`pgcrypto`), com a chave mestra fora do banco (Vault/variável de
ambiente). Segredos MUST NOT ser expostos ao navegador, retornados por API pública, nem
gravados em logs. Acesso a colunas cifradas ocorre somente em código server-side com service
role.

**Rationale**: atende exigência explícita da spec (FR-021) e limita o dano de um dump de banco.

### III. Tracker Não-Intrusivo (resiliência first-party)

O `tracker.js` MUST NOT bloquear, atrasar perceptivelmente ou quebrar a navegação do site do
cliente sob nenhuma circunstância — incluindo backend indisponível, lento ou com erro. Todo
envio de evento é assíncrono (`sendBeacon`/`fetch keepalive`); toda lógica roda dentro de
`try/catch` que degrada em silêncio. O `Tracking ID` é gerado no cliente e persiste localmente
independentemente da resposta do backend. O bundle MUST permanecer ≤ 15 KB gzip.

**Rationale**: o script roda no site de terceiros; quebrar a página do cliente destrói a
confiança no produto (FR-006, SC-001).

### IV. Idempotência e Integridade de Conversões

Toda conversão (venda ou mensagem) MUST ser deduplicada por chave natural (`order.id`,
`message.id`) via constraint única no banco. Reprocessar um webhook ou reenviar um evento
NEVER pode gerar contagem, lead ou envio server-side duplicado. Envios de conversão às
plataformas são registrados e protegidos por `unique(event_id, target)`.

**Rationale**: métricas de atribuição só têm valor se forem confiáveis; duplicidade corrompe
ROI e polui os algoritmos das plataformas (FR-014).

### V. Preservação de Dados de Atribuição

Nenhum toque (click/UTM/click id) MUST ser descartado. O sistema persiste a jornada completa
do lead. O modelo de crédito de atribuição (primeiro/último clique, janela) é configuração
aplicada sobre os dados coletados — MUST NOT haver perda de dado que impeça recalcular outro
modelo posteriormente.

**Rationale**: decisão de Clarify — não fixar modelo no MVP exige que o dado bruto seja
preservado integralmente (FR-023).

### VI. Simplicidade e Testabilidade (YAGNI)

Prefira a solução mais simples que satisfaça os requisitos; complexidade adicional MUST ser
justificada na seção Complexity Tracking do plano. Lógica de domínio crítica — regex do `TRK`,
parse de UTM, atribuição, cripto, idempotência — MUST ter testes unitários. Cada integração
externa (API pública `/api/track`, webhooks Nuvemshop/Evolution, envios Meta/Google) MUST ter
teste de contrato. O regex canônico `\[Ref: (TRK-[A-Z0-9]+)\]` tem fonte única em
`packages/shared`.

**Rationale**: um MVP de agência precisa entregar valor rápido; testes se concentram onde um
erro silencioso corrompe atribuição ou vaza dados, não em cobertura cega.

## Restrições Adicionais (Segurança & Multi-Tenancy)

- Stack fixada: Next.js 15 + Supabase (Postgres/RLS, Auth, Storage, Edge Functions).
  Componentes always-on (Evolution API + worker) em VPS/Docker dedicado.
- Comunicação entre worker/Evolution e backend MUST ser autenticada (token compartilhado /
  assinatura).
- PII enviada às plataformas (telefone/e-mail) MUST ser normalizada e com hash SHA-256 antes do
  envio (Meta CAPI).
- Falha de uma integração de um tenant MUST ser isolada (`status = needs_reconnect`) sem afetar
  outros tenants ou clientes.

## Fluxo de Desenvolvimento & Quality Gates

- O fluxo Spec-Kit é o processo de mudança: `specify` → `clarify` → `plan` → `tasks` →
  `implement`. Mudanças de escopo voltam à spec, não são improvisadas no código.
- Todo plano de feature MUST passar no "Constitution Check" (gates I–VI) antes da implementação;
  violações não justificadas bloqueiam.
- Tarefas que tocam dados multi-tenant MUST incluir verificação de RLS; tarefas de integração
  MUST incluir teste de contrato.

## Governance

Esta constituição prevalece sobre outras práticas do projeto. Emendas exigem: (a) descrição da
mudança e justificativa, (b) atualização de versão semântica, (c) propagação aos templates e
planos dependentes.

Versionamento:
- MAJOR — remoção/redefinição incompatível de princípio ou governança.
- MINOR — novo princípio/seção ou expansão material de guidance.
- PATCH — clarificações e ajustes não semânticos.

Conformidade: revisões de implementação MUST verificar aderência aos princípios NON-NEGOTIABLE
(I, II) e aos gates do plano. Complexidade adicional MUST ser justificada. Este arquivo é a
fonte de verdade dos princípios; o `CLAUDE.md` referencia-os para orientação em runtime.

**Version**: 1.0.0 | **Ratified**: 2026-06-30 | **Last Amended**: 2026-06-30
