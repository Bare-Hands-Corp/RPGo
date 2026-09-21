"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import {
  alternarHabilidade,
  atualizarHabilidade,
  criarHabilidade,
  deletarHabilidade,
  usarHabilidade,
} from "./actions";
import {
  ORIGENS_HABILIDADE,
  RECARGAS_HABILIDADE,
  TIPOS_HABILIDADE,
  alvosPericiaCustom,
  computarDeltasInstantaneos,
  formatarMod,
  lerEfeitos,
  resolverAtributosNaFormula,
  temEfeitoSustentado,
  type Atributo,
  type EfeitoHabilidade,
  type OrigemHabilidade,
  type TipoHabilidade,
} from "@/lib/op-rpg";
import {
  AlvosCustomContext,
  ChipEfeito,
  DatalistAlvos,
  EfeitosEditor,
  type RecursoMinimo,
} from "./efeitos-editor";
import { type Dado, parseFormulaDados } from "@/lib/dice";
import { empilharRolagem } from "@/lib/empilhar-rolagem";
import { TagChip, TagsEditor } from "./estilo-cor-picker";
import {
  lerEstilosTag,
  podarEstilosTag,
  separarTags,
  type MapaEstilosTag,
} from "@/lib/estilos-cor";

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
  tagsEstilo: unknown;
  favorita: boolean;
  ordem: number;
  efeitos: unknown;
  ligada: boolean;
  itemId: string | null;
};

// Item que pode conceder uma habilidade — só o necessário pro select e pro gate.
type ItemRef = { id: string; nome: string; equipado: boolean };

type Props = {
  personagemId: string;
  habilidades: Habilidade[];
  recursos: RecursoMinimo[];
  atributos: Record<Atributo, number>;
  periciasCustom: { slug: string; nome: string }[];
  /** IDs de habilidade presas a um nó de árvore ainda não liberado. */
  travadas?: string[];
  /** Itens do personagem — habilidade concedida por item exige ele equipado. */
  itens: ItemRef[];
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
  travadas = [],
  itens,
}: Props) {
  const travadasSet = useMemo(() => new Set(travadas), [travadas]);
  const [otimistas, aplicar] = useOptimistic(habilidades, aplicarPatch);
  const [, startTransition] = useTransition();
  const alvosCustom = useMemo(() => alvosPericiaCustom(periciasCustom), [periciasCustom]);
  const [modalAberto, setModalAberto] = useState(false);
  const [edit, setEdit] = useState<Habilidade | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");

  // Itens indexados pra o card resolver de onde a habilidade veio.
  const itemPorId = useMemo(() => {
    const m = new Map<string, ItemRef>();
    for (const i of itens) m.set(i.id, i);
    return m;
  }, [itens]);

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
          onClick={abrirNova}
        >
          + Nova Habilidade
        </button>
      </div>
      <p className="modal-intro">
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
                travada={travadasSet.has(h.id)}
                itemOrigem={h.itemId ? itemPorId.get(h.itemId) : undefined}
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
                  travada={travadasSet.has(h.id)}
                  itemOrigem={h.itemId ? itemPorId.get(h.itemId) : undefined}
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
          itens={itens}
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
  travada,
  itemOrigem,
  recursoNomePorId,
  atributos,
  onEdit,
  onApagar,
  onUsar,
  onAlternar,
  onFavorita,
}: {
  habilidade: Habilidade;
  travada: boolean;
  itemOrigem?: ItemRef;
  recursoNomePorId: Map<string, string>;
  atributos: Record<Atributo, number>;
  onEdit: () => void;
  onApagar: () => void;
  onUsar: () => void;
  onAlternar: () => void;
  onFavorita: () => void;
}) {
  const efeitos = lerEfeitos(habilidade.efeitos);
  // Habilidade concedida por item só vale com o item equipado — mesmo efeito
  // prático de estar travada por um nó de árvore não liberado.
  const travadaPorItem = !!habilidade.itemId && !itemOrigem?.equipado;
  const bloqueada = travada || travadaPorItem;
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
  const tags = separarTags(habilidade.tags);
  const estilosTag = lerEstilosTag(habilidade.tagsEstilo);

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
    <div
      className={`action-card ${tipoClass}${ligadaAtiva ? " hab-card-ligada" : ""}${
        bloqueada ? " hab-travada" : ""
      }`}
    >
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
        {itemOrigem && (
          <div className="acao-stats">
            <span
              className="acao-stat"
              style={travadaPorItem ? { color: "var(--text-sec)" } : undefined}
              title={
                travadaPorItem
                  ? "Vem de um item que não está equipado"
                  : "Habilidade concedida por este item"
              }
            >
              <i className={`fas ${travadaPorItem ? "fa-lock" : "fa-sack-dollar"}`} />{" "}
              {itemOrigem.nome}
            </span>
          </div>
        )}
        {travada && (
          <div className="hab-travada-nota">
            <i className="fas fa-lock" /> travada por um talento não liberado —
            os efeitos não contam
          </div>
        )}
        {travadaPorItem && (
          <div className="hab-travada-nota">
            <i className="fas fa-lock" /> equipe {itemOrigem?.nome ?? "o item"} pra
            valer — os efeitos não contam
          </div>
        )}
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
            <TagChip key={`t${i}`} nome={t} estilo={estilosTag[t]} />
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
  tagsEstilo: MapaEstilosTag;
  efeitos: EfeitoHabilidade[];
  itemId: string | null;
};

