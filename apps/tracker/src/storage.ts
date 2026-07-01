import type { Origin } from "./parseUrl";

const KEY_ID = "_saas_trk_id";
const KEY_SRC = "_saas_trk_src";

// Fallback em cookie first-party (1 ano) quando o LocalStorage está indisponível
// (modo restrito). Mantém a continuidade do TRK sempre que possível (SC-007).
function writeCookie(name: string, value: string): void {
  try {
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAge};SameSite=Lax`;
  } catch {
    /* silencioso */
  }
}

function readCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]!) : null;
  } catch {
    return null;
  }
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? readCookie(key);
  } catch {
    return readCookie(key);
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* segue para cookie */
  }
  writeCookie(key, value);
}

/** Tracking ID persistido, ou null se ainda não houver. */
export function getStoredId(): string | null {
  return safeGet(KEY_ID);
}

export function storeId(id: string): void {
  safeSet(KEY_ID, id);
}

/** Primeira origem capturada, se já persistida. */
export function getStoredOrigin(): Origin | null {
  const raw = safeGet(KEY_SRC);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Origin;
  } catch {
    return null;
  }
}

export function storeOrigin(origin: Origin): void {
  safeSet(KEY_SRC, JSON.stringify(origin));
}
