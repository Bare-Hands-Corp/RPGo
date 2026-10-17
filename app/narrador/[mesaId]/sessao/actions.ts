"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { pvComSinal, separarPv } from "@/lib/dano";
import { parseFormulaDados, rolarDados } from "@/lib/dice";
import { defesasDaCriatura, resolverDano, type ParteDano } from "@/lib/dano";
import { comoResistencias } from "@/app/bestiario/utils";
import {
  CAMPOS_VISIVEIS,
  lerAcoesGastas,
  ordenarParticipantes,
  type AcoesGastas,
  type CampoVisivel,
} from "@/lib/combate";
import {
  aplicarCondicoes,
  avancarTurnoDoCombate,
  bonusDeSalvaguardaDaCriatura,
  encerrarTecnicasDoEncontro,
  mudarResolucoes,
  tirarCondicao,
} from "@/lib/combate-servidor";
import { lerCondicoesAtivas, lerRodadas, textoRodadas } from "@/lib/condicoes";
import { resultadoDaSalvaguarda, textoDaSalvaguarda } from "@/lib/combate";
import { descontarPeriodicosDoNarrador, passarTurno } from "@/app/ficha/[uid]/actions";
import {
  calcularEstatisticas,
  lerLegado,
  lerResumo,
  resumirSessao,
  tipoDominante,
  type CombateHistorico,
  type SessaoHistorico,
} from "@/lib/estatisticas-combate";
import {
  finalizarRegistro,
  instanciaAtivaDoPersonagem,
  iniciarRegistro,
  marcarVez,
  registrarCura,
  registrarDano,
  registrarReforco,
  registrarSaida,
} from "@/lib/estatisticas-servidor";
import { soltarOQueDuravaComPvTemp } from "@/lib/efeitos-servidor";
import type { NovoParticipante } from "./types";
import { lerUsosAcoes, serializarSessao } from "./utils";

// PV de uma cópia nova entrando em combate: rola a fórmula de dados da
// criatura (ex: "7d12+7") em vez de usar sempre a média fixa — cada cópia
// tira sua própria vida, como um mestre faria rolando físico na mesa.
// Sem fórmula (ou sem dado nela, só um número solto), cai pra pvMedio.
function rolarPvCriatura(pvFormula: string, pvMedio: number): number {
  const { dados, modificador } = parseFormulaDados(pvFormula);
  if (dados.length === 0) return pvMedio;
  return Math.max(1, rolarDados(dados, modificador).total);
}

async function autorizarNarrador(mesaId: string) {
  const user = await usuarioDaRequest();
  if (!user) throw new Error("Não autenticado.");

  const mesa = await prisma.mesa.findUnique({ where: { id: mesaId }, select: { userId: true } });
  if (!mesa) throw new Error("Mesa não encontrada.");
  if (mesa.userId !== user.id) throw new Error("Apenas o narrador pode gerenciar a sessão.");

  return user;
}

function revalidar(mesaId: string) {
  revalidatePath(`/narrador/${mesaId}`);
}

async function sessaoDaMesa(mesaId: string, sessaoId: string) {
  const sessao = await prisma.sessao.findUnique({ where: { id: sessaoId }, select: { mesaId: true } });
  if (sessao?.mesaId !== mesaId) throw new Error("Sessão não pertence a esta mesa.");
}

async function buscarSessaoCompleta(sessaoId: string) {
  return prisma.sessao.findUniqueOrThrow({
    where: { id: sessaoId },
    include: { combates: { include: { participantes: true } } },
  });
}

