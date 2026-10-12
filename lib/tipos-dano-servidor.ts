// Catálogo de tipos de dano do narrador, lido da Biblioteca
// (TraitTemplate de categoria "tipoDano"). Só servidor.

import { prisma } from "@/lib/prisma";
import { lerCatalogoTipos, tipoDoCatalogo, type TipoDanoCatalogo } from "@/lib/tipos-dano";

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
