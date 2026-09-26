"use client";

import {
  useCallback,
  useEffect,
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
import { exigir } from "@/lib/acoes";
import { EstiloPicker } from "./estilo-cor-picker";
import { IconePicker } from "@/components/icone-picker";
import {
  EFEITO_COR_PADRAO,
  corValida,
  estiloAplicado,
  normalizarEfeitoCor,
  type EfeitoCor,
} from "@/lib/estilos-cor";
import {
  CRITERIOS_ARVORE,
  MAX_COLUNAS_RAIA,
  MAX_LINHAS_CAMADA,
  MAX_RANKS_TETO,
  PRESETS_ARVORE,
  PRESET_VAZIO,
  bloqueiosDevolver,
  camadasAbertas,
  celulasDosNos,
  marcaRank,
  estadoNo,
  lerRequisitos,
  noNaCelula,
  normalizarCriterio,
  pontosGastos,
  primeiraLinhaLivre,
  raiaEfetiva,
  rotuloRank,
  type CamadaArvore,
  type CelulaNo,
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
  type NovoNo = { novo: true } & CelulaNo;
  const [modalNo, setModalNo] = useState<NoArvore | NovoNo | null>(null);
  const [noSelecionadoId, setNoSelecionado] = useState<string | null>(null);
  const [arvoreColapsada, setArvoreColapsada] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);
  // Filtro do palco (ramo e camada), preso à árvore em que foi escolhido.
  const [filtro, setFiltro] = useState<{
    arvoreId: string;
    ramoId: string | null;
    camadaId: string | null;
  } | null>(null);
  // Dois modos na mesma aba. JOGAR é o padrão — 90% do uso é gastar ponto, não
  // montar a árvore. MONTAR revela as ferramentas de autoria (criar/editar/
  // apagar/arrastar), que antes ficavam ligadas o tempo todo e afogavam a tela.
  const [montando, setMontando] = useState(false);
  const [modalCopiar, setModalCopiar] = useState(false);
  const [, startTransition] = useTransition();

  type Patch =
    | { kind: "rank"; noId: string; rank: number }
    | { kind: "patchNo"; noId: string; patch: Partial<NoArvore> }
    | { kind: "mover"; noId: string; destino: CelulaNo }
    | { kind: "patchArvore"; arvoreId: string; patch: Partial<Arvore> };

  const [lista, aplicar] = useOptimistic(arvores, (state, p: Patch) => {
    if (p.kind === "patchArvore") {
      return state.map((a) => (a.id === p.arvoreId ? { ...a, ...p.patch } : a));
    }
    if (p.kind === "mover") {
      // Espelho do servidor: célula ocupada = os dois trocam de lugar.
      return state.map((a) => {
        const no = a.nos.find((n) => n.id === p.noId);
        if (!no) return a;
        const origem: CelulaNo = {
          camadaId: no.camadaId,
          ramoId: raiaEfetiva(no.ramoId, a.ramos),
          coluna: no.coluna,
          linha: no.linha,
        };
        const ocupante = noNaCelula(p.destino, a.nos, a.ramos, no.id);
        return {
          ...a,
          nos: a.nos.map((n) =>
            n.id === no.id
              ? { ...n, ...p.destino }
              : ocupante && n.id === ocupante.id
                ? { ...n, ...origem }
                : n,
          ),
        };
      });
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

  // Saldo otimista pro contador e a barra não ficarem velhos até o revalidate.
  const [recursosOt, ajustarRecurso] = useOptimistic(
    recursos,
    (state, p: { id: string; delta: number }) =>
      state.map((r) =>
        r.id === p.id
          ? { ...r, valorAtual: Math.min(r.valorMax, r.valorAtual + p.delta) }
          : r,
      ),
  );
  const recursoCusto = arvore?.recursoCustoId
    ? recursosOt.find((r) => r.id === arvore.recursoCustoId) ?? null
    : null;

  const camadas = useMemo(
    () => (arvore ? [...arvore.camadas].sort((a, b) => a.ordem - b.ordem) : []),
    [arvore],
  );
  const ramos = useMemo(
    () => (arvore ? [...arvore.ramos].sort((a, b) => a.ordem - b.ordem) : []),
    [arvore],
  );

  // Filtro de outra árvore, ou de ramo/camada que sumiu, vale como "todos".
  const doFiltro = filtro && filtro.arvoreId === arvore?.id ? filtro : null;
  const ramoFiltro =
    doFiltro?.ramoId && ramos.some((r) => r.id === doFiltro.ramoId) ? doFiltro.ramoId : null;
  const camadaFiltro =
    doFiltro?.camadaId && camadas.some((c) => c.id === doFiltro.camadaId)
      ? doFiltro.camadaId
      : null;
  function filtrar(mudanca: { ramoId?: string | null; camadaId?: string | null }) {
    if (!arvore) return;
    setNoSelecionado(null);
    setFiltro({ arvoreId: arvore.id, ramoId: ramoFiltro, camadaId: camadaFiltro, ...mudanca });
  }

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

  const disponiveis = useMemo(
    () => ctx.nos.filter((n) => estadoNo(n, camadas, ctx).podeComprar).length,
    [camadas, ctx],
  );
  // Modo de foco: desliga sozinho quando não há nada disponível.
  const [foco, setFoco] = useState(false);
  const focoAtivo = foco && disponiveis > 0;

  /** Aplica o delta do recurso na barra e na sidebar; devolve o desfazer. */
  function moverSaldo(no: NoArvore, sinal: 1 | -1): () => void {
    if (!recursoCusto || no.custo <= 0) return () => {};
    const id = recursoCusto.id;
    const delta = sinal * no.custo;
    ajustarRecurso({ id, delta });
    const avisar = (d: number) =>
      window.dispatchEvent(new CustomEvent("rpgo:patch-recurso", { detail: { [id]: d } }));
    avisar(delta);
    return () => avisar(-delta);
  }

  function comprar(no: NoArvore) {
    if (!arvore) return;
    startTransition(async () => {
      aplicar({ kind: "rank", noId: no.id, rank: no.rankAtual + 1 });
      const desfazer = moverSaldo(no, -1);
      try {
        exigir(await comprarNo(personagemId, arvore.id, no.id));
      } catch (err) {
        desfazer();
        mostrarErro(err);
      }
    });
  }

  function devolver(no: NoArvore) {
    if (!arvore) return;
    startTransition(async () => {
      aplicar({ kind: "rank", noId: no.id, rank: no.rankAtual - 1 });
      const desfazer = moverSaldo(no, 1);
      try {
        exigir(await devolverNo(personagemId, arvore.id, no.id));
      } catch (err) {
        desfazer();
        mostrarErro(err);
      }
    });
  }

  function mover(noId: string, destino: CelulaNo) {
    if (!arvore) return;
    startTransition(async () => {
      aplicar({ kind: "mover", noId, destino });
      try {
        exigir(await moverNo(personagemId, arvore.id, noId, destino));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  async function novoRamo() {
    if (!arvore) return;
    const r = await Swal.fire({
      title: "Novo ramo",
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
        exigir(await criarRamo(personagemId, arvore.id, r.value.trim()));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  async function apagarRamo(ramo: RamoArvore) {
    if (!arvore) return;
    if (
      !(await confirmar(
        "Apagar ramo",
        `Apagar "${ramo.nome}"? Os talentos dele voltam pro primeiro ramo — nada é perdido.`,
      ))
    )
      return;
    startTransition(async () => {
      try {
        exigir(await deletarRamo(personagemId, arvore.id, ramo.id));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function copiar(origem: ArvoreCopiavel) {
    setModalCopiar(false);
    startTransition(async () => {
      try {
        const r = exigir(await duplicarArvore(personagemId, origem.id));
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
        exigir(await deletarArvore(personagemId, arvore.id));
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
        exigir(await deletarCamada(personagemId, arvore.id, camada.id));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  const criterioMeta = CRITERIOS_ARVORE.find((c) => c.slug === ctx.criterio);

  // Tela cheia sai no Esc.
  useEffect(() => {
    if (!telaCheia) return;
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setTelaCheia(false);
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [telaCheia]);

  const noEmEdicao = modalNo && !("novo" in modalNo) ? modalNo : null;

  function criarNoAqui(celula: CelulaNo) {
    if (!arvore) return;
    setModalNo({ novo: true, ...celula });
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
              {/* Progresso primeiro: é o que o jogador quer saber ao abrir. */}
              <span className="arvore-metrica arvore-progresso">
                <strong>{arvore.nos.filter((n) => n.rankAtual > 0).length}</strong>
                {" de "}
                {arvore.nos.length} liberado(s)
              </span>
              {recursoCusto && (
                <span className="arvore-metrica">
                  <i className="fas fa-coins" /> {recursoCusto.nome}:{" "}
                  <strong>{recursoCusto.valorAtual}</strong>/{recursoCusto.valorMax}
                </span>
              )}
              {/* O critério vira ícone com dica — era um texto longo que só
                  repetia o que as travas das camadas já mostram. */}
              <span
                className="arvore-criterio"
                title={`${criterioMeta?.nome}: ${criterioMeta?.dica}${
                  ctx.criterio === "pontos" ? ` (${gastos} gasto(s) aqui)` : ""
                }${ctx.criterio === "nivel" ? ` (nível ${nivel})` : ""}`}
              >
                <i className="fas fa-unlock-keyhole" />
              </span>
              {!recursoCusto && arvore.recursoCustoId && (
                <span className="arvore-metrica arvore-aviso">
                  <i className="fas fa-triangle-exclamation" /> recurso de custo
                  apagado — os custos não descontam mais
                </span>
              )}
              {arvore.nos.length > 0 && disponiveis > 0 && (
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
              )}
            </div>
            <div className="arvore-barra-acoes">
              {!montando ? (
                <button
                  type="button"
                  className="btn-rect outline"
                  onClick={() => setMontando(true)}
                  title="Criar e editar camadas, ramos e talentos"
                >
                  <i className="fas fa-wrench" /> Montar
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-rect outline"
                    onClick={() => {
                      // Com filtro, o talento nasce onde dá pra ver.
                      const celula = {
                        camadaId: camadaFiltro ?? camadas[0]?.id ?? "",
                        ramoId: ramoFiltro ?? ramos[0]?.id ?? null,
                        coluna: 0,
                      };
                      criarNoAqui({
                        ...celula,
                        linha: primeiraLinhaLivre(celula, arvore.nos, ramos),
                      });
                    }}
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
                  <button type="button" className="btn-rect outline" onClick={novoRamo}>
                    + Ramo
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
                  <button
                    type="button"
                    className="btn-rect primary"
                    onClick={() => setMontando(false)}
                  >
                    <i className="fas fa-check" /> Concluir
                  </button>
                </>
              )}
            </div>
          </div>

          {!arvoreColapsada &&
            (ramos.length > 1 || camadas.length > 1 || (montando && ramos.length > 0)) && (
              <div className="arvore-filtros">
                {(ramos.length > 1 || montando) && ramos.length > 0 && (
                  <div className="arvore-filtro" role="group" aria-label="Ramos">
                    {ramos.length > 1 && (
                      <button
                        type="button"
                        className={`arvore-filtro-opcao${ramoFiltro ? "" : " ativo"}`}
                        aria-pressed={!ramoFiltro}
                        onClick={() => filtrar({ ramoId: null })}
                      >
                        Todos os ramos
                      </button>
                    )}
                    {ramos.map((r) => (
                      <span key={r.id} className="arvore-filtro-item">
                        <button
                          type="button"
                          className={`arvore-filtro-opcao${ramoFiltro === r.id ? " ativo" : ""}`}
                          aria-pressed={ramoFiltro === r.id}
                          onClick={() => filtrar({ ramoId: r.id })}
                        >
                          {r.nome}
                        </button>
                        {montando && (
                          <button
                            type="button"
                            className="arvore-filtro-x"
                            title={`Apagar ramo ${r.nome}`}
                            aria-label={`Apagar ramo ${r.nome}`}
                            onClick={() => apagarRamo(r)}
                          >
                            <i className="fas fa-times" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                {camadas.length > 1 && (
                  <div className="arvore-filtro" role="group" aria-label="Camadas">
                    <button
                      type="button"
                      className={`arvore-filtro-opcao${camadaFiltro ? "" : " ativo"}`}
                      aria-pressed={!camadaFiltro}
                      onClick={() => filtrar({ camadaId: null })}
                    >
                      Todas as camadas
                    </button>
                    {camadas.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        className={`arvore-filtro-opcao${camadaFiltro === c.id ? " ativo" : ""}`}
                        aria-pressed={camadaFiltro === c.id}
                        onClick={() => filtrar({ camadaId: c.id })}
                      >
                        {!abertas.has(c.id) && <i className="fas fa-lock" />}
                        {c.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

          {!arvoreColapsada && (
            // O palco leva o painel junto: na tela cheia os dois ocupam a tela.
            <div className={`arvore-palco${telaCheia ? " tela-cheia" : ""}`}>
              <ArvoreCanvas
                arvore={arvore}
                camadas={camadas}
                ramos={ramos}
                ramoFiltro={ramoFiltro}
                camadaFiltro={camadaFiltro}
                abertas={abertas}
                ctx={ctx}
                criterio={ctx.criterio}
                selecionadoId={noSelecionadoId}
                onSelecionar={setNoSelecionado}
                onEditarCamada={(c) => setModalCamada(c)}
                onApagarCamada={apagarCamada}
                onMover={mover}
                onCriarNoAqui={criarNoAqui}
                foco={focoAtivo}
                montando={montando}
                telaCheia={telaCheia}
                onTelaCheia={() => setTelaCheia((v) => !v)}
              />
              {(() => {
                const sel = arvore.nos.find((n) => n.id === noSelecionadoId);
                if (!sel) return null;
                return (
                  <PainelNo
                    no={sel}
                    estado={estadoNo(sel, camadas, ctx)}
                    bloqueiosDevolver={
                      sel.rankAtual > 0 ? bloqueiosDevolver(sel.id, camadas, ctx) : []
                    }
                    camadaNome={camadas.find((c) => c.id === sel.camadaId)?.nome ?? "—"}
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
            </div>
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
                  exigir(await atualizarArvore(personagemId, editandoId, dados));
                } else {
                  const r = exigir(await criarArvore(personagemId, dados));
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
                  exigir(await atualizarCamada(personagemId, arvore.id, editandoId, dados));
                } else {
                  exigir(await criarCamada(personagemId, arvore.id, {
                    ...dados,
                    ordem: camadas.length,
                  }));
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
                  coluna: (modalNo as NovoNo).coluna,
                  linha: (modalNo as NovoNo).linha,
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
                      exigir(await deletarNo(personagemId, arvore.id, alvo.id));
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
                  exigir(await atualizarNo(personagemId, arvore.id, editandoId, dados));
                } else {
                  exigir(await criarNo(personagemId, arvore.id, dados));
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
        <button type="button" className="modal-close" onClick={onCancelar} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
        <h2>Copiar Árvore</h2>
        <p className="campo-dica" style={{ marginBottom: 12 }}>
          O progresso não vem junto: todos os talentos chegam travados.
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

// ─── Canvas: palco navegável (arrastar move, roda ou pinça dá zoom) ────

// Mundo em px no zoom 1. Células largas: as linhas dos requisitos correm pelos
// vãos e precisam de espaço pra não virarem um feixe grudado.
const NO_L = 112; // largura do bloco do nó
const NO_A = 110; // altura: círculo + estrelas + nome em 2 linhas
const PASSO_X = 172; // largura da célula
const PASSO_Y = 164; // altura da célula
const FOLGA_X = PASSO_X - NO_L; // vão entre nós lado a lado
const FOLGA_Y = PASSO_Y - NO_A; // vão entre linhas
const VAO_RAIA = 56; // espaço a mais entre raias
const VAO_CAMADA = 56; // espaço a mais entre camadas
const MARGEM = 32;
const ROTULO_CAMADA = 72; // coluna da esquerda com o nome da camada
const TITULO_RAIAS = 44;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 1.6;
const TRILHO = 10; // distância entre linhas que dividem o mesmo vão
const SEMPRE_VISIVEL = 140; // quanto do mundo fica na tela mesmo arrastando pra longe

type Ponto = [number, number];

type LinhaCanvas = {
  d: string;
  /** req = requisito pendente · req-ativo = cumprido · fio = trilha do que já foi comprado */
  tipo: "req" | "req-ativo" | "fio";
  paiId: string;
  filhoId: string;
};

/** Caixa de um nó no mundo. */
type CaixaNo = {
  cx: number;
  /** Topo do círculo: onde a linha entra. */
  circTopo: number;
  topo: number;
  base: number;
  esq: number;
  dir: number;
};

type RaiaMundo = { id: string | null; nome: string | null; x: number; largura: number; colunas: number };
type FaixaMundo = { camada: CamadaArvore; y: number; altura: number; linhas: number };
type Mundo = {
  largura: number;
  altura: number;
  raias: RaiaMundo[];
  faixas: FaixaMundo[];
  celulas: Map<string, CelulaNo>;
  caixas: Map<string, CaixaNo>;
};

/** Canto de cima à esquerda da célula no mundo. */
function origemCelula(
  c: CelulaNo,
  raias: RaiaMundo[],
  faixas: FaixaMundo[],
): { x: number; y: number } | null {
  const raia = raias.find((r) => r.id === c.ramoId);
  const faixa = faixas.find((f) => f.camada.id === c.camadaId);
  if (!raia || !faixa) return null;
  return { x: raia.x + c.coluna * PASSO_X, y: faixa.y + c.linha * PASSO_Y };
}

/**
 * Tudo no mundo sai das células da grade: colunas por raia (valem pra árvore
 * toda) e linhas por camada. Montando, cada raia ganha uma coluna e cada camada
 * uma linha vazias, pra ter onde criar ou soltar talento. Com filtro, só o ramo
 * e a camada escolhidos entram no mundo; talento de fora não ganha caixa, e a
 * linha que ligaria nele some junto.
 */
function montarMundo(
  nos: NoArvore[],
  todasCamadas: CamadaArvore[],
  ramos: RamoArvore[],
  montando: boolean,
  ramoFiltro: string | null,
  camadaFiltro: string | null,
): Mundo {
  // As células usam todos os ramos: talento sem ramo cai no primeiro deles.
  const celulas = celulasDosNos(nos, ramos);
  const visiveis = ramoFiltro ? ramos.filter((r) => r.id === ramoFiltro) : ramos;
  const colunas: (RamoArvore | null)[] = visiveis.length > 0 ? visiveis : [null];
  const camadas = camadaFiltro ? todasCamadas.filter((c) => c.id === camadaFiltro) : todasCamadas;
  const extra = montando ? 1 : 0;

  let x = MARGEM + ROTULO_CAMADA;
  const raias: RaiaMundo[] = colunas.map((r) => {
    let maior = -1;
    for (const c of celulas.values()) {
      if (c.ramoId === (r?.id ?? null) && (!camadaFiltro || c.camadaId === camadaFiltro)) {
        maior = Math.max(maior, c.coluna);
      }
    }
    const k = Math.max(1, Math.min(MAX_COLUNAS_RAIA, maior + 1 + extra));
    const raia = { id: r?.id ?? null, nome: r?.nome ?? null, x, largura: k * PASSO_X, colunas: k };
    x += raia.largura + VAO_RAIA;
    return raia;
  });

  let y = MARGEM + (ramos.length > 0 ? TITULO_RAIAS : 0);
  const faixas: FaixaMundo[] = camadas.map((camada) => {
    let maior = -1;
    for (const c of celulas.values()) {
      if (c.camadaId === camada.id && (!ramoFiltro || c.ramoId === ramoFiltro)) {
        maior = Math.max(maior, c.linha);
      }
    }
    const n = Math.max(1, Math.min(MAX_LINHAS_CAMADA, maior + 1 + extra));
    const faixa = { camada, y, altura: n * PASSO_Y, linhas: n };
    y += faixa.altura + VAO_CAMADA;
    return faixa;
  });

  const caixas = new Map<string, CaixaNo>();
  for (const [id, c] of celulas) {
    const o = origemCelula(c, raias, faixas);
    if (!o) continue;
    const esq = o.x + FOLGA_X / 2;
    const topo = o.y + FOLGA_Y / 2;
    caixas.set(id, { cx: esq + NO_L / 2, circTopo: topo + 6, topo, base: topo + NO_A, esq, dir: esq + NO_L });
  }

  return {
    largura: x - VAO_RAIA + MARGEM,
    altura: Math.max(y - VAO_CAMADA, MARGEM + TITULO_RAIAS + PASSO_Y) + MARGEM,
    raias,
    faixas,
    celulas,
    caixas,
  };
}

/**
 * Rota de um requisito: sai por baixo do nome do pai, desce até o vão logo
 * acima do filho, anda na horizontal e entra no topo do círculo. A descida
 * reta pela coluna do pai não pode bater em outro nó nem parar em cima de um
 * que não é filho dele (pareceria ligar os dois); nesses casos desce pelo vão
 * entre colunas — vão nunca tem nó, então a linha não atravessa talento.
 */
function rotaPontos(a: CaixaNo, b: CaixaNo, todas: CaixaNo[], filhosDoPai: Set<CaixaNo>): Ponto[] {
  const sx = a.cx;
  const sy = a.base;
  const ex = b.cx;
  // Filho na mesma linha (ou acima): contorna por baixo e entra pela base.
  if (b.topo < a.base - 1) {
    const y = Math.max(a.base, b.base) + FOLGA_Y / 2;
    return [[sx, sy], [sx, y], [ex, y], [ex, b.base]];
  }
  const yAlvo = b.topo - FOLGA_Y / 2;
  const bate = todas.some(
    (c) => c !== a && c !== b && sx > c.esq && sx < c.dir && c.base > sy && c.topo < yAlvo,
  );
  const engana =
    Math.abs(ex - sx) > 0.5 &&
    todas.some(
      (c) =>
        c !== b &&
        !filhosDoPai.has(c) &&
        Math.abs(c.cx - sx) < 0.5 &&
        c.topo > yAlvo &&
        c.topo < b.topo + 1,
    );
  if (!bate && !engana) return [[sx, sy], [sx, yAlvo], [ex, yAlvo], [ex, b.circTopo]];
  const yVao = a.base + FOLGA_Y / 2;
  // Filho na mesma coluna desce pelo lado onde o pai já tem mais filhos: um
  // tronco só, em vez de um de cada lado.
  let aEsquerda = 0;
  let aDireita = 0;
  for (const c of filhosDoPai) {
    if (c.cx < sx - 0.5) aEsquerda++;
    else if (c.cx > sx + 0.5) aDireita++;
  }
  const pelaEsquerda = ex < sx - 0.5 || (ex <= sx + 0.5 && aEsquerda > aDireita);
  const xVao = pelaEsquerda ? a.esq - FOLGA_X / 2 : a.dir + FOLGA_X / 2;
  return [[sx, sy], [sx, yVao], [xVao, yVao], [xVao, yAlvo], [ex, yAlvo], [ex, b.circTopo]];
}

function alinhados(a: Ponto, b: Ponto, c: Ponto): boolean {
  const mesmoX = Math.abs(a[0] - b[0]) < 0.5 && Math.abs(b[0] - c[0]) < 0.5;
  const mesmoY = Math.abs(a[1] - b[1]) < 0.5 && Math.abs(b[1] - c[1]) < 0.5;
  return mesmoX || mesmoY;
}

/** Tira ponto repetido e ponto no meio de uma reta. */
function limparRota(bruto: Ponto[]): Ponto[] {
  const pts: Ponto[] = [];
  for (const p of bruto) {
    const u = pts[pts.length - 1];
    if (u && Math.abs(u[0] - p[0]) < 0.5 && Math.abs(u[1] - p[1]) < 0.5) continue;
    const pu = pts[pts.length - 2];
    if (u && pu && alinhados(pu, u, p)) pts.pop();
    pts.push([p[0], p[1]]);
  }
  return pts;
}

/**
 * Linhas de pais diferentes que dividem o mesmo vão ganham trilhos paralelos,
 * em vez de virar uma só. As do mesmo pai andam juntas: viram um tronco que se
 * divide perto de cada filho. Mexe só nos trechos do meio: a saída do pai e a
 * entrada no filho ficam.
 */
function separarTrilhos(rotas: { pts: Ponto[]; dono: string }[]): Ponto[][] {
  type Trecho = { r: number; i: number; vertical: boolean; de: number; ate: number };
  const grupos = new Map<string, Trecho[]>();
  rotas.forEach(({ pts }, r) => {
    for (let i = 1; i < pts.length - 2; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const vertical = Math.abs(x1 - x2) < 0.5;
      if (!vertical && Math.abs(y1 - y2) >= 0.5) continue;
      const t: Trecho = vertical
        ? { r, i, vertical, de: Math.min(y1, y2), ate: Math.max(y1, y2) }
        : { r, i, vertical, de: Math.min(x1, x2), ate: Math.max(x1, x2) };
      const chave = `${vertical ? "v" : "h"}|${Math.round(vertical ? x1 : y1)}`;
      const lista = grupos.get(chave) ?? [];
      lista.push(t);
      grupos.set(chave, lista);
    }
  });

  const out = rotas.map(({ pts }) => pts.map((p) => [p[0], p[1]] as Ponto));
  for (const lista of grupos.values()) {
    type Bloco = { de: number; ate: number; trechos: Trecho[] };
    const porDono = new Map<string, Bloco>();
    for (const t of lista) {
      const dono = rotas[t.r].dono;
      const b = porDono.get(dono);
      if (b) {
        b.de = Math.min(b.de, t.de);
        b.ate = Math.max(b.ate, t.ate);
        b.trechos.push(t);
      } else {
        porDono.set(dono, { de: t.de, ate: t.ate, trechos: [t] });
      }
    }
    if (porDono.size < 2) continue;
    // Blocos que se sobrepõem vão pra trilhos diferentes (coloração de intervalo).
    const blocos = [...porDono.values()].sort((p, q) => p.de - q.de);
    const fimDoTrilho: number[] = [];
    const trilho = new Map<Bloco, number>();
    for (const b of blocos) {
      let k = fimDoTrilho.findIndex((fim) => fim < b.de - 1);
      if (k < 0) {
        k = fimDoTrilho.length;
        fimDoTrilho.push(b.ate);
      } else {
        fimDoTrilho[k] = b.ate;
      }
      trilho.set(b, k);
    }
    const n = fimDoTrilho.length;
    if (n < 2) continue;
    for (const b of blocos) {
      const desvio = (trilho.get(b)! - (n - 1) / 2) * TRILHO;
      for (const t of b.trechos) {
        const pts = out[t.r];
        const eixo = t.vertical ? 0 : 1;
        pts[t.i][eixo] += desvio;
        pts[t.i + 1][eixo] += desvio;
      }
    }
  }
  return out;
}

/** Traço em ângulo reto com cantos arredondados. */
function caminhoArredondado(pts: Ponto[], raio = 12): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const d1 = Math.hypot(cx - px, cy - py);
    const d2 = Math.hypot(nx - cx, ny - cy);
    if (d1 < 0.5 || d2 < 0.5) continue;
    const r = Math.min(raio, d1 / 2, d2 / 2);
    d += ` L ${cx - ((cx - px) / d1) * r} ${cy - ((cy - py) / d1) * r}`;
    d += ` Q ${cx} ${cy} ${cx + ((nx - cx) / d2) * r} ${cy + ((ny - cy) / d2) * r}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return `${d} L ${lx} ${ly}`;
}

function ArvoreCanvas({
  arvore,
  camadas,
  ramos,
  ramoFiltro,
  camadaFiltro,
  abertas,
  ctx,
  criterio,
  selecionadoId,
  onSelecionar,
  onEditarCamada,
  onApagarCamada,
  onMover,
  onCriarNoAqui,
  foco,
  montando,
  telaCheia,
  onTelaCheia,
}: {
  arvore: Arvore;
  camadas: CamadaArvore[];
  ramos: RamoArvore[];
  ramoFiltro: string | null;
  camadaFiltro: string | null;
  abertas: Set<string>;
  ctx: Parameters<typeof estadoNo>[2];
  criterio: CriterioArvore;
  selecionadoId: string | null;
  onSelecionar: (id: string | null) => void;
  onEditarCamada: (c: CamadaArvore) => void;
  onApagarCamada: (c: CamadaArvore) => void;
  onMover: (noId: string, destino: CelulaNo) => void;
  onCriarNoAqui: (celula: CelulaNo) => void;
  foco: boolean;
  /** Modo autoria: revela criar/editar/apagar e habilita arrastar talento. */
  montando: boolean;
  telaCheia: boolean;
  onTelaCheia: () => void;
}) {
  const palcoRef = useRef<HTMLDivElement>(null);
  const mundoRef = useRef<HTMLDivElement>(null);
  // Vista (translação + zoom) mexida direto no DOM: re-renderizar a árvore a
  // cada movimento do ponteiro pesaria à toa.
  const vista = useRef({ x: 0, y: 0, z: 1 });
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<
    | { tipo: "pan"; x0: number; y0: number; vx: number; vy: number; moveu: boolean }
    | { tipo: "pinca"; d0: number; z0: number; mx: number; my: number; vx: number; vy: number }
    | null
  >(null);
  const enquadrada = useRef<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvoArrasto, setAlvoArrasto] = useState<CelulaNo | null>(null);

  const criterioLimiar = CRITERIOS_ARVORE.find((c) => c.slug === criterio);
  const corFio = corValida(arvore.cor);
  const mundo = useMemo(
    () => montarMundo(arvore.nos, camadas, ramos, montando, ramoFiltro, camadaFiltro),
    [arvore.nos, camadas, ramos, montando, ramoFiltro, camadaFiltro],
  );

  const { linhas, fio } = useMemo(() => {
    const todas = [...mundo.caixas.values()];
    const filhos = new Map<string, Set<CaixaNo>>();
    for (const no of arvore.nos) {
      const b = mundo.caixas.get(no.id);
      if (!b) continue;
      for (const req of lerRequisitos(no.requisitos)) {
        const set = filhos.get(req.noId) ?? new Set<CaixaNo>();
        set.add(b);
        filhos.set(req.noId, set);
      }
    }
    const rotas: { pts: Ponto[]; dono: string; tipo: LinhaCanvas["tipo"]; filhoId: string }[] = [];
    for (const no of arvore.nos) {
      const b = mundo.caixas.get(no.id);
      if (!b) continue;
      for (const req of lerRequisitos(no.requisitos)) {
        const a = mundo.caixas.get(req.noId);
        if (!a) continue;
        const rankPai = arvore.nos.find((n) => n.id === req.noId)?.rankAtual ?? 0;
        rotas.push({
          pts: limparRota(rotaPontos(a, b, todas, filhos.get(req.noId)!)),
          dono: req.noId,
          // Fio = caminho já andado: pai e filho comprados.
          tipo: no.rankAtual > 0 && rankPai > 0 ? "fio" : rankPai >= req.rank ? "req-ativo" : "req",
          filhoId: no.id,
        });
      }
    }
    const separadas = separarTrilhos(rotas);
    const todasLinhas: LinhaCanvas[] = rotas.map((r, i) => ({
      d: caminhoArredondado(separadas[i]),
      tipo: r.tipo,
      paiId: r.dono,
      filhoId: r.filhoId,
    }));
    return {
      linhas: todasLinhas.filter((l) => l.tipo !== "fio"),
      fio: todasLinhas.filter((l) => l.tipo === "fio"),
    };
  }, [mundo, arvore.nos]);

  const aplicar = useCallback(() => {
    const m = mundoRef.current;
    const v = vista.current;
    if (m) m.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
  }, []);

  // Não deixa o mundo sumir da tela: sempre sobra um pedaço dele à vista.
  const limitar = useCallback(() => {
    const palco = palcoRef.current;
    if (!palco) return;
    const v = vista.current;
    const folga = Math.min(SEMPRE_VISIVEL, palco.clientWidth / 2, palco.clientHeight / 2);
    v.x = Math.min(palco.clientWidth - folga, Math.max(folga - mundo.largura * v.z, v.x));
    v.y = Math.min(palco.clientHeight - folga, Math.max(folga - mundo.altura * v.z, v.y));
  }, [mundo]);

  /** Zoom mantendo parado o ponto (px, py) do palco. */
  const zoomEm = useCallback(
    (px: number, py: number, zNovo: number) => {
      const v = vista.current;
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zNovo));
      const wx = (px - v.x) / v.z;
      const wy = (py - v.y) / v.z;
      v.x = px - wx * z;
      v.y = py - wy * z;
      v.z = z;
      limitar();
      aplicar();
    },
    [limitar, aplicar],
  );

  /** "inicio": árvore pequena inteira e centrada; grande, legível a partir do começo. */
  const ajustar = useCallback(
    (modo: "inicio" | "inteira") => {
      const palco = palcoRef.current;
      if (!palco || palco.clientWidth === 0) return;
      const v = vista.current;
      const encaixe = Math.min(palco.clientWidth / mundo.largura, palco.clientHeight / mundo.altura);
      if (modo === "inteira" || encaixe >= 0.8) {
        v.z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(1, encaixe)));
        v.x = (palco.clientWidth - mundo.largura * v.z) / 2;
        v.y = (palco.clientHeight - mundo.altura * v.z) / 2;
      } else {
        v.z = palco.clientWidth < 640 ? 0.7 : 0.85;
        // Coube na largura (um ramo só, por exemplo): centra; senão, começo.
        v.x = Math.max(0, (palco.clientWidth - mundo.largura * v.z) / 2);
        v.y = 0;
      }
      limitar();
      aplicar();
    },
    [mundo, limitar, aplicar],
  );

  // Árvore ou filtro novo: enquadra. Mesma vista com conteúdo mudado: fica onde estava.
  const vistaId = `${arvore.id}|${ramoFiltro ?? ""}|${camadaFiltro ?? ""}`;
  useLayoutEffect(() => {
    if (enquadrada.current === vistaId) {
      limitar();
      aplicar();
      return;
    }
    enquadrada.current = vistaId;
    ajustar("inicio");
  }, [vistaId, ajustar, limitar, aplicar]);

  // Roda = zoom no ponto do cursor. Listener nativo: o do React é passivo e não
  // deixa cancelar a rolagem da página.
  useEffect(() => {
    const palco = palcoRef.current;
    if (!palco) return;
    function roda(e: WheelEvent) {
      e.preventDefault();
      const r = palco!.getBoundingClientRect();
      // Pinça no trackpad chega como roda com ctrl, em passos bem menores.
      const passo = e.ctrlKey ? 0.01 : 0.0015;
      zoomEm(e.clientX - r.left, e.clientY - r.top, vista.current.z * Math.exp(-e.deltaY * passo));
    }
    palco.addEventListener("wheel", roda, { passive: false });
    return () => palco.removeEventListener("wheel", roda);
  }, [zoomEm]);

  // Palco mudou de tamanho (tela cheia, janela): só reenquadra os limites.
  useEffect(() => {
    const palco = palcoRef.current;
    if (!palco) return;
    const ro = new ResizeObserver(() => {
      limitar();
      aplicar();
    });
    ro.observe(palco);
    return () => ro.disconnect();
  }, [limitar, aplicar]);

  // ─ Arrastar o palco (1 ponteiro) e pinça (2 dedos) ─
  // A captura do ponteiro só entra depois que ele anda: um clique parado ainda
  // chega no talento ou no "+".
  function apertou(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = vista.current;
    if (ponteiros.current.size === 1) {
      gesto.current = { tipo: "pan", x0: e.clientX, y0: e.clientY, vx: v.x, vy: v.y, moveu: false };
    } else if (ponteiros.current.size === 2) {
      const [a, b] = [...ponteiros.current.values()];
      gesto.current = {
        tipo: "pinca",
        d0: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        z0: v.z,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
        vx: v.x,
        vy: v.y,
      };
      for (const id of ponteiros.current.keys()) {
        if (!e.currentTarget.hasPointerCapture(id)) e.currentTarget.setPointerCapture(id);
      }
    }
  }

  function moveu(e: React.PointerEvent<HTMLDivElement>) {
    if (!ponteiros.current.has(e.pointerId)) return;
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesto.current;
    const v = vista.current;
    const palco = e.currentTarget;
    if (g?.tipo === "pan") {
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.moveu) {
        if (Math.hypot(dx, dy) < 5) return;
        g.moveu = true;
        palco.setPointerCapture(e.pointerId);
        palco.classList.add("movendo");
      }
      v.x = g.vx + dx;
      v.y = g.vy + dy;
      limitar();
      aplicar();
    } else if (g?.tipo === "pinca") {
      const [a, b] = [...ponteiros.current.values()];
      const r = palco.getBoundingClientRect();
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, g.z0 * (Math.hypot(b.x - a.x, b.y - a.y) / g.d0)));
      // O ponto do mundo que estava entre os dedos continua entre os dedos.
      const wx = (g.mx - r.left - g.vx) / g.z0;
      const wy = (g.my - r.top - g.vy) / g.z0;
      v.z = z;
      v.x = (a.x + b.x) / 2 - r.left - wx * z;
      v.y = (a.y + b.y) / 2 - r.top - wy * z;
      limitar();
      aplicar();
    }
  }

  function soltou(e: React.PointerEvent<HTMLDivElement>) {
    if (!ponteiros.current.delete(e.pointerId)) return;
    if (ponteiros.current.size === 0) {
      const g = gesto.current;
      gesto.current = null;
      e.currentTarget.classList.remove("movendo");
      // Toque parado no vazio fecha o talento aberto.
      const alvo = e.target as Element;
      if (
        e.type === "pointerup" &&
        g?.tipo === "pan" &&
        !g.moveu &&
        !alvo.closest(".arvore-no, button, a, input, select, textarea")
      ) {
        onSelecionar(null);
      }
      return;
    }
    // Saiu um dedo da pinça: o que ficou continua arrastando.
    const [p] = [...ponteiros.current.values()];
    const v = vista.current;
    gesto.current = { tipo: "pan", x0: p.x, y0: p.y, vx: v.x, vy: v.y, moveu: true };
  }

  function zoomCentro(fator: number) {
    const palco = palcoRef.current;
    if (palco) zoomEm(palco.clientWidth / 2, palco.clientHeight / 2, vista.current.z * fator);
  }

  /** Foco pelo teclado num talento fora da tela: traz ele pro meio. */
  function mostrarNo(id: string) {
    const palco = palcoRef.current;
    const c = mundo.caixas.get(id);
    if (!palco || !c) return;
    const v = vista.current;
    const cy = (c.topo + c.base) / 2;
    const sx = c.cx * v.z + v.x;
    const sy = cy * v.z + v.y;
    if (sx > 40 && sx < palco.clientWidth - 40 && sy > 40 && sy < palco.clientHeight - 40) return;
    v.x = palco.clientWidth / 2 - c.cx * v.z;
    v.y = palco.clientHeight / 2 - cy * v.z;
    limitar();
    aplicar();
  }

  // ─ Arrastar talento (modo montar) ─
  function celulaNoPonto(clientX: number, clientY: number): CelulaNo | null {
    const palco = palcoRef.current;
    if (!palco) return null;
    const r = palco.getBoundingClientRect();
    const v = vista.current;
    const wx = (clientX - r.left - v.x) / v.z;
    const wy = (clientY - r.top - v.y) / v.z;
    const raia = mundo.raias.find(
      (l) => wx >= l.x - VAO_RAIA / 2 && wx < l.x + l.largura + VAO_RAIA / 2,
    );
    const faixa = mundo.faixas.find(
      (f) => wy >= f.y - VAO_CAMADA / 2 && wy < f.y + f.altura + VAO_CAMADA / 2,
    );
    if (!raia || !faixa) return null;
    return {
      camadaId: faixa.camada.id,
      ramoId: raia.id,
      coluna: Math.max(0, Math.min(raia.colunas - 1, Math.floor((wx - raia.x) / PASSO_X))),
      linha: Math.max(0, Math.min(faixa.linhas - 1, Math.floor((wy - faixa.y) / PASSO_Y))),
    };
  }

  /** Movimento < 4px conta como clique e abre o painel. */
  function iniciarArrasto(e: React.PointerEvent, no: NoArvore) {
    if (e.button !== 0) return;
    e.stopPropagation(); // o palco não anda junto
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moveuNo = false;
    let alvo: CelulaNo | null = null;

    function mover(ev: PointerEvent) {
      if (!moveuNo && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      if (!moveuNo) {
        moveuNo = true;
        setArrastando(no.id);
      }
      const z = vista.current.z;
      el.style.transform = `translate(${(ev.clientX - x0) / z}px, ${(ev.clientY - y0) / z}px)`;
      alvo = celulaNoPonto(ev.clientX, ev.clientY);
      setAlvoArrasto(alvo);
    }

    function soltar(ev: PointerEvent) {
      el.releasePointerCapture(ev.pointerId);
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerup", soltar);
      el.removeEventListener("pointercancel", soltar);
      el.style.transform = "";
      setAlvoArrasto(null);
      if (!moveuNo) {
        onSelecionar(no.id);
        return;
      }
      setArrastando(null);
      const atual = mundo.celulas.get(no.id);
      if (
        ev.type === "pointerup" &&
        alvo &&
        atual &&
        (alvo.camadaId !== atual.camadaId ||
          alvo.ramoId !== atual.ramoId ||
          alvo.coluna !== atual.coluna ||
          alvo.linha !== atual.linha)
      ) {
        onMover(no.id, alvo);
      }
    }

    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", soltar);
    el.addEventListener("pointercancel", soltar);
  }

  const ligada = (l: LinhaCanvas) =>
    selecionadoId !== null && (l.paiId === selecionadoId || l.filhoId === selecionadoId);
  const ocupadas = new Set(
    [...mundo.celulas.values()].map((c) => `${c.camadaId}|${c.ramoId ?? ""}|${c.coluna}|${c.linha}`),
  );
  const origemAlvo = alvoArrasto ? origemCelula(alvoArrasto, mundo.raias, mundo.faixas) : null;

  return (
    <div
      ref={palcoRef}
      className={`arvore-canvas${foco ? " foco" : ""}${montando ? " montando" : ""}`}
      onPointerDown={apertou}
      onPointerMove={moveu}
      onPointerUp={soltou}
      onPointerCancel={soltou}
      style={
        {
          ...(corFio ? { "--arvore-fio-cor": corFio } : {}),
          ...(arvore.fundoUrl
            ? { backgroundImage: `url("${arvore.fundoUrl.replace(/"/g, "%22")}")` }
            : {}),
        } as React.CSSProperties
      }
    >
      <div className="arvore-canvas-veu" />

      <div
        ref={mundoRef}
        className="arvore-mundo"
        style={{ width: mundo.largura, height: mundo.altura }}
      >
        {mundo.faixas.map((f) => (
          <div
            key={`faixa-${f.camada.id}`}
            className={`arvore-mundo-faixa${abertas.has(f.camada.id) ? "" : " fechada"}`}
            style={{
              left: MARGEM,
              top: f.y - VAO_CAMADA / 2 + 6,
              width: mundo.largura - 2 * MARGEM,
              height: f.altura + VAO_CAMADA - 12,
            }}
          />
        ))}
        {mundo.raias.slice(1).map((r) => (
          <div
            key={`divisa-${r.id}`}
            className="arvore-mundo-divisa"
            style={{ left: r.x - VAO_RAIA / 2, top: MARGEM, height: mundo.altura - 2 * MARGEM }}
          />
        ))}
        {ramos.length > 0 &&
          mundo.raias.map((r) => (
            <div
              key={`titulo-${r.id}`}
              className="arvore-mundo-raia"
              style={{ left: r.x, top: MARGEM, width: r.largura, height: TITULO_RAIAS }}
            >
              {r.nome}
            </div>
          ))}
        {mundo.faixas.map((f) => {
          const aberta = abertas.has(f.camada.id);
          return (
            <div
              key={`rotulo-${f.camada.id}`}
              className={`arvore-mundo-camada${aberta ? "" : " fechada"}`}
              style={{ left: MARGEM, top: f.y, width: ROTULO_CAMADA - 12, height: f.altura }}
            >
              <span className="arvore-mundo-camada-nome">{f.camada.nome}</span>
              <span className="arvore-mundo-camada-meta">
                <i className={`fas ${aberta ? "fa-lock-open" : "fa-lock"}`} />
                {criterio !== "manual" && (
                  <em title={criterioLimiar?.rotuloLimiar}>{f.camada.limiar}</em>
                )}
              </span>
              {montando && (
                <span className="arvore-mundo-camada-acoes">
                  <button
                    type="button"
                    className="recurso-icon-btn"
                    title="Editar camada"
                    onClick={() => onEditarCamada(f.camada)}
                  >
                    <i className="fas fa-edit" />
                  </button>
                  <button
                    type="button"
                    className="recurso-icon-btn"
                    title="Apagar camada"
                    onClick={() => onApagarCamada(f.camada)}
                  >
                    <i className="fas fa-trash" />
                  </button>
                </span>
              )}
            </div>
          );
        })}

        <svg
          className={`arvore-conectores${selecionadoId ? " com-selecao" : ""}`}
          width={mundo.largura}
          height={mundo.altura}
          aria-hidden="true"
        >
          {/* As linhas do talento selecionado vêm por último, por cima das outras. */}
          {[false, true].flatMap((daVez) => [
            ...linhas
              .filter((l) => ligada(l) === daVez)
              .map((l, i) => (
                <path
                  key={`l${daVez}${i}`}
                  d={l.d}
                  className={`arvore-conector${l.tipo === "req-ativo" ? " ativo" : ""}${
                    daVez ? " ligada" : ""
                  }`}
                />
              )),
            ...fio
              .filter((l) => ligada(l) === daVez)
              .map((l, i) => (
                <g key={`f${daVez}${i}`} className={`arvore-fio${daVez ? " ligada" : ""}`}>
                  <path d={l.d} className="arvore-fio-halo" />
                  <path d={l.d} className="arvore-fio-traco" />
                  <path d={l.d} className="arvore-fio-brilho" pathLength={100} />
                </g>
              )),
          ])}
        </svg>

        {montando &&
          mundo.faixas.flatMap((f) =>
            mundo.raias.flatMap((r) =>
              Array.from({ length: r.colunas * f.linhas }, (_, idx) => {
                const celula: CelulaNo = {
                  camadaId: f.camada.id,
                  ramoId: r.id,
                  coluna: idx % r.colunas,
                  linha: Math.floor(idx / r.colunas),
                };
                const chave = `${celula.camadaId}|${celula.ramoId ?? ""}|${celula.coluna}|${celula.linha}`;
                if (ocupadas.has(chave)) return null;
                return (
                  <button
                    key={`vazia-${chave}`}
                    type="button"
                    className="arvore-celula-vazia"
                    style={{
                      left: r.x + celula.coluna * PASSO_X + (PASSO_X - 56) / 2,
                      top: f.y + celula.linha * PASSO_Y + FOLGA_Y / 2 + 6,
                    }}
                    onClick={() => onCriarNoAqui(celula)}
                    title="Criar talento aqui"
                    aria-label="Criar talento aqui"
                  >
                    <i className="fas fa-plus" />
                  </button>
                );
              }),
            ),
          )}
        {origemAlvo && (
          <span
            className="arvore-celula-alvo"
            style={{
              left: origemAlvo.x + 6,
              top: origemAlvo.y + 6,
              width: PASSO_X - 12,
              height: PASSO_Y - 12,
            }}
          />
        )}

        {arvore.nos.map((no) => {
          const caixa = mundo.caixas.get(no.id);
          if (!caixa) return null;
          return (
            <NoCard
              key={no.id}
              no={no}
              caixa={caixa}
              estado={estadoNo(no, camadas, ctx)}
              arrastando={arrastando === no.id}
              selecionado={selecionadoId === no.id}
              onPointerDown={montando ? (e) => iniciarArrasto(e, no) : undefined}
              onSelecionar={() => onSelecionar(no.id)}
              onFoco={() => mostrarNo(no.id)}
              montando={montando}
            />
          );
        })}
      </div>

      <div className="arvore-controles" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" title="Aproximar" aria-label="Aproximar" onClick={() => zoomCentro(1.25)}>
          <i className="fas fa-plus" />
        </button>
        <button type="button" title="Afastar" aria-label="Afastar" onClick={() => zoomCentro(0.8)}>
          <i className="fas fa-minus" />
        </button>
        <button
          type="button"
          title="Ver a árvore inteira"
          aria-label="Ver a árvore inteira"
          onClick={() => ajustar("inteira")}
        >
          <i className="fas fa-expand" />
        </button>
        <button
          type="button"
          title={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
          aria-label={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
          aria-pressed={telaCheia}
          onClick={onTelaCheia}
        >
          <i className={`fas ${telaCheia ? "fa-minimize" : "fa-maximize"}`} />
        </button>
      </div>
    </div>
  );
}

function NoCard({
  no,
  caixa,
  estado,
  arrastando,
  selecionado,
  onPointerDown,
  onSelecionar,
  onFoco,
  montando,
}: {
  no: NoArvore;
  caixa: CaixaNo;
  estado: ReturnType<typeof estadoNo>;
  arrastando: boolean;
  selecionado: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onSelecionar: () => void;
  onFoco: () => void;
  montando: boolean;
}) {
  const maxRanks = Math.max(1, no.maxRanks);
  const classe = estado.comprado
    ? "comprado"
    : estado.podeComprar
    ? "disponivel"
    : "travado";

  return (
    <article
      className={`arvore-no ${classe}${arrastando ? " arrastando" : ""}${
        selecionado ? " selecionado" : ""
      }${montando ? " montando" : ""}`}
      style={{ left: caixa.esq, top: caixa.topo, width: NO_L, height: NO_A }}
      onPointerDown={onPointerDown}
      onClick={montando ? undefined : onSelecionar}
      onFocus={(e) => {
        if (e.currentTarget.matches(":focus-visible")) onFoco();
      }}
      role={montando ? undefined : "button"}
      tabIndex={montando ? undefined : 0}
      onKeyDown={
        montando
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelecionar();
              }
            }
      }
      title={
        estado.bloqueios.length > 0 ? estado.bloqueios.join(" · ") : no.descricao
      }
    >
      <span className="arvore-no-circulo">
        <i className={`fas ${no.icone}`} />
        {no.custo > 0 && (
          <span className="arvore-no-selo" title={`Custa ${no.custo} por rank`}>
            {no.custo}
          </span>
        )}
        {!estado.comprado && estado.bloqueios.length > 0 && (
          <span className="arvore-no-cadeado">
            <i className="fas fa-lock" />
          </span>
        )}
      </span>
      <span className="arvore-no-estrelas" aria-label={`Rank ${estado.rank} de ${maxRanks}`}>
        {Array.from({ length: maxRanks }, (_, i) => (
          <span
            key={i}
            className={`arvore-estrela ${i < estado.rank ? "cheia" : ""}`}
            title={rotuloRank(i + 1)}
          >
            ★
          </span>
        ))}
      </span>
      <span className="arvore-no-nome">{no.nome}</span>
    </article>
  );
}

function PainelNo({
  no,
  estado,
  bloqueiosDevolver,
  camadaNome,
  habilidadeNome,
  onFechar,
  onComprar,
  onDevolver,
  onEditar,
}: {
  no: NoArvore;
  estado: ReturnType<typeof estadoNo>;
  bloqueiosDevolver: string[];
  camadaNome: string;
  habilidadeNome: string | null;
  onFechar: () => void;
  onComprar: () => void;
  onDevolver: () => void;
  onEditar: () => void;
}) {
  // O painel nasce no fim da aba: sem isso, clicar num talento no topo da
  // árvore respondia fora da tela — a ação parecia não ter efeito.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [no.id]);

  return (
    <div className="arvore-painel" ref={ref}>
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

      {bloqueiosDevolver.length > 0 && (
        <p className="campo-dica">
          <i className="fas fa-circle-info" /> Não dá pra devolver agora:{" "}
          {bloqueiosDevolver.join("; ")}.
        </p>
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
          <button
            type="button"
            className="btn-rect outline"
            onClick={onDevolver}
            disabled={bloqueiosDevolver.length > 0}
            title={
              bloqueiosDevolver.length > 0
                ? `Devolva antes: ${bloqueiosDevolver.join("; ")}`
                : undefined
            }
          >
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
  // Molde só vale na criação. Nasce "Em branco": o do Haki cria 38 talentos, não
  // pode vir marcado sem o usuário escolher.
  const [preset, setPreset] = useState(PRESET_VAZIO);

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

  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onCancelar} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
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
            placeholder="Ex: Haki"
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
                      if (!nome.trim() && pr.slug !== PRESET_VAZIO) setNome(pr.nome);
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

          <label style={{ marginTop: 10 }}>Recurso que paga os talentos</label>
          <select
            value={recursoCustoId}
            onChange={(e) => setRecursoCustoId(e.target.value)}
          >
            <option value="">Nenhum</option>
            {recursos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome} ({r.valorAtual}/{r.valorMax})
              </option>
            ))}
          </select>

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
        <button type="button" className="modal-close" onClick={onCancelar} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
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
              Árvore sempre aberta — a camada não tem trava.
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
  // Célula: só na criação. Editando, o servidor mantém a célula (ou acha uma
  // livre se a camada mudar).
  ramoId?: string | null;
  coluna?: number;
  linha?: number;
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
  posicaoInicial: CelulaNo | null;
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
        <button type="button" className="modal-close" onClick={onCancelar} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
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
              ...(posicaoInicial && !inicial
                ? {
                    ramoId: posicaoInicial.ramoId,
                    coluna: posicaoInicial.coluna,
                    linha: posicaoInicial.linha,
                  }
                : {}),
            });
          }}
        >
          <div className="no-previa">
            <span className="no-previa-rotulo">Prévia</span>
            <div className="no-previa-palco">
              <article className="arvore-no disponivel no-previa-no">
                <span className="arvore-no-circulo">
                  <i className={`fas ${icone}`} />
                  {Number(custo) > 0 && (
                    <span className="arvore-no-selo">{Number(custo)}</span>
                  )}
                </span>
                <span className="arvore-no-estrelas">
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
                </span>
                <span className="arvore-no-nome">{nome.trim() || "Nome do talento"}</span>
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
          {(Number(maxRanks) > 1 || (!temRecurso && Number(custo) > 0)) && (
            <p className="campo-dica">
              {Number(maxRanks) > 1 && "Cada rank extra exige a camada seguinte."}
              {!temRecurso && Number(custo) > 0 && (
                <>
                  {" "}
                  O custo só desconta se a árvore tiver um recurso.
                </>
              )}
            </p>
          )}

          <h3 className="modal-secao">
            <i className="fas fa-link" /> Ligações
          </h3>
          <label>Habilidade liberada (opcional)</label>
          <select
            value={habilidadeId}
            onChange={(e) => setHabilidadeId(e.target.value)}
          >
            <option value="">Nenhuma</option>
            {habilidades.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nome}
              </option>
            ))}
          </select>

          <label style={{ marginTop: 12 }}>Requisitos</label>
          {candidatos.length === 0 ? (
            <p className="req-vazio">
              <i className="fas fa-circle-info" /> Nenhum outro talento nesta
              árvore.
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
