"use client";

import { Children, useState } from "react";
import { TIPOS_DANO, mesmoTipo } from "@/lib/dano";

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
  const indice = opcoes.findIndex((o) => o.valor === valor);
  return (
    <div
      className="seg"
      role="group"
      aria-label={rotulo}
      style={{ "--seg-n": opcoes.length, "--seg-i": Math.max(0, indice) } as React.CSSProperties}
    >
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
      {/* Marca que desliza até a opção ativa. */}
      {indice >= 0 && <span className="seg-pilula" aria-hidden />}
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

// Atalhos em chips; passou do limite, o resto fica atrás de "ver mais".
export function Sugestoes({
  children,
  limite = 7,
  aberto,
  onAberto,
  className,
}: {
  children: React.ReactNode;
  limite?: number;
  // Controlado por quem desmonta os atalhos (campo de fórmula).
  aberto?: boolean;
  onAberto?: (aberto: boolean) => void;
  className?: string;
}) {
  const [local, setLocal] = useState(false);
  const expandido = aberto ?? local;
  const itens = Children.toArray(children);
  // Um chip só a mais não compensa esconder.
  const corta = itens.length > limite + 1;
  return (
    <div className={`sugestoes${className ? ` ${className}` : ""}`}>
      {corta && !expandido ? itens.slice(0, limite) : itens}
      {corta && (
        <button
          type="button"
          className="sugestao sugestao-mais"
          aria-expanded={expandido}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (onAberto ? onAberto(!expandido) : setLocal(!expandido))}
        >
          {expandido ? "ver menos" : `ver mais (${itens.length - limite})`}
        </button>
      )}
    </div>
  );
}

const TIPOS_A_VISTA = 6;

// Tipo de dano em chips: os do livro e "Outro" pra escrever.
export function TipoDanoCampo({
  valor,
  onChange,
  rotulo = "Tipo de dano",
}: {
  valor: string;
  onChange: (tipo: string) => void;
  rotulo?: string;
}) {
  const indice = TIPOS_DANO.findIndex((t) => mesmoTipo(t.nome, valor));
  const proprio = valor.trim() !== "" && indice < 0;
  const [escrevendo, setEscrevendo] = useState(proprio);
  const [aberto, setAberto] = useState(indice >= TIPOS_A_VISTA);
  return (
    <div className="tipo-dano-campo">
      <label>{rotulo}</label>
      <Sugestoes limite={TIPOS_A_VISTA} aberto={aberto} onAberto={setAberto} className="tipo-dano-chips">
        {TIPOS_DANO.map((t, i) => (
          <button
            type="button"
            key={t.nome}
            className={`sugestao tipo-dano-chip${i === indice ? " ativo" : ""}`}
            style={{ "--tipo-cor": t.cor } as React.CSSProperties}
            aria-pressed={i === indice}
            onClick={() => {
              setEscrevendo(false);
              onChange(i === indice ? "" : t.nome);
            }}
          >
            {t.nome}
          </button>
        ))}
        <button
          type="button"
          className={`sugestao tipo-dano-chip${escrevendo ? " ativo" : ""}`}
          aria-pressed={escrevendo}
          onClick={() => {
            if (escrevendo) onChange("");
            else if (indice >= 0) onChange("");
            setEscrevendo(!escrevendo);
          }}
        >
          Outro
        </button>
      </Sugestoes>
      {escrevendo && (
        <input
          type="text"
          value={proprio ? valor : ""}
          maxLength={40}
          autoFocus={!proprio}
          aria-label={rotulo}
          placeholder="Ex: sônico"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
