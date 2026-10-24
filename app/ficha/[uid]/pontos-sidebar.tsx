"use client";

import { useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { ehTemporario, exigir, idTemporario } from "@/lib/acoes";
import { apagarAjustePonto, deletarRecurso, lancarAjustePonto, salvarPonto } from "./actions";
import { IconePicker } from "@/components/icone-picker";
import { EstiloPicker } from "./estilo-cor-picker";
import { EFEITO_COR_PADRAO, normalizarEfeitoCor, type EfeitoCor } from "@/lib/estilos-cor";
import {
  MODELOS_PONTO,
  NIVEIS_PONTO,
  abrirArvore,
  lerAjustes,
  lerGanhoPorNivel,
  modeloPeloNome,
  saldoDoPonto,
  type AjustePonto,
  type ArvoreQuePaga,
  type ModeloPonto,
} from "@/lib/pontos";
import type { Recurso } from "./recursos-sidebar";

type PatchRecurso =
  | { kind: "create"; recurso: Recurso }
  | { kind: "update"; id: string; patch: Partial<Recurso> }
  | { kind: "delete"; id: string };

export type FormPonto = {
  id: string | null;
  // Recurso antigo (PA/PT com barra) que vira ponto.
  converter: boolean;
  // Valor da barra antes de virar ponto: os livres começam nele.
  valorAnterior?: number;
  modelo: string | null;
  nome: string;
  sigla: string;
  icone: string;
  cor: string;
  cor2: string;
  efeito: EfeitoCor;
  ganhos: string[];
  teto: string;
  arvoreIds: string[];
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

function camposDoModelo(m: ModeloPonto) {
  return {
    modelo: m.slug,
    nome: m.campos.nome,
    sigla: m.campos.sigla,
    icone: m.campos.icone,
    cor: m.campos.cor,
    cor2: "",
    efeito: EFEITO_COR_PADRAO,
    ganhos: m.campos.ganhoPorNivel.map((g) => (g ? String(g) : "")),
    teto: m.campos.tetoLivre === null ? "" : String(m.campos.tetoLivre),
  };
}

function dataCurta(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

const corDe = (r: { cor: string | null }) => r.cor || "var(--primary)";

/** Abre o form de ponto pra um recurso de barra (PA/PT antigos). */
export function formDeConversao(r: Recurso, arvores: ArvoreQuePaga[]): FormPonto {
  const m = modeloPeloNome(r.nome);
  return {
    id: r.id,
    converter: true,
    valorAnterior: r.valorAtual,
    ...camposDoModelo(m),
    nome: r.nome,
    cor: r.cor || m.campos.cor,
    cor2: r.cor2 || "",
    efeito: normalizarEfeitoCor(r.efeito),
    arvoreIds: arvores.filter((a) => a.recursoCustoId === r.id).map((a) => a.id),
  };
}

export function PontosBloco({
  personagemId,
  pontos,
  arvores,
  nivel,
  aplicarPatch,
  form,
  setForm,
}: {
  personagemId: string;
  pontos: Recurso[];
  arvores: ArvoreQuePaga[];
  nivel: number;
  aplicarPatch: (p: PatchRecurso) => void;
  form: FormPonto | null;
  setForm: (f: FormPonto | null) => void;
}) {
  const [, startTransition] = useTransition();
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const [arvoresOt, ligarOt] = useOptimistic(
    arvores,
    (state, p: { pontoId: string; ids: string[] }) =>
      state.map((a) =>
        p.ids.includes(a.id)
          ? { ...a, recursoCustoId: p.pontoId }
          : a.recursoCustoId === p.pontoId
            ? { ...a, recursoCustoId: null }
            : a,
      ),
  );

  const detalhe = pontos.find((p) => p.id === detalheId) ?? null;

  function abrirNovo() {
    setForm({
      id: null,
      converter: false,
      ...camposDoModelo(MODELOS_PONTO[0]),
      arvoreIds: [],
    });
  }

  function abrirEdit(r: Recurso) {
    setForm({
      id: r.id,
      converter: false,
      modelo: null,
      nome: r.nome,
      sigla: r.sigla ?? "",
      icone: r.icone ?? "fa-star",
      cor: r.cor ?? "",
      cor2: r.cor2 ?? "",
      efeito: normalizarEfeitoCor(r.efeito),
      ganhos: lerGanhoPorNivel(r.ganhoPorNivel).map((g) => (g ? String(g) : "")),
      teto: r.tetoLivre == null ? "" : String(r.tetoLivre),
      arvoreIds: arvoresOt.filter((a) => a.recursoCustoId === r.id).map((a) => a.id),
    });
  }

  function salvar(f: FormPonto, e: React.FormEvent) {
    e.preventDefault();
    const nome = f.nome.trim();
    if (!nome) {
      mostrarErro(new Error("Nome é obrigatório."));
      return;
    }
    const ganhoPorNivel = lerGanhoPorNivel(f.ganhos);
    const tetoLivre = f.teto.trim() === "" ? null : Math.max(0, Math.trunc(Number(f.teto)) || 0);
    const campos = {
      nome,
      sigla: f.sigla.trim().toUpperCase().slice(0, 4) || null,
      icone: f.icone,
      cor: f.cor.trim() || null,
      cor2: f.cor2.trim() || null,
      efeito: f.efeito,
      ganhoPorNivel,
      tetoLivre,
    };
    const id = f.id ?? idTemporario();
    const depois = arvoresOt.map((a) => ({
      ...a,
      recursoCustoId: f.arvoreIds.includes(a.id) ? id : a.recursoCustoId === id ? null : a.recursoCustoId,
    }));
    const anterior = pontos.find((p) => p.id === f.id);
    const base = {
      id,
      tipo: "ponto",
      ganhoPorNivel,
      tetoLivre,
      ajustes: anterior?.ajustes ?? [],
      deEfeitos: anterior?.deEfeitos,
    };
    let ajustes = lerAjustes(base.ajustes);
    // Conversão: o saldo anterior entra como ajuste, os livres ficam iguais.
    if (f.converter) {
      const diferenca = (f.valorAnterior ?? 0) - saldoDoPonto(base, depois, nivel).livres;
      if (diferenca) {
        ajustes = [...ajustes, { id: idTemporario(), valor: diferenca, motivo: "Saldo anterior", em: new Date().toISOString() }];
      }
    }
    const livres = saldoDoPonto({ ...base, ajustes }, depois, nivel).livres;
    setForm(null);

    startTransition(async () => {
      ligarOt({ pontoId: id, ids: f.arvoreIds });
      const otimista = { ...campos, tipo: "ponto", resetEm: "manual", ajustes, valorAtual: livres };
      if (f.id) aplicarPatch({ kind: "update", id: f.id, patch: otimista });
      else {
        aplicarPatch({
          kind: "create",
          recurso: { ...otimista, id, valorMax: 0, valorMaxFormula: null, ordem: pontos.length },
        });
      }
      try {
        exigir(
          await salvarPonto(personagemId, f.id, {
            ...campos,
            cor: campos.cor ?? "",
            cor2: campos.cor2 ?? "",
            ...(f.id ? {} : { ordem: pontos.length }),
            arvoreIds: f.arvoreIds,
          }),
        );
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  async function apagar(r: Recurso) {
    const confirm = await Swal.fire({
      title: "Apagar ponto",
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
    setForm(null);
    setDetalheId(null);
    startTransition(async () => {
      aplicarPatch({ kind: "delete", id: r.id });
      try {
        exigir(await deletarRecurso(personagemId, r.id));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function lancar(r: Recurso, valor: number, motivo: string) {
    const ajuste: AjustePonto = { id: idTemporario(), valor, motivo, em: new Date().toISOString() };
    startTransition(async () => {
      aplicarPatch({
        kind: "update",
        id: r.id,
        patch: { ajustes: [...lerAjustes(r.ajustes), ajuste], valorAtual: r.valorAtual + valor },
      });
      try {
        exigir(await lancarAjustePonto(personagemId, r.id, { valor, motivo }));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function desfazerAjuste(r: Recurso, a: AjustePonto) {
    startTransition(async () => {
      aplicarPatch({
        kind: "update",
        id: r.id,
        patch: {
          ajustes: lerAjustes(r.ajustes).filter((x) => x.id !== a.id),
          valorAtual: r.valorAtual - a.valor,
        },
      });
      try {
        exigir(await apagarAjustePonto(personagemId, r.id, a.id));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  return (
    <div className="recursos-bloco">
      <div className="recursos-header">
        <span>Pontos</span>
        <button type="button" className="recursos-add" onClick={abrirNovo} title="Novo ponto">
          <i className="fas fa-plus" />
        </button>
      </div>

      {pontos.map((r) => {
        const saldo = saldoDoPonto(r, arvoresOt, nivel);
        const onde = saldo.arvores.map((a) => a.nome).join(", ") || "Sem árvore";
        const acima = r.tetoLivre != null && r.valorAtual > r.tetoLivre;
        return (
          <button
            key={r.id}
            type="button"
            className={`ponto-card${acima ? " acima" : ""}${r.valorAtual < 0 ? " negativo" : ""}${ehTemporario(r.id) ? " item-pendente" : ""}`}
            inert={ehTemporario(r.id)}
            style={{ "--ponto-cor": corDe(r) } as React.CSSProperties}
            onClick={() => setDetalheId(r.id)}
          >
            <span className="ponto-icone">
              <i className={`fas ${r.icone || "fa-star"}`} />
            </span>
            <span className="ponto-info">
              <span className="ponto-nome">{r.nome}</span>
              <span className="ponto-sub">
                {onde} · {saldo.gastos} gastos
              </span>
            </span>
            <span className="ponto-livres" title={acima ? `Acima do teto de ${r.tetoLivre}` : undefined}>
              <strong>{r.valorAtual}</strong>
              <small>livres</small>
            </span>
          </button>
        );
      })}

      {detalhe && (
        <PontoDetalhe
          ponto={detalhe}
          arvores={arvoresOt}
          nivel={nivel}
          onFechar={() => setDetalheId(null)}
          onEditar={() => {
            setDetalheId(null);
            abrirEdit(detalhe);
          }}
          onLancar={(valor, motivo) => lancar(detalhe, valor, motivo)}
          onDesfazer={(a) => desfazerAjuste(detalhe, a)}
        />
      )}

      {form && (
        <PontoForm
          form={form}
          setForm={setForm}
          arvores={arvoresOt}
          nivel={nivel}
          onSalvar={salvar}
          onApagar={
            form.id && !form.converter
              ? () => {
                  const r = pontos.find((p) => p.id === form.id);
                  if (r) void apagar(r);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function PontoDetalhe({
  ponto,
  arvores,
  nivel,
  onFechar,
  onEditar,
  onLancar,
  onDesfazer,
}: {
  ponto: Recurso;
  arvores: ArvoreQuePaga[];
  nivel: number;
  onFechar: () => void;
  onEditar: () => void;
  onLancar: (valor: number, motivo: string) => void;
  onDesfazer: (a: AjustePonto) => void;
}) {
  const saldo = saldoDoPonto(ponto, arvores, nivel);
  const ganhos = lerGanhoPorNivel(ponto.ganhoPorNivel);
  const teto = ponto.tetoLivre ?? null;
  const [ajusteAberto, setAjusteAberto] = useState(false);
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const principal = saldo.arvores[0] ?? null;

  function enviarAjuste(e: React.FormEvent) {
    e.preventDefault();
    const v = Math.trunc(Number(valor.replace("−", "-")));
    if (!Number.isFinite(v) || v === 0) {
      mostrarErro(new Error("Informe um valor diferente de zero."));
      return;
    }
    onLancar(v, motivo.trim());
    setValor("");
    setMotivo("");
    setAjusteAberto(false);
  }

  const mais = saldo.ajustes.filter((a) => a.valor > 0);
  const menos = saldo.ajustes.filter((a) => a.valor < 0);

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div
        className="modal-box ponto-modal"
        role="dialog"
        aria-label={ponto.nome}
        onClick={(e) => e.stopPropagation()}
        style={{ "--ponto-cor": corDe(ponto) } as React.CSSProperties}
      >
        <div className="ponto-detalhe-topo">
          <span className="ponto-icone grande">
            <i className={`fas ${ponto.icone || "fa-star"}`} />
          </span>
          <h2>
            {ponto.nome}
            {ponto.sigla && <span className="ponto-sigla">{ponto.sigla}</span>}
          </h2>
          <button type="button" className="ponto-topo-btn" onClick={onEditar} aria-label="Editar">
            <i className="fas fa-edit" />
          </button>
          <button type="button" className="ponto-topo-btn" onClick={onFechar} aria-label="Fechar">
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="ponto-stats">
          <div className={`ponto-stat livres${saldo.acimaDoTeto > 0 ? " acima" : ""}`}>
            <span>Livres</span>
            <strong>{saldo.livres}</strong>
          </div>
          <div className="ponto-stat">
            <span>Ganhos</span>
            <strong>{saldo.ganhos}</strong>
          </div>
          <div className="ponto-stat">
            <span>Gastos</span>
            <strong>{saldo.gastos}</strong>
          </div>
        </div>

        {teto !== null && (
          <div className="ponto-teto">
            <span className="ponto-teto-rotulo">Teto de livres</span>
            <span className="ponto-pips">
              {Array.from({ length: Math.max(1, teto) }, (_, i) => (
                <span key={i} className={i < saldo.livres ? "cheio" : ""} />
              ))}
            </span>
            <strong>
              {saldo.livres} de {teto}
            </strong>
          </div>
        )}
        {saldo.acimaDoTeto > 0 && (
          <p className="ponto-aviso">
            <i className="fas fa-triangle-exclamation" /> {saldo.acimaDoTeto} acima do teto
          </p>
        )}

        <h3 className="ponto-secao">Ganho por nível</h3>
        <div className="ponto-niveis">
          {ganhos.map((g, i) => {
            const n = i + 1;
            const chegou = n <= nivel;
            return (
              <div
                key={n}
                className={`ponto-nivel${chegou && g ? " ganhou" : ""}${n === nivel ? " atual" : ""}`}
              >
                <span>{n}</span>
                <strong>{g ? `+${g}` : "—"}</strong>
              </div>
            );
          })}
        </div>

        <h3 className="ponto-secao">De onde veio</h3>
        <div className="ponto-lista">
          <div className="ponto-linha">
            <span className="ponto-linha-texto">
              <strong>Por nível</strong>
              <small>Até o {nivel}º</small>
            </span>
            <span className="ponto-valor mais">+{saldo.porNivel}</span>
          </div>
          {saldo.deEfeitos.map((e) => (
            <div key={e.nome} className="ponto-linha">
              <span className="ponto-linha-texto">
                <strong>{e.nome}</strong>
                <small>Efeito</small>
              </span>
              <span className={`ponto-valor${e.valor > 0 ? " mais" : ""}`}>
                {e.valor > 0 ? `+${e.valor}` : `−${-e.valor}`}
              </span>
            </div>
          ))}
          {mais.map((a) => (
            <LinhaAjuste key={a.id} ajuste={a} onDesfazer={() => onDesfazer(a)} />
          ))}
        </div>

        {(saldo.arvores.length > 0 || menos.length > 0) && (
          <>
            <h3 className="ponto-secao">Pra onde foi</h3>
            <div className="ponto-lista">
              {saldo.arvores.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="ponto-linha clicavel"
                  onClick={() => {
                    abrirArvore(a.id);
                    onFechar();
                  }}
                >
                  <i className={`fas ${a.icone} ponto-linha-icone`} />
                  <span className="ponto-linha-texto">
                    <strong>{a.nome}</strong>
                    <small>{a.talentos} talentos</small>
                  </span>
                  <span className="ponto-valor">−{a.gasto}</span>
                </button>
              ))}
              {menos.map((a) => (
                <LinhaAjuste key={a.id} ajuste={a} onDesfazer={() => onDesfazer(a)} />
              ))}
            </div>
          </>
        )}

        {ajusteAberto && (
          <form className="ponto-ajuste-form" onSubmit={enviarAjuste}>
            <input
              type="text"
              inputMode="numeric"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="+1 ou -1"
              aria-label="Valor"
              autoFocus
            />
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo"
              aria-label="Motivo"
              maxLength={80}
            />
            <button type="submit" className="modal-btn-save">
              Lançar
            </button>
          </form>
        )}

        <div className="modal-actions">
          <button type="button" className="modal-btn-cancel" onClick={() => setAjusteAberto((v) => !v)}>
            {ajusteAberto ? "Cancelar" : "+ Ajuste"}
          </button>
          {principal && (
            <button
              type="button"
              className="modal-btn-save"
              onClick={() => {
                abrirArvore(principal.id);
                onFechar();
              }}
            >
              Abrir {principal.nome}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LinhaAjuste({ ajuste, onDesfazer }: { ajuste: AjustePonto; onDesfazer: () => void }) {
  const pendente = ehTemporario(ajuste.id);
  return (
    <div className={`ponto-linha${pendente ? " item-pendente" : ""}`} inert={pendente}>
      <span className="ponto-linha-texto">
        <strong>{ajuste.motivo || "Ajuste"}</strong>
        <small>{dataCurta(ajuste.em)}</small>
      </span>
      <span className={`ponto-valor${ajuste.valor > 0 ? " mais" : ""}`}>
        {ajuste.valor > 0 ? `+${ajuste.valor}` : `−${-ajuste.valor}`}
      </span>
      <button type="button" className="recurso-icon-btn" onClick={onDesfazer} aria-label="Desfazer ajuste">
        <i className="fas fa-times" />
      </button>
    </div>
  );
}

function PontoForm({
  form,
  setForm,
  arvores,
  nivel,
  onSalvar,
  onApagar,
}: {
  form: FormPonto;
  setForm: (f: FormPonto | null) => void;
  arvores: ArvoreQuePaga[];
  nivel: number;
  onSalvar: (f: FormPonto, e: React.FormEvent) => void;
  onApagar?: () => void;
}) {
  const mudar = (patch: Partial<FormPonto>) => setForm({ ...form, ...patch });
  const total = lerGanhoPorNivel(form.ganhos).reduce((t, g) => t + g, 0);
  const titulo = form.converter ? "Virar ponto" : form.id ? "Editar ponto" : "Novo ponto";

  return (
    <div className="modal-overlay" onClick={() => setForm(null)}>
      <div
        className="modal-box ponto-modal"
        role="dialog"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        style={{ "--ponto-cor": form.cor || "var(--primary)" } as React.CSSProperties}
      >
        <button type="button" className="modal-close" onClick={() => setForm(null)} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
        <h2>{titulo}</h2>
        <form onSubmit={(e) => onSalvar(form, e)}>
          {!form.id || form.converter ? (
            <div className="ponto-modelos" role="radiogroup" aria-label="Modelo">
              {MODELOS_PONTO.map((m) => (
                <button
                  key={m.slug}
                  type="button"
                  role="radio"
                  aria-checked={form.modelo === m.slug}
                  className={`ponto-modelo${form.modelo === m.slug ? " ativo" : ""}`}
                  onClick={() =>
                    mudar({
                      ...camposDoModelo(m),
                      // Na conversão o nome e a cor do recurso ficam.
                      ...(form.converter ? { nome: form.nome, cor: form.cor, cor2: form.cor2, efeito: form.efeito } : {}),
                    })
                  }
                >
                  <i className={`fas ${m.campos.icone}`} style={m.campos.cor ? { color: m.campos.cor } : undefined} />
                  <strong>{m.nome}</strong>
                  <small>{m.sub}</small>
                </button>
              ))}
            </div>
          ) : null}

          <div className="ponto-form-linha">
            <div style={{ flex: 1 }}>
              <label>Nome</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => mudar({ nome: e.target.value })}
                placeholder="Pontos de…"
                autoFocus
              />
            </div>
            <div style={{ width: 80 }}>
              <label>Sigla</label>
              <input
                type="text"
                value={form.sigla}
                onChange={(e) => mudar({ sigla: e.target.value.toUpperCase() })}
                placeholder="PX"
                maxLength={4}
              />
            </div>
          </div>

          <label style={{ marginTop: 10 }}>Ícone</label>
          <IconePicker valor={form.icone} onChange={(icone) => mudar({ icone })} />

          <label style={{ marginTop: 10 }}>Cor e brilho</label>
          <EstiloPicker
            cor={form.cor}
            cor2={form.cor2}
            efeito={form.efeito}
            onChange={(patch) => mudar(patch)}
            amostra={form.sigla || form.nome.trim().slice(0, 6) || "Aa"}
          />

          <label style={{ marginTop: 10 }}>
            Ganho por nível <span className="ponto-total">· {total} até o {NIVEIS_PONTO}º</span>
          </label>
          <div className="ponto-niveis editavel">
            {form.ganhos.map((g, i) => (
              <div
                key={i}
                className={`ponto-nivel${Number(g) > 0 ? " ganhou" : ""}${i + 1 === nivel ? " atual" : ""}`}
              >
                <span>{i + 1}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={g}
                  placeholder="0"
                  aria-label={`Ganho no nível ${i + 1}`}
                  onChange={(e) => {
                    const ganhos = [...form.ganhos];
                    ganhos[i] = e.target.value.replace(/\D/g, "").slice(0, 3);
                    mudar({ ganhos });
                  }}
                />
              </div>
            ))}
          </div>

          <div className="ponto-form-linha" style={{ marginTop: 10, alignItems: "flex-start" }}>
            <div style={{ width: 120 }}>
              <label>Teto de livres</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.teto}
                onChange={(e) => mudar({ teto: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                placeholder="Sem teto"
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label>Árvores que gastam</label>
              {arvores.length === 0 ? (
                <p className="campo-dica">Nenhuma árvore na ficha.</p>
              ) : (
                <div className="ponto-chips" role="group" aria-label="Árvores que gastam">
                  {arvores.map((a) => {
                    const ativo = form.arvoreIds.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        aria-pressed={ativo}
                        className={`ponto-chip${ativo ? " ativo" : ""}`}
                        onClick={() =>
                          mudar({
                            arvoreIds: ativo
                              ? form.arvoreIds.filter((x) => x !== a.id)
                              : [...form.arvoreIds, a.id],
                          })
                        }
                      >
                        <i className={`fas ${a.icone}`} /> {a.nome}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="modal-actions">
            {onApagar && (
              <button type="button" className="modal-btn-cancel ponto-apagar" onClick={onApagar}>
                Apagar
              </button>
            )}
            <button type="button" className="modal-btn-cancel" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button type="submit" className="modal-btn-save">
              {form.id && !form.converter ? "Salvar" : form.converter ? "Virar ponto" : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
