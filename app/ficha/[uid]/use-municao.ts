"use client";

import { useEffect, useState } from "react";
import { EVENTO_GASTAR_MUNICAO, type GastoMunicao } from "@/lib/municao";

// Munição gasta no cliente, por item, até o servidor trazer a quantidade nova.
export function useGastoMunicao(itens: unknown): (id: string) => number {
  const [gasto, setGasto] = useState<Record<string, number>>({});
  const [anterior, setAnterior] = useState(itens);
  if (anterior !== itens) {
    setAnterior(itens);
    setGasto({});
  }
  useEffect(() => {
    function ouvir(e: Event) {
      const d = (e as CustomEvent<GastoMunicao>).detail;
      if (!d?.id) return;
      setGasto((g) => ({ ...g, [d.id]: (g[d.id] ?? 0) + d.quantidade }));
    }
    window.addEventListener(EVENTO_GASTAR_MUNICAO, ouvir);
    return () => window.removeEventListener(EVENTO_GASTAR_MUNICAO, ouvir);
  }, []);
  return (id) => gasto[id] ?? 0;
}
