import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { carregarCalendario } from "@/lib/calendario/carregar";
import { CalendarioView } from "./calendario-view";
import { CalendarioRealtime } from "./realtime-refresher";
import { ThemeButton } from "@/components/temas/theme-button";
import "./calendario.css";

type Params = { params: Promise<{ mesaId: string }> };

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

  const calendario = await carregarCalendario(mesaId, { isNarrador });
  if (!calendario) notFound();

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
        config={calendario.config}
        dataAtualDias={calendario.dataAtualDias}
        eventos={calendario.eventos}
        tiposClima={calendario.tiposClima}
      />
    </div>
  );
}
