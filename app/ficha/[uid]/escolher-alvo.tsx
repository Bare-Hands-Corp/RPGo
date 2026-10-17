"use client";

import { useState } from "react";
import type { Tripulante } from "./tripulacao-tab";

const avatarDe = (t: { fotoUrl: string | null; id: string }) =>
  t.fotoUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${t.id}`;

type Pedido = {
  titulo: string;
  detalhe?: string;
  opcoes: Tripulante[];
  resolver: (id: string | null) => void;
};

// "Em quem?": grade de avatares de quem joga junto (mesa e subfichas).
// `escolher` resolve com o id ou null.
export function useEscolherAlvo(tripulantes: Tripulante[], personagemId: string) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const aliados = tripulantes.filter((t) => t.id !== personagemId);

  // `comVoce` põe o próprio personagem como primeira opção.
  function escolher(
    titulo: string,
    { comVoce = false, detalhe }: { comVoce?: boolean; detalhe?: string } = {},
  ): Promise<string | null> {
    const voce = comVoce ? tripulantes.filter((t) => t.id === personagemId) : [];
    return new Promise((resolver) =>
      setPedido({ titulo, detalhe, opcoes: [...voce, ...aliados], resolver }),
    );
  }

  function fechar(id: string | null) {
    pedido?.resolver(id);
    setPedido(null);
  }

  const modal = pedido ? (
    <div className="modal-overlay" onClick={() => fechar(null)}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={() => fechar(null)} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
        <h2>{pedido.titulo}</h2>
        {pedido.detalhe && <p className="alvo-detalhe">{pedido.detalhe}</p>}
        <div className="tripulantes-grid alvo-grade">
          {pedido.opcoes.map((t) => {
            const ehVoce = t.id === personagemId;
            return (
              <button
                type="button"
                key={t.id}
                className={`tripulante-card link alvo-opcao${ehVoce ? " voce" : ""}`}
                onClick={() => fechar(t.id)}
              >
                <img className="tripulante-avatar" src={avatarDe(t)} alt="" />
                <span className="tripulante-info">
                  <span className="tripulante-nome">{ehVoce ? "Você" : t.nome}</span>
                  <span className="tripulante-nivel">{t.de ? `de ${t.de}` : `Nível ${t.nivel}`}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  ) : null;

  return { escolher, modal, temAliados: aliados.length > 0 };
}
