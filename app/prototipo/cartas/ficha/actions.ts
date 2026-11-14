"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { carregarParaCopia, copiarFicha, opsDeCopia, semLinhas } from "@/lib/clonar-ficha";

// Protótipo: clona uma ficha principal do usuário pra testar as cartas sem mexer na original.
export async function clonarParaCartas(formData: FormData) {
  if (process.env.NODE_ENV === "production") throw new Error("Só em desenvolvimento.");
  const user = await usuarioDaRequest();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const origem = await carregarParaCopia(id);
  if (!origem || origem.userId !== user.id || origem.donoPersonagemId || origem.donoMesaId) {
    throw new Error("Ficha não encontrada.");
  }
  const linhas = semLinhas();
  const novo = copiarFicha(origem, { nome: `${origem.nome} (cartas)`, molde: false, moldeId: null }, linhas);
  await prisma.$transaction(opsDeCopia(linhas));
  redirect(`/prototipo/cartas/ficha?id=${novo}`);
}
