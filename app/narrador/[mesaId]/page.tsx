import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { listarMensagensSessao } from "@/lib/mensagens";
import { NarradorShell } from "./painel-narrador";
import "@/app/dashboard/dashboard.css";
import "./narrador.css";

type Params = { params: Promise<{ mesaId: string }> };

export default async function NarradorPage({ params }: Params) {
  const { mesaId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Mesa + mensagens pré-carregadas em paralelo (sessionId === mesaId aqui).
  const [mesa, mensagensIniciais] = await Promise.all([
    prisma.mesa.findUnique({
      where: { id: mesaId },
      include: {
        personagens: {
          orderBy: { nome: "asc" },
        },
      },
    }),
    listarMensagensSessao(mesaId),
  ]);
  if (!mesa) notFound();

  if (mesa.userId !== user.id) {
    redirect("/dashboard");
  }

  return <NarradorShell mesa={mesa} userId={user.id} mensagensIniciais={mensagensIniciais} />;
}
