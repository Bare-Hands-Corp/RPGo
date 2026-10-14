// Catálogo de tipos de dano do narrador, lido da Biblioteca
// (TraitTemplate de categoria "tipoDano"). Só servidor.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  lerCatalogoTipos,
  tipoDoCatalogo,
  trocarTipoNoTexto,
  trocarTipoNosEfeitos,
  type TipoDanoCatalogo,
} from "@/lib/tipos-dano";

export const CATEGORIA_TIPO_DANO = "tipoDano";

// Tipos na ordem em que foram criados; sem nenhum cadastrado, os do livro.
export async function catalogoTiposDoNarrador(userId: string | null | undefined): Promise<TipoDanoCatalogo[]> {
  if (!userId) return lerCatalogoTipos([]);
  const tipos = await prisma.traitTemplate.findMany({
    where: { userId, categoria: CATEGORIA_TIPO_DANO },
    orderBy: { criadoEm: "asc" },
    select: { nome: true, formulaParametros: true },
  });
  return lerCatalogoTipos(
    tipos.map((t) => tipoDoCatalogo(t.nome, (t.formulaParametros ?? {}) as Record<string, unknown>)),
  );
}

// Tipo de dano renomeado na Biblioteca: o nome novo vai pra tudo que citava o
// antigo nas mesas do narrador (ações, itens e habilidades dos personagens) e
// no bestiário dele (resistências e ações das criaturas, e os traits). Sem
// isso, uma resistência a "Fogo" deixaria de casar com um dano "Chamas".
export async function renomearTipoDano(userId: string, de: string, para: string) {
  const json = (v: unknown) => v as Prisma.InputJsonValue;
  const texto = (v: string | null) => (v == null ? v : trocarTipoNoTexto(v, de, para));

  const [acoes, itens, habilidades, criaturas, instancias, templates] = await Promise.all([
    prisma.acao.findMany({
      where: { personagem: { mesa: { userId } } },
      select: { id: true, dano: true, tipoDano: true, danosExtras: true, efeitos: true },
    }),
    prisma.item.findMany({
      where: { personagem: { mesa: { userId } } },
      select: { id: true, dano: true, danoBonus: true, efeitos: true },
    }),
    prisma.habilidade.findMany({
      where: { personagem: { mesa: { userId } } },
      select: { id: true, efeitos: true },
    }),
    prisma.criatura.findMany({ where: { userId }, select: { id: true, resistencias: true } }),
    prisma.traitInstance.findMany({
      where: { criatura: { userId } },
      select: { id: true, parametrosResolvidos: true },
    }),
    prisma.traitTemplate.findMany({ where: { userId }, select: { id: true, formulaParametros: true } }),
  ]);

  const ops: Prisma.PrismaPromise<unknown>[] = [];

  for (const a of acoes) {
    const efeitos = trocarTipoNosEfeitos(a.efeitos, de, para);
    const extras = trocarTipoNosEfeitos(
      Array.isArray(a.danosExtras)
        ? a.danosExtras.map((x) => ({ ...(x as object), tipoDano: (x as { tipo?: unknown })?.tipo }))
        : [],
      de,
      para,
    );
    const danosExtras = (extras.efeitos as { tipoDano?: unknown }[]).map(({ tipoDano, ...resto }) => ({
      ...resto,
      tipo: tipoDano ?? "",
    }));
    const dano = texto(a.dano);
    const tipoDano = texto(a.tipoDano);
    if (efeitos.mudou || extras.mudou || dano !== a.dano || tipoDano !== a.tipoDano) {
      ops.push(
        prisma.acao.update({
          where: { id: a.id },
          data: {
            dano,
            tipoDano,
            efeitos: json(efeitos.efeitos),
            ...(extras.mudou ? { danosExtras: json(danosExtras) } : {}),
          },
        }),
      );
    }
  }

  for (const i of itens) {
    const efeitos = trocarTipoNosEfeitos(i.efeitos, de, para);
    const dano = texto(i.dano);
    const danoBonus = texto(i.danoBonus);
    if (efeitos.mudou || dano !== i.dano || danoBonus !== i.danoBonus) {
      ops.push(prisma.item.update({ where: { id: i.id }, data: { dano, danoBonus, efeitos: json(efeitos.efeitos) } }));
    }
  }

  for (const h of habilidades) {
    const efeitos = trocarTipoNosEfeitos(h.efeitos, de, para);
    if (efeitos.mudou) {
      ops.push(prisma.habilidade.update({ where: { id: h.id }, data: { efeitos: json(efeitos.efeitos) } }));
    }
  }

  for (const c of criaturas) {
    const r = (c.resistencias ?? {}) as Record<string, unknown>;
    let mudou = false;
    const novo: Record<string, unknown> = { ...r };
    for (const campo of ["danoResistencia", "danoImunidade", "danoVulneravel"]) {
      if (!Array.isArray(r[campo])) continue;
      const lista = (r[campo] as unknown[]).map((x) => (typeof x === "string" ? trocarTipoNoTexto(x, de, para) : x));
      if (JSON.stringify(lista) !== JSON.stringify(r[campo])) {
        novo[campo] = lista;
        mudou = true;
      }
    }
    if (mudou) ops.push(prisma.criatura.update({ where: { id: c.id }, data: { resistencias: json(novo) } }));
  }

  for (const t of instancias) {
    const p = (t.parametrosResolvidos ?? {}) as Record<string, unknown>;
    const efeitos = trocarTipoNosEfeitos(p.efeitos, de, para);
    if (efeitos.mudou) {
      ops.push(
        prisma.traitInstance.update({
          where: { id: t.id },
          data: { parametrosResolvidos: json({ ...p, efeitos: efeitos.efeitos }) },
        }),
      );
    }
  }

  for (const t of templates) {
    const p = (t.formulaParametros ?? {}) as Record<string, unknown>;
    const efeitos = trocarTipoNosEfeitos(p.efeitos, de, para);
    if (efeitos.mudou) {
      ops.push(
        prisma.traitTemplate.update({
          where: { id: t.id },
          data: { formulaParametros: json({ ...p, efeitos: efeitos.efeitos }) },
        }),
      );
    }
  }

  if (ops.length > 0) await prisma.$transaction(ops);
  return ops.length;
}
