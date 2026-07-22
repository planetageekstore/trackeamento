import "server-only";

/**
 * MÉTODO ANDROMEDA — base de conhecimento de criativos e copy (Meta Ads).
 * Alimenta os geradores de copy/oferta: níveis de consciência (C1/C2/C3),
 * tipos de criativo, anatomia do anúncio, mecânicas de retenção comprovadas e
 * os 9 formatos de produção para negócios locais.
 *
 * Fonte: mapa mental do método + análise de 26 criativos reais de referência.
 */

export interface CreativeType {
  key: string;
  label: string;
  level: "C1" | "C2" | "C3";
  funcao: string;
  gatilho: string;
  roteiro: string;
  erroComum: string;
}

/** Tipos de criativo por nível de consciência (o coração do método). */
export const CREATIVE_TYPES: CreativeType[] = [
  // ---- C1: consciência baixa (topo — atrair frio, gerar consciência) ----
  {
    key: "quebra_padrao",
    label: "Quebra de Padrão",
    level: "C1",
    funcao: "Estancar o scroll de público 100% frio nos primeiros 3 segundos. É o tipo mais 'algoritmo-friendly' porque maximiza retenção inicial.",
    gatilho: "Estranhamento / quebra de expectativa — algo que o cérebro não consegue prever, então ele para pra entender.",
    roteiro: "[0-3s] gancho anti-clichê (visual absurdo, frase contraintuitiva, 'pare de fazer X') → [3-10s] contextualiza e conecta com a dor → [10s+] entrega/CTA.",
    erroComum: "Gancho chamativo que não tem conexão com a oferta (viraliza mas não converte). O padrão quebrado precisa emendar na dor certa.",
  },
  {
    key: "conteudo_valor",
    label: "Conteúdo de Valor",
    level: "C1",
    funcao: "Gerar autoridade e reciprocidade entregando um insight útil de graça. É o C1 que mais 'aquece' o frio sem parecer anúncio.",
    gatilho: "Reciprocidade + autoridade. Quem ensina algo útil é percebido como especialista.",
    roteiro: "Promessa de valor ('3 erros que...') → entrega rápida e didática → loop aberto ('o 3º só faz sentido com X') que puxa pro produto.",
    erroComum: "Entregar valor completo demais — a pessoa aprende e vai embora. O valor deve resolver o 'o quê' e deixar o 'como' pro produto.",
  },
  {
    key: "dor",
    label: "Dor",
    level: "C1",
    funcao: "Ativar a dor latente antes de mostrar qualquer solução, para que a solução tenha valor.",
    gatilho: "Aversão à dor / agitação do problema.",
    roteiro: "Nomeia a dor de forma crua e identificável → agita (o que acontece se não resolver) → alívio via solução.",
    erroComum: "Agitar dor sem oferecer alívio próximo (gera rejeição) ou dor rasa demais que não emociona.",
  },
  {
    key: "sintoma",
    label: "Sintoma",
    level: "C1",
    funcao: "Fazer a pessoa se reconhecer num sintoma que ela sente mas nunca nomeou, criando o 'como você sabia disso?'.",
    gatilho: "Identificação + curiosidade sobre a causa oculta.",
    roteiro: "Descreve sintomas específicos → revela a causa-raiz (mecanismo do problema) → posiciona a solução.",
    erroComum: "Sintoma genérico ('você está cansado?') que não gera reconhecimento. Quanto mais específico, mais forte.",
  },
  // ---- C2: consciência média (meio — aquecer, comparar, demonstrar) ----
  {
    key: "hardsell",
    label: "HardSell",
    level: "C2",
    funcao: "Venda direta estruturada. É o criativo mais completo — carrega o funil inteiro em 1 peça. Deve ser ~50% do volume de C2.",
    gatilho: "Clareza de oferta + prova + urgência.",
    roteiro: "ESTRUTURA CANÔNICA DE 7 BLOCOS (todos obrigatórios): 1.Gancho · 2.Dor/Benefício · 3.Motivo para agir · 4.Prova · 5.Oferta · 6.Urgência · 7.CTA.",
    erroComum: "Pular a Prova ou a Urgência — sem esses dois o HardSell vira anúncio 'morno'.",
  },
  {
    key: "demonstrativo",
    label: "Demonstrativo",
    level: "C2",
    funcao: "Mostrar o produto funcionando na prática ou a 'vida depois'. Prova de mecanismo visual.",
    gatilho: "Ver para crer / projeção futura.",
    roteiro: "Situação-problema → produto em ação → resultado/transformação visível.",
    erroComum: "Demonstração longa e sem tensão. Precisa de um 'momento aha' claro.",
  },
  {
    key: "comparativo",
    label: "Comparativo",
    level: "C2",
    funcao: "Posicionar a oferta contra uma alternativa (com x sem, você x concorrente, antes x depois) para quem já entende o problema.",
    gatilho: "Contraste / prova por diferença.",
    roteiro: "Mostra o 'jeito antigo/errado' → contrasta com o 'jeito novo/seu' → conclusão a favor da oferta.",
    erroComum: "Comparação injusta ou ataque raso ao concorrente, que soa desonesto. O contraste tem que ser verdadeiro.",
  },
  // ---- C3: consciência alta (fundo — converter, quebrar objeção, fechar) ----
  {
    key: "prova_social",
    label: "Prova Social",
    level: "C3",
    funcao: "Converter quem já está quente usando prova de que funciona — depoimento, resultado, prova de mecanismo.",
    gatilho: "Validação social / redução de risco percebido.",
    roteiro: "Personagem real → situação inicial → resultado específico e mensurável → CTA.",
    erroComum: "Depoimento vago ('mudou minha vida') sem número/especificidade. Resultado específico > elogio genérico.",
  },
  {
    key: "objecao",
    label: "Objeção",
    level: "C3",
    funcao: "Derrubar a objeção específica que trava a compra.",
    gatilho: "Alívio da fricção final.",
    roteiro: "Verbaliza a objeção ('você deve estar pensando que...') → argumento que a desmonta → CTA. OBJEÇÕES: preço (quanto perde por não resolver, comparação, merecimento) · tempo (priorização) · confiança (prova, trial, garantia) · 'será que é pra mim?' (cases, identificação) · 'preciso agora?' (janela de oportunidade).",
    erroComum: "Atacar objeção que o público não tem, ou empilhar objeções demais numa peça só.",
  },
  {
    key: "urgencia",
    label: "Urgência",
    level: "C3",
    funcao: "Empurrar a decisão de quem já quer, via escassez legítima (tempo, estoque, bônus, condição).",
    gatilho: "Aversão à perda / FOMO.",
    roteiro: "Relembra a oferta → introduz a limitação real → consequência de perder → CTA imediato.",
    erroComum: "Urgência falsa/recorrente que queima a credibilidade. A escassez precisa ser verdadeira.",
  },
];

