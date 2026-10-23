"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { criarTemplate, atualizarTemplate, deletarTemplate, semearTiposDano } from "@/app/bestiario/traits-actions";
import { criarTemplateVazio, textoEfeitoAcao, textoEfeitoExtra } from "@/app/bestiario/utils";
import { porDono } from "@/app/bestiario/componentes-editor";
import { corDaCondicao } from "@/app/bestiario/cor-condicao";
import { destacarCondicoes } from "@/app/bestiario/destacar-condicoes";
import { EfeitosEditor, EfeitosExtrasEditor, GatilhoCampo, TecnicaCampos, UsosLimitadosEditor } from "@/app/bestiario/componente-editor";
import { CATEGORIAS_ACAO, CATEGORIAS_COMPONENTE } from "@/app/bestiario/types";
import type {
  CondicaoEfeito,
  ComponenteCategoria,
  TemplatePayload,
  TemplateSerializado,
} from "@/app/bestiario/types";
import { ListaTextoInput } from "@/app/bestiario/inputs";
import { EstiloPicker } from "@/app/ficha/[uid]/estilo-cor-picker";
import { BarraFiltros, casaBusca } from "@/app/ficha/[uid]/barra-filtros";
import { IconePicker } from "@/components/icone-picker";
import { estiloAplicado } from "@/lib/estilos-cor";
import { CATALOGO_PADRAO, caraDoLivro } from "@/lib/tipos-dano";
import { CONDICOES_DO_LIVRO } from "@/lib/condicoes";
import { origemDaMecanica } from "@/lib/condicoes-mecanica";
import { CondicaoDaBiblioteca, linhasDaCondicao } from "./mecanica-condicao";
import { useVisaoNoHistorico } from "@/lib/use-visao-no-historico";

