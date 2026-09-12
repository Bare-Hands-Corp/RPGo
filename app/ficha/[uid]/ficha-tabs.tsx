"use client";

import { useMemo, useState } from "react";
import { AcoesTab } from "./acoes-tab";
import { ArvoresTab, type Arvore, type ArvoreCopiavel } from "./arvores-tab";
import { HabilidadesTab } from "./habilidades-tab";
import { InventarioTab } from "./inventario-tab";
import { ObjetivosTab, type Objetivo } from "./objetivos-tab";
import { PericiasTab } from "./pericias-tab";
import { TripulacaoTab } from "./tripulacao-tab";
import { CalendarioView } from "@/app/calendario/[mesaId]/calendario-view";
import { CalendarioRealtime } from "@/app/calendario/[mesaId]/realtime-refresher";
import type { CalendarioCarregado } from "@/lib/calendario/carregar";
import type { Atributo, EfeitosAgregados } from "@/lib/op-rpg";

type Acao = React.ComponentProps<typeof AcoesTab>["acoes"][number];
type Item = React.ComponentProps<typeof InventarioTab>["itens"][number];
type RecursoRef = React.ComponentProps<typeof AcoesTab>["recursos"][number] & {
  valorAtual: number;
  valorMax: number;
};
type Habilidade = React.ComponentProps<typeof HabilidadesTab>["habilidades"][number];
type PericiaCustom = React.ComponentProps<typeof PericiasTab>["periciasCustom"][number];
type Tripulante = React.ComponentProps<typeof TripulacaoTab>["tripulantes"][number];
type Navio = React.ComponentProps<typeof TripulacaoTab>["navio"];

type Props = {
  personagemId: string;
  personagemNome: string;
  /** `?aba=` da URL. */
  abaInicial: string | null;
  mesaId: string | null;
  nivel: number;
  exaustao: number;
  penalidadeDesArmadura: number;
  atributos: Record<Atributo, number>;
  proficienciasRaw: unknown;
  periciasCustom: PericiaCustom[];
  cargaMaxima: number;
  berries: number;
  acoes: Acao[];
  itens: Item[];
  recursos: RecursoRef[];
  habilidades: Habilidade[];
  efeitosAgregados: EfeitosAgregados;
  calendario: CalendarioCarregado | null;
  objetivos: Objetivo[];
  isNarradorDaMesa: boolean;
  tripulantes: Tripulante[];
  navio: Navio;
  arvores: Arvore[];
  arvoresCopiaveis: ArvoreCopiavel[];
  habilidadesTravadas: string[];
};

type TabId =
  | "combate"
  | "habilidades"
  | "arvores"
  | "pericias"
  | "objetivos"
  | "inventario"
  | "tripulacao"
  | "calendario";

const TABS_BASE: { id: TabId; label: string; icone: string }[] = [
  { id: "combate", label: "Combate", icone: "fa-fist-raised" },
  { id: "habilidades", label: "Habilidades", icone: "fa-star" },
  { id: "arvores", label: "Árvores", icone: "fa-sitemap" },
  { id: "pericias", label: "Perícias", icone: "fa-dice-d20" },
  { id: "objetivos", label: "Objetivos", icone: "fa-scroll" },
  { id: "inventario", label: "Inventário", icone: "fa-sack-dollar" },
  { id: "tripulacao", label: "Tripulação", icone: "fa-users" },
];

