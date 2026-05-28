"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { atualizarRecurso, criarRecurso, deletarRecurso } from "./actions";

export type Recurso = {
  id: string;
  nome: string;
  valorAtual: number;
  valorMax: number;
  ordem: number;
  cor: string | null;
  resetEm: string;
};

type Patch =
  | { kind: "create"; recurso: Recurso }
  | { kind: "update"; id: string; patch: Partial<Recurso> }
  | { kind: "delete"; id: string };

type FormState = {
  id: string | null;
  nome: string;
  valorMax: string;
  cor: string;
  resetEm: string;
};

const FORM_VAZIO: FormState = {
  id: null,
  nome: "",
  valorMax: "5",
  cor: "",
  resetEm: "manual",
};

// Paleta inicial pra picker. Resolve as variáveis do tema pra hex pra
// funcionar com <input type="color"> (que não aceita var()).
const SWATCHES = [
  "#d4af37", // berries/ouro
  "#1f9eff", // azul
  "#27ae60", // verde
  "#e74c3c", // vermelho
  "#9b59b6", // roxo
  "#f39c12", // laranja
  "#ec4899", // rosa
  "#14b8a6", // turquesa
  "#64748b", // cinza
];

function mostrarErro(err: unknown) {
  Swal.fire({
    icon: "error",
    title: "Erro",
    text: err instanceof Error ? err.message : "Operação falhou.",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function RecursosSidebar({
  personagemId,
  recursos,
}: {
  personagemId: string;
  recursos: Recurso[];
}) {
  // Patch cross-tab vindo do HabilidadesTab (efeito `recurso_delta` de uma
  // habilidade ativa). Mapa id → valorAtual otimista, sobrescreve o valor
  // vindo do server até o realtime/revalidate trazer a verdade. Os events
  // carregam deltas; clamp 0..valorMax fica no merge abaixo.
  const [shadow, setShadow] = useState<Record<string, number>>({});
  useEffect(() => {
    setShadow({});
  }, [recursos]);
  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<Record<string, number>>).detail;
      if (!det) return;
      setShadow((s) => {
        const next = { ...s };
        for (const [id, delta] of Object.entries(det)) {
          if (!delta) continue;
          const base = recursos.find((r) => r.id === id);
          if (!base) continue;
          const atual = next[id] ?? base.valorAtual;
          next[id] = clamp(atual + delta, 0, base.valorMax);
        }
        return next;
      });
    }
    window.addEventListener("rpgo:patch-recurso", ouvir);
    return () => window.removeEventListener("rpgo:patch-recurso", ouvir);
  }, [recursos]);

  const recursosComShadow = recursos.map((r) =>
    r.id in shadow ? { ...r, valorAtual: shadow[r.id] } : r,
  );

  const [lista, aplicarPatch] = useOptimistic(recursosComShadow, (state, p: Patch) => {
    if (p.kind === "create") return [...state, p.recurso];
    if (p.kind === "delete") return state.filter((r) => r.id !== p.id);
    return state.map((r) => (r.id === p.id ? { ...r, ...p.patch } : r));
  });

  const [, startTransition] = useTransition();
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);

  function abrirNovo() {
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdit(r: Recurso) {
    setForm({
      id: r.id,
      nome: r.nome,
      valorMax: String(r.valorMax),
      cor: r.cor || "",
      resetEm: r.resetEm,
    });
    setModalAberto(true);
  }

  function alterarValor(r: Recurso, delta: number) {
    const novo = clamp(r.valorAtual + delta, 0, r.valorMax);
    if (novo === r.valorAtual) return;
    startTransition(async () => {
      aplicarPatch({ kind: "update", id: r.id, patch: { valorAtual: novo } });
      try {
        await atualizarRecurso(personagemId, r.id, { valorAtual: novo });
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const nome = form.nome.trim();
    if (!nome) {
      mostrarErro(new Error("Nome é obrigatório."));
      return;
    }
    const valorMax = Number(form.valorMax) || 0;
    const cor = form.cor.trim() || null;
    const resetEm = form.resetEm;
    const editandoId = form.id;
    setModalAberto(false);

    startTransition(async () => {
      if (editandoId) {
        aplicarPatch({
          kind: "update",
          id: editandoId,
          patch: { nome, valorMax, cor, resetEm },
        });
        try {
          await atualizarRecurso(personagemId, editandoId, {
            nome,
            valorMax,
            cor: cor ?? "",
            resetEm,
          });
        } catch (err) {
          mostrarErro(err);
        }
      } else {
        const temp: Recurso = {
          id: "temp-" + Math.random().toString(36).slice(2),
          nome,
          valorAtual: valorMax,
          valorMax,
          ordem: lista.length,
          cor,
          resetEm,
        };
        aplicarPatch({ kind: "create", recurso: temp });
        try {
          await criarRecurso(personagemId, {
            nome,
            valorAtual: valorMax,
            valorMax,
            ordem: lista.length,
            cor: cor ?? "",
            resetEm,
          });
        } catch (err) {
          mostrarErro(err);
        }
      }
    });
  }

  async function apagar(r: Recurso) {
    const confirm = await Swal.fire({
      title: "Apagar recurso",
      text: `Apagar "${r.nome}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Apagar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirm.isConfirmed) return;
    startTransition(async () => {
      aplicarPatch({ kind: "delete", id: r.id });
      try {
        await deletarRecurso(personagemId, r.id);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  const ordenados = [...lista].sort(
    (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome),
  );

  return (
    <div className="recursos-bloco">
      <div className="recursos-header">
        <span>Recursos</span>
        <button
          type="button"
          className="recursos-add"
          onClick={abrirNovo}
          title="Novo recurso"
        >
          <i className="fas fa-plus" />
        </button>
      </div>

      {ordenados.length === 0 && (
        <div className="recursos-vazio">
          Sem recursos. Crie um pra trackear pools como Pontos de Carateca, PA, etc.
        </div>
      )}

      {ordenados.map((r) => {
        const cor = r.cor || "var(--color-power)";
        return (
          <div key={r.id} className="recurso-card">
            <div className="recurso-card-topo">
              <span className="recurso-card-nome" style={{ color: cor }}>
                {r.nome}
              </span>
              <div className="recurso-card-acoes">
                <button
                  type="button"
                  className="recurso-icon-btn"
                  onClick={() => abrirEdit(r)}
                  title="Editar"
                >
                  <i className="fas fa-edit" />
                </button>
                <button
                  type="button"
                  className="recurso-icon-btn"
                  onClick={() => apagar(r)}
                  title="Apagar"
                >
                  <i className="fas fa-trash" />
                </button>
              </div>
            </div>
            <div className="recurso-card-corpo">
              <button
                type="button"
                className="recurso-btn"
                onClick={() => alterarValor(r, -1)}
                disabled={r.valorAtual <= 0}
                aria-label="Diminuir"
              >
                −
              </button>
              <span className="recurso-card-valor">
                <strong>{r.valorAtual}</strong>
                <span className="recurso-card-max"> / {r.valorMax}</span>
              </span>
              <button
                type="button"
                className="recurso-btn"
                onClick={() => alterarValor(r, +1)}
                disabled={r.valorAtual >= r.valorMax}
                aria-label="Aumentar"
              >
                +
              </button>
            </div>
          </div>
        );
      })}

      {modalAberto && (
        <div className="modal-overlay" onClick={() => setModalAberto(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>{form.id ? "Editar Recurso" : "Novo Recurso"}</h2>
            <p style={{ fontSize: "0.8rem", color: "var(--text-sec)", marginBottom: 15 }}>
              Pool numérico (ex: Pontos de Carateca, PA, Pontos de Okama).
            </p>
            <form onSubmit={salvar}>
              <label>Nome</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Pontos de Carateca"
                autoFocus
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <div>
                  <label>Valor Máximo</label>
                  <input
                    type="number"
                    min={0}
                    value={form.valorMax}
                    onChange={(e) => setForm({ ...form, valorMax: e.target.value })}
                  />
                </div>
                <div>
                  <label>Recuperação</label>
                  <select
                    value={form.resetEm}
                    onChange={(e) => setForm({ ...form, resetEm: e.target.value })}
                  >
                    <option value="manual">Manual</option>
                    <option value="encontro">Fim do encontro</option>
                    <option value="descansoCurto">Descanso curto</option>
                    <option value="descansoLongo">Descanso longo</option>
                  </select>
                </div>
              </div>

              <label style={{ marginTop: 10 }}>Cor</label>
              <div className="cor-picker">
                <input
                  type="color"
                  className="cor-picker-input"
                  value={form.cor || "#d4af37"}
                  onChange={(e) => setForm({ ...form, cor: e.target.value })}
                  aria-label="Escolher cor"
                />
                <div className="cor-swatches">
                  {SWATCHES.map((c) => (
                    <button
                      type="button"
                      key={c}
                      className={`cor-swatch ${form.cor.toLowerCase() === c.toLowerCase() ? "ativo" : ""}`}
                      style={{ background: c }}
                      onClick={() => setForm({ ...form, cor: c })}
                      title={c}
                      aria-label={`Cor ${c}`}
                    />
                  ))}
                  <button
                    type="button"
                    className={`cor-swatch cor-swatch-limpar ${!form.cor ? "ativo" : ""}`}
                    onClick={() => setForm({ ...form, cor: "" })}
                    title="Sem cor (padrão do tema)"
                    aria-label="Sem cor"
                  >
                    <i className="fas fa-ban" />
                  </button>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={() => setModalAberto(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="modal-btn-save">
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
