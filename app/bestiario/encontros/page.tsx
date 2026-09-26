import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { ThemeButton } from "@/components/temas/theme-button";
import { serializarEncontro, serializarEsquadrao } from "../utils";
import { EncontrosManager } from "./encontros-manager";
import "../bestiario.css";

export default async function EncontrosPage() {
  const user = await usuarioDaRequest();
  if (!user) redirect("/login");

  const [criaturas, esquadroes, encontros] = await Promise.all([
    prisma.criatura.findMany({
      where: { userId: user.id },
      select: { id: true, nome: true, nd: true },
      orderBy: { nome: "asc" },
    }),
    prisma.esquadrao.findMany({ where: { userId: user.id }, orderBy: { nome: "asc" } }),
    prisma.encontro.findMany({ where: { userId: user.id }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="bestiario-page-wrapper">
      <div className="bestiario-page-topbar">
        <Link href="/bestiario" className="bestiario-voltar" title="Voltar ao bestiário">
          <i className="fas fa-arrow-left" />
        </Link>
        <div className="bestiario-page-titulo">
          <span className="bestiario-page-kicker">NARRADOR</span>
          <h1>Esquadrões e Encontros</h1>
        </div>
        <div className="bestiario-page-chip">
          <i className="fas fa-people-group" />
          <span>COMPOSIÇÕES SALVAS</span>
        </div>
        <ThemeButton />
      </div>

      <EncontrosManager
        criaturas={criaturas}
        esquadroesIniciais={esquadroes.map(serializarEsquadrao)}
        encontrosIniciais={encontros.map(serializarEncontro)}
      />
    </div>
  );
}
