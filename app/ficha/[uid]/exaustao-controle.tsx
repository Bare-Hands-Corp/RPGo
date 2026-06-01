"use client";

import { useOptimistic, useTransition } from "react";
import { patchPersonagem } from "./actions";

type Props = {
  personagemId: string;
  exaustao: number;
};

const MAX_NIVEL = 6;

// Controle compacto de exaustão (0–6) com botões −/+.
export function ExaustaoControle({ personagemId, exaustao }: Props) {
  const [otimista, aplicar] = useOptimistic(exaustao, (_: number, novo: number) => novo);
  const [, startTransition] = useTransition();

  function setNivel(novo: number) {
    const clamped = Math.max(0, Math.min(MAX_NIVEL, novo));
    if (clamped === otimista) return;
    startTransition(async () => {
      aplicar(clamped);
      // Propaga o nível novo pra sidebar e abas refletirem os debuffs de d20 e
      // deslocamento na hora (otimismo cross-componente, sem esperar revalidate).
      window.dispatchEvent(
        new CustomEvent("rpgo:patch-personagem", { detail: { exaustao: clamped } }),
      );
      try {
        await patchPersonagem(personagemId, { exaustao: clamped });
      } catch {
        aplicar(exaustao);
        window.dispatchEvent(
          new CustomEvent("rpgo:patch-personagem", { detail: { exaustao } }),
        );
      }
    });
  }

  return (
    <div
      className={`recurso-linha exaustao-linha ${otimista > 0 ? "ativo" : ""}`}
    >
      <span className="recurso-icone">
        <i className="fas fa-bed" />
      </span>
      <span className="recurso-nome">Exaustão</span>
      <div className="exaustao-controles">
        <button
          type="button"
          className="recurso-btn"
          onClick={() => setNivel(otimista - 1)}
          disabled={otimista <= 0}
          aria-label="Diminuir"
        >
          −
        </button>
        <span className="exaustao-valor">
          {otimista}
          <span className="exaustao-max"> / {MAX_NIVEL}</span>
        </span>
        <button
          type="button"
          className="recurso-btn"
          onClick={() => setNivel(otimista + 1)}
          disabled={otimista >= MAX_NIVEL}
          aria-label="Aumentar"
        >
          +
        </button>
      </div>
    </div>
  );
}
