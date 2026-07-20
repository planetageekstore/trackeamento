# Escopo 002 — Conversões (Meta/Google/GA4) · Seletor de cliente · Sessões · Relatórios e Chat com IA · Dashboard · Qualificação de leads · CRM

**Status**: ✅ implementado (11 features) · **Data**: 2026-07-20
**Base de código**: `apps/dashboard` (Next.js 15) + `supabase/` (Postgres/RLS)

## Status de implementação
Todas as 11 features implementadas; typecheck do monorepo passa (`pnpm -r typecheck`).
Migrações novas: `0016`–`0018`, `0020`–`0025` (rodar `supabase db push`).
Crons novos a agendar: `/api/cron/qualify-leads` (1–2h), `/api/cron/dispatch-conversions` (15–30 min) — protegidos por `CRON_SECRET`.
**Pendências conhecidas (documentadas)**:
- F7: captura do `client_id` do cookie `_ga` no `tracker.js` fica para um passo seguinte (exige rebuild do tracker + schema compartilhado). O envio GA4 já funciona com `client_id` derivado como fallback.
- F5 (chat): persiste texto das mensagens (reconstrói a conversa); blocos de ferramenta não são persistidos na v1.
- Testes unitários das novas features ainda não escritos (typecheck cobre tipos).
- Falhas de teste pré-existentes em `track.test.ts`/`nuvemshop.test.ts` (mock do `NextRequest`) — não relacionadas a estas mudanças.

## Roteiro de implementação (ordem recomendada)

| Fase | Features | Tema | Por que nessa ordem |
|---|---|---|---|
| **1 — Fundação visual** | F6 (dashboard legível) · F2 (seletor de cliente) | UX imediata, esforço P | Dores diárias resolvidas em dias; F6 entrega os componentes de gráfico que F9 e F11 reutilizam |
| **2 — Análise completa** | F3 (sessões paginadas) · F4 (relatórios IA) · F11 (campanhas avançada) | Ver tudo, sem cortes | Núcleo analítico do produto; F11 introduz a primeira ação de escrita (pausar) com auditoria |
| **3 — Camada de IA** | F5 (chat IA) · F10 (engenharia de oferta) · F8 (qualificação de leads) · F9 (CRM) | IA operando sobre os dados | F5 aproveita ferramentas prontas das fases 1–2; F8 alimenta o CRM (F9) — nessa ordem obrigatória |
| **4 — Retorno às plataformas** | F1 (Meta CAPI + Google Offline) · F7 (GA4) | Campanhas mais inteligentes | Mesmo pipeline de dispatch para os 3 destinos; por último porque a F8 multiplica as conversões detectadas (compras via WhatsApp) — o envio nasce mais rico |

Dependências duras: **F9 depende da F8** (a IA posiciona os leads no funil); **F7 compartilha o pipeline da F1** (implementar juntas). Sinergias: F6 → gráficos usados por F9/F11; F3/F4/F8 → viram ferramentas do chat F5; F11 → dá à F5 a ação de pausar campanha (v2 do chat).

---

## F1 — Retorno de conversões para Meta Ads e Google Ads

### Objetivo
Enviar as conversões rastreadas pelo sistema (compras e leads) de volta às plataformas de anúncio, para que os algoritmos de otimização aprendam com quem realmente converteu (Meta CAPI + Google Offline Click Conversions).

### Estado atual (fundação já existe)
- Tabela `conversion_dispatch` criada desde a migração [0002_data.sql:114](../../supabase/migrations/0002_data.sql) — colunas `event_id`, `target` (`meta_capi` | `google_offline`), `status` (`pending`/`sent`/`failed`/`skipped`), `match_quality`, `response`, `attempts`, com dedup `unique(event_id, target)`. **Nunca foi populada** — não há nenhum código de envio hoje.
- Contrato dos payloads já especificado em [contracts/integrations.md](../001-multichannel-tracking/contracts/integrations.md) (FR-018).
- Dados de match já capturados: `lead.phone`/`lead.email`, `click.fbclid`/`click.gclid` + `clicked_at`.
- Conexões prontas: Meta guarda token cifrado + `meta.pixel_id` ([meta.ts](../../apps/dashboard/src/server/integrations/meta.ts)); Google guarda refresh token + `customer_id` ([google.ts](../../apps/dashboard/src/server/integrations/google.ts)).
- Eventos de conversão são inseridos em: [nuvemshop.ts:274](../../apps/dashboard/src/server/integrations/nuvemshop.ts) (PURCHASE via webhook `order/paid`) e [whatsappAttribution.ts](../../apps/dashboard/src/server/whatsappAttribution.ts) (MESSAGE_RECEIVED / PURCHASE).

### O que será construído

**1. Enfileiramento (sem tocar nos pontos de inserção)**
Um cron novo `POST /api/cron/dispatch-conversions` (mesmo padrão do [import-costs](../../apps/dashboard/src/app/api/cron/import-costs/route.ts): `CRON_SECRET`, roda a cada 15–30 min) que:
- Varre `event` dos últimos 7 dias com `event_type in ('PURCHASE','LEAD','MESSAGE_RECEIVED')` sem linha correspondente em `conversion_dispatch`, e cria linhas `pending` para cada provider conectado do tenant. O `unique(event_id, target)` garante idempotência.
- Processa as `pending`/`failed` com `attempts < 5` em lote.

Janela de 7 dias porque a Meta CAPI rejeita eventos com `event_time` mais antigo que 7 dias.

**2. Envio Meta CAPI** — novo módulo `server/dispatch/metaCapi.ts`
- `POST /{pixel_id}/events` com o token já cifrado na integração.
- Mapeamento: `PURCHASE` → `Purchase` (com `value`/`currency`); primeiro `MESSAGE_RECEIVED`/`LEAD` do lead → `Lead`.
- `event_id = event.id` (dedup com o pixel do navegador, se houver), `event_time = occurred_at`, `action_source = "website"`.
- `user_data`: `ph` (telefone E.164 só dígitos, SHA-256), `em` (e-mail minúsculo/trim, SHA-256), `fbc` montado do `fbclid` guardado (`fb.1.{click_ts_ms}.{fbclid}`) — é o que dá EMQ alto.
- Campo opcional `test_event_code` (configurável) para validar no Gerenciador de Eventos antes de ativar.
- Resultado gravado em `conversion_dispatch` (`sent` + `response`; `match_quality` = quais chaves foram enviadas, ex. `ph+em+fbc`).

**3. Envio Google Offline Conversions** — novo módulo `server/dispatch/googleOffline.ts`
- `customers/{customer_id}:uploadClickConversions` (v17, `partial_failure: true`).
- Requer `gclid`: evento de lead sem `gclid` no clique → `status = skipped` (sem retry).
- `conversion_date_time` = `occurred_at` do evento formatado com offset (`2026-07-20 10:15:00-03:00`) — nota: é a hora da **conversão**, não do clique (o contrato antigo dizia o contrário; Google exige conversão posterior ao clique).
- Requer uma **Conversion Action**: novo campo na página Integrações para escolher (listada via GAQL `SELECT conversion_action.id, conversion_action.name FROM conversion_action`) e salva em `integration.meta.conversion_action`.

