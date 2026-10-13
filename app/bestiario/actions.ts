"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { EFEITO_COR_PADRAO } from "@/lib/estilos-cor";
import { lerEfeitos } from "@/lib/op-rpg";
import { lerGatilho } from "@/lib/combate";
import { CATEGORIAS_GUARDADAS } from "./types";
import type { ComponentePayload, CriaturaPayload, OrigemTemplate } from "./types";
import { ndParaValor, serializarCriatura } from "./utils";

async function autorizarNarrador() {
  const user = await usuarioDaRequest();
  if (!user) throw new Error("Não autenticado.");
  return user;
}

function validarCriatura(payload: CriaturaPayload) {
  if (!payload.nome.trim()) throw new Error("Nome é obrigatório.");
  if (!payload.categoria.trim()) throw new Error("Categoria é obrigatória.");
}

// Linhagem é digitada por nome (texto livre + datalist de sugestões) — não
// existe seletor de id no formulário. Acha a linhagem existente do narrador
// com esse nome ou cria uma nova; nome vazio = sem linhagem (null).
async function resolverLinhagemId(userId: string, nomeLinhagem: string): Promise<string | null> {
  const nome = nomeLinhagem.trim();
  if (!nome) return null;
  const existente = await prisma.linhagem.findFirst({ where: { userId, nome } });
  if (existente) return existente.id;
  const nova = await prisma.linhagem.create({ data: { userId, nome } });
  return nova.id;
}

function normalizarPayload(payload: CriaturaPayload) {
  return {
    nome: payload.nome.trim(),
    categoria: payload.categoria.trim(),
    tamanho: payload.tamanho,
    imagemUrl: payload.imagemUrl || null,
    tags: payload.tags,
    personalidade: payload.personalidade || null,
    ordemTier: payload.ordemTier,
    nd: payload.nd,
    ndValor: ndParaValor(payload.nd),
    xp: payload.xp,
    pontosPoder: payload.pontosPoder,
    classeResistencia: payload.classeResistencia,
    pvFormula: payload.pvFormula,
    pvMedio: payload.pvMedio,
    bonusProficiencia: payload.bonusProficiencia,
    classeDificuldade: payload.classeDificuldade,
    deslocamento: payload.deslocamento,
    deslocamentoNado: payload.deslocamentoNado,
    deslocamentoVoo: payload.deslocamentoVoo,
    forca: payload.forca,
    destreza: payload.destreza,
    constituicao: payload.constituicao,
    sabedoria: payload.sabedoria,
    presenca: payload.presenca,
    vontade: payload.vontade,
    // Recursos e ações lendárias vão dentro do Json de características (sem coluna própria).
    caracteristicas: {
      ...payload.caracteristicas,
      acoesLendarias: Math.min(9, Math.max(0, Math.trunc(Number(payload.acoesLendarias) || 0))),
      recursos: payload.recursos
        .filter((r) => r.nome.trim())
        .map((r) => ({ ...r, nome: r.nome.trim(), valorMax: Math.max(0, Math.trunc(Number(r.valorMax) || 0)) })),
    },
    resistencias: payload.resistencias,
    anotacoesPrivadas: payload.anotacoesPrivadas || null,
    loot: payload.loot || null,
  };
}

// O que a ação guarda além de nome e texto; é o mesmo conteúdo na criatura
// (TraitInstance.parametrosResolvidos) e na biblioteca (formulaParametros).
function parametrosDe(c: ComponentePayload) {
  return {
    efeitos: c.efeitos,
    efeitosExtras: lerEfeitos(c.efeitosExtras),
    usos: c.usos,
    recarga: c.recarga,
    alcance: c.alcance,
    custo: c.custo,
    tecnica: c.tecnica === true,
    grau: c.tecnica === true ? Math.min(7, Math.max(0, Math.trunc(Number(c.grau) || 0))) : 0,
    custoLendario: Math.min(9, Math.max(1, Math.trunc(Number(c.custoLendario) || 1))),
    gatilho: lerGatilho(c.gatilho),
  };
}

// Toda ação e aspecto da criatura fica guardado na biblioteca, na pasta dela.
// Devolve o id da entrada de cada componente, na ordem do payload. O que veio
// da pasta de outra criatura continua sendo dela: aqui é uma cópia ajustada e
// não mexe no original. Entrada apagada da biblioteca não é recriada.
async function guardarNaBiblioteca(userId: string, origem: OrigemTemplate, componentes: ComponentePayload[]) {
  const ids = componentes.map((c) => c.templateId).filter((id): id is string => !!id);
  const existentes =
    ids.length > 0
      ? await prisma.traitTemplate.findMany({
          where: { userId, id: { in: ids } },
          select: { id: true, formulaParametros: true },
        })
      : [];
  const formulaDe = new Map(existentes.map((t) => [t.id, (t.formulaParametros ?? {}) as Record<string, unknown>]));

  const saida: (string | null)[] = [];
  for (const c of componentes) {
    const nome = c.nome.trim();
    if (!nome || !CATEGORIAS_GUARDADAS.includes(c.categoria)) {
      saida.push(c.templateId);
      continue;
    }
    if (c.templateId) {
      const formula = formulaDe.get(c.templateId);
      const dona = (formula?.origem as { criaturaId?: unknown } | undefined)?.criaturaId;
      if (formula && dona === origem.criaturaId) {
        await prisma.traitTemplate.update({
          where: { id: c.templateId },
          data: {
            nome,
            categoria: c.categoria,
            textoTemplate: c.descricao,
            formulaParametros: { ...formula, ...parametrosDe(c), origem },
          },
        });
      }
      saida.push(c.templateId);
      continue;
    }
    const criado = await prisma.traitTemplate.create({
      data: {
        userId,
        nome,
        categoria: c.categoria,
        textoTemplate: c.descricao,
        formulaParametros: { ...parametrosDe(c), cor: "", cor2: "", efeito: EFEITO_COR_PADRAO, icone: "", origem },
      },
      select: { id: true },
    });
    saida.push(criado.id);
  }
  return saida;
}

