// Registro das estatísticas de combate. Só servidor.
//
// O LogCombate de cada combate tem o mesmo id dele e guarda os eventos
// (lib/estatisticas-combate.ts). Gravar estatística nunca pode atrapalhar o
// jogo: toda entrada aqui engole o erro e só o loga.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { ordenarParticipantes } from "@/lib/combate";
import {
  abrirVez,
  anotarEvento,
  decidirResultado,
  fecharVez,
  garantirParticipante,
  lerResumo,
  resumoVazio,
  tipoDominante,
  type EventoAtaque,
  type EventoCombate,
  type ParticipanteRegistro,
  type ResumoCombate,
} from "@/lib/estatisticas-combate";
import type { ResultadoDano } from "@/lib/dano";

type Tx = Prisma.TransactionClient;

// Quem está no combate, com o que um balanceador vai querer saber de cada um.
async function fotografar(tx: Tx, combateId: string, rodada: number, ids?: string[]): Promise<ParticipanteRegistro[]> {
  const instancias = await tx.instanciaCombate.findMany({
    where: { combateId, ...(ids ? { id: { in: ids } } : {}) },
    select: { id: true, nomeExibicao: true, criaturaId: true, personagemId: true, pvAtual: true, pvMax: true },
  });
  const [criaturas, personagens] = await Promise.all([
    tx.criatura.findMany({
      where: { id: { in: instancias.flatMap((i) => (i.criaturaId ? [i.criaturaId] : [])) } },
      select: { id: true, nd: true, ndValor: true, xp: true, classeResistencia: true, pontosPoder: true },
    }),
    tx.personagem.findMany({
      where: { id: { in: instancias.flatMap((i) => (i.personagemId ? [i.personagemId] : [])) } },
      select: { id: true, nivel: true, hpMax: true, hpAtual: true },
    }),
  ]);
  return instancias.map((i): ParticipanteRegistro => {
    const c = criaturas.find((x) => x.id === i.criaturaId);
    const p = personagens.find((x) => x.id === i.personagemId);
    if (p) {
      return {
        id: i.id,
        nome: i.nomeExibicao,
        tipo: "personagem",
        ref: i.personagemId,
        pvMax: p.hpMax,
        pvFinal: p.hpAtual,
        nivel: p.nivel,
        entrou: rodada,
      };
    }
    return {
      id: i.id,
      nome: i.nomeExibicao,
      tipo: "criatura",
      ref: i.criaturaId,
      pvMax: i.pvMax ?? 0,
      pvFinal: i.pvAtual,
      ...(c ? { nd: c.nd, ndValor: c.ndValor, xp: c.xp, cr: c.classeResistencia, pp: c.pontosPoder } : {}),
      entrou: rodada,
    };
  });
}

// Lê o registro do combate (criando, se faltar) e deixa `mutar` mexer nele,
// com a linha travada: dois eventos ao mesmo tempo não se atropelam.
async function atualizar(
  combateId: string,
  mutar: (resumo: ResumoCombate, ctx: { rodada: number; agora: number }) => void,
  precisa: string[] = [],
) {
  try {
    await prisma.$transaction(async (tx) => {
      const combate = await tx.combate.findUnique({
        where: { id: combateId },
        select: { sessaoId: true, rodadaAtual: true },
      });
      if (!combate) return;
      const agora = Date.now();

      let existente = await tx.logCombate.findUnique({ where: { id: combateId }, select: { id: true } });
      if (!existente) {
        // Combate que já estava rolando quando o recurso entrou: o registro começa agora.
        const novo = resumoVazio(combateId, agora, true);
        novo.rodadas = combate.rodadaAtual;
        novo.participantes = await fotografar(tx, combateId, combate.rodadaAtual);
        existente = await tx.logCombate.create({
          data: { id: combateId, sessaoId: combate.sessaoId, resumo: novo as unknown as Prisma.InputJsonValue },
          select: { id: true },
        });
      }

      await tx.$queryRaw`SELECT id FROM logs_combate WHERE id = ${combateId} FOR UPDATE`;
      const log = await tx.logCombate.findUniqueOrThrow({ where: { id: combateId }, select: { resumo: true } });
      const resumo = lerResumo(log.resumo);
      if (!resumo || resumo.encerradoEm !== null) return;

      const faltam = precisa.filter((id) => !resumo.participantes.some((p) => p.id === id));
      if (faltam.length > 0) {
        for (const p of await fotografar(tx, combateId, combate.rodadaAtual, faltam)) garantirParticipante(resumo, p);
      }
      resumo.rodadas = Math.max(resumo.rodadas, combate.rodadaAtual);
      mutar(resumo, { rodada: combate.rodadaAtual, agora });

      await tx.logCombate.update({
        where: { id: combateId },
        data: { resumo: resumo as unknown as Prisma.InputJsonValue },
      });
    });
  } catch (err) {
    console.error("[estatisticas]", err);
  }
}