**4. UI mínima (página Integrações)**
- Toggle "Enviar conversões de volta" por provider (salvo em `integration.meta.dispatch_enabled`).
- Campo `test_event_code` (Meta) e seletor de Conversion Action (Google).
- Contadores dos últimos 7 dias: enviadas / falhas / puladas (query em `conversion_dispatch`).

**5. Tratamento de falhas** (já previsto no contrato)
- 401/190 → `integration.status = needs_reconnect` (padrão já usado no import de custos).
- 429/5xx → mantém `pending`, `attempts + 1`; desiste em 5 tentativas (`failed` + `response` com o erro).

### Migração de banco
- `0016_dispatch.sql`: índice `conversion_dispatch (tenant_id, status)` + índice `event (tenant_id, occurred_at)` para a varredura do cron. Nenhuma tabela nova.

### Critérios de aceite
- Compra na Nuvemshop com `fbclid`/telefone aparece no Gerenciador de Eventos da Meta (test event) em ≤ 30 min, com EMQ ≥ 6.
- Lead com `gclid` aparece como conversão na Conversion Action escolhida no Google Ads.
- Reprocessar o cron não duplica envios (dedup por `event_id` + `unique(event_id, target)`).
- PII **nunca** sai em claro: somente hashes SHA-256 no payload da Meta; Google recebe só `gclid` (sem PII).
- Tenant sem integração conectada ou com toggle desligado: nada é enviado.

### Riscos / decisões em aberto
- Google Ads exige `GOOGLE_DEVELOPER_TOKEN` com acesso de produção (hoje pode estar em modo teste).
- Definir se `MESSAGE_RECEIVED` conta como `Lead` para todos os tenants ou se vira configuração (proposta: enviar só o **primeiro** por lead, sempre).

**Esforço: G** (2 módulos de envio + cron + UI + migração + testes unitários dos mapeadores).

---

## F2 — Seletor de clientes no cabeçalho da sidebar

### Objetivo
No topo da sidebar, onde aparece "CLIENTE / Planeta Geek Store", adicionar uma seta (chevron ∨) que abre um menu com todos os clientes que o usuário tem acesso, permitindo trocar sem passar pela página `/tenants`.

### Estado atual
- O cabeçalho é estático em [Sidebar.tsx:40-43](../../apps/dashboard/src/components/Sidebar.tsx) — recebe só `tenantName` do [layout.tsx](../../apps/dashboard/src/app/(tenant)/[tenant]/layout.tsx).
- A troca hoje é pelo link "↔ Trocar cliente" no rodapé da sidebar → `/tenants`.
- A lista de clientes visíveis já é resolvida por RLS (`supabase.from("tenant").select(...)` retorna só o que o usuário pode ver — mesmo mecanismo da página [/tenants](../../apps/dashboard/src/app/(agency)/tenants/page.tsx)).

### O que será construído
1. `layout.tsx` passa a buscar também a lista de tenants (`id, name`, ordenada por nome) e repassa à `Sidebar`.
2. Novo componente client `TenantSwitcher.tsx`:
   - Botão ocupando o cabeçalho atual (label "Cliente" + nome + chevron ∨ que rotaciona quando aberto).
   - Dropdown com a lista; cliente atual destacado com check.
   - Ao clicar, navega **preservando a página atual** (troca só o segmento do tenant no pathname: `/abc/leads` → `/xyz/leads`).
   - Item final "Ver todos os clientes" → `/tenants` (e o link do rodapé "↔ Trocar cliente" é removido, pois fica redundante).
   - Fecha com clique fora e `Esc`; navegável por teclado (setas + Enter).
3. Se o usuário só tem 1 cliente, o chevron não aparece (cabeçalho fica como hoje).

### Critérios de aceite
- Usuário de agência vê todos os clientes da agência no menu; usuário de cliente vê só os seus (RLS — sem query nova com service role).
- Trocar de cliente estando em `/{tenant}/campaigns` leva para `/{novoTenant}/campaigns`.
- Menu fecha com clique fora/Esc; estado aberto não persiste entre navegações.

**Esforço: P** (1 componente novo + ajuste no layout).

---

## F3 — Feed de sessões de todos os leads, paginado (50/página)

### Objetivo
Na área de Leads, mostrar **todas as sessões de todos os leads** (não só a lista de leads), com 50 sessões por página e paginação para navegar até as sessões mais antigas — nada é cortado.

### Estado atual
- [leads/page.tsx](../../apps/dashboard/src/app/(tenant)/[tenant]/leads/page.tsx) lista **leads** (não sessões), com `limit(100)` fixo e sem paginação — o excedente fica invisível.
- Não existe entidade "sessão" no banco. O detalhe do lead ([leads/[leadId]/page.tsx](../../apps/dashboard/src/app/(tenant)/[tenant]/leads/[leadId]/page.tsx)) já agrupa a jornada por **dia** (fuso `America/Sao_Paulo`) — esse é o conceito de sessão que o produto já usa.

### Definição adotada
**Sessão = lead × dia** (fuso São Paulo), consistente com o agrupamento já exibido no detalhe do lead. (Alternativa clássica de janela de 30 min de inatividade foi descartada no MVP: mais cara de computar e diferente do que a UI já mostra.)

### O que será construído

**1. Migração `0017_lead_session_view.sql`** — view `lead_session`:
```sql
create view lead_session with (security_invoker = true) as
select
  e.tenant_id,
  e.lead_id,
  (e.occurred_at at time zone 'America/Sao_Paulo')::date as session_date,
  min(e.occurred_at) as started_at,
  max(e.occurred_at) as ended_at,
  count(*)           as events_count,
  count(*) filter (where e.event_type = 'PAGE_VIEW') as pageviews,
  bool_or(e.event_type = 'PURCHASE') as has_purchase,
  bool_or(e.event_type in ('WHATSAPP_CLICK','MESSAGE_RECEIVED')) as has_whatsapp
from event e
where e.lead_id is not null
group by 1, 2, 3;
```
- `security_invoker = true` é obrigatório para a RLS de `event` continuar valendo (view padrão roda com direitos do dono e vazaria entre tenants).
- Índice de apoio: `event (tenant_id, occurred_at)` (o mesmo da F1 — criar uma vez só).

**2. Página de Leads reestruturada** — duas abas via search param (`?tab=`):
- **Sessões** (padrão): feed de sessões ordenado por `started_at desc`. Cada linha: lead (tracking code + nome/telefone quando houver, com link para o detalhe), data + faixa horária (`19:32 – 19:47`), nº de eventos/pageviews, badges 🛒 compra / 💬 WhatsApp, dispositivo e origem (primeiro clique do lead no dia, se houver: `utm_source`/anúncio).
- **Leads**: a tabela atual, também paginada (some o `limit(100)`).

