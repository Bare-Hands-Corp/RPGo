"use client";

import { useSyncExternalStore, type ReactNode } from "react";

// Avisa as seções quando uma delas muda (o evento `storage` só vem de outras abas).
const EVENTO = "rpgo:secao-recolhida";

function assinar(avisar: () => void) {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

function lerRecolhida(storage: string): boolean {
  try {
    return localStorage.getItem(storage) === "1";
  } catch {
    return false;
  }
}

// Seção de uma aba (tipo de ação, origem de habilidade) que recolhe clicando
// no título. Lembra, neste aparelho, quais estão recolhidas. Buscando ou
// filtrando, todas abrem pra mostrar o que casou.
export function SecaoRecolhivel({
  chave,
  icone,
  cor,
  titulo,
  contagem,
  forcarAberta,
  zona,
  recebendo,
  children,
}: {
  chave: string;
  icone: string;
  cor: string;
  titulo: string;
  contagem?: number;
  forcarAberta?: boolean;
  // Recebe um item arrastado (lib/use-reordenar.ts) mesmo fechada; `recebendo` marca quando é ela.
  zona?: object;
  recebendo?: boolean;
  children: ReactNode;
}) {
  const storage = `rpgo:secao:${chave}`;
  // No servidor, aberta; no cliente, o que ficou guardado.
  const recolhida = useSyncExternalStore(
    assinar,
    () => lerRecolhida(storage),
    () => false,
  );

  function alternar() {
    try {
      if (recolhida) localStorage.removeItem(storage);
      else localStorage.setItem(storage, "1");
    } catch {}
    window.dispatchEvent(new Event(EVENTO));
  }

  const aberta = forcarAberta || !recolhida;
  return (
    <section className={`secao-recolhivel${aberta ? "" : " recolhida"}${recebendo ? " recebendo" : ""}`} {...zona}>
      <button
        type="button"
        className="section-header secao-recolhivel-topo"
        aria-expanded={aberta}
        onClick={alternar}
        disabled={forcarAberta}
      >
        <i className={`fas ${icone}`} style={{ color: cor }} />
        <h3>{titulo}</h3>
        {contagem != null && <span className="secao-recolhivel-contagem">({contagem})</span>}
        <i className="fas fa-chevron-down secao-recolhivel-seta" />
      </button>
      {aberta && children}
    </section>
  );
}
