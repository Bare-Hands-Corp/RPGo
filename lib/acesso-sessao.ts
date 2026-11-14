// Quem pode ler e escrever numa sessão de chat. Só servidor.
// A sessão é a mesa; ficha sem mesa conversa na sessão do próprio personagem
// (ver sessaoDoChat em lib/acesso-ficha.ts).
//
// As rolagens privadas do narrador ficam numa sessão à parte, `<mesa>:narrador`:
// o chat dos jogadores nunca lista nem assina essa sessão, e aqui só o narrador
// da mesa passa. (No banco, prisma/mensagens-rls.sql fecha o acesso direto.)

import { prisma } from "@/lib/prisma";

const SUFIXO_PRIVADA = ":narrador";

// Sessão onde ficam as rolagens privadas do narrador da mesa.
export function sessaoPrivadaDe(mesaId: string): string {
  return `${mesaId}${SUFIXO_PRIVADA}`;
}

export function ehSessaoPrivada(sessionId: string): boolean {
  return sessionId.endsWith(SUFIXO_PRIVADA);
}

export type AcessoSessao = {
  // Narrador da mesa, ou dono da ficha quando a sessão é só dela.
  administra: boolean;
  // Narrador de uma mesa: é quem enxerga as rolagens privadas.
  narrador: boolean;
};

// null = o usuário não participa da sessão.
export async function acessoASessao(sessionId: string, userId: string): Promise<AcessoSessao | null> {
  if (typeof sessionId !== "string" || sessionId.length === 0 || sessionId.length > 80) return null;

  // Sessão privada: só o narrador da mesa.
  if (ehSessaoPrivada(sessionId)) {
    const mesaId = sessionId.slice(0, -SUFIXO_PRIVADA.length);
    const mesa = await prisma.mesa.findUnique({ where: { id: mesaId }, select: { userId: true } });
    return mesa && mesa.userId === userId ? { administra: true, narrador: true } : null;
  }

  const mesa = await prisma.mesa.findUnique({ where: { id: sessionId }, select: { userId: true } });
  if (mesa) {
    if (mesa.userId === userId) return { administra: true, narrador: true };
    const membro = await prisma.personagem.findFirst({
      where: { userId, OR: [{ mesaId: sessionId }, { dono: { mesaId: sessionId } }] },
      select: { id: true },
    });
    return membro ? { administra: false, narrador: false } : null;
  }

  // Ficha sem mesa: a sessão é o id do personagem (ou do dono da subficha).
  const ficha = await prisma.personagem.findFirst({
    where: { userId, OR: [{ id: sessionId }, { donoPersonagemId: sessionId }] },
    select: { id: true },
  });
  return ficha ? { administra: true, narrador: false } : null;
}
