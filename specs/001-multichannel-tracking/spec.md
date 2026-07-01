# Feature Specification: Sistema de Trackeamento e Atribuição Multi-Canal (SaaS)

**Feature Branch**: `001-multichannel-tracking`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "Sistema de Trackeamento e Atribuição Multi-Canal (SaaS multi-cliente). Gera um RG Único (Tracking ID) por visitante e mapeia a jornada do lead: clique no anúncio (Meta/Google Ads) → navegação no site (Nuvemshop/Landing Pages) → WhatsApp → conversão (venda). Rastreamento first-party via UTMs e Click IDs (fbclid, gclid), com persistência em LocalStorage. Integrações: Meta Ads (Insights + CAPI), Google Ads (GAQL + Offline Conversions via gclid), Nuvemshop (OAuth, injeção de script, webhook order/paid), WhatsApp (extração de [Ref: TRK-XXXX] via regex). Modelo de dados: Tenant, Lead, Click, Event. Frontend tracker.js servido via CDN com parseURL, initLead, storeLocal, interceptWhatsApp."

## Clarifications

### Session 2026-06-30

- Q: Constraint de plataforma/hospedagem do MVP? → A: Next.js + Supabase (Postgres + RLS, Auth, Edge Functions, Storage) — mesma stack do CRM existente.
- Q: Mecanismo de recebimento de WhatsApp? → A: Solução não-oficial via **Evolution API** (encapsula Baileys), com **conexão por QR code** por cliente. Escolha motivada pelo requisito de onboarding via QR, que a API oficial (Cloud API / Embedded Signup) não suporta. Trade-off aceito: risco de bloqueio do número pela Meta e gestão da sessão. Envio de conversões (CAPI/Google) permanece independente do provedor.
- Q: Modelo de acesso/hierarquia (quem loga)? → A: **Híbrido**. Existe uma camada de **Agência** que gerencia N Clientes (Tenants); usuários da agência enxergam/gerenciam todos os seus clientes, e cada Cliente pode opcionalmente ter usuários próprios com acesso restrito apenas ao seu Tenant. Papéis: `agency_admin` (agência) e `client_user` (restrito ao Tenant).
- Q: Regra e janela de atribuição do MVP? → A: **Não fixar modelo no MVP.** O sistema persiste **todos** os cliques/toques de cada lead e expõe a jornada completa; a atribuição de crédito (primeiro/último clique, janela) fica como configuração adiável, sem regra rígida no v1. Nenhum dado de toque é descartado, permitindo recalcular qualquer modelo depois.
- Q: Onde hospedar os componentes always-on (Evolution API + workers)? → A: **VPS/container Docker dedicado** rodando Evolution API e o worker de ingestão/fila. Supabase permanece como banco (Postgres+RLS), Auth, Storage e Edge Functions. Motivo: Evolution API exige processo Node persistente (websocket do WhatsApp por cliente), incompatível com o modelo serverless do Supabase.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Captura da origem e geração do RG do lead (Priority: P1)

Um visitante chega ao site de um cliente do SaaS através de um link de anúncio que carrega parâmetros de origem (UTMs e Click IDs como `fbclid`/`gclid`). No primeiro acesso, o visitante recebe um identificador único e permanente (Tracking ID, no formato `TRK-XXXX`), e os dados da origem do clique são registrados e associados a esse identificador. Conforme o visitante navega por outras páginas do mesmo site, o identificador é preservado, garantindo que toda a jornada pertença ao mesmo "RG".

**Why this priority**: É o alicerce de todo o sistema. Sem o RG único e a captura da origem, nenhuma atribuição posterior é possível. Entrega valor isolado porque já permite ao cliente enxergar de quais campanhas seus visitantes vieram.

**Independent Test**: Acessar uma página instrumentada com uma URL contendo UTMs e `fbclid`, confirmar que um Tracking ID é gerado e persistido, navegar para outra página do mesmo site e confirmar que o mesmo Tracking ID permanece, e verificar no painel que a origem (campanha/canal) ficou registrada para aquele lead.

