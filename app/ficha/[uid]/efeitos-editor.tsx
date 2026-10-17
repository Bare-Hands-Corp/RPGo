"use client";

// Editor de efeitos estruturados, usado por Habilidades e Itens.

import { createContext, useContext, useEffect, useEffectEvent, useState } from "react";
import {
  ALVOS_AGREGAVEIS,
  ALVOS_ATAQUE,
  ALVOS_CONTEXTUAIS,
  ALVOS_DADO_EXTRA,
  ALVOS_DANO,
  ALVOS_SUBSTITUIVEIS,
  ALVOS_VALOR_FIXO,
  ALVOS_VALOR_IGUAL,
  ATRIBUTOS,
  DEFESAS_IGNORADAS,
  EVENTO_PASSOS,
  GRUPOS_PRESET,
  META_EFEITOS,
  MOVIMENTOS,
  PRESETS_EFEITO,
  alvoDeRolagem,
  comoDura,
  comPassosProgressivos,
  defesasIgnoradas,
  dependeDosUsos,
  extraNoDano,
  formatarMod,
  formulaResolvidaTexto,
  lerEfeitos,
  nomeDoEfeito,
  podeSerSempreAtivo,
  alvoDaCura,
  progressivoNaFicha,
  resolverFormula,
  resumoEfeito,
  rotuloAlvo,
  type Atributo,
  type DuraEfeito,
  type EfeitoHabilidade,
  type PassosDoRolador,
} from "@/lib/op-rpg";
import {
  CampoPasso,
  CondicaoCampo,
  Segmentos,
  Sugestoes,
  TipoDanoCampo,
  TiposDanoCampo,
} from "./campos-modal";
import { Tooltip } from "@/components/tooltip";
import { casaBusca, normalizarBusca } from "./barra-filtros";
import { CampoFormula, FormulaContext } from "./campo-formula";
import { DURACOES_CONDICAO, RODADAS_PADRAO } from "@/lib/condicoes";
import { DURACOES_PV_TEMP, type DuracaoPvTemp } from "@/lib/duracao";
import { SeletorBusca } from "./seletor-busca";

export { FormulaContext };

export type RecursoMinimo = { id: string; nome: string };

export type AlvoEntry = { slug: string; nome: string; grupo: string };

// Perícias customizadas como alvo de efeito.
export const AlvosCustomContext = createContext<AlvoEntry[]>([]);

// Nome dos recursos custom por id (chips).
export const NomesRecursoContext = createContext<Map<string, string>>(new Map());

// Efeito de uma ação: vale só nas rolagens dela.
export const EfeitoDeAcaoContext = createContext(false);

// A ação dura mais que o uso: cada efeito escolhe se repete ou se mantém.
export const EfeitosDuramContext = createContext(false);

const TEXTO_DURA: Record<DuraEfeito, string> = {
  turno: "a cada turno",
  mantem: "enquanto durar",
};

// Numa ação, o passo de dano sobe o dado dela (sem escolher arma ou técnica).
function resumoNaAcao(e: EfeitoHabilidade): string | null {
  return e.tipo === "passo_dano" ? `+${e.passos}` : null;
}

