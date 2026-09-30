"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { parseFormulaDados, rolarDados } from "@/lib/dice";
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

  let ordem = ordemInicial;
  for (const p of participantes) {
    if (p.criaturaId) {
      const criatura = criaturas.find((c) => c.id === p.criaturaId);
      for (let i = 0; i < Math.max(1, p.quantidade); i += 1) {
        // Cada cópia rola a própria vida — duas "Soldado Recruta" no mesmo
        // grupo podem sair com PV diferente, igual rolar dado físico na mesa.
        const pv = criatura ? rolarPvCriatura(criatura.pvFormula, criatura.pvMedio) : 0;
        linhas.push({
          criaturaId: p.criaturaId,
          personagemId: null,
          nomeExibicao: criatura?.nome ?? "Criatura",
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

  const combate = await prisma.combate.findUniqueOrThrow({ where: { id: combateId }, select: { sessaoId: true } });
  const maxOrdem = await prisma.instanciaCombate.aggregate({ where: { combateId }, _max: { ordem: true } });
  const linhas = await montarLinhas(participantes, (maxOrdem._max.ordem ?? -1) + 1);
  await prisma.instanciaCombate.createMany({ data: linhas.map((l) => ({ ...l, combateId })) });

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(combate.sessaoId));
}

export async function removerParticipante(mesaId: string, instanciaId: string) {
  await autorizarNarrador(mesaId);

  const instancia = await prisma.instanciaCombate.findUniqueOrThrow({
    where: { id: instanciaId },
    select: { combate: { select: { sessaoId: true } } },
  });
  await prisma.instanciaCombate.delete({ where: { id: instanciaId } });

  revalidar(mesaId);
  return serializarSessao(await buscarSessaoCompleta(instancia.combate.sessaoId));
}

export async function atualizarPvInstancia(mesaId: string, instanciaId: string, novoPv: number) {
  await autorizarNarrador(mesaId);
  await prisma.instanciaCombate.update({ where: { id: instanciaId }, data: { pvAtual: novoPv } });
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
