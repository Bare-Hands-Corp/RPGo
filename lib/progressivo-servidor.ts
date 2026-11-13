// Bônus progressivo no servidor: os eventos da ficha (acerto, dano, uso, d20,
// descanso) sobem, tiram ou zeram a contagem das fontes que estão valendo
// (ou de todas, no descanso). Falha aqui nunca derruba quem chamou.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { lerConcentracao } from "@/lib/duracao";
import { eventosDoProgressivo, lerEfeitos, moverProgressivos, type GatilhoProgressivo } from "@/lib/op-rpg";

export type EventoDoProgressivo = { evento: GatilhoProgressivo; vezes?: number };

// `escutam`: eventos que as fontes valendo escutam (agregado); sem nenhum deles
// (e sem a ação do evento), nem busca. `acaoId`: a ação que causou o evento.
// `todas`: mexe em toda fonte da ficha, ligada ou não (descanso).
export async function moverProgressivosNoEvento(
  personagemId: string,
  eventos: EventoDoProgressivo[],
  opcoes: { escutam?: GatilhoProgressivo[]; acaoId?: string | null; todas?: boolean } = {},
): Promise<boolean> {
  if (eventos.length === 0) return false;
  try {
    const { escutam, acaoId, todas } = opcoes;
    const agregadoEscuta = !escutam || eventos.some((x) => escutam.includes(x.evento));
    if (!agregadoEscuta && !acaoId) return false;
    const personagem = await prisma.personagem.findUnique({
      where: { id: personagemId },
      select: { concentracao: true },
    });
    const concentracao = lerConcentracao(personagem?.concentracao);
    const [habilidades, itens, acoes] = await Promise.all([
      agregadoEscuta
        ? prisma.habilidade.findMany({
            where: { personagemId, ...(todas ? {} : { OR: [{ tipo: "passiva" }, { ligada: true }] }) },
            select: { id: true, efeitos: true },
          })
        : [],
      agregadoEscuta
        ? prisma.item.findMany({
            where: { personagemId, ...(todas ? {} : { equipado: true }) },
            select: { id: true, efeitos: true },
          })
        : [],
      prisma.acao.findMany({
        where: {
          personagemId,
          ...(todas
            ? {}
            : {
                OR: [
                  ...(agregadoEscuta ? [{ emCurso: true }] : []),
                  ...(agregadoEscuta && concentracao?.tipo === "acao" ? [{ id: concentracao.id }] : []),
                  ...(acaoId ? [{ id: acaoId }] : []),
                ],
              }),
        },
        select: { id: true, efeitos: true },
      }),
    ]);
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    const mexe = (efeitos: unknown) => {
      const lidos = lerEfeitos(efeitos);
      const escuta = lidos.some(
        (e) => e.tipo === "progressivo" && eventosDoProgressivo(e).some((ev) => eventos.some((x) => x.evento === ev)),
      );
      return escuta ? moverProgressivos(lidos, eventos) : null;
    };
    for (const h of habilidades) {
      const novo = mexe(h.efeitos);
      if (novo) ops.push(prisma.habilidade.update({ where: { id: h.id, personagemId }, data: { efeitos: novo.efeitos as unknown as Prisma.InputJsonValue } }));
    }
    for (const i of itens) {
      const novo = mexe(i.efeitos);
      if (novo) ops.push(prisma.item.update({ where: { id: i.id, personagemId }, data: { efeitos: novo.efeitos as unknown as Prisma.InputJsonValue } }));
    }
    for (const a of acoes) {
      const novo = mexe(a.efeitos);
      if (novo) ops.push(prisma.acao.update({ where: { id: a.id, personagemId }, data: { efeitos: novo.efeitos as unknown as Prisma.InputJsonValue } }));
    }
    if (ops.length > 0) await prisma.$transaction(ops);
    return ops.length > 0;
  } catch (err) {
    console.error("[progressivo]", err);
    return false;
  }
}
