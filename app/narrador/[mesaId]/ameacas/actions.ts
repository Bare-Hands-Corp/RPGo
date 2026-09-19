"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { AmeacaPayload } from "./types";
import { serializarAmeaca } from "./utils";

async function autorizarNarrador(mesaId: string) {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    mesa,
  ] = await Promise.all([
    supabase.auth.getUser(),
    prisma.mesa.findUnique({ where: { id: mesaId }, select: { userId: true } }),
  ]);

  if (!user) throw new Error("Não autenticado.");
  if (!mesa) throw new Error("Mesa não encontrada.");
  if (mesa.userId !== user.id) throw new Error("Apenas o narrador pode editar ameaças.");

  return { user };
}

function validarAmeaca(payload: AmeacaPayload) {
  if (!payload.nome.trim()) throw new Error("Nome é obrigatório.");
  const inteiros = [
    payload.classeResistencia,
    payload.pontosVida,
    payload.classeDificuldade,
    payload.nivelDesafio,
    payload.deslocamento,
    payload.pontosPoder,
    payload.bonusProficiencia,
    payload.forca,
    payload.destreza,
    payload.constituicao,
    payload.sabedoria,
    payload.presenca,
    payload.vontade,
  ];
  if (inteiros.some((valor) => !Number.isInteger(valor))) {
    throw new Error("Os atributos e valores vitais devem ser inteiros.");
  }
  if (payload.deslocamentoNado !== null && payload.deslocamentoNado !== undefined && !Number.isInteger(payload.deslocamentoNado)) {
    throw new Error("Deslocamento de nado deve ser inteiro ou nulo.");
  }
}

function normalizarPayload(payload: AmeacaPayload) {
  return {
    nome: payload.nome.trim(),
    classeResistencia: payload.classeResistencia,
    pontosVida: payload.pontosVida,
    classeDificuldade: payload.classeDificuldade,
    nivelDesafio: payload.nivelDesafio,
    deslocamento: payload.deslocamento,
    deslocamentoNado: payload.deslocamentoNado ?? null,
    pontosPoder: payload.pontosPoder,
    bonusProficiencia: payload.bonusProficiencia,
    forca: payload.forca,
    destreza: payload.destreza,
    constituicao: payload.constituicao,
    sabedoria: payload.sabedoria,
    presenca: payload.presenca,
    vontade: payload.vontade,
    caracteristicas: payload.caracteristicas,
    aspectos: payload.aspectos,
    acoes: payload.acoes,
  };
}

type AmeacaLinha = {
  id: string;
  mesaId: string;
  nome: string;
  classeResistencia: number;
  pontosVida: number;
  classeDificuldade: number;
  nivelDesafio: number;
  deslocamento: number;
  deslocamentoNado: number | null;
  pontosPoder: number;
  bonusProficiencia: number;
  forca: number;
  destreza: number;
  constituicao: number;
  sabedoria: number;
  presenca: number;
  vontade: number;
  caracteristicas: unknown;
  aspectos: unknown;
  acoes: unknown;
  criadoEm: Date | string;
  atualizadoEm: Date | string;
};

function linhaParaAmeacaSerializada(linha: AmeacaLinha) {
  return serializarAmeaca({
    ...linha,
    criadoEm: linha.criadoEm instanceof Date ? linha.criadoEm : new Date(linha.criadoEm),
    atualizadoEm: linha.atualizadoEm instanceof Date ? linha.atualizadoEm : new Date(linha.atualizadoEm),
  });
}

function revalidar(mesaId: string) {
  revalidatePath(`/narrador/${mesaId}/ameacas`);
}