**Acceptance Scenarios**:

1. **Given** um visitante novo acessando uma página instrumentada com `?utm_source=meta&utm_medium=cpc&fbclid=123`, **When** a página carrega, **Then** um Tracking ID único é gerado, persistido localmente no navegador e a origem (UTMs + `fbclid`) é registrada associada a esse Tracking ID.
2. **Given** um visitante que já possui um Tracking ID, **When** ele abre outra página do mesmo site (ou fecha e reabre a aba no mesmo dia), **Then** o mesmo Tracking ID é reutilizado e nenhum novo lead é criado.
3. **Given** que o serviço do SaaS está indisponível, **When** a página instrumentada carrega, **Then** a navegação do visitante não é interrompida nem visivelmente degradada.
4. **Given** um visitante sem nenhum parâmetro de origem na URL, **When** a página carrega, **Then** um Tracking ID é gerado mesmo assim, com a origem registrada como direta/orgânica.

---

### User Story 2 - Hand-off e atribuição da conversão por WhatsApp (Priority: P1)

Um visitante rastreado clica em um botão de WhatsApp no site do cliente. O Tracking ID é anexado silenciosamente à mensagem pré-preenchida. Quando o lead envia a primeira mensagem, o sistema reconhece o Tracking ID na mensagem recebida, amarra essa interação à origem original do clique e registra a conversão na jornada do lead.

**Why this priority**: WhatsApp é o principal ponto de conversão do público-alvo (e-commerce/serviços no Brasil). Fechar esse laço é o que transforma "cliques anônimos" em "leads atribuídos a campanhas", que é a dor central do produto.

**Independent Test**: Com um Tracking ID já gerado, clicar no botão de WhatsApp e confirmar que a mensagem pré-preenchida contém `[Ref: TRK-XXXX]`; simular o recebimento dessa mensagem e confirmar que o evento de mensagem recebida foi registrado e vinculado ao lead e à sua origem de clique.

**Acceptance Scenarios**:

1. **Given** um visitante com Tracking ID ativo, **When** ele clica em um link de WhatsApp (`wa.me` ou `api.whatsapp.com`) na página, **Then** o texto da mensagem pré-preenchida passa a conter o marcador `[Ref: TRK-XXXX]` sem alterar o restante da mensagem original.
2. **Given** uma mensagem de entrada contendo `[Ref: TRK-A8F9]`, **When** o sistema processa a mensagem, **Then** ele identifica o lead correspondente, registra um evento de "mensagem recebida" e associa o número de telefone do remetente ao lead.
3. **Given** uma mensagem de entrada sem nenhum marcador `[Ref: TRK-XXXX]`, **When** o sistema a processa, **Then** ela é tratada como lead sem atribuição (não quebra o fluxo) e fica disponível para conciliação manual.
4. **Given** um marcador `[Ref: TRK-XXXX]` que não corresponde a nenhum lead conhecido, **When** o sistema o processa, **Then** o evento é registrado como não-correspondido sem gerar erro.

---

### User Story 3 - Atribuição de venda no e-commerce (Nuvemshop) (Priority: P2)

Após autorizar a aplicação, a loja do cliente passa a ter o script de rastreamento injetado automaticamente. Quando um visitante rastreado compra, o Tracking ID é carregado junto ao pedido. Ao confirmar o pagamento, o sistema recebe a notificação da venda, extrai o Tracking ID e atribui o valor da venda à campanha de origem.

**Why this priority**: Fecha o laço de receita (não só lead, mas venda paga) para clientes de e-commerce, permitindo calcular ROI/ROAS real por campanha. Depende da fundação (P1) já existir.

**Independent Test**: Conectar uma loja de teste via autorização, confirmar que o script foi injetado, realizar um pedido de teste carregando um Tracking ID conhecido, marcar o pedido como pago e confirmar que a venda (com valor) aparece atribuída ao lead e à campanha de origem.

