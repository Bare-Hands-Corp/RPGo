"use client";

import { useState, useRef, useEffect } from "react";
import { patchPersonagem } from "./actions";

type Props = {
  personagemId: string;
  campo: string; // ex: "hpAtual" | "ppAtual" | "nivel" | "cargaMaxima"
  valor: number;
  max?: number; // se definido, clampa
};

// Click no número → input com mesmo tamanho. Aceita +/- delta ou valor absoluto.
// Salva no blur ou enter. Optimistic update.
export function EditableStat({ personagemId, campo, valor, max }: Props) {
  const [editando, setEditando] = useState(false);
  const [otimista, setOtimista] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sincroniza estado otimista quando o valor real (vindo do server) muda.
  useEffect(() => {
    setOtimista(null);
  }, [valor]);

  const valorAtual = otimista ?? valor;

  useEffect(() => {
    if (editando) inputRef.current?.focus();
  }, [editando]);

  function calcularNovo(entrada: string): number | null {
    const trim = entrada.trim();
    if (!trim) return null;
    let novo: number;
    if (trim.startsWith("+") || trim.startsWith("-")) {
      const delta = Number(trim);
      if (Number.isNaN(delta)) return null;
      novo = valorAtual + delta;
    } else {
      novo = Number(trim);
      if (Number.isNaN(novo)) return null;
    }
    if (max != null && novo > max) novo = max;
    if (novo < 0) novo = 0;
    return novo;
  }

  async function salvar() {
    const entrada = inputRef.current?.value ?? "";
    setEditando(false);
    const novo = calcularNovo(entrada);
    if (novo == null || novo === valorAtual) return;

    setOtimista(novo);
    try {
      await patchPersonagem(personagemId, { [campo]: novo });
    } catch {
      setOtimista(null);
    }
  }

  if (editando) {
    return (
      <input
        ref={inputRef}
        type="text"
        defaultValue=""
        placeholder={String(valorAtual)}
        className="input-edit-stat"
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setEditando(false);
          }
        }}
      />
    );
  }

  return (
    <span
      className="editable-num"
      onClick={() => setEditando(true)}
      role="button"
      tabIndex={0}
    >
      {valorAtual}
    </span>
  );
}
