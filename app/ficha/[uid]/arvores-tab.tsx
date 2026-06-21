"use client";

import {
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import Swal from "sweetalert2";
import {
  atualizarArvore,
  atualizarCamada,
  atualizarNo,
  comprarNo,
  criarArvore,
  criarCamada,
  criarNo,
  deletarArvore,
  deletarCamada,
  deletarNo,
  devolverNo,
} from "./actions";
import { EstiloPicker } from "./estilo-cor-picker";
import {
  EFEITO_COR_PADRAO,
  estiloAplicado,
  normalizarEfeitoCor,
  type EfeitoCor,
} from "@/lib/estilos-cor";
import {
  CRITERIOS_ARVORE,
  MAX_RANKS_TETO,
  camadasAbertas,
  estadoNo,
  lerRequisitos,
  marcaRank,
  normalizarCriterio,
  pontosGastos,
  rotuloRank,
  type CamadaArvore,
  type CriterioArvore,
  type NoArvore,
  type RequisitoNo,
} from "@/lib/arvore";

export type Arvore = {
  id: string;
  nome: string;
  icone: string;
  cor: string | null;
  efeito: string;
  ordem: number;
  criterio: string;
  recursoCustoId: string | null;
  camadas: CamadaArvore[];
  nos: NoArvore[];
};

type RecursoRef = {
  id: string;
  nome: string;
  valorAtual: number;
  valorMax: number;
};

type HabilidadeRef = { id: string; nome: string };

type Props = {
  personagemId: string;
  nivel: number;
  arvores: Arvore[];
  recursos: RecursoRef[];
  habilidades: HabilidadeRef[];
};

function mostrarErro(err: unknown) {
  Swal.fire({
    icon: "error",
    title: "Erro",
    text: err instanceof Error ? err.message : "Operação falhou.",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

async function confirmar(titulo: string, texto: string) {
  const r = await Swal.fire({
    title: titulo,
    text: texto,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Apagar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#d33",
    cancelButtonColor: "#3085d6",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
  return r.isConfirmed;
}

export function ArvoresTab({
  personagemId,
  nivel,
  arvores,
  recursos,
  habilidades,
}: Props) {
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [modalArvore, setModalArvore] = useState<Arvore | "nova" | null>(null);
  const [modalCamada, setModalCamada] = useState<CamadaArvore | "nova" | null>(null);
  const [modalNo, setModalNo] = useState<NoArvore | "novo" | null>(null);
  const [, startTransition] = useTransition();

  type Patch =
    | { kind: "rank"; noId: string; rank: number }
    | { kind: "patchNo"; noId: string; patch: Partial<NoArvore> }
    | { kind: "patchArvore"; arvoreId: string; patch: Partial<Arvore> };

  const [lista, aplicar] = useOptimistic(arvores, (state, p: Patch) => {
    if (p.kind === "patchArvore") {
      return state.map((a) => (a.id === p.arvoreId ? { ...a, ...p.patch } : a));
    }
    return state.map((a) => ({
      ...a,
      nos: a.nos.map((n) =>
        n.id === p.noId
          ? p.kind === "rank"
            ? { ...n, rankAtual: p.rank }
            : { ...n, ...p.patch }
          : n,
      ),
    }));
  });

  const ordenadas = useMemo(
    () => [...lista].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)),
    [lista],
  );
  const arvore =
    ordenadas.find((a) => a.id === selecionadaId) ?? ordenadas[0] ?? null;

  const recursoCusto = arvore?.recursoCustoId
    ? recursos.find((r) => r.id === arvore.recursoCustoId) ?? null
    : null;

  const camadas = useMemo(
    () => (arvore ? [...arvore.camadas].sort((a, b) => a.ordem - b.ordem) : []),
    [arvore],
  );

  const ctx = useMemo(
    () => ({
      criterio: normalizarCriterio(arvore?.criterio),
      nivelPersonagem: nivel,
      nos: arvore?.nos ?? [],
      saldoRecurso: recursoCusto ? recursoCusto.valorAtual : null,
    }),
    [arvore, nivel, recursoCusto],
  );

  const abertas = useMemo(() => camadasAbertas(camadas, ctx), [camadas, ctx]);
  const gastos = useMemo(() => pontosGastos(ctx.nos), [ctx.nos]);

  function comprar(no: NoArvore) {
    if (!arvore) return;
    startTransition(async () => {
      aplicar({ kind: "rank", noId: no.id, rank: no.rankAtual + 1 });
      try {
        await comprarNo(personagemId, arvore.id, no.id);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function devolver(no: NoArvore) {
    if (!arvore) return;
    startTransition(async () => {
      aplicar({ kind: "rank", noId: no.id, rank: no.rankAtual - 1 });
      try {
        await devolverNo(personagemId, arvore.id, no.id);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  async function apagarArvore() {
    if (!arvore) return;
    if (
      !(await confirmar(
        "Apagar árvore",
        `Apagar "${arvore.nome}" com todas as camadas e talentos?`,
      ))
    )
      return;
    startTransition(async () => {
      try {
        await deletarArvore(personagemId, arvore.id);
        setSelecionadaId(null);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  async function apagarCamada(camada: CamadaArvore) {
    if (!arvore) return;
    const nosDaCamada = arvore.nos.filter((n) => n.camadaId === camada.id).length;
    if (
      !(await confirmar(
        "Apagar camada",
        nosDaCamada > 0
          ? `"${camada.nome}" tem ${nosDaCamada} talento(s) — eles serão apagados junto.`
          : `Apagar a camada "${camada.nome}"?`,
      ))
    )
      return;
    startTransition(async () => {
      try {
        await deletarCamada(personagemId, arvore.id, camada.id);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  const criterioMeta = CRITERIOS_ARVORE.find((c) => c.slug === ctx.criterio);

  return (
    <div className="arvores-wrap">
      <div className="arvores-topo">
        <h1>Árvores</h1>
        <button
          type="button"
          className="btn-rect primary"
          style={{ background: "var(--color-react)" }}
          onClick={() => setModalArvore("nova")}
        >
          + Nova Árvore
        </button>
      </div>

      {ordenadas.length === 0 && (
        <div className="placeholder-tab">
          <i className="fas fa-sitemap" />
          <p>
            Nenhuma árvore ainda. Monte a Árvore de Talentos do Haki, os níveis do
            teu Estilo de Combate, ou qualquer trilha própria.
          </p>
        </div>
      )}

      {ordenadas.length > 0 && (
        <div className="arvore-seletor">
          {ordenadas.map((a) => {
            const fx = estiloAplicado(
              { cor: a.cor, efeito: normalizarEfeitoCor(a.efeito) },
              "chip",
            );
            const ativa = arvore?.id === a.id;
            return (
              <button
                type="button"
                key={a.id}
                className={`arvore-pill ${ativa ? "ativa" : ""} ${fx.className}`.trim()}
                style={fx.style}
                onClick={() => setSelecionadaId(a.id)}
              >
                <i className={`fas ${a.icone}`} />{" "}
                <span className="fx-texto">{a.nome}</span>
              </button>
            );
          })}
        </div>
      )}

      {arvore && (
        <>
          <div className="arvore-barra">
            <div className="arvore-barra-info">
              <span className="arvore-criterio" title={criterioMeta?.dica}>
                <i className="fas fa-unlock-keyhole" /> {criterioMeta?.nome}
              </span>
              {ctx.criterio === "pontos" && (
                <span className="arvore-metrica">
                  <strong>{gastos}</strong> ponto(s) gasto(s)
                </span>
              )}
              {ctx.criterio === "nivel" && (
                <span className="arvore-metrica">
                  nível <strong>{nivel}</strong>
                </span>
              )}
              {recursoCusto && (
                <span className="arvore-metrica">
                  <i className="fas fa-coins" /> {recursoCusto.nome}:{" "}
                  <strong>{recursoCusto.valorAtual}</strong>/{recursoCusto.valorMax}
                </span>
              )}
              {!recursoCusto && arvore.recursoCustoId && (
                <span className="arvore-metrica arvore-aviso">
                  <i className="fas fa-triangle-exclamation" /> recurso de custo
                  apagado — custos viraram informativos
                </span>
              )}
            </div>
            <div className="arvore-barra-acoes">
              <button
                type="button"
                className="btn-rect outline"
                onClick={() => setModalNo("novo")}
              >
                + Talento
              </button>
              <button
                type="button"
                className="btn-rect outline"
                onClick={() => setModalCamada("nova")}
              >
                + Camada
              </button>
              <button
                type="button"
                className="recurso-icon-btn"
                title="Editar árvore"
                onClick={() => setModalArvore(arvore)}
              >
                <i className="fas fa-edit" />
              </button>
              <button
                type="button"
                className="recurso-icon-btn"
                title="Apagar árvore"
                onClick={apagarArvore}
              >
                <i className="fas fa-trash" />
              </button>
            </div>
          </div>

          <ArvoreCanvas
            arvore={arvore}
            camadas={camadas}
            abertas={abertas}
            ctx={ctx}
            criterio={ctx.criterio}
            onComprar={comprar}
            onDevolver={devolver}
            onEditarNo={(n) => setModalNo(n)}
            onEditarCamada={(c) => setModalCamada(c)}
            onApagarCamada={apagarCamada}
          />
        </>
      )}

      {modalArvore && (
        <ArvoreModal
          inicial={modalArvore === "nova" ? null : modalArvore}
          recursos={recursos}
          onCancelar={() => setModalArvore(null)}
          onSalvar={(dados) => {
            const editandoId = modalArvore === "nova" ? null : modalArvore.id;
            setModalArvore(null);
            startTransition(async () => {
              try {
                if (editandoId) {
                  aplicar({
                    kind: "patchArvore",
                    arvoreId: editandoId,
                    patch: dados as Partial<Arvore>,
                  });
                  await atualizarArvore(personagemId, editandoId, dados);
                } else {
                  const r = await criarArvore(personagemId, dados);
                  setSelecionadaId(r.id);
                }
              } catch (err) {
                mostrarErro(err);
              }
            });
          }}
        />
      )}

      {modalCamada && arvore && (
        <CamadaModal
          inicial={modalCamada === "nova" ? null : modalCamada}
          criterio={ctx.criterio}
          onCancelar={() => setModalCamada(null)}
          onSalvar={(dados) => {
            const editandoId = modalCamada === "nova" ? null : modalCamada.id;
            setModalCamada(null);
            startTransition(async () => {
              try {
                if (editandoId) {
                  await atualizarCamada(personagemId, arvore.id, editandoId, dados);
                } else {
                  await criarCamada(personagemId, arvore.id, {
                    ...dados,
                    ordem: camadas.length,
                  });
                }
              } catch (err) {
                mostrarErro(err);
              }
            });
          }}
        />
      )}

      {modalNo && arvore && (
        <NoModal
          inicial={modalNo === "novo" ? null : modalNo}
          camadas={camadas}
          nos={arvore.nos}
          habilidades={habilidades}
          temRecurso={!!recursoCusto}
          onCancelar={() => setModalNo(null)}
          onApagar={
            modalNo === "novo"
              ? undefined
              : async () => {
                  const alvo = modalNo;
                  if (!(await confirmar("Apagar talento", `Apagar "${alvo.nome}"?`)))
                    return;
                  setModalNo(null);
                  startTransition(async () => {
                    try {
                      await deletarNo(personagemId, arvore.id, alvo.id);
                    } catch (err) {
                      mostrarErro(err);
                    }
                  });
                }
          }
          onSalvar={(dados) => {
            const editandoId = modalNo === "novo" ? null : modalNo.id;
            setModalNo(null);
            startTransition(async () => {
              try {
                if (editandoId) {
                  aplicar({
                    kind: "patchNo",
                    noId: editandoId,
                    patch: dados as Partial<NoArvore>,
                  });
                  await atualizarNo(personagemId, arvore.id, editandoId, dados);
                } else {
                  await criarNo(personagemId, arvore.id, dados);
                }
              } catch (err) {
                mostrarErro(err);
              }
            });
          }}
        />
      )}
    </div>
  );
}

// ─── Canvas: camadas empilhadas + conectores SVG ────────────

function ArvoreCanvas({
  arvore,
  camadas,
  abertas,
  ctx,
  criterio,
  onComprar,
  onDevolver,
  onEditarNo,
  onEditarCamada,
  onApagarCamada,
}: {
  arvore: Arvore;
  camadas: CamadaArvore[];
  abertas: Set<string>;
  ctx: Parameters<typeof estadoNo>[2];
  criterio: CriterioArvore;
  onComprar: (n: NoArvore) => void;
  onDevolver: (n: NoArvore) => void;
  onEditarNo: (n: NoArvore) => void;
  onEditarCamada: (c: CamadaArvore) => void;
  onApagarCamada: (c: CamadaArvore) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nosRef = useRef(new Map<string, HTMLElement>());
  const [linhas, setLinhas] = useState<
    { x1: number; y1: number; x2: number; y2: number; ativa: boolean }[]
  >([]);
  const [tamanho, setTamanho] = useState({ w: 0, h: 0 });

  const criterioLimiar = CRITERIOS_ARVORE.find((c) => c.slug === criterio);

  // Conectores são medidos do DOM (o layout é fluido: grid que reflui com a
  // largura). Um ResizeObserver no container cobre resize da janela, troca de
  // aba (display:none → visível) e mudança na quantidade de nós.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function medir() {
      const cont = containerRef.current;
      if (!cont) return;
      const base = cont.getBoundingClientRect();
      if (base.width === 0) return; // aba escondida — mede quando aparecer

      const novas: typeof linhas = [];
      for (const no of arvore.nos) {
        const filho = nosRef.current.get(no.id);
        if (!filho) continue;
        const rf = filho.getBoundingClientRect();
        for (const req of lerRequisitos(no.requisitos)) {
          const pai = nosRef.current.get(req.noId);
          if (!pai) continue;
          const rp = pai.getBoundingClientRect();
          const paiNo = arvore.nos.find((n) => n.id === req.noId);
          novas.push({
            x1: rp.left - base.left + rp.width / 2,
            y1: rp.top - base.top + rp.height,
            x2: rf.left - base.left + rf.width / 2,
            y2: rf.top - base.top,
            ativa: (paiNo?.rankAtual ?? 0) >= req.rank,
          });
        }
      }
      setTamanho({ w: base.width, h: base.height });
      setLinhas(novas);
    }

    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(container);
    return () => ro.disconnect();
  }, [arvore.nos, camadas]);

  return (
    <div className="arvore-canvas" ref={containerRef}>
      <svg
        className="arvore-conectores"
        width={tamanho.w}
        height={tamanho.h}
        aria-hidden="true"
      >
        {linhas.map((l, i) => {
          // Curva em S vertical: sai por baixo do pai, entra por cima do filho.
          const meio = (l.y1 + l.y2) / 2;
          return (
            <path
              key={i}
              d={`M ${l.x1} ${l.y1} C ${l.x1} ${meio}, ${l.x2} ${meio}, ${l.x2} ${l.y2}`}
              className={`arvore-conector ${l.ativa ? "ativo" : ""}`}
            />
          );
        })}
      </svg>

      {camadas.map((camada) => {
        const aberta = abertas.has(camada.id);
        const nos = arvore.nos
          .filter((n) => n.camadaId === camada.id)
          .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
        return (
          <section
            key={camada.id}
            className={`arvore-camada ${aberta ? "" : "fechada"}`}
          >
            <header className="arvore-camada-head">
              <span className="arvore-camada-nome">
                <i className={`fas ${aberta ? "fa-lock-open" : "fa-lock"}`} />{" "}
                {camada.nome}
              </span>
              {criterio !== "manual" && (
                <span className="arvore-camada-limiar">
                  {criterioLimiar?.rotuloLimiar}: {camada.limiar}
                </span>
              )}
              <span className="arvore-camada-acoes">
                <button
                  type="button"
                  className="recurso-icon-btn"
                  title="Editar camada"
                  onClick={() => onEditarCamada(camada)}
                >
                  <i className="fas fa-edit" />
                </button>
                <button
                  type="button"
                  className="recurso-icon-btn"
                  title="Apagar camada"
                  onClick={() => onApagarCamada(camada)}
                >
                  <i className="fas fa-trash" />
                </button>
              </span>
            </header>

            {nos.length === 0 ? (
              <div className="arvore-camada-vazia">Sem talentos nesta camada.</div>
            ) : (
              <div className="arvore-nos">
                {nos.map((no) => (
                  <NoCard
                    key={no.id}
                    no={no}
                    estado={estadoNo(no, camadas, ctx)}
                    registrar={(el) => {
                      if (el) nosRef.current.set(no.id, el);
                      else nosRef.current.delete(no.id);
                    }}
                    onComprar={() => onComprar(no)}
                    onDevolver={() => onDevolver(no)}
                    onEditar={() => onEditarNo(no)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function NoCard({
  no,
  estado,
  registrar,
  onComprar,
  onDevolver,
  onEditar,
}: {
  no: NoArvore;
  estado: ReturnType<typeof estadoNo>;
  registrar: (el: HTMLElement | null) => void;
  onComprar: () => void;
  onDevolver: () => void;
  onEditar: () => void;
}) {
  const maxRanks = Math.max(1, no.maxRanks);
  const classe = estado.comprado
    ? "comprado"
    : estado.podeComprar
    ? "disponivel"
    : "travado";

  return (
    <article ref={registrar} className={`arvore-no ${classe}`}>
      <button
        type="button"
        className="arvore-no-editar"
        title="Editar talento"
        onClick={onEditar}
      >
        <i className="fas fa-edit" />
      </button>

      <div className="arvore-no-topo">
        <i className={`fas ${no.icone} arvore-no-icone`} />
        <span className="arvore-no-nome">{no.nome}</span>
      </div>

      {maxRanks > 1 && (
        <div className="arvore-no-ranks" title={`${estado.rank} de ${maxRanks}`}>
          {Array.from({ length: maxRanks }, (_, i) => (
            <span
              key={i}
              className={`arvore-pip ${i < estado.rank ? "cheio" : ""}`}
              title={rotuloRank(i + 1)}
            >
              {marcaRank(i + 1) || "●"}
            </span>
          ))}
        </div>
      )}

      {no.descricao && <p className="arvore-no-desc">{no.descricao}</p>}

      <div className="arvore-no-meta">
        {no.custo > 0 && (
          <span className="tag tag-custo">{no.custo} por rank</span>
        )}
        {no.nivelMinimo > 0 && <span className="tag">Nv. {no.nivelMinimo}</span>}
        {no.habilidadeId && (
          <span className="tag" title="Libera uma habilidade da ficha">
            <i className="fas fa-link" /> habilidade
          </span>
        )}
      </div>

      {estado.bloqueios.length > 0 && !estado.comprado && (
        <ul className="arvore-no-bloqueios">
          {estado.bloqueios.map((b, i) => (
            <li key={i}>
              <i className="fas fa-lock" /> {b}
            </li>
          ))}
        </ul>
      )}

      <div className="arvore-no-acoes">
        {estado.proximoRank !== null && (
          <button
            type="button"
            className="btn-rect outline arvore-btn-comprar"
            disabled={!estado.podeComprar}
            onClick={onComprar}
            title={
              estado.podeComprar
                ? `Liberar ${rotuloRank(estado.proximoRank)}`
                : estado.bloqueios.join(" · ")
            }
          >
            {estado.rank === 0 ? "Liberar" : `→ ${rotuloRank(estado.proximoRank)}`}
          </button>
        )}
        {estado.rank > 0 && (
          <button
            type="button"
            className="recurso-icon-btn"
            onClick={onDevolver}
            title="Devolver um rank"
          >
            <i className="fas fa-rotate-left" />
          </button>
        )}
        {estado.proximoRank === null && estado.comprado && (
          <span className="arvore-no-maximo">no máximo</span>
        )}
      </div>
    </article>
  );
}

// ─── Modais ─────────────────────────────────────────────────

type ArvoreFormDados = {
  nome: string;
  icone: string;
  cor: string | null;
  efeito: EfeitoCor;
  criterio: CriterioArvore;
  recursoCustoId: string | null;
};

function ArvoreModal({
  inicial,
  recursos,
  onCancelar,
  onSalvar,
}: {
  inicial: Arvore | null;
  recursos: RecursoRef[];
  onCancelar: () => void;
  onSalvar: (d: ArvoreFormDados) => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [icone, setIcone] = useState(inicial?.icone ?? "fa-sitemap");
  const [cor, setCor] = useState(inicial?.cor ?? "");
  const [efeito, setEfeito] = useState<EfeitoCor>(
    normalizarEfeitoCor(inicial?.efeito) ?? EFEITO_COR_PADRAO,
  );
  const [criterio, setCriterio] = useState<CriterioArvore>(
    normalizarCriterio(inicial?.criterio),
  );
  const [recursoCustoId, setRecursoCustoId] = useState(inicial?.recursoCustoId ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      mostrarErro(new Error("Dê um nome pra árvore."));
      return;
    }
    onSalvar({
      nome: nome.trim(),
      icone: icone.trim() || "fa-sitemap",
      cor: cor.trim() || null,
      efeito,
      criterio,
      recursoCustoId: recursoCustoId || null,
    });
  }

  const meta = CRITERIOS_ARVORE.find((c) => c.slug === criterio);

  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2>{inicial ? "Editar Árvore" : "Nova Árvore"}</h2>
        <form onSubmit={submit}>
          <label>Nome</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Haki da Observação"
            autoFocus
          />

          <label style={{ marginTop: 10 }}>Ícone (Font Awesome)</label>
          <input
            type="text"
            value={icone}
            onChange={(e) => setIcone(e.target.value)}
            placeholder="fa-eye"
          />

          <label style={{ marginTop: 10 }}>Como as camadas destravam</label>
          <select
            value={criterio}
            onChange={(e) => setCriterio(e.target.value as CriterioArvore)}
          >
            {CRITERIOS_ARVORE.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nome}
              </option>
            ))}
          </select>
          {meta && (
            <p style={{ fontSize: "0.76rem", color: "var(--text-sec)", marginTop: 4 }}>
              {meta.dica}
            </p>
          )}

          <label style={{ marginTop: 10 }}>Recurso que paga os talentos</label>
          <select
            value={recursoCustoId}
            onChange={(e) => setRecursoCustoId(e.target.value)}
          >
            <option value="">Nenhum — custo só informativo</option>
            {recursos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome} ({r.valorAtual}/{r.valorMax})
              </option>
            ))}
          </select>
          <p style={{ fontSize: "0.76rem", color: "var(--text-sec)", marginTop: 4 }}>
            Pontos de Ambição não têm campo próprio na ficha — crie um Recurso
            &quot;PA&quot; na sidebar e aponte aqui pra debitar de verdade.
          </p>

          <label style={{ marginTop: 10 }}>Cor e brilho</label>
          <EstiloPicker
            cor={cor}
            efeito={efeito}
            onChange={(patch) => {
              if (patch.cor !== undefined) setCor(patch.cor);
              if (patch.efeito !== undefined) setEfeito(patch.efeito);
            }}
            amostra={nome.trim().slice(0, 6) || "Aa"}
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
      </div>
    </div>
  );
}

function CamadaModal({
  inicial,
  criterio,
  onCancelar,
  onSalvar,
}: {
  inicial: CamadaArvore | null;
  criterio: CriterioArvore;
  onCancelar: () => void;
  onSalvar: (d: { nome: string; limiar: number }) => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [limiar, setLimiar] = useState(String(inicial?.limiar ?? 0));
  const meta = CRITERIOS_ARVORE.find((c) => c.slug === criterio);

  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2>{inicial ? "Editar Camada" : "Nova Camada"}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!nome.trim()) {
              mostrarErro(new Error("Dê um nome pra camada."));
              return;
            }
            onSalvar({ nome: nome.trim(), limiar: Math.max(0, Number(limiar) || 0) });
          }}
        >
          <label>Nome</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Inexperiente"
            autoFocus
          />

          {criterio === "manual" ? (
            <p style={{ fontSize: "0.8rem", color: "var(--text-sec)", marginTop: 10 }}>
              Esta árvore está como &quot;sempre aberta&quot; — a camada não tem
              limiar. Mude o critério da árvore pra usar trava.
            </p>
          ) : (
            <>
              <label style={{ marginTop: 10 }}>{meta?.rotuloLimiar}</label>
              <input
                type="number"
                min={0}
                value={limiar}
                onChange={(e) => setLimiar(e.target.value)}
              />
              <p style={{ fontSize: "0.76rem", color: "var(--text-sec)", marginTop: 4 }}>
                {meta?.dica}
              </p>
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onCancelar}>
              Cancelar
            </button>
            <button type="submit" className="modal-btn-save">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type NoFormDados = {
  camadaId: string;
  nome: string;
  descricao: string;
  icone: string;
  custo: number;
  maxRanks: number;
  nivelMinimo: number;
  habilidadeId: string | null;
  requisitos: RequisitoNo[];
};

function NoModal({
  inicial,
  camadas,
  nos,
  habilidades,
  temRecurso,
  onCancelar,
  onSalvar,
  onApagar,
}: {
  inicial: NoArvore | null;
  camadas: CamadaArvore[];
  nos: NoArvore[];
  habilidades: HabilidadeRef[];
  temRecurso: boolean;
  onCancelar: () => void;
  onSalvar: (d: NoFormDados) => void;
  onApagar?: () => void;
}) {
  const [camadaId, setCamadaId] = useState(inicial?.camadaId ?? camadas[0]?.id ?? "");
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [icone, setIcone] = useState(inicial?.icone ?? "fa-circle-nodes");
  const [custo, setCusto] = useState(String(inicial?.custo ?? 0));
  const [maxRanks, setMaxRanks] = useState(String(inicial?.maxRanks ?? 1));
  const [nivelMinimo, setNivelMinimo] = useState(String(inicial?.nivelMinimo ?? 0));
  const [habilidadeId, setHabilidadeId] = useState(inicial?.habilidadeId ?? "");
  const [requisitos, setRequisitos] = useState<RequisitoNo[]>(
    lerRequisitos(inicial?.requisitos),
  );

  // Candidatos a requisito: qualquer outro nó da árvore.
  const candidatos = nos.filter((n) => n.id !== inicial?.id);

  function toggleReq(noId: string, ligado: boolean) {
    setRequisitos((curr) =>
      ligado
        ? [...curr.filter((r) => r.noId !== noId), { noId, rank: 1 }]
        : curr.filter((r) => r.noId !== noId),
    );
  }

  function setRankReq(noId: string, rank: number) {
    setRequisitos((curr) =>
      curr.map((r) => (r.noId === noId ? { ...r, rank } : r)),
    );
  }

  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()}>
        <h2>{inicial ? "Editar Talento" : "Novo Talento"}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!nome.trim()) {
              mostrarErro(new Error("Dê um nome pro talento."));
              return;
            }
            if (!camadaId) {
              mostrarErro(new Error("Escolha a camada."));
              return;
            }
            onSalvar({
              camadaId,
              nome: nome.trim(),
              descricao,
              icone: icone.trim() || "fa-circle-nodes",
              custo: Math.max(0, Number(custo) || 0),
              maxRanks: Math.max(1, Math.min(Number(maxRanks) || 1, MAX_RANKS_TETO)),
              nivelMinimo: Math.max(0, Number(nivelMinimo) || 0),
              habilidadeId: habilidadeId || null,
              requisitos,
            });
          }}
        >
          <label>Nome</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Previsão"
            autoFocus
          />

          <label style={{ marginTop: 10 }}>Descrição</label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="+1 nas jogadas de ataque."
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div>
              <label>Camada</label>
              <select value={camadaId} onChange={(e) => setCamadaId(e.target.value)}>
                {camadas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Ícone</label>
              <input
                type="text"
                value={icone}
                onChange={(e) => setIcone(e.target.value)}
                placeholder="fa-eye"
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
            <div>
              <label>Custo por rank</label>
              <input
                type="number"
                min={0}
                value={custo}
                onChange={(e) => setCusto(e.target.value)}
              />
            </div>
            <div>
              <label>Ranks (máx {MAX_RANKS_TETO})</label>
              <input
                type="number"
                min={1}
                max={MAX_RANKS_TETO}
                value={maxRanks}
                onChange={(e) => setMaxRanks(e.target.value)}
              />
            </div>
            <div>
              <label>Nível mínimo</label>
              <input
                type="number"
                min={0}
                value={nivelMinimo}
                onChange={(e) => setNivelMinimo(e.target.value)}
              />
            </div>
          </div>
          <p style={{ fontSize: "0.76rem", color: "var(--text-sec)", marginTop: 4 }}>
            {Number(maxRanks) > 1
              ? "Cada rank extra exige a camada seguinte — é a regra do livro: Forma Dominada (✩) pede o 2º estágio, Avançada (★) pede o 3º."
              : "Ranks = quantas vezes o talento pode ser comprado. Use 3 pra talento de Haki com Forma Dominada e Avançada."}
            {!temRecurso && Number(custo) > 0 && (
              <>
                {" "}
                O custo é <strong>informativo</strong> enquanto a árvore não
                apontar um recurso.
              </>
            )}
          </p>

          <label style={{ marginTop: 10 }}>Habilidade liberada (opcional)</label>
          <select
            value={habilidadeId}
            onChange={(e) => setHabilidadeId(e.target.value)}
          >
            <option value="">Nenhuma — o talento é só descritivo</option>
            {habilidades.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nome}
              </option>
            ))}
          </select>
          <p style={{ fontSize: "0.76rem", color: "var(--text-sec)", marginTop: 4 }}>
            Enquanto o talento estiver travado, os efeitos dessa habilidade não
            entram nos cálculos da ficha.
          </p>

          <label style={{ marginTop: 14 }}>Requisitos</label>
          {candidatos.length === 0 ? (
            <p style={{ fontSize: "0.8rem", color: "var(--text-sec)" }}>
              Nenhum outro talento nesta árvore ainda.
            </p>
          ) : (
            <div className="arvore-req-lista">
              {candidatos.map((c) => {
                const req = requisitos.find((r) => r.noId === c.id);
                return (
                  <div key={c.id} className="arvore-req-linha">
                    <label className="arvore-req-check">
                      <input
                        type="checkbox"
                        checked={!!req}
                        onChange={(e) => toggleReq(c.id, e.target.checked)}
                      />
                      <span>{c.nome}</span>
                    </label>
                    {req && c.maxRanks > 1 && (
                      <select
                        value={req.rank}
                        onChange={(e) => setRankReq(c.id, Number(e.target.value))}
                      >
                        {Array.from({ length: c.maxRanks }, (_, i) => (
                          <option key={i} value={i + 1}>
                            {rotuloRank(i + 1)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="modal-actions">
            {onApagar && (
              <button
                type="button"
                className="modal-btn-cancel"
                style={{ marginRight: "auto", color: "#d33" }}
                onClick={onApagar}
              >
                Apagar
              </button>
            )}
            <button type="button" className="modal-btn-cancel" onClick={onCancelar}>
              Cancelar
            </button>
            <button type="submit" className="modal-btn-save">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
