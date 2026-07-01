"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  ATRIBUTOS,
  PERICIAS,
  computarDeltasInstantaneos,
  lerEfeitos,
  lerProficiencias,
  normalizarEfeito,
  slugPericiaCustom,
  type Atributo,
  type EfeitoHabilidade,
  type PericiaSlug,
  type TipoEfeito,
} from "@/lib/op-rpg";
import { TAMANHOS_VALIDOS, MADEIRAS_VALIDAS, statsTamanho } from "@/lib/navio";
import {
  corValida,
  normalizarEfeitoCor,
  normalizarEstilosTag,
  separarTags,
} from "@/lib/estilos-cor";
import {
  MAX_RANKS_TETO,
  dependentesQuebrados,
  estadoNo,
  lerRequisitos,
  acharPreset,
  normalizarCriterio,
  type ContextoArvore,
  type NoArvore,
  type RequisitoNo,
} from "@/lib/arvore";

// ─── Auth helper interno ───────────────────────────────────
// Verifica sessão + acesso (dono OU narrador) e retorna o personagem com mesa.
// Auth (Supabase) e personagem (Postgres) rodam em paralelo — checagem de
// ownership é feita depois que as duas resolvem.
async function autorizar(personagemId: string) {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    personagem,
  ] = await Promise.all([
    supabase.auth.getUser(),
    prisma.personagem.findUnique({
      where: { id: personagemId },
      include: { mesa: true },
    }),
  ]);
  if (!user) throw new Error("Não autenticado.");
  if (!personagem) throw new Error("Personagem não encontrado.");

  const isDono = personagem.userId === user.id;
  const isNarrador = personagem.mesa?.userId === user.id;
  if (!isDono && !isNarrador) throw new Error("Acesso negado.");

  return { user, personagem };
}

// ─── Personagem ────────────────────────────────────────────
const ALLOWED_PERSONAGEM = [
  "nome",
  "nivel",
  "pe",
  "hpAtual",
  "hpMax",
  "hpTemp",
  "ppAtual",
  "ppMax",
  "exaustao",
  "cargaMaxima",
  "ultimaRolagem",
  "fotoUrl",
  "forca",
  "destreza",
  "constituicao",
  "sabedoria",
  "vontade",
  "presenca",
  "mesaId",
  "berries",
  "tipoDadoVida",
  "dadosVidaGastos",
  "crOutros",
  "deslocamento",
  "nado",
] as const;

type PersonagemPatch = Partial<
  Record<(typeof ALLOWED_PERSONAGEM)[number], unknown>
>;

export async function patchPersonagem(
  personagemId: string,
  patch: PersonagemPatch,
) {
  await autorizar(personagemId);

  const data: Record<string, unknown> = {};
  for (const key of ALLOWED_PERSONAGEM) {
    if (patch[key] !== undefined) data[key] = patch[key];
  }

  await prisma.personagem.update({
    where: { id: personagemId },
    data,
  });
  revalidatePath(`/ficha/${personagemId}`);
}

// ─── Ações ─────────────────────────────────────────────────
const ALLOWED_ACAO = [
  "nome",
  "descricao",
  "tipo",
  "tag",
  "custoPp",
  "custoPa",
  "custoRecursoId",
  "custoRecursoValor",
  "atributoAtaque",
  "atributoSalv",
  "atributoCd",
  "dano",
  "alcance",
  "armaId",
  "habilidadeId",
] as const;

type AcaoInput = Partial<Record<(typeof ALLOWED_ACAO)[number], unknown>>;

const TIPOS_ACAO_VALIDOS = new Set(["padrao", "bonus", "power", "react", "livre"]);

function normalizarAcaoInput(input: AcaoInput) {
  const data: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = (input.nome as string).trim();
    if (!nome) throw new Error("Nome é obrigatório.");
    data.nome = nome;
  }
  if (input.descricao !== undefined) data.descricao = String(input.descricao);
  if (input.tipo !== undefined) {
    const tipo = String(input.tipo);
    if (!TIPOS_ACAO_VALIDOS.has(tipo)) throw new Error("Tipo de ação inválido.");
    data.tipo = tipo;
  }
  if (input.tag !== undefined) data.tag = String(input.tag);
  if (input.custoPp !== undefined) data.custoPp = Math.max(0, Number(input.custoPp) || 0);
  if (input.custoPa !== undefined) data.custoPa = Math.max(0, Number(input.custoPa) || 0);
  if (input.custoRecursoId !== undefined) {
    data.custoRecursoId = input.custoRecursoId ? String(input.custoRecursoId) : null;
  }
  if (input.custoRecursoValor !== undefined) {
    data.custoRecursoValor = Math.max(0, Number(input.custoRecursoValor) || 0);
  }
  for (const k of ["atributoAtaque", "atributoSalv", "atributoCd"] as const) {
    if (input[k] !== undefined) {
      const v = input[k] ? String(input[k]) : null;
      if (v && !ATRIBUTOS_VALIDOS.has(v as Atributo)) {
        throw new Error(`Atributo inválido em ${k}.`);
      }
      data[k] = v;
    }
  }
  if (input.dano !== undefined) data.dano = input.dano ? String(input.dano) : null;
  if (input.alcance !== undefined) data.alcance = input.alcance ? String(input.alcance) : null;
  // Referência solta a um Item (arma). Não validamos ownership aqui: pior caso
  // é um id que a UI não acha na lista de armas e cai no cálculo manual.
  if (input.armaId !== undefined) data.armaId = input.armaId ? String(input.armaId) : null;
  // Referência solta a uma Habilidade ("deriva de"). Mesma lógica do armaId:
  // sem validação de ownership — pior caso é um id que a UI não resolve.
  if (input.habilidadeId !== undefined) {
    data.habilidadeId = input.habilidadeId ? String(input.habilidadeId) : null;
  }
  return data;
}

export async function criarAcao(personagemId: string, input: AcaoInput) {
  await autorizar(personagemId);
  const data = normalizarAcaoInput(input);
  if (data.nome === undefined) throw new Error("Nome é obrigatório.");

  await prisma.acao.create({
    data: {
      personagemId,
      nome: data.nome as string,
      descricao: (data.descricao as string) ?? "",
      tipo: (data.tipo as string) ?? "padrao",
      tag: (data.tag as string) ?? "",
      custoPp: (data.custoPp as number) ?? 0,
      custoPa: (data.custoPa as number) ?? 0,
      custoRecursoId: (data.custoRecursoId as string | null) ?? null,
      custoRecursoValor: (data.custoRecursoValor as number) ?? 0,
      atributoAtaque: (data.atributoAtaque as string | null) ?? null,
      atributoSalv: (data.atributoSalv as string | null) ?? null,
      atributoCd: (data.atributoCd as string | null) ?? null,
      dano: (data.dano as string | null) ?? null,
      alcance: (data.alcance as string | null) ?? null,
      armaId: (data.armaId as string | null) ?? null,
      habilidadeId: (data.habilidadeId as string | null) ?? null,
    },
  });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function atualizarAcao(
  personagemId: string,
  acaoId: string,
  patch: AcaoInput,
) {
  await autorizar(personagemId);
  const data = normalizarAcaoInput(patch);
  await prisma.acao.update({
    where: { id: acaoId, personagemId },
    data,
  });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function deletarAcao(personagemId: string, acaoId: string) {
  await autorizar(personagemId);
  await prisma.acao.delete({
    where: { id: acaoId, personagemId },
  });
  revalidatePath(`/ficha/${personagemId}`);
}

// ─── Itens ─────────────────────────────────────────────────
const ALLOWED_ITEM = [
  "nome",
  "peso",
  "tipo",
  "tags",
  "tagsEstilo",
  "descricao",
  "dano",
  "modificador",
  "ca",
  "penalidadeDes",
  "equipado",
  "favorito",
  "categoria",
  "alcance",
  "alcanceMetros",
  "propriedades",
  "atributoAtaque",
  "proficienteArma",
] as const;

type ItemInput = Partial<Record<(typeof ALLOWED_ITEM)[number], unknown>>;

const CATEGORIAS_VALIDAS = new Set(["cortante", "fogo", "especial", "marcial"]);
const ALCANCES_VALIDOS = new Set(["corpo_a_corpo", "distancia"]);
const PROPRIEDADES_VALIDAS = new Set([
  "acuidade",
  "arremesso",
  "duasMaos",
  "versatil",
  "municao",
  "recarga",
  "sutil",
  "pesada",
  "alcance",
  "invencao",
  "especial",
]);

function normalizarPropriedades(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((p): p is string => typeof p === "string" && PROPRIEDADES_VALIDAS.has(p)))];
}

