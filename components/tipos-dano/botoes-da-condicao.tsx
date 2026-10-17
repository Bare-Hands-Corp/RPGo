"use client";

// Botões que a condição dá a quem está com ela: "me movi" (dano ao se mover)
// e as ações dela (Apagar, Tratar). Vão dentro do ChipCondicao.

import { mecanicaDa, textoDaAcao, type AcaoDaCondicao, type CondicaoComMecanica } from "@/lib/condicoes-mecanica";

export function BotoesDaCondicao({
  condicao,
  onAcao,
  onMover,
}: {
  condicao: CondicaoComMecanica;
  onAcao: (indice: number, acao: AcaoDaCondicao) => void;
  onMover: () => void;
}) {
  const m = mecanicaDa(condicao);
  if (!m) return null;
  return (
    <>
      {m.dano?.quando === "movimento" && (
        <button
          type="button"
          className="condicao-chip-botao"
          title={`Se moveu: ${m.dano.formula}${m.dano.tipo ? ` ${m.dano.tipo}` : ""} (uma vez por turno)`}
          aria-label={`Se moveu com ${condicao.nome}`}
          onClick={onMover}
        >
          <i className="fas fa-person-walking" />
        </button>
      )}
      {(m.acoes ?? []).map((a, i) => (
        <button
          type="button"
          key={i}
          className="condicao-chip-botao com-texto"
          title={textoDaAcao(a)}
          onClick={() => onAcao(i, a)}
        >
          {a.nome}
        </button>
      ))}
    </>
  );
}
