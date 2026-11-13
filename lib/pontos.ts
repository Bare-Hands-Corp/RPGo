// Ponto de progressão (PA, PT…): Recurso com `tipo: "ponto"`. O saldo não é gravado:
// ganho por nível até o nível atual + ajustes − custo × rank dos nós das árvores que pagam com ele.

export const NIVEIS_PONTO = 20;

/** CustomEvent<string>: id da árvore pra abrir na aba de árvores. */
export const EVENTO_ABRIR_ARVORE = "rpgo:abrir-arvore";

export function abrirArvore(arvoreId: string) {
  window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_ARVORE, { detail: arvoreId }));
}

export type AjustePonto = { id: string; valor: number; motivo: string; em: string };

/** Ganho passivo de um efeito (alvo `ponto:<id>`), com o nome da fonte. */
export type GanhoDeEfeito = { nome: string; valor: number };

/** Alvo do modificador que soma no ganho de um ponto. */
export const PREFIXO_ALVO_PONTO = "ponto:";

export function alvoDePonto(id: string) {
  return `${PREFIXO_ALVO_PONTO}${id}`;
}

export function pontoDoAlvo(alvo: string): string | null {
  return alvo.startsWith(PREFIXO_ALVO_PONTO) ? alvo.slice(PREFIXO_ALVO_PONTO.length) : null;
}

type PontoBruto = {
  id: string;
  tipo?: string | null;
  ganhoPorNivel?: unknown;
  ajustes?: unknown;
  tetoLivre?: number | null;
  // Vem do agregado de efeitos, posto pela página.
  deEfeitos?: GanhoDeEfeito[];
};

export type ArvoreQuePaga = {
  id: string;
  nome: string;
  icone: string;
  recursoCustoId: string | null;
  nos: { custo: number; rankAtual: number }[];
};

export type GastoNaArvore = { id: string; nome: string; icone: string; talentos: number; gasto: number };

export type SaldoPonto = {
  /** Ganho por nível somado até o nível atual. */
  porNivel: number;
  deEfeitos: GanhoDeEfeito[];
  ajustes: AjustePonto[];
  /** porNivel + efeitos e ajustes positivos. */
  ganhos: number;
  /** Árvores + efeitos e ajustes negativos. */
  gastos: number;
  livres: number;
  arvores: GastoNaArvore[];
  /** Quanto os livres passam do teto; 0 = dentro (ou sem teto). */
  acimaDoTeto: number;
};

export function ehPonto(r: { tipo?: string | null }): boolean {
  return r.tipo === "ponto";
}

function inteiro(v: unknown): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
}

export function lerGanhoPorNivel(v: unknown): number[] {
  const lista = Array.isArray(v) ? v : [];
  return Array.from({ length: NIVEIS_PONTO }, (_, i) => Math.max(0, inteiro(lista[i])));
}

export function lerAjustes(v: unknown): AjustePonto[] {
  if (!Array.isArray(v)) return [];
  const out: AjustePonto[] = [];
  for (const a of v) {
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    const valor = inteiro(o.valor);
    if (!valor || typeof o.id !== "string") continue;
    out.push({
      id: o.id,
      valor,
      motivo: typeof o.motivo === "string" ? o.motivo : "",
      em: typeof o.em === "string" ? o.em : "",
    });
  }
  return out;
}

/** Lista de ajustes com um novo lançado agora (efeito na hora num ponto). */
export function comAjuste(ajustes: unknown, valor: number, motivo: string): AjustePonto[] {
  return [...lerAjustes(ajustes), { id: crypto.randomUUID(), valor, motivo, em: new Date().toISOString() }];
}

export function ganhoAteNivel(ganhoPorNivel: unknown, nivel: number): number {
  return lerGanhoPorNivel(ganhoPorNivel)
    .slice(0, Math.max(0, Math.min(NIVEIS_PONTO, inteiro(nivel))))
    .reduce((t, g) => t + g, 0);
}

