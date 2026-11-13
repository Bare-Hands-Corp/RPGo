// Efeito Item no servidor (ação, habilidade ou Gatilho): mexe num item da
// própria ficha ou nos Berries. Equipa, desequipa ou alterna (armadura nova
// tira a vestida), usa (gasta 1 e vale o que ele faz na hora), gasta ou ganha.
// Item que sumiu é ignorado.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { carregarAgregado } from "@/lib/efeitos-servidor";
import { opsNaHora } from "@/lib/na-hora-servidor";
import { ITEM_BERRIES, efeitoInstantaneo, lerEfeitos, type EfeitoHabilidade } from "@/lib/op-rpg";

// O que o uso tira da ficha e falta nela ("Faltam ฿ 50."); null = tem tudo.
export function faltaPraEfeitosDeItem(
  efeitos: EfeitoHabilidade[],
  itens: { id: string; nome: string; quantidade: number }[],
  berries: number,
): string | null {
  const pede = new Map<string, number>();
  for (const e of efeitos) {
    if (e.tipo !== "item" || (e.faz !== "gasta" && e.faz !== "usa")) continue;
    pede.set(e.itemId, (pede.get(e.itemId) ?? 0) + (e.faz === "usa" ? 1 : (e.quantidade ?? 1)));
  }
  for (const [id, n] of pede) {
    if (id === ITEM_BERRIES) {
      if (berries < n) return `Faltam ฿ ${(n - berries).toLocaleString("pt-BR")}.`;
      continue;
    }
    const item = itens.find((i) => i.id === id);
    if (item && item.quantidade < n) return `Falta ${item.nome}: precisa de ${n}, tem ${item.quantidade}.`;
  }
  return null;
}

// Antes do uso: o que falta na ficha pros itens e Berries que o uso gasta.
export async function conferirEfeitosDeItem(personagemId: string, efeitos: EfeitoHabilidade[], berries: number) {
  const ids = efeitos.flatMap((e) =>
    e.tipo === "item" && (e.faz === "gasta" || e.faz === "usa") && e.itemId !== ITEM_BERRIES ? [e.itemId] : [],
  );
  if (!efeitos.some((e) => e.tipo === "item" && (e.faz === "gasta" || e.faz === "usa"))) return null;
  const itens =
    ids.length > 0
      ? await prisma.item.findMany({ where: { personagemId, id: { in: ids } }, select: { id: true, nome: true, quantidade: true } })
      : [];
  return faltaPraEfeitosDeItem(efeitos, itens, berries);
}

// Devolve o que foi feito ("equipou Arco de Cobra"), pro aviso de quem chamou.
export async function aplicarEfeitosDeItem(personagemId: string, efeitos: EfeitoHabilidade[]): Promise<string[]> {
  const pedidos = efeitos.flatMap((e) => (e.tipo === "item" ? [e] : []));
  if (pedidos.length === 0) return [];
  const itens = await prisma.item.findMany({
    where: { personagemId, id: { in: pedidos.map((p) => p.itemId) } },
  });
  const feitos: string[] = [];
  for (const pedido of pedidos) {
    const n = pedido.quantidade ?? 1;
    // Berries: gasta até o que tem.
    if (pedido.itemId === ITEM_BERRIES) {
      const p = await prisma.personagem.findUniqueOrThrow({ where: { id: personagemId }, select: { berries: true } });
      const delta = pedido.faz === "ganha" ? n : -Math.min(n, p.berries);
      if (delta === 0) continue;
      await prisma.personagem.update({ where: { id: personagemId }, data: { berries: { increment: delta } } });
      feitos.push(`${delta > 0 ? "ganhou" : "gastou"} ฿ ${Math.abs(delta).toLocaleString("pt-BR")}`);
      continue;
    }
    const item = itens.find((i) => i.id === pedido.itemId);
    if (!item) continue;
    if (pedido.faz === "ganha") {
      await prisma.item.update({ where: { id: item.id, personagemId }, data: { quantidade: { increment: n } } });
      item.quantidade += n;
      feitos.push(`ganhou ${n > 1 ? `${n}× ` : ""}${item.nome}`);
      continue;
    }
    if (pedido.faz === "gasta") {
      const tira = Math.min(n, item.quantidade);
      if (tira <= 0) continue;
      await (item.quantidade > tira
        ? prisma.item.update({ where: { id: item.id, personagemId }, data: { quantidade: { decrement: tira } } })
        : prisma.item.delete({ where: { id: item.id, personagemId } }));
      item.quantidade -= tira;
      feitos.push(`gastou ${tira > 1 ? `${tira}× ` : ""}${item.nome}`);
      continue;
    }
    if (pedido.faz === "usa") {
      if (item.quantidade <= 0) continue;
      const naHora = lerEfeitos(item.efeitos).filter(efeitoInstantaneo);
      const [{ agg }, personagem, recursos] = await Promise.all([
        carregarAgregado(personagemId),
        prisma.personagem.findUniqueOrThrow({ where: { id: personagemId } }),
        prisma.recurso.findMany({ where: { personagemId } }),
      ]);
      const ops: Prisma.PrismaPromise<unknown>[] =
        naHora.length > 0 ? opsNaHora(personagem, recursos, agg, naHora, item.nome).ops : [];
      ops.push(
        item.quantidade > 1
          ? prisma.item.update({ where: { id: item.id, personagemId }, data: { quantidade: { decrement: 1 } } })
          : prisma.item.delete({ where: { id: item.id, personagemId } }),
      );
      await prisma.$transaction(ops);
      item.quantidade -= 1;
      feitos.push(`usou ${item.nome}`);
      continue;
    }
    const liga = pedido.faz === "alterna" ? !item.equipado : pedido.faz === "equipa";
    if (liga === item.equipado) continue;
    await prisma.$transaction([
      ...(liga && item.tipo === "armadura"
        ? [
            prisma.item.updateMany({
              where: { personagemId, tipo: "armadura", equipado: true, id: { not: item.id } },
              data: { equipado: false },
            }),
          ]
        : []),
      prisma.item.update({ where: { id: item.id, personagemId }, data: { equipado: liga } }),
    ]);
    item.equipado = liga;
    feitos.push(`${liga ? "equipou" : "desequipou"} ${item.nome}`);
  }
  return feitos;
}
