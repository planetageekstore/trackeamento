import "server-only";
import { createHash } from "node:crypto";

/** SHA-256 hex de um valor normalizado (para EMQ da Meta). */
export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Normaliza telefone para E.164 só dígitos e aplica SHA-256. Null se vazio. */
export function hashPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits ? sha256(digits) : null;
}

/** Normaliza e-mail (trim + minúsculo) e aplica SHA-256. Null se vazio. */
export function hashEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const norm = email.trim().toLowerCase();
  return norm ? sha256(norm) : null;
}

/** Monta o `fbc` a partir do fbclid e do timestamp do clique: fb.1.<ms>.<fbclid>. */
export function buildFbc(fbclid: string | null | undefined, clickedAt: string | null | undefined): string | null {
  if (!fbclid) return null;
  const ms = clickedAt ? new Date(clickedAt).getTime() : Date.now();
  return `fb.1.${ms}.${fbclid}`;
}
