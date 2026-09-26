"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { criarCriatura, atualizarCriatura, deletarCriatura } from "./actions";
import { aplicarTemplate, criarCriaturaVazia, ndParaValor } from "./utils";
import { CATEGORIAS_COMPONENTE, FORMAS_AREA, TIPOS_DANO_SUGERIDOS } from "./types";
import type {
  ComponenteCategoria,
  ComponentePayload,
  CriaturaPayload,
  CriaturaSerializada,
  DanoEntrada,
  TemplateSerializado,
} from "./types";
import { ListaTextoInput, NumeroInput } from "./inputs";

function uuid() {
  return crypto.randomUUID();
}

function novoComponente(categoria: ComponenteCategoria, ordem: number): ComponentePayload {
  return {
    id: uuid(),
    nome: "",
    categoria,
    ordem,
    descricao: "",
    modoResolucao: "nenhum",
    bonusAtaque: "",
    salvaguardaAtributo: "destreza",
    cd: null,
    danos: [],
    area: { forma: "nenhuma", tamanho: "" },
    alcance: "",
    custo: "",
  };
}

function novoDano(): DanoEntrada {
  return { id: uuid(), formula: "", tipos: [] };
}

function draftDeCriatura(c: CriaturaSerializada): CriaturaPayload {
  const { id: _id, criadoEm: _criadoEm, atualizadoEm: _atualizadoEm, ...payload } = c;
  return payload;
}

type Props = { criaturasIniciais: CriaturaSerializada[]; templates: TemplateSerializado[] };