**3. Paginação server-side (padrão para as duas abas)**
- `?page=N` (1-based) via `searchParams` (Promise no Next 15); consulta com `.range((page-1)*50, page*50 - 1)` + `count: "exact"` para o total.
- Controles: « Anterior · página X de Y · Próxima »; links (`<Link>`) para manter navegável/compartilhável; página fora do intervalo → redireciona para a última.
- Enriquecimento de criativos da Meta (thumbnails) continua limitado à página atual (60 IDs, como hoje) — sem custo extra por paginar.

### Critérios de aceite
- Tenant com 1.000+ sessões: página 1 mostra as 50 mais recentes; é possível navegar até a mais antiga registrada (sem limite de retenção na UI).
- Uma sessão de ontem e uma de hoje do mesmo lead aparecem como duas linhas distintas.
- Contagem total e nº de páginas corretos; página inválida não quebra.
- RLS: usuário não enxerga sessões de outro tenant (testar via view).
- Tempo de resposta da página ≤ 2s com 50k eventos (garantido pelo índice novo).

**Esforço: M** (migração + reescrita da página de leads + componente de paginação reutilizável).

---

## F4 — Aba "Análise": relatórios de período com IA

### Objetivo
Nova aba onde o usuário escolhe um período e as métricas que quer incluir, vê os cards de investimento/resultados desse período e gera com IA um relatório detalhado sobre o que foi feito nas campanhas — análise do período, pontos positivos e pontos de melhoria — com cada seção regenerável individualmente e um campo de opinião do gestor para fechar e salvar o relatório. (Referência visual: gerador de relatório semanal do Nexus.)

### Estado atual (quase tudo já existe como insumo)
- **Métricas Meta por período**: [`getCampaignsInsights`](../../apps/dashboard/src/server/integrations/meta.ts) já devolve spend, impressões, cliques, CTR, CPC, CPM, alcance, frequência, resultados, receita e ROAS por campanha com `since`/`until` arbitrários; [`getDailyInsights`](../../apps/dashboard/src/server/integrations/meta.ts) dá a evolução diária e [`getDemographics`](../../apps/dashboard/src/server/integrations/meta.ts)/[`getBreakdown`](../../apps/dashboard/src/server/integrations/meta.ts) as quebras.
- **Resultados próprios**: leads (`lead.created_at` no período), conversas iniciadas (`event` com `MESSAGE_RECEIVED`), compras/receita (`event` com `PURCHASE`). CPL e custo por conversa são derivados (spend ÷ contagem).
- **Geração com IA**: o [Engenheiro de Oferta](../../apps/dashboard/src/server/offer.ts) já estabelece o padrão inteiro — SDK `@anthropic-ai/sdk` com `ANTHROPIC_API_KEY`, saída em blocos fixos endereçáveis (`## emoji TÍTULO`), regeneração de bloco individual e persistência por tenant ([oferta/actions.ts](../../apps/dashboard/src/app/(tenant)/[tenant]/oferta/actions.ts)). O relatório reutiliza esse padrão, não cria um segundo.

### O que será construído

**1. Página `/[tenant]/analise`** (novo item "Análise 📈" na [Sidebar](../../apps/dashboard/src/components/Sidebar.tsx))
- Seletor de período (data início/fim, atalhos "últimos 7/14/30 dias").
- Checkboxes de métricas em dois grupos, com "Selecionar tudo"/"Limpar":
  - **Meta Ads**: Investimento, Impressões, Cliques, CTR, CPC, CPM, Alcance, Frequência.
  - **Resultados**: Leads, CPL, Conversas iniciadas, Custo por conversa, Compras, Receita, ROAS.
- Cards com os valores do período (apenas as métricas marcadas).
- Botão **Gerar Relatório**.

**2. Módulo `server/report.ts`** (espelho do `offer.ts`)
- Monta o contexto para a IA: métricas agregadas do período, evolução diária, tabela por campanha (nome, gasto, resultados, CPL), comparativo com o período anterior de mesma duração (para a IA falar de tendência) e demografia.
- Blocos fixos regeneráveis:
  - `## 📊 ANÁLISE DO PERÍODO` — o que aconteceu, números em contexto.
  - `## ✅ PONTO POSITIVO` — o destaque da semana/período.
  - `## ⚠️ PONTOS DE MELHORIA` — o que está caro/fraco e por quê.
  - `## 🎯 PRÓXIMOS PASSOS` — recomendações acionáveis (orçamento, criativos, segmentação).
- Regras do prompt: só afirmar o que os números sustentam, nunca inventar métrica não fornecida, português do Brasil, tom de gestor de tráfego sênior.

**3. Persistência — migração `0018_report.sql`**, tabela `report`:
- `id, tenant_id, period_start, period_end, metrics (jsonb — valores capturados no momento da geração), selected_metrics (text[]), blocks (jsonb), manager_opinion (text), model, created_at` + RLS por tenant (mesmo padrão da tabela `oferta`).
- Salvar as métricas junto congela o retrato do período — o relatório não muda se a Meta reprocessar números depois.
- **Opinião do gestor é obrigatória para salvar** (como na referência); sem ela o relatório existe só na tela.
- Lista de relatórios salvos na própria página (título = período), abrindo para leitura.

**4. Server actions** (`analise/actions.ts`): `gerarRelatorio`, `regenerarBloco` (reaproveita o parser de blocos do offer — extrair helper comum para `server/aiBlocks.ts`), `salvarRelatorio`.

### Fora do escopo (v1)
- "Seguidores ganhos" (referência Nexus): a API de Insights de anúncios da Meta não expõe follows de forma confiável — exigiria token de Página. Fica para depois.
- Export em PDF/link público para o cliente final — candidato natural a escopo 003.
- Google Ads no relatório: v1 cobre Meta + resultados próprios; incluir Google quando houver tenant com Google conectado de fato.

### Critérios de aceite
- Selecionar 14–20/07 e gerar: cards batem com a página Campanhas no mesmo período; relatório cita apenas métricas marcadas.
- "Regenerar com IA" em uma seção altera só aquela seção, mantendo as demais.
- Salvar sem opinião do gestor é bloqueado com mensagem clara.
- Relatório salvo reaberto semanas depois mostra os números originais (congelados no `metrics`).
- Tenant sem Meta conectado: página funciona só com métricas de Resultados (leads/conversas dos dados próprios) e avisa que Meta não está conectado.

**Esforço: M** (página nova + módulo de IA espelhado no offer + 1 migração + actions).

---

## F5 — Aba "Chat": conversar com a IA sobre o cliente

