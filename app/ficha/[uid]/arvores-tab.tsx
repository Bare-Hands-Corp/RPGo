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
  criarRamo,
  deletarRamo,
  moverNo,
  duplicarArvore,
} from "./actions";
import { EstiloPicker } from "./estilo-cor-picker";
import { IconePicker } from "@/components/icone-picker";
import {
  EFEITO_COR_PADRAO,
  estiloAplicado,
  normalizarEfeitoCor,
  type EfeitoCor,
} from "@/lib/estilos-cor";
import {
  CRITERIOS_ARVORE,
  MAX_RANKS_TETO,
  PRESETS_ARVORE,
  camadasAbertas,
  clampOffsetY,
  evitarSobreposicao,
  marcaRank,
  estadoNo,
  lerRequisitos,
  normalizarCriterio,
  pontosGastos,
  rotuloRank,
  type CamadaArvore,
  type CriterioArvore,
  type NoArvore,
  type RamoArvore,
  type RequisitoNo,
} from "@/lib/arvore";

export type Arvore = {
  id: string;
  nome: string;
  icone: string;
  cor: string | null;
  cor2: string | null;
  efeito: string;
  ordem: number;
  criterio: string;
  recursoCustoId: string | null;
  fundoUrl: string | null;
  camadas: CamadaArvore[];
  ramos: RamoArvore[];
  nos: NoArvore[];
};

