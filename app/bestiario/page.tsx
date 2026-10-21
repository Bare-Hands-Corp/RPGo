import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { ThemeButton } from "@/components/temas/theme-button";
import { BotaoVoltar } from "@/components/botao-voltar";
import { CatalogoTiposProvider } from "@/components/tipos-dano/tipos-dano";
import { CatalogoCondicoesProvider } from "@/components/tipos-dano/condicoes";
import { catalogoCondicoesDoNarrador } from "@/lib/combate-servidor";
import { catalogoTiposDoNarrador } from "@/lib/tipos-dano-servidor";
import { BestiarioManager } from "./bestiario-manager";
import { serializarCriatura, serializarTemplate } from "./utils";
// O editor de efeitos de ficha (os mesmos do jogador) usa os estilos de lá.
import "@/app/ficha/[uid]/ficha.css";
import "./bestiario.css";

export default async function BestiarioPage() {
  const user = await usuarioDaRequest();
  if (!user) redirect("/login");

  const [criaturas, templates, linhagens] = await Promise.all([
    prisma.criatura.findMany({
      where: { userId: user.id },
      include: { componentes: true, linhagem: true },
      orderBy: { nome: "asc" },
    }),
    prisma.traitTemplate.findMany({
      where: { userId: user.id },
      orderBy: { nome: "asc" },
    }),
    prisma.linhagem.findMany({
      where: { userId: user.id },
      orderBy: { nome: "asc" },
    }),
  ]);

  // Na ordem arrastada pelo narrador; ordem 0 (nunca arrastada) segue alfabética.
  criaturas.sort((a, b) => (a.ordem || Number.MAX_SAFE_INTEGER) - (b.ordem || Number.MAX_SAFE_INTEGER));

  // Tipos de dano do narrador (Biblioteca), com cor e ícone, pros campos de tipo.
  const [catalogoTipos, catalogoCondicoes] = await Promise.all([
    catalogoTiposDoNarrador(user.id),
    catalogoCondicoesDoNarrador(user.id),
  ]);

  return (
    <div className="bestiario-page-wrapper">
      <div className="bestiario-page-topbar">
        <BotaoVoltar fallbackHref="/dashboard" className="bestiario-voltar" title="Voltar">
          <i className="fas fa-arrow-left" />
        </BotaoVoltar>
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

      <CatalogoTiposProvider tipos={catalogoTipos}>
        <CatalogoCondicoesProvider condicoes={catalogoCondicoes}>
          <BestiarioManager
            criaturasIniciais={criaturas.map(serializarCriatura)}
            templates={templates.map(serializarTemplate)}
            linhagens={linhagens.map((l) => l.nome)}
          />
        </CatalogoCondicoesProvider>
      </CatalogoTiposProvider>
    </div>
  );
}
