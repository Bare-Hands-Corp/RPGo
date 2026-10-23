// Agregado de efeitos no servidor, com os mesmos filtros da página da ficha.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mesmoGrupo } from "@/lib/acesso-ficha";
import { habilidadesTravadas } from "@/lib/arvore";
import {
  agregarEfeitos,
  efeitosQueFicamNoAliado,
  fonteDeAliado,
  fontesDeEfeitoDeItens,
  type Atributo,
  type EfeitosAgregados,
  type HabilidadeFonte,
} from "@/lib/op-rpg";
import { acabaSemPvTemp, lerConcentracao } from "@/lib/duracao";
import { lerCondicoesAtivas, type CondicaoAtiva } from "@/lib/condicoes";
import { fontesDasCondicoes, type CondicaoComMecanica } from "@/lib/condicoes-mecanica";
import { acoesEmCurso, comAcoesEmCurso, type AcaoEmCurso } from "@/lib/turno";

type HabilidadeServidor = HabilidadeFonte & {
  id: string;
  itemId: string | null;
  formaDe?: string | null;
};

type ItemFonte = {
  id: string;
  nome: string;
  tipo: string;
  equipado: boolean;
  efeitos: unknown;
};

// Nível e atributos base do personagem, pras fórmulas dos efeitos.
export type BaseFormula = { nivel: number } & Record<Atributo, number>;

// Tira as habilidades travadas por árvore ou por item desequipado.
export function agregadoDaFicha(dados: {
  habilidades: HabilidadeServidor[];
  itens: ItemFonte[];
  nos: { habilidadeId: string | null; rankAtual: number }[];
  slugsPericiaCustom: Iterable<string>;
  base: BaseFormula;
  // Habilidades de aliados ligadas neste personagem.
  recebidas?: HabilidadeFonte[];
  // Ações em curso: os efeitos que elas mantêm entram por cima.
  emCurso?: AcaoEmCurso[];
  // Condições que ele tem no combate (lib/condicoes-mecanica.ts).
  condicoes?: CondicaoComMecanica[];
}): EfeitosAgregados {
  const travadas = habilidadesTravadas(dados.nos, dados.habilidades);
  const equipados = new Set(dados.itens.filter((i) => i.equipado).map((i) => i.id));
  const ativas = dados.habilidades.filter(
    (h) => !travadas.has(h.id) && (!h.itemId || equipados.has(h.itemId)),
  );
  const { nivel, ...atributos } = dados.base;
  const slugs = new Set(dados.slugsPericiaCustom);
  return comAcoesEmCurso(
    agregarEfeitos(
      [
        ...ativas,
        ...fontesDeEfeitoDeItens(dados.itens),
        ...(dados.recebidas ?? []),
        ...fontesDasCondicoes(dados.condicoes ?? []),
      ],
      slugs,
      undefined,
      { nivel, atributos: atributosDe(atributos) },
    ),
    dados.emCurso ?? [],
    slugs,
  );
}

function atributosDe(p: Record<Atributo, number>): Record<Atributo, number> {
  return {
    forca: p.forca,
    destreza: p.destreza,
    constituicao: p.constituicao,
    sabedoria: p.sabedoria,
    vontade: p.vontade,
    presenca: p.presenca,
  };
}

export const SELECT_HABILIDADE_FONTE = {
  id: true,
  nome: true,
  tipo: true,
  efeitos: true,
  ligada: true,
  itemId: true,
  formaDe: true,
  alternavel: true,
  aliado: true,
  usos: true,
  usosAtual: true,
  usosFormula: true,
} as const;

export const SELECT_ITEM_FONTE = {
  id: true,
  nome: true,
  tipo: true,
  equipado: true,
  efeitos: true,
  penalidadeDes: true,
} as const;

const SELECT_BASE_FORMULA = {
  nivel: true,
  forca: true,
  destreza: true,
  constituicao: true,
  sabedoria: true,
  vontade: true,
  presenca: true,
} as const;

// Habilidade de aliado ligada neste personagem.
export type HabilidadeRecebida = {
  id: string;
  nome: string;
  efeitos: unknown;
  personagem: { nome: string };
};

export const SELECT_RECEBIDA = {
  id: true,
  nome: true,
  efeitos: true,
  personagem: { select: { nome: true } },
} as const;

