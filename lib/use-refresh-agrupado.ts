"use client";

import { useCallback } from "react";
import { unstable_isUnrecognizedActionError, useRouter } from "next/navigation";
import { atualizarPagina } from "./atualizar-pagina";
import { ehEcoLocal } from "./mutacao-local";

const ESPERA_RETENTATIVA_MS = 3000;
const ESPERA_ECO_MS = 700;

// Timer único da página: vários ouvintes montados viram um refresh só.
let pendente: ReturnType<typeof setTimeout> | null = null;
// O refresh agendado só junta ecos de action desta aba (lib/mutacao-local.ts).
let soEco = true;

function agendar(esperaMs: number, acao: () => void, eco: boolean) {
  if (!eco) soEco = false;
  if (pendente) return;
  let adiado = false;
  const disparar = () => {
    // Eco que chegou antes da resposta da action: espera ela voltar uma vez.
    if (soEco && !ehEcoLocal() && !adiado) {
      adiado = true;
      pendente = setTimeout(disparar, ESPERA_ECO_MS);
      return;
    }
    pendente = null;
    const pular = soEco && ehEcoLocal();
    soEco = true;
    if (!pular) acao();
  };
  pendente = setTimeout(disparar, esperaMs);
}

// Junta eventos próximos num refresh só. Usa server action porque router.refresh()
// com fetch falho (rede, 5xx) recarrega a página inteira. `eco`: a tabela só muda
// por action que já revalida a página, então o eco da própria aba não refaz nada.
export function useRefreshAgrupado(esperaMs = 300, eco = false) {
  const router = useRouter();

  return useCallback(() => {
    const atualizar = async (retentar: boolean) => {
      try {
        await atualizarPagina();
      } catch (e) {
        // Deploy novo: a action antiga sumiu, então carrega a versão nova.
        if (unstable_isUnrecognizedActionError(e)) router.refresh();
        else if (retentar) agendar(ESPERA_RETENTATIVA_MS, () => void atualizar(false), false);
      }
    };
    agendar(esperaMs, () => void atualizar(true), eco);
  }, [router, esperaMs, eco]);
}
