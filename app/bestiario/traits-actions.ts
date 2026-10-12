"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import type { TemplatePayload } from "./types";
import { serializarTemplate } from "./utils";
import { CATALOGO_PADRAO } from "@/lib/tipos-dano";
import { CATEGORIA_TIPO_DANO } from "@/lib/tipos-dano-servidor";

async function autorizarNarrador() {
  const user = await usuarioDaRequest();
  if (!user) throw new Error("Não autenticado.");
  return user;
}

function validarTemplate(payload: TemplatePayload) {
  if (!payload.nome.trim()) throw new Error("Nome é obrigatório.");
}

function normalizarPayload(payload: TemplatePayload) {
  return {
    nome: payload.nome.trim(),
    categoria: payload.categoria,
    textoTemplate: payload.textoTemplate,
    formulaParametros: payload.formula,
    tagsProve: payload.tagsProve,
    tagsConsome: payload.tagsConsome,
    tagsReageA: payload.tagsReageA,
  };
}

function revalidar() {
  revalidatePath("/bestiario");
  revalidatePath("/biblioteca");
}

export async function criarTemplate(payload: TemplatePayload) {
  const user = await autorizarNarrador();
  validarTemplate(payload);

  const template = await prisma.traitTemplate.create({
    data: { ...normalizarPayload(payload), userId: user.id },
  });

  revalidar();
  return serializarTemplate(template);
}

// Cadastra os tipos de dano do livro na biblioteca do narrador, pra ele
// editar a partir deles. Só vale com a pasta vazia; `criadoEm` em passos de
// 1 ms guarda a ordem do livro, que é a ordem do catálogo.
export async function semearTiposDano() {
  const user = await autorizarNarrador();

  const jaTem = await prisma.traitTemplate.count({ where: { userId: user.id, categoria: CATEGORIA_TIPO_DANO } });
  if (jaTem > 0) throw new Error("A pasta já tem tipos de dano.");

  const agora = Date.now();
  await prisma.traitTemplate.createMany({
    data: CATALOGO_PADRAO.map((t, i) => ({
      userId: user.id,
      nome: t.nome,
      categoria: CATEGORIA_TIPO_DANO,
      textoTemplate: "",
      formulaParametros: { cor: t.cor ?? "", cor2: "", efeito: t.efeito, icone: t.icone ?? "" },
      criadoEm: new Date(agora + i),
    })),
  });

  revalidar();
  const criados = await prisma.traitTemplate.findMany({
    where: { userId: user.id, categoria: CATEGORIA_TIPO_DANO },
    orderBy: { criadoEm: "asc" },
  });
  return criados.map(serializarTemplate);
}

export async function atualizarTemplate(templateId: string, payload: TemplatePayload) {
  const user = await autorizarNarrador();
  validarTemplate(payload);

  const existente = await prisma.traitTemplate.findUnique({ where: { id: templateId }, select: { userId: true } });
  if (!existente) throw new Error("Trait não encontrado.");
  if (existente.userId !== user.id) throw new Error("Apenas o dono pode editar este trait.");

  const template = await prisma.traitTemplate.update({
    where: { id: templateId },
    data: normalizarPayload(payload),
  });

  revalidar();
  return serializarTemplate(template);
}

export async function deletarTemplate(templateId: string) {
  const user = await autorizarNarrador();

  const existente = await prisma.traitTemplate.findUnique({ where: { id: templateId }, select: { userId: true } });
  if (!existente) throw new Error("Trait não encontrado.");
  if (existente.userId !== user.id) throw new Error("Apenas o dono pode remover este trait.");

  await prisma.traitTemplate.delete({ where: { id: templateId } });
  revalidar();
}
