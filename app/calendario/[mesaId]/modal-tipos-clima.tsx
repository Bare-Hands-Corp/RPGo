"use client";

import { useState, useTransition } from "react";
import Swal from "sweetalert2";
import type { CalendarioConfig } from "@/lib/calendario/engine";
import type { TipoClima } from "./types";
import {
  atualizarTipoClima,
  criarTipoClima,
  deletarTipoClima,
} from "./actions";

const PESOS_PRESET = [0, 1, 2, 3, 5];

type Props = {
  mesaId: string;
  config: CalendarioConfig;
  tiposClima: TipoClima[];
  onFechar: () => void;
};

export function ModalTiposClima({ mesaId, config, tiposClima, onFechar }: Props) {
  const [, startTransition] = useTransition();
  const [mostrarForm, setMostrarForm] = useState(false);

  // Form novo tipo
  const [novoNome, setNovoNome] = useState("");
  const [novoIcone, setNovoIcone] = useState("");
  const [novoDescricao, setNovoDescricao] = useState("");
  const [novoPesos, setNovoPesos] = useState<Record<string, number>>(() => {
    const inicial: Record<string, number> = {};
    for (const e of config.estacoes) inicial[e.nome] = 0;
    return inicial;
  });

  function patchTipo(id: string, dados: Partial<TipoClima>) {
    startTransition(async () => {
      try {
        await atualizarTipoClima(mesaId, id, {
          nome: dados.nome,
          descricao: dados.descricao,
          icone: dados.icone,
          pesosPorEstacao: dados.pesosPorEstacao,
        });
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

  async function apagar(id: string) {
    const r = await Swal.fire({
      title: "Excluir tipo de clima",
      text: "Eventos antigos vão perder a referência (mas não serão apagados). Continuar?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Excluir",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!r.isConfirmed) return;
    startTransition(async () => {
      try {
        await deletarTipoClima(mesaId, id);
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

  function criarNovo() {
    if (!novoNome.trim()) {
      Swal.fire({
        icon: "warning",
        title: "Campo obrigatório",
        text: "Nome é obrigatório.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }
    startTransition(async () => {
      try {
        await criarTipoClima(mesaId, {
          nome: novoNome.trim(),
          icone: novoIcone.trim() || null,
          descricao: novoDescricao.trim() || null,
          pesosPorEstacao: novoPesos,
        });
        setNovoNome("");
        setNovoIcone("");
        setNovoDescricao("");
        const reset: Record<string, number> = {};
        for (const e of config.estacoes) reset[e.nome] = 0;
        setNovoPesos(reset);
        setMostrarForm(false);
      } catch (e) {
        Swal.fire({
          icon: "error",
          title: "Erro",
          text: e instanceof Error ? e.message : "Erro ao criar.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      }
    });
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div
        className="modal-box modal-box-grande cal-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cal-modal-header">
          <span className="cal-kicker">PERFIL CLIMÁTICO</span>
          <h2>Tipos de Clima</h2>
        </div>
        <p className="cal-modal-hint">
          Edite os campos clicando neles. Use as pílulas pra ajustar a frequência de cada
          clima por estação (0 = nunca sorteado).
        </p>

        <div className="cal-tipos-lista">
          {!tiposClima.length ? (
            <div className="cal-empty">
              Nenhum tipo cadastrado. Use o botão abaixo pra criar o primeiro.
            </div>
          ) : (
            tiposClima.map((t) => (
              <TipoCard
                key={t.id}
                tipo={t}
                estacoes={config.estacoes.map((e) => e.nome)}
                onPatch={(dados) => patchTipo(t.id, dados)}
                onApagar={() => apagar(t.id)}
              />
            ))
          )}
        </div>

        {!mostrarForm ? (
          <button
            type="button"
            className="cal-tipo-add-btn"
            onClick={() => setMostrarForm(true)}
          >
            <i className="fas fa-plus" /> Adicionar novo tipo
          </button>
        ) : (
          <div className="cal-tipo-novo-form">
            <div className="cal-tipo-novo-header">
              <input
                type="text"
                className="cal-tipo-icone-input"
                placeholder="🌨️"
                maxLength={4}
                value={novoIcone}
                onChange={(e) => setNovoIcone(e.target.value)}
              />
              <input
                type="text"
                className="cal-input"
                placeholder="Nome (ex: Granizo)"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
              />
            </div>
            <input
              type="text"
              className="cal-input"
              placeholder="Descrição curta (opcional)"
              value={novoDescricao}
              onChange={(e) => setNovoDescricao(e.target.value)}
            />
            <div className="cal-tipo-pesos">
              <div className="cal-tipo-pesos-titulo">FREQUÊNCIA POR ESTAÇÃO</div>
              {config.estacoes.map((e) => (
                <div className="cal-tipo-peso-row" key={e.nome}>
                  <span className="cal-tipo-peso-label">{e.nome}</span>
                  <PesoPilulas
                    valor={novoPesos[e.nome] || 0}
                    onChange={(v) => setNovoPesos({ ...novoPesos, [e.nome]: v })}
                  />
                </div>
              ))}
            </div>
            <div className="cal-tipo-novo-acoes">
              <button
                type="button"
                className="cal-btn-sm"
                onClick={() => setMostrarForm(false)}
              >
                Cancelar
              </button>
              <button type="button" className="cal-btn-primary-sm" onClick={criarNovo}>
                <i className="fas fa-check" /> Criar
              </button>
            </div>
          </div>
        )}

        <div className="cal-modal-footer">
          <button type="button" className="cal-btn-sm" onClick={onFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function PesoPilulas({
  valor,
  onChange,
}: {
  valor: number;
  onChange: (v: number) => void;
}) {
  const ehPreset = PESOS_PRESET.includes(valor);
  return (
    <div className="cal-tipo-peso-pilulas">
      {PESOS_PRESET.map((p) => {
        const ativo = p === valor;
        const cls = ["cal-peso-pilula"];
        if (ativo) cls.push(p === 0 ? "ativo-0" : "ativo");
        return (
          <button type="button" className={cls.join(" ")} key={p} onClick={() => onChange(p)}>
            {p === 0 ? "—" : p}
          </button>
        );
      })}
      <input
        type="number"
        min={0}
        className="cal-peso-pilula-custom"
        value={ehPreset ? "" : valor}
        placeholder="…"
        title="Valor customizado"
        onChange={(e) => {
          const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
          onChange(v);
        }}
      />
    </div>
  );
}

function TipoCard({
  tipo,
  estacoes,
  onPatch,
  onApagar,
}: {
  tipo: TipoClima;
  estacoes: string[];
  onPatch: (dados: Partial<TipoClima>) => void;
  onApagar: () => void;
}) {
  // Estado controlado local pros inputs (commit no blur).
  const [nome, setNome] = useState(tipo.nome);
  const [icone, setIcone] = useState(tipo.icone || "");
  const [descricao, setDescricao] = useState(tipo.descricao || "");

  function commit<K extends "nome" | "icone" | "descricao">(campo: K, valor: string) {
    const valorTratado = valor.trim();
    if (campo === "nome") {
      if (!valorTratado) {
        setNome(tipo.nome);
        Swal.fire({
          icon: "warning",
          title: "Campo obrigatório",
          text: "Nome do tipo não pode ficar vazio.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
        return;
      }
      if (valorTratado === tipo.nome) return;
      onPatch({ nome: valorTratado });
      return;
    }
    const atual = campo === "icone" ? tipo.icone : tipo.descricao;
    const novo = valorTratado || null;
    if (novo === atual) return;
    onPatch({ [campo]: novo } as Partial<TipoClima>);
  }

  function mudarPeso(estacao: string, v: number) {
    if ((tipo.pesosPorEstacao[estacao] || 0) === v) return;
    onPatch({ pesosPorEstacao: { ...tipo.pesosPorEstacao, [estacao]: v } });
  }

  return (
    <div className="cal-tipo-item">
      <div className="cal-tipo-cabecalho">
        <input
          type="text"
          className="cal-tipo-icone-input"
          value={icone}
          placeholder="🌤️"
          maxLength={4}
          onChange={(e) => setIcone(e.target.value)}
          onBlur={(e) => commit("icone", e.target.value)}
        />
        <div className="cal-tipo-nome-bloco">
          <input
            type="text"
            className="cal-tipo-nome-input"
            value={nome}
            placeholder="Nome do clima"
            onChange={(e) => setNome(e.target.value)}
            onBlur={(e) => commit("nome", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            }}
          />
          <input
            type="text"
            className="cal-tipo-descricao-input"
            value={descricao}
            placeholder="Descrição (opcional)"
            onChange={(e) => setDescricao(e.target.value)}
            onBlur={(e) => commit("descricao", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            }}
          />
        </div>
        <button
          type="button"
          className="cal-tipo-delete-btn"
          title="Excluir"
          onClick={onApagar}
        >
          <i className="fas fa-trash" />
        </button>
      </div>
      <div className="cal-tipo-pesos">
        <div className="cal-tipo-pesos-titulo">FREQUÊNCIA POR ESTAÇÃO</div>
        {estacoes.map((e) => (
          <div className="cal-tipo-peso-row" key={e}>
            <span className="cal-tipo-peso-label">{e}</span>
            <PesoPilulas
              valor={tipo.pesosPorEstacao[e] || 0}
              onChange={(v) => mudarPeso(e, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