// Monta as linhas de InstanciaCombate a partir de participantes escolhidos —
// expande quantidade em N linhas (uma por cópia), preenchendo PV/nome a
// partir do cadastro atual da criatura/personagem no momento de entrar em
// combate (cache: editar a criatura depois não afeta o combate em curso).
async function montarLinhas(
  mesaId: string,
  narradorId: string,
  participantes: NovoParticipante[],
  ordemInicial: number,
  // Combate que já tem gente (reforço): a numeração das cópias continua dele.
  combateId?: string,
) {
  const criaturaIds = participantes.filter((p) => p.criaturaId).map((p) => p.criaturaId!);
  const personagemIds = participantes.filter((p) => p.personagemId).map((p) => p.personagemId!);

  const [criaturas, personagens] = await Promise.all([
    criaturaIds.length
      ? prisma.criatura.findMany({
          where: { id: { in: criaturaIds }, OR: [{ userId: narradorId }, { userId: null }] },
          select: { id: true, nome: true, pvMedio: true, pvFormula: true },
        })
      : Promise.resolve([]),
    personagemIds.length
      ? prisma.personagem.findMany({ where: { id: { in: personagemIds }, mesaId }, select: { id: true, nome: true } })
      : Promise.resolve([]),
  ]);

  const linhas: {
    criaturaId: string | null;
    personagemId: string | null;
    nomeExibicao: string;
    iniciativa: number;
    ordem: number;
    pvAtual: number | null;
    pvMax: number | null;
  }[] = [];

  // Criatura que entra mais de uma vez neste lote sai numerada ("Soldado 2"),
  // venha numa linha só (iniciativa agrupada) ou em várias (individual).
  const totalDe = new Map<string, number>();
  for (const p of participantes) {
    if (p.criaturaId) totalDe.set(p.criaturaId, (totalDe.get(p.criaturaId) ?? 0) + Math.max(1, p.quantidade));
  }
  const numeroDe = new Map<string, number>();
  if (combateId && criaturaIds.length > 0) {
    const jaNoCombate = await prisma.instanciaCombate.groupBy({
      by: ["criaturaId"],
      where: { combateId, criaturaId: { in: criaturaIds } },
      _count: { _all: true },
    });
    for (const g of jaNoCombate) {
      if (!g.criaturaId) continue;
      numeroDe.set(g.criaturaId, g._count._all);
      totalDe.set(g.criaturaId, (totalDe.get(g.criaturaId) ?? 0) + g._count._all);
    }
  }

  let ordem = ordemInicial;
  for (const p of participantes) {
    if (p.criaturaId) {
      const criatura = criaturas.find((c) => c.id === p.criaturaId);
      if (!criatura) continue;
      const copias = Math.max(1, p.quantidade);
      const numerar = (totalDe.get(p.criaturaId) ?? 0) > 1;
      const numero = (numeroDe.get(p.criaturaId) ?? 0) + 1;
      numeroDe.set(p.criaturaId, numero + copias - 1);
      for (let i = 0; i < copias; i += 1) {
        // Cada cópia rola a própria vida — duas "Soldado Recruta" no mesmo
        // grupo podem sair com PV diferente, igual rolar dado físico na mesa.
        const pv = rolarPvCriatura(criatura.pvFormula, criatura.pvMedio);
        linhas.push({
          criaturaId: p.criaturaId,
          personagemId: null,
          nomeExibicao: criatura.nome + (numerar ? ` ${numero + i}` : ""),
          iniciativa: p.iniciativa,
          ordem: ordem++,
          pvAtual: pv,
          pvMax: pv,
        });
      }
    } else if (p.personagemId) {
      const personagem = personagens.find((x) => x.id === p.personagemId);
      if (!personagem) continue;
      linhas.push({
        criaturaId: null,
        personagemId: p.personagemId,
        nomeExibicao: personagem.nome,
        iniciativa: p.iniciativa,
        ordem: ordem++,
        pvAtual: null,
        pvMax: null,
      });
    }
  }

  return linhas;
}

// A vez é um índice na ordem do combate: quando alguém entra, sai ou muda de
// lugar, o índice é refeito pra continuar apontando pra mesma criatura.
async function mudarParticipantes(combateId: string, mudar: () => Promise<unknown>, saindoId?: string) {
  const ler = () =>
    prisma.combate.findUniqueOrThrow({
      where: { id: combateId },
      select: {
        turnoAtual: true,
        rodadaAtual: true,
        participantes: { select: { id: true, iniciativa: true, ordem: true } },
      },
    });
  const antes = await ler();
  const ordemAntes = ordenarParticipantes(antes.participantes);
  // Saindo quem está na vez, ela passa pro seguinte.
  const daVez =
    ordemAntes
      .slice(antes.turnoAtual)
      .concat(ordemAntes.slice(0, antes.turnoAtual))
      .find((p) => p.id !== saindoId)?.id ?? null;
  // A vez passou de verdade (quem estava jogando saiu): o seguinte começa o
  // turno com as ações de volta e, se a lista deu a volta, a rodada vira.
  const vezPassou = !!saindoId && ordemAntes[antes.turnoAtual]?.id === saindoId && daVez !== null;
  const deuAVolta = vezPassou && ordemAntes.findIndex((p) => p.id === daVez) < antes.turnoAtual;

  await mudar();

  const ordemDepois = ordenarParticipantes((await ler()).participantes);
  const turno = Math.max(0, ordemDepois.findIndex((p) => p.id === daVez));
  if (turno !== antes.turnoAtual || deuAVolta) {
    await prisma.combate.update({
      where: { id: combateId },
      data: { turnoAtual: turno, ...(deuAVolta ? { rodadaAtual: antes.rodadaAtual + 1 } : {}) },
    });
  }
  if (vezPassou && daVez) {
    await prisma.instanciaCombate.updateMany({ where: { id: daVez, combateId }, data: { acoesGastas: {} } });
    await marcarVez(combateId, daVez);
  }
}

