"use client";

import { useEffect, useRef, useState } from "react";

// Nível de exaustão "otimista" compartilhado entre a sidebar e as abas. O
// ExaustaoControle dispara `rpgo:patch-personagem` com `{ exaustao }` (absoluto)
// ao mudar; todo consumidor (perícias, ações, inventário) reflete na hora, sem
// esperar o revalidate/realtime. Quando o servidor traz a verdade nova (prop
// `server` muda), reseta pra ela — ajuste de estado no render (sem
// set-state-in-effect).
export function useExaustaoOtimista(server: number): number {
  const [otimista, setOtimista] = useState(server);
  const ultimoServer = useRef(server);
  if (ultimoServer.current !== server) {
    ultimoServer.current = server;
    setOtimista(server);
  }

  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<{ exaustao?: number }>).detail;
      if (det && typeof det.exaustao === "number") setOtimista(det.exaustao);
    }
    window.addEventListener("rpgo:patch-personagem", ouvir);
    return () => window.removeEventListener("rpgo:patch-personagem", ouvir);
  }, []);

  return otimista;
}
