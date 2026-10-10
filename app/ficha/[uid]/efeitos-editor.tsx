"use client";

// Editor de efeitos estruturados, usado por Habilidades e Itens.

import { createContext, useContext, useState } from "react";
import {
  ALVOS_AGREGAVEIS,
  ALVOS_ATAQUE,
  ALVOS_CONTEXTUAIS,
  ALVOS_DADO_EXTRA,
  ALVOS_DANO,
  ALVOS_SUBSTITUIVEIS,
  ALVOS_VALOR_FIXO,
  ATRIBUTOS,
  GRUPOS_PRESET,
  META_EFEITOS,
  PRESETS_EFEITO,
  alvoDeRolagem,
  extraNoDano,
  nomeDoEfeito,
  resumoEfeito,
  type Atributo,
  type EfeitoHabilidade,
} from "@/lib/op-rpg";
import { Segmentos } from "./campos-modal";
import { CampoFormula, FormulaContext } from "./campo-formula";

export { FormulaContext };

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
  presets,
}: {
  efeitos: EfeitoHabilidade[];
  onChange: (efeitos: EfeitoHabilidade[]) => void;
  recursos: RecursoMinimo[];
  /** Pergunta do picker — "O que essa habilidade faz?" / "…esse item faz?". */
  pergunta: string;
  /** Presets oferecidos (id); ausente = todos. */
  presets?: string[];
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
          presets={presets}
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
// Mostra as fórmulas resolvidas pro personagem; a fórmula fica no tooltip.
// `grau` resolve GRAU (técnica).
export function ChipEfeito({ efeito, grau }: { efeito: EfeitoHabilidade; grau?: number }) {
  const meta = META_EFEITOS[efeito.tipo];
  const nomesRecurso = useContext(NomesRecursoContext);
  const formula = useContext(FormulaContext);
  const nome = (id: string) => nomesRecurso.get(id);
  const resumo = resumoEfeito(efeito, nome, formula ? { ...formula, grau } : undefined);
  const cru = resumoEfeito(efeito, nome);
  return (
    <span
      className="efeito-chip"
      style={{
        background: `color-mix(in oklch, ${meta.cor} 15%, transparent)`,
        color: meta.cor,
        borderColor: `color-mix(in oklch, ${meta.cor} 35%, transparent)`,
      }}
      title={cru !== resumo ? cru : undefined}
    >
      <i className={`fas ${meta.icone}`} />
      <span className="efeito-chip-label">{nomeDoEfeito(efeito)}</span>
      <span className="efeito-chip-resumo">{resumo}</span>
    </span>
  );
}

// Grade de presets de efeito agrupados por tema.
function PickerPreset({
  pergunta,
  presets,
  onPick,
  onCancelar,
}: {
  pergunta: string;
  presets?: string[];
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
        const lista = PRESETS_EFEITO.filter(
          (p) => p.grupo === grupo.slug && (!presets || presets.includes(p.id)),
        );
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
  const periciasCustom = useContext(AlvosCustomContext);
  // Efeito sem parâmetro não tem corpo.
  const corpo = renderCorpo(efeito, recursos, onPatch, periciasCustom);
  return (
    <div className="efeito-editor" style={{ borderColor: meta.cor }}>
      <div className="efeito-editor-topo" style={{ color: meta.cor }}>
        <i className={`fas ${meta.icone}`} />
        <strong>{nomeDoEfeito(efeito)}</strong>
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

// `quando` preenchido: o efeito fica desligado no Rolador até ligar na hora.
function CampoQuando({
  valor,
  onPatch,
  placeholder,
}: {
  valor: string | undefined;
  onPatch: (p: Partial<EfeitoHabilidade>) => void;
  placeholder?: string;
}) {
  return (
    <Detalhes aberto={!!valor}>
      <Campo
        label="Quando se aplica"
        valor={valor ?? ""}
        onChange={(v) => onPatch({ quando: v || undefined } as Partial<EfeitoHabilidade>)}
        placeholder={placeholder ?? "no escuro, contra Provocação…"}
        title="Preenchido, fica desligado no Rolador até você ligar"
      />
    </Detalhes>
  );
}

const GRAUS = [1, 2, 3, 4, 5, 6, 7];

// Efeito de dano só em certos graus de técnica ou tipos de dano.
function FiltroDanoCampos({
  graus,
  tipos,
  onPatch,
  aberto,
  children,
}: {
  graus?: number[];
  tipos?: string;
  onPatch: (p: Partial<EfeitoHabilidade>) => void;
  aberto?: boolean;
  children?: React.ReactNode;
}) {
  const marcados = graus ?? [];
  return (
    <Detalhes aberto={aberto || marcados.length > 0 || !!tipos}>
      {children}
      <div style={{ gridColumn: "1 / -1" }}>
        <label>Só nos graus</label>
        <div className="origem-pills">
          {GRAUS.map((g) => (
            <button
              type="button"
              key={g}
              className={`origem-pill ${marcados.includes(g) ? "ativo" : ""}`}
              aria-pressed={marcados.includes(g)}
              onClick={() => {
                const novos = marcados.includes(g)
                  ? marcados.filter((x) => x !== g)
                  : [...marcados, g].sort((a, b) => a - b);
                onPatch({ graus: novos.length ? novos : undefined } as Partial<EfeitoHabilidade>);
              }}
            >
              {g}º
            </button>
          ))}
        </div>
      </div>
      <Campo
        label="Só nos tipos"
        valor={tipos ?? ""}
        onChange={(v) => onPatch({ tipos: v || undefined } as Partial<EfeitoHabilidade>)}
        placeholder="cortante, perfurante…"
      />
    </Detalhes>
  );
}

function renderCorpo(
  e: EfeitoHabilidade,
  recursos: RecursoMinimo[],
  onPatch: (p: Partial<EfeitoHabilidade>) => void,
  periciasCustom: AlvoEntry[],
): React.ReactNode {
  const slugsCustom = new Set(periciasCustom.map((a) => a.slug));
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
              <CampoFormula
                label={labelFixo}
                valor={e.formula ?? (e.valor ? String(e.valor) : "")}
                onChange={(v) => onPatch(patchDeFormula(v))}
                dados={e.alvo === "hp-temp"}
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
              <CampoFormula
                label="Bônus"
                valor={e.formula ?? (e.valor ? String(e.valor) : "")}
                onChange={(v) => onPatch(patchDeFormula(v))}
              />
            </>
          )}
          {(e.quando || (!labelFixo && alvoDeRolagem(e.alvo, slugsCustom))) && (
            <CampoQuando valor={e.quando} onPatch={onPatch} />
          )}
        </>
      );
    }
    case "vantagem":
    case "desvantagem":
    case "falha_auto":
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
          <CampoQuando valor={e.quando} onPatch={onPatch} />
        </>
      );
    case "proficiencia":
      return (
        <>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Em qual?</label>
            <SelectAlvo
              valor={e.alvo}
              onChange={(v) => onPatch({ alvo: v } as Partial<EfeitoHabilidade>)}
              alvos={ALVOS_PROFICIENCIA}
            />
          </div>
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
        </>
      );
    case "recurso_delta": {
      const orfao =
        e.recurso !== "" &&
        e.recurso !== "pp" &&
        e.recurso !== "exaustao" &&
        !recursos.some((r) => r.id === e.recurso);
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
              <option value="exaustao">Exaustão</option>
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
          <CampoFormula
            label="Quanto cura"
            valor={e.valor}
            onChange={(v) => onPatch({ valor: v } as Partial<EfeitoHabilidade>)}
            placeholder="1d8+CON, 2d6, 5…"
            dados
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
    case "vulnerabilidade":
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
          <label className="checkbox-linha" style={{ gridColumn: "1 / -1", marginTop: 4 }}>
            <input
              type="checkbox"
              checked={!!e.seMaior}
              onChange={(ev) =>
                onPatch({ seMaior: ev.target.checked || undefined } as Partial<EfeitoHabilidade>)
              }
            />
            Só se for maior
          </label>
        </>
      );
    case "rolagem":
      return (
        <>
          <CampoFormula
            label="Fórmula"
            valor={e.formula}
            onChange={(v) => onPatch({ formula: v } as Partial<EfeitoHabilidade>)}
            placeholder="12d12, 1d6…"
            dados
          />
          {/* "Soma numa rolagem" vira Dano/Dado Extra, que entra sozinho na rolagem escolhida. */}
          <SelectLista
            label="Onde"
            valor="parte"
            opcoes={[
              { slug: "parte", nome: "Botão no card" },
              { slug: "rolagem", nome: "Soma numa rolagem" },
            ]}
            onChange={(v) => {
              if (v === "rolagem") {
                onPatch({ tipo: "dano_extra", sempre: true } as Partial<EfeitoHabilidade>);
              }
            }}
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
        <>
          <div>
            <label>Crítico a partir de</label>
            <select
              value={e.minimo}
              onChange={(ev) =>
                onPatch({
                  minimo: Number(ev.target.value) || 20,
                } as Partial<EfeitoHabilidade>)
              }
            >
              <option value={19}>19-20</option>
              <option value={18}>18-20</option>
              <option value={17}>17-20</option>
              <option value={20}>20 (sem efeito)</option>
            </select>
          </div>
          <SelectLista
            label="Em qual ataque?"
            valor={e.alvo ?? "ataque"}
            opcoes={ALVOS_ATAQUE}
            onChange={(v) => onPatch({ alvo: v === "ataque" ? undefined : v } as Partial<EfeitoHabilidade>)}
          />
        </>
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
        </>
      );
    case "floor_d20":
      return (
        <>
          <div>
            <label>Em qual teste?</label>
            <SelectAlvo
              valor={e.alvo ?? "qualquer"}
              onChange={(v) => onPatch({ alvo: v || undefined } as Partial<EfeitoHabilidade>)}
              alvos={ALVOS_CONTEXTUAIS}
            />
          </div>
          <div>
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
              <option value={10}>≤9 vira 10</option>
              <option value={15}>≤15 vira 15</option>
              <option value={0}>Desligado</option>
            </select>
          </div>
        </>
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
          <CampoQuando
            valor={e.quando}
            onPatch={onPatch}
            placeholder="1ª salv. de concentração…"
          />
        </>
      );
    case "dano_min":
      return (
        <>
          <div style={{ gridColumn: "1 / -1", fontSize: "0.8rem", color: "var(--text-sec)" }}>
            Metade do dano máximo, arredondado pra cima.
          </div>
          <SelectLista
            label="Em qual dano?"
            valor={e.em ?? "dano"}
            opcoes={ALVOS_DANO}
            onChange={(v) => onPatch({ em: v === "dano" ? undefined : v } as Partial<EfeitoHabilidade>)}
          />
          <FiltroDanoCampos graus={e.graus} tipos={e.tipos} onPatch={onPatch} aberto={!!e.quando}>
            <Campo
              label="Quando se aplica"
              valor={e.quando ?? ""}
              onChange={(v) => onPatch({ quando: v || undefined } as Partial<EfeitoHabilidade>)}
              placeholder="contra alvo caído…"
              title="Preenchido, fica desligado no Rolador até você ligar"
            />
          </FiltroDanoCampos>
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
    case "desconto_tecnica": {
      const graus = e.graus ?? [];
      return (
        <>
          <SelectLista
            label="Como"
            valor={e.modo ?? "menos"}
            opcoes={[
              { slug: "menos", nome: "Custa menos" },
              { slug: "metade", nome: "Pela metade" },
              { slug: "zero", nome: "De graça" },
            ]}
            onChange={(v) =>
              onPatch({ modo: v === "menos" ? undefined : v } as Partial<EfeitoHabilidade>)
            }
          />
          {!e.modo && (
            <CampoFormula
              label="Quanto a menos"
              valor={e.formula ?? String(e.valor)}
              onChange={(v) => onPatch(patchDeFormula(v))}
              placeholder="1, GRAU, GRAU/2…"
              comGrau
            />
          )}
          <Detalhes aberto={graus.length > 0 || e.minimo !== undefined}>
            {e.modo !== "zero" && (
              <SelectLista
                label="Não baixa de"
                valor={e.minimo === undefined ? "padrao" : String(e.minimo)}
                opcoes={[
                  { slug: "padrao", nome: e.modo === "metade" ? "Sem mínimo" : "Metade do custo" },
                  { slug: "1", nome: "1" },
                  { slug: "0", nome: "0" },
                ]}
                onChange={(v) =>
                  onPatch({
                    minimo: v === "padrao" ? undefined : Number(v),
                  } as Partial<EfeitoHabilidade>)
                }
              />
            )}
            <div style={{ gridColumn: "1 / -1" }}>
              <label>Só nos graus</label>
              <div className="origem-pills">
                {GRAUS.map((g) => (
                  <button
                    type="button"
                    key={g}
                    className={`origem-pill ${graus.includes(g) ? "ativo" : ""}`}
                    aria-pressed={graus.includes(g)}
                    onClick={() => {
                      const novos = graus.includes(g)
                        ? graus.filter((x) => x !== g)
                        : [...graus, g].sort((a, b) => a - b);
                      onPatch({ graus: novos.length ? novos : undefined } as Partial<EfeitoHabilidade>);
                    }}
                  >
                    {g}º
                  </button>
                ))}
              </div>
            </div>
          </Detalhes>
        </>
      );
    }
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
    case "dano_extra":
      return (
        <>
          <CampoFormula
            label={extraNoDano(e.em) ? "Dano" : "Dados"}
            valor={e.formula}
            onChange={(v) => onPatch({ formula: v } as Partial<EfeitoHabilidade>)}
            placeholder={extraNoDano(e.em) ? "1d6, 1d10 fogo, NIVELd4…" : "1d4, 1d6…"}
            dados
            comGrau={extraNoDano(e.em)}
          />
          <SelectLista
            label="Em qual rolagem?"
            valor={e.em ?? "dano"}
            opcoes={[
              ...ALVOS_DADO_EXTRA,
              ...periciasCustom.map((a) => ({ ...a, grupo: "Perícia" })),
            ]}
            onChange={(v) =>
              onPatch({
                em: v === "dano" ? undefined : v,
                // Na cura não tem Rolador: soma sempre.
                ...(v === "cura" ? { sempre: true } : {}),
              } as Partial<EfeitoHabilidade>)
            }
          />
          {e.em !== "cura" && <CheckSempre sempre={!!e.sempre} onPatch={onPatch} />}
          {extraNoDano(e.em) && (
            <FiltroDanoCampos graus={e.graus} tipos={e.tipos} onPatch={onPatch} />
          )}
        </>
      );
    case "dados_extra":
      return (
        <>
          <CampoFormula
            label="Quantos dados"
            valor={e.quantidade}
            onChange={(v) => onPatch({ quantidade: v } as Partial<EfeitoHabilidade>)}
            placeholder="1, 2, GRAU…"
            comGrau
          />
          <SelectLista
            label="Em qual dano?"
            valor={e.em ?? "dano"}
            opcoes={ALVOS_DANO}
            onChange={(v) => onPatch({ em: v === "dano" ? undefined : v } as Partial<EfeitoHabilidade>)}
          />
          <CheckSempre sempre={!!e.sempre} onPatch={onPatch} />
          <FiltroDanoCampos graus={e.graus} tipos={e.tipos} onPatch={onPatch} />
        </>
      );
    case "valor_fixo":
      return (
        <>
          <SelectLista
            label="O quê"
            valor={e.alvo}
            opcoes={ALVOS_VALOR_FIXO}
            onChange={(v) => onPatch({ alvo: v } as Partial<EfeitoHabilidade>)}
          />
          <CampoFormula
            label="Vira"
            valor={e.valor}
            onChange={(v) => onPatch({ valor: v } as Partial<EfeitoHabilidade>)}
            placeholder={e.alvo === "dado-arma" ? "1d10, 2d6…" : "17, 12, PROF+10…"}
            dados={e.alvo === "dado-arma"}
          />
        </>
      );
    case "reducao_dano":
      return (
        <>
          <CampoFormula
            label="Quanto"
            valor={e.formula ?? (e.valor ? String(e.valor) : "")}
            onChange={(v) => onPatch(patchDeFormula(v))}
            placeholder="5, PROF…"
          />
          <Campo
            label="Tipos de dano"
            valor={e.tipos ?? ""}
            onChange={(v) => onPatch({ tipos: v || undefined } as Partial<EfeitoHabilidade>)}
            placeholder="todos"
          />
          <CampoQuando valor={e.quando} onPatch={onPatch} placeholder="1× por turno…" />
        </>
      );
    case "dano_maximo":
      return (
        <>
          <SelectLista
            label="Em qual dano?"
            valor={e.em ?? "dano"}
            opcoes={ALVOS_DANO}
            onChange={(v) => onPatch({ em: v === "dano" ? undefined : v } as Partial<EfeitoHabilidade>)}
          />
          <SelectLista
            label="Liga sozinho com d20"
            valor={String(e.apartir ?? 0)}
            opcoes={[
              { slug: "0", nome: "—" },
              ...[10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((n) => ({
                slug: String(n),
                nome: `${n} ou mais`,
              })),
            ]}
            onChange={(v) =>
              onPatch({ apartir: Number(v) || undefined } as Partial<EfeitoHabilidade>)
            }
          />
          <CheckSempre sempre={!!e.sempre} onPatch={onPatch} rotulo="Sempre vale" />
          <FiltroDanoCampos graus={e.graus} tipos={e.tipos} onPatch={onPatch} />
        </>
      );
    case "piso_dado":
      return (
        <>
          <SelectLista
            label="Dado que rolar até"
            valor={String(e.ate)}
            opcoes={[1, 2, 3, 4, 5, 6].map((n) => ({ slug: String(n), nome: String(n) }))}
            onChange={(v) => onPatch({ ate: Number(v) || 1 } as Partial<EfeitoHabilidade>)}
          />
          <SelectLista
            label="Vira"
            valor={String(e.vira)}
            opcoes={[
              { slug: "0", nome: "O máximo" },
              ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({ slug: String(n), nome: String(n) })),
            ]}
            onChange={(v) => onPatch({ vira: Number(v) || 0 } as Partial<EfeitoHabilidade>)}
          />
          <SelectLista
            label="Em qual dano?"
            valor={e.em ?? "dano"}
            opcoes={ALVOS_DANO}
            onChange={(v) => onPatch({ em: v === "dano" ? undefined : v } as Partial<EfeitoHabilidade>)}
          />
          <FiltroDanoCampos graus={e.graus} tipos={e.tipos} onPatch={onPatch} />
        </>
      );
    case "critico_extra":
      return (
        <>
          <SelectLista
            label="Dados do crítico"
            valor={String(e.vezes)}
            opcoes={[
              { slug: "2", nome: "Dobram" },
              { slug: "3", nome: "Triplicam" },
              { slug: "4", nome: "Quadruplicam" },
            ]}
            onChange={(v) => onPatch({ vezes: Number(v) || 2 } as Partial<EfeitoHabilidade>)}
          />
          <CampoNum
            label="Dados a mais"
            valor={e.dados}
            onChange={(v) => onPatch({ dados: Math.min(10, Math.max(0, v)) } as Partial<EfeitoHabilidade>)}
          />
          <SelectLista
            label="Em qual dano?"
            valor={e.em ?? "dano"}
            opcoes={ALVOS_DANO}
            onChange={(v) => onPatch({ em: v === "dano" ? undefined : v } as Partial<EfeitoHabilidade>)}
          />
        </>
      );
    case "ataque_poderoso":
      return (
        <>
          <CampoNum
            label="Menos no ataque"
            valor={e.penalidade}
            onChange={(v) =>
              onPatch({ penalidade: Math.min(20, Math.max(0, v)) } as Partial<EfeitoHabilidade>)
            }
          />
          <CampoNum
            label="Mais no dano"
            valor={e.bonus}
            onChange={(v) => onPatch({ bonus: Math.min(50, Math.max(0, v)) } as Partial<EfeitoHabilidade>)}
          />
          <SelectLista
            label="Em qual ataque?"
            valor={e.alvo ?? "ataque"}
            opcoes={ALVOS_ATAQUE}
            onChange={(v) => onPatch({ alvo: v === "ataque" ? undefined : v } as Partial<EfeitoHabilidade>)}
          />
        </>
      );
    case "ignora_exaustao":
      return (
        <SelectLista
          label="Até o nível"
          valor={String(e.ate)}
          opcoes={[
            ...[1, 2, 3, 4, 5].map((n) => ({ slug: String(n), nome: `${n}º` })),
            { slug: "6", nome: "Todos" },
          ]}
          onChange={(v) => onPatch({ ate: Number(v) || 5 } as Partial<EfeitoHabilidade>)}
        />
      );
    case "descanso":
      return (
        <>
          <SelectLista
            label="Em qual descanso?"
            valor={e.em}
            opcoes={[
              { slug: "curto", nome: "Curto" },
              { slug: "longo", nome: "Longo" },
              { slug: "ambos", nome: "Os dois" },
            ]}
            onChange={(v) => onPatch({ em: v } as Partial<EfeitoHabilidade>)}
          />
          <CampoNum
            label="Exaustão a menos"
            valor={e.exaustao}
            onChange={(v) =>
              onPatch({ exaustao: Math.min(6, Math.max(0, v)) } as Partial<EfeitoHabilidade>)
            }
          />
          <CampoFormula
            label="PP a mais"
            valor={e.pp}
            onChange={(v) => onPatch({ pp: v } as Partial<EfeitoHabilidade>)}
            placeholder="5, PROF…"
          />
          <CampoNum
            label="Dados de Vida a mais"
            valor={e.dv}
            onChange={(v) => onPatch({ dv: Math.min(20, Math.max(0, v)) } as Partial<EfeitoHabilidade>)}
          />
        </>
      );
    case "por_turno": {
      const orfao =
        e.o === "recurso" &&
        !!e.recurso &&
        e.recurso !== "pp" &&
        e.recurso !== "exaustao" &&
        !recursos.some((r) => r.id === e.recurso);
      return (
        <>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>O quê</label>
            <Segmentos
              rotulo="O que acontece a cada turno"
              valor={e.o}
              opcoes={[
                { valor: "cura", rotulo: "Cura" },
                { valor: "pv_temp", rotulo: "PV temporário" },
                { valor: "dano", rotulo: "Dano" },
                { valor: "recurso", rotulo: "Recurso" },
              ]}
              onChange={(o) =>
                onPatch({
                  o,
                  recurso: o === "recurso" ? e.recurso || "pp" : undefined,
                  gasta: o === "recurso" ? e.gasta : undefined,
                  tipoDano: o === "dano" ? e.tipoDano : undefined,
                } as Partial<EfeitoHabilidade>)
              }
            />
          </div>
          {e.o === "recurso" && (
            <>
              <div>
                <label>Recurso</label>
                <select
                  value={e.recurso ?? ""}
                  onChange={(ev) => onPatch({ recurso: ev.target.value } as Partial<EfeitoHabilidade>)}
                >
                  <option value="pp">PP</option>
                  <option value="exaustao">Exaustão</option>
                  {recursos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                  {orfao && <option value={e.recurso}>(recurso apagado)</option>}
                </select>
              </div>
              <div>
                <label>Ganha ou gasta</label>
                <Segmentos
                  rotulo="Ganha ou gasta"
                  valor={e.gasta ? "gasta" : "ganha"}
                  opcoes={[
                    { valor: "ganha", rotulo: "Ganha" },
                    { valor: "gasta", rotulo: "Gasta" },
                  ]}
                  onChange={(v) => onPatch({ gasta: v === "gasta" || undefined } as Partial<EfeitoHabilidade>)}
                />
              </div>
            </>
          )}
          <CampoFormula
            label="Quanto"
            valor={e.valor}
            onChange={(v) => onPatch({ valor: v } as Partial<EfeitoHabilidade>)}
            placeholder={e.o === "recurso" ? "1, 2…" : "1d6+CON, 5, NIVEL…"}
            dados={e.o !== "recurso"}
          />
          {e.o === "dano" && (
            <Campo
              label="Tipo de dano"
              valor={e.tipoDano ?? ""}
              onChange={(v) => onPatch({ tipoDano: v || undefined } as Partial<EfeitoHabilidade>)}
              placeholder="fogo, veneno…"
            />
          )}
        </>
      );
    }
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
  title,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  list?: string;
  title?: string;
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
          title={title}
        />
      )}
    </div>
  );
}