**Acceptance Scenarios**:

1. **Given** um cliente que autoriza a aplicação para sua loja, **When** a autorização é concluída, **Then** o script de rastreamento passa a ser carregado automaticamente nas páginas da loja, sem intervenção manual no tema.
2. **Given** um pedido pago que carrega um Tracking ID identificável, **When** a notificação de pagamento é recebida, **Then** o sistema registra um evento de compra com o valor monetário, vinculado ao lead e à origem do clique.
3. **Given** um pedido pago sem Tracking ID identificável, **When** a notificação é recebida, **Then** a venda é registrada como não-atribuída sem interromper o processamento.

---

### User Story 4 - Conexão de contas de anúncio e leitura de custos (Priority: P2)

O cliente conecta suas contas de anúncios (Meta Ads e Google Ads) ao SaaS. O sistema passa a importar periodicamente os custos e métricas de desempenho (gasto, impressões, CTR, etc.) por campanha. Esses custos, combinados com as conversões atribuídas, permitem visualizar retorno por campanha.

**Why this priority**: Custo é o outro lado da equação de ROI. Sem ele há atribuição mas não há eficiência (ROAS). Depende de conversões já existirem para gerar valor pleno, por isso P2.

**Independent Test**: Conectar uma conta de anúncios de teste, disparar a importação e confirmar que os gastos e métricas por campanha ficam visíveis no painel para o período consultado.

**Acceptance Scenarios**:

1. **Given** um cliente que conclui a conexão de uma conta de anúncios, **When** a importação de dados é executada, **Then** os custos e métricas por campanha do período ficam disponíveis para consulta no painel.
2. **Given** uma conexão cujo acesso expirou ou foi revogado, **When** a importação tenta executar, **Then** o sistema sinaliza a conta como "reconexão necessária" sem interromper as demais contas/clientes.

---

### User Story 5 - Envio de conversões server-side para as plataformas (Priority: P3)

Quando uma conversão atribuída acontece (mensagem qualificada no WhatsApp ou venda na Nuvemshop), o sistema envia o evento de conversão de volta para a plataforma de anúncios de origem, repassando o identificador de clique original (`fbclid` para Meta, `gclid` para Google) para máxima correspondência, melhorando a otimização das campanhas.

**Why this priority**: Maximiza o valor para o cliente (alimenta os algoritmos de otimização das plataformas), mas depende de toda a cadeia anterior estar funcionando. É o "fechamento do loop" para as plataformas externas.

**Independent Test**: Para um lead com `fbclid`/`gclid` conhecidos que converteu, disparar o envio e confirmar (via ferramenta de validação da própria plataforma) que o evento foi recebido com correspondência válida e sem erros de sintaxe.

**Acceptance Scenarios**:

1. **Given** uma conversão atribuída a um lead que possuía `fbclid`, **When** o evento server-side é enviado ao Meta, **Then** o payload é aceito sem erro de validação e retorna nota verde de qualidade de correspondência na ferramenta de testes da plataforma.
2. **Given** uma conversão atribuída a um lead que possuía `gclid`, **When** a conversão offline é enviada ao Google, **Then** ela é aceita e atrelada ao `gclid` e à data/hora do clique original.
3. **Given** uma conversão sem `fbclid`/`gclid` guardado, **When** o envio é tentado, **Then** o evento ainda é enviado com os dados disponíveis e marcado internamente como correspondência reduzida, sem falhar o fluxo.

---

### Edge Cases