### Objetivo
Nova aba de chat por cliente ("Conversar sobre Planeta Geek Store") onde o usuário conversa com o Claude sobre aquele tenant. A IA tem acesso a **todos os dados do sistema** (leads, sessões, jornadas, conversões, campanhas, conversas de WhatsApp, ofertas, relatórios salvos) e às **integrações conectadas** (Meta, Google, Nuvemshop, WhatsApp) para responder perguntas como "por que o CPL subiu essa semana?" ou "quais anúncios trouxeram os leads que compraram?" e sugerir otimizações. (Referência visual: aba Chat do Nexus, com chips de sugestão e seletor de modelo.)

### Arquitetura: agente com ferramentas, não prompt gigante
Em vez de despejar todos os dados do tenant no prompt (caro, estoura contexto e envelhece), a IA recebe **ferramentas** (tool use, via Tool Runner do SDK `@anthropic-ai/sdk` — o SDK conduz o loop chamar→executar→responder automaticamente). Cada ferramenta é uma função server-side **amarrada ao tenant da conversa** — a IA nunca escolhe o tenant, ele vem da rota/RLS:

| Ferramenta | Fonte (já existe) |
|---|---|
| `get_campaign_metrics(since, until)` | `getCampaignsInsights` (Meta) + `campaign_cost` |
| `get_daily_evolution(since, until)` | `getDailyInsights` |
| `get_breakdown(dimensão, período)` | `getBreakdown` / `getDemographics` (posicionamento, região, device, hora, idade×gênero) |
| `get_ads_report(since, until)` | `getAdsReport` (criativos com miniatura, gasto, status) |
| `query_leads(filtros, limite)` | tabela `lead` (RLS) |
| `get_lead_journey(lead_id)` | `click` + `event` (a jornada do detalhe do lead) |
| `get_sessions_summary(período)` | view `lead_session` (F3) |
| `get_conversions(período)` | `event` PURCHASE/LEAD/MESSAGE_RECEIVED com valores |
| `get_whatsapp_conversations(limite)` | dados da página Conversas |
| `get_integration_status()` | tabela `integration` (o que está conectado/precisa reconectar) |
| `get_offers()` / `get_reports()` | tabelas `oferta` e `report` (F4) |

Todas **somente leitura** na v1 — a IA analisa e recomenda, não altera campanha/orçamento. Ações de escrita (pausar campanha, ajustar orçamento, criar campanha — como o Nexus promete) ficam para v2, atrás de confirmação explícita do usuário por ação.

### O que será construído

**1. Página `/[tenant]/chat`** (item "Chat 💬 IA" na Sidebar)
- Tela inicial com chips de sugestão ("Campanhas ativas", "Relatório 7 dias", "Análise de leads", "Sugestões de otimização") que preenchem a primeira mensagem.
- Conversa com streaming token a token; balões de "consultando dados…" enquanto ferramentas rodam.
- Histórico de conversas do tenant na lateral ("Nova conversa" / retomar).
- Anexo de imagem (print de criativo/métrica) na v1.1 — a API já suporta, mas fica fora da v1 para não inchar.

**2. Rota `POST /api/chat` (streaming)**
- Route handler Node que autentica o usuário, valida acesso ao tenant e conduz o loop de ferramentas com `client.beta.messages.toolRunner({ stream: true, ... })`, repassando os tokens por SSE para o cliente.
- Modelo: `claude-opus-4-8` por padrão (mesma família do Engenheiro de Oferta); `thinking: adaptive`. Seletor de modelo (Haiku p/ perguntas rápidas ↔ Opus p/ análise profunda, como no Nexus) é opcional — proposta: começar sem seletor e medir custo.
- System prompt estável (persona "gestor de tráfego sênior com acesso aos dados do cliente", regras de honestidade com números, PT-BR) com `cache_control` — o prompt fixo primeiro e o contexto volátil (nome do tenant, data, integrações conectadas) por último, para aproveitar prompt caching entre turnos.
- Limites de custo: máx. de iterações de ferramenta por turno (ex.: 8), `max_tokens` com teto, e limite diário de mensagens por tenant (configurável) para o custo não fugir.

**3. Persistência — migração `0019_chat.sql`**
- `chat_conversation (id, tenant_id, title, created_at)` + `chat_message (id, conversation_id, tenant_id, role, content jsonb, created_at)` com RLS por tenant (mesmo padrão das demais tabelas).
- `content` guarda os blocos da API (texto + tool_use/tool_result) para reconstruir a conversa fielmente ao retomar.
- Título da conversa gerado da primeira pergunta (truncada).

**4. Segurança**
- Ferramentas executam server-side com o tenant fixado pela rota — a RLS de cada tabela é a segunda barreira.
- A IA nunca vê tokens/segredos das integrações: as ferramentas chamam os módulos existentes (`meta.ts` etc.), que descriptografam internamente.
- Dados de PII (telefone/e-mail de leads) só entram na conversa se o usuário pedir explicitamente por um lead; listagens agregadas não expõem contato.

### Critérios de aceite
- "Qual campanha teve o melhor CPL nos últimos 7 dias?" → a IA chama `get_campaign_metrics`, responde com números que batem com a página Campanhas.
- "Me mostra a jornada do lead que comprou ontem" → encadeia `get_conversions` → `get_lead_journey` sem intervenção.
- Pergunta sobre integração desconectada → a IA informa o status e orienta reconectar (via `get_integration_status`), sem inventar dados.
- Trocar de cliente no seletor (F2) leva a um chat separado — conversas nunca vazam entre tenants (testar RLS).
- Conversa retomada dias depois mantém o histórico e continua funcional.
- Resposta começa a aparecer (primeiro token) em ≤ 5s em pergunta simples.

### Fora do escopo (v1)
- Ações de escrita nas plataformas (pausar/criar campanha, ajustar orçamento) — v2, com confirmação por ação.
- Anexos de imagem e áudio.
- Chat entre clientes/agregado da agência (o chat é sempre de um tenant).

**Esforço: G** (rota streaming + ~10 ferramentas + UI de chat + migração + testes das ferramentas).

---

## F6 — Dashboard legível: gráficos maiores e com leitura de valores

### Objetivo
Os gráficos do dashboard estão pequenos demais para análise ("Evolução de leads" e "Gasto por campanha" ficam com ~460px de largura e fontes ilegíveis). Aumentar a área útil, o tamanho dos gráficos e permitir ler os valores exatos.

### Causa (diagnóstico no código)
- O dashboard inteiro é limitado a `max-w-5xl` (1024px) em [page.tsx:137](../../apps/dashboard/src/app/(tenant)/[tenant]/page.tsx) e os dois gráficos dividem `grid md:grid-cols-2` — cada um fica com ~460px.
- O [TrendChart](../../apps/dashboard/src/components/TrendChart.tsx) desenha em `viewBox` de 760×220 e escala para caber: as fontes de 9px do SVG viram ~5px renderizados.
- Não há tooltip/hover — nenhum valor exato é legível; só a forma da curva.

