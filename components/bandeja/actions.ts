"use server";

import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import {
  listarMensagensSessao,
  serializarMensagem,
  type MensagemSerializada,
} from "@/lib/mensagens";
import type { DadoRolado, ModoRolagem } from "@/lib/dice";
import { acessoASessao } from "@/lib/acesso-sessao";
import { sanitizarHtmlRolagem } from "@/lib/sanitizar-rolagem";
import type { Prisma } from "@prisma/client";

const LIMITE_MENSAGEM = 2000;
const LIMITE_NOME = 80;
const LIMITE_ROTULO = 160;
const LIMITE_EXECUCOES = 100;
const LIMITE_DADOS = 400;

async function requireUser() {
  const user = await usuarioDaRequest();
  if (!user) throw new Error("Não autenticado.");
  return user;
}

// Usuário logado que participa da sessão (membro da mesa, narrador ou dono da ficha).
async function requireSessao(sessionId: string) {
  const user = await requireUser();
  const acesso = await acessoASessao(sessionId, user.id);
  if (!acesso) throw new Error("Você não participa desta sessão.");
  return { user, acesso };
}

function nomeLimpo(nome: unknown): string {
  return (typeof nome === "string" ? nome.trim().slice(0, LIMITE_NOME) : "") || "Anônimo";
}

function rotulo(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim().slice(0, LIMITE_ROTULO) : null;
}

function inteiro(valor: unknown): number {
  const n = Math.trunc(Number(valor));
  return Number.isFinite(n) ? Math.max(-1_000_000, Math.min(1_000_000, n)) : 0;
}

// Dados rolados só com números: o chat monta HTML a partir deles.
function dadosLimpos(lista: unknown): DadoRolado[] {
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, LIMITE_DADOS).map((bruto) => {
    const d = (bruto ?? {}) as { faces?: unknown; sinal?: unknown; resultado?: unknown; vantagem?: unknown };
    const v = d.vantagem as
      | { descartado?: unknown; modo?: unknown; candidatos?: unknown }
      | null
      | undefined;
    const limpo: Record<string, unknown> = {
      faces: Math.max(1, Math.min(1000, inteiro(d.faces))),
      sinal: Number(d.sinal) === -1 ? -1 : 1,
      resultado: inteiro(d.resultado),
    };
    if (v && typeof v === "object") {
      limpo.vantagem = {
        ...(v.modo === "vantagem" || v.modo === "desvantagem" ? { modo: v.modo } : {}),
        ...(Array.isArray(v.candidatos)
          ? { candidatos: [inteiro(v.candidatos[0]), inteiro(v.candidatos[1])] }
          : {}),
        descartado: inteiro(v.descartado),
      };
    }
    return limpo as unknown as DadoRolado;
  });
}

function modoLimpo(modo: unknown): ModoRolagem {
  return modo === "vantagem" || modo === "desvantagem" ? modo : "normal";
}

const CONTEXTOS = new Set([
  "ataque",
  "dano",
  "pericia",
  "salvaguarda",
  "teste-atributo",
  "iniciativa",
  "cura",
  "preset",
]);

export async function listarMensagens(sessionId: string): Promise<MensagemSerializada[]> {
  await requireSessao(sessionId);
  return listarMensagensSessao(sessionId);
}

// Retorna a mensagem criada pra que o cliente faça append local imediato e
// pule o refetch via realtime (o listener filtra eventos do próprio uid).
export async function enviarMensagemTexto(
  sessionId: string,
  nome: string,
  mensagem: string,
): Promise<MensagemSerializada> {
  const { user } = await requireSessao(sessionId);
  const texto = typeof mensagem === "string" ? mensagem.trim() : "";
  if (!texto) throw new Error("Mensagem vazia.");
  if (texto.length > LIMITE_MENSAGEM) {
    throw new Error(`Mensagem longa demais (máximo de ${LIMITE_MENSAGEM} caracteres).`);
  }
  const nova = await prisma.mensagem.create({
    data: {
      sessionId,
      uid: user.id,
      nome: nomeLimpo(nome),
      mensagem: texto,
      tipo: "texto",
    },
  });
  return serializarMensagem(nova);
}

type RolagemExecucaoPayload = {
  total: number;
  modificador: number;
  modo: ModoRolagem;
  detalhes: DadoRolado[];
  // String HTML já formatada da execução (dado descartado, crit, piso) — usada
  // pelo lote contextual. Ausente no lote manual (o chat reconstrói dos rolls).
  texto?: string | null;
};

