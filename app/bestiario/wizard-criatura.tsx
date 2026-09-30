"use client";

import { useState } from "react";
import Swal from "sweetalert2";
import { parseFormulaDados } from "@/lib/dice";
import { criarCriatura } from "./actions";
import { aplicarTemplate, criarComponenteVazio, criarCriaturaVazia, draftDeCriatura, ndParaValor } from "./utils";
import { CATEGORIAS_COMPONENTE, TIPOS_DANO_SUGERIDOS } from "./types";
import type { ComponenteCategoria, ComponentePayload, CriaturaPayload, CriaturaSerializada, TemplateSerializado } from "./types";
import { NumeroInput, ListaTextoInput } from "./inputs";
import { ComponenteEditor } from "./componente-editor";
import { FichaCriaturaView } from "./ficha-view";
import { PickerAcaoPreset, type PresetAcao } from "./presets-acao";

function uuid() {
  return crypto.randomUUID();
}

// Média de uma fórmula de dados (ex: "7d12+7" -> 7*6.5+7 = 52.5 -> 53) — só
// pra dar um ponto de partida pro campo "PV médio"; o mestre pode ajustar.
function mediaFormula(formula: string): number | null {
  const { dados, modificador } = parseFormulaDados(formula);
  if (dados.length === 0) return null;
  const soma = dados.reduce((acc, d) => acc + ((d.faces + 1) / 2) * d.sinal, 0);
  return Math.round(soma + modificador);
}

const PASSOS = [
  { key: "origem", label: "Origem" },
  { key: "identidade", label: "Identidade" },
  { key: "nivel", label: "Nível & Defesas" },
  { key: "atributos", label: "Atributos" },
  { key: "pericias", label: "Perícias" },
  { key: "acoes", label: "Ações" },
  { key: "revisao", label: "Revisão" },
] as const;

const TAMANHOS = ["minusculo", "pequeno", "medio", "grande", "enorme", "colossal"];
const ATRIBUTOS = ["forca", "destreza", "constituicao", "sabedoria", "presenca", "vontade"] as const;

type Props = {
  criaturas: CriaturaSerializada[];
  templates: TemplateSerializado[];
  linhagens: string[];
  onCriada: (nova: CriaturaSerializada) => void;
  onCancelar: () => void;
};