### O que será construído
1. **Layout mais largo**: dashboard passa de `max-w-5xl` para `max-w-7xl` (e as demais páginas de análise idem, por consistência); em telas < `lg`, os gráficos empilham em coluna única (1 gráfico por linha, largura total) em vez de espremer dois lado a lado.
2. **TrendChart maior e legível**:
   - Altura padrão de 220 → 300px; fontes dos eixos dimensionadas para o tamanho renderizado (não mais encolhidas pelo viewBox — usar `preserveAspectRatio` + dimensões relativas ou re-render por container width via `ResizeObserver`).
   - **Tooltip por hover/touch**: linha vertical no ponto mais próximo + balão com data e valor de cada série (o componente já é client-side; sem lib externa, mantém o padrão SVG puro do projeto).
   - Pontos (dots) nos dados quando a série tem ≤ 31 pontos.
   - Eixo Y com formatação `R$` já existente mantida.
3. **Expandir gráfico**: botão ⤢ no card abre o gráfico em tela cheia (modal/overlay) para análise detalhada — útil no notebook pequeno.
4. Mesmo tratamento nos demais gráficos que usarem `TrendChart` (campanhas) e nos cards de demografia se estiverem espremidos no novo layout.

### Critérios de aceite
- Em tela 1366×768, os rótulos dos eixos são legíveis sem zoom e o gráfico ocupa ≥ 600px de largura.
- Hover em qualquer ponto mostra data + valor exato de cada série.
- Modal de expansão abre/fecha por clique e Esc, com o gráfico ocupando a viewport.
- Nada quebra no mobile (gráficos empilhados, tooltip por toque).

**Esforço: P** (1 componente reescrito + ajustes de layout; sem migração, sem lib nova).

---

## F7 — Integração GA4 (Google Analytics 4)

### Objetivo
Adicionar o GA4 às integrações com a mesma simplicidade da Nuvemshop: o usuário cola o **ID de medição** (`G-XXXXXXXXXX`) na página Integrações e o rastreamento passa a alimentar o GA4 do cliente — tanto os pageviews no site quanto as conversões rastreadas pelo sistema (compras e leads de WhatsApp, que o GA4 sozinho não enxerga).

### Como funciona (duas metades)
**1. Web (gtag via tracker)** — o `tracker.js` já é injetado na loja via Nuvemshop (`POST /scripts`). Com GA4 conectado, ele passa a:
- Carregar o `gtag.js` com o Measurement ID do tenant (se a loja ainda não tiver GA4 — detecta `window.gtag`/`dataLayer` para não duplicar).
- **Capturar o `client_id` do cookie `_ga`** e enviá-lo no payload de track — guardado no lead. Esse é o elo que permite a metade 2.

**2. Server (Measurement Protocol)** — conversões que só o sistema conhece (compra confirmada na Nuvemshop, lead/compra detectados no WhatsApp) são enviadas ao GA4 via `POST /mp/collect` com `measurement_id` + `api_secret`:
- Reutiliza o pipeline de dispatch da F1: novo target `ga4_mp` em `conversion_dispatch` — mesma varredura, mesmo dedup (`unique(event_id, target)`), mesmo tratamento de falha.
- Eventos: `purchase` (com `transaction_id = event.id`, `value`, `currency`) e `generate_lead`.
- `client_id`: o capturado do `_ga`; leads sem ele (ex.: lead que só veio pelo WhatsApp) usam um client_id determinístico derivado do `tracking_code` — o evento entra no GA4 mesmo sem sessão web.

### O que será construído
- Migração `0020_ga4.sql`: `alter type integration_provider add value 'ga4'` + `alter type dispatch_target add value 'ga4_mp'` + coluna `lead.ga_client_id`.
- Card GA4 na página Integrações: campos **Measurement ID** e **API Secret** (criado em Admin → Data Streams → Measurement Protocol no GA4; instrução na UI), toggle "carregar gtag no site".
- Tracker: captura do `_ga` + carregamento condicional do gtag (respeitando o limite de 15KB — o gtag é carregado async externo, não empacotado).
- Módulo `server/dispatch/ga4.ts` no pipeline da F1.

### Critérios de aceite
- Colar Measurement ID + API Secret → compra de teste na Nuvemshop aparece no GA4 (Realtime/DebugView) em ≤ 30 min como `purchase` com valor.
- Lead de WhatsApp sem sessão web aparece como `generate_lead`.
- Loja que já tem GA4 próprio instalado não recebe gtag duplicado.
- Reprocessar o cron não duplica eventos (`transaction_id` + dedup do dispatch).
- API Secret cifrado em repouso como os demais tokens (`access_token_enc`).

**Esforço: M** (compartilha a infraestrutura da F1; a parte nova é o tracker capturar `_ga` e o módulo MP).

---

## F8 — Qualificação de leads por IA (análise das conversas de WhatsApp)

### Objetivo
A IA lê as conversas de WhatsApp de cada lead e o classifica automaticamente: **temperatura** (quente/morno/frio), **estágio** (novo, em conversa, follow-up recomendado, negociação, comprou, perdido), se **houve compra**, e se **já cabe follow-up** (com sugestão de mensagem). É o motor que alimenta o CRM (F9) e vira ferramenta do chat (F5).

### Estado atual (matéria-prima pronta)
- Mensagens **recebidas** já são persistidas com texto em `event.event_data.text` ([whatsappAttribution.ts:80](../../apps/dashboard/src/server/whatsappAttribution.ts)).
- A conversa **completa** (enviadas + recebidas) o sistema já busca da Uazapi via [`listChats`/`getMessages`](../../apps/dashboard/src/server/integrations/uazapi.ts) — é o que renderiza a aba Conversas.
- Detecção de compra hoje é por **palavra-chave fixa** ("comprei", "paguei"…) — a IA substitui por análise semântica (a palavra-chave continua como fallback imediato).

### O que será construído

**1. Módulo `server/leadQualification.ts`**
- Para cada lead com telefone e conversa: monta a transcrição (via `getMessages`), envia ao Claude com **structured outputs** (`output_config.format` com json_schema — resposta sempre válida, sem parse frágil):
```json
{
  "temperatura": "quente | morno | frio",
  "estagio": "novo | em_conversa | followup | negociacao | comprou | perdido",
  "houve_compra": true,
  "evidencia_compra": "trecho da conversa",
  "followup_recomendado": true,
  "followup_sugestao": "mensagem sugerida",
  "resumo": "resumo de 2 frases da conversa",
  "confianca": 0.9
}
```
- Regras do prompt: basear-se só na transcrição, citar evidência para compra/perda, PT-BR.

**2. Persistência — migração `0021_qualification.sql`**
- Tabela `lead_qualification` (histórico): `lead_id, tenant_id, stage, temperature, purchase_detected, followup jsonb, summary, confidence, model, analyzed_at` + RLS.
- Campos materializados em `lead`: `stage`, `temperature`, `stage_source` (`ai` | `manual`), `qualified_at` — leitura rápida para o CRM e o feed de leads.

