"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { atualizarRecurso, criarRecurso, deletarRecurso } from "./actions";
import { EstiloPicker } from "./estilo-cor-picker";
import {
  EFEITO_COR_PADRAO,
  estiloAplicado,
  normalizarEfeitoCor,
  type EfeitoCor,
} from "@/lib/estilos-cor";

export type Recurso = {
  id: string;
  nome: string;
  valorAtual: number;
  valorMax: number;
  ordem: number;
  cor: string | null;
  cor2: string | null;
  efeito: string;
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
  cor2: string;
  efeito: EfeitoCor;
  resetEm: string;
};

const FORM_VAZIO: FormState = {
  id: null,
  nome: "",
  valorMax: "5",
  cor: "",
  cor2: "",
  efeito: EFEITO_COR_PADRAO,
  resetEm: "manual",
};

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
      cor2: r.cor2 || "",
      efeito: normalizarEfeitoCor(r.efeito),
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
    const cor2 = form.cor2.trim() || null;
    const efeito = form.efeito;
    const resetEm = form.resetEm;
    const editandoId = form.id;
    setModalAberto(false);

    startTransition(async () => {
      if (editandoId) {
        aplicarPatch({
          kind: "update",
          id: editandoId,
          patch: { nome, valorMax, cor, cor2, efeito, resetEm },
        });
        try {
          await atualizarRecurso(personagemId, editandoId, {
            nome,
            valorMax,
            cor: cor ?? "",
            cor2: cor2 ?? "",
            efeito,
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
          cor2,
          efeito,
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
            cor2: cor2 ?? "",
            efeito,
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
        const estilo = { cor: r.cor, cor2: r.cor2, efeito: normalizarEfeitoCor(r.efeito) };
        const fxNome = estiloAplicado(estilo, "texto");
        const fxBarra = estiloAplicado(estilo, "barra");
        return (
          <div key={r.id} className="recurso-card">
            <div className="recurso-card-topo">
              <span
                className={`recurso-card-nome ${fxNome.className}`.trim()}
                style={fxNome.style ?? { color: cor }}
              >
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
            <div className="progress-track">
              <div
                className={`progress-fill ${fxBarra.className}`.trim()}
                style={{
                  width: `${r.valorMax > 0 ? (clamp(r.valorAtual, 0, r.valorMax) / r.valorMax) * 100 : 0}%`,
                  ...(fxBarra.style ?? { background: cor }),
                }}
              />
            </div>
          </div>
        );
      })}

      {modalAberto && (
        <div className="modal-overlay" onClick={() => setModalAberto(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setModalAberto(false)} aria-label="Fechar">
              <i className="fas fa-times" />
            </button>
            <h2>{form.id ? "Editar Recurso" : "Novo Recurso"}</h2>
            <p className="modal-intro">
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

              <label style={{ marginTop: 10 }}>Cor e brilho</label>
              <EstiloPicker
                cor={form.cor}
                cor2={form.cor2}
                efeito={form.efeito}
                onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                amostra={form.nome.trim().slice(0, 6) || "Aa"}
              />

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
