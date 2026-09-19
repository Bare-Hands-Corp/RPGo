// Subir de nível: o assistente propõe e o jogador confirma; PE só sugere.

import { PE_POR_NIVEL, bonusProficiencia, modificador, type Atributo } from "./op-rpg";
import { TETO_ATRIBUTO_BASE } from "./op-rpg";

/** Valor fixo de PV por Dado de Vida (livro do jogador, tabela do cap. 2). */
export const PV_FIXO_POR_DADO: Record<number, number> = {
  6: 4,
  8: 5,
  10: 6,
  12: 7,
};

export const NIVEL_MAXIMO = PE_POR_NIVEL.length;

/** Padrão do livro; o jogador pode aplicar fora de nível-chave. */
export const NIVEIS_APRIMORAMENTO = [4, 8, 12, 16, 19];

export function ehNivelDeAprimoramento(nivel: number): boolean {
  return NIVEIS_APRIMORAMENTO.includes(nivel);
}

/** Pontos distribuíveis num Aprimoramento: +2 num atributo OU +1 em dois. */
export const PONTOS_APRIMORAMENTO = 2;

export function facesDoDado(tipoDadoVida: string | null | undefined): number {
  const n = Number(String(tipoDadoVida ?? "").replace(/^d/i, ""));
  return Number.isFinite(n) && n > 0 ? n : 8;
}

export function pvFixoDoDado(tipoDadoVida: string | null | undefined): number {
  const faces = facesDoDado(tipoDadoVida);
  return PV_FIXO_POR_DADO[faces] ?? Math.floor(faces / 2) + 1;
}

export function clampGanhoPv(bruto: number): number {
  return Math.max(1, Math.trunc(bruto));
}

/** Teto do que um nível pode conceder de PV — usado pra validar o valor do cliente. */
export function tetoGanhoPv(
  tipoDadoVida: string | null | undefined,
  modCon: number,
): number {
  return facesDoDado(tipoDadoVida) + Math.max(0, modCon);
}

export type Aprimoramento = Partial<Record<Atributo, number>>;

export function pontosGastos(apr: Aprimoramento): number {
  return Object.values(apr).reduce((t, v) => t + Math.max(0, v ?? 0), 0);
}

/** Devolve o motivo da recusa, ou null. Objeto vazio é válido. */
export function validarAprimoramento(
  apr: Aprimoramento,
  atributosAtuais: Record<Atributo, number>,
  tetos: Partial<Record<Atributo, number>> = {},
): string | null {
  const total = pontosGastos(apr);
  if (total === 0) return null;
  if (total > PONTOS_APRIMORAMENTO) {
    return `Só dá pra distribuir ${PONTOS_APRIMORAMENTO} ponto(s).`;
  }
  for (const [slug, ganho] of Object.entries(apr)) {
    const at = slug as Atributo;
    const g = Math.max(0, ganho ?? 0);
    if (g === 0) continue;
    if (!Number.isInteger(g)) return "Pontos precisam ser inteiros.";
    const teto = tetos[at] ?? TETO_ATRIBUTO_BASE;
    if (atributosAtuais[at] + g > teto) {
      return `O aprimoramento passaria do teto (${teto}).`;
    }
  }
  return null;
}

/** PV retroativo: +1 por nível já atingido (incluindo o novo) quando o mod de CON sobe. */
export function pvRetroativoPorCon(
  conAntes: number,
  conDepois: number,
  nivelNovo: number,
): number {
  const delta = modificador(conDepois) - modificador(conAntes);
  if (delta <= 0) return 0;
  return delta * Math.max(0, nivelNovo);
}

export type PropostaNivel = {
  nivelAtual: number;
  nivelNovo: number;
  /** PV sugerido = valor fixo do dado + mod CON (o jogador pode rolar). */
  pvSugerido: number;
  pvFixo: number;
  modCon: number;
  faces: number;
  profAntes: number;
  profDepois: number;
  profMudou: boolean;
  pedeAprimoramento: boolean;
  peAlcancado: boolean;
  peFaltando: number;
};

export function montarProposta(
  nivelAtual: number,
  pe: number,
  tipoDadoVida: string,
  constituicao: number,
): PropostaNivel {
  const nivelNovo = Math.min(nivelAtual + 1, NIVEL_MAXIMO);
  const modCon = modificador(constituicao);
  const pvFixo = pvFixoDoDado(tipoDadoVida);
  const limiar = PE_POR_NIVEL[nivelNovo - 1] ?? 0;
  const profAntes = bonusProficiencia(nivelAtual);
  const profDepois = bonusProficiencia(nivelNovo);

  return {
    nivelAtual,
    nivelNovo,
    pvSugerido: clampGanhoPv(pvFixo + modCon),
    pvFixo,
    modCon,
    faces: facesDoDado(tipoDadoVida),
    profAntes,
    profDepois,
    profMudou: profDepois !== profAntes,
    pedeAprimoramento: ehNivelDeAprimoramento(nivelNovo),
    peAlcancado: pe >= limiar,
    peFaltando: Math.max(0, limiar - pe),
  };
}

/**
 * Faixa de PE do nível declarado. Não usar `progresso(pe)`: ela deriva o nível
 * do PE e o próximo limiar fica sempre acima.
 */
export function faixaPeDoNivel(nivel: number): {
  peBase: number;
  peProximo: number | null;
} {
  const n = Math.max(1, Math.min(Math.trunc(nivel) || 1, NIVEL_MAXIMO));
  return {
    peBase: PE_POR_NIVEL[n - 1] ?? 0,
    peProximo: n >= NIVEL_MAXIMO ? null : PE_POR_NIVEL[n] ?? null,
  };
}

export function pctPeDoNivel(nivel: number, pe: number): number {
  const { peBase, peProximo } = faixaPeDoNivel(nivel);
  if (peProximo == null) return 100;
  const vao = peProximo - peBase;
  if (vao <= 0) return 100;
  return Math.max(0, Math.min(100, ((pe - peBase) / vao) * 100));
}
