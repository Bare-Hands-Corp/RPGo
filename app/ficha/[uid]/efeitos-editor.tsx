"use client";

// Editor de efeitos estruturados, usado por Habilidades e Itens.

import { createContext, useContext, useState } from "react";
import {
  ALVOS_AGREGAVEIS,
  ALVOS_CONTEXTUAIS,
  ALVOS_SUBSTITUIVEIS,
  ATRIBUTOS,
  GRUPOS_PRESET,
  META_EFEITOS,
  PRESETS_EFEITO,
  resumoEfeito,
  type Atributo,
  type EfeitoHabilidade,
} from "@/lib/op-rpg";

export type RecursoMinimo = { id: string; nome: string };

export type AlvoEntry = { slug: string; nome: string; grupo: string };

// Perícias customizadas como alvo de efeito.
export const AlvosCustomContext = createContext<AlvoEntry[]>([]);

// Nome dos recursos custom por id (chips).
export const NomesRecursoContext = createContext<Map<string, string>>(new Map());

// Picker de efeitos + lista de editores.
export function EfeitosEditor({
  efeitos,
  onChange,
  recursos,
  pergunta,
}: {
  efeitos: EfeitoHabilidade[];
  onChange: (efeitos: EfeitoHabilidade[]) => void;
  recursos: RecursoMinimo[];
  /** Pergunta do picker — "O que essa habilidade faz?" / "…esse item faz?". */
  pergunta: string;
}) {
  const [pickerAberto, setPickerAberto] = useState(false);

  function adicionar(presetId: string) {
    const preset = PRESETS_EFEITO.find((p) => p.id === presetId);
    if (!preset) return;
    onChange([...efeitos, preset.criar()]);
    setPickerAberto(false);
  }

  function patch(idx: number, p: Partial<EfeitoHabilidade>) {
    onChange(
      efeitos.map((e, i) => (i === idx ? ({ ...e, ...p } as EfeitoHabilidade) : e)),
    );
  }

  return (
    <>
      {!pickerAberto ? (
        <button
          type="button"
          className="btn-rect outline"
          onClick={() => setPickerAberto(true)}
          style={{ width: "100%", padding: "10px 14px" }}
        >
          <i className="fas fa-plus" /> Adicionar efeito
        </button>
      ) : (
        <PickerPreset
          pergunta={pergunta}
          onPick={adicionar}
          onCancelar={() => setPickerAberto(false)}
        />
      )}

      {efeitos.map((e, i) => (
        <EditorEfeito
          key={i}
          efeito={e}
          recursos={recursos}
          onPatch={(p) => patch(i, p)}
          onRemover={() => onChange(efeitos.filter((_, j) => j !== i))}
        />
      ))}
    </>
  );
}

// Sugestões de alvo pros campos de efeito. Renderizar uma vez por modal.
export function DatalistAlvos() {
  const periciasCustom = useContext(AlvosCustomContext);
  return (
    <datalist id="alvos-efeito">
      {[...ALVOS_AGREGAVEIS, ...periciasCustom].map((a) => (
        <option key={a.slug} value={a.slug}>
          {a.nome} ({a.grupo})
        </option>
      ))}
    </datalist>
  );
}

// ─── Chip de resumo (card) ─────────────────────────────────────────────
export function ChipEfeito({ efeito }: { efeito: EfeitoHabilidade }) {
  const meta = META_EFEITOS[efeito.tipo];
  const nomesRecurso = useContext(NomesRecursoContext);
  return (
    <span
      className="efeito-chip"
      style={{
        background: `color-mix(in oklch, ${meta.cor} 15%, transparent)`,
        color: meta.cor,
        borderColor: `color-mix(in oklch, ${meta.cor} 35%, transparent)`,
      }}
    >
      <i className={`fas ${meta.icone}`} />
      <span className="efeito-chip-label">{meta.nome}</span>
      <span className="efeito-chip-resumo">
        {resumoEfeito(efeito, (id) => nomesRecurso.get(id))}
      </span>
    </span>
  );
}

