// Helpers de mensagens compartilhados entre Server Actions e Server Components.
// O tipo MensagemSerializada vive aqui pra que o SSR e o client falem a mesma
// linguagem. listarMensagensSessao não autentica — deve ser chamado por
// Server Components que já fizeram auth (ou por uma action que faça auth antes).

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type MensagemSerializada = {
  id: string;
  sessionId: string;
  uid: string;
  nome: string;
  mensagem: string | null;
  timestamp: string;
  tipo: string | null;
  total: number | null;
  modificador: number | null;
  detalhes: unknown;
};

type MensagemBruta = {
  id: string;
  sessionId: string;
  uid: string;
  nome: string;
  mensagem: string | null;
  timestamp: Date;
  tipo: string | null;
  total: number | null;
  modificador: number | null;
  detalhes: Prisma.JsonValue;
};

export function serializarMensagem(m: MensagemBruta): MensagemSerializada {
  return {
    id: m.id,
    sessionId: m.sessionId,
    uid: m.uid,
    nome: m.nome,
    mensagem: m.mensagem,
    timestamp: m.timestamp.toISOString(),
    tipo: m.tipo,
    total: m.total,
    modificador: m.modificador,
    detalhes: m.detalhes,
  };
}

export async function listarMensagensSessao(sessionId: string): Promise<MensagemSerializada[]> {
  const lista = await prisma.mensagem.findMany({
    where: { sessionId },
    orderBy: { timestamp: "asc" },
    take: 200,
  });
  return lista.map(serializarMensagem);
}