- **Bloqueio/limpeza do armazenamento local**: visitante que limpa o armazenamento do navegador ou usa modo anônimo é tratado como novo lead em acessos seguintes (perda esperada de continuidade; documentada como limitação first-party).
- **Múltiplas origens no mesmo lead**: visitante que retorna por uma campanha diferente antes de converter — o sistema registra **todos** os cliques e exibe a jornada completa (FR-023). A escolha de qual toque recebe o crédito é configuração de atribuição adiada (não fixada no MVP).
- **Eventos duplicados**: a mesma venda ou mensagem notificada mais de uma vez não deve gerar conversões/contagens duplicadas.
- **Marcador adulterado**: um lead que edita manualmente a mensagem e remove/altera o `[Ref: TRK-XXXX]` cai no fluxo de não-atribuído.
- **Notificações fora de ordem ou atrasadas**: uma venda paga cuja notificação chega muito depois do clique original ainda deve ser atribuível enquanto o lead existir.
- **Limites de taxa das plataformas externas**: importações e envios devem respeitar limites de requisição sem perder dados (reprocessamento/enfileiramento).
- **Isolamento entre clientes**: dados, leads e conversões de um cliente jamais podem ser visíveis ou atribuíveis a outro cliente do SaaS.
- **Janela de atribuição**: todos os cliques são preservados independentemente da idade; a janela que limita quais toques recebem crédito em uma conversão é configuração adiada (aplicada sobre os dados já coletados), não uma regra fixa do MVP (FR-023).

## Requirements *(mandatory)*

### Functional Requirements

**Captura e identidade (RG do lead)**

- **FR-001**: O sistema MUST gerar um Tracking ID único por visitante no formato `TRK-` seguido de caracteres alfanuméricos, no primeiro acesso a uma página instrumentada.
- **FR-002**: O sistema MUST extrair, no carregamento da página, todos os parâmetros de origem disponíveis na URL: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `fbclid` e `gclid`.
- **FR-003**: O sistema MUST persistir o Tracking ID no armazenamento local do navegador, de modo que ele sobreviva à navegação entre páginas e ao fechamento/reabertura da aba no mesmo dia.
- **FR-004**: O sistema MUST registrar a origem (cliques com seus parâmetros, referrer e URL de entrada) associada ao Tracking ID.
- **FR-005**: O sistema MUST reutilizar o Tracking ID existente em acessos subsequentes do mesmo navegador, sem criar leads duplicados.
- **FR-006**: O componente de rastreamento no site (tracker) MUST NOT interromper, bloquear ou degradar perceptivelmente a navegação caso o serviço do SaaS esteja indisponível ou lento.
- **FR-007**: O sistema MUST gerar Tracking ID mesmo na ausência de parâmetros de origem, classificando a origem como direta/orgânica.

**Hand-off entre canais**

- **FR-008**: O tracker MUST localizar links de WhatsApp na página (`wa.me` e `api.whatsapp.com`) e anexar o marcador `[Ref: TRK-XXXX]` ao texto da mensagem pré-preenchida, preservando qualquer texto já existente.
- **FR-009**: O tracker MUST disponibilizar o Tracking ID para ser carregado junto a um pedido de e-commerce (ex.: em nota/atributo do pedido) quando o visitante avança para a compra.

**Fechamento do loop (conversões)**

- **FR-010**: O sistema MUST processar mensagens de entrada de WhatsApp e identificar o padrão `[Ref: TRK-XXXX]` na mensagem do lead.
- **FR-011**: O sistema MUST, ao identificar um Tracking ID em uma mensagem, vincular a interação ao lead correspondente, registrar o evento de mensagem recebida e associar o telefone do remetente ao lead.
- **FR-012**: O sistema MUST receber notificações de venda paga do e-commerce, extrair o Tracking ID associado e registrar um evento de compra com o valor monetário vinculado ao lead.
- **FR-013**: O sistema MUST tratar conversões sem Tracking ID identificável como "não-atribuídas", registrando-as sem interromper o fluxo e mantendo-as disponíveis para conciliação.
- **FR-014**: O sistema MUST evitar contabilizar a mesma conversão (mesma venda/mensagem) mais de uma vez (idempotência).

**Integrações de plataformas de anúncio**