// Número ou fórmula ("PROF/2+1", "3*NIVEL"): número puro vira `valor`.
function patchDeFormula(texto: string): Partial<EfeitoHabilidade> {
  const t = texto.trim();
  if (t === "" || Number.isFinite(Number(t))) {
    return { valor: Number(t) || 0, formula: undefined } as Partial<EfeitoHabilidade>;
  }
  return { valor: 0, formula: texto } as Partial<EfeitoHabilidade>;
}

// Select de uma lista fixa (sem texto livre); agrupa quando a opção tem `grupo`.
function SelectLista({
  label,
  valor,
  opcoes,
  onChange,
}: {
  label: string;
  valor: string;
  opcoes: { slug: string; nome: string; grupo?: string }[];
  onChange: (v: string) => void;
}) {
  const grupos = new Map<string, { slug: string; nome: string }[]>();
  for (const o of opcoes) {
    const g = o.grupo ?? "";
    grupos.set(g, [...(grupos.get(g) ?? []), o]);
  }
  const itens = (lista: { slug: string; nome: string }[]) =>
    lista.map((o) => (
      <option key={o.slug} value={o.slug}>
        {o.nome}
      </option>
    ));
  return (
    <div>
      <label>{label}</label>
      <select value={valor} onChange={(ev) => onChange(ev.target.value)}>
        {[...grupos].map(([grupo, lista]) =>
          grupo ? (
            <optgroup key={grupo} label={grupo}>
              {itens(lista)}
            </optgroup>
          ) : (
            itens(lista)
          ),
        )}
      </select>
    </div>
  );
}

// Dano extra/dados extras: somar sempre ou ligar na hora de rolar.
function CheckSempre({
  sempre,
  onPatch,
  rotulo = "Sempre soma",
}: {
  sempre: boolean;
  onPatch: (p: Partial<EfeitoHabilidade>) => void;
  rotulo?: string;
}) {
  return (
    <label className="checkbox-linha" style={{ gridColumn: "1 / -1", marginTop: 4 }}>
      <input
        type="checkbox"
        checked={sempre}
        onChange={(ev) => onPatch({ sempre: ev.target.checked || undefined } as Partial<EfeitoHabilidade>)}
      />
      {rotulo}
    </label>
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
