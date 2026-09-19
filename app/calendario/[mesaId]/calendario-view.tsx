"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import {
  ANO_MAX,
  type CalendarioConfig,
  dataParaDias,
  diasMaximos,
  diasParaData,
  eventoVisivelPraJogador,
  fasesLua,
  mesesNaEstacao,
  posicaoMesNaEstacao,
} from "@/lib/calendario/engine";
import type { EventoCal, ObjetivoPrazo, TipoClima } from "./types";
import {
  atualizarEvento,
  atualizarTipoClima,
  criarEvento,
  criarTipoClima,
  deletarEvento,
  deletarTipoClima,
  setarDataAtual,
} from "./actions";
import { GridMensal } from "./grid-mensal";
import { IconeCal } from "./icones";
import { ListaEventos } from "./lista-eventos";
import { PrazosCard } from "./prazos-card";
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
  /** Prazos de objetivo já filtrados no servidor por quem pode ver. */
  objetivos: ObjetivoPrazo[];
};

export function CalendarioView({
  mesaId,
  isNarrador,
  config,
  dataAtualDias,
  eventos,
  tiposClima,
  objetivos,
}: Props) {
  const [, startTransition] = useTransition();

  // Optimistic: clique no narrador atualiza UI no mesmo frame; quando o server
  // responde + realtime/revalidate atualizam a prop, o estado otimista reseta.
  const [dataAtualOtimista, setDataAtualOtimista] = useOptimistic(
    dataAtualDias,
    (_state, novoValor: number) => novoValor,
  );

  // Lista otimista de eventos. Aceita 3 tipos de patch:
  //  - create: insere com id temporário (vai ser sobrescrito quando o real chegar)
  //  - update: aplica patch parcial num evento existente
  //  - delete: remove pelo id
  type PatchEvento =
    | { kind: "create"; evento: EventoCal }
    | { kind: "update"; id: string; patch: Partial<EventoCal> }
    | { kind: "delete"; id: string };
  const [eventosOtimistas, aplicarPatchEvento] = useOptimistic(
    eventos,
    (state, p: PatchEvento) => {
      if (p.kind === "create") return [...state, p.evento];
      if (p.kind === "update") return state.map((e) => (e.id === p.id ? { ...e, ...p.patch } : e));
      return state.filter((e) => e.id !== p.id);
    },
  );

  type PatchTipoClima =
    | { kind: "create"; tipo: TipoClima }
    | { kind: "update"; id: string; patch: Partial<TipoClima> }
    | { kind: "delete"; id: string };
  const [tiposClimaOtimistas, aplicarPatchTipoClima] = useOptimistic(
    tiposClima,
    (state, p: PatchTipoClima) => {
      if (p.kind === "create") return [...state, p.tipo];
      if (p.kind === "update") return state.map((t) => (t.id === p.id ? { ...t, ...p.patch } : t));
      return state.filter((t) => t.id !== p.id);
    },
  );

  // Helper centralizado pra erros de action — todos os handlers reportam igual.
  function mostrarErro(e: unknown) {
    Swal.fire({
      icon: "error",
      title: "Erro",
      text: e instanceof Error ? e.message : "Erro inesperado.",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
  }

  // ─── Handlers expostos pros modais e lista ────────────────────────────
  type EventoPayload = {
    tipo: "climatico" | "narrativo";
    titulo: string;
    descricao: string | null;
    dataDias: number;
    tipoClimaId: string | null;
    oculto: boolean;
  };

  function onSalvarEvento(payload: EventoPayload, id: string | null) {
    startTransition(async () => {
      if (id) {
        aplicarPatchEvento({ kind: "update", id, patch: payload });
        try {
          await atualizarEvento(mesaId, id, payload);
        } catch (e) {
          mostrarErro(e);
        }
      } else {
        const tempId = "temp-" + Math.random().toString(36).slice(2);
        aplicarPatchEvento({ kind: "create", evento: { id: tempId, ...payload } });
        try {
          await criarEvento(mesaId, payload);
        } catch (e) {
          mostrarErro(e);
        }
      }
    });
  }

  function onApagarEvento(id: string) {
    startTransition(async () => {
      aplicarPatchEvento({ kind: "delete", id });
      try {
        await deletarEvento(mesaId, id);
      } catch (e) {
        mostrarErro(e);
      }
    });
  }

  type TipoClimaPayload = {
    nome: string;
    descricao: string | null;
    icone: string | null;
    pesosPorEstacao: Record<string, number>;
  };

  function onCriarTipoClima(payload: TipoClimaPayload) {
    startTransition(async () => {
      const tempId = "temp-" + Math.random().toString(36).slice(2);
      aplicarPatchTipoClima({ kind: "create", tipo: { id: tempId, ...payload } });
      try {
        await criarTipoClima(mesaId, payload);
      } catch (e) {
        mostrarErro(e);
      }
    });
  }

  function onPatchTipoClima(id: string, patch: Partial<TipoClima>) {
    startTransition(async () => {
      aplicarPatchTipoClima({ kind: "update", id, patch });
      try {
        await atualizarTipoClima(mesaId, id, {
          nome: patch.nome,
          descricao: patch.descricao,
          icone: patch.icone,
          pesosPorEstacao: patch.pesosPorEstacao,
        });
      } catch (e) {
        mostrarErro(e);
      }
    });
  }

  function onApagarTipoClima(id: string) {
    startTransition(async () => {
      aplicarPatchTipoClima({ kind: "delete", id });
      try {
        await deletarTipoClima(mesaId, id);
      } catch (e) {
        mostrarErro(e);
      }
    });
  }

  const hoje = useMemo(
    () => dataParaDias(dataAtualOtimista, config),
    [dataAtualOtimista, config],
  );

  // Estado do mês visualizado no grid (inicia no mês atual).
  const [mesVisao, setMesVisao] = useState<{ ano: number; mes: number }>({
    ano: hoje.ano,
    mes: hoje.mes,
  });

  // Modais
  const [modalEvento, setModalEvento] = useState<{
    aberto: boolean;
    evento: EventoCal | null;
    dataDias: number | null;
  }>({ aberto: false, evento: null, dataDias: null });
  const [modalConfigAberto, setModalConfigAberto] = useState(false);
  const [modalTiposAberto, setModalTiposAberto] = useState(false);
  const [modalGerarAberto, setModalGerarAberto] = useState(false);

  // Lista expandida (6 → 30 dias)
  const [expandido, setExpandido] = useState(false);

  // Prévia "ver como jogador": `comoNarrador` é o papel efetivo, `isNarrador` o real.
  const [verComoJogador, setVerComoJogador] = useState(false);
  const comoNarrador = isNarrador && !verComoJogador;

  function alternarPrevia() {
    setModalEvento({ aberto: false, evento: null, dataDias: null });
    setModalConfigAberto(false);
    setModalTiposAberto(false);
    setModalGerarAberto(false);
    setVerComoJogador((v) => !v);
  }

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
  const lua = fasesLua(dataAtualOtimista, config.cicloLuaDias);
  const ciclo = config.cicloLuaDias || 29.5;
  const diaCiclo = Math.floor(lua.fracao * ciclo) + 1;

  // Mesmo filtro do loader, refeito no cliente pra prévia.
  const eventosVisiveis = comoNarrador
    ? eventosOtimistas
    : eventosOtimistas.filter((e) => eventoVisivelPraJogador(e, dataAtualOtimista));

  // Objetivo é pessoal; a prévia não é de nenhum jogador específico.
  const objetivosVisiveis = verComoJogador ? [] : objetivos;

  // Clima de hoje
  const climaHoje = eventosVisiveis.find(
    (e) => e.dataDias === dataAtualOtimista && e.tipo === "climatico",
  );
  const tipoClimaHoje = climaHoje?.tipoClimaId
    ? tiposClimaOtimistas.find((t) => t.id === climaHoje.tipoClimaId)
    : null;

  const maxDias = useMemo(() => diasMaximos(config), [config]);

  function avancarDias(delta: number) {
    const alvo = Math.max(0, Math.min(dataAtualOtimista + delta, maxDias));
    if (alvo === dataAtualOtimista) return;
    startTransition(async () => {
      setDataAtualOtimista(alvo);
      try {
        await setarDataAtual(mesaId, alvo);
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
    if (hoje.ano > ANO_MAX) return;
    const novosDias = Math.min(
      diasParaData({ ano: hoje.ano, mes: hoje.mes, dia: novoDia }, config),
      maxDias,
    );
    startTransition(async () => {
      setDataAtualOtimista(novosDias);
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

  const noMesDeHoje = mesVisao.ano === hoje.ano && mesVisao.mes === hoje.mes;

  return (
    <>
      {verComoJogador && (
        <div className="cal-previa-faixa" role="status">
          <span className="cal-previa-icone">
            <i className="fas fa-eye" />
          </span>
          <div className="cal-previa-texto">
            <strong>Prévia: é isto que um jogador vê.</strong>
            <span>
              Eventos ocultos e os que ainda não chegaram somem, e os prazos de
              objetivo também — cada jogador enxerga só os do próprio personagem.
            </span>
          </div>
          <button type="button" className="btn-rect neutro sm" onClick={alternarPrevia}>
            <i className="fas fa-xmark" /> Sair da prévia
          </button>
        </div>
      )}

      <div className="cal-card">
        <div className="cal-header-row1">
          <div className="cal-header-titulo">
            <span className="cal-kicker">Mês em exibição</span>
            <div className="cal-header-mes-nav">
              <button
                type="button"
                className="cal-nav-btn"
                onClick={() => mudarMes(-1)}
                title="Mês anterior"
                aria-label="Mês anterior"
              >
                <i className="fas fa-chevron-left" />
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
                aria-label="Próximo mês"
              >
                <i className="fas fa-chevron-right" />
              </button>
            </div>
          </div>
          <div className="cal-header-acoes">
            <button
              type="button"
              className="btn-rect neutro sm"
              onClick={irPraHoje}
              disabled={noMesDeHoje}
              title={noMesDeHoje ? "Já está no mês atual" : "Voltar pro mês atual"}
            >
              <i className="fas fa-location-crosshairs" /> Hoje
            </button>
            {isNarrador && (
              <div className="cal-header-narrador-btns">
                <button
                  type="button"
                  className={"cal-icon-btn" + (verComoJogador ? " ativo" : "")}
                  onClick={alternarPrevia}
                  aria-pressed={verComoJogador}
                  title={
                    verComoJogador
                      ? "Voltar pra visão do narrador"
                      : "Ver o calendário como um jogador vê"
                  }
                  aria-label={
                    verComoJogador
                      ? "Voltar pra visão do narrador"
                      : "Ver o calendário como um jogador vê"
                  }
                >
                  <i className={verComoJogador ? "fas fa-eye-slash" : "fas fa-eye"} />
                </button>
              </div>
            )}
            {comoNarrador && (
              <div className="cal-header-narrador-btns">
                <button
                  type="button"
                  className="cal-icon-btn"
                  onClick={() => avancarDias(-1)}
                  title="Voltar um dia na mesa"
                  aria-label="Voltar um dia na mesa"
                >
                  <i className="fas fa-backward-step" />
                </button>
                <button
                  type="button"
                  className="cal-icon-btn"
                  onClick={() => avancarDias(+1)}
                  title="Avançar um dia na mesa"
                  aria-label="Avançar um dia na mesa"
                >
                  <i className="fas fa-forward-step" />
                </button>
                <button
                  type="button"
                  className="cal-icon-btn"
                  onClick={() => setModalConfigAberto(true)}
                  title="Configurar calendário"
                  aria-label="Configurar calendário"
                >
                  <i className="fas fa-gear" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="cal-header-chips">
          <div className="cal-today-chip cal-chip-tint-hoje">
            <span className="cal-chip-kicker">Hoje</span>
            <div className="cal-chip-main">
              Dia{" "}
              {editandoDia && comoNarrador ? (
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
                  className={comoNarrador ? "editable-num" : undefined}
                  onClick={comoNarrador ? () => setEditandoDia(true) : undefined}
                >
                  {hoje.dia}
                </span>
              )}
            </div>
            <div className="cal-chip-sub">{hoje.nomeMes}</div>
          </div>
          <div className="cal-today-chip">
            <span className="cal-chip-kicker">Dia da semana</span>
            <div className="cal-chip-main">{hoje.diaSemana}</div>
            <div className="cal-chip-sub">
              {hoje.nomeMes}, ano {hoje.ano}
            </div>
          </div>
          <div className="cal-today-chip cal-chip-tint-estacao">
            <span className="cal-chip-kicker">Estação</span>
            <div className="cal-chip-main">{hoje.estacao}</div>
            <div className="cal-chip-sub">{estacaoSub}</div>
          </div>
          <div className="cal-today-chip cal-chip-tint-lua">
            <span className="cal-chip-kicker">Lua</span>
            <div className="cal-chip-main">
              <IconeCal icone={lua.icone} /> <span>{lua.nome}</span>
            </div>
            <div className="cal-chip-sub">
              {diaCiclo}/{Math.round(ciclo)}
            </div>
          </div>
          <div className="cal-today-chip cal-chip-tint-clima">
            <span className="cal-chip-kicker">Clima</span>
            <div className="cal-chip-main">
              {climaHoje ? (
                <>
                  <IconeCal icone={tipoClimaHoje?.icone} fallback="fa-cloud-sun" />
                  <span>{climaHoje.titulo}</span>
                </>
              ) : (
                <span>Sem registro</span>
              )}
            </div>
            <div className="cal-chip-sub">
              {tipoClimaHoje?.nome ||
                (comoNarrador ? "gere ou registre um evento" : "nada registrado hoje")}
            </div>
          </div>
        </div>
      </div>

      <GridMensal
        config={config}
        dataAtualDias={dataAtualOtimista}
        mesVisao={mesVisao}
        eventos={eventosVisiveis}
        tiposClima={tiposClimaOtimistas}
        objetivos={objetivosVisiveis}
        isNarrador={comoNarrador}
        onNovoEventoNoDia={(dias) =>
          setModalEvento({ aberto: true, evento: null, dataDias: dias })
        }
        onClickDia={(dias) => {
          if (!comoNarrador) return;
          if (dias === dataAtualOtimista) return;
          startTransition(async () => {
            setDataAtualOtimista(dias);
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
        config={config}
        dataAtualDias={dataAtualOtimista}
        eventos={eventosVisiveis}
        tiposClima={tiposClimaOtimistas}
        isNarrador={comoNarrador}
        expandido={expandido}
        onToggleExpandir={() => setExpandido((v) => !v)}
        onNovo={() => setModalEvento({ aberto: true, evento: null, dataDias: null })}
        onEditar={(ev) => setModalEvento({ aberto: true, evento: ev, dataDias: null })}
        onApagar={onApagarEvento}
      />

      <PrazosCard
        config={config}
        dataAtualDias={dataAtualOtimista}
        objetivos={objetivosVisiveis}
        mostrarDono={comoNarrador}
      />

      {comoNarrador && (
        <GeradorClimaCard
          estacao={hoje.estacao}
          totalTipos={tiposClima.length}
          onGerar={() => setModalGerarAberto(true)}
          onEditarPerfil={() => setModalTiposAberto(true)}
        />
      )}

      {/* Modais */}
      {comoNarrador && modalEvento.aberto && (
        <ModalEvento
          config={config}
          tiposClima={tiposClimaOtimistas}
          eventoInicial={modalEvento.evento}
          dataAtualDias={modalEvento.dataDias ?? dataAtualOtimista}
          onFechar={() => setModalEvento({ aberto: false, evento: null, dataDias: null })}
          onSalvar={onSalvarEvento}
        />
      )}
      {comoNarrador && modalConfigAberto && (
        <ModalConfig
          mesaId={mesaId}
          config={config}
          dataAtualDias={dataAtualOtimista}
          onFechar={() => setModalConfigAberto(false)}
        />
      )}
      {comoNarrador && modalTiposAberto && (
        <ModalTiposClima
          config={config}
          tiposClima={tiposClimaOtimistas}
          onFechar={() => setModalTiposAberto(false)}
          onCriar={onCriarTipoClima}
          onPatch={onPatchTipoClima}
          onApagar={onApagarTipoClima}
        />
      )}
      {comoNarrador && modalGerarAberto && (
        <ModalGerarClima
          mesaId={mesaId}
          config={config}
          dataAtualDias={dataAtualOtimista}
          onFechar={() => setModalGerarAberto(false)}
        />
      )}
    </>
  );
}
