// Combate ativo da mesa, filtrado pro jogador: de criatura só sai o que o
// narrador liberou (PV, PP, CR, ações reveladas). Só servidor.

import { prisma } from "@/lib/prisma";
import { serializarCriatura, textoEfeitoAcao } from "@/app/bestiario/utils";
import { CATEGORIAS_COMPONENTE } from "@/app/bestiario/types";
import type { Prisma } from "@prisma/client";
import {
  lerAcoesGastas,
  lerResolucoes,
  ordenarParticipantes,
  resolucaoAberta,
  type AcaoVista,
  type CombateVisto,
  type ParticipanteVisto,
  type Resolucao,
} from "@/lib/combate";
import { modificador, type Atributo } from "@/lib/op-rpg";
import { resumirPersonagem } from "@/lib/resumo-personagem";
import { carregarRecebidas, fonteRecebida } from "@/lib/efeitos-servidor";
import {
  MAX_CONDICOES,
  condicaoDoCatalogo,
  lerCatalogoCondicoes,
  lerCondicoesAtivas,
  mesmaCondicao,
  passarRodada,
  type CondicaoAplicada,
  type CondicaoAtiva,
  type CondicaoCatalogo,
} from "@/lib/condicoes";

export async function carregarCombateDoJogador(
  mesaId: string | null | undefined,
  personagemId: string,
): Promise<{ sessaoId: string | null; combate: CombateVisto | null }> {
  if (!mesaId) return { sessaoId: null, combate: null };

  const sessao = await prisma.sessao.findFirst({
    where: { mesaId, encerradaEm: null },
    select: {
      id: true,
      combates: { where: { encerradoEm: null }, include: { participantes: true }, take: 1 },
    },
  });
  if (!sessao) return { sessaoId: null, combate: null };
  const combate = sessao.combates[0];
  if (!combate) return { sessaoId: sessao.id, combate: null };

  const ids = (campo: "criaturaId" | "personagemId") => [
    ...new Set(combate.participantes.map((p) => p[campo]).filter((id): id is string => !!id)),
  ];
  const [criaturas, personagens] = await Promise.all([
    prisma.criatura.findMany({ where: { id: { in: ids("criaturaId") } }, include: { componentes: true } }),
    prisma.personagem.findMany({
      where: { id: { in: ids("personagemId") } },
      select: { id: true, fotoUrl: true, hpAtual: true, hpMax: true },
    }),
  ]);
  const criaturaDe = new Map(criaturas.map((c) => [c.id, serializarCriatura(c)]));
  const personagemDe = new Map(personagens.map((p) => [p.id, p]));

  const naOrdem = ordenarParticipantes(combate.participantes);
  const minha = naOrdem.find((p) => p.personagemId === personagemId);
  const resolucoes = lerResolucoes(combate.resolucoes);
  const participantes = naOrdem.map((p): ParticipanteVisto => {
    const base = {
      id: p.id,
      nome: p.nomeExibicao,
      iniciativa: p.iniciativa,
      condicoes: lerCondicoesAtivas(p.condicoesAtivas).map((c) => ({
        id: c.id,
        nome: c.nome,
        rodadas: c.rodadas,
        sair: p.personagemId === personagemId ? c.salvaguarda : null,
      })),
    };
    if (p.personagemId) {
      const pj = personagemDe.get(p.personagemId);
      return {
        ...base,
        foto: pj?.fotoUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${p.personagemId}`,
        tipo: "personagem",
        voce: p.personagemId === personagemId,
        pv: pj ? { atual: pj.hpAtual, max: pj.hpMax } : null,
        pp: null,
        cr: null,
        acoes: null,
      };
    }
    const c = p.criaturaId ? criaturaDe.get(p.criaturaId) : undefined;
    const reveladas = new Set(p.acoesReveladas);
    const acoes: AcaoVista[] | null =
      p.fichaVisivel && c
        ? c.componentes
            .filter((comp) => reveladas.has(comp.id))
            .map((comp) => ({
              id: comp.id,
              nome: comp.nome,
              categoria: CATEGORIAS_COMPONENTE.find((cat) => cat.key === comp.categoria)?.label ?? "",
              descricao: comp.descricao,
              stats: [
                ...comp.efeitos.map(textoEfeitoAcao).filter((t): t is string => t !== null),
                ...(comp.alcance.trim() ? [`Alcance: ${comp.alcance.trim()}`] : []),
                ...(comp.custo.trim() ? [`Custo: ${comp.custo.trim()}`] : []),
              ],
            }))
        : null;
    return {
      ...base,
      foto: c?.imagemUrl ?? null,
      tipo: "criatura",
      voce: false,
      pv: p.pvVisivel ? { atual: p.pvAtual ?? 0, max: p.pvMax ?? 0 } : null,
      pp: p.ppVisivel && c ? { atual: Math.max(0, c.pontosPoder - p.ppGasto), max: c.pontosPoder } : null,
      cr: p.crVisivel && c ? c.classeResistencia : null,
      acoes,
    };
  });

  return {
    sessaoId: sessao.id,
    combate: {
      id: combate.id,
      sessaoId: sessao.id,
      rodada: combate.rodadaAtual,
      turno: combate.turnoAtual,
      participantes,
      voce: minha
        ? {
            instanciaId: minha.id,
            naVez: naOrdem[combate.turnoAtual]?.id === minha.id,
            gastas: lerAcoesGastas(minha.acoesGastas),
            resolucoes: resolucoes
              .filter((r) => r.atacanteId === minha.id && r.etapa !== "feito")
              .map((r) => ({
                id: r.id,
                acaoId: r.acaoId,
                nome: r.nome,
                modo: r.modo,
                etapa: r.etapa,
                alvos: r.alvos.map((a) => ({ nome: a.nome, resultado: a.resultado, danoAplicado: a.danoAplicado })),
              })),
            salvaguardas: resolucoes.flatMap((r) =>
              r.salvaguarda && r.alvos.some((a) => a.instanciaId === minha.id && a.resultado === null)
                ? [
                    {
                      resolucaoId: r.id,
                      de: r.atacanteNome,
                      nome: r.nome,
                      atributo: r.salvaguarda.atributo,
                      cd: r.salvaguarda.cd,
                    },
                  ]
                : [],
            ),
            reacoes: resolucoes.flatMap((r) =>
              r.alvos.some((a) => a.instanciaId === minha.id && a.reacao === "pendente")
                ? [{ resolucaoId: r.id, de: r.atacanteNome, nome: r.nome }]
                : [],
            ),
            concentracoes: resolucoes.flatMap((r) =>
              r.alvos.flatMap((a) =>
                a.instanciaId === minha.id && a.concentracao
                  ? [{ resolucaoId: r.id, nome: a.concentracao.nome, cd: a.concentracao.cd }]
                  : [],
              ),
            ),
          }
        : null,
    },
  };
}

// O personagem no combate ativo da mesa dele, e se a vez é dele.
export async function participacaoEmCombate(personagemId: string) {
  const instancia = await prisma.instanciaCombate.findFirst({
    where: { personagemId, combate: { encerradoEm: null, sessao: { encerradaEm: null } } },
    select: {
      id: true,
      acoesGastas: true,
      condicoesAtivas: true,
      combate: {
        select: {
          id: true,
          turnoAtual: true,
          sessao: { select: { mesaId: true } },
          participantes: { select: { id: true, iniciativa: true, ordem: true } },
        },
      },
    },
  });
  if (!instancia) return null;
  const daVez = ordenarParticipantes(instancia.combate.participantes)[instancia.combate.turnoAtual];
  return {
    instanciaId: instancia.id,
    combateId: instancia.combate.id,
    mesaId: instancia.combate.sessao.mesaId,
    naVez: daVez?.id === instancia.id,
    gastas: lerAcoesGastas(instancia.acoesGastas),
    condicoes: lerCondicoesAtivas(instancia.condicoesAtivas),
  };
}

// Passa a vez pro próximo (vira a rodada no fim da lista). Quem recebe a vez
// começa o turno com todas as ações de volta.
export async function avancarTurnoDoCombate(combateId: string) {
  const combate = await prisma.combate.findUniqueOrThrow({
    where: { id: combateId },
    select: {
      rodadaAtual: true,
      turnoAtual: true,
      participantes: { select: { id: true, iniciativa: true, ordem: true, condicoesAtivas: true } },
    },
  });
  const naOrdem = ordenarParticipantes(combate.participantes);
  let turno = combate.turnoAtual + 1;
  let rodada = combate.rodadaAtual;
  if (naOrdem.length === 0 || turno >= naOrdem.length) {
    turno = 0;
    rodada += 1;
  }
  const proximo = naOrdem[turno];

  // A vez de quem aplicou uma condição voltou: uma rodada a menos nela.
  const presentes = new Set(naOrdem.map((p) => p.id));
  const condicoesNovas = proximo
    ? naOrdem.flatMap((p) => {
        const atuais = lerCondicoesAtivas(p.condicoesAtivas);
        const { condicoes, acabaram } = passarRodada(atuais, p.id, proximo.id, presentes);
        return acabaram.length > 0 || condicoes.some((c, i) => c.rodadas !== atuais[i]?.rodadas)
          ? [{ id: p.id, condicoes }]
          : [];
      })
    : [];

  await prisma.$transaction([
    prisma.combate.update({ where: { id: combateId }, data: { turnoAtual: turno, rodadaAtual: rodada } }),
    ...(proximo ? [prisma.instanciaCombate.update({ where: { id: proximo.id }, data: { acoesGastas: {} } })] : []),
    ...condicoesNovas.map((c) =>
      prisma.instanciaCombate.update({
        where: { id: c.id },
        data: { condicoesAtivas: c.condicoes as unknown as Prisma.InputJsonValue },
      }),
    ),
  ]);
}

// ─── Condições ─────────────────────────────────────────────────────────────

// Condições do narrador (pasta Condições da Biblioteca); sem nenhuma, as do livro.
export async function catalogoCondicoesDoNarrador(userId: string | null | undefined): Promise<CondicaoCatalogo[]> {
  if (!userId) return lerCatalogoCondicoes([]);
  const condicoes = await prisma.traitTemplate.findMany({
    where: { userId, categoria: "condicao" },
    orderBy: { nome: "asc" },
    select: { nome: true, textoTemplate: true, formulaParametros: true },
  });
  return lerCatalogoCondicoes(
    condicoes.map((c) =>
      condicaoDoCatalogo(c.nome, c.textoTemplate, (c.formulaParametros ?? {}) as Record<string, unknown>),
    ),
  );
}

// Põe condições em participantes do combate. Quem já tem a mesma condição
// fica com a nova (a duração recomeça). `fonteId` é de quem a vez marca as
// rodadas. Devolve o nome de quem recebeu.
export async function aplicarCondicoes(entrada: {
  combateId: string;
  instanciaIds: string[];
  condicoes: CondicaoAplicada[];
  fonteId: string | null;
  origem: string;
}): Promise<string[]> {
  if (entrada.condicoes.length === 0 || entrada.instanciaIds.length === 0) return [];
  const instancias = await prisma.instanciaCombate.findMany({
    where: { combateId: entrada.combateId, id: { in: [...new Set(entrada.instanciaIds)] } },
    select: { id: true, nomeExibicao: true, condicoesAtivas: true },
  });
  await prisma.$transaction(
    instancias.map((i) => {
      const novas: CondicaoAtiva[] = entrada.condicoes.map((c) => ({
        id: crypto.randomUUID(),
        nome: c.nome,
        rodadas: c.rodadas,
        fonteId: entrada.fonteId,
        origem: entrada.origem,
        salvaguarda: c.salvaguarda,
      }));
      const mantidas = lerCondicoesAtivas(i.condicoesAtivas).filter(
        (c) => !novas.some((n) => mesmaCondicao(n.nome, c.nome)),
      );
      return prisma.instanciaCombate.update({
        where: { id: i.id },
        data: { condicoesAtivas: [...mantidas, ...novas].slice(-MAX_CONDICOES) as unknown as Prisma.InputJsonValue },
      });
    }),
  );
  return instancias.map((i) => i.nomeExibicao);
}

// Tira uma condição de um participante; devolve a que saiu (ou null).
export async function tirarCondicao(combateId: string, instanciaId: string, condicaoId: string) {
  const instancia = await prisma.instanciaCombate.findFirst({
    where: { id: instanciaId, combateId },
    select: { nomeExibicao: true, condicoesAtivas: true },
  });
  if (!instancia) return null;
  const atuais = lerCondicoesAtivas(instancia.condicoesAtivas);
  const saiu = atuais.find((c) => c.id === condicaoId);
  if (!saiu) return null;
  await prisma.instanciaCombate.update({
    where: { id: instanciaId },
    data: { condicoesAtivas: atuais.filter((c) => c.id !== condicaoId) as unknown as Prisma.InputJsonValue },
  });
  return { condicao: saiu, nome: instancia.nomeExibicao };
}

// ─── Resoluções (ação com alvo) ────────────────────────────────────────────

// Quantas resoluções encerradas ficam guardadas no combate.
const RESOLUCOES_FEITAS = 5;

// Lê, muda e grava as resoluções do combate com a linha travada, pra duas
// rolagens ao mesmo tempo (dano de quem atacou e salvaguarda do alvo) não se
// atropelarem. `mudar` mexe na lista e devolve o que quem chamou precisa.
export async function mudarResolucoes<T>(combateId: string, mudar: (lista: Resolucao[]) => T): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM combates WHERE id = ${combateId} FOR UPDATE`;
    const combate = await tx.combate.findUniqueOrThrow({ where: { id: combateId }, select: { resolucoes: true } });
    const lista = lerResolucoes(combate.resolucoes);
    const saida = mudar(lista);
    const abertas = lista.filter(resolucaoAberta);
    const feitas = lista.filter((r) => !resolucaoAberta(r)).slice(-RESOLUCOES_FEITAS);
    const guardar = [...feitas, ...abertas].sort((a, b) => a.criadaEm - b.criadaEm);
    await tx.combate.update({
      where: { id: combateId },
      data: { resolucoes: guardar as unknown as Prisma.InputJsonValue },
    });
    return saida;
  });
}

// CR do personagem como a ficha mostra (armadura, efeitos, exaustão).
export async function crDoPersonagem(personagemId: string): Promise<number> {
  const [p, recebidas] = await Promise.all([
    prisma.personagem.findUniqueOrThrow({
      where: { id: personagemId },
      include: {
        itens: true,
        habilidades: true,
        periciasCustom: { select: { slug: true } },
        arvores: { select: { id: true, nos: true } },
      },
    }),
    carregarRecebidas(personagemId),
  ]);
  return resumirPersonagem(p, recebidas.map(fonteRecebida)).cr;
}

const INICIO_DO_ATRIBUTO: Record<string, string> = {
  forca: "for",
  destreza: "des",
  constituicao: "con",
  sabedoria: "sab",
  presenca: "pre",
  vontade: "von",
};

// Bônus de salvaguarda da criatura: o cadastrado no bestiário pra aquele
// atributo ou, sem ele, o modificador do atributo.
export function bonusDeSalvaguardaDaCriatura(
  criatura: { caracteristicas: unknown } & Record<Atributo, number>,
  atributo: string,
): number {
  const inicio = INICIO_DO_ATRIBUTO[atributo];
  const lista = (criatura.caracteristicas as { salvaguardas?: { nome?: unknown; bonus?: unknown }[] } | null)
    ?.salvaguardas;
  const semAcento = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  const cadastrada = Array.isArray(lista)
    ? lista.find((sv) => inicio && semAcento(String(sv?.nome ?? "")).startsWith(inicio))
    : undefined;
  if (cadastrada) return Number(cadastrada.bonus) || 0;
  return atributo in INICIO_DO_ATRIBUTO ? modificador(criatura[atributo as Atributo]) : 0;
}
