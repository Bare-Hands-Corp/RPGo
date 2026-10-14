"use client";

// Histórico das sessões da mesa: um resumo por sessão e, dentro dele, as
// estatísticas de cada combate. Aparece na aba Sessão quando não há combate
// rodando; o combate que acabou de terminar vem aberto no topo. Dá pra apagar
// um combate, uma sessão, vários combates marcados ou o histórico inteiro.

import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import {
  ROTULO_RESULTADO,
  formatarDuracao,
  formatarNumero,
  semNumeracao,
  type CombateHistorico,
  type EstatisticasCombate,
  type ResultadoCombate,
  type SessaoHistorico,
} from "@/lib/estatisticas-combate";
import { apagarCombatesDoHistorico, carregarHistorico, limparHistorico } from "./actions";
import { EstatisticasView, type Serie } from "./estatisticas-view";

const ICONE_RESULTADO: Record<ResultadoCombate, string> = {
  vitoria: "fa-trophy",
  derrota: "fa-skull",
  encerrado: "fa-flag-checkered",
};

function dataHora(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}, ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

const plural = (n: number, um: string, varios: string) => `${formatarNumero(n)} ${n === 1 ? um : varios}`;

// "Goblin ×3, Orc": contra quem foi o combate, pra reconhecer de relance.
function inimigosDe(e: EstatisticasCombate) {
  const grupos = new Map<string, number>();
  for (const l of e.linhas) {
    if (l.lado !== "inimigos") continue;
    const nome = semNumeracao(l.nome);
    grupos.set(nome, (grupos.get(nome) ?? 0) + l.copias);
  }
  const nomes = [...grupos].map(([nome, n]) => (n > 1 ? `${nome} ×${n}` : nome));
  return nomes.length > 3 ? `${nomes.slice(0, 3).join(", ")} +${nomes.length - 3}` : nomes.join(", ");
}

function seriePorRodada(e: EstatisticasCombate): Serie {
  return {
    por: "rodada",
    pontos: e.porRodada.map((r) => ({
      chave: String(r.rodada),
      eixo: `R${r.rodada}`,
      titulo: `rodada ${r.rodada}`,
      dano: { jogadores: r.danoJogadores, inimigos: r.danoInimigos },
      cura: { jogadores: r.curaJogadores, inimigos: r.curaInimigos },
    })),
  };
}

function seriePorCombate(combates: { c: CombateHistorico; n: number }[]): Serie {
  return {
    por: "combate",
    pontos: combates.flatMap(({ c, n }) =>
      c.estatisticas
        ? [
            {
              chave: c.id,
              eixo: `C${n}`,
              titulo: `combate ${n}`,
              dano: { jogadores: c.estatisticas.jogadores.danoCausado, inimigos: c.estatisticas.inimigos.danoCausado },
              cura: { jogadores: c.estatisticas.jogadores.cura, inimigos: c.estatisticas.inimigos.cura },
            },
          ]
        : [],
    ),
  };
}

function Kpi({ rotulo, valor, icone }: { rotulo: string; valor: string; icone: string }) {
  return (
    <div className="est-kpi">
      <span>
        <i className={`fas ${icone}`} /> {rotulo}
      </span>
      <strong>{valor}</strong>
    </div>
  );
}

// O que os botões de apagar precisam, do cartão até cada combate.
type Controle = {
  ocupado: boolean;
  selecionando: boolean;
  marcados: Set<string>;
  alternar: (id: string) => void;
  apagar: (ids: string[], titulo: string) => void;
};

// Botão dentro de <summary>: o clique não pode abrir nem fechar o bloco.
function semAlternar(e: React.MouseEvent, fazer: () => void) {
  e.preventDefault();
  e.stopPropagation();
  fazer();
}

