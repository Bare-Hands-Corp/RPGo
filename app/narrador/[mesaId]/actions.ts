"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function removerPersonagemDaMesa(mesaId: string, personagemId: string) {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    mesa,
    personagem,
  ] = await Promise.all([
    supabase.auth.getUser(),
    prisma.mesa.findUnique({
      where: { id: mesaId },
      select: { userId: true },
    }),
    prisma.personagem.findFirst({
      where: { id: personagemId, mesaId },
      select: { id: true, nome: true },
    }),
  ]);

  if (!user) throw new Error("Não autenticado.");
  if (!mesa) throw new Error("Mesa não encontrada.");
  if (mesa.userId !== user.id) throw new Error("Apenas o narrador pode remover.");
  if (!personagem) throw new Error("Personagem não encontrado nesta mesa.");

  await prisma.personagem.update({
    where: { id: personagem.id },
    data: { mesaId: null },
  });

  revalidatePath(`/narrador/${mesaId}`);
  revalidatePath("/dashboard");
}