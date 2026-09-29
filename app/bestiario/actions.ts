"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { CriaturaPayload } from "./types";
import { ndParaValor, serializarCriatura } from "./utils";

async function autorizarNarrador() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  return user;
}

function validarCriatura(payload: CriaturaPayload) {
  if (!payload.nome.trim()) throw new Error("Nome é obrigatório.");
  if (!payload.categoria.trim()) throw new Error("Categoria é obrigatória.");
}

// Linhagem é digitada por nome (texto livre + datalist de sugestões) — não
// existe seletor de id no formulário. Acha a linhagem existente do narrador
// com esse nome ou cria uma nova; nome vazio = sem linhagem (null).
async function resolverLinhagemId(userId: string, nomeLinhagem: string): Promise<string | null> {
  const nome = nomeLinhagem.trim();
  if (!nome) return null;
  const existente = await prisma.linhagem.findFirst({ where: { userId, nome } });
  if (existente) return existente.id;
  const nova = await prisma.linhagem.create({ data: { userId, nome } });
  return nova.id;
}

function normalizarPayload(payload: CriaturaPayload) {
  return {
    nome: payload.nome.trim(),
    categoria: payload.categoria.trim(),
    tamanho: payload.tamanho,
    imagemUrl: payload.imagemUrl || null,
    tags: payload.tags,
    personalidade: payload.personalidade || null,
    ordemTier: payload.ordemTier,
    nd: payload.nd,
    ndValor: ndParaValor(payload.nd),
    xp: payload.xp,
    pontosPoder: payload.pontosPoder,
    classeResistencia: payload.classeResistencia,
    pvFormula: payload.pvFormula,
    pvMedio: payload.pvMedio,
    bonusProficiencia: payload.bonusProficiencia,
    classeDificuldade: payload.classeDificuldade,
    deslocamento: payload.deslocamento,
    deslocamentoNado: payload.deslocamentoNado,
    deslocamentoVoo: payload.deslocamentoVoo,
    forca: payload.forca,
    destreza: payload.destreza,
    constituicao: payload.constituicao,
    sabedoria: payload.sabedoria,
    presenca: payload.presenca,
    vontade: payload.vontade,
    caracteristicas: payload.caracteristicas,
    resistencias: payload.resistencias,
    anotacoesPrivadas: payload.anotacoesPrivadas || null,
    loot: payload.loot || null,
  };
}

// Componentes não têm update parcial — a cada save, apaga tudo e recria na
// ordem atual do formulário. Simples e correto pro MVP (sem biblioteca de
// traits ainda, não há referência externa a um TraitInstance específico).
function componentesParaCreate(payload: CriaturaPayload) {
  return payload.componentes.map((c, indice) => ({
    nome: c.nome.trim() || "Sem nome",
    categoria: c.categoria,
    ordem: indice,
    textoRenderizado: c.descricao,
    parametrosResolvidos: {
      efeitos: c.efeitos,
      usos: c.usos,
      recarga: c.recarga,
      alcance: c.alcance,
      custo: c.custo,
    },
  }));
}

function revalidar() {
  revalidatePath("/bestiario");
}

export async function criarCriatura(payload: CriaturaPayload) {
  const user = await autorizarNarrador();
  validarCriatura(payload);
  const dados = normalizarPayload(payload);
  const linhagemId = await resolverLinhagemId(user.id, payload.linhagem);

  const criatura = await prisma.criatura.create({
    data: {
      ...dados,
      linhagemId,
      userId: user.id,
      componentes: { create: componentesParaCreate(payload) },
    },
    include: { componentes: true, linhagem: true },
  });

  revalidar();
  return serializarCriatura(criatura);
}

export async function atualizarCriatura(criaturaId: string, payload: CriaturaPayload) {
  const user = await autorizarNarrador();
  validarCriatura(payload);
  const dados = normalizarPayload(payload);
  const linhagemId = await resolverLinhagemId(user.id, payload.linhagem);

  const existente = await prisma.criatura.findUnique({ where: { id: criaturaId }, select: { userId: true } });
  if (!existente) throw new Error("Criatura não encontrada.");
  if (existente.userId !== user.id) throw new Error("Apenas o dono pode editar esta criatura.");

  const criatura = await prisma.criatura.update({
    where: { id: criaturaId },
    data: {
      ...dados,
      linhagemId,
      componentes: {
        deleteMany: {},
        create: componentesParaCreate(payload),
      },
    },
    include: { componentes: true, linhagem: true },
  });

  revalidar();
  return serializarCriatura(criatura);
}

export async function deletarCriatura(criaturaId: string) {
  const user = await autorizarNarrador();

  const existente = await prisma.criatura.findUnique({ where: { id: criaturaId }, select: { userId: true } });
  if (!existente) throw new Error("Criatura não encontrada.");
  if (existente.userId !== user.id) throw new Error("Apenas o dono pode remover esta criatura.");

  await prisma.criatura.delete({ where: { id: criaturaId } });
  revalidar();
}
