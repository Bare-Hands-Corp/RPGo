// Pacote: habilidades, ações, árvores e itens exportados por código, pra outro usuário importar.
// Puro (cliente e servidor).

import { MAX_RANKS_TETO, lerRequisitos, type CamadaArvore, type NoArvore, type RamoArvore } from "./arvore";
import { doModelo, mesmoNome, paraModelo, recursosDoModelo, type RecursoRef } from "./pastas";
import { ehPonto, lerGanhoPorNivel } from "./pontos";

export const MAX_NOME_PACOTE = 60;
export const MAX_PACOTES = 50;
export const MAX_ITENS_PACOTE = 100;
export const MAX_ARVORES_PACOTE = 10;
export const MAX_NOS_ARVORE = 300;

export type ItemPacote = { ref: string; dados: Record<string, unknown> };

// `habilidades` e `formaDe` apontam pra refs do próprio pacote.
export type HabilidadePacote = ItemPacote & { formaDe?: string };
export type AcaoPacote = ItemPacote & { habilidades: string[]; formaDe?: string };

// Camada, ramo e requisitos apontam pra posição nas listas da árvore.
export type NoPacote = {
  camada: number;
  ramo: number | null;
  coluna: number;
  linha: number;
  nome: string;
  descricao: string;
  icone: string;
  custo: number;
  maxRanks: number;
  nivelMinimo: number;
  habilidade: string | null;
  requisitos: { no: number; rank: number }[];
};

export type ArvorePacote = {
  ref: string;
  nome: string;
  icone: string;
  cor: string | null;
  cor2: string | null;
  efeito: string;
  criterio: string;
  recursoCusto: string | null;
  fundoUrl: string | null;
  camadas: { nome: string; limiar: number }[];
  ramos: { nome: string }[];
  nos: NoPacote[];
};

export type RecursoPacote = {
  nome: string;
  valorMax: number;
  valorMaxFormula: string | null;
  cor: string | null;
  cor2: string | null;
  efeito: string;
  resetEm: string;
  // Ponto (lib/pontos.ts): vai sem os ajustes, que são da ficha.
  tipo?: string;
  sigla?: string | null;
  icone?: string | null;
  ganhoPorNivel?: number[];
  tetoLivre?: number | null;
};

export type PacoteDados = {
  versao: 1;
  // Personagem de onde saiu.
  de: string;
  habilidades: HabilidadePacote[];
  acoes: AcaoPacote[];
  arvores: ArvorePacote[];
  itens: ItemPacote[];
  // Recursos próprios que o conteúdo cita.
  recursos: RecursoPacote[];
};

export type PacoteView = {
  id: string;
  codigo: string;
  nome: string;
  habilidades: number;
  acoes: number;
  arvores: number;
  itens: number;
};

export type Escolha = { habilidades: string[]; acoes: string[]; arvores: string[]; itens: string[] };

// ─── Código ────────────────────────────────────────────────

// Sem 0, 1, I, L e O, que se confundem, e sem H, a letra do prefixo.
const ALFABETO = "23456789ABCDEFGJKMNPQRSTUVWXYZ";
const PREFIXO_CODIGO = "HR";
const TAMANHO_CODIGO = 6;

// `sorteio(n)` devolve um inteiro de 0 a n − 1.
export function novoCodigo(sorteio: (n: number) => number): string {
  let corpo = "";
  for (let i = 0; i < TAMANHO_CODIGO; i++) corpo += ALFABETO[sorteio(ALFABETO.length)];
  return `${PREFIXO_CODIGO}-${corpo}`;
}

// "hr 7k2qx9" ou "7K2QX9" → "HR-7K2QX9"; null se não for um código.
export function lerCodigo(raw: unknown): string | null {
  const limpo = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const corpo = limpo.startsWith(PREFIXO_CODIGO) ? limpo.slice(PREFIXO_CODIGO.length) : limpo;
  if (corpo.length !== TAMANHO_CODIGO) return null;
  for (const c of corpo) if (!ALFABETO.includes(c)) return null;
  return `${PREFIXO_CODIGO}-${corpo}`;
}

export function nomeDoPacote(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NOME_PACOTE);
}

// ─── Exportar ──────────────────────────────────────────────

type Linha = Record<string, unknown> & { id: string };