// ─── Ciclo do combate ──────────────────────────────────────────────────────

// Combate novo: registra quem entrou e abre a vez do primeiro da ordem.
export async function iniciarRegistro(combateId: string, sessaoId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      const agora = Date.now();
      const resumo = resumoVazio(combateId, agora, false);
      resumo.participantes = await fotografar(tx, combateId, 1);
      const primeiro = ordenarParticipantes(
        await tx.instanciaCombate.findMany({
          where: { combateId },
          select: { id: true, iniciativa: true, ordem: true },
        }),
      )[0];
      abrirVez(resumo, primeiro?.id ?? null, 1, agora);
      await tx.logCombate.upsert({
        where: { id: combateId },
        create: { id: combateId, sessaoId, resumo: resumo as unknown as Prisma.InputJsonValue },
        update: { resumo: resumo as unknown as Prisma.InputJsonValue },
      });
    });
  } catch (err) {
    console.error("[estatisticas]", err);
  }
}

// Reforço que entrou no combate.
export async function registrarReforco(combateId: string) {
  try {
    const ids = (await prisma.instanciaCombate.findMany({ where: { combateId }, select: { id: true } })).map((i) => i.id);
    await atualizar(combateId, () => undefined, ids);
  } catch (err) {
    console.error("[estatisticas]", err);
  }
}

// Quem sai do combate leva o PV de agora no registro, antes de a linha sumir.
export async function registrarSaida(combateId: string, instanciaId: string) {
  try {
    const [p] = await prisma.$transaction((tx) => fotografar(tx, combateId, 1, [instanciaId]));
    if (!p) return;
    await atualizar(
      combateId,
      (resumo, { rodada }) => {
        garantirParticipante(resumo, { ...p, saiu: rodada });
        const atual = resumo.participantes.find((x) => x.id === instanciaId);
        if (atual) atual.saiu = rodada;
      },
      [instanciaId],
    );
  } catch (err) {
    console.error("[estatisticas]", err);
  }
}

// A vez passou pra `instanciaId`.
export async function marcarVez(combateId: string, instanciaId: string | null) {
  await atualizar(
    combateId,
    (resumo, { rodada, agora }) => abrirVez(resumo, instanciaId, rodada, agora),
    instanciaId ? [instanciaId] : [],
  );
}

// Combate acabando: fecha a vez, anota o PV final de cada um e o resultado.
// Roda antes de as linhas do combate serem apagadas.
export async function finalizarRegistro(combateId: string) {
  await atualizar(combateId, () => undefined);
  try {
    await prisma.$transaction(async (tx) => {
      const combate = await tx.combate.findUnique({ where: { id: combateId }, select: { rodadaAtual: true } });
      if (!combate) return;
      await tx.$queryRaw`SELECT id FROM logs_combate WHERE id = ${combateId} FOR UPDATE`;
      const log = await tx.logCombate.findUnique({ where: { id: combateId }, select: { resumo: true } });
      const resumo = log ? lerResumo(log.resumo) : null;
      if (!resumo) return;
      const agora = Date.now();
      for (const atual of await fotografar(tx, combateId, combate.rodadaAtual)) {
        const p = resumo.participantes.find((x) => x.id === atual.id);
        if (p) p.pvFinal = atual.pvFinal;
        else resumo.participantes.push(atual);
      }
      fecharVez(resumo, agora);
      resumo.rodadas = Math.max(resumo.rodadas, combate.rodadaAtual);
      resumo.encerradoEm = agora;
      resumo.resultado = decidirResultado(resumo.participantes);
      await tx.logCombate.update({
        where: { id: combateId },
        data: { resumo: resumo as unknown as Prisma.InputJsonValue, encerradoEm: new Date(agora) },
      });
    });
  } catch (err) {
    console.error("[estatisticas]", err);
  }
}

// ─── Eventos ───────────────────────────────────────────────────────────────

type SemMeta<T> = T extends unknown ? Omit<T, "t" | "r"> : never;

function registrar(combateId: string, evento: SemMeta<EventoCombate>, envolvidos: (string | null)[]) {
  return atualizar(
    combateId,
    (resumo, { rodada, agora }) => anotarEvento(resumo, { ...evento, t: agora, r: rodada } as EventoCombate),
    envolvidos.filter((x): x is string => !!x),
  );
}

