"use client";

import type { CombateVisto } from "@/lib/combate";
import { useMemo, useState } from "react";
import { AcoesTab } from "./acoes-tab";
import { ArvoresTab, type Arvore, type ArvoreCopiavel } from "./arvores-tab";
import { HabilidadesTab } from "./habilidades-tab";
import { InventarioTab } from "./inventario-tab";
import { ObjetivosTab, type Objetivo } from "./objetivos-tab";
import { PacotesContext } from "./pacotes";
import { PericiasTab } from "./pericias-tab";
import { SubfichasTab } from "./subfichas-tab";
import { TripulacaoTab, type Tripulante } from "./tripulacao-tab";
import { CalendarioView } from "@/app/calendario/[mesaId]/calendario-view";
import { CalendarioRealtime } from "@/app/calendario/[mesaId]/realtime-refresher";
import type { CalendarioCarregado } from "@/lib/calendario/carregar";
import type { Atributo, EfeitosAgregados } from "@/lib/op-rpg";
import type { SubfichaCard } from "@/lib/resumo-personagem";
import { ABAS, type AbaFicha } from "@/lib/subficha";

type Acao = React.ComponentProps<typeof AcoesTab>["acoes"][number];
type Item = React.ComponentProps<typeof InventarioTab>["itens"][number];
type RecursoRef = React.ComponentProps<typeof AcoesTab>["recursos"][number] & {
  valorAtual: number;
  valorMax: number;
};
type Habilidade = React.ComponentProps<typeof HabilidadesTab>["habilidades"][number];
type PericiaCustom = React.ComponentProps<typeof PericiasTab>["periciasCustom"][number];

type Props = {
  personagemId: string;
  personagemNome: string;
  /** Abas que a ficha mostra (lib/subficha.ts). */
  abas: AbaFicha[];
  /** `?aba=` da URL. */
  abaInicial: string | null;
  mesaId: string | null;
  nivel: number;
  exaustao: number;
  ppAtual: number;
  ppMax: number;
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
  /** Quem pode receber um efeito de aliado: a mesa e as subfichas. */
  alvos: Tripulante[];
  subfichas: SubfichaCard[];
  // O personagem no combate ativo da mesa; null = fora de combate.
  turno: CombateVisto["voce"];
  // Quem está no combate, pra escolher alvo.
  alvosCombate: CombateVisto["participantes"];
  atributoCdTecnicas: string | null;
  arvores: Arvore[];
  arvoresCopiaveis: ArvoreCopiavel[];
  habilidadesTravadas: string[];
};

export function FichaTabs({
  personagemId,
  personagemNome,
  abas,
  abaInicial,
  mesaId,
  nivel,
  exaustao,
  ppAtual,
  ppMax,
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
  alvos,
  subfichas,
  turno,
  alvosCombate,
  atributoCdTecnicas,
  arvores,
  arvoresCopiaveis,
  habilidadesTravadas,
}: Props) {
  const tabs = ABAS.filter((a) => abas.includes(a.id));
  const primeira = tabs[0]?.id ?? "combate";
  const [escolhida, setAtivaEstado] = useState<AbaFicha>(
    () => tabs.find((t) => t.id === abaInicial)?.id ?? primeira,
  );
  // Aba que saiu da ficha (subficha que mudou de abas) cai na primeira.
  const ativa = abas.includes(escolhida) ? escolhida : primeira;

  function setAtiva(id: AbaFicha) {
    setAtivaEstado(id);
    // replaceState: não refaz o RSC nem enche o histórico.
    const url = new URL(window.location.href);
    if (id === primeira) url.searchParams.delete("aba");
    else url.searchParams.set("aba", id);
    window.history.replaceState(null, "", url);
  }

  // Graus das técnicas, pra resolver GRAU nos chips fora da técnica.
  const grausTecnicas = useMemo(
    () =>
      [...new Set(acoes.filter((a) => a.tecnica && a.grau > 0).map((a) => a.grau))].sort(
        (a, b) => a - b,
      ),
    [acoes],
  );

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

  const fichaDoPacote = useMemo(
    () => ({ personagemId, habilidades, acoes, arvores, recursos }),
    [personagemId, habilidades, acoes, arvores, recursos],
  );

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
    <PacotesContext.Provider value={fichaDoPacote}>
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
          ppAtual={ppAtual}
          ppMax={ppMax}
          tripulantes={alvos}
          turno={turno}
          alvosCombate={alvosCombate}
          atributoCdTecnicas={atributoCdTecnicas}
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
          nivel={nivel}
          periciasCustom={periciasCustom}
          travadas={habilidadesTravadas}
          itens={itens}
          tripulantes={alvos}
          efeitosAgregados={efeitosAgregados}
          grausTecnicas={grausTecnicas}
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
          salvaguardasPedidas={(turno?.salvaguardas ?? []).filter((s) => !s.pelo)}
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
          recursos={recursos}
          periciasCustom={periciasCustom}
          acoes={acoes}
          habilidades={habilidades}
          tripulantes={alvos}
          grausTecnicas={grausTecnicas}
        />
      </div>

      {abas.includes("subfichas") && (
        <div
          hidden={ativa !== "subfichas"}
          role="tabpanel"
          id="painel-subfichas"
          aria-labelledby="tab-subfichas"
        >
          <SubfichasTab
            personagemId={personagemId}
            subfichas={subfichas.filter((s) => !s.daMesa)}
          />
        </div>
      )}

      {abas.includes("tripulacao") && (
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
            embarcacoes={subfichas.filter((s) => s.daMesa)}
          />
        </div>
      )}

      {mesaId && calendario && abas.includes("calendario") && (
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
            relogio={calendario.relogio}
            eventos={calendario.eventos}
            tiposClima={calendario.tiposClima}
            objetivos={objetivosComPrazo}
          />
        </div>
      )}
    </main>
    </PacotesContext.Provider>
  );
}
