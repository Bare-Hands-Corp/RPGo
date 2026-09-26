import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { ThemeButton } from "@/components/temas/theme-button";
import { serializarTemplate } from "../utils";
import { TraitsManager } from "./traits-manager";
import "../bestiario.css";

export default async function BibliotecaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const templates = await prisma.traitTemplate.findMany({
    where: { userId: user.id },
    orderBy: { nome: "asc" },
  });

  return (
    <div className="bestiario-page-wrapper">
      <div className="bestiario-page-topbar">
        <Link href="/bestiario" className="bestiario-voltar" title="Voltar ao bestiário">
          <i className="fas fa-arrow-left" />
        </Link>
        <div className="bestiario-page-titulo">
          <span className="bestiario-page-kicker">NARRADOR</span>
          <h1>Biblioteca de traits</h1>
        </div>
        <div className="bestiario-page-chip">
          <i className="fas fa-book" />
          <span>REUTILIZÁVEL ENTRE CRIATURAS</span>
        </div>
        <ThemeButton />
      </div>

      <TraitsManager templatesIniciais={templates.map(serializarTemplate)} />
    </div>
  );
}