export function BestiarioManager({ criaturasIniciais, templates }: Props) {
  const router = useRouter();
  const [criaturas, setCriaturas] = useState(criaturasIniciais);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CriaturaPayload>(() => criarCriaturaVazia());
  const [salvando, setSalvando] = useState(false);

  // A lista é a visão padrão — a ficha só ocupa a tela quando o narrador
  // escolhe abrir uma criatura existente ou criar uma nova.
  const [visualizacao, setVisualizacao] = useState<"lista" | "editor">("lista");
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");

  const categorias = Array.from(new Set(criaturas.map((c) => c.categoria).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  const criaturasFiltradas = criaturas.filter((c) => {
    if (filtroCategoria && c.categoria !== filtroCategoria) return false;
    if (!busca.trim()) return true;
    const alvo = busca.trim().toLowerCase();
    return c.nome.toLowerCase().includes(alvo) || c.categoria.toLowerCase().includes(alvo);
  });

  function abrirNova() {
    setSelecionadaId(null);
    setDraft(criarCriaturaVazia());
    setVisualizacao("editor");
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
      componentes: [...atual.componentes, novoComponente(categoria, atual.componentes.length)],
    }));
  }

  function aplicarComponenteDaBiblioteca(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setDraft((atual) => ({
      ...atual,
      componentes: [...atual.componentes, aplicarTemplate(template, atual, atual.componentes.length)],
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

  if (visualizacao === "lista") {
    return (
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
              <button key={c.id} type="button" className="bestiario-card-item" onClick={() => abrirEdicao(c)}>
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
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

        <div className="bestiario-secao">
          <h3>Identidade</h3>
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
          <h3>Nível e defesas</h3>
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
          <h3>Atributos</h3>
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
          <h3>Deslocamento</h3>
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
          <h3>Perícias, salvaguardas e sentidos</h3>
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
              + Perícia
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
              + Salvaguarda
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
          <h3>Resistências, imunidades e vulnerabilidades</h3>
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
          <h3>Componentes</h3>
          <datalist id="tipos-dano-sugeridos">
            {TIPOS_DANO_SUGERIDOS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          {CATEGORIAS_COMPONENTE.map(({ key, label }) => {
            const itens = draft.componentes.filter((c) => c.categoria === key);
            return (
              <div key={key} className="bestiario-componente-grupo">
                <div className="bestiario-componente-header">
                  <strong>{label}</strong>
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
                    <button type="button" className="bestiario-btn-add" onClick={() => adicionarComponente(key)}>
                      + {label}
                    </button>
                  </div>
                </div>
                {itens.map((item) => (
                  <div key={item.id} className="bestiario-componente-card">
                    <div className="bestiario-grid">
                      <label>
                        Nome
                        <input value={item.nome} onChange={(e) => atualizarComponente(item.id, { nome: e.target.value })} />
                      </label>
                      <label>
                        Alcance
                        <input
                          value={item.alcance}
                          placeholder="1,5 metro / 9-15 metros"
                          onChange={(e) => atualizarComponente(item.id, { alcance: e.target.value })}
                        />
                      </label>
                      <label>
                        Custo
                        <input
                          value={item.custo}
                          placeholder="1 PP / 5-6 / 3 por dia"
                          onChange={(e) => atualizarComponente(item.id, { custo: e.target.value })}
                        />
                      </label>
                      <label>
                        Como acerta
                        <select
                          value={item.modoResolucao}
                          onChange={(e) => atualizarComponente(item.id, { modoResolucao: e.target.value as ComponentePayload["modoResolucao"] })}
                        >
                          <option value="nenhum">Nenhum (passivo)</option>
                          <option value="ataque">Jogada de ataque</option>
                          <option value="salvaguarda">Salvaguarda do alvo</option>
                        </select>
                      </label>

                      {item.modoResolucao === "ataque" && (
                        <label>
                          Bônus de ataque
                          <input
                            value={item.bonusAtaque}
                            placeholder="+5"
                            onChange={(e) => atualizarComponente(item.id, { bonusAtaque: e.target.value })}
                          />
                        </label>
                      )}

                      {item.modoResolucao === "salvaguarda" && (
                        <>
                          <label>
                            Atributo da salvaguarda
                            <select
                              value={item.salvaguardaAtributo}
                              onChange={(e) =>
                                atualizarComponente(item.id, {
                                  salvaguardaAtributo: e.target.value as ComponentePayload["salvaguardaAtributo"],
                                })
                              }
                            >
                              {["forca", "destreza", "constituicao", "sabedoria", "presenca", "vontade"].map((a) => (
                                <option key={a} value={a}>
                                  {a}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            CD
                            <NumeroInput allowNull value={item.cd} onChange={(v) => atualizarComponente(item.id, { cd: v })} />
                          </label>
                        </>
                      )}

                      <label>
                        Área (opcional)
                        <select
                          value={item.area.forma}
                          onChange={(e) =>
                            atualizarComponente(item.id, { area: { ...item.area, forma: e.target.value as ComponentePayload["area"]["forma"] } })
                          }
                        >
                          {FORMAS_AREA.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {item.area.forma !== "nenhuma" && (
                        <label>
                          Tamanho da área
                          <input
                            value={item.area.tamanho}
                            placeholder="15 metros"
                            onChange={(e) => atualizarComponente(item.id, { area: { ...item.area, tamanho: e.target.value } })}
                          />
                        </label>
                      )}
                    </div>

                    <div className="bestiario-lista-linhas">
                      <span className="bestiario-sublabel">
                        Dano — uma linha por tipo de dano diferente (ex: “1d6 Cortante” + “1d6 Veneno” = 2 linhas).
                        Vários tipos numa mesma linha (separados por vírgula) significam escolha entre eles, não soma
                        (ex: “Contundente, Cortante ou Perfurante”).
                      </span>
                      {item.danos.map((d) => (
                        <div key={d.id} className="bestiario-linha-dano">
                          <input
                            value={d.formula}
                            placeholder="2d10, ou só 2 pra bônus fixo"
                            onChange={(e) =>
                              atualizarComponente(item.id, {
                                danos: item.danos.map((x) => (x.id === d.id ? { ...x, formula: e.target.value } : x)),
                              })
                            }
                          />
                          <ListaTextoInput
                            list="tipos-dano-sugeridos"
                            placeholder="Cortante"
                            value={d.tipos}
                            onChange={(v) =>
                              atualizarComponente(item.id, {
                                danos: item.danos.map((x) => (x.id === d.id ? { ...x, tipos: v } : x)),
                              })
                            }
                          />
                          <button
                            type="button"
                            onClick={() =>
                              atualizarComponente(item.id, { danos: item.danos.filter((x) => x.id !== d.id) })
                            }
                          >
                            <i className="fas fa-xmark" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="bestiario-btn-add"
                        onClick={() => atualizarComponente(item.id, { danos: [...item.danos, novoDano()] })}
                      >
                        + Dano (outro tipo/composto)
                      </button>
                    </div>

                    <label>
                      Descrição
                      <textarea
                        className="bestiario-textarea-descricao"
                        value={item.descricao}
                        onChange={(e) => atualizarComponente(item.id, { descricao: e.target.value })}
                      />
                    </label>
                    <button type="button" className="bestiario-btn-remover-item" onClick={() => removerComponente(item.id)}>
                      <i className="fas fa-trash" /> Remover
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <div className="bestiario-secao">
          <h3>Notas do narrador</h3>
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
