"use client";

import { useEffect, useRef, useState } from "react";

const ESPERA_MS = 600;

type NaFila<T> = { valor: T; timer: ReturnType<typeof setTimeout> };

// Cliques seguidos no mesmo item viram uma gravação só: a tela muda na hora e o
// servidor recebe o último valor quando os cliques param. `gravar` chama
// `soltar` dentro da transição dele, pra tela não voltar antes da resposta.
export function useGravacaoAgrupada<T>(gravar: (id: string, valor: T) => void) {
  const [naTela, setNaTela] = useState<Record<string, T>>({});
  const fila = useRef(new Map<string, NaFila<T>>());
  const gravarAtual = useRef(gravar);
  useEffect(() => {
    gravarAtual.current = gravar;
  });

  function enviar(id: string) {
    const pendente = fila.current.get(id);
    if (!pendente) return;
    fila.current.delete(id);
    clearTimeout(pendente.timer);
    gravarAtual.current(id, pendente.valor);
  }

  function mudar(id: string, valor: T) {
    const atual = fila.current.get(id);
    if (atual) clearTimeout(atual.timer);
    fila.current.set(id, { valor, timer: setTimeout(() => enviar(id), ESPERA_MS) });
    setNaTela((m) => ({ ...m, [id]: valor }));
  }

  // Tira o valor da tela, a não ser que um clique mais novo já tenha trocado.
  function soltar(id: string, valor: T) {
    setNaTela((m) => {
      if (m[id] !== valor) return m;
      const resto = { ...m };
      delete resto[id];
      return resto;
    });
  }

  // Saindo da ficha com clique na fila: grava na hora.
  useEffect(() => {
    const pendentes = fila.current;
    const gravarAgora = gravarAtual;
    return () => {
      for (const [id, { valor, timer }] of pendentes) {
        clearTimeout(timer);
        gravarAgora.current(id, valor);
      }
      pendentes.clear();
    };
  }, []);

  return { naTela, mudar, soltar };
}
