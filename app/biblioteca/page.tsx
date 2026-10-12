import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { ThemeButton } from "@/components/temas/theme-button";
import { BotaoVoltar } from "@/components/botao-voltar";
import { serializarTemplate } from "@/app/bestiario/utils";
import { TraitsManager } from "./traits-manager";
import "@/app/bestiario/bestiario.css";
import "./biblioteca.css";

// Biblioteca do narrador: os padrões que as mesas dele usam (tipos de dano,
// condições) e os traits reutilizáveis entre criaturas.
export default async function BibliotecaPage() {
  const user = await usuarioDaRequest();
  if (!user) redirect("/login");

  const templates = await prisma.traitTemplate.findMany({
    where: { userId: user.id },
    orderBy: [{ criadoEm: "asc" }, { nome: "asc" }],
  });

  return (
    <div className="bestiario-page-wrapper">
      <div className="bestiario-page-topbar">
        <BotaoVoltar fallbackHref="/dashboard" className="bestiario-voltar" title="Voltar">
          <i className="fas fa-arrow-left" />
        </BotaoVoltar>
        <div className="bestiario-page-titulo">
          <span className="bestiario-page-kicker">NARRADOR</span>
          <h1>Biblioteca</h1>
        </div>
        <div className="bestiario-page-chip">
          <i className="fas fa-book" />
          <span>PADRÕES DAS SUAS MESAS</span>
        </div>
        <ThemeButton />
      </div>

      <TraitsManager templatesIniciais={templates.map(serializarTemplate)} />
    </div>
  );
}
