"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { criarTemplate, atualizarTemplate, deletarTemplate, semearTiposDano } from "@/app/bestiario/traits-actions";
import { criarTemplateVazio } from "@/app/bestiario/utils";
import { corDaCondicao } from "@/app/bestiario/cor-condicao";
import { destacarCondicoes } from "@/app/bestiario/destacar-condicoes";
import { EfeitosEditor, UsosLimitadosEditor } from "@/app/bestiario/componente-editor";
import { CATEGORIAS_ACAO, CATEGORIAS_COMPONENTE } from "@/app/bestiario/types";
import type {
  CondicaoEfeito,
  ComponenteCategoria,
  EfeitoAcao,
  TemplatePayload,
  TemplateSerializado,
} from "@/app/bestiario/types";
import { ListaTextoInput } from "@/app/bestiario/inputs";
import { EstiloPicker } from "@/app/ficha/[uid]/estilo-cor-picker";
import { BarraFiltros, casaBusca } from "@/app/ficha/[uid]/barra-filtros";
import { IconePicker } from "@/components/icone-picker";
import { estiloAplicado } from "@/lib/estilos-cor";
import { CATALOGO_PADRAO, caraDoLivro } from "@/lib/tipos-dano";

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

// As pastas da biblioteca são filtros da lista, como as da ficha do jogador:
// cada categoria é uma pasta, exceto as 5 variações de ação (padrão/bônus/
// reação/poderosa/lendária), que cabem juntas na pasta "Ações", igual o
// statblock trata como blocos do mesmo grupo.
type Pasta = { key: string; categorias: ComponenteCategoria[]; label: string; icone: string };
const PASTAS: Pasta[] = [
  // Catálogo de tipos de dano do narrador: as fichas das mesas dele escolhem daqui.
  { key: "tipoDano", categorias: ["tipoDano"], label: "Tipos de dano", icone: "fa-burst" },
  { key: "condicao", categorias: ["condicao"], label: "Condições", icone: "fa-triangle-exclamation" },
  { key: "aspecto", categorias: ["aspecto"], label: "Aspectos", icone: "fa-star" },
  { key: "acoes", categorias: CATEGORIAS_ACAO, label: "Ações", icone: "fa-bolt" },
];

// Rótulo e ícone da categoria; "tipoDano" não é bloco de statblock.
function metaCategoria(categoria: ComponenteCategoria): { label: string; icone: string } {
  if (categoria === "tipoDano") return { label: "Tipo de dano", icone: "fa-burst" };
  const meta = CATEGORIAS_COMPONENTE.find((c) => c.key === categoria);
  return { label: meta?.label ?? categoria, icone: meta?.icone ?? "fa-bolt" };
}

const TODAS_CATEGORIAS = PASTAS.flatMap((p) => p.categorias);

// Cor do chip: a escolhida; condição sem cor cai na automática pelo nome.
function corDoTemplate(t: { nome: string; categoria: ComponenteCategoria; formula: { cor: string } }): string {
  return t.formula.cor || (t.categoria === "condicao" ? corDaCondicao(t.nome || "condicao") : "");
}

// Tipo de dano do livro ainda sem cor nem ícone ganha a cara do livro
// (mesma regra do catálogo que a ficha lê, lib/tipos-dano.ts).
function comCaraDoLivro<T extends Pick<TemplatePayload, "nome" | "categoria" | "formula">>(t: T): T {
  if (t.categoria !== "tipoDano" || t.formula.cor || t.formula.icone) return t;
  const cara = caraDoLivro(t.nome);
  return cara ? { ...t, formula: { ...t.formula, cor: cara.cor, icone: cara.icone } } : t;
}

// Tipo de dano ou condição com a cara que o narrador deu (cor, brilho, ícone).
function ChipDoTemplate({ t: cru }: { t: Pick<TemplatePayload, "nome" | "categoria" | "formula"> }) {
  const t = comCaraDoLivro(cru);
  const { className, style } = estiloAplicado(
    { cor: corDoTemplate(t) || null, cor2: t.formula.cor2 || null, efeito: t.formula.efeito },
    "chip",
  );
  return (
    <span className={`biblioteca-chip ${className}`} style={style}>
      {t.formula.icone && <i className={`fas ${t.formula.icone}`} />}
      <span className="fx-texto">{t.nome || "Sem nome"}</span>
    </span>
  );
}

const temChip = (categoria: ComponenteCategoria) => categoria === "tipoDano" || categoria === "condicao";

type Visualizacao = "lista" | "ficha" | "editor";

type Props = { templatesIniciais: TemplateSerializado[] };

