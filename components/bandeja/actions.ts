"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  listarMensagensSessao,
  serializarMensagem,
  type MensagemSerializada,
} from "@/lib/mensagens";
import type { Prisma } from "@prisma/client";

// Re-export do tipo pra que componentes client importem daqui sem precisar
// conhecer @/lib/mensagens (que tem dependências server-only).
export type { MensagemSerializada };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  return user;
}

export async function listarMensagens(sessionId: string): Promise<MensagemSerializada[]> {
  await requireUser();
  return listarMensagensSessao(sessionId);
}

// Retorna a mensagem criada pra que o cliente faça append local imediato e
// pule o refetch via realtime (o listener filtra eventos do próprio uid).
export async function enviarMensagemTexto(
  sessionId: string,
  nome: string,
  mensagem: string,
): Promise<MensagemSerializada> {
  const user = await requireUser();
  const texto = mensagem.trim();
  if (!texto) throw new Error("Mensagem vazia.");
  const nova = await prisma.mensagem.create({
    data: {
      sessionId,
      uid: user.id,
      nome: nome || "Anônimo",
      mensagem: texto,
      tipo: "texto",
    },
  });
  return serializarMensagem(nova);
}

type RolagemPayload = {
  total: number;
  detalhes: unknown;
  modificador: number;
  nomePreset?: string | null;
};

// Combina envio de rolagem + persistência de ultimaRolagem no personagem (se houver)
// numa única chamada com queries em paralelo no servidor.
export async function registrarRolagem(
  sessionId: string,
  nome: string,
  rolagem: RolagemPayload,
  personagemId: string | null,
  ultimaRolagem: string | null,
): Promise<MensagemSerializada> {
  const user = await requireUser();

  const criar = prisma.mensagem.create({
    data: {
      sessionId,
      uid: user.id,
      nome: nome || "Anônimo",
      tipo: "rolagem",
      total: rolagem.total,
      modificador: rolagem.modificador,
      detalhes: {
        rolls: rolagem.detalhes,
        nomePreset: rolagem.nomePreset || null,
      } as Prisma.InputJsonValue,
    },
  });

  const atualizarPersonagem =
    personagemId && ultimaRolagem
      ? prisma.personagem.update({
          where: { id: personagemId },
          data: { ultimaRolagem },
        })
      : Promise.resolve(null);

  const [nova] = await Promise.all([criar, atualizarPersonagem]);
  return serializarMensagem(nova);
}

export async function limparMensagens(sessionId: string): Promise<void> {
  await requireUser();
  await prisma.mensagem.deleteMany({ where: { sessionId } });
}
