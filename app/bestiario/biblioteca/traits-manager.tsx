"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { criarTemplate, atualizarTemplate, deletarTemplate } from "../traits-actions";
import { criarTemplateVazio } from "../utils";
import { corDaCondicao } from "../cor-condicao";
import { destacarCondicoes } from "../destacar-condicoes";
import { EfeitosEditor, UsosLimitadosEditor } from "../componente-editor";
import { CATEGORIAS_ACAO, CATEGORIAS_COMPONENTE } from "../types";
import type { CondicaoEfeito, ComponenteCategoria, EfeitoAcao, TemplatePayload, TemplateSerializado } from "../types";
import { ListaTextoInput } from "../inputs";

function draftDeTemplate(t: TemplateSerializado): TemplatePayload {
  const { id: _id, criadoEm: _criadoEm, ...payload } = t;
  return payload;
}

function textoDano(formula: string, tipos: string[]) {
  const f = formula.trim();
  const t = tipos.filter(Boolean).join(" ou ");
  if (!f) return t;
  return t ? `${f} ${t}` : f;
}

const FORMA_LABEL: Record<string, string> = {
  cone: "Cone",
  linha: "Linha",
  esfera: "Esfera",
  emanacao: "Emanação",
  cilindro: "Cilindro",
};

// Versão em texto de um efeito pra ficha de visualização (somente leitura,
// sem opção de rolar — a biblioteca não tem Bandeja, ela não pertence a
// nenhuma mesa). Condição não vira badge aqui — ela é destacada dentro do
// texto pela `destacarCondicoes`, junto com a descrição.
function textoEfeito(e: EfeitoAcao): string | null {
  switch (e.tipo) {
    case "ataque":
      return e.bonus.trim() ? `Ataque ${e.bonus.trim()}` : null;
    case "salvaguarda":
      return `CD ${e.cd} (${e.atributo})`;
    case "dano": {
      const t = textoDano(e.formula, e.tipos);
      return t ? `Dano: ${t}` : null;
    }
    case "area":
      return e.forma !== "nenhuma" ? `Área: ${FORMA_LABEL[e.forma]}${e.tamanho ? ` (${e.tamanho})` : ""}` : null;
    case "movimento":
      return `Movimento: ${e.valor}m ${e.tipoMov}${e.duracao ? ` (${e.duracao})` : ""}`;
    case "bonus_numerico":
      return e.alvo.trim() ? `${e.alvo}: ${e.valor >= 0 ? "+" : ""}${e.valor}${e.duracao ? ` (${e.duracao})` : ""}` : null;
    case "cura":
      return e.formula.trim() ? `Recupera ${e.formula.trim()} PV` : null;
    case "condicao":
      return null;
    case "livre":
      return e.texto.trim() || null;
  }
}

// As "pastas" da biblioteca — cada categoria vira uma pasta própria, exceto
// as 5 variações de ação (padrão/bônus/reação/poderosa/lendária) que cabem
// juntas dentro de uma pasta "Ações" só, igual o statblock trata como blocos
// do mesmo grupo.
type Pasta = { key: string; categorias: ComponenteCategoria[]; label: string; icone: string };
const PASTAS: Pasta[] = [
  { key: "condicao", categorias: ["condicao"], label: "Condições", icone: "fa-triangle-exclamation" },
  { key: "aspecto", categorias: ["aspecto"], label: "Aspectos", icone: "fa-star" },
  { key: "acoes", categorias: CATEGORIAS_ACAO, label: "Ações", icone: "fa-bolt" },
];

type Visualizacao = "pastas" | "lista" | "ficha" | "editor";

type Props = { templatesIniciais: TemplateSerializado[] };