export type ArvoreDaFicha = {
  id: string;
  nome: string;
  icone: string;
  cor: string | null;
  cor2: string | null;
  efeito: string;
  criterio: string;
  recursoCustoId: string | null;
  fundoUrl: string | null;
  camadas: CamadaArvore[];
  ramos: RamoArvore[];
  nos: NoArvore[];
};

const porOrdem = (a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem;

function lerIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string" && v !== "") : [];
}

// Linhas da ficha → conteúdo do pacote, sem ids nem progresso.
export function montarPacote(origem: {
  de: string;
  habilidades: Linha[];
  acoes: Linha[];
  arvores: ArvoreDaFicha[];
  itens?: Linha[];
  recursos: (Omit<RecursoPacote, "ganhoPorNivel"> & { id: string; ganhoPorNivel?: unknown })[];
}): PacoteDados {
  const refHabilidade = new Map(origem.habilidades.map((h, i) => [h.id, `h${i}`]));
  const refAcao = new Map(origem.acoes.map((a, i) => [a.id, `a${i}`]));

  const habilidades = origem.habilidades.map((h, i) => {
    const forma = typeof h.formaDe === "string" ? refHabilidade.get(h.formaDe) : undefined;
    return {
      ref: `h${i}`,
      dados: paraModelo("habilidade", h, origem.recursos),
      ...(forma ? { formaDe: forma } : {}),
    };
  });

  const acoes = origem.acoes.map((a, i) => {
    const forma = typeof a.formaDe === "string" ? refAcao.get(a.formaDe) : undefined;
    return {
      ref: `a${i}`,
      dados: paraModelo("acao", a, origem.recursos),
      habilidades: lerIds(a.habilidadeIds)
        .map((id) => refHabilidade.get(id))
        .filter((ref): ref is string => ref !== undefined),
      ...(forma ? { formaDe: forma } : {}),
    };
  });

  const arvores = origem.arvores.map((a, i) => {
    const camadas = [...a.camadas].sort(porOrdem);
    const ramos = [...a.ramos].sort(porOrdem);
    const posCamada = new Map(camadas.map((c, n) => [c.id, n]));
    const posRamo = new Map(ramos.map((r, n) => [r.id, n]));
    const nos = [...a.nos].sort(porOrdem).filter((n) => posCamada.has(n.camadaId));
    const posNo = new Map(nos.map((n, k) => [n.id, k]));
    return {
      ref: `t${i}`,
      nome: a.nome,
      icone: a.icone,
      cor: a.cor,
      cor2: a.cor2,
      efeito: a.efeito,
      criterio: a.criterio,
      recursoCusto: origem.recursos.find((r) => r.id === a.recursoCustoId)?.nome ?? null,
      fundoUrl: a.fundoUrl,
      camadas: camadas.map((c) => ({ nome: c.nome, limiar: c.limiar })),
      ramos: ramos.map((r) => ({ nome: r.nome })),
      nos: nos.map((n) => ({
        camada: posCamada.get(n.camadaId) as number,
        ramo: n.ramoId ? (posRamo.get(n.ramoId) ?? null) : null,
        coluna: n.coluna,
        linha: n.linha,
        nome: n.nome,
        descricao: n.descricao,
        icone: n.icone,
        custo: n.custo,
        maxRanks: n.maxRanks,
        nivelMinimo: n.nivelMinimo,
        habilidade: n.habilidadeId ? (refHabilidade.get(n.habilidadeId) ?? null) : null,
        requisitos: lerRequisitos(n.requisitos).flatMap((r) => {
          const no = posNo.get(r.noId);
          return no === undefined ? [] : [{ no, rank: r.rank }];
        }),
      })),
    };
  });

  const itens = (origem.itens ?? []).map((item, i) => ({
    ref: `i${i}`,
    dados: paraModelo("item", item, origem.recursos),
  }));

  const citados = recursosCitados({ habilidades, acoes, arvores, itens });
  const recursos = origem.recursos
    .filter((r) => citados.some((nome) => mesmoNome(nome, r.nome)))
    .map((r) => ({
      nome: r.nome,
      valorMax: r.valorMax,
      valorMaxFormula: r.valorMaxFormula,
      cor: r.cor,
      cor2: r.cor2,
      efeito: r.efeito,
      resetEm: r.resetEm,
      ...(ehPonto(r)
        ? {
            tipo: "ponto",
            sigla: r.sigla ?? null,
            icone: r.icone ?? null,
            ganhoPorNivel: lerGanhoPorNivel(r.ganhoPorNivel),
            tetoLivre: r.tetoLivre ?? null,
          }
        : {}),
    }));

  return { versao: 1, de: origem.de, habilidades, acoes, arvores, itens, recursos };
}