- **FR-015**: O sistema MUST permitir que cada cliente conecte com segurança suas contas de Meta Ads e Google Ads por meio de fluxo de autorização delegada.
- **FR-016**: O sistema MUST importar periodicamente custos e métricas de desempenho por campanha (no mínimo: gasto, impressões e indicadores de eficiência) das contas conectadas.
- **FR-017**: O sistema MUST permitir conectar a loja de e-commerce do cliente e injetar automaticamente o script de rastreamento nas páginas da loja após a autorização.
- **FR-018**: O sistema MUST enviar eventos de conversão server-side às plataformas de origem quando uma conversão atribuída ocorrer, repassando o identificador de clique original (`fbclid`/`gclid`) quando disponível.
- **FR-019**: O sistema MUST sinalizar conexões com acesso expirado/revogado como "reconexão necessária", isolando a falha sem afetar outras contas ou clientes.

**Multi-tenant, dados e segurança**

- **FR-020**: O sistema MUST isolar logicamente todos os dados por cliente (tenant), impedindo que um cliente acesse ou influencie dados de outro.
- **FR-020a**: O sistema MUST suportar uma hierarquia Agência → Cliente(s), com papéis distintos: `agency_admin` acessa todos os Tenants da sua Agência; `client_user` acessa exclusivamente o seu Tenant. Todas as leituras/escritas MUST respeitar esse escopo.
- **FR-021**: O sistema MUST armazenar credenciais e tokens de acesso de terceiros (Meta, Google, e-commerce) criptografados em repouso.
- **FR-022**: O sistema MUST registrar a jornada do lead como uma sequência de eventos tipados (ex.: visualização de página, clique em WhatsApp, mensagem recebida, checkout, compra), cada um com data/hora e dados de contexto.
- **FR-023**: O sistema MUST persistir **todos** os cliques/toques associados a cada lead (nenhum toque é descartado) e expor a jornada completa. O MVP NÃO fixa um modelo único de atribuição de crédito; a regra (primeiro/último clique) e a janela ficam como configuração adiável, sem descartar dados que impeçam recalcular outros modelos posteriormente.
- **FR-024**: O sistema MUST disponibilizar, por cliente, a visualização da jornada de cada lead e a consolidação de conversões e custos por campanha/canal.

### Key Entities *(include if feature involves data)*

- **Agency (Agência)**: a organização operadora que administra um ou mais Clientes. Agrupa Tenants e concentra os usuários `agency_admin`. É o nível mais alto da hierarquia.
- **Tenant (Cliente)**: o cliente atendido pela agência. Pertence a uma Agency. Possui nome e as credenciais/conexões das plataformas externas (Meta, Google, e-commerce). É a fronteira de isolamento de todos os dados de rastreamento (leads, cliques, eventos, custos).
- **User / Membership (Usuário e vínculo)**: identidade de login. Um usuário pode ter papel `agency_admin` (acesso a todos os Tenants da sua Agency) ou `client_user` (acesso restrito a um único Tenant). O vínculo define papel e escopo.
- **Lead (O RG Único)**: o visitante identificado de forma única. Possui o `tracking_code` (`TRK-XXXX`), e atributos de contato que vão sendo enriquecidos (telefone, e-mail) e a data de criação. Pertence a um Tenant.
- **Click (A Origem)**: o registro de um clique/entrada que originou ou retornou um lead. Guarda UTMs (`source`, `medium`, `campaign`, `content`, `term`), `fbclid`, `gclid`, referrer, URL de entrada e o horário do clique. Pertence a um Lead.
- **Event (Jornada)**: cada interação na jornada do lead. Possui tipo (visualização de página, clique no WhatsApp, mensagem recebida, checkout, compra), valor monetário opcional, dados de contexto e o horário em que ocorreu. Pertence a um Lead.
- **Campaign/Cost (Custo por campanha)**: métricas de gasto e desempenho importadas das plataformas, por campanha e período, usadas para consolidar ROI. Pertence a um Tenant (e a uma conexão de plataforma).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 95% dos acessos a páginas instrumentadas, um Tracking ID é gerado e persistido sem qualquer impacto perceptível no tempo de carregamento da página (sem bloqueio de renderização).
- **SC-002**: Pelo menos 95% das mensagens de WhatsApp iniciadas a partir de um botão instrumentado chegam ao sistema com o marcador `[Ref: TRK-XXXX]` íntegro e corretamente vinculado ao lead de origem.
- **SC-003**: 100% das vendas pagas que carregam um Tracking ID válido são atribuídas ao lead e à campanha de origem corretos, sem duplicação.
- **SC-004**: Eventos de conversão server-side enviados às plataformas são aceitos sem erro de validação em pelo menos 99% dos envios, e atingem nota de qualidade de correspondência "verde" na ferramenta de testes da plataforma quando o identificador de clique está presente.
- **SC-005**: O cliente consegue visualizar, para qualquer campanha conectada, o custo e as conversões atribuídas do período em uma única tela, com defasagem de dados de no máximo 24 horas.
- **SC-006**: Zero vazamentos de dados entre clientes (tenants) em testes de isolamento; nenhum lead, conversão ou credencial de um cliente é acessível por outro.
- **SC-007**: A continuidade do Tracking ID é mantida em 100% dos casos de navegação entre páginas do mesmo site e em reaberturas da aba dentro do mesmo dia (sem limpeza manual do armazenamento).