type BaseRolagemPayload = {
  modificador: number;
  modo: ModoRolagem;
  nomePreset?: string | null;
  // String HTML já formatada (crítico, vantagem, fontes). Quando presente, o
  // chat a renderiza direto em vez de reconstruir dos rolls.
  texto?: string | null;
  tipoTeste?: boolean;
  pericia?: string | null;
  cd?: number | null;
  sucesso?: boolean | null;
  privacidadeResultado?: boolean | null;
  ocultarRolagem?: boolean | null;
  ocultarResultado?: boolean | null;
  // Rolagem privada do narrador: nem os dados nem o total são gravados, então
  // não chegam ao navegador de ninguém. O chat só mostra que ela aconteceu.
  somenteNarrador?: boolean | null;
  bonusDetalhe?: string | null;
  bonusTotal?: number | null;
  solicitacaoTesteId?: string | null;
  alvoNome?: string | null;
  // De onde veio a rolagem (ataque, dano, perícia, preset…): escolhe o ícone no chat.
  contexto?: string | null;
};

type RolagemUnitariaPayload = BaseRolagemPayload & {
  tipo: "rolagem";
  total: number;
  detalhes: DadoRolado[];
};

type RolagemLotePayload = BaseRolagemPayload & {
  tipo: "lote";
  total: number | null;
  quantidade: number;
  execucoes: RolagemExecucaoPayload[];
};

type RolagemPayload = RolagemUnitariaPayload | RolagemLotePayload;

function obterStatusTeste(
  rolagem: RolagemPayload,
  detalhes: { rolls?: Array<{ resultado: number }> | null } | null,
): string {
  if (rolagem.ocultarResultado) return "Rolagem recebida";
  const primeiroDado = detalhes?.rolls?.[0]?.resultado;
  if (primeiroDado === 20) return "Sucesso Crítico";
  if (primeiroDado === 1) return "Falha Crítica";
  if (rolagem.sucesso === true) return "Sucesso";
  if (rolagem.sucesso === false) return "Falha";
  return "Aguardando resultado";
}

function extrairRoladas(detalhes: unknown): Array<{ resultado: number }> {
  if (Array.isArray(detalhes)) return detalhes as Array<{ resultado: number }>;
  if (detalhes && typeof detalhes === "object" && "rolls" in detalhes) {
    const rolls = (detalhes as { rolls?: Array<{ resultado: number }> | null }).rolls;
    return rolls ?? [];
  }
  return [];
}

function extrairRoladasDoPayload(rolagem: RolagemPayload): Array<{ resultado: number }> {
  if (rolagem.tipo === "lote") {
    return rolagem.execucoes[0]?.detalhes || [];
  }
  return rolagem.detalhes;
}

