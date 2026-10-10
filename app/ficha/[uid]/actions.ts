"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { ErroDeUso, executar } from "@/lib/acoes";
import {
  ATRIBUTOS,
  META_EFEITOS,
  PERICIAS,
  atributosEfetivos,
  computarDeltasInstantaneos,
  curasComFormula,
  custoDaAcao,
  efeitoInstantaneo,
  extrasDeCura,
  efeitosDaTecnica,
  lerEfeitos,
  modificador,
  lerProficiencias,
  motivoSemSobrecarga,
  normalizarEfeito,
  poolsEfetivos,
  resolverFormula,
  slugPericiaCustom,
  usosMaximos,
  type Atributo,
  type DeltasInstantaneos,
  type EfeitoHabilidade,
  type ExtraDeCura,
  type EfeitosAgregados,
  type PericiaSlug,
  type TipoEfeito,
} from "@/lib/op-rpg";
import { faixaDaRolagem } from "@/lib/dice";
import { carregarAgregado } from "@/lib/efeitos-servidor";
import {
  MAX_TIPOS_SALVOS,
  cdConcentracao,
  defesasDoAgregado,
  descreverParte,
  juntarTipos,
  lerTiposSalvos,
  mesmoTipo,
  negativosAtuais,
  resolverDano,
  type ParteDano,
} from "@/lib/dano";
import {
  lerConcentracao,
  lerDuracao,
  pedeConcentracao,
  turnosDaDuracao,
  type Concentracao,
} from "@/lib/duracao";
import {
  aplicarTurno,
  concentracaoEmCurso,
  duracoesEmCurso,
  validarRolagensTurno,
} from "@/lib/turno";
import { serializarMensagem } from "@/lib/mensagens";
import { TAMANHOS_VALIDOS, MADEIRAS_VALIDAS, statsTamanho } from "@/lib/navio";
import {
  corValida,
  normalizarEfeitoCor,
  normalizarEstilosTag,
  separarTags,
} from "@/lib/estilos-cor";
import {
  NIVEL_MAXIMO,
  PP_POR_NIVEL,
  clampGanhoPv,
  pvRetroativoPorCon,
  tetoGanhoPv,
  tetosNoNivel,
  validarAprimoramento,
  type Aprimoramento,
} from "@/lib/nivel";
import {
  dadosVidaRecuperados,
  facesDadoVida,
  ppDoDescansoLongo,
  recuperaNoDescanso,
  type ResumoDescanso,
  type TipoDescanso,
} from "@/lib/descanso";
import {
  MAX_RANKS_TETO,
  bloqueiosDevolver,
  estadoNo,
  lerRequisitos,
  acharPreset,
  clampColuna,
  clampLinha,
  noNaCelula,
  normalizarCriterio,
  primeiraLinhaLivre,
  raiaEfetiva,
  type ContextoArvore,
  type NoArvore,
  type RequisitoNo,
} from "@/lib/arvore";
import { nosDoMolde } from "@/lib/moldes-arvore";

// ─── Auth helper interno ───────────────────────────────────
// Verifica sessão + acesso (dono OU narrador) e retorna o personagem com mesa.
// Auth (Supabase) e personagem (Postgres) rodam em paralelo — checagem de
// ownership é feita depois que as duas resolvem.
async function autorizar(personagemId: string) {
  const [user, personagem] = await Promise.all([
    usuarioDaRequest(),
    prisma.personagem.findUnique({
      where: { id: personagemId },
      include: { mesa: true },
    }),
  ]);
  if (!user) throw new ErroDeUso("Não autenticado.");
  if (!personagem) throw new ErroDeUso("Personagem não encontrado.");

  const isDono = personagem.userId === user.id;
  const isNarrador = personagem.mesa?.userId === user.id;
  if (!isDono && !isNarrador) throw new ErroDeUso("Acesso negado.");

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
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);

    const data: Record<string, unknown> = {};
    for (const key of ALLOWED_PERSONAGEM) {
      if (patch[key] !== undefined) data[key] = patch[key];
    }
    // PV editado à mão zera os PV negativos.
    if (data.hpAtual !== undefined) data.pvNegativos = 0;
    // 0 PV ou exaustão 6 incapacitam: a concentração acaba.
    const incapacitou =
      (data.hpAtual !== undefined && Number(data.hpAtual) <= 0) ||
      (data.exaustao !== undefined && Number(data.exaustao) >= 6);

    await prisma.$transaction([
      prisma.personagem.update({
        where: { id: personagemId },
        data,
      }),
      ...(incapacitou ? opsConcentracao(personagemId, personagem.concentracao, null) : []),
    ]);
    revalidatePath(`/ficha/${personagemId}`);
  });
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
  "armaIds",
  "itemId",
  "habilidadeIds",
  "tecnica",
  "grau",
  "efeitos",
  "aliado",
  "duracao",
] as const;

type AcaoInput = Partial<Record<(typeof ALLOWED_ACAO)[number], unknown>>;

const TIPOS_ACAO_VALIDOS = new Set(["padrao", "bonus", "power", "react", "livre"]);

function normalizarAcaoInput(input: AcaoInput) {
  const data: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = (input.nome as string).trim();
    if (!nome) throw new ErroDeUso("Nome é obrigatório.");
    data.nome = nome;
  }
  if (input.descricao !== undefined) data.descricao = String(input.descricao);
  if (input.tipo !== undefined) {
    const tipo = String(input.tipo);
    if (!TIPOS_ACAO_VALIDOS.has(tipo)) throw new ErroDeUso("Tipo de ação inválido.");
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
        throw new ErroDeUso(`Atributo inválido em ${k}.`);
      }
      data[k] = v;
    }
  }
  if (input.dano !== undefined) data.dano = input.dano ? String(input.dano) : null;
  if (input.alcance !== undefined) data.alcance = input.alcance ? String(input.alcance) : null;
  // Refs soltas a Item e Habilidade (sem checar ownership).
  if (input.armaIds !== undefined) data.armaIds = normalizarIds(input.armaIds);
  if (input.habilidadeIds !== undefined) {
    data.habilidadeIds = normalizarIds(input.habilidadeIds);
  }
  // Item que concede a ação.
  if (input.itemId !== undefined) data.itemId = input.itemId ? String(input.itemId) : null;
  if (input.tecnica !== undefined) data.tecnica = Boolean(input.tecnica);
  if (input.grau !== undefined) {
    data.grau = Math.min(7, Math.max(0, Math.trunc(Number(input.grau) || 0)));
  }
  if (input.efeitos !== undefined) data.efeitos = normalizarEfeitosInput(input.efeitos);
  if (input.aliado !== undefined) data.aliado = Boolean(input.aliado);
  if (input.duracao !== undefined) data.duracao = lerDuracao(input.duracao) ?? Prisma.DbNull;
  return data;
}

// Lista de ids: só strings não-vazias, sem repetição, com teto defensivo.
function normalizarIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= 20) break;
  }
  return out;
}