// Filtro das habilidades de aliados (mesma mesa ou mesmo dono) ligadas em `personagemId`.
export function ondeRecebidas(personagemId: string) {
  return {
    alvoPersonagemId: personagemId,
    ligada: true,
    aliado: true,
    personagemId: { not: personagemId },
    personagem: mesmoGrupo(personagemId),
  };
}

export function fonteRecebida(h: HabilidadeRecebida): HabilidadeFonte {
  return fonteDeAliado({ nome: h.nome, de: h.personagem.nome, efeitos: h.efeitos });
}

// Tira as que estão travadas no dono: item desequipado ou talento não comprado.
async function semTravadasNoDono<
  T extends { id: string; itemId: string | null; personagemId: string; formaDe: string | null },
>(habs: T[]): Promise<T[]> {
  if (habs.length === 0) return habs;
  const donos = [...new Set(habs.map((h) => h.personagemId))];
  // A forma alternativa trava junto da habilidade de origem.
  const origens = [...new Set(habs.flatMap((h) => (h.formaDe ? [h.formaDe] : [])))];
  const [equipados, nos, existentes] = await Promise.all([
    prisma.item.findMany({
      where: { personagemId: { in: donos }, equipado: true },
      select: { id: true },
    }),
    prisma.arvoreNo.findMany({
      where: { habilidadeId: { in: [...habs.map((h) => h.id), ...origens] } },
      select: { habilidadeId: true, rankAtual: true },
    }),
    origens.length > 0
      ? prisma.habilidade.findMany({ where: { id: { in: origens } }, select: { id: true } })
      : [],
  ]);
  const ids = new Set(equipados.map((i) => i.id));
  const travadas = habilidadesTravadas(nos, [...habs, ...existentes]);
  return habs.filter((h) => !travadas.has(h.id) && (!h.itemId || ids.has(h.itemId)));
}

// Ações de aliados em curso que deixaram efeitos valendo em quem está em
// `alvoIds`. A de concentração vale enquanto o dono concentra nela.
async function acoesRecebidas(
  alvoIds: string[],
  donos: Prisma.PersonagemWhereInput,
): Promise<(HabilidadeRecebida & { alvoId: string })[]> {
  const acoes = await prisma.acao.findMany({
    where: { aliadoEmCursoId: { in: alvoIds }, personagem: donos },
    select: {
      ...SELECT_ACAO_QUE_DURA,
      personagemId: true,
      aliadoEmCursoId: true,
      personagem: { select: { nome: true, concentracao: true } },
    },
  });
  return acoes.flatMap((a) => {
    const alvoId = a.aliadoEmCursoId;
    if (!alvoId || alvoId === a.personagemId) return [];
    if (acoesEmCurso([a], a.personagem.concentracao).length === 0) return [];
    const efeitos = efeitosQueFicamNoAliado(a);
    if (efeitos.length === 0) return [];
    return [{ id: a.id, nome: a.nome, efeitos, personagem: { nome: a.personagem.nome }, alvoId }];
  });
}

// Recebidas de aliados (habilidades ligadas e ações em curso); falha vira lista
// vazia (dado auxiliar, não derruba a ficha).
export async function carregarRecebidas(personagemId: string): Promise<HabilidadeRecebida[]> {
  try {
    const [habilidades, acoes] = await Promise.all([
      prisma.habilidade.findMany({
        where: ondeRecebidas(personagemId),
        select: { ...SELECT_RECEBIDA, itemId: true, personagemId: true, formaDe: true },
        orderBy: { criadoEm: "asc" },
      }),
      acoesRecebidas([personagemId], mesmoGrupo(personagemId)),
    ]);
    return [...(await semTravadasNoDono(habilidades)), ...acoes];
  } catch (err) {
    console.error("[efeitos] habilidades recebidas", err);
    return [];
  }
}

