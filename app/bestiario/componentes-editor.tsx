"use client";

// Blocos de ações e aspectos de uma criatura, iguais no editor completo e no
// wizard. Ação nova entra no topo do bloco, já aberta: os efeitos ficam logo
// abaixo do botão que a criou, sem descer a lista.

import { useState } from "react";
import { ComponenteEditor, SugestoesAcaoContext, type SugestoesAcao } from "./componente-editor";
import { PickerAcaoPreset, type PresetAcao } from "./presets-acao";
import { CATEGORIAS_COMPONENTE } from "./types";
import type { ComponenteCategoria, ComponentePayload, RecursoCriatura, TemplateSerializado } from "./types";
import { aplicarTemplate, criarComponenteVazio } from "./utils";

// Pasta de quem não tem dono: o que foi criado direto na biblioteca.
export const PASTA_AVULSA = "Avulsos";

// Templates agrupados pela criatura que os criou, avulsos por último.
export function porDono<T extends { nome: string; formula: { origem: { nome: string } | null } }>(
  templates: T[],
): { dono: string; itens: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const t of templates) {
    const dono = t.formula.origem?.nome.trim() || PASTA_AVULSA;
    grupos.set(dono, [...(grupos.get(dono) ?? []), t]);
  }
  return [...grupos.entries()]
    .map(([dono, itens]) => ({ dono, itens: itens.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) }))
    .sort((a, b) => Number(a.dono === PASTA_AVULSA) - Number(b.dono === PASTA_AVULSA) || a.dono.localeCompare(b.dono, "pt-BR"));
}

type Props = {
  componentes: ComponentePayload[];
  onChange: (atualizar: (atual: ComponentePayload[]) => ComponentePayload[]) => void;
  templates: TemplateSerializado[];
  recursos: RecursoCriatura[];
  // Bônus de ataque e CD da criatura, de atalho nos efeitos.
  sugestoes: SugestoesAcao;
};

export function ComponentesEditor({ componentes, onChange, templates, recursos, sugestoes }: Props) {
  // "Condição" não é bloco de criatura (se cadastra na Biblioteca); só aparece
  // pra quem já tem uma guardada assim, pra dar pra tirar.
  const comCondicoes = componentes.some((c) => c.categoria === "condicao");
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
  const [presetPickerCategoria, setPresetPickerCategoria] = useState<ComponenteCategoria | null>(null);
  const condicoesDisponiveis = templates.filter((t) => t.categoria === "condicao");

  function alternar(id: string) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });
  }

  function adicionar(novo: ComponentePayload) {
    onChange((atual) => [novo, ...atual]);
    setAbertos((atual) => new Set(atual).add(novo.id));
    setPresetPickerCategoria(null);
  }

  function adicionarComPreset(categoria: ComponenteCategoria, preset?: PresetAcao) {
    adicionar({ ...criarComponenteVazio(categoria, 0), ...preset?.criar() });
  }

  function aplicarDaBiblioteca(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (template) adicionar(aplicarTemplate(template, 0));
  }

  return (
    <SugestoesAcaoContext.Provider value={sugestoes}>
      {CATEGORIAS_COMPONENTE.filter((c) => comCondicoes || c.key !== "condicao").map(({ key, label, icone }) => {
        const itens = componentes.filter((c) => c.categoria === key);
        const daBiblioteca = porDono(templates.filter((t) => t.categoria === key));
        return (
          <div key={key} className="bestiario-componente-grupo">
            <div className="bestiario-componente-header">
              <strong>
                <i className={`fas ${icone}`} /> {label}
                {itens.length > 0 && <span className="bestiario-componente-total">{itens.length}</span>}
              </strong>
              <div className="bestiario-componente-header-acoes">
                {daBiblioteca.length > 0 && (
                  <select
                    defaultValue=""
                    className="bestiario-select-biblioteca"
                    aria-label={`Aplicar ${label} da biblioteca`}
                    onChange={(e) => {
                      if (e.target.value) aplicarDaBiblioteca(e.target.value);
                      e.target.value = "";
                    }}
                  >
                    <option value="" disabled>
                      Aplicar da biblioteca...
                    </option>
                    {daBiblioteca.map(({ dono, itens: doDono }) => (
                      <optgroup key={dono} label={dono}>
                        {doDono.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nome}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}
                {key !== "condicao" && (
                  <button
                    type="button"
                    className="bestiario-btn-add"
                    aria-expanded={presetPickerCategoria === key}
                    onClick={() => setPresetPickerCategoria(presetPickerCategoria === key ? null : key)}
                  >
                    <i className="fas fa-plus" /> Nova
                  </button>
                )}
              </div>
            </div>
            {presetPickerCategoria === key && (
              <PickerAcaoPreset
                onEscolher={(preset) => adicionarComPreset(key, preset)}
                onPular={() => adicionarComPreset(key)}
              />
            )}
            {itens.map((item) => (
              <ComponenteEditor
                key={item.id}
                item={item}
                condicoesDisponiveis={condicoesDisponiveis}
                recursos={recursos}
                aberto={abertos.has(item.id)}
                onAlternar={() => alternar(item.id)}
                onAtualizar={(patch) => onChange((atual) => atual.map((c) => (c.id === item.id ? { ...c, ...patch } : c)))}
                onRemover={() => onChange((atual) => atual.filter((c) => c.id !== item.id))}
              />
            ))}
          </div>
        );
      })}
    </SugestoesAcaoContext.Provider>
  );
}