/** Os 9 formatos de produção (framework de negócios locais). */
export const PRODUCTION_TYPES = [
  { key: "ugc", label: "UGC (Conteúdo do Usuário)", desc: "Gravado na perspectiva do próprio cliente (1ª pessoa, caseiro). Quanto mais natural e 'desconhecida' a pessoa, melhor. Use gancho forte no início." },
  { key: "influenciador", label: "Influenciador", desc: "Mesma pegada do UGC, mas com personalidade conhecida/autoridade local. Aproveita reconhecimento de imagem." },
  { key: "diretao", label: "Diretão", desc: "Sem rodeios: o que é, quanto custa, o que fazer. Estático ou vídeo direto." },
  { key: "caixinha", label: "Caixinha de Perguntas", desc: "Responde dúvida frequente que quebra objeção e direciona pro comercial. Altíssimo desempenho em jurídico, saúde e consultoria." },
  { key: "oferta_comercial", label: "Oferta Comercial", desc: "Foca em COMO comprar: condições, parcelamento, combo, desconto com prazo. (Diretão = o que se vende; Oferta = como comprar.)" },
  { key: "estrutura", label: "Estrutura do Lugar", desc: "Fachada, recepção, equipamentos, atendimento. Conceito 'tudo comunica': posiciona a percepção de valor (alto padrão/intermediário/popular)." },
  { key: "processo", label: "Processo de Produção", desc: "Passo a passo do preparo/execução. Forte em gastronomia e serviços. Tangibiliza cuidado e qualidade." },
  { key: "resultado", label: "Resultado Real", desc: "Antes e depois / demonstração ao vivo. Princípio 'Show, don't tell': mostre o resultado acontecendo." },
  { key: "combinacao", label: "Combinação (Mix)", desc: "Une 2+ formatos: UGC+Processo, Caixinha+Diretão, UGC+Resultado Real." },
];