export function TraitsManager({ templatesIniciais }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState(templatesIniciais);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplatePayload>(() => criarTemplateVazio());
  const [salvando, setSalvando] = useState(false);
  const [visualizacao, setVisualizacao] = useState<Visualizacao>("pastas");
  const [pastaAtiva, setPastaAtiva] = useState<Pasta | null>(null);
  // Só a pasta "Ações" precisa escolher a categoria antes do formulário —
  // Aspectos e Condições têm categoria única, então "Novo trait" já entra
  // direto no formulário com ela preenchida.
  const [mostrarPicker, setMostrarPicker] = useState(false);

  const condicoesDisponiveis = templates.filter((t) => t.categoria === "condicao" && t.id !== selecionadoId);

  function abrirPasta(pasta: Pasta) {
    setPastaAtiva(pasta);
    setVisualizacao("lista");
  }

  function voltarParaPastas() {
    setPastaAtiva(null);
    setVisualizacao("pastas");
  }

  function voltarParaLista() {
    setVisualizacao("lista");
  }

  function abrirNovo() {
    if (!pastaAtiva) return;
    setSelecionadoId(null);
    if (pastaAtiva.categorias.length === 1) {
      setDraft({ ...criarTemplateVazio(), categoria: pastaAtiva.categorias[0] });
      setMostrarPicker(false);
      setVisualizacao("editor");
    } else {
      setDraft(criarTemplateVazio());
      setMostrarPicker(true);
      setVisualizacao("editor");
    }
  }

  function escolherCategoria(categoria: TemplatePayload["categoria"]) {
    setDraft((atual) => ({ ...atual, categoria }));
    setMostrarPicker(false);
  }

  function abrirFicha(t: TemplateSerializado) {
    setSelecionadoId(t.id);
    setVisualizacao("ficha");
  }

  function abrirEdicaoDaFicha() {
    const t = templates.find((x) => x.id === selecionadoId);
    if (!t) return;
    setDraft(draftDeTemplate(t));
    setMostrarPicker(false);
    setVisualizacao("editor");
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
      setVisualizacao("ficha");
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
      setSelecionadoId(null);
      voltarParaLista();
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

  if (visualizacao === "pastas") {
    return (
      <div className="bestiario-grade-cards">
        {PASTAS.map((pasta) => {
          const total = templates.filter((t) => pasta.categorias.includes(t.categoria)).length;
          return (
            <button key={pasta.key} type="button" className="trait-pasta-card" onClick={() => abrirPasta(pasta)}>
              <i className={`fas ${pasta.icone}`} />
              <span className="bestiario-card-nome">{pasta.label}</span>
              <span className="bestiario-card-meta">
                {total} trait{total === 1 ? "" : "s"}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (visualizacao === "lista" && pastaAtiva) {
    const itens = templates.filter((t) => pastaAtiva.categorias.includes(t.categoria));
    return (
      <div className="bestiario-lista-view">
        <div className="bestiario-lista-toolbar">
          <button type="button" className="bestiario-voltar-lista" onClick={voltarParaPastas}>
            <i className="fas fa-arrow-left" /> Pastas
          </button>
          <span className="bestiario-page-chip">
            <i className={`fas ${pastaAtiva.icone}`} /> {pastaAtiva.label}
          </span>
          <button type="button" className="bestiario-btn-nova" onClick={abrirNovo}>
            <i className="fas fa-plus" /> Novo trait
          </button>
        </div>
        {itens.length === 0 ? (
          <p className="bestiario-vazio">Nenhum trait nesta pasta ainda.</p>
        ) : (
          <div className="bestiario-grade-cards">
            {itens.map((t) => (
              <button key={t.id} type="button" className="bestiario-card-item" onClick={() => abrirFicha(t)}>
                <span className="bestiario-card-nome">{t.nome}</span>
                {pastaAtiva.categorias.length > 1 && (
                  <span className="bestiario-card-meta">
                    {CATEGORIAS_COMPONENTE.find((c) => c.key === t.categoria)?.label ?? t.categoria}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (visualizacao === "ficha") {
    const t = templates.find((x) => x.id === selecionadoId);
    if (!t) {
      voltarParaLista();
      return null;
    }
    const f = t.formula;
    const badges = f.efeitos.map(textoEfeito).filter((x): x is string => x !== null);
    const condicoes = f.efeitos.filter((e): e is CondicaoEfeito => e.tipo === "condicao");
    return (
      <div className="bestiario-ficha-view">
        <div className="bestiario-ficha-toolbar">
          <button type="button" className="bestiario-btn-salvar" onClick={abrirEdicaoDaFicha}>
            <i className="fas fa-pen" /> Editar
          </button>
          <button type="button" className="bestiario-ficha-fechar" onClick={voltarParaLista} title="Fechar">
            <i className="fas fa-xmark" />
          </button>
        </div>
        <div className="bestiario-ficha-cabecalho">
          <h2>{t.nome}</h2>
          <p className="bestiario-ficha-subtitulo">
            <i className={`fas ${CATEGORIAS_COMPONENTE.find((c) => c.key === t.categoria)?.icone ?? "fa-bolt"}`} />{" "}
            {CATEGORIAS_COMPONENTE.find((c) => c.key === t.categoria)?.label ?? t.categoria}
          </p>
        </div>
        {(badges.length > 0 || f.alcance || f.custo) && (
          <div className="bestiario-ficha-secao">
            <div className="bestiario-ficha-badges">
              {badges.map((b, i) => (
                <span key={i} className="bestiario-ficha-badge">
                  {b}
                </span>
              ))}
              {f.alcance && <span className="bestiario-ficha-badge">Alcance: {f.alcance}</span>}
              {f.custo && <span className="bestiario-ficha-badge">Custo: {f.custo}</span>}
            </div>
          </div>
        )}
        {(t.textoTemplate || condicoes.length > 0) && (
          <div className="bestiario-ficha-secao">
            <p className="bestiario-ficha-descricao">{destacarCondicoes(t.textoTemplate, condicoes)}</p>
          </div>
        )}
        {(t.tagsProve.length > 0 || t.tagsConsome.length > 0 || t.tagsReageA.length > 0) && (
          <div className="bestiario-ficha-secao">
            {t.tagsProve.length > 0 && (
              <p>
                <strong>Provê.</strong> {t.tagsProve.join(", ")}
              </p>
            )}
            {t.tagsConsome.length > 0 && (
              <p>
                <strong>Consome.</strong> {t.tagsConsome.join(", ")}
              </p>
            )}
            {t.tagsReageA.length > 0 && (
              <p>
                <strong>Reage a.</strong> {t.tagsReageA.join(", ")}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // visualizacao === "editor"
  const ehCondicao = draft.categoria === "condicao";

  return (
    <section className="bestiario-editor">
      {mostrarPicker ? (
        <>
          <div className="bestiario-editor-header">
            <h2>Novo trait — qual categoria?</h2>
          </div>
          <div className="bestiario-secao">
            <p className="bestiario-sublabel">Em qual bloco do statblock esse trait entra?</p>
            <div className="wizard-origem-opcoes">
              {CATEGORIAS_ACAO.map((key) => {
                const meta = CATEGORIAS_COMPONENTE.find((c) => c.key === key);
                return (
                  <button key={key} type="button" className="wizard-origem-opcao" onClick={() => escolherCategoria(key)}>
                    <i className={`fas ${meta?.icone ?? "fa-bolt"}`} />
                    <strong>{meta?.label ?? key}</strong>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="bestiario-editor-header">
            <button type="button" className="bestiario-voltar-lista" onClick={voltarParaLista}>
              <i className="fas fa-arrow-left" /> Voltar
            </button>
            <h2>{selecionadoId ? "Editar trait" : "Novo trait"}</h2>
            <div className="bestiario-editor-acoes">
              {selecionadoId && (
                <button type="button" className="bestiario-btn-remover" onClick={remover}>
                  <i className="fas fa-trash" /> Remover
                </button>
              )}
              <button type="button" className="bestiario-btn-salvar" onClick={salvar} disabled={salvando}>
                <i className={`fas ${salvando ? "fa-spinner fa-spin" : "fa-floppy-disk"}`} />
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>

          <div className="bestiario-secao">
            <div className="bestiario-grid">
              <label>
                Nome
                <input value={draft.nome} onChange={(e) => campo("nome", e.target.value)} autoFocus />
              </label>
              {ehCondicao && (
                <label>
                  Cor
                  <input
                    type="color"
                    className="trait-condicao-cor-input"
                    value={draft.formula.cor || corDaCondicao(draft.nome || "condicao")}
                    onChange={(e) => formulaCampo("cor", e.target.value)}
                  />
                </label>
              )}
              {!pastaAtiva && (
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
              )}
              {!ehCondicao && (
                <>
                  <label>
                    Alcance
                    <input value={draft.formula.alcance} placeholder="1,5 metro" onChange={(e) => formulaCampo("alcance", e.target.value)} />
                  </label>
                  <label>
                    Custo
                    <input value={draft.formula.custo} placeholder="1 PP" onChange={(e) => formulaCampo("custo", e.target.value)} />
                  </label>
                </>
              )}
            </div>

            {ehCondicao ? (
              <label>
                Descrição da condição (o que ela faz — vira tooltip na ficha da criatura)
                <textarea
                  className="bestiario-textarea-descricao"
                  value={draft.textoTemplate}
                  onChange={(e) => campo("textoTemplate", e.target.value)}
                  placeholder="Ex: não pode se mover nem usar reações até o fim do próximo turno."
                />
              </label>
            ) : (
              <>
                <UsosLimitadosEditor
                  usos={draft.formula.usos}
                  recarga={draft.formula.recarga}
                  onChange={(patch) => {
                    if ("usos" in patch) formulaCampo("usos", patch.usos ?? null);
                    if ("recarga" in patch) formulaCampo("recarga", patch.recarga ?? null);
                  }}
                />

                <EfeitosEditor
                  efeitos={draft.formula.efeitos}
                  condicoesDisponiveis={condicoesDisponiveis}
                  onChange={(efeitos) => formulaCampo("efeitos", efeitos)}
                />

                <label>
                  Texto
                  <textarea
                    className="bestiario-textarea-descricao"
                    value={draft.textoTemplate}
                    onChange={(e) => campo("textoTemplate", e.target.value)}
                  />
                </label>
              </>
            )}

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
        </>
      )}
    </section>
  );
}