export async function iniciarSessao(mesaId: string) {
  await autorizarNarrador(mesaId);

  const existente = await prisma.sessao.findFirst({ where: { mesaId, encerradaEm: null } });
  const sessao = existente ?? (await prisma.sessao.create({ data: { mesaId } }));

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(sessao.id));
}

export async function encerrarSessao(mesaId: string, sessaoId: string) {
  await autorizarNarrador(mesaId);
  await sessaoDaMesa(mesaId, sessaoId);

  // Fecha qualquer combate residual sem log detalhado — o mestre deveria
  // encerrar o combate explicitamente antes, isso é só uma rede de segurança.
  const residuais = await prisma.combate.findMany({
    where: { sessaoId, encerradoEm: null },
    select: { id: true, participantes: { select: { personagemId: true } } },
  });
  for (const c of residuais) await finalizarRegistro(c.id);
  const noCombate = residuais.flatMap((c) =>
    c.participantes.flatMap((p) => (p.personagemId ? [p.personagemId] : [])),
  );
  await encerrarTecnicasDoEncontro(noCombate);
  for (const id of noCombate) revalidatePath(`/ficha/${id}`);
  await prisma.combate.updateMany({ where: { sessaoId, encerradoEm: null }, data: { encerradoEm: new Date() } });
  await prisma.sessao.update({ where: { id: sessaoId }, data: { encerradaEm: new Date() } });

  revalidar(mesaId);
}

export async function iniciarCombate(mesaId: string, sessaoId: string, participantes: NovoParticipante[]) {
  const user = await autorizarNarrador(mesaId);
  await sessaoDaMesa(mesaId, sessaoId);
  if (participantes.length === 0) throw new Error("Adicione pelo menos um participante.");

  const linhas = await montarLinhas(mesaId, user.id, participantes, 0);
  if (linhas.length === 0) throw new Error("Adicione pelo menos um participante.");
  const combate = await prisma.combate.create({ data: { sessaoId } });
  await prisma.instanciaCombate.createMany({
    data: linhas.map((l) => ({ ...l, combateId: combate.id })),
  });
  await iniciarRegistro(combate.id, sessaoId);

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(sessaoId));
}

export async function adicionarParticipantes(mesaId: string, combateId: string, participantes: NovoParticipante[]) {
  const user = await autorizarNarrador(mesaId);

  const combate = await prisma.combate.findUniqueOrThrow({
    where: { id: combateId },
    select: {
      sessaoId: true,
      sessao: { select: { mesaId: true } },
      participantes: { select: { id: true, iniciativa: true, ordem: true } },
    },
  });
  if (combate.sessao.mesaId !== mesaId) throw new Error("Combate não pertence a esta mesa.");
  const linhas = await montarLinhas(mesaId, user.id, participantes, 0, combateId);

  // Reforço entra na ordem pela iniciativa: antes do primeiro que tem menos.
  const fila: { id?: string; iniciativa: number; linha?: (typeof linhas)[number] }[] = ordenarParticipantes(
    combate.participantes,
  ).map((p) => ({ id: p.id, iniciativa: p.iniciativa }));
  for (const linha of linhas) {
    const i = fila.findIndex((x) => x.iniciativa < linha.iniciativa);
    fila.splice(i < 0 ? fila.length : i, 0, { iniciativa: linha.iniciativa, linha });
  }

  await mudarParticipantes(combateId, () =>
    prisma.$transaction([
      ...fila.flatMap((x, ordem) =>
        x.id ? [prisma.instanciaCombate.update({ where: { id: x.id }, data: { ordem } })] : [],
      ),
      prisma.instanciaCombate.createMany({
        data: fila.flatMap((x, ordem) => (x.linha ? [{ ...x.linha, ordem, combateId }] : [])),
      }),
    ]),
  );
  await registrarReforco(combateId);

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(combate.sessaoId));
}

// Ordem nova do combate, arrumada à mão pelo narrador. Quem não vier na lista
// fica no fim, na ordem em que estava.
export async function reordenarIniciativa(mesaId: string, combateId: string, ids: string[]) {
  await autorizarNarrador(mesaId);

  const combate = await prisma.combate.findUniqueOrThrow({
    where: { id: combateId },
    select: {
      sessaoId: true,
      sessao: { select: { mesaId: true } },
      participantes: { select: { id: true, iniciativa: true, ordem: true } },
    },
  });
  if (combate.sessao.mesaId !== mesaId) throw new Error("Combate não pertence a esta mesa.");

  const atuais = ordenarParticipantes(combate.participantes).map((p) => p.id);
  const pedidos = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter((id) => atuais.includes(id));
  const ordem = [...pedidos, ...atuais.filter((id) => !pedidos.includes(id))];

  await mudarParticipantes(combateId, () =>
    prisma.$transaction(
      ordem.map((id, i) => prisma.instanciaCombate.update({ where: { id }, data: { ordem: i } })),
    ),
  );

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(combate.sessaoId));
}