function recursosCitados(conteudo: Pick<PacoteDados, "habilidades" | "acoes" | "arvores" | "itens">): string[] {
  return [
    ...conteudo.habilidades.flatMap((h) => recursosDoModelo(h.dados)),
    ...conteudo.acoes.flatMap((a) => recursosDoModelo(a.dados)),
    ...conteudo.itens.flatMap((i) => recursosDoModelo(i.dados)),
    ...conteudo.arvores.flatMap((a) => (a.recursoCusto ? [a.recursoCusto] : [])),
  ];
}

// ─── Ler ───────────────────────────────────────────────────

const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const lista = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);

const texto = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

const textoOuNulo = (v: unknown, max: number): string | null => texto(v, max) || null;

const inteiro = (v: unknown, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.trunc(Number(v) || 0)));

function lerItem(raw: unknown): ItemPacote | null {
  const o = objeto(raw);
  const dados = objeto(o?.dados);
  const ref = texto(o?.ref, 12);
  return o && dados && ref && texto(dados.nome, 200).trim() ? { ref, dados } : null;
}

function lerArvore(raw: unknown): ArvorePacote | null {
  const o = objeto(raw);
  const ref = texto(o?.ref, 12);
  const nome = texto(o?.nome, 60).trim();
  if (!o || !ref || !nome) return null;
  const camadas = lista(o.camadas, 40).map((c) => ({
    nome: texto(objeto(c)?.nome, 40),
    limiar: inteiro(objeto(c)?.limiar, 0, 9999),
  }));
  if (camadas.length === 0) return null;
  const ramos = lista(o.ramos, 20).map((r) => ({ nome: texto(objeto(r)?.nome, 40) }));
  const brutos = lista(o.nos, MAX_NOS_ARVORE);
  const nos = brutos.flatMap((bruto, i): NoPacote[] => {
    const n = objeto(bruto);
    const nomeNo = texto(n?.nome, 60).trim();
    const camada = inteiro(n?.camada, 0, 9999);
    if (!n || !nomeNo || camada >= camadas.length) return [];
    const ramo = n.ramo === null || n.ramo === undefined ? null : inteiro(n.ramo, 0, 9999);
    return [
      {
        camada,
        ramo: ramo !== null && ramo < ramos.length ? ramo : null,
        coluna: inteiro(n.coluna, 0, 99),
        linha: inteiro(n.linha, 0, 99),
        nome: nomeNo,
        descricao: texto(n.descricao, 4000),
        icone: texto(n.icone, 40),
        custo: inteiro(n.custo, 0, 9999),
        maxRanks: inteiro(n.maxRanks, 1, MAX_RANKS_TETO),
        nivelMinimo: inteiro(n.nivelMinimo, 0, 999),
        habilidade: textoOuNulo(n.habilidade, 12),
        requisitos: lista(n.requisitos, 20).flatMap((r) => {
          const req = objeto(r);
          const no = Number(req?.no);
          return Number.isInteger(no) && no >= 0 && no < brutos.length && no !== i
            ? [{ no, rank: inteiro(req?.rank, 1, MAX_RANKS_TETO) }]
            : [];
        }),
      },
    ];
  });
  // Nó descartado muda as posições: requisito só vale com a lista inteira.
  const inteira = nos.length === brutos.length;
  return {
    ref,
    nome,
    icone: texto(o.icone, 40),
    cor: textoOuNulo(o.cor, 40),
    cor2: textoOuNulo(o.cor2, 40),
    efeito: texto(o.efeito, 20),
    criterio: texto(o.criterio, 20),
    recursoCusto: textoOuNulo(o.recursoCusto, 80),
    fundoUrl: textoOuNulo(o.fundoUrl, 500),
    camadas,
    ramos,
    nos: inteira ? nos : nos.map((n) => ({ ...n, requisitos: [] })),
  };
}