function normalizarItemInput(input: ItemInput) {
  const data: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = (input.nome as string).trim();
    if (!nome) throw new Error("Nome é obrigatório.");
    data.nome = nome;
  }
  if (input.peso !== undefined) data.peso = Number(input.peso) || 0;
  if (input.tipo !== undefined) data.tipo = String(input.tipo) || "comum";
  if (input.tags !== undefined) data.tags = (input.tags as string) || "";
  if (input.tagsEstilo !== undefined) {
    // Poda estilos de tags que sumiram do texto livre (quando o texto veio
    // no mesmo patch) pra não acumular lixo no Json.
    const tagsDoPatch =
      input.tags !== undefined ? separarTags(String(input.tags)) : undefined;
    data.tagsEstilo =
      normalizarEstilosTag(input.tagsEstilo, tagsDoPatch) ?? Prisma.DbNull;
  }
  if (input.descricao !== undefined) data.descricao = (input.descricao as string) || "";
  if (input.dano !== undefined) data.dano = (input.dano as string) || "";
  if (input.modificador !== undefined) data.modificador = Number(input.modificador) || 0;
  if (input.ca !== undefined) data.ca = Number(input.ca) || 0;
  if (input.penalidadeDes !== undefined) data.penalidadeDes = Number(input.penalidadeDes) || 0;
  if (input.equipado !== undefined) data.equipado = Boolean(input.equipado);
  if (input.favorito !== undefined) data.favorito = Boolean(input.favorito);
  if (input.categoria !== undefined) {
    const v = String(input.categoria);
    if (!CATEGORIAS_VALIDAS.has(v)) throw new Error("Categoria inválida.");
    data.categoria = v;
  }
  if (input.alcance !== undefined) {
    const v = String(input.alcance);
    if (!ALCANCES_VALIDOS.has(v)) throw new Error("Alcance inválido.");
    data.alcance = v;
  }
  if (input.alcanceMetros !== undefined) {
    // Texto livre descritivo; corta em 40 chars como defesa.
    const v = input.alcanceMetros ? String(input.alcanceMetros).trim().slice(0, 40) : "";
    data.alcanceMetros = v || null;
  }
  if (input.propriedades !== undefined) {
    data.propriedades = normalizarPropriedades(input.propriedades);
  }
  if (input.atributoAtaque !== undefined) {
    const v = input.atributoAtaque ? String(input.atributoAtaque) : null;
    if (v && !ATRIBUTOS_VALIDOS.has(v as Atributo)) {
      throw new Error("Atributo de ataque inválido.");
    }
    data.atributoAtaque = v;
  }
  if (input.proficienteArma !== undefined) {
    data.proficienteArma = Boolean(input.proficienteArma);
  }
  return data;
}

