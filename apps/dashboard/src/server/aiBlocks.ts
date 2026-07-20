import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Helpers compartilhados de geração por IA em blocos endereçáveis.
 * Cada bloco começa por um cabeçalho "## {emoji} {TÍTULO}" que serve de âncora
 * para parse e regeneração pontual. Usado pelo Engenheiro de Oferta e pelos
 * Relatórios de Análise.
 */

export interface AiBlock {
  key: string;
  emoji: string;
  title: string;
}

/** Cliente Anthropic (lê ANTHROPIC_API_KEY do ambiente). */
export function anthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY não configurada. Adicione a variável de ambiente no servidor (Vercel/Portainer).",
    );
  }
  return new Anthropic({ apiKey });
}

/** Extrai o texto de uma resposta do Claude (concatena blocos de texto). */
export function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Identifica a qual bloco uma linha de cabeçalho "## ..." pertence (emoji ou título). */
export function headerKey(line: string, blocks: AiBlock[]): string | null {
  const upper = line.toUpperCase();
  for (const b of blocks) {
    if (line.includes(b.emoji) || upper.includes(b.title)) return b.key;
  }
  return null;
}

/**
 * Separa o markdown de saída nos blocos, pela linha de cabeçalho de cada um.
 * Devolve um mapa key -> conteúdo (sem o cabeçalho). Blocos ausentes ficam "".
 */
export function parseBlocks(md: string, blocks: AiBlock[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of blocks) out[b.key] = "";

  const lines = md.split("\n");
  let current: string | null = null;
  const buf: Record<string, string[]> = {};
  for (const line of lines) {
    if (line.trimStart().startsWith("##")) {
      const key = headerKey(line, blocks);
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
