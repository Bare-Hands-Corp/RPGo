// Árvores de talento — regras de liberação.
//
// Módulo puro (sem React, sem Prisma): é a fonte única consultada pelo cliente
// (pra pintar o nó e habilitar o botão) e pelo server action (pra validar de
// verdade antes de gravar). Espelha a Árvore de Talentos do Haki do livro
// (`07-haki.md`), mas o modelo é genérico o bastante pros níveis de Estilo de
// Combate e pra qualquer trilha que o jogador queira montar.

export type CriterioArvore = "manual" | "nivel" | "pontos";

export const CRITERIOS_ARVORE: {
  slug: CriterioArvore;
  nome: string;
  dica: string;
  rotuloLimiar: string;
}[] = [
  {
    slug: "manual",
    nome: "Sempre aberta",
    dica: "Todas as camadas liberadas — a árvore é só organização visual.",
    rotuloLimiar: "—",
  },
  {
    slug: "nivel",
    nome: "Nível do personagem",
    dica: "A camada abre quando o personagem atinge o nível. Use pros níveis do Estilo de Combate.",
    rotuloLimiar: "Nível mínimo",
  },
  {
    slug: "pontos",
    nome: "Pontos gastos na árvore",
    dica: "A camada abre pelo total já gasto nesta árvore. É o Estágio do Haki (1–10 / 11–30 / 31+).",
    rotuloLimiar: "Pontos gastos",
  },
];

const CRITERIOS_VALIDOS = new Set<string>(CRITERIOS_ARVORE.map((c) => c.slug));

export function normalizarCriterio(raw: unknown): CriterioArvore {
  const v = typeof raw === "string" ? raw : "";
  return CRITERIOS_VALIDOS.has(v) ? (v as CriterioArvore) : "manual";
}

/** Exige `noId` no rank >= `rank`. Rank 2 = Forma Dominada (✩), 3 = Avançada (★). */
export type RequisitoNo = { noId: string; rank: number };

export type CamadaArvore = {
  id: string;
  nome: string;
  ordem: number;
  limiar: number;
};

export type NoArvore = {
  id: string;
  camadaId: string;
  nome: string;
  descricao: string;
  icone: string;
  custo: number;
  maxRanks: number;
  rankAtual: number;
  nivelMinimo: number;
  habilidadeId: string | null;
  requisitos: unknown;
  ordem: number;
};

export const MAX_RANKS_TETO = 5;

/** Rótulo do rank. O livro chama a 2ª compra de Dominada (✩) e a 3ª de Avançada (★). */
export function rotuloRank(rank: number): string {
  if (rank <= 1) return "Base";
  if (rank === 2) return "Dominada ✩";
  if (rank === 3) return "Avançada ★";
  return `Rank ${rank}`;
}

export function marcaRank(rank: number): string {
  if (rank <= 1) return "";
  if (rank === 2) return "✩";
  if (rank === 3) return "★";
  return `×${rank}`;
}

/** Lê o Json cru de requisitos. Nunca lança — roda no render. */
export function lerRequisitos(raw: unknown): RequisitoNo[] {
  if (!Array.isArray(raw)) return [];
  const out: RequisitoNo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.noId !== "string" || !o.noId) continue;
    const rank = Math.trunc(Number(o.rank) || 1);
    out.push({ noId: o.noId, rank: Math.max(1, Math.min(rank, MAX_RANKS_TETO)) });
  }
  return out;
}

/** Total já investido na árvore — soma custo × rank de cada nó. */
export function pontosGastos(nos: NoArvore[]): number {
  return nos.reduce((tot, n) => tot + Math.max(0, n.custo) * Math.max(0, n.rankAtual), 0);
}

export type ContextoArvore = {
  criterio: CriterioArvore;
  nivelPersonagem: number;
  nos: NoArvore[];
  /** Saldo do recurso que paga os nós. null = custo é só informativo. */
  saldoRecurso: number | null;
};

/**
 * Camadas abertas, na ordem. Em "manual" todas abrem; nos outros critérios a
 * camada abre quando o valor corrente (nível ou pontos gastos) alcança o limiar.
 *
 * Monotônico de propósito: se a camada 3 abriu, as anteriores também estão
 * abertas mesmo que alguém tenha digitado limiares fora de ordem.
 */
export function camadasAbertas(
  camadas: CamadaArvore[],
  ctx: ContextoArvore,
): Set<string> {
  const ordenadas = [...camadas].sort((a, b) => a.ordem - b.ordem);
  if (ctx.criterio === "manual") return new Set(ordenadas.map((c) => c.id));

  const valor =
    ctx.criterio === "nivel" ? ctx.nivelPersonagem : pontosGastos(ctx.nos);

  const abertas = new Set<string>();
  let ultimaAberta = -1;
  ordenadas.forEach((c, i) => {
    if (valor >= c.limiar) {
      abertas.add(c.id);
      ultimaAberta = i;
    }
  });
  // Preenche buracos abaixo da última aberta.
  for (let i = 0; i < ultimaAberta; i++) abertas.add(ordenadas[i].id);
  return abertas;
}