function AcaoDoCombate({ id, titulo, controle }: { id: string; titulo: string; controle: Controle }) {
  if (controle.selecionando) {
    const marcado = controle.marcados.has(id);
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={marcado}
        aria-label={`Marcar ${titulo}`}
        className={`est-marca${marcado ? " marcada" : ""}`}
        onClick={(e) => semAlternar(e, () => controle.alternar(id))}
      >
        {marcado && <i className="fas fa-check" />}
      </button>
    );
  }
  return (
    <button
      type="button"
      className="est-icone"
      title="Apagar este combate do histórico"
      aria-label={`Apagar ${titulo} do histórico`}
      disabled={controle.ocupado}
      onClick={(e) => semAlternar(e, () => controle.apagar([id], `Apagar ${titulo}?`))}
    >
      <i className="fas fa-trash" />
    </button>
  );
}

function Combate({
  combate,
  indice,
  aberto,
  controle,
}: {
  combate: CombateHistorico;
  indice: number;
  aberto: boolean;
  controle: Controle;
}) {
  const e: EstatisticasCombate | null = combate.estatisticas;
  const titulo = `Combate ${indice}`;
  const marcado = controle.selecionando && controle.marcados.has(combate.id);

  if (!e) {
    // Registro de antes das estatísticas: só rodadas e PV final.
    const l = combate.legado;
    return (
      <div className={`est-combate legado${marcado ? " marcado" : ""}`}>
        <div className="est-cabeca">
          <span className="est-selo" data-resultado="encerrado">
            <i className="fas fa-box-archive" />
          </span>
          <span className="est-titulo">
            <strong>{titulo}</strong>
            <span>
              {plural(l?.rodadas ?? 1, "rodada", "rodadas")} · {dataHora(combate.encerradoEm)}
            </span>
          </span>
          <AcaoDoCombate id={combate.id} titulo={titulo} controle={controle} />
        </div>
        <small>Registrado antes das estatísticas: só o PV final de cada um foi guardado.</small>
        {l && l.participantes.length > 0 && (
          <ul className="est-legado">
            {l.participantes.map((p, i) => (
              <li key={i}>
                {p.nome} — PV final {p.pvFinal ?? "?"}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const resultado = e.resultado ?? "encerrado";
  const contra = inimigosDe(e);
  return (
    <details className={`est-combate${marcado ? " marcado" : ""}`} open={aberto}>
      <summary>
        <span className="est-selo" data-resultado={resultado} title={ROTULO_RESULTADO[resultado]}>
          <i className={`fas ${ICONE_RESULTADO[resultado]}`} />
        </span>
        <span className="est-titulo">
          <strong>
            {titulo}
            {contra && <em> · {contra}</em>}
          </strong>
          <span>
            {ROTULO_RESULTADO[resultado]} · {plural(e.rodadas, "rodada", "rodadas")} · {formatarDuracao(e.duracaoMs)} ·{" "}
            {dataHora(combate.encerradoEm)}
          </span>
        </span>
        {e.parcial && (
          <span className="est-parcial" title="O recurso entrou com este combate em andamento: o que aconteceu antes não foi contado.">
            <i className="fas fa-circle-half-stroke" /> registro parcial
          </span>
        )}
        <span className="est-placar" title="Dano causado: jogadores × inimigos">
          <i className="est-amostra" data-lado="jogadores" /> {formatarNumero(e.jogadores.danoCausado)}
          <span>×</span>
          <i className="est-amostra" data-lado="inimigos" /> {formatarNumero(e.inimigos.danoCausado)}
        </span>
        <AcaoDoCombate id={combate.id} titulo={titulo} controle={controle} />
      </summary>
      <EstatisticasView
        linhas={e.linhas}
        serie={seriePorRodada(e)}
        jogadores={e.jogadores}
        inimigos={e.inimigos}
        rodadas={e.rodadas}
        semOrigem={e.semOrigem}
      />
    </details>
  );
}

function Sessao({ sessao, aberta, controle }: { sessao: SessaoHistorico; aberta: boolean; controle: Controle }) {
  const r = sessao.resumo;
  // A numeração segue a ordem em que aconteceram.
  const numerados = sessao.combates.map((c, i) => ({ c, n: i + 1 }));
  const naoLegados = numerados.filter(({ c }) => c.estatisticas).length;
  const nome = sessao.encerradaEm ? `a sessão de ${dataHora(sessao.iniciadaEm)}` : "a sessão atual";
  return (
    <details className="est-sessao" open={aberta}>
      <summary>
        <span className="est-titulo">
          <strong>
            {sessao.encerradaEm ? dataHora(sessao.iniciadaEm) : "Sessão atual"}
            {!sessao.encerradaEm && <span className="nv-status ativa">Ativa</span>}
          </strong>
          <span>
            {plural(sessao.combates.length, "combate", "combates")}
            {r ? ` · ${formatarDuracao(r.duracaoMs)} em combate` : ""}
            {r && r.vitorias + r.derrotas > 0 ? ` · ${plural(r.vitorias, "vitória", "vitórias")}, ${plural(r.derrotas, "derrota", "derrotas")}` : ""}
          </span>
        </span>
        {!controle.selecionando && (
          <button
            type="button"
            className="est-icone"
            title="Apagar todos os combates desta sessão"
            aria-label={`Apagar ${nome} do histórico`}
            disabled={controle.ocupado}
            onClick={(e) =>
              semAlternar(e, () =>
                controle.apagar(
                  sessao.combates.map((c) => c.id),
                  `Apagar ${nome}?`,
                ),
              )
            }
          >
            <i className="fas fa-trash" />
          </button>
        )}
      </summary>

      {/* Com um combate só, o resumo da sessão repetiria o dele. */}
      {r && naoLegados > 1 && (
        <>
          <div className="est-kpis">
            <Kpi rotulo="Combates" icone="fa-khanda" valor={formatarNumero(r.combates)} />
            <Kpi rotulo="Rodadas" icone="fa-rotate" valor={formatarNumero(r.rodadas)} />
            <Kpi rotulo="Tempo em combate" icone="fa-stopwatch" valor={formatarDuracao(r.duracaoMs)} />
            <Kpi rotulo="Vitórias" icone="fa-trophy" valor={formatarNumero(r.vitorias)} />
            <Kpi rotulo="Derrotas" icone="fa-skull" valor={formatarNumero(r.derrotas)} />
          </div>
          <details className="est-combate est-resumo">
            <summary>
              <span className="est-selo">
                <i className="fas fa-layer-group" />
              </span>
              <span className="est-titulo">
                <strong>Resumo da sessão</strong>
                <span>Todos os combates somados; o que a criatura repetiu entre combates fica numa linha só.</span>
              </span>
            </summary>
            <EstatisticasView
              linhas={r.linhas}
              serie={seriePorCombate(numerados)}
              jogadores={r.jogadores}
              inimigos={r.inimigos}
              rodadas={r.rodadas}
              semOrigem={r.semOrigem}
            />
          </details>
        </>
      )}

      {/* Do mais recente pro mais antigo. */}
      {[...numerados].reverse().map(({ c, n }, pos) => (
        <Combate key={c.id} combate={c} indice={n} aberto={pos === 0 && aberta} controle={controle} />
      ))}
    </details>
  );
}

// O cartão do histórico, sem saber de onde vêm os dados. `onApagar` e
// `onLimpar` confirmam com o narrador e respondem se apagaram de fato.
export function HistoricoLista({
  sessoes,
  ocupado,
  onApagar,
  onLimpar,
  children,
}: {
  sessoes: SessaoHistorico[];
  ocupado: boolean;
  onApagar: (ids: string[], titulo: string) => Promise<boolean>;
  onLimpar: () => Promise<boolean>;
  // Aviso no lugar da lista (carregando, erro).
  children?: React.ReactNode;
}) {
  const [selecionando, setSelecionando] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  const comCombates = sessoes.filter((s) => s.combates.length > 0);
  const total = comCombates.reduce((n, s) => n + s.combates.length, 0);
  // Só conta o que ainda existe (o histórico pode ter mudado por baixo).
  const existentes = new Set(comCombates.flatMap((s) => s.combates.map((c) => c.id)));
  const escolhidos = [...marcados].filter((id) => existentes.has(id));

  function sairDaSelecao() {
    setSelecionando(false);
    setMarcados(new Set());
  }

  const controle: Controle = {
    ocupado,
    selecionando,
    marcados,
    alternar: (id) =>
      setMarcados((atual) => {
        const novo = new Set(atual);
        if (!novo.delete(id)) novo.add(id);
        return novo;
      }),
    apagar: (ids, titulo) => void onApagar(ids, titulo),
  };

  return (
    <section className="nv-card est-historico">
      <div className="nv-card-topo">
        <span className="nv-titulo">
          <i className="fas fa-chart-column" /> Histórico de combates
          {total > 0 && <span className="nv-contagem">{total}</span>}
        </span>
        {total > 0 && !children && (
          <div className="est-acoes">
            {selecionando ? (
              <>
                <span className="est-nota">{plural(escolhidos.length, "marcado", "marcados")}</span>
                <button
                  type="button"
                  className="nv-btn perigo"
                  disabled={ocupado || escolhidos.length === 0}
                  onClick={async () => {
                    const feito = await onApagar(
                      escolhidos,
                      escolhidos.length === 1 ? "Apagar o combate marcado?" : `Apagar os ${escolhidos.length} combates marcados?`,
                    );
                    if (feito) sairDaSelecao();
                  }}
                >
                  <i className="fas fa-trash" /> Apagar marcados
                </button>
                <button type="button" className="nv-btn" onClick={sairDaSelecao} disabled={ocupado}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                {total > 1 && (
                  <button type="button" className="nv-btn" onClick={() => setSelecionando(true)} disabled={ocupado}>
                    <i className="fas fa-list-check" /> Selecionar
                  </button>
                )}
                <button type="button" className="nv-btn perigo" onClick={() => void onLimpar()} disabled={ocupado}>
                  <i className="fas fa-broom" /> Limpar histórico
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {children ??
        (comCombates.length === 0 ? (
          <p className="est-vazio">
            Os combates encerrados aparecem aqui, com dano, cura, PP e tempo de cada participante.
          </p>
        ) : (
          comCombates.map((s, i) => <Sessao key={s.id} sessao={s} aberta={i === 0} controle={controle} />)
        ))}
    </section>
  );
}

export function HistoricoSessoes({ mesaId }: { mesaId: string }) {
  const [sessoes, setSessoes] = useState<SessaoHistorico[] | null>(null);
  const [erro, setErro] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    carregarHistorico(mesaId)
      .then((dados) => vivo && setSessoes(dados))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [mesaId]);

  // Confirma, apaga e troca o histórico pelo que o servidor devolveu.
  async function confirmarEApagar(titulo: string, texto: string, botao: string, apagar: () => Promise<SessaoHistorico[]>) {
    const confirmacao = await Swal.fire({
      icon: "warning",
      title: titulo,
      text: texto,
      showCancelButton: true,
      confirmButtonText: botao,
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirmacao.isConfirmed) return false;
    setOcupado(true);
    try {
      setSessoes(await apagar());
      return true;
    } catch (err) {
      void Swal.fire({
        icon: "error",
        title: "Erro",
        text: err instanceof Error ? err.message : "Tente novamente.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  return (
    <HistoricoLista
      sessoes={sessoes ?? []}
      ocupado={ocupado}
      onApagar={(ids, titulo) =>
        confirmarEApagar(titulo, "As estatísticas apagadas não voltam.", "Sim, apagar", () =>
          apagarCombatesDoHistorico(mesaId, ids),
        )
      }
      onLimpar={() =>
        confirmarEApagar(
          "Limpar o histórico inteiro?",
          "Todos os combates e sessões encerrados desta mesa somem, com as estatísticas. Não dá pra desfazer.",
          "Sim, limpar tudo",
          () => limparHistorico(mesaId),
        )
      }
    >
      {erro ? (
        <p className="est-vazio">Não deu pra carregar o histórico. Recarregue a página.</p>
      ) : sessoes === null ? (
        <p className="est-vazio">Carregando…</p>
      ) : undefined}
    </HistoricoLista>
  );
}