## Assumptions

- **Estratégia first-party assumida**: o rastreamento depende de UTMs/Click IDs na URL e de armazenamento local do navegador; perda de continuidade em modo anônimo, troca de dispositivo/navegador ou limpeza de armazenamento é uma limitação aceita do MVP.
- **Regra de atribuição (decidido)**: o MVP **não fixa** um modelo de crédito. Todos os cliques/toques são persistidos e a jornada completa é exibida; a atribuição de crédito (primeiro/último clique + janela) é configuração adiável, aplicável sobre os dados já coletados sem perda.
- **Canais do MVP**: Meta Ads e Google Ads para custos/conversões; Nuvemshop como e-commerce; WhatsApp como canal de mensagem. Outros canais ficam fora do escopo do v1.
- **WhatsApp (decidido)**: recebimento de mensagens via **Evolution API** (não-oficial, baseada em Baileys), com conexão do número do cliente por **QR code**. Cada cliente conecta sua própria instância/sessão. A sessão precisa ser mantida (reconexão automática) e o sistema deve tolerar desconexões temporárias sem perder o vínculo de leads já criados.
- **Consentimento/LGPD**: assume-se que cada cliente é responsável por exibir seus próprios avisos de privacidade/consentimento; o sistema fornece tratamento seguro e isolado dos dados, mas a coleta de consentimento no site é responsabilidade do cliente.
- **Disponibilidade do serviço**: o tracker é resiliente a indisponibilidade do backend (degrada silenciosamente); pequenas perdas de eventos durante quedas são aceitáveis e não devem quebrar a navegação.
- **Conexões de plataforma**: assume-se que cada cliente possui contas próprias e ativas em Meta Ads, Google Ads e na plataforma de e-commerce, com permissões suficientes para conceder os acessos necessários.
- **Plataforma/hospedagem (constraint confirmada)**: o sistema será construído sobre **Next.js + Supabase**. O isolamento multi-tenant (FR-020) será garantido por Row-Level Security do Postgres; a criptografia de credenciais em repouso (FR-021) usará os recursos de criptografia/segredos da plataforma.
- **Componentes always-on (decidido)**: a **Evolution API** (sessões de WhatsApp) e o **worker de ingestão/fila** rodam em um **VPS/container Docker dedicado**, separado do Supabase. A comunicação entre esse componente e o backend se dá por webhooks/HTTP autenticados.
