"use client";

// Gráficos das estatísticas de um combate ou de uma sessão inteira. No topo,
// o confronto (jogadores × inimigos, métrica a métrica) e os destaques; depois
// um grupo de métricas por vez (dano, dano sofrido, cura, PP, tempo, série por
// rodada ou por combate), cada um com o total e a média por turno. Jogadores e
// inimigos têm uma cor cada (as duas primeiras da paleta validada pro modo
// claro e escuro); o resto é tinta de texto. As tabelas têm todos os números,
// sem precisar de hover.

import { useRef, useState } from "react";
import {
  formatarDuracao,
  formatarNumero,
  porTurno,
  type Lado,
  type LinhaParticipante,
  type TotaisDoLado,
} from "@/lib/estatisticas-combate";

type Aba = "dano" | "acerto" | "sofrido" | "cura" | "pp" | "tempo" | "serie";

const ABAS: { id: Exclude<Aba, "serie">; rotulo: string; icone: string }[] = [
  { id: "dano", rotulo: "Dano causado", icone: "fa-burst" },
  { id: "acerto", rotulo: "Acerto", icone: "fa-bullseye" },
  { id: "sofrido", rotulo: "Dano sofrido", icone: "fa-heart-crack" },
  { id: "cura", rotulo: "Cura", icone: "fa-heart-pulse" },
  { id: "pp", rotulo: "PP gasto", icone: "fa-bolt" },
  { id: "tempo", rotulo: "Tempo", icone: "fa-stopwatch" },
];

const NOME_DO_LADO: Record<Lado, string> = { jogadores: "Jogadores", inimigos: "Inimigos" };
const LADOS: Lado[] = ["jogadores", "inimigos"];

// Um ponto da série no tempo: uma rodada do combate ou um combate da sessão.
export type PontoSerie = {
  chave: string;
  // Rótulo curto do eixo ("R3", "C2") e o por extenso da dica.
  eixo: string;
  titulo: string;
  dano: Record<Lado, number>;
  cura: Record<Lado, number>;
};
export type Serie = { por: "rodada" | "combate"; pontos: PontoSerie[] };

const inteiroOuUmaCasa = (v: number) => formatarNumero(v, Number.isInteger(v) ? 0 : 1);

// ─── Dica (hover e foco) ───────────────────────────────────────────────────

type Dica = { titulo: string; valor: string; linhas: string[] };

function useDica<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);
  const [dica, setDica] = useState<{ x: number; y: number; dica: Dica } | null>(null);

  function mostrar(e: React.PointerEvent<HTMLElement> | React.FocusEvent<HTMLElement>, conteudo: Dica) {
    const caixa = ref.current?.getBoundingClientRect();
    if (!caixa) return;
    if ("clientX" in e) {
      setDica({ x: e.clientX - caixa.left, y: e.clientY - caixa.top, dica: conteudo });
    } else {
      const r = e.currentTarget.getBoundingClientRect();
      setDica({ x: r.left + r.width / 2 - caixa.left, y: r.top - caixa.top, dica: conteudo });
    }
  }

  const balao = dica && (
    <div
      className="est-dica"
      role="tooltip"
      style={{ left: `clamp(90px, ${dica.x}px, calc(100% - 90px))`, top: dica.y }}
    >
      <strong>{dica.dica.valor}</strong>
      <span>{dica.dica.titulo}</span>
      {dica.dica.linhas.map((l) => (
        <small key={l}>{l}</small>
      ))}
    </div>
  );
  return { ref, mostrar, esconder: () => setDica(null), balao };
}

// ─── Barras horizontais ────────────────────────────────────────────────────

type Parte = { rotulo: string; valor: number; claro?: boolean };
type ItemBarra = {
  chave: string;
  rotulo: string;
  lado: Lado;
  valor: number;
  texto: string;
  // Barra empilhada: as partes somam o valor.
  partes?: Parte[];
  detalhe?: string;
};

