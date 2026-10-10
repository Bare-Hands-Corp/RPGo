"use client";

import { useCallback, useEffect, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Swal from "sweetalert2";
import { createClient } from "@/lib/supabase/client";
import { useRefreshAgrupado } from "@/lib/use-refresh-agrupado";
import type { Resultado } from "@/lib/acoes";
import { type CalendarioConfig, dataParaDias, diasMaximos } from "@/lib/calendario/engine";
import {
  VELOCIDADES,
  type AjusteRelogio,
  type RelogioSerializado,
  formatarDelta,
  formatarHora,
  iconePeriodo,
  lerDelta,
  lerHorario,
  relogioEfetivo,
  somarTempo,
} from "@/lib/calendario/relogio";
import {
  ajustarRelogio,
  alternarTempoReal,
  definirFormatoRelogio,
  definirHorario,
  definirVelocidadeRelogio,
  sincronizarRelogio,
} from "./actions";

// ─── Hora corrente ───────────────────────────────────────────────
// Diferença entre o relógio do servidor e o do navegador. Cada render do
// servidor traz uma estimativa que só pode estar atrasada (latência), então
// fica a maior.
let offsetServidorMs: number | null = null;

function registrarAgoraServidor(ms: number) {
  const estimativa = ms - Date.now();
  offsetServidorMs = offsetServidorMs === null ? estimativa : Math.max(offsetServidorMs, estimativa);
}

function agoraServidor() {
  return Date.now() + (offsetServidorMs ?? 0);
}

// Hora efetiva do relógio; com o tempo real ligado, re-renderiza a cada segundo.
export function useHoraMesa(relogio: RelogioSerializado, maxDias: number) {
  const rodando = relogio.rodandoDesdeMs !== null;

  useEffect(() => {
    registrarAgoraServidor(relogio.agoraServidorMs);
  }, [relogio.agoraServidorMs]);

  const assinar = useCallback(
    (avisar: () => void) => {
      if (!rodando) return () => {};
      const id = setInterval(avisar, 1000);
      return () => clearInterval(id);
    },
    [rodando],
  );
  // Segundo cheio: o snapshot fica estável dentro do mesmo segundo.
  const agora = useSyncExternalStore(
    assinar,
    () => (rodando ? Math.floor(agoraServidor() / 1000) * 1000 : relogio.agoraServidorMs),
    () => relogio.agoraServidorMs,
  );

  return { ...relogioEfetivo(relogio, agora, maxDias), rodando };
}

// ─── Chip sempre visível + aviso pra mesa ────────────────────────
type Aviso = { chave: string; hora: string; data: string | null };

export function RelogioMesa({
  mesaId,
  relogio,
  config,
  dataAtualDias,
  isNarrador,
}: {
  mesaId: string;
  relogio: RelogioSerializado;
  config: CalendarioConfig;
  /** Dia efetivo que a página carregou; se o relógio passar dele, a página se atualiza. */
  dataAtualDias: number;
  isNarrador: boolean;
}) {
  const maxDias = diasMaximos(config);
  const hora = useHoraMesa(relogio, maxDias);
  const data = dataParaDias(hora.dias, config);
  const refresh = useRefreshAgrupado();
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // Tempo real passou da meia-noite: o narrador grava o dia novo (o realtime
  // atualiza a mesa); os outros só recarregam, que o servidor já calcula o dia.
  const viradaPedida = useRef<number | null>(null);
  useEffect(() => {
    if (!hora.rodando || hora.dias === dataAtualDias || viradaPedida.current === hora.dias) return;
    viradaPedida.current = hora.dias;
    if (isNarrador) void sincronizarRelogio(mesaId);
    else refresh();
  }, [hora.rodando, hora.dias, dataAtualDias, isNarrador, mesaId, refresh]);

  // Os valores de agora ficam em ref pro callback do realtime não re-assinar o canal.
  const atual = useRef({ dias: hora.dias, config, formato12h: relogio.formato12h });
  useEffect(() => {
    atual.current = { dias: hora.dias, config, formato12h: relogio.formato12h };
  });
  const ultimoAjusteId = useRef(relogio.ultimoAjuste?.id ?? null);
  const timerAviso = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`relogio-${mesaId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calendarios", filter: `mesa_id=eq.${mesaId}` },
        (payload) => {
          const ajuste = (payload.new as { ultimo_ajuste_relogio?: AjusteRelogio | null })
            .ultimo_ajuste_relogio;
          if (!ajuste || ajuste.id === ultimoAjusteId.current) return;
          ultimoAjusteId.current = ajuste.id;
          // Evento atrasado (aba dormindo) não vira aviso.
          if (Date.now() - Date.parse(ajuste.em) > 60_000 + Math.abs(offsetServidorMs ?? 0)) return;

          const { dias, config: cfg, formato12h } = atual.current;
          const d = dataParaDias(ajuste.dias, cfg);
          setAviso({
            chave: ajuste.id,
            hora: formatarHora(ajuste.segundo, { formato12h }),
            data: ajuste.dias !== dias ? `${d.dia} de ${d.nomeMes}` : null,
          });
          if (timerAviso.current) clearTimeout(timerAviso.current);
          timerAviso.current = setTimeout(() => setAviso(null), 5000);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timerAviso.current) clearTimeout(timerAviso.current);
    };
  }, [mesaId]);

  const textoHora = formatarHora(hora.segundo, { formato12h: relogio.formato12h });
  const titulo =
    `${data.diaSemana}, ${data.dia} de ${data.nomeMes}, ano ${data.ano} · ${textoHora}` +
    (hora.rodando
      ? ` · tempo real${relogio.velocidade !== 1 ? ` ×${relogio.velocidade}` : ""}`
      : "");

  return (
    <>
      <div className={"relogio-chip" + (hora.rodando ? " rodando" : "")} title={titulo}>
        <i className={`fas ${iconePeriodo(hora.segundo)} relogio-chip-icone`} aria-hidden />
        <strong className="relogio-chip-hora" aria-label={`Hora na campanha: ${textoHora}`}>
          {textoHora}
        </strong>
        <span className="relogio-chip-data">
          {data.dia} {data.nomeMes.slice(0, 3)}
        </span>
        {hora.rodando && <span className="relogio-chip-vivo" aria-label="Tempo real ligado" />}
      </div>

      {aviso && (
        <div key={aviso.chave} className="relogio-aviso" role="status" aria-live="polite">
          <i className="fas fa-hourglass-half relogio-aviso-icone" aria-hidden />
          <div>
            <span className="relogio-aviso-texto">Você sente o tempo passar</span>
            <strong className="relogio-aviso-hora">
              {aviso.hora}
              {aviso.data && <small> · {aviso.data}</small>}
            </strong>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Controles do narrador ───────────────────────────────────────
const PRESETS = [10 * 60, 20 * 60, 30 * 60, 60 * 60];

type AcaoOtimista =
  | { tipo: "delta"; delta: number }
  | { tipo: "definir"; segundo: number }
  | { tipo: "rodando"; rodando: boolean }
  | { tipo: "velocidade"; velocidade: number }
  | { tipo: "formato"; formato12h: boolean };

export function RelogioControles({
  mesaId,
  relogio,
  config,
  compacto = false,
}: {
  mesaId: string;
  relogio: RelogioSerializado;
  config: CalendarioConfig;
  compacto?: boolean;
}) {
  const maxDias = diasMaximos(config);
  const [, startTransition] = useTransition();

  // Toda mudança fixa a hora já andada como nova base, igual ao servidor.
  const [otimista, aplicar] = useOptimistic(relogio, (r, a: AcaoOtimista): RelogioSerializado => {
    const agora = agoraServidor();
    const atual = relogioEfetivo(r, agora, maxDias);
    const base = { ...r, ...atual, rodandoDesdeMs: r.rodandoDesdeMs === null ? null : agora };
    switch (a.tipo) {
      case "delta":
        return { ...base, ...somarTempo(atual.dias, atual.segundo, a.delta, maxDias) };
      case "definir":
        return { ...base, segundo: a.segundo };
      case "rodando":
        return { ...base, rodandoDesdeMs: a.rodando ? agora : null };
      case "velocidade":
        return { ...base, velocidade: a.velocidade };
      case "formato":
        return { ...base, formato12h: a.formato12h };
    }
  });
  const hora = useHoraMesa(otimista, maxDias);
  const data = dataParaDias(hora.dias, config);
  const fmt = { formato12h: otimista.formato12h };

  const [entradaDelta, setEntradaDelta] = useState("");
  const [entradaHorario, setEntradaHorario] = useState("");

  function executar(acao: AcaoOtimista, chamada: () => Promise<Resultado>) {
    startTransition(async () => {
      aplicar(acao);
      try {
        const r = await chamada();
        if (!r.ok) mostrarErro(r.erro);
      } catch {
        mostrarErro("Falha de conexão com o servidor. Tenta de novo.");
      }
    });
  }

  const somar = (delta: number) => executar({ tipo: "delta", delta }, () => ajustarRelogio(mesaId, delta));
  const alternar = () =>
    executar({ tipo: "rodando", rodando: !hora.rodando }, () => alternarTempoReal(mesaId, !hora.rodando));

  function enviarDelta(e: React.FormEvent) {
    e.preventDefault();
    const delta = lerDelta(entradaDelta);
    if (delta === null) return mostrarErro('Use algo como "45", "+1:30", "-2h" ou "1h15".');
    setEntradaDelta("");
    somar(delta);
  }

  function enviarHorario(e: React.FormEvent) {
    e.preventDefault();
    const segundo = lerHorario(entradaHorario);
    if (segundo === null) return mostrarErro('Use algo como "18:00", "7h30" ou "6:30 pm".');
    setEntradaHorario("");
    executar({ tipo: "definir", segundo }, () => definirHorario(mesaId, segundo));
  }

  const botaoTempoReal = (
    <button
      type="button"
      className={"relogio-play" + (hora.rodando ? " ativo" : "")}
      onClick={alternar}
      aria-pressed={hora.rodando}
      title={hora.rodando ? "Pausar o tempo real" : "Ligar o tempo real: o relógio anda sozinho"}
    >
      <i className={`fas ${hora.rodando ? "fa-pause" : "fa-play"}`} />
      {!compacto && <span>{hora.rodando ? "Pausar" : "Tempo real"}</span>}
    </button>
  );

  if (compacto) {
    return (
      <div className="relogio-compacto">
        <div className="relogio-compacto-hora">
          <i className={`fas ${iconePeriodo(hora.segundo)}`} aria-hidden />
          <strong>{formatarHora(hora.segundo, { ...fmt, segundos: hora.rodando })}</strong>
          {hora.rodando && (
            <span className="relogio-status-vivo">
              tempo real{otimista.velocidade !== 1 && ` ×${otimista.velocidade}`}
            </span>
          )}
          {botaoTempoReal}
        </div>
        <div className="relogio-presets">
          <button type="button" onClick={() => somar(-10 * 60)} title="Voltar 10 minutos">
            −10m
          </button>
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => somar(p)} title={`Avançar ${formatarDelta(p).slice(1)}`}>
              {rotuloPreset(p)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="cal-card relogio-card">
      <div className="relogio-card-topo">
        <div>
          <span className="cal-kicker">Relógio da mesa</span>
          <div className="relogio-display">
            <i className={`fas ${iconePeriodo(hora.segundo)}`} aria-hidden />
            <strong>{formatarHora(hora.segundo, { ...fmt, segundos: hora.rodando })}</strong>
          </div>
          <span className="relogio-display-sub">
            {data.diaSemana}, {data.dia} de {data.nomeMes} ·{" "}
            {hora.rodando ? (
              <span className="relogio-status-vivo">
                tempo real{otimista.velocidade !== 1 && ` ×${otimista.velocidade}`}
              </span>
            ) : (
              "pausado"
            )}
          </span>
        </div>
        <div className="relogio-card-acoes">
          <div className="relogio-segmentado" role="group" aria-label="Formato da hora">
            {[false, true].map((doze) => (
              <button
                key={String(doze)}
                type="button"
                className={otimista.formato12h === doze ? "ativo" : ""}
                aria-pressed={otimista.formato12h === doze}
                onClick={() =>
                  otimista.formato12h !== doze &&
                  executar({ tipo: "formato", formato12h: doze }, () => definirFormatoRelogio(mesaId, doze))
                }
              >
                {doze ? "12h" : "24h"}
              </button>
            ))}
          </div>
          {botaoTempoReal}
        </div>
      </div>

      <div className="relogio-linhas">
        <div className="relogio-presets" role="group" aria-label="Avançar o tempo">
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => somar(p)}>
              {rotuloPreset(p)}
            </button>
          ))}
        </div>
        <div className="relogio-presets menos" role="group" aria-label="Voltar o tempo">
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => somar(-p)}>
              {rotuloPreset(-p)}
            </button>
          ))}
        </div>
      </div>

      <div className="relogio-forms">
        <form onSubmit={enviarDelta}>
          <label htmlFor="relogio-delta">Somar tempo</label>
          <div className="relogio-form-linha">
            <input
              id="relogio-delta"
              type="text"
              inputMode="text"
              placeholder="+1:30, -45, 2h"
              value={entradaDelta}
              onChange={(e) => setEntradaDelta(e.target.value)}
            />
            <button type="submit" className="btn-rect neutro sm" disabled={!entradaDelta.trim()}>
              Somar
            </button>
          </div>
        </form>
        <form onSubmit={enviarHorario}>
          <label htmlFor="relogio-horario">Pular para</label>
          <div className="relogio-form-linha">
            <input
              id="relogio-horario"
              type="text"
              placeholder={otimista.formato12h ? "6:00 pm" : "18:00"}
              value={entradaHorario}
              onChange={(e) => setEntradaHorario(e.target.value)}
            />
            <button type="submit" className="btn-rect neutro sm" disabled={!entradaHorario.trim()}>
              Definir
            </button>
          </div>
        </form>
        <div>
          <span className="relogio-label">Velocidade do tempo real</span>
          <div className="relogio-segmentado" role="group" aria-label="Velocidade do tempo real">
            {VELOCIDADES.map((v) => (
              <button
                key={v}
                type="button"
                className={otimista.velocidade === v ? "ativo" : ""}
                aria-pressed={otimista.velocidade === v}
                title={v === 1 ? "Igual à vida real" : `1 segundo real = ${v} segundos na campanha`}
                onClick={() =>
                  otimista.velocidade !== v &&
                  executar({ tipo: "velocidade", velocidade: v }, () => definirVelocidadeRelogio(mesaId, v))
                }
              >
                ×{v}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function rotuloPreset(delta: number) {
  const abs = Math.abs(delta);
  const sinal = delta < 0 ? "−" : "+";
  return abs % 3600 === 0 ? `${sinal}${abs / 3600}h` : `${sinal}${abs / 60}m`;
}

function mostrarErro(mensagem: string) {
  Swal.fire({
    icon: "error",
    title: "Erro",
    text: mensagem,
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}
