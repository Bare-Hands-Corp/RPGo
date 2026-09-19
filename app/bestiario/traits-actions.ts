"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { TemplatePayload } from "./types";
import { serializarTemplate } from "./utils";

async function autorizarNarrador() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  revalidatePath("/bestiario/biblioteca");
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
