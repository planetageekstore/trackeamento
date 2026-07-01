# Attribution & Integrations Requirements Checklist: Sistema de Trackeamento

**Purpose**: "Unit tests" para a qualidade dos requisitos de rastreamento, atribuição e integrações externas — valida completude, clareza, consistência e cobertura de cenários (NÃO testa implementação).
**Created**: 2026-06-30
**Feature**: [spec.md](../spec.md) · Contratos: [contracts/](../contracts/)

## Identidade do Lead (RG / Tracking ID)

- [ ] CHK001 - O formato do `TRK-XXXX` está especificado de forma inequívoca (charset, unicidade, escopo por tenant)? [Clarity, Spec §FR-001]
- [ ] CHK002 - Os requisitos definem quem gera o ID (cliente vs servidor) de forma consistente com a exigência de resiliência? [Consistency, Spec §FR-001/§FR-006]
- [ ] CHK003 - "Persistir no mesmo dia" e "continuidade entre páginas" têm critério mensurável definido? [Measurability, Spec §SC-007]
- [ ] CHK004 - Há requisito para o cenário de storage limpo / modo anônimo / troca de dispositivo (perda de continuidade)? [Edge Case, Spec §Edge Cases]

## Captura de Origem & Preservação de Toques

- [ ] CHK005 - Todos os parâmetros de origem a capturar estão enumerados explicitamente (utm_*, fbclid, gclid, referrer, landing)? [Completeness, Spec §FR-002]
- [ ] CHK006 - O requisito de "não descartar nenhum toque" está claro quanto ao registro de múltiplos cliques por lead? [Clarity, Spec §FR-023]
- [ ] CHK007 - Como o sistema trata origem ausente (acesso direto/orgânico) está especificado? [Coverage, Spec §FR-007]

## Regra de Atribuição

- [ ] CHK008 - A ausência de modelo de crédito fixo no MVP está declarada sem ambiguidade (o que é exibido vs. o que é adiado)? [Clarity, Spec §FR-023]
- [ ] CHK009 - Os requisitos definem o dado mínimo a preservar para permitir recalcular qualquer modelo depois? [Completeness, Spec §FR-023]
- [ ] CHK010 - Há requisito para múltiplas origens no mesmo lead (retorno por campanha diferente antes de converter)? [Edge Case, Spec §Edge Cases]

## Hand-off WhatsApp

- [ ] CHK011 - O marcador `[Ref: TRK-XXXX]` e a regra de preservação do texto existente estão especificados sem ambiguidade? [Clarity, Spec §FR-008]
- [ ] CHK012 - O requisito cobre botões de WhatsApp inseridos dinamicamente (não presentes no load)? [Coverage, Gap]
- [ ] CHK013 - O comportamento para marcador adulterado/removido e para `TRK` inexistente está definido? [Edge Case, Spec §FR-013]
- [ ] CHK014 - A regra "apenas a primeira mensagem" é consistente entre a spec e o contrato do webhook? [Consistency, Spec §3.4/whatsapp-webhook]

## Conversões & Idempotência

- [ ] CHK015 - A chave natural de deduplicação está definida para cada fonte de conversão (order.id, message.id)? [Completeness, Spec §FR-014]
- [ ] CHK016 - "Sem interromper o fluxo" para conversão não-atribuída tem comportamento observável especificado (attributed=false)? [Measurability, Spec §FR-013]
- [ ] CHK017 - Notificações fora de ordem/atrasadas têm requisito de tratamento? [Edge Case, Spec §Edge Cases]

## Integrações Externas (Meta / Google / Nuvemshop)

- [ ] CHK018 - Os requisitos de leitura de custos definem granularidade e defasagem máxima de forma mensurável? [Measurability, Spec §SC-005]
- [ ] CHK019 - O requisito de envio server-side especifica o comportamento quando falta `fbclid`/`gclid` (correspondência reduzida)? [Coverage, Spec §FR-018]
- [ ] CHK020 - Critérios de aceite de qualidade de correspondência (EMQ verde) estão definidos de forma verificável? [Acceptance Criteria, Spec §SC-004]
- [ ] CHK021 - Os requisitos de tratamento de rate limit e token expirado são consistentes entre as três integrações? [Consistency, Spec §FR-019]
- [ ] CHK022 - A injeção de script e o registro de webhook da Nuvemshop têm requisitos de idempotência (não duplicar em reautorização)? [Gap]

## Resiliência do Tracker

- [ ] CHK023 - "Não degradar a navegação" tem critério objetivo (assíncrono, sem bloqueio, tamanho do bundle)? [Measurability, Spec §FR-006/§SC-001]
- [ ] CHK024 - O comportamento do tracker com backend offline/lento está especificado como requisito, não só como premissa? [Clarity, Spec §FR-006]

## Notes

- `[Gap]` = requisito possivelmente ausente; decidir inclusão no MVP ou exclusão explícita.
- Este checklist valida a REDAÇÃO dos requisitos; a verificação de comportamento fica para os testes descritos em [quickstart.md](../quickstart.md).
