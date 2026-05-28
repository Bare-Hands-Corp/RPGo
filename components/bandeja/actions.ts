"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  listarMensagensSessao,
  serializarMensagem,
  type MensagemSerializada,
} from "@/lib/mensagens";
import type { Prisma } from "@prisma/client";

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
  tipoTeste?: boolean;
  pericia?: string | null;
  cd?: number | null;
  sucesso?: boolean | null;
  privacidadeResultado?: boolean | null;
  solicitacaoTesteId?: string | null;
  alvoNome?: string | null;
};

function obterStatusTeste(
  rolagem: RolagemPayload,
  detalhes: { rolls?: Array<{ resultado: number }> } | null,
): string {
  const primeiroDado = detalhes?.rolls?.[0]?.resultado;
  if (primeiroDado === 20) return "Sucesso Crítico (20 no dado)";
  if (primeiroDado === 1) return "Falha Crítica (1 no dado)";
  if (rolagem.sucesso === true) return "Sucesso";
  if (rolagem.sucesso === false) return "Falha";
  return "Aguardando resultado";
}

function extrairRoladas(detalhes: unknown): Array<{ resultado: number }> {
  if (Array.isArray(detalhes)) return detalhes as Array<{ resultado: number }>;
  if (detalhes && typeof detalhes === "object" && "rolls" in detalhes) {
    const rolls = (detalhes as { rolls?: Array<{ resultado: number }> }).rolls;
    return rolls || [];
  }
  return [];
}

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
        tipoTeste: rolagem.tipoTeste || null,
        pericia: rolagem.pericia || null,
        cd: rolagem.cd ?? null,
        sucesso: rolagem.sucesso ?? null,
        privacidadeResultado: rolagem.privacidadeResultado ?? null,
        solicitacaoTesteId: rolagem.solicitacaoTesteId ?? null,
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

  const nova = await criar;
  await atualizarPersonagem;

  if (rolagem.solicitacaoTesteId && rolagem.alvoNome) {
    const solicitacao = await prisma.mensagem.findUnique({
      where: { id: rolagem.solicitacaoTesteId },
      select: { detalhes: true },
    });
    const detalhesSolicitacao = (solicitacao?.detalhes as {
      statusPorNome?: Record<string, string>;
      pericia?: string | null;
      cd?: number | null;
      privacidadeCd?: boolean;
      privacidadeResultado?: boolean;
      alvos?: string[] | "TODOS";
      alvosNomes?: string[];
    } | null) ?? null;

    if (detalhesSolicitacao) {
      const statusAtualizado = obterStatusTeste(rolagem, {
        rolls: extrairRoladas(rolagem.detalhes),
      });
      await prisma.mensagem.update({
        where: { id: rolagem.solicitacaoTesteId },
        data: {
          detalhes: {
            ...detalhesSolicitacao,
            statusPorNome: {
              ...(detalhesSolicitacao.statusPorNome || {}),
              [rolagem.alvoNome]: statusAtualizado,
            },
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  return serializarMensagem(nova);
}

export async function limparMensagens(sessionId: string): Promise<void> {
  await requireUser();
  await prisma.mensagem.deleteMany({ where: { sessionId } });
}
