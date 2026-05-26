"use client";

import { useState } from "react";
import { AcoesTab } from "./acoes-tab";
import { InventarioTab } from "./inventario-tab";
import { CalendarioView } from "@/app/calendario/[mesaId]/calendario-view";
import { CalendarioRealtime } from "@/app/calendario/[mesaId]/realtime-refresher";
import type { CalendarioCarregado } from "@/lib/calendario/carregar";

type Acao = React.ComponentProps<typeof AcoesTab>["acoes"][number];
type Item = React.ComponentProps<typeof InventarioTab>["itens"][number];

type Props = {
  personagemId: string;
  mesaId: string | null;
  cargaMaxima: number;
  acoes: Acao[];
  itens: Item[];
  calendario: CalendarioCarregado | null;
  isNarradorDaMesa: boolean;
};

type TabId = "combate" | "missoes" | "inventario" | "tripulacao" | "calendario";

const TABS_BASE: { id: TabId; label: string; icone: string }[] = [
  { id: "combate", label: "Combate", icone: "fa-fist-raised" },
  { id: "missoes", label: "Missões", icone: "fa-scroll" },
  { id: "inventario", label: "Inventário", icone: "fa-sack-dollar" },
  { id: "tripulacao", label: "Tripulação", icone: "fa-users" },
];

export function FichaTabs({
  personagemId,
  mesaId,
  cargaMaxima,
  acoes,
  itens,
  calendario,
  isNarradorDaMesa,
}: Props) {
  const [ativa, setAtiva] = useState<TabId>("combate");

  const tabs = [...TABS_BASE];
  if (mesaId && calendario) {
    tabs.push({ id: "calendario", label: "Calendário", icone: "fa-calendar-days" });
  }

  return (
    <main className="ficha-main">
      {/* Realtime do calendário fica sempre ativo enquanto a ficha está aberta,
          pra que mudanças cheguem mesmo quando outra aba estiver visível. */}
      {mesaId && calendario && (
        <CalendarioRealtime mesaId={mesaId} calendarioId={calendario.id} />
      )}

      <nav className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab ${ativa === tab.id ? "active" : ""}`}
            onClick={() => setAtiva(tab.id)}
          >
            <i className={`fas ${tab.icone}`} /> {tab.label}
          </button>
        ))}
      </nav>

      {/* Mantém todas as abas montadas (display:none nas inativas) pra preservar
          estado otimista durante mutações em background. */}
      <div hidden={ativa !== "combate"}>
        <AcoesTab personagemId={personagemId} acoes={acoes} />
      </div>

      <div hidden={ativa !== "missoes"} className="placeholder-tab">
        <i className="fas fa-scroll" />
        <p>Missões — em construção.</p>
      </div>

      <div hidden={ativa !== "inventario"}>
        <InventarioTab
          personagemId={personagemId}
          cargaMaxima={cargaMaxima}
          itens={itens}
        />
      </div>

      <div hidden={ativa !== "tripulacao"} className="placeholder-tab">
        <i className="fas fa-users" />
        <p>Tripulação — em construção.</p>
      </div>

      {mesaId && calendario && (
        <div hidden={ativa !== "calendario"}>
          <CalendarioView
            mesaId={mesaId}
            isNarrador={isNarradorDaMesa}
            config={calendario.config}
            dataAtualDias={calendario.dataAtualDias}
            eventos={calendario.eventos}
            tiposClima={calendario.tiposClima}
          />
        </div>
      )}
    </main>
  );
}
