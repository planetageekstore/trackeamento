import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { anthropicClient, textOf, parseBlocks, type AiBlock } from "@/server/aiBlocks";
import { andromedaContext, ANDROMEDA_NOTES, CREATIVE_TYPES, PRODUCTION_TYPES } from "@/server/andromeda";

/**
 * Engenharia de Oferta v2 (F10). Central de copy e ofertas:
 *  - Grand Slam Offer (formato Hormozi, 9 blocos, igual ao exemplo aprovado);
 *  - Copy de Anúncio (frameworks, 3 variações por plataforma);
 *  - Engenheiro (chat livre de copy);
 *  - Biblioteca (notas padrão + notas do tenant).
 */

const MODEL = "claude-opus-4-8";

// ---- Biblioteca padrão (vale para todos os tenants) -----------------------
export interface CopyNote {
  title: string;
  content: string;
  tags: string[];
}

export const DEFAULT_NOTES: CopyNote[] = [
  { title: "Equação de Valor (Hormozi)", content: "Valor = (Sonho Realizado × Prob. Percebida de Sucesso) ÷ (Tempo de Atraso × Esforço e Sacrifício). Maximize o numerador, minimize o denominador.", tags: ["framework", "oferta"] },
  { title: "AIDA", content: "Atenção → Interesse → Desejo → Ação. Estrutura clássica de anúncio.", tags: ["framework", "anuncio"] },
  { title: "PAS", content: "Problema → Agitação → Solução. Fisga pela dor antes de apresentar a solução.", tags: ["framework", "anuncio"] },
  { title: "BAB", content: "Before → After → Bridge. Mostra o antes, o depois e a ponte (sua oferta) entre eles.", tags: ["framework"] },
  { title: "4 Ps", content: "Picture → Promise → Prove → Push. Pinte a imagem, prometa, prove, empurre para a ação.", tags: ["framework"] },
  { title: "5 estágios de consciência (Schwartz)", content: "Inconsciente, Consciente do problema, Consciente da solução, Consciente do produto, Mais consciente. Ajuste a copy ao estágio do público.", tags: ["schwartz", "consciencia"] },
  { title: "Sofisticação de mercado (Schwartz)", content: "5 níveis: da promessa direta à identificação por mecanismo único e identidade. Quanto mais saturado o mercado, mais mecanismo e história.", tags: ["schwartz"] },
  { title: "Headline de Halbert", content: "Venda a solução para um problema urgente. Especificidade e benefício claro vencem criatividade vazia.", tags: ["halbert", "headline"] },
  { title: "Regra 80/20 emoção/lógica", content: "80% emoção para gerar desejo, 20% lógica para justificar a compra racionalmente.", tags: ["principio"] },
  { title: "Risco reverso (garantia)", content: "Transfira o risco da decisão para você. 'Se não amar, devolvo 100%.' Garantia nomeada e incondicional aumenta conversão.", tags: ["garantia", "oferta"] },
  // Método Andromeda (criativos e funil no Meta Ads).
  ...ANDROMEDA_NOTES,
];

/** Notas do tenant + padrão, para exibir e alimentar o prompt. */
export async function loadLibrary(tenantId: string): Promise<{ defaults: CopyNote[]; custom: (CopyNote & { id: string })[] }> {
  const db = createSupabaseServiceClient();
  const { data } = await db
    .from("copy_note")
    .select("id, title, content, tags")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  const custom = (data ?? []).map((n) => ({
    id: n.id as string,
    title: n.title as string,
    content: n.content as string,
    tags: (n.tags as string[]) ?? [],
  }));
  return { defaults: DEFAULT_NOTES, custom };
}

function libraryContext(notes: CopyNote[]): string {
  return notes.map((n) => `- ${n.title}: ${n.content}`).join("\n");
}

// ---- Grand Slam Offer -----------------------------------------------------
export const GSO_BLOCKS: AiBlock[] = [
  { key: "nome_oferta", emoji: "🏆", title: "NOME DA OFERTA" },
  { key: "resultado_sonhos", emoji: "🌟", title: "RESULTADO DOS SONHOS" },
  { key: "equacao_valor", emoji: "⚖️", title: "EQUAÇÃO DE VALOR" },
  { key: "stack_valor", emoji: "🥞", title: "STACK DE VALOR" },
  { key: "garantia", emoji: "🛡️", title: "GARANTIA" },
  { key: "escassez", emoji: "⏳", title: "ESCASSEZ/URGÊNCIA" },
  { key: "ancoragem", emoji: "💰", title: "ANCORAGEM DE PREÇO" },
  { key: "bonus", emoji: "🎁", title: "BÔNUS" },
  { key: "copy_final", emoji: "📣", title: "COPY FINAL" },
];

