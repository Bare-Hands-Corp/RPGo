"use client";

import { useState } from "react";
import type { ModoRolagem } from "@/lib/dice";
import type { ParticipanteVisto } from "@/lib/combate";
import { modoDoAtaque, type CondicaoComMecanica } from "@/lib/condicoes-mecanica";

// Alvo e vantagem/desvantagem de um ataque.
export type AtaqueEscolhido = { alvo: string; modo: ModoRolagem };

// `atacante`: condições de quem ataca, pra quem não tem ficha (criatura); a
// ficha do jogador já soma as dele no Rolador e só avisa (`daFicha`:
// "Vantagem: Ajudar (condição)").
export type OpcoesAtaque = { corpoACorpo?: boolean; atacante?: CondicaoComMecanica[]; daFicha?: string[] };

// `detalhe`: linha embaixo do título (o efeito que vai pra quem for marcado).
// `so`: quais participantes aparecem; `um`: só um alvo.
export type OpcoesAlvos = { detalhe?: string; so?: (p: ParticipanteVisto) => boolean; um?: boolean };

type Pedido =
  | { tipo: "alvos"; titulo: string; opcoes: OpcoesAlvos; resolver: (ids: string[] | null) => void }
  | {
      tipo: "ataques";
      titulo: string;
      ataques: number;
      opcoes: OpcoesAtaque;
      resolver: (ataques: AtaqueEscolhido[] | null) => void;
    };

// `motivos`: por que o modo veio marcado ("Cego: vantagem").
type Linha = { alvo: string | null; modo: ModoRolagem; motivos: string[] };

function Retrato({ p }: { p: ParticipanteVisto }) {
  const classe = `alvo-retrato${p.tipo === "criatura" ? " criatura" : ""}`;
  return p.foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={classe} src={p.foto} alt="" />
  ) : (
    <span className={classe} aria-hidden>
      <i className={`fas ${p.tipo === "criatura" ? "fa-skull" : "fa-user"}`} />
    </span>
  );
}