// Recebidas de aliados por personagem, pra vários personagens da mesma mesa.
export async function recebidasDaMesa(
  mesaId: string,
  ids: string[],
): Promise<Map<string, HabilidadeFonte[]>> {
  const out = new Map<string, HabilidadeFonte[]>();
  if (ids.length === 0) return out;
  // Membro da mesa, subficha de um membro ou subficha da mesa.
  const daMesa: Prisma.PersonagemWhereInput = { OR: [{ mesaId }, { dono: { mesaId } }, { donoMesaId: mesaId }] };
  try {
    const habs = await semTravadasNoDono(
      await prisma.habilidade.findMany({
        where: {
          alvoPersonagemId: { in: ids },
          ligada: true,
          aliado: true,
          personagem: daMesa,
        },
        select: {
          ...SELECT_RECEBIDA,
          itemId: true,
          personagemId: true,
          alvoPersonagemId: true,
          formaDe: true,
        },
        orderBy: { criadoEm: "asc" },
      }),
    );
    for (const h of habs) {
      if (!h.alvoPersonagemId || h.alvoPersonagemId === h.personagemId) continue;
      out.set(h.alvoPersonagemId, [...(out.get(h.alvoPersonagemId) ?? []), fonteRecebida(h)]);
    }
    for (const a of await acoesRecebidas(ids, daMesa)) {
      out.set(a.alvoId, [...(out.get(a.alvoId) ?? []), fonteRecebida(a)]);
    }
  } catch (err) {
    console.error("[efeitos] habilidades recebidas da mesa", err);
  }
  return out;
}

// Carrega e agrega; `ligada` sobrepõe o estado de uma habilidade (ao ligar).
export async function carregarAgregado(
  personagemId: string,
  ligada?: { id: string; ligada: boolean },
): Promise<{
  agg: EfeitosAgregados;
  itens: (ItemFonte & { penalidadeDes: number })[];
}> {
  const [habilidades, itens, nos, pericias, base, recebidas, emCurso, condicoes] = await Promise.all([
    prisma.habilidade.findMany({ where: { personagemId }, select: SELECT_HABILIDADE_FONTE }),
    prisma.item.findMany({ where: { personagemId }, select: SELECT_ITEM_FONTE }),
    prisma.arvoreNo.findMany({
      where: { arvore: { personagemId } },
      select: { habilidadeId: true, rankAtual: true },
    }),
    prisma.periciaCustom.findMany({ where: { personagemId }, select: { slug: true } }),
    prisma.personagem.findUnique({ where: { id: personagemId }, select: SELECT_BASE_FORMULA }),
    carregarRecebidas(personagemId),
    carregarAcoesEmCurso(personagemId),
    condicoesDoPersonagem(personagemId),
  ]);
  const habs = ligada
    ? habilidades.map((h) => (h.id === ligada.id ? { ...h, ligada: ligada.ligada } : h))
    : habilidades;
  return {
    agg: agregadoDaFicha({
      habilidades: habs,
      itens,
      nos,
      slugsPericiaCustom: pericias.map((p) => p.slug),
      base: base ?? {
        nivel: 1,
        forca: 10,
        destreza: 10,
        constituicao: 10,
        sabedoria: 10,
        vontade: 10,
        presenca: 10,
      },
      recebidas: recebidas.map(fonteRecebida),
      emCurso,
      condicoes,
    }),
    itens,
  };
}

// Condições do personagem: as do combate aberto da mesa, se ele está num;
// senão, as da ficha. Uma lista só por vez (entram e saem com o combate).
export async function condicoesDoPersonagem(personagemId: string): Promise<CondicaoAtiva[]> {
  const instancia = await prisma.instanciaCombate.findFirst({
    where: { personagemId, combate: { encerradoEm: null, sessao: { encerradaEm: null } } },
    select: { condicoesAtivas: true },
  });
  if (instancia) return lerCondicoesAtivas(instancia.condicoesAtivas);
  const p = await prisma.personagem.findUnique({ where: { id: personagemId }, select: { condicoes: true } });
  return lerCondicoesAtivas(p?.condicoes);
}

// Solta a concentração; a habilidade que ela segurava desliga.
export async function soltarConcentracao(personagemId: string) {
  const p = await prisma.personagem.findUnique({ where: { id: personagemId }, select: { concentracao: true } });
  const c = lerConcentracao(p?.concentracao);
  if (!c) return;
  await prisma.$transaction([
    ...(c.tipo === "habilidade"
      ? [prisma.habilidade.updateMany({ where: { id: c.id, personagemId, ligada: true }, data: { ligada: false } })]
      : []),
    prisma.personagem.update({ where: { id: personagemId }, data: { concentracao: Prisma.DbNull } }),
  ]);
  // Era numa ação: os colaterais "no fim" dela (import tardio: o módulo usa este).
  const { colateraisDaConcentracao } = await import("@/lib/colaterais-servidor");
  await colateraisDaConcentracao(personagemId, p?.concentracao);
}

