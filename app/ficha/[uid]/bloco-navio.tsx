"use client";

// Ficha do navio: o estado pelo dano (Avariado tira 6 nós…), a velocidade que
// sobra e quem comanda (a salvaguarda de estrutura sai da VON dele).

import { useState, useTransition } from "react";
import Swal from "sweetalert2";
import { exigir } from "@/lib/acoes";
import { estadoDoNavio, metrosPorRodada, velocidadeComDano } from "@/lib/navio";
import { definirComandante } from "./actions";

export type NavioDaFicha = {
  comandanteId: string | null;
  // Navio inimigo do narrador: sem comandante da tripulação.
  doNarrador: boolean;
  tripulantes: { id: string; nome: string }[];
};

export function BlocoNavio({
  navioId,
  navio,
  pvAtual,
  pvMax,
  velocidade,
}: {
  navioId: string;
  navio: NavioDaFicha;
  pvAtual: number;
  pvMax: number;
  // A da ficha (velas − peso, com efeitos).
  velocidade: number;
}) {
  const estado = estadoDoNavio(pvAtual, pvMax);
  const agora = velocidadeComDano(velocidade, pvAtual, pvMax);
  const [comandante, setComandante] = useState(navio.comandanteId);
  const [doServidor, setDoServidor] = useState(navio.comandanteId);
  if (navio.comandanteId !== doServidor) {
    setDoServidor(navio.comandanteId);
    setComandante(navio.comandanteId);
  }
  const [, startTransition] = useTransition();

  function escolher(id: string | null) {
    setComandante(id);
    startTransition(async () => {
      try {
        exigir(await definirComandante(navioId, id));
      } catch (err) {
        setComandante(navio.comandanteId);
        void Swal.fire({
          icon: "error",
          title: "Erro",
          text: err instanceof Error ? err.message : "Operação falhou.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      }
    });
  }

  return (
    <div className="bloco-navio">
      <div className="bloco-navio-estado" title={estado.reparo ? `Reparo: ${estado.reparo}` : undefined}>
        <span className={`bloco-navio-selo${estado.reducao > 0 ? " danificado" : ""}`}>{estado.nome}</span>
        {estado.reducao > 0 && <span>−{estado.reducao} nós</span>}
        <span>
          <i className="fas fa-wind" /> {agora} nós · {metrosPorRodada(agora).toLocaleString("pt-BR")} m/rodada
        </span>
      </div>
      {!navio.doNarrador && (
        <div className="bloco-navio-comandante">
          <span>Comandante</span>
          <div className="sugestoes">
            {navio.tripulantes.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`sugestao chip-opcao${comandante === t.id ? " ativo" : ""}`}
                aria-pressed={comandante === t.id}
                onClick={() => escolher(comandante === t.id ? null : t.id)}
              >
                {t.nome}
              </button>
            ))}
            {navio.tripulantes.length === 0 && <small>Ninguém na mesa ainda.</small>}
          </div>
        </div>
      )}
    </div>
  );
}
