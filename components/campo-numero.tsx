"use client";

import { useState, type InputHTMLAttributes } from "react";

// Número que deixa apagar e redigitar; vazio volta ao último valor ao sair.
export function CampoNumero({
  valor,
  onChange,
  onBlur,
  ...resto
}: {
  valor: number;
  onChange: (n: number) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  return (
    <input
      autoComplete="off"
      {...resto}
      type="number"
      value={rascunho ?? String(Number.isFinite(valor) ? valor : 0)}
      onChange={(e) => {
        setRascunho(e.target.value);
        if (e.target.value.trim() !== "") onChange(Number(e.target.value) || 0);
      }}
      onBlur={(e) => {
        setRascunho(null);
        onBlur?.(e);
      }}
    />
  );
}