export interface GsoInputs {
  produto: string;
  publico: string;
  problema?: string;
  preco?: string;
  clientContext?: string;
}

const GSO_SYSTEM = `Você é um "Engenheiro de Oferta": copywriter de resposta direta de elite (Hormozi, Kennedy, Schwartz, Halbert). Transforma um produto comum numa Grand Slam Offer irresistível, no formato exato do EXEMPLO abaixo.

# EXEMPLO DE FORMATO E QUALIDADE (kit Funko Pop):
Nome: "Coleção dos Sonhos: Kit Funko Pop... Monte Sua Prateleira Dos Sonhos em 7 Dias ou Devolvemos Seu Dinheiro"
Resultado dos sonhos: parágrafo pintando a transformação final na linguagem do público.
Equação de valor: 4 alavancas (Resultado dos sonhos / Probabilidade percebida / Atraso de tempo / Esforço e sacrifício), cada uma com a tática concreta.
Stack de valor: itens com valor individual em R$ e justificativa de cada um.
Garantia: nomeada + risco reverso ("o risco é 100% nosso"), com o que o cliente mantém mesmo devolvendo.
Escassez: motivo REAL (lote/curadoria/prazo).
Ancoragem: valor total do stack somado vs preço da oferta, variações e parcelamento comparado a algo cotidiano.
Bônus: numerados, cada um com valor em R$ e o porquê.
Copy final: parágrafo único pronto (dor → mecanismo → oferta → garantia → escassez → CTA).

# REGRAS INEGOCIÁVEIS
- NUNCA invente escassez/urgência falsa nem prova social falsa. Sem dado real, escreva "[placeholder: inserir dado real]".
- Valores do stack coerentes com o preço de referência quando informado.
- Português do Brasil, pronto para uso.

# FORMATO DE SAÍDA (OBRIGATÓRIO): responda APENAS com os 9 blocos, cada um começando por "## " + emoji + título. Nada antes nem depois.

## 🏆 NOME DA OFERTA
## 🌟 RESULTADO DOS SONHOS
## ⚖️ EQUAÇÃO DE VALOR
## 🥞 STACK DE VALOR
## 🛡️ GARANTIA
## ⏳ ESCASSEZ/URGÊNCIA
## 💰 ANCORAGEM DE PREÇO
## 🎁 BÔNUS
## 📣 COPY FINAL`;