function Legenda({ lados, partes }: { lados: Lado[]; partes?: Parte[] }) {
  if (lados.length < 2 && !partes) return null;
  return (
    <ul className="est-legenda">
      {lados.length > 1 &&
        lados.map((l) => (
          <li key={l}>
            <i className="est-amostra" data-lado={l} /> {NOME_DO_LADO[l]}
          </li>
        ))}
      {partes?.map((p) => (
        <li key={p.rotulo}>
          <i className={`est-amostra neutra${p.claro ? " clara" : ""}`} /> {p.rotulo}
        </li>
      ))}
    </ul>
  );
}

// Acima disso a lista fica longa demais pra comparar de relance.
const MAX_BARRAS = 8;

function Barras({
  titulo,
  nota,
  itens,
  legendaPartes,
  // A soma faz sentido (dano, cura, PP)? Então a dica diz a fatia de cada um.
  comFatia = false,
  // Valor que enche o trilho (100 numa porcentagem); sem ele, o maior da lista.
  escala,
}: {
  titulo: string;
  nota?: string;
  itens: ItemBarra[];
  legendaPartes?: Parte[];
  comFatia?: boolean;
  escala?: number;
}) {
  const { ref, mostrar, esconder, balao } = useDica();
  const [todos, setTodos] = useState(false);
  const comValor = itens.filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor);
  const visiveis = todos ? comValor : comValor.slice(0, MAX_BARRAS);
  const maior = escala ?? comValor[0]?.valor ?? 0;
  const total = comValor.reduce((s, i) => s + i.valor, 0);
  const lados = LADOS.filter((l) => comValor.some((i) => i.lado === l));

  return (
    <figure className="est-grafico" ref={ref}>
      <figcaption>
        <strong>{titulo}</strong>
        {nota && <span>{nota}</span>}
      </figcaption>
      {comValor.length === 0 ? (
        <p className="est-vazio">Nada registrado.</p>
      ) : (
        <>
          <Legenda lados={lados} partes={legendaPartes} />
          <ol className="est-barras">
            {visiveis.map((i, pos) => {
              const dica: Dica = {
                titulo: i.rotulo,
                valor: i.texto,
                linhas: [
                  ...(comFatia && total > 0 ? [`${formatarNumero((i.valor / total) * 100, 0)}% do total`] : []),
                  ...(i.partes ?? []).filter((p) => p.valor > 0).map((p) => `${p.rotulo}: ${inteiroOuUmaCasa(p.valor)}`),
                  ...(i.detalhe ? [i.detalhe] : []),
                ],
              };
              return (
                <li
                  key={i.chave}
                  className="est-linha"
                  tabIndex={0}
                  aria-label={`${i.rotulo}: ${i.texto}`}
                  onPointerMove={(e) => mostrar(e, dica)}
                  onPointerLeave={esconder}
                  onFocus={(e) => mostrar(e, dica)}
                  onBlur={esconder}
                >
                  <span className="est-posicao" aria-hidden="true">
                    {pos + 1}
                  </span>
                  <span className="est-rotulo" title={i.rotulo}>
                    {i.rotulo}
                  </span>
                  <span className="est-trilho">
                    <span className="est-barra" style={{ width: `${(i.valor / maior) * 100}%` }}>
                      {(i.partes ?? [{ rotulo: "", valor: i.valor }]).map((p, k) =>
                        p.valor > 0 ? (
                          <span
                            key={k}
                            className={`est-segmento${p.claro ? " clara" : ""}`}
                            data-lado={i.lado}
                            style={{ flexGrow: p.valor }}
                          />
                        ) : null,
                      )}
                    </span>
                  </span>
                  <span className="est-valor">{i.texto}</span>
                </li>
              );
            })}
          </ol>
          {comValor.length > MAX_BARRAS && (
            <button type="button" className="est-mais" onClick={() => setTodos((v) => !v)}>
              {todos ? "Mostrar só os maiores" : `Mostrar todos (${comValor.length})`}
            </button>
          )}
        </>
      )}
      {balao}
    </figure>
  );
}

