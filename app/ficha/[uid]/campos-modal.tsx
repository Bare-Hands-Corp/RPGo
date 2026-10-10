"use client";

import { useState } from "react";

export type OpcaoSegmento<T extends string | number> = {
  valor: T;
  rotulo: string;
  // Linha menor embaixo do rótulo.
  sub?: string;
  titulo?: string;
  // Fica apagada, mas ainda clica (ex.: grau acima do nível).
  apagada?: boolean;
};

// Escolha única em segmentos colados.
export function Segmentos<T extends string | number>({
  opcoes,
  valor,
  onChange,
  rotulo,
}: {
  opcoes: OpcaoSegmento<T>[];
  valor: T;
  onChange: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div className="seg" role="group" aria-label={rotulo}>
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            type="button"
            key={String(o.valor)}
            className={`seg-opcao${ativo ? " ativo" : ""}${o.apagada ? " apagada" : ""}`}
            aria-pressed={ativo}
            title={o.titulo}
            onClick={() => onChange(o.valor)}
          >
            <span className="seg-rotulo">{o.rotulo}</span>
            {o.sub && <span className="seg-sub">{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Número com − e +; o rascunho deixa apagar e redigitar.
export function CampoPasso({
  valor,
  onChange,
  rotulo,
  min = 0,
  max = 9999,
  disabled = false,
}: {
  valor: number;
  onChange: (n: number) => void;
  rotulo: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const limitar = (n: number) => Math.min(max, Math.max(min, Math.trunc(n) || 0));
  return (
    <div className={`passo${disabled ? " desligado" : ""}`}>
      <button
        type="button"
        onClick={() => onChange(limitar(valor - 1))}
        disabled={disabled || valor <= min}
        aria-label={`Menos ${rotulo}`}
      >
        <i className="fas fa-minus" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={rascunho ?? String(valor)}
        disabled={disabled}
        aria-label={rotulo}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setRascunho(e.target.value);
          if (e.target.value.trim() !== "") onChange(limitar(Number(e.target.value)));
        }}
        onBlur={() => setRascunho(null)}
      />
      <button
        type="button"
        onClick={() => onChange(limitar(valor + 1))}
        disabled={disabled || valor >= max}
        aria-label={`Mais ${rotulo}`}
      >
        <i className="fas fa-plus" />
      </button>
    </div>
  );
}
