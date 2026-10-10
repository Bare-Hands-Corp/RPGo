// Engine pura do relógio da mesa (TS, compartilhado entre server e client).
//
// O banco guarda uma "base" (dia + segundo do dia) e, com o tempo real ligado,
// o instante em que a base foi gravada. A hora efetiva é sempre calculada:
// base + tempo decorrido × velocidade. Assim o relógio anda sem escrita no banco.

export const SEGUNDOS_DIA = 86400;
export const SEGUNDO_PADRAO = 8 * 3600;
export const VELOCIDADES = [1, 2, 5, 10, 30, 60] as const;

export type RelogioBase = {
  dias: number;
  segundo: number;
  /** Epoch ms de quando a base foi gravada com o tempo real ligado; null = pausado. */
  rodandoDesdeMs: number | null;
  velocidade: number;
};

export type TipoAjusteRelogio = "ajuste" | "definir" | "virada";

// Gravado em Calendario.ultimoAjusteRelogio; o realtime dispara o aviso quando o id muda.
export type AjusteRelogio = {
  id: string;
  tipo: TipoAjusteRelogio;
  delta: number;
  dias: number;
  segundo: number;
  em: string;
};

export type RelogioSerializado = RelogioBase & {
  formato12h: boolean;
  /** Epoch ms do servidor no render — corrige o relógio local do navegador. */
  agoraServidorMs: number;
  ultimoAjuste: AjusteRelogio | null;
};

export function ehVelocidadeValida(v: unknown): v is number {
  return typeof v === "number" && (VELOCIDADES as readonly number[]).includes(v);
}

// Soma `deltaSeg` (pode ser negativo) e normaliza, virando o dia nos dois sentidos.
// Fica preso entre o dia 0 às 00:00:00 e o último segundo de `maxDias`.
export function somarTempo(
  dias: number,
  segundo: number,
  deltaSeg: number,
  maxDias: number,
): { dias: number; segundo: number } {
  const limite = (maxDias + 1) * SEGUNDOS_DIA - 1;
  const total = Math.max(0, Math.min(dias * SEGUNDOS_DIA + segundo + Math.trunc(deltaSeg), limite));
  return { dias: Math.floor(total / SEGUNDOS_DIA), segundo: total % SEGUNDOS_DIA };
}

export function relogioEfetivo(
  base: RelogioBase,
  agoraMs: number,
  maxDias: number,
): { dias: number; segundo: number } {
  if (base.rodandoDesdeMs === null) return { dias: base.dias, segundo: base.segundo };
  const decorrido = Math.max(0, Math.floor(((agoraMs - base.rodandoDesdeMs) / 1000) * base.velocidade));
  return somarTempo(base.dias, base.segundo, decorrido, maxDias);
}

// "14:05" / "14:05:09" ou, no formato 12h, "2:05 PM".
export function formatarHora(
  segundo: number,
  opts: { segundos?: boolean; formato12h?: boolean } = {},
): string {
  const h = Math.floor(segundo / 3600);
  const m = Math.floor((segundo % 3600) / 60);
  const s = segundo % 60;
  const mm = String(m).padStart(2, "0");
  const ss = opts.segundos ? `:${String(s).padStart(2, "0")}` : "";
  if (opts.formato12h) {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${mm}${ss} ${h < 12 ? "AM" : "PM"}`;
  }
  return `${String(h).padStart(2, "0")}:${mm}${ss}`;
}

// Delta em segundos → "+1h 30min", "−10min".
export function formatarDelta(deltaSeg: number): string {
  const sinal = deltaSeg < 0 ? "−" : "+";
  const abs = Math.abs(deltaSeg);
  const d = Math.floor(abs / SEGUNDOS_DIA);
  const h = Math.floor((abs % SEGUNDOS_DIA) / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const partes: string[] = [];
  if (d) partes.push(`${d}d`);
  if (h) partes.push(`${h}h`);
  if (m || partes.length === 0) partes.push(`${m}min`);
  return sinal + partes.join(" ");
}

// Entrada livre do narrador: "30", "+45", "-1:30", "2h", "1h30", "-90m". Número puro = minutos.
export function lerDelta(entrada: string): number | null {
  const t = entrada.trim().toLowerCase().replace(/\s+/g, "").replace("−", "-");
  const m = /^([+-]?)(?:(\d+):(\d{1,2})|(?:(\d+)h)?(?:(\d+)(?:m|min)?)?)$/.exec(t);
  if (!m || t === "" || t === "+" || t === "-") return null;
  const sinal = m[1] === "-" ? -1 : 1;
  const horas = Number(m[2] ?? m[4] ?? 0);
  const minutos = Number(m[3] ?? m[5] ?? 0);
  const total = (horas * 60 + minutos) * 60;
  return total === 0 ? null : sinal * total;
}

// "18:00", "7:30", "18h", "18h30", "6:30 pm" → segundo do dia.
export function lerHorario(entrada: string): number | null {
  const t = entrada.trim().toLowerCase().replace(/\s+/g, "");
  const m = /^(\d{1,2})(?:[:h](\d{2})?)?(am|pm)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === "pm" ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return h * 3600 + min * 60;
}

// Período do dia pro ícone do relógio.
export function iconePeriodo(segundo: number): string {
  const h = segundo / 3600;
  if (h >= 5 && h < 7) return "fa-cloud-sun";
  if (h >= 7 && h < 18) return "fa-sun";
  if (h >= 18 && h < 20) return "fa-cloud-moon";
  return "fa-moon";
}
