"use client";

import { useMemo, useState, useTransition } from "react";
import Swal from "sweetalert2";
import {
  type CalendarioConfig,
  dataParaDias,
  diasParaData,
  fasesLua,
  mesesNaEstacao,
  posicaoMesNaEstacao,
} from "@/lib/calendario/engine";
import type { EventoCal, TipoClima } from "./types";
import { setarDataAtual } from "./actions";
import { GridMensal } from "./grid-mensal";
import { ListaEventos } from "./lista-eventos";
import { GeradorClimaCard } from "./gerador-card";
import { ModalEvento } from "./modal-evento";
import { ModalConfig } from "./modal-config";
import { ModalTiposClima } from "./modal-tipos-clima";
import { ModalGerarClima } from "./modal-gerar-clima";

type Props = {
  mesaId: string;
  isNarrador: boolean;
  config: CalendarioConfig;
  dataAtualDias: number;
  eventos: EventoCal[];
  tiposClima: TipoClima[];
};

export function CalendarioView({
  mesaId,
  isNarrador,
  config,
  dataAtualDias,
  eventos,
  tiposClima,
}: Props) {
  const [, startTransition] = useTransition();

  const hoje = useMemo(() => dataParaDias(dataAtualDias, config), [dataAtualDias, config]);

  // Estado do mês visualizado no grid (inicia no mês atual).
  const [mesVisao, setMesVisao] = useState<{ ano: number; mes: number }>({
    ano: hoje.ano,
    mes: hoje.mes,
  });

  // Modais
  const [modalEvento, setModalEvento] = useState<{ aberto: boolean; evento: EventoCal | null }>({
    aberto: false,
    evento: null,
  });
  const [modalConfigAberto, setModalConfigAberto] = useState(false);
  const [modalTiposAberto, setModalTiposAberto] = useState(false);
  const [modalGerarAberto, setModalGerarAberto] = useState(false);

  // Lista expandida (6 → 30 dias)
  const [expandido, setExpandido] = useState(false);

  // Edição inline do dia atual (só narrador)
  const [editandoDia, setEditandoDia] = useState(false);

  // Sub do chip estação
  const estacaoAtual = config.estacoes.find((e) => e.nome === hoje.estacao);
  let estacaoSub = "—";
  if (estacaoAtual) {
    const total = mesesNaEstacao(estacaoAtual, config.meses.length);
    const pos = posicaoMesNaEstacao(hoje.mes, estacaoAtual, config.meses.length);
    estacaoSub = `mês ${pos}/${total}`;
  }

  // Lua
  const lua = fasesLua(dataAtualDias, config.cicloLuaDias);
  const ciclo = config.cicloLuaDias || 29.5;
  const diaCiclo = Math.floor(lua.fracao * ciclo) + 1;

  // Clima de hoje
  const climaHoje = eventos.find((e) => e.dataDias === dataAtualDias && e.tipo === "climatico");
  const tipoClimaHoje = climaHoje?.tipoClimaId
    ? tiposClima.find((t) => t.id === climaHoje.tipoClimaId)
    : null;

  function avancarDias(delta: number) {
    startTransition(async () => {
      try {
        await setarDataAtual(mesaId, dataAtualDias + delta);
      } catch (e) {
        Swal.fire({
          icon: "error",
          title: "Erro",
          text: e instanceof Error ? e.message : "Erro ao mudar a data.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      }
    });
  }

  function salvarDiaInline(entrada: string) {
    setEditandoDia(false);
    const valor = entrada.trim();
    if (!valor) return;
    if (valor.startsWith("+") || valor.startsWith("-")) {
      const delta = Number(valor);
      if (Number.isFinite(delta)) avancarDias(delta);
      return;
    }
    let novoDia = Number(valor);
    if (!Number.isFinite(novoDia) || novoDia < 1) return;
    const diasMes = config.meses[hoje.mes - 1].dias;
    if (novoDia > diasMes) novoDia = diasMes;
    const novosDias = diasParaData({ ano: hoje.ano, mes: hoje.mes, dia: novoDia }, config);
    startTransition(async () => {
      try {
        await setarDataAtual(mesaId, novosDias);
      } catch (e) {
        Swal.fire({
          icon: "error",
          title: "Erro",
          text: e instanceof Error ? e.message : "Erro ao salvar a data.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      }
    });
  }

  function mudarMes(delta: number) {
    let mes = mesVisao.mes + delta;
    let ano = mesVisao.ano;
    if (mes < 1) {
      mes = config.meses.length;
      ano -= 1;
    }
    if (mes > config.meses.length) {
      mes = 1;
      ano += 1;
    }
    setMesVisao({ ano, mes });
  }

  function irPraHoje() {
    setMesVisao({ ano: hoje.ano, mes: hoje.mes });
  }

  return (
    <>
      <div className="cal-header-card">
        <div className="cal-header-row1">
          <div className="cal-header-titulo">
            <span className="cal-kicker">CALENDÁRIO</span>
            <div className="cal-header-mes-nav">
              <button
                type="button"
                className="cal-nav-btn"
                onClick={() => mudarMes(-1)}
                title="Mês anterior"
              >
                ◁
              </button>
              <h2 className="cal-mes-visao">
                <span>{config.meses[mesVisao.mes - 1]?.nome || "?"}</span>
                <span className="cal-mes-visao-ano">Ano {mesVisao.ano}</span>
              </h2>
              <button
                type="button"
                className="cal-nav-btn"
                onClick={() => mudarMes(+1)}
                title="Próximo mês"
              >
                ▷
              </button>
            </div>
          </div>
          <div className="cal-header-acoes">
            <button type="button" className="cal-hoje-btn" onClick={irPraHoje} title="Ir pro mês atual">
              HOJE
            </button>
            {isNarrador && (
              <div className="cal-header-narrador-btns">
                <button
                  type="button"
                  className="cal-icon-btn"
                  onClick={() => avancarDias(-1)}
                  title="Voltar um dia"
                >
                  <i className="fas fa-backward-step" />
                </button>
                <button
                  type="button"
                  className="cal-icon-btn"
                  onClick={() => avancarDias(+1)}
                  title="Avançar um dia"
                >
                  <i className="fas fa-forward-step" />
                </button>
                <button
                  type="button"
                  className="cal-icon-btn"
                  onClick={() => setModalConfigAberto(true)}
                  title="Configurar calendário"
                >
                  <i className="fas fa-gear" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="cal-header-chips">
          <div className="cal-today-chip">
            <span className="cal-chip-kicker">HOJE</span>
            <div className="cal-chip-main">
              Dia{" "}
              {editandoDia && isNarrador ? (
                <input
                  type="text"
                  autoFocus
                  defaultValue=""
                  placeholder={String(hoje.dia)}
                  className="input-edit-stat"
                  onBlur={(e) => salvarDiaInline(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditandoDia(false);
                  }}
                />
              ) : (
                <span
                  className={isNarrador ? "editable-num" : undefined}
                  onClick={isNarrador ? () => setEditandoDia(true) : undefined}
                >
                  {hoje.dia}
                </span>
              )}
            </div>
            <div className="cal-chip-sub">{hoje.nomeMes}</div>
          </div>
          <div className="cal-today-chip">
            <span className="cal-chip-kicker">DIA DA SEMANA</span>
            <div className="cal-chip-main">{hoje.diaSemana}</div>
            <div className="cal-chip-sub">Ano {hoje.ano}</div>
          </div>
          <div className="cal-today-chip cal-chip-tint-estacao">
            <span className="cal-chip-kicker">ESTAÇÃO</span>
            <div className="cal-chip-main">{hoje.estacao}</div>
            <div className="cal-chip-sub">{estacaoSub}</div>
          </div>
          <div className="cal-today-chip cal-chip-tint-lua">
            <span className="cal-chip-kicker">LUA</span>
            <div className="cal-chip-main">
              <span>{lua.emoji}</span> <span>{lua.nome}</span>
            </div>
            <div className="cal-chip-sub">
              {diaCiclo}/{Math.round(ciclo)}
            </div>
          </div>
          <div className="cal-today-chip cal-chip-tint-clima">
            <span className="cal-chip-kicker">CLIMA</span>
            <div className="cal-chip-main">
              {climaHoje ? (
                <>
                  <span>{tipoClimaHoje?.icone || "🌤️"}</span> {climaHoje.titulo}
                </>
              ) : (
                "—"
              )}
            </div>
            <div className="cal-chip-sub">{tipoClimaHoje?.nome || "sem registro"}</div>
          </div>
        </div>
      </div>

      <GridMensal
        config={config}
        dataAtualDias={dataAtualDias}
        mesVisao={mesVisao}
        eventos={eventos}
        tiposClima={tiposClima}
        isNarrador={isNarrador}
        onClickDia={(dias) => {
          if (!isNarrador) return;
          if (dias === dataAtualDias) return;
          startTransition(async () => {
            try {
              await setarDataAtual(mesaId, dias);
            } catch (e) {
              Swal.fire({
                icon: "error",
                title: "Erro",
                text: e instanceof Error ? e.message : "Erro ao mudar a data.",
                background: "var(--bg-card)",
                color: "var(--text-main)",
              });
            }
          });
        }}
      />

      <ListaEventos
        mesaId={mesaId}
        config={config}
        dataAtualDias={dataAtualDias}
        eventos={eventos}
        tiposClima={tiposClima}
        isNarrador={isNarrador}
        expandido={expandido}
        onToggleExpandir={() => setExpandido((v) => !v)}
        onNovo={() => setModalEvento({ aberto: true, evento: null })}
        onEditar={(ev) => setModalEvento({ aberto: true, evento: ev })}
      />

      {isNarrador && (
        <GeradorClimaCard
          estacao={hoje.estacao}
          totalTipos={tiposClima.length}
          onGerar={() => setModalGerarAberto(true)}
          onEditarPerfil={() => setModalTiposAberto(true)}
        />
      )}

      {/* Modais */}
      {isNarrador && modalEvento.aberto && (
        <ModalEvento
          mesaId={mesaId}
          config={config}
          tiposClima={tiposClima}
          eventoInicial={modalEvento.evento}
          dataAtualDias={dataAtualDias}
          onFechar={() => setModalEvento({ aberto: false, evento: null })}
        />
      )}
      {isNarrador && modalConfigAberto && (
        <ModalConfig
          mesaId={mesaId}
          config={config}
          dataAtualDias={dataAtualDias}
          onFechar={() => setModalConfigAberto(false)}
        />
      )}
      {isNarrador && modalTiposAberto && (
        <ModalTiposClima
          mesaId={mesaId}
          config={config}
          tiposClima={tiposClima}
          onFechar={() => setModalTiposAberto(false)}
        />
      )}
      {isNarrador && modalGerarAberto && (
        <ModalGerarClima
          mesaId={mesaId}
          config={config}
          dataAtualDias={dataAtualDias}
          onFechar={() => setModalGerarAberto(false)}
        />
      )}
    </>
  );
}
