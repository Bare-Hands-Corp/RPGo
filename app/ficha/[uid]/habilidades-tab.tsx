"use client";

import {
  createContext,
  useContext,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import Swal from "sweetalert2";
import {
  alternarHabilidade,
  atualizarHabilidade,
  criarHabilidade,
  deletarHabilidade,
  usarHabilidade,
} from "./actions";
import {
  ALVOS_AGREGAVEIS,
  ALVOS_CONTEXTUAIS,
  ALVOS_SUBSTITUIVEIS,
  ATRIBUTOS,
  alvosPericiaCustom,
  GRUPOS_PRESET,
  META_EFEITOS,
  ORIGENS_HABILIDADE,
  PRESETS_EFEITO,
  RECARGAS_HABILIDADE,
  TIPOS_HABILIDADE,
  computarDeltasInstantaneos,
  formatarMod,
  lerEfeitos,
  resolverAtributosNaFormula,
  resumoEfeito,
  temEfeitoSustentado,
  type Atributo,
  type EfeitoHabilidade,
  type OrigemHabilidade,
  type TipoHabilidade,
} from "@/lib/op-rpg";
import { type Dado, parseFormulaDados } from "@/lib/dice";
import { empilharRolagem } from "@/lib/empilhar-rolagem";

type Habilidade = {
  id: string;
  nome: string;
  origem: string;
  tipo: string;
  descricao: string;
  custoPp: number;
  custoPa: number;
  custoRecursoId: string | null;
  custoRecursoValor: number;
  usos: number | null;
  usosAtual: number | null;
  recarga: string | null;
  tags: string | null;
  favorita: boolean;
  ordem: number;
  efeitos: unknown;
  ligada: boolean;
};

type RecursoMinimo = { id: string; nome: string };

type AlvoEntry = { slug: string; nome: string; grupo: string };

// Perícias customizadas do personagem, no formato de alvo de efeito. Disponível
// pros SelectAlvo/datalist via contexto pra não precisar drilar a prop por toda
// a árvore do editor (EditorEfeito → renderCorpo → SelectAlvo).
const AlvosCustomContext = createContext<AlvoEntry[]>([]);

type Props = {
  personagemId: string;
  habilidades: Habilidade[];
  recursos: RecursoMinimo[];
  atributos: Record<Atributo, number>;
  periciasCustom: { slug: string; nome: string }[];
};

type Patch =
  | { kind: "create"; habilidade: Habilidade }
  | { kind: "update"; id: string; patch: Partial<Habilidade> }
  | { kind: "delete"; id: string }
  | { kind: "usar"; id: string };

function aplicarPatch(state: Habilidade[], p: Patch): Habilidade[] {
  if (p.kind === "create") return [...state, p.habilidade];
  if (p.kind === "update")
    return state.map((h) => (h.id === p.id ? { ...h, ...p.patch } : h));
  if (p.kind === "delete") return state.filter((h) => h.id !== p.id);
  return state.map((h) =>
    h.id === p.id && h.usosAtual != null
      ? { ...h, usosAtual: Math.max(0, h.usosAtual - 1) }
      : h,
  );
}

function mostrarErro(err: unknown) {
  Swal.fire({
    icon: "error",
    title: "Erro",
    text: err instanceof Error ? err.message : "Operação falhou.",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

type Filtro = "todas" | "disponiveis" | "sem_custo";

export function HabilidadesTab({
  personagemId,
  habilidades,
  recursos,
  atributos,
  periciasCustom,
}: Props) {
  const [otimistas, aplicar] = useOptimistic(habilidades, aplicarPatch);
  const [, startTransition] = useTransition();
  const alvosCustom = useMemo(() => alvosPericiaCustom(periciasCustom), [periciasCustom]);
  const [modalAberto, setModalAberto] = useState(false);
  const [edit, setEdit] = useState<Habilidade | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const recursoNomePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of recursos) m.set(r.id, r.nome);
    return m;
  }, [recursos]);

  const filtradas = useMemo(() => {
    if (filtro === "todas") return otimistas;
    if (filtro === "sem_custo") {
      return otimistas.filter(
        (h) =>
          h.custoPp === 0 &&
          h.custoPa === 0 &&
          (!h.custoRecursoId || h.custoRecursoValor === 0) &&
          h.usos == null,
      );
    }
    // disponíveis: tem usos (ou não consome) e não está esgotada.
    return otimistas.filter((h) => h.usos == null || (h.usosAtual ?? 0) > 0);
  }, [otimistas, filtro]);

  const favoritas = filtradas.filter((h) => h.favorita);

  function abrirNova() {
    setEdit(null);
    setModalAberto(true);
  }

  function abrirEdit(h: Habilidade) {
    setEdit(h);
    setModalAberto(true);
  }

  async function apagar(id: string, nome: string) {
    const c = await Swal.fire({
      title: "Deletar Habilidade",
      text: `Apagar "${nome}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Deletar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!c.isConfirmed) return;
    startTransition(async () => {
      aplicar({ kind: "delete", id });
      try {
        await deletarHabilidade(personagemId, id);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function toggleFavorita(h: Habilidade) {
    startTransition(async () => {
      aplicar({ kind: "update", id: h.id, patch: { favorita: !h.favorita } });
      try {
        await atualizarHabilidade(personagemId, h.id, { favorita: !h.favorita });
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  // `ligar`: null = botão "Usar" de habilidade não-sustentada (consome, sem
  // estado); true = liga sustentada (consome + marca ligada); false = desliga
  // (sem custo, sem confirmação, sem reversão de pools já concedidos).
  async function acionar(h: Habilidade, ligar: boolean | null) {
    if (ligar === false) {
      window.dispatchEvent(
        new CustomEvent("rpgo:toggle-habilidade", {
          detail: { id: h.id, ligada: false },
        }),
      );
      startTransition(async () => {
        aplicar({ kind: "update", id: h.id, patch: { ligada: false } });
        try {
          await alternarHabilidade(personagemId, h.id, false);
        } catch (err) {
          mostrarErro(err);
        }
      });
      return;
    }

    const custos: string[] = [];
    if (h.custoPp > 0) custos.push(`<b>${h.custoPp}</b> PP`);
    if (h.custoPa > 0) custos.push(`<b>${h.custoPa}</b> PA`);
    if (h.custoRecursoId && h.custoRecursoValor > 0) {
      custos.push(
        `<b>${h.custoRecursoValor}</b> ${recursoNomePorId.get(h.custoRecursoId) ?? "recurso"}`,
      );
    }
    if (h.usos != null) custos.push(`<b>1</b> uso`);
    const c = await Swal.fire({
      title: ligar ? `Ligar ${h.nome}?` : `Usar ${h.nome}?`,
      html:
        custos.length > 0
          ? `Vai consumir: ${custos.join(", ")}.`
          : ligar
            ? "Sem custo configurado — só liga a habilidade."
            : "Sem custo configurado — só marca a habilidade como usada.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: ligar ? "Ligar" : "Usar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!c.isConfirmed) return;

    // Otimismo cross-tab: dispara deltas pra sidebar (HP/PP) e RecursosSidebar
    // refletirem antes do server. Mirror da lógica do server — ao LIGAR,
    // hp-max/pp-max ficam de fora (incluirMax:false): são bônus sustentados que
    // vêm do agregado (a sidebar recomputa com o `ligada` otimista via
    // rpgo:toggle-habilidade), não deltas instantâneos.
    const deltas = computarDeltasInstantaneos(lerEfeitos(h.efeitos), {
      incluirMax: !ligar,
    });
    const deltaPersonagem = {
      deltaHpAtual: deltas.hpAtual || undefined,
      deltaHpTemp: deltas.hpTemp || undefined,
      deltaPpAtual: (deltas.ppAtual - h.custoPp) || undefined,
      deltaHpMax: deltas.hpMax || undefined,
      deltaPpMax: deltas.ppMax || undefined,
    };
    if (Object.values(deltaPersonagem).some((v) => v !== undefined)) {
      window.dispatchEvent(
        new CustomEvent("rpgo:patch-personagem", { detail: deltaPersonagem }),
      );
    }
    const deltaRecursos: Record<string, number> = { ...deltas.recursos };
    if (h.custoRecursoId && h.custoRecursoValor > 0) {
      deltaRecursos[h.custoRecursoId] =
        (deltaRecursos[h.custoRecursoId] ?? 0) - h.custoRecursoValor;
    }
    if (Object.keys(deltaRecursos).length > 0) {
      window.dispatchEvent(
        new CustomEvent("rpgo:patch-recurso", { detail: deltaRecursos }),
      );
    }
    if (ligar) {
      window.dispatchEvent(
        new CustomEvent("rpgo:toggle-habilidade", {
          detail: { id: h.id, ligada: true },
        }),
      );
    }

    startTransition(async () => {
      aplicar({ kind: "usar", id: h.id });
      if (ligar) aplicar({ kind: "update", id: h.id, patch: { ligada: true } });
      try {
        if (ligar) await alternarHabilidade(personagemId, h.id, true);
        else await usarHabilidade(personagemId, h.id);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function salvarForm(dados: HabilidadeFormDados) {
    const editandoId = edit?.id ?? null;
    setModalAberto(false);
    startTransition(async () => {
      if (editandoId) {
        aplicar({ kind: "update", id: editandoId, patch: dados as Partial<Habilidade> });
        try {
          await atualizarHabilidade(personagemId, editandoId, dados);
        } catch (err) {
          mostrarErro(err);
        }
      } else {
        const nova: Habilidade = {
          id: "temp-" + Math.random().toString(36).slice(2),
          favorita: false,
          ordem: 0,
          ligada: false,
          ...dados,
          efeitos: dados.efeitos,
        };
        aplicar({ kind: "create", habilidade: nova });
        try {
          await criarHabilidade(personagemId, dados);
        } catch (err) {
          mostrarErro(err);
        }
      }
    });
  }

  return (
    <AlvosCustomContext.Provider value={alvosCustom}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h1>Habilidades</h1>
        <button
          type="button"
          className="btn-rect primary"
          style={{ background: "var(--color-power)" }}
          onClick={abrirNova}
        >
          + Nova Habilidade
        </button>
      </div>
      <p style={{ color: "var(--text-sec)", fontSize: "0.9rem", marginBottom: 20 }}>
        Catalogue passivas, ativas e reativas vindas de Profissão, Estilo, Haki,
        Espécie, Akuma no Mi ou Treinamento.
      </p>

      <div className="hab-filtros">
        {(
          [
            ["todas", "Todas"],
            ["disponiveis", "Disponíveis"],
            ["sem_custo", "Sem custo"],
          ] as const
        ).map(([slug, label]) => (
          <button
            key={slug}
            type="button"
            className={`hab-filtro ${filtro === slug ? "ativo" : ""}`}
            onClick={() => setFiltro(slug)}
          >
            {label}
          </button>
        ))}
      </div>

      {favoritas.length > 0 && (
        <section>
          <div className="section-header">
            <i className="fas fa-star" style={{ color: "#d4af37" }} />
            <h3>Destaques</h3>
          </div>
          <div className="action-grid">
            {favoritas.map((h) => (
              <CardHabilidade
                key={`fav-${h.id}`}
                habilidade={h}
                recursoNomePorId={recursoNomePorId}
                atributos={atributos}
                onEdit={() => abrirEdit(h)}
                onApagar={() => apagar(h.id, h.nome)}
                onUsar={() => acionar(h, null)}
                onAlternar={() => acionar(h, !h.ligada)}
                onFavorita={() => toggleFavorita(h)}
              />
            ))}
          </div>
        </section>
      )}

      {ORIGENS_HABILIDADE.map((origem) => {
        const lista = filtradas.filter((h) => h.origem === origem.slug);
        if (lista.length === 0) return null;
        return (
          <section key={origem.slug}>
            <div className="section-header">
              <i className={`fas ${origem.icone}`} style={{ color: origem.cor }} />
              <h3>{origem.nome}</h3>
              <span style={{ color: "var(--text-sec)", fontSize: "0.85rem" }}>
                ({lista.length})
              </span>
            </div>
            <div className="action-grid">
              {lista.map((h) => (
                <CardHabilidade
                  key={h.id}
                  habilidade={h}
                  recursoNomePorId={recursoNomePorId}
                  atributos={atributos}
                  onEdit={() => abrirEdit(h)}
                  onApagar={() => apagar(h.id, h.nome)}
                  onUsar={() => acionar(h, null)}
                  onAlternar={() => acionar(h, !h.ligada)}
                  onFavorita={() => toggleFavorita(h)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {filtradas.length === 0 && (
        <p
          style={{
            color: "var(--text-sec)",
            fontSize: "0.9rem",
            fontStyle: "italic",
            textAlign: "center",
            padding: "40px 0",
          }}
        >
          Nenhuma habilidade cadastrada{filtro !== "todas" ? " com esse filtro" : ""}.
        </p>
      )}

      {modalAberto && (
        <HabilidadeModal
          inicial={edit}
          recursos={recursos}
          onCancelar={() => setModalAberto(false)}
          onSalvar={salvarForm}
        />
      )}
    </AlvosCustomContext.Provider>
  );
}

// ─── Card de habilidade ────────────────────────────────────────────────
function CardHabilidade({
  habilidade,
  recursoNomePorId,
  atributos,
  onEdit,
  onApagar,
  onUsar,
  onAlternar,
  onFavorita,
}: {
  habilidade: Habilidade;
  recursoNomePorId: Map<string, string>;
  atributos: Record<Atributo, number>;
  onEdit: () => void;
  onApagar: () => void;
  onUsar: () => void;
  onAlternar: () => void;
  onFavorita: () => void;
}) {
  const efeitos = lerEfeitos(habilidade.efeitos);
  const tipoMeta = TIPOS_HABILIDADE.find((t) => t.slug === habilidade.tipo);
  const ehAtivavel = habilidade.tipo === "ativa" || habilidade.tipo === "reativa";
  // Habilidade ativável com efeito sustentado ganha switch on/off (estado
  // `ligada`); sem efeito sustentado (cura pura etc.) mantém o "Usar" pontual.
  const mostrarToggle = ehAtivavel && temEfeitoSustentado(efeitos);
  const mostrarUsar = ehAtivavel && !mostrarToggle;

  // Efeitos com fórmula de dado viram links "rolar" que empilham na Bandeja
  // (separado do "Usar", que só debita custos + aplica deltas instantâneos).
  // `cura` só é rolável quando a fórmula tem dado (ex: "1d8+CON"); cura inteira
  // ("10") já entra como delta instantâneo. Siglas de atributo (CON…) na fórmula
  // são resolvidas pro modificador do personagem e somadas ao mod empilhado.
  const rolagens: {
    formula: string;
    dados: Dado[];
    modificador: number;
    nota: string;
  }[] = [];
  for (const e of efeitos) {
    const fonte = e.tipo === "rolagem" ? e.formula : e.tipo === "cura" ? e.valor : null;
    if (fonte == null) continue;
    const p = parseFormulaDados(fonte);
    const attr = resolverAtributosNaFormula(fonte, atributos);
    const modTotal = p.modificador + attr.modificador;
    // rolagem: rola se tem dado OU modificador resultante; cura: só com dado
    // (cura inteira pura já é delta instantâneo, não vale rolar um número fixo).
    const rolavel =
      e.tipo === "rolagem" ? p.dados.length > 0 || modTotal !== 0 : p.dados.length > 0;
    if (!rolavel) continue;
    const nota = attr.usados
      .map((u) => `${u.sigla} ${formatarMod(u.mod)}`)
      .join(", ");
    rolagens.push({ formula: fonte, dados: p.dados, modificador: modTotal, nota });
  }

  const custos: string[] = [];
  if (habilidade.custoPp > 0) custos.push(`${habilidade.custoPp} PP`);
  if (habilidade.custoPa > 0) custos.push(`${habilidade.custoPa} PA`);
  if (habilidade.custoRecursoId && habilidade.custoRecursoValor > 0) {
    custos.push(
      `${habilidade.custoRecursoValor} ${recursoNomePorId.get(habilidade.custoRecursoId) ?? "?"}`,
    );
  }
  const tags = (habilidade.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  // Mapeia tipo de habilidade pra classe de cor de borda (reusa as do .action-card).
  const tipoClass =
    habilidade.tipo === "ativa"
      ? "type-power"
      : habilidade.tipo === "reativa"
      ? "type-react"
      : habilidade.tipo === "passiva"
      ? "type-padrao"
      : "type-comum";

  const ligadaAtiva = mostrarToggle && habilidade.ligada;

  return (
    <div className={`action-card ${tipoClass}${ligadaAtiva ? " hab-card-ligada" : ""}`}>
      <button
        type="button"
        className={`btn-favorito ${habilidade.favorita ? "ativo" : ""}`}
        title="Favoritar"
        onClick={onFavorita}
        style={{ position: "absolute", top: 12, left: 12 }}
      >
        <i className={`fa-star ${habilidade.favorita ? "fas" : "far"}`} />
      </button>
      <button
        type="button"
        className="btn-card-edit"
        title="Editar"
        onClick={onEdit}
      >
        <i className="fas fa-edit" />
      </button>
      <button
        type="button"
        className="btn-card-trash"
        title="Apagar"
        onClick={onApagar}
      >
        <i className="fas fa-trash" />
      </button>

      <div>
        <div className="card-title" style={{ paddingLeft: 26 }}>
          {habilidade.nome}
        </div>
        <div className="acao-stats">
          {tipoMeta && (
            <span className="acao-stat" style={{ color: tipoMeta.cor }}>
              <i className={`fas ${tipoMeta.icone}`} /> {tipoMeta.nome}
            </span>
          )}
          {habilidade.usos != null && (
            <span className="acao-stat">
              <i className="fas fa-bolt-lightning" /> {habilidade.usosAtual ?? 0}/
              {habilidade.usos}
            </span>
          )}
          {habilidade.recarga && (
            <span className="acao-stat">
              <i className="fas fa-rotate" />{" "}
              {RECARGAS_HABILIDADE.find((r) => r.slug === habilidade.recarga)?.nome ??
                habilidade.recarga}
            </span>
          )}
        </div>
        {efeitos.length > 0 && (
          <div className="efeito-chips">
            {efeitos.map((e, i) => (
              <ChipEfeito key={i} efeito={e} />
            ))}
          </div>
        )}
        {habilidade.descricao && (
          <div className="card-desc">{habilidade.descricao}</div>
        )}
      </div>

      {(custos.length > 0 ||
        tags.length > 0 ||
        mostrarUsar ||
        mostrarToggle ||
        rolagens.length > 0) && (
        <div className="card-tags">
          {custos.map((c, i) => (
            <span key={`c${i}`} className="tag tag-custo">
              {c}
            </span>
          ))}
          {tags.map((t, i) => (
            <span key={`t${i}`} className="tag">
              {t}
            </span>
          ))}
          {rolagens.map((r, i) => (
            <button
              key={`r${i}`}
              type="button"
              className="hab-rolar"
              title={`Empilhar ${r.formula} no Rolador${r.nota ? ` · ${r.nota}` : ""}`}
              onClick={() =>
                empilharRolagem({
                  dados: r.dados,
                  modificador: r.modificador,
                  nomePreset: `${habilidade.nome}: ${r.formula}`,
                })
              }
            >
              <i className="fas fa-dice" /> {r.formula}
            </button>
          ))}
          {mostrarUsar && (
            <button type="button" className="hab-usar" onClick={onUsar}>
              <i className="fas fa-play" /> Usar
            </button>
          )}
          {mostrarToggle && (
            <button
              type="button"
              className={`hab-toggle${habilidade.ligada ? " ligada" : ""}`}
              role="switch"
              aria-checked={habilidade.ligada}
              title={habilidade.ligada ? "Desligar habilidade" : "Ligar habilidade"}
              onClick={onAlternar}
            >
              <span className="hab-toggle-trilho">
                <span className="hab-toggle-bolha" />
              </span>
              {habilidade.ligada ? "Ligada" : "Desligada"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ChipEfeito({ efeito }: { efeito: EfeitoHabilidade }) {
  const meta = META_EFEITOS[efeito.tipo];
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
      <span className="efeito-chip-resumo">{resumoEfeito(efeito)}</span>
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────
type HabilidadeFormDados = {
  nome: string;
  origem: OrigemHabilidade;
  tipo: TipoHabilidade;
  descricao: string;
  custoPp: number;
  custoPa: number;
  custoRecursoId: string | null;
  custoRecursoValor: number;
  usos: number | null;
  usosAtual: number | null;
  recarga: string | null;
  tags: string | null;
  efeitos: EfeitoHabilidade[];
};

function HabilidadeModal({
  inicial,
  recursos,
  onCancelar,
  onSalvar,
}: {
  inicial: Habilidade | null;
  recursos: RecursoMinimo[];
  onCancelar: () => void;
  onSalvar: (d: HabilidadeFormDados) => void;
}) {
  const periciasCustom = useContext(AlvosCustomContext);
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [origem, setOrigem] = useState<OrigemHabilidade>(
    (inicial?.origem as OrigemHabilidade) ?? "livre",
  );
  const [tipo, setTipo] = useState<TipoHabilidade>(
    (inicial?.tipo as TipoHabilidade) ?? "passiva",
  );
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [custoPp, setCustoPp] = useState(
    inicial?.custoPp ? String(inicial.custoPp) : "",
  );
  const [custoPa, setCustoPa] = useState(
    inicial?.custoPa ? String(inicial.custoPa) : "",
  );
  const [custoRecursoId, setCustoRecursoId] = useState(
    inicial?.custoRecursoId ?? "",
  );
  const [custoRecursoValor, setCustoRecursoValor] = useState(
    inicial?.custoRecursoValor ? String(inicial.custoRecursoValor) : "",
  );
  const [usos, setUsos] = useState(inicial?.usos != null ? String(inicial.usos) : "");
  const [recarga, setRecarga] = useState(inicial?.recarga ?? "");
  const [tags, setTags] = useState(inicial?.tags ?? "");
  const [efeitos, setEfeitos] = useState<EfeitoHabilidade[]>(
    lerEfeitos(inicial?.efeitos),
  );
  const [pickerAberto, setPickerAberto] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      Swal.fire({
        icon: "warning",
        title: "Campo obrigatório",
        text: "Dê um nome pra habilidade.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }
    const usosNum = usos === "" ? null : Math.max(0, Number(usos) || 0);
    onSalvar({
      nome: nomeLimpo,
      origem,
      tipo,
      descricao,
      custoPp: Number(custoPp) || 0,
      custoPa: Number(custoPa) || 0,
      custoRecursoId: custoRecursoId || null,
      custoRecursoValor: Number(custoRecursoValor) || 0,
      usos: usosNum,
      // Edição preserva o tanque atual; criação começa cheio (= usos).
      usosAtual: inicial ? inicial.usosAtual : usosNum,
      recarga: recarga || null,
      tags: tags.trim() || null,
      efeitos,
    });
  }

  function addEfeitoPorPreset(presetId: string) {
    const preset = PRESETS_EFEITO.find((p) => p.id === presetId);
    if (!preset) return;
    setEfeitos((curr) => [...curr, preset.criar()]);
    setPickerAberto(false);
  }

  function patchEfeito(idx: number, patch: Partial<EfeitoHabilidade>) {
    setEfeitos((curr) =>
      curr.map((e, i) => (i === idx ? ({ ...e, ...patch } as EfeitoHabilidade) : e)),
    );
  }

  function removerEfeito(idx: number) {
    setEfeitos((curr) => curr.filter((_, i) => i !== idx));
  }

  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()}>
        <h2>{inicial ? "Editar Habilidade" : "Nova Habilidade"}</h2>

        <form onSubmit={submit}>
          <label>Origem</label>
          <div className="origem-pills">
            {ORIGENS_HABILIDADE.map((o) => (
              <button
                type="button"
                key={o.slug}
                className={`origem-pill ${origem === o.slug ? "ativo" : ""}`}
                onClick={() => setOrigem(o.slug)}
                style={origem === o.slug ? { borderColor: o.cor, color: o.cor } : undefined}
              >
                <i className={`fas ${o.icone}`} /> {o.nome}
              </button>
            ))}
          </div>

          <label style={{ marginTop: 14 }}>Tipo</label>
          <div className="tipo-cards tipo-cards-4">
            {TIPOS_HABILIDADE.map((t) => (
              <button
                type="button"
                key={t.slug}
                className={`tipo-card ${tipo === t.slug ? "ativo" : ""}`}
                style={
                  tipo === t.slug
                    ? {
                        borderColor: t.cor,
                        backgroundColor: `color-mix(in oklch, ${t.cor} 10%, var(--bg-card))`,
                      }
                    : undefined
                }
                onClick={() => setTipo(t.slug)}
              >
                <i className={`fas ${t.icone}`} style={{ fontSize: "1.4rem", color: t.cor }} />
                <span className="tipo-card-titulo">{t.nome}</span>
              </button>
            ))}
          </div>

          <label>Nome</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Golpe Certeiro"
            autoFocus
          />

          <label>Descrição</label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Como funciona, quando se aplica, regras especiais..."
          />

          <details
            className="modal-secao-detalhe"
            open={!!(custoPp || custoPa || custoRecursoId)}
          >
            <summary>
              <i className="fas fa-coins" /> Custos (opcional)
            </summary>
            <div className="modal-secao-corpo">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label>PP</label>
                  <input
                    type="number"
                    min={0}
                    value={custoPp}
                    onChange={(e) => setCustoPp(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label>PA</label>
                  <input
                    type="number"
                    min={0}
                    value={custoPa}
                    onChange={(e) => setCustoPa(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              {recursos.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr",
                    gap: 10,
                    marginTop: 10,
                  }}
                >
                  <div>
                    <label>Recurso customizado</label>
                    <select
                      value={custoRecursoId}
                      onChange={(e) => setCustoRecursoId(e.target.value)}
                    >
                      <option value="">—</option>
                      {recursos.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Quantidade</label>
                    <input
                      type="number"
                      min={0}
                      value={custoRecursoValor}
                      onChange={(e) => setCustoRecursoValor(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
            </div>
          </details>

          <details className="modal-secao-detalhe" open={!!(usos || recarga)}>
            <summary>
              <i className="fas fa-bolt-lightning" /> Usos limitados (opcional)
            </summary>
            <div className="modal-secao-corpo">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                <div>
                  <label>Máximo</label>
                  <input
                    type="number"
                    min={0}
                    value={usos}
                    onChange={(e) => setUsos(e.target.value)}
                    placeholder="—"
                  />
                </div>
                <div>
                  <label>Recarga</label>
                  <select
                    value={recarga}
                    onChange={(e) => setRecarga(e.target.value)}
                  >
                    <option value="">—</option>
                    {RECARGAS_HABILIDADE.map((r) => (
                      <option key={r.slug} value={r.slug}>
                        {r.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </details>

          <details className="modal-secao-detalhe" open={efeitos.length > 0 || pickerAberto}>
            <summary>
              <i className="fas fa-list-check" /> Efeitos ({efeitos.length})
            </summary>
            <div className="modal-secao-corpo">
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
                  onPick={addEfeitoPorPreset}
                  onCancelar={() => setPickerAberto(false)}
                />
              )}

              {efeitos.length === 0 && !pickerAberto && (
                <p className="modal-hint" style={{ marginTop: 10 }}>
                  Nenhum efeito ainda. Clique no botão acima e escolha o que a
                  habilidade faz em linguagem natural.
                </p>
              )}
              {efeitos.map((e, i) => (
                <EditorEfeito
                  key={i}
                  efeito={e}
                  recursos={recursos}
                  onPatch={(p) => patchEfeito(i, p)}
                  onRemover={() => removerEfeito(i)}
                />
              ))}
            </div>
          </details>

          <label style={{ marginTop: 14 }}>Tags (separadas por vírgula)</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="combate, descanso longo, graduacao:profissional"
          />

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onCancelar}>
              Cancelar
            </button>
            <button type="submit" className="modal-btn-save">
              Salvar
            </button>
          </div>
        </form>

        {/* Sugestões canônicas pros campos de alvo automatizáveis.
            Texto livre continua aceito; só não modifica cálculo. */}
        <datalist id="alvos-efeito">
          {[...ALVOS_AGREGAVEIS, ...periciasCustom].map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.nome} ({a.grupo})
            </option>
          ))}
        </datalist>
      </div>
    </div>
  );
}

// Picker visual em grid: presets em linguagem natural agrupados por tema.
// Clicar adiciona o efeito já com o tipo + campos pré-preenchidos.
function PickerPreset({
  onPick,
  onCancelar,
}: {
  onPick: (presetId: string) => void;
  onCancelar: () => void;
}) {
  return (
    <div className="picker-preset">
      <div className="picker-preset-topo">
        <span>O que essa habilidade faz?</span>
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

// Subset de alvos que faz sentido para `multiplicador` (Espécie Gigante dobra
// carga, etc). Tudo o que não tá aqui (perícia, ataque, dano…) cai no "Outro".
const ALVOS_MULTIPLICADOR_SLUGS = new Set([
  "carga",
  "deslocamento",
  "hp-max",
  "pp-max",
]);
const ALVOS_MULTIPLICADOR = ALVOS_AGREGAVEIS.filter((a) =>
  ALVOS_MULTIPLICADOR_SLUGS.has(a.slug),
);

// Select de alvo agrupado por categoria. Mostra "Outro…" no fim — escolher
// abre o input livre, mantendo a flexibilidade que tinha antes.
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
  // Perícias customizadas entram nas listas que já oferecem perícias (modificador,
  // proficiência, vantagem, substituição) — não no multiplicador (Derivado/Pool).
  const periciasCustom = useContext(AlvosCustomContext);
  const alvosFinais =
    periciasCustom.length > 0 && alvos.some((a) => a.grupo === "Perícia")
      ? [...alvos, ...periciasCustom]
      : alvos;

  const slugsCanonicos = new Set(alvosFinais.map((a) => a.slug));
  // Se o valor existente não está na lista canônica, automaticamente vira "outro".
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
      <div className="efeito-editor-corpo">{renderCorpo(efeito, recursos, onPatch)}</div>
    </div>
  );
}

function renderCorpo(
  e: EfeitoHabilidade,
  recursos: RecursoMinimo[],
  onPatch: (p: Partial<EfeitoHabilidade>) => void,
): React.ReactNode {
  // Helper: bloco de campos opcionais colapsável.
  const Detalhes = ({
    children,
    aberto,
  }: {
    children: React.ReactNode;
    aberto?: boolean;
  }) => (
    <details className="efeito-detalhes" open={aberto}>
      <summary>Detalhes (opcional)</summary>
      <div className="efeito-detalhes-corpo">{children}</div>
    </details>
  );

  switch (e.tipo) {
    case "modificador": {
      // Quando o alvo é canônico e estável (hp-temp, hp-max, pp-max, cr…),
      // o card mostra só "Quantidade". Alvo livre → mostra select de alvo.
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
    case "proficiencia":
      return (
        <>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Em qual?</label>
            <SelectAlvo
              valor={e.alvo}
              onChange={(v) => onPatch({ alvo: v } as Partial<EfeitoHabilidade>)}
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
            Dobrada (proficiência ×2)
          </label>
        </>
      );
    case "recurso_delta":
      return (
        <>
          {recursos.length > 0 ? (
            <div>
              <label>Recurso</label>
              <select
                // Normaliza grafia legada (hpMax) pro slug canônico no display.
                value={e.recurso === "hpMax" ? "hp-max" : e.recurso}
                onChange={(ev) =>
                  onPatch({ recurso: ev.target.value } as Partial<EfeitoHabilidade>)
                }
              >
                <option value="">—</option>
                <option value="pp">PP</option>
                <option value="hp-max">PV Máx</option>
                {recursos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <Campo
              label="Recurso"
              valor={e.recurso}
              onChange={(v) => onPatch({ recurso: v } as Partial<EfeitoHabilidade>)}
              placeholder="pp, hp-max ou id do recurso"
            />
          )}
          <CampoNum
            label="Quantidade"
            valor={e.valor}
            onChange={(v) => onPatch({ valor: v } as Partial<EfeitoHabilidade>)}
          />
        </>
      );
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
                // PV é o padrão (alvoCura vazio); só grava slug pros outros
                // pools. Aliases legados (ppv/pv-temp/pv) caem no canônico.
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
            label="Fator (ex: 2 = dobra)"
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
            label="Alcance (m, 0 = passivo)"
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
            Garante <strong>metade do dano máximo</strong> da rolagem (arredonda pra
            cima). Aparece como chip ao empilhar o dano no Rolador.
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
          <div style={{ gridColumn: "1 / -1", fontSize: "0.75rem", color: "var(--text-sec)" }}>
            Descritivo — anota a fonte no chip de ataque (não soma no valor da arma).
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
      return (
        <div style={{ gridColumn: "1 / -1", fontSize: "0.8rem", color: "var(--text-sec)" }}>
          Não pode sofrer acerto crítico. Efeito defensivo — mostra no card; a
          exibição na barra de defesas vem depois.
        </div>
      );
    case "livre":
      return (
        <div style={{ gridColumn: "1 / -1" }}>
          <Campo
            label="Descrição"
            valor={e.texto}
            onChange={(v) => onPatch({ texto: v } as Partial<EfeitoHabilidade>)}
            placeholder="mecânica não automatizável"
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
