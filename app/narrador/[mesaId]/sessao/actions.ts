"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { parseFormulaDados, rolarDados } from "@/lib/dice";
import { defesasDaCriatura, resolverDano, type ParteDano } from "@/lib/dano";
import { comoResistencias } from "@/app/bestiario/utils";
import { CAMPOS_VISIVEIS, ordenarParticipantes, type CampoVisivel } from "@/lib/combate";
import type { NovoParticipante } from "./types";
import { serializarSessao } from "./utils";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const mesa = await prisma.mesa.findUnique({ where: { id: mesaId }, select: { userId: true } });
  if (!mesa) throw new Error("Mesa não encontrada.");
  if (mesa.userId !== user.id) throw new Error("Apenas o narrador pode gerenciar a sessão.");

  return user;
}

function revalidar(mesaId: string) {
  revalidatePath(`/narrador/${mesaId}`);
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
async function montarLinhas(participantes: NovoParticipante[], ordemInicial: number) {
  const criaturaIds = participantes.filter((p) => p.criaturaId).map((p) => p.criaturaId!);
  const personagemIds = participantes.filter((p) => p.personagemId).map((p) => p.personagemId!);

  const [criaturas, personagens] = await Promise.all([
    criaturaIds.length
      ? prisma.criatura.findMany({
          where: { id: { in: criaturaIds } },
          select: { id: true, nome: true, pvMedio: true, pvFormula: true },
        })
      : Promise.resolve([]),
    personagemIds.length
      ? prisma.personagem.findMany({ where: { id: { in: personagemIds } }, select: { id: true, nome: true } })
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

  let ordem = ordemInicial;
  for (const p of participantes) {
    if (p.criaturaId) {
      const criatura = criaturas.find((c) => c.id === p.criaturaId);
      const copias = Math.max(1, p.quantidade);
      const numerar = (totalDe.get(p.criaturaId) ?? 0) > 1;
      const numero = (numeroDe.get(p.criaturaId) ?? 0) + 1;
      numeroDe.set(p.criaturaId, numero + copias - 1);
      for (let i = 0; i < copias; i += 1) {
        // Cada cópia rola a própria vida — duas "Soldado Recruta" no mesmo
        // grupo podem sair com PV diferente, igual rolar dado físico na mesa.
        const pv = criatura ? rolarPvCriatura(criatura.pvFormula, criatura.pvMedio) : 0;
        linhas.push({
          criaturaId: p.criaturaId,
          personagemId: null,
          nomeExibicao: (criatura?.nome ?? "Criatura") + (numerar ? ` ${numero + i}` : ""),
          iniciativa: p.iniciativa,
          ordem: ordem++,
          pvAtual: pv,
          pvMax: pv,
        });
      }
    } else if (p.personagemId) {
      const personagem = personagens.find((x) => x.id === p.personagemId);
      linhas.push({
        criaturaId: null,
        personagemId: p.personagemId,
        nomeExibicao: personagem?.nome ?? "Jogador",
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
      select: { turnoAtual: true, participantes: { select: { id: true, iniciativa: true, ordem: true } } },
    });
  const antes = await ler();
  const ordemAntes = ordenarParticipantes(antes.participantes);
  // Saindo quem está na vez, ela passa pro seguinte.
  const daVez =
    ordemAntes
      .slice(antes.turnoAtual)
      .concat(ordemAntes.slice(0, antes.turnoAtual))
      .find((p) => p.id !== saindoId)?.id ?? null;

  await mudar();

  const ordemDepois = ordenarParticipantes((await ler()).participantes);
  const turno = Math.max(0, ordemDepois.findIndex((p) => p.id === daVez));
  if (turno !== antes.turnoAtual) {
    await prisma.combate.update({ where: { id: combateId }, data: { turnoAtual: turno } });
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

  // Fecha qualquer combate residual sem log detalhado — o mestre deveria
  // encerrar o combate explicitamente antes, isso é só uma rede de segurança.
  await prisma.combate.updateMany({ where: { sessaoId, encerradoEm: null }, data: { encerradoEm: new Date() } });
  await prisma.sessao.update({ where: { id: sessaoId }, data: { encerradaEm: new Date() } });

  revalidar(mesaId);
}

export async function iniciarCombate(mesaId: string, sessaoId: string, participantes: NovoParticipante[]) {
  await autorizarNarrador(mesaId);
  if (participantes.length === 0) throw new Error("Adicione pelo menos um participante.");

  const linhas = await montarLinhas(participantes, 0);
  const combate = await prisma.combate.create({ data: { sessaoId } });
  await prisma.instanciaCombate.createMany({
    data: linhas.map((l) => ({ ...l, combateId: combate.id })),
  });

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(sessaoId));
}

export async function adicionarParticipantes(mesaId: string, combateId: string, participantes: NovoParticipante[]) {
  await autorizarNarrador(mesaId);

  const combate = await prisma.combate.findUniqueOrThrow({
    where: { id: combateId },
    select: { sessaoId: true, participantes: { select: { id: true, iniciativa: true, ordem: true } } },
  });
  const linhas = await montarLinhas(participantes, 0);

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

  const instancia = await prisma.instanciaCombate.findUniqueOrThrow({
    where: { id: instanciaId },
    select: { combateId: true, combate: { select: { sessaoId: true } } },
  });
  await mudarParticipantes(
    instancia.combateId,
    () => prisma.instanciaCombate.delete({ where: { id: instanciaId } }),
    instanciaId,
  );

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(instancia.combate.sessaoId));
}

export async function atualizarPvInstancia(mesaId: string, instanciaId: string, novoPv: number) {
  await autorizarNarrador(mesaId);
  await prisma.instanciaCombate.update({ where: { id: instanciaId }, data: { pvAtual: novoPv } });
  revalidar(mesaId);
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
      criaturaId: true,
      pvAtual: true,
      pvMax: true,
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
    { hpAtual: instancia.pvAtual ?? 0, hpTemp: 0, hpMax: instancia.pvMax ?? 0 },
    { desligadas: Array.isArray(desligadas) ? desligadas.map(String) : [] },
  );

  await prisma.instanciaCombate.update({
    where: { id: instanciaId },
    data: { pvAtual: resultado.hpAtual.depois },
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

export async function atualizarPvPersonagem(mesaId: string, personagemId: string, novoHp: number) {
  await autorizarNarrador(mesaId);

  const personagem = await prisma.personagem.findUniqueOrThrow({ where: { id: personagemId }, select: { mesaId: true } });
  if (personagem.mesaId !== mesaId) throw new Error("Personagem não pertence a esta mesa.");

  await prisma.personagem.update({ where: { id: personagemId }, data: { hpAtual: novoHp } });
  revalidar(mesaId);
}

export async function avancarTurno(mesaId: string, combateId: string) {
  await autorizarNarrador(mesaId);

  const combate = await prisma.combate.findUniqueOrThrow({
    where: { id: combateId },
    select: { sessaoId: true, rodadaAtual: true, turnoAtual: true, _count: { select: { participantes: true } } },
  });

  const total = combate._count.participantes;
  let turno = combate.turnoAtual + 1;
  let rodada = combate.rodadaAtual;
  if (total === 0 || turno >= total) {
    turno = 0;
    rodada += 1;
  }

  await prisma.combate.update({ where: { id: combateId }, data: { turnoAtual: turno, rodadaAtual: rodada } });

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(combate.sessaoId));
}

export async function encerrarCombate(mesaId: string, combateId: string) {
  await autorizarNarrador(mesaId);

  const combate = await prisma.combate.findUniqueOrThrow({
    where: { id: combateId },
    include: { participantes: true },
  });

  const resumo = {
    rodadas: combate.rodadaAtual,
    participantes: combate.participantes.map((p) => ({
      nome: p.nomeExibicao,
      tipo: p.criaturaId ? "criatura" : "personagem",
      pvFinal: p.pvAtual,
    })),
  };

  await prisma.logCombate.create({ data: { sessaoId: combate.sessaoId, resumo } });
  await prisma.combate.update({ where: { id: combateId }, data: { encerradoEm: new Date() } });
  await prisma.instanciaCombate.deleteMany({ where: { combateId } });

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(combate.sessaoId));
}