export function WizardCriatura({ criaturas, templates, linhagens, onCriada, onCancelar }: Props) {
  const [passo, setPasso] = useState(0);
  const [maiorPassoVisitado, setMaiorPassoVisitado] = useState(0);
  const [origem, setOrigem] = useState<"zero" | "clone">("zero");
  const [cloneId, setCloneId] = useState("");
  const [draft, setDraft] = useState<CriaturaPayload>(() => criarCriaturaVazia());
  const [salvando, setSalvando] = useState(false);
  const condicoesDisponiveis = templates.filter((t) => t.categoria === "condicao");
  const [presetPickerCategoria, setPresetPickerCategoria] = useState<ComponenteCategoria | null>(null);

  function campo<K extends keyof CriaturaPayload>(chave: K, valor: CriaturaPayload[K]) {
    setDraft((atual) => ({ ...atual, [chave]: valor }));
  }

  function irPara(novoPasso: number) {
    if (novoPasso > maiorPassoVisitado) return; // não pula pra frente sem passar pelos passos
    setPasso(novoPasso);
  }

  function avancar() {
    if (passo === 1 && (!draft.nome.trim() || !draft.categoria.trim())) {
      void Swal.fire({
        icon: "warning",
        title: "Nome e categoria são obrigatórios",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }
    const proximo = Math.min(passo + 1, PASSOS.length - 1);
    setPasso(proximo);
    setMaiorPassoVisitado((atual) => Math.max(atual, proximo));
  }

  function voltar() {
    if (passo === 0) {
      onCancelar();
      return;
    }
    setPasso((atual) => atual - 1);
  }

  function escolherClone(id: string) {
    setCloneId(id);
    const base = criaturas.find((c) => c.id === id);
    if (!base) return;
    const clonado = draftDeCriatura(base);
    setDraft({
      ...clonado,
      nome: "",
      ordemTier: clonado.ordemTier != null ? clonado.ordemTier + 1 : null,
      componentes: clonado.componentes.map((c) => ({ ...c, id: uuid() })),
    });
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

  function adicionarComponenteVazio(categoria: ComponenteCategoria) {
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

  async function finalizar() {
    if (!draft.nome.trim() || !draft.categoria.trim()) {
      void Swal.fire({
        icon: "warning",
        title: "Nome e categoria são obrigatórios",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      setPasso(1);
      return;
    }
    setSalvando(true);
    try {
      const nova = await criarCriatura(draft);
      onCriada(nova);
    } catch (err) {
      void Swal.fire({
        icon: "error",
        title: "Erro ao criar criatura",
        text: err instanceof Error ? err.message : "Tente novamente.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    } finally {
      setSalvando(false);
    }
  }

  const passoAtual = PASSOS[passo].key;
  const previa: CriaturaSerializada = {
    ...draft,
    id: "previa",
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };

  return (
    <div className="wizard-criatura">
      <div className="wizard-passos">
        {PASSOS.map((p, indice) => (
          <button
            key={p.key}
            type="button"
            className={"wizard-passo" + (indice === passo ? " ativo" : "") + (indice > maiorPassoVisitado ? " bloqueado" : "")}
            onClick={() => irPara(indice)}
            disabled={indice > maiorPassoVisitado}
          >
            <span className="wizard-passo-numero">{indice + 1}</span>
            {p.label}
          </button>
        ))}
      </div>

      <div className="wizard-corpo">
        {passoAtual === "origem" && (
          <div className="bestiario-secao">
            <h3>
              <i className="fas fa-wand-magic-sparkles" /> Como você quer começar?
            </h3>
            <div className="wizard-origem-opcoes">
              <button
                type="button"
                className={"wizard-origem-opcao" + (origem === "zero" ? " ativo" : "")}
                onClick={() => {
                  setOrigem("zero");
                  setDraft(criarCriaturaVazia());
                  setCloneId("");
                }}
              >
                <i className="fas fa-file" />
                <strong>Do zero</strong>
                <span>Começa com uma ficha em branco.</span>
              </button>
              <button
                type="button"
                className={"wizard-origem-opcao" + (origem === "clone" ? " ativo" : "")}
                onClick={() => setOrigem("clone")}
                disabled={criaturas.length === 0}
              >
                <i className="fas fa-copy" />
                <strong>A partir de uma criatura existente</strong>
                <span>
                  {criaturas.length === 0
                    ? "Nenhuma criatura cadastrada ainda pra copiar."
                    : "Copia tudo (atributos, ações...) — você só ajusta o que muda."}
                </span>
              </button>
            </div>
            {origem === "clone" && criaturas.length > 0 && (
              <label>
                Criatura-base
                <select value={cloneId} onChange={(e) => escolherClone(e.target.value)}>
                  <option value="">Escolher...</option>
                  {criaturas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} (ND {c.nd}
                      {c.linhagem ? ` · ${c.linhagem}` : ""})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {passoAtual === "identidade" && (
          <div className="bestiario-secao">
            <h3>
              <i className="fas fa-id-card" /> Identidade
            </h3>
            <div className="bestiario-grid">
              <label>
                Nome
                <input value={draft.nome} onChange={(e) => campo("nome", e.target.value)} autoFocus />
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
                  {TAMANHOS.map((t) => (
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
              <label>
                Linhagem (opcional)
                <input
                  value={draft.linhagem}
                  placeholder="Marinha, Cipher Pol..."
                  list="wizard-linhagens-sugeridas"
                  onChange={(e) => campo("linhagem", e.target.value)}
                />
                <datalist id="wizard-linhagens-sugeridas">
                  {linhagens.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </label>
              <label>
                Tier na linhagem
                <NumeroInput allowNull value={draft.ordemTier} onChange={(v) => campo("ordemTier", v)} />
              </label>
            </div>
          </div>
        )}

        {passoAtual === "nivel" && (
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
                <div className="wizard-campo-com-botao">
                  <NumeroInput value={draft.pvMedio} onChange={(v) => campo("pvMedio", v ?? 0)} />
                  <button
                    type="button"
                    className="bestiario-btn-add"
                    title="Calcular a média a partir da fórmula"
                    onClick={() => {
                      const media = mediaFormula(draft.pvFormula);
                      if (media !== null) campo("pvMedio", media);
                    }}
                  >
                    <i className="fas fa-calculator" />
                  </button>
                </div>
              </label>
            </div>
          </div>
        )}

        {passoAtual === "atributos" && (
          <div className="bestiario-secao">
            <h3>
              <i className="fas fa-dumbbell" /> Atributos
            </h3>
            <div className="bestiario-grid bestiario-grid--atributos">
              {ATRIBUTOS.map((attr) => (
                <label key={attr}>
                  {attr}
                  <NumeroInput value={draft[attr]} onChange={(v) => campo(attr, v ?? 0)} />
                </label>
              ))}
            </div>
          </div>
        )}

        {passoAtual === "pericias" && (
          <div className="bestiario-secao">
            <h3>
              <i className="fas fa-check-double" /> Perícias e salvaguardas
            </h3>
            <p className="bestiario-sublabel">
              Resistências, sentidos extras e outros detalhes finos dá pra ajustar no editor completo depois de criar.
            </p>
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
          </div>
        )}

        {passoAtual === "acoes" && (
          <div className="bestiario-secao">
            <h3>
              <i className="fas fa-bolt" /> Ações
            </h3>
            <p className="bestiario-sublabel">
              Aplique traits prontos da biblioteca ou adicione em branco — já dá pra configurar tudo (dano, área,
              condições impostas) direto aqui.
            </p>
            <datalist id="tipos-dano-sugeridos">
              {TIPOS_DANO_SUGERIDOS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {CATEGORIAS_COMPONENTE.filter((c) => c.key !== "condicao").map(({ key, label, icone }) => {
              const itens = draft.componentes.filter((c) => c.categoria === key);
              const templatesDaCategoria = templates.filter((t) => t.categoria === key);
              return (
                <div key={key} className="bestiario-componente-grupo">
                  <div className="bestiario-componente-header">
                    <strong>
                      <i className={`fas ${icone}`} /> {label}
                    </strong>
                    <div className="bestiario-componente-header-acoes">
                      {templatesDaCategoria.length > 0 && (
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
                          {templatesDaCategoria.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.nome}
                            </option>
                          ))}
                        </select>
                      )}
                      <button type="button" className="bestiario-btn-add" onClick={() => setPresetPickerCategoria(key)}>
                        <i className="fas fa-plus" /> {label}
                      </button>
                    </div>
                  </div>
                  {presetPickerCategoria === key && (
                    <PickerAcaoPreset
                      onEscolher={(preset) => adicionarComponenteComPreset(key, preset)}
                      onPular={() => {
                        adicionarComponenteVazio(key);
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
        )}

        {passoAtual === "revisao" && (
          <div className="wizard-revisao">
            <p className="bestiario-sublabel">Confira antes de criar — dá pra ajustar tudo no editor completo depois.</p>
            <div className="wizard-preview">
              <FichaCriaturaView criatura={previa} onFechar={() => {}} />
            </div>
          </div>
        )}
      </div>

      <div className="wizard-rodape">
        <button type="button" className="bestiario-voltar-lista" onClick={voltar}>
          <i className="fas fa-arrow-left" /> {passo === 0 ? "Cancelar" : "Voltar"}
        </button>
        {passoAtual === "revisao" ? (
          <button type="button" className="bestiario-btn-salvar" onClick={finalizar} disabled={salvando}>
            <i className={`fas ${salvando ? "fa-spinner fa-spin" : "fa-check"}`} />
            {salvando ? "Criando..." : "Criar criatura"}
          </button>
        ) : (
          <button
            type="button"
            className="bestiario-btn-salvar"
            onClick={avancar}
            disabled={passoAtual === "origem" && origem === "clone" && !cloneId}
          >
            Continuar <i className="fas fa-arrow-right" />
          </button>
        )}
      </div>
    </div>
  );
}
