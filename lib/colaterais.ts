// Bloqueios dos efeitos colaterais (Fase 2E): sem gastar PP ou sem usar Haki
// por um tempo, contado em rodadas (1 minuto = 10) no Passar turno. Puro.

export type TipoBloqueio = "pp" | "haki";

export type Bloqueio = { tipo: TipoBloqueio; fonte: string; rodadas: number };

export const RODADAS_POR_MINUTO = 10;

// Json do banco (Personagem.bloqueios) → lista limpa.
export function lerBloqueios(raw: unknown): Bloqueio[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x): Bloqueio[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const tipo = o.tipo === "pp" || o.tipo === "haki" ? o.tipo : null;
    const rodadas = Math.trunc(Number(o.rodadas) || 0);
    if (!tipo || rodadas <= 0) return [];
    return [{ tipo, fonte: String(o.fonte ?? "").slice(0, 80), rodadas: Math.min(6000, rodadas) }];
  });
}

// O bloqueio desse tipo que está valendo (o mais longo); null = nenhum.
export function bloqueioDe(bloqueios: Bloqueio[], tipo: TipoBloqueio): Bloqueio | null {
  return bloqueios.filter((b) => b.tipo === tipo).sort((a, b) => b.rodadas - a.rodadas)[0] ?? null;
}

// Passar turno: uma rodada a menos em cada; os que zeram acabam.
export function passarRodadaDosBloqueios(bloqueios: Bloqueio[]): { bloqueios: Bloqueio[]; acabaram: Bloqueio[] } {
  const acabaram = bloqueios.filter((b) => b.rodadas <= 1);
  return { bloqueios: bloqueios.filter((b) => b.rodadas > 1).map((b) => ({ ...b, rodadas: b.rodadas - 1 })), acabaram };
}

// "Sem PP (Gomu-Gomu no Bullet)", pra recusa e tooltip.
export function textoDoBloqueio(b: Bloqueio): string {
  return `${b.tipo === "pp" ? "Sem PP" : "Sem Haki"}${b.fonte ? ` (${b.fonte})` : ""}`;
}

// "8 rodadas" / "1 minuto".
export function tempoDoBloqueio(rodadas: number): string {
  if (rodadas % RODADAS_POR_MINUTO === 0) {
    const min = rodadas / RODADAS_POR_MINUTO;
    return `${min} minuto${min === 1 ? "" : "s"}`;
  }
  return `${rodadas} rodada${rodadas === 1 ? "" : "s"}`;
}
