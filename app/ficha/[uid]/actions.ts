"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  ATRIBUTOS,
  PERICIAS,
  computarDeltasInstantaneos,
  lerEfeitos,
  lerProficiencias,
  normalizarEfeito,
  type Atributo,
  type EfeitoHabilidade,
  type PericiaSlug,
  type TipoEfeito,
} from "@/lib/op-rpg";

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
] as const;

type AcaoInput = Partial<Record<(typeof ALLOWED_ACAO)[number], unknown>>;

const TIPOS_ACAO_VALIDOS = new Set(["padrao", "bonus", "power", "react"]);

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
  "descricao",
  "dano",
  "modificador",
  "ca",
  "penalidadeDes",
  "equipado",
  "favorito",
  "categoria",
  "alcance",
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
      descricao: (data.descricao as string) ?? "",
      dano: (data.dano as string) ?? "",
      modificador: (data.modificador as number) ?? 0,
      ca: (data.ca as number) ?? 0,
      penalidadeDes: (data.penalidadeDes as number) ?? 0,
      categoria: (data.categoria as string) ?? "cortante",
      alcance: (data.alcance as string) ?? "corpo_a_corpo",
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
const ATRIBUTOS_VALIDOS = new Set(ATRIBUTOS.map((a) => a.slug));

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

// ─── Recursos customizados ────────────────────────────────
const ALLOWED_RECURSO = [
  "nome",
  "valorAtual",
  "valorMax",
  "ordem",
  "cor",
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
export async function usarHabilidade(
  personagemId: string,
  habilidadeId: string,
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
  const deltas = computarDeltasInstantaneos(efeitos);
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
  if (hab.usos != null) {
    ops.push(
      prisma.habilidade.update({
        where: { id: hab.id },
        data: { usosAtual: (hab.usosAtual ?? hab.usos) - 1 },
      }),
    );
  }

  if (ops.length > 0) {
    await prisma.$transaction(ops);
  }
  revalidatePath(`/ficha/${personagemId}`);
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
