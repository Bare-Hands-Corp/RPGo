"use client";

import { useEffect, useRef, useState } from "react";

// Nível de exaustão "otimista" compartilhado entre a sidebar e as abas. O
// ExaustaoControle dispara `rpgo:patch-personagem` com `{ exaustao }` (absoluto)
// ao mudar, e usos (Sobrecarga, efeitos) mandam `{ deltaExaustao }`; todo
// consumidor (perícias, ações, inventário) reflete na hora, sem esperar o
// revalidate/realtime. Quando o servidor traz a verdade nova (prop `server`
// muda), reseta pra ela — ajuste de estado no render (sem set-state-in-effect).
export function useExaustaoOtimista(server: number): number {
  const [otimista, setOtimista] = useState(server);
  const [anterior, setAnterior] = useState(server);
  if (anterior !== server) {
    setAnterior(server);
    setOtimista(server);
  }

  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<{ exaustao?: number; deltaExaustao?: number }>).detail;
      if (!det) return;
      if (typeof det.exaustao === "number") setOtimista(det.exaustao);
      if (typeof det.deltaExaustao === "number") {
        const delta = det.deltaExaustao;
        setOtimista((v) => Math.min(6, Math.max(0, v + delta)));
      }
    }
    window.addEventListener("rpgo:patch-personagem", ouvir);
    return () => window.removeEventListener("rpgo:patch-personagem", ouvir);
  }, []);

  return otimista;
}

// PP atual "otimista": soma os `deltaPpAtual` dos usos até o servidor responder.
export function usePpOtimista(server: number, max: number): number {
  const [otimista, setOtimista] = useState(server);
  const [anterior, setAnterior] = useState(server);
  if (anterior !== server) {
    setAnterior(server);
    setOtimista(server);
  }
  const maxRef = useRef(max);
  useEffect(() => {
    maxRef.current = max;
  }, [max]);

  useEffect(() => {
    function ouvir(e: Event) {
      const delta = (e as CustomEvent<{ deltaPpAtual?: number }>).detail?.deltaPpAtual;
      if (typeof delta !== "number") return;
      setOtimista((v) =>
        delta > 0 ? Math.max(v, Math.min(v + delta, maxRef.current)) : Math.max(0, v + delta),
      );
    }
    window.addEventListener("rpgo:patch-personagem", ouvir);
    return () => window.removeEventListener("rpgo:patch-personagem", ouvir);
  }, []);

  return otimista;
}