function draftDeTemplate(t: TemplateSerializado): TemplatePayload {
  const { id: _id, criadoEm: _criadoEm, ...payload } = t;
  return payload;
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

// Pastas que se dividem pela criatura dona de cada ação ou aspecto.
const temDono = (p: Pasta) => p.key === "aspecto" || p.key === "acoes";

type Visualizacao = "lista" | "ficha" | "editor";

type Props = { templatesIniciais: TemplateSerializado[] };

export function TraitsManager({ templatesIniciais }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState(templatesIniciais);
  // Tipo de dano criado de dentro de um efeito chega pelo servidor
  // (router.refresh troca a prop): resincroniza durante o render.
  const [templatesDaProp, setTemplatesDaProp] = useState(templatesIniciais);
  if (templatesIniciais !== templatesDaProp) {
    setTemplatesDaProp(templatesIniciais);
    setTemplates(templatesIniciais);
  }
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

  // Ficha e editor entram no histórico: o Voltar (da página ou do navegador)
  // recua uma tela, em vez de sair da Biblioteca.
  const visoes = useVisaoNoHistorico<Visualizacao>("lista", (v) => setVisualizacao(v));

  function voltarParaLista() {
    setVisualizacao("lista");
    visoes.trocar("lista");
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
    visoes.abrir("editor");
  }

  function escolherCategoria(categoria: TemplatePayload["categoria"]) {
    setDraft((atual) => ({ ...atual, categoria }));
    setMostrarPicker(false);
  }

  function abrirFicha(t: TemplateSerializado) {
    setSelecionadoId(t.id);
    setVisualizacao("ficha");
    visoes.abrir("ficha");
  }

  function abrirEdicaoDaFicha() {
    const t = templates.find((x) => x.id === selecionadoId);
    if (!t) return;
    setDraft(comCaraDoLivro(draftDeTemplate(t)));
    setMostrarPicker(false);
    setVisualizacao("editor");
    visoes.abrir("editor");
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
      visoes.trocar("ficha");
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
      .filter((t) =>
        casaBusca(busca, [t.nome, t.textoTemplate, metaCategoria(t.categoria).label, t.formula.origem?.nome ?? ""]),
      )
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
    const cartao = (t: TemplateSerializado) => {
      // Condição: as linhas do que ela faz vêm antes da descrição.
      const ehCond = t.categoria === "condicao";
      const linhas = ehCond ? linhasDaCondicao(t.nome, t.formula.mecanica, t.formula.padroes) : [];
      const doLivro = ehCond && origemDaMecanica(t.nome, t.formula.mecanica) === "livro";
      return (
        <button key={t.id} type="button" className="bestiario-card-item biblioteca-card" onClick={() => abrirFicha(t)}>
          {temChip(t.categoria) ? <ChipDoTemplate t={t} /> : <span className="bestiario-card-nome">{t.nome}</span>}
          {linhas.length > 0 && <span className="biblioteca-card-descricao">{linhas.join(" · ")}</span>}
          {doLivro && (
            <span className="biblioteca-card-aviso">
              <i className="fas fa-book" /> Usando a regra do livro
            </span>
          )}
          {t.textoTemplate && <span className="biblioteca-card-descricao">{t.textoTemplate}</span>}
          <span className="bestiario-card-meta">
            <i className={`fas ${metaCategoria(t.categoria).icone}`} /> {metaCategoria(t.categoria).label}
          </span>
        </button>
      );
    };

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
            ) : pastaAtiva && temDono(pastaAtiva) ? (
              <span className="biblioteca-pasta-dica">
                O que você cria numa criatura fica guardado aqui, na pasta dela, pra usar em outras.
              </span>
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
                {temDono(p) ? (
                  // Uma pasta por criatura dona; o que nasceu aqui fica em "Avulsos".
                  porDono(daPasta).map(({ dono, itens: doDono }) => (
                    <details key={dono} className="biblioteca-dono" open>
                      <summary>
                        <i className="fas fa-folder" /> {dono}
                        <span className="filtro-pasta-total">{doDono.length}</span>
                      </summary>
                      <div className="bestiario-grade-cards">{doDono.map(cartao)}</div>
                    </details>
                  ))
                ) : (
                  <div className="bestiario-grade-cards">{daPasta.map(cartao)}</div>
                )}
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
    const badges = [
      ...f.efeitos.map(textoEfeitoAcao).filter((x): x is string => x !== null),
      ...f.efeitosExtras.map((e) => textoEfeitoExtra(e)),
    ];
    const condicoes = f.efeitos.filter((e): e is CondicaoEfeito => e.tipo === "condicao");
    // Condição: o que ela faz, em linhas curtas, e de onde vem.
    if (t.categoria === "condicao") {
      badges.push(...linhasDaCondicao(t.nome, f.mecanica, f.padroes));
      const origem = origemDaMecanica(t.nome, f.mecanica);
      badges.push(
        origem === "livro" ? "Mecânica: do livro" : origem === "texto" ? "Mecânica: só texto" : "Mecânica: personalizada",
      );
    }
    return (
      <div className="bestiario-ficha-view">
        <div className="bestiario-ficha-toolbar">
          <button type="button" className="bestiario-btn-salvar" onClick={abrirEdicaoDaFicha}>
            <i className="fas fa-pen" /> Editar
          </button>
          <button type="button" className="bestiario-ficha-fechar" onClick={visoes.voltar} title="Fechar">
            <i className="fas fa-xmark" />
          </button>
        </div>
        <div className="bestiario-ficha-cabecalho">
          <h2>{temChip(t.categoria) ? <ChipDoTemplate t={t} /> : t.nome}</h2>
          <p className="bestiario-ficha-subtitulo">
            <i className={`fas ${metaCategoria(t.categoria).icone}`} /> {metaCategoria(t.categoria).label}
            {f.origem?.nome && (
              <>
                {" · "}
                <i className="fas fa-folder" /> {f.origem.nome}
              </>
            )}
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
            <button type="button" className="bestiario-voltar-lista" onClick={visoes.voltar}>
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
            <button type="button" className="bestiario-voltar-lista" onClick={visoes.voltar}>
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
              <>
                <CondicaoDaBiblioteca
                  nome={draft.nome}
                  mecanica={draft.formula.mecanica}
                  padroes={draft.formula.padroes}
                  descricao={draft.textoTemplate}
                  onDescricao={(texto) => campo("textoTemplate", texto)}
                  onPadroes={(p) => formulaCampo("padroes", p)}
                  condicoes={[
                    ...new Set([
                      ...templates.filter((t) => t.categoria === "condicao").map((t) => t.nome),
                      ...CONDICOES_DO_LIVRO,
                      "Queimadura",
                    ]),
                  ].filter((nome) => nome !== draft.nome)}
                  onMecanica={(m) => formulaCampo("mecanica", m)}
                />
              </>
            ) : (
              <>
                {draft.categoria === "reacao" && (
                  <GatilhoCampo valor={draft.formula.gatilho} onChange={(g) => formulaCampo("gatilho", g)} />
                )}
                {draft.categoria !== "aspecto" && (
                  <TecnicaCampos
                    tecnica={draft.formula.tecnica}
                    grau={draft.formula.grau}
                    onChange={(patch) => {
                      if (patch.tecnica !== undefined) formulaCampo("tecnica", patch.tecnica);
                      if (patch.grau !== undefined) formulaCampo("grau", patch.grau);
                    }}
                  />
                )}
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

                <EfeitosExtrasEditor
                  efeitos={draft.formula.efeitosExtras}
                  recursos={[]}
                  onChange={(efeitos) => formulaCampo("efeitosExtras", efeitos)}
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
