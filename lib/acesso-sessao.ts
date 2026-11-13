// Quem pode ler e escrever numa sessão de chat. Só servidor.
// A sessão é a mesa; ficha sem mesa conversa na sessão do próprio personagem
// (ver sessaoDoChat em lib/acesso-ficha.ts).

import { prisma } from "@/lib/prisma";

export type AcessoSessao = {
  // Narrador da mesa, ou dono da ficha quando a sessão é só dela.
  administra: boolean;
};

// null = o usuário não participa da sessão.
export async function acessoASessao(sessionId: string, userId: string): Promise<AcessoSessao | null> {
  if (typeof sessionId !== "string" || sessionId.length === 0 || sessionId.length > 64) return null;

  const mesa = await prisma.mesa.findUnique({ where: { id: sessionId }, select: { userId: true } });
  if (mesa) {
    if (mesa.userId === userId) return { administra: true };
    const membro = await prisma.personagem.findFirst({
      where: { userId, OR: [{ mesaId: sessionId }, { dono: { mesaId: sessionId } }] },
      select: { id: true },
    });
    return membro ? { administra: false } : null;
  }

  // Ficha sem mesa: a sessão é o id do personagem (ou do dono da subficha).
  const ficha = await prisma.personagem.findFirst({
    where: { userId, OR: [{ id: sessionId }, { donoPersonagemId: sessionId }] },
    select: { id: true },
  });
  return ficha ? { administra: true } : null;
}
