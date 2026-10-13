// Combate ativo da mesa, filtrado pro jogador: de criatura só sai o que o
// narrador liberou (PV, PP, CR, ações reveladas). Só servidor.

import { prisma } from "@/lib/prisma";
import {
  CHAVE_LENDARIAS,
  comoResistencias,
  serializarCriatura,
  textoEfeitoAcao,
  textoEfeitoExtra,
  textoTecnica,
} from "@/app/bestiario/utils";
import { parseFormulaDados, rolarDados } from "@/lib/dice";
import { defesasDaCriatura, resolverDano, type ParteDano } from "@/lib/dano";
import { tipoDominante } from "@/lib/estatisticas-combate";
import { marcarVez, registrarDano } from "@/lib/estatisticas-servidor";
import { CATEGORIAS_COMPONENTE } from "@/app/bestiario/types";
import { Prisma } from "@prisma/client";
import { lerConcentracao } from "@/lib/duracao";
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
import { SELECT_ACAO_QUE_DURA, carregarRecebidas, fonteRecebida } from "@/lib/efeitos-servidor";
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
                ...(comp.tecnica ? [textoTecnica(comp)] : []),
                ...comp.efeitos.map(textoEfeitoAcao).filter((t): t is string => t !== null),
                ...comp.efeitosExtras.map((e) => textoEfeitoExtra(e, c.recursos)),
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
            reacoes: resolucoes.flatMap((r) => {
              const alvo = r.alvos.find((a) => a.instanciaId === minha.id && a.reacao === "pendente");
              return alvo
                ? [{ resolucaoId: r.id, de: r.atacanteNome, nome: r.nome, modo: r.modo, opcoes: alvo.reacoes ?? [] }]
                : [];
            }),
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

// Dano de condição ("a cada turno") que caiu num jogador ao passar a vez:
// quem chamou desconta, porque o dano de personagem passa pela ficha dele.
// `fonteId` é quem aplicou a condição (leva o crédito do dano nas estatísticas).
export type DanoPeriodico = {
  personagemId: string;
  nome: string;
  condicao: string;
  fonteId: string | null;
  partes: ParteDano[];
};

// Passa a vez pro próximo (vira a rodada no fim da lista). Quem recebe a vez
// começa o turno com todas as ações de volta. O dano por turno das condições
// roda aqui: no fim do turno de quem passa a vez e no início do de quem recebe.
// O das criaturas já sai descontado; o dos jogadores volta em `periodicos`.
export async function avancarTurnoDoCombate(combateId: string): Promise<{ periodicos: DanoPeriodico[] }> {
  const combate = await prisma.combate.findUniqueOrThrow({
    where: { id: combateId },
    select: {
      rodadaAtual: true,
      turnoAtual: true,
      rolagensPrivadas: true,
      sessao: { select: { mesaId: true } },
      participantes: {
        select: {
          id: true,
          iniciativa: true,
          ordem: true,
          condicoesAtivas: true,
          criaturaId: true,
          personagemId: true,
          pvAtual: true,
          pvMax: true,
          pvTemp: true,
          pvTempDuracao: true,
          nomeExibicao: true,
          estadoRecargas: true,
        },
      },
    },
  });
  const naOrdem = ordenarParticipantes(combate.participantes);
  const anterior = naOrdem[combate.turnoAtual];
  let turno = combate.turnoAtual + 1;
  let rodada = combate.rodadaAtual;
  if (naOrdem.length === 0 || turno >= naOrdem.length) {
    turno = 0;
    rodada += 1;
  }
  const proximo = naOrdem[turno];

  // PV temporário que dura "até o início do próximo turno" de quem recebe a
  // vez acaba aqui, antes do dano de início de turno.
  if (proximo?.personagemId) {
    await prisma.personagem.updateMany({
      where: { id: proximo.personagemId, hpTempDuracao: "turno" },
      data: { hpTemp: 0, hpTempDuracao: null },
    });
  } else if (proximo && proximo.pvTempDuracao === "turno") {
    proximo.pvTemp = 0;
    await prisma.instanciaCombate.update({ where: { id: proximo.id }, data: { pvTemp: 0, pvTempDuracao: null } });
  }

  // Dano por turno das condições, antes de a rodada delas passar.
  const periodicos: DanoPeriodico[] = [];
  const vezes = [
    { p: anterior, quando: "fim" },
    { p: proximo, quando: "inicio" },
  ] as const;
  for (const { p, quando } of vezes) {
    if (!p) continue;
    for (const c of lerCondicoesAtivas(p.condicoesAtivas)) {
      if (!c.porTurno || c.porTurno.quando !== quando) continue;
      const f = parseFormulaDados(c.porTurno.formula);
      const valor = f.dados.length > 0 ? rolarDados(f.dados, f.modificador).total : f.modificador;
      if (!(valor > 0)) continue;
      const partes = [{ valor, tipo: c.porTurno.tipo }];
      if (p.personagemId) {
        periodicos.push({
          personagemId: p.personagemId,
          nome: p.nomeExibicao,
          condicao: c.nome,
          fonteId: c.fonteId && naOrdem.some((x) => x.id === c.fonteId) ? c.fonteId : null,
          partes,
        });
        continue;
      }
      if (!p.criaturaId) continue;
      const criatura = await prisma.criatura.findUnique({ where: { id: p.criaturaId }, select: { resistencias: true } });
      const r = resolverDano(partes, defesasDaCriatura(comoResistencias(criatura?.resistencias)), {
        hpAtual: p.pvAtual ?? 0,
        hpTemp: p.pvTemp,
        hpMax: p.pvMax ?? 0,
      });
      p.pvAtual = r.hpAtual.depois;
      p.pvTemp = r.hpTemp.depois;
      await prisma.instanciaCombate.update({
        where: { id: p.id },
        data: {
          pvAtual: r.hpAtual.depois,
          pvTemp: r.hpTemp.depois,
          ...(r.hpTemp.depois === 0 ? { pvTempDuracao: null } : {}),
        },
      });
      await registrarDano(combateId, {
        de: c.fonteId && naOrdem.some((x) => x.id === c.fonteId) ? c.fonteId : null,
        para: p.id,
        valor: r.final,
        bruto: r.bruto,
        tipo: tipoDominante(r.partes),
        acao: c.nome,
        caiu: r.hpAtual.antes > 0 && r.hpAtual.depois <= 0,
      });
      await prisma.mensagem.create({
        data: {
          sessionId: combate.sessao.mesaId,
          uid: "combate",
          nome: p.nomeExibicao,
          mensagem: `recebeu ${r.final} de dano (${c.nome}).`,
          tipo: "texto",
        },
      });
    }
  }

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

  // Criatura que recebe a vez: cada ação esgotada com recarga por dado rola o
  // d6 dela. Com as rolagens do narrador privadas, o chat não fica sabendo.
  const recarga = proximo?.criaturaId ? await rolarRecargas(proximo.criaturaId, proximo.estadoRecargas) : null;
  if (recarga && recarga.linhas.length > 0 && !combate.rolagensPrivadas) {
    await prisma.mensagem.create({
      data: {
        sessionId: combate.sessao.mesaId,
        uid: "combate",
        nome: proximo!.nomeExibicao,
        mensagem: `recarga: ${recarga.linhas.join("; ")}.`,
        tipo: "texto",
      },
    });
  }

  await prisma.$transaction([
    prisma.combate.update({ where: { id: combateId }, data: { turnoAtual: turno, rodadaAtual: rodada } }),
    ...(proximo
      ? [
          prisma.instanciaCombate.update({
            where: { id: proximo.id },
            data: { acoesGastas: {}, ...(recarga?.mudou ? { estadoRecargas: recarga.usos } : {}) },
          }),
        ]
      : []),
    ...condicoesNovas.map((c) =>
      prisma.instanciaCombate.update({
        where: { id: c.id },
        data: { condicoesAtivas: c.condicoes as unknown as Prisma.InputJsonValue },
      }),
    ),
  ]);
  await marcarVez(combateId, proximo?.id ?? null);
  return { periodicos };
}