**3. Gatilho — cron `/api/cron/qualify-leads`**
- Roda a cada 1–2h: re-analisa apenas leads com `MESSAGE_RECEIVED` novo desde a última qualificação (idempotente, barato). Botão "Reanalisar" manual no detalhe do lead.
- Compra detectada pela IA com confiança ≥ 0.8 → registra evento `PURCHASE` (`external_id: ai:{message_id}`, dedup natural) — entra no funil de conversões e no envio da F1/F7.

**4. Integração com o resto**
- F5 (chat) ganha a ferramenta `get_lead_qualification(lead_id | filtros)`.
- Detalhe do lead exibe o card de qualificação (temperatura, estágio, resumo, sugestão de follow-up).

### Decisões em aberto
- **Modelo**: `claude-opus-4-8` (qualidade máxima) vs `claude-haiku-4-5` (~5× mais barato, escala melhor para centenas de conversas/dia). Proposta: começar com Opus, medir custo no cron e decidir com números.
- PURCHASE automático via IA: proposta acima é criar o evento com confiança ≥ 0.8; alternativa conservadora é só marcar na qualificação e exigir confirmação manual no CRM.

### Critérios de aceite
- Conversa com "vou pensar e te falo semana que vem" → estágio `followup`, com sugestão de mensagem e data implícita respeitada.
- Conversa com comprovante/confirmação de pagamento → `comprou` + evento PURCHASE criado (e despachado à Meta/GA4 se F1/F7 ativas).
- Lead que parou de responder há 2+ semanas após interesse → `perdido` ou `followup` (nunca `quente`).
- Cron reprocessa só quem tem mensagem nova; rodar duas vezes não duplica nada.
- Qualificação nunca vaza entre tenants (RLS na tabela nova).

**Esforço: M/G** (módulo IA + cron + migração; a busca de conversas já existe).

---

## F9 — Aba CRM: funil kanban + evolução de leads

### Objetivo
Nova aba "CRM" onde os leads aparecem como cards num **kanban por estágio do funil**, posicionados automaticamente pelo trackeamento do WhatsApp (F8). O usuário vê onde cada lead está, arrasta para corrigir/mover manualmente, e acompanha um **gráfico de evolução dos leads** por estágio ao longo do tempo.

### O que será construído

**1. Página `/[tenant]/crm`** (item "CRM 📋" na Sidebar)
- Colunas fixas na v1: **Novo → Em conversa → Follow-up → Negociação → Comprou → Perdido** (funis configuráveis por tenant ficam para v2).
- Card do lead: nome/telefone (ou tracking code), badge de temperatura (🔥 quente / 🌡 morno / ❄ frio), resumo da IA (1 linha), valor da compra quando houver, tempo desde a última interação, origem (anúncio/bio). Clique abre o detalhe do lead.
- **Drag-and-drop** entre colunas (HTML5 DnD, sem lib — padrão do projeto): mover manualmente grava `stage_source = 'manual'`.
- Regra de convivência IA × manual: movimento manual **prevalece**; a IA não sobrescreve estágio manual — se discordar, mostra badge "IA sugere: Negociação" no card, e o usuário aceita com um clique.
- Filtros: temperatura, período de criação, busca por nome/telefone. Contador e valor somado por coluna (ex.: "Negociação · 12 leads · R$ 3.400 potencial").

**2. Gráfico de evolução (topo da aba)**
- Linhas/área por estágio ao longo do tempo (leads em cada estágio por dia, últimos 30d) usando o `TrendChart` melhorado da F6 — mostra o funil "andando": novos entrando, negociação crescendo, compras acumulando.
- Fonte: tabela `lead_stage_history` (F9) — cada mudança de estágio (IA ou manual) grava uma linha; o gráfico agrega por dia.

**3. Migração `0022_crm.sql`**
- `lead_stage_history (id, tenant_id, lead_id, stage, source ai|manual, changed_at)` + RLS + índice `(tenant_id, changed_at)`.
- Trigger simples (ou gravação na aplicação) ao mudar `lead.stage`.

**4. Server actions** — `moverLead(leadId, stage)` (drag-and-drop), `aceitarSugestaoIA(leadId)`.

### Critérios de aceite
- Lead qualificado pela F8 como `negociacao` aparece na coluna Negociação sem ação manual.
- Arrastar um card para "Comprou" persiste, sobrevive a reload e a IA não o move de volta.
- Gráfico mostra a série por estágio nos últimos 30 dias e bate com as contagens das colunas no dia atual.
- 500+ leads: colunas viram scroll virtual/paginado (50 por coluna com "carregar mais") sem travar.
- Tenant sem WhatsApp conectado: CRM funciona com estágio manual apenas (todos entram em "Novo").

**Esforço: M** (kanban + gráfico + migração; a inteligência vem pronta da F8).

---

## F10 — Engenharia de Oferta reformulada (4 sub-abas + Grand Slam Offer)

### Objetivo
Evoluir a aba Engenheiro de Oferta do formulário único atual (5 campos → 7 blocos) para uma **central de copy e ofertas** no formato da referência (Nexus): 4 sub-abas — chat livre, gerador de copy de anúncio, Grand Slam Offer e biblioteca de notas — com a saída do Grand Slam Offer **exatamente no formato do exemplo aprovado** (ver "Formato de saída" abaixo).

### Estado atual
- [oferta/page.tsx](../../apps/dashboard/src/app/(tenant)/[tenant]/oferta/page.tsx) + [server/offer.ts](../../apps/dashboard/src/server/offer.ts): 5 inputs fixos (nicho, produto, preço, roma, problema) → 7 blocos (`OFFER_BLOCKS`), com regeneração por bloco e persistência na tabela `oferta`. Essa infraestrutura (parser de blocos, regeneração, persistência) é reaproveitada — muda o formato e a UI, não o mecanismo.

### O que será construído

**1. Quatro sub-abas** (tabs via search param, na mesma rota `/[tenant]/oferta`)

**💬 Engenheiro** — chat livre de copy: "me dê 5 headlines no estilo Halbert", "reescreva essa copy com PAS", "qual o ângulo para esse público?". Reutiliza a infraestrutura de chat da F5 (streaming + persistência), mas com persona e escopo distintos: **só copy e oferta, não mexe em campanhas nem dados** — a única "ferramenta" é a leitura da biblioteca de notas. Se a F5 ainda não existir, entra como v1 sem streaming (server action, resposta única).

**✍️ Copy de Anúncio** — formulário: produto/serviço, público-alvo, objetivo, tom, diferencial (opcional) e plataforma (Meta Ads / Google Ads / TikTok / Orgânico). **Chips de framework** (aplicam ao clicar): AIDA, PAS, BAB, FAB, 4 Ps, Gatilhos mentais, 5 estágios de consciência, Sofisticação de mercado, Storytelling. Botão "Gerar 3 variações" — cada variação com headline + corpo + CTA adequados aos limites da plataforma escolhida. Modo **"Sem IA (biblioteca pronta)"**: preenche a partir de templates da biblioteca sem chamar a API (custo zero, resposta instantânea).