export async function criarAcao(personagemId: string, input: AcaoInput) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarAcaoInput(input);
    if (data.nome === undefined) throw new ErroDeUso("Nome é obrigatório.");

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
        armaIds: (data.armaIds as string[]) ?? [],
        itemId: (data.itemId as string | null) ?? null,
        habilidadeIds: (data.habilidadeIds as string[]) ?? [],
        tecnica: (data.tecnica as boolean) ?? false,
        grau: (data.grau as number) ?? 0,
        efeitos: (data.efeitos as EfeitoHabilidade[]) ?? [],
        aliado: (data.aliado as boolean) ?? false,
        duracao: (data.duracao as Prisma.InputJsonValue | typeof Prisma.DbNull) ?? Prisma.DbNull,
      },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function atualizarAcao(
  personagemId: string,
  acaoId: string,
  patch: AcaoInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarAcaoInput(patch);
    await prisma.acao.update({
      where: { id: acaoId, personagemId },
      data,
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarAcao(personagemId: string, acaoId: string) {
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);
    await prisma.$transaction([
      prisma.acao.delete({ where: { id: acaoId, personagemId } }),
      ...soltarConcentracaoEm(personagemId, personagem.concentracao, acaoId),
    ]);
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// Usa a ação: debita o PP (com desconto) e o recurso de custo e aplica os
// efeitos na hora dela (cura, PV temporário, recurso). Sem PP, técnica de grau
// 1–5 pode ir com Sobrecarga; com `aliado`, os efeitos vão pro aliado escolhido.
export async function usarAcao(
  personagemId: string,
  acaoId: string,
  rolagens?: RolagensCura,
  opcoes?: { sobrecarga?: boolean; alvoId?: string },
) {
  return executar("ficha", async () => {
    const [{ personagem }, { agg, itens }, acao] = await Promise.all([
      autorizar(personagemId),
      carregarAgregado(personagemId),
      prisma.acao.findFirst({ where: { id: acaoId, personagemId } }),
    ]);
    if (!acao) throw new ErroDeUso("Ação não encontrada.");
    if (acao.itemId && !itens.some((i) => i.id === acao.itemId && i.equipado)) {
      throw new ErroDeUso("Equipe o item pra usar esta ação.");
    }

    const ids = new Set([...normalizarIds(acao.armaIds), ...(acao.itemId ? [acao.itemId] : [])]);
    const armas = itens.filter((i) => ids.has(i.id));
    const aggAcao = efeitosDaTecnica(agg, acao);
    let custoPp = custoDaAcao(aggAcao, armas, "pp", acao.custoPp, acao.grau).final;
    let exaustaoExtra = 0;
    if (custoPp > personagem.ppAtual) {
      const motivo = motivoSemSobrecarga(acao, personagem.exaustao);
      if (motivo || !opcoes?.sobrecarga) throw new ErroDeUso(motivo ?? "PP insuficiente.");
      exaustaoExtra = acao.grau;
      custoPp = 0;
    }
    const recurso = await recursoDeCusto(personagemId, acao.custoRecursoId, acao.custoRecursoValor);
    const efeitos = lerEfeitos(acao.efeitos).filter(efeitoInstantaneo);
    const aliado =
      acao.aliado && efeitos.length > 0 ? await aliadoDoUso(personagem, opcoes?.alvoId) : null;

    const ops = await opsDoUso({
      personagemId,
      personagem,
      agg,
      efeitos,
      rolagens,
      incluirMax: false,
      custoPp,
      recurso,
      custoRecurso: acao.custoRecursoValor,
      exaustaoExtra,
      aliado,
      grau: acao.grau,
    });
    if (pedeConcentracao(acao.duracao)) {
      const turnos = turnosDaDuracao(lerDuracao(acao.duracao));
      ops.push(
        ...opsConcentracao(personagemId, personagem.concentracao, {
          tipo: "acao",
          id: acao.id,
          nome: acao.nome,
          ...(turnos ? { turnos } : {}),
        }),
      );
    }
    if (ops.length > 0) await prisma.$transaction(ops);
    revalidatePath(`/ficha/${personagemId}`);
    if (aliado) revalidatePath(`/ficha/${aliado.personagem.id}`);
  });
}

// ─── Concentração ──────────────────────────────────────────

// Troca a concentração; a habilidade ligada que segurava a anterior desliga.
function opsConcentracao(
  personagemId: string,
  atualRaw: unknown,
  nova: Concentracao | null,
): Prisma.PrismaPromise<unknown>[] {
  const atual = lerConcentracao(atualRaw);
  if (!atual && !nova) return [];
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (atual?.tipo === "habilidade" && atual.id !== nova?.id) {
    ops.push(
      prisma.habilidade.updateMany({
        where: { id: atual.id, personagemId, ligada: true },
        data: { ligada: false },
      }),
    );
  }
  ops.push(
    prisma.personagem.update({
      where: { id: personagemId },
      data: { concentracao: nova ?? Prisma.DbNull },
    }),
  );
  return ops;
}

// A habilidade ou ação apagada/desligada era a da concentração: ela acaba.
function soltarConcentracaoEm(
  personagemId: string,
  atualRaw: unknown,
  id: string,
): Prisma.PrismaPromise<unknown>[] {
  if (lerConcentracao(atualRaw)?.id !== id) return [];
  return [
    prisma.personagem.update({
      where: { id: personagemId },
      data: { concentracao: Prisma.DbNull },
    }),
  ];
}

export async function encerrarConcentracao(personagemId: string) {
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);
    const ops = opsConcentracao(personagemId, personagem.concentracao, null);
    if (ops.length > 0) await prisma.$transaction(ops);
    revalidatePath(`/ficha/${personagemId}`);
  });
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
  "danoBonus",
  "danoSomaAtributo",
  "danoSomaProficiencia",
  "efeitos",
  "quantidade",
  "municaoId",
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
    if (!nome) throw new ErroDeUso("Nome é obrigatório.");
    data.nome = nome;
  }
  if (input.peso !== undefined) data.peso = Number(input.peso) || 0;
  if (input.tipo !== undefined) data.tipo = String(input.tipo) || "comum";
  if (input.tags !== undefined) data.tags = (input.tags as string) || "";
  if (input.tagsEstilo !== undefined) {
    // Poda estilos de tags que sumiram do texto.
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
    if (!CATEGORIAS_VALIDAS.has(v)) throw new ErroDeUso("Categoria inválida.");
    data.categoria = v;
  }
  if (input.alcance !== undefined) {
    const v = String(input.alcance);
    if (!ALCANCES_VALIDOS.has(v)) throw new ErroDeUso("Alcance inválido.");
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
      throw new ErroDeUso("Atributo de ataque inválido.");
    }
    data.atributoAtaque = v;
  }
  if (input.proficienteArma !== undefined) {
    data.proficienteArma = Boolean(input.proficienteArma);
  }
  if (input.danoBonus !== undefined) {
    const v = input.danoBonus ? String(input.danoBonus).trim().slice(0, 60) : "";
    data.danoBonus = v || null;
  }
  if (input.danoSomaAtributo !== undefined) {
    data.danoSomaAtributo = Boolean(input.danoSomaAtributo);
  }
  if (input.danoSomaProficiencia !== undefined) {
    data.danoSomaProficiencia = Boolean(input.danoSomaProficiencia);
  }
  if (input.efeitos !== undefined) data.efeitos = normalizarEfeitosInput(input.efeitos);
  if (input.quantidade !== undefined) {
    // Munição pode zerar e continuar no inventário.
    const minimo = input.tipo === "municao" ? 0 : 1;
    const n = Math.trunc(Number(input.quantidade));
    data.quantidade = Math.min(99999, Math.max(minimo, Number.isFinite(n) ? n : 1));
  }
  if (input.municaoId !== undefined) {
    const v = typeof input.municaoId === "string" ? input.municaoId.trim().slice(0, 64) : "";
    data.municaoId = v || null;
  }
  return data;
}

