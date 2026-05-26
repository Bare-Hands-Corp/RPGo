"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

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
  "hpAtual",
  "hpMax",
  "ppAtual",
  "ppMax",
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
export async function criarAcao(
  personagemId: string,
  input: { nome: string; descricao?: string; tipo: string; tag?: string },
) {
  await autorizar(personagemId);
  const nome = input.nome.trim();
  if (!nome) throw new Error("Nome é obrigatório.");

  await prisma.acao.create({
    data: {
      personagemId,
      nome,
      descricao: input.descricao || "",
      tipo: input.tipo || "padrao",
      tag: input.tag || "",
    },
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
] as const;

type ItemInput = Partial<Record<(typeof ALLOWED_ITEM)[number], unknown>>;

export async function criarItem(personagemId: string, input: ItemInput) {
  await autorizar(personagemId);
  const nome = (input.nome as string | undefined)?.trim();
  if (!nome) throw new Error("Nome é obrigatório.");

  await prisma.item.create({
    data: {
      personagemId,
      nome,
      peso: Number(input.peso) || 0,
      tipo: (input.tipo as string) || "comum",
      tags: (input.tags as string) || "",
      descricao: (input.descricao as string) || "",
      dano: (input.dano as string) || "",
      modificador: Number(input.modificador) || 0,
      ca: Number(input.ca) || 0,
      penalidadeDes: Number(input.penalidadeDes) || 0,
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

  const data: Record<string, unknown> = {};
  for (const key of ALLOWED_ITEM) {
    if (patch[key] !== undefined) data[key] = patch[key];
  }

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
