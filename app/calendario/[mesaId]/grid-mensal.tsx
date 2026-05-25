"use client";

import {
  type CalendarioConfig,
  diasParaData,
  fasesLua,
} from "@/lib/calendario/engine";
import type { EventoCal, TipoClima } from "./types";

type Props = {
  config: CalendarioConfig;
  dataAtualDias: number;
  mesVisao: { ano: number; mes: number };
  eventos: EventoCal[];
  tiposClima: TipoClima[];
  isNarrador: boolean;
  onClickDia: (dataDias: number) => void;
};

export function GridMensal({
  config,
  dataAtualDias,
  mesVisao,
  eventos,
  tiposClima,
  isNarrador,
  onClickDia,
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

  return (
    <div className="calendario-grid-wrapper">
      <div className="calendario-grid-weekdays">
        {config.diasSemana.map((d, i) => (
          <div key={i}>{(d || "").slice(0, 3)}</div>
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

          const classes = ["cal-dia"];
          if (isHoje) classes.push("cal-dia-hoje");
          else if (isPassado) classes.push("cal-dia-passado");
          else if (isNarrador && isFuturo) classes.push("cal-dia-futuro-narrador");

          const climatico = eventosDia.find((e) => e.tipo === "climatico");
          const narrativos = eventosDia.filter((e) => e.tipo === "narrativo");
          const narrativoPrincipal = narrativos[0];

          const iconeClima = climatico
            ? tiposClima.find((t) => t.id === climatico.tipoClimaId)?.icone || "🌤️"
            : null;

          const luaDia = fasesLua(dataDias, config.cicloLuaDias);
          const extras = narrativos.length > 1 ? `+${narrativos.length - 1}` : null;

          return (
            <div
              key={dataDias}
              className={classes.join(" ")}
              onClick={() => onClickDia(dataDias)}
              style={isNarrador ? { cursor: "pointer" } : undefined}
            >
              <div className="cal-dia-topo">
                <span className="cal-dia-num">{String(d).padStart(2, "0")}</span>
                {iconeClima && <span className="cal-dia-icone-clima">{iconeClima}</span>}
              </div>
              <div className="cal-dia-evento-meio">
                {narrativoPrincipal && (
                  <div
                    className={
                      "cal-dia-evento-mini evento-mini-narrativo" +
                      (isFuturo ? " evento-mini-futuro" : "")
                    }
                  >
                    <span className="cal-dia-evento-dot" />
                    <span>{narrativoPrincipal.titulo}</span>
                  </div>
                )}
              </div>
              <div className="cal-dia-base">
                <span className="cal-dia-lua" title={luaDia.nome}>
                  {luaDia.emoji}
                </span>
                {extras && <span className="cal-dia-extras">{extras}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="calendario-grid-legenda">
        <span className="cal-legenda-item">
          <span className="cal-legenda-dot" style={{ background: "var(--primary)" }} />
          HOJE
        </span>
        <span className="cal-legenda-item">
          <span className="cal-legenda-dot" style={{ background: "#1976d2" }} />
          CLIMA
        </span>
        <span className="cal-legenda-item">
          <span className="cal-legenda-dot" style={{ background: "#7c3aed" }} />
          NARRATIVO
        </span>
        {isNarrador && <span className="cal-legenda-item cal-legenda-futuro">FUTURO (só narrador)</span>}
      </div>
    </div>
  );
}
