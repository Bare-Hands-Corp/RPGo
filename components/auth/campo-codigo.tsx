"use client";

import { useState } from "react";
import { TAMANHO_CODIGO } from "@/lib/auth";

// Código de 6 dígitos: um input real (colar e autopreencher funcionam) desenhado como casas.
export function CampoCodigo({
  valor,
  onChange,
  onCompleto,
  disabled,
}: {
  valor: string;
  onChange: (v: string) => void;
  onCompleto?: (v: string) => void;
  disabled?: boolean;
}) {
  const [focado, setFocado] = useState(false);
  const ativo = Math.min(valor.length, TAMANHO_CODIGO - 1);

  function mudar(texto: string) {
    const limpo = texto.replace(/\D/g, "").slice(0, TAMANHO_CODIGO);
    onChange(limpo);
    if (limpo.length === TAMANHO_CODIGO && limpo !== valor) onCompleto?.(limpo);
  }

  const casa = (i: number) => (
    <span key={i} className={`campo-codigo-casa${focado && i === ativo ? " ativa" : ""}`}>
      {valor[i] ?? ""}
    </span>
  );

  return (
    <div className={`campo-codigo${disabled ? " desativado" : ""}`}>
      <input
        aria-label="Código de 6 dígitos"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={TAMANHO_CODIGO}
        value={valor}
        onChange={(e) => mudar(e.target.value)}
        onFocus={() => setFocado(true)}
        onBlur={() => setFocado(false)}
        readOnly={disabled}
        autoFocus
      />
      {[0, 1, 2].map(casa)}
      <span className="campo-codigo-traco" aria-hidden>–</span>
      {[3, 4, 5].map(casa)}
    </div>
  );
}
