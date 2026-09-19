"use client";

import Swal from "sweetalert2";
import {
  type CalendarioConfig,
  dataParaDias,
  dataRelativa,
} from "@/lib/calendario/engine";
import type { EventoCal, TipoClima } from "./types";
import { IconeCal } from "./icones";

const JANELA_PADRAO = 6;
const JANELA_EXPANDIDA = 30;

type Props = {
  config: CalendarioConfig;
  dataAtualDias: number;
  eventos: EventoCal[];
  tiposClima: TipoClima[];
  isNarrador: boolean;
  expandido: boolean;
  onToggleExpandir: () => void;
  onNovo: () => void;
  onEditar: (ev: EventoCal) => void;
  onApagar: (id: string) => void;
};

export function ListaEventos({
  config,
  dataAtualDias,
  eventos,
  tiposClima,
  isNarrador,
  expandido,
  onToggleExpandir,
  onNovo,
  onEditar,
  onApagar,
}: Props) {
  const janela = expandido ? JANELA_EXPANDIDA : JANELA_PADRAO;
  let exibidos: EventoCal[];
  let totalNaDirecao: number;
  if (isNarrador) {
    const futuros = eventos.filter((e) => e.dataDias >= dataAtualDias);
    totalNaDirecao = futuros.length;
    const limite = dataAtualDias + janela;
    exibidos = futuros.filter((e) => e.dataDias < limite).sort((a, b) => a.dataDias - b.dataDias);
  } else {
    const passados = eventos.filter((e) => e.dataDias <= dataAtualDias);
    totalNaDirecao = passados.length;
    const limite = dataAtualDias - janela;
    exibidos = passados.filter((e) => e.dataDias > limite).sort((a, b) => b.dataDias - a.dataDias);
  }

  const direcao = isNarrador ? "próximos" : "últimos";
  const foraDaJanela = totalNaDirecao > exibidos.length;
  const restante = totalNaDirecao - exibidos.length;

  async function apagar(id: string) {
    const result = await Swal.fire({
      title: "Excluir evento",
      text: "Tem certeza que quer apagar este evento?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Excluir",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!result.isConfirmed) return;
    onApagar(id);
  }

  return (
    <div className="cal-card cal-eventos-card">
      <div className="cal-eventos-header">
        <div className="cal-eventos-header-esq">
          <span className="cal-kicker">
            {isNarrador ? "Próximos eventos" : "Diário de bordo"}
          </span>
          <span className="cal-eventos-count">{exibidos.length}</span>
          {isNarrador && <span className="cal-selo narrador">Visão do narrador</span>}
        </div>
        {isNarrador && (
          <button type="button" className="btn-rect outline sm" onClick={onNovo}>
            <i className="fas fa-plus" /> Novo evento
          </button>
        )}
      </div>

      {!exibidos.length ? (
        <div className="cal-empty">
          <span className="cal-empty-titulo">
            {!eventos.length
              ? "Nenhum evento registrado ainda"
              : `Nada nos ${direcao} ${janela} dias`}
          </span>
          <span>
            {isNarrador
              ? "Eventos climáticos e narrativos aparecem aqui e na grade do mês."
              : "O que o narrador registrar até a data de hoje aparece aqui."}
          </span>
          {isNarrador && (
            <button type="button" className="btn-rect tracejado sm" onClick={onNovo}>
              <i className="fas fa-plus" /> Criar o primeiro evento
            </button>
          )}
        </div>
      ) : (
        <div className="cal-eventos-lista">
          {exibidos.map((ev) => {
            const futuro = ev.dataDias > dataAtualDias;
            const tipoClima = ev.tipoClimaId
              ? tiposClima.find((t) => t.id === ev.tipoClimaId)
              : null;
            const icone =
              ev.tipo === "climatico"
                ? tipoClima?.icone || "fa-cloud-sun"
                : "fa-scroll";
            const data = dataParaDias(ev.dataDias, config);
            const rel = dataRelativa(ev.dataDias, dataAtualDias);
            const tipoLabel = ev.tipo === "climatico" ? "Clima" : "Narrativo";
            const tipoClass = ev.tipo === "climatico" ? "tipo-climatico" : "tipo-narrativo";

            const rowClasses = ["cal-evento-row", tipoClass];
            if (futuro) rowClasses.push("cal-evento-futuro");
            if (ev.oculto) rowClasses.push("cal-evento-oculto-row");

            return (
              <div className={rowClasses.join(" ")} key={ev.id}>
                <div className="cal-evento-dia">
                  <span className="cal-evento-dia-num">{String(data.dia).padStart(2, "0")}</span>
                  <span className="cal-evento-dia-rel">{rel}</span>
                </div>
                <div className="cal-evento-corpo">
                  <div className="cal-evento-titulo-linha">
                    <IconeCal icone={icone} className="cal-evento-icone-inline" />
                    <span className="cal-evento-titulo">{ev.titulo}</span>
                    <span className={"cal-selo " + tipoClass}>{tipoLabel}</span>
                  </div>
                  <div className="cal-evento-meta">
                    <span>
                      {data.nomeMes}, ano {data.ano}
                    </span>
                    {tipoClima && ev.tipo === "climatico" && <span>· {tipoClima.nome}</span>}
                  </div>
                  {ev.descricao && <div className="cal-evento-descricao">{ev.descricao}</div>}
                </div>

                {isNarrador && (
                  <div className="cal-evento-lado">
                    {ev.oculto ? (
                      <span
                        className="cal-selo status-oculto"
                        title="Só o narrador vê este evento, mesmo depois da data"
                      >
                        <i className="fas fa-eye-slash" /> Oculto
                      </span>
                    ) : futuro ? (
                      <span
                        className="cal-selo status-futuro"
                        title="Ainda não chegou a data — os jogadores não veem"
                      >
                        Agendado
                      </span>
                    ) : (
                      <span
                        className="cal-selo status-visivel"
                        title="Já visível pros jogadores"
                      >
                        Visível
                      </span>
                    )}
                    <div className="cal-evento-acoes">
                      <button
                        type="button"
                        className="cal-acao-btn"
                        onClick={() => onEditar(ev)}
                        title="Editar evento"
                        aria-label={`Editar evento ${ev.titulo}`}
                      >
                        <i className="fas fa-pen" />
                      </button>
                      <button
                        type="button"
                        className="cal-acao-btn cal-acao-delete"
                        onClick={() => apagar(ev.id)}
                        title="Excluir evento"
                        aria-label={`Excluir evento ${ev.titulo}`}
                      >
                        <i className="fas fa-trash" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(expandido || foraDaJanela) && (
        <button
          type="button"
          className="btn-rect tracejado sm"
          onClick={onToggleExpandir}
        >
          {expandido ? (
            <>
              <i className="fas fa-chevron-up" /> Recolher pros {direcao} {JANELA_PADRAO} dias
            </>
          ) : (
            <>
              <i className="fas fa-chevron-down" /> Ver os {direcao} {JANELA_EXPANDIDA} dias (+
              {restante})
            </>
          )}
        </button>
      )}
    </div>
  );
}
