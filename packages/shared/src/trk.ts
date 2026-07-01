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

/** Extrai o primeiro `TRK-XXXX` de um texto (ex.: mensagem de WhatsApp). */
export function extractTrackingCode(text: string): string | null {
  const match = text.match(TRK_REF_REGEX);
  return match ? match[1]! : null;
}

/** Monta o marcador a ser anexado à mensagem de WhatsApp. */
export function buildRefMarker(trackingCode: string): string {
  return `[Ref: ${trackingCode}]`;
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