// Grade de presets de efeito agrupados por tema.
function PickerPreset({
  pergunta,
  onPick,
  onCancelar,
}: {
  pergunta: string;
  onPick: (presetId: string) => void;
  onCancelar: () => void;
}) {
  return (
    <div className="picker-preset">
      <div className="picker-preset-topo">
        <span>{pergunta}</span>
        <button
          type="button"
          className="picker-preset-fechar"
          onClick={onCancelar}
          title="Cancelar"
        >
          <i className="fas fa-xmark" />
        </button>
      </div>
      {GRUPOS_PRESET.map((grupo) => {
        const lista = PRESETS_EFEITO.filter((p) => p.grupo === grupo.slug);
        if (lista.length === 0) return null;
        return (
          <div key={grupo.slug} className="picker-preset-grupo">
            <div className="picker-preset-grupo-titulo">{grupo.nome}</div>
            <div className="picker-preset-grid">
              {lista.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="picker-preset-card"
                  onClick={() => onPick(p.id)}
                  title={p.descricao}
                  style={{ borderLeftColor: p.cor }}
                >
                  <i className={`fas ${p.icone}`} style={{ color: p.cor }} />
                  <div className="picker-preset-card-info">
                    <strong>{p.nome}</strong>
                    <span>{p.descricao}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Alvos aceitos pelo `multiplicador`.
const ALVOS_MULTIPLICADOR_SLUGS = new Set([
  "carga",
  "deslocamento",
  "hp-max",
  "pp-max",
]);
const ALVOS_MULTIPLICADOR = ALVOS_AGREGAVEIS.filter((a) =>
  ALVOS_MULTIPLICADOR_SLUGS.has(a.slug),
);

// Alvos da proficiência: perícia e salvaguarda.
const ALVOS_PROFICIENCIA = ALVOS_AGREGAVEIS.filter(
  (a) => a.grupo === "Perícia" || a.grupo === "Salvaguarda",
);

// Select de alvo por categoria, com "Outro…" pra texto livre.
function SelectAlvo({
  valor,
  onChange,
  placeholder,
  alvos = ALVOS_AGREGAVEIS,
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  alvos?: typeof ALVOS_AGREGAVEIS;
}) {
  // Perícias customizadas entram nas listas de perícia.
  const periciasCustom = useContext(AlvosCustomContext);
  const alvosFinais =
    periciasCustom.length > 0 && alvos.some((a) => a.grupo === "Perícia")
      ? [...alvos, ...periciasCustom]
      : alvos;

  const slugsCanonicos = new Set(alvosFinais.map((a) => a.slug));
  // Valor fora da lista canônica vira "outro".
  const ehOutro = valor !== "" && !slugsCanonicos.has(valor);
  const [modoOutro, setModoOutro] = useState(ehOutro);

  const grupos: Record<string, typeof ALVOS_AGREGAVEIS> = {};
  for (const a of alvosFinais) {
    (grupos[a.grupo] ||= []).push(a);
  }

  if (modoOutro) {
    return (
      <div className="select-alvo-livre">
        <input
          type="text"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "texto livre"}
          autoFocus
          list="alvos-efeito"
        />
        <button
          type="button"
          className="select-alvo-voltar"
          onClick={() => {
            setModoOutro(false);
            onChange("");
          }}
          title="Voltar pra lista"
        >
          <i className="fas fa-list" />
        </button>
      </div>
    );
  }

  return (
    <select
      value={valor}
      onChange={(e) => {
        if (e.target.value === "__outro__") {
          setModoOutro(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
    >
      <option value="">— escolha —</option>
      {Object.entries(grupos).map(([nomeGrupo, lista]) => (
        <optgroup key={nomeGrupo} label={nomeGrupo}>
          {lista.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.nome}
            </option>
          ))}
        </optgroup>
      ))}
      <option value="__outro__">Outro (texto livre)…</option>
    </select>
  );
}

// ─── Editor de efeito (campos por tipo) ────────────────────────────────
function EditorEfeito({
  efeito,
  recursos,
  onPatch,
  onRemover,
}: {
  efeito: EfeitoHabilidade;
  recursos: RecursoMinimo[];
  onPatch: (patch: Partial<EfeitoHabilidade>) => void;
  onRemover: () => void;
}) {
  const meta = META_EFEITOS[efeito.tipo];
  // Efeito sem parâmetro não tem corpo.
  const corpo = renderCorpo(efeito, recursos, onPatch);
  return (
    <div className="efeito-editor" style={{ borderColor: meta.cor }}>
      <div className="efeito-editor-topo" style={{ color: meta.cor }}>
        <i className={`fas ${meta.icone}`} />
        <strong>{meta.nome}</strong>
        <button
          type="button"
          className="efeito-editor-rm"
          onClick={onRemover}
          title="Remover efeito"
        >
          <i className="fas fa-xmark" />
        </button>
      </div>
      {corpo && <div className="efeito-editor-corpo">{corpo}</div>}
    </div>
  );
}

// Campos opcionais colapsáveis (fora do `renderCorpo` pra não perder o foco).
function Detalhes({
  children,
  aberto,
}: {
  children: React.ReactNode;
  aberto?: boolean;
}) {
  const [abertoInicial] = useState(aberto);
  return (
    <details className="efeito-detalhes" open={abertoInicial}>
      <summary>Detalhes (opcional)</summary>
      <div className="efeito-detalhes-corpo">{children}</div>
    </details>
  );
}

function renderCorpo(
  e: EfeitoHabilidade,
  recursos: RecursoMinimo[],
  onPatch: (p: Partial<EfeitoHabilidade>) => void,
): React.ReactNode {
  switch (e.tipo) {
    case "modificador": {
      // Alvo fixo mostra só "Quantidade"; alvo livre mostra o select.
      const ALVOS_FIXOS_LABEL: Record<string, string> = {
        "hp-temp": "PV Temporário",
        "hp-max": "PV Máximo",
        "pp-max": "PP Máximo",
      };
      const labelFixo = ALVOS_FIXOS_LABEL[e.alvo];
      return (
        <>
          {labelFixo ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <label>{labelFixo}</label>
              <input
                type="number"
                value={e.valor}
                onChange={(ev) =>
                  onPatch({ valor: Number(ev.target.value) || 0 } as Partial<EfeitoHabilidade>)
                }
                placeholder="quantidade"
              />
            </div>
          ) : (
            <>
              <div>
                <label>Em qual?</label>
                <SelectAlvo
                  valor={e.alvo}
                  onChange={(v) => onPatch({ alvo: v } as Partial<EfeitoHabilidade>)}
                />
              </div>
              <CampoNum
                label="Bônus"
                valor={e.valor}
                onChange={(v) => onPatch({ valor: v } as Partial<EfeitoHabilidade>)}
              />
            </>
          )}
          <Detalhes aberto={!!e.quando}>
            <Campo
              label="Quando se aplica"
              valor={e.quando ?? ""}
              onChange={(v) =>
                onPatch({ quando: v || undefined } as Partial<EfeitoHabilidade>)
              }
              placeholder="sempre, no mar, escondido…"
            />
          </Detalhes>
        </>
      );
    }
    case "vantagem":
    case "desvantagem":
      return (
        <>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Em qual teste?</label>
            <SelectAlvo
              valor={e.alvo}
              onChange={(v) => onPatch({ alvo: v } as Partial<EfeitoHabilidade>)}
              alvos={ALVOS_CONTEXTUAIS}
            />
          </div>
          <Detalhes aberto={!!e.quando}>
            <Campo
              label="Quando se aplica"
              valor={e.quando ?? ""}
              onChange={(v) =>
                onPatch({ quando: v || undefined } as Partial<EfeitoHabilidade>)
              }
              placeholder="opcional"
            />
          </Detalhes>
        </>
      );
    case "proficiencia": {
      // Salvaguarda não dobra: esconde o "Dobrada" e limpa ao trocar pra uma.
      const ehSalv = e.alvo.startsWith("salv-");
      return (
        <>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Em qual?</label>
            <SelectAlvo
              valor={e.alvo}
              onChange={(v) =>
                onPatch({
                  alvo: v,
                  ...(v.startsWith("salv-") ? { dobrada: undefined } : {}),
                } as Partial<EfeitoHabilidade>)
              }
              alvos={ALVOS_PROFICIENCIA}
            />
          </div>
          {!ehSalv && (
            <label
              className="checkbox-linha"
              style={{ gridColumn: "1 / -1", marginTop: 4 }}
            >
              <input
                type="checkbox"
                checked={!!e.dobrada}
                onChange={(ev) =>
                  onPatch({
                    dobrada: ev.target.checked || undefined,
                  } as Partial<EfeitoHabilidade>)
                }
              />
              Dobrada
            </label>
          )}
        </>
      );
    }
    case "recurso_delta": {
      const orfao =
        e.recurso !== "" && e.recurso !== "pp" && !recursos.some((r) => r.id === e.recurso);
      return (
        <>
          <div>
            <label>Recurso</label>
            <select
              value={e.recurso}
              onChange={(ev) =>
                onPatch({ recurso: ev.target.value } as Partial<EfeitoHabilidade>)
              }
            >
              <option value="">—</option>
              <option value="pp">PP</option>
              {recursos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
              {orfao && <option value={e.recurso}>(recurso apagado)</option>}
            </select>
          </div>
          <CampoNum
            label="Quantidade"
            valor={e.valor}
            onChange={(v) => onPatch({ valor: v } as Partial<EfeitoHabilidade>)}
          />
        </>
      );
    }
    case "cura":
      return (
        <>
          <Campo
            label="Quanto cura"
            valor={e.valor}
            onChange={(v) => onPatch({ valor: v } as Partial<EfeitoHabilidade>)}
            placeholder="1d8+CON, 2d6, 5…"
          />
          <Detalhes aberto={!!e.alvoCura}>
            <div>
              <label>Onde aplica</label>
              <select
                // PV é o padrão; aliases legados caem no canônico.
                value={
                  e.alvoCura === "pp"
                    ? "pp"
                    : e.alvoCura === "hp-temp" ||
                        e.alvoCura === "hptemp" ||
                        e.alvoCura === "pv-temp" ||
                        e.alvoCura === "ppv"
                      ? "hp-temp"
                      : "hp"
                }
                onChange={(ev) => {
                  const v = ev.target.value;
                  onPatch({
                    alvoCura: v === "hp" ? undefined : v,
                  } as Partial<EfeitoHabilidade>);
                }}
              >
                <option value="hp">PV (padrão)</option>
                <option value="hp-temp">PV Temporário</option>
                <option value="pp">PP</option>
              </select>
            </div>
          </Detalhes>
        </>
      );
    case "condicao_imune":
    case "condicao_remover":
      return (
        <div style={{ gridColumn: "1 / -1" }}>
          <Campo
            label="Condição"
            valor={e.condicao}
            onChange={(v) => onPatch({ condicao: v } as Partial<EfeitoHabilidade>)}
            placeholder="envenenado, atordoado, agarrado…"
          />
        </div>
      );
    case "condicao_aplicar":
      return (
        <>
          <Campo
            label="Condição"
            valor={e.condicao}
            onChange={(v) => onPatch({ condicao: v } as Partial<EfeitoHabilidade>)}
            placeholder="envenenado, atordoado…"
          />
          <CampoNum
            label="CD da Salv."
            valor={e.cd ?? 0}
            onChange={(v) =>
              onPatch({ cd: v || undefined } as Partial<EfeitoHabilidade>)
            }
          />
          <Detalhes aberto={!!e.duracao}>
            <Campo
              label="Duração"
              valor={e.duracao ?? ""}
              onChange={(v) =>
                onPatch({ duracao: v || undefined } as Partial<EfeitoHabilidade>)
              }
              placeholder="1 minuto, 1 turno…"
            />
          </Detalhes>
        </>
      );
    case "resistencia":
    case "imunidade":
      return (
        <div style={{ gridColumn: "1 / -1" }}>
          <Campo
            label="Tipo de dano"
            valor={e.tipoDano}
            onChange={(v) => onPatch({ tipoDano: v } as Partial<EfeitoHabilidade>)}
            placeholder="cortante, fogo, ácido, psíquico…"
          />
        </div>
      );
    case "deslocamento":
      return (
        <>
          <div>
            <label>Tipo</label>
            <select
              value={e.tipoMov}
              onChange={(ev) =>
                onPatch({ tipoMov: ev.target.value } as Partial<EfeitoHabilidade>)
              }
            >
              <option value="caminhar">Caminhar</option>
              <option value="nadar">Nadar</option>
              <option value="voar">Voar</option>
              <option value="escalar">Escalar</option>
              <option value="cavar">Cavar</option>
            </select>
          </div>
          <CampoNum
            label="Valor (m)"
            valor={e.valor}
            onChange={(v) => onPatch({ valor: v } as Partial<EfeitoHabilidade>)}
          />
        </>
      );
    case "multiplicador":
      return (
        <>
          <div>
            <label>O quê</label>
            <SelectAlvo
              valor={e.alvo}
              onChange={(v) => onPatch({ alvo: v } as Partial<EfeitoHabilidade>)}
              alvos={ALVOS_MULTIPLICADOR}
            />
          </div>
          <CampoNum
            label="Fator"
            valor={e.fator}
            onChange={(v) => onPatch({ fator: v } as Partial<EfeitoHabilidade>)}
            step={0.1}
          />
        </>
      );
    case "substituir_atributo":
      return (
        <>
          <div>
            <label>Cálculo</label>
            <SelectAlvo
              valor={e.alvo}
              onChange={(v) => onPatch({ alvo: v } as Partial<EfeitoHabilidade>)}
              alvos={ALVOS_SUBSTITUIVEIS}
              placeholder="cr, iniciativa, salv-forca…"
            />
          </div>
          <div>
            <label>Passa a usar o atributo</label>
            <select
              value={e.atributo}
              onChange={(ev) =>
                onPatch({ atributo: ev.target.value as Atributo } as Partial<EfeitoHabilidade>)
              }
            >
              {ATRIBUTOS.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.sigla} — {a.nome}
                </option>
              ))}
            </select>
          </div>
        </>
      );
    case "rolagem":
      return (
        <>
          <Campo
            label="Fórmula"
            valor={e.formula}
            onChange={(v) => onPatch({ formula: v } as Partial<EfeitoHabilidade>)}
            placeholder="1d4 dano extra"
          />
          <Detalhes aberto={!!e.quando}>
            <Campo
              label="Quando"
              valor={e.quando ?? ""}
              onChange={(v) =>
                onPatch({ quando: v || undefined } as Partial<EfeitoHabilidade>)
              }
              placeholder="opcional"
            />
          </Detalhes>
        </>
      );
    case "trigger":
      return (
        <>
          <Campo
            label="Gatilho (quando)"
            valor={e.gatilho}
            onChange={(v) => onPatch({ gatilho: v } as Partial<EfeitoHabilidade>)}
            placeholder="atingido por crítico…"
          />
          <Campo
            label="Efeito (o quê)"
            valor={e.efeito}
            onChange={(v) => onPatch({ efeito: v } as Partial<EfeitoHabilidade>)}
            placeholder="o que acontece"
          />
        </>
      );
    case "crit_range":
      return (
        <div style={{ gridColumn: "1 / -1" }}>
          <label>Crítico a partir de</label>
          <select
            value={e.minimo}
            onChange={(ev) =>
              onPatch({
                minimo: Number(ev.target.value) || 20,
              } as Partial<EfeitoHabilidade>)
            }
          >
            <option value={19}>19-20 (faixa expandida)</option>
            <option value={18}>18-20 (super expandida)</option>
            <option value={17}>17-20</option>
            <option value={20}>20 (sem efeito)</option>
          </select>
        </div>
      );
    case "reroll":
      return (
        <>
          <div>
            <label>Em qual jogada</label>
            <SelectAlvo
              valor={e.gatilho}
              onChange={(v) => onPatch({ gatilho: v } as Partial<EfeitoHabilidade>)}
              alvos={ALVOS_CONTEXTUAIS}
            />
          </div>
          <CampoNum
            label="Usos / descanso longo"
            valor={e.usos}
            onChange={(v) =>
              onPatch({
                usos: Math.max(1, v),
              } as Partial<EfeitoHabilidade>)
            }
          />
        </>
      );
    case "floor_d20":
      return (
        <div style={{ gridColumn: "1 / -1" }}>
          <label>Resultado mínimo no d20</label>
          <select
            value={e.minimo}
            onChange={(ev) =>
              onPatch({
                minimo: Number(ev.target.value) || 0,
              } as Partial<EfeitoHabilidade>)
            }
          >
            <option value={5}>≤5 vira 5</option>
            <option value={10}>≤10 vira 10 (Especialista)</option>
            <option value={15}>≤15 vira 15</option>
            <option value={0}>Desligado</option>
          </select>
        </div>
      );
    case "sentido":
      return (
        <>
          <div>
            <label>Sentido</label>
            <input
              type="text"
              value={e.sentido}
              onChange={(ev) =>
                onPatch({ sentido: ev.target.value } as Partial<EfeitoHabilidade>)
              }
              placeholder="visão no escuro, sentir presença…"
              list="sentidos-comuns"
            />
            <datalist id="sentidos-comuns">
              <option value="visão no escuro" />
              <option value="visão cega" />
              <option value="sentir presença" />
              <option value="visão verdadeira" />
              <option value="percepção sísmica" />
              <option value="sonar" />
            </datalist>
          </div>
          <CampoNum
            label="Alcance (m)"
            valor={e.alcance}
            onChange={(v) => onPatch({ alcance: Math.max(0, v) } as Partial<EfeitoHabilidade>)}
          />
        </>
      );
    case "acao_extra":
      return (
        <>
          <div>
            <label>Tipo</label>
            <select
              value={e.acao}
              onChange={(ev) =>
                onPatch({ acao: ev.target.value } as Partial<EfeitoHabilidade>)
              }
            >
              <option value="ataque">Ataque extra</option>
              <option value="acao">Ação extra</option>
              <option value="acao bônus">Ação bônus extra</option>
              <option value="reacao">Reação extra</option>
              <option value="movimento">Movimento extra</option>
            </select>
          </div>
          <CampoNum
            label="Quantidade"
            valor={e.quantidade}
            onChange={(v) =>
              onPatch({ quantidade: Math.max(1, v) } as Partial<EfeitoHabilidade>)
            }
          />
          <Detalhes aberto={!!e.gatilho}>
            <Campo
              label="Quando se aplica"
              valor={e.gatilho ?? ""}
              onChange={(v) =>
                onPatch({ gatilho: v || undefined } as Partial<EfeitoHabilidade>)
              }
              placeholder="por turno, 1× por descanso longo…"
            />
          </Detalhes>
        </>
      );
    case "sucesso_auto":
      return (
        <>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Em qual teste?</label>
            <SelectAlvo
              valor={e.alvo}
              onChange={(v) => onPatch({ alvo: v } as Partial<EfeitoHabilidade>)}
              alvos={ALVOS_CONTEXTUAIS}
            />
          </div>
          <Detalhes aberto={!!e.quando}>
            <Campo
              label="Quando se aplica"
              valor={e.quando ?? ""}
              onChange={(v) =>
                onPatch({ quando: v || undefined } as Partial<EfeitoHabilidade>)
              }
              placeholder="1ª salv. de concentração, 3× por descanso…"
            />
          </Detalhes>
        </>
      );
    case "dano_min":
      return (
        <>
          <div style={{ gridColumn: "1 / -1", fontSize: "0.8rem", color: "var(--text-sec)" }}>
            Metade do dano máximo, arredondado pra cima.
          </div>
          <Detalhes aberto={!!e.quando}>
            <Campo
              label="Quando se aplica"
              valor={e.quando ?? ""}
              onChange={(v) =>
                onPatch({ quando: v || undefined } as Partial<EfeitoHabilidade>)
              }
              placeholder="opcional"
            />
          </Detalhes>
        </>
      );
    case "alcance":
      return (
        <>
          <CampoNum
            label="Metros a somar"
            valor={e.valor}
            onChange={(v) => onPatch({ valor: v } as Partial<EfeitoHabilidade>)}
          />
          <Detalhes aberto={!!e.quando}>
            <Campo
              label="Quando se aplica"
              valor={e.quando ?? ""}
              onChange={(v) =>
                onPatch({ quando: v || undefined } as Partial<EfeitoHabilidade>)
              }
              placeholder="opcional"
            />
          </Detalhes>
        </>
      );
    case "ignora":
      return (
        <div style={{ gridColumn: "1 / -1" }}>
          <label>O que ignora</label>
          <input
            type="text"
            value={e.alvo}
            onChange={(ev) =>
              onPatch({ alvo: ev.target.value } as Partial<EfeitoHabilidade>)
            }
            placeholder="resistência, imunidade, reação, cobertura…"
            list="ignora-comuns"
          />
          <datalist id="ignora-comuns">
            <option value="resistência" />
            <option value="imunidade" />
            <option value="reação" />
            <option value="cobertura" />
          </datalist>
        </div>
      );
    case "trocar_dano":
      return (
        <div style={{ gridColumn: "1 / -1" }}>
          <Campo
            label="Novo tipo de dano"
            valor={e.tipoDano}
            onChange={(v) => onPatch({ tipoDano: v } as Partial<EfeitoHabilidade>)}
            placeholder="verdadeiro, fogo, cortante…"
          />
        </div>
      );
    case "crit_imune":
      return null;
    case "margem_critico":
      return (
        <div style={{ gridColumn: "1 / -1" }}>
          <CampoNum
            label="Números a mais na margem"
            valor={e.valor}
            onChange={(v) =>
              onPatch({ valor: Math.min(18, Math.max(1, v)) } as Partial<EfeitoHabilidade>)
            }
          />
        </div>
      );
    case "passo_dano":
      return (
        <>
          <div>
            <label>Qual dado</label>
            <select
              value={e.alvo}
              onChange={(ev) =>
                onPatch({ alvo: ev.target.value } as Partial<EfeitoHabilidade>)
              }
            >
              <option value="arma">Da arma</option>
              <option value="tecnica">Das técnicas</option>
            </select>
          </div>
          <CampoNum
            label="Passos"
            valor={e.passos}
            onChange={(v) =>
              onPatch({ passos: Math.min(6, Math.max(1, v)) } as Partial<EfeitoHabilidade>)
            }
          />
        </>
      );
    case "desconto_tecnica":
      return (
        <>
          <CampoNum
            label="Quanto a menos"
            valor={e.valor}
            onChange={(v) => onPatch({ valor: Math.max(1, v) } as Partial<EfeitoHabilidade>)}
          />
          <div>
            <label>De qual custo</label>
            <select
              value={e.custo}
              onChange={(ev) =>
                onPatch({ custo: ev.target.value } as Partial<EfeitoHabilidade>)
              }
            >
              <option value="pp">PP</option>
              <option value="pa">PA</option>
            </select>
          </div>
        </>
      );
    case "dano_melhor_de":
      return (
        <>
          <CampoNum
            label="Rola quantas vezes"
            valor={e.vezes}
            onChange={(v) =>
              onPatch({ vezes: Math.min(5, Math.max(2, v)) } as Partial<EfeitoHabilidade>)
            }
          />
          <CampoNum
            label="Usos / descanso longo"
            valor={e.usos}
            onChange={(v) => onPatch({ usos: Math.max(0, v) } as Partial<EfeitoHabilidade>)}
          />
          <Detalhes aberto={!!e.quando}>
            <Campo
              label="Quando se aplica"
              valor={e.quando ?? ""}
              onChange={(v) =>
                onPatch({ quando: v || undefined } as Partial<EfeitoHabilidade>)
              }
              placeholder="em técnica, 1× por turno…"
            />
          </Detalhes>
        </>
      );
    case "livre":
      return (
        <div style={{ gridColumn: "1 / -1" }}>
          <Campo
            label="Descrição"
            valor={e.texto}
            onChange={(v) => onPatch({ texto: v } as Partial<EfeitoHabilidade>)}
            placeholder="Descreva o efeito..."
            textarea
          />
        </div>
      );
  }
}

function Campo({
  label,
  valor,
  onChange,
  placeholder,
  textarea,
  list,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  list?: string;
}) {
  return (
    <div>
      <label>{label}</label>
      {textarea ? (
        <textarea
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          type="text"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          list={list}
        />
      )}
    </div>
  );
}

function CampoNum({
  label,
  valor,
  onChange,
  step,
}: {
  label: string;
  valor: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div>
      <label>{label}</label>
      <input
        type="number"
        step={step ?? 1}
        value={Number.isFinite(valor) ? valor : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}
