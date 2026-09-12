"use client";

import {
  type CalendarioConfig,
  dataParaDias,
  dataRelativa,
} from "@/lib/calendario/engine";
import type { ObjetivoPrazo } from "./types";

// Mesmo valor da aba Objetivos.
const JANELA_VENCENDO = 3;

type Props = {
  config: CalendarioConfig;
  dataAtualDias: number;
  objetivos: ObjetivoPrazo[];
  mostrarDono: boolean;
};

export function situacaoPrazo(prazoDias: number, dataAtualDias: number) {
  const delta = prazoDias - dataAtualDias;
  if (delta < 0) return "atrasado" as const;
  if (delta <= JANELA_VENCENDO) return "vencendo" as const;
  return "no-prazo" as const;
}

const ROTULO = {
  atrasado: "Atrasado",
  vencendo: "Vencendo",
  "no-prazo": "No prazo",
};

export function PrazosCard({ config, dataAtualDias, objetivos, mostrarDono }: Props) {
  if (!objetivos.length) return null;

  const ordenados = [...objetivos].sort((a, b) => a.prazoDias - b.prazoDias);

  return (
    <div className="cal-card cal-prazos-card">
      <div className="cal-eventos-header">
        <div className="cal-eventos-header-esq">
          <span className="cal-kicker">Prazos de objetivos</span>
          <span className="cal-eventos-count">{ordenados.length}</span>
        </div>
        {mostrarDono && (
          <span className="cal-prazos-nota">
            <i className="fas fa-lock" /> cada jogador só enxerga os próprios prazos
          </span>
        )}
      </div>

      <div className="cal-eventos-lista">
        {ordenados.map((o) => {
          const data = dataParaDias(o.prazoDias, config);
          const situacao = situacaoPrazo(o.prazoDias, dataAtualDias);
          return (
            <div className={"cal-evento-row cal-prazo-row " + situacao} key={o.id}>
              <div className="cal-evento-dia">
                <span className="cal-evento-dia-num">
                  {String(data.dia).padStart(2, "0")}
                </span>
                <span className="cal-evento-dia-rel">
                  {dataRelativa(o.prazoDias, dataAtualDias)}
                </span>
              </div>
              <div className="cal-evento-corpo">
                <div className="cal-evento-titulo-linha">
                  <i className={`fas ${o.icone} cal-evento-icone-inline`} />
                  <span className="cal-evento-titulo">{o.titulo}</span>
                </div>
                <div className="cal-evento-meta">
                  <span>
                    {data.nomeMes}, ano {data.ano}
                  </span>
                  {mostrarDono && <span>· {o.personagemNome}</span>}
                </div>
              </div>
              <div className="cal-evento-lado">
                <span className={"cal-selo prazo-" + situacao}>{ROTULO[situacao]}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