// "Em quem?" no combate, com os participantes da iniciativa.
// - `escolher`: vários alvos de uma vez (salvaguarda, dano direto).
// - `escolherAtaques`: o alvo de cada ataque e se ele tem vantagem ou
//   desvantagem; no multiataque cada ataque decide o seu.
// As duas resolvem com a escolha (lista vazia = sem alvo) ou null se cancelou.
export function useEscolherAlvosCombate(participantes: ParticipanteVisto[]) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);

  function escolher(titulo: string, opcoes: OpcoesAlvos = {}): Promise<string[] | null> {
    setMarcados([]);
    return new Promise((resolver) => setPedido({ tipo: "alvos", titulo, opcoes, resolver }));
  }

  function escolherAtaques(
    titulo: string,
    ataques: number,
    opcoes: OpcoesAtaque = {},
  ): Promise<AtaqueEscolhido[] | null> {
    const n = Math.max(1, ataques);
    const proprio = modoDoAtaque([], opcoes.atacante ?? []);
    setLinhas(Array.from({ length: n }, () => ({ alvo: null, modo: proprio.modo, motivos: proprio.motivos })));
    return new Promise((resolver) => setPedido({ tipo: "ataques", titulo, ataques: n, opcoes, resolver }));
  }

  function cancelar() {
    pedido?.resolver(null);
    setPedido(null);
  }

  function semAlvo() {
    pedido?.resolver([]);
    setPedido(null);
  }

  function confirmar() {
    if (pedido?.tipo === "alvos") pedido.resolver(marcados);
    else if (pedido?.tipo === "ataques") {
      pedido.resolver(linhas.flatMap((l) => (l.alvo ? [{ alvo: l.alvo, modo: l.modo }] : [])));
    }
    setPedido(null);
  }

  // Escolher o alvo de um ataque já sugere o mesmo pros seguintes ainda sem
  // alvo, com a vantagem ou desvantagem que as condições dele dão.
  function marcarAlvo(i: number, id: string) {
    const opcoes = pedido?.tipo === "ataques" ? pedido.opcoes : {};
    const alvo = participantes.find((p) => p.id === id);
    const pelaCondicao = modoDoAtaque(
      alvo?.condicoes ?? [],
      opcoes.atacante ?? [],
      opcoes.corpoACorpo ?? true,
    );
    setLinhas((ls) =>
      ls.map((l, j) =>
        j === i || (j > i && l.alvo === null)
          ? { alvo: id, modo: pelaCondicao.modo, motivos: pelaCondicao.motivos }
          : l,
      ),
    );
  }

  function alternarModo(i: number, modo: ModoRolagem) {
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, modo: l.modo === modo ? "normal" : modo } : l)));
  }

  const pronto = pedido?.tipo === "ataques" ? linhas.some((l) => l.alvo) : marcados.length > 0;

  const modal = pedido ? (
    <div className="modal-overlay" onClick={cancelar}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={cancelar} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
        <h2>{pedido.titulo}</h2>
        {pedido.tipo === "alvos" && pedido.opcoes.detalhe && (
          <p className="ataque-detalhe">{pedido.opcoes.detalhe}</p>
        )}

        {pedido.tipo === "alvos" ? (
          <div className="ataques-lista">
            <div className="ataque-linha">
              <div className="ataque-topo">
                <span>{pedido.opcoes.um ? "Marque o alvo" : "Marque um ou mais alvos"}</span>
              </div>
              <div className="ataque-alvos">
                {participantes.filter((p) => pedido.opcoes.so?.(p) ?? true).map((p) => {
                  const marcado = marcados.includes(p.id);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      className={`ataque-alvo${marcado ? " marcado" : ""}`}
                      aria-pressed={marcado}
                      onClick={() =>
                        setMarcados((m) =>
                          marcado ? m.filter((x) => x !== p.id) : pedido.opcoes.um ? [p.id] : [...m, p.id],
                        )
                      }
                    >
                      <Retrato p={p} />
                      {p.voce ? "Você" : p.nome}
                      {marcado && <i className="fas fa-check alvo-marca" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="ataques-lista">
            {linhas.map((linha, i) => (
              <div key={i} className="ataque-linha">
                <div className="ataque-topo">
                  <span>{pedido.ataques > 1 ? `Ataque ${i + 1} de ${pedido.ataques}` : "Alvo"}</span>
                  <span className="ataque-modos" role="group" aria-label="Vantagem ou desvantagem">
                    {(
                      [
                        ["vantagem", "Vantagem", "fa-angles-up"],
                        ["desvantagem", "Desvantagem", "fa-angles-down"],
                      ] as const
                    ).map(([modo, rotulo, icone]) => (
                      <button
                        type="button"
                        key={modo}
                        className={`ataque-modo ${modo}${linha.modo === modo ? " ativo" : ""}`}
                        aria-pressed={linha.modo === modo}
                        onClick={() => alternarModo(i, modo)}
                      >
                        <i className={`fas ${icone}`} /> {rotulo}
                      </button>
                    ))}
                  </span>
                </div>
                {pedido.opcoes.daFicha && pedido.opcoes.daFicha.length > 0 && (
                  <small className="ataque-motivos">
                    <i className="fas fa-dice-d20" /> Já no Rolador · {pedido.opcoes.daFicha.join(" · ")}
                  </small>
                )}
                {linha.motivos.length > 0 && (
                  <small className="ataque-motivos">
                    <i className="fas fa-circle-info" /> {linha.motivos.join(" · ")}
                  </small>
                )}
                <div className="ataque-alvos">
                  {participantes.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className={`ataque-alvo${linha.alvo === p.id ? " marcado" : ""}`}
                      aria-pressed={linha.alvo === p.id}
                      onClick={() => marcarAlvo(i, p.id)}
                    >
                      <Retrato p={p} />
                      {p.voce ? "Você" : p.nome}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="modal-btn-cancel" onClick={semAlvo}>
            Sem alvo
          </button>
          <button type="button" className="modal-btn-save" disabled={!pronto} onClick={confirmar}>
            {pedido.tipo === "ataques" ? (
              <>
                <i className="fas fa-dice-d20" /> Rolar acerto
              </>
            ) : (
              `Confirmar${marcados.length > 0 ? ` (${marcados.length})` : ""}`
            )}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { escolher, escolherAtaques, modal };
}