// ─── Colunas no tempo (por rodada ou por combate) ──────────────────────────

// Topo do eixo: o próximo número redondo (1, 1,5, 2, 3… × 10ⁿ) acima do maior.
function tetoRedondo(v: number) {
  if (v <= 0) return 1;
  const base = 10 ** Math.floor(Math.log10(v));
  const passo = [1, 1.5, 2, 3, 4, 5, 6, 8, 10].find((m) => m * base >= v) ?? 10;
  return Math.max(2, passo * base);
}

function Colunas({ titulo, pontos, campo }: { titulo: string; pontos: PontoSerie[]; campo: "dano" | "cura" }) {
  const { ref, mostrar, esconder, balao } = useDica();
  const maior = Math.max(0, ...pontos.flatMap((p) => [p[campo].jogadores, p[campo].inimigos]));
  const teto = tetoRedondo(maior);
  // Só a coluna mais alta leva o número; o resto está no eixo, na dica e na tabela.
  const topo = pontos
    .flatMap((p) => LADOS.map((l) => ({ chave: p.chave, l, v: p[campo][l] })))
    .find((x) => x.v === maior);
  // Eixo apertado: um rótulo a cada tantos.
  const salto = Math.max(1, Math.ceil(pontos.length / 12));

  return (
    <figure className="est-grafico" ref={ref}>
      <figcaption>
        <strong>{titulo}</strong>
      </figcaption>
      {maior === 0 ? (
        <p className="est-vazio">Nada registrado.</p>
      ) : (
        <>
          <Legenda lados={LADOS} />
          <div className="est-plano">
            <div className="est-escala" aria-hidden="true">
              <span>{formatarNumero(teto)}</span>
              <span>{inteiroOuUmaCasa(teto / 2)}</span>
              <span>0</span>
            </div>
            <div className="est-colunas">
              {pontos.map((p, i) => (
                <div key={p.chave} className="est-grupo">
                  <div className="est-pilha">
                    {LADOS.map((lado) => {
                      const v = p[campo][lado];
                      const dica: Dica = {
                        titulo: `${NOME_DO_LADO[lado]} · ${p.titulo}`,
                        valor: formatarNumero(v, 0),
                        linhas: [],
                      };
                      return (
                        <span
                          key={lado}
                          className="est-coluna"
                          data-lado={lado}
                          tabIndex={0}
                          aria-label={`${dica.titulo}: ${dica.valor}`}
                          style={{ height: `${Math.max(v > 0 ? 2 : 0, (v / teto) * 100)}%` }}
                          onPointerMove={(e) => mostrar(e, dica)}
                          onPointerLeave={esconder}
                          onFocus={(e) => mostrar(e, dica)}
                          onBlur={esconder}
                        >
                          {topo && topo.chave === p.chave && topo.l === lado && <em>{formatarNumero(v, 0)}</em>}
                        </span>
                      );
                    })}
                  </div>
                  {i % salto === 0 && <span className="est-eixo">{p.eixo}</span>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {balao}
    </figure>
  );
}

// ─── Confronto: jogadores × inimigos ───────────────────────────────────────

type Duelo = {
  rotulo: string;
  icone: string;
  valores: Record<Lado, number>;
  formatar: (v: number) => string;
  // Linha a mais na dica de cada lado.
  detalhe?: (lado: Lado) => string | null;
};

function Confronto({ jogadores, inimigos, rodadas }: { jogadores: TotaisDoLado; inimigos: TotaisDoLado; rodadas: number }) {
  const { ref, mostrar, esconder, balao } = useDica();
  const de: Record<Lado, TotaisDoLado> = { jogadores, inimigos };
  const duelo = (
    rotulo: string,
    icone: string,
    valor: (t: TotaisDoLado) => number,
    formatar: Duelo["formatar"] = (v) => formatarNumero(v),
    detalhe?: Duelo["detalhe"],
  ): Duelo => ({ rotulo, icone, valores: { jogadores: valor(jogadores), inimigos: valor(inimigos) }, formatar, detalhe });

  const duelos = [
    duelo("PV somados", "fa-heart", (t) => t.pvMax),
    duelo(
      "Dano causado",
      "fa-burst",
      (t) => t.danoCausado,
      undefined,
      (l) => (rodadas > 0 ? `${formatarNumero(de[l].danoCausado / rodadas, 1)} por rodada` : null),
    ),
    duelo("Cura", "fa-heart-pulse", (t) => t.cura),
    duelo("PP gasto", "fa-bolt", (t) => t.ppGasto),
    duelo(
      "Tempo por turno",
      "fa-stopwatch",
      (t) => (t.turnos > 0 ? t.tempoMs / t.turnos : 0),
      formatarDuracao,
      (l) =>
        de[l].turnos > 0
          ? `${formatarDuracao(de[l].tempoMs)} em ${de[l].turnos} ${de[l].turnos === 1 ? "turno" : "turnos"}`
          : null,
    ),
  ].filter((d) => d.valores.jogadores > 0 || d.valores.inimigos > 0);

  return (
    <figure className="est-confronto" ref={ref} aria-label="Jogadores contra inimigos">
      <figcaption>
        {LADOS.map((l) => (
          <span key={l} className="est-time" data-lado={l}>
            <i className="est-amostra" />
            <strong>{NOME_DO_LADO[l]}</strong>
            <small>
              {de[l].participantes} {de[l].participantes === 1 ? "participante" : "participantes"}
            </small>
          </span>
        ))}
      </figcaption>
      {duelos.map((d) => {
        const soma = d.valores.jogadores + d.valores.inimigos;
        return (
          <div key={d.rotulo} className="est-duelo">
            <span className="est-duelo-valor">{d.formatar(d.valores.jogadores)}</span>
            <span className="est-duelo-meio">
              <span className="est-duelo-rotulo">
                <i className={`fas ${d.icone}`} /> {d.rotulo}
              </span>
              <span className="est-duelo-barra">
                {LADOS.map((l) => {
                  if (!(d.valores[l] > 0)) return null;
                  const extra = d.detalhe?.(l);
                  const dica: Dica = {
                    titulo: `${NOME_DO_LADO[l]} · ${d.rotulo}`,
                    valor: d.formatar(d.valores[l]),
                    linhas: [`${formatarNumero((d.valores[l] / soma) * 100, 0)}% dos dois lados`, ...(extra ? [extra] : [])],
                  };
                  return (
                    <span
                      key={l}
                      className="est-duelo-fatia"
                      data-lado={l}
                      tabIndex={0}
                      aria-label={`${dica.titulo}: ${dica.valor}`}
                      style={{ flexGrow: d.valores[l] }}
                      onPointerMove={(e) => mostrar(e, dica)}
                      onPointerLeave={esconder}
                      onFocus={(e) => mostrar(e, dica)}
                      onBlur={esconder}
                    />
                  );
                })}
              </span>
            </span>
            <span className="est-duelo-valor">{d.formatar(d.valores.inimigos)}</span>
          </div>
        );
      })}
      {balao}
    </figure>
  );
}

// ─── Destaques ─────────────────────────────────────────────────────────────

function Destaques({ linhas, nome }: { linhas: LinhaParticipante[]; nome: (l: LinhaParticipante) => string }) {
  const maior = (valor: (l: LinhaParticipante) => number) => {
    const l = linhas.reduce<LinhaParticipante | null>((m, x) => (valor(x) > (m ? valor(m) : 0) ? x : m), null);
    return l ? { l, v: valor(l) } : null;
  };
  const dano = maior((l) => l.danoCausado);
  const sofrido = maior((l) => l.danoTomado);
  const cura = maior((l) => l.curaEmSi + l.curaEmAliados);
  const abates = maior((l) => l.abates);
  const turno = maior((l) => l.maiorTurnoMs);
  const danoPorTurno = dano ? porTurno(dano.v, dano.l.turnos) : null;

  const cartoes = [
    dano && {
      rotulo: "Mais dano",
      icone: "fa-burst",
      l: dano.l,
      texto: formatarNumero(dano.v),
      sub: danoPorTurno === null ? null : `${formatarNumero(danoPorTurno, 1)} por turno`,
    },
    sofrido && { rotulo: "Mais dano sofrido", icone: "fa-heart-crack", l: sofrido.l, texto: formatarNumero(sofrido.v), sub: null },
    cura && { rotulo: "Mais cura", icone: "fa-heart-pulse", l: cura.l, texto: formatarNumero(cura.v), sub: null },
    abates && { rotulo: "Mais abates", icone: "fa-skull", l: abates.l, texto: formatarNumero(abates.v), sub: null },
    turno && { rotulo: "Turno mais longo", icone: "fa-stopwatch", l: turno.l, texto: formatarDuracao(turno.v), sub: null },
  ].flatMap((c) => (c ? [c] : []));
  if (cartoes.length === 0) return null;

  return (
    <ul className="est-destaques">
      {cartoes.map((c) => (
        <li key={c.rotulo} className="est-destaque">
          <span className="est-destaque-rotulo">
            <i className={`fas ${c.icone}`} /> {c.rotulo}
          </span>
          <strong>{c.texto}</strong>
          <span className="est-destaque-quem" title={nome(c.l)}>
            <i className="est-amostra" data-lado={c.l.lado} />
            <span>{nome(c.l)}</span>
          </span>
          {c.sub && <small>{c.sub}</small>}
        </li>
      ))}
    </ul>
  );
}

// ─── Tabelas ───────────────────────────────────────────────────────────────

const n1 = (v: number | null) => (v === null ? "—" : formatarNumero(v, 1));
const taxa = (acertos: number, ataques: number) => (ataques > 0 ? `${formatarNumero((acertos / ataques) * 100, 0)}%` : "—");

function TabelaLados({ jogadores, inimigos, rodadas }: { jogadores: TotaisDoLado; inimigos: TotaisDoLado; rodadas: number }) {
  const linhas: [Lado, TotaisDoLado][] = [
    ["jogadores", jogadores],
    ["inimigos", inimigos],
  ];
  return (
    <div className="est-rolagem">
      <table className="est-tabela">
        <caption>Lado a lado</caption>
        <thead>
          <tr>
            <th scope="col">Lado</th>
            <th scope="col">Participantes</th>
            <th scope="col">PV somados</th>
            <th scope="col">Dano causado</th>
            <th scope="col">Dano/rodada</th>
            <th scope="col">Dano sofrido</th>
            <th scope="col">Cura</th>
            <th scope="col">PP gasto</th>
            <th scope="col">Ataques</th>
            <th scope="col">Taxa de acerto</th>
            <th scope="col">Acerto médio</th>
            <th scope="col">Tempo/turno</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(([lado, t]) => (
            <tr key={lado}>
              <th scope="row">
                <i className="est-amostra" data-lado={lado} /> {NOME_DO_LADO[lado]}
              </th>
              <td>{formatarNumero(t.participantes)}</td>
              <td>{formatarNumero(t.pvMax)}</td>
              <td>{formatarNumero(t.danoCausado)}</td>
              <td>{n1(rodadas > 0 ? t.danoCausado / rodadas : null)}</td>
              <td>{formatarNumero(t.danoTomado)}</td>
              <td>{formatarNumero(t.cura)}</td>
              <td>{formatarNumero(t.ppGasto)}</td>
              <td>{formatarNumero(t.ataques)}</td>
              <td>{taxa(t.acertos, t.ataques)}</td>
              <td>{n1(t.ataques > 0 ? t.somaAcerto / t.ataques : null)}</td>
              <td>{t.turnos > 0 ? formatarDuracao(t.tempoMs / t.turnos) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaCompleta({
  linhas,
  jogadores,
  inimigos,
  rodadas,
}: {
  linhas: LinhaParticipante[];
  jogadores: TotaisDoLado;
  inimigos: TotaisDoLado;
  rodadas: number;
}) {
  // Jogadores primeiro; dentro do lado, quem causou mais dano.
  const ordenadas = [...linhas].sort(
    (a, b) => LADOS.indexOf(a.lado) - LADOS.indexOf(b.lado) || b.danoCausado - a.danoCausado,
  );
  return (
    <details className="est-detalhe">
      <summary>
        <i className="fas fa-table" /> Tabelas completas
      </summary>
      <TabelaLados jogadores={jogadores} inimigos={inimigos} rodadas={rodadas} />
      <div className="est-rolagem">
        <table className="est-tabela">
          <caption>Por participante</caption>
          <thead>
            <tr>
              <th scope="col">Participante</th>
              <th scope="col">Turnos</th>
              <th scope="col">Dano causado</th>
              <th scope="col">Dano/turno</th>
              <th scope="col">Dano sofrido</th>
              <th scope="col">Sofrido/turno</th>
              <th scope="col">Cura em si</th>
              <th scope="col">Cura em aliados</th>
              <th scope="col">Cura recebida</th>
              <th scope="col">PP gasto</th>
              <th scope="col">Ataques</th>
              <th scope="col">Acertos</th>
              <th scope="col">Críticos</th>
              <th scope="col">Taxa de acerto</th>
              <th scope="col">Acerto médio</th>
              <th scope="col">Tempo total</th>
              <th scope="col">Tempo/turno</th>
              <th scope="col">Maior turno</th>
              <th scope="col">Abates</th>
              <th scope="col">Quedas</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((l) => (
              <tr key={l.chave}>
                <th scope="row">
                  <i className="est-amostra" data-lado={l.lado} /> {l.nome}
                  {l.copias > 1 && ` ×${l.copias}`}
                </th>
                <td>{l.turnos}</td>
                <td>{formatarNumero(l.danoCausado)}</td>
                <td>{n1(porTurno(l.danoCausado, l.turnos))}</td>
                <td>{formatarNumero(l.danoTomado)}</td>
                <td>{n1(porTurno(l.danoTomado, l.turnos))}</td>
                <td>{formatarNumero(l.curaEmSi)}</td>
                <td>{formatarNumero(l.curaEmAliados)}</td>
                <td>{formatarNumero(l.curaRecebida + l.curaSemOrigem)}</td>
                <td>{formatarNumero(l.ppGasto)}</td>
                <td>{l.ataques}</td>
                <td>{l.acertos}</td>
                <td>{l.criticos}</td>
                <td>{taxa(l.acertos, l.ataques)}</td>
                <td>{n1(l.ataques > 0 ? l.somaAcerto / l.ataques : null)}</td>
                <td>{formatarDuracao(l.tempoMs)}</td>
                <td>{l.turnos > 0 ? formatarDuracao(l.tempoMs / l.turnos) : "—"}</td>
                <td>{formatarDuracao(l.maiorTurnoMs)}</td>
                <td>{l.abates}</td>
                <td>{l.quedas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ─── Vista ─────────────────────────────────────────────────────────────────

type Props = {
  linhas: LinhaParticipante[];
  // Evolução no tempo: por rodada (um combate) ou por combate (uma sessão).
  serie?: Serie;
  jogadores: TotaisDoLado;
  inimigos: TotaisDoLado;
  rodadas: number;
  semOrigem: { dano: number; cura: number };
};

export function EstatisticasView({ linhas, serie, jogadores, inimigos, rodadas, semOrigem }: Props) {
  const [aba, setAba] = useState<Aba>("dano");
  const nome = (l: LinhaParticipante) => (l.copias > 1 ? `${l.nome} ×${l.copias}` : l.nome);
  const emTurnos = (l: LinhaParticipante) => (l.turnos === 1 ? "1 turno" : `${l.turnos} turnos`);

  const temDado: Record<Exclude<Aba, "serie">, boolean> = {
    dano: linhas.some((l) => l.danoCausado > 0),
    acerto: linhas.some((l) => l.ataques > 0),
    sofrido: linhas.some((l) => l.danoTomado > 0),
    cura: linhas.some((l) => l.curaEmSi + l.curaEmAliados > 0),
    pp: linhas.some((l) => l.ppGasto > 0),
    tempo: linhas.some((l) => l.tempoMs > 0),
  };
  const abas: { id: Aba; rotulo: string; icone: string; vazia: boolean }[] = [
    ...ABAS.map((a) => ({ ...a, vazia: !temDado[a.id] })),
    // Um ponto só não é evolução.
    ...(serie && serie.pontos.length > 1
      ? [
          {
            id: "serie" as const,
            rotulo: serie.por === "rodada" ? "Por rodada" : "Por combate",
            icone: "fa-chart-column",
            vazia: false,
          },
        ]
      : []),
  ];

  // Total e média por turno do mesmo valor, com a mesma conta nos dois gráficos.
  function par(totalTitulo: string, mediaTitulo: string, valor: (l: LinhaParticipante) => number, nota?: string) {
    return (
      <div className="est-par">
        <Barras
          titulo={totalTitulo}
          nota={nota}
          comFatia
          itens={linhas.map((l) => ({
            chave: l.chave,
            rotulo: nome(l),
            lado: l.lado,
            valor: valor(l),
            texto: inteiroOuUmaCasa(valor(l)),
            detalhe: emTurnos(l),
          }))}
        />
        <Barras
          titulo={mediaTitulo}
          nota="por turno do próprio participante"
          itens={linhas.flatMap((l) => {
            const m = porTurno(valor(l), l.turnos);
            return m === null
              ? []
              : [
                  {
                    chave: l.chave,
                    rotulo: nome(l),
                    lado: l.lado,
                    valor: m,
                    texto: formatarNumero(m, 1),
                    detalhe: `${inteiroOuUmaCasa(valor(l))} em ${emTurnos(l)}`,
                  },
                ];
          })}
        />
      </div>
    );
  }

  const num0 = (v: number) => formatarNumero(v, 0);
  const num1 = (v: number) => formatarNumero(v, 1);
  const partesCura: Parte[] = [
    { rotulo: "Em aliados", valor: 0 },
    { rotulo: "Em si", valor: 0, claro: true },
  ];

  return (
    <div className="est">
      <Confronto jogadores={jogadores} inimigos={inimigos} rodadas={rodadas} />
      <Destaques linhas={linhas} nome={nome} />

      <div className="est-abas" role="tablist" aria-label="Métricas">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            className={`est-aba${aba === a.id ? " ativa" : ""}${a.vazia ? " vazia" : ""}`}
            aria-selected={aba === a.id}
            title={a.vazia ? "Nada registrado" : undefined}
            onClick={() => setAba(a.id)}
          >
            <i className={`fas ${a.icone}`} /> {a.rotulo}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="est-painel">
        {aba === "dano" &&
          par(
            "Dano causado",
            "Dano médio por turno",
            (l) => l.danoCausado,
            semOrigem.dano > 0 ? `${num0(semOrigem.dano)} de dano sem origem (ajustes à mão) fora da conta` : "depois das defesas do alvo",
          )}
        {aba === "acerto" && (
          <div className="est-par">
            <Barras
              titulo="Taxa de acerto"
              nota="jogadas de ataque que passaram da CR do alvo; quem errou todas não aparece"
              escala={100}
              itens={linhas.flatMap((l) =>
                l.ataques > 0
                  ? [
                      {
                        chave: l.chave,
                        rotulo: nome(l),
                        lado: l.lado,
                        valor: (l.acertos / l.ataques) * 100,
                        texto: `${taxa(l.acertos, l.ataques)} (${l.acertos}/${l.ataques})`,
                        detalhe:
                          `${l.acertos} de ${l.ataques === 1 ? "1 ataque" : `${l.ataques} ataques`}` +
                          (l.criticos > 0 ? ` · ${l.criticos === 1 ? "1 crítico" : `${l.criticos} críticos`}` : ""),
                      },
                    ]
                  : [],
              )}
            />
            <Barras
              titulo="Acerto médio"
              nota="média do valor rolado nas jogadas de ataque, com os bônus"
              itens={linhas.flatMap((l) =>
                l.ataques > 0
                  ? [
                      {
                        chave: l.chave,
                        rotulo: nome(l),
                        lado: l.lado,
                        valor: Math.max(0, l.somaAcerto / l.ataques),
                        texto: num1(l.somaAcerto / l.ataques),
                        detalhe: `em ${l.ataques === 1 ? "1 ataque" : `${l.ataques} ataques`}`,
                      },
                    ]
                  : [],
              )}
            />
          </div>
        )}
        {aba === "sofrido" && par("Dano sofrido", "Dano sofrido por turno", (l) => l.danoTomado)}
        {aba === "cura" && (
          <div className="est-par">
            <Barras
              titulo="Cura feita"
              nota={semOrigem.cura > 0 ? `${num0(semOrigem.cura)} de PV recuperados sem origem fora da conta` : "PV de fato recuperados"}
              legendaPartes={partesCura}
              comFatia
              itens={linhas.map((l) => ({
                chave: l.chave,
                rotulo: nome(l),
                lado: l.lado,
                valor: l.curaEmSi + l.curaEmAliados,
                texto: num0(l.curaEmSi + l.curaEmAliados),
                partes: [
                  { rotulo: "Em aliados", valor: l.curaEmAliados },
                  { rotulo: "Em si", valor: l.curaEmSi, claro: true },
                ],
                detalhe: l.curaRecebida > 0 ? `recebeu ${num0(l.curaRecebida)} de outros` : undefined,
              }))}
            />
            <Barras
              titulo="Cura média por turno"
              nota="por turno do próprio participante"
              legendaPartes={partesCura}
              itens={linhas.flatMap((l) => {
                const t = l.curaEmSi + l.curaEmAliados;
                const m = porTurno(t, l.turnos);
                if (m === null) return [];
                return [
                  {
                    chave: l.chave,
                    rotulo: nome(l),
                    lado: l.lado,
                    valor: m,
                    texto: num1(m),
                    partes: [
                      { rotulo: "Em aliados", valor: l.curaEmAliados / l.turnos },
                      { rotulo: "Em si", valor: l.curaEmSi / l.turnos, claro: true },
                    ],
                    detalhe: `${num0(t)} em ${emTurnos(l)}`,
                  },
                ];
              })}
            />
          </div>
        )}
        {aba === "pp" && par("PP gasto", "PP médio por turno", (l) => l.ppGasto, "só o que passou pelo botão Usar")}
        {aba === "tempo" && (
          <div className="est-par">
            <Barras
              titulo="Tempo total em turnos"
              nota="relógio real, da vez começar até passar"
              comFatia
              itens={linhas.map((l) => ({
                chave: l.chave,
                rotulo: nome(l),
                lado: l.lado,
                valor: l.tempoMs,
                texto: formatarDuracao(l.tempoMs),
                detalhe: emTurnos(l),
              }))}
            />
            <Barras
              titulo="Tempo médio por turno"
              itens={linhas.flatMap((l) => {
                const m = porTurno(l.tempoMs, l.turnos);
                return m === null
                  ? []
                  : [
                      {
                        chave: l.chave,
                        rotulo: nome(l),
                        lado: l.lado,
                        valor: m,
                        texto: formatarDuracao(m),
                        detalhe: `maior turno: ${formatarDuracao(l.maiorTurnoMs)}`,
                      },
                    ];
              })}
            />
          </div>
        )}
        {aba === "serie" && serie && (
          <div className="est-par">
            <Colunas titulo={`Dano por ${serie.por}`} pontos={serie.pontos} campo="dano" />
            <Colunas titulo={`Cura por ${serie.por}`} pontos={serie.pontos} campo="cura" />
          </div>
        )}
      </div>

      <TabelaCompleta linhas={linhas} jogadores={jogadores} inimigos={inimigos} rodadas={rodadas} />
    </div>
  );
}