export async function removerParticipante(mesaId: string, instanciaId: string) {
  await autorizarNarrador(mesaId);

  const instancia = await prisma.instanciaCombate.findFirst({
    where: { id: instanciaId, combate: { sessao: { mesaId } } },
    select: { combateId: true, combate: { select: { sessaoId: true } } },
  });
  if (!instancia) throw new Error("Participante não encontrado nesta mesa.");
  await registrarSaida(instancia.combateId, instanciaId);
  await mudarParticipantes(
    instancia.combateId,
    () => prisma.instanciaCombate.delete({ where: { id: instanciaId } }),
    instanciaId,
  );
  // Ação com alvo dele (ou nele) não tem mais como resolver.
  await mudarResolucoes(instancia.combateId, (lista) => {
    for (let i = lista.length - 1; i >= 0; i -= 1) {
      const r = lista[i];
      r.alvos = r.alvos.filter((a) => a.instanciaId !== instanciaId);
      if (r.atacanteId === instanciaId || r.alvos.length === 0) lista.splice(i, 1);
    }
  });

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(instancia.combate.sessaoId));
}

export async function atualizarPvInstancia(mesaId: string, instanciaId: string, novoPv: number) {
  await autorizarNarrador(mesaId);
  const antes = await prisma.instanciaCombate.findFirst({
    where: { id: instanciaId, combate: { sessao: { mesaId } } },
    select: { combateId: true, pvAtual: true },
  });
  const pv = Math.max(0, Math.trunc(Number(novoPv) || 0));
  await prisma.instanciaCombate.updateMany({
    where: { id: instanciaId, combate: { sessao: { mesaId } } },
    data: { pvAtual: pv },
  });
  if (antes) await registrarAjusteDePv(antes.combateId, instanciaId, antes.pvAtual ?? 0, pv);
  revalidar(mesaId);
}

// PV mexido à mão pelo narrador: sem origem; entra nas estatísticas como dano
// (se baixou) ou cura (se subiu). Dano e cura com origem passam pelas ações.
async function registrarAjusteDePv(combateId: string, instanciaId: string, antes: number, depois: number) {
  if (depois < antes) {
    await registrarDano(combateId, {
      de: null,
      para: instanciaId,
      valor: antes - depois,
      bruto: antes - depois,
      acao: "Ajuste de PV",
      caiu: antes > 0 && depois <= 0,
    });
  } else if (depois > antes) {
    await registrarCura(combateId, { de: null, para: instanciaId, valor: depois - antes, acao: "Ajuste de PV" });
  }
}

// Criaturas do combate, conferindo que ele é desta mesa. `instanciaId` nulo = todas.
async function criaturasDoCombate(mesaId: string, combateId: string, instanciaId: string | null) {
  const combate = await prisma.combate.findUniqueOrThrow({
    where: { id: combateId },
    select: { sessao: { select: { mesaId: true } } },
  });
  if (combate.sessao.mesaId !== mesaId) throw new Error("Combate não pertence a esta mesa.");
  return { combateId, criaturaId: { not: null }, ...(instanciaId ? { id: instanciaId } : {}) };
}

// O que os jogadores veem de uma criatura (PV, PP, CR, prévia da ficha), ou
// de todas do combate de uma vez.
export async function definirVisibilidade(
  mesaId: string,
  combateId: string,
  instanciaId: string | null,
  patch: Partial<Record<CampoVisivel, boolean>>,
) {
  await autorizarNarrador(mesaId);

  const data: Partial<Record<CampoVisivel, boolean>> = {};
  for (const campo of CAMPOS_VISIVEIS) {
    if (typeof patch?.[campo] === "boolean") data[campo] = patch[campo];
  }
  if (Object.keys(data).length === 0) return;

  await prisma.instanciaCombate.updateMany({
    where: await criaturasDoCombate(mesaId, combateId, instanciaId),
    data,
  });
  revalidar(mesaId);
}

// Põe ou tira uma ação da prévia da ficha que os jogadores veem.
export async function revelarAcao(
  mesaId: string,
  combateId: string,
  instanciaId: string,
  componenteId: string,
  revelada: boolean,
) {
  await autorizarNarrador(mesaId);

  const where = await criaturasDoCombate(mesaId, combateId, instanciaId);
  const instancia = await prisma.instanciaCombate.findFirst({ where, select: { acoesReveladas: true } });
  if (!instancia) throw new Error("Criatura não encontrada neste combate.");

  const id = String(componenteId).slice(0, 60);
  const sem = instancia.acoesReveladas.filter((x) => x !== id);
  const acoesReveladas = revelada ? [...sem, id] : sem;
  if (acoesReveladas.length === instancia.acoesReveladas.length) return;

  await prisma.instanciaCombate.updateMany({ where, data: { acoesReveladas } });
  revalidar(mesaId);
}

