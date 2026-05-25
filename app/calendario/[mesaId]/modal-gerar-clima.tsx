"use client";

import { useState, useTransition } from "react";
import Swal from "sweetalert2";
import {
  type CalendarioConfig,
  dataParaDias,
  diasParaData,
} from "@/lib/calendario/engine";
import { gerarClima } from "./actions";

type Props = {
  mesaId: string;
  config: CalendarioConfig;
  dataAtualDias: number;
  onFechar: () => void;
};

export function ModalGerarClima({ mesaId, config, dataAtualDias, onFechar }: Props) {
  const hoje = dataParaDias(dataAtualDias, config);
  const fimMes = config.meses[hoje.mes - 1].dias;

  const [inicioAno, setInicioAno] = useState(hoje.ano);
  const [inicioMes, setInicioMes] = useState(hoje.mes);
  const [inicioDia, setInicioDia] = useState(hoje.dia);
  const [fimAno, setFimAno] = useState(hoje.ano);
  const [fimMes_, setFimMes] = useState(hoje.mes);
  const [fimDia, setFimDia] = useState(fimMes);
  const [sobrescrever, setSobrescrever] = useState(true);
  const [pending, startTransition] = useTransition();

  function gerar() {
    const inicio = diasParaData(
      { ano: inicioAno, mes: inicioMes, dia: inicioDia },
      config,
    );
    const fim = diasParaData({ ano: fimAno, mes: fimMes_, dia: fimDia }, config);
    if (fim < inicio) {
      Swal.fire({
        icon: "warning",
        title: "Intervalo inválido",
        text: "A data de fim deve ser igual ou posterior à de início.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }
    startTransition(async () => {
      try {
        const r = await gerarClima(mesaId, inicio, fim, sobrescrever);
        Swal.fire({
          icon: "success",
          title: "Clima gerado",
          text: `${r.criados} evento(s) criado(s). ${r.ignorados} dia(s) sem clima.`,
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
        onFechar();
      } catch (e) {
        Swal.fire({
          icon: "error",
          title: "Erro",
          text: e instanceof Error ? e.message : "Não foi possível gerar.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      }
    });
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-box cal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cal-modal-header">
          <span className="cal-kicker">GERAR CLIMA</span>
          <h2>Sorteio em intervalo</h2>
        </div>
        <p className="cal-modal-hint">
          Sorteia um evento climático pra cada dia do intervalo, ponderado pelos pesos
          de cada tipo na estação correspondente. Eventos não aparecem pros jogadores
          até a data atual chegar no dia deles.
        </p>

        <div className="cal-modal-divider">
          <span className="cal-kicker">INÍCIO</span>
        </div>
        <div className="cal-field-row3">
          <div className="cal-field">
            <label className="cal-field-label">Ano</label>
            <input
              type="number"
              className="cal-input"
              value={inicioAno}
              onChange={(e) => setInicioAno(Number(e.target.value))}
            />
          </div>
          <div className="cal-field">
            <label className="cal-field-label">Mês</label>
            <input
              type="number"
              className="cal-input"
              min={1}
              value={inicioMes}
              onChange={(e) => setInicioMes(Number(e.target.value))}
            />
          </div>
          <div className="cal-field">
            <label className="cal-field-label">Dia</label>
            <input
              type="number"
              className="cal-input"
              min={1}
              value={inicioDia}
              onChange={(e) => setInicioDia(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="cal-modal-divider">
          <span className="cal-kicker">FIM</span>
        </div>
        <div className="cal-field-row3">
          <div className="cal-field">
            <label className="cal-field-label">Ano</label>
            <input
              type="number"
              className="cal-input"
              value={fimAno}
              onChange={(e) => setFimAno(Number(e.target.value))}
            />
          </div>
          <div className="cal-field">
            <label className="cal-field-label">Mês</label>
            <input
              type="number"
              className="cal-input"
              min={1}
              value={fimMes_}
              onChange={(e) => setFimMes(Number(e.target.value))}
            />
          </div>
          <div className="cal-field">
            <label className="cal-field-label">Dia</label>
            <input
              type="number"
              className="cal-input"
              min={1}
              value={fimDia}
              onChange={(e) => setFimDia(Number(e.target.value))}
            />
          </div>
        </div>

        <label className="cal-checkbox-row">
          <input
            type="checkbox"
            checked={sobrescrever}
            onChange={(e) => setSobrescrever(e.target.checked)}
          />
          <div>
            <div className="cal-checkbox-label">Sobrescrever clima existente</div>
            <div className="cal-checkbox-sub">
              Apaga eventos climáticos no intervalo antes de gerar.
            </div>
          </div>
        </label>

        <div className="cal-modal-footer">
          <button type="button" className="cal-btn-sm" onClick={onFechar} disabled={pending}>
            Cancelar
          </button>
          <button type="button" className="cal-btn-primary-sm" onClick={gerar} disabled={pending}>
            <i className="fas fa-dice" /> {pending ? "Gerando..." : "Gerar"}
          </button>
        </div>
      </div>
    </div>
  );
}
