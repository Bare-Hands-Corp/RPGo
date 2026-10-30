"use client";

import { useEffect, useState } from "react";

// Contagem regressiva em segundos (espera pra reenviar o código).
export function useContagem(inicial = 0) {
  const [restante, setRestante] = useState(inicial);
  useEffect(() => {
    if (restante <= 0) return;
    const t = setTimeout(() => setRestante((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [restante]);
  return [restante, setRestante] as const;
}