// Começo do turno de uma criatura: volta o que é "por turno" (usos que
// recarregam a cada turno e as ações lendárias) e rola a recarga (d6 contra o
// mínimo) das ações que estão sem usos. Devolve os usos novos e o que
// aconteceu, pra contar no chat.
async function rolarRecargas(criaturaId: string, estadoRecargas: unknown) {
  const componentes = await prisma.traitInstance.findMany({
    where: { criaturaId },
    select: { id: true, nome: true, parametrosResolvidos: true },
  });
  const usos: Record<string, number> = {};
  if (estadoRecargas && typeof estadoRecargas === "object") {
    for (const [id, v] of Object.entries(estadoRecargas as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) usos[id] = Math.max(0, Math.trunc(v));
    }
  }
  const linhas: string[] = [];
  let mudou = false;
  for (const c of componentes) {
    const p = (c.parametrosResolvidos ?? {}) as { usos?: unknown; recarga?: { tipo?: unknown; minimo?: unknown } | null };
    const maximo = Number(p.usos);
    if (p.recarga?.tipo === "turno") {
      if (c.id in usos) {
        delete usos[c.id];
        mudou = true;
      }
      continue;
    }
    if (!(maximo > 0) || p.recarga?.tipo !== "dado" || (usos[c.id] ?? maximo) > 0) continue;
    const minimo = Math.min(6, Math.max(1, Math.trunc(Number(p.recarga.minimo) || 6)));
    const dado = 1 + Math.floor(Math.random() * 6);
    if (dado >= minimo) {
      usos[c.id] = maximo;
      mudou = true;
    }
    linhas.push(`${c.nome || "Ação"} ${dado >= minimo ? "recarregou" : "não recarregou"} (${dado} no d6)`);
  }
  if (CHAVE_LENDARIAS in usos) {
    delete usos[CHAVE_LENDARIAS];
    mudou = true;
  }
  return { usos, linhas, mudou };
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
        porTurno: c.porTurno ?? null,
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

// Fim do combate: técnica que dura "até o fim do encontro" acaba sozinha, a em
// curso e a que segurava a concentração.
export async function encerrarTecnicasDoEncontro(personagemIds: string[]) {
  if (personagemIds.length === 0) return;
  const [acoes, personagens] = await Promise.all([
    prisma.acao.findMany({
      where: { personagemId: { in: personagemIds }, duracao: { path: ["unidade"], equals: "encontro" } },
      select: { id: true, emCurso: true },
    }),
    prisma.personagem.findMany({
      where: { id: { in: personagemIds } },
      select: { id: true, concentracao: true },
    }),
  ]);
  const doEncontro = new Set(acoes.map((a) => a.id));
  const emCurso = acoes.filter((a) => a.emCurso).map((a) => a.id);
  const concentrando = personagens.filter((p) => {
    const c = lerConcentracao(p.concentracao);
    return c?.tipo === "acao" && doEncontro.has(c.id);
  });
  if (emCurso.length > 0) {
    await prisma.acao.updateMany({
      where: { id: { in: emCurso } },
      data: { emCurso: false, turnosRestantes: null },
    });
  }
  if (concentrando.length > 0) {
    await prisma.personagem.updateMany({
      where: { id: { in: concentrando.map((p) => p.id) } },
      data: { concentracao: Prisma.DbNull },
    });
  }
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
        acoes: { select: SELECT_ACAO_QUE_DURA },
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