// Conteúdo salvo → pacote. Nunca lança: o que não fecha fica de fora.
export function lerPacote(raw: unknown): PacoteDados {
  const o = objeto(raw) ?? {};
  const semNulos = <T>(itens: (T | null)[]) => itens.filter((x): x is T => x !== null);
  return {
    versao: 1,
    de: texto(o.de, 80),
    habilidades: semNulos(
      lista(o.habilidades, MAX_ITENS_PACOTE).map((raw): HabilidadePacote | null => {
        const item = lerItem(raw);
        if (!item) return null;
        const formaDe = texto(objeto(raw)?.formaDe, 12);
        return { ...item, ...(formaDe ? { formaDe } : {}) };
      }),
    ),
    acoes: semNulos(
      lista(o.acoes, MAX_ITENS_PACOTE).map((raw): AcaoPacote | null => {
        const item = lerItem(raw);
        const a = objeto(raw);
        if (!item || !a) return null;
        const formaDe = texto(a.formaDe, 12);
        return {
          ...item,
          habilidades: lista(a.habilidades, 20).filter((r): r is string => typeof r === "string"),
          ...(formaDe ? { formaDe } : {}),
        };
      }),
    ),
    arvores: semNulos(lista(o.arvores, MAX_ARVORES_PACOTE).map(lerArvore)),
    itens: semNulos(lista(o.itens, MAX_ITENS_PACOTE).map(lerItem)),
    recursos: lista(o.recursos, 60).flatMap((raw) => {
      const r = objeto(raw);
      const nome = texto(r?.nome, 80).trim();
      if (!r || !nome) return [];
      return [
        {
          nome,
          valorMax: inteiro(r.valorMax, 0, 99999),
          valorMaxFormula: textoOuNulo(r.valorMaxFormula, 60),
          cor: textoOuNulo(r.cor, 40),
          cor2: textoOuNulo(r.cor2, 40),
          efeito: texto(r.efeito, 20) || "solido",
          resetEm: texto(r.resetEm, 20) || "manual",
          ...(r.tipo === "ponto"
            ? {
                tipo: "ponto",
                sigla: textoOuNulo(r.sigla, 4),
                icone: textoOuNulo(r.icone, 40),
                ganhoPorNivel: lerGanhoPorNivel(r.ganhoPorNivel),
                tetoLivre: r.tetoLivre == null ? null : inteiro(r.tetoLivre, 0, 999),
              }
            : {}),
        },
      ];
    }),
  };
}

// ─── Importar ──────────────────────────────────────────────

export type FichaDestino = {
  recursos: RecursoRef[];
  habilidades: { id: string; nome: string }[];
};

export type ArvoreImportada = {
  id: string;
  nome: string;
  icone: string;
  cor: string | null;
  cor2: string | null;
  efeito: string;
  criterio: string;
  recursoCustoId: string | null;
  fundoUrl: string | null;
  camadas: CamadaArvore[];
  ramos: RamoArvore[];
  nos: NoArvore[];
};

// O que criar na ficha, já com os ids novos.
export type PlanoImportacao = {
  recursos: (RecursoPacote & { id: string })[];
  habilidades: { id: string; input: Record<string, unknown> }[];
  acoes: { id: string; input: Record<string, unknown> }[];
  arvores: ArvoreImportada[];
  itens: { id: string; input: Record<string, unknown> }[];
};

