"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

function gerarCodigoAcesso(): string {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

async function userIdOrThrow(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  return user.id;
}

export async function criarMesa(input: { nome: string; bannerUrl?: string }) {
  const userId = await userIdOrThrow();

  const nome = input.nome.trim();
  if (!nome) throw new Error("Nome da mesa é obrigatório.");

  // Garante código único — tenta até 5 vezes, depois desiste.
  let codigoAcesso = gerarCodigoAcesso();
  for (let i = 0; i < 5; i++) {
    const existing = await prisma.mesa.findUnique({ where: { codigoAcesso } });
    if (!existing) break;
    codigoAcesso = gerarCodigoAcesso();
  }

  await prisma.mesa.create({
    data: {
      userId,
      nome,
      codigoAcesso,
      bannerUrl: input.bannerUrl?.trim() || null,
    },
  });

  revalidatePath("/dashboard");
}

export async function deletarMesa(mesaId: string) {
  const userId = await userIdOrThrow();
  const mesa = await prisma.mesa.findUnique({ where: { id: mesaId } });
  if (!mesa) throw new Error("Mesa não encontrada.");
  if (mesa.userId !== userId) throw new Error("Apenas o narrador pode apagar.");

  await prisma.mesa.delete({ where: { id: mesaId } });
  revalidatePath("/dashboard");
}

export async function deletarPersonagem(personagemId: string) {
  const userId = await userIdOrThrow();
  const personagem = await prisma.personagem.findUnique({
    where: { id: personagemId },
  });
  if (!personagem) throw new Error("Personagem não encontrado.");
  if (personagem.userId !== userId) throw new Error("Sem permissão.");

  await prisma.personagem.delete({ where: { id: personagemId } });
  revalidatePath("/dashboard");
}
