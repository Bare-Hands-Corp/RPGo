"use client";

import {
  type CalendarioConfig,
  diasParaData,
  fasesLua,
} from "@/lib/calendario/engine";
import type { EventoCal, ObjetivoPrazo, TipoClima } from "./types";
import { IconeCal } from "./icones";

type Props = {
  config: CalendarioConfig;
  dataAtualDias: number;
  mesVisao: { ano: number; mes: number };
  eventos: EventoCal[];
  tiposClima: TipoClima[];
  objetivos: ObjetivoPrazo[];
  isNarrador: boolean;
  onClickDia: (dataDias: number) => void;
  onNovoEventoNoDia: (dataDias: number) => void;
};

export function GridMensal({
  config,
  dataAtualDias,
  mesVisao,
  eventos,
  tiposClima,
  objetivos,
  isNarrador,
  onClickDia,
  onNovoEventoNoDia,
}: Props) {
  const diasMes = config.meses[mesVisao.mes - 1].dias;
  const primeiroDias = diasParaData(
    { ano: mesVisao.ano, mes: mesVisao.mes, dia: 1 },
    config,
  );
  const semanaLen = config.diasSemana.length;
  const offset = (((config.diaSemanaEpoch ?? 0) + primeiroDias) % semanaLen + semanaLen) % semanaLen;

  // Indexa eventos por dataDias.
  const porDia = new Map<number, EventoCal[]>();
  for (const e of eventos) {
    const arr = porDia.get(e.dataDias) || [];
    arr.push(e);
    porDia.set(e.dataDias, arr);
  }

  const prazosPorDia = new Map<number, ObjetivoPrazo[]>();
  for (const o of objetivos) {
    const arr = prazosPorDia.get(o.prazoDias) || [];
    arr.push(o);
    prazosPorDia.set(o.prazoDias, arr);
  }

  return (
    <div className="cal-card calendario-grid-wrapper">
      <div className="calendario-grid-weekdays">
        {config.diasSemana.map((d, i) => (
          <div key={i} title={d}>
            {(d || "").slice(0, 3)}
          </div>
        ))}
      </div>
      <div className="calendario-grid">
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`v-${i}`} className="cal-dia cal-dia-vazio" />
        ))}
        {Array.from({ length: diasMes }).map((_, idx) => {
          const d = idx + 1;
          const dataDias = diasParaData(
            { ano: mesVisao.ano, mes: mesVisao.mes, dia: d },
            config,
          );
          const isHoje = dataDias === dataAtualDias;
          const isPassado = dataDias < dataAtualDias;
          const isFuturo = dataDias > dataAtualDias;
          const eventosDia = porDia.get(dataDias) || [];
          const prazosDia = prazosPorDia.get(dataDias) || [];

          const classes = ["cal-dia"];
          if (isHoje) classes.push("cal-dia-hoje");
          else if (isPassado) classes.push("cal-dia-passado");

          const climatico = eventosDia.find((e) => e.tipo === "climatico");
          const narrativos = eventosDia.filter((e) => e.tipo === "narrativo");

          // Evento e prazo dividem as duas linhas da célula; o resto vira "+N".
          const marcas = [
            ...narrativos.map((e) => ({
              chave: e.id,
              tipo: "evento" as const,
              titulo: e.titulo,
              icone: null as string | null,
            })),
            ...prazosDia.map((o) => ({
              chave: `obj-${o.id}`,
              tipo: "objetivo" as const,
              titulo: o.titulo,
              icone: o.icone,
            })),
          ];
          const visiveis = marcas.slice(0, 2);
          const extras = marcas.length - visiveis.length;

          const tipoClimaDia = climatico
            ? tiposClima.find((t) => t.id === climatico.tipoClimaId)
            : null;
          const iconeClima = climatico ? tipoClimaDia?.icone || "fa-cloud-sun" : null;

          const luaDia = fasesLua(dataDias, config.cicloLuaDias);
          const nomeMes = config.meses[mesVisao.mes - 1]?.nome || "";

          const resumo = [
            `Dia ${d} de ${nomeMes}, ano ${mesVisao.ano}`,
            isHoje ? "dia atual" : null,
            climatico ? `clima: ${climatico.titulo}` : null,
            narrativos.length ? `${narrativos.length} evento(s) narrativo(s)` : null,
            prazosDia.length ? `${prazosDia.length} prazo(s) de objetivo` : null,
            `lua ${luaDia.nome}`,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <div key={dataDias} className={classes.join(" ")}>
              {isNarrador && !isHoje && (
                <button
                  type="button"
                  className="cal-dia-hit"
                  onClick={() => onClickDia(dataDias)}
                  title={`Avançar a mesa pro dia ${d}`}
                  aria-label={`${resumo}. Definir como dia atual.`}
                />
              )}

              <div className="cal-dia-conteudo" aria-hidden={isNarrador && !isHoje}>
                <div className="cal-dia-topo">
                  <span className="cal-dia-num">{String(d).padStart(2, "0")}</span>
                  {isHoje && <span className="cal-dia-hoje-marca">hoje</span>}
                  {iconeClima && (
                    <IconeCal
                      icone={iconeClima}
                      className="cal-dia-icone-clima"
                    />
                  )}
                </div>

                <div className="cal-dia-eventos">
                  {visiveis.map((m) => (
                    <div
                      key={m.chave}
                      className={
                        "cal-dia-evento-mini" +
                        (m.tipo === "objetivo" ? " evento-mini-objetivo" : "") +
                        (isFuturo && m.tipo === "evento" ? " evento-mini-futuro" : "")
                      }
                    >
                      {m.tipo === "objetivo" ? (
                        <i className={`fas ${m.icone} cal-dia-evento-icone`} />
                      ) : (
                        <span className="cal-dia-evento-dot" />
                      )}
                      <span>{m.titulo}</span>
                    </div>
                  ))}
                </div>

                <div className="cal-dia-base">
                  <span className="cal-dia-lua">
                    <IconeCal icone={luaDia.icone} />
                  </span>
                  {extras > 0 && <span className="cal-dia-extras">+{extras}</span>}
                </div>
              </div>

              {isNarrador && (
                <button
                  type="button"
                  className="cal-dia-add"
                  onClick={() => onNovoEventoNoDia(dataDias)}
                  title={`Novo evento no dia ${d}`}
                  aria-label={`Novo evento no dia ${d} de ${nomeMes}`}
                >
                  <i className="fas fa-plus" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="calendario-grid-legenda">
        <span className="cal-legenda-item">
          <span className="cal-legenda-dot" style={{ background: "var(--primary)" }} />
          Dia atual
        </span>
        <span className="cal-legenda-item">
          <span className="cal-legenda-dot" style={{ background: "var(--color-padrao)" }} />
          Clima
        </span>
        <span className="cal-legenda-item">
          <span className="cal-legenda-dot" style={{ background: "var(--color-livre)" }} />
          Evento narrativo
        </span>
        {objetivos.length > 0 && (
          <span className="cal-legenda-item">
            <span className="cal-legenda-dot" style={{ background: "var(--color-power)" }} />
            Prazo de objetivo
          </span>
        )}
        {isNarrador && (
          <span className="cal-legenda-item cal-legenda-futuro">
            Clique num dia pra avançar a mesa até ele
          </span>
        )}
      </div>
    </div>
  );
}
