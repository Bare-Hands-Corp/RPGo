"use client";

import { useCallback } from "react";
import { unstable_isUnrecognizedActionError, useRouter } from "next/navigation";
import { atualizarPagina } from "./atualizar-pagina";

const ESPERA_RETENTATIVA_MS = 3000;

// Timer único da página: vários ouvintes montados viram um refresh só.
let pendente: ReturnType<typeof setTimeout> | null = null;

function agendar(esperaMs: number, acao: () => void) {
  if (pendente) return;
  pendente = setTimeout(() => {
    pendente = null;
    acao();
  }, esperaMs);
}

// Junta eventos próximos num refresh só. Usa server action porque router.refresh()
// com fetch falho (rede, 5xx) recarrega a página inteira.
export function useRefreshAgrupado(esperaMs = 300) {
  const router = useRouter();

  return useCallback(() => {
    const atualizar = async (retentar: boolean) => {
      try {
        await atualizarPagina();
      } catch (e) {
        // Deploy novo: a action antiga sumiu, então carrega a versão nova.
        if (unstable_isUnrecognizedActionError(e)) router.refresh();
        else if (retentar) agendar(ESPERA_RETENTATIVA_MS, () => void atualizar(false));
      }
    };
    agendar(esperaMs, () => void atualizar(true));
  }, [router, esperaMs]);
}
