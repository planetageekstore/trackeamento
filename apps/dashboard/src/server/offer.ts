import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Engenheiro de Oferta — gerador de ofertas (não é um agente autônomo, v1).
 * Recebe os 5 inputs da loja e devolve uma oferta em 7 blocos endereçáveis,
 * cada um marcado por um emoji fixo para permitir parse e regeneração pontual.
 */

// Modelo atual da família Claude (o plano original citava um id desatualizado).
const MODEL = "claude-opus-4-8";

export interface OfferInputs {
  nicho: string;
  produto: string;
  preco: string;
  roma: string;
  problema: string;
}

export interface OfferBlock {
  key: string;
  emoji: string;
  title: string;
}

/** Blocos fixos, na ordem de saída. As chaves são a API de parsing/regeneração. */
export const OFFER_BLOCKS: OfferBlock[] = [
  { key: "hooks", emoji: "🪝", title: "HOOKS" },
  { key: "roma_usp", emoji: "🏛️", title: "ROMA & USP" },
  { key: "historia", emoji: "📖", title: "HISTÓRIA E CONEXÃO" },
  { key: "stack", emoji: "🥞", title: "STACK" },
  { key: "garantia", emoji: "🛡️", title: "GARANTIA" },
  { key: "urgencia", emoji: "⏳", title: "URGÊNCIA/ESCASSEZ" },
  { key: "faq", emoji: "❓", title: "FAQ" },
];

const SYSTEM_PROMPT = `Você é um "Engenheiro de Oferta": um copywriter de resposta direta de elite, treinado no melhor de Dan Kennedy, Alex Hormozi, Russell Brunson, Rafael Albertoni e Conrado Adolpho. Sua função é transformar um produto comum em uma oferta irresistível, seguindo um protocolo rigoroso.

# PROTOCOLO (execute mentalmente, na ordem)
1. Análise de mercado/cliente: entenda o nicho, o público e o estado de consciência dele.
2. Roma & USP: cristalize a transformação principal ("Roma" = o destino/desejo final) e a proposta única de valor (por que ESTA oferta e não a do concorrente).
3. Equação de Valor de Hormozi: maximize (Sonho Realizado × Probabilidade Percebida de Sucesso) e minimize (Tempo de Atraso × Esforço e Sacrifício). Toda a oferta deve puxar essas 4 alavancas.
4. Arquitetura da Oferta (Stack): monte um empilhamento de valor onde a soma percebida seja MUITO maior que o preço-alvo.
5. Hook / História / Oferta: crie ganchos de atenção, uma história de conexão emocional e a apresentação da oferta.
6. Blindagem de objeções: antecipe e destrua as objeções centrais.

# REGRAS INEGOCIÁVEIS
- NUNCA invente urgência/escassez falsa nem prova social falsa. Onde uma prova real seria usada, escreva literalmente "[placeholder: inserir prova real aqui]".
- Proporção 80% emoção / 20% lógica.
- Escreva em português do Brasil, tom direto e persuasivo, pronto para uso.
- Se algum dos 5 inputs estiver claramente ausente ou vazio, comece a resposta com uma única linha "AVISO: faltam os seguintes inputs: ..." e ainda assim faça o seu melhor com o que há.

# FORMATO DE SAÍDA (OBRIGATÓRIO)
Responda APENAS com os 7 blocos abaixo, cada um começando EXATAMENTE com o cabeçalho indicado (emoji + título, em uma linha iniciada por "## "). Não escreva nada antes do primeiro bloco nem depois do último.

## 🪝 HOOKS
(3 headlines/ganchos numerados, um por linha)

## 🏛️ ROMA & USP
(a transformação principal "Roma" + a proposta única de valor)

## 📖 HISTÓRIA E CONEXÃO
(uma história curta de conexão emocional com o público)

## 🥞 STACK
(o empilhamento de valor: itens da oferta com valor percebido de cada um e o total, contrastando com o preço-alvo)

## 🛡️ GARANTIA
(a garantia que remove o risco da decisão)

## ⏳ URGÊNCIA/ESCASSEZ
(motivos legítimos de urgência/escassez; se não houver dado real, use placeholders)

## ❓ FAQ
(as 3-5 objeções centrais em formato pergunta/resposta)`;

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY não configurada. Adicione a variável de ambiente no servidor (Vercel/Portainer) para gerar ofertas.",
    );
  }
  return new Anthropic({ apiKey });
}

function userMessage(i: OfferInputs): string {
  return [
    "Crie a oferta a partir destes inputs:",
    `- Nicho e Público-Alvo: ${i.nicho}`,
    `- Produto/Serviço: ${i.produto}`,
    `- Preço-Alvo: ${i.preco}`,
    `- Transformação Principal (Roma): ${i.roma}`,
    `- Problema Central: ${i.problema}`,
  ].join("\n");
}

/** Extrai o texto de uma resposta do Claude (concatena blocos de texto). */
function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Identifica a qual bloco uma linha de cabeçalho "## ..." pertence (emoji ou título). */
function headerKey(line: string): string | null {
  const upper = line.toUpperCase();
  for (const b of OFFER_BLOCKS) {
    if (line.includes(b.emoji) || upper.includes(b.title)) return b.key;
  }
  return null;
}

/**
 * Separa o markdown de saída nos 7 blocos, pela linha de cabeçalho de cada um.
 * Devolve um mapa key -> conteúdo (sem o cabeçalho). Blocos ausentes ficam "".
 */
export function parseBlocks(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of OFFER_BLOCKS) out[b.key] = "";

  const lines = md.split("\n");
  let current: string | null = null;
  const buf: Record<string, string[]> = {};
  for (const line of lines) {
    if (line.trimStart().startsWith("##")) {
      const key = headerKey(line);
      if (key) {
        current = key;
        buf[current] = [];
        continue;
      }
    }
    if (current) (buf[current] ??= []).push(line);
  }
  for (const key of Object.keys(buf)) out[key] = buf[key]!.join("\n").trim();
  return out;
}

export interface GeneratedOffer {
  outputMd: string;
  blocks: Record<string, string>;
  model: string;
}

/** Gera a oferta completa (7 blocos) a partir dos 5 inputs. */
export async function generateOffer(inputs: OfferInputs): Promise<GeneratedOffer> {
  // Streaming: a saída é longa; evita timeout de request e coleta a mensagem final.
  const stream = client().messages.stream({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage(inputs) }],
  });
  const msg = await stream.finalMessage();
  const outputMd = textOf(msg);
  return { outputMd, blocks: parseBlocks(outputMd), model: MODEL };
}

/**
 * Regenera apenas UM bloco, reenviando o histórico (inputs + oferta atual) e uma
 * instrução pontual. Devolve o novo conteúdo daquele bloco.
 */
export async function regenerateBlock(
  inputs: OfferInputs,
  currentMd: string,
  blockKey: string,
): Promise<string> {
  const block = OFFER_BLOCKS.find((b) => b.key === blockKey);
  if (!block) throw new Error(`Bloco desconhecido: ${blockKey}`);

  const stream = client().messages.stream({
    model: MODEL,
    max_tokens: 3000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: userMessage(inputs) },
      { role: "assistant", content: currentMd },
      {
        role: "user",
        content:
          `Regenere APENAS o bloco "${block.emoji} ${block.title}", mantendo a coerência com o restante da oferta. ` +
          `Responda somente com esse bloco, começando pelo cabeçalho "## ${block.emoji} ${block.title}".`,
      },
    ],
  });
  const md = textOf(await stream.finalMessage());
  const parsed = parseBlocks(md);
  return parsed[blockKey] || md.replace(/^##.*$/m, "").trim();
}
