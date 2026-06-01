import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { ThemeButton } from "@/components/temas/theme-button";
import { AmeacasManager } from "./ameacas-manager";
import { serializarAmeaca } from "./utils";
import "./ameacas.css";

type Params = { params: Promise<{ mesaId: string }> };

export default async function AmeacasPage({ params }: Params) {
  const { mesaId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const mesa = await prisma.mesa.findUnique({ where: { id: mesaId } });
  if (!mesa) notFound();
  if (mesa.userId !== user.id) redirect("/dashboard");

  const ameacas = await prisma.$queryRaw<
    Array<{
      id: string;
      mesaId: string;
      nome: string;
      classeResistencia: number;
      pontosVida: number;
      classeDificuldade: number;
      nivelDesafio: number;
      deslocamento: number;
      deslocamentoNado: number | null;
      pontosPoder: number;
      bonusProficiencia: number;
      forca: number;
      destreza: number;
      constituicao: number;
      sabedoria: number;
      presenca: number;
      vontade: number;
      caracteristicas: unknown;
      aspectos: unknown;
      acoes: unknown;
      criadoEm: Date;
      atualizadoEm: Date;
    }>
  >`
    SELECT
      id,
      mesa_id AS "mesaId",
      nome,
      classe_resistencia AS "classeResistencia",
      pontos_vida AS "pontosVida",
      classe_dificuldade AS "classeDificuldade",
      nivel_desafio AS "nivelDesafio",
      deslocamento,
      deslocamento_nado AS "deslocamentoNado",
      pontos_poder AS "pontosPoder",
      bonus_proficiencia AS "bonusProficiencia",
      forca,
      destreza,
      constituicao,
      sabedoria,
      presenca,
      vontade,
      caracteristicas,
      aspectos,
      acoes,
      criado_em AS "criadoEm",
      atualizado_em AS "atualizadoEm"
    FROM ameacas
    WHERE mesa_id = ${mesaId}
    ORDER BY nome ASC
  `;

  return (
    <div className="ameacas-page-wrapper">
      <div className="ameacas-page-topbar">
        <Link href={`/narrador/${mesaId}`} className="ameacas-voltar" title="Voltar ao narrador">
          <i className="fas fa-arrow-left" />
        </Link>
        <div className="ameacas-page-titulo">
          <span className="ameacas-page-kicker">FICHAS DE AMEAÇAS</span>
          <h1>{mesa.nome}</h1>
        </div>
        <div className="ameacas-page-chip">
          <i className="fas fa-skull" />
          <span>CATÁLOGO DA MESA</span>
        </div>
        <ThemeButton />
      </div>

      <AmeacasManager mesaId={mesaId} ameacasIniciais={ameacas.map(serializarAmeaca)} />
    </div>
  );
}