export function saldoDoPonto(
  ponto: PontoBruto,
  arvores: ArvoreQuePaga[],
  nivel: number,
): SaldoPonto {
  const porNivel = ganhoAteNivel(ponto.ganhoPorNivel, nivel);
  const deEfeitos = (ponto.deEfeitos ?? []).filter((e) => e.valor);
  const ajustes = lerAjustes(ponto.ajustes);
  const valores = [...deEfeitos, ...ajustes].map((a) => a.valor);
  const mais = valores.filter((v) => v > 0).reduce((t, v) => t + v, 0);
  const menos = valores.filter((v) => v < 0).reduce((t, v) => t - v, 0);

  const gastoArvores: GastoNaArvore[] = arvores
    .filter((a) => a.recursoCustoId === ponto.id)
    .map((a) => ({
      id: a.id,
      nome: a.nome,
      icone: a.icone,
      talentos: a.nos.filter((n) => n.rankAtual > 0).length,
      gasto: a.nos.reduce((t, n) => t + Math.max(0, n.custo) * Math.max(0, n.rankAtual), 0),
    }));
  const naArvore = gastoArvores.reduce((t, a) => t + a.gasto, 0);

  const ganhos = porNivel + mais;
  const gastos = naArvore + menos;
  const livres = ganhos - gastos;
  const teto = ponto.tetoLivre ?? null;
  return {
    porNivel,
    deEfeitos,
    ajustes,
    ganhos,
    gastos,
    livres,
    arvores: gastoArvores,
    acimaDoTeto: teto !== null && livres > teto ? livres - teto : 0,
  };
}

export function saldosDosPontos(
  recursos: PontoBruto[],
  arvores: ArvoreQuePaga[],
  nivel: number,
): Map<string, SaldoPonto> {
  const out = new Map<string, SaldoPonto>();
  for (const r of recursos) if (ehPonto(r)) out.set(r.id, saldoDoPonto(r, arvores, nivel));
  return out;
}

export type PontoAoSubir = {
  id: string;
  nome: string;
  icone: string | null;
  cor: string | null;
  livres: number;
  ganho: number;
  tetoLivre: number | null;
  arvore: { id: string; nome: string } | null;
};

/** O que cada ponto ganha ao passar do `nivel` pro seguinte. */
export function pontosAoSubir(
  recursos: (PontoBruto & { nome: string; icone?: string | null; cor?: string | null })[],
  arvores: ArvoreQuePaga[],
  nivel: number,
): PontoAoSubir[] {
  return recursos.filter(ehPonto).flatMap((r) => {
    const ganho = lerGanhoPorNivel(r.ganhoPorNivel)[nivel] ?? 0;
    if (ganho <= 0) return [];
    const saldo = saldoDoPonto(r, arvores, nivel);
    const arvore = arvores.find((a) => a.recursoCustoId === r.id);
    return [
      {
        id: r.id,
        nome: r.nome,
        icone: r.icone ?? null,
        cor: r.cor ?? null,
        livres: saldo.livres,
        ganho,
        tetoLivre: r.tetoLivre ?? null,
        arvore: arvore ? { id: arvore.id, nome: arvore.nome } : null,
      },
    ];
  });
}

// ─── Modelos ────────────────────────────────────────────────

export type ModeloPonto = {
  slug: string;
  nome: string;
  sub: string;
  campos: {
    nome: string;
    sigla: string;
    icone: string;
    cor: string;
    ganhoPorNivel: number[];
    tetoLivre: number | null;
  };
};

const porNivel = (f: (n: number) => number) =>
  Array.from({ length: NIVEIS_PONTO }, (_, i) => f(i + 1));

export const MODELOS_PONTO: ModeloPonto[] = [
  {
    slug: "ambicao",
    nome: "Ambição",
    sub: "1 no 8º, depois +3 por nível",
    campos: {
      nome: "Pontos de Ambição",
      sigla: "PA",
      icone: "fa-coins",
      cor: "#d4a447",
      ganhoPorNivel: porNivel((n) => (n < 8 ? 0 : n === 8 ? 1 : 3)),
      tetoLivre: 5,
    },
  },
  {
    slug: "treinamento",
    nome: "Treinamento",
    sub: "+3 nos níveis pares até o 10º",
    campos: {
      nome: "Pontos de Treinamento",
      sigla: "PT",
      icone: "fa-dumbbell",
      cor: "#3498db",
      ganhoPorNivel: porNivel((n) => (n % 2 === 0 && n <= 10 ? 3 : 0)),
      tetoLivre: null,
    },
  },
  {
    slug: "branco",
    nome: "Em branco",
    sub: "Do zero",
    campos: {
      nome: "",
      sigla: "",
      icone: "fa-star",
      cor: "",
      ganhoPorNivel: porNivel(() => 0),
      tetoLivre: null,
    },
  },
];

/** Modelo que casa com o nome de um recurso antigo (PA/PT viraram ponto). */
export function modeloPeloNome(nome: string): ModeloPonto {
  const n = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (n === "pa" || n.includes("ambicao")) return MODELOS_PONTO[0];
  if (n === "pt" || n.includes("treinamento")) return MODELOS_PONTO[1];
  return MODELOS_PONTO[2];
}