function HabilidadeModal({
  inicial,
  recursos,
  itens,
  onCancelar,
  onSalvar,
}: {
  inicial: Habilidade | null;
  recursos: RecursoMinimo[];
  itens: ItemRef[];
  onCancelar: () => void;
  onSalvar: (d: HabilidadeFormDados) => void;
}) {
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
  const [tagsEstilo, setTagsEstilo] = useState<MapaEstilosTag>(
    lerEstilosTag(inicial?.tagsEstilo),
  );
  const [efeitos, setEfeitos] = useState<EfeitoHabilidade[]>(
    lerEfeitos(inicial?.efeitos),
  );
  const [itemId, setItemId] = useState(inicial?.itemId ?? "");
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
      tagsEstilo: podarEstilosTag(tagsEstilo, tags),
      efeitos,
      itemId: itemId || null,
    });
  }

  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onCancelar} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
        <h2>{inicial ? "Editar Habilidade" : "Nova Habilidade"}</h2>

        <form onSubmit={submit}>
          <label>Origem</label>
          <div className="origem-pills">
            {ORIGENS_HABILIDADE.map((o) => (
              <button
                type="button"
                key={o.slug}
                className={`origem-pill ${origem === o.slug ? "ativo" : ""}`}
                aria-pressed={origem === o.slug}
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
                style={{ "--tipo-cor": t.cor } as React.CSSProperties}
                aria-pressed={tipo === t.slug}
                onClick={() => setTipo(t.slug)}
              >
                <i className={`fas ${t.icone} tipo-card-icone`} />
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

          <label>Vem do item (opcional)</label>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">— nenhum —</option>
            {itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
                {i.equipado ? "" : " (desequipado)"}
              </option>
            ))}
          </select>
          {itemId && (
            <p className="modal-hint" style={{ marginTop: 8 }}>
              <i className="fas fa-circle-info" /> Os efeitos só contam enquanto esse
              item estiver equipado.
            </p>
          )}

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

          <details className="modal-secao-detalhe" open={efeitos.length > 0}>
            <summary>
              <i className="fas fa-list-check" /> Efeitos ({efeitos.length})
            </summary>
            <div className="modal-secao-corpo">
              <EfeitosEditor
                efeitos={efeitos}
                onChange={setEfeitos}
                recursos={recursos}
                pergunta="O que essa habilidade faz?"
              />
            </div>
          </details>

          <label style={{ marginTop: 14 }}>Tags (separadas por vírgula)</label>
          <TagsEditor
            tags={tags}
            estilos={tagsEstilo}
            onTags={setTags}
            onEstilos={setTagsEstilo}
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

        <DatalistAlvos />
      </div>
    </div>
  );
}

