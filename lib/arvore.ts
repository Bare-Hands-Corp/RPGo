// Regras de liberação das árvores de talento. Usado no cliente e revalidado no server.

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

/** Exige `noId` no rank >= `rank`. 2 = Dominada (✩), 3 = Avançada (★). */
export type RequisitoNo = { noId: string; rank: number };

export type RamoArvore = {
  id: string;
  nome: string;
  ordem: number;
};

export type CamadaArvore = {
  id: string;
  nome: string;
  ordem: number;
  limiar: number;
};

export type NoArvore = {
  id: string;
  camadaId: string;
  /** null = primeira raia. */
  ramoId: string | null;
  /** Altura dentro da faixa da camada, 0–100 (%). */
  offsetY: number;
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

/** Nunca lança: roda no render. */
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
 * Monotônico: se uma camada abriu, as anteriores também.
 * Em "pontos" a 1ª abre sempre, senão a árvore nunca sai do zero.
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
  let ultimaAberta = ctx.criterio === "pontos" && ordenadas.length > 0 ? 0 : -1;
  if (ultimaAberta === 0) abertas.add(ordenadas[0].id);
  ordenadas.forEach((c, i) => {
    if (valor >= c.limiar) {
      abertas.add(c.id);
      ultimaAberta = i;
    }
  });
  for (let i = 0; i < ultimaAberta; i++) abertas.add(ordenadas[i].id);
  return abertas;
}

export type EstadoNo = {
  /** rank atual, 0 = não comprado */
  rank: number;
  comprado: boolean;
  proximoRank: number | null;
  custoProximo: number;
  podeComprar: boolean;
  bloqueios: string[];
};

/**
 * Regras na ordem: teto de rank, camada aberta, nível mínimo, requisitos,
 * rank extra exige a camada seguinte (rank N pede a camada N−1) e saldo do recurso.
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

/** Dependentes comprados que ficariam inválidos se este nó caísse pra `rankAlvo`. */
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

/** Vazio = pode devolver. Bloqueia por requisito de filho ou camada que fecharia com talento dentro. */
export function bloqueiosDevolver(
  noId: string,
  camadas: CamadaArvore[],
  ctx: ContextoArvore,
): string[] {
  const no = ctx.nos.find((n) => n.id === noId);
  if (!no || no.rankAtual <= 0) return ["Esse talento não está comprado."];
  const rankAlvo = no.rankAtual - 1;

  const bloqueios = dependentesQuebrados(noId, rankAlvo, ctx.nos).map(
    (d) => `${d.nome} depende deste talento`,
  );

  const depois = ctx.nos.map((n) => (n.id === noId ? { ...n, rankAtual: rankAlvo } : n));
  const ordenadas = [...camadas].sort((a, b) => a.ordem - b.ordem);
  const abertasAntes = camadasAbertas(ordenadas, ctx);
  const abertasDepois = camadasAbertas(ordenadas, { ...ctx, nos: depois });
  // Só conta camada que esta devolução fecha, não inconsistência antiga.
  const fecha = (id: string) => abertasAntes.has(id) && !abertasDepois.has(id);

  for (const n of depois) {
    if (n.rankAtual <= 0) continue;
    const propria = ordenadas.find((c) => c.id === n.camadaId);
    if (propria && fecha(propria.id)) {
      bloqueios.push(`${n.nome} ficaria em "${propria.nome}", que fecharia`);
      continue;
    }
    const exigida = n.rankAtual > 1 ? ordenadas[n.rankAtual - 1] : null;
    if (exigida && fecha(exigida.id)) {
      bloqueios.push(`${n.nome} ${marcaRank(n.rankAtual)} exige "${exigida.nome}", que fecharia`);
    }
  }
  return bloqueios;
}

/** Habilidade ligada a vários nós fica liberada se qualquer um estiver comprado. */
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

// ─── Fio de progresso ──────────────────────────────────────
// Liga os talentos comprados: segue o requisito quando existe, senão o comprado
// mais próximo antes dele na leitura.

export type PontoCanvas = { x: number; y: number };

export type LigacaoFio = {
  deId: string;
  paraId: string;
  /** true = segue uma linha de requisito; false = ligação só visual. */
  porRequisito: boolean;
};