export function FichaTabs({
  personagemId,
  personagemNome,
  abaInicial,
  mesaId,
  nivel,
  exaustao,
  penalidadeDesArmadura,
  atributos,
  proficienciasRaw,
  periciasCustom,
  cargaMaxima,
  berries,
  acoes,
  itens,
  recursos,
  habilidades,
  efeitosAgregados,
  calendario,
  objetivos,
  isNarradorDaMesa,
  tripulantes,
  navio,
  arvores,
  arvoresCopiaveis,
  habilidadesTravadas,
}: Props) {
  const temCalendario = !!(mesaId && calendario);
  const [ativa, setAtivaEstado] = useState<TabId>(() => {
    const valida =
      TABS_BASE.some((t) => t.id === abaInicial) ||
      (abaInicial === "calendario" && temCalendario);
    return valida ? (abaInicial as TabId) : "combate";
  });

  function setAtiva(id: TabId) {
    setAtivaEstado(id);
    // replaceState: não refaz o RSC nem enche o histórico.
    const url = new URL(window.location.href);
    if (id === "combate") url.searchParams.delete("aba");
    else url.searchParams.set("aba", id);
    window.history.replaceState(null, "", url);
  }

  const objetivosComPrazo = useMemo(
    () =>
      objetivos
        .filter((o) => o.estado === "aberto" && o.prazoDias !== null)
        .map((o) => ({
          id: o.id,
          titulo: o.titulo,
          icone: o.icone,
          prazoDias: o.prazoDias as number,
          personagemId,
          personagemNome,
        })),
    [objetivos, personagemId, personagemNome],
  );

  const tabs = [...TABS_BASE];
  if (temCalendario) {
    tabs.push({ id: "calendario", label: "Calendário", icone: "fa-calendar-days" });
  }

  function navegarPorSeta(e: React.KeyboardEvent, indice: number) {
    const passo =
      e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    let destino: number;
    if (passo !== 0) {
      destino = (indice + passo + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      destino = 0;
    } else if (e.key === "End") {
      destino = tabs.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    setAtiva(tabs[destino].id);
    document.getElementById(`tab-${tabs[destino].id}`)?.focus();
  }

  return (
    <main className="ficha-main">
      {/* Realtime do calendário fica sempre ativo enquanto a ficha está aberta,
          pra que mudanças cheguem mesmo quando outra aba estiver visível. */}
      {mesaId && calendario && (
        <CalendarioRealtime mesaId={mesaId} calendarioId={calendario.id} />
      )}

      <nav className="tabs" role="tablist" aria-label="Seções da ficha">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={ativa === tab.id}
            aria-controls={`painel-${tab.id}`}
            tabIndex={ativa === tab.id ? 0 : -1}
            className={`tab ${ativa === tab.id ? "active" : ""}`}
            onClick={() => setAtiva(tab.id)}
            onKeyDown={(e) => navegarPorSeta(e, i)}
          >
            <i className={`fas ${tab.icone}`} /> {tab.label}
          </button>
        ))}
      </nav>

      {/* Mantém todas as abas montadas (display:none nas inativas) pra preservar
          estado otimista durante mutações em background. */}
      <div
        hidden={ativa !== "combate"}
        role="tabpanel"
        id="painel-combate"
        aria-labelledby="tab-combate"
      >
        <AcoesTab
          personagemId={personagemId}
          acoes={acoes}
          nivel={nivel}
          exaustao={exaustao}
          penalidadeDesArmadura={penalidadeDesArmadura}
          atributos={atributos}
          recursos={recursos}
          efeitosAgregados={efeitosAgregados}
          itens={itens}
          habilidades={habilidades}
        />
      </div>

      <div
        hidden={ativa !== "habilidades"}
        role="tabpanel"
        id="painel-habilidades"
        aria-labelledby="tab-habilidades"
      >
        <HabilidadesTab
          personagemId={personagemId}
          habilidades={habilidades}
          recursos={recursos}
          atributos={atributos}
          periciasCustom={periciasCustom}
          travadas={habilidadesTravadas}
        />
      </div>

      <div
        hidden={ativa !== "pericias"}
        role="tabpanel"
        id="painel-pericias"
        aria-labelledby="tab-pericias"
      >
        <PericiasTab
          personagemId={personagemId}
          nivel={nivel}
          exaustao={exaustao}
          penalidadeDesArmadura={penalidadeDesArmadura}
          atributos={atributos}
          proficienciasRaw={proficienciasRaw}
          periciasCustom={periciasCustom}
          efeitosAgregados={efeitosAgregados}
        />
      </div>

      <div
        hidden={ativa !== "arvores"}
        role="tabpanel"
        id="painel-arvores"
        aria-labelledby="tab-arvores"
      >
        <ArvoresTab
          personagemId={personagemId}
          nivel={nivel}
          arvores={arvores}
          arvoresCopiaveis={arvoresCopiaveis}
          recursos={recursos}
          habilidades={habilidades}
        />
      </div>

      <div
        hidden={ativa !== "objetivos"}
        role="tabpanel"
        id="painel-objetivos"
        aria-labelledby="tab-objetivos"
      >
        <ObjetivosTab
          personagemId={personagemId}
          objetivos={objetivos}
          calendario={
            calendario
              ? { config: calendario.config, dataAtualDias: calendario.dataAtualDias }
              : null
          }
        />
      </div>

      <div
        hidden={ativa !== "inventario"}
        role="tabpanel"
        id="painel-inventario"
        aria-labelledby="tab-inventario"
      >
        <InventarioTab
          personagemId={personagemId}
          cargaMaxima={cargaMaxima}
          berries={berries}
          itens={itens}
          nivel={nivel}
          exaustao={exaustao}
          penalidadeDesArmadura={penalidadeDesArmadura}
          atributos={atributos}
          efeitosAgregados={efeitosAgregados}
        />
      </div>

      <div
        hidden={ativa !== "tripulacao"}
        role="tabpanel"
        id="painel-tripulacao"
        aria-labelledby="tab-tripulacao"
      >
        <TripulacaoTab
          personagemId={personagemId}
          mesaId={mesaId}
          isNarradorDaMesa={isNarradorDaMesa}
          tripulantes={tripulantes}
          navio={navio}
        />
      </div>

      {mesaId && calendario && (
        <div
          hidden={ativa !== "calendario"}
          role="tabpanel"
          id="painel-calendario"
          aria-labelledby="tab-calendario"
        >
          <CalendarioView
            mesaId={mesaId}
            isNarrador={isNarradorDaMesa}
            config={calendario.config}
            dataAtualDias={calendario.dataAtualDias}
            eventos={calendario.eventos}
            tiposClima={calendario.tiposClima}
            objetivos={objetivosComPrazo}
          />
        </div>
      )}
    </main>
  );
}