**🎯 Grand Slam Offer** — formulário enxuto: produto/serviço, público-alvo, problema/dor (opcional), preço/ticket de referência (opcional) → "Construir oferta". Gera no formato abaixo, com **regeneração por bloco** (mecanismo atual mantido).

**📚 Biblioteca** — CRUD de notas de copy (título, conteúdo, tags): frameworks, headlines clássicas, princípios (Hopkins, Ogilvy, Schwartz, Halbert, Hormozi). Vem **pré-carregada (seed)** com ~30 notas essenciais; o usuário adiciona/edita as suas. Contador "Biblioteca carregada — N notas" no topo da aba. As notas alimentam todas as sub-abas: entram no prompt (com `cache_control` — a biblioteca muda raramente, cacheia bem).

**2. Checkbox "Usar contexto do cliente"** (topo da aba, desligado por padrão) — quando ligado, injeta no prompt um resumo do tenant: nicho/nome, produtos mais vendidos (Nuvemshop, se conectada), público predominante (demografia da Meta, se conectada) e dores citadas nas conversas de WhatsApp (da F8, se disponível). Cada fonte é opcional — usa o que houver.

**3. Formato de saída do Grand Slam Offer** (blocos endereçáveis, novo `GSO_BLOCKS` no lugar do `OFFER_BLOCKS`):

| Bloco | Conteúdo |
|---|---|
| 🏆 `nome_oferta` | Headline da oferta: promessa + prazo + reversão de risco ("…em 7 dias ou devolvemos seu dinheiro") |
| 🌟 `resultado_sonhos` | O resultado dos sonhos em 1 parágrafo, na linguagem do público |
| ⚖️ `equacao_valor` | As 4 alavancas de Hormozi, cada uma com a tática concreta: Resultado dos sonhos · Probabilidade percebida · Atraso de tempo · Esforço e sacrifício |
| 🥞 `stack_valor` | Entregáveis com valor individual (R$) e justificativa de valor em cada item |
| 🛡️ `garantia` | Garantia nomeada + risco reverso ("o risco é 100% nosso"), com o que o cliente mantém mesmo devolvendo |
| ⏳ `escassez` | Escassez/urgência com motivo **real** (lote, curadoria, prazo) — nunca inventada; sem dado real, placeholder explícito |
| 💰 `ancoragem` | Valor total do stack somado vs preço da oferta, variações (ex.: iniciante/avançado) e parcelamento comparado a algo cotidiano |
| 🎁 `bonus` | Bônus numerados, cada um com valor (R$) e o porquê de existir |
| 📣 `copy_final` | Parágrafo único pronto para anúncio/página: dor → mecanismo → oferta → garantia → escassez → CTA |

O exemplo aprovado (kit Funko Pop) entra no prompt como **few-shot de referência de qualidade e formato**.

**4. Migração `0023_oferta_v2.sql`**
- Tabela `oferta`: novas colunas `kind` (`gso` | `ad_copy`), `inputs jsonb` (os campos do formulário usado — flexível para os dois tipos), mantendo `blocks`/`output_md`/`model`. Ofertas antigas continuam legíveis (kind `gso` legado).
- Tabela `copy_note (id, tenant_id, title, content, tags text[], created_at)` + RLS + seed das ~30 notas iniciais.

### Critérios de aceite
- Grand Slam Offer com só "produto + público" preenchidos gera todos os 9 blocos no formato do exemplo, com valores de stack coerentes com o preço de referência quando informado.
- "Regenerar" em um bloco (ex.: escassez) altera só aquele bloco.
- Escassez/urgência sem dado real vem com placeholder explícito — nunca número inventado como fato.
- Copy de Anúncio com framework PAS + plataforma Meta gera 3 variações distintas dentro dos limites de caracteres do Meta.
- Modo "Sem IA" não faz nenhuma chamada à API.
- Checkbox de contexto ligado muda o output (menciona produtos/público reais do tenant); desligado, nada do tenant vaza no prompt.
- Notas da biblioteca criadas pelo usuário influenciam as gerações seguintes.

**Esforço: M/G** (4 sub-abas + novo formato + migração + seed; parser/regeneração/persistência reaproveitados do atual).

---

## F11 — Campanhas avançada: hierarquia completa, todas as métricas e pausar de dentro do sistema

### Objetivo
Evoluir a aba Campanhas para um gerenciador completo (referência: Nexus): navegação por **Campanhas → Conjuntos de anúncios → Anúncios**, todas as métricas em cards e tabela, dashboards de investimento por nível, e **pausar/reativar campanhas, conjuntos e anúncios de dentro do sistema** — a primeira ação de escrita nas plataformas.

### Estado atual
- A página [campaigns/page.tsx](../../apps/dashboard/src/app/(tenant)/[tenant]/campaigns/page.tsx) já tem: métricas por campanha (`getCampaignsInsights`: gasto, impressões, cliques, alcance, CTR, CPC, CPM, frequência, resultados, receita, ROAS), relatório de anúncios com criativos (`getAdsReport`), quebras (`getBreakdown`/`getDemographics`) e seletor de período.
- Faltam: o nível **conjunto de anúncios** (adset), CPA e leads por linha, filtros de status, ordenação na tabela, gráficos por métrica selecionável, e qualquer ação de escrita.
- Viabilidade de pausar: o OAuth Meta já pede escopo `ads_management` ([contracts/integrations.md](../001-multichannel-tracking/contracts/integrations.md)) — pausar é `POST /{id} {status: PAUSED}` na Graph API com o token existente. Tokens colados manualmente (System User) podem ser somente leitura — tratar o erro de permissão com orientação na UI.

### O que será construído

**1. Barra de filtros (topo)**
- **Período**: presets Hoje / 7d / 14d / 30d / Este mês + Personalizado (date range) — evolui o seletor existente.
- **Filtros encadeados**: campanha → conjunto → anúncio (selecionar uma campanha filtra os conjuntos, etc.) + **status** (Somente ativas / Pausadas / Todas).
- Botão **Atualizar** com "Atualizado às HH:MM:SS" (os dados já vêm ao vivo da Graph API; o botão força `router.refresh`).
- **Exportar CSV** da visão filtrada (Google Sheets direto fica para v2 — exigiria OAuth de escrita no Google).

**2. Cards de métricas (linha superior)**
- Todas as métricas do nível/filtro selecionado: Investimento, Impressões, Frequência, Alcance, Cliques, CTR, CPC, CPM, CPA, Leads/Resultados, Receita, ROAS.
- Botão **"Métricas"**: escolher quais cards aparecem (persistido por usuário em `localStorage`).