export const SELECT_ACAO_QUE_DURA = {
  id: true,
  nome: true,
  efeitos: true,
  grau: true,
  duracao: true,
  aliado: true,
  emCurso: true,
  turnosRestantes: true,
} as const;

// Ações em curso do personagem: as marcadas e a técnica em que ele concentra.
export async function carregarAcoesEmCurso(personagemId: string): Promise<AcaoEmCurso[]> {
  const personagem = await prisma.personagem.findUnique({
    where: { id: personagemId },
    select: { concentracao: true },
  });
  const c = lerConcentracao(personagem?.concentracao);
  const acoes = await prisma.acao.findMany({
    where: {
      personagemId,
      OR: [{ emCurso: true }, ...(c?.tipo === "acao" ? [{ id: c.id }] : [])],
    },
    select: SELECT_ACAO_QUE_DURA,
  });
  return acoesEmCurso(acoes, personagem?.concentracao);
}

// O que acaba quando o PV temporário zera: as habilidades ligadas e as ações em
// curso que duram enquanto ele durar e a concentração que dependia de uma delas
// (ou de técnica assim).
export async function acabaComOPvTemp(personagemId: string, concentracaoRaw: unknown) {
  const concentracao = lerConcentracao(concentracaoRaw);
  const [ligadas, emCurso, tecnica] = await Promise.all([
    prisma.habilidade.findMany({
      where: { personagemId, ligada: true },
      select: { id: true, nome: true, duracao: true },
    }),
    prisma.acao.findMany({
      where: { personagemId, emCurso: true },
      select: { id: true, nome: true, duracao: true },
    }),
    concentracao?.tipo === "acao"
      ? prisma.acao.findFirst({
          where: { id: concentracao.id, personagemId },
          select: { duracao: true },
        })
      : null,
  ]);
  const habilidades = ligadas.filter((h) => acabaSemPvTemp(h.duracao));
  const acoes = emCurso.filter((a) => acabaSemPvTemp(a.duracao));
  return {
    habilidades,
    acoes,
    soltaConcentracao:
      !!concentracao &&
      (habilidades.some((h) => h.id === concentracao.id) || acabaSemPvTemp(tecnica?.duracao)),
    ops: [
      ...habilidades.map((h) =>
        prisma.habilidade.update({
          where: { id: h.id, personagemId },
          data: { ligada: false, turnosRestantes: null },
        }),
      ),
      ...acoes.map((a) =>
        prisma.acao.update({
          where: { id: a.id, personagemId },
          data: { emCurso: false, turnosRestantes: null },
        }),
      ),
    ],
  };
}

// PV temporário que o combate zerou sozinho (acabou a duração): o que durava
// enquanto ele durasse acaba junto.
export async function soltarOQueDuravaComPvTemp(personagemIds: string[]) {
  const personagens = await prisma.personagem.findMany({
    where: { id: { in: personagemIds } },
    select: { id: true, concentracao: true },
  });
  for (const p of personagens) {
    const fim = await acabaComOPvTemp(p.id, p.concentracao);
    const ops = [
      ...fim.ops,
      ...(fim.soltaConcentracao
        ? [prisma.personagem.update({ where: { id: p.id }, data: { concentracao: Prisma.DbNull } })]
        : []),
    ];
    if (ops.length > 0) await prisma.$transaction(ops);
    // O que acabou: colaterais "no fim" (import tardio: o módulo usa este).
    const { colateraisDaConcentracao, colateraisDoFim } = await import("@/lib/colaterais-servidor");
    if (fim.soltaConcentracao) await colateraisDaConcentracao(p.id, p.concentracao);
    await colateraisDoFim(p.id, fim.acoes.map((a) => a.id));
  }
}

// Penalidade de DES das armaduras equipadas (0 ou negativa).
export function penalidadeDesDasArmaduras(
  itens: { tipo: string; equipado: boolean; penalidadeDes: number }[],
): number {
  return itens.reduce(
    (acc, i) => (i.tipo === "armadura" && i.equipado ? acc + i.penalidadeDes : acc),
    0,
  );
}