// Liga ou desliga o "revelar sozinha ao usar" das ações de uma criatura.
export async function definirAutoRevelar(mesaId: string, combateId: string, instanciaId: string, auto: boolean) {
  await autorizarNarrador(mesaId);
  await prisma.instanciaCombate.updateMany({
    where: await criaturasDoCombate(mesaId, combateId, instanciaId),
    data: { autoRevelarAcoes: !!auto },
  });
  revalidar(mesaId);
}

// Dano com tipo numa criatura: as defesas do bestiário (imunidade, resistência,
// vulnerabilidade) entram na conta, que o servidor refaz. `desligadas` são as
// defesas que o narrador mandou ignorar neste golpe.
export async function aplicarDanoInstancia(
  mesaId: string,
  instanciaId: string,
  partes: ParteDano[],
  desligadas: string[] = [],
) {
  await autorizarNarrador(mesaId);

  const instancia = await prisma.instanciaCombate.findUniqueOrThrow({
    where: { id: instanciaId },
    select: {
      combateId: true,
      criaturaId: true,
      pvAtual: true,
      pvMax: true,
      pvTemp: true,
      combate: { select: { sessao: { select: { mesaId: true } } } },
    },
  });
  if (instancia.combate.sessao.mesaId !== mesaId) throw new Error("Participante não pertence a esta mesa.");
  if (!instancia.criaturaId) throw new Error("Dano com tipo só vale pra criatura.");

  const limpas = (Array.isArray(partes) ? partes : [])
    .slice(0, 6)
    .map((p) => ({ valor: Math.max(0, Math.trunc(Number(p?.valor) || 0)), tipo: String(p?.tipo ?? "").slice(0, 40) }))
    .filter((p) => p.valor > 0);
  if (limpas.length === 0) throw new Error("Informe o dano.");

  const criatura = await prisma.criatura.findUnique({
    where: { id: instancia.criaturaId },
    select: { resistencias: true },
  });
  const resultado = resolverDano(
    limpas,
    defesasDaCriatura(comoResistencias(criatura?.resistencias)),
    { hpAtual: instancia.pvAtual ?? 0, hpTemp: instancia.pvTemp, hpMax: instancia.pvMax ?? 0 },
    { desligadas: Array.isArray(desligadas) ? desligadas.map(String) : [] },
  );

  await prisma.instanciaCombate.update({
    where: { id: instanciaId },
    data: {
      pvAtual: resultado.hpAtual.depois,
      pvTemp: resultado.hpTemp.depois,
      ...(resultado.hpTemp.depois === 0 ? { pvTempDuracao: null } : {}),
    },
  });
  await registrarDano(instancia.combateId, {
    de: null,
    para: instanciaId,
    valor: resultado.final,
    bruto: resultado.bruto,
    tipo: tipoDominante(resultado.partes),
    acao: "Dano do narrador",
    caiu: resultado.hpAtual.antes > 0 && resultado.hpAtual.depois <= 0,
  });
  revalidar(mesaId);
}

// PP que sobrou a uma criatura; o banco guarda o gasto (o máximo vem do bestiário).
export async function atualizarPpInstancia(mesaId: string, combateId: string, instanciaId: string, ppAtual: number) {
  await autorizarNarrador(mesaId);

  const where = await criaturasDoCombate(mesaId, combateId, instanciaId);
  const instancia = await prisma.instanciaCombate.findFirst({ where, select: { criaturaId: true } });
  if (!instancia?.criaturaId) throw new Error("Criatura não encontrada neste combate.");
  const criatura = await prisma.criatura.findUnique({
    where: { id: instancia.criaturaId },
    select: { pontosPoder: true },
  });
  const max = criatura?.pontosPoder ?? 0;
  const atual = Math.min(max, Math.max(0, Math.trunc(Number(ppAtual) || 0)));

  await prisma.instanciaCombate.updateMany({ where, data: { ppGasto: max - atual } });
  revalidar(mesaId);
}

// PV temporário de uma criatura, mexido à mão pelo narrador (dura até acabar).
export async function atualizarPvTempInstancia(mesaId: string, combateId: string, instanciaId: string, pvTemp: number) {
  await autorizarNarrador(mesaId);
  await prisma.instanciaCombate.updateMany({
    where: await criaturasDoCombate(mesaId, combateId, instanciaId),
    data: { pvTemp: Math.min(99999, Math.max(0, Math.trunc(Number(pvTemp) || 0))), pvTempDuracao: null },
  });
  revalidar(mesaId);
}

