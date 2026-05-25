"use client";

import { useTransition } from "react";
import Swal from "sweetalert2";
import {
  type CalendarioConfig,
  dataParaDias,
  dataRelativa,
} from "@/lib/calendario/engine";
import type { EventoCal, TipoClima } from "./types";
import { deletarEvento } from "./actions";

const JANELA_PADRAO = 6;
const JANELA_EXPANDIDA = 30;

type Props = {
  mesaId: string;
  config: CalendarioConfig;
  dataAtualDias: number;
  eventos: EventoCal[];
  tiposClima: TipoClima[];
  isNarrador: boolean;
  expandido: boolean;
  onToggleExpandir: () => void;
  onNovo: () => void;
  onEditar: (ev: EventoCal) => void;
};

export function ListaEventos({
  mesaId,
  config,
  dataAtualDias,
  eventos,
  tiposClima,
  isNarrador,
  expandido,
  onToggleExpandir,
  onNovo,
  onEditar,
}: Props) {
  const [, startTransition] = useTransition();

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

  const direcao = isNarrador ? "PRÓXIMOS" : "ÚLTIMOS";
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
    startTransition(async () => {
      try {
        await deletarEvento(mesaId, id);
      } catch (e) {
        Swal.fire({
          icon: "error",
          title: "Erro",
          text: e instanceof Error ? e.message : "Erro ao apagar.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      }
    });
  }

  return (
    <div className="cal-eventos-card">
      <div className="cal-eventos-header">
        <div className="cal-eventos-header-esq">
          <span className="cal-kicker">{isNarrador ? "PRÓXIMOS EVENTOS" : "DIÁRIO DE BORDO"}</span>
          <span className="cal-eventos-count">{exibidos.length}</span>
          <span className={"cal-visao-badge" + (isNarrador ? " narrador" : "")}>
            {isNarrador ? "VISÃO DO MESTRE" : "VISÃO DO JOGADOR"}
          </span>
        </div>
        {isNarrador && (
          <div>
            <button type="button" className="cal-btn-primary-sm" onClick={onNovo}>
              <i className="fas fa-plus" /> Adicionar evento
            </button>
          </div>
        )}
      </div>

      {!eventos.length ? (
        <div className="cal-empty">Nenhum evento por aqui ainda.</div>
      ) : exibidos.length === 0 ? (
        <div className="cal-empty">
          {isNarrador
            ? `Nenhum evento nos próximos ${janela} dias.`
            : `Nenhum evento nos últimos ${janela} dias.`}
        </div>
      ) : (
        <div className="cal-eventos-lista">
          {exibidos.map((ev) => {
            const futuro = ev.dataDias > dataAtualDias;
            const tipoClima = ev.tipoClimaId
              ? tiposClima.find((t) => t.id === ev.tipoClimaId)
              : null;
            const icone = ev.tipo === "climatico" ? tipoClima?.icone || "🌤️" : "📜";
            const data = dataParaDias(ev.dataDias, config);
            const rel = dataRelativa(ev.dataDias, dataAtualDias);
            const tipoLabel = ev.tipo === "climatico" ? "CLIMA" : "NARRATIVO";
            const tipoClass = ev.tipo === "climatico" ? "tipo-climatico" : "tipo-narrativo";

            const rowClasses = ["cal-evento-row"];
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
                    <span className="cal-evento-icone-inline">{icone}</span>
                    <span className="cal-evento-titulo">{ev.titulo}</span>
                  </div>
                  <div className="cal-evento-meta">
                    <span className={"cal-evento-tipo-tag " + tipoClass}>{tipoLabel}</span>
                    <span>
                      {data.nomeMes}, ano {data.ano}
                    </span>
                  </div>
                  {ev.descricao && <div className="cal-evento-descricao">{ev.descricao}</div>}
                </div>
                {ev.oculto ? (
                  <span className="cal-evento-oculto-tag">
                    <i className="fas fa-eye-slash" /> OCULTO
                  </span>
                ) : futuro ? (
                  <span className="cal-evento-status status-futuro">AGENDADO</span>
                ) : (
                  <span className="cal-evento-status status-visivel">VISÍVEL</span>
                )}
                {isNarrador && (
                  <div className="cal-evento-acoes">
                    <button
                      type="button"
                      className="cal-acao-btn"
                      onClick={() => onEditar(ev)}
                      title="Editar"
                    >
                      <i className="fas fa-edit" />
                    </button>
                    <button
                      type="button"
                      className="cal-acao-btn cal-acao-delete"
                      onClick={() => apagar(ev.id)}
                      title="Excluir"
                    >
                      <i className="fas fa-trash" />
                    </button>
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
          className="cal-eventos-expandir-btn"
          onClick={onToggleExpandir}
        >
          {expandido ? (
            <>
              <i className="fas fa-chevron-up" /> RECOLHER ({direcao} {JANELA_PADRAO} DIAS)
            </>
          ) : (
            <>
              <i className="fas fa-chevron-down" /> VER {direcao} {JANELA_EXPANDIDA} DIAS (+{restante})
            </>
          )}
        </button>
      )}
    </div>
  );
}
