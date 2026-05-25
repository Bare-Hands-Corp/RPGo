import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { CardPersonagem } from "./card-personagem";
import { CardMesa } from "./card-mesa";
import { BotaoNovaMesa } from "./nova-mesa";
import { LogoutButton } from "./logout-button";
import { RealtimeRefresher } from "./realtime-refresher";
import { ThemeButton } from "@/components/temas/theme-button";
import "./dashboard.css";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Duas queries em paralelo. Personagens inclui a mesa pro footer do card.
  const [personagens, mesas] = await Promise.all([
    prisma.personagem.findMany({
      where: { userId: user.id },
      include: { mesa: { select: { nome: true } } },
      orderBy: { nome: "asc" },
    }),
    prisma.mesa.findMany({
      where: { userId: user.id },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <div className="dashboard-container">
      <RealtimeRefresher />

      <header className="dashboard-header">
        <h1>
          <i className="fa-solid fa-dice-d20" /> Hand Rolls
        </h1>
        <div style={{ display: "flex", gap: 15, alignItems: "center" }}>
          <ThemeButton />
          <LogoutButton />
        </div>
      </header>

      <div className="dashboard-section-title">
        <h2>Meus Personagens</h2>
      </div>
      <div id="listaPersonagens" className="cards-grid">
        {personagens.map((p) => (
          <CardPersonagem key={p.id} personagem={p} />
        ))}
        <Link href="/criacao-personagem" className="btn-criar-card">
          <div className="plus-icon">
            <i className="fas fa-plus" />
          </div>
          <div className="label">Criar novo personagem</div>
          <div className="hint">COMECE DO ZERO</div>
        </Link>
      </div>

      <div className="dashboard-section-title">
        <h2>Mesas como Narrador</h2>
      </div>
      <div className="cards-grid">
        {mesas.map((m) => (
          <CardMesa key={m.id} mesa={m} />
        ))}
        <BotaoNovaMesa />
      </div>
    </div>
  );
}