export async function atualizarPvPersonagem(mesaId: string, personagemId: string, novoHp: number) {
  await autorizarNarrador(mesaId);

  const personagem = await prisma.personagem.findUniqueOrThrow({
    where: { id: personagemId },
    select: { mesaId: true, hpAtual: true, pvNegativos: true },
  });
  if (personagem.mesaId !== mesaId) throw new Error("Personagem não pertence a esta mesa.");

  // PV com sinal: abaixo de 0 vira PV negativo, como na ficha.
  const novo = separarPv(novoHp);
  await prisma.personagem.update({ where: { id: personagemId }, data: novo });
  const instancia = await instanciaAtivaDoPersonagem(personagemId);
  if (instancia) {
    const antes = pvComSinal(personagem.hpAtual, personagem.pvNegativos);
    await registrarAjusteDePv(instancia.combateId, instancia.id, antes, pvComSinal(novo.hpAtual, novo.pvNegativos));
  }
  revalidar(mesaId);
}

export async function avancarTurno(mesaId: string, combateId: string) {
  await autorizarNarrador(mesaId);

  const combate = await prisma.combate.findUniqueOrThrow({
    where: { id: combateId },
    select: {
      sessaoId: true,
      turnoAtual: true,
      sessao: { select: { mesaId: true } },
      participantes: { select: { id: true, iniciativa: true, ordem: true, personagemId: true } },
    },
  });
  if (combate.sessao.mesaId !== mesaId) throw new Error("Combate não pertence a esta mesa.");
  // Jogador que tem a vez passada pelo narrador: o "a cada turno" da ficha
  // (efeitos e durações) roda aqui, com o servidor rolando. Sem nada pra
  // rodar, a action devolve erro de uso, que não interessa.
  const daVez = ordenarParticipantes(combate.participantes)[combate.turnoAtual];
  if (daVez?.personagemId) {
    await passarTurno(daVez.personagemId).catch((err) => console.error("[sessao] passar turno", err));
  }
  const { periodicos } = await avancarTurnoDoCombate(combateId);
  if (periodicos.length > 0) {
    await descontarPeriodicosDoNarrador(mesaId, combateId, periodicos).catch((err) =>
      console.error("[sessao] dano por turno", err),
    );
  }

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(combate.sessaoId));
}

// Descarta uma ação com alvo que ficou parada (rolagem que ninguém fez). O que
// já foi gasto e descontado continua como está.
export async function cancelarResolucao(mesaId: string, combateId: string, resolucaoId: string) {
  await autorizarNarrador(mesaId);

  const combate = await prisma.combate.findUniqueOrThrow({
    where: { id: combateId },
    select: { sessaoId: true, sessao: { select: { mesaId: true } } },
  });
  if (combate.sessao.mesaId !== mesaId) throw new Error("Combate não pertence a esta mesa.");

  await mudarResolucoes(combateId, (lista) => {
    const i = lista.findIndex((r) => r.id === resolucaoId);
    if (i >= 0) lista.splice(i, 1);
  });
  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(combate.sessaoId));
}

// ─── Condições ─────────────────────────────────────────────────────────────

// Mensagem do combate no chat (mesmo remetente das resoluções, que chega a todos).
function avisar(mesaId: string, nome: string, mensagem: string) {
  return prisma.mensagem.create({ data: { sessionId: mesaId, uid: "combate", nome, mensagem, tipo: "texto" } });
}

async function combateDaMesa(mesaId: string, combateId: string) {
  const combate = await prisma.combate.findUniqueOrThrow({
    where: { id: combateId },
    select: {
      sessaoId: true,
      turnoAtual: true,
      sessao: { select: { mesaId: true } },
      participantes: { select: { id: true, iniciativa: true, ordem: true } },
    },
  });
  if (combate.sessao.mesaId !== mesaId) throw new Error("Combate não pertence a esta mesa.");
  return combate;
}

// Narrador põe uma condição num participante. As rodadas contam pela vez de
// quem está jogando agora ("até o início do próximo turno" dele).
export async function aplicarCondicao(
  mesaId: string,
  combateId: string,
  instanciaId: string,
  condicao: { nome: string; rodadas: number },
) {
  await autorizarNarrador(mesaId);
  const combate = await combateDaMesa(mesaId, combateId);

  const nome = String(condicao?.nome ?? "").trim().slice(0, 40);
  if (!nome) throw new Error("Escolha a condição.");
  const rodadas = lerRodadas(condicao?.rodadas);
  const daVez = ordenarParticipantes(combate.participantes)[combate.turnoAtual];
  const nomes = await aplicarCondicoes({
    combateId,
    instanciaIds: [instanciaId],
    condicoes: [{ nome, rodadas, salvaguarda: null }],
    fonteId: daVez?.id ?? null,
    origem: "",
  });
  if (nomes.length > 0) await avisar(mesaId, nomes[0], `ficou: ${nome} (${textoRodadas(rodadas)}).`);

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(combate.sessaoId));
}

