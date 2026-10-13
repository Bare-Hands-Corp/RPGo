"use client";

import { useState } from "react";
import { DURACOES_CONDICAO, RODADAS_PADRAO } from "@/lib/condicoes";
import { useCatalogoCondicoes, useEstiloCondicao } from "@/components/tipos-dano/condicoes";

// Narrador põe uma condição num participante: qual e por quanto tempo.
export function CondicaoModal({
  nome,
  onAplicar,
  onFechar,
}: {
  nome: string;
  onAplicar: (condicao: { nome: string; rodadas: number }) => void;
  onFechar: () => void;
}) {
  const condicoes = useCatalogoCondicoes();
  const estilo = useEstiloCondicao();
  const [escolhida, setEscolhida] = useState("");
  const [rodadas, setRodadas] = useState(RODADAS_PADRAO);

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-box condicao-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onFechar} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
        <h2>Condição em {nome}</h2>

        <span className="nv-rotulo">Qual</span>
        <div className="condicao-modal-lista">
          {condicoes.map((c) => {
            const cara = estilo(c);
            return (
              <button
                type="button"
                key={c}
                className={`condicao-opcao ${cara.className}${escolhida === c ? " ativo" : ""}`}
                style={cara.style}
                aria-pressed={escolhida === c}
                title={cara.descricao || undefined}
                onClick={() => setEscolhida(c)}
              >
                <span className="fx-texto">{c}</span>
              </button>
            );
          })}
        </div>

        <span className="nv-rotulo">Por quanto tempo</span>
        <div className="condicao-modal-duracoes">
          {DURACOES_CONDICAO.map((d) => (
            <button
              type="button"
              key={d.rodadas}
              className={`nv-btn${rodadas === d.rodadas ? " ativo" : ""}`}
              aria-pressed={rodadas === d.rodadas}
              onClick={() => setRodadas(d.rodadas)}
            >
              {d.nome}
            </button>
          ))}
        </div>
        <p className="nv-sub">
          Uma rodada termina quando voltar a vez de quem está jogando agora. Um minuto são 10 rodadas.
        </p>

        <div className="dano-criatura-rodape">
          <button type="button" className="nv-btn" onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="nv-btn primario"
            disabled={!escolhida}
            onClick={() => {
              onAplicar({ nome: escolhida, rodadas });
              onFechar();
            }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