// Criatura renomeada: a pasta dela na biblioteca acompanha, inclusive nas
// ações que ela já não usa.
async function renomearPasta(userId: string, origem: OrigemTemplate) {
  const daPasta = await prisma.traitTemplate.findMany({
    where: { userId, formulaParametros: { path: ["origem", "criaturaId"], equals: origem.criaturaId } },
    select: { id: true, formulaParametros: true },
  });
  for (const t of daPasta) {
    const formula = (t.formulaParametros ?? {}) as Record<string, unknown>;
    if ((formula.origem as { nome?: unknown } | undefined)?.nome === origem.nome) continue;
    await prisma.traitTemplate.update({ where: { id: t.id }, data: { formulaParametros: { ...formula, origem } } });
  }
}

// Componentes não têm update parcial — a cada save, apaga tudo e recria na
// ordem atual do formulário. `manter` são os ids que já eram desta criatura:
// eles continuam os mesmos, porque um combate em andamento guarda usos e ações
// reveladas por id.
function componentesParaCreate(
  payload: CriaturaPayload,
  templateIds: (string | null)[],
  manter: Set<string> = new Set(),
) {
  return payload.componentes.map((c, indice) => ({
    ...(manter.has(c.id) ? { id: c.id } : {}),
    nome: c.nome.trim() || "Sem nome",
    categoria: c.categoria,
    ordem: indice,
    traitTemplateId: templateIds[indice] ?? null,
    textoRenderizado: c.descricao,
    parametrosResolvidos: parametrosDe(c),
  }));
}

function revalidar() {
  revalidatePath("/bestiario");
  revalidatePath("/biblioteca");
}

export async function criarCriatura(payload: CriaturaPayload) {
  const user = await autorizarNarrador();
  validarCriatura(payload);
  const dados = normalizarPayload(payload);
  const linhagemId = await resolverLinhagemId(user.id, payload.linhagem);
  // O id nasce aqui pra pasta da biblioteca já apontar pra criatura.
  const id = crypto.randomUUID();
  const templateIds = await guardarNaBiblioteca(user.id, { criaturaId: id, nome: dados.nome }, payload.componentes);

  const criatura = await prisma.criatura.create({
    data: {
      ...dados,
      id,
      linhagemId,
      userId: user.id,
      componentes: { create: componentesParaCreate(payload, templateIds) },
    },
    include: { componentes: true, linhagem: true },
  });

  revalidar();
  return serializarCriatura(criatura);
}

export async function atualizarCriatura(criaturaId: string, payload: CriaturaPayload) {
  const user = await autorizarNarrador();
  validarCriatura(payload);
  const dados = normalizarPayload(payload);
  const linhagemId = await resolverLinhagemId(user.id, payload.linhagem);

  const existente = await prisma.criatura.findUnique({ where: { id: criaturaId }, select: { userId: true } });
  if (!existente) throw new Error("Criatura não encontrada.");
  if (existente.userId !== user.id) throw new Error("Apenas o dono pode editar esta criatura.");

  const origem = { criaturaId, nome: dados.nome };
  const templateIds = await guardarNaBiblioteca(user.id, origem, payload.componentes);
  await renomearPasta(user.id, origem);

  const antigos = await prisma.traitInstance.findMany({ where: { criaturaId }, select: { id: true } });
  const manter = new Set(antigos.map((c) => c.id));
  // Apaga antes de recriar, na mesma transação: os ids mantidos não colidem.
  const [, criatura] = await prisma.$transaction([
    prisma.traitInstance.deleteMany({ where: { criaturaId } }),
    prisma.criatura.update({
      where: { id: criaturaId },
      data: {
        ...dados,
        linhagemId,
        componentes: { create: componentesParaCreate(payload, templateIds, manter) },
      },
      include: { componentes: true, linhagem: true },
    }),
  ]);

  revalidar();
  return serializarCriatura(criatura);
}

export async function deletarCriatura(criaturaId: string) {
  const user = await autorizarNarrador();

  const existente = await prisma.criatura.findUnique({ where: { id: criaturaId }, select: { userId: true } });
  if (!existente) throw new Error("Criatura não encontrada.");
  if (existente.userId !== user.id) throw new Error("Apenas o dono pode remover esta criatura.");

  await prisma.criatura.delete({ where: { id: criaturaId } });
  revalidar();
}
