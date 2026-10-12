"use client";

// Iniciativa do combate na ficha: quem está envolvido, em que ordem e de quem
// é a vez. No desktop é uma faixa com todos; no celular, uma barra com a vez
// atual que abre a lista. De criatura só aparece o que o narrador liberou.

import { useEffect, useRef, useState } from "react";
import type { CombateVisto, ParticipanteVisto } from "@/lib/combate";

function Avatar({ p, grande = false }: { p: ParticipanteVisto; grande?: boolean }) {
  const classe = `iniciativa-avatar${grande ? " grande" : ""}`;
  return p.foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={classe} src={p.foto} alt="" />
  ) : (
    <span className={`${classe} vazio`} aria-hidden>
      <i className={`fas ${p.tipo === "criatura" ? "fa-skull" : "fa-user"}`} />
    </span>
  );
}

function Barra({ tipo, atual, max }: { tipo: "pv" | "pp"; atual: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (atual / max) * 100)) : 0;
  return (
    <span className={`iniciativa-trilho ${tipo}`} aria-hidden>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

const nomeDe = (p: ParticipanteVisto) => (p.voce ? "Você" : p.nome);

export function IniciativaJogador({ combate }: { combate: CombateVisto }) {
  const [aberta, setAberta] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const lista = useRef<HTMLOListElement>(null);
  const atual = useRef<HTMLLIElement>(null);

  const { participantes, turno } = combate;
  const daVez = participantes[turno] ?? null;
  const proximo = participantes.length > 1 ? participantes[(turno + 1) % participantes.length] : null;
  const detalhe = participantes.find((p) => p.id === detalheId) ?? null;

  // Quem está na vez fica no meio da faixa (só rola a própria faixa, nunca a página).
  useEffect(() => {
    const l = lista.current;
    const a = atual.current;
    if (!l || !a) return;
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    l.scrollTo({ left: a.offsetLeft - (l.clientWidth - a.clientWidth) / 2, behavior: suave ? "smooth" : "auto" });
  }, [turno, combate.id, participantes.length]);

  if (!daVez) return null;

  return (
    <div className={`iniciativa-faixa${daVez.voce ? " sua-vez" : ""}${aberta ? " aberta" : ""}`}>
      <div className="iniciativa-conteudo">
        <span className="iniciativa-rodada" title="Rodada do combate">
          <i className="fas fa-khanda" /> <span>Rodada</span> {combate.rodada}
        </span>

        {/* Celular: a vez atual e a próxima; toca pra ver todos. */}
        <button
          type="button"
          className="iniciativa-resumo"
          aria-expanded={aberta}
          onClick={() => setAberta((v) => !v)}
        >
          <Avatar p={daVez} />
          <span className="iniciativa-resumo-texto">
            <strong>{daVez.voce ? "Sua vez" : `Vez de ${daVez.nome}`}</strong>
            {proximo && <small>Depois: {nomeDe(proximo)}</small>}
          </span>
          <i className={`fas fa-chevron-${aberta ? "up" : "down"}`} />
        </button>

        <ol className="iniciativa-lista" ref={lista}>
          {participantes.map((p, i) => (
            <li key={p.id} ref={i === turno ? atual : undefined}>
              <button
                type="button"
                className={`iniciativa-item ${p.tipo}${i === turno ? " atual" : ""}${p.voce ? " voce" : ""}`}
                aria-current={i === turno ? "true" : undefined}
                title={`${p.nome} · iniciativa ${p.iniciativa}`}
                onClick={() => {
                  setDetalheId(p.id);
                  setAberta(false);
                }}
              >
                <span className="iniciativa-posicao">{i + 1}</span>
                <Avatar p={p} />
                <span className="iniciativa-item-texto">
                  <span className="iniciativa-nome">{nomeDe(p)}</span>
                  {(p.pv || p.cr != null) && (
                    <span className="iniciativa-meta">
                      {p.pv && (
                        <>
                          <Barra tipo="pv" atual={p.pv.atual} max={p.pv.max} />
                          {p.pv.atual}/{p.pv.max}
                        </>
                      )}
                      {p.cr != null && <span>CR {p.cr}</span>}
                    </span>
                  )}
                </span>
                {i === turno && <span className="iniciativa-selo">vez</span>}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {detalhe && (
        <div className="modal-overlay" onClick={() => setDetalheId(null)}>
          <div className="modal-box iniciativa-detalhe" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setDetalheId(null)} aria-label="Fechar">
              <i className="fas fa-times" />
            </button>
            <div className="iniciativa-detalhe-topo">
              <Avatar p={detalhe} grande />
              <div>
                <h2>{detalhe.nome}</h2>
                <p>
                  {detalhe.voce ? "Você" : detalhe.tipo === "criatura" ? "Criatura" : "Jogador"} · iniciativa{" "}
                  {detalhe.iniciativa}
                </p>
              </div>
            </div>

            {(detalhe.pv || detalhe.pp || detalhe.cr != null) && (
              <div className="iniciativa-detalhe-stats">
                {detalhe.pv && (
                  <div>
                    <span>
                      <i className="fas fa-heart" /> PV {detalhe.pv.atual}/{detalhe.pv.max}
                    </span>
                    <Barra tipo="pv" atual={detalhe.pv.atual} max={detalhe.pv.max} />
                  </div>
                )}
                {detalhe.pp && (
                  <div>
                    <span>
                      <i className="fas fa-bolt" /> PP {detalhe.pp.atual}/{detalhe.pp.max}
                    </span>
                    <Barra tipo="pp" atual={detalhe.pp.atual} max={detalhe.pp.max} />
                  </div>
                )}
                {detalhe.cr != null && (
                  <div>
                    <span>
                      <i className="fas fa-shield-halved" /> Classe de Resistência {detalhe.cr}
                    </span>
                  </div>
                )}
              </div>
            )}

            {detalhe.tipo === "criatura" && !detalhe.pv && !detalhe.pp && detalhe.cr == null && !detalhe.acoes && (
              <p className="iniciativa-detalhe-vazio">O narrador ainda não revelou nada desta criatura.</p>
            )}

            {detalhe.acoes && (
              <div className="iniciativa-detalhe-acoes">
                <h3>Ações que você já viu</h3>
                {detalhe.acoes.length === 0 ? (
                  <p className="iniciativa-detalhe-vazio">Nenhuma ainda.</p>
                ) : (
                  detalhe.acoes.map((a) => (
                    <div key={a.id} className="iniciativa-acao">
                      <div className="iniciativa-acao-topo">
                        <strong>{a.nome || "(sem nome)"}</strong>
                        {a.categoria && <span>{a.categoria}</span>}
                      </div>
                      {a.stats.length > 0 && (
                        <div className="iniciativa-acao-stats">
                          {a.stats.map((s, i) => (
                            <span key={i}>{s}</span>
                          ))}
                        </div>
                      )}
                      {a.descricao && <p>{a.descricao}</p>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
