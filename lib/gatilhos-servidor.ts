// Efeito Gatilho no servidor: um evento da ficha (d20, acerto, dano, turno,
// uso) faz valer os efeitos do `faz` dos gatilhos que batem, em quem tem:
// recurso, cura, PV temporário, condição, colateral, ação extra e item. Falha aqui
// nunca derruba quem chamou: o evento já aconteceu.

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INCLUDE_ACESSO, sessaoDoChat } from "@/lib/acesso-ficha";
import { carregarAgregado } from "@/lib/efeitos-servidor";
import { aplicarColaterais } from "@/lib/colaterais-servidor";
import { aplicarCondicoesNoPersonagem, removerCondicoesPorEfeito } from "@/lib/combate-servidor";
import { aplicarEfeitosDeItem } from "@/lib/itens-servidor";
import { opsNaHora } from "@/lib/na-hora-servidor";
import { moverProgressivosNoEvento, type EventoDoProgressivo } from "@/lib/progressivo-servidor";
import { comAcoesGanhas, lerAcoesGastas } from "@/lib/combate";
import { lerRodadas, type CondicaoAplicada } from "@/lib/condicoes";
import {
  EVENTOS_PROGRESSIVO,
  acoesGanhasNoUso,
  eventosDoD20,
  gatilhosDoEvento,
  gatilhosDosEfeitos,
  textoDoFaz,
  type EfeitoHabilidade,
  type EventoGatilho,
} from "@/lib/op-rpg";

export type GatilhoDisparado = { fonte: string; texto: string };
// O que mudou na ficha, pro otimismo de quem chamou.
export type DeltasDoGatilho = { ppAtual: number; exaustao: number; hpAtual: number; recursos: Record<string, number> };

const NADA = { disparados: [] as GatilhoDisparado[], deltas: { ppAtual: 0, exaustao: 0, hpAtual: 0, recursos: {} } };

// O evento do Gatilho como evento do bônus progressivo (d20: críticos e 1 natural).
function eventosDoProgressivo(evento: EventoGatilho): EventoDoProgressivo[] {
  if (evento.tipo === "d20") return eventosDoD20(evento.lances);
  const achado = EVENTOS_PROGRESSIVO.find((x) => x.slug === evento.tipo);
  return achado ? [{ evento: achado.slug, vezes: evento.vezes ?? 1 }] : [];
}

// Gatilhos de uma ação que não está em curso (em curso, eles já estão no agregado).
async function gatilhosDaAcao(personagemId: string, acaoId: string) {
  const [acao, personagem] = await Promise.all([
    prisma.acao.findFirst({ where: { id: acaoId, personagemId }, select: { id: true, nome: true, efeitos: true, emCurso: true } }),
    prisma.personagem.findUnique({ where: { id: personagemId }, select: { concentracao: true } }),
  ]);
  if (!acao || acao.emCurso) return [];
  const concentra = personagem?.concentracao as { tipo?: unknown; id?: unknown } | null;
  if (concentra?.tipo === "acao" && concentra.id === acao.id) return [];
  return gatilhosDosEfeitos(acao.efeitos, acao.nome);
}

