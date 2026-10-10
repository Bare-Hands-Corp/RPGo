// Regras de descanso (cap. 11 do livro).

export type TipoDescanso = "curto" | "longo";

export const TIPOS_DESCANSO: {
  slug: TipoDescanso;
  nome: string;
  icone: string;
  resumo: string;
}[] = [
  {
    slug: "curto",
    nome: "Descanso Curto",
    icone: "fa-mug-hot",
    resumo:
      "Recupera o que recarrega por encontro ou em descanso curto. Permite gastar Dados de Vida.",
  },
  {
    slug: "longo",
    nome: "Descanso Longo",
    icone: "fa-bed",
    resumo:
      "PV e PP cheios (com exaustão, só metade do PP), PV temporário zera, exaustão −1, metade dos Dados de Vida volta, e recupera tudo que recarrega por encontro ou em descanso.",
  },
];

/** PP ao fim do descanso longo: cheio, ou metade do máximo se estava exausto. */
export function ppDoDescansoLongo(atual: number, max: number, exaustao: number): number {
  if (exaustao <= 0) return max;
  return Math.min(max, atual + Math.floor(max / 2));
}

/** Descanso longo contém um curto; o que volta a cada encontro volta nos dois. */
export function recuperaNoDescanso(
  gatilho: string | null | undefined,
  tipo: TipoDescanso,
): boolean {
  if (gatilho === "descansoCurto" || gatilho === "encontro") return true;
  if (gatilho === "descansoLongo") return tipo === "longo";
  return false;
}

/** Metade dos Dados de Vida (mín. 1), sem passar do que foi gasto. */
export function dadosVidaRecuperados(nivel: number, gastos: number): number {
  if (gastos <= 0) return 0;
  const metade = Math.max(1, Math.floor(Math.max(0, nivel) / 2));
  return Math.min(metade, gastos);
}

export function facesDadoVida(tipo: string | null | undefined): number {
  const n = Number(String(tipo ?? "").replace(/^d/i, ""));
  return Number.isFinite(n) && n > 0 ? n : 8;
}

export type ResumoDescanso = {
  tipo: TipoDescanso;
  recursos: string[];
  habilidades: string[];
  pvRestaurado: number;
  ppRestaurado: number;
  ppPelaMetade: boolean;
  pvTempPerdido: number;
  exaustaoRecuperada: number;
  dadosVidaDevolvidos: number;
};

export function descreverDescanso(r: ResumoDescanso): string[] {
  const linhas: string[] = [];
  if (r.pvRestaurado > 0) linhas.push(`+${r.pvRestaurado} PV`);
  if (r.ppRestaurado > 0) {
    linhas.push(`+${r.ppRestaurado} PP${r.ppPelaMetade ? " (metade, por exaustão)" : ""}`);
  }
  if (r.pvTempPerdido > 0) linhas.push(`${r.pvTempPerdido} PV temporário perdido`);
  if (r.exaustaoRecuperada > 0) linhas.push(`Exaustão −${r.exaustaoRecuperada}`);
  if (r.dadosVidaDevolvidos > 0) {
    linhas.push(`${r.dadosVidaDevolvidos} Dado(s) de Vida de volta`);
  }
  if (r.recursos.length > 0) linhas.push(`Recursos: ${r.recursos.join(", ")}`);
  if (r.habilidades.length > 0) linhas.push(`Usos: ${r.habilidades.join(", ")}`);
  return linhas;
}
