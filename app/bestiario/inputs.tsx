"use client";

import { useState } from "react";

export function listaParaTexto(lista: string[]) {
  return lista.join(", ");
}

export function textoParaLista(texto: string) {
  return texto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Input numérico controlado que não força "0" de volta na caixa enquanto o
// campo está sendo editado. Confirma em toda tecla válida (não só ao sair do
// campo) — sem isso, editar e clicar direto num botão de salvar sem o campo
// perder o foco primeiro descartava o valor digitado. A única exceção é texto
// vazio: não comita nada enquanto o campo estiver vazio, e só normaliza
// (vazio -> 0 ou null) no blur — sem essa exceção, apagar o valor pra digitar
// de novo faria o "0" reaparecer no meio da digitação e virar "015".
type NumeroInputProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  allowNull?: boolean;
};

export function NumeroInput({ value, onChange, allowNull = false }: NumeroInputProps) {
  const [texto, setTexto] = useState(value === null ? "" : String(value));
  const [valorSincronizado, setValorSincronizado] = useState(value);

  // Ajusta o texto quando o `value` externo muda (troca de criatura
  // selecionada) sem useEffect — recalcula durante o render, não depois.
  if (value !== valorSincronizado) {
    setValorSincronizado(value);
    setTexto(value === null ? "" : String(value));
  }

  return (
    <input
      type="number"
      value={texto}
      onChange={(e) => {
        const novoTexto = e.target.value;
        setTexto(novoTexto);
        if (novoTexto.trim() === "") return;
        const numero = Number(novoTexto);
        if (Number.isFinite(numero)) onChange(numero);
      }}
      onBlur={() => {
        if (texto.trim() === "") {
          const valorFinal = allowNull ? null : 0;
          setTexto(valorFinal === null ? "" : String(valorFinal));
          onChange(valorFinal);
          return;
        }
        const numero = Number(texto);
        const valorFinal = Number.isFinite(numero) ? numero : 0;
        setTexto(String(valorFinal));
        onChange(valorFinal);
      }}
    />
  );
}

// Input de lista (tags, tipos de dano, resistências...) controlado por texto
// livre separado por vírgula. Mesmo problema do NumeroInput: se re-derivar a
// lista a cada tecla, a vírgula digitada é cortada na hora (o "value" reaparece
// sem ela antes do usuário conseguir digitar o próximo item). Só converte pra
// array ao sair do campo.
type ListaTextoInputProps = {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  list?: string;
};

export function ListaTextoInput({ value, onChange, placeholder, list }: ListaTextoInputProps) {
  const [texto, setTexto] = useState(listaParaTexto(value));
  const [valorSincronizado, setValorSincronizado] = useState(value);

  if (value !== valorSincronizado) {
    setValorSincronizado(value);
    setTexto(listaParaTexto(value));
  }

  return (
    <input
      list={list}
      placeholder={placeholder}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const lista = textoParaLista(texto);
        setTexto(listaParaTexto(lista));
        onChange(lista);
      }}
    />
  );
}
