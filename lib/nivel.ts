// Subir de nível.
//
// O user decidiu: **assistente que propõe e o jogador confirma** (nada é
// gravado sozinho) e **PE sugere, subir é manual** — em mesa onde o narrador
// controla o momento da evolução, cruzar o limiar não pode empurrar o nível.
//
// Módulo puro: mesma função serve o modal (pra montar a proposta) e a action
// (pra revalidar o que voltou do cliente).

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

/**
 * Níveis-chave de Aprimoramento de Atributo. O livro diz que são definidos pelo
 * Estilo de Combate e "normalmente 4, 8, 12, 16, 19" — como a ficha não guarda
 * estilo (decisão de rumo: o RPGo vai virar genérico), usamos o padrão e
 * deixamos o jogador aplicar fora de nível-chave se a mesa dele mandar.
 */
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

/** PV fixo (média do livro) do dado, sem o modificador de CON. */
export function pvFixoDoDado(tipoDadoVida: string | null | undefined): number {
  const faces = facesDoDado(tipoDadoVida);
  return PV_FIXO_POR_DADO[faces] ?? Math.floor(faces / 2) + 1;
}

/** Ganho de PV nunca é menor que 1, mesmo com CON negativa. */
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

/** Soma dos pontos gastos num Aprimoramento. */
export function pontosGastos(apr: Aprimoramento): number {
  return Object.values(apr).reduce((t, v) => t + Math.max(0, v ?? 0), 0);
}

/**
 * Valida uma distribuição de Aprimoramento. Devolve o motivo da recusa, ou
 * `null` quando está válida. Sem aprimoramento (objeto vazio) é sempre válido:
 * o jogador pode pular.
 */
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

/**
 * PV retroativo por CON par (livro, `01-core-rules.md`): quando a Constituição
 * cruza pra um valor que sobe o modificador, o PV máximo ganha +1 **por nível
 * já atingido**. Devolve o bônus a somar no hpMax, além do PV do nível novo.
 *
 * `nivelNovo` é o nível DEPOIS de subir — o livro conta "por nível já atingido",
 * e o nível recém-ganho já conta.
 */
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
  /** true quando o PE já alcançou o limiar do próximo nível. */
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
 * Faixa de PE do nível **declarado** do personagem.
 *
 * NÃO usar `progresso(pe)` pra isso: aquela função deriva o nível a partir do
 * PE, então o "próximo" que ela devolve está sempre acima do PE atual — a barra
 * ignorava o nível real da ficha e a checagem `pe >= peProximo` nunca podia ser
 * verdadeira. Aqui a âncora é o `nivel` gravado, que é o que a ficha exibe e o
 * que o assistente sobe.
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

/** Progresso 0–100 dentro da faixa do nível declarado. */
export function pctPeDoNivel(nivel: number, pe: number): number {
  const { peBase, peProximo } = faixaPeDoNivel(nivel);
  if (peProximo == null) return 100;
  const vao = peProximo - peBase;
  if (vao <= 0) return 100;
  return Math.max(0, Math.min(100, ((pe - peBase) / vao) * 100));
}