export type EstadoNo = {
  /** rank atual, 0 = não comprado */
  rank: number;
  comprado: boolean;
  /** rank que uma compra agora concederia (rank + 1), ou null se está no teto */
  proximoRank: number | null;
  custoProximo: number;
  podeComprar: boolean;
  /** Por que NÃO pode comprar. Vazio quando `podeComprar` é true. */
  bloqueios: string[];
};

/**
 * Avalia um nó. Regras, na ordem em que aparecem pro jogador:
 *
 * 1. Rank abaixo do teto (`maxRanks`).
 * 2. Camada do nó aberta.
 * 3. Nível do personagem >= `nivelMinimo`.
 * 4. Todo requisito satisfeito (nó pai no rank exigido).
 * 5. **Rank extra exige a próxima camada** — comprar o rank N pede a camada de
 *    índice N−1 aberta. É a regra do livro: Forma Dominada exige Estágio
 *    Treinado (2ª camada), Avançada exige Perito (3ª). Nó de rank único
 *    (`maxRanks: 1`) nunca é afetado.
 * 6. Saldo do recurso cobre o custo (quando a árvore tem recurso de custo).
 */
export function estadoNo(
  no: NoArvore,
  camadas: CamadaArvore[],
  ctx: ContextoArvore,
): EstadoNo {
  const rank = Math.max(0, no.rankAtual);
  const maxRanks = Math.max(1, no.maxRanks);
  const noTeto = rank >= maxRanks;
  const proximoRank = noTeto ? null : rank + 1;
  const custoProximo = Math.max(0, no.custo);

  const bloqueios: string[] = [];
  const ordenadas = [...camadas].sort((a, b) => a.ordem - b.ordem);
  const abertas = camadasAbertas(ordenadas, ctx);

  if (noTeto) {
    return { rank, comprado: rank > 0, proximoRank: null, custoProximo, podeComprar: false, bloqueios };
  }

  const propria = ordenadas.find((c) => c.id === no.camadaId);
  if (propria && !abertas.has(propria.id)) {
    bloqueios.push(`Camada "${propria.nome}" ainda fechada`);
  }

  if (no.nivelMinimo > 0 && ctx.nivelPersonagem < no.nivelMinimo) {
    bloqueios.push(`Exige nível ${no.nivelMinimo}`);
  }

  const porId = new Map(ctx.nos.map((n) => [n.id, n]));
  for (const req of lerRequisitos(no.requisitos)) {
    const pai = porId.get(req.noId);
    if (!pai) continue; // requisito apontando pra nó apagado — ignora
    if (pai.rankAtual < req.rank) {
      const marca = marcaRank(req.rank);
      bloqueios.push(`Exige ${pai.nome}${marca ? ` ${marca}` : ""}`);
    }
  }

  // Regra 5 — rank extra puxa a camada seguinte.
  if (proximoRank && proximoRank > 1) {
    const exigida = ordenadas[proximoRank - 1];
    if (!exigida) {
      bloqueios.push(`${rotuloRank(proximoRank)} exige uma camada ${proximoRank}ª que a árvore não tem`);
    } else if (!abertas.has(exigida.id)) {
      bloqueios.push(`${rotuloRank(proximoRank)} exige "${exigida.nome}"`);
    }
  }

  if (ctx.saldoRecurso !== null && custoProximo > ctx.saldoRecurso) {
    bloqueios.push(`Saldo insuficiente (custa ${custoProximo})`);
  }

  return {
    rank,
    comprado: rank > 0,
    proximoRank,
    custoProximo,
    podeComprar: bloqueios.length === 0,
    bloqueios,
  };
}

/**
 * Nós que dependem deste (direta ou indiretamente) e já estão comprados num
 * rank que deixaria de ser válido se este nó caísse pra `rankAlvo`. Usado pra
 * impedir devolução que quebraria a árvore.
 */
export function dependentesQuebrados(
  noId: string,
  rankAlvo: number,
  nos: NoArvore[],
): NoArvore[] {
  return nos.filter((n) => {
    if (n.id === noId || n.rankAtual <= 0) return false;
    return lerRequisitos(n.requisitos).some(
      (r) => r.noId === noId && r.rank > rankAlvo,
    );
  });
}

/**
 * IDs de habilidade que estão TRAVADAS por um nó não comprado. A ficha filtra
 * essas habilidades antes de agregar efeitos — nó travado não concede nada.
 *
 * Uma habilidade ligada a vários nós é liberada se QUALQUER um deles estiver
 * comprado (o jogador pode ter dois caminhos pro mesmo talento).
 */
export function habilidadesTravadas(nos: NoArvore[]): Set<string> {
  const travadas = new Set<string>();
  const liberadas = new Set<string>();
  for (const n of nos) {
    if (!n.habilidadeId) continue;
    if (n.rankAtual > 0) liberadas.add(n.habilidadeId);
    else travadas.add(n.habilidadeId);
  }
  for (const id of liberadas) travadas.delete(id);
  return travadas;
}