export async function removerCondicao(mesaId: string, combateId: string, instanciaId: string, condicaoId: string) {
  await autorizarNarrador(mesaId);
  const combate = await combateDaMesa(mesaId, combateId);

  const saiu = await tirarCondicao(combateId, instanciaId, condicaoId);
  if (saiu) await avisar(mesaId, saiu.nome, `não está mais com ${saiu.condicao.nome}.`);

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(combate.sessaoId));
}

// Criatura repete a salvaguarda de uma condição pra sair antes: o servidor
// rola com o bônus do bestiário.
export async function rolarSaidaDeCondicao(mesaId: string, combateId: string, instanciaId: string, condicaoId: string) {
  await autorizarNarrador(mesaId);
  const combate = await combateDaMesa(mesaId, combateId);

  const instancia = await prisma.instanciaCombate.findFirst({
    where: { id: instanciaId, combateId },
    select: { nomeExibicao: true, criaturaId: true, condicoesAtivas: true },
  });
  const condicao = lerCondicoesAtivas(instancia?.condicoesAtivas).find((c) => c.id === condicaoId);
  if (!instancia?.criaturaId || !condicao?.salvaguarda) throw new Error("Essa condição não tem salvaguarda pra repetir.");
  const criatura = await prisma.criatura.findUnique({ where: { id: instancia.criaturaId } });
  if (!criatura) throw new Error("Criatura não encontrada.");

  const bonus = bonusDeSalvaguardaDaCriatura(criatura, condicao.salvaguarda.atributo);
  const total = rolarDados([{ faces: 20, sinal: 1 }], bonus).total;
  const salv = resultadoDaSalvaguarda({ total, natural: total - bonus }, condicao.salvaguarda.cd);
  if (salv.resultado === "sucesso") await tirarCondicao(combateId, instanciaId, condicaoId);
  await avisar(
    mesaId,
    instancia.nomeExibicao,
    salv.resultado === "sucesso"
      ? `${textoDaSalvaguarda(salv)} e não está mais com ${condicao.nome}.`
      : `${textoDaSalvaguarda(salv)} e continua com ${condicao.nome}.`,
  );

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(combate.sessaoId));
}

// Liga ou desliga a privacidade das rolagens do narrador neste combate.
export async function definirRolagensPrivadas(mesaId: string, combateId: string, privadas: boolean) {
  await autorizarNarrador(mesaId);
  await combateDaMesa(mesaId, combateId);
  await prisma.combate.update({ where: { id: combateId }, data: { rolagensPrivadas: !!privadas } });
  revalidar(mesaId);
}

// Usos que restam de uma ação de criatura com usos limitados.
export async function definirUsosAcao(
  mesaId: string,
  combateId: string,
  instanciaId: string,
  componenteId: string,
  restantes: number,
) {
  await autorizarNarrador(mesaId);
  await combateDaMesa(mesaId, combateId);

  const instancia = await prisma.instanciaCombate.findFirst({
    where: { id: instanciaId, combateId },
    select: { estadoRecargas: true },
  });
  if (!instancia) throw new Error("Criatura não encontrada neste combate.");
  await prisma.instanciaCombate.update({
    where: { id: instanciaId },
    data: {
      estadoRecargas: {
        ...lerUsosAcoes(instancia.estadoRecargas),
        [String(componenteId).slice(0, 60)]: Math.max(0, Math.trunc(Number(restantes) || 0)),
      },
    },
  });
  revalidar(mesaId);
}

// Devolve (ou tira) ações do turno de um participante.
export async function definirAcoesGastas(mesaId: string, combateId: string, instanciaId: string, gastas: AcoesGastas) {
  await autorizarNarrador(mesaId);

  const combate = await prisma.combate.findUniqueOrThrow({
    where: { id: combateId },
    select: { sessao: { select: { mesaId: true } } },
  });
  if (combate.sessao.mesaId !== mesaId) throw new Error("Combate não pertence a esta mesa.");

  await prisma.instanciaCombate.updateMany({
    where: { id: instanciaId, combateId },
    data: { acoesGastas: lerAcoesGastas(gastas) },
  });
  revalidar(mesaId);
}

