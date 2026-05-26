"use client";

import { useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { criarAcao, deletarAcao } from "./actions";

type Acao = {
  id: string;
  nome: string;
  descricao: string;
  tipo: string;
  tag: string | null;
};

type Props = {
  personagemId: string;
  acoes: Acao[];
};

const GRUPOS = [
  { tipo: "padrao", titulo: "Ações Padrão", icone: "fa-gavel", cor: "var(--color-padrao)" },
  { tipo: "bonus", titulo: "Ações Bônus", icone: "fa-bolt", cor: "var(--color-bonus)" },
  { tipo: "power", titulo: "Ações Poderosas", icone: "fa-bomb", cor: "var(--color-power)" },
  { tipo: "react", titulo: "Reações", icone: "fa-shield-alt", cor: "var(--color-react)" },
] as const;

type Patch =
  | { kind: "create"; acao: Acao }
  | { kind: "delete"; id: string };

function mostrarErro(err: unknown) {
  Swal.fire({
    icon: "error",
    title: "Erro",
    text: err instanceof Error ? err.message : "Operação falhou.",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

export function AcoesTab({ personagemId, acoes }: Props) {
  const [acoesOtimistas, aplicarPatch] = useOptimistic(
    acoes,
    (state: Acao[], p: Patch) => {
      if (p.kind === "create") return [...state, p.acao];
      return state.filter((a) => a.id !== p.id);
    },
  );

  const [modalAberto, setModalAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState("padrao");
  const [tag, setTag] = useState("");
  const [, startTransition] = useTransition();

  function resetForm() {
    setNome("");
    setDescricao("");
    setTipo("padrao");
    setTag("");
  }

  function fecharModal() {
    setModalAberto(false);
    resetForm();
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      Swal.fire({
        icon: "warning",
        title: "Campo obrigatório",
        text: "Dê um nome para sua ação!",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }

    const novaAcao: Acao = {
      id: "temp-" + Math.random().toString(36).slice(2),
      nome: nomeLimpo,
      descricao,
      tipo,
      tag: tag || null,
    };

    const dados = { nome: nomeLimpo, descricao, tipo, tag };
    fecharModal();

    startTransition(async () => {
      aplicarPatch({ kind: "create", acao: novaAcao });
      try {
        await criarAcao(personagemId, dados);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  async function apagar(acaoId: string) {
    const confirm = await Swal.fire({
      title: "Deletar Ação",
      text: "Tem certeza que quer apagar essa técnica?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Deletar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      aplicarPatch({ kind: "delete", id: acaoId });
      try {
        await deletarAcao(personagemId, acaoId);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Ações de Combate</h1>
        <button
          type="button"
          className="btn-rect primary"
          style={{ background: "var(--color-power)" }}
          onClick={() => setModalAberto(true)}
        >
          + Nova Ação
        </button>
      </div>
      <p style={{ color: "var(--text-sec)", fontSize: "0.9rem", marginBottom: 20 }}>
        Gerencie suas técnicas e ataques aqui.
      </p>

      {GRUPOS.map((grupo) => {
        const lista = acoesOtimistas.filter((a) => a.tipo === grupo.tipo);
        return (
          <section key={grupo.tipo}>
            <div className="section-header">
              <i className={`fas ${grupo.icone}`} style={{ color: grupo.cor }} />
              <h3>{grupo.titulo}</h3>
            </div>
            {lista.length > 0 ? (
              <div className="action-grid">
                {lista.map((acao) => (
                  <div key={acao.id} className={`action-card type-${acao.tipo}`}>
                    <button
                      type="button"
                      className="btn-card-trash"
                      title="Apagar"
                      onClick={() => apagar(acao.id)}
                    >
                      <i className="fas fa-trash" />
                    </button>
                    <div>
                      <div className="card-title">{acao.nome}</div>
                      <div className="card-desc">{acao.descricao}</div>
                    </div>
                    {acao.tag && (
                      <div className="card-tags">
                        <span className="tag tag-damage">{acao.tag}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--text-sec)", fontSize: "0.85rem", fontStyle: "italic" }}>
                Nenhuma ação nessa categoria.
              </p>
            )}
          </section>
        );
      })}

      {modalAberto && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>Nova Ação</h2>
            <form onSubmit={salvar}>
              <label>Nome da Ação</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Soco Meteoro"
                autoFocus
              />

              <label>Descrição</label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descreva o efeito..."
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <div>
                  <label>Tipo</label>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    <option value="padrao">Ação Padrão</option>
                    <option value="bonus">Ação Bônus</option>
                    <option value="power">Ação Poderosa</option>
                    <option value="react">Reação</option>
                  </select>
                </div>
                <div>
                  <label>Dano / Tag</label>
                  <input
                    type="text"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    placeholder="Ex: 1d8+2"
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={fecharModal}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="modal-btn-save"
                  style={{ background: "var(--color-padrao)" }}
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