export async function criarItem(personagemId: string, input: ItemInput) {
  await autorizar(personagemId);
  const data = normalizarItemInput(input);
  if (data.nome === undefined) throw new Error("Nome é obrigatório.");

  await prisma.item.create({
    data: {
      personagemId,
      nome: data.nome as string,
      peso: (data.peso as number) ?? 0,
      tipo: (data.tipo as string) ?? "comum",
      tags: (data.tags as string) ?? "",
      tagsEstilo:
        (data.tagsEstilo as Prisma.InputJsonValue | typeof Prisma.DbNull) ??
        Prisma.DbNull,
      descricao: (data.descricao as string) ?? "",
      dano: (data.dano as string) ?? "",
      modificador: (data.modificador as number) ?? 0,
      ca: (data.ca as number) ?? 0,
      penalidadeDes: (data.penalidadeDes as number) ?? 0,
      categoria: (data.categoria as string) ?? "cortante",
      alcance: (data.alcance as string) ?? "corpo_a_corpo",
      alcanceMetros: (data.alcanceMetros as string | null) ?? null,
      propriedades: (data.propriedades as string[]) ?? [],
      atributoAtaque: (data.atributoAtaque as string | null) ?? null,
      proficienteArma:
        data.proficienteArma === undefined ? true : (data.proficienteArma as boolean),
    },
  });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function atualizarItem(
  personagemId: string,
  itemId: string,
  patch: ItemInput,
) {
  await autorizar(personagemId);
  const data = normalizarItemInput(patch);

  await prisma.item.update({
    where: { id: itemId, personagemId },
    data,
  });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function deletarItem(personagemId: string, itemId: string) {
  await autorizar(personagemId);
  await prisma.item.delete({
    where: { id: itemId, personagemId },
  });
  revalidatePath(`/ficha/${personagemId}`);
}

// ─── Proficiências (perícias e salvaguardas) ──────────────
const PERICIAS_VALIDAS = new Set(PERICIAS.map((p) => p.slug));
const ATRIBUTOS_VALIDOS = new Set<string>(ATRIBUTOS.map((a) => a.slug));

function toggleEm<T extends string>(lista: T[], slug: T, ligado: boolean): T[] {
  const set = new Set(lista);
  if (ligado) set.add(slug);
  else set.delete(slug);
  return Array.from(set);
}

export async function togglePericia(
  personagemId: string,
  slug: PericiaSlug,
  proficiente: boolean,
) {
  if (!PERICIAS_VALIDAS.has(slug)) throw new Error("Perícia inválida.");
  const { personagem } = await autorizar(personagemId);

  const prof = lerProficiencias(personagem.proficiencias);
  prof.pericias = toggleEm(prof.pericias, slug, proficiente);
  // Desligar a proficiência também limpa o "dobrado".
  if (!proficiente) {
    prof.periciasDobradas = prof.periciasDobradas.filter((p) => p !== slug);
  }

  await prisma.personagem.update({
    where: { id: personagemId },
    data: { proficiencias: prof },
  });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function setPericiaOutros(
  personagemId: string,
  slug: PericiaSlug,
  valor: number,
) {
  if (!PERICIAS_VALIDAS.has(slug)) throw new Error("Perícia inválida.");
  if (!Number.isFinite(valor)) throw new Error("Valor inválido.");
  const { personagem } = await autorizar(personagemId);

  const prof = lerProficiencias(personagem.proficiencias);
  const truncado = Math.trunc(valor);
  if (truncado === 0) {
    delete prof.outrosPericias[slug];
  } else {
    prof.outrosPericias[slug] = truncado;
  }

  await prisma.personagem.update({
    where: { id: personagemId },
    data: { proficiencias: prof },
  });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function togglePericiaDobrada(
  personagemId: string,
  slug: PericiaSlug,
  dobrado: boolean,
) {
  if (!PERICIAS_VALIDAS.has(slug)) throw new Error("Perícia inválida.");
  const { personagem } = await autorizar(personagemId);

  const prof = lerProficiencias(personagem.proficiencias);
  // "Dobrado" só faz sentido se for proficiente.
  if (dobrado && !prof.pericias.includes(slug)) {
    throw new Error("É preciso ser proficiente antes de dobrar.");
  }
  prof.periciasDobradas = toggleEm(prof.periciasDobradas, slug, dobrado);

  await prisma.personagem.update({
    where: { id: personagemId },
    data: { proficiencias: prof },
  });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function toggleSalvaguarda(
  personagemId: string,
  atributo: Atributo,
  proficiente: boolean,
) {
  if (!ATRIBUTOS_VALIDOS.has(atributo)) throw new Error("Atributo inválido.");
  const { personagem } = await autorizar(personagemId);

  const prof = lerProficiencias(personagem.proficiencias);
  prof.salvaguardas = toggleEm(prof.salvaguardas, atributo, proficiente);

  await prisma.personagem.update({
    where: { id: personagemId },
    data: { proficiencias: prof },
  });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function setSalvaguardaOutros(
  personagemId: string,
  atributo: Atributo,
  valor: number,
) {
  if (!ATRIBUTOS_VALIDOS.has(atributo)) throw new Error("Atributo inválido.");
  if (!Number.isFinite(valor)) throw new Error("Valor inválido.");
  const { personagem } = await autorizar(personagemId);

  const prof = lerProficiencias(personagem.proficiencias);
  const truncado = Math.trunc(valor);
  if (truncado === 0) {
    delete prof.outrosSalvaguardas[atributo];
  } else {
    prof.outrosSalvaguardas[atributo] = truncado;
  }

  await prisma.personagem.update({
    where: { id: personagemId },
    data: { proficiencias: prof },
  });
  revalidatePath(`/ficha/${personagemId}`);
}

// ─── Perícias customizadas ────────────────────────────────
// Perícias fora do set fixo (Profissão, homebrew). Cada uma é uma linha em
// pericias_custom; proficiência/dobrada/bônus vivem na própria linha.
function serializarPericiaCustom(p: {
  id: string;
  nome: string;
  slug: string;
  atributo: string;
  origem: string;
  proficiente: boolean;
  dobrada: boolean;
  bonusOutros: number;
  ordem: number;
}) {
  return {
    id: p.id,
    nome: p.nome,
    slug: p.slug,
    atributo: p.atributo,
    origem: p.origem,
    proficiente: p.proficiente,
    dobrada: p.dobrada,
    bonusOutros: p.bonusOutros,
    ordem: p.ordem,
  };
}

export async function criarPericiaCustom(
  personagemId: string,
  input: { nome: string; atributo: string; origem?: string },
) {
  await autorizar(personagemId);

  const nome = String(input.nome ?? "").trim();
  if (!nome) throw new Error("Dê um nome à perícia.");
  if (!ATRIBUTOS_VALIDOS.has(input.atributo)) throw new Error("Atributo inválido.");
  const origem = String(input.origem ?? "").trim();

  // Slug único por personagem — deriva do nome evitando colisão com built-ins
  // e com as customizadas que já existem.
  const existentes = await prisma.periciaCustom.findMany({
    where: { personagemId },
    select: { slug: true },
  });
  const slug = slugPericiaCustom(nome, new Set(existentes.map((p) => p.slug)));

  const criada = await prisma.periciaCustom.create({
    data: {
      personagemId,
      nome,
      slug,
      atributo: input.atributo,
      origem,
      ordem: existentes.length,
    },
  });
  revalidatePath(`/ficha/${personagemId}`);
  return serializarPericiaCustom(criada);
}

const ALLOWED_PERICIA_CUSTOM = [
  "nome",
  "atributo",
  "origem",
  "proficiente",
  "dobrada",
  "bonusOutros",
] as const;

type PericiaCustomPatch = Partial<
  Record<(typeof ALLOWED_PERICIA_CUSTOM)[number], unknown>
>;

export async function patchPericiaCustom(
  personagemId: string,
  id: string,
  patch: PericiaCustomPatch,
) {
  await autorizar(personagemId);

  const data: Record<string, unknown> = {};
  for (const key of ALLOWED_PERICIA_CUSTOM) {
    if (patch[key] !== undefined) data[key] = patch[key];
  }

  if (typeof data.nome === "string") {
    const nome = data.nome.trim();
    if (!nome) throw new Error("Nome inválido.");
    data.nome = nome;
  }
  if (data.atributo !== undefined && !ATRIBUTOS_VALIDOS.has(String(data.atributo))) {
    throw new Error("Atributo inválido.");
  }
  if (typeof data.origem === "string") data.origem = data.origem.trim();
  if (data.bonusOutros !== undefined) {
    const n = Number(data.bonusOutros);
    if (!Number.isFinite(n)) throw new Error("Valor inválido.");
    data.bonusOutros = Math.trunc(n);
  }
  // Invariantes: dobrar exige proficiência; tirar proficiência tira o dobro.
  if (data.dobrada === true) data.proficiente = true;
  if (data.proficiente === false) data.dobrada = false;

  if (Object.keys(data).length === 0) return;

  await prisma.periciaCustom.update({
    where: { id, personagemId },
    data,
  });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function deletarPericiaCustom(personagemId: string, id: string) {
  await autorizar(personagemId);
  await prisma.periciaCustom.delete({
    where: { id, personagemId },
  });
  revalidatePath(`/ficha/${personagemId}`);
}

// ─── Recursos customizados ────────────────────────────────
const ALLOWED_RECURSO = [
  "nome",
  "valorAtual",
  "valorMax",
  "ordem",
  "cor",
  "efeito",
  "resetEm",
] as const;
type RecursoInput = Partial<Record<(typeof ALLOWED_RECURSO)[number], unknown>>;

const RESET_VALIDOS = new Set(["manual", "encontro", "descansoCurto", "descansoLongo"]);

function normalizarRecurso(input: RecursoInput, parcial: boolean) {
  const data: Record<string, unknown> = {};
  for (const key of ALLOWED_RECURSO) {
    if (input[key] === undefined) continue;
    if (key === "nome") {
      const nome = (input.nome as string).trim();
      if (!nome) throw new Error("Nome do recurso é obrigatório.");
      data.nome = nome;
    } else if (key === "valorAtual" || key === "valorMax" || key === "ordem") {
      data[key] = Number(input[key]) || 0;
    } else if (key === "resetEm") {
      const v = String(input.resetEm);
      if (!RESET_VALIDOS.has(v)) throw new Error("resetEm inválido.");
      data.resetEm = v;
    } else if (key === "cor") {
      data.cor = input.cor ? String(input.cor) : null;
    } else if (key === "efeito") {
      data.efeito = normalizarEfeitoCor(input.efeito);
    }
  }
  if (!parcial && data.nome === undefined) {
    throw new Error("Nome do recurso é obrigatório.");
  }
  return data;
}

export async function criarRecurso(personagemId: string, input: RecursoInput) {
  await autorizar(personagemId);
  const data = normalizarRecurso(input, false);

  const atual =
    typeof data.valorAtual === "number" ? data.valorAtual : Number(data.valorMax) || 0;

  await prisma.recurso.create({
    data: {
      personagemId,
      nome: data.nome as string,
      valorAtual: atual,
      valorMax: (data.valorMax as number) ?? 0,
      ordem: (data.ordem as number) ?? 0,
      cor: (data.cor as string | null) ?? null,
      efeito: (data.efeito as string) ?? "solido",
      resetEm: (data.resetEm as string) ?? "manual",
    },
  });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function atualizarRecurso(
  personagemId: string,
  recursoId: string,
  patch: RecursoInput,
) {
  await autorizar(personagemId);
  const data = normalizarRecurso(patch, true);

  await prisma.recurso.update({
    where: { id: recursoId, personagemId },
    data,
  });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function deletarRecurso(personagemId: string, recursoId: string) {
  await autorizar(personagemId);
  await prisma.recurso.delete({
    where: { id: recursoId, personagemId },
  });
  revalidatePath(`/ficha/${personagemId}`);
}

// ─── Habilidades ───────────────────────────────────────────
const ALLOWED_HABILIDADE = [
  "nome",
  "origem",
  "tipo",
  "descricao",
  "custoPp",
  "custoPa",
  "custoRecursoId",
  "custoRecursoValor",
  "usos",
  "usosAtual",
  "recarga",
  "tags",
  "tagsEstilo",
  "favorita",
  "ordem",
  "efeitos",
] as const;

type HabilidadeInput = Partial<
  Record<(typeof ALLOWED_HABILIDADE)[number], unknown>
>;

const ORIGENS_HAB_VALIDAS = new Set([
  "profissao",
  "estilo",
  "haki",
  "especie",
  "akumaNoMi",
  "treinamento",
  "livre",
]);
const TIPOS_HAB_VALIDOS = new Set(["passiva", "ativa", "reativa", "livre"]);
const RECARGAS_VALIDAS_HAB = new Set([
  "descansoCurto",
  "descansoLongo",
  "encontro",
  "manual",
]);
const TIPOS_EFEITO_VALIDOS = new Set<TipoEfeito>([
  "modificador",
  "vantagem",
  "desvantagem",
  "proficiencia",
  "recurso_delta",
  "cura",
  "condicao_imune",
  "condicao_remover",
  "condicao_aplicar",
  "resistencia",
  "imunidade",
  "deslocamento",
  "multiplicador",
  "substituir_atributo",
  "rolagem",
  "trigger",
  "crit_range",
  "reroll",
  "floor_d20",
  "livre",
]);

function normalizarEfeitosInput(raw: unknown): EfeitoHabilidade[] {
  if (!Array.isArray(raw)) return [];
  const out: EfeitoHabilidade[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const t = obj.tipo;
    if (typeof t !== "string" || !TIPOS_EFEITO_VALIDOS.has(t as TipoEfeito)) continue;
    const e = normalizarEfeito(t as TipoEfeito, obj);
    if (e) out.push(e);
  }
  return out;
}

function normalizarHabilidadeInput(input: HabilidadeInput) {
  const data: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = String(input.nome).trim();
    if (!nome) throw new Error("Nome é obrigatório.");
    data.nome = nome;
  }
  if (input.origem !== undefined) {
    const v = String(input.origem);
    if (!ORIGENS_HAB_VALIDAS.has(v)) throw new Error("Origem inválida.");
    data.origem = v;
  }
  if (input.tipo !== undefined) {
    const v = String(input.tipo);
    if (!TIPOS_HAB_VALIDOS.has(v)) throw new Error("Tipo de habilidade inválido.");
    data.tipo = v;
  }
  if (input.descricao !== undefined) data.descricao = String(input.descricao);
  if (input.custoPp !== undefined) data.custoPp = Math.max(0, Number(input.custoPp) || 0);
  if (input.custoPa !== undefined) data.custoPa = Math.max(0, Number(input.custoPa) || 0);
  if (input.custoRecursoId !== undefined) {
    data.custoRecursoId = input.custoRecursoId ? String(input.custoRecursoId) : null;
  }
  if (input.custoRecursoValor !== undefined) {
    data.custoRecursoValor = Math.max(0, Number(input.custoRecursoValor) || 0);
  }
  if (input.usos !== undefined) {
    if (input.usos === null || input.usos === "") {
      data.usos = null;
      data.usosAtual = null;
    } else {
      const n = Math.max(0, Math.trunc(Number(input.usos) || 0));
      data.usos = n;
      // Se usosAtual não veio explícito, encha o tanque.
      if (input.usosAtual === undefined) data.usosAtual = n;
    }
  }
  if (input.usosAtual !== undefined && data.usosAtual === undefined) {
    if (input.usosAtual === null || input.usosAtual === "") {
      data.usosAtual = null;
    } else {
      data.usosAtual = Math.max(0, Math.trunc(Number(input.usosAtual) || 0));
    }
  }
  if (input.recarga !== undefined) {
    if (!input.recarga) {
      data.recarga = null;
    } else {
      const v = String(input.recarga);
      if (!RECARGAS_VALIDAS_HAB.has(v)) throw new Error("Recarga inválida.");
      data.recarga = v;
    }
  }
  if (input.tags !== undefined) data.tags = input.tags ? String(input.tags) : null;
  if (input.tagsEstilo !== undefined) {
    const tagsDoPatch =
      input.tags !== undefined ? separarTags(String(input.tags ?? "")) : undefined;
    data.tagsEstilo =
      normalizarEstilosTag(input.tagsEstilo, tagsDoPatch) ?? Prisma.DbNull;
  }
  if (input.favorita !== undefined) data.favorita = Boolean(input.favorita);
  if (input.ordem !== undefined) data.ordem = Math.trunc(Number(input.ordem) || 0);
  if (input.efeitos !== undefined) data.efeitos = normalizarEfeitosInput(input.efeitos);
  return data;
}

export async function criarHabilidade(
  personagemId: string,
  input: HabilidadeInput,
) {
  await autorizar(personagemId);
  const data = normalizarHabilidadeInput(input);
  if (data.nome === undefined) throw new Error("Nome é obrigatório.");

  await prisma.habilidade.create({
    data: {
      personagemId,
      nome: data.nome as string,
      origem: (data.origem as string) ?? "livre",
      tipo: (data.tipo as string) ?? "passiva",
      descricao: (data.descricao as string) ?? "",
      custoPp: (data.custoPp as number) ?? 0,
      custoPa: (data.custoPa as number) ?? 0,
      custoRecursoId: (data.custoRecursoId as string | null) ?? null,
      custoRecursoValor: (data.custoRecursoValor as number) ?? 0,
      usos: (data.usos as number | null) ?? null,
      usosAtual: (data.usosAtual as number | null) ?? null,
      recarga: (data.recarga as string | null) ?? null,
      tags: (data.tags as string | null) ?? null,
      tagsEstilo:
        (data.tagsEstilo as Prisma.InputJsonValue | typeof Prisma.DbNull) ??
        Prisma.DbNull,
      favorita: (data.favorita as boolean) ?? false,
      ordem: (data.ordem as number) ?? 0,
      efeitos: (data.efeitos as EfeitoHabilidade[]) ?? [],
    },
  });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function atualizarHabilidade(
  personagemId: string,
  habilidadeId: string,
  patch: HabilidadeInput,
) {
  await autorizar(personagemId);
  const data = normalizarHabilidadeInput(patch);
  await prisma.habilidade.update({
    where: { id: habilidadeId, personagemId },
    data,
  });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function deletarHabilidade(
  personagemId: string,
  habilidadeId: string,
) {
  await autorizar(personagemId);
  await prisma.habilidade.delete({
    where: { id: habilidadeId, personagemId },
  });
  revalidatePath(`/ficha/${personagemId}`);
}

// Debita custos (PP, recurso de custo, usos) e aplica efeitos instantâneos
// (`cura`, `modificador` em `hp-temp`/`hp-max`/`pp-max`, `recurso_delta`)
// numa única transação. PA não tem campo dedicado no Personagem — quem
// quiser controle automático cria um Recurso customizado "PA".
// `condicao_aplicar` é adiado pra etapa 4 (não há tabela de condições ativas).
//
// `extraHabData` é mesclado no update da habilidade (ex: `{ ligada: true }` ao
// ligar uma sustentada). `incluirMax: false` deixa hp-max/pp-max fora dos
// deltas instantâneos — ao LIGAR uma sustentada, o bônus de máximo é revertível
// e vive no agregado (bonusHpMax/bonusPpMax enquanto ligada), não no valor
// armazenado. Botão "Usar" usa o default (instantâneo permanente).
async function aplicarUsoHabilidade(
  personagemId: string,
  habilidadeId: string,
  extraHabData: Record<string, unknown> = {},
  { incluirMax = true }: { incluirMax?: boolean } = {},
) {
  const { personagem } = await autorizar(personagemId);

  const hab = await prisma.habilidade.findFirst({
    where: { id: habilidadeId, personagemId },
  });
  if (!hab) throw new Error("Habilidade não encontrada.");

  if (hab.custoPp > 0 && personagem.ppAtual < hab.custoPp) {
    throw new Error("PP insuficiente.");
  }
  if (hab.usos != null && (hab.usosAtual ?? 0) <= 0) {
    throw new Error("Sem usos restantes.");
  }

  let recursoCusto: Awaited<ReturnType<typeof prisma.recurso.findFirst>> = null;
  if (hab.custoRecursoId && hab.custoRecursoValor > 0) {
    recursoCusto = await prisma.recurso.findFirst({
      where: { id: hab.custoRecursoId, personagemId },
    });
    if (!recursoCusto) throw new Error("Recurso configurado não existe mais.");
    if (recursoCusto.valorAtual < hab.custoRecursoValor) {
      throw new Error(`${recursoCusto.nome} insuficiente.`);
    }
  }

  // Cura aceita só inteiro puro no e.valor (ex: "5"). Fórmulas tipo
  // "1d8+CON" ficam descritivas — não há roller no server.
  const efeitos = lerEfeitos(hab.efeitos);
  const deltas = computarDeltasInstantaneos(efeitos, { incluirMax });
  const recursoIds = Object.keys(deltas.recursos);

  // Busca recursos referenciados pelos efeitos pra validar existência + clampar.
  const recursosEfeito =
    recursoIds.length > 0
      ? await prisma.recurso.findMany({
          where: { personagemId, id: { in: recursoIds } },
        })
      : [];

  // ─── Computa novos valores com clamps ──────────────────────
  const novoHpMax = Math.max(1, personagem.hpMax + deltas.hpMax);
  const novoPpMax = Math.max(0, personagem.ppMax + deltas.ppMax);
  const novoHpAtual = clamp(personagem.hpAtual + deltas.hpAtual, 0, novoHpMax);
  const novoPpAtual = clamp(
    personagem.ppAtual - hab.custoPp + deltas.ppAtual,
    0,
    novoPpMax,
  );
  const novoHpTemp = Math.max(0, personagem.hpTemp + deltas.hpTemp);

  const personagemPatch: Record<string, number> = {};
  if (novoPpAtual !== personagem.ppAtual) personagemPatch.ppAtual = novoPpAtual;
  if (novoHpAtual !== personagem.hpAtual) personagemPatch.hpAtual = novoHpAtual;
  if (novoHpTemp !== personagem.hpTemp) personagemPatch.hpTemp = novoHpTemp;
  if (novoHpMax !== personagem.hpMax) personagemPatch.hpMax = novoHpMax;
  if (novoPpMax !== personagem.ppMax) personagemPatch.ppMax = novoPpMax;

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (Object.keys(personagemPatch).length > 0) {
    ops.push(
      prisma.personagem.update({
        where: { id: personagemId },
        data: personagemPatch,
      }),
    );
  }
  if (recursoCusto) {
    ops.push(
      prisma.recurso.update({
        where: { id: recursoCusto.id },
        data: { valorAtual: recursoCusto.valorAtual - hab.custoRecursoValor },
      }),
    );
  }
  for (const r of recursosEfeito) {
    const delta = deltas.recursos[r.id] ?? 0;
    if (!delta) continue;
    // Custo do recurso já foi debitado acima — não deduzir de novo.
    const base =
      recursoCusto?.id === r.id ? r.valorAtual - hab.custoRecursoValor : r.valorAtual;
    const novo = clamp(base + delta, 0, r.valorMax);
    if (novo === r.valorAtual) continue;
    ops.push(
      prisma.recurso.update({
        where: { id: r.id },
        data: { valorAtual: novo },
      }),
    );
  }
  const habData: Record<string, unknown> = { ...extraHabData };
  if (hab.usos != null) habData.usosAtual = (hab.usosAtual ?? hab.usos) - 1;
  if (Object.keys(habData).length > 0) {
    ops.push(
      prisma.habilidade.update({
        where: { id: hab.id, personagemId },
        data: habData,
      }),
    );
  }

  if (ops.length > 0) {
    await prisma.$transaction(ops);
  }
  revalidatePath(`/ficha/${personagemId}`);
}

// Botão "Usar" de habilidade não-sustentada (ou ativa só-instantânea): consome
// custos + aplica efeitos instantâneos, sem estado persistente.
export async function usarHabilidade(personagemId: string, habilidadeId: string) {
  await aplicarUsoHabilidade(personagemId, habilidadeId);
}

// Liga/desliga uma habilidade sustentada (ativa/reativa com efeito sustentado).
// LIGAR consome custos + aplica os instantâneos (cura/PV-temp/recurso; hp-max/
// pp-max ficam no agregado, revertíveis) e marca `ligada=true`. DESLIGAR só
// limpa `ligada` — sem reembolso de custo nem reversão de PV temp já concedido.
export async function alternarHabilidade(
  personagemId: string,
  habilidadeId: string,
  ligada: boolean,
) {
  if (!ligada) {
    await autorizar(personagemId);
    await prisma.habilidade.update({
      where: { id: habilidadeId, personagemId },
      data: { ligada: false },
    });
    revalidatePath(`/ficha/${personagemId}`);
    return;
  }
  await aplicarUsoHabilidade(
    personagemId,
    habilidadeId,
    { ligada: true },
    { incluirMax: false },
  );
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

// ─── Navio da tripulação ───────────────────────────────────
// O navio é 1:1 com a Mesa. Como o caller chama da própria ficha, `autorizar`
// (dono OU narrador) já cobre "qualquer membro edita": cada membro é dono do
// seu personagem na mesa. Daí derivamos o mesaId — não confiamos no cliente.
function navioSerializado(n: {
  id: string;
  nome: string;
  tamanho: string;
  madeira: string;
  pvAtual: number;
  velocidadeNos: number;
  canhoes: number;
  descricao: string;
}) {
  return {
    id: n.id,
    nome: n.nome,
    tamanho: n.tamanho,
    madeira: n.madeira,
    pvAtual: n.pvAtual,
    velocidadeNos: n.velocidadeNos,
    canhoes: n.canhoes,
    descricao: n.descricao,
  };
}

async function mesaDoPersonagem(personagemId: string) {
  const { personagem } = await autorizar(personagemId);
  if (!personagem.mesaId) {
    throw new Error("Entre em uma mesa para ter um navio.");
  }
  return personagem.mesaId;
}

export async function criarNavio(personagemId: string) {
  const mesaId = await mesaDoPersonagem(personagemId);
  // upsert idempotente — tolera double-click / race entre dois membros.
  // Nasce com o PV cheio do tamanho default (mais útil que começar em 0).
  const navio = await prisma.navio.upsert({
    where: { mesaId },
    update: {},
    create: { mesaId, nome: "Novo Navio", pvAtual: statsTamanho("pequeno").pvMax },
  });
  revalidatePath(`/ficha/${personagemId}`);
  return navioSerializado(navio);
}

const ALLOWED_NAVIO = [
  "nome",
  "tamanho",
  "madeira",
  "pvAtual",
  "velocidadeNos",
  "canhoes",
  "descricao",
] as const;

type NavioPatch = Partial<Record<(typeof ALLOWED_NAVIO)[number], unknown>>;

export async function patchNavio(personagemId: string, patch: NavioPatch) {
  const mesaId = await mesaDoPersonagem(personagemId);

  const data: Record<string, unknown> = {};
  for (const key of ALLOWED_NAVIO) {
    if (patch[key] !== undefined) data[key] = patch[key];
  }

  if (typeof data.nome === "string") data.nome = data.nome.trim();
  if (typeof data.descricao === "string") data.descricao = data.descricao.trim();
  if (data.tamanho !== undefined && !TAMANHOS_VALIDOS.has(String(data.tamanho))) {
    throw new Error("Tamanho de navio inválido.");
  }
  if (data.madeira !== undefined && !MADEIRAS_VALIDAS.has(String(data.madeira))) {
    throw new Error("Madeira inválida.");
  }
  for (const num of ["pvAtual", "velocidadeNos", "canhoes"] as const) {
    if (data[num] !== undefined) {
      const n = Number(data[num]);
      if (!Number.isFinite(n)) throw new Error("Valor inválido.");
      data[num] = Math.max(0, Math.trunc(n));
    }
  }

  if (Object.keys(data).length === 0) return;

  await prisma.navio.update({ where: { mesaId }, data });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function deletarNavio(personagemId: string) {
  const mesaId = await mesaDoPersonagem(personagemId);
  // deleteMany tolera ausência (sem throw se já não existe).
  await prisma.navio.deleteMany({ where: { mesaId } });
  revalidatePath(`/ficha/${personagemId}`);
}

// ─── Árvores de talento ────────────────────────────────────
// Toda mutação de nó/camada carrega `arvoreId` no `where` e a árvore é
// checada contra o personagem — defesa em profundidade, o cliente nunca é
// fonte de verdade sobre a quem a árvore pertence.

const ALLOWED_ARVORE = [
  "nome",
  "icone",
  "cor",
  "efeito",
  "ordem",
  "criterio",
  "recursoCustoId",
  "fundoUrl",
] as const;
type ArvoreInput = Partial<Record<(typeof ALLOWED_ARVORE)[number], unknown>>;

function normalizarArvore(input: ArvoreInput) {
  const data: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = String(input.nome).trim();
    if (!nome) throw new Error("Nome da árvore é obrigatório.");
    data.nome = nome.slice(0, 60);
  }
  if (input.icone !== undefined) {
    data.icone = String(input.icone).trim().slice(0, 40) || "fa-sitemap";
  }
  if (input.cor !== undefined) data.cor = corValida(input.cor);
  if (input.efeito !== undefined) data.efeito = normalizarEfeitoCor(input.efeito);
  if (input.ordem !== undefined) data.ordem = Math.trunc(Number(input.ordem) || 0);
  if (input.criterio !== undefined) data.criterio = normalizarCriterio(input.criterio);
  if (input.recursoCustoId !== undefined) {
    data.recursoCustoId = input.recursoCustoId ? String(input.recursoCustoId) : null;
  }
  if (input.fundoUrl !== undefined) {
    const v = input.fundoUrl ? String(input.fundoUrl).trim().slice(0, 500) : "";
    // Só http(s) — evita javascript:/data: virando background do canvas.
    data.fundoUrl = /^https?:\/\//i.test(v) ? v : null;
  }
  return data;
}

/** Confere que a árvore é do personagem e devolve ela com camadas + nós. */
async function arvoreDoPersonagem(personagemId: string, arvoreId: string) {
  const arvore = await prisma.arvore.findFirst({
    where: { id: arvoreId, personagemId },
    include: {
      camadas: { orderBy: { ordem: "asc" } },
      ramos: { orderBy: { ordem: "asc" } },
      nos: { orderBy: { ordem: "asc" } },
    },
  });
  if (!arvore) throw new Error("Árvore não encontrada.");
  return arvore;
}

export async function criarArvore(
  personagemId: string,
  input: ArvoreInput & { preset?: unknown },
) {
  await autorizar(personagemId);
  const data = normalizarArvore(input);
  if (data.nome === undefined) throw new Error("Nome da árvore é obrigatório.");

  // O molde define camadas, raias e critério. Sem preset explícito cai no
  // último ("Em branco"), que é 1 camada sem trava.
  const preset = acharPreset(input.preset);

  const arvore = await prisma.arvore.create({
    data: {
      personagemId,
      nome: data.nome as string,
      icone: (data.icone as string) ?? preset.icone,
      cor: (data.cor as string | null) ?? null,
      efeito: (data.efeito as string) ?? "solido",
      ordem: (data.ordem as number) ?? 0,
      // Critério explícito do formulário vence o do molde.
      criterio: (data.criterio as string) ?? preset.criterio,
      recursoCustoId: (data.recursoCustoId as string | null) ?? null,
      fundoUrl: (data.fundoUrl as string | null) ?? null,
      camadas: {
        create: preset.camadas.map((c, i) => ({
          nome: c.nome,
          ordem: i,
          limiar: c.limiar,
        })),
      },
      ramos: {
        create: preset.ramos.map((nome, i) => ({ nome, ordem: i })),
      },
    },
    include: { camadas: { orderBy: { ordem: "asc" } } },
  });
  revalidatePath(`/ficha/${personagemId}`);
  return { id: arvore.id, camadaId: arvore.camadas[0]?.id ?? null };
}

export async function atualizarArvore(
  personagemId: string,
  arvoreId: string,
  patch: ArvoreInput,
) {
  await autorizar(personagemId);
  const data = normalizarArvore(patch);
  await prisma.arvore.update({ where: { id: arvoreId, personagemId }, data });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function deletarArvore(personagemId: string, arvoreId: string) {
  await autorizar(personagemId);
  // Camadas e nós caem por onDelete: Cascade.
  await prisma.arvore.delete({ where: { id: arvoreId, personagemId } });
  revalidatePath(`/ficha/${personagemId}`);
}

// ─── Camadas ───────────────────────────────────────────────
const ALLOWED_CAMADA = ["nome", "ordem", "limiar"] as const;
type CamadaInput = Partial<Record<(typeof ALLOWED_CAMADA)[number], unknown>>;

function normalizarCamada(input: CamadaInput) {
  const data: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = String(input.nome).trim();
    if (!nome) throw new Error("Nome da camada é obrigatório.");
    data.nome = nome.slice(0, 40);
  }
  if (input.ordem !== undefined) data.ordem = Math.trunc(Number(input.ordem) || 0);
  if (input.limiar !== undefined) {
    data.limiar = Math.max(0, Math.trunc(Number(input.limiar) || 0));
  }
  return data;
}

export async function criarCamada(
  personagemId: string,
  arvoreId: string,
  input: CamadaInput,
) {
  await autorizar(personagemId);
  const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
  const data = normalizarCamada(input);

  const camada = await prisma.arvoreCamada.create({
    data: {
      arvoreId,
      nome: (data.nome as string) ?? `Camada ${arvore.camadas.length + 1}`,
      ordem: (data.ordem as number) ?? arvore.camadas.length,
      limiar: (data.limiar as number) ?? 0,
    },
  });
  revalidatePath(`/ficha/${personagemId}`);
  return { id: camada.id };
}

export async function atualizarCamada(
  personagemId: string,
  arvoreId: string,
  camadaId: string,
  patch: CamadaInput,
) {
  await autorizar(personagemId);
  await arvoreDoPersonagem(personagemId, arvoreId);
  const data = normalizarCamada(patch);
  await prisma.arvoreCamada.update({ where: { id: camadaId, arvoreId }, data });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function deletarCamada(
  personagemId: string,
  arvoreId: string,
  camadaId: string,
) {
  await autorizar(personagemId);
  const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
  if (arvore.camadas.length <= 1) {
    throw new Error("A árvore precisa de pelo menos uma camada.");
  }
  // Os nós da camada caem junto (Cascade). Avisar é papel da UI.
  await prisma.arvoreCamada.delete({ where: { id: camadaId, arvoreId } });
  revalidatePath(`/ficha/${personagemId}`);
}

// ─── Nós ───────────────────────────────────────────────────
const ALLOWED_NO = [
  "camadaId",
  "ramoId",
  "offsetY",
  "nome",
  "descricao",
  "icone",
  "custo",
  "maxRanks",
  "nivelMinimo",
  "habilidadeId",
  "requisitos",
  "ordem",
] as const;
type NoInput = Partial<Record<(typeof ALLOWED_NO)[number], unknown>>;

function normalizarNo(input: NoInput) {
  const data: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = String(input.nome).trim();
    if (!nome) throw new Error("Nome do talento é obrigatório.");
    data.nome = nome.slice(0, 60);
  }
  if (input.camadaId !== undefined) data.camadaId = String(input.camadaId);
  if (input.ramoId !== undefined) data.ramoId = input.ramoId ? String(input.ramoId) : null;
  if (input.offsetY !== undefined) {
    data.offsetY = Math.max(0, Math.min(100, Math.round(Number(input.offsetY) || 0)));
  }
  if (input.descricao !== undefined) data.descricao = String(input.descricao);
  if (input.icone !== undefined) {
    data.icone = String(input.icone).trim().slice(0, 40) || "fa-circle-nodes";
  }
  if (input.custo !== undefined) data.custo = Math.max(0, Math.trunc(Number(input.custo) || 0));
  if (input.maxRanks !== undefined) {
    const n = Math.trunc(Number(input.maxRanks) || 1);
    data.maxRanks = Math.max(1, Math.min(n, MAX_RANKS_TETO));
  }
  if (input.nivelMinimo !== undefined) {
    data.nivelMinimo = Math.max(0, Math.trunc(Number(input.nivelMinimo) || 0));
  }
  if (input.habilidadeId !== undefined) {
    data.habilidadeId = input.habilidadeId ? String(input.habilidadeId) : null;
  }
  if (input.ordem !== undefined) data.ordem = Math.trunc(Number(input.ordem) || 0);
  if (input.requisitos !== undefined) {
    data.requisitos = lerRequisitos(input.requisitos);
  }
  return data;
}

/** A camada precisa ser DESTA árvore, e o requisito não pode apontar pra fora. */
function validarVinculosDoNo(
  data: Record<string, unknown>,
  arvore: { camadas: { id: string }[]; ramos: { id: string }[]; nos: { id: string }[] },
  noId: string | null,
) {
  if (data.camadaId !== undefined) {
    const ok = arvore.camadas.some((c) => c.id === data.camadaId);
    if (!ok) throw new Error("Camada não pertence a esta árvore.");
  }
  if (data.ramoId) {
    const ok = arvore.ramos.some((r) => r.id === data.ramoId);
    if (!ok) throw new Error("Raia não pertence a esta árvore.");
  }
  if (data.requisitos !== undefined) {
    const idsValidos = new Set(arvore.nos.map((n) => n.id));
    const reqs = data.requisitos as RequisitoNo[];
    for (const r of reqs) {
      if (r.noId === noId) throw new Error("Um talento não pode exigir a si mesmo.");
      if (!idsValidos.has(r.noId)) {
        throw new Error("Requisito aponta pra talento de outra árvore.");
      }
    }
    if (noId && criaCiclo(noId, reqs, arvore.nos as NoArvore[])) {
      throw new Error("Esse requisito criaria um ciclo na árvore.");
    }
  }
}

/** Busca em profundidade: `noId` alcança a si mesmo seguindo os requisitos? */
function criaCiclo(noId: string, novosReqs: RequisitoNo[], nos: NoArvore[]): boolean {
  const porId = new Map(nos.map((n) => [n.id, n]));
  const vistos = new Set<string>();
  const pilha = novosReqs.map((r) => r.noId);
  while (pilha.length) {
    const atual = pilha.pop()!;
    if (atual === noId) return true;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    const pai = porId.get(atual);
    if (!pai) continue;
    for (const r of lerRequisitos(pai.requisitos)) pilha.push(r.noId);
  }
  return false;
}

export async function criarNo(
  personagemId: string,
  arvoreId: string,
  input: NoInput,
) {
  await autorizar(personagemId);
  const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
  const data = normalizarNo(input);
  if (data.nome === undefined) throw new Error("Nome do talento é obrigatório.");
  if (data.camadaId === undefined) throw new Error("Escolha a camada do talento.");
  validarVinculosDoNo(data, arvore, null);

  const no = await prisma.arvoreNo.create({
    data: {
      arvoreId,
      camadaId: data.camadaId as string,
      ramoId: (data.ramoId as string | null) ?? arvore.ramos[0]?.id ?? null,
      offsetY: (data.offsetY as number) ?? 50,
      nome: data.nome as string,
      descricao: (data.descricao as string) ?? "",
      icone: (data.icone as string) ?? "fa-circle-nodes",
      custo: (data.custo as number) ?? 0,
      maxRanks: (data.maxRanks as number) ?? 1,
      nivelMinimo: (data.nivelMinimo as number) ?? 0,
      habilidadeId: (data.habilidadeId as string | null) ?? null,
      requisitos: (data.requisitos as RequisitoNo[]) ?? [],
      ordem: (data.ordem as number) ?? arvore.nos.length,
    },
  });
  revalidatePath(`/ficha/${personagemId}`);
  return { id: no.id };
}

export async function atualizarNo(
  personagemId: string,
  arvoreId: string,
  noId: string,
  patch: NoInput,
) {
  await autorizar(personagemId);
  const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
  const data = normalizarNo(patch);
  validarVinculosDoNo(data, arvore, noId);

  // Baixar o teto de ranks não pode deixar o progresso acima dele.
  if (data.maxRanks !== undefined) {
    const atual = arvore.nos.find((n) => n.id === noId);
    if (atual && atual.rankAtual > (data.maxRanks as number)) {
      data.rankAtual = data.maxRanks;
    }
  }

  await prisma.arvoreNo.update({ where: { id: noId, arvoreId }, data });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function deletarNo(
  personagemId: string,
  arvoreId: string,
  noId: string,
) {
  await autorizar(personagemId);
  const arvore = await arvoreDoPersonagem(personagemId, arvoreId);

  // Limpa requisitos órfãos nos filhos antes de apagar o pai.
  const filhos = arvore.nos.filter((n) =>
    lerRequisitos(n.requisitos).some((r) => r.noId === noId),
  );
  await prisma.$transaction([
    ...filhos.map((f) =>
      prisma.arvoreNo.update({
        where: { id: f.id, arvoreId },
        data: {
          requisitos: lerRequisitos(f.requisitos).filter((r) => r.noId !== noId),
        },
      }),
    ),
    prisma.arvoreNo.delete({ where: { id: noId, arvoreId } }),
  ]);
  revalidatePath(`/ficha/${personagemId}`);
}

// ─── Comprar / devolver rank ───────────────────────────────
// O gating é revalidado AQUI com o mesmo `estadoNo` que o cliente usa — o
// cliente pinta o botão, o server é quem decide.

/** Monta o contexto de avaliação a partir do estado real no banco. */
async function contextoDaArvore(
  personagemId: string,
  arvore: { criterio: string; recursoCustoId: string | null; nos: NoArvore[] },
  nivelPersonagem: number,
): Promise<ContextoArvore> {
  let saldoRecurso: number | null = null;
  if (arvore.recursoCustoId) {
    const recurso = await prisma.recurso.findFirst({
      where: { id: arvore.recursoCustoId, personagemId },
    });
    // Recurso apagado depois de configurado → volta a ser custo informativo.
    saldoRecurso = recurso ? recurso.valorAtual : null;
  }
  return {
    criterio: normalizarCriterio(arvore.criterio),
    nivelPersonagem,
    nos: arvore.nos,
    saldoRecurso,
  };
}

export async function comprarNo(
  personagemId: string,
  arvoreId: string,
  noId: string,
) {
  const { personagem } = await autorizar(personagemId);
  const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
  const no = arvore.nos.find((n) => n.id === noId);
  if (!no) throw new Error("Talento não encontrado.");

  const ctx = await contextoDaArvore(
    personagemId,
    { ...arvore, nos: arvore.nos as NoArvore[] },
    personagem.nivel,
  );
  const estado = estadoNo(no as NoArvore, arvore.camadas, ctx);
  if (!estado.podeComprar) {
    throw new Error(estado.bloqueios[0] ?? "Talento indisponível.");
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.arvoreNo.update({
      where: { id: noId, arvoreId },
      data: { rankAtual: { increment: 1 } },
    }),
  ];
  // Debita o recurso só quando a árvore tem um configurado E ele ainda existe
  // (saldoRecurso null = custo virou informativo).
  if (arvore.recursoCustoId && ctx.saldoRecurso !== null && estado.custoProximo > 0) {
    ops.push(
      prisma.recurso.update({
        where: { id: arvore.recursoCustoId, personagemId },
        data: { valorAtual: { decrement: estado.custoProximo } },
      }),
    );
  }
  await prisma.$transaction(ops);
  revalidatePath(`/ficha/${personagemId}`);
}

export async function devolverNo(
  personagemId: string,
  arvoreId: string,
  noId: string,
) {
  await autorizar(personagemId);
  const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
  const no = arvore.nos.find((n) => n.id === noId);
  if (!no) throw new Error("Talento não encontrado.");
  if (no.rankAtual <= 0) throw new Error("Esse talento não está comprado.");

  const rankAlvo = no.rankAtual - 1;
  const quebrados = dependentesQuebrados(noId, rankAlvo, arvore.nos as NoArvore[]);
  if (quebrados.length > 0) {
    throw new Error(
      `Devolva antes: ${quebrados.map((n) => n.nome).join(", ")} depende deste talento.`,
    );
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.arvoreNo.update({
      where: { id: noId, arvoreId },
      data: { rankAtual: rankAlvo },
    }),
  ];
  if (arvore.recursoCustoId && no.custo > 0) {
    // Reembolso clampado ao máximo do recurso é feito abaixo, fora da
    // transação declarativa — increment simples pode estourar o valorMax.
    const recurso = await prisma.recurso.findFirst({
      where: { id: arvore.recursoCustoId, personagemId },
    });
    if (recurso) {
      ops.push(
        prisma.recurso.update({
          where: { id: recurso.id, personagemId },
          data: {
            valorAtual: Math.min(recurso.valorAtual + no.custo, recurso.valorMax),
          },
        }),
      );
    }
  }
  await prisma.$transaction(ops);
  revalidatePath(`/ficha/${personagemId}`);
}

// ─── Raias (ramos) ─────────────────────────────────────────
// Colunas nomeadas do canvas (ex: "Ofensivo" / "Defensivo"). Puramente visual —
// não entram no gating.

export async function criarRamo(
  personagemId: string,
  arvoreId: string,
  nome: string,
) {
  await autorizar(personagemId);
  const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
  const limpo = String(nome).trim().slice(0, 40);
  if (!limpo) throw new Error("Nome da raia é obrigatório.");

  const ramo = await prisma.arvoreRamo.create({
    data: { arvoreId, nome: limpo, ordem: arvore.ramos.length },
  });
  revalidatePath(`/ficha/${personagemId}`);
  return { id: ramo.id };
}

export async function atualizarRamo(
  personagemId: string,
  arvoreId: string,
  ramoId: string,
  patch: { nome?: unknown; ordem?: unknown },
) {
  await autorizar(personagemId);
  await arvoreDoPersonagem(personagemId, arvoreId);
  const data: Record<string, unknown> = {};
  if (patch.nome !== undefined) {
    const limpo = String(patch.nome).trim().slice(0, 40);
    if (!limpo) throw new Error("Nome da raia é obrigatório.");
    data.nome = limpo;
  }
  if (patch.ordem !== undefined) data.ordem = Math.trunc(Number(patch.ordem) || 0);

  await prisma.arvoreRamo.update({ where: { id: ramoId, arvoreId }, data });
  revalidatePath(`/ficha/${personagemId}`);
}

export async function deletarRamo(
  personagemId: string,
  arvoreId: string,
  ramoId: string,
) {
  await autorizar(personagemId);
  await arvoreDoPersonagem(personagemId, arvoreId);
  // Os nós NÃO caem junto — `ramoId` é onDelete: SetNull e eles voltam pra
  // primeira raia. Raia é enfeite; talento comprado não pode sumir por isso.
  await prisma.arvoreRamo.delete({ where: { id: ramoId, arvoreId } });
  revalidatePath(`/ficha/${personagemId}`);
}

/**
 * Reposiciona um nó no canvas (arrastar). Só mexe em raia + altura — nada de
 * gating —, então é barato e não revalida a página inteira: o cliente já
 * aplicou o movimento de forma otimista.
 */
export async function moverNo(
  personagemId: string,
  arvoreId: string,
  noId: string,
  destino: { ramoId: string | null; offsetY: number },
) {
  await autorizar(personagemId);
  const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
  if (destino.ramoId && !arvore.ramos.some((r) => r.id === destino.ramoId)) {
    throw new Error("Raia não pertence a esta árvore.");
  }
  await prisma.arvoreNo.update({
    where: { id: noId, arvoreId },
    data: {
      ramoId: destino.ramoId,
      offsetY: Math.max(0, Math.min(100, Math.round(Number(destino.offsetY) || 0))),
    },
  });
  revalidatePath(`/ficha/${personagemId}`);
}