**3. Dashboards (2 gráficos, usando os componentes da F6)**
- **Evolução no tempo — [métrica]**: linha diária da métrica escolhida no seletor "Métrica do gráfico" (investimento, cliques, leads, CPA…), com linha de tendência tracejada.
- **Comparativo por [nível] — [métrica]**: barras comparando campanhas, conjuntos ou anúncios (segue a aba ativa) — novo componente `BarChart` (SVG puro, mesmo padrão do TrendChart).

**4. Tabela detalhada com 3 níveis (abas Campanhas / Conjuntos / Anúncios)**
- Colunas: nome (com miniatura do criativo no nível anúncio), campanha/conjunto pai, Invest., Impr., Freq., Cliques, CTR, CPC, CPA, Leads, ROAS, status.
- **Ordenação por qualquer coluna** (padrão: investimento desc) e checkbox por linha para ações em massa.
- Nível conjunto exige fetcher novo: `getAdsetsInsights` (`level=adset` na Graph API — mesmo padrão do `getCampaignsInsights`). CPA/leads por linha vêm do campo `actions` que a API já retorna.

**5. Pausar / reativar (ação de escrita — Meta na v1)**
- Botão **⏸ Pausar / ▶ Ativar** por linha + ação em massa nas linhas selecionadas.
- **Confirmação obrigatória** antes de executar (modal: "Pausar a campanha X? Ela para de veicular imediatamente"), sem exceção para massa.
- Server action chama `POST /{object_id}` com `status: PAUSED|ACTIVE`; atualização otimista na UI + refetch.
- **Log de ações**: tabela `campaign_action_log (tenant_id, user_id, object_type, object_id, object_name, action, result, created_at)` — quem pausou o quê e quando (essencial para agência com vários usuários).
- Token sem `ads_management` → erro claro na UI ("Este token é somente leitura — reconecte a Meta com permissão de gerenciamento"), sem quebrar a página.
- Google Ads: leitura continua como está; pausar campanhas Google fica para v2 (exige `campaigns:mutate` e validação do developer token).

### Migração
- `0024_campaign_action_log.sql`: tabela de auditoria + RLS.

### Critérios de aceite
- Aba Anúncios mostra os 3 níveis navegáveis; selecionar uma campanha no filtro restringe conjuntos e anúncios exibidos.
- Cards e tabela batem com o Gerenciador de Anúncios da Meta no mesmo período (tolerância de atribuição documentada).
- Pausar um anúncio pelo sistema reflete na Meta em segundos (verificável no Gerenciador) e fica registrado no log com o usuário.
- Ação em massa: pausar 5 anúncios selecionados executa as 5 chamadas e reporta sucesso/falha por item.
- Ordenar por CPA reordena a tabela sem nova chamada à API (dados já em memória).
- Token somente leitura: página funciona 100% para leitura e mostra o aviso apenas ao tentar pausar.
- Exportar CSV baixa exatamente as linhas/colunas visíveis com os filtros aplicados.

**Esforço: G** (novo fetcher adset + 2 gráficos + tabela 3 níveis com ordenação/massa + primeira ação de escrita com auditoria).

---

## Resumo de artefatos novos

| Item | Tipo | Feature |
|------|------|---------|
| `supabase/migrations/0016_dispatch.sql` | migração (índices) | F1/F3 |
| `supabase/migrations/0017_lead_session_view.sql` | migração (view) | F3 |
| `server/dispatch/metaCapi.ts` + `googleOffline.ts` | módulos server | F1 |
| `app/api/cron/dispatch-conversions/route.ts` | cron | F1 |
| UI em `integracoes/page.tsx` (toggles + conversion action) | UI | F1 |
| `components/TenantSwitcher.tsx` | componente client | F2 |
| `leads/page.tsx` (abas Sessões/Leads + paginação) | página | F3 |
| `components/Pagination.tsx` | componente | F3 |
| `supabase/migrations/0018_report.sql` | migração (tabela + RLS) | F4 |
| `server/report.ts` + `server/aiBlocks.ts` (helper extraído do offer) | módulos server | F4 |
| `app/(tenant)/[tenant]/analise/page.tsx` + `actions.ts` | página + actions | F4 |
| Item "Análise" na `Sidebar.tsx` | UI | F4 |
| `supabase/migrations/0019_chat.sql` | migração (tabelas + RLS) | F5 |
| `server/chat/tools.ts` (ferramentas tenant-scoped) + `server/chat/agent.ts` | módulos server | F5 |
| `app/api/chat/route.ts` (streaming SSE) | rota | F5 |
| `app/(tenant)/[tenant]/chat/page.tsx` + componentes de chat | página | F5 |
| Item "Chat" na `Sidebar.tsx` | UI | F5 |
| `components/TrendChart.tsx` reescrito (tooltip, tamanho, expandir) | componente | F6 |
| Layout `max-w-7xl` no dashboard e páginas de análise | UI | F6 |
| `supabase/migrations/0020_ga4.sql` (enums + `lead.ga_client_id`) | migração | F7 |
| `server/dispatch/ga4.ts` + card GA4 em Integrações + captura `_ga` no tracker | módulos/UI | F7 |
| `supabase/migrations/0021_qualification.sql` (`lead_qualification` + campos no lead) | migração | F8 |
| `server/leadQualification.ts` + `app/api/cron/qualify-leads/route.ts` | módulo + cron | F8 |
| `supabase/migrations/0022_crm.sql` (`lead_stage_history`) | migração | F9 |
| `app/(tenant)/[tenant]/crm/page.tsx` + kanban + actions | página | F9 |
| Item "CRM" na `Sidebar.tsx` | UI | F9 |
| `supabase/migrations/0023_oferta_v2.sql` (`oferta.kind/inputs` + `copy_note` + seed) | migração | F10 |
| `server/offer.ts` reescrito (`GSO_BLOCKS`, copy de anúncio, biblioteca no prompt) | módulo server | F10 |
| `oferta/page.tsx` com 4 sub-abas + componentes (chips de framework, CRUD biblioteca) | página | F10 |
| `supabase/migrations/0024_campaign_action_log.sql` (auditoria + RLS) | migração | F11 |
| `getAdsetsInsights` + `setAdObjectStatus` em `server/integrations/meta.ts` | módulo server | F11 |
| `campaigns/page.tsx` reescrita (filtros, cards, 3 níveis, ordenação, massa) + `components/BarChart.tsx` | página/componente | F11 |
| Server actions de pausar/ativar + export CSV | actions | F11 |
| Testes unitários: schema de qualificação, regras IA×manual do CRM, payload GA4 MP | testes | F7–F9 |
| Testes unitários: hash/normalização PII, montagem `fbc`, mapeadores de payload | testes | F1 |
| Testes unitários: agregação de métricas do período, parser de blocos compartilhado | testes | F4 |
| Testes unitários: ferramentas do chat (tenant fixado, formatos de saída) | testes | F5 |
