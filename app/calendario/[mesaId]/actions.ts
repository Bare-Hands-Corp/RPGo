"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { ANO_MAX, dataParaDias, diasMaximos, estacaoDoMes, sortearTipoClima, validarConfig, type CalendarioConfig } from "@/lib/calendario/engine";
import { TEMPLATES, TIPOS_CLIMA_DEFAULT } from "@/lib/calendario/templates";

// ─── Auth helpers internos ─────────────────────────────────────
async function autorizarNarrador(mesaId: string) {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    mesa,
  ] = await Promise.all([
    supabase.auth.getUser(),
    prisma.mesa.findUnique({ where: { id: mesaId } }),
  ]);
  if (!user) throw new Error("Não autenticado.");
  if (!mesa) throw new Error("Mesa não encontrada.");
  if (mesa.userId !== user.id) throw new Error("Só o narrador pode editar o calendário.");

  return { user, mesa };
}

async function calendarioIdDaMesa(mesaId: string): Promise<string> {
  const c = await prisma.calendario.findUnique({
    where: { mesaId },
    select: { id: true },
  });
  if (!c) throw new Error("Calendário não encontrado.");
  return c.id;
}

// Cap de dias máximos (ANO_MAX no engine). Lê a config corrente do calendário.
async function diasMaxDoCalendario(mesaId: string): Promise<number> {
  const c = await prisma.calendario.findUnique({
    where: { mesaId },
    select: { config: true },
  });
  if (!c) throw new Error("Calendário não encontrado.");
  return diasMaximos(c.config as unknown as CalendarioConfig);
}

function revalidar(mesaId: string) {
  revalidatePath(`/calendario/${mesaId}`);
}

// ─── Data atual / config ───────────────────────────────────────
export async function setarDataAtual(mesaId: string, dataAtualDias: number) {
  if (!Number.isInteger(dataAtualDias)) throw new Error("dataAtualDias deve ser inteiro.");
  if (dataAtualDias < 0) throw new Error("Data não pode ser anterior ao ano inicial.");

  // Auth + mesa + config do calendário em 1 round-trip paralelo (antes eram 3 seriais).
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    mesa,
    calendario,
  ] = await Promise.all([
    supabase.auth.getUser(),
    prisma.mesa.findUnique({ where: { id: mesaId }, select: { userId: true } }),
    prisma.calendario.findUnique({ where: { mesaId }, select: { config: true } }),
  ]);
  if (!user) throw new Error("Não autenticado.");
  if (!mesa) throw new Error("Mesa não encontrada.");
  if (mesa.userId !== user.id) throw new Error("Só o narrador pode editar o calendário.");
  if (!calendario) throw new Error("Calendário não encontrado.");

  const max = diasMaximos(calendario.config as unknown as CalendarioConfig);
  if (dataAtualDias > max) throw new Error(`Data ultrapassa o ano máximo (${ANO_MAX}).`);

  await prisma.calendario.update({
    where: { mesaId },
    data: { dataAtualDias },
  });
  revalidar(mesaId);
}

export async function aplicarConfig(mesaId: string, config: CalendarioConfig) {
  await autorizarNarrador(mesaId);
  const erro = validarConfig(config);
  if (erro) throw new Error(erro);

  await prisma.calendario.update({
    where: { mesaId },
    data: { config },
  });
  revalidar(mesaId);
}

export async function aplicarTemplate(
  mesaId: string,
  template: string,
  resetarTiposClima: boolean,
) {
  await autorizarNarrador(mesaId);
  const tpl = TEMPLATES[template];
  if (!tpl) throw new Error("Template desconhecido.");

  const calendario = await prisma.calendario.update({
    where: { mesaId },
    data: { config: tpl },
  });

  if (resetarTiposClima) {
    await prisma.tipoClima.deleteMany({ where: { calendarioId: calendario.id } });
    await prisma.tipoClima.createMany({
      data: TIPOS_CLIMA_DEFAULT.map((t) => ({
        calendarioId: calendario.id,
        nome: t.nome,
        descricao: t.descricao,
        icone: t.icone,
        pesosPorEstacao: t.pesos,
      })),
    });
  }
  revalidar(mesaId);
}

