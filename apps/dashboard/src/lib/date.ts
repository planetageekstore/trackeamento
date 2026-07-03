// Formatação de datas no fuso do Brasil (São Paulo). O painel renderiza no
// servidor (Vercel = UTC); sem fixar o timeZone, as horas apareceriam +3h.
const TZ = "America/Sao_Paulo";

export function fmtDateTime(
  input: string | number | Date,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return new Date(input).toLocaleString("pt-BR", { timeZone: TZ, ...opts });
}
