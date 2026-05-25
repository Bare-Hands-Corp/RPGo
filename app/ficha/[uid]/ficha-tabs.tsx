"use client";

import Link from "next/link";
import { useState } from "react";
import { AcoesTab } from "./acoes-tab";
import { InventarioTab } from "./inventario-tab";

type Acao = React.ComponentProps<typeof AcoesTab>["acoes"][number];
type Item = React.ComponentProps<typeof InventarioTab>["itens"][number];

type Props = {
  personagemId: string;
  mesaId: string | null;
  cargaMaxima: number;
  acoes: Acao[];
  itens: Item[];
};

type TabId = "combate" | "missoes" | "inventario" | "tripulacao";

const TABS: { id: TabId; label: string; icone: string }[] = [
  { id: "combate", label: "Combate", icone: "fa-fist-raised" },
  { id: "missoes", label: "Missões", icone: "fa-scroll" },
  { id: "inventario", label: "Inventário", icone: "fa-sack-dollar" },
  { id: "tripulacao", label: "Tripulação", icone: "fa-users" },
];

export function FichaTabs({ personagemId, mesaId, cargaMaxima, acoes, itens }: Props) {
  const [ativa, setAtiva] = useState<TabId>("combate");

  return (
    <main className="ficha-main">
      <nav className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab ${ativa === tab.id ? "active" : ""}`}
            onClick={() => setAtiva(tab.id)}
          >
            <i className={`fas ${tab.icone}`} /> {tab.label}
          </button>
        ))}
        {mesaId && (
          <Link href={`/calendario/${mesaId}`} className="tab">
            <i className="fas fa-calendar-days" /> Calendário
          </Link>
        )}
      </nav>

      {ativa === "combate" && <AcoesTab personagemId={personagemId} acoes={acoes} />}

      {ativa === "missoes" && (
        <div className="placeholder-tab">
          <i className="fas fa-scroll" />
          <p>Missões — em construção.</p>
        </div>
      )}

      {ativa === "inventario" && (
        <InventarioTab
          personagemId={personagemId}
          cargaMaxima={cargaMaxima}
          itens={itens}
        />
      )}

      {ativa === "tripulacao" && (
        <div className="placeholder-tab">
          <i className="fas fa-users" />
          <p>Tripulação — em construção.</p>
        </div>
      )}
    </main>
  );
}