// ─── Eventos ───────────────────────────────────────────────────
type EventoPayload = {
  tipo: "climatico" | "narrativo";
  titulo: string;
  descricao?: string | null;
  dataDias: number;
  tipoClimaId?: string | null;
  oculto?: boolean;
};

function validarEvento(p: Partial<EventoPayload>): asserts p is EventoPayload {
  if (!p.tipo || !["climatico", "narrativo"].includes(p.tipo)) {
    throw new Error("tipo deve ser 'climatico' ou 'narrativo'.");
  }
  if (!p.titulo) throw new Error("Título é obrigatório.");
  if (!Number.isInteger(p.dataDias)) throw new Error("dataDias deve ser inteiro.");
  if (p.oculto !== undefined && typeof p.oculto !== "boolean") {
    throw new Error("oculto deve ser booleano.");
  }
}

export async function criarEvento(mesaId: string, dados: EventoPayload) {
  validarEvento(dados);
  // Auth + carga do calendário (id + config) em paralelo — antes eram 3 queries seriais.
  const [, calendario] = await Promise.all([
    autorizarNarrador(mesaId),
    prisma.calendario.findUnique({
      where: { mesaId },
      select: { id: true, config: true },
    }),
  ]);
  if (!calendario) throw new Error("Calendário não encontrado.");
  const max = diasMaximos(calendario.config as unknown as CalendarioConfig);
  if (dados.dataDias < 0 || dados.dataDias > max) {
    throw new Error(`Data do evento fora do intervalo permitido (ano 1–${ANO_MAX}).`);
  }

  await prisma.eventoCalendario.create({
    data: {
      calendarioId: calendario.id,
      tipo: dados.tipo,
      titulo: dados.titulo,
      descricao: dados.descricao || null,
      dataDias: dados.dataDias,
      tipoClimaId: dados.tipoClimaId || null,
      oculto: !!dados.oculto,
    },
  });
  revalidar(mesaId);
}

export async function atualizarEvento(
  mesaId: string,
  eventoId: string,
  dados: Partial<EventoPayload>,
) {
  await autorizarNarrador(mesaId);
  const calendarioId = await calendarioIdDaMesa(mesaId);

  const allowed: (keyof EventoPayload)[] = [
    "tipo",
    "titulo",
    "descricao",
    "dataDias",
    "tipoClimaId",
    "oculto",
  ];
  const data: Record<string, unknown> = {};
  for (const k of allowed) {
    if (dados[k] !== undefined) data[k] = dados[k];
  }
  if (data.tipo && !["climatico", "narrativo"].includes(data.tipo as string)) {
    throw new Error("tipo deve ser 'climatico' ou 'narrativo'.");
  }
  if (data.dataDias !== undefined && !Number.isInteger(data.dataDias)) {
    throw new Error("dataDias deve ser inteiro.");
  }
  if (data.dataDias !== undefined) {
    const max = await diasMaxDoCalendario(mesaId);
    const d = data.dataDias as number;
    if (d < 0 || d > max) {
      throw new Error(`Data do evento fora do intervalo permitido (ano 1–${ANO_MAX}).`);
    }
  }
  if (data.descricao === "") data.descricao = null;
  if (data.tipoClimaId === "") data.tipoClimaId = null;

  await prisma.eventoCalendario.update({
    where: { id: eventoId, calendarioId },
    data,
  });
  revalidar(mesaId);
}

export async function deletarEvento(mesaId: string, eventoId: string) {
  await autorizarNarrador(mesaId);
  const calendarioId = await calendarioIdDaMesa(mesaId);
  await prisma.eventoCalendario.delete({
    where: { id: eventoId, calendarioId },
  });
  revalidar(mesaId);
}

// ─── Tipos de clima ────────────────────────────────────────────
type TipoClimaPayload = {
  nome: string;
  descricao?: string | null;
  icone?: string | null;
  pesosPorEstacao?: Record<string, number>;
};