/** Árvore de qualquer personagem do mesmo dono, oferecida pra cópia. */
export type ArvoreCopiavel = {
  id: string;
  nome: string;
  icone: string;
  personagemNome: string;
  doProprio: boolean;
  talentos: number;
  camadas: number;
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
  arvoresCopiaveis: ArvoreCopiavel[];
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
  arvoresCopiaveis,
  recursos,
  habilidades,
}: Props) {
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [modalArvore, setModalArvore] = useState<Arvore | "nova" | null>(null);
  const [modalCamada, setModalCamada] = useState<CamadaArvore | "nova" | null>(null);
  type NovoNo = { novo: true; camadaId: string; ramoId: string | null; offsetY: number };
  const [modalNo, setModalNo] = useState<NoArvore | NovoNo | null>(null);
  const [noSelecionadoId, setNoSelecionado] = useState<string | null>(null);
  // Colapso é estado de visualização, por camada. `arvoreColapsada` esconde o
  // canvas inteiro — útil quando o jogador tem várias árvores e quer só o
  // resumo de cada uma.
  const [camadasColapsadas, setCamadasColapsadas] = useState<Set<string>>(
    () => new Set(),
  );
  const [arvoreColapsada, setArvoreColapsada] = useState(false);
  const [modalCopiar, setModalCopiar] = useState(false);
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
  const ramos = useMemo(
    () => (arvore ? [...arvore.ramos].sort((a, b) => a.ordem - b.ordem) : []),
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

  // Quantos talentos dá pra comprar agora. Mesma `estadoNo` que pinta o card e
  // que o server revalida — o contador nunca discorda do botão.
  const disponiveis = useMemo(
    () => ctx.nos.filter((n) => estadoNo(n, camadas, ctx).podeComprar).length,
    [camadas, ctx],
  );
  // Modo de foco: esmaece o que não dá pra comprar. Em árvore grande o jogador
  // caçava visualmente. Cai sozinho quando não sobra nada disponível, senão a
  // tela ficaria inteira apagada sem nada em destaque.
  const [foco, setFoco] = useState(false);
  const focoAtivo = foco && disponiveis > 0;

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

  function mover(noId: string, bruto: { ramoId: string | null; offsetY: number }) {
    if (!arvore) return;
    const no = arvore.nos.find((n) => n.id === noId);
    const destino = {
      ramoId: bruto.ramoId,
      offsetY: no
        ? evitarSobreposicao(
            noId,
            no.camadaId,
            bruto.ramoId,
            bruto.offsetY,
            arvore.nos,
            ramos[0]?.id ?? null,
          )
        : bruto.offsetY,
    };
    startTransition(async () => {
      aplicar({ kind: "patchNo", noId, patch: destino });
      try {
        await moverNo(personagemId, arvore.id, noId, destino);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  async function novaRaia() {
    if (!arvore) return;
    const r = await Swal.fire({
      title: "Nova raia",
      input: "text",
      inputPlaceholder: "Ex: Ofensivo",
      showCancelButton: true,
      confirmButtonText: "Criar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!r.isConfirmed || !r.value?.trim()) return;
    startTransition(async () => {
      try {
        await criarRamo(personagemId, arvore.id, r.value.trim());
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  async function apagarRaia(ramo: RamoArvore) {
    if (!arvore) return;
    if (
      !(await confirmar(
        "Apagar raia",
        `Apagar "${ramo.nome}"? Os talentos dela voltam pra primeira raia — nada é perdido.`,
      ))
    )
      return;
    startTransition(async () => {
      try {
        await deletarRamo(personagemId, arvore.id, ramo.id);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function copiar(origem: ArvoreCopiavel) {
    setModalCopiar(false);
    startTransition(async () => {
      try {
        const r = await duplicarArvore(personagemId, origem.id);
        setSelecionadaId(r.id);
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

  function alternarCamada(id: string) {
    setCamadasColapsadas((curr) => {
      const proximo = new Set(curr);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  const todasColapsadas =
    camadas.length > 0 && camadas.every((c) => camadasColapsadas.has(c.id));

  function alternarTodas() {
    setCamadasColapsadas(
      todasColapsadas ? new Set() : new Set(camadas.map((c) => c.id)),
    );
  }
  const noEmEdicao = modalNo && !("novo" in modalNo) ? modalNo : null;

  /** Clique em área vazia da faixa: já nasce na camada, raia e altura do clique. */
  function criarNoAqui(camadaId: string, ramoId: string | null, offsetY: number) {
    if (!arvore) return;
    setModalNo({
      novo: true,
      camadaId,
      ramoId,
      offsetY: evitarSobreposicao(
        "",
        camadaId,
        ramoId,
        offsetY,
        arvore.nos,
        ramos[0]?.id ?? null,
      ),
    });
  }

  return (
    <div className="arvores-wrap">
      <div className="arvores-topo">
        <h1>Árvores</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {arvoresCopiaveis.length > 0 && (
            <button
              type="button"
              className="btn-rect outline"
              onClick={() => setModalCopiar(true)}
              title="Copiar a estrutura de uma árvore já montada"
            >
              <i className="fas fa-copy" /> Copiar
            </button>
          )}
          <button
            type="button"
            className="btn-rect primary"
            onClick={() => setModalArvore("nova")}
          >
            + Nova Árvore
          </button>
        </div>
      </div>

      {ordenadas.length === 0 && (
        <div className="placeholder-tab">
          <i className="fas fa-sitemap" />
          <p>
            Nenhuma árvore ainda. Monte a Árvore de Talentos do Haki, os níveis do
            teu Estilo de Combate, ou qualquer trilha própria.
          </p>
          {arvoresCopiaveis.length > 0 && (
            <button
              type="button"
              className="btn-rect outline"
              onClick={() => setModalCopiar(true)}
            >
              <i className="fas fa-copy" /> Copiar de outro personagem
            </button>
          )}
        </div>
      )}

      {ordenadas.length > 0 && (
        <div className="arvore-seletor">
          {ordenadas.map((a) => {
            const fx = estiloAplicado(
              { cor: a.cor, cor2: a.cor2, efeito: normalizarEfeitoCor(a.efeito) },
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
              <button
                type="button"
                className="arvore-colapsar-arvore"
                onClick={() => setArvoreColapsada((v) => !v)}
                title={arvoreColapsada ? "Expandir árvore" : "Recolher árvore"}
                aria-expanded={!arvoreColapsada}
              >
                <i
                  className={`fas fa-chevron-${arvoreColapsada ? "right" : "down"}`}
                />
              </button>
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
              {arvore.nos.length > 0 &&
                (disponiveis > 0 ? (
                  <button
                    type="button"
                    className={`arvore-metrica arvore-disponiveis ${focoAtivo ? "ativo" : ""}`}
                    onClick={() => setFoco((v) => !v)}
                    aria-pressed={focoAtivo}
                    title={
                      focoAtivo
                        ? "Mostrar a árvore inteira"
                        : "Destacar só o que dá pra comprar agora"
                    }
                  >
                    <i className="fas fa-circle-check" /> <strong>{disponiveis}</strong>{" "}
                    pra comprar
                  </button>
                ) : (
                  <span className="arvore-metrica arvore-disponiveis vazio">
                    <i className="fas fa-circle-check" /> nada pra comprar agora
                  </span>
                ))}
            </div>
            <div className="arvore-barra-acoes">
              <button
                type="button"
                className="btn-rect outline"
                onClick={() =>
                  criarNoAqui(camadas[0]?.id ?? "", ramos[0]?.id ?? null, 50)
                }
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
              <button type="button" className="btn-rect outline" onClick={novaRaia}>
                + Raia
              </button>
              <button
                type="button"
                className="btn-rect outline"
                onClick={alternarTodas}
                title={
                  todasColapsadas
                    ? "Expandir todas as camadas"
                    : "Recolher todas as camadas"
                }
              >
                <i
                  className={`fas fa-${todasColapsadas ? "expand" : "compress"}`}
                />{" "}
                {todasColapsadas ? "Expandir" : "Recolher"}
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

          {ramos.length > 0 && (
            <div className="arvore-raias-chips">
              {ramos.map((r) => (
                <span key={r.id} className="tag">
                  {r.nome}
                  <button
                    type="button"
                    className="arvore-raia-x"
                    title="Apagar raia"
                    onClick={() => apagarRaia(r)}
                  >
                    <i className="fas fa-times" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {!arvoreColapsada && (
          <ArvoreCanvas
            arvore={arvore}
            camadas={camadas}
            ramos={ramos}
            abertas={abertas}
            ctx={ctx}
            criterio={ctx.criterio}
            selecionadoId={noSelecionadoId}
            onSelecionar={setNoSelecionado}
            onEditarCamada={(c) => setModalCamada(c)}
            onApagarCamada={apagarCamada}
            onMover={mover}
            onCriarNoAqui={criarNoAqui}
            colapsadas={camadasColapsadas}
            onAlternarCamada={alternarCamada}
            foco={focoAtivo}
          />
          )}

          {arvoreColapsada && (
            <button
              type="button"
              className="arvore-resumo"
              onClick={() => setArvoreColapsada(false)}
            >
              <i className={`fas ${arvore.icone}`} />
              <span>
                <strong>{arvore.nos.filter((n) => n.rankAtual > 0).length}</strong>{" "}
                de {arvore.nos.length} talento(s) liberado(s) ·{" "}
                {camadas.length} camada(s)
                {disponiveis > 0 && (
                  <em className="arvore-resumo-disp">
                    {" · "}
                    {disponiveis} pra comprar
                  </em>
                )}
              </span>
              <i className="fas fa-chevron-down" />
            </button>
          )}

          {(() => {
            if (arvoreColapsada) return null;
            const sel = arvore.nos.find((n) => n.id === noSelecionadoId);
            if (!sel) return null;
            return (
              <PainelNo
                no={sel}
                estado={estadoNo(sel, camadas, ctx)}
                camadaNome={
                  camadas.find((c) => c.id === sel.camadaId)?.nome ?? "—"
                }
                habilidadeNome={
                  habilidades.find((h) => h.id === sel.habilidadeId)?.nome ?? null
                }
                onFechar={() => setNoSelecionado(null)}
                onComprar={() => comprar(sel)}
                onDevolver={() => devolver(sel)}
                onEditar={() => setModalNo(sel)}
              />
            );
          })()}
        </>
      )}

      {modalCopiar && (
        <CopiarModal
          opcoes={arvoresCopiaveis}
          onCancelar={() => setModalCopiar(false)}
          onCopiar={copiar}
        />
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
          inicial={noEmEdicao}
          posicaoInicial={
            noEmEdicao
              ? null
              : {
                  camadaId: (modalNo as NovoNo).camadaId,
                  ramoId: (modalNo as NovoNo).ramoId,
                  offsetY: (modalNo as NovoNo).offsetY,
                }
          }
          camadas={camadas}
          nos={arvore.nos}
          habilidades={habilidades}
          temRecurso={!!recursoCusto}
          onCancelar={() => setModalNo(null)}
          onApagar={
            !noEmEdicao
              ? undefined
              : async () => {
                  const alvo = noEmEdicao;
                  if (!(await confirmar("Apagar talento", `Apagar "${alvo.nome}"?`)))
                    return;
                  setModalNo(null);
                  setNoSelecionado(null);
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
            const editandoId = noEmEdicao?.id ?? null;
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

/**
 * Escolha da árvore a copiar. Copia a ESTRUTURA (camadas, raias, talentos,
 * requisitos); o progresso não vem junto.
 */
function CopiarModal({
  opcoes,
  onCancelar,
  onCopiar,
}: {
  opcoes: ArvoreCopiavel[];
  onCancelar: () => void;
  onCopiar: (a: ArvoreCopiavel) => void;
}) {
  const [busca, setBusca] = useState("");
  const q = busca.trim().toLowerCase();
  const filtradas = q
    ? opcoes.filter(
        (o) =>
          o.nome.toLowerCase().includes(q) ||
          o.personagemNome.toLowerCase().includes(q),
      )
    : opcoes;

  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2>Copiar Árvore</h2>
        <p className="campo-dica" style={{ marginBottom: 12 }}>
          Vem a estrutura inteira — camadas, raias, talentos e requisitos. O{" "}
          <strong>progresso não vem junto</strong>: todos os talentos chegam
          travados.
        </p>

        {opcoes.length > 6 && (
          <input
            type="text"
            className="req-busca"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por árvore ou personagem…"
          />
        )}

        <div className="req-lista">
          {filtradas.map((o) => (
            <div key={o.id} className="req-item">
              <button
                type="button"
                className="req-toggle"
                onClick={() => onCopiar(o)}
              >
                <i className={`fas ${o.icone} req-icone`} />
                <span className="req-nome">
                  {o.nome}
                  <small className="copiar-origem">
                    {o.doProprio ? "desta ficha" : o.personagemNome} ·{" "}
                    {o.talentos} talento(s), {o.camadas} camada(s)
                  </small>
                </span>
                <i className="fas fa-arrow-right req-icone" />
              </button>
            </div>
          ))}
          {filtradas.length === 0 && <p className="req-vazio">Nada encontrado.</p>}
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-btn-cancel" onClick={onCancelar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Canvas: faixas contínuas, raias e conectores ───────────
//
// Layout: coluna-trilho à esquerda com o nome da camada em pé, e à direita as
// faixas (uma por camada) divididas em raias nomeadas. Dentro da faixa o nó fica
// em `offsetY` (0–100 % da altura) — é esse escalonamento que dá o desenho de
// árvore em vez de grade. Arrastar o nó grava raia + offsetY; clicar sem
// arrastar abre o painel de detalhe (o card no canvas é compacto de propósito).

const ALTURA_FAIXA = 250;

function ArvoreCanvas({
  arvore,
  camadas,
  ramos,
  abertas,
  ctx,
  criterio,
  selecionadoId,
  onSelecionar,
  onEditarCamada,
  onApagarCamada,
  onMover,
  onCriarNoAqui,
  colapsadas,
  onAlternarCamada,
  foco,
}: {
  arvore: Arvore;
  camadas: CamadaArvore[];
  ramos: RamoArvore[];
  abertas: Set<string>;
  ctx: Parameters<typeof estadoNo>[2];
  criterio: CriterioArvore;
  selecionadoId: string | null;
  onSelecionar: (id: string | null) => void;
  onEditarCamada: (c: CamadaArvore) => void;
  onApagarCamada: (c: CamadaArvore) => void;
  onMover: (noId: string, destino: { ramoId: string | null; offsetY: number }) => void;
  onCriarNoAqui: (camadaId: string, ramoId: string | null, offsetY: number) => void;
  colapsadas: Set<string>;
  onAlternarCamada: (id: string) => void;
  /** Esmaece o que não dá pra comprar agora. */
  foco: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nosRef = useRef(new Map<string, HTMLElement>());
  const [linhas, setLinhas] = useState<{ d: string; ativa: boolean }[]>([]);
  const [tamanho, setTamanho] = useState({ w: 0, h: 0 });
  const [arrastando, setArrastando] = useState<string | null>(null);
  // Raia sob o cursor durante o arrasto — realimenta o destaque visual.
  const [raiaAlvo, setRaiaAlvo] = useState<string | null>(null);

  const criterioLimiar = CRITERIOS_ARVORE.find((c) => c.slug === criterio);
  // Raia única implícita quando a árvore não tem nenhuma.
  const colunas: (RamoArvore | null)[] = ramos.length > 0 ? ramos : [null];

  // Conectores são medidos do DOM: as raias refluem com a viewport e a posição
  // vertical vem de %, então não dá pra derivar. O ResizeObserver cobre resize,
  // troca de aba (display:none → visível) e mudança na quantidade de nós.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function medir() {
      const cont = containerRef.current;
      if (!cont) return;
      const base = cont.getBoundingClientRect();
      if (base.width === 0) return; // aba escondida — remede quando aparecer

      const novas: { d: string; ativa: boolean }[] = [];
      for (const no of arvore.nos) {
        const filho = nosRef.current.get(no.id);
        // Nó de camada recolhida não está no DOM — pula a curva inteira.
        if (!filho || !filho.isConnected) continue;
        const rf = filho.getBoundingClientRect();
        for (const req of lerRequisitos(no.requisitos)) {
          const pai = nosRef.current.get(req.noId);
          if (!pai || !pai.isConnected) continue;
          const rp = pai.getBoundingClientRect();
          const paiNo = arvore.nos.find((n) => n.id === req.noId);

          const x1 = rp.left - base.left + rp.width / 2;
          const y1 = rp.top - base.top + rp.height / 2;
          const x2 = rf.left - base.left + rf.width / 2;
          const y2 = rf.top - base.top + rf.height / 2;
          // Curva em S: sai e entra na vertical, como a árvore do livro.
          const dy = Math.max(40, Math.abs(y2 - y1) * 0.55);
          novas.push({
            d: `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`,
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
  }, [arvore.nos, camadas, ramos, colapsadas]);

  /**
   * Arrasto: converte a posição do ponteiro na faixa em `offsetY` (%) e acha a
   * raia pela coluna sob o cursor. Pointer capture mantém o movimento vivo mesmo
   * quando o cursor sai do card. Movimento curto (< 4 px) conta como clique e
   * abre o painel em vez de reposicionar.
   */
  function iniciarArrasto(
    e: React.PointerEvent,
    no: NoArvore,
    faixaEl: HTMLElement | null,
  ) {
    if (e.button !== 0 || !faixaEl) return;
    const card = e.currentTarget as HTMLElement;
    e.preventDefault();
    card.setPointerCapture(e.pointerId);

    const inicioX = e.clientX;
    const inicioY = e.clientY;
    let moveu = false;
    let pendenteY = no.offsetY;
    let pendenteRamo = no.ramoId;

    function mover(ev: PointerEvent) {
      if (
        !moveu &&
        Math.hypot(ev.clientX - inicioX, ev.clientY - inicioY) < 4
      ) {
        return;
      }
      if (!moveu) {
        moveu = true;
        setArrastando(no.id);
      }
      const r = faixaEl!.getBoundingClientRect();
      pendenteY = clampOffsetY(((ev.clientY - r.top) / r.height) * 100);
      const sob = Array.from(
        faixaEl!.querySelectorAll<HTMLElement>("[data-raia]"),
      ).find((c) => {
        const rc = c.getBoundingClientRect();
        return ev.clientX >= rc.left && ev.clientX <= rc.right;
      });
      pendenteRamo = sob?.dataset.raia || null;
      setRaiaAlvo(pendenteRamo);
      card.style.top = `${pendenteY}%`;
    }

    function soltar(ev: PointerEvent) {
      card.releasePointerCapture(ev.pointerId);
      card.removeEventListener("pointermove", mover);
      card.removeEventListener("pointerup", soltar);
      card.removeEventListener("pointercancel", soltar);
      // Repõe o valor do modelo em vez de limpar: apagar o inline style
      // deixaria o nó sem `top` até um re-render que pode não vir (no clique
      // simples nada muda, então o React não mexe nesse atributo).
      card.style.top = `${moveu ? pendenteY : no.offsetY}%`;
      setRaiaAlvo(null);
      if (!moveu) {
        onSelecionar(no.id);
        return;
      }
      setArrastando(null);
      if (pendenteY !== no.offsetY || pendenteRamo !== no.ramoId) {
        onMover(no.id, { ramoId: pendenteRamo, offsetY: pendenteY });
      }
    }

    card.addEventListener("pointermove", mover);
    card.addEventListener("pointerup", soltar);
    card.addEventListener("pointercancel", soltar);
  }

  return (
    <div
      className={`arvore-canvas${foco ? " foco" : ""}`}
      ref={containerRef}
      style={
        arvore.fundoUrl
          ? { backgroundImage: `url("${arvore.fundoUrl.replace(/"/g, "%22")}")` }
          : undefined
      }
    >
      <div className="arvore-canvas-veu" />

      <svg
        className="arvore-conectores"
        width={tamanho.w}
        height={tamanho.h}
        aria-hidden="true"
      >
        {linhas.map((l, i) => (
          <path key={i} d={l.d} className={`arvore-conector ${l.ativa ? "ativo" : ""}`} />
        ))}
      </svg>

      {ramos.length > 0 && (
        <div className="arvore-raias-head">
          <span className="arvore-trilho-vazio" />
          <div
            className="arvore-raias-cols"
            style={{ gridTemplateColumns: `repeat(${colunas.length}, 1fr)` }}
          >
            {ramos.map((r) => (
              <span key={r.id} className="arvore-raia-nome">
                {r.nome}
              </span>
            ))}
          </div>
        </div>
      )}

      {camadas.map((camada) => (
        <FaixaCamada
          key={camada.id}
          camada={camada}
          aberta={abertas.has(camada.id)}
          colunas={colunas}
          nos={arvore.nos.filter((n) => n.camadaId === camada.id)}
          colapsada={colapsadas.has(camada.id)}
          onAlternar={() => onAlternarCamada(camada.id)}
          camadas={camadas}
          ctx={ctx}
          criterio={criterio}
          rotuloLimiar={criterioLimiar?.rotuloLimiar}
          arrastando={arrastando}
          raiaAlvo={raiaAlvo}
          selecionadoId={selecionadoId}
          registrar={(id, el) => {
            if (el) nosRef.current.set(id, el);
            else nosRef.current.delete(id);
          }}
          onEditarCamada={onEditarCamada}
          onApagarCamada={onApagarCamada}
          onArrastar={iniciarArrasto}
          onCriarNoAqui={onCriarNoAqui}
        />
      ))}
    </div>
  );
}

function FaixaCamada({
  camada,
  aberta,
  colapsada,
  onAlternar,
  colunas,
  nos,
  camadas,
  ctx,
  criterio,
  rotuloLimiar,
  arrastando,
  raiaAlvo,
  selecionadoId,
  registrar,
  onEditarCamada,
  onApagarCamada,
  onArrastar,
  onCriarNoAqui,
}: {
  camada: CamadaArvore;
  aberta: boolean;
  colapsada: boolean;
  onAlternar: () => void;
  colunas: (RamoArvore | null)[];
  nos: NoArvore[];
  camadas: CamadaArvore[];
  ctx: Parameters<typeof estadoNo>[2];
  criterio: CriterioArvore;
  rotuloLimiar?: string;
  arrastando: string | null;
  raiaAlvo: string | null;
  selecionadoId: string | null;
  registrar: (id: string, el: HTMLElement | null) => void;
  onEditarCamada: (c: CamadaArvore) => void;
  onApagarCamada: (c: CamadaArvore) => void;
  onArrastar: (e: React.PointerEvent, no: NoArvore, faixa: HTMLElement | null) => void;
  onCriarNoAqui: (camadaId: string, ramoId: string | null, offsetY: number) => void;
}) {
  const faixaRef = useRef<HTMLDivElement>(null);
  const raiaPadrao = colunas[0]?.id ?? null;

  return (
    <div className={`arvore-faixa-linha ${aberta ? "" : "fechada"}`}>
      <div className="arvore-trilho">
        <button
          type="button"
          className="arvore-trilho-toggle"
          onClick={onAlternar}
          title={colapsada ? "Expandir camada" : "Recolher camada"}
          aria-expanded={!colapsada}
        >
          <i className={`fas fa-chevron-${colapsada ? "right" : "down"}`} />
        </button>
        <span className="arvore-trilho-nome">{camada.nome}</span>
        <span className="arvore-trilho-meta">
          <i className={`fas ${aberta ? "fa-lock-open" : "fa-lock"}`} />
          {criterio !== "manual" && <em title={rotuloLimiar}>{camada.limiar}</em>}
        </span>
        <span className="arvore-trilho-acoes">
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
      </div>

      {colapsada ? (
        <button
          type="button"
          className="arvore-faixa-tira"
          onClick={onAlternar}
          title="Expandir camada"
        >
          {nos.length === 0
            ? "sem talentos"
            : `${nos.filter((n) => n.rankAtual > 0).length} de ${nos.length} liberado(s)`}
          {/* Camada recolhida esconde o card: sem esta marca o jogador não tem
              como saber que o que dá pra comprar está justamente aqui dentro. */}
          {(() => {
            const disp = nos.filter((n) => estadoNo(n, camadas, ctx).podeComprar).length;
            return disp > 0 ? (
              <em className="arvore-tira-disp">
                <i className="fas fa-circle-check" /> {disp} pra comprar
              </em>
            ) : null;
          })()}
          <i className="fas fa-chevron-down" />
        </button>
      ) : (
      <div
        className="arvore-faixa"
        ref={faixaRef}
        style={{
          gridTemplateColumns: `repeat(${colunas.length}, 1fr)`,
          minHeight: ALTURA_FAIXA,
        }}
      >
        {colunas.map((col, i) => {
          // Sem raias, uma coluna só recebe tudo. Com raias, nó sem `ramoId`
          // (ou apontando pra raia apagada) cai na primeira.
          const daColuna =
            colunas.length === 1 && !col
              ? nos
              : nos.filter((n) => {
                  const alvo = colunas.some((c) => c?.id === n.ramoId)
                    ? n.ramoId
                    : raiaPadrao;
                  return alvo === col?.id;
                });
          return (
            <div
              key={col?.id ?? `raia-${i}`}
              className={`arvore-raia${
                arrastando && raiaAlvo === (col?.id ?? null) ? " alvo" : ""
              }`}
              data-raia={col?.id ?? ""}
              // Clique em área vazia cria o talento ali mesmo — evita "cria e
              // depois procura onde caiu". Só clique direto na raia conta.
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                const r = e.currentTarget.getBoundingClientRect();
                onCriarNoAqui(
                  camada.id,
                  col?.id ?? null,
                  clampOffsetY(((e.clientY - r.top) / r.height) * 100),
                );
              }}
              title="Clique pra criar um talento aqui"
            >
              {daColuna.length === 0 && (
                <span className="arvore-slot-vazio">
                  <i className="fas fa-plus" />
                  <em>clique pra criar</em>
                </span>
              )}
              {daColuna.map((no) => (
                <NoCard
                  key={no.id}
                  no={no}
                  estado={estadoNo(no, camadas, ctx)}
                  arrastando={arrastando === no.id}
                  selecionado={selecionadoId === no.id}
                  registrar={(el) => registrar(no.id, el)}
                  onPointerDown={(e) => onArrastar(e, no, faixaRef.current)}
                />
              ))}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

/**
 * Card compacto do canvas: selo de custo, nome e as estrelas de rank. Detalhe,
 * bloqueios e ações vivem no painel — no canvas o nó precisa ser pequeno pra
 * caber muita coisa e não brigar com os conectores.
 */
function NoCard({
  no,
  estado,
  arrastando,
  selecionado,
  registrar,
  onPointerDown,
}: {
  no: NoArvore;
  estado: ReturnType<typeof estadoNo>;
  arrastando: boolean;
  selecionado: boolean;
  registrar: (el: HTMLElement | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const maxRanks = Math.max(1, no.maxRanks);
  const classe = estado.comprado
    ? "comprado"
    : estado.podeComprar
    ? "disponivel"
    : "travado";

  return (
    <article
      ref={registrar}
      className={`arvore-no ${classe}${arrastando ? " arrastando" : ""}${
        selecionado ? " selecionado" : ""
      }`}
      style={{ top: `${clampOffsetY(no.offsetY)}%` }}
      onPointerDown={onPointerDown}
      title={
        estado.bloqueios.length > 0 ? estado.bloqueios.join(" · ") : no.descricao
      }
    >
      {no.custo > 0 && <span className="arvore-no-selo">{no.custo}</span>}

      <div className="arvore-no-linha">
        <i className={`fas ${no.icone} arvore-no-icone`} />
        <span className="arvore-no-nome">{no.nome}</span>
      </div>

      <div className="arvore-no-estrelas">
        {Array.from({ length: maxRanks }, (_, i) => (
          <span
            key={i}
            className={`arvore-estrela ${i < estado.rank ? "cheia" : ""}`}
            title={rotuloRank(i + 1)}
          >
            ★
          </span>
        ))}
        {!estado.comprado && estado.bloqueios.length > 0 && (
          <i className="fas fa-lock arvore-no-cadeado" />
        )}
      </div>
    </article>
  );
}

/** Detalhe + ações do talento selecionado, abaixo do canvas. */
function PainelNo({
  no,
  estado,
  camadaNome,
  habilidadeNome,
  onFechar,
  onComprar,
  onDevolver,
  onEditar,
}: {
  no: NoArvore;
  estado: ReturnType<typeof estadoNo>;
  camadaNome: string;
  habilidadeNome: string | null;
  onFechar: () => void;
  onComprar: () => void;
  onDevolver: () => void;
  onEditar: () => void;
}) {
  return (
    <div className="arvore-painel">
      <div className="arvore-painel-topo">
        <span className="arvore-painel-titulo">
          <i className={`fas ${no.icone}`} /> {no.nome}
        </span>
        <span className="arvore-painel-camada">{camadaNome}</span>
        <button
          type="button"
          className="tags-editor-fechar"
          onClick={onFechar}
          aria-label="Fechar"
        >
          <i className="fas fa-times" />
        </button>
      </div>

      {no.descricao && <p className="arvore-painel-desc">{no.descricao}</p>}

      <div className="arvore-no-meta">
        <span className="tag">
          {rotuloRank(Math.max(1, estado.rank))} · {estado.rank}/{Math.max(1, no.maxRanks)}
        </span>
        {no.custo > 0 && <span className="tag tag-custo">{no.custo} por rank</span>}
        {no.nivelMinimo > 0 && <span className="tag">Nv. {no.nivelMinimo}</span>}
        {habilidadeNome && (
          <span className="tag" title="Talento travado bloqueia os efeitos dela">
            <i className="fas fa-link" /> {habilidadeNome}
          </span>
        )}
      </div>

      {estado.bloqueios.length > 0 && (
        <ul className="arvore-no-bloqueios">
          {estado.bloqueios.map((b, i) => (
            <li key={i}>
              <i className="fas fa-lock" /> {b}
            </li>
          ))}
        </ul>
      )}

      <div className="arvore-painel-acoes">
        {estado.proximoRank !== null && (
          <button
            type="button"
            className="btn-rect primary"
            disabled={!estado.podeComprar}
            onClick={onComprar}
          >
            {estado.rank === 0 ? "Liberar" : `Evoluir → ${rotuloRank(estado.proximoRank)}`}
          </button>
        )}
        {estado.proximoRank === null && (
          <span className="arvore-no-maximo">No máximo</span>
        )}
        {estado.rank > 0 && (
          <button type="button" className="btn-rect outline" onClick={onDevolver}>
            <i className="fas fa-rotate-left" /> Devolver
          </button>
        )}
        <button
          type="button"
          className="btn-rect outline"
          style={{ marginLeft: "auto" }}
          onClick={onEditar}
        >
          <i className="fas fa-edit" /> Editar
        </button>
      </div>
    </div>
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
  fundoUrl: string | null;
  preset: string;
  cor2: string | null;
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
  const [cor2, setCor2] = useState(inicial?.cor2 ?? "");
  const [efeito, setEfeito] = useState<EfeitoCor>(
    normalizarEfeitoCor(inicial?.efeito) ?? EFEITO_COR_PADRAO,
  );
  const [criterio, setCriterio] = useState<CriterioArvore>(
    normalizarCriterio(inicial?.criterio),
  );
  const [recursoCustoId, setRecursoCustoId] = useState(inicial?.recursoCustoId ?? "");
  const [fundoUrl, setFundoUrl] = useState(inicial?.fundoUrl ?? "");
  // Molde só vale na criação — editar não remonta camadas já existentes.
  const [preset, setPreset] = useState(PRESETS_ARVORE[0].slug);

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
      cor2: cor2.trim() || null,
      efeito,
      criterio,
      recursoCustoId: recursoCustoId || null,
      fundoUrl: fundoUrl.trim() || null,
      preset,
    });
  }

  const meta = CRITERIOS_ARVORE.find((c) => c.slug === criterio);

  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2>{inicial ? "Editar Árvore" : "Nova Árvore"}</h2>
        <form onSubmit={submit}>
          <h3 className="modal-secao" style={{ marginTop: 0 }}>
            <i className="fas fa-id-card" /> Identidade
          </h3>
          <label>Nome</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Haki da Observação"
            autoFocus
          />

          <label style={{ marginTop: 10 }}>Ícone</label>
          <IconePicker valor={icone} onChange={setIcone} />

          {!inicial && (
            <>
              <label style={{ marginTop: 12 }}>Começar de um molde</label>
              <div className="arvore-presets">
                {PRESETS_ARVORE.map((pr) => (
                  <button
                    type="button"
                    key={pr.slug}
                    className={`arvore-preset ${preset === pr.slug ? "ativo" : ""}`}
                    onClick={() => {
                      setPreset(pr.slug);
                      setCriterio(pr.criterio);
                      setIcone(pr.icone);
                    }}
                  >
                    <i className={`fas ${pr.icone}`} />
                    <strong>{pr.nome}</strong>
                    <span>{pr.dica}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <h3 className="modal-secao">
            <i className="fas fa-unlock-keyhole" /> Liberação
          </h3>
          <label>Como as camadas destravam</label>
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
          {meta && <p className="campo-dica">{meta.dica}</p>}

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
          <p className="campo-dica">
            Pontos de Ambição não têm campo próprio na ficha — crie um Recurso
            &quot;PA&quot; na sidebar e aponte aqui pra debitar de verdade.
          </p>

          <h3 className="modal-secao">
            <i className="fas fa-palette" /> Aparência
          </h3>
          <label>Arte de fundo (URL)</label>
          <input
            type="url"
            value={fundoUrl}
            onChange={(e) => setFundoUrl(e.target.value)}
            placeholder="https://... (opcional)"
          />
          <p className="campo-dica">
            Só http(s). Um véu escuro é aplicado por cima pra manter os cards
            legíveis.
          </p>

          <label style={{ marginTop: 10 }}>Cor e brilho</label>
          <EstiloPicker
            cor={cor}
            cor2={cor2}
            efeito={efeito}
            onChange={(patch) => {
              if (patch.cor !== undefined) setCor(patch.cor);
              if (patch.cor2 !== undefined) setCor2(patch.cor2);
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
              <p className="campo-dica">{meta?.dica}</p>
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
  ramoId: string | null;
  offsetY: number;
};

function NoModal({
  inicial,
  posicaoInicial,
  camadas,
  nos,
  habilidades,
  temRecurso,
  onCancelar,
  onSalvar,
  onApagar,
}: {
  inicial: NoArvore | null;
  /** Posição vinda do clique no canvas, quando o talento é novo. */
  posicaoInicial: { camadaId: string; ramoId: string | null; offsetY: number } | null;
  camadas: CamadaArvore[];
  nos: NoArvore[];
  habilidades: HabilidadeRef[];
  temRecurso: boolean;
  onCancelar: () => void;
  onSalvar: (d: NoFormDados) => void;
  onApagar?: () => void;
}) {
  const [camadaId, setCamadaId] = useState(
    inicial?.camadaId ?? posicaoInicial?.camadaId ?? camadas[0]?.id ?? "",
  );
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

  const [buscaReq, setBuscaReq] = useState("");

  // Candidatos a requisito: qualquer outro nó da árvore.
  const candidatos = nos.filter((n) => n.id !== inicial?.id);
  const candidatosFiltrados = buscaReq.trim()
    ? candidatos.filter((c) =>
        c.nome.toLowerCase().includes(buscaReq.trim().toLowerCase()),
      )
    : candidatos;

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
              icone: icone || "fa-circle-nodes",
              custo: Math.max(0, Number(custo) || 0),
              maxRanks: Math.max(1, Math.min(Number(maxRanks) || 1, MAX_RANKS_TETO)),
              nivelMinimo: Math.max(0, Number(nivelMinimo) || 0),
              habilidadeId: habilidadeId || null,
              requisitos,
              ramoId: inicial?.ramoId ?? posicaoInicial?.ramoId ?? null,
              offsetY: inicial?.offsetY ?? posicaoInicial?.offsetY ?? 50,
            });
          }}
        >
          {/* Prévia: o card exatamente como vai aparecer no canvas. */}
          <div className="no-previa">
            <span className="no-previa-rotulo">Prévia</span>
            <div className="no-previa-palco">
              <article className="arvore-no disponivel no-previa-card">
                {Number(custo) > 0 && (
                  <span className="arvore-no-selo">{Number(custo)}</span>
                )}
                <div className="arvore-no-linha">
                  <i className={`fas ${icone} arvore-no-icone`} />
                  <span className="arvore-no-nome">
                    {nome.trim() || "Nome do talento"}
                  </span>
                </div>
                <div className="arvore-no-estrelas">
                  {Array.from(
                    {
                      length: Math.max(
                        1,
                        Math.min(Number(maxRanks) || 1, MAX_RANKS_TETO),
                      ),
                    },
                    (_, i) => (
                      <span key={i} className="arvore-estrela">
                        ★
                      </span>
                    ),
                  )}
                </div>
              </article>
            </div>
          </div>

          <h3 className="modal-secao">
            <i className="fas fa-id-card" /> Identidade
          </h3>

          <label>Nome</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Previsão"
            autoFocus
          />

          <label style={{ marginTop: 10 }}>Ícone</label>
          <IconePicker valor={icone} onChange={setIcone} />

          <label style={{ marginTop: 10 }}>Descrição</label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="+1 nas jogadas de ataque."
          />

          <h3 className="modal-secao">
            <i className="fas fa-layer-group" /> Posição
          </h3>
          <label>Camada</label>
          <select value={camadaId} onChange={(e) => setCamadaId(e.target.value)}>
            {camadas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <p className="campo-dica">
            A raia e a altura vêm de onde tu clicou no canvas — dá pra
            reposicionar arrastando o nó depois.
          </p>

          <h3 className="modal-secao">
            <i className="fas fa-arrow-up-right-dots" /> Progressão
          </h3>
          <div className="campo-trio">
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
              <label>Ranks</label>
              <div className="rank-escolha">
                {Array.from({ length: MAX_RANKS_TETO }, (_, i) => i + 1).map((n) => (
                  <button
                    type="button"
                    key={n}
                    className={`rank-escolha-btn ${
                      Number(maxRanks) === n ? "ativo" : ""
                    }`}
                    onClick={() => setMaxRanks(String(n))}
                    title={rotuloRank(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
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
          <p className="campo-dica">
            {Number(maxRanks) > 1
              ? "Cada rank extra exige a camada seguinte — regra do livro: Forma Dominada (✩) pede o 2º estágio, Avançada (★) pede o 3º."
              : "Ranks = quantas vezes o talento pode ser comprado. Use 3 pra talento de Haki com Forma Dominada e Avançada."}
            {!temRecurso && Number(custo) > 0 && (
              <>
                {" "}
                O custo é <strong>informativo</strong> enquanto a árvore não
                apontar um recurso.
              </>
            )}
          </p>

          <h3 className="modal-secao">
            <i className="fas fa-link" /> Ligações
          </h3>
          <label>Habilidade liberada (opcional)</label>
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
          <p className="campo-dica">
            Enquanto o talento estiver travado, os efeitos dessa habilidade não
            entram nos cálculos da ficha.
          </p>

          <label style={{ marginTop: 12 }}>Requisitos</label>
          <p className="campo-dica">
            O talento só libera depois que os marcados estiverem no rank pedido.
            É o que desenha as linhas da árvore.
          </p>
          {candidatos.length === 0 ? (
            <p className="req-vazio">
              <i className="fas fa-circle-info" /> Nenhum outro talento nesta
              árvore ainda — crie os pré-requisitos primeiro.
            </p>
          ) : (
            <>
              {candidatos.length > 6 && (
                <input
                  type="text"
                  className="req-busca"
                  value={buscaReq}
                  onChange={(e) => setBuscaReq(e.target.value)}
                  placeholder="Filtrar talentos…"
                />
              )}
              <div className="req-lista">
                {candidatosFiltrados.map((c) => {
                  const req = requisitos.find((r) => r.noId === c.id);
                  const camadaDele = camadas.find((k) => k.id === c.camadaId);
                  return (
                    <div key={c.id} className={`req-item ${req ? "ativo" : ""}`}>
                      <button
                        type="button"
                        className="req-toggle"
                        onClick={() => toggleReq(c.id, !req)}
                        aria-pressed={!!req}
                      >
                        <span className="req-check">
                          {req && <i className="fas fa-check" />}
                        </span>
                        <i className={`fas ${c.icone} req-icone`} />
                        <span className="req-nome">{c.nome}</span>
                        {camadaDele && (
                          <span className="req-camada">{camadaDele.nome}</span>
                        )}
                      </button>

                      {req && c.maxRanks > 1 && (
                        <div className="req-ranks">
                          {Array.from({ length: c.maxRanks }, (_, i) => i + 1).map(
                            (n) => (
                              <button
                                type="button"
                                key={n}
                                className={`req-rank ${req.rank === n ? "ativo" : ""}`}
                                onClick={() => setRankReq(c.id, n)}
                                title={`Exige no mínimo: ${rotuloRank(n)}`}
                              >
                                {marcaRank(n) || "Base"}
                              </button>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {candidatosFiltrados.length === 0 && (
                  <p className="req-vazio">Nada com esse nome.</p>
                )}
              </div>
            </>
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
