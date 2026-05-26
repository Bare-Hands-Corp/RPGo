import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { listarMensagensSessao } from "@/lib/mensagens";
import { carregarCalendario } from "@/lib/calendario/carregar";
import { PerfilSidebar } from "./perfil-sidebar";
import { FichaTabs } from "./ficha-tabs";
import { FichaRealtime } from "./realtime-refresher";
import { Bandeja } from "@/components/bandeja/bandeja";
import { ThemeButton } from "@/components/temas/theme-button";
import "../../calendario/[mesaId]/calendario.css";
import "./ficha.css";

type Params = { params: Promise<{ uid: string }> };

export default async function FichaPage({ params }: Params) {
  const { uid } = await params;

  const supabase = await createClient();

  // Auth (rede pro Supabase) e personagem (Postgres) são independentes — paralelo.
  const [
    {
      data: { user },
    },
    personagem,
  ] = await Promise.all([
    supabase.auth.getUser(),
    prisma.personagem.findUnique({
      where: { id: uid },
      include: {
        mesa: true,
        itens: { orderBy: { nome: "asc" } },
        acoes: true,
      },
    }),
  ]);
  if (!user) redirect("/login");
  if (!personagem) notFound();

  // Autorização: dono OU narrador da mesa.
  const isDono = personagem.userId === user.id;
  const isNarrador = personagem.mesa?.userId === user.id;
  if (!isDono && !isNarrador) {
    redirect("/dashboard");
  }

  // Bandeja: sessionId = mesa quando o personagem tá numa, senão usa o próprio personagem.
  const sessionId = personagem.mesaId || personagem.id;

  // Pré-carrega mensagens do chat + calendário (se houver mesa) em paralelo.
  const [mensagensIniciais, calendario] = await Promise.all([
    listarMensagensSessao(sessionId),
    personagem.mesaId
      ? carregarCalendario(personagem.mesaId, { isNarrador })
      : Promise.resolve(null),
  ]);

  return (
    <div className="ficha-layout">
      <FichaRealtime personagemId={personagem.id} />
      <PerfilSidebar personagem={personagem} />
      <FichaTabs
        personagemId={personagem.id}
        mesaId={personagem.mesaId}
        cargaMaxima={personagem.cargaMaxima}
        acoes={personagem.acoes}
        itens={personagem.itens}
        calendario={calendario}
        isNarradorDaMesa={isNarrador}
      />
      <div className="ficha-topo-acoes">
        <ThemeButton />
      </div>
      <Bandeja
        userId={user.id}
        userName={personagem.nome}
        sessionId={sessionId}
        personagemId={personagem.id}
        mensagensIniciais={mensagensIniciais}
      />
    </div>
  );
}