/** Anatomia do criativo — os 3 grupos de recursos (leitura do algoritmo). */
export const ANATOMY = `RECURSOS MECÂNICOS (corpo técnico): formato (vídeo escala retenção/storytelling; estático é barato, salvável e de leitura instantânea — ótimo p/ comparativo) · proporção (vertical 9:16 é o padrão).
RECURSOS VISUAIS/TEXTO: título (headline/gancho dos 3s) · cena (ângulo, enquadramento, cenário) · personagens (quem aparece e por quê) · produto (como aparece) · marca (discreta no topo, forte no fundo) · credencial (selo de autoridade) · legenda/copy (legenda queimada tipo karaokê é o maior recurso de retenção).
RECURSOS TEMÁTICOS (alma): motivadores (o argumento ajustado a C1/C2/C3) · emoções (medo, desejo, pertencimento, esperança, aversão à perda) · sazonalidade (data/evento que dá motivo e urgência).`;

/** Mecânicas de retenção observadas em criativos vencedores reais. */
export const RETENTION_MECHANICS = `MECÂNICAS DE RETENÇÃO COMPROVADAS (copie o mecanismo, não o assunto):
- Legenda karaokê (palavra a palavra) — maior recurso de retenção que existe.
- Desafio interativo ("adivinhe qual é", "teste seu foco") — o espectador participa e fica até o fim; força comentário.
- Entrevista de rua com pergunta de dinheiro ("quanto você fatura?") — prova social + curiosidade.
- Frankenstein/hijack: pega hook viral (ex.: animação de ciência) e emenda na oferta — SEMPRE construa uma ponte criativa entre hook e produto, nunca corte seco.
- Storytelling com loop aberto / case com reviravolta — sustenta 90-180s.
- Experimento com números na tela (prova de mecanismo difícil de refutar).
- ASMR de montagem/uso — para produto físico "instagramável".
- Comparativo estático (antes/depois, pago x grátis) — barato, salvável, leitura instantânea.
- Meme POV curtíssimo (6-15s) — custo quase zero, cara de orgânico, ótimo p/ negócio local.
- GRWM / ação cotidiana + copy provocativa fixa — baixa a guarda do espectador.
DURAÇÃO SEGUE A FUNÇÃO: 6-35s para scroll-stopper de topo frio; 70-180s para storytelling/VSL. Não existe duração ideal, existe duração certa para o objetivo.`;

/** Estrutura de campanha vencedora (enxoval). */
export const ENXOVAL = `ESTRUTURA VENCEDORA: 1 campanha com 9 anúncios = 3 C1 + 3 C2 + 3 C3 (o "enxoval").
- Acima de R$5k/mês: enxoval de 9 anúncios renovado toda semana.
- Abaixo de R$5k/mês: enxoval 1 vez, depois foca nos que melhor converteram (HardSell).
OTIMIZAÇÃO: sobe os 9 → em 24h identifica os melhores (pausa os que não gastaram/estão ruins) → 7 dias depois sobe mais anúncios NA CATEGORIA DOS VENCEDORES.
SUPRA SUMO: sair do ponto de partida, identificar qual caminho é melhor e replicá-lo de várias formas diferentes (ângulos de copy diferentes, vídeo x estático).`;

/** Métricas de referência do método. */
export const METRICAS = `MÉTRICAS DE REFERÊNCIA: CTR acima de 2% · Frequência do anúncio no máximo 2 (se alta, precisa de mais criativo) · Connect Rate 70-80% · Conversão de página: 30% lead / 2-3% venda · Estrela-Guia = métrica que antecede o CPA (p/ leads é quem pisou no site; p/ vendas é quem pisou no checkout).`;

/** Regras de compliance (aprendizado da análise de criativos reais). */
export const COMPLIANCE = `COMPLIANCE META (obrigatório): nunca sugerir uso de footage oficial/telejornal ou avatares de IA para insinuar endosso governamental ou institucional — viola políticas de conteúdo enganoso e derruba a conta. Nunca inventar prova social, número de vendas, depoimento ou escassez. Sem dado real, escreva "[placeholder: inserir dado real]".`;

