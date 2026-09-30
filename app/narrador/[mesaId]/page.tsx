import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { listarMensagensSessao } from "@/lib/mensagens";
import {
  carregarCalendario,
  carregarObjetivosComPrazo,
} from "@/lib/calendario/carregar";
import { serializarCriatura } from "@/app/bestiario/utils";
import { NarradorShell } from "./painel-narrador";
import { serializarSessao } from "./sessao/utils";
import "@/app/dashboard/dashboard.css";
import "@/app/calendario/[mesaId]/calendario.css";
import "@/app/bestiario/bestiario.css";
import "./narrador.css";

type Params = { params: Promise<{ mesaId: string }> };

export default async function NarradorPage({ params }: Params) {
  const { mesaId } = await params;

  const user = await usuarioDaRequest();
  if (!user) redirect("/login");

  // Mesa + mensagens + calendário + objetivos + sessão/bestiário pré-carregados em paralelo.
  const [mesa, mensagensIniciais, calendario, objetivosComPrazo, sessaoAtiva, criaturas, encontros] = await Promise.all([
    prisma.mesa.findUnique({
      where: { id: mesaId },
      include: {
        personagens: {
          orderBy: { nome: "asc" },
        },
      },
    }),
    listarMensagensSessao(mesaId),
    carregarCalendario(mesaId, { isNarrador: true }),
    carregarObjetivosComPrazo(mesaId, { userId: user.id, isNarrador: true }),
    prisma.sessao.findFirst({
      where: { mesaId, encerradaEm: null },
      include: { combates: { include: { participantes: true } } },
    }),
    prisma.criatura.findMany({
      where: { userId: user.id },
      include: { componentes: true, linhagem: true },
      orderBy: { nome: "asc" },
    }),
    prisma.encontro.findMany({
      where: { userId: user.id },
      select: { id: true, nome: true, itens: true },
      orderBy: { nome: "asc" },
    }),
  ]);
  if (!mesa) notFound();
  if (!calendario) notFound();

  if (mesa.userId !== user.id) {
    redirect("/dashboard");
  }

  return (
    <NarradorShell
      mesa={mesa}
      userId={user.id}
      mensagensIniciais={mensagensIniciais}
      calendario={calendario}
      objetivosComPrazo={objetivosComPrazo}
      sessaoInicial={sessaoAtiva ? serializarSessao(sessaoAtiva) : null}
      criaturas={criaturas.map(serializarCriatura)}
      encontros={encontros.map((e) => ({
        id: e.id,
        nome: e.nome,
        itens: e.itens as { criaturaId: string; quantidade: number }[],
      }))}
    />
  );
}