function gsoUser(i: GsoInputs, notes: CopyNote[]): string {
  return [
    "Construa a Grand Slam Offer a partir de:",
    `- Produto/Serviço: ${i.produto}`,
    `- Público-alvo: ${i.publico}`,
    i.problema ? `- Problema/dor: ${i.problema}` : null,
    i.preco ? `- Preço/ticket de referência: ${i.preco}` : null,
    i.clientContext ? `\nContexto do cliente:\n${i.clientContext}` : null,
    `\nNotas da biblioteca (use como base):\n${libraryContext(notes)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface GeneratedGso {
  outputMd: string;
  blocks: Record<string, string>;
  model: string;
}

export async function generateGso(inputs: GsoInputs, notes: CopyNote[]): Promise<GeneratedGso> {
  const stream = anthropicClient().messages.stream({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: GSO_SYSTEM,
    messages: [{ role: "user", content: gsoUser(inputs, notes) }],
  });
  const outputMd = textOf(await stream.finalMessage());
  return { outputMd, blocks: parseBlocks(outputMd, GSO_BLOCKS), model: MODEL };
}

export async function regenerateGsoBlock(
  inputs: GsoInputs,
  notes: CopyNote[],
  currentMd: string,
  blockKey: string,
): Promise<string> {
  const block = GSO_BLOCKS.find((b) => b.key === blockKey);
  if (!block) throw new Error(`Bloco desconhecido: ${blockKey}`);
  const stream = anthropicClient().messages.stream({
    model: MODEL,
    max_tokens: 3000,
    thinking: { type: "adaptive" },
    system: GSO_SYSTEM,
    messages: [
      { role: "user", content: gsoUser(inputs, notes) },
      { role: "assistant", content: currentMd },
      {
        role: "user",
        content: `Regenere APENAS o bloco "${block.emoji} ${block.title}", mantendo coerência. Responda só com esse bloco, começando por "## ${block.emoji} ${block.title}".`,
      },
    ],
  });
  const md = textOf(await stream.finalMessage());
  return parseBlocks(md, GSO_BLOCKS)[blockKey] || md.replace(/^##.*$/m, "").trim();
}

// ---- Copy de Anúncio ------------------------------------------------------
export interface AdCopyInputs {
  produto: string;
  publico: string;
  objetivo: string;
  tom: string;
  diferencial?: string;
  plataforma: string;
  framework?: string;
  clientContext?: string;
}

const PLATFORM_LIMITS: Record<string, string> = {
  "Meta Ads": "Facebook/Instagram: headline curta (~40 caracteres), texto primário até ~125 caracteres antes do 'ver mais'.",
  "Google Ads": "Google: 3 headlines de até 30 caracteres e 2 descrições de até 90 caracteres.",
  TikTok: "TikTok: texto curto e coloquial, até ~100 caracteres, tom nativo da plataforma.",
  "Orgânico": "Post orgânico: sem limite rígido, mas objetivo e escaneável.",
};

const AD_SYSTEM = `Você é um copywriter de anúncios de resposta direta formado no MÉTODO ANDROMEDA (gestão de tráfego pago no Meta). Gere 3 variações DISTINTAS de copy de anúncio, cada uma com headline, corpo e CTA, respeitando os limites da plataforma. Português do Brasil.

${andromedaContext({ levels: ["C1", "C2", "C3"], includeAnatomy: true })}

Cada variação deve declarar o nível de consciência (C1/C2/C3) que ataca e usar um ângulo diferente das outras.

Formato de saída: markdown com "### Variação 1/2/3 — [Nível] [Tipo]" e, em cada uma, **Headline:**, **Corpo:**, **CTA:** e **Por que funciona:** (1 linha).`;

export async function generateAdCopy(inputs: AdCopyInputs, notes: CopyNote[]): Promise<{ outputMd: string; model: string }> {
  const user = [
    "Gere 3 variações de copy de anúncio para:",
    `- Produto/Serviço: ${inputs.produto}`,
    `- Público-alvo: ${inputs.publico}`,
    `- Objetivo: ${inputs.objetivo}`,
    `- Tom: ${inputs.tom}`,
    inputs.diferencial ? `- Diferencial: ${inputs.diferencial}` : null,
    `- Plataforma: ${inputs.plataforma} (${PLATFORM_LIMITS[inputs.plataforma] ?? ""})`,
    inputs.framework ? `- Framework a aplicar: ${inputs.framework}` : null,
    inputs.clientContext ? `\nContexto do cliente:\n${inputs.clientContext}` : null,
    `\nNotas da biblioteca:\n${libraryContext(notes)}`,
  ]
    .filter(Boolean)
    .join("\n");
  const stream = anthropicClient().messages.stream({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: AD_SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const outputMd = textOf(await stream.finalMessage());
  return { outputMd, model: MODEL };
}

// ---- Copy de Conteúdo (roteiros de criativos — Método Andromeda) ----------
export interface ContentCopyInputs {
  produto: string;
  publico: string;
  /** C1 | C2 | C3 | enxoval (3+3+3) */
  nivel: string;
  /** chave de CREATIVE_TYPES, ou "auto" para a IA escolher */
  tipo: string;
  /** chave de PRODUCTION_TYPES, ou "auto" */
  producao: string;
  formato: string; // Vídeo | Estático | Carrossel
  duracao?: string;
  oferta?: string;
  clientContext?: string;
}

export const CONTENT_LEVELS = [
  { key: "enxoval", label: "Enxoval completo (3 C1 + 3 C2 + 3 C3)" },
  { key: "C1", label: "C1 — Consciência baixa (topo/frio)" },
  { key: "C2", label: "C2 — Consciência média (meio)" },
  { key: "C3", label: "C3 — Consciência alta (fundo)" },
];

export const CONTENT_TYPES = CREATIVE_TYPES.map((t) => ({ key: t.key, label: `${t.label} (${t.level})`, level: t.level }));
export const CONTENT_PRODUCTIONS = PRODUCTION_TYPES.map((p) => ({ key: p.key, label: p.label }));

function contentSystem(inputs: ContentCopyInputs): string {
  const isEnxoval = inputs.nivel === "enxoval";
  const levels: ("C1" | "C2" | "C3")[] = isEnxoval
    ? ["C1", "C2", "C3"]
    : ([inputs.nivel] as ("C1" | "C2" | "C3")[]);
  const typeKeys = inputs.tipo && inputs.tipo !== "auto" ? [inputs.tipo] : undefined;

  const saida = isEnxoval
    ? `Gere o ENXOVAL COMPLETO: 9 roteiros (3 C1 + 3 C2 + 3 C3), cada um com um TIPO diferente e ângulo diferente.
Para CADA roteiro use este formato compacto:
### [n] [C1|C2|C3] · [Tipo] · [Formato]
**🎣 Gancho (0-3s):** ...
**🎬 Roteiro:** cena a cena com marcação de tempo
**📝 Texto na tela:** ...
**💬 Legenda:** ...
**📢 CTA:** ...`
    : `Gere 3 VARIAÇÕES do criativo (ângulos diferentes entre si), cada uma no formato:
### Variação [n] — [Tipo] · [Formato]
**🎣 GANCHO (0-3s):** a headline/abertura que estanca o scroll
**🎬 ROTEIRO:** cena a cena com marcação de tempo (ex.: [0-3s], [3-10s], [10-25s]), descrevendo cena, ângulo, o que aparece e o que é falado
**📝 TEXTO NA TELA:** as legendas queimadas / textos sobrepostos
**💬 LEGENDA DO POST:** a copy que acompanha a publicação
**📢 CTA:** a chamada para ação
**🧬 ANATOMIA:** quais recursos mecânicos/visuais/temáticos foram usados e por quê (2-3 linhas)`;

  return `Você é um diretor de criativos formado no MÉTODO ANDROMEDA (tráfego pago no Meta). Escreve roteiros de criativos (conteúdo) prontos para gravar/produzir. Português do Brasil, linguagem do público-alvo.

${andromedaContext({ levels, typeKeys, includeAnatomy: true, includeRetention: true, includeEnxoval: isEnxoval })}

REGRAS:
- O gancho dos 3 primeiros segundos é a decisão mais importante do criativo. Ele precisa ser específico e conectado à dor/oferta — nunca genérico.
- Escolha e declare explicitamente uma MECÂNICA DE RETENÇÃO para cada roteiro.
- Roteiro deve ser executável: diga o que aparece na tela, quem fala, o que fala e em que tempo.
- Nunca invente prova social, número ou escassez. Sem dado real use "[placeholder: inserir dado real]".

FORMATO DE SAÍDA (OBRIGATÓRIO):
${saida}`;
}

export async function generateContentCopy(
  inputs: ContentCopyInputs,
  notes: CopyNote[],
): Promise<{ outputMd: string; model: string }> {
  const prod = PRODUCTION_TYPES.find((p) => p.key === inputs.producao);
  const user = [
    "Crie os roteiros de criativo para:",
    `- Produto/Serviço: ${inputs.produto}`,
    `- Público-alvo: ${inputs.publico}`,
    `- Nível de consciência: ${inputs.nivel === "enxoval" ? "enxoval completo (3 C1 + 3 C2 + 3 C3)" : inputs.nivel}`,
    inputs.tipo && inputs.tipo !== "auto" ? `- Tipo de criativo: ${CREATIVE_TYPES.find((t) => t.key === inputs.tipo)?.label}` : "- Tipo de criativo: escolha o mais adequado e justifique",
    prod ? `- Formato de produção: ${prod.label} — ${prod.desc}` : "- Formato de produção: escolha o mais adequado",
    `- Formato: ${inputs.formato}`,
    inputs.duracao ? `- Duração alvo: ${inputs.duracao}` : null,
    inputs.oferta ? `- Oferta/promoção vigente: ${inputs.oferta}` : null,
    inputs.clientContext ? `\nContexto do cliente:\n${inputs.clientContext}` : null,
    `\nNotas da biblioteca:\n${libraryContext(notes)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const stream = anthropicClient().messages.stream({
    model: MODEL,
    max_tokens: inputs.nivel === "enxoval" ? 12000 : 6000,
    thinking: { type: "adaptive" },
    system: contentSystem(inputs),
    messages: [{ role: "user", content: user }],
  });
  const outputMd = textOf(await stream.finalMessage());
  return { outputMd, model: MODEL };
}

// ---- Engenheiro (chat livre de copy) --------------------------------------
export async function askEngineer(question: string, notes: CopyNote[]): Promise<string> {
  const stream = anthropicClient().messages.stream({
    model: MODEL,
    max_tokens: 3000,
    thinking: { type: "adaptive" },
    system:
      "Você é um engenheiro de copy e oferta (Hopkins, Ogilvy, Schwartz, Halbert, Hormozi) e domina o MÉTODO ANDROMEDA de criativos para Meta Ads. Responde pedidos de copy: headlines, ângulos, reescritas, estruturas de oferta, roteiros de criativo. Só copy e oferta — não mexe em campanhas nem dados. Português do Brasil. Use as notas da biblioteca como base.\n\n" +
      andromedaContext({ levels: ["C1", "C2", "C3"], includeAnatomy: true, includeRetention: true, includeEnxoval: true, includeMetricas: true }),
    messages: [
      {
        role: "user",
        content: `Notas da biblioteca:\n${libraryContext(notes)}\n\nPedido:\n${question}`,
      },
    ],
  });
  return textOf(await stream.finalMessage());
}