export async function criarTipoClima(mesaId: string, dados: TipoClimaPayload) {
  await autorizarNarrador(mesaId);
  if (!dados.nome) throw new Error("Nome é obrigatório.");
  const calendarioId = await calendarioIdDaMesa(mesaId);

  await prisma.tipoClima.create({
    data: {
      calendarioId,
      nome: dados.nome,
      descricao: dados.descricao || null,
      icone: dados.icone || null,
      pesosPorEstacao: dados.pesosPorEstacao || {},
    },
  });
  revalidar(mesaId);
}

export async function atualizarTipoClima(
  mesaId: string,
  tipoId: string,
  dados: Partial<TipoClimaPayload>,
) {
  await autorizarNarrador(mesaId);
  const calendarioId = await calendarioIdDaMesa(mesaId);

  const allowed: (keyof TipoClimaPayload)[] = [
    "nome",
    "descricao",
    "icone",
    "pesosPorEstacao",
  ];
  const data: Record<string, unknown> = {};
  for (const k of allowed) {
    if (dados[k] !== undefined) data[k] = dados[k];
  }
  if (data.descricao === "") data.descricao = null;
  if (data.icone === "") data.icone = null;

  await prisma.tipoClima.update({
    where: { id: tipoId, calendarioId },
    data,
  });
  revalidar(mesaId);
}

export async function deletarTipoClima(mesaId: string, tipoId: string) {
  await autorizarNarrador(mesaId);
  const calendarioId = await calendarioIdDaMesa(mesaId);
  await prisma.tipoClima.delete({
    where: { id: tipoId, calendarioId },
  });
  revalidar(mesaId);
}

// ─── Gerar clima em intervalo ──────────────────────────────────
export async function gerarClima(
  mesaId: string,
  dataInicio: number,
  dataFim: number,
  sobrescrever: boolean,
): Promise<{ criados: number; ignorados: number }> {
  await autorizarNarrador(mesaId);
  if (!Number.isInteger(dataInicio) || !Number.isInteger(dataFim)) {
    throw new Error("dataInicio e dataFim devem ser inteiros.");
  }
  if (dataFim < dataInicio) throw new Error("dataFim deve ser ≥ dataInicio.");
  const intervalo = dataFim - dataInicio + 1;
  if (intervalo > 3650) throw new Error("Intervalo máximo é 3650 dias.");

  const calendario = await prisma.calendario.findUnique({
    where: { mesaId },
    include: { tiposClima: true },
  });
  if (!calendario) throw new Error("Calendário não encontrado.");

  const max = diasMaximos(calendario.config as unknown as CalendarioConfig);
  if (dataInicio < 0 || dataFim > max) {
    throw new Error(`Intervalo ultrapassa o ano máximo (${ANO_MAX}).`);
  }

  if (sobrescrever) {
    await prisma.eventoCalendario.deleteMany({
      where: {
        calendarioId: calendario.id,
        tipo: "climatico",
        dataDias: { gte: dataInicio, lte: dataFim },
      },
    });
  }

  const config = calendario.config as unknown as CalendarioConfig;
  const novos: Array<{
    calendarioId: string;
    tipo: string;
    titulo: string;
    descricao: string | null;
    dataDias: number;
    tipoClimaId: string;
  }> = [];
  let ignorados = 0;
  for (let d = dataInicio; d <= dataFim; d++) {
    const { mes } = dataParaDias(d, config);
    const estacao = estacaoDoMes(mes, config);
    const tipo = sortearTipoClima(calendario.tiposClima, estacao);
    if (!tipo) {
      ignorados++;
      continue;
    }
    novos.push({
      calendarioId: calendario.id,
      tipo: "climatico",
      titulo: tipo.nome,
      descricao: tipo.descricao || null,
      dataDias: d,
      tipoClimaId: tipo.id,
    });
  }

  if (novos.length > 0) {
    await prisma.eventoCalendario.createMany({ data: novos });
  }
  revalidar(mesaId);
  return { criados: novos.length, ignorados };
}