/** Nó sem posição (camada recolhida) fica fora do fio. */
export function fioDeProgresso(
  nos: NoArvore[],
  camadas: CamadaArvore[],
  posicoes: Map<string, PontoCanvas>,
): LigacaoFio[] {
  const ordemCamada = new Map(
    [...camadas].sort((a, b) => a.ordem - b.ordem).map((c, i) => [c.id, i]),
  );
  const comprados = nos
    .filter((n) => n.rankAtual > 0 && posicoes.has(n.id))
    .sort(
      (a, b) =>
        (ordemCamada.get(a.camadaId) ?? 0) - (ordemCamada.get(b.camadaId) ?? 0) ||
        a.offsetY - b.offsetY ||
        posicoes.get(a.id)!.x - posicoes.get(b.id)!.x,
    );
  const idsComprados = new Set(comprados.map((n) => n.id));

  // Union-find garante fio conexo mesmo com requisito apontando pra baixo.
  const pai = new Map(comprados.map((n) => [n.id, n.id]));
  const raiz = (id: string): string => {
    let r = id;
    while (pai.get(r) !== r) r = pai.get(r)!;
    pai.set(id, r);
    return r;
  };
  const unir = (a: string, b: string) => pai.set(raiz(a), raiz(b));

  const out: LigacaoFio[] = [];
  for (const no of comprados) {
    for (const r of lerRequisitos(no.requisitos)) {
      if (!idsComprados.has(r.noId)) continue;
      out.push({ deId: r.noId, paraId: no.id, porRequisito: true });
      unir(r.noId, no.id);
    }
  }

  const anteriores: NoArvore[] = [];
  for (const no of comprados) {
    const p = posicoes.get(no.id)!;
    let melhor: NoArvore | null = null;
    let melhorDist = Infinity;
    for (const a of anteriores) {
      if (raiz(a.id) === raiz(no.id)) continue;
      const q = posicoes.get(a.id)!;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < melhorDist) {
        melhorDist = d;
        melhor = a;
      }
    }
    if (melhor) {
      out.push({ deId: melhor.id, paraId: no.id, porRequisito: false });
      unir(melhor.id, no.id);
    }
    anteriores.push(no);
  }
  return out;
}

// ─── Presets de árvore ─────────────────────────────────────

export type PresetArvore = {
  slug: string;
  nome: string;
  dica: string;
  icone: string;
  criterio: CriterioArvore;
  camadas: { nome: string; limiar: number }[];
  ramos: string[];
};

export const PRESETS_ARVORE: PresetArvore[] = [
  {
    slug: "haki",
    nome: "Haki",
    dica: "Estágios por PA gasto (1–10 / 11–30 / 31+) e raias Ofensivo/Defensivo, como a Árvore de Talentos do livro.",
    icone: "fa-eye",
    criterio: "pontos",
    camadas: [
      { nome: "Inexperiente", limiar: 1 },
      { nome: "Treinado", limiar: 11 },
      { nome: "Perito", limiar: 31 },
    ],
    ramos: ["Ofensivo", "Defensivo"],
  },
  {
    slug: "estilo",
    nome: "Estilo de Combate",
    dica: "Uma camada por nível-chave (1, 4, 8, 12, 16, 19) destravada pelo nível do personagem.",
    icone: "fa-fist-raised",
    criterio: "nivel",
    camadas: [
      { nome: "Nível 1", limiar: 1 },
      { nome: "Nível 4", limiar: 4 },
      { nome: "Nível 8", limiar: 8 },
      { nome: "Nível 12", limiar: 12 },
      { nome: "Nível 16", limiar: 16 },
      { nome: "Nível 19", limiar: 19 },
    ],
    ramos: [],
  },
  {
    slug: "vazia",
    nome: "Em branco",
    dica: "Uma camada só, sem raia e sem trava. Monte do zero.",
    icone: "fa-sitemap",
    criterio: "manual",
    camadas: [{ nome: "Camada 1", limiar: 0 }],
    ramos: [],
  },
];

export function acharPreset(slug: unknown): PresetArvore {
  const achado = PRESETS_ARVORE.find((p) => p.slug === slug);
  return achado ?? PRESETS_ARVORE[PRESETS_ARVORE.length - 1];
}

// Margem pro card (ancorado no centro) não invadir as faixas vizinhas.
export const OFFSET_MIN = 12;
export const OFFSET_MAX = 88;

export function clampOffsetY(y: number): number {
  if (!Number.isFinite(y)) return 50;
  return Math.round(Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, y)));
}

/** Empurra o nó pra baixo quando cai em cima de outro na mesma raia. */
export function evitarSobreposicao(
  noId: string,
  camadaId: string,
  ramoId: string | null,
  offsetY: number,
  nos: NoArvore[],
  ramoPadrao: string | null,
): number {
  const vizinhos = nos.filter(
    (n) =>
      n.id !== noId &&
      n.camadaId === camadaId &&
      (n.ramoId ?? ramoPadrao) === (ramoId ?? ramoPadrao),
  );
  let y = clampOffsetY(offsetY);
  for (let i = 0; i < 8; i++) {
    const colide = vizinhos.some((n) => Math.abs(n.offsetY - y) < 9);
    if (!colide) break;
    y = y + 10 > OFFSET_MAX ? Math.max(OFFSET_MIN, y - 10) : y + 10;
  }
  return clampOffsetY(y);
}