export async function encerrarCombate(mesaId: string, combateId: string) {
  await autorizarNarrador(mesaId);

  const combate = await prisma.combate.findUniqueOrThrow({
    where: { id: combateId },
    include: { participantes: true, sessao: { select: { mesaId: true } } },
  });
  if (combate.sessao.mesaId !== mesaId) throw new Error("Combate não pertence a esta mesa.");

  // Fecha o registro de estatísticas (PV final, resultado, vez em andamento)
  // antes de as linhas do combate sumirem.
  await finalizarRegistro(combateId);
  // PV temporário que só valia neste combate (ou até a próxima vez) acaba com ele.
  const personagemIds = combate.participantes.flatMap((p) => (p.personagemId ? [p.personagemId] : []));
  if (personagemIds.length > 0) {
    const comPvTemp = await prisma.personagem.findMany({
      where: { id: { in: personagemIds }, hpTempDuracao: { in: ["combate", "turno"] }, hpTemp: { gt: 0 } },
      select: { id: true },
    });
    await prisma.personagem.updateMany({
      where: { id: { in: personagemIds }, hpTempDuracao: { in: ["combate", "turno"] } },
      data: { hpTemp: 0, hpTempDuracao: null },
    });
    await soltarOQueDuravaComPvTemp(comPvTemp.map((p) => p.id));
    // Técnica que dura "até o fim do encontro" acaba junto.
    await encerrarTecnicasDoEncontro(personagemIds);
    for (const id of personagemIds) revalidatePath(`/ficha/${id}`);
  }
  await prisma.combate.update({ where: { id: combateId }, data: { encerradoEm: new Date(), resolucoes: [] } });
  await prisma.instanciaCombate.deleteMany({ where: { combateId } });

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(combate.sessaoId));
}

// Sessões da mesa com as estatísticas de cada combate encerrado, da mais nova
// pra mais antiga. Registro de antes das estatísticas vem só com o resumo antigo.
async function montarHistorico(mesaId: string): Promise<SessaoHistorico[]> {
  const sessoes = await prisma.sessao.findMany({
    where: { mesaId },
    orderBy: { iniciadaEm: "desc" },
    take: 20,
    include: { logs: { orderBy: { encerradoEm: "asc" } } },
  });

  return sessoes.map((s): SessaoHistorico => {
    const combates: CombateHistorico[] = s.logs.flatMap((l): CombateHistorico[] => {
      const resumo = lerResumo(l.resumo);
      // Combate ainda em andamento: some do histórico até acabar.
      if (resumo && resumo.encerradoEm === null) return [];
      return [
        {
          id: l.id,
          encerradoEm: l.encerradoEm.toISOString(),
          estatisticas: resumo ? calcularEstatisticas(resumo) : null,
          legado: resumo ? null : lerLegado(l.resumo),
        },
      ];
    });
    const comEstatisticas = combates.flatMap((c) => (c.estatisticas ? [c.estatisticas] : []));
    return {
      id: s.id,
      iniciadaEm: s.iniciadaEm.toISOString(),
      encerradaEm: s.encerradaEm?.toISOString() ?? null,
      combates,
      resumo: comEstatisticas.length > 0 ? resumirSessao(comEstatisticas) : null,
    };
  });
}

export async function carregarHistorico(mesaId: string): Promise<SessaoHistorico[]> {
  await autorizarNarrador(mesaId);
  return montarHistorico(mesaId);
}

// Combates da mesa ainda rolando: o registro deles (mesmo id) não pode sumir.
async function combatesEmAndamento(mesaId: string) {
  const ativos = await prisma.combate.findMany({
    where: { encerradoEm: null, sessao: { mesaId } },
    select: { id: true },
  });
  return ativos.map((c) => c.id);
}

// Apaga do histórico os combates escolhidos (o registro e a linha do combate
// encerrado). Devolve o histórico já sem eles, com os resumos refeitos.
export async function apagarCombatesDoHistorico(mesaId: string, ids: string[]): Promise<SessaoHistorico[]> {
  await autorizarNarrador(mesaId);

  const emAndamento = new Set(await combatesEmAndamento(mesaId));
  const alvos = [...new Set(ids)].filter((id) => typeof id === "string" && !emAndamento.has(id)).slice(0, 500);
  if (alvos.length > 0) {
    await prisma.$transaction([
      prisma.logCombate.deleteMany({ where: { id: { in: alvos }, sessao: { mesaId } } }),
      prisma.combate.deleteMany({ where: { id: { in: alvos }, encerradoEm: { not: null }, sessao: { mesaId } } }),
    ]);
  }

  return montarHistorico(mesaId);
}

// Zera o histórico da mesa: todo combate encerrado e toda sessão encerrada.
// A sessão ativa e o combate em andamento ficam.
export async function limparHistorico(mesaId: string): Promise<SessaoHistorico[]> {
  await autorizarNarrador(mesaId);

  const emAndamento = await combatesEmAndamento(mesaId);
  await prisma.$transaction([
    prisma.logCombate.deleteMany({ where: { sessao: { mesaId }, id: { notIn: emAndamento } } }),
    prisma.combate.deleteMany({ where: { sessao: { mesaId }, encerradoEm: { not: null } } }),
    // Leva junto o que ainda pendurar nelas (cascade).
    prisma.sessao.deleteMany({ where: { mesaId, encerradaEm: { not: null } } }),
  ]);

  return montarHistorico(mesaId);
}
