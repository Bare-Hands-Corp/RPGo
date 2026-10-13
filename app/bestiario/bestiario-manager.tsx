"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { atualizarCriatura, deletarCriatura } from "./actions";
import { criarCriaturaVazia, draftDeCriatura } from "./utils";
import type { CriaturaPayload, CriaturaSerializada, TemplateSerializado } from "./types";
import {
  CamposAtributos,
  CamposDefesas,
  CamposDeslocamento,
  CamposIdentidade,
  CamposNivel,
  CamposNotas,
  CamposTestes,
  nomeDoTamanho,
  sugestoesDe,
  sugestoesDeAcao,
} from "./campos-criatura";
import { ComponentesEditor } from "./componentes-editor";
import { RecursosEditor } from "./recursos-editor";
import { FichaCriaturaView } from "./ficha-view";
import { WizardCriatura } from "./wizard-criatura";

type Props = { criaturasIniciais: CriaturaSerializada[]; templates: TemplateSerializado[]; linhagens: string[] };

export function BestiarioManager({ criaturasIniciais, templates, linhagens }: Props) {
  const router = useRouter();
  const [criaturas, setCriaturas] = useState(criaturasIniciais);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CriaturaPayload>(() => criarCriaturaVazia());
  // Como a criatura estava ao abrir ou ao salvar por último, pra saber se há o que salvar.
  const [salvo, setSalvo] = useState("");
  const [salvando, setSalvando] = useState(false);

  // A lista é a visão padrão. Clicar num card seleciona a criatura e mostra
  // a ficha de visualização (somente leitura, campos vazios ocultos) ao lado
  // da lista, na mesma tela — só o editor ocupa a página inteira.
  const [visualizacao, setVisualizacao] = useState<"lista" | "editor">("lista");
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [wizardAberto, setWizardAberto] = useState(false);

  const sugestoes = sugestoesDe(criaturas);
  const alterado = visualizacao === "editor" && JSON.stringify(draft) !== salvo;

  const criaturasFiltradas = criaturas.filter((c) => {
    if (filtroCategoria && c.categoria !== filtroCategoria) return false;
    if (!busca.trim()) return true;
    const alvo = busca.trim().toLowerCase();
    return (
      c.nome.toLowerCase().includes(alvo) ||
      c.categoria.toLowerCase().includes(alvo) ||
      c.tags.some((t) => t.toLowerCase().includes(alvo))
    );
  });

  // O wizard já salva a criatura e passa pelas mesmas seções do editor:
  // ao terminar, volta pra lista com a ficha dela aberta.
  function aoTerminarWizard(nova: CriaturaSerializada) {
    setCriaturas((prev) => [...prev, nova].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    setWizardAberto(false);
    setSelecionadaId(nova.id);
    router.refresh();
  }

  function abrirEdicao(c: CriaturaSerializada) {
    const inicial = draftDeCriatura(c);
    setSelecionadaId(c.id);
    setDraft(inicial);
    setSalvo(JSON.stringify(inicial));
    setVisualizacao("editor");
  }

  async function voltarParaLista() {
    if (alterado) {
      const resposta = await Swal.fire({
        icon: "warning",
        title: "Sair sem salvar?",
        text: "As alterações desta criatura serão perdidas.",
        showCancelButton: true,
        confirmButtonText: "Sair sem salvar",
        cancelButtonText: "Continuar editando",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      if (!resposta.isConfirmed) return;
    }
    setVisualizacao("lista");
  }

  function campo<K extends keyof CriaturaPayload>(chave: K, valor: CriaturaPayload[K]) {
    setDraft((atual) => ({ ...atual, [chave]: valor }));
  }

  async function salvar() {
    if (!selecionadaId) return;
    if (!draft.nome.trim() || !draft.categoria.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Nome e categoria são obrigatórios",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }
    setSalvando(true);
    try {
      const salva = await atualizarCriatura(selecionadaId, draft);
      const novo = draftDeCriatura(salva);
      setCriaturas((prev) =>
        prev.map((c) => (c.id === salva.id ? salva : c)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      );
      setDraft(novo);
      setSalvo(JSON.stringify(novo));
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
    if (!selecionadaId) return;
    const confirmacao = await Swal.fire({
      icon: "warning",
      title: `Remover "${draft.nome}"?`,
      text: "As ações dela continuam guardadas na biblioteca.",
      showCancelButton: true,
      confirmButtonText: "Sim, remover",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirmacao.isConfirmed) return;

    try {
      await deletarCriatura(selecionadaId);
      setCriaturas((prev) => prev.filter((c) => c.id !== selecionadaId));
      setSelecionadaId(null);
      setVisualizacao("lista");
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

  if (wizardAberto) {
    return (
      <WizardCriatura
        criaturas={criaturas}
        templates={templates}
        linhagens={linhagens}
        onCriada={aoTerminarWizard}
        onCancelar={() => setWizardAberto(false)}
      />
    );
  }

  if (visualizacao === "lista") {
    const selecionada = criaturas.find((c) => c.id === selecionadaId) ?? null;

    return (
      <div className="bestiario-split">
        <div className="bestiario-lista-view">
          <div className="bestiario-lista-toolbar">
            <div className="bestiario-lista-busca">
              <i className="fas fa-magnifying-glass" />
              <input
                placeholder="Buscar por nome, categoria ou tag..."
                aria-label="Buscar criatura"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <select
              value={filtroCategoria}
              aria-label="Filtrar por categoria"
              onChange={(e) => setFiltroCategoria(e.target.value)}
            >
              <option value="">Todas as categorias</option>
              {sugestoes.categorias.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <Link href="/bestiario/encontros" className="bestiario-btn-biblioteca">
              <i className="fas fa-people-group" /> Esquadrões e Encontros
            </Link>
            <button type="button" className="bestiario-btn-nova" onClick={() => setWizardAberto(true)}>
              <i className="fas fa-plus" /> Nova criatura
            </button>
          </div>

          {criaturas.length === 0 ? (
            <p className="bestiario-vazio">Nenhuma criatura cadastrada ainda.</p>
          ) : criaturasFiltradas.length === 0 ? (
            <p className="bestiario-vazio">Nenhuma criatura bate com esse filtro.</p>
          ) : (
            <div className="bestiario-grade-cards">
              {criaturasFiltradas.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={"bestiario-card-item" + (c.id === selecionadaId ? " active" : "")}
                  aria-pressed={c.id === selecionadaId}
                  onClick={() => setSelecionadaId(c.id)}
                >
                  <span className="bestiario-card-nome">{c.nome}</span>
                  <span className="bestiario-card-meta">
                    ND {c.nd} · {nomeDoTamanho(c.tamanho)} · {c.categoria || "sem categoria"}
                  </span>
                  {c.tags.length > 0 && <span className="bestiario-card-tags">{c.tags.join(", ")}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {selecionada && (
          <FichaCriaturaView
            key={selecionada.id}
            criatura={selecionada}
            onEditar={() => abrirEdicao(selecionada)}
            onFechar={() => setSelecionadaId(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="bestiario-editor-view">
      <section className="bestiario-editor">
        <div className="bestiario-editor-header fixo">
          <button type="button" className="bestiario-voltar-lista" onClick={() => void voltarParaLista()}>
            <i className="fas fa-arrow-left" /> Voltar
          </button>
          <h2>{draft.nome.trim() || "Editar criatura"}</h2>
          <div className="bestiario-editor-acoes">
            <span className={`bestiario-editor-estado${alterado ? " alterado" : ""}`} role="status">
              {alterado ? "Alterações não salvas" : "Tudo salvo"}
            </span>
            <button type="button" className="bestiario-btn-remover" onClick={remover}>
              <i className="fas fa-trash" /> Remover
            </button>
            <button type="button" className="bestiario-btn-salvar" onClick={salvar} disabled={salvando || !alterado}>
              <i className={`fas ${salvando ? "fa-spinner fa-spin" : "fa-floppy-disk"}`} />
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

        <CamposIdentidade draft={draft} campo={campo} sugestoes={sugestoes} linhagens={linhagens} />
        <CamposNivel draft={draft} campo={campo} />
        <CamposDeslocamento draft={draft} campo={campo} />
        <CamposAtributos draft={draft} campo={campo} />
        <CamposTestes draft={draft} campo={campo} />
        <CamposDefesas draft={draft} campo={campo} />

        <div className="bestiario-secao">
          <h3>
            <i className="fas fa-droplet" /> Recursos
          </h3>
          <p className="bestiario-sublabel">
            Contadores próprios da criatura; em combate cada cópia tem o seu. Uma ação gasta um recurso com o efeito de
            ficha “Recurso”.
          </p>
          <RecursosEditor recursos={draft.recursos} onChange={(v) => campo("recursos", v)} />
        </div>

        <div className="bestiario-secao">
          <h3>
            <i className="fas fa-bolt" /> Ações e aspectos
          </h3>
          <p className="bestiario-sublabel">
            Ao salvar, cada ação e aspecto fica guardado na biblioteca, na pasta desta criatura, pra reaproveitar em
            outras.
          </p>
          <ComponentesEditor
            componentes={draft.componentes}
            onChange={(atualizar) => setDraft((atual) => ({ ...atual, componentes: atualizar(atual.componentes) }))}
            templates={templates}
            recursos={draft.recursos}
            sugestoes={sugestoesDeAcao(draft)}
          />
        </div>

        <CamposNotas draft={draft} campo={campo} />
      </section>
    </div>
  );
}
