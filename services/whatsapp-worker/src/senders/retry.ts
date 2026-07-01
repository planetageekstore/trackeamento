/** Qualidade de correspondência do envio: "full" quando há click id, senão "reduced". */
export function computeMatchQuality(hasClickId: boolean): "full" | "reduced" {
  return hasClickId ? "full" : "reduced";
}

/** Formata a data/hora do clique para o Google Ads (YYYY-MM-DD HH:MM:SS+00:00). */
export function toGoogleDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`
  );
}
