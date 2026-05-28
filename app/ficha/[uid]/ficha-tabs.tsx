"use client";

import { useState } from "react";
import { AcoesTab } from "./acoes-tab";
import { HabilidadesTab } from "./habilidades-tab";
import { InventarioTab } from "./inventario-tab";
import { PericiasTab } from "./pericias-tab";
import { CalendarioView } from "@/app/calendario/[mesaId]/calendario-view";
import { CalendarioRealtime } from "@/app/calendario/[mesaId]/realtime-refresher";
import type { CalendarioCarregado } from "@/lib/calendario/carregar";
import type { Atributo, EfeitosAgregados } from "@/lib/op-rpg";

type Acao = React.ComponentProps<typeof AcoesTab>["acoes"][number];
type Item = React.ComponentProps<typeof InventarioTab>["itens"][number];
type RecursoRef = React.ComponentProps<typeof AcoesTab>["recursos"][number];
type Habilidade = React.ComponentProps<typeof HabilidadesTab>["habilidades"][number];

type Props = {
  personagemId: string;
  mesaId: string | null;
  nivel: number;
  atributos: Record<Atributo, number>;
  proficienciasRaw: unknown;
  cargaMaxima: number;
  berries: number;
  acoes: Acao[];
  itens: Item[];
  recursos: RecursoRef[];
  habilidades: Habilidade[];
  efeitosAgregados: EfeitosAgregados;
  calendario: CalendarioCarregado | null;
  isNarradorDaMesa: boolean;
};

type TabId =
  | "combate"
  | "habilidades"
  | "pericias"
  | "missoes"
  | "inventario"
  | "tripulacao"
  | "calendario";

const TABS_BASE: { id: TabId; label: string; icone: string }[] = [
  { id: "combate", label: "Combate", icone: "fa-fist-raised" },
  { id: "habilidades", label: "Habilidades", icone: "fa-star" },
  { id: "pericias", label: "Perícias", icone: "fa-dice-d20" },
  { id: "missoes", label: "Missões", icone: "fa-scroll" },
  { id: "inventario", label: "Inventário", icone: "fa-sack-dollar" },
  { id: "tripulacao", label: "Tripulação", icone: "fa-users" },
];

export function FichaTabs({
  personagemId,
  mesaId,
  nivel,
  atributos,
  proficienciasRaw,
  cargaMaxima,
  berries,
  acoes,
  itens,
  recursos,
  habilidades,
  efeitosAgregados,
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
        <AcoesTab
          personagemId={personagemId}
          acoes={acoes}
          nivel={nivel}
          atributos={atributos}
          recursos={recursos}
          efeitosAgregados={efeitosAgregados}
        />
      </div>

      <div hidden={ativa !== "habilidades"}>
        <HabilidadesTab
          personagemId={personagemId}
          habilidades={habilidades}
          recursos={recursos}
        />
      </div>

      <div hidden={ativa !== "pericias"}>
        <PericiasTab
          personagemId={personagemId}
          nivel={nivel}
          atributos={atributos}
          proficienciasRaw={proficienciasRaw}
          efeitosAgregados={efeitosAgregados}
        />
      </div>

      <div hidden={ativa !== "missoes"} className="placeholder-tab">
        <i className="fas fa-scroll" />
        <p>Missões — em construção.</p>
      </div>

      <div hidden={ativa !== "inventario"}>
        <InventarioTab
          personagemId={personagemId}
          cargaMaxima={cargaMaxima}
          berries={berries}
          itens={itens}
          nivel={nivel}
          atributos={atributos}
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
