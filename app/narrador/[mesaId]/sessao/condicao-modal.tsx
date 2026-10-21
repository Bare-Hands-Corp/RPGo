"use client";

import { useState } from "react";
import { DURACOES_CONDICAO, RODADAS_PADRAO } from "@/lib/condicoes";
import { lerPadroes } from "@/lib/condicoes-mecanica";
import { ATRIBUTOS } from "@/lib/op-rpg";
import {
  useCatalogoCondicoes,
  useCondicaoDoCatalogo,
  useEstiloCondicao,
} from "@/components/tipos-dano/condicoes";

export type CondicaoDoNarrador = {
  nome: string;
  rodadas: number;
  salvaguarda: { atributo: string; cd: number } | null;
};

// Narrador põe uma condição num participante: qual, por quanto tempo e a
// salvaguarda pra sair. Os dois últimos vêm dos padrões da condição na Biblioteca.
export function CondicaoModal({
  nome,
  onAplicar,
  onFechar,
}: {
  nome: string;
  onAplicar: (condicao: CondicaoDoNarrador) => void;
  onFechar: () => void;
}) {
  const condicoes = useCatalogoCondicoes();
  const estilo = useEstiloCondicao();
  const doCatalogo = useCondicaoDoCatalogo();
  const [escolhida, setEscolhida] = useState("");
  const [rodadas, setRodadas] = useState(RODADAS_PADRAO);
  // Salvaguarda pra sair; atributo vazio = sem.
  const [atributo, setAtributo] = useState("");
  const [cd, setCd] = useState("");

  function escolher(c: string) {
    setEscolhida(c);
    const padroes = lerPadroes(doCatalogo(c)?.padroes);
    setRodadas(padroes?.rodadas ?? RODADAS_PADRAO);
    setAtributo(padroes?.saida?.atributo ?? "");
    // "CD de quem aplicou": o narrador escreve a dele.
    setCd(typeof padroes?.saida?.cd === "number" ? String(padroes.saida.cd) : "");
  }

  const cdNum = Math.trunc(Number(cd) || 0);
  const faltaCd = !!atributo && cdNum <= 0;

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
                onClick={() => escolher(c)}
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

        <span className="nv-rotulo">Salvaguarda pra sair</span>
        <div className="condicao-modal-duracoes">
          {[{ slug: "", sigla: "Nenhuma", nome: "Sem salvaguarda" }, ...ATRIBUTOS].map((a) => (
            <button
              type="button"
              key={a.slug}
              title={a.nome}
              className={`nv-btn${atributo === a.slug ? " ativo" : ""}`}
              aria-pressed={atributo === a.slug}
              onClick={() => setAtributo(a.slug)}
            >
              {a.sigla}
            </button>
          ))}
          {atributo && (
            <input
              className="condicao-modal-cd"
              type="number"
              min={1}
              max={40}
              value={cd}
              placeholder="CD"
              aria-label="CD da salvaguarda"
              onChange={(e) => setCd(e.target.value)}
            />
          )}
        </div>
        {atributo && <p className="nv-sub">Repete no fim de cada turno dele; passando, sai.</p>}

        <div className="dano-criatura-rodape">
          <button type="button" className="nv-btn" onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="nv-btn primario"
            disabled={!escolhida || faltaCd}
            title={faltaCd ? "Escreva a CD da salvaguarda" : undefined}
            onClick={() => {
              onAplicar({ nome: escolhida, rodadas, salvaguarda: atributo ? { atributo, cd: cdNum } : null });
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
