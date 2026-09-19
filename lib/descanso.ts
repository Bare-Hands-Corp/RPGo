// Regras de descanso (padrão D&D 5e; redução de exaustão confirmada no livro).

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
    resumo: "Recupera o que recarrega em descanso curto. Permite gastar Dados de Vida.",
  },
  {
    slug: "longo",
    nome: "Descanso Longo",
    icone: "fa-bed",
    resumo:
      "PV e PP cheios, PV temporário zera, exaustão −1, metade dos Dados de Vida volta, e recupera tudo que recarrega em descanso curto ou longo.",
  },
];

/** Descanso longo contém um curto. */
export function recuperaNoDescanso(
  gatilho: string | null | undefined,
  tipo: TipoDescanso,
): boolean {
  if (gatilho === "descansoCurto") return true; // vale nos dois
  if (gatilho === "descansoLongo") return tipo === "longo";
  // "manual" e "encontro" têm gatilhos próprios — descanso não mexe.
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
  pvTempPerdido: number;
  exaustaoReduzida: boolean;
  dadosVidaDevolvidos: number;
};

export function descreverDescanso(r: ResumoDescanso): string[] {
  const linhas: string[] = [];
  if (r.pvRestaurado > 0) linhas.push(`+${r.pvRestaurado} PV`);
  if (r.ppRestaurado > 0) linhas.push(`+${r.ppRestaurado} PP`);
  if (r.pvTempPerdido > 0) linhas.push(`${r.pvTempPerdido} PV temporário perdido`);
  if (r.exaustaoReduzida) linhas.push("Exaustão −1");
  if (r.dadosVidaDevolvidos > 0) {
    linhas.push(`${r.dadosVidaDevolvidos} Dado(s) de Vida de volta`);
  }
  if (r.recursos.length > 0) linhas.push(`Recursos: ${r.recursos.join(", ")}`);
  if (r.habilidades.length > 0) linhas.push(`Usos: ${r.habilidades.join(", ")}`);
  return linhas;
}