export async function aplicarGatilhos(
  personagemId: string,
  evento: EventoGatilho,
  // Fora do Rolador (que mostra o aviso na tela), o que disparou vai pro chat.
  // `acaoId`: a ação que causou o evento (o ataque dela, o uso); os gatilhos dela valem nele.
  opcoes: { chat?: boolean; acaoId?: string | null } = { chat: true },
): Promise<{ disparados: GatilhoDisparado[]; deltas: DeltasDoGatilho }> {
  try {
    const { agg } = await carregarAgregado(personagemId);
    // Bônus progressivo que sobe, perde ou zera com o evento.
    const mexeu = await moverProgressivosNoEvento(personagemId, eventosDoProgressivo(evento), {
      escutam: agg.eventosProgressivo ?? [],
      acaoId: opcoes.acaoId,
    });
    if (mexeu) revalidatePath(`/ficha/${personagemId}`);
    const daAcao = opcoes.acaoId ? await gatilhosDaAcao(personagemId, opcoes.acaoId) : [];
    // "Oferece ação" é da tela (o card da ação oferecida), não acontece aqui.
    const batem = gatilhosDoEvento([...(agg.gatilhos ?? []), ...daAcao], evento)
      .map((g) => ({ ...g, faz: g.faz.filter((e) => e.tipo !== "oferece_acao") }))
      .filter((g) => g.faz.length > 0);
    if (batem.length === 0) return NADA;
    const [personagem, recursos] = await Promise.all([
      prisma.personagem.findUnique({ where: { id: personagemId }, include: INCLUDE_ACESSO }),
      prisma.recurso.findMany({ where: { personagemId } }),
    ]);
    if (!personagem) return NADA;
    const nomeRecurso = (id: string) => recursos.find((r) => r.id === id)?.nome;
    const ctx = agg.ctxFormula;

    // Cada gatilho vale uma vez por vez que bateu (multiataque conta cada ataque).
    const porGatilho = batem.map((g) => ({ fonte: g.fonte, vezes: g.vezes, efeitos: Array.from({ length: g.vezes }, () => g.faz).flat() }));
    const todos = porGatilho.flatMap((g) => g.efeitos);

    // 1. Na hora: recurso, cura e PV temporário.
    const { ops, dados, recursosDelta } = opsNaHora(
      personagem,
      recursos,
      agg,
      todos,
      [...new Set(porGatilho.map((g) => g.fonte))].join(", "),
    );

    // 2. Ação extra: só no combate, no turno de agora.
    const ganhas = acoesGanhasNoUso(todos);
    if (Object.keys(ganhas).length > 0) {
      const instancia = await prisma.instanciaCombate.findFirst({
        where: { personagemId, combate: { encerradoEm: null, sessao: { encerradaEm: null } } },
        select: { id: true, acoesGastas: true },
      });
      if (instancia) {
        const novas = comAcoesGanhas(lerAcoesGastas(instancia.acoesGastas), ganhas);
        ops.push(
          prisma.instanciaCombate.update({
            where: { id: instancia.id },
            data: { acoesGastas: novas as unknown as Prisma.InputJsonValue },
          }),
        );
      }
    }

    const disparados = porGatilho.map((g) => {
      const uma = g.efeitos.slice(0, g.efeitos.length / Math.max(1, g.vezes));
      const texto = textoDoFaz(uma, nomeRecurso, ctx ?? undefined);
      return { fonte: g.fonte, texto: g.vezes > 1 ? `${texto} ×${g.vezes}` : texto };
    });
    if (opcoes.chat !== false) {
      ops.push(
        prisma.mensagem.create({
          data: {
            sessionId: sessaoDoChat(personagem),
            uid: "combate",
            nome: personagem.nome,
            mensagem: disparados.map((x) => `${x.fonte}: ${x.texto}`).join("; ") + ".",
            tipo: "texto",
          },
        }),
      );
    }
    if (ops.length > 0) await prisma.$transaction(ops);

    // 3. Condição em você, remover condição e colaterais, pela fonte de cada gatilho.
    for (const g of porGatilho) {
      const condicoes: CondicaoAplicada[] = g.efeitos.flatMap((e) =>
        e.tipo === "condicao_aplicar"
          ? [
              {
                nome: e.condicao,
                rodadas: lerRodadas(e.rodadas),
                ...(e.rodadas ? {} : { usaPadroes: true }),
                salvaguarda: null,
                ...(e.mecanica ? { mecanica: e.mecanica } : {}),
              },
            ]
          : [],
      );
      if (condicoes.length > 0) await aplicarCondicoesNoPersonagem(personagemId, condicoes, g.fonte);
      await removerCondicoesPorEfeito(personagemId, g.efeitos, g.fonte);
      const colaterais: EfeitoHabilidade[] = g.efeitos.flatMap((e) => (e.tipo === "colateral" ? [{ ...e, quando: "uso" as const }] : []));
      if (colaterais.length > 0) await aplicarColaterais(personagemId, { nome: g.fonte, efeitos: colaterais, grau: 0 }, "uso");
      await aplicarEfeitosDeItem(personagemId, g.efeitos);
    }

    revalidatePath(`/ficha/${personagemId}`);
    return {
      disparados,
      deltas: {
        ppAtual: typeof dados.ppAtual === "number" ? dados.ppAtual - personagem.ppAtual : 0,
        exaustao: typeof dados.exaustao === "number" ? dados.exaustao - personagem.exaustao : 0,
        hpAtual: typeof dados.hpAtual === "number" ? dados.hpAtual - personagem.hpAtual : 0,
        recursos: recursosDelta,
      },
    };
  } catch (err) {
    console.error("[gatilhos]", err);
    return NADA;
  }
}

// Passou a vez no combate: fim do turno de quem saiu, início do de quem entrou.
export async function gatilhosDaVez(vez: { saiu: string | null; entrou: string | null }) {
  if (vez.saiu) await aplicarGatilhos(vez.saiu, { tipo: "fim_turno" });
  if (vez.entrou) await aplicarGatilhos(vez.entrou, { tipo: "inicio_turno" });
}
