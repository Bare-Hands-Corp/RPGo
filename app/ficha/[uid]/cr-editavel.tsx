"use client";

import { useOptimistic, useState, useTransition } from "react";
import { crBase, formatarMod } from "@/lib/op-rpg";
import { patchPersonagem } from "./actions";

type Props = {
  personagemId: string;
  // Pontuação do atributo que a CR usa (DES por padrão, ou outro se uma
  // habilidade substituiu). Já vem com a penalidade de DES da armadura embutida
  // quando o atributo é DES (via `atributosParaTeste` no pai).
  atributoScore: number;
  crOutros: number;
  // Bônus fixo somado à CR: CA das armaduras equipadas + bônus de habilidade.
  bonusFixo: number;
  // Sigla do atributo usado, mostrada só quando substituído (ex: "FOR").
  siglaSubstituida?: string;
  // Tooltip com as fontes (substituição, penalidade de DES…).
  titulo?: string;
  // Marca amarela quando a penalidade de DES da armadura está reduzindo a CR.
  reduzido?: boolean;
};

// Card de CR clicável. Mostra o total (10 + mod_atributo + outros + fixo) e
// expande um input pequeno pra editar o bônus "outros". CA/penalidade vêm das
// peças equipadas; o atributo pode ser trocado por habilidade.
export function CrEditavel({
  personagemId,
  atributoScore,
  crOutros,
  bonusFixo,
  siglaSubstituida,
  titulo,
  reduzido,
}: Props) {
  const [otimista, aplicar] = useOptimistic(crOutros, (_: number, novo: number) => novo);
  const [, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);

  const total = crBase(atributoScore, otimista) + bonusFixo;

  function commit(raw: string) {
    setEditando(false);
    const trim = raw.trim();
    if (!trim) return;
    let novo: number;
    if (trim.startsWith("+") || trim.startsWith("-")) {
      const n = Number(trim);
      if (Number.isNaN(n)) return;
      novo = trim.length === 1 ? otimista : otimista + n;
    } else {
      novo = Number(trim);
      if (Number.isNaN(novo)) return;
    }
    novo = Math.trunc(novo);
    if (novo === otimista) return;
    startTransition(async () => {
      aplicar(novo);
      try {
        await patchPersonagem(personagemId, { crOutros: novo });
      } catch {
        aplicar(crOutros);
      }
    });
  }

  return (
    <div
      className="derivado-card cr-editavel"
      onClick={() => !editando && setEditando(true)}
      role="button"
      tabIndex={0}
      title={titulo}
    >
      <div className="derivado-label">
        CR
        {siglaSubstituida && (
          <span className="cr-atributo-sub" title={titulo}>
            {" "}
            {siglaSubstituida}
          </span>
        )}
      </div>
      <div className={`derivado-value ${reduzido ? "valor-exausto" : ""}`}>{total}</div>
      {editando ? (
        <input
          type="text"
          autoFocus
          defaultValue=""
          placeholder={formatarMod(otimista)}
          className="cr-outros-input"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") setEditando(false);
          }}
        />
      ) : (
        otimista !== 0 && (
          <div className="cr-outros-tag">{formatarMod(otimista)}</div>
        )
      )}
    </div>
  );
}
