// ─────────────────────────────────────────────────────────────────────────────
// Embarcações (OP RPG, cap. 14)
//
// O navio guarda só as ESCOLHAS (tamanho, madeira) e os valores mutáveis
// (PV atual, velocidade, nº de canhões). Tudo o mais é DERIVADO destas tabelas
// do livro — não duplicamos no banco pra não dessincronizar. As funções
// `statsTamanho`/`statsMadeira` toleram slug inválido caindo no default.
// ─────────────────────────────────────────────────────────────────────────────

export type TamanhoNavio = "pequeno" | "medio" | "grande" | "enorme" | "colossal";
export type MadeiraNavio = "cedro" | "carvalho" | "cerejeira" | "adam";

// Características gerais por tamanho (cap. 14.1). "comodos"/"tripulantes"/
// "canhoesMax" são tetos ("até N"); desaceleracaoNos é negativo.
export type StatsTamanho = {
  slug: TamanhoNavio;
  nome: string;
  dimensao: string; // L×C×A em metros
  deques: number;
  comodos: number;
  tripulantes: number;
  canhoesMax: number;
  pvMax: number;
  desaceleracaoNos: number;
};

export const TAMANHOS_NAVIO: StatsTamanho[] = [
  { slug: "pequeno", nome: "Pequeno", dimensao: "6×15×18 m", deques: 1, comodos: 3, tripulantes: 10, canhoesMax: 4, pvMax: 150, desaceleracaoNos: -2 },
  { slug: "medio", nome: "Médio", dimensao: "15×36×39 m", deques: 2, comodos: 10, tripulantes: 50, canhoesMax: 10, pvMax: 300, desaceleracaoNos: -10 },
  { slug: "grande", nome: "Grande", dimensao: "24×51×54 m", deques: 3, comodos: 26, tripulantes: 130, canhoesMax: 15, pvMax: 500, desaceleracaoNos: -20 },
  { slug: "enorme", nome: "Enorme", dimensao: "36×72×75 m", deques: 4, comodos: 48, tripulantes: 240, canhoesMax: 25, pvMax: 750, desaceleracaoNos: -30 },
  { slug: "colossal", nome: "Colossal", dimensao: "48×120×90 m", deques: 5, comodos: 90, tripulantes: 450, canhoesMax: 45, pvMax: 1000, desaceleracaoNos: -40 },
];

// Madeiras (cap. 14.4) — a predominante (80%+) define CR e Bônus de Resistência.
export type StatsMadeira = {
  slug: MadeiraNavio;
  nome: string;
  cr: number;
  br: number; // reduz todo dano recebido
  precoPeca: number; // ฿
};

export const MADEIRAS_NAVIO: StatsMadeira[] = [
  { slug: "cedro", nome: "Cedro", cr: 10, br: 5, precoPeca: 30000 },
  { slug: "carvalho", nome: "Carvalho", cr: 12, br: 10, precoPeca: 80000 },
  { slug: "cerejeira", nome: "Cerejeira", cr: 15, br: 15, precoPeca: 150000 },
  { slug: "adam", nome: "Adam", cr: 18, br: 30, precoPeca: 400000 },
];

export const TAMANHOS_VALIDOS = new Set<string>(TAMANHOS_NAVIO.map((t) => t.slug));
export const MADEIRAS_VALIDAS = new Set<string>(MADEIRAS_NAVIO.map((m) => m.slug));

export function statsTamanho(slug: string): StatsTamanho {
  return TAMANHOS_NAVIO.find((t) => t.slug === slug) ?? TAMANHOS_NAVIO[0];
}

export function statsMadeira(slug: string): StatsMadeira {
  return MADEIRAS_NAVIO.find((m) => m.slug === slug) ?? MADEIRAS_NAVIO[0];
}
