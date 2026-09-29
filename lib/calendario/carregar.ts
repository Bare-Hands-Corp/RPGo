// Lazy-create + carregamento serializado do calendário de uma mesa.
// Usado por /calendario/[mesaId] (página dedicada) e pela aba Calendário da ficha.

import { prisma } from "@/lib/prisma";
import { TEMPLATE_GREGORIANO, TIPOS_CLIMA_DEFAULT } from "./templates";
import { eventoVisivelPraJogador } from "./engine";
import type { CalendarioConfig } from "./engine";

export type EventoSerializado = {
  id: string;
  tipo: "climatico" | "narrativo";
  titulo: string;
  descricao: string | null;
  dataDias: number;
  tipoClimaId: string | null;
  oculto: boolean;
};

export type TipoClimaSerializado = {
  id: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
  pesosPorEstacao: Record<string, number>;
};

// Prazo de objetivo projetado no calendário (só leitura).
export type ObjetivoPrazo = {
  id: string;
  titulo: string;
  icone: string;
  prazoDias: number;
  personagemId: string;
  personagemNome: string;
};

export type CalendarioCarregado = {
  id: string;
  config: CalendarioConfig;
  dataAtualDias: number;
  eventos: EventoSerializado[];
  tiposClima: TipoClimaSerializado[];
};

// Cria com template gregoriano + tipos clima default. Idempotente; tolera P2002.
// Só é chamado quando o findUnique inicial veio nulo.
async function criarCalendarioDefault(mesaId: string) {
  try {
    await prisma.calendario.create({
      data: {
        mesaId,
        config: TEMPLATE_GREGORIANO as unknown as object,
        dataAtualDias: 0,
        tiposClima: {
          create: TIPOS_CLIMA_DEFAULT.map((t) => ({
            nome: t.nome,
            descricao: t.descricao,
            icone: t.icone,
            pesosPorEstacao: t.pesos,
          })),
        },
      },
    });
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code !== "P2002") throw e;
  }
}

export async function carregarCalendario(
  mesaId: string,
  opts: { isNarrador: boolean },
): Promise<CalendarioCarregado | null> {
  // Caminho quente: calendário já existe → 1 query traz tudo (calendário +
  // tiposClima + eventos). Caso raro do primeiro acesso, cria e refaz a query.
  let calendario = await prisma.calendario.findUnique({
    where: { mesaId },
    include: {
      tiposClima: { orderBy: { nome: "asc" } },
      eventos: { orderBy: { dataDias: "asc" } },
    },
  });
  if (!calendario) {
    await criarCalendarioDefault(mesaId);
    calendario = await prisma.calendario.findUnique({
      where: { mesaId },
      include: {
        tiposClima: { orderBy: { nome: "asc" } },
        eventos: { orderBy: { dataDias: "asc" } },
      },
    });
  }
  if (!calendario) return null;

  const eventos = opts.isNarrador
    ? calendario.eventos
    : calendario.eventos.filter((e) =>
        eventoVisivelPraJogador(e, calendario!.dataAtualDias),
      );

  return {
    id: calendario.id,
    config: calendario.config as unknown as CalendarioConfig,
    dataAtualDias: calendario.dataAtualDias,
    eventos: eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo as "climatico" | "narrativo",
      titulo: e.titulo,
      descricao: e.descricao,
      dataDias: e.dataDias,
      tipoClimaId: e.tipoClimaId,
      oculto: e.oculto,
    })),
    tiposClima: calendario.tiposClima.map((t) => ({
      id: t.id,
      nome: t.nome,
      descricao: t.descricao,
      icone: t.icone,
      pesosPorEstacao: (t.pesosPorEstacao as Record<string, number> | null) || {},
    })),
  };
}

// Objetivos abertos com prazo. Narrador vê todos; jogador só os dos próprios personagens.
export async function carregarObjetivosComPrazo(
  mesaId: string,
  opts: { userId: string; isNarrador: boolean },
): Promise<ObjetivoPrazo[]> {
  const objetivos = await prisma.objetivo.findMany({
    where: {
      estado: "aberto",
      prazoDias: { not: null },
      personagem: {
        mesaId,
        ...(opts.isNarrador ? {} : { userId: opts.userId }),
      },
    },
    select: {
      id: true,
      titulo: true,
      icone: true,
      prazoDias: true,
      personagemId: true,
      personagem: { select: { nome: true } },
    },
    orderBy: { prazoDias: "asc" },
  });

  return objetivos.map((o) => ({
    id: o.id,
    titulo: o.titulo,
    icone: o.icone,
    prazoDias: o.prazoDias as number,
    personagemId: o.personagemId,
    personagemNome: o.personagem.nome,
  }));
}