export async function criarAmeaca(mesaId: string, payload: AmeacaPayload) {
  await autorizarNarrador(mesaId);
  validarAmeaca(payload);
  const dados = normalizarPayload(payload);

  const linhas = await prisma.$queryRaw<AmeacaLinha[]>`
    INSERT INTO ameacas (
      id,
      mesa_id,
      nome,
      classe_resistencia,
      pontos_vida,
      classe_dificuldade,
      nivel_desafio,
      deslocamento,
      deslocamento_nado,
      pontos_poder,
      bonus_proficiencia,
      forca,
      destreza,
      constituicao,
      sabedoria,
      presenca,
      vontade,
      caracteristicas,
      aspectos,
      acoes,
      atualizado_em
    ) VALUES (
      gen_random_uuid(),
      ${mesaId},
      ${dados.nome},
      ${dados.classeResistencia},
      ${dados.pontosVida},
      ${dados.classeDificuldade},
      ${dados.nivelDesafio},
      ${dados.deslocamento},
      ${dados.deslocamentoNado},
      ${dados.pontosPoder},
      ${dados.bonusProficiencia},
      ${dados.forca},
      ${dados.destreza},
      ${dados.constituicao},
      ${dados.sabedoria},
      ${dados.presenca},
      ${dados.vontade},
      ${JSON.stringify(dados.caracteristicas)}::jsonb,
      ${JSON.stringify(dados.aspectos)}::jsonb,
      ${JSON.stringify(dados.acoes)}::jsonb,
      now()
    )
    RETURNING
      id,
      mesa_id AS "mesaId",
      nome,
      classe_resistencia AS "classeResistencia",
      pontos_vida AS "pontosVida",
      classe_dificuldade AS "classeDificuldade",
      nivel_desafio AS "nivelDesafio",
      deslocamento,
      deslocamento_nado AS "deslocamentoNado",
      pontos_poder AS "pontosPoder",
      bonus_proficiencia AS "bonusProficiencia",
      forca,
      destreza,
      constituicao,
      sabedoria,
      presenca,
      vontade,
      caracteristicas,
      aspectos,
      acoes,
      criado_em AS "criadoEm",
      atualizado_em AS "atualizadoEm"
  `;

  const ameaca = linhas[0];
  if (!ameaca) throw new Error("Falha ao criar ameaça.");

  revalidar(mesaId);
  return linhaParaAmeacaSerializada(ameaca);
}

export async function atualizarAmeaca(mesaId: string, ameacaId: string, payload: AmeacaPayload) {
  await autorizarNarrador(mesaId);
  validarAmeaca(payload);
  const dados = normalizarPayload(payload);

  const atualizadas = await prisma.$queryRaw<AmeacaLinha[]>`
    UPDATE ameacas
    SET
      nome = ${dados.nome},
      classe_resistencia = ${dados.classeResistencia},
      pontos_vida = ${dados.pontosVida},
      classe_dificuldade = ${dados.classeDificuldade},
      nivel_desafio = ${dados.nivelDesafio},
      deslocamento = ${dados.deslocamento},
      deslocamento_nado = ${dados.deslocamentoNado},
      pontos_poder = ${dados.pontosPoder},
      bonus_proficiencia = ${dados.bonusProficiencia},
      forca = ${dados.forca},
      destreza = ${dados.destreza},
      constituicao = ${dados.constituicao},
      sabedoria = ${dados.sabedoria},
      presenca = ${dados.presenca},
      vontade = ${dados.vontade},
      caracteristicas = ${JSON.stringify(dados.caracteristicas)}::jsonb,
      aspectos = ${JSON.stringify(dados.aspectos)}::jsonb,
      acoes = ${JSON.stringify(dados.acoes)}::jsonb,
      atualizado_em = now()
    WHERE id = ${ameacaId} AND mesa_id = ${mesaId}
    RETURNING
      id,
      mesa_id AS "mesaId",
      nome,
      classe_resistencia AS "classeResistencia",
      pontos_vida AS "pontosVida",
      classe_dificuldade AS "classeDificuldade",
      nivel_desafio AS "nivelDesafio",
      deslocamento,
      deslocamento_nado AS "deslocamentoNado",
      pontos_poder AS "pontosPoder",
      bonus_proficiencia AS "bonusProficiencia",
      forca,
      destreza,
      constituicao,
      sabedoria,
      presenca,
      vontade,
      caracteristicas,
      aspectos,
      acoes,
      criado_em AS "criadoEm",
      atualizado_em AS "atualizadoEm"
  `;
  const atualizada = atualizadas[0];
  if (!atualizada) throw new Error("Ameaça não encontrada.");

  revalidar(mesaId);
  return linhaParaAmeacaSerializada(atualizada);
}

export async function deletarAmeaca(mesaId: string, ameacaId: string) {
  await autorizarNarrador(mesaId);

  const removidas = await prisma.$executeRaw`
    DELETE FROM ameacas
    WHERE id = ${ameacaId} AND mesa_id = ${mesaId}
  `;
  if (removidas === 0) throw new Error("Ameaça não encontrada.");

  revalidar(mesaId);
}
