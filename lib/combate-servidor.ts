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
import { defesasDaCriatura, pvComSinal, resolverDano, type ParteDano } from "@/lib/dano";
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
  type ReacaoPedida,
  type Resolucao,
} from "@/lib/combate";
import { PERICIAS, modificador, type Atributo, type EfeitoHabilidade } from "@/lib/op-rpg";
import { resumirPersonagem } from "@/lib/resumo-personagem";
import {
  SELECT_ACAO_QUE_DURA,
  carregarAgregado,
  carregarRecebidas,
  fonteRecebida,
  soltarConcentracao,
  soltarOQueDuravaComPvTemp,
} from "@/lib/efeitos-servidor";
import { lerPadroes, mecanicaDa, travasDasCondicoes } from "@/lib/condicoes-mecanica";
import { lerEstadoNavio, lerNavio, velocidadeComDano } from "@/lib/navio";
import {
  MAX_CONDICOES,
  condicaoDoCatalogo,
  condicaoNoCatalogo,
  fimDoTurnoDoAfetado,
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
      select: { id: true, fotoUrl: true, hpAtual: true, pvNegativos: true, hpMax: true, navio: true, deslocamento: true },
    }),
  ]);
  const criaturaDe = new Map(criaturas.map((c) => [c.id, serializarCriatura(c)]));
  const personagemDe = new Map(personagens.map((p) => [p.id, p]));

  const naOrdem = ordenarParticipantes(combate.participantes);
  const minha = naOrdem.find((p) => p.personagemId === personagemId);
  const resolucoes = lerResolucoes(combate.resolucoes);
  // Navios que este personagem comanda: a salvaguarda de estrutura é dele.
  const comandados = naOrdem.filter(
    (p) => p.personagemId && lerNavio(personagemDe.get(p.personagemId)?.navio)?.comandanteId === personagemId,
  );
  const meuNavio = minha?.personagemId ? personagemDe.get(minha.personagemId) : undefined;
  const montagem = lerNavio(meuNavio?.navio)?.montagem;
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
        ...(c.mecanica ? { mecanica: c.mecanica } : {}),
        ...(c.uso ? { uso: c.uso } : {}),
        ...(c.fimDoTurno ? { fimDoTurno: true } : {}),
        ...(c.origem ? { origem: c.origem } : {}),
      })),
    };
    if (p.personagemId) {
      const pj = personagemDe.get(p.personagemId);
      return {
        ...base,
        foto: pj?.fotoUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${p.personagemId}`,
        tipo: "personagem",
        personagemId: p.personagemId,
        voce: p.personagemId === personagemId,
        pv: pj ? { atual: pvComSinal(pj.hpAtual, pj.pvNegativos), max: pj.hpMax } : null,
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
                ...(r.corpoACorpo ? { corpoACorpo: true } : {}),
                alvos: r.alvos.map((a) => ({
                  instanciaId: a.instanciaId,
                  nome: a.nome,
                  resultado: a.resultado,
                  danoAplicado: a.danoAplicado,
                })),
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
            ).concat(
              resolucoes.flatMap((r) =>
                comandados.flatMap((navio) =>
                  r.salvaguarda && r.alvos.some((a) => a.instanciaId === navio.id && a.resultado === null)
                    ? [
                        {
                          resolucaoId: r.id,
                          de: r.atacanteNome,
                          nome: r.nome,
                          // Salvaguarda de estrutura: VON do comandante.
                          atributo: "vontade",
                          cd: r.salvaguarda.cd,
                          pelo: { instanciaId: navio.id, nome: navio.nomeExibicao },
                        },
                      ]
                    : [],
                ),
              ),
            ),
            navio:
              meuNavio && montagem
                ? (() => {
                    const maxima = velocidadeComDano(meuNavio.deslocamento, meuNavio.hpAtual, meuNavio.hpMax);
                    return { ...lerEstadoNavio(minha!.estadoNavio, maxima), maxima, tamanho: montagem.tamanho };
                  })()
                : null,
            // Acertos nele e em aliados dele que esperam a decisão de reagir:
            // as reações dele (do alvo, ou as de aliado que ele tem pra dar).
            reacoes: resolucoes.flatMap((r) => {
              const janelas = new Map<string, ReacaoPedida>();
              for (const alvo of r.alvos) {
                if (alvo.reacao !== "pendente" || janelas.has(alvo.instanciaId)) continue;
                const minhas = (alvo.reacoes ?? []).filter((o) => (o.de ? o.de.instanciaId : alvo.instanciaId) === minha.id);
                if (minhas.length === 0) continue;
                janelas.set(alvo.instanciaId, {
                  resolucaoId: r.id,
                  de: r.atacanteNome,
                  nome: r.nome,
                  modo: r.modo,
                  opcoes: minhas,
                  ...(alvo.instanciaId !== minha.id ? { aliado: { instanciaId: alvo.instanciaId, nome: alvo.nome } } : {}),
                });
              }
              return [...janelas.values()];
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
export async function avancarTurnoDoCombate(
  combateId: string,
): Promise<{ periodicos: DanoPeriodico[]; vez: { saiu: string | null; entrou: string | null } }> {
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
    const { count } = await prisma.personagem.updateMany({
      where: { id: proximo.personagemId, hpTempDuracao: "turno", hpTemp: { gt: 0 } },
      data: { hpTemp: 0, hpTempDuracao: null },
    });
    if (count > 0) await soltarOQueDuravaComPvTemp([proximo.personagemId]);
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

  // A vez de quem aplicou uma condição voltou: uma rodada a menos nela. O
  // turno de quem passa a vez acabou: soltam as que iam até o fim dele.
  const presentes = new Set(naOrdem.map((p) => p.id));
  const turnoQueAcaba = `${combate.rodadaAtual}:${combate.turnoAtual}`;
  const condicoesNovas = proximo
    ? naOrdem.flatMap((p) => {
        const lidas = lerCondicoesAtivas(p.condicoesAtivas);
        const atuais = p.id === anterior?.id ? fimDoTurnoDoAfetado(lidas, turnoQueAcaba).condicoes : lidas;
        const { condicoes, acabaram } = passarRodada(atuais, p.id, proximo.id, presentes);
        return atuais.length !== lidas.length ||
          acabaram.length > 0 ||
          condicoes.some((c, i) => c.rodadas !== atuais[i]?.rodadas)
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
  return { periodicos, vez: { saiu: anterior?.personagemId ?? null, entrou: proximo?.personagemId ?? null } };
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

// Condições a que o participante é imune: as da ficha (efeito Imune a
// Condição) ou as do bestiário.
async function imunidadesDe(i: { personagemId: string | null; criaturaId: string | null }): Promise<string[]> {
  if (i.personagemId) return Object.keys((await carregarAgregado(i.personagemId)).agg.condicoesImunes ?? {});
  if (!i.criaturaId) return [];
  const c = await prisma.criatura.findUnique({ where: { id: i.criaturaId }, select: { resistencias: true } });
  return comoResistencias(c?.resistencias).condicaoImunidade;
}

// Põe condições em participantes do combate. Quem já tem a mesma condição
// fica com a nova (a duração recomeça); quem é imune não recebe. `fonteId` é
// de quem a vez marca as rodadas. Devolve quem recebeu e quem foi imune
// ("Zoro (Envenenado)"). Condição que tira a concentração já tira.
export async function aplicarCondicoes(entrada: {
  combateId: string;
  instanciaIds: string[];
  condicoes: CondicaoAplicada[];
  fonteId: string | null;
  origem: string;
}): Promise<{ receberam: string[]; imunes: string[]; aplicadas: CondicaoAplicada[] }> {
  if (entrada.condicoes.length === 0 || entrada.instanciaIds.length === 0) {
    return { receberam: [], imunes: [], aplicadas: [] };
  }
  const [instancias, combate] = await Promise.all([
    prisma.instanciaCombate.findMany({
      where: { combateId: entrada.combateId, id: { in: [...new Set(entrada.instanciaIds)] } },
      select: { id: true, nomeExibicao: true, condicoesAtivas: true, personagemId: true, criaturaId: true },
    }),
    prisma.combate.findUnique({
      where: { id: entrada.combateId },
      select: { rodadaAtual: true, turnoAtual: true, sessao: { select: { mesa: { select: { userId: true } } } } },
    }),
  ]);
  // O turno em que entraram: a que dura até o fim do próximo turno do afetado
  // não acaba no fim deste.
  const turnoAgora = `${combate?.rodadaAtual ?? 0}:${combate?.turnoAtual ?? 0}`;
  // O que cada condição faz vem do catálogo do narrador (a do livro fica pelo nome).
  const catalogo = await catalogoCondicoesDoNarrador(combate?.sessao.mesa.userId);
  const condicoes = entrada.condicoes.map((c) => comMecanicaDoCatalogo(c, catalogo));
  const imunes: string[] = [];
  const receberam: string[] = [];
  const perdemConcentracao: string[] = [];
  const cabem = new Map<string, CondicaoAplicada[]>();
  for (const i of instancias) {
    const imuneA = await imunidadesDe(i);
    const lista = condicoes.filter((c) => !imuneA.some((x) => mesmaCondicao(x, c.nome)));
    const barradas = condicoes.filter((c) => !lista.includes(c));
    if (barradas.length > 0) imunes.push(`${i.nomeExibicao} (${barradas.map((c) => c.nome).join(", ")})`);
    if (lista.length === 0) continue;
    cabem.set(i.id, lista);
    receberam.push(i.nomeExibicao);
    if (i.personagemId && travasDasCondicoes(lista).semConcentracao) {
      perdemConcentracao.push(i.personagemId);
    }
  }
  await prisma.$transaction(
    instancias.flatMap((i) => {
      const lista = cabem.get(i.id);
      if (!lista) return [];
      const novas: CondicaoAtiva[] = lista.map((c) => ({
        id: crypto.randomUUID(),
        nome: c.nome,
        rodadas: c.rodadas,
        fonteId: entrada.fonteId,
        origem: entrada.origem,
        salvaguarda: c.salvaguarda,
        porTurno: c.porTurno ?? null,
        ...(c.mecanica ? { mecanica: c.mecanica } : {}),
        ...(c.uso ? { uso: c.uso } : {}),
        ...(c.ateOProximoTurno ? { fimDoTurno: turnoAgora } : {}),
      }));
      const mantidas = lerCondicoesAtivas(i.condicoesAtivas).filter(
        (c) => !novas.some((n) => mesmaCondicao(n.nome, c.nome)),
      );
      return [
        prisma.instanciaCombate.update({
          where: { id: i.id },
          data: { condicoesAtivas: [...mantidas, ...novas].slice(-MAX_CONDICOES) as unknown as Prisma.InputJsonValue },
        }),
      ];
    }),
  );
  for (const id of perdemConcentracao) await soltarConcentracao(id);
  // Com os padrões da Biblioteca já aplicados (duração, salvaguarda).
  return { receberam, imunes, aplicadas: condicoes };
}

// A mecânica configurada no catálogo (se a condição não trouxer uma), o dano
// de início ou fim de turno dela como dano por turno e, se a ação pediu, os
// padrões dela (duração e salvaguarda pra sair).
function comMecanicaDoCatalogo(c: CondicaoAplicada, catalogo: CondicaoCatalogo[]): CondicaoAplicada {
  const entrada = condicaoNoCatalogo(catalogo, c.nome);
  const padroes = lerPadroes(entrada?.padroes);
  const rodadas = c.usaPadroes && padroes?.rodadas ? padroes.rodadas : c.rodadas;
  const cdSaida = padroes?.saida ? (padroes.saida.cd === "fonte" ? (c.cdDaFonte ?? 0) : padroes.saida.cd) : 0;
  const salvaguarda =
    c.salvaguarda ??
    (c.usaPadroes && padroes?.saida && cdSaida > 0 ? { atributo: padroes.saida.atributo, cd: cdSaida } : null);
  const mecanica = c.mecanica ?? entrada?.mecanica ?? undefined;
  const m = mecanicaDa({ nome: c.nome, mecanica });
  const porTurno =
    c.porTurno ??
    (m?.dano && (m.dano.quando === "inicio" || m.dano.quando === "fim")
      ? { formula: m.dano.formula, tipo: m.dano.tipo, quando: m.dano.quando }
      : null);
  return { ...c, rodadas, salvaguarda, porTurno, ...(mecanica ? { mecanica } : {}) };
}

// Efeito "Remove Condição" usado em combate: tira a condição de quem recebe
// (o próprio ou o aliado) e avisa no chat.
export async function removerCondicoesPorEfeito(personagemId: string, efeitos: EfeitoHabilidade[], origem: string) {
  const nomes = efeitos.flatMap((e) => (e.tipo === "condicao_remover" && e.condicao.trim() ? [e.condicao.trim()] : []));
  if (nomes.length === 0) return;
  const instancia = await prisma.instanciaCombate.findFirst({
    where: { personagemId, combate: { encerradoEm: null, sessao: { encerradaEm: null } } },
    select: { id: true, nomeExibicao: true, condicoesAtivas: true, combate: { select: { sessao: { select: { mesaId: true } } } } },
  });
  if (!instancia) return;
  const atuais = lerCondicoesAtivas(instancia.condicoesAtivas);
  const saem = atuais.filter((c) => nomes.some((n) => mesmaCondicao(n, c.nome)));
  if (saem.length === 0) return;
  await prisma.instanciaCombate.update({
    where: { id: instancia.id },
    data: { condicoesAtivas: atuais.filter((c) => !saem.includes(c)) as unknown as Prisma.InputJsonValue },
  });
  await prisma.mensagem.create({
    data: {
      sessionId: instancia.combate.sessao.mesaId,
      uid: "combate",
      nome: instancia.nomeExibicao,
      mensagem: `não está mais com ${[...new Set(saem.map((c) => c.nome))].join(", ")} (${origem}).`,
      tipo: "texto",
    },
  });
}

// Tira de um participante as condições de uso único que já valeram numa rolagem.
export async function gastarCondicoes(instanciaId: string, ids: string[]) {
  if (ids.length === 0) return;
  const instancia = await prisma.instanciaCombate.findUnique({
    where: { id: instanciaId },
    select: { condicoesAtivas: true },
  });
  if (!instancia) return;
  const atuais = lerCondicoesAtivas(instancia.condicoesAtivas);
  const restam = atuais.filter((c) => !(c.uso === "proxima" && ids.includes(c.id)));
  if (restam.length === atuais.length) return;
  await prisma.instanciaCombate.update({
    where: { id: instanciaId },
    data: { condicoesAtivas: restam as unknown as Prisma.InputJsonValue },
  });
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

// ─── Condições na ficha (fora do combate) ──────────────────────────────────

// O que de uma condição de combate fica na ficha: sem quem marca a rodada nem o
// gatilho já caído. As que só valiam por um turno (uso único, até o fim do
// próximo turno) acabam com o combate.
function paraFicha(c: CondicaoAtiva): CondicaoAtiva | null {
  if (c.uso || c.fimDoTurno) return null;
  const limpa: CondicaoAtiva = { ...c, fonteId: null };
  delete limpa.disparou;
  return limpa;
}

// As da ficha, por cima das que já estão (a mesma condição fica com a nova).
function juntarNaFicha(atuais: CondicaoAtiva[], novas: CondicaoAtiva[]): CondicaoAtiva[] {
  return [...atuais.filter((c) => !novas.some((n) => mesmaCondicao(n.nome, c.nome))), ...novas].slice(-MAX_CONDICOES);
}

// As condições da ficha de quem entra no combate (vão pra instância).
export async function condicoesQueEntram(personagemIds: string[]): Promise<Map<string, CondicaoAtiva[]>> {
  if (personagemIds.length === 0) return new Map();
  const ps = await prisma.personagem.findMany({
    where: { id: { in: personagemIds } },
    select: { id: true, condicoes: true },
  });
  return new Map(ps.map((p) => [p.id, lerCondicoesAtivas(p.condicoes).map((c) => ({ ...c, fonteId: null }))]));
}

// Depois que entraram no combate, a ficha fica sem elas (uma lista só por vez).
export async function esvaziarCondicoesDaFicha(personagemIds: string[]) {
  if (personagemIds.length === 0) return;
  await prisma.personagem.updateMany({ where: { id: { in: personagemIds } }, data: { condicoes: [] } });
}

// Saindo do combate (fim, remoção ou fim da sessão): o que ainda vale volta pra ficha.
export async function devolverCondicoesAFicha(
  instancias: { personagemId: string | null; condicoesAtivas: unknown }[],
) {
  for (const i of instancias) {
    if (!i.personagemId) continue;
    const voltam = lerCondicoesAtivas(i.condicoesAtivas).flatMap((c) => paraFicha(c) ?? []);
    if (voltam.length === 0) continue;
    const p = await prisma.personagem.findUnique({ where: { id: i.personagemId }, select: { condicoes: true } });
    if (!p) continue;
    await prisma.personagem.update({
      where: { id: i.personagemId },
      data: { condicoes: juntarNaFicha(lerCondicoesAtivas(p.condicoes), voltam) as unknown as Prisma.InputJsonValue },
    });
  }
}

// Põe condições num personagem: na instância, se ele está num combate aberto;
// senão, na ficha. A mecânica e os padrões vêm do catálogo do narrador da mesa.
export async function aplicarCondicoesNoPersonagem(
  personagemId: string,
  condicoes: CondicaoAplicada[],
  origem: string,
): Promise<{ receberam: boolean; imunes: string[]; aplicadas: CondicaoAplicada[] }> {
  if (condicoes.length === 0) return { receberam: false, imunes: [], aplicadas: [] };
  const instancia = await prisma.instanciaCombate.findFirst({
    where: { personagemId, combate: { encerradoEm: null, sessao: { encerradaEm: null } } },
    select: { id: true, combateId: true },
  });
  if (instancia) {
    const r = await aplicarCondicoes({
      combateId: instancia.combateId,
      instanciaIds: [instancia.id],
      condicoes,
      fonteId: instancia.id,
      origem,
    });
    return { receberam: r.receberam.length > 0, imunes: r.imunes, aplicadas: r.aplicadas };
  }
  const p = await prisma.personagem.findUnique({
    where: { id: personagemId },
    select: { condicoes: true, mesa: { select: { userId: true } } },
  });
  if (!p) return { receberam: false, imunes: [], aplicadas: [] };
  const catalogo = await catalogoCondicoesDoNarrador(p.mesa?.userId);
  const imuneA = await imunidadesDe({ personagemId, criaturaId: null });
  const resolvidas = condicoes.map((c) => comMecanicaDoCatalogo(c, catalogo));
  const aplicadas = resolvidas.filter((c) => !imuneA.some((x) => mesmaCondicao(x, c.nome)));
  const imunes = resolvidas.filter((c) => !aplicadas.includes(c)).map((c) => c.nome);
  if (aplicadas.length > 0) {
    const novas: CondicaoAtiva[] = aplicadas.map((c) => ({
      id: crypto.randomUUID(),
      nome: c.nome,
      rodadas: c.rodadas,
      fonteId: null,
      origem,
      salvaguarda: c.salvaguarda,
      porTurno: c.porTurno ?? null,
      ...(c.mecanica ? { mecanica: c.mecanica } : {}),
    }));
    await prisma.personagem.update({
      where: { id: personagemId },
      data: { condicoes: juntarNaFicha(lerCondicoesAtivas(p.condicoes), novas) as unknown as Prisma.InputJsonValue },
    });
    if (travasDasCondicoes(aplicadas).semConcentracao) await soltarConcentracao(personagemId);
  }
  return { receberam: aplicadas.length > 0, imunes, aplicadas };
}

// Tira uma condição do personagem (do combate, se está num; senão, da ficha).
export async function tirarCondicaoDoPersonagem(personagemId: string, condicaoId: string): Promise<CondicaoAtiva | null> {
  const instancia = await prisma.instanciaCombate.findFirst({
    where: { personagemId, combate: { encerradoEm: null, sessao: { encerradaEm: null } } },
    select: { id: true, combateId: true },
  });
  if (instancia) return (await tirarCondicao(instancia.combateId, instancia.id, condicaoId))?.condicao ?? null;
  const p = await prisma.personagem.findUnique({ where: { id: personagemId }, select: { condicoes: true } });
  const atuais = lerCondicoesAtivas(p?.condicoes);
  const saiu = atuais.find((c) => c.id === condicaoId);
  if (!saiu) return null;
  await prisma.personagem.update({
    where: { id: personagemId },
    data: { condicoes: atuais.filter((c) => c.id !== condicaoId) as unknown as Prisma.InputJsonValue },
  });
  return saiu;
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
      select: { id: true, emCurso: true, personagemId: true },
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
  // Acabaram com o encontro: os colaterais "no fim" (import tardio: o módulo usa este).
  const { colateraisDaConcentracao, colateraisDoFim } = await import("@/lib/colaterais-servidor");
  for (const a of acoes.filter((x) => x.emCurso)) await colateraisDoFim(a.personagemId, [a.id]);
  for (const p of concentrando) await colateraisDaConcentracao(p.id, p.concentracao);
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

// Bônus de perícia da criatura: o cadastrado no bestiário (pelo nome) ou o
// modificador do atributo da perícia.
export function bonusDePericiaDaCriatura(
  criatura: { caracteristicas: unknown } & Record<Atributo, number>,
  pericia: string,
): number {
  const p = PERICIAS.find((x) => x.slug === pericia);
  if (!p) return 0;
  const semAcento = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  const lista = (criatura.caracteristicas as { pericias?: { nome?: unknown; bonus?: unknown }[] } | null)?.pericias;
  const cadastrada = Array.isArray(lista) ? lista.find((x) => semAcento(String(x?.nome ?? "")) === semAcento(p.nome)) : undefined;
  if (cadastrada) return Number(cadastrada.bonus) || 0;
  return modificador(criatura[p.atributo as Atributo]);
}

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
