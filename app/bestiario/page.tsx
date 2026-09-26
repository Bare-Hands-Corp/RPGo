import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { ThemeButton } from "@/components/temas/theme-button";
import { BestiarioManager } from "./bestiario-manager";
import { serializarCriatura, serializarTemplate } from "./utils";
import "./bestiario.css";

export default async function BestiarioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [criaturas, templates] = await Promise.all([
    prisma.criatura.findMany({
      where: { userId: user.id },
      include: { componentes: true },
      orderBy: { nome: "asc" },
    }),
    prisma.traitTemplate.findMany({
      where: { userId: user.id },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <div className="bestiario-page-wrapper">
      <div className="bestiario-page-topbar">
        <Link href="/dashboard" className="bestiario-voltar" title="Voltar">
          <i className="fas fa-arrow-left" />
        </Link>
        <div className="bestiario-page-titulo">
          <span className="bestiario-page-kicker">NARRADOR</span>
          <h1>Bestiário</h1>
        </div>
        <div className="bestiario-page-chip">
          <i className="fas fa-paw" />
          <span>SUA BIBLIOTECA DE CRIATURAS</span>
        </div>
        <ThemeButton />
      </div>

      <BestiarioManager
        criaturasIniciais={criaturas.map(serializarCriatura)}
        templates={templates.map(serializarTemplate)}
      />
    </div>
  );
}
