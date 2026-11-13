"use client";

import { Tooltip } from "@/components/tooltip";
import { useContext, useEffect, useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { ehTemporario, exigir, idTemporario } from "@/lib/acoes";
import { atualizarRecurso, criarRecurso, deletarRecurso, dispararGatilhosDeRolagem } from "./actions";
import { EVENTO_ROLAGEM_D20, type RolagemD20 } from "@/lib/rolagem-d20";
import { CampoFormula, FormulaContext } from "./campo-formula";
import { lerNumeroOuFormula, maximoDoRecurso } from "@/lib/op-rpg";
import { EstiloPicker } from "./estilo-cor-picker";
import { PontosBloco, formDeConversao, type FormPonto } from "./pontos-sidebar";
import { ehPonto, type ArvoreQuePaga, type GanhoDeEfeito } from "@/lib/pontos";
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
  // Máximo por fórmula ("PROF", "NIVEL*2"); sem ela vale `valorMax`.
  valorMaxFormula?: string | null;
  ordem: number;
  cor: string | null;
  cor2: string | null;
  efeito: string;
  resetEm: string;
  // Ponto (lib/pontos.ts): valorAtual são os livres, calculados na página.
  tipo?: string;
  sigla?: string | null;
  icone?: string | null;
  ganhoPorNivel?: unknown;
  ajustes?: unknown;
  tetoLivre?: number | null;
  deEfeitos?: GanhoDeEfeito[];
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

// Chip de quando o recurso volta (manual não mostra).
const RECUPERACAO: Record<string, { nome: string; icone: string }> = {
  encontro: { nome: "Fim do encontro", icone: "fa-flag-checkered" },
  descansoCurto: { nome: "Descanso curto", icone: "fa-mug-hot" },
  descansoLongo: { nome: "Descanso longo", icone: "fa-moon" },
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function RecursosSidebar({
  personagemId,
  recursos,
  arvores,
  nivel,
}: {
  personagemId: string;
  recursos: Recurso[];
  arvores: ArvoreQuePaga[];
  nivel: number;
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
          // Ponto não tem máximo: a compra na árvore só tira dos livres.
          next[id] = ehPonto(base) ? atual + delta : clamp(atual + delta, 0, base.valorMax);
        }
        return next;
      });
    }
    window.addEventListener("rpgo:patch-recurso", ouvir);
    return () => window.removeEventListener("rpgo:patch-recurso", ouvir);
  }, [recursos]);

  // Efeito Gatilho: o d20 que o Rolador avisou mexe no recurso (o servidor confere e grava).
  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<RolagemD20>).detail;
      if (!det) return;
      void (async () => {
        try {
          const { disparados, deltas } = exigir(await dispararGatilhosDeRolagem(personagemId, det));
          if (disparados.length === 0 || !deltas) return;
          if (Object.keys(deltas.recursos).length > 0) {
            window.dispatchEvent(new CustomEvent("rpgo:patch-recurso", { detail: deltas.recursos }));
          }
          if (deltas.ppAtual || deltas.exaustao || deltas.hpAtual) {
            window.dispatchEvent(
              new CustomEvent("rpgo:patch-personagem", {
                detail: {
                  deltaPpAtual: deltas.ppAtual || undefined,
                  deltaExaustao: deltas.exaustao || undefined,
                  deltaHpAtual: deltas.hpAtual || undefined,
                },
              }),
            );
          }
          void Swal.fire({
            toast: true,
            position: "bottom",
            icon: "info",
            title: disparados.map((d) => `${d.fonte}: ${d.texto}`).join(" · "),
            showConfirmButton: false,
            timer: 2600,
            background: "var(--bg-card)",
            color: "var(--text-main)",
          });
        } catch (err) {
          mostrarErro(err);
        }
      })();
    }
    window.addEventListener(EVENTO_ROLAGEM_D20, ouvir);
    return () => window.removeEventListener(EVENTO_ROLAGEM_D20, ouvir);
  }, [personagemId]);

  // Máximo por fórmula acompanha o nível e os atributos de agora.
  const ctxFormula = useContext(FormulaContext);
  const recursosComShadow = recursos.map((r) => ({
    ...r,
    valorMax: maximoDoRecurso(r, ctxFormula),
    ...(r.id in shadow ? { valorAtual: shadow[r.id] } : {}),
  }));

  const [lista, aplicarPatch] = useOptimistic(recursosComShadow, (state, p: Patch) => {
    if (p.kind === "create") return [...state, p.recurso];
    if (p.kind === "delete") return state.filter((r) => r.id !== p.id);
    return state.map((r) => (r.id === p.id ? { ...r, ...p.patch } : r));
  });

  const [, startTransition] = useTransition();
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [formPonto, setFormPonto] = useState<FormPonto | null>(null);

  function abrirNovo() {
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdit(r: Recurso) {
    setForm({
      id: r.id,
      nome: r.nome,
      valorMax: r.valorMaxFormula ?? String(r.valorMax),
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
        exigir(await atualizarRecurso(personagemId, r.id, { valorAtual: novo }));
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
    // Máximo: número ou fórmula (o valor de agora vai junto, como reserva).
    const { numero: valorMax, formula: valorMaxFormula } = lerNumeroOuFormula(form.valorMax, ctxFormula);
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
          patch: { nome, valorMax, valorMaxFormula, cor, cor2, efeito, resetEm },
        });
        try {
          exigir(await atualizarRecurso(personagemId, editandoId, {
            nome,
            valorMax,
            valorMaxFormula,
            cor: cor ?? "",
            cor2: cor2 ?? "",
            efeito,
            resetEm,
          }));
        } catch (err) {
          mostrarErro(err);
        }
      } else {
        const temp: Recurso = {
          id: idTemporario(),
          nome,
          valorAtual: valorMax,
          valorMax,
          valorMaxFormula,
          ordem: lista.length,
          cor,
          cor2,
          efeito,
          resetEm,
        };
        aplicarPatch({ kind: "create", recurso: temp });
        try {
          exigir(await criarRecurso(personagemId, {
            nome,
            valorAtual: valorMax,
            valorMax,
            valorMaxFormula,
            ordem: lista.length,
            cor: cor ?? "",
            cor2: cor2 ?? "",
            efeito,
            resetEm,
          }));
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
      confirmButtonColor: "var(--danger)",
      cancelButtonColor: "var(--text-sec)",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirm.isConfirmed) return;
    startTransition(async () => {
      aplicarPatch({ kind: "delete", id: r.id });
      try {
        exigir(await deletarRecurso(personagemId, r.id));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  const todos = [...lista].sort(
    (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome),
  );
  const pontos = todos.filter(ehPonto);
  const ordenados = todos.filter((r) => !ehPonto(r));

  return (
    <>
    <PontosBloco
      personagemId={personagemId}
      pontos={pontos}
      arvores={arvores}
      nivel={nivel}
      aplicarPatch={aplicarPatch}
      form={formPonto}
      setForm={setFormPonto}
    />
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
          Sem recursos. Crie um pra trackear pools como Pontos de Carateca.
        </div>
      )}

      {ordenados.map((r) => {
        const cor = r.cor || "var(--bar-recurso)";
        const estilo = { cor: r.cor, cor2: r.cor2, efeito: normalizarEfeitoCor(r.efeito) };
        const fxNome = estiloAplicado(estilo, "texto");
        const fxBarra = estiloAplicado(estilo, "barra");
        return (
          <div
            key={r.id}
            className={`recurso-card${ehTemporario(r.id) ? " item-pendente" : ""}`}
            inert={ehTemporario(r.id)}
          >
            <div className="recurso-card-topo">
              <span
                className={`recurso-card-nome ${fxNome.className}`.trim()}
                style={fxNome.style ?? { color: cor }}
              >
                {r.nome}
              </span>
              {RECUPERACAO[r.resetEm] && (
                <span
                  className="recurso-volta"
                  title={`Recupera: ${RECUPERACAO[r.resetEm].nome}`}
                  aria-label={`Recupera: ${RECUPERACAO[r.resetEm].nome}`}
                >
                  <i className={`fas ${RECUPERACAO[r.resetEm].icone}`} />
                </span>
              )}
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
              {/* Atalhos nas pontas: zerar e encher de uma vez. */}
              <span className="recurso-btns">
                <button
                  type="button"
                  className="recurso-btn recurso-btn-ponta"
                  onClick={() => alterarValor(r, -r.valorAtual)}
                  disabled={r.valorAtual <= 0}
                  title="Zerar"
                  aria-label={`Zerar ${r.nome}`}
                >
                  <i className="fas fa-angles-left" />
                </button>
                <button
                  type="button"
                  className="recurso-btn"
                  onClick={() => alterarValor(r, -1)}
                  disabled={r.valorAtual <= 0}
                  aria-label="Diminuir"
                >
                  −
                </button>
              </span>
              <span className="recurso-card-valor">
                <strong>{r.valorAtual}</strong>
                <Tooltip titulo={r.nome} texto={r.valorMaxFormula ? `Máximo: ${r.valorMaxFormula}` : undefined}>
                  <span className="recurso-card-max">
                    {" "}
                    / {r.valorMax}
                  </span>
                </Tooltip>
              </span>
              <span className="recurso-btns">
                <button
                  type="button"
                  className="recurso-btn"
                  onClick={() => alterarValor(r, +1)}
                  disabled={r.valorAtual >= r.valorMax}
                  aria-label="Aumentar"
                >
                  +
                </button>
                <button
                  type="button"
                  className="recurso-btn recurso-btn-ponta"
                  onClick={() => alterarValor(r, r.valorMax - r.valorAtual)}
                  disabled={r.valorAtual >= r.valorMax}
                  title="Encher"
                  aria-label={`Encher ${r.nome}`}
                >
                  <i className="fas fa-angles-right" />
                </button>
              </span>
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
                <CampoFormula
                  label="Máximo"
                  valor={form.valorMax}
                  onChange={(v) => setForm((f) => ({ ...f, valorMax: v }))}
                  placeholder="5, PROF, NIVEL…"
                />
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
                {form.id && (
                  <button
                    type="button"
                    className="modal-btn-cancel recurso-virar-ponto"
                    onClick={() => {
                      const r = lista.find((x) => x.id === form.id);
                      if (!r) return;
                      setModalAberto(false);
                      setFormPonto(formDeConversao(r, arvores));
                    }}
                  >
                    Virar ponto
                  </button>
                )}
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
    </>
  );
}
