"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { criarCriatura, atualizarCriatura, deletarCriatura } from "./actions";
import { aplicarTemplate, criarComponenteVazio, criarCriaturaVazia, draftDeCriatura, ndParaValor } from "./utils";
import { CATEGORIAS_COMPONENTE, TIPOS_DANO_SUGERIDOS } from "./types";
import type { ComponenteCategoria, ComponentePayload, CriaturaPayload, CriaturaSerializada, TemplateSerializado } from "./types";
import { ListaTextoInput, NumeroInput } from "./inputs";
import { ComponenteEditor } from "./componente-editor";
import { FichaCriaturaView } from "./ficha-view";
import { WizardCriatura } from "./wizard-criatura";
import { PickerAcaoPreset, type PresetAcao } from "./presets-acao";

function uuid() {
  return crypto.randomUUID();
}

type Props = { criaturasIniciais: CriaturaSerializada[]; templates: TemplateSerializado[]; linhagens: string[] };

export function BestiarioManager({ criaturasIniciais, templates, linhagens }: Props) {
  const router = useRouter();
  const [criaturas, setCriaturas] = useState(criaturasIniciais);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CriaturaPayload>(() => criarCriaturaVazia());
  const [salvando, setSalvando] = useState(false);

  // A lista é a visão padrão. Clicar num card seleciona a criatura e mostra
  // a ficha de visualização (somente leitura, campos vazios ocultos) ao lado
  // da lista, na mesma tela — só o editor ocupa a página inteira.
  const [visualizacao, setVisualizacao] = useState<"lista" | "editor">("lista");
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [wizardAberto, setWizardAberto] = useState(false);
  const [presetPickerCategoria, setPresetPickerCategoria] = useState<ComponenteCategoria | null>(null);

  const categorias = Array.from(new Set(criaturas.map((c) => c.categoria).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const condicoesDisponiveis = templates.filter((t) => t.categoria === "condicao");

  const criaturasFiltradas = criaturas.filter((c) => {
    if (filtroCategoria && c.categoria !== filtroCategoria) return false;
    if (!busca.trim()) return true;
    const alvo = busca.trim().toLowerCase();
    return c.nome.toLowerCase().includes(alvo) || c.categoria.toLowerCase().includes(alvo);
  });

  function abrirNova() {
    setWizardAberto(true);
  }

  // O wizard já salva a criatura (ele mesmo chama criarCriatura) — aqui só
  // reflete o resultado na lista e abre o editor completo pra ajustes finos
  // (ações detalhadas, notas do narrador etc. que o wizard não cobre).
  function aoTerminarWizard(nova: CriaturaSerializada) {
    setCriaturas((prev) => [...prev, nova].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    setWizardAberto(false);
    abrirEdicao(nova);
    router.refresh();
  }

  function abrirFicha(c: CriaturaSerializada) {
    setSelecionadaId(c.id);
  }

  function fecharFicha() {
    setSelecionadaId(null);
  }

  function abrirEdicao(c: CriaturaSerializada) {
    setSelecionadaId(c.id);
    setDraft(draftDeCriatura(c));
    setVisualizacao("editor");
  }

  function voltarParaLista() {
    setVisualizacao("lista");
  }

  function campo<K extends keyof CriaturaPayload>(chave: K, valor: CriaturaPayload[K]) {
    setDraft((atual) => ({ ...atual, [chave]: valor }));
  }

  function adicionarComponente(categoria: ComponenteCategoria) {
    setDraft((atual) => ({
      ...atual,
      componentes: [...atual.componentes, criarComponenteVazio(categoria, atual.componentes.length)],
    }));
  }

  function adicionarComponenteComPreset(categoria: ComponenteCategoria, preset: PresetAcao) {
    setDraft((atual) => ({
      ...atual,
      componentes: [
        ...atual.componentes,
        { ...criarComponenteVazio(categoria, atual.componentes.length), ...preset.criar() },
      ],
    }));
    setPresetPickerCategoria(null);
  }

  function aplicarComponenteDaBiblioteca(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setDraft((atual) => ({
      ...atual,
      componentes: [...atual.componentes, aplicarTemplate(template, atual.componentes.length)],
    }));
  }

  function atualizarComponente(id: string, patch: Partial<ComponentePayload>) {
    setDraft((atual) => ({
      ...atual,
      componentes: atual.componentes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }

  function removerComponente(id: string) {
    setDraft((atual) => ({ ...atual, componentes: atual.componentes.filter((c) => c.id !== id) }));
  }

  function adicionarPericia() {
    setDraft((atual) => ({
      ...atual,
      caracteristicas: {
        ...atual.caracteristicas,
        pericias: [...atual.caracteristicas.pericias, { id: uuid(), nome: "", bonus: 0 }],
      },
    }));
  }

  function adicionarSalvaguarda() {
    setDraft((atual) => ({
      ...atual,
      caracteristicas: {
        ...atual.caracteristicas,
        salvaguardas: [...atual.caracteristicas.salvaguardas, { id: uuid(), nome: "", bonus: 0 }],
      },
    }));
  }

  async function salvar() {
    if (!draft.nome.trim()) {
      void Swal.fire({ icon: "warning", title: "Nome é obrigatório", background: "var(--bg-card)", color: "var(--text-main)" });
      return;
    }
    setSalvando(true);
    try {
      const salva = selecionadaId
        ? await atualizarCriatura(selecionadaId, draft)
        : await criarCriatura(draft);

      setCriaturas((prev) => {
        const existe = prev.some((c) => c.id === salva.id);
        const nova = existe ? prev.map((c) => (c.id === salva.id ? salva : c)) : [...prev, salva];
        return nova.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      });
      setSelecionadaId(salva.id);
      setDraft(draftDeCriatura(salva));
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
                placeholder="Buscar por nome ou categoria..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option value="">Todas as categorias</option>
              {categorias.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <Link href="/bestiario/biblioteca" className="bestiario-btn-biblioteca">
              <i className="fas fa-book" /> Biblioteca de traits
            </Link>
            <Link href="/bestiario/encontros" className="bestiario-btn-biblioteca">
              <i className="fas fa-people-group" /> Esquadrões e Encontros
            </Link>
            <button type="button" className="bestiario-btn-nova" onClick={abrirNova}>
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
                  onClick={() => abrirFicha(c)}
                >
                  <span className="bestiario-card-nome">{c.nome}</span>
                  <span className="bestiario-card-meta">
                    ND {c.nd} · {c.categoria || "sem categoria"}
                  </span>
                  {c.tags.length > 0 && (
                    <span className="bestiario-card-tags">{c.tags.join(", ")}</span>
                  )}
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
            onFechar={fecharFicha}
          />
        )}
      </div>
    );
  }

  return (
    <div className="bestiario-editor-view">
      <section className="bestiario-editor">
        <div className="bestiario-editor-header">
          <button type="button" className="bestiario-voltar-lista" onClick={voltarParaLista}>
            <i className="fas fa-arrow-left" /> Voltar
          </button>
          <h2>{selecionadaId ? "Editar criatura" : "Nova criatura"}</h2>
          <div className="bestiario-editor-acoes">
            {selecionadaId && (
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
          <h3>
            <i className="fas fa-id-card" /> Identidade
          </h3>
          <div className="bestiario-grid">
            <label>
              Nome
              <input value={draft.nome} onChange={(e) => campo("nome", e.target.value)} />
            </label>
            <label>
              Categoria
              <input
                value={draft.categoria}
                placeholder="Marinha, Pirata, Animal..."
                onChange={(e) => campo("categoria", e.target.value)}
              />
            </label>
            <label>
              Tamanho
              <select value={draft.tamanho} onChange={(e) => campo("tamanho", e.target.value)}>
                {["minusculo", "pequeno", "medio", "grande", "enorme", "colossal"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Personalidade
              <input
                value={draft.personalidade ?? ""}
                placeholder="tático, covarde, kamikaze..."
                onChange={(e) => campo("personalidade", e.target.value || null)}
              />
            </label>
            <label className="bestiario-span-2">
              Tags (separadas por vírgula)
              <ListaTextoInput value={draft.tags} onChange={(v) => campo("tags", v)} />
            </label>
          </div>
        </div>

        <div className="bestiario-secao">
          <h3>
            <i className="fas fa-shield-halved" /> Nível e defesas
          </h3>
          <div className="bestiario-grid">
            <label>
              ND
              <input
                value={draft.nd}
                placeholder="1/8, 1/4, 2..."
                onChange={(e) => {
                  const nd = e.target.value;
                  setDraft((atual) => ({ ...atual, nd, ndValor: ndParaValor(nd) }));
                }}
              />
            </label>
            <label>
              XP
              <NumeroInput value={draft.xp} onChange={(v) => campo("xp", v ?? 0)} />
            </label>
            <label>
              Pontos de Poder
              <NumeroInput value={draft.pontosPoder} onChange={(v) => campo("pontosPoder", v ?? 0)} />
            </label>
            <label>
              Bônus de Proficiência
              <NumeroInput value={draft.bonusProficiencia} onChange={(v) => campo("bonusProficiencia", v ?? 0)} />
            </label>
            <label>
              Classe de Resistência
              <NumeroInput value={draft.classeResistencia} onChange={(v) => campo("classeResistencia", v ?? 0)} />
            </label>
            <label>
              Classe de Dificuldade
              <NumeroInput value={draft.classeDificuldade} onChange={(v) => campo("classeDificuldade", v ?? 0)} />
            </label>
            <label>
              PV (fórmula)
              <input value={draft.pvFormula} placeholder="7d12+7" onChange={(e) => campo("pvFormula", e.target.value)} />
            </label>
            <label>
              PV (médio)
              <NumeroInput value={draft.pvMedio} onChange={(v) => campo("pvMedio", v ?? 0)} />
            </label>
          </div>
        </div>

        <div className="bestiario-secao">
          <h3>
            <i className="fas fa-dumbbell" /> Atributos
          </h3>
          <div className="bestiario-grid bestiario-grid--atributos">
            {(["forca", "destreza", "constituicao", "sabedoria", "presenca", "vontade"] as const).map((attr) => (
              <label key={attr}>
                {attr}
                <NumeroInput value={draft[attr]} onChange={(v) => campo(attr, v ?? 0)} />
              </label>
            ))}
          </div>
        </div>

        <div className="bestiario-secao">
          <h3>
            <i className="fas fa-person-running" /> Deslocamento
          </h3>
          <div className="bestiario-grid">
            <label>
              Terrestre (m)
              <NumeroInput value={draft.deslocamento} onChange={(v) => campo("deslocamento", v ?? 0)} />
            </label>
            <label>
              Nado (m)
              <NumeroInput allowNull value={draft.deslocamentoNado} onChange={(v) => campo("deslocamentoNado", v)} />
            </label>
            <label>
              Voo (m)
              <NumeroInput allowNull value={draft.deslocamentoVoo} onChange={(v) => campo("deslocamentoVoo", v)} />
            </label>
          </div>
        </div>

        <div className="bestiario-secao">
          <h3>
            <i className="fas fa-check-double" /> Perícias, salvaguardas e sentidos
          </h3>
          <div className="bestiario-lista-linhas">
            {draft.caracteristicas.pericias.map((p, i) => (
              <div key={p.id} className="bestiario-linha-bonus">
                <input
                  placeholder="Percepção"
                  value={p.nome}
                  onChange={(e) =>
                    campo("caracteristicas", {
                      ...draft.caracteristicas,
                      pericias: draft.caracteristicas.pericias.map((x, idx) => (idx === i ? { ...x, nome: e.target.value } : x)),
                    })
                  }
                />
                <NumeroInput
                  value={p.bonus}
                  onChange={(v) =>
                    campo("caracteristicas", {
                      ...draft.caracteristicas,
                      pericias: draft.caracteristicas.pericias.map((x, idx) => (idx === i ? { ...x, bonus: v ?? 0 } : x)),
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    campo("caracteristicas", {
                      ...draft.caracteristicas,
                      pericias: draft.caracteristicas.pericias.filter((_, idx) => idx !== i),
                    })
                  }
                >
                  <i className="fas fa-xmark" />
                </button>
              </div>
            ))}
            <button type="button" className="bestiario-btn-add" onClick={adicionarPericia}>
              <i className="fas fa-plus" /> Perícia
            </button>
          </div>

          <div className="bestiario-lista-linhas">
            {draft.caracteristicas.salvaguardas.map((s, i) => (
              <div key={s.id} className="bestiario-linha-bonus">
                <input
                  placeholder="Força"
                  value={s.nome}
                  onChange={(e) =>
                    campo("caracteristicas", {
                      ...draft.caracteristicas,
                      salvaguardas: draft.caracteristicas.salvaguardas.map((x, idx) =>
                        idx === i ? { ...x, nome: e.target.value } : x,
                      ),
                    })
                  }
                />
                <NumeroInput
                  value={s.bonus}
                  onChange={(v) =>
                    campo("caracteristicas", {
                      ...draft.caracteristicas,
                      salvaguardas: draft.caracteristicas.salvaguardas.map((x, idx) =>
                        idx === i ? { ...x, bonus: v ?? 0 } : x,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    campo("caracteristicas", {
                      ...draft.caracteristicas,
                      salvaguardas: draft.caracteristicas.salvaguardas.filter((_, idx) => idx !== i),
                    })
                  }
                >
                  <i className="fas fa-xmark" />
                </button>
              </div>
            ))}
            <button type="button" className="bestiario-btn-add" onClick={adicionarSalvaguarda}>
              <i className="fas fa-plus" /> Salvaguarda
            </button>
          </div>

          <div className="bestiario-grid">
            <label>
              Percepção Passiva
              <NumeroInput
                allowNull
                value={draft.caracteristicas.percepcaoPassiva}
                onChange={(v) => campo("caracteristicas", { ...draft.caracteristicas, percepcaoPassiva: v })}
              />
            </label>
            <label className="bestiario-span-2">
              Outros sentidos
              <input
                value={draft.caracteristicas.sentidosExtras}
                onChange={(e) => campo("caracteristicas", { ...draft.caracteristicas, sentidosExtras: e.target.value })}
              />
            </label>
          </div>
        </div>

        <div className="bestiario-secao">
          <h3>
            <i className="fas fa-shield" /> Resistências, imunidades e vulnerabilidades
          </h3>
          <div className="bestiario-grid">
            <label className="bestiario-span-2">
              Resistência a dano (vírgula)
              <ListaTextoInput
                list="tipos-dano-sugeridos"
                value={draft.resistencias.danoResistencia}
                onChange={(v) => campo("resistencias", { ...draft.resistencias, danoResistencia: v })}
              />
            </label>
            <label className="bestiario-span-2">
              Imunidade a dano (vírgula)
              <ListaTextoInput
                list="tipos-dano-sugeridos"
                value={draft.resistencias.danoImunidade}
                onChange={(v) => campo("resistencias", { ...draft.resistencias, danoImunidade: v })}
              />
            </label>
            <label className="bestiario-span-2">
              Vulnerabilidade a dano (vírgula)
              <ListaTextoInput
                list="tipos-dano-sugeridos"
                value={draft.resistencias.danoVulneravel}
                onChange={(v) => campo("resistencias", { ...draft.resistencias, danoVulneravel: v })}
              />
            </label>
            <label className="bestiario-span-2">
              Imunidade a condição (vírgula)
              <ListaTextoInput
                value={draft.resistencias.condicaoImunidade}
                onChange={(v) => campo("resistencias", { ...draft.resistencias, condicaoImunidade: v })}
              />
            </label>
          </div>
        </div>

        <div className="bestiario-secao">
          <h3>
            <i className="fas fa-bolt" /> Componentes
          </h3>
          <datalist id="tipos-dano-sugeridos">
            {TIPOS_DANO_SUGERIDOS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          {CATEGORIAS_COMPONENTE.map(({ key, label, icone }) => {
            const itens = draft.componentes.filter((c) => c.categoria === key);
            return (
              <div key={key} className="bestiario-componente-grupo">
                <div className="bestiario-componente-header">
                  <strong>
                    <i className={`fas ${icone}`} /> {label}
                  </strong>
                  <div className="bestiario-componente-header-acoes">
                    {templates.some((t) => t.categoria === key) && (
                      <select
                        defaultValue=""
                        className="bestiario-select-biblioteca"
                        onChange={(e) => {
                          if (e.target.value) aplicarComponenteDaBiblioteca(e.target.value);
                          e.target.value = "";
                        }}
                      >
                        <option value="" disabled>
                          Aplicar da biblioteca...
                        </option>
                        {templates
                          .filter((t) => t.categoria === key)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.nome}
                            </option>
                          ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className="bestiario-btn-add"
                      onClick={() =>
                        key === "condicao" ? adicionarComponente(key) : setPresetPickerCategoria(key)
                      }
                    >
                      <i className="fas fa-plus" /> {label}
                    </button>
                  </div>
                </div>
                {presetPickerCategoria === key && (
                  <PickerAcaoPreset
                    onEscolher={(preset) => adicionarComponenteComPreset(key, preset)}
                    onPular={() => {
                      adicionarComponente(key);
                      setPresetPickerCategoria(null);
                    }}
                  />
                )}
                {itens.map((item) => (
                  <ComponenteEditor
                    key={item.id}
                    item={item}
                    condicoesDisponiveis={condicoesDisponiveis}
                    onAtualizar={(patch) => atualizarComponente(item.id, patch)}
                    onRemover={() => removerComponente(item.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>

        <div className="bestiario-secao">
          <h3>
            <i className="fas fa-feather" /> Notas do narrador
          </h3>
          <div className="bestiario-grid">
            <label className="bestiario-span-2">
              Anotações privadas
              <textarea value={draft.anotacoesPrivadas} onChange={(e) => campo("anotacoesPrivadas", e.target.value)} />
            </label>
            <label className="bestiario-span-2">
              Loot
              <textarea value={draft.loot} onChange={(e) => campo("loot", e.target.value)} />
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
