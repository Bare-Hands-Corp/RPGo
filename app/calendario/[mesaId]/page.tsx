import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_GREGORIANO, TIPOS_CLIMA_DEFAULT } from "@/lib/calendario/templates";
import type { CalendarioConfig } from "@/lib/calendario/engine";
import { CalendarioView } from "./calendario-view";
import { CalendarioRealtime } from "./realtime-refresher";
import { ThemeButton } from "@/components/temas/theme-button";
import "./calendario.css";

type Params = { params: Promise<{ mesaId: string }> };

// Lazy-create: idempotente. Cria com template gregoriano + tipos clima default
// se ainda não existir. Tolera P2002 caso outra request crie em paralelo.
async function garantirCalendario(mesaId: string) {
  const existente = await prisma.calendario.findUnique({ where: { mesaId } });
  if (existente) return;
  try {
    await prisma.calendario.create({
      data: {
        mesaId,
        config: TEMPLATE_GREGORIANO as unknown as object,
        dataAtualDias: 0,
        tiposClima: {
          create: TIPOS_CLIMA_DEFAULT.map((t) => ({
            nome: t.nome,
            descricao: t.descricao,
            icone: t.icone,
            pesosPorEstacao: t.pesos,
          })),
        },
      },
    });
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code !== "P2002") throw e;
  }
}

export default async function CalendarioPage({ params }: Params) {
  const { mesaId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const mesa = await prisma.mesa.findUnique({ where: { id: mesaId } });
  if (!mesa) notFound();

  // Acesso: narrador OU jogador com personagem na mesa.
  const isNarrador = mesa.userId === user.id;
  const isJogador = !isNarrador
    ? !!(await prisma.personagem.findFirst({
        where: { mesaId, userId: user.id },
        select: { id: true },
      }))
    : false;
  if (!isNarrador && !isJogador) redirect("/dashboard");

  await garantirCalendario(mesaId);

  const calendario = await prisma.calendario.findUnique({
    where: { mesaId },
    include: { tiposClima: { orderBy: { nome: "asc" } } },
  });
  if (!calendario) notFound();

  // Filtra eventos visíveis ao papel.
  const todosEventos = await prisma.eventoCalendario.findMany({
    where: { calendarioId: calendario.id },
    orderBy: { dataDias: "asc" },
  });
  const eventos = isNarrador
    ? todosEventos
    : todosEventos.filter((e) => !e.oculto && e.dataDias <= calendario.dataAtualDias);

  // Serializa pesos de cada tipo de clima (Prisma retorna JsonValue).
  const tiposClima = calendario.tiposClima.map((t) => ({
    id: t.id,
    nome: t.nome,
    descricao: t.descricao,
    icone: t.icone,
    pesosPorEstacao: (t.pesosPorEstacao as Record<string, number> | null) || {},
  }));

  const eventosSerializados = eventos.map((e) => ({
    id: e.id,
    tipo: e.tipo as "climatico" | "narrativo",
    titulo: e.titulo,
    descricao: e.descricao,
    dataDias: e.dataDias,
    tipoClimaId: e.tipoClimaId,
    oculto: e.oculto,
  }));

  return (
    <div className="cal-page-wrapper">
      <CalendarioRealtime mesaId={mesaId} calendarioId={calendario.id} />

      <div className="cal-page-topbar">
        <Link
          href={isNarrador ? `/narrador/${mesaId}` : "/dashboard"}
          className="cal-page-voltar"
          title="Voltar"
        >
          <i className="fas fa-arrow-left" />
        </Link>
        <div className="cal-page-titulo">
          <span className="cal-page-kicker">CALENDÁRIO DA MESA</span>
          <h1>{mesa.nome}</h1>
        </div>
        <div className="cal-page-mesa-chip">
          <i className={isNarrador ? "fas fa-chess-king" : "fas fa-user"} />
          <span className="cal-page-role">{isNarrador ? "NARRADOR" : "JOGADOR"}</span>
        </div>
        <ThemeButton />
      </div>

      <CalendarioView
        mesaId={mesaId}
        isNarrador={isNarrador}
        config={calendario.config as unknown as CalendarioConfig}
        dataAtualDias={calendario.dataAtualDias}
        eventos={eventosSerializados}
        tiposClima={tiposClima}
      />
    </div>
  );
}
