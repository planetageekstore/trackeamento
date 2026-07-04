import type { ClickIds, UtmParams } from "./types.js";

/**
 * Regex canônico do marcador de Tracking ID inserido nas mensagens de WhatsApp.
 * FONTE ÚNICA — usado pelo tracker, pela API e pelo worker. Não duplicar.
 */
export const TRK_REF_REGEX = /\[Ref: (TRK-[A-Z0-9]+)\]/;

/** Valida o formato de um tracking code. */
export const TRK_CODE_REGEX = /^TRK-[A-Z0-9]+$/;

/** Alfabeto base32 Crockford (sem I, L, O, U — evita ambiguidade). */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TRK_ID_LENGTH = 12;

/** Fonte de aleatoriedade isomórfica (browser + Node). */
function randomBytes(n: number): Uint8Array {
  const g = globalThis as { crypto?: Crypto };
  const bytes = new Uint8Array(n);
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/**
 * Gera um Tracking ID único no formato `TRK-` + 12 chars base32.
 * ~60 bits de entropia → colisão desprezível mesmo entre tenants.
 */
export function generateTrackingCode(): string {
  const bytes = randomBytes(TRK_ID_LENGTH);
  let out = "";
  for (let i = 0; i < TRK_ID_LENGTH; i++) {
    out += CROCKFORD[bytes[i]! % CROCKFORD.length];
  }
  return `TRK-${out}`;
}

/** Verdadeiro se `code` casa o formato esperado de tracking code. */
export function isValidTrackingCode(code: string): boolean {
  return TRK_CODE_REGEX.test(code);
}

// ---------------------------------------------------------------------------
// Marcador INVISÍVEL (zero-width): o cliente vê a mensagem limpa, mas o código
// viaja escondido no texto e o servidor decodifica. O sufixo de 12 chars
// (base32 Crockford) é codificado em bits: ZWSP=0, ZWNJ=1, delimitado por WJ.
// ---------------------------------------------------------------------------
const ZW_SEP = String.fromCharCode(0x2060); // Word Joiner — delimita o bloco
const ZW_0 = String.fromCharCode(0x200b); // Zero Width Space — bit 0
const ZW_1 = String.fromCharCode(0x200c); // Zero Width Non-Joiner — bit 1

/** Codifica o tracking code como sequência invisível (para anexar à mensagem). */
export function encodeHiddenRef(trackingCode: string): string {
  const suffix = trackingCode.replace(/^TRK-/, "");
  let bits = "";
  for (const ch of suffix) {
    const idx = CROCKFORD.indexOf(ch);
    if (idx < 0) return ""; // char fora do alfabeto — não codifica
    bits += idx.toString(2).padStart(5, "0");
  }
  let out = ZW_SEP;
  for (const b of bits) out += b === "1" ? ZW_1 : ZW_0;
  return out + ZW_SEP;
}

/** Decodifica um tracking code escondido (zero-width) de um texto, se houver. */
export function decodeHiddenRef(text: string): string | null {
  const start = text.indexOf(ZW_SEP);
  if (start < 0) return null;
  const end = text.indexOf(ZW_SEP, start + 1);
  if (end < 0) return null;
  let bits = "";
  for (const c of text.slice(start + 1, end)) {
    if (c === ZW_0) bits += "0";
    else if (c === ZW_1) bits += "1";
  }
  if (bits.length === 0 || bits.length % 5 !== 0) return null;
  let suffix = "";
  for (let i = 0; i < bits.length; i += 5) {
    const ch = CROCKFORD[parseInt(bits.slice(i, i + 5), 2)];
    if (!ch) return null;
    suffix += ch;
  }
  const code = `TRK-${suffix}`;
  return TRK_CODE_REGEX.test(code) ? code : null;
}

/** Extrai o tracking code de um texto: `[Ref: TRK-…]` → `TRK-…` cru → escondido. */
export function extractTrackingCode(text: string): string | null {
  const ref = text.match(TRK_REF_REGEX);
  if (ref) return ref[1]!;
  const raw = text.match(/TRK-[0-9A-HJKMNP-TV-Z]+/);
  if (raw) return raw[0];
  return decodeHiddenRef(text);
}

/** Monta o marcador (invisível) a ser anexado à mensagem de WhatsApp. */
export function buildRefMarker(trackingCode: string): string {
  return encodeHiddenRef(trackingCode);
}

/** Extrai UTMs de um `URLSearchParams` (ou querystring). */
export function parseUtm(input: URLSearchParams | string): UtmParams {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  return {
    source: params.get("utm_source"),
    medium: params.get("utm_medium"),
    campaign: params.get("utm_campaign"),
    content: params.get("utm_content"),
    term: params.get("utm_term"),
  };
}

/** Extrai click ids (fbclid/gclid) de um `URLSearchParams` (ou querystring). */
export function parseClickIds(input: URLSearchParams | string): ClickIds {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  return {
    fbclid: params.get("fbclid"),
    gclid: params.get("gclid"),
  };
}

/** Verdadeiro se ao menos um parâmetro de origem foi capturado. */
export function hasOrigin(utm: UtmParams, click: ClickIds): boolean {
  return Boolean(
    utm.source || utm.medium || utm.campaign || utm.content || utm.term || click.fbclid || click.gclid,
  );
}

/**
 * Normaliza um telefone para E.164 simples (mantém apenas dígitos, prefixa +).
 * Assume Brasil (55) quando o número não traz código de país.
 */
export function normalizePhoneE164(raw: string, defaultCountry = "55"): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith(defaultCountry)) return `+${digits}`;
  return `+${defaultCountry}${digits}`;
}

/** Extrai o telefone do `remoteJid` da Evolution (ex.: `5511999999999@s.whatsapp.net`). */
export function phoneFromRemoteJid(remoteJid: string): string {
  const num = remoteJid.split("@")[0] ?? "";
  return normalizePhoneE164(num);
}
