"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { EncontroPayload, EsquadraoPayload } from "./types";
import { serializarEncontro, serializarEsquadrao } from "./utils";

async function autorizarNarrador() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  return user;
}

function revalidar() {
  revalidatePath("/bestiario/encontros");
}

// ─── Esquadrões ─────────────────────────────────────────────────────────

export async function criarEsquadrao(payload: EsquadraoPayload) {
  const user = await autorizarNarrador();
  if (!payload.nome.trim()) throw new Error("Nome é obrigatório.");

  const esquadrao = await prisma.esquadrao.create({
    data: { nome: payload.nome.trim(), itens: payload.itens, userId: user.id },
  });
  revalidar();
  return serializarEsquadrao(esquadrao);
}

export async function atualizarEsquadrao(esquadraoId: string, payload: EsquadraoPayload) {
  const user = await autorizarNarrador();
  if (!payload.nome.trim()) throw new Error("Nome é obrigatório.");

  const existente = await prisma.esquadrao.findUnique({ where: { id: esquadraoId }, select: { userId: true } });
  if (!existente) throw new Error("Esquadrão não encontrado.");
  if (existente.userId !== user.id) throw new Error("Apenas o dono pode editar este esquadrão.");

  const esquadrao = await prisma.esquadrao.update({
    where: { id: esquadraoId },
    data: { nome: payload.nome.trim(), itens: payload.itens },
  });
  revalidar();
  return serializarEsquadrao(esquadrao);
}

export async function deletarEsquadrao(esquadraoId: string) {
  const user = await autorizarNarrador();

  const existente = await prisma.esquadrao.findUnique({ where: { id: esquadraoId }, select: { userId: true } });
  if (!existente) throw new Error("Esquadrão não encontrado.");
  if (existente.userId !== user.id) throw new Error("Apenas o dono pode remover este esquadrão.");

  await prisma.esquadrao.delete({ where: { id: esquadraoId } });
  revalidar();
}

// ─── Encontros ──────────────────────────────────────────────────────────

export async function criarEncontro(payload: EncontroPayload) {
  const user = await autorizarNarrador();
  if (!payload.nome.trim()) throw new Error("Nome é obrigatório.");

  const encontro = await prisma.encontro.create({
    data: { nome: payload.nome.trim(), tags: payload.tags, itens: payload.itens, userId: user.id },
  });
  revalidar();
  return serializarEncontro(encontro);
}

export async function atualizarEncontro(encontroId: string, payload: EncontroPayload) {
  const user = await autorizarNarrador();
  if (!payload.nome.trim()) throw new Error("Nome é obrigatório.");

  const existente = await prisma.encontro.findUnique({ where: { id: encontroId }, select: { userId: true } });
  if (!existente) throw new Error("Encontro não encontrado.");
  if (existente.userId !== user.id) throw new Error("Apenas o dono pode editar este encontro.");

  const encontro = await prisma.encontro.update({
    where: { id: encontroId },
    data: { nome: payload.nome.trim(), tags: payload.tags, itens: payload.itens },
  });
  revalidar();
  return serializarEncontro(encontro);
}

export async function deletarEncontro(encontroId: string) {
  const user = await autorizarNarrador();

  const existente = await prisma.encontro.findUnique({ where: { id: encontroId }, select: { userId: true } });
  if (!existente) throw new Error("Encontro não encontrado.");
  if (existente.userId !== user.id) throw new Error("Apenas o dono pode remover este encontro.");

  await prisma.encontro.delete({ where: { id: encontroId } });
  revalidar();
}