// Vínculo de dentro do pacote ganha o id novo; o de fora casa pelo nome com a ficha.
export function planejarImportacao(
  pacote: PacoteDados,
  escolha: Escolha,
  ficha: FichaDestino,
  novoId: () => string,
): PlanoImportacao {
  const escolhidos = <T extends { ref: string }>(itens: T[], refs: string[]) => {
    const quer = new Set(refs);
    return itens.filter((x) => quer.has(x.ref));
  };
  const habilidades = escolhidos(pacote.habilidades, escolha.habilidades);
  const acoes = escolhidos(pacote.acoes, escolha.acoes);
  const arvores = escolhidos(pacote.arvores, escolha.arvores);
  const itens = escolhidos(pacote.itens, escolha.itens);

  const citados = recursosCitados({ habilidades, acoes, arvores, itens });
  const recursos = pacote.recursos
    .filter(
      (r) =>
        citados.some((nome) => mesmoNome(nome, r.nome)) &&
        !ficha.recursos.some((f) => mesmoNome(f.nome, r.nome)),
    )
    .map((r) => ({ ...r, id: novoId() }));
  const recursosDaFicha = [...ficha.recursos, ...recursos];
  const recursoDe = (nome: string | null) =>
    nome ? (recursosDaFicha.find((r) => mesmoNome(r.nome, nome))?.id ?? null) : null;

  const idHabilidade = new Map(habilidades.map((h) => [h.ref, novoId()]));
  const habilidadeDe = (ref: string | null): string | null => {
    if (!ref) return null;
    const novo = idHabilidade.get(ref);
    if (novo) return novo;
    const nome = pacote.habilidades.find((h) => h.ref === ref)?.dados.nome;
    return typeof nome === "string"
      ? (ficha.habilidades.find((h) => mesmoNome(h.nome, nome))?.id ?? null)
      : null;
  };

  const idAcao = new Map(acoes.map((a) => [a.ref, novoId()]));
  // Forma só aponta pra origem escolhida, nunca pra outra forma.
  const origemDaForma = (
    item: { formaDe?: string },
    itens: { ref: string; formaDe?: string }[],
    ids: Map<string, string>,
  ): string | null => {
    const origem = item.formaDe ? itens.find((x) => x.ref === item.formaDe) : undefined;
    return origem && !origem.formaDe ? (ids.get(origem.ref) ?? null) : null;
  };

  return {
    recursos,
    habilidades: habilidades.map((h) => ({
      id: idHabilidade.get(h.ref) as string,
      input: {
        ...doModelo("habilidade", h.dados, recursosDaFicha),
        formaDe: origemDaForma(h, habilidades, idHabilidade),
      },
    })),
    acoes: acoes.map((a) => ({
      id: idAcao.get(a.ref) as string,
      input: {
        ...doModelo("acao", a.dados, recursosDaFicha),
        habilidadeIds: a.habilidades.map(habilidadeDe).filter((id): id is string => id !== null),
        formaDe: origemDaForma(a, acoes, idAcao),
      },
    })),
    arvores: arvores.map((a) => {
      const camadas = a.camadas.map((c, i) => ({ id: novoId(), nome: c.nome, ordem: i, limiar: c.limiar }));
      const ramos = a.ramos.map((r, i) => ({ id: novoId(), nome: r.nome, ordem: i }));
      const idNo = a.nos.map(() => novoId());
      return {
        id: novoId(),
        nome: a.nome,
        icone: a.icone,
        cor: a.cor,
        cor2: a.cor2,
        efeito: a.efeito,
        criterio: a.criterio,
        recursoCustoId: recursoDe(a.recursoCusto),
        fundoUrl: a.fundoUrl,
        camadas,
        ramos,
        nos: a.nos.map((n, i) => ({
          id: idNo[i],
          camadaId: camadas[n.camada].id,
          ramoId: n.ramo === null ? null : (ramos[n.ramo]?.id ?? null),
          coluna: n.coluna,
          linha: n.linha,
          nome: n.nome,
          descricao: n.descricao,
          icone: n.icone,
          custo: n.custo,
          maxRanks: n.maxRanks,
          rankAtual: 0,
          nivelMinimo: n.nivelMinimo,
          habilidadeId: habilidadeDe(n.habilidade),
          requisitos: n.requisitos.map((r) => ({ noId: idNo[r.no], rank: r.rank })),
          ordem: i,
        })),
      };
    }),
    itens: itens.map((i) => ({ id: novoId(), input: doModelo("item", i.dados, recursosDaFicha) })),
  };
}

export type ContagemPacote = Pick<PacoteView, "habilidades" | "acoes" | "arvores" | "itens">;

export function contarPacote(dados: PacoteDados): ContagemPacote {
  return {
    habilidades: dados.habilidades.length,
    acoes: dados.acoes.length,
    arvores: dados.arvores.length,
    itens: dados.itens.length,
  };
}

// "3 habilidades, 1 árvore"
export function resumoDaContagem(c: ContagemPacote): string {
  const parte = (n: number, um: string, varios: string) => (n > 0 ? `${n} ${n === 1 ? um : varios}` : null);
  return [
    parte(c.habilidades, "habilidade", "habilidades"),
    parte(c.acoes, "ação", "ações"),
    parte(c.arvores, "árvore", "árvores"),
    parte(c.itens, "item", "itens"),
  ]
    .filter(Boolean)
    .join(", ");
}
