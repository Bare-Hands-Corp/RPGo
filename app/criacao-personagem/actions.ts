"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type NovaFicha = {
  nome: string;
  nivel: number;
  hpMax: number;
  ppMax: number;
  cargaMaxima: number;
  forca: number;
  destreza: number;
  constituicao: number;
  sabedoria: number;
  vontade: number;
  presenca: number;
};

export async function criarPersonagem(input: NovaFicha) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const nome = input.nome.trim();
  if (!nome) throw new Error("Nome é obrigatório.");

  // HP/PP atuais começam cheios (igual valor máximo).
  const novo = await prisma.personagem.create({
    data: {
      userId: user.id,
      nome,
      nivel: Math.max(1, Math.floor(input.nivel) || 1),
      hpMax: Math.max(0, Math.floor(input.hpMax) || 0),
      hpAtual: Math.max(0, Math.floor(input.hpMax) || 0),
      ppMax: Math.max(0, Math.floor(input.ppMax) || 0),
      ppAtual: Math.max(0, Math.floor(input.ppMax) || 0),
      cargaMaxima: input.cargaMaxima > 0 ? input.cargaMaxima : 20,
      forca: Math.floor(input.forca) || 0,
      destreza: Math.floor(input.destreza) || 0,
      constituicao: Math.floor(input.constituicao) || 0,
      sabedoria: Math.floor(input.sabedoria) || 0,
      vontade: Math.floor(input.vontade) || 0,
      presenca: Math.floor(input.presenca) || 0,
    },
  });

  revalidatePath("/dashboard");
  redirect(`/ficha/${novo.id}`);
}
