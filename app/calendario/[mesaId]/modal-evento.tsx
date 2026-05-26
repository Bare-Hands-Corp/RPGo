"use client";

import { useState } from "react";
import Swal from "sweetalert2";
import {
  type CalendarioConfig,
  dataParaDias,
  diasParaData,
} from "@/lib/calendario/engine";
import type { EventoCal, TipoClima } from "./types";

type EventoPayload = {
  tipo: "climatico" | "narrativo";
  titulo: string;
  descricao: string | null;
  dataDias: number;
  tipoClimaId: string | null;
  oculto: boolean;
};

type Props = {
  config: CalendarioConfig;
  tiposClima: TipoClima[];
  eventoInicial: EventoCal | null;
  dataAtualDias: number;
  onFechar: () => void;
  onSalvar: (payload: EventoPayload, id: string | null) => void;
};

export function ModalEvento({
  config,
  tiposClima,
  eventoInicial,
  dataAtualDias,
  onFechar,
  onSalvar,
}: Props) {
  const refDias = eventoInicial ? eventoInicial.dataDias : dataAtualDias;
  const ref = dataParaDias(refDias, config);

  const [tipo, setTipo] = useState<"narrativo" | "climatico">(eventoInicial?.tipo || "narrativo");
  const [titulo, setTitulo] = useState(eventoInicial?.titulo || "");
  const [descricao, setDescricao] = useState(eventoInicial?.descricao || "");
  const [oculto, setOculto] = useState(!!eventoInicial?.oculto);
  const [ano, setAno] = useState(ref.ano);
  const [mes, setMes] = useState(ref.mes);
  const [dia, setDia] = useState(ref.dia);
  const [tipoClimaId, setTipoClimaId] = useState(eventoInicial?.tipoClimaId || tiposClima[0]?.id || "");

  function salvar() {
    if (!titulo.trim()) {
      Swal.fire({
        icon: "warning",
        title: "Campo obrigatório",
        text: "Título é obrigatório.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }
    const dataDias = diasParaData({ ano, mes, dia }, config);
    const payload: EventoPayload = {
      tipo,
      titulo: titulo.trim(),
      descricao: descricao || null,
      dataDias,
      tipoClimaId: tipo === "climatico" ? tipoClimaId || null : null,
      oculto,
    };
    // Fecha imediato; o parent aplica optimistic + chama action em background.
    onFechar();
    onSalvar(payload, eventoInicial?.id ?? null);
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-box cal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cal-modal-header">
          <span className="cal-kicker">EVENTO</span>
          <h2>{eventoInicial ? "Editar Evento" : "Novo Evento"}</h2>
        </div>

        <div className="cal-modal-body">
          <div className="cal-field">
            <label className="cal-field-label">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "climatico" | "narrativo")}
              className="cal-input"
            >
              <option value="narrativo">Narrativo</option>
              <option value="climatico">Climático</option>
            </select>
          </div>

          {tipo === "climatico" && (
            <div className="cal-field">
              <label className="cal-field-label">Tipo de clima</label>
              <select
                value={tipoClimaId}
                onChange={(e) => setTipoClimaId(e.target.value)}
                className="cal-input"
              >
                {tiposClima.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="cal-field">
            <label className="cal-field-label">Título</label>
            <input
              type="text"
              className="cal-input"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Encontro com Shanks"
            />
          </div>

          <div className="cal-field">
            <label className="cal-field-label">Descrição</label>
            <textarea
              className="cal-input"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes do evento..."
              rows={3}
            />
          </div>

          <div className="cal-field-row3">
            <div className="cal-field">
              <label className="cal-field-label">Ano</label>
              <input
                type="number"
                className="cal-input"
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
              />
            </div>
            <div className="cal-field">
              <label className="cal-field-label">Mês</label>
              <input
                type="number"
                className="cal-input"
                min={1}
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
              />
            </div>
            <div className="cal-field">
              <label className="cal-field-label">Dia</label>
              <input
                type="number"
                className="cal-input"
                min={1}
                value={dia}
                onChange={(e) => setDia(Number(e.target.value))}
              />
            </div>
          </div>

          <label className="cal-checkbox-row">
            <input type="checkbox" checked={oculto} onChange={(e) => setOculto(e.target.checked)} />
            <div>
              <div className="cal-checkbox-label">Oculto pros jogadores</div>
              <div className="cal-checkbox-sub">
                Mesmo após chegar a data, só você vê. Use pra surpresas.
              </div>
            </div>
          </label>
        </div>

        <div className="cal-modal-footer">
          <button type="button" className="cal-btn-sm" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="cal-btn-primary-sm" onClick={salvar}>
            <i className="fas fa-check" /> Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
