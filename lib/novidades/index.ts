import type { Novidade } from "./tipos";
import n20261024 from "./2026-10-24";

export type { Mudanca, Novidade, TelaNovidade, ZonaNovidade } from "./tipos";

// Nova atualização: lib/novidades/AAAA-MM-DD.ts, mídias em public/novidades/AAAA-MM-DD/ e o import aqui.
export const NOVIDADES: Novidade[] = [n20261024].sort((a, b) => b.data.localeCompare(a.data));

export const ULTIMA_NOVIDADE = NOVIDADES[0]?.data ?? "";

export function urlDaMidia(data: string, arquivo: string): string {
  return `/novidades/${data}/${arquivo}`;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10-24" → "24 out", sem Date (não depende do fuso). */
export function rotuloDaData(data: string, comAno = false): string {
  const [ano, mes, dia] = data.split("-");
  const base = `${Number(dia)} ${MESES[Number(mes) - 1] ?? mes}`;
  return comAno ? `${base} ${ano}` : base;
}
