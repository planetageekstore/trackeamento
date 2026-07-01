# Security & Multi-Tenancy Requirements Checklist: Sistema de Trackeamento

**Purpose**: "Unit tests" para a qualidade dos requisitos de segurança, isolamento multi-tenant e privacidade — valida se os requisitos estão completos, claros, consistentes e mensuráveis (NÃO testa a implementação).
**Created**: 2026-06-30
**Feature**: [spec.md](../spec.md) · Princípios: [constitution.md](../../../.specify/memory/constitution.md)

## Isolamento Multi-Tenant

- [ ] CHK001 - O requisito de isolamento define explicitamente TODAS as entidades que devem carregar fronteira de tenant (lead, click, event, custo, integração)? [Completeness, Spec §FR-020]
- [ ] CHK002 - A hierarquia Agência→Cliente especifica de forma inequívoca o escopo de leitura/escrita de cada papel (`agency_admin` vs `client_user`)? [Clarity, Spec §FR-020a]
- [ ] CHK003 - Os requisitos definem o comportamento de escopo para caminhos que ignoram RLS (endpoint público `/api/track`, webhooks com service role)? [Coverage, Gap]
- [ ] CHK004 - "Isolar logicamente" é mensurável — existe critério objetivo de sucesso (ex.: teste de acesso cruzado negado) definido? [Measurability, Spec §SC-006]
- [ ] CHK005 - Há requisito para o caso de um usuário pertencer a mais de um escopo (multi-membership) ou isso é declarado fora de escopo? [Edge Case, Gap]
- [ ] CHK006 - Os requisitos de isolamento e a definição de papéis em §FR-020a são consistentes com o modelo de dados (`memberships`)? [Consistency]

## Segredos e Dados em Repouso

- [ ] CHK007 - O requisito de criptografia enumera TODOS os segredos cobertos (tokens Meta/Google/Nuvemshop + apikey da instância WhatsApp)? [Completeness, Spec §FR-021]
- [ ] CHK008 - "Criptografado em repouso" está qualificado quanto à localização da chave mestra (fora do banco)? [Clarity, Spec §FR-021]
- [ ] CHK009 - Há requisito explícito proibindo exposição de segredos ao navegador, em respostas de API e em logs? [Gap]
- [ ] CHK010 - Existe requisito sobre rotação/revogação de credenciais além de armazenamento? [Coverage, Gap]

## Ingestão Pública & Superfície de Ataque

- [ ] CHK011 - Os requisitos definem como a `site key` pública é protegida contra abuso (allowlist de domínio, rate limit)? [Completeness, Spec §FR-017/§R2]
- [ ] CHK012 - Há requisito de validação de autenticidade para webhooks de entrada (Nuvemshop HMAC, Evolution token)? [Coverage, Gap]
- [ ] CHK013 - O comportamento esperado sob abuso/flood do endpoint de ingestão está especificado (limite, descarte, resposta)? [Edge Case, Gap]

## Privacidade & Conformidade (LGPD)

- [ ] CHK014 - A responsabilidade por consentimento/aviso de privacidade está atribuída de forma inequívoca (cliente vs SaaS)? [Clarity, Spec §Assumptions]
- [ ] CHK015 - Existem requisitos para retenção, exclusão e portabilidade de dados de leads (telefone/e-mail)? [Gap]
- [ ] CHK016 - Os requisitos de PII enviada a terceiros (hash antes do envio) estão especificados e consistentes entre Meta e Google? [Consistency, Spec §R5/§R6]

## Resiliência de Falhas de Segurança

- [ ] CHK017 - O requisito de isolamento de falha de integração (`needs_reconnect` sem afetar outros tenants) é testável? [Measurability, Spec §FR-019]
- [ ] CHK018 - Há requisitos para resposta a comprometimento (ex.: número de WhatsApp banido, token vazado)? [Exception Flow, Gap]

## Notes

- Itens marcados `[Gap]` indicam requisito potencialmente ausente na spec — decidir se entra no MVP ou vira exclusão explícita.
- Foco: qualidade dos requisitos, não da implementação. "Está especificado?" e não "funciona?".
