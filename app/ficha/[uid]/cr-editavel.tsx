"use client";

import { useOptimistic, useState, useTransition } from "react";
import { crBase, formatarMod } from "@/lib/op-rpg";
import { patchPersonagem } from "./actions";

type Props = {
  personagemId: string;
  destreza: number;
  crOutros: number;
  bonusArmadura: number;
};

// Card de CR clicável. Mostra o total (10 + mod_DES + outros + armadura) e
// expande um input pequeno pra editar o bônus "outros". O bônus de armadura
// vem das peças equipadas e não é editável aqui.
export function CrEditavel({ personagemId, destreza, crOutros, bonusArmadura }: Props) {
  const [otimista, aplicar] = useOptimistic(crOutros, (_: number, novo: number) => novo);
  const [, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);

  const total = crBase(destreza, otimista) + bonusArmadura;

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
    >
      <div className="derivado-label">CR</div>
      <div className="derivado-value">{total}</div>
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