/** Monta o contexto do método para injetar no prompt (por escopo). */
export function andromedaContext(opts: {
  levels?: ("C1" | "C2" | "C3")[];
  typeKeys?: string[];
  includeAnatomy?: boolean;
  includeRetention?: boolean;
  includeEnxoval?: boolean;
  includeMetricas?: boolean;
}): string {
  const parts: string[] = [];

  let types = CREATIVE_TYPES;
  if (opts.typeKeys?.length) types = types.filter((t) => opts.typeKeys!.includes(t.key));
  else if (opts.levels?.length) types = types.filter((t) => opts.levels!.includes(t.level));

  if (types.length) {
    parts.push(
      "TIPOS DE CRIATIVO (Método Andromeda):\n" +
        types
          .map(
            (t) =>
              `• ${t.label} (${t.level}) — Função: ${t.funcao} Gatilho: ${t.gatilho} Roteiro: ${t.roteiro} Erro a evitar: ${t.erroComum}`,
          )
          .join("\n"),
    );
  }
  if (opts.includeAnatomy) parts.push("ANATOMIA DO CRIATIVO:\n" + ANATOMY);
  if (opts.includeRetention) parts.push(RETENTION_MECHANICS);
  if (opts.includeEnxoval) parts.push(ENXOVAL);
  if (opts.includeMetricas) parts.push(METRICAS);
  parts.push(COMPLIANCE);

  return parts.join("\n\n");
}

/** Notas do método para a Biblioteca (aparecem na UI e alimentam os prompts). */
export const ANDROMEDA_NOTES = [
  { title: "Andromeda — Enxoval 3+3+3", content: "1 campanha com 9 anúncios: 3 C1 (topo/frio), 3 C2 (meio), 3 C3 (fundo). Sobe os 9, em 24h pausa os ruins, 7 dias depois sobe mais na categoria dos vencedores.", tags: ["andromeda", "estrutura"] },
  { title: "Andromeda — HardSell 7 blocos", content: "1.Gancho 2.Dor/Benefício 3.Motivo para agir 4.Prova 5.Oferta 6.Urgência 7.CTA. Sem Prova e Urgência o HardSell fica morno.", tags: ["andromeda", "c2", "framework"] },
  { title: "Andromeda — Níveis de consciência", content: "C1 (baixa): Quebra de Padrão, Conteúdo de Valor, Dor, Sintoma. C2 (média): HardSell, Demonstrativo, Comparativo. C3 (alta): Prova Social, Objeção, Urgência.", tags: ["andromeda", "funil"] },
  { title: "Andromeda — Objeções do C3", content: "Preço (quanto perde por não resolver / comparação / merecimento), Tempo (priorização), Confiança (prova, trial, garantia), 'É pra mim?' (cases), 'Preciso agora?' (janela de oportunidade).", tags: ["andromeda", "c3", "objecao"] },
  { title: "Andromeda — Retenção é engenharia", content: "Legenda karaokê, desafio interativo, entrevista de rua com pergunta de dinheiro, hijack de hook viral (com ponte criativa), storytelling com loop aberto, experimento com números na tela, ASMR, comparativo estático, meme POV.", tags: ["andromeda", "retencao"] },
  { title: "Andromeda — Anatomia do criativo", content: "Mecânicos (formato, proporção 9:16) + Visuais (título, cena, personagem, produto, marca, credencial, legenda) + Temáticos (motivador C1/C2/C3, emoção, sazonalidade). Quando um criativo vence, isole quais elementos fizeram diferença e replique variando os demais.", tags: ["andromeda", "anatomia"] },
  { title: "Andromeda — 9 formatos (negócio local)", content: "UGC, Influenciador, Diretão, Caixinha de Perguntas, Oferta Comercial, Estrutura do Lugar, Processo de Produção, Resultado Real, Combinação. Com pouco orçamento: pelo menos 1 Diretão + 1 Oferta Comercial.", tags: ["andromeda", "local"] },
  { title: "Andromeda — Métricas guia", content: "CTR > 2%. Frequência do anúncio ≤ 2 (se alta, falta criativo). Connect rate 70-80%. Conversão de página: 30% lead, 2-3% venda. Estrela-Guia antecede o CPA.", tags: ["andromeda", "metricas"] },
];
