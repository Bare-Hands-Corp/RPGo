"use client";

import { useState, useTransition } from "react";
import Swal from "sweetalert2";
import {
  type CalendarioConfig,
  type Estacao,
  type Mes,
  DIAS_POR_MES_MAX,
  MESES_POR_ANO_MAX,
  dataParaDias,
  diasParaData,
} from "@/lib/calendario/engine";
import { aplicarConfig, aplicarTemplate, setarDataAtual } from "./actions";

type Tab = "data" | "template" | "custom";

type Props = {
  mesaId: string;
  config: CalendarioConfig;
  dataAtualDias: number;
  onFechar: () => void;
};

export function ModalConfig({ mesaId, config, dataAtualDias, onFechar }: Props) {
  const [tab, setTab] = useState<Tab>("data");
  const [pending, startTransition] = useTransition();

  // Data atual
  const inicial = dataParaDias(dataAtualDias, config);
  const [ano, setAno] = useState(inicial.ano);
  const [mes, setMes] = useState(inicial.mes);
  const [dia, setDia] = useState(inicial.dia);

  // Template
  const [template, setTemplate] = useState<string | null>(null);
  const [resetarTipos, setResetarTipos] = useState(true);

  // Custom (clone editável)
  const [meses, setMeses] = useState<Mes[]>(config.meses.map((m) => ({ ...m })));
  const [diasSemana, setDiasSemana] = useState<string[]>([...config.diasSemana]);
  const [estacoes, setEstacoes] = useState<Estacao[]>(config.estacoes.map((e) => ({ ...e })));
  const [cicloLua, setCicloLua] = useState(config.cicloLuaDias);
  const [diaSemanaEpoch, setDiaSemanaEpoch] = useState(config.diaSemanaEpoch ?? 0);
  const [anoEpoch, setAnoEpoch] = useState(config.anoEpoch ?? 1);
  const [novoDia, setNovoDia] = useState("");

  const totalDias = meses.reduce((s, m) => s + (Number(m.dias) || 0), 0);

  function salvar() {
    startTransition(async () => {
      try {
        if (tab === "data") {
          const diasMes = config.meses[mes - 1]?.dias;
          if (!diasMes) throw new Error("Mês inválido.");
          const diaClamp = Math.max(1, Math.min(dia, diasMes));
          const novosDias = diasParaData({ ano, mes, dia: diaClamp }, config);
          await setarDataAtual(mesaId, novosDias);
        } else if (tab === "template") {
          if (!template) {
            Swal.fire({
              icon: "warning",
              title: "Selecione um template",
              background: "var(--bg-card)",
              color: "var(--text-main)",
            });
            return;
          }
          await aplicarTemplate(mesaId, template, resetarTipos);
        } else {
          const mesesLimpos = meses
            .map((m) => ({ nome: (m.nome || "").trim(), dias: Math.max(1, Math.floor(Number(m.dias) || 0)) }))
            .filter((m) => m.nome && m.dias > 0);
          const diasSemanaLimpos = diasSemana.map((d) => (d || "").trim()).filter(Boolean);
          const totalMeses = mesesLimpos.length;
          const estacoesLimpas = estacoes
            .map((e) => ({
              nome: (e.nome || "").trim(),
              mesInicio: Number(e.mesInicio),
              mesFim: Number(e.mesFim),
            }))
            .filter(
              (e) =>
                e.nome &&
                Number.isInteger(e.mesInicio) &&
                e.mesInicio >= 1 &&
                e.mesInicio <= totalMeses &&
                Number.isInteger(e.mesFim) &&
                e.mesFim >= 1 &&
                e.mesFim <= totalMeses,
            );

          if (!mesesLimpos.length) throw new Error("Adicione pelo menos um mês.");
          if (!diasSemanaLimpos.length) throw new Error("Adicione pelo menos um dia da semana.");
          if (!estacoesLimpas.length) throw new Error("Adicione pelo menos uma estação válida.");
          if (!(cicloLua > 0)) throw new Error("Ciclo lunar deve ser maior que 0.");

          const novoConfig: CalendarioConfig = {
            meses: mesesLimpos,
            diasSemana: diasSemanaLimpos,
            estacoes: estacoesLimpas,
            cicloLuaDias: cicloLua,
            diaSemanaEpoch,
            anoEpoch,
          };
          await aplicarConfig(mesaId, novoConfig);
        }
        onFechar();
      } catch (e) {
        Swal.fire({
          icon: "error",
          title: "Erro",
          text: e instanceof Error ? e.message : "Erro ao salvar.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      }
    });
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-box modal-box-grande cal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cal-modal-header">
          <span className="cal-kicker">CONFIGURAR</span>
          <h2>Calendário da mesa</h2>
        </div>

        <div className="cal-tabs-modal">
          <button
            type="button"
            className={"cal-tab-modal" + (tab === "data" ? " active" : "")}
            onClick={() => setTab("data")}
          >
            Data atual
          </button>
          <button
            type="button"
            className={"cal-tab-modal" + (tab === "template" ? " active" : "")}
            onClick={() => setTab("template")}
          >
            Template
          </button>
          <button
            type="button"
            className={"cal-tab-modal" + (tab === "custom" ? " active" : "")}
            onClick={() => setTab("custom")}
          >
            Customizar
          </button>
        </div>

        {tab === "data" && (
          <div className="cal-modal-painel">
            <p className="cal-modal-hint">
              Define onde a campanha está no calendário. Mudar isso afeta o que os jogadores
              enxergam — eventos passados ficam visíveis, futuros somem da visão deles.
            </p>
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
                <select
                  className="cal-input"
                  value={mes}
                  onChange={(e) => setMes(Number(e.target.value))}
                >
                  {config.meses.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m.nome}
                    </option>
                  ))}
                </select>
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
          </div>
        )}

        {tab === "template" && (
          <div className="cal-modal-painel">
            <p className="cal-modal-hint">
              Escolha um template base. Eventos existentes são mantidos, mas suas datas podem
              aparecer em meses diferentes se a estrutura mudar.
            </p>
            <div className="cal-template-grid">
              <button
                type="button"
                className={"cal-template-card" + (template === "gregoriano" ? " selecionado" : "")}
                onClick={() => setTemplate("gregoriano")}
              >
                <i className="fas fa-globe" />
                <strong>Gregoriano</strong>
                <small>12 meses tradicionais · 4 estações · lua de 29,5d</small>
              </button>
              <button
                type="button"
                className={"cal-template-card" + (template === "op" ? " selecionado" : "")}
                onClick={() => setTemplate("op")}
              >
                <i className="fas fa-ship" />
                <strong>One Piece</strong>
                <small>360 dias · meses temáticos · Era do Pirata Rei</small>
              </button>
            </div>
            <label className="cal-checkbox-row">
              <input
                type="checkbox"
                checked={resetarTipos}
                onChange={(e) => setResetarTipos(e.target.checked)}
              />
              <div>
                <div className="cal-checkbox-label">Recriar tipos de clima default</div>
                <div className="cal-checkbox-sub">Substitui os tipos existentes pelos do template.</div>
              </div>
            </label>
          </div>
        )}

        {tab === "custom" && (
          <div className="cal-modal-painel">
            <div className="cal-field">
              <div className="cal-field-header">
                <label className="cal-field-label">Meses do ano</label>
                <span className="cal-field-hint">
                  {meses.length} {meses.length === 1 ? "mês" : "meses"} · {totalDias} dias no ano
                </span>
              </div>
              <div className="cal-mini-lista">
                {meses.map((m, idx) => (
                  <div className="cal-mes-row" key={idx}>
                    <div className="cal-mes-numero">{idx + 1}</div>
                    <input
                      type="text"
                      className="cal-mes-nome-input"
                      value={m.nome}
                      placeholder="Nome do mês"
                      onChange={(e) => {
                        const nv = [...meses];
                        nv[idx] = { ...nv[idx], nome: e.target.value };
                        setMeses(nv);
                      }}
                    />
                    <input
                      type="number"
                      className="cal-mes-dias-input"
                      min={1}
                      max={DIAS_POR_MES_MAX}
                      value={m.dias}
                      title="Dias no mês"
                      onChange={(e) => {
                        const nv = [...meses];
                        const raw = Math.floor(Number(e.target.value) || 1);
                        nv[idx] = {
                          ...nv[idx],
                          dias: Math.max(1, Math.min(raw, DIAS_POR_MES_MAX)),
                        };
                        setMeses(nv);
                      }}
                    />
                    <button
                      type="button"
                      className="cal-row-delete-btn"
                      title="Remover"
                      onClick={() => {
                        const nv = meses.filter((_, i) => i !== idx);
                        setMeses(nv);
                        // Recalibra estações que apontem fora do range.
                        setEstacoes((prev) =>
                          prev.map((e) => ({
                            ...e,
                            mesInicio: Math.min(e.mesInicio, Math.max(1, nv.length)),
                            mesFim: Math.min(e.mesFim, Math.max(1, nv.length)),
                          })),
                        );
                      }}
                    >
                      <i className="fas fa-times" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="cal-mini-add"
                disabled={meses.length >= MESES_POR_ANO_MAX}
                onClick={() => {
                  if (meses.length >= MESES_POR_ANO_MAX) return;
                  setMeses([...meses, { nome: `Mês ${meses.length + 1}`, dias: 30 }]);
                }}
              >
                <i className="fas fa-plus" /> Adicionar mês
                {meses.length >= MESES_POR_ANO_MAX && ` (máx ${MESES_POR_ANO_MAX})`}
              </button>
            </div>

            <div className="cal-field">
              <div className="cal-field-header">
                <label className="cal-field-label">Dias da semana</label>
                <span className="cal-field-hint">clique no × pra remover</span>
              </div>
              <div className="cal-tag-cloud">
                {diasSemana.map((d, idx) => (
                  <span className="cal-tag" key={idx}>
                    <span className="cal-tag-numero">{idx}</span>
                    {d}
                    <button
                      type="button"
                      className="cal-tag-remove"
                      title="Remover"
                      onClick={() => setDiasSemana(diasSemana.filter((_, i) => i !== idx))}
                    >
                      <i className="fas fa-times" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="cal-tag-add-row">
                <input
                  type="text"
                  className="cal-input"
                  placeholder="Nome do dia (ex: Domingo)"
                  maxLength={20}
                  value={novoDia}
                  onChange={(e) => setNovoDia(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const nv = novoDia.trim();
                      if (nv) {
                        setDiasSemana([...diasSemana, nv]);
                        setNovoDia("");
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  className="cal-btn-sm"
                  onClick={() => {
                    const nv = novoDia.trim();
                    if (nv) {
                      setDiasSemana([...diasSemana, nv]);
                      setNovoDia("");
                    }
                  }}
                >
                  <i className="fas fa-plus" />
                </button>
              </div>
            </div>

            <div className="cal-field">
              <div className="cal-field-header">
                <label className="cal-field-label">Estações</label>
                <span className="cal-field-hint">marcam cor das estações no calendário</span>
              </div>
              <div className="cal-mini-lista">
                {estacoes.map((e, idx) => {
                  const cruza = Number(e.mesInicio) > Number(e.mesFim);
                  return (
                    <div className="cal-estacao-row" key={idx}>
                      <input
                        type="text"
                        className="cal-estacao-input"
                        value={e.nome}
                        placeholder="Nome"
                        onChange={(ev) => {
                          const nv = [...estacoes];
                          nv[idx] = { ...nv[idx], nome: ev.target.value };
                          setEstacoes(nv);
                        }}
                      />
                      <select
                        className="cal-estacao-input"
                        value={e.mesInicio}
                        title="Mês de início"
                        onChange={(ev) => {
                          const nv = [...estacoes];
                          nv[idx] = { ...nv[idx], mesInicio: Number(ev.target.value) };
                          setEstacoes(nv);
                        }}
                      >
                        {meses.map((m, i) => (
                          <option key={i} value={i + 1}>
                            {i + 1}. {m.nome}
                          </option>
                        ))}
                      </select>
                      <select
                        className="cal-estacao-input"
                        value={e.mesFim}
                        title="Mês de fim"
                        onChange={(ev) => {
                          const nv = [...estacoes];
                          nv[idx] = { ...nv[idx], mesFim: Number(ev.target.value) };
                          setEstacoes(nv);
                        }}
                      >
                        {meses.map((m, i) => (
                          <option key={i} value={i + 1}>
                            {i + 1}. {m.nome}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="cal-row-delete-btn"
                        title="Remover"
                        onClick={() => setEstacoes(estacoes.filter((_, i) => i !== idx))}
                      >
                        <i className="fas fa-times" />
                      </button>
                      {cruza && (
                        <span className="cal-estacao-cruza">
                          <i className="fas fa-arrow-rotate-right" /> cruza a virada do ano
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                className="cal-mini-add"
                onClick={() => setEstacoes([...estacoes, { nome: "Nova estação", mesInicio: 1, mesFim: 1 }])}
              >
                <i className="fas fa-plus" /> Adicionar estação
              </button>
            </div>

            <div className="cal-field-row3">
              <div className="cal-field">
                <label className="cal-field-label">Ciclo lunar (dias)</label>
                <input
                  type="number"
                  className="cal-input"
                  step="0.1"
                  value={cicloLua}
                  onChange={(e) => setCicloLua(Number(e.target.value))}
                />
              </div>
              <div className="cal-field">
                <label className="cal-field-label">Dia inicial da semana</label>
                <input
                  type="number"
                  className="cal-input"
                  min={0}
                  value={diaSemanaEpoch}
                  onChange={(e) => setDiaSemanaEpoch(Number(e.target.value))}
                />
              </div>
              <div className="cal-field">
                <label className="cal-field-label">Ano inicial</label>
                <input
                  type="number"
                  className="cal-input"
                  value={anoEpoch}
                  onChange={(e) => setAnoEpoch(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        )}

        <div className="cal-modal-footer">
          <button type="button" className="cal-btn-sm" onClick={onFechar} disabled={pending}>
            Cancelar
          </button>
          <button type="button" className="cal-btn-primary-sm" onClick={salvar} disabled={pending}>
            <i className="fas fa-check" /> {pending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