export function TraitsManager({ templatesIniciais }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState(templatesIniciais);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplatePayload>(() => criarTemplateVazio());
  const [salvando, setSalvando] = useState(false);
  const [visualizacao, setVisualizacao] = useState<Visualizacao>("lista");
  // Pasta aberta no filtro; null = tudo.
  const [pastaAtiva, setPastaAtiva] = useState<Pasta | null>(null);
  const [busca, setBusca] = useState("");
  // Pasta de categoria única já entra direto no formulário; "Ações" e a
  // lista sem pasta escolhem a categoria antes.
  const [mostrarPicker, setMostrarPicker] = useState(false);

  const condicoesDisponiveis = templates.filter((t) => t.categoria === "condicao" && t.id !== selecionadoId);

  function voltarParaLista() {
    setVisualizacao("lista");
  }

  function abrirNovo() {
    setSelecionadoId(null);
    if (pastaAtiva?.categorias.length === 1) {
      setDraft({ ...criarTemplateVazio(), categoria: pastaAtiva.categorias[0] });
      setMostrarPicker(false);
    } else {
      setDraft(criarTemplateVazio());
      setMostrarPicker(true);
    }
    setVisualizacao("editor");
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
    setDraft(comCaraDoLivro(draftDeTemplate(t)));
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
        return nova;
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

  async function semearTipos() {
    setSalvando(true);
    try {
      const criados = await semearTiposDano();
      setTemplates((prev) => [...prev.filter((t) => t.categoria !== "tipoDano"), ...criados]);
      router.refresh();
    } catch (err) {
      void Swal.fire({
        icon: "error",
        title: "Erro",
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

  if (visualizacao === "lista") {
    const naPasta = (p: Pasta) => templates.filter((t) => p.categorias.includes(t.categoria));
    const itens = (pastaAtiva ? naPasta(pastaAtiva) : templates)
      .filter((t) => casaBusca(busca, [t.nome, t.textoTemplate, metaCategoria(t.categoria).label]))
      // Na ordem das pastas; dentro delas, tipo de dano na ordem do catálogo e o resto por nome.
      .map((t, i) => ({ t, i, pasta: PASTAS.findIndex((p) => p.categorias.includes(t.categoria)) }))
      .sort(
        (a, b) =>
          a.pasta - b.pasta ||
          (a.t.categoria === "tipoDano" ? a.i - b.i : a.t.nome.localeCompare(b.t.nome, "pt-BR")),
      )
      .map((x) => x.t);
    const semTiposProprios = !templates.some((t) => t.categoria === "tipoDano");
    const naPastaDeTipos = pastaAtiva?.key === "tipoDano";

    return (
      <div className="bestiario-lista-view">
        <div className="biblioteca-topo">
          <BarraFiltros
            busca={busca}
            onBusca={setBusca}
            rotulo="na biblioteca"
            filtros={[["tudo", "Tudo"]] as const}
            filtro={(pastaAtiva ? "pasta" : "tudo") as "tudo"}
            onFiltro={() => setPastaAtiva(null)}
            pastas={PASTAS.map((p) => ({ nome: p.label, total: naPasta(p).length }))}
            pasta={pastaAtiva?.label ?? null}
            onPasta={(nome) => setPastaAtiva(PASTAS.find((p) => p.label === nome) ?? null)}
          >
            {naPastaDeTipos ? (
              <>
                <span className="biblioteca-pasta-dica">
                  As fichas das suas mesas escolhem o tipo de dano desta lista.
                </span>
                {semTiposProprios && (
                  <button type="button" className="bestiario-btn-salvar" onClick={semearTipos} disabled={salvando}>
                    <i className="fas fa-book" /> Personalizar os do livro
                  </button>
                )}
              </>
            ) : pastaAtiva?.key === "condicao" ? (
              <span className="biblioteca-pasta-dica">Condições que as ações das suas criaturas aplicam.</span>
            ) : undefined}
          </BarraFiltros>
          <button type="button" className="bestiario-btn-nova" onClick={abrirNovo}>
            <i className="fas fa-plus" /> {naPastaDeTipos ? "Novo tipo" : "Novo"}
          </button>
        </div>

        {itens.length > 0 ? (
          // Uma seção por pasta: ação não fica lado a lado com tipo de dano ou condição.
          PASTAS.map((p) => {
            const daPasta = itens.filter((t) => p.categorias.includes(t.categoria));
            if (daPasta.length === 0) return null;
            return (
              <section key={p.key} className="biblioteca-secao">
                {!pastaAtiva && (
                  <h3 className="biblioteca-secao-titulo">
                    <i className={`fas ${p.icone}`} /> {p.label}
                    <span className="filtro-pasta-total">{daPasta.length}</span>
                  </h3>
                )}
                <div className="bestiario-grade-cards">
                  {daPasta.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="bestiario-card-item biblioteca-card"
                    onClick={() => abrirFicha(t)}
                  >
                    {temChip(t.categoria) ? (
                      <ChipDoTemplate t={t} />
                    ) : (
                      <span className="bestiario-card-nome">{t.nome}</span>
                    )}
                    {t.textoTemplate && <span className="biblioteca-card-descricao">{t.textoTemplate}</span>}
                    <span className="bestiario-card-meta">
                      <i className={`fas ${metaCategoria(t.categoria).icone}`} /> {metaCategoria(t.categoria).label}
                    </span>
                  </button>
                  ))}
                </div>
              </section>
            );
          })
        ) : naPastaDeTipos && semTiposProprios && !busca ? (
          <div className="filtros-vazio">
            Nenhum tipo próprio: valem os do livro.
            <div className="biblioteca-padrao">
              {CATALOGO_PADRAO.map((t) => (
                <ChipDoTemplate
                  key={t.nome}
                  t={{
                    nome: t.nome,
                    categoria: "tipoDano",
                    formula: { ...criarTemplateVazio().formula, cor: t.cor ?? "", icone: t.icone ?? "" },
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="filtros-vazio">{busca ? "Nada encontrado." : "Nada por aqui ainda."}</p>
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
          <h2>{temChip(t.categoria) ? <ChipDoTemplate t={t} /> : t.nome}</h2>
          <p className="bestiario-ficha-subtitulo">
            <i className={`fas ${metaCategoria(t.categoria).icone}`} /> {metaCategoria(t.categoria).label}
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
  // Tipo de dano é só nome e descrição.
  const ehTipoDano = draft.categoria === "tipoDano";
  const oQue = ehTipoDano ? "tipo de dano" : "trait";

  return (
    <section className="bestiario-editor">
      {mostrarPicker ? (
        <>
          <div className="bestiario-editor-header">
            <button type="button" className="bestiario-voltar-lista" onClick={voltarParaLista}>
              <i className="fas fa-arrow-left" /> Voltar
            </button>
            <h2>O que você quer criar?</h2>
          </div>
          <div className="bestiario-secao">
            <div className="wizard-origem-opcoes">
              {(pastaAtiva?.categorias ?? TODAS_CATEGORIAS).map((key) => {
                const meta = metaCategoria(key);
                return (
                  <button key={key} type="button" className="wizard-origem-opcao" onClick={() => escolherCategoria(key)}>
                    <i className={`fas ${meta.icone}`} />
                    <strong>{meta.label}</strong>
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
            <h2>{selecionadoId ? `Editar ${oQue}` : `Novo ${oQue}`}</h2>
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
              {!pastaAtiva && !ehTipoDano && !ehCondicao && (
                <label>
                  Categoria
                  <select value={draft.categoria} onChange={(e) => campo("categoria", e.target.value as TemplatePayload["categoria"])}>
                    {CATEGORIAS_COMPONENTE.filter((c) => c.key !== "condicao").map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!ehCondicao && !ehTipoDano && (
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

            {ehCondicao && (
              // <div> e não <label>: o picker tem vários botões, e um label
              // repassaria o clique pro primeiro deles.
              <div className="trait-condicao-estilo">
                <span className="trait-condicao-estilo-titulo">Cor e brilho</span>
                <EstiloPicker
                  cor={draft.formula.cor || corDaCondicao(draft.nome || "condicao")}
                  cor2={draft.formula.cor2}
                  efeito={draft.formula.efeito}
                  permitirSemCor={false}
                  familiaAmostra="chip"
                  amostra={draft.nome.trim().slice(0, 14) || "Aa"}
                  onChange={(patch) => {
                    if (patch.cor !== undefined) formulaCampo("cor", patch.cor);
                    if (patch.cor2 !== undefined) formulaCampo("cor2", patch.cor2);
                    if (patch.efeito !== undefined) formulaCampo("efeito", patch.efeito);
                  }}
                />
              </div>
            )}

            {ehTipoDano && (
              // <div> e não <label>, pelo mesmo motivo do estilo da condição.
              <div className="trait-condicao-estilo">
                <span className="trait-condicao-estilo-titulo">Como aparece na ficha</span>
                <ChipDoTemplate t={draft} />
                <IconePicker valor={draft.formula.icone} onChange={(slug) => formulaCampo("icone", slug)} />
                {draft.formula.icone && (
                  <button type="button" className="bestiario-voltar-lista" onClick={() => formulaCampo("icone", "")}>
                    <i className="fas fa-xmark" /> Sem ícone
                  </button>
                )}
                <EstiloPicker
                  cor={draft.formula.cor}
                  cor2={draft.formula.cor2}
                  efeito={draft.formula.efeito}
                  familiaAmostra="chip"
                  amostra={draft.nome.trim().slice(0, 14) || "Aa"}
                  onChange={(patch) => {
                    if (patch.cor !== undefined) formulaCampo("cor", patch.cor);
                    if (patch.cor2 !== undefined) formulaCampo("cor2", patch.cor2);
                    if (patch.efeito !== undefined) formulaCampo("efeito", patch.efeito);
                  }}
                />
              </div>
            )}

            {ehTipoDano ? (
              <label>
                Descrição (opcional)
                <textarea
                  className="bestiario-textarea-descricao"
                  value={draft.textoTemplate}
                  onChange={(e) => campo("textoTemplate", e.target.value)}
                  placeholder="Ex: chamas, calor intenso, explosões."
                />
              </label>
            ) : ehCondicao ? (
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

            {!ehTipoDano && (
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
            )}
          </div>
        </>
      )}
    </section>
  );
}