export async function criarItem(personagemId: string, input: ItemInput) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarItemInput(input);
    if (data.nome === undefined) throw new ErroDeUso("Nome é obrigatório.");

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
        danoBonus: (data.danoBonus as string | null) ?? null,
        danoSomaAtributo: (data.danoSomaAtributo as boolean) ?? false,
        danoSomaProficiencia: (data.danoSomaProficiencia as boolean) ?? false,
        efeitos: (data.efeitos as EfeitoHabilidade[]) ?? [],
        quantidade: (data.quantidade as number) ?? 1,
        municaoId: (data.municaoId as string | null) ?? null,
      },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function atualizarItem(
  personagemId: string,
  itemId: string,
  patch: ItemInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarItemInput(patch);

    await prisma.item.update({
      where: { id: itemId, personagemId },
      data,
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// Gasta munição de um ataque rolado.
export async function gastarMunicao(personagemId: string, itemId: string, quantidade = 1) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const item = await prisma.item.findFirst({
      where: { id: itemId, personagemId, tipo: "municao" },
      select: { id: true, nome: true, quantidade: true },
    });
    if (!item) throw new ErroDeUso("Munição não encontrada.");
    if (item.quantidade <= 0) throw new ErroDeUso(`Sem ${item.nome}.`);
    const n = Math.min(100, Math.max(1, Math.trunc(Number(quantidade) || 1)));
    await prisma.item.update({
      where: { id: item.id, personagemId },
      data: { quantidade: Math.max(0, item.quantidade - n) },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarItem(personagemId: string, itemId: string) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await prisma.item.delete({
      where: { id: itemId, personagemId },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
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
  return executar("ficha", async () => {
    if (!PERICIAS_VALIDAS.has(slug)) throw new ErroDeUso("Perícia inválida.");
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
  });
}

export async function setPericiaOutros(
  personagemId: string,
  slug: PericiaSlug,
  valor: number,
) {
  return executar("ficha", async () => {
    if (!PERICIAS_VALIDAS.has(slug)) throw new ErroDeUso("Perícia inválida.");
    if (!Number.isFinite(valor)) throw new ErroDeUso("Valor inválido.");
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
  });
}

export async function togglePericiaDobrada(
  personagemId: string,
  slug: PericiaSlug,
  dobrado: boolean,
) {
  return executar("ficha", async () => {
    if (!PERICIAS_VALIDAS.has(slug)) throw new ErroDeUso("Perícia inválida.");
    const { personagem } = await autorizar(personagemId);

    const prof = lerProficiencias(personagem.proficiencias);
    // "Dobrado" só faz sentido se for proficiente.
    if (dobrado && !prof.pericias.includes(slug)) {
      throw new ErroDeUso("É preciso ser proficiente antes de dobrar.");
    }
    prof.periciasDobradas = toggleEm(prof.periciasDobradas, slug, dobrado);

    await prisma.personagem.update({
      where: { id: personagemId },
      data: { proficiencias: prof },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function toggleSalvaguarda(
  personagemId: string,
  atributo: Atributo,
  proficiente: boolean,
) {
  return executar("ficha", async () => {
    if (!ATRIBUTOS_VALIDOS.has(atributo)) throw new ErroDeUso("Atributo inválido.");
    const { personagem } = await autorizar(personagemId);

    const prof = lerProficiencias(personagem.proficiencias);
    prof.salvaguardas = toggleEm(prof.salvaguardas, atributo, proficiente);

    await prisma.personagem.update({
      where: { id: personagemId },
      data: { proficiencias: prof },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function setSalvaguardaOutros(
  personagemId: string,
  atributo: Atributo,
  valor: number,
) {
  return executar("ficha", async () => {
    if (!ATRIBUTOS_VALIDOS.has(atributo)) throw new ErroDeUso("Atributo inválido.");
    if (!Number.isFinite(valor)) throw new ErroDeUso("Valor inválido.");
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
  });
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
  return executar("ficha", async () => {
    await autorizar(personagemId);

    const nome = String(input.nome ?? "").trim();
    if (!nome) throw new ErroDeUso("Dê um nome à perícia.");
    if (!ATRIBUTOS_VALIDOS.has(input.atributo)) throw new ErroDeUso("Atributo inválido.");
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
  });
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
  return executar("ficha", async () => {
    await autorizar(personagemId);

    const data: Record<string, unknown> = {};
    for (const key of ALLOWED_PERICIA_CUSTOM) {
      if (patch[key] !== undefined) data[key] = patch[key];
    }

    if (typeof data.nome === "string") {
      const nome = data.nome.trim();
      if (!nome) throw new ErroDeUso("Nome inválido.");
      data.nome = nome;
    }
    if (data.atributo !== undefined && !ATRIBUTOS_VALIDOS.has(String(data.atributo))) {
      throw new ErroDeUso("Atributo inválido.");
    }
    if (typeof data.origem === "string") data.origem = data.origem.trim();
    if (data.bonusOutros !== undefined) {
      const n = Number(data.bonusOutros);
      if (!Number.isFinite(n)) throw new ErroDeUso("Valor inválido.");
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
  });
}

export async function deletarPericiaCustom(personagemId: string, id: string) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await prisma.periciaCustom.delete({
      where: { id, personagemId },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Recursos customizados ────────────────────────────────
const ALLOWED_RECURSO = [
  "nome",
  "valorAtual",
  "valorMax",
  "ordem",
  "cor",
  "cor2",
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
      if (!nome) throw new ErroDeUso("Nome do recurso é obrigatório.");
      data.nome = nome;
    } else if (key === "valorAtual" || key === "valorMax" || key === "ordem") {
      data[key] = Number(input[key]) || 0;
    } else if (key === "resetEm") {
      const v = String(input.resetEm);
      if (!RESET_VALIDOS.has(v)) throw new ErroDeUso("resetEm inválido.");
      data.resetEm = v;
    } else if (key === "cor") {
      data.cor = corValida(input.cor);
    } else if (key === "cor2") {
      data.cor2 = corValida(input.cor2);
    } else if (key === "efeito") {
      data.efeito = normalizarEfeitoCor(input.efeito);
    }
  }
  if (!parcial && data.nome === undefined) {
    throw new ErroDeUso("Nome do recurso é obrigatório.");
  }
  return data;
}

export async function criarRecurso(personagemId: string, input: RecursoInput) {
  return executar("ficha", async () => {
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
        cor2: (data.cor2 as string | null) ?? null,
        efeito: (data.efeito as string) ?? "solido",
        resetEm: (data.resetEm as string) ?? "manual",
      },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function atualizarRecurso(
  personagemId: string,
  recursoId: string,
  patch: RecursoInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarRecurso(patch, true);

    await prisma.recurso.update({
      where: { id: recursoId, personagemId },
      data,
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarRecurso(personagemId: string, recursoId: string) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await prisma.recurso.delete({
      where: { id: recursoId, personagemId },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
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
  "itemId",
  "efeitos",
  "alternavel",
  "usosFormula",
  "aliado",
  "duracao",
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
  "item",
  "livre",
]);
const TIPOS_HAB_VALIDOS = new Set(["passiva", "ativa", "reativa", "livre"]);
const RECARGAS_VALIDAS_HAB = new Set([
  "descansoCurto",
  "descansoLongo",
  "encontro",
  "manual",
]);
// Tipos válidos derivados do catálogo de efeitos.
const TIPOS_EFEITO_VALIDOS = new Set<TipoEfeito>(
  Object.keys(META_EFEITOS) as TipoEfeito[],
);

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
    if (!nome) throw new ErroDeUso("Nome é obrigatório.");
    data.nome = nome;
  }
  if (input.origem !== undefined) {
    const v = String(input.origem);
    if (!ORIGENS_HAB_VALIDAS.has(v)) throw new ErroDeUso("Origem inválida.");
    data.origem = v;
  }
  if (input.tipo !== undefined) {
    const v = String(input.tipo);
    if (!TIPOS_HAB_VALIDOS.has(v)) throw new ErroDeUso("Tipo de habilidade inválido.");
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
      if (!RECARGAS_VALIDAS_HAB.has(v)) throw new ErroDeUso("Recarga inválida.");
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
  // Item que concede a habilidade.
  if (input.itemId !== undefined) data.itemId = input.itemId ? String(input.itemId) : null;
  if (input.efeitos !== undefined) data.efeitos = normalizarEfeitosInput(input.efeitos);
  if (input.alternavel !== undefined) data.alternavel = Boolean(input.alternavel);
  if (input.aliado !== undefined) data.aliado = Boolean(input.aliado);
  if (input.usosFormula !== undefined) {
    const f = input.usosFormula ? String(input.usosFormula).trim() : "";
    data.usosFormula = f && !Number.isFinite(Number(f)) ? f.slice(0, 60) : null;
  }
  if (input.duracao !== undefined) data.duracao = lerDuracao(input.duracao) ?? Prisma.DbNull;
  return data;
}

export async function criarHabilidade(
  personagemId: string,
  input: HabilidadeInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarHabilidadeInput(input);
    if (data.nome === undefined) throw new ErroDeUso("Nome é obrigatório.");

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
        itemId: (data.itemId as string | null) ?? null,
        efeitos: (data.efeitos as EfeitoHabilidade[]) ?? [],
        alternavel: (data.alternavel as boolean) ?? false,
        aliado: (data.aliado as boolean) ?? false,
        usosFormula: (data.usosFormula as string | null) ?? null,
        duracao: (data.duracao as Prisma.InputJsonValue | typeof Prisma.DbNull) ?? Prisma.DbNull,
      },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function atualizarHabilidade(
  personagemId: string,
  habilidadeId: string,
  patch: HabilidadeInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarHabilidadeInput(patch);
    await prisma.habilidade.update({
      where: { id: habilidadeId, personagemId },
      data,
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarHabilidade(
  personagemId: string,
  habilidadeId: string,
) {
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);
    await prisma.$transaction([
      prisma.habilidade.delete({ where: { id: habilidadeId, personagemId } }),
      ...soltarConcentracaoEm(personagemId, personagem.concentracao, habilidadeId),
    ]);
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// Total rolado de cada cura com fórmula, pelo índice do efeito.
export type RolagensCura = Record<number, number>;

// Aceita só as curas que rolam, presas à faixa possível da fórmula (com o dado a
// mais na cura de PV).
function validarRolagensCura(
  efeitos: EfeitoHabilidade[],
  rolagens: unknown,
  atributos: Record<Atributo, number>,
  nivel: number,
  grau = 0,
  extra?: ExtraDeCura,
): RolagensCura {
  const out: RolagensCura = {};
  if (!rolagens || typeof rolagens !== "object") return out;
  const comExtra = !!extra?.texto;
  for (const c of curasComFormula(efeitos, comExtra)) {
    const bruto = Number((rolagens as Record<string, unknown>)[c.idx]);
    if (!Number.isFinite(bruto)) continue;
    const f = resolverFormula(c.valor, atributos, nivel, { grau });
    const soma = comExtra && c.alvo === "hp" ? extra : undefined;
    const { min, max } = faixaDaRolagem(
      [...f.dados, ...(soma?.dados ?? [])],
      f.modificador + (soma?.modificador ?? 0),
    );
    out[c.idx] = Math.max(0, Math.min(max, Math.max(min, Math.trunc(bruto))));
  }
  return out;
}

type PersonagemDoUso = Awaited<ReturnType<typeof autorizar>>["personagem"];
type RecursoDoUso = NonNullable<Awaited<ReturnType<typeof prisma.recurso.findFirst>>>;

// Confere e busca o recurso de custo.
async function recursoDeCusto(
  personagemId: string,
  recursoId: string | null,
  valor: number,
): Promise<RecursoDoUso | null> {
  if (!recursoId || valor <= 0) return null;
  const r = await prisma.recurso.findFirst({ where: { id: recursoId, personagemId } });
  if (!r) throw new ErroDeUso("Recurso configurado não existe mais.");
  if (r.valorAtual < valor) throw new ErroDeUso(`${r.nome} insuficiente.`);
  return r;
}

// Pools de quem recebe os efeitos: o próprio personagem ou um aliado da mesa.
type PoolsDoUso = {
  id: string;
  hpAtual: number;
  hpMax: number;
  hpTemp: number;
  ppAtual: number;
  ppMax: number;
  exaustao: number;
};
type AliadoDoUso = { personagem: PoolsDoUso; agg: EfeitosAgregados };

const SEM_DELTAS: Omit<DeltasInstantaneos, "recursos"> = {
  hpAtual: 0,
  hpTemp: 0,
  ppAtual: 0,
  hpMax: 0,
  ppMax: 0,
  exaustao: 0,
};

// Aliado da mesma mesa (não o próprio), com o agregado dele pros máximos.
async function aliadoDoUso(personagem: PersonagemDoUso, alvoId: unknown): Promise<AliadoDoUso> {
  const id = typeof alvoId === "string" ? alvoId : "";
  if (!personagem.mesaId) throw new ErroDeUso("Entre numa mesa pra usar em um aliado.");
  if (!id || id === personagem.id) throw new ErroDeUso("Escolha um aliado.");
  const [alvo, { agg }] = await Promise.all([
    prisma.personagem.findFirst({ where: { id, mesaId: personagem.mesaId } }),
    carregarAgregado(id),
  ]);
  if (!alvo) throw new ErroDeUso("Esse aliado não está na mesa.");
  return { personagem: alvo, agg };
}

// Patch dos pools: PV/PP param no máximo efetivo, PV temporário fica o maior e a
// exaustão fica entre 0 e 6. `custoPp` e `exaustaoExtra` são de quem usa.
function patchDePools(
  p: PoolsDoUso,
  agg: EfeitosAgregados,
  d: Omit<DeltasInstantaneos, "recursos">,
  custoPp: number,
  exaustaoExtra: number,
): Record<string, number> {
  const hpMax = Math.max(1, p.hpMax + d.hpMax);
  const ppMax = Math.max(0, p.ppMax + d.ppMax);
  const efetivos = poolsEfetivos({ hpMax, ppMax }, agg);
  const novo = {
    hpAtual: somarAteOMaximo(p.hpAtual, d.hpAtual, efetivos.hpMax),
    ppAtual: somarAteOMaximo(Math.max(0, p.ppAtual - custoPp), d.ppAtual, efetivos.ppMax),
    hpTemp: Math.max(p.hpTemp, d.hpTemp),
    hpMax,
    ppMax,
    exaustao: clamp(p.exaustao + d.exaustao + exaustaoExtra, 0, 6),
  };
  const patch: Record<string, number> = {};
  for (const campo of Object.keys(novo) as (keyof typeof novo)[]) {
    if (novo[campo] !== p[campo]) patch[campo] = novo[campo];
  }
  return patch;
}

// Operações de um uso: debita PP e recurso e aplica os efeitos instantâneos
// (cura — a de fórmula chega rolada —, PV temporário, PV/PP máx, exaustão,
// recurso). Com `aliado`, PV, PP e exaustão dos efeitos vão pra ele; custos,
// Sobrecarga e recursos ficam com quem usa.
async function opsDoUso(opts: {
  personagemId: string;
  personagem: PersonagemDoUso;
  agg: EfeitosAgregados;
  efeitos: EfeitoHabilidade[];
  rolagens: unknown;
  incluirMax: boolean;
  custoPp: number;
  recurso: RecursoDoUso | null;
  custoRecurso: number;
  exaustaoExtra?: number;
  aliado?: AliadoDoUso | null;
  // Grau da técnica, pro GRAU das fórmulas.
  grau?: number;
}): Promise<Prisma.PrismaPromise<unknown>[]> {
  const { personagemId, personagem, agg, efeitos, aliado } = opts;
  const grau = opts.grau ?? 0;
  const atributos = atributosEfetivos(atributosDoPersonagem(personagem), agg);
  const deltas = computarDeltasInstantaneos(efeitos, {
    incluirMax: opts.incluirMax,
    rolagens: validarRolagensCura(
      efeitos,
      opts.rolagens,
      atributos,
      personagem.nivel,
      grau,
      extrasDeCura(agg),
    ),
    ctx: agg.ctxFormula ? { ...agg.ctxFormula, grau } : null,
  });
  const recursoIds = Object.keys(deltas.recursos);
  const recursosEfeito =
    recursoIds.length > 0
      ? await prisma.recurso.findMany({ where: { personagemId, id: { in: recursoIds } } })
      : [];

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const proprio = patchDePools(
    personagem,
    agg,
    aliado ? SEM_DELTAS : deltas,
    opts.custoPp,
    opts.exaustaoExtra ?? 0,
  );
  if (Object.keys(proprio).length > 0) {
    ops.push(prisma.personagem.update({ where: { id: personagemId }, data: proprio }));
  }
  if (aliado) {
    const doAliado = patchDePools(aliado.personagem, aliado.agg, deltas, 0, 0);
    if (Object.keys(doAliado).length > 0) {
      ops.push(prisma.personagem.update({ where: { id: aliado.personagem.id }, data: doAliado }));
    }
  }
  const { recurso, custoRecurso } = opts;
  if (recurso) {
    ops.push(
      prisma.recurso.update({
        where: { id: recurso.id, personagemId },
        data: { valorAtual: recurso.valorAtual - custoRecurso },
      }),
    );
  }
  for (const r of recursosEfeito) {
    const delta = deltas.recursos[r.id] ?? 0;
    if (!delta) continue;
    // Custo do recurso já foi debitado acima — não deduzir de novo.
    const base = recurso?.id === r.id ? r.valorAtual - custoRecurso : r.valorAtual;
    const novo = clamp(base + delta, 0, r.valorMax);
    if (novo === r.valorAtual) continue;
    ops.push(prisma.recurso.update({ where: { id: r.id, personagemId }, data: { valorAtual: novo } }));
  }
  return ops;
}

// Debita custos (PP, recurso de custo, usos) e aplica os efeitos instantâneos
// da habilidade numa transação. PA não tem campo no Personagem — quem quiser
// controle automático cria um Recurso customizado "PA".
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
  {
    incluirMax = true,
    rolagens,
    alvoId,
  }: { incluirMax?: boolean; rolagens?: unknown; alvoId?: unknown } = {},
) {
  const ligando = extraHabData.ligada === true;
  const [{ personagem }, { agg }, hab] = await Promise.all([
    autorizar(personagemId),
    carregarAgregado(personagemId, ligando ? { id: habilidadeId, ligada: true } : undefined),
    prisma.habilidade.findFirst({ where: { id: habilidadeId, personagemId } }),
  ]);
  if (!hab) throw new ErroDeUso("Habilidade não encontrada.");

  if (hab.custoPp > 0 && personagem.ppAtual < hab.custoPp) {
    throw new ErroDeUso("PP insuficiente.");
  }
  const usosMax = usosMaximos(hab, agg.ctxFormula);
  const usosAtual = hab.usosAtual ?? usosMax;
  if (usosMax != null && (usosAtual ?? 0) <= 0) {
    throw new ErroDeUso("Sem usos restantes.");
  }
  const recurso = await recursoDeCusto(personagemId, hab.custoRecursoId, hab.custoRecursoValor);
  const aliado = hab.aliado ? await aliadoDoUso(personagem, alvoId) : null;

  const ops = await opsDoUso({
    personagemId,
    personagem,
    agg,
    efeitos: lerEfeitos(hab.efeitos),
    rolagens,
    incluirMax,
    custoPp: hab.custoPp,
    recurso,
    custoRecurso: hab.custoRecursoValor,
    aliado,
  });
  const habData: Record<string, unknown> = { ...extraHabData };
  if (usosMax != null) habData.usosAtual = Math.max(0, (usosAtual ?? usosMax) - 1);
  if (ligando) habData.turnosRestantes = turnosDaDuracao(lerDuracao(hab.duracao));
  // Ligada num aliado: os efeitos que ficam valendo passam a contar nele.
  if (ligando && aliado) habData.alvoPersonagemId = aliado.personagem.id;
  if (Object.keys(habData).length > 0) {
    ops.push(prisma.habilidade.update({ where: { id: hab.id, personagemId }, data: habData }));
  }
  if (pedeConcentracao(hab.duracao)) {
    ops.push(
      ...opsConcentracao(personagemId, personagem.concentracao, {
        tipo: "habilidade",
        id: hab.id,
        nome: hab.nome,
      }),
    );
  }

  if (ops.length > 0) await prisma.$transaction(ops);
  revalidatePath(`/ficha/${personagemId}`);
  if (aliado) revalidatePath(`/ficha/${aliado.personagem.id}`);
}

// Botão "Usar" de habilidade não-sustentada (ou ativa só-instantânea): consome
// custos + aplica efeitos instantâneos, sem estado persistente.
export async function usarHabilidade(
  personagemId: string,
  habilidadeId: string,
  rolagens?: RolagensCura,
  alvoId?: string,
) {
  return executar("ficha", async () => {
    await aplicarUsoHabilidade(personagemId, habilidadeId, {}, { rolagens, alvoId });
  });
}

// Liga (consome custos e aplica instantâneos) ou desliga uma habilidade sustentada.
export async function alternarHabilidade(
  personagemId: string,
  habilidadeId: string,
  ligada: boolean,
  rolagens?: RolagensCura,
  alvoId?: string,
) {
  return executar("ficha", async () => {
    if (!ligada) {
      const { personagem } = await autorizar(personagemId);
      const hab = await prisma.habilidade.update({
        where: { id: habilidadeId, personagemId },
        data: { ligada: false },
        select: { alvoPersonagemId: true, aliado: true },
      });
      const soltar = soltarConcentracaoEm(personagemId, personagem.concentracao, habilidadeId);
      if (soltar.length > 0) await prisma.$transaction(soltar);
      revalidatePath(`/ficha/${personagemId}`);
      if (hab.aliado && hab.alvoPersonagemId) revalidatePath(`/ficha/${hab.alvoPersonagemId}`);
      return;
    }
    await aplicarUsoHabilidade(
      personagemId,
      habilidadeId,
      { ligada: true },
      { incluirMax: false, rolagens, alvoId },
    );
  });
}

// Quem recebe desliga a habilidade que um aliado ligou nele.
export async function dispensarRecebida(personagemId: string, habilidadeId: string) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const hab = await prisma.habilidade.findFirst({
      where: { id: habilidadeId, alvoPersonagemId: personagemId, ligada: true },
      select: { id: true, personagemId: true },
    });
    if (!hab) throw new ErroDeUso("Esse efeito já não está em você.");
    await prisma.habilidade.update({
      where: { id: hab.id, alvoPersonagemId: personagemId },
      data: { ligada: false },
    });
    revalidatePath(`/ficha/${personagemId}`);
    revalidatePath(`/ficha/${hab.personagemId}`);
  });
}

// Usa 1 unidade do item: aplica os efeitos na hora dele em quem usa ou num
// aliado da mesa e tira o item quando acaba.
export async function usarItem(
  personagemId: string,
  itemId: string,
  rolagens?: RolagensCura,
  alvoId?: string,
) {
  return executar("ficha", async () => {
    const [{ personagem }, { agg }, item] = await Promise.all([
      autorizar(personagemId),
      carregarAgregado(personagemId),
      prisma.item.findFirst({ where: { id: itemId, personagemId } }),
    ]);
    if (!item) throw new ErroDeUso("Item não encontrado.");
    const efeitos = lerEfeitos(item.efeitos).filter(efeitoInstantaneo);
    if (efeitos.length === 0) throw new ErroDeUso("Esse item não tem o que usar.");
    const aliado = alvoId && alvoId !== personagemId ? await aliadoDoUso(personagem, alvoId) : null;

    const ops = await opsDoUso({
      personagemId,
      personagem,
      agg,
      efeitos,
      rolagens,
      incluirMax: false,
      custoPp: 0,
      recurso: null,
      custoRecurso: 0,
      aliado,
    });
    ops.push(
      item.quantidade > 1
        ? prisma.item.update({
            where: { id: item.id, personagemId },
            data: { quantidade: item.quantidade - 1 },
          })
        : prisma.item.delete({ where: { id: item.id, personagemId } }),
    );
    await prisma.$transaction(ops);
    revalidatePath(`/ficha/${personagemId}`);
    if (aliado) revalidatePath(`/ficha/${aliado.personagem.id}`);
  });
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

// Soma até o máximo; nunca derruba o que já estava acima dele.
function somarAteOMaximo(atual: number, delta: number, max: number): number {
  if (delta <= 0) return Math.max(0, atual + delta);
  return Math.max(atual, Math.min(atual + delta, max));
}

function atributosDoPersonagem(p: Record<Atributo, number>): Record<Atributo, number> {
  return {
    forca: p.forca,
    destreza: p.destreza,
    constituicao: p.constituicao,
    sabedoria: p.sabedoria,
    vontade: p.vontade,
    presenca: p.presenca,
  };
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
    throw new ErroDeUso("Entre em uma mesa para ter um navio.");
  }
  return personagem.mesaId;
}

export async function criarNavio(personagemId: string) {
  return executar("ficha", async () => {
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
  });
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
  return executar("ficha", async () => {
    const mesaId = await mesaDoPersonagem(personagemId);

    const data: Record<string, unknown> = {};
    for (const key of ALLOWED_NAVIO) {
      if (patch[key] !== undefined) data[key] = patch[key];
    }

    if (typeof data.nome === "string") data.nome = data.nome.trim();
    if (typeof data.descricao === "string") data.descricao = data.descricao.trim();
    if (data.tamanho !== undefined && !TAMANHOS_VALIDOS.has(String(data.tamanho))) {
      throw new ErroDeUso("Tamanho de navio inválido.");
    }
    if (data.madeira !== undefined && !MADEIRAS_VALIDAS.has(String(data.madeira))) {
      throw new ErroDeUso("Madeira inválida.");
    }
    for (const num of ["pvAtual", "velocidadeNos", "canhoes"] as const) {
      if (data[num] !== undefined) {
        const n = Number(data[num]);
        if (!Number.isFinite(n)) throw new ErroDeUso("Valor inválido.");
        data[num] = Math.max(0, Math.trunc(n));
      }
    }

    if (Object.keys(data).length === 0) return;

    await prisma.navio.update({ where: { mesaId }, data });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarNavio(personagemId: string) {
  return executar("ficha", async () => {
    const mesaId = await mesaDoPersonagem(personagemId);
    // deleteMany tolera ausência (sem throw se já não existe).
    await prisma.navio.deleteMany({ where: { mesaId } });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Árvores de talento ────────────────────────────────────

const ALLOWED_ARVORE = [
  "nome",
  "icone",
  "cor",
  "cor2",
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
    if (!nome) throw new ErroDeUso("Nome da árvore é obrigatório.");
    data.nome = nome.slice(0, 60);
  }
  if (input.icone !== undefined) {
    data.icone = String(input.icone).trim().slice(0, 40) || "fa-sitemap";
  }
  if (input.cor !== undefined) data.cor = corValida(input.cor);
  if (input.cor2 !== undefined) data.cor2 = corValida(input.cor2);
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

async function arvoreDoPersonagem(personagemId: string, arvoreId: string) {
  const arvore = await prisma.arvore.findFirst({
    where: { id: arvoreId, personagemId },
    include: {
      camadas: { orderBy: { ordem: "asc" } },
      ramos: { orderBy: { ordem: "asc" } },
      nos: { orderBy: { ordem: "asc" } },
    },
  });
  if (!arvore) throw new ErroDeUso("Árvore não encontrada.");
  return arvore;
}

export async function criarArvore(
  personagemId: string,
  input: ArvoreInput & { preset?: unknown },
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarArvore(input);
    if (data.nome === undefined) throw new ErroDeUso("Nome da árvore é obrigatório.");

    // Sem preset explícito cai no "Em branco".
    const preset = acharPreset(input.preset);

    // Ids gerados aqui pros requisitos do molde apontarem pros nós novos.
    const arvoreId = randomUUID();
    const camadaIds = preset.camadas.map(() => randomUUID());
    const ramoIds = preset.ramos.map(() => randomUUID());
    const nos = nosDoMolde(preset.slug, { arvoreId, camadaIds, ramoIds }, randomUUID);

    await prisma.$transaction([
      prisma.arvore.create({
        data: {
          id: arvoreId,
          personagemId,
          nome: data.nome as string,
          icone: (data.icone as string) ?? preset.icone,
          cor: (data.cor as string | null) ?? null,
          cor2: (data.cor2 as string | null) ?? null,
          efeito: (data.efeito as string) ?? "solido",
          ordem: (data.ordem as number) ?? 0,
          criterio: (data.criterio as string) ?? preset.criterio,
          recursoCustoId: (data.recursoCustoId as string | null) ?? null,
          fundoUrl: (data.fundoUrl as string | null) ?? null,
          camadas: {
            create: preset.camadas.map((c, i) => ({
              id: camadaIds[i],
              nome: c.nome,
              ordem: i,
              limiar: c.limiar,
            })),
          },
          ramos: {
            create: preset.ramos.map((nome, i) => ({ id: ramoIds[i], nome, ordem: i })),
          },
        },
      }),
      ...(nos.length > 0 ? [prisma.arvoreNo.createMany({ data: nos })] : []),
    ]);
    revalidatePath(`/ficha/${personagemId}`);
    return { id: arvoreId, camadaId: camadaIds[0] ?? null };
  });
}

export async function atualizarArvore(
  personagemId: string,
  arvoreId: string,
  patch: ArvoreInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarArvore(patch);
    await prisma.arvore.update({ where: { id: arvoreId, personagemId }, data });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarArvore(personagemId: string, arvoreId: string) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await prisma.arvore.delete({ where: { id: arvoreId, personagemId } });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Camadas ───────────────────────────────────────────────
const ALLOWED_CAMADA = ["nome", "ordem", "limiar"] as const;
type CamadaInput = Partial<Record<(typeof ALLOWED_CAMADA)[number], unknown>>;

function normalizarCamada(input: CamadaInput) {
  const data: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = String(input.nome).trim();
    if (!nome) throw new ErroDeUso("Nome da camada é obrigatório.");
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
  return executar("ficha", async () => {
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
  });
}

export async function atualizarCamada(
  personagemId: string,
  arvoreId: string,
  camadaId: string,
  patch: CamadaInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await arvoreDoPersonagem(personagemId, arvoreId);
    const data = normalizarCamada(patch);
    await prisma.arvoreCamada.update({ where: { id: camadaId, arvoreId }, data });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarCamada(
  personagemId: string,
  arvoreId: string,
  camadaId: string,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
    if (arvore.camadas.length <= 1) {
      throw new ErroDeUso("A árvore precisa de pelo menos uma camada.");
    }
    await prisma.arvoreCamada.delete({ where: { id: camadaId, arvoreId } });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Nós ───────────────────────────────────────────────────
const ALLOWED_NO = [
  "camadaId",
  "ramoId",
  "coluna",
  "linha",
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
    if (!nome) throw new ErroDeUso("Nome do talento é obrigatório.");
    data.nome = nome.slice(0, 60);
  }
  if (input.camadaId !== undefined) data.camadaId = String(input.camadaId);
  if (input.ramoId !== undefined) data.ramoId = input.ramoId ? String(input.ramoId) : null;
  if (input.coluna !== undefined) data.coluna = clampColuna(input.coluna);
  if (input.linha !== undefined) data.linha = clampLinha(input.linha);
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

function validarVinculosDoNo(
  data: Record<string, unknown>,
  arvore: { camadas: { id: string }[]; ramos: { id: string }[]; nos: { id: string }[] },
  noId: string | null,
) {
  if (data.camadaId !== undefined) {
    const ok = arvore.camadas.some((c) => c.id === data.camadaId);
    if (!ok) throw new ErroDeUso("Camada não pertence a esta árvore.");
  }
  if (data.ramoId) {
    const ok = arvore.ramos.some((r) => r.id === data.ramoId);
    if (!ok) throw new ErroDeUso("Ramo não pertence a esta árvore.");
  }
  if (data.requisitos !== undefined) {
    const idsValidos = new Set(arvore.nos.map((n) => n.id));
    const reqs = data.requisitos as RequisitoNo[];
    for (const r of reqs) {
      if (r.noId === noId) throw new ErroDeUso("Um talento não pode exigir a si mesmo.");
      if (!idsValidos.has(r.noId)) {
        throw new ErroDeUso("Requisito aponta pra talento de outra árvore.");
      }
    }
    if (noId && criaCiclo(noId, reqs, arvore.nos as NoArvore[])) {
      throw new ErroDeUso("Esse requisito criaria um ciclo na árvore.");
    }
  }
}

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
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
    const data = normalizarNo(input);
    if (data.nome === undefined) throw new ErroDeUso("Nome do talento é obrigatório.");
    if (data.camadaId === undefined) throw new ErroDeUso("Escolha a camada do talento.");
    validarVinculosDoNo(data, arvore, null);

    // A célula pedida, se livre; senão a primeira linha livre da mesma coluna.
    const nos = arvore.nos as NoArvore[];
    const celula = {
      camadaId: data.camadaId as string,
      ramoId: raiaEfetiva((data.ramoId as string | null | undefined) ?? null, arvore.ramos),
      coluna: (data.coluna as number | undefined) ?? 0,
    };
    const linhaPedida = data.linha as number | undefined;
    const linha =
      linhaPedida !== undefined && !noNaCelula({ ...celula, linha: linhaPedida }, nos, arvore.ramos)
        ? linhaPedida
        : primeiraLinhaLivre(celula, nos, arvore.ramos);

    const no = await prisma.arvoreNo.create({
      data: {
        arvoreId,
        ...celula,
        linha,
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
  });
}

export async function atualizarNo(
  personagemId: string,
  arvoreId: string,
  noId: string,
  patch: NoInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
    const data = normalizarNo(patch);
    validarVinculosDoNo(data, arvore, noId);
    const atual = arvore.nos.find((n) => n.id === noId);
    if (!atual) throw new ErroDeUso("Talento não encontrado.");

    // Baixar o teto de ranks não pode deixar o progresso acima dele.
    if (data.maxRanks !== undefined && atual.rankAtual > (data.maxRanks as number)) {
      data.rankAtual = data.maxRanks;
    }

    // Mudou de célula: se ocupada, desce pra primeira linha livre.
    if (["camadaId", "ramoId", "coluna", "linha"].some((k) => data[k] !== undefined)) {
      const nos = arvore.nos as NoArvore[];
      const alvo = {
        camadaId: (data.camadaId as string | undefined) ?? atual.camadaId,
        ramoId: raiaEfetiva(
          data.ramoId !== undefined ? (data.ramoId as string | null) : atual.ramoId,
          arvore.ramos,
        ),
        coluna: (data.coluna as number | undefined) ?? atual.coluna,
        linha: (data.linha as number | undefined) ?? atual.linha,
      };
      if (noNaCelula(alvo, nos, arvore.ramos, noId)) {
        alvo.linha = primeiraLinhaLivre(alvo, nos, arvore.ramos, noId);
      }
      Object.assign(data, alvo);
    }

    await prisma.arvoreNo.update({ where: { id: noId, arvoreId }, data });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarNo(
  personagemId: string,
  arvoreId: string,
  noId: string,
) {
  return executar("ficha", async () => {
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
  });
}

// ─── Comprar / devolver rank ───────────────────────────────
// O server revalida com o mesmo `estadoNo` do cliente.

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
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
    const no = arvore.nos.find((n) => n.id === noId);
    if (!no) throw new ErroDeUso("Talento não encontrado.");

    const ctx = await contextoDaArvore(
      personagemId,
      { ...arvore, nos: arvore.nos as NoArvore[] },
      personagem.nivel,
    );
    const estado = estadoNo(no as NoArvore, arvore.camadas, ctx);
    if (!estado.podeComprar) {
      throw new ErroDeUso(estado.bloqueios[0] ?? "Talento indisponível.");
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.arvoreNo.update({
        where: { id: noId, arvoreId },
        data: { rankAtual: { increment: 1 } },
      }),
    ];
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
  });
}

export async function devolverNo(
  personagemId: string,
  arvoreId: string,
  noId: string,
) {
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
    const no = arvore.nos.find((n) => n.id === noId);
    if (!no) throw new ErroDeUso("Talento não encontrado.");
    if (no.rankAtual <= 0) throw new ErroDeUso("Esse talento não está comprado.");

    const rankAlvo = no.rankAtual - 1;
    const ctx = await contextoDaArvore(
      personagemId,
      { ...arvore, nos: arvore.nos as NoArvore[] },
      personagem.nivel,
    );
    const bloqueios = bloqueiosDevolver(noId, arvore.camadas, ctx);
    if (bloqueios.length > 0) {
      throw new ErroDeUso(`Devolva antes: ${bloqueios.join("; ")}.`);
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.arvoreNo.update({
        where: { id: noId, arvoreId },
        data: { rankAtual: rankAlvo },
      }),
    ];
    if (arvore.recursoCustoId && no.custo > 0) {
      // Reembolso clampado no valorMax, fora da transação.
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
  });
}

// ─── Ramos ────────────────────────────────────────────────

export async function criarRamo(
  personagemId: string,
  arvoreId: string,
  nome: string,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
    const limpo = String(nome).trim().slice(0, 40);
    if (!limpo) throw new ErroDeUso("Nome do ramo é obrigatório.");

    const ramo = await prisma.arvoreRamo.create({
      data: { arvoreId, nome: limpo, ordem: arvore.ramos.length },
    });
    revalidatePath(`/ficha/${personagemId}`);
    return { id: ramo.id };
  });
}

export async function atualizarRamo(
  personagemId: string,
  arvoreId: string,
  ramoId: string,
  patch: { nome?: unknown; ordem?: unknown },
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await arvoreDoPersonagem(personagemId, arvoreId);
    const data: Record<string, unknown> = {};
    if (patch.nome !== undefined) {
      const limpo = String(patch.nome).trim().slice(0, 40);
      if (!limpo) throw new ErroDeUso("Nome do ramo é obrigatório.");
      data.nome = limpo;
    }
    if (patch.ordem !== undefined) data.ordem = Math.trunc(Number(patch.ordem) || 0);

    await prisma.arvoreRamo.update({ where: { id: ramoId, arvoreId }, data });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarRamo(
  personagemId: string,
  arvoreId: string,
  ramoId: string,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await arvoreDoPersonagem(personagemId, arvoreId);
    // ramoId é SetNull: os nós voltam pro primeiro ramo.
    await prisma.arvoreRamo.delete({ where: { id: ramoId, arvoreId } });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

/** Leva o nó pra outra célula da grade; se ela tiver dono, os dois trocam de lugar. */
export async function moverNo(
  personagemId: string,
  arvoreId: string,
  noId: string,
  destino: { camadaId: string; ramoId: string | null; coluna: number; linha: number },
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
    const no = arvore.nos.find((n) => n.id === noId);
    if (!no) throw new ErroDeUso("Talento não encontrado.");
    if (!arvore.camadas.some((c) => c.id === destino.camadaId)) {
      throw new ErroDeUso("Camada não pertence a esta árvore.");
    }
    if (destino.ramoId && !arvore.ramos.some((r) => r.id === destino.ramoId)) {
      throw new ErroDeUso("Ramo não pertence a esta árvore.");
    }

    const alvo = {
      camadaId: destino.camadaId,
      ramoId: raiaEfetiva(destino.ramoId, arvore.ramos),
      coluna: clampColuna(destino.coluna),
      linha: clampLinha(destino.linha),
    };
    const ocupante = noNaCelula(alvo, arvore.nos as NoArvore[], arvore.ramos, noId);
    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.arvoreNo.update({ where: { id: noId, arvoreId }, data: alvo }),
    ];
    if (ocupante) {
      ops.push(
        prisma.arvoreNo.update({
          where: { id: ocupante.id, arvoreId },
          data: {
            camadaId: no.camadaId,
            ramoId: raiaEfetiva(no.ramoId, arvore.ramos),
            coluna: no.coluna,
            linha: no.linha,
          },
        }),
      );
    }
    await prisma.$transaction(ops);
    revalidatePath(`/ficha/${personagemId}`);
  });
}

/**
 * Copia a estrutura da árvore (sem progresso) pra outro personagem ou pro mesmo.
 * habilidadeId e recursoCustoId são religados por nome no destino, ou viram null.
 */
export async function duplicarArvore(
  personagemId: string,
  arvoreOrigemId: string,
) {
  return executar("ficha", async () => {
    const { user } = await autorizar(personagemId);

    const origem = await prisma.arvore.findUnique({
      where: { id: arvoreOrigemId },
      include: {
        personagem: { include: { mesa: true } },
        camadas: { orderBy: { ordem: "asc" } },
        ramos: { orderBy: { ordem: "asc" } },
        nos: { orderBy: { ordem: "asc" } },
      },
    });
    if (!origem) throw new ErroDeUso("Árvore de origem não encontrada.");

    // Acesso à origem é checado à parte: `autorizar` cobriu só o destino.
    const podeLerOrigem =
      origem.personagem.userId === user.id ||
      origem.personagem.mesa?.userId === user.id;
    if (!podeLerOrigem) throw new ErroDeUso("Sem acesso à árvore de origem.");

    const [habilidadesDestino, recursosDestino] = await Promise.all([
      prisma.habilidade.findMany({
        where: { personagemId },
        select: { id: true, nome: true },
      }),
      prisma.recurso.findMany({
        where: { personagemId },
        select: { id: true, nome: true },
      }),
    ]);
    const habPorNome = new Map(
      habilidadesDestino.map((h) => [h.nome.trim().toLowerCase(), h.id]),
    );
    const recPorNome = new Map(
      recursosDestino.map((r) => [r.nome.trim().toLowerCase(), r.id]),
    );

    let recursoCustoId: string | null = null;
    if (origem.recursoCustoId) {
      const original = await prisma.recurso.findUnique({
        where: { id: origem.recursoCustoId },
        select: { nome: true },
      });
      if (original) {
        recursoCustoId = recPorNome.get(original.nome.trim().toLowerCase()) ?? null;
      }
    }

    const mesmoDono = origem.personagemId === personagemId;
    const nome = mesmoDono ? `${origem.nome} (cópia)`.slice(0, 60) : origem.nome;

    const ordemFinal = await prisma.arvore.count({ where: { personagemId } });

    // 1: árvore, camadas e raias.
    const nova = await prisma.arvore.create({
      data: {
        personagemId,
        nome,
        icone: origem.icone,
        cor: origem.cor,
        cor2: origem.cor2,
        efeito: origem.efeito,
        ordem: ordemFinal,
        criterio: origem.criterio,
        recursoCustoId,
        fundoUrl: origem.fundoUrl,
        camadas: {
          create: origem.camadas.map((c) => ({
            nome: c.nome,
            ordem: c.ordem,
            limiar: c.limiar,
          })),
        },
        ramos: {
          create: origem.ramos.map((r) => ({ nome: r.nome, ordem: r.ordem })),
        },
      },
      include: {
        camadas: { orderBy: { ordem: "asc" } },
        ramos: { orderBy: { ordem: "asc" } },
      },
    });

    // Pareamento por índice: a ordem é preservada, nomes podem repetir.
    const mapaCamada = new Map<string, string>();
    origem.camadas.forEach((c, i) => {
      const destino = nova.camadas[i];
      if (destino) mapaCamada.set(c.id, destino.id);
    });
    const mapaRamo = new Map<string, string>();
    origem.ramos.forEach((r, i) => {
      const destino = nova.ramos[i];
      if (destino) mapaRamo.set(r.id, destino.id);
    });

    // 2: talentos, ainda sem requisitos.
    const mapaNo = new Map<string, string>();
    for (const no of origem.nos) {
      const camadaId = mapaCamada.get(no.camadaId);
      if (!camadaId) continue; // camada órfã — não deveria acontecer
      const criado = await prisma.arvoreNo.create({
        data: {
          arvoreId: nova.id,
          camadaId,
          ramoId: no.ramoId ? mapaRamo.get(no.ramoId) ?? null : null,
          coluna: no.coluna,
          linha: no.linha,
          nome: no.nome,
          descricao: no.descricao,
          icone: no.icone,
          custo: no.custo,
          maxRanks: no.maxRanks,
          rankAtual: 0,
          nivelMinimo: no.nivelMinimo,
          habilidadeId: habPorNome.get(no.nome.trim().toLowerCase()) ?? null,
          requisitos: [],
          ordem: no.ordem,
        },
        select: { id: true },
      });
      mapaNo.set(no.id, criado.id);
    }

    // 3: requisitos com os ids novos.
    const comRequisitos = origem.nos
      .map((no) => {
        const reqs = lerRequisitos(no.requisitos)
          .map((r) => {
            const alvo = mapaNo.get(r.noId);
            return alvo ? { noId: alvo, rank: r.rank } : null;
          })
          .filter((r): r is RequisitoNo => r !== null);
        const id = mapaNo.get(no.id);
        return id && reqs.length > 0 ? { id, reqs } : null;
      })
      .filter((x): x is { id: string; reqs: RequisitoNo[] } => x !== null);

    if (comRequisitos.length > 0) {
      await prisma.$transaction(
        comRequisitos.map((x) =>
          prisma.arvoreNo.update({
            where: { id: x.id, arvoreId: nova.id },
            data: { requisitos: x.reqs },
          }),
        ),
      );
    }

    revalidatePath(`/ficha/${personagemId}`);
    return { id: nova.id, talentos: mapaNo.size };
  });
}

// ─── Dano e cura ───────────────────────────────────────────

const MAX_PARTES_DANO = 6;

function normalizarPartesDano(raw: unknown): ParteDano[] {
  if (!Array.isArray(raw)) return [];
  const out: ParteDano[] = [];
  for (const item of raw.slice(0, MAX_PARTES_DANO)) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const valor = Math.min(99999, Math.max(0, Math.trunc(Number(obj.valor) || 0)));
    if (valor <= 0) continue;
    out.push({ valor, tipo: typeof obj.tipo === "string" ? obj.tipo.trim().slice(0, 40) : "" });
  }
  return out;
}

// Aplica o dano com as defesas do servidor; o cliente só desliga as que não
// valem no golpe. Publica no chat.
export async function receberDano(
  personagemId: string,
  entrada: { partes: unknown; desligadas?: unknown; semTemp?: unknown },
) {
  return executar("ficha", async () => {
    const partes = normalizarPartesDano(entrada.partes);
    if (partes.length === 0) throw new ErroDeUso("Informe o dano.");
    const desligadas = Array.isArray(entrada.desligadas)
      ? entrada.desligadas.filter((d): d is string => typeof d === "string").slice(0, 40)
      : [];
    const [{ user, personagem }, { agg }] = await Promise.all([
      autorizar(personagemId),
      carregarAgregado(personagemId),
    ]);

    const hpMax = poolsEfetivos(personagem, agg).hpMax;
    const r = resolverDano(partes, defesasDoAgregado(agg), { ...personagem, hpMax }, {
      desligadas,
      semTemp: entrada.semTemp === true,
    });

    // Habilidade que dura "enquanto tiver PV temporário" desliga quando ele acaba.
    const semTempAgora = r.hpTemp.antes > 0 && r.hpTemp.depois === 0;
    const acabaram = semTempAgora
      ? (
          await prisma.habilidade.findMany({
            where: { personagemId, ligada: true },
            select: { id: true, nome: true, duracao: true },
          })
        ).filter((h) => lerDuracao(h.duracao)?.unidade === "pv_temp")
      : [];
    // A 0 PV (incapacitado), ou sem a habilidade que a segurava, a concentração acaba.
    const concentracao = lerConcentracao(personagem.concentracao);
    const perdeu =
      !!concentracao &&
      (r.hpAtual.depois <= 0 || acabaram.some((h) => h.id === concentracao.id));
    const cd = concentracao && !perdeu ? cdConcentracao(r.final) : null;
    const teste = concentracao && cd ? { nome: concentracao.nome, cd } : null;

    const detalhes = {
      partes: r.partes.map((p) => ({
        valor: p.valor,
        tipo: p.tipo,
        final: p.final,
        texto: descreverParte(p),
      })),
      final: r.final,
      absorvido: r.absorvido,
      hpTemp: [r.hpTemp.antes, r.hpTemp.depois],
      hpAtual: [r.hpAtual.antes, r.hpAtual.depois],
      hpMax,
      pvNegativos: [r.pvNegativos.antes, r.pvNegativos.depois],
      caiu: r.caiu,
      morreu: r.morreu,
      concentracao: teste,
      perdeuConcentracao: perdeu ? concentracao!.nome : null,
      acabaram: acabaram.map((h) => h.nome),
    };
    const mensagem = prisma.mensagem.create({
      data: {
        sessionId: personagem.mesaId || personagem.id,
        uid: user.id,
        nome: personagem.nome,
        mensagem: `recebeu ${r.final} de dano`,
        tipo: "dano",
        total: r.final,
        detalhes,
      },
    });
    // Tipo digitado que ainda não estava salvo entra na frente da lista.
    const salvos = lerTiposSalvos(personagem.tiposDano);
    const novos = partes.map((p) => p.tipo).filter((t) => t && !salvos.some((s) => mesmoTipo(s, t)));
    const [criada] = await prisma.$transaction([
      mensagem,
      prisma.personagem.update({
        where: { id: personagemId },
        data: {
          hpAtual: r.hpAtual.depois,
          hpTemp: r.hpTemp.depois,
          pvNegativos: r.pvNegativos.depois,
          ...(novos.length > 0
            ? { tiposDano: juntarTipos(novos, salvos).slice(0, MAX_TIPOS_SALVOS) }
            : {}),
        },
      }),
      ...acabaram.map((h) =>
        prisma.habilidade.update({ where: { id: h.id, personagemId }, data: { ligada: false } }),
      ),
      ...(perdeu ? opsConcentracao(personagemId, concentracao, null) : []),
    ]);
    revalidatePath(`/ficha/${personagemId}`);
    return {
      resultado: r,
      mensagem: serializarMensagem(criada as Awaited<typeof mensagem>),
      teste,
      perdeuConcentracao: perdeu,
      acabaram: acabaram.map((h) => ({ id: h.id, nome: h.nome })),
    };
  });
}

// Tira um tipo da lista salva (comparado pelas letras).
export async function esquecerTipoDano(personagemId: string, tipo: unknown) {
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);
    const alvo = typeof tipo === "string" ? tipo : "";
    const salvos = lerTiposSalvos(personagem.tiposDano);
    const restantes = salvos.filter((s) => !mesmoTipo(s, alvo));
    if (restantes.length === salvos.length) return;
    await prisma.personagem.update({
      where: { id: personagemId },
      data: { tiposDano: restantes },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// Cura manual de PV, até o máximo efetivo. Publica no chat.
export async function curarPv(personagemId: string, valor: unknown) {
  return executar("ficha", async () => {
    const cura = Math.min(99999, Math.max(0, Math.trunc(Number(valor) || 0)));
    if (cura <= 0) throw new ErroDeUso("Informe a cura.");
    const [{ user, personagem }, { agg }] = await Promise.all([
      autorizar(personagemId),
      carregarAgregado(personagemId),
    ]);
    const hpMax = poolsEfetivos(personagem, agg).hpMax;
    const depois = somarAteOMaximo(personagem.hpAtual, cura, hpMax);
    const [, criada] = await prisma.$transaction([
      prisma.personagem.update({ where: { id: personagemId }, data: { hpAtual: depois } }),
      prisma.mensagem.create({
        data: {
          sessionId: personagem.mesaId || personagem.id,
          uid: user.id,
          nome: personagem.nome,
          mensagem: `recuperou ${depois - personagem.hpAtual} PV`,
          tipo: "cura",
          total: depois - personagem.hpAtual,
          detalhes: { valor: cura, hpAtual: [personagem.hpAtual, depois], hpMax },
        },
      }),
    ]);
    revalidatePath(`/ficha/${personagemId}`);
    return { hpAtual: depois, mensagem: serializarMensagem(criada) };
  });
}

// ─── Turno ─────────────────────────────────────────────────

// Passar turno: aplica o "a cada turno" e conta as durações em turnos. O
// cliente rola; o servidor prende cada total na faixa da fórmula. Publica no chat.
export async function passarTurno(personagemId: string, rolagens?: unknown) {
  return executar("ficha", async () => {
    const [{ user, personagem }, { agg }, recursos, ligadas] = await Promise.all([
      autorizar(personagemId),
      carregarAgregado(personagemId),
      prisma.recurso.findMany({ where: { personagemId } }),
      prisma.habilidade.findMany({
        where: { personagemId, ligada: true },
        select: { id: true, nome: true, duracao: true, turnosRestantes: true },
      }),
    ]);
    const duracoes = duracoesEmCurso(ligadas);
    const concentracao = lerConcentracao(personagem.concentracao);
    const tecnica = concentracaoEmCurso(personagem.concentracao);
    if (agg.porTurno.length === 0 && duracoes.length === 0 && !tecnica) {
      throw new ErroDeUso("Nada acontece a cada turno.");
    }

    const ctx = agg.ctxFormula ?? { nivel: personagem.nivel, atributos: atributosDoPersonagem(personagem) };
    const resolver = (f: string) => resolverFormula(f, ctx.atributos, ctx.nivel);
    const pools = poolsEfetivos(personagem, agg);
    const r = aplicarTurno({
      porTurno: agg.porTurno,
      valores: validarRolagensTurno(agg.porTurno, rolagens, resolver),
      estado: {
        hpAtual: personagem.hpAtual,
        hpTemp: personagem.hpTemp,
        hpMax: pools.hpMax,
        pvNegativos: negativosAtuais(personagem.hpAtual, personagem.pvNegativos),
        ppAtual: personagem.ppAtual,
        ppMax: pools.ppMax,
        exaustao: personagem.exaustao,
        recursos: Object.fromEntries(
          recursos.map((x) => [x.id, { nome: x.nome, valorAtual: x.valorAtual, valorMax: x.valorMax }]),
        ),
      },
      defesas: defesasDoAgregado(agg),
      duracoes,
      concentracao: tecnica,
    });

    // Incapacitado, duração acabou ou a habilidade que segurava desligou: a concentração acaba.
    const perdeu =
      !!concentracao &&
      (r.estado.hpAtual <= 0 ||
        r.estado.exaustao >= 6 ||
        r.concentracaoTurnos === 0 ||
        r.desligar.some((h) => h.id === concentracao.id));
    const testes =
      concentracao && !perdeu
        ? r.danos.map(cdConcentracao).filter((cd): cd is number => cd != null)
        : [];

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    const dadosPersonagem: Record<string, unknown> = {};
    for (const campo of ["hpAtual", "hpTemp", "pvNegativos", "ppAtual", "exaustao"] as const) {
      if (r.estado[campo] !== personagem[campo]) dadosPersonagem[campo] = r.estado[campo];
    }
    if (perdeu) dadosPersonagem.concentracao = Prisma.DbNull;
    else if (concentracao && r.concentracaoTurnos != null) {
      dadosPersonagem.concentracao = { ...concentracao, turnos: r.concentracaoTurnos };
    }
    if (Object.keys(dadosPersonagem).length > 0) {
      ops.push(prisma.personagem.update({ where: { id: personagemId }, data: dadosPersonagem }));
    }
    for (const x of recursos) {
      const novo = r.estado.recursos[x.id]?.valorAtual;
      if (novo != null && novo !== x.valorAtual) {
        ops.push(prisma.recurso.update({ where: { id: x.id, personagemId }, data: { valorAtual: novo } }));
      }
    }
    for (const h of r.desligar) {
      ops.push(
        prisma.habilidade.update({
          where: { id: h.id, personagemId },
          data: { ligada: false, turnosRestantes: null },
        }),
      );
    }
    for (const [id, turnos] of Object.entries(r.turnos)) {
      ops.push(prisma.habilidade.update({ where: { id, personagemId }, data: { turnosRestantes: turnos } }));
    }
    const mensagem = prisma.mensagem.create({
      data: {
        sessionId: personagem.mesaId || personagem.id,
        uid: user.id,
        nome: personagem.nome,
        mensagem: "passou o turno",
        tipo: "turno",
        detalhes: {
          linhas: r.linhas,
          hpAtual: [personagem.hpAtual, r.estado.hpAtual],
          hpMax: pools.hpMax,
          caiu: r.caiu,
          morreu: r.morreu,
          perdeuConcentracao: perdeu ? concentracao!.nome : null,
          testes: testes.length ? { nome: concentracao!.nome, cds: testes } : null,
        },
      },
    });
    const [criada] = await prisma.$transaction([mensagem, ...ops]);
    revalidatePath(`/ficha/${personagemId}`);
    return {
      estado: r.estado,
      desligar: r.desligar,
      turnos: r.turnos,
      concentracaoTurnos: r.concentracaoTurnos,
      perdeuConcentracao: perdeu,
      testes,
      mensagem: serializarMensagem(criada as Awaited<typeof mensagem>),
    };
  });
}

// ─── Descanso ──────────────────────────────────────────────

/**
 * Curto recupera o que é "encontro" e "descansoCurto"; longo também o "descansoLongo", PV/PP cheios,
 * PV temporário zerado, exaustão −1 e metade dos Dados de Vida. Sustentada não é desligada.
 */
export async function descansar(personagemId: string, tipo: TipoDescanso) {
  return executar("ficha", async () => {
    if (tipo !== "curto" && tipo !== "longo") {
      throw new ErroDeUso("Tipo de descanso inválido.");
    }
    const [{ personagem }, { agg }, recursos, habilidades] = await Promise.all([
      autorizar(personagemId),
      carregarAgregado(personagemId),
      prisma.recurso.findMany({ where: { personagemId } }),
      prisma.habilidade.findMany({ where: { personagemId } }),
    ]);
    if (tipo === "longo" && personagem.hpAtual < 1) {
      throw new ErroDeUso("O descanso longo precisa começar com pelo menos 1 PV.");
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    const resumo: ResumoDescanso = {
      tipo,
      recursos: [],
      habilidades: [],
      pvRestaurado: 0,
      ppRestaurado: 0,
      ppPelaMetade: false,
      pvTempPerdido: 0,
      exaustaoRecuperada: 0,
      dadosVidaDevolvidos: 0,
    };
    // A mais neste descanso (efeitos "No Descanso").
    const extra = agg.descansoExtra[tipo];

    for (const r of recursos) {
      if (!recuperaNoDescanso(r.resetEm, tipo)) continue;
      if (r.valorAtual >= r.valorMax) continue;
      ops.push(
        prisma.recurso.update({
          where: { id: r.id, personagemId },
          data: { valorAtual: r.valorMax },
        }),
      );
      resumo.recursos.push(r.nome);
    }

    for (const h of habilidades) {
      if (!recuperaNoDescanso(h.recarga, tipo)) continue;
      const max = usosMaximos(h, agg.ctxFormula);
      if (max == null || (h.usosAtual ?? 0) >= max) continue;
      ops.push(
        prisma.habilidade.update({
          where: { id: h.id, personagemId },
          data: { usosAtual: max },
        }),
      );
      resumo.habilidades.push(h.nome);
    }

    const maximos = poolsEfetivos(personagem, agg);
    if (tipo === "longo") {
      const hpNovo = Math.max(personagem.hpAtual, maximos.hpMax);
      const ppDoDescanso = ppDoDescansoLongo(personagem.ppAtual, maximos.ppMax, personagem.exaustao);
      const ppNovo = Math.max(personagem.ppAtual, Math.min(maximos.ppMax, ppDoDescanso + extra.pp));
      resumo.pvRestaurado = hpNovo - personagem.hpAtual;
      resumo.ppRestaurado = ppNovo - personagem.ppAtual;
      resumo.ppPelaMetade = personagem.exaustao > 0 && ppDoDescanso < maximos.ppMax;
      resumo.pvTempPerdido = Math.max(0, personagem.hpTemp);
      resumo.exaustaoRecuperada = Math.min(personagem.exaustao, 1 + extra.exaustao);
      resumo.dadosVidaDevolvidos = Math.min(
        personagem.dadosVidaGastos,
        dadosVidaRecuperados(personagem.nivel, personagem.dadosVidaGastos) + extra.dv,
      );

      ops.push(
        prisma.personagem.update({
          where: { id: personagemId },
          data: {
            hpAtual: hpNovo,
            ppAtual: ppNovo,
            hpTemp: 0,
            exaustao: personagem.exaustao - resumo.exaustaoRecuperada,
            dadosVidaGastos: personagem.dadosVidaGastos - resumo.dadosVidaDevolvidos,
          },
        }),
      );
    } else {
      const ppNovo = somarAteOMaximo(personagem.ppAtual, extra.pp, maximos.ppMax);
      resumo.ppRestaurado = ppNovo - personagem.ppAtual;
      resumo.exaustaoRecuperada = Math.min(personagem.exaustao, extra.exaustao);
      resumo.dadosVidaDevolvidos = Math.min(personagem.dadosVidaGastos, extra.dv);
      if (resumo.ppRestaurado || resumo.exaustaoRecuperada || resumo.dadosVidaDevolvidos) {
        ops.push(
          prisma.personagem.update({
            where: { id: personagemId },
            data: {
              ppAtual: ppNovo,
              exaustao: personagem.exaustao - resumo.exaustaoRecuperada,
              dadosVidaGastos: personagem.dadosVidaGastos - resumo.dadosVidaDevolvidos,
            },
          }),
        );
      }
    }

    if (ops.length > 0) await prisma.$transaction(ops);
    revalidatePath(`/ficha/${personagemId}`);
    return resumo;
  });
}

/** A rolagem é no cliente (vai pro chat); aqui só debita o dado e clampa a cura. */
export async function gastarDadoDeVida(personagemId: string, curado: number) {
  return executar("ficha", async () => {
    const [{ personagem }, { agg }] = await Promise.all([
      autorizar(personagemId),
      carregarAgregado(personagemId),
    ]);

    const disponiveis = personagem.nivel - personagem.dadosVidaGastos;
    if (disponiveis <= 0) throw new ErroDeUso("Sem Dados de Vida disponíveis.");

    // Teto: um dado + mod CON não passa de faces + 10 em qualquer cenário são.
    const teto = facesDadoVida(personagem.tipoDadoVida) + 10;
    const cura = Math.max(0, Math.min(Math.trunc(Number(curado) || 0), teto));

    await prisma.personagem.update({
      where: { id: personagemId },
      data: {
        dadosVidaGastos: { increment: 1 },
        hpAtual: somarAteOMaximo(personagem.hpAtual, cura, poolsEfetivos(personagem, agg).hpMax),
      },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Subir de nível ────────────────────────────────────────

/** Aplica a proposta do assistente. PV e aprimoramento vindos do cliente são revalidados. */
export async function subirDeNivel(
  personagemId: string,
  entrada: { pvGanho: unknown; aprimoramento?: unknown },
) {
  return executar("ficha", async () => {
    const [{ personagem }, { agg }] = await Promise.all([
      autorizar(personagemId),
      carregarAgregado(personagemId),
    ]);

    if (personagem.nivel >= NIVEL_MAXIMO) {
      throw new ErroDeUso(`Nível máximo (${NIVEL_MAXIMO}) já atingido.`);
    }
    const nivelNovo = personagem.nivel + 1;

    // PV usa a CON com os bônus; o Aprimoramento valida contra a base.
    const conEfetiva = atributosEfetivos(atributosDoPersonagem(personagem), agg).constituicao;
    const modCon = modificador(conEfetiva);
    const teto = tetoGanhoPv(personagem.tipoDadoVida, modCon);
    const pvGanho = Math.min(clampGanhoPv(Number(entrada.pvGanho) || 0), teto);

    const bruto = (entrada.aprimoramento ?? {}) as Record<string, unknown>;
    const apr: Aprimoramento = {};
    for (const a of ATRIBUTOS) {
      const v = Math.trunc(Number(bruto[a.slug]) || 0);
      if (v > 0) apr[a.slug] = v;
    }

    const atuais = {
      forca: personagem.forca,
      destreza: personagem.destreza,
      constituicao: personagem.constituicao,
      sabedoria: personagem.sabedoria,
      vontade: personagem.vontade,
      presenca: personagem.presenca,
    };
    const recusa = validarAprimoramento(
      apr,
      atuais,
      tetosNoNivel(agg.bonusTetoAtributo, nivelNovo),
    );
    if (recusa) throw new ErroDeUso(recusa);

    // CON que sobe de modificador dá PV retroativo por nível já atingido.
    const conDepois = conEfetiva + (apr.constituicao ?? 0);
    const retroativo = pvRetroativoPorCon(conEfetiva, conDepois, nivelNovo);

    const data: Record<string, unknown> = {
      nivel: nivelNovo,
      hpMax: personagem.hpMax + pvGanho + retroativo,
      hpAtual: personagem.hpAtual + pvGanho + retroativo,
      ppMax: personagem.ppMax + PP_POR_NIVEL,
      ppAtual: personagem.ppAtual + PP_POR_NIVEL,
    };
    for (const [slug, ganho] of Object.entries(apr)) {
      data[slug] = atuais[slug as Atributo] + ganho;
    }

    await prisma.personagem.update({ where: { id: personagemId }, data });
    revalidatePath(`/ficha/${personagemId}`);
    return { nivelNovo, pvGanho, retroativo, ppGanho: PP_POR_NIVEL };
  });
}

// ─── Objetivos ─────────────────────────────────────────────
// O prazo fica em dias absolutos do calendário da mesa.

const ALLOWED_OBJETIVO = ["titulo", "descricao", "estado", "icone", "prazoDias", "ordem"] as const;
type ObjetivoInput = Partial<Record<(typeof ALLOWED_OBJETIVO)[number], unknown>>;

// Sem export: arquivo "use server" so pode exportar funcao async.
const ESTADOS_OBJETIVO = ["aberto", "feito", "abandonado"] as const;
const ESTADOS_VALIDOS = new Set<string>(ESTADOS_OBJETIVO);

function normalizarObjetivo(input: ObjetivoInput, parcial: boolean) {
  const data: Record<string, unknown> = {};
  for (const key of ALLOWED_OBJETIVO) {
    if (input[key] === undefined) continue;
    if (key === "titulo") {
      const titulo = String(input.titulo).trim();
      if (!titulo) throw new ErroDeUso("Título do objetivo é obrigatório.");
      data.titulo = titulo.slice(0, 160);
    } else if (key === "descricao") {
      data.descricao = String(input.descricao).trim();
    } else if (key === "estado") {
      const v = String(input.estado);
      if (!ESTADOS_VALIDOS.has(v)) throw new ErroDeUso("Estado de objetivo inválido.");
      data.estado = v;
    } else if (key === "icone") {
      data.icone = String(input.icone).trim() || "fa-scroll";
    } else if (key === "prazoDias") {
      data.prazoDias =
        input.prazoDias === null ? null : Math.trunc(Number(input.prazoDias) || 0);
    } else if (key === "ordem") {
      data.ordem = Number(input.ordem) || 0;
    }
  }
  if (!parcial && data.titulo === undefined) {
    throw new ErroDeUso("Título do objetivo é obrigatório.");
  }
  return data;
}

export async function criarObjetivo(personagemId: string, input: ObjetivoInput) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarObjetivo(input, false);

    const ultimo = await prisma.objetivo.findFirst({
      where: { personagemId },
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });

    const criado = await prisma.objetivo.create({
      data: {
        personagemId,
        titulo: data.titulo as string,
        descricao: (data.descricao as string) ?? "",
        estado: (data.estado as string) ?? "aberto",
        icone: (data.icone as string) ?? "fa-scroll",
        prazoDias: (data.prazoDias as number | null) ?? null,
        ordem: (data.ordem as number) ?? (ultimo ? ultimo.ordem + 1 : 0),
      },
    });
    revalidatePath(`/ficha/${personagemId}`);
    return {
      id: criado.id,
      titulo: criado.titulo,
      descricao: criado.descricao,
      estado: criado.estado,
      icone: criado.icone,
      prazoDias: criado.prazoDias,
      ordem: criado.ordem,
    };
  });
}

export async function atualizarObjetivo(
  personagemId: string,
  objetivoId: string,
  patch: ObjetivoInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarObjetivo(patch, true);

    await prisma.objetivo.update({
      where: { id: objetivoId, personagemId },
      data,
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarObjetivo(personagemId: string, objetivoId: string) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await prisma.objetivo.delete({
      where: { id: objetivoId, personagemId },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}