// Picker de efeitos + lista de editores.
export function EfeitosEditor({
  efeitos,
  onChange,
  recursos,
  pergunta,
  presets,
  sempreAtivo,
}: {
  efeitos: EfeitoHabilidade[];
  onChange: (efeitos: EfeitoHabilidade[]) => void;
  recursos: RecursoMinimo[];
  /** Pergunta do picker — "O que essa habilidade faz?" / "…esse item faz?". */
  pergunta: string;
  /** Presets oferecidos (id); ausente = todos. */
  presets?: string[];
  /**
   * Oferece "Sempre ativo": em todo efeito que fica valendo (habilidade de Usar
   * ou de ligar) ou só nos que gastam uso (passiva com usos limitados).
   */
  sempreAtivo?: "todos" | "gastam";
}) {
  const [pickerAberto, setPickerAberto] = useState(false);
  // O "a cada turno" é editado junto da duração: não entra na lista.
  const visiveis = efeitos.flatMap((e, i) => (e.tipo === "por_turno" ? [] : [i]));
  // Um efeito aberto por vez; os outros mostram só o resumo.
  const [aberto, setAberto] = useState<number | null>(() => (visiveis.length === 1 ? visiveis[0] : null));

  function adicionar(presetId: string) {
    const preset = PRESETS_EFEITO.find((p) => p.id === presetId);
    if (!preset) return;
    onChange([...efeitos, preset.criar()]);
    setAberto(efeitos.length);
    setPickerAberto(false);
  }

  function mover(i: number, passo: -1 | 1) {
    const j = visiveis[visiveis.indexOf(i) + passo];
    if (j === undefined) return;
    const nova = [...efeitos];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    onChange(nova);
    if (aberto === i) setAberto(j);
    else if (aberto === j) setAberto(i);
  }

  function duplicar(i: number) {
    onChange([...efeitos.slice(0, i + 1), structuredClone(efeitos[i]), ...efeitos.slice(i + 1)]);
    setAberto(i + 1);
  }

  function remover(i: number) {
    onChange(efeitos.filter((_, j) => j !== i));
    setAberto((a) => (a === null || a === i ? null : a > i ? a - 1 : a));
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

      {visiveis.map((i, pos) => (
        <EditorEfeito
          key={i}
          efeito={efeitos[i]}
          recursos={recursos}
          sempreAtivo={sempreAtivo}
          aberto={aberto === i}
          onAlternar={() => setAberto(aberto === i ? null : i)}
          onPatch={(p) => patch(i, p)}
          onSubir={pos > 0 ? () => mover(i, -1) : undefined}
          onDescer={pos < visiveis.length - 1 ? () => mover(i, 1) : undefined}
          onDuplicar={() => duplicar(i)}
          onRemover={() => remover(i)}
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
// `grau` resolve GRAU (técnica). `dura`: numa ação com duração, o que o efeito
// faz depois do uso.
export function ChipEfeito({
  efeito,
  grau,
  dura,
  comUsos = false,
}: {
  efeito: EfeitoHabilidade;
  grau?: number;
  dura?: DuraEfeito;
  // A fonte é passiva com usos limitados: marca o efeito que gasta 1 uso.
  comUsos?: boolean;
}) {
  const meta = META_EFEITOS[efeito.tipo];
  const periciasCustom = useContext(AlvosCustomContext);
  const gastaUso =
    comUsos &&
    !efeito.sempreAtivo &&
    dependeDosUsos(efeito, new Set(periciasCustom.map((a) => a.slug)));
  const nomesRecurso = useContext(NomesRecursoContext);
  const formula = useContext(FormulaContext);
  const naAcao = useContext(EfeitoDeAcaoContext) ? resumoNaAcao(efeito) : null;
  const nome = (id: string) => nomesRecurso.get(id);
  const resumo = naAcao ?? resumoEfeito(efeito, nome, formula ? { ...formula, grau } : undefined);
  const cru = naAcao ?? resumoEfeito(efeito, nome);
  return (
    <Tooltip
      titulo={nomeDoEfeito(efeito)}
      icone={meta.icone}
      cor={meta.cor}
      selo={dura ? TEXTO_DURA[dura] : undefined}
      texto={[resumo, cru !== resumo && `Fórmula: ${cru}`]}
    >
    <span
      className="efeito-chip"
      style={{
        background: `color-mix(in oklch, ${meta.cor} 15%, transparent)`,
        color: meta.cor,
        borderColor: `color-mix(in oklch, ${meta.cor} 35%, transparent)`,
      }}
    >
      <i className={`fas ${meta.icone}`} />
      <span className="efeito-chip-label">{nomeDoEfeito(efeito)}</span>
      <span className="efeito-chip-resumo">{resumo}</span>
      {efeito.sempreAtivo && <i className="fas fa-infinity" title="Sempre ativo" />}
      {gastaUso && <i className="fas fa-bolt-lightning" title="Gasta 1 uso" />}
      {dura && (
        <span className="efeito-chip-dura">
          <i className={`fas ${dura === "mantem" ? "fa-hourglass-half" : "fa-clock-rotate-left"}`} />{" "}
          {TEXTO_DURA[dura]}
        </span>
      )}
    </span>
    </Tooltip>
  );
}

// "A cada turno" no card, junto da duração.
export function StatsPorTurno({ efeitos, grau }: { efeitos: EfeitoHabilidade[]; grau?: number }) {
  const nomesRecurso = useContext(NomesRecursoContext);
  const formula = useContext(FormulaContext);
  const nome = (id: string) => nomesRecurso.get(id);
  return efeitos.map((e, i) => {
    if (e.tipo !== "por_turno") return null;
    const resumo = resumoEfeito(e, nome, formula ? { ...formula, grau } : undefined);
    const cru = resumoEfeito(e, nome);
    return (
      <Tooltip
        key={`turno-${i}`}
        titulo="A cada turno"
        icone="fa-clock-rotate-left"
        texto={[`${resumo} por turno`, cru !== resumo && `Fórmula: ${cru}`]}
      >
        <span className="acao-stat acao-por-turno">
          <i className="fas fa-clock-rotate-left" /> {resumo} por turno
        </span>
      </Tooltip>
    );
  });
}

// Contador manual dos bônus progressivos; fica no card e é o mesmo do Rolador.
export function PassosProgressivos({
  efeitos,
  onChange,
  travado,
  grau,
}: {
  efeitos: EfeitoHabilidade[];
  onChange: (efeitos: EfeitoHabilidade[]) => void;
  travado?: boolean;
  // Grau da técnica, pro GRAU da fórmula.
  grau?: number;
}) {
  const formula = useContext(FormulaContext);
  const linhas = efeitos.flatMap((e, i) => (e.tipo === "progressivo" ? [{ e, i }] : []));
  if (linhas.length === 0) return null;
  return (
    <div className="passos-progressivos">
      {linhas.map(({ e, i }) => {
        const passos = Math.min(e.max, e.passos ?? 0);
        const r = formula
          ? resolverFormula(e.formula, formula.atributos, formula.nivel, { grau })
          : { dados: [], modificador: Number(e.formula) || 0 };
        const texto = formula
          ? formulaResolvidaTexto(e.formula, formula.atributos, formula.nivel, { grau })
          : e.formula;
        // Com dado, a fórmula e as vezes; só número, o total.
        const valor =
          r.dados.length > 0
            ? `+${texto.replace(/^\+\s*/, "")} ×${passos}`
            : formatarMod(r.modificador * passos);
        const alvo = rotuloAlvo(e.em ?? "dano").replace(/ \(.*\)$/, "");
        const mudar = (n: number) =>
          onChange(efeitos.map((x, j) => (j === i ? { ...e, passos: n || undefined } : x)));
        return (
          <span key={i} className={`passos-progressivo${passos > 0 ? " on" : ""}`}>
            <button
              type="button"
              aria-label={`Menos ${alvo}`}
              disabled={travado || passos <= 0}
              onClick={() => mudar(passos - 1)}
            >
              <i className="fas fa-minus" />
            </button>
            <span className="passos-progressivo-valor">
              <i className="fas fa-arrow-trend-up" /> {alvo} <strong>{valor}</strong>
              <small>
                {passos}/{e.max}
              </small>
            </span>
            <button
              type="button"
              aria-label={`Mais ${alvo}`}
              disabled={travado || passos >= e.max}
              onClick={() => mudar(passos + 1)}
            >
              <i className="fas fa-plus" />
            </button>
          </span>
        );
      })}
    </div>
  );
}

// Contagem mexida no Rolador: acha o efeito pelo nome da fonte e manda gravar.
export function useContagemDoRolador<T extends { nome: string; efeitos: unknown }>(
  lista: T[],
  gravar: (item: T, efeitos: EfeitoHabilidade[]) => void,
) {
  const aoMudar = useEffectEvent((d: PassosDoRolador) => {
    for (const item of lista) {
      if (item.nome !== d.fonte) continue;
      const efeitos = comPassosProgressivos(lerEfeitos(item.efeitos), d);
      if (efeitos) gravar(item, efeitos);
    }
  });
  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<PassosDoRolador>).detail;
      if (det) aoMudar(det);
    }
    window.addEventListener(EVENTO_PASSOS, ouvir);
    return () => window.removeEventListener(EVENTO_PASSOS, ouvir);
  }, []);
}

// Cor do cartão: a do efeito que o preset cria.
const COR_DO_PRESET = new Map(PRESETS_EFEITO.map((p) => [p.id, META_EFEITOS[p.criar().tipo].cor]));

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
  const [busca, setBusca] = useState("");
  const oferecidos = PRESETS_EFEITO.filter(
    (p) => (!presets || presets.includes(p.id)) && casaBusca(busca, [p.nome, p.descricao]),
  );
  // Enter escolhe o que começa com o que foi digitado; senão, o primeiro da lista.
  const melhor =
    oferecidos.find((p) => casaBusca(busca, [p.nome]) && normalizarBusca(p.nome).startsWith(normalizarBusca(busca.trim()))) ??
    oferecidos[0];
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
      <div className="picker-preset-busca">
        <i className="fas fa-magnifying-glass" />
        <input
          type="text"
          value={busca}
          placeholder="Buscar efeito"
          aria-label="Buscar efeito"
          spellCheck={false}
          autoComplete="off"
          autoFocus
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (busca.trim() && melhor) onPick(melhor.id);
            }
          }}
        />
      </div>
      {oferecidos.length === 0 && <p className="picker-preset-vazio">Nada casa com “{busca}”.</p>}
      {GRUPOS_PRESET.map((grupo) => {
        const lista = oferecidos.filter((p) => p.grupo === grupo.slug);
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
                  style={{ borderLeftColor: COR_DO_PRESET.get(p.id) }}
                >
                  <i className={`fas ${p.icone}`} style={{ color: COR_DO_PRESET.get(p.id) }} />
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
// Dano: todo, corpo a corpo ou à distância (o de técnica e comum fica de fora).
const ALVOS_MULTIPLICADOR = [
  ...ALVOS_AGREGAVEIS.filter((a) => ALVOS_MULTIPLICADOR_SLUGS.has(a.slug)),
  ...ALVOS_DANO.filter((a) => a.slug === "dano" || a.slug === "dano-cc" || a.slug === "dano-distancia"),
];

// Alvos da proficiência: perícia e salvaguarda.
const ALVOS_PROFICIENCIA = ALVOS_AGREGAVEIS.filter(
  (a) => a.grupo === "Perícia" || a.grupo === "Salvaguarda",
);

// Alvo do efeito: paleta com busca; o texto digitado também vale.
function SelectAlvo({
  valor,
  onChange,
  titulo = "Em qual?",
  alvos = ALVOS_AGREGAVEIS,
}: {
  valor: string;
  onChange: (v: string) => void;
  titulo?: string;
  placeholder?: string;
  alvos?: typeof ALVOS_AGREGAVEIS;
}) {
  // Perícias customizadas entram nas listas de perícia.
  const periciasCustom = useContext(AlvosCustomContext);
  const alvosFinais =
    periciasCustom.length > 0 && alvos.some((a) => a.grupo === "Perícia")
      ? [...alvos, ...periciasCustom]
      : alvos;
  return <SeletorBusca valor={valor} opcoes={alvosFinais} onChange={onChange} titulo={titulo} livre />;
}

// ─── Editor de efeito (campos por tipo) ────────────────────────────────
function EditorEfeito({
  efeito,
  recursos,
  sempreAtivo,
  aberto,
  onAlternar,
  onPatch,
  onSubir,
  onDescer,
  onDuplicar,
  onRemover,
}: {
  efeito: EfeitoHabilidade;
  recursos: RecursoMinimo[];
  sempreAtivo?: "todos" | "gastam";
  aberto: boolean;
  onAlternar: () => void;
  onPatch: (patch: Partial<EfeitoHabilidade>) => void;
  // Ausente na ponta da lista.
  onSubir?: () => void;
  onDescer?: () => void;
  onDuplicar: () => void;
  onRemover: () => void;
}) {
  const meta = META_EFEITOS[efeito.tipo];
  const periciasCustom = useContext(AlvosCustomContext);
  const nomesRecurso = useContext(NomesRecursoContext);
  const formula = useContext(FormulaContext);
  const daAcao = useContext(EfeitoDeAcaoContext);
  // Na passiva com usos, este efeito só vale gastando 1 uso (chip desligado no Rolador).
  const gastaUso =
    sempreAtivo === "gastam" &&
    !efeito.sempreAtivo &&
    dependeDosUsos(efeito, new Set(periciasCustom.map((a) => a.slug)));
  // Efeito sem parâmetro não tem corpo.
  const corpo = renderCorpo(efeito, recursos, onPatch, periciasCustom, daAcao, gastaUso);
  // Em ação com duração: repete a cada turno ou fica valendo.
  const como = useContext(EfeitosDuramContext) ? comoDura(efeito) : null;
  const dura = como ? duraQueCabe(como, efeito.dura) : undefined;
  // Incompleto some ao salvar: avisa em vez de mostrar um resumo pela metade.
  const completo = lerEfeitos([efeito]).length > 0;
  const resumo = completo
    ? ((daAcao ? resumoNaAcao(efeito) : null) ??
        resumoEfeito(efeito, (id) => nomesRecurso.get(id), formula ?? undefined)) +
      (dura ? ` · ${TEXTO_DURA[dura]}` : "")
    : "falta preencher";
  const nome = nomeDoEfeito(efeito);
  // Quem já está marcado segue mostrando, pra dar pra desmarcar.
  const ofereceSempre =
    !!efeito.sempreAtivo || gastaUso || (sempreAtivo === "todos" && podeSerSempreAtivo(efeito));
  return (
    <div className={`efeito-editor${aberto ? " aberto" : ""}`}>
      <div className="efeito-editor-topo">
        <button
          type="button"
          className="efeito-editor-abrir"
          aria-expanded={aberto}
          onClick={onAlternar}
        >
          <i className={`fas ${meta.icone}`} style={{ color: meta.cor }} />
          <strong>{nome}</strong>
          {resumo && (
            <span className={`efeito-editor-resumo${completo ? "" : " falta"}`}>{resumo}</span>
          )}
          {efeito.sempreAtivo && <i className="fas fa-infinity efeito-sempre" title="Sempre ativo" />}
          {gastaUso && <i className="fas fa-bolt-lightning efeito-sempre" title="Gasta 1 uso" />}
          <i className="fas fa-chevron-down efeito-editor-seta" />
        </button>
        <span className="efeito-editor-acoes">
          <button type="button" title="Subir" aria-label={`Subir ${nome}`} disabled={!onSubir} onClick={onSubir}>
            <i className="fas fa-arrow-up" />
          </button>
          <button type="button" title="Descer" aria-label={`Descer ${nome}`} disabled={!onDescer} onClick={onDescer}>
            <i className="fas fa-arrow-down" />
          </button>
          <button type="button" title="Duplicar" aria-label={`Duplicar ${nome}`} onClick={onDuplicar}>
            <i className="fas fa-copy" />
          </button>
          <button
            type="button"
            className="efeito-editor-rm"
            title="Remover efeito"
            aria-label={`Remover ${nome}`}
            onClick={onRemover}
          >
            <i className="fas fa-xmark" />
          </button>
        </span>
      </div>
      {aberto && (corpo || ofereceSempre || como) && (
        <div className="efeito-editor-corpo">
          {corpo}
          {como && <CampoDura como={como} valor={dura} onPatch={onPatch} />}
          {ofereceSempre && (
            <div style={{ gridColumn: "1 / -1" }}>
              <Alternar
                rotulo="Sempre ativo"
                ligado={!!efeito.sempreAtivo}
                onChange={(v) => onPatch({ sempreAtivo: v || undefined })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// O `dura` gravado, se ainda cabe no efeito (o alvo pode ter mudado).
function duraQueCabe(como: "repete" | "mantem", dura: DuraEfeito | undefined): DuraEfeito | undefined {
  if (como === "mantem") return dura === "mantem" ? dura : undefined;
  return dura === "turno" ? dura : undefined;
}

// Em ação com duração: o que o efeito faz depois do uso.
function CampoDura({
  como,
  valor,
  onPatch,
}: {
  como: "repete" | "mantem";
  valor: DuraEfeito | undefined;
  onPatch: (p: Partial<EfeitoHabilidade>) => void;
}) {
  const opcoes: { valor: DuraEfeito | "uso"; rotulo: string; titulo: string }[] =
    como === "repete"
      ? [
          { valor: "uso", rotulo: "Ao usar", titulo: "Acontece uma vez, na hora do uso" },
          {
            valor: "turno",
            rotulo: "A cada turno",
            titulo: "Acontece ao usar (conta como o 1º turno) e repete no Passar turno enquanto a ação durar",
          },
        ]
      : [
          { valor: "uso", rotulo: "Só nesta ação", titulo: "Vale nas rolagens da própria ação" },
          { valor: "mantem", rotulo: "Enquanto durar", titulo: "Fica valendo na ficha até a ação acabar" },
        ];
  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <label>{como === "repete" ? "Acontece" : "Vale"}</label>
      <Segmentos
        rotulo={como === "repete" ? "Quando acontece" : "Onde vale"}
        valor={valor ?? "uso"}
        opcoes={opcoes}
        onChange={(v) => onPatch({ dura: v === "uso" ? undefined : v } as Partial<EfeitoHabilidade>)}
      />
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
      <summary>Mais opções</summary>
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
        label="Quando"
        valor={valor ?? ""}
        onChange={(v) => onPatch({ quando: v || undefined } as Partial<EfeitoHabilidade>)}
        placeholder={placeholder ?? "no escuro, contra Provocação…"}
        title="Preenchido, fica desligado no Rolador até você ligar"
      />
    </Detalhes>
  );
}

const GRAUS = [1, 2, 3, 4, 5, 6, 7];

// Atalhos do alcance que troca o da ação.
const ALCANCES_TROCADOS = ["Campo de visão", "1,5 m"];

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
      <div style={{ gridColumn: "1 / -1" }}>
        <TiposDanoCampo
          rotulo="Só nos tipos"
          vazioETodos
          valor={tipos ?? ""}
          onChange={(v) => onPatch({ tipos: v || undefined } as Partial<EfeitoHabilidade>)}
        />
      </div>
    </Detalhes>
  );
}

// Defesas que o ataque ignora: as do livro em chips e outras por escrito.
function DefesasIgnoradasCampo({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (defesas: string) => void;
}) {
  const todas = defesasIgnoradas(valor);
  const marcadas = DEFESAS_IGNORADAS.filter((d) => todas.includes(d));
  const [outras, setOutras] = useState(() =>
    todas.filter((d) => !DEFESAS_IGNORADAS.includes(d)).join(", "),
  );
  const montar = (lista: string[], extras: string) =>
    onChange([...lista, extras.trim()].filter(Boolean).join(", "));
  return (
    <div className="chips-campo" style={{ gridColumn: "1 / -1" }}>
      <label>Defesa</label>
      <Sugestoes limite={DEFESAS_IGNORADAS.length}>
        {DEFESAS_IGNORADAS.map((d) => {
          const ativo = marcadas.includes(d);
          return (
            <button
              type="button"
              key={d}
              className={`sugestao chip-opcao${ativo ? " ativo" : ""}`}
              aria-pressed={ativo}
              onClick={() => montar(ativo ? marcadas.filter((x) => x !== d) : [...marcadas, d], outras)}
            >
              {d}
            </button>
          );
        })}
      </Sugestoes>
      <input
        type="text"
        value={outras}
        maxLength={80}
        aria-label="Outra defesa"
        placeholder="Outra"
        onChange={(ev) => {
          setOutras(ev.target.value);
          montar(marcadas, ev.target.value);
        }}
      />
    </div>
  );
}

// Até quando dura o PV temporário que o efeito dá.
function CampoDuracaoPv({
  valor,
  onPatch,
}: {
  valor: DuracaoPvTemp | undefined;
  onPatch: (p: Partial<EfeitoHabilidade>) => void;
}) {
  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <label>Dura</label>
      <Segmentos
        rotulo="Duração do PV temporário"
        valor={valor ?? "acabar"}
        opcoes={DURACOES_PV_TEMP.map((d) => ({ valor: d.slug, rotulo: d.nome, titulo: `Dura ${d.texto}` }))}
        onChange={(v) => onPatch({ duracaoPv: v === "acabar" ? undefined : v } as Partial<EfeitoHabilidade>)}
      />
    </div>
  );
}

function renderCorpo(
  e: EfeitoHabilidade,
  recursos: RecursoMinimo[],
  onPatch: (p: Partial<EfeitoHabilidade>) => void,
  periciasCustom: AlvoEntry[],
  daAcao: boolean,
  // Gasta 1 uso a cada rolagem: nasce desligado, então "Sempre soma" não se aplica.
  gastaUso = false,
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
                <label>Onde</label>
                <SelectAlvo
                  titulo="Onde"
                  valor={e.alvo}
                  onChange={(v) => onPatch({ alvo: v } as Partial<EfeitoHabilidade>)}
                />
              </div>
              <CampoFormula
                label="Quanto"
                valor={e.formula ?? (e.valor ? String(e.valor) : "")}
                onChange={(v) => onPatch(patchDeFormula(v))}
              />
            </>
          )}
          {(e.alvo === "hp-temp" || e.alvo === "hptemp") && <CampoDuracaoPv valor={e.duracaoPv} onPatch={onPatch} />}
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
            <label>Onde</label>
            <SelectAlvo
              titulo="Onde"
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
            <label>Onde</label>
            <SelectAlvo
              titulo="Onde"
              valor={e.alvo}
              onChange={(v) => onPatch({ alvo: v } as Partial<EfeitoHabilidade>)}
              alvos={ALVOS_PROFICIENCIA}
            />
          </div>
          <Alternar
            rotulo="Dobrada"
            ligado={!!e.dobrada}
            onChange={(v) => onPatch({ dobrada: v || undefined } as Partial<EfeitoHabilidade>)}
          />
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
          <SelectLista
            label="Onde"
            valor={e.recurso}
            opcoes={[
              { slug: "pp", nome: "PP" },
              { slug: "exaustao", nome: "Exaustão" },
              ...recursos.map((r) => ({ slug: r.id, nome: r.nome })),
              ...(orfao ? [{ slug: e.recurso, nome: "(recurso apagado)" }] : []),
            ]}
            onChange={(v) => onPatch({ recurso: v } as Partial<EfeitoHabilidade>)}
          />
          <SelectLista
            label="Faz"
            valor={e.valor < 0 ? "gasta" : "ganha"}
            opcoes={[
              { slug: "ganha", nome: "Ganha" },
              { slug: "gasta", nome: "Gasta" },
            ]}
            onChange={(v) =>
              onPatch({
                valor: (Math.abs(e.valor) || 1) * (v === "gasta" ? -1 : 1),
              } as Partial<EfeitoHabilidade>)
            }
          />
          <CampoNum
            label="Quanto"
            valor={Math.abs(e.valor)}
            onChange={(v) => onPatch({ valor: e.valor < 0 ? -v : v } as Partial<EfeitoHabilidade>)}
          />
        </>
      );
    }
    case "cura":
      return (
        <>
          <CampoFormula
            label="Quanto"
            valor={e.valor}
            onChange={(v) => onPatch({ valor: v } as Partial<EfeitoHabilidade>)}
            placeholder="1d8+CON, 2d6, 5…"
            dados
          />
          <SelectLista
            label="Onde"
            // PV é o padrão; aliases legados caem no canônico.
            valor={
              e.alvoCura === "pp"
                ? "pp"
                : e.alvoCura === "hp-temp" ||
                    e.alvoCura === "hptemp" ||
                    e.alvoCura === "pv-temp" ||
                    e.alvoCura === "ppv"
                  ? "hp-temp"
                  : "hp"
            }
            opcoes={[
              { slug: "hp", nome: "PV" },
              { slug: "hp-temp", nome: "PV temporário" },
              { slug: "pp", nome: "PP" },
            ]}
            onChange={(v) =>
              onPatch({
                alvoCura: v === "hp" ? undefined : v,
                ...(v === "hp-temp" ? {} : { duracaoPv: undefined }),
              } as Partial<EfeitoHabilidade>)
            }
          />
          {alvoDaCura(e) === "hp-temp" && <CampoDuracaoPv valor={e.duracaoPv} onPatch={onPatch} />}
        </>
      );
    case "condicao_imune":
    case "condicao_remover":
      return (
        <div style={{ gridColumn: "1 / -1" }}>
          <CondicaoCampo
            valor={e.condicao}
            onChange={(v) => onPatch({ condicao: v } as Partial<EfeitoHabilidade>)}
          />
        </div>
      );
    case "condicao_aplicar":
      return (
        <>
          <div style={{ gridColumn: "1 / -1" }}>
            <CondicaoCampo
              valor={e.condicao}
              onChange={(v) => onPatch({ condicao: v } as Partial<EfeitoHabilidade>)}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Dura</label>
            <Segmentos
              rotulo="Duração da condição"
              valor={e.rodadas ?? RODADAS_PADRAO}
              opcoes={DURACOES_CONDICAO.map((d) => ({ valor: d.rodadas, rotulo: d.nome }))}
              onChange={(v) => onPatch({ rodadas: v } as Partial<EfeitoHabilidade>)}
            />
          </div>
          <label className="efeito-check" style={{ gridColumn: "1 / -1" }}>
            <input
              type="checkbox"
              checked={!!e.repete}
              onChange={(ev) => onPatch({ repete: ev.target.checked || undefined } as Partial<EfeitoHabilidade>)}
            />
            O afetado pode repetir a salvaguarda pra sair antes
          </label>
          {e.repete && (
            <p className="campo-dica" style={{ gridColumn: "1 / -1" }}>
              Ele rola a salvaguarda da ação contra a CD das suas técnicas (ficha lateral).
            </p>
          )}
        </>
      );
    case "resistencia":
    case "imunidade":
    case "vulnerabilidade":
      return (
        <div style={{ gridColumn: "1 / -1" }}>
          <TiposDanoCampo
            valor={e.tipoDano}
            onChange={(v) => onPatch({ tipoDano: v } as Partial<EfeitoHabilidade>)}
          />
        </div>
      );
    case "deslocamento":
      return (
        <>
          <div style={{ gridColumn: "1 / -1" }}>
            <SelectLista
              label="Onde"
              valor={e.tipoMov}
              opcoes={MOVIMENTOS}
              onChange={(v) => onPatch({ tipoMov: v } as Partial<EfeitoHabilidade>)}
            />
          </div>
          <CampoNum
            label="Quanto (m)"
            valor={e.valor}
            step={0.5}
            onChange={(v) => onPatch({ valor: v } as Partial<EfeitoHabilidade>)}
          />
        </>
      );
    case "valor_igual": {
      // Atributo só copia de outro atributo.
      const fontesDe = (alvo: string) =>
        ALVOS_VALOR_IGUAL.filter(
          (a) =>
            a.slug !== alvo &&
            (!ATRIBUTOS.some((x) => x.slug === alvo) || a.grupo === "Atributo"),
        );
      return (
        <>
          <SelectLista
            label="Onde"
            valor={e.alvo}
            opcoes={ALVOS_VALOR_IGUAL}
            onChange={(v) =>
              onPatch({
                alvo: v,
                ...(fontesDe(v).some((a) => a.slug === e.de) ? {} : { de: fontesDe(v)[0].slug }),
              } as Partial<EfeitoHabilidade>)
            }
          />
          <SelectLista
            label="Igual a"
            valor={e.de}
            opcoes={fontesDe(e.alvo)}
            onChange={(v) => onPatch({ de: v } as Partial<EfeitoHabilidade>)}
          />
          <Alternar
            rotulo="Metade"
            ligado={!!e.metade}
            onChange={(v) => onPatch({ metade: v || undefined } as Partial<EfeitoHabilidade>)}
          />
        </>
      );
    }
    case "multiplicador":
      return (
        <>
          <div>
            <label>Onde</label>
            <SelectAlvo
              titulo="Onde"
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
          {e.alvo.startsWith("dano") && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label>Arma de fogo</label>
              <Segmentos
                rotulo="Arma de fogo"
                valor={e.armaDeFogo ?? "todas"}
                opcoes={[
                  { valor: "todas", rotulo: "Vale" },
                  { valor: "exceto", rotulo: "Fica de fora" },
                  { valor: "so", rotulo: "Só nela" },
                ]}
                onChange={(v) =>
                  onPatch({ armaDeFogo: v === "todas" ? undefined : v } as Partial<EfeitoHabilidade>)
                }
              />
            </div>
          )}
        </>
      );
    case "substituir_atributo":
      return (
        <>
          <div>
            <label>Onde</label>
            <SelectAlvo
              titulo="Onde"
              valor={e.alvo}
              onChange={(v) => onPatch({ alvo: v } as Partial<EfeitoHabilidade>)}
              alvos={ALVOS_SUBSTITUIVEIS}
              placeholder="cr, iniciativa, salv-forca…"
            />
          </div>
          <SelectLista
            label="Atributo"
            valor={e.atributo}
            opcoes={ATRIBUTOS.map((a) => ({ slug: a.slug, nome: a.sigla }))}
            onChange={(v) => onPatch({ atributo: v as Atributo } as Partial<EfeitoHabilidade>)}
          />
          <Alternar
            rotulo="Só se for maior"
            ligado={!!e.seMaior}
            onChange={(v) => onPatch({ seMaior: v || undefined } as Partial<EfeitoHabilidade>)}
          />
        </>
      );
    case "rolagem":
      return (
        <>
          <CampoFormula
            label="Quanto"
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
            label="Quando"
            valor={e.gatilho}
            onChange={(v) => onPatch({ gatilho: v } as Partial<EfeitoHabilidade>)}
            placeholder="atingido por crítico…"
          />
          <Campo
            label="O que acontece"
            valor={e.efeito}
            onChange={(v) => onPatch({ efeito: v } as Partial<EfeitoHabilidade>)}
            placeholder="o que acontece"
          />
        </>
      );
    case "crit_range":
      return (
        <>
          <SelectLista
            label="Quanto"
            valor={String(e.minimo)}
            opcoes={[
              { slug: "19", nome: "19-20" },
              { slug: "18", nome: "18-20" },
              { slug: "17", nome: "17-20" },
            ]}
            onChange={(v) => onPatch({ minimo: Number(v) || 20 } as Partial<EfeitoHabilidade>)}
          />
          <SelectLista
            label="Onde"
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
            <label>Onde</label>
            <SelectAlvo
              titulo="Onde"
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
            <label>Onde</label>
            <SelectAlvo
              titulo="Onde"
              valor={e.alvo ?? "qualquer"}
              onChange={(v) => onPatch({ alvo: v || undefined } as Partial<EfeitoHabilidade>)}
              alvos={ALVOS_CONTEXTUAIS}
            />
          </div>
          <SelectLista
            label="Quanto"
            valor={String(e.minimo)}
            opcoes={[
              { slug: "5", nome: "5" },
              { slug: "10", nome: "10" },
              { slug: "15", nome: "15" },
            ]}
            onChange={(v) => onPatch({ minimo: Number(v) || 0 } as Partial<EfeitoHabilidade>)}
          />
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
          <div style={{ gridColumn: "1 / -1" }}>
            <SelectLista
              label="Onde"
              valor={e.acao}
              opcoes={[
                { slug: "ataque", nome: "Ataque" },
                { slug: "acao", nome: "Ação" },
                { slug: "acao bônus", nome: "Ação bônus" },
                { slug: "reacao", nome: "Reação" },
                { slug: "movimento", nome: "Movimento" },
              ]}
              onChange={(v) => onPatch({ acao: v } as Partial<EfeitoHabilidade>)}
            />
          </div>
          <CampoNum
            label="Quanto"
            valor={e.quantidade}
            min={1}
            onChange={(v) =>
              onPatch({ quantidade: Math.max(1, v) } as Partial<EfeitoHabilidade>)
            }
          />
          <Detalhes aberto={!!e.gatilho}>
            <Campo
              label="Quando"
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
            <label>Onde</label>
            <SelectAlvo
              titulo="Onde"
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
            label="Onde"
            valor={e.em ?? "dano"}
            opcoes={ALVOS_DANO}
            onChange={(v) => onPatch({ em: v === "dano" ? undefined : v } as Partial<EfeitoHabilidade>)}
          />
          <FiltroDanoCampos graus={e.graus} tipos={e.tipos} onPatch={onPatch} aberto={!!e.quando}>
            <Campo
              label="Quando"
              valor={e.quando ?? ""}
              onChange={(v) => onPatch({ quando: v || undefined } as Partial<EfeitoHabilidade>)}
              placeholder="contra alvo caído…"
              title="Preenchido, fica desligado no Rolador até você ligar"
            />
          </FiltroDanoCampos>
        </>
      );
    case "alcance": {
      // Vazio ainda é "vira": o texto está sendo escrito.
      const troca = e.vira !== undefined;
      return (
        <>
          <SelectLista
            label="Como"
            valor={troca ? "vira" : "soma"}
            opcoes={[
              { slug: "soma", nome: "Soma metros" },
              { slug: "vira", nome: "Vira" },
            ]}
            onChange={(v) =>
              onPatch(
                (v === "vira" ? { vira: e.vira ?? "", valor: 0 } : { vira: undefined }) as Partial<EfeitoHabilidade>,
              )
            }
          />
          {troca ? (
            <div>
              <label>Alcance</label>
              <input
                type="text"
                value={e.vira}
                onChange={(ev) => onPatch({ vira: ev.target.value } as Partial<EfeitoHabilidade>)}
                placeholder="campo de visão, 30 m…"
              />
              <Sugestoes>
                {ALCANCES_TROCADOS.map((a) => (
                  <button
                    type="button"
                    key={a}
                    className={`sugestao ${e.vira === a ? "ativo" : ""}`}
                    aria-pressed={e.vira === a}
                    onClick={() => onPatch({ vira: a } as Partial<EfeitoHabilidade>)}
                  >
                    {a}
                  </button>
                ))}
              </Sugestoes>
            </div>
          ) : (
            <CampoNum
              label="Quanto (m)"
              valor={e.valor}
              min={-99}
              onChange={(v) => onPatch({ valor: v } as Partial<EfeitoHabilidade>)}
            />
          )}
          <SelectLista
            label="Onde"
            valor={e.alvo ?? "ataque"}
            opcoes={ALVOS_ATAQUE}
            onChange={(v) => onPatch({ alvo: v === "ataque" ? undefined : v } as Partial<EfeitoHabilidade>)}
          />
          <CampoQuando valor={e.quando} onPatch={onPatch} placeholder="se escolher ampliar…" />
        </>
      );
    }
    case "ignora":
      return (
        <>
          <DefesasIgnoradasCampo
            valor={e.alvo}
            onChange={(v) => onPatch({ alvo: v } as Partial<EfeitoHabilidade>)}
          />
          {!daAcao && (
            <SelectLista
              label="Onde"
              valor={e.em ?? "ataque"}
              opcoes={ALVOS_ATAQUE}
              onChange={(v) => onPatch({ em: v === "ataque" ? undefined : v } as Partial<EfeitoHabilidade>)}
            />
          )}
          <FiltroDanoCampos graus={e.graus} tipos={e.tipos} onPatch={onPatch} aberto={!!e.quando}>
            <Campo
              label="Quando"
              valor={e.quando ?? ""}
              onChange={(v) => onPatch({ quando: v || undefined } as Partial<EfeitoHabilidade>)}
              placeholder="contra usuário de Akuma no Mi…"
              title="Preenchido, fica desligado no Rolador até você ligar"
            />
          </FiltroDanoCampos>
        </>
      );
    case "trocar_dano":
      return (
        <div style={{ gridColumn: "1 / -1" }}>
          <TipoDanoCampo
            rotulo="Tipo de dano"
            valor={e.tipoDano}
            onChange={(v) => onPatch({ tipoDano: v } as Partial<EfeitoHabilidade>)}
          />
        </div>
      );
    case "crit_imune":
      return null;
    case "margem_critico":
      return (
        <div style={{ gridColumn: "1 / -1" }}>
          <CampoNum
            label="Quanto"
            valor={e.valor}
            min={1}
            max={18}
            onChange={(v) =>
              onPatch({ valor: Math.min(18, Math.max(1, v)) } as Partial<EfeitoHabilidade>)
            }
          />
        </div>
      );
    case "passo_dano":
      return (
        <>
          {!daAcao && (
            <SelectLista
              label="Onde"
              valor={e.alvo}
              opcoes={[
                { slug: "arma", nome: "Arma" },
                { slug: "tecnica", nome: "Técnicas" },
              ]}
              onChange={(v) => onPatch({ alvo: v } as Partial<EfeitoHabilidade>)}
            />
          )}
          <CampoNum
            label="Quanto"
            valor={e.passos}
            min={1}
            max={6}
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
              label="Quanto"
              valor={e.formula ?? String(e.valor)}
              onChange={(v) => onPatch(patchDeFormula(v))}
              placeholder="1, GRAU, GRAU/2…"
              comGrau
            />
          )}
          <Detalhes aberto={graus.length > 0 || e.minimo !== undefined}>
            {e.modo !== "zero" && (
              <SelectLista
                label="Mínimo"
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
            label="Vezes"
            valor={e.vezes}
            onChange={(v) =>
              onPatch({ vezes: Math.min(5, Math.max(2, v)) } as Partial<EfeitoHabilidade>)
            }
          />
          <Detalhes aberto={!!e.quando}>
            <Campo
              label="Quando"
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
            label="Quanto"
            valor={e.formula}
            onChange={(v) => onPatch({ formula: v } as Partial<EfeitoHabilidade>)}
            placeholder={extraNoDano(e.em) ? "1d6, 1d10 fogo, NIVELd4…" : "1d4, 1d6…"}
            dados
            comGrau={extraNoDano(e.em)}
          />
          <SelectLista
            label="Onde"
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
          {e.em !== "cura" && !gastaUso && <CheckSempre sempre={!!e.sempre} onPatch={onPatch} />}
          {extraNoDano(e.em) && (
            <FiltroDanoCampos graus={e.graus} tipos={e.tipos} onPatch={onPatch} />
          )}
        </>
      );
    case "dados_extra":
      return (
        <>
          <CampoFormula
            label="Quanto"
            valor={e.quantidade}
            onChange={(v) => onPatch({ quantidade: v } as Partial<EfeitoHabilidade>)}
            placeholder="1, 2, GRAU…"
            comGrau
          />
          <SelectLista
            label="Onde"
            valor={e.em ?? "dano"}
            opcoes={ALVOS_DANO}
            onChange={(v) => onPatch({ em: v === "dano" ? undefined : v } as Partial<EfeitoHabilidade>)}
          />
          {!gastaUso && <CheckSempre sempre={!!e.sempre} onPatch={onPatch} />}
          <FiltroDanoCampos graus={e.graus} tipos={e.tipos} onPatch={onPatch} />
        </>
      );
    case "valor_fixo":
      return (
        <>
          <SelectLista
            label="Onde"
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
          <div style={{ gridColumn: "1 / -1" }}>
            <TiposDanoCampo
              vazioETodos
              valor={e.tipos ?? ""}
              onChange={(v) => onPatch({ tipos: v || undefined } as Partial<EfeitoHabilidade>)}
            />
          </div>
          <CampoQuando valor={e.quando} onPatch={onPatch} placeholder="1× por turno…" />
        </>
      );
    case "dano_maximo":
      return (
        <>
          <SelectLista
            label="Onde"
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
          {!gastaUso && <CheckSempre sempre={!!e.sempre} onPatch={onPatch} rotulo="Sempre vale" />}
          <FiltroDanoCampos graus={e.graus} tipos={e.tipos} onPatch={onPatch} />
        </>
      );
    case "piso_dado":
      return (
        <>
          <SelectLista
            label="Dado até"
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
            label="Onde"
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
            label="Dados"
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
            label="Onde"
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
            label="Onde"
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
            label="Onde"
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
    case "por_turno":
      return null;
    case "multi_ataque":
      return (
        <>
          <SelectLista
            label="Como"
            valor={e.soma ? "soma" : "total"}
            opcoes={[
              { slug: "total", nome: "No total" },
              { slug: "soma", nome: "A mais" },
            ]}
            onChange={(v) =>
              onPatch({
                soma: v === "soma" || undefined,
                vezes: v === "soma" ? 1 : Math.max(2, e.vezes),
              } as Partial<EfeitoHabilidade>)
            }
          />
          <CampoNum
            label="Ataques"
            valor={e.vezes}
            min={e.soma ? 1 : 2}
            max={20}
            onChange={(v) => onPatch({ vezes: v } as Partial<EfeitoHabilidade>)}
          />
          <SelectLista
            label="Onde"
            valor={e.alvo ?? "ataque"}
            opcoes={ALVOS_ATAQUE}
            onChange={(v) => onPatch({ alvo: v === "ataque" ? undefined : v } as Partial<EfeitoHabilidade>)}
          />
        </>
      );
    case "explosao": {
      const noAtaque = (e.em ?? "").startsWith("ataque");
      const comValor = e.gatilho === "valor" || e.gatilho === "total";
      return (
        <>
          <div style={{ gridColumn: "1 / -1" }}>
            <SelectLista
              label="Onde"
              valor={e.em ?? "dano"}
              opcoes={[...ALVOS_DANO, ...ALVOS_ATAQUE]}
              onChange={(v) => {
                const ataque = v.startsWith("ataque");
                onPatch({
                  em: v === "dano" ? undefined : v,
                  // Entre dano e ataque o gatilho muda.
                  ...(ataque !== noAtaque
                    ? { gatilho: ataque ? "critico" : "maximo", valor: undefined }
                    : {}),
                } as Partial<EfeitoHabilidade>);
              }}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <SelectLista
              label="Quando"
              valor={e.gatilho}
              opcoes={
                noAtaque
                  ? [
                      { slug: "critico", nome: "Crítico" },
                      { slug: "valor", nome: "Número no d20" },
                    ]
                  : [
                      { slug: "maximo", nome: "Dado no máximo" },
                      { slug: "valor", nome: "Número no dado" },
                      { slug: "total", nome: "Dano total" },
                    ]
              }
              onChange={(v) =>
                onPatch({
                  gatilho: v,
                  valor: v === "valor" ? (noAtaque ? 20 : 6) : v === "total" ? 20 : undefined,
                } as Partial<EfeitoHabilidade>)
              }
            />
          </div>
          {comValor && (
            <CampoNum
              label="A partir de"
              valor={e.valor ?? 0}
              min={2}
              max={noAtaque ? 20 : 999}
              onChange={(v) => onPatch({ valor: v } as Partial<EfeitoHabilidade>)}
            />
          )}
          <CampoNum
            label="Vezes"
            valor={e.limite}
            min={1}
            max={10}
            onChange={(v) => onPatch({ limite: v } as Partial<EfeitoHabilidade>)}
          />
        </>
      );
    }
    case "progressivo": {
      const naFicha = progressivoNaFicha(e.em, slugsCustom);
      return (
        <>
          <CampoFormula
            label="Quanto"
            valor={e.formula}
            onChange={(v) => onPatch({ formula: v } as Partial<EfeitoHabilidade>)}
            placeholder={naFicha ? "1, 3, PROF…" : "1, 1d6, PROF…"}
            dados={!naFicha}
            comGrau={extraNoDano(e.em)}
          />
          <SelectLista
            label="Cresce"
            valor={e.cresce ?? "manual"}
            opcoes={[
              { slug: "manual", nome: "Manual" },
              { slug: "turno", nome: "Turno" },
              // Valor da ficha não passa pelo Rolador.
              ...(naFicha ? [] : [{ slug: "rolagem", nome: "Rolagem" }]),
            ]}
            onChange={(v) =>
              onPatch({
                cresce: v === "manual" ? undefined : v,
                ...(v === "manual" ? {} : { por: undefined }),
              } as Partial<EfeitoHabilidade>)
            }
          />
          {!e.cresce && (
            <Campo
              label="Por"
              valor={e.por ?? ""}
              onChange={(v) => onPatch({ por: v || undefined } as Partial<EfeitoHabilidade>)}
              placeholder="acerto, PP, 3 m…"
            />
          )}
          {daAcao ? (
            <SelectLista
              label="Onde"
              valor={e.em ?? "dano"}
              opcoes={[
                ...ALVOS_DANO,
                ...ALVOS_CONTEXTUAIS,
                ...periciasCustom.map((a) => ({ ...a, grupo: "Perícia" })),
              ]}
              onChange={(v) => onPatch({ em: v === "dano" ? undefined : v } as Partial<EfeitoHabilidade>)}
            />
          ) : (
            <div>
              <label>Onde</label>
              <SelectAlvo
                titulo="Onde"
                valor={e.em ?? "dano"}
                onChange={(v) =>
                  onPatch({
                    em: !v || v === "dano" ? undefined : v,
                    ...(e.cresce === "rolagem" && progressivoNaFicha(v, slugsCustom)
                      ? { cresce: undefined }
                      : {}),
                  } as Partial<EfeitoHabilidade>)
                }
              />
            </div>
          )}
          <CampoNum
            label="Máximo"
            valor={e.max}
            min={1}
            max={20}
            onChange={(v) => onPatch({ max: v } as Partial<EfeitoHabilidade>)}
          />
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
  // "1,5" é número, não fórmula.
  const t = texto.trim().replace(/^(-?\d+),(\d+)$/, "$1.$2");
  if (t === "" || Number.isFinite(Number(t))) {
    return { valor: Number(t) || 0, formula: undefined } as Partial<EfeitoHabilidade>;
  }
  return { valor: 0, formula: texto } as Partial<EfeitoHabilidade>;
}

const LIMITE_SEGMENTOS = 6;

// Escolha de uma lista fixa: curta vira segmentos; longa ou agrupada, abre a paleta.
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
  const curta = opcoes.length <= LIMITE_SEGMENTOS && !opcoes.some((o) => o.grupo);
  return (
    <div>
      <label>{label}</label>
      {curta ? (
        <Segmentos
          rotulo={label}
          valor={valor}
          onChange={onChange}
          opcoes={opcoes.map((o) => ({ valor: o.slug, rotulo: o.nome }))}
        />
      ) : (
        <SeletorBusca valor={valor} opcoes={opcoes} onChange={(v) => v && onChange(v)} titulo={label} />
      )}
    </div>
  );
}

// Sim ou não: botão que liga e desliga.
function Alternar({
  rotulo,
  ligado,
  onChange,
}: {
  rotulo: string;
  ligado: boolean;
  onChange: (ligado: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`origem-pill efeito-alternar${ligado ? " ativo" : ""}`}
      aria-pressed={ligado}
      onClick={() => onChange(!ligado)}
    >
      <i className={`fas ${ligado ? "fa-circle-check" : "fa-circle"}`} /> {rotulo}
    </button>
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
    <Alternar
      rotulo={rotulo}
      ligado={sempre}
      onChange={(v) => onPatch({ sempre: v || undefined } as Partial<EfeitoHabilidade>)}
    />
  );
}

// Número inteiro com − e +; com `step` (fração), campo comum.
function CampoNum({
  label,
  valor,
  onChange,
  step,
  min = 0,
  max = 9999,
}: {
  label: string;
  valor: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label>{label}</label>
      {step ? (
        <input
          type="number"
          step={step}
          value={Number.isFinite(valor) ? valor : 0}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
      ) : (
        <CampoPasso
          valor={Number.isFinite(valor) ? valor : 0}
          rotulo={label}
          min={min}
          max={max}
          onChange={onChange}
        />
      )}
    </div>
  );
}