export function registrarDano(
  combateId: string,
  e: { de: string | null; para: string; valor: number; bruto: number; tipo?: string; acao?: string; caiu?: boolean },
) {
  if (!(e.valor > 0)) return Promise.resolve();
  return registrar(
    combateId,
    {
      k: "dano",
      de: e.de,
      para: e.para,
      valor: Math.trunc(e.valor),
      bruto: Math.trunc(e.bruto),
      tipo: e.tipo ?? "",
      acao: (e.acao ?? "").slice(0, 80),
      ...(e.caiu ? { caiu: true } : {}),
    },
    [e.de, e.para],
  );
}

export function registrarCura(
  combateId: string,
  e: { de: string | null; para: string; valor: number; acao?: string },
) {
  if (!(e.valor > 0)) return Promise.resolve();
  return registrar(
    combateId,
    { k: "cura", de: e.de, para: e.para, valor: Math.trunc(e.valor), acao: (e.acao ?? "").slice(0, 80) },
    [e.de, e.para],
  );
}

export function registrarPp(combateId: string, e: { de: string; valor: number; acao?: string }) {
  if (!(e.valor > 0)) return Promise.resolve();
  return registrar(combateId, { k: "pp", de: e.de, valor: Math.trunc(e.valor), acao: (e.acao ?? "").slice(0, 80) }, [e.de]);
}

// As jogadas de ataque de uma ação, todas de uma vez (uma por alvo ou explosão).
export function registrarAtaques(
  combateId: string,
  de: string,
  acao: string,
  lances: { para: string; total: number; res: EventoAtaque["res"] }[],
) {
  if (lances.length === 0) return Promise.resolve();
  return atualizar(
    combateId,
    (resumo, { rodada, agora }) => {
      for (const l of lances) {
        anotarEvento(resumo, {
          k: "ataque",
          de,
          para: l.para,
          total: Math.trunc(l.total),
          res: l.res,
          acao: acao.slice(0, 80),
          t: agora,
          r: rodada,
        });
      }
    },
    [de, ...lances.map((l) => l.para)],
  );
}

// ─── Jogador: acha o combate aberto dele ───────────────────────────────────

export async function instanciaAtivaDoPersonagem(personagemId: string) {
  try {
    return await prisma.instanciaCombate.findFirst({
      where: { personagemId, combate: { encerradoEm: null, sessao: { encerradaEm: null } } },
      select: { id: true, combateId: true },
    });
  } catch (err) {
    console.error("[estatisticas]", err);
    return null;
  }
}

// Dano que um personagem levou. `fonte` = quem causou (instância) e com o quê;
// sem ela, o dano não tem origem (jogador pondo à mão na ficha).
export async function registrarDanoEmPersonagem(
  personagemId: string,
  r: Pick<ResultadoDano, "final" | "bruto" | "partes" | "hpAtual">,
  fonte?: { de: string | null; acao: string },
) {
  const instancia = await instanciaAtivaDoPersonagem(personagemId);
  if (!instancia) return;
  await registrarDano(instancia.combateId, {
    de: fonte?.de ?? null,
    para: instancia.id,
    valor: r.final,
    bruto: r.bruto,
    tipo: tipoDominante(r.partes),
    acao: fonte?.acao ?? "Dano na ficha",
    caiu: r.hpAtual.antes > 0 && r.hpAtual.depois <= 0,
  });
}

// PV que um personagem recuperou. `deId` = quem curou (personagem); ele mesmo
// = cura em si; nulo = sem origem.
export async function registrarCuraEmPersonagem(
  personagemId: string,
  valor: number,
  acao: string,
  deId: string | null | "self",
) {
  if (!(valor > 0)) return;
  const instancia = await instanciaAtivaDoPersonagem(personagemId);
  if (!instancia) return;
  let de: string | null = null;
  if (deId === "self" || deId === personagemId) de = instancia.id;
  else if (deId) de = (await instanciaAtivaDoPersonagem(deId))?.id ?? null;
  await registrarCura(instancia.combateId, { de, para: instancia.id, valor, acao });
}

export async function registrarPpDePersonagem(personagemId: string, valor: number, acao: string) {
  if (!(valor > 0)) return;
  const instancia = await instanciaAtivaDoPersonagem(personagemId);
  if (!instancia) return;
  await registrarPp(instancia.combateId, { de: instancia.id, valor, acao });
}

