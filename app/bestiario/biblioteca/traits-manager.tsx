"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { criarTemplate, atualizarTemplate, deletarTemplate } from "../traits-actions";
import { criarTemplateVazio } from "../utils";
import { CATEGORIAS_COMPONENTE, FORMAS_AREA, TIPOS_DANO_SUGERIDOS } from "../types";
import type {
  AtributoSalvaguarda,
  DanoEntrada,
  DerivacaoNumero,
  DerivacaoTexto,
  TemplatePayload,
  TemplateSerializado,
} from "../types";
import { ListaTextoInput, NumeroInput } from "../inputs";

function uuid() {
  return crypto.randomUUID();
}

function draftDeTemplate(t: TemplateSerializado): TemplatePayload {
  const { id: _id, criadoEm: _criadoEm, ...payload } = t;
  return payload;
}

const ATRIBUTOS: AtributoSalvaguarda[] = ["forca", "destreza", "constituicao", "sabedoria", "presenca", "vontade"];

type Props = { templatesIniciais: TemplateSerializado[] };

export function TraitsManager({ templatesIniciais }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState(templatesIniciais);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplatePayload>(() => criarTemplateVazio());
  const [salvando, setSalvando] = useState(false);

  function abrirNovo() {
    setSelecionadoId(null);
    setDraft(criarTemplateVazio());
  }

  function abrirEdicao(t: TemplateSerializado) {
    setSelecionadoId(t.id);
    setDraft(draftDeTemplate(t));
  }

  function campo<K extends keyof TemplatePayload>(chave: K, valor: TemplatePayload[K]) {
    setDraft((atual) => ({ ...atual, [chave]: valor }));
  }

  function formulaCampo<K extends keyof TemplatePayload["formula"]>(chave: K, valor: TemplatePayload["formula"][K]) {
    setDraft((atual) => ({ ...atual, formula: { ...atual.formula, [chave]: valor } }));
  }

  async function salvar() {
    if (!draft.nome.trim()) {
      void Swal.fire({ icon: "warning", title: "Nome é obrigatório", background: "var(--bg-card)", color: "var(--text-main)" });
      return;
    }
    setSalvando(true);
    try {
      const salvo = selecionadoId ? await atualizarTemplate(selecionadoId, draft) : await criarTemplate(draft);
      setTemplates((prev) => {
        const existe = prev.some((t) => t.id === salvo.id);
        const nova = existe ? prev.map((t) => (t.id === salvo.id ? salvo : t)) : [...prev, salvo];
        return nova.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      });
      setSelecionadoId(salvo.id);
      setDraft(draftDeTemplate(salvo));
      router.refresh();
    } catch (err) {
      void Swal.fire({
        icon: "error",
        title: "Erro ao salvar",
        text: err instanceof Error ? err.message : "Tente novamente.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    if (!selecionadoId) return;
    const confirmacao = await Swal.fire({
      icon: "warning",
      title: `Remover "${draft.nome}"?`,
      showCancelButton: true,
      confirmButtonText: "Sim, remover",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirmacao.isConfirmed) return;

    try {
      await deletarTemplate(selecionadoId);
      setTemplates((prev) => prev.filter((t) => t.id !== selecionadoId));
      abrirNovo();
      router.refresh();
    } catch (err) {
      void Swal.fire({
        icon: "error",
        title: "Erro ao remover",
        text: err instanceof Error ? err.message : "Tente novamente.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    }
  }

  return (
    <div className="biblioteca-shell">
      <aside className="biblioteca-lista">
        <button type="button" className="bestiario-btn-nova" onClick={abrirNovo}>
          <i className="fas fa-plus" /> Novo trait
        </button>
        {templates.length === 0 ? (
          <p className="bestiario-vazio">Nenhum trait cadastrado ainda.</p>
        ) : (
          templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className={"bestiario-card-item" + (t.id === selecionadoId ? " active" : "")}
              onClick={() => abrirEdicao(t)}
            >
              <span className="bestiario-card-nome">{t.nome}</span>
              <span className="bestiario-card-meta">
                {CATEGORIAS_COMPONENTE.find((c) => c.key === t.categoria)?.label ?? t.categoria}
              </span>
            </button>
          ))
        )}
      </aside>

      <section className="bestiario-editor">
        <div className="bestiario-editor-header">
          <h2>{selecionadoId ? "Editar trait" : "Novo trait"}</h2>
          <div className="bestiario-editor-acoes">
            {selecionadoId && (
              <button type="button" className="bestiario-btn-remover" onClick={remover}>
                <i className="fas fa-trash" /> Remover
              </button>
            )}
            <button type="button" className="bestiario-btn-salvar" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

        <div className="bestiario-secao">
          <div className="bestiario-grid">
            <label>
              Nome
              <input value={draft.nome} onChange={(e) => campo("nome", e.target.value)} />
            </label>
            <label>
              Categoria
              <select value={draft.categoria} onChange={(e) => campo("categoria", e.target.value as TemplatePayload["categoria"])}>
                {CATEGORIAS_COMPONENTE.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Como acerta
              <select
                value={draft.formula.modoResolucao}
                onChange={(e) => formulaCampo("modoResolucao", e.target.value as TemplatePayload["formula"]["modoResolucao"])}
              >
                <option value="nenhum">Nenhum (passivo)</option>
                <option value="ataque">Jogada de ataque</option>
                <option value="salvaguarda">Salvaguarda do alvo</option>
              </select>
            </label>
          </div>

          {draft.formula.modoResolucao === "ataque" && (
            <div className="bestiario-grid">
              <label>
                Bônus de ataque
                <select
                  value={draft.formula.bonusAtaque.modo}
                  onChange={(e) => {
                    const modo = e.target.value as DerivacaoTexto["modo"];
                    formulaCampo(
                      "bonusAtaque",
                      modo === "padrao" ? { modo: "padrao", atributo: "destreza" } : { modo: "fixo", valor: "" },
                    );
                  }}
                >
                  <option value="padrao">Padrão (bônus de proficiência + atributo)</option>
                  <option value="fixo">Valor fixo</option>
                </select>
              </label>
              {draft.formula.bonusAtaque.modo === "padrao" ? (
                <label>
                  Atributo
                  <select
                    value={draft.formula.bonusAtaque.atributo}
                    onChange={(e) => formulaCampo("bonusAtaque", { modo: "padrao", atributo: e.target.value as AtributoSalvaguarda })}
                  >
                    {ATRIBUTOS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Valor
                  <input
                    placeholder="+5"
                    value={draft.formula.bonusAtaque.valor}
                    onChange={(e) => formulaCampo("bonusAtaque", { modo: "fixo", valor: e.target.value })}
                  />
                </label>
              )}
            </div>
          )}

          {draft.formula.modoResolucao === "salvaguarda" && (
            <div className="bestiario-grid">
              <label>
                Atributo da salvaguarda (do alvo)
                <select
                  value={draft.formula.salvaguardaAtributo}
                  onChange={(e) => formulaCampo("salvaguardaAtributo", e.target.value as AtributoSalvaguarda)}
                >
                  {ATRIBUTOS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                CD
                <select
                  value={draft.formula.cd.modo}
                  onChange={(e) => {
                    const modo = e.target.value as DerivacaoNumero["modo"];
                    formulaCampo("cd", modo === "padrao" ? { modo: "padrao", atributo: "constituicao" } : { modo: "fixo", valor: 10 });
                  }}
                >
                  <option value="padrao">Padrão (8 + proficiência + atributo)</option>
                  <option value="fixo">Valor fixo</option>
                </select>
              </label>
              {draft.formula.cd.modo === "padrao" ? (
                <label>
                  Atributo (de quem usa)
                  <select
                    value={draft.formula.cd.atributo}
                    onChange={(e) => formulaCampo("cd", { modo: "padrao", atributo: e.target.value as AtributoSalvaguarda })}
                  >
                    {ATRIBUTOS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Valor
                  <NumeroInput value={draft.formula.cd.valor} onChange={(v) => formulaCampo("cd", { modo: "fixo", valor: v ?? 10 })} />
                </label>
              )}
            </div>
          )}

          <div className="bestiario-grid">
            <label>
              Área (opcional)
              <select
                value={draft.formula.area.forma}
                onChange={(e) => formulaCampo("area", { ...draft.formula.area, forma: e.target.value as TemplatePayload["formula"]["area"]["forma"] })}
              >
                {FORMAS_AREA.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            {draft.formula.area.forma !== "nenhuma" && (
              <label>
                Tamanho da área
                <input
                  value={draft.formula.area.tamanho}
                  placeholder="15 metros"
                  onChange={(e) => formulaCampo("area", { ...draft.formula.area, tamanho: e.target.value })}
                />
              </label>
            )}
            <label>
              Alcance
              <input value={draft.formula.alcance} placeholder="1,5 metro" onChange={(e) => formulaCampo("alcance", e.target.value)} />
            </label>
            <label>
              Custo
              <input value={draft.formula.custo} placeholder="1 PP" onChange={(e) => formulaCampo("custo", e.target.value)} />
            </label>
          </div>

          <div className="bestiario-lista-linhas">
            <span className="bestiario-sublabel">Dano (literal — o mestre ajusta o bônus fixo por criatura depois de aplicar)</span>
            <datalist id="tipos-dano-sugeridos-template">
              {TIPOS_DANO_SUGERIDOS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {draft.formula.danos.map((d) => (
              <div key={d.id} className="bestiario-linha-dano">
                <input
                  value={d.formula}
                  placeholder="1d6"
                  onChange={(e) =>
                    formulaCampo(
                      "danos",
                      draft.formula.danos.map((x) => (x.id === d.id ? { ...x, formula: e.target.value } : x)),
                    )
                  }
                />
                <ListaTextoInput
                  list="tipos-dano-sugeridos-template"
                  placeholder="Cortante"
                  value={d.tipos}
                  onChange={(v) =>
                    formulaCampo(
                      "danos",
                      draft.formula.danos.map((x) => (x.id === d.id ? { ...x, tipos: v } : x)),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => formulaCampo("danos", draft.formula.danos.filter((x) => x.id !== d.id))}
                >
                  <i className="fas fa-xmark" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="bestiario-btn-add"
              onClick={() => {
                const novo: DanoEntrada = { id: uuid(), formula: "", tipos: [] };
                formulaCampo("danos", [...draft.formula.danos, novo]);
              }}
            >
              + Dano
            </button>
          </div>

          <label>
            Texto (use {"{cd}"} e {"{bonus_ataque}"} onde o número calculado deve entrar)
            <textarea
              className="bestiario-textarea-descricao"
              value={draft.textoTemplate}
              onChange={(e) => campo("textoTemplate", e.target.value)}
            />
          </label>

          <div className="bestiario-grid">
            <label className="bestiario-span-2">
              Provê (tags de sinergia, vírgula)
              <ListaTextoInput value={draft.tagsProve} onChange={(v) => campo("tagsProve", v)} />
            </label>
            <label className="bestiario-span-2">
              Consome (tags de sinergia, vírgula)
              <ListaTextoInput value={draft.tagsConsome} onChange={(v) => campo("tagsConsome", v)} />
            </label>
            <label className="bestiario-span-2">
              Reage a (tags de sinergia, vírgula)
              <ListaTextoInput value={draft.tagsReageA} onChange={(v) => campo("tagsReageA", v)} />
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
