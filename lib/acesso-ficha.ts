// Quem pode abrir e mexer numa ficha, e com quem ela joga. Só servidor.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// O que a checagem de acesso lê junto da ficha.
export const INCLUDE_ACESSO = {
  mesa: true,
  dono: {
    select: { id: true, nome: true, mesaId: true, mesa: { select: { userId: true } } },
  },
  mesaDona: { select: { id: true, nome: true, userId: true } },
} as const;

type FichaComDono = {
  id: string;
  userId: string;
  mesaId: string | null;
  donoMesaId: string | null;
  // Ficha da mesa só do narrador (navio inimigo).
  doNarrador?: boolean;
  mesa: { userId: string } | null;
  dono: { id: string; mesaId: string | null; mesa: { userId: string } | null } | null;
  mesaDona: { userId: string } | null;
};

type ComMesa = {
  mesaId: string | null;
  donoMesaId: string | null;
  dono: { mesaId: string | null } | null;
};

// Fichas de jogador: nem subficha de personagem nem ficha da mesa.
export const SO_PRINCIPAIS = { donoPersonagemId: null, donoMesaId: null } as const;

// Mesa em que a ficha joga: a dela, a do dono ou a mesa dona.
// (a subficha guarda a do dono em `mesaId`; o resto cobre linha antiga).
export function mesaEfetiva(p: ComMesa): string | null {
  return p.mesaId ?? p.dono?.mesaId ?? p.donoMesaId ?? null;
}

// Sessão do chat: a mesa; sem mesa, a subficha fala na sessão do dono.
export function sessaoDoChat(
  p: ComMesa & { id: string; dono: { id: string; mesaId: string | null } | null },
): string {
  return mesaEfetiva(p) ?? p.dono?.id ?? p.id;
}

// Dono ou narrador da mesa; subficha da mesa, qualquer membro. null = sem acesso.
export async function acessoAFicha(
  p: FichaComDono,
  userId: string,
): Promise<{ isDono: boolean; isNarrador: boolean } | null> {
  const narrador = p.mesa?.userId ?? p.dono?.mesa?.userId ?? p.mesaDona?.userId;
  const isNarrador = narrador === userId;
  if (p.donoMesaId) {
    if (isNarrador) return { isDono: false, isNarrador };
    if (p.doNarrador) return null;
    const membro = await prisma.personagem.findFirst({
      where: { mesaId: p.donoMesaId, userId, ...SO_PRINCIPAIS },
      select: { id: true },
    });
    return membro ? { isDono: false, isNarrador: false } : null;
  }
  const isDono = p.userId === userId;
  return isDono || isNarrador ? { isDono, isNarrador } : null;
}

// Fichas que jogam com `id`: a mesma mesa (membros, subfichas deles e as da mesa)
// ou, sem mesa, o dono e as subfichas dele.
export function mesmoGrupo(id: string): Prisma.PersonagemWhereInput {
  const mesaDe: Prisma.MesaWhereInput = {
    OR: [
      { personagens: { some: { id } } },
      { personagens: { some: { subfichas: { some: { id } } } } },
      { subfichas: { some: { id } } },
    ],
  };
  // Navio inimigo do narrador não joga com ninguém.
  return {
    doNarrador: false,
    OR: [
      { mesa: mesaDe },
      { dono: { mesa: mesaDe } },
      { mesaDona: mesaDe },
      { subfichas: { some: { id } } },
      { donoPersonagemId: id },
      { dono: { subfichas: { some: { id } } } },
    ],
  };
}

// As mesmas fichas, pra quem já sabe a mesa e o dono de `p`.
export function fichasDoGrupo(p: {
  id: string;
  mesaId: string | null;
  donoPersonagemId: string | null;
  donoMesaId: string | null;
  dono: { mesaId: string | null } | null;
}): Prisma.PersonagemWhereInput {
  const mesaId = mesaEfetiva(p);
  if (mesaId) {
    return { doNarrador: false, OR: [{ mesaId }, { dono: { mesaId } }, { donoMesaId: mesaId }] };
  }
  const raiz = p.donoPersonagemId ?? p.id;
  return { OR: [{ id: raiz }, { donoPersonagemId: raiz }] };
}