export async function registrarRolagem(
  sessionId: string,
  nome: string,
  rolagem: RolagemPayload,
): Promise<MensagemSerializada> {
  const { user } = await requireSessao(sessionId);
  // Nada do payload é confiável: o HTML passa pela lista do que o Rolador usa,
  // e os números e rótulos são normalizados antes de gravar.
  rolagem = {
    ...rolagem,
    total: rolagem.total == null ? null : inteiro(rolagem.total),
    modificador: inteiro(rolagem.modificador),
    modo: modoLimpo(rolagem.modo),
    nomePreset: rotulo(rolagem.nomePreset),
    pericia: rotulo(rolagem.pericia),
    bonusDetalhe: rotulo(rolagem.bonusDetalhe),
    alvoNome: rotulo(rolagem.alvoNome),
    texto: rolagem.texto ? sanitizarHtmlRolagem(rolagem.texto) : null,
    cd: rolagem.cd == null ? null : inteiro(rolagem.cd),
    bonusTotal: rolagem.bonusTotal == null ? null : inteiro(rolagem.bonusTotal),
    contexto: typeof rolagem.contexto === "string" && CONTEXTOS.has(rolagem.contexto) ? rolagem.contexto : null,
    solicitacaoTesteId:
      typeof rolagem.solicitacaoTesteId === "string" ? rolagem.solicitacaoTesteId.slice(0, 64) : null,
    ...(rolagem.tipo === "lote"
      ? {
          quantidade: Math.max(1, Math.min(LIMITE_EXECUCOES, inteiro(rolagem.quantidade))),
          execucoes: (Array.isArray(rolagem.execucoes) ? rolagem.execucoes : [])
            .slice(0, LIMITE_EXECUCOES)
            .map((e) => ({
              total: inteiro(e?.total),
              modificador: inteiro(e?.modificador),
              modo: modoLimpo(e?.modo),
              detalhes: dadosLimpos(e?.detalhes),
              texto: e?.texto ? sanitizarHtmlRolagem(e.texto) : null,
            })),
        }
      : { detalhes: dadosLimpos(rolagem.detalhes) }),
  } as RolagemPayload;
  const privada = rolagem.somenteNarrador === true;
  if (privada) {
    // Tira os números antes de montar a mensagem.
    rolagem = {
      ...rolagem,
      total: rolagem.tipo === "lote" ? null : 0,
      modificador: 0,
      texto: null,
      bonusDetalhe: null,
      bonusTotal: null,
      ocultarRolagem: true,
      ocultarResultado: true,
      ...(rolagem.tipo === "lote"
        ? { execucoes: rolagem.execucoes.map((e) => ({ ...e, total: 0, modificador: 0, detalhes: [], texto: null })) }
        : { detalhes: [] }),
    } as RolagemPayload;
  }

  const nova = await prisma.mensagem.create({
    data: {
      sessionId,
      uid: user.id,
      nome: nomeLimpo(nome),
      tipo: "rolagem",
      total: privada ? null : rolagem.total,
      modificador: rolagem.modificador,
      detalhes: (
        rolagem.tipo === "lote"
          ? {
              kind: "lote",
              modo: rolagem.modo,
              quantidade: rolagem.quantidade,
              execucoes: rolagem.execucoes.map((execucao) => ({
                total: execucao.total,
                modificador: execucao.modificador,
                modo: execucao.modo,
                rolls: rolagem.ocultarRolagem ? null : execucao.detalhes,
                texto: execucao.texto ?? null,
              })),
              nomePreset: rolagem.nomePreset || null,
              // Anotações das fontes dos efeitos (HTML já filtrado).
              texto: rolagem.texto || null,
              contexto: rolagem.contexto ?? null,
              tipoTeste: rolagem.tipoTeste === true || null,
              pericia: rolagem.pericia || null,
              cd: rolagem.cd ?? null,
              sucesso: typeof rolagem.sucesso === "boolean" ? rolagem.sucesso : null,
              privacidadeResultado: rolagem.privacidadeResultado ?? null,
              ocultarRolagem: rolagem.ocultarRolagem ?? null,
              ocultarResultado: rolagem.ocultarResultado ?? null,
              bonusDetalhe: rolagem.bonusDetalhe ?? null,
              bonusTotal: rolagem.bonusTotal ?? null,
              solicitacaoTesteId: rolagem.solicitacaoTesteId ?? null,
            }
          : {
              kind: "rolagem",
              modo: rolagem.modo,
              rolls: rolagem.ocultarRolagem ? null : rolagem.detalhes,
              nomePreset: rolagem.nomePreset || null,
              // String HTML já formatada (vantagem, crit, fontes) da rolagem
              // contextual. O chat a renderiza direto quando presente.
              texto: rolagem.texto || null,
              contexto: rolagem.contexto ?? null,
              tipoTeste: rolagem.tipoTeste === true || null,
              pericia: rolagem.pericia || null,
              cd: rolagem.cd ?? null,
              sucesso: typeof rolagem.sucesso === "boolean" ? rolagem.sucesso : null,
              privacidadeResultado: rolagem.privacidadeResultado ?? null,
              ocultarRolagem: rolagem.ocultarRolagem ?? null,
              ocultarResultado: rolagem.ocultarResultado ?? null,
              bonusDetalhe: rolagem.bonusDetalhe ?? null,
              bonusTotal: rolagem.bonusTotal ?? null,
              solicitacaoTesteId: rolagem.solicitacaoTesteId ?? null,
            }
      ) as Prisma.InputJsonValue,
    },
  });

  if (rolagem.solicitacaoTesteId && rolagem.alvoNome) {
    const solicitacao = await prisma.mensagem.findUnique({
      where: { id: rolagem.solicitacaoTesteId },
      select: { detalhes: true, sessionId: true, tipo: true },
    });
    // Só responde a pedido de teste desta mesma sessão.
    const valida = solicitacao && solicitacao.sessionId === sessionId && solicitacao.tipo === "teste";
    const detalhesSolicitacao = ((valida ? solicitacao.detalhes : null) as {
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
        rolls: extrairRoladasDoPayload(rolagem),
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
  const { acesso } = await requireSessao(sessionId);
  if (!acesso.administra) throw new Error("Só o narrador pode apagar as mensagens da mesa.");
  await prisma.mensagem.deleteMany({ where: { sessionId } });
}
