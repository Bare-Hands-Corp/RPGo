"use client";

import { useEffect, useRef } from "react";

// Telas dentro da mesma página (lista → ficha → editor) entram no histórico do
// navegador como `?visao=`: voltar (o do navegador ou o BotaoVoltar da página)
// recua uma tela em vez de sair da página.
const CHAVE = "visao";

function urlCom(visao: string | null): string {
  const p = new URLSearchParams(window.location.search);
  if (visao) p.set(CHAVE, visao);
  else p.delete(CHAVE);
  const q = p.toString();
  return `${window.location.pathname}${q ? `?${q}` : ""}`;
}

function visaoDaUrl(): string | null {
  return new URLSearchParams(window.location.search).get(CHAVE);
}

// `mudar` põe a tela pedida pelo histórico; devolver false (alterações sem
// salvar que o usuário quis manter) deixa onde estava.
export function useVisaoNoHistorico<V extends string>(
  inicial: V,
  mudar: (visao: V) => boolean | void | Promise<boolean | void>,
) {
  const mudarRef = useRef(mudar);
  const atual = useRef<V>(inicial);
  useEffect(() => {
    mudarRef.current = mudar;
  });

  useEffect(() => {
    // Recarregou numa tela de dentro: a página abre na inicial.
    if (visaoDaUrl()) window.history.replaceState(null, "", urlCom(null));
    async function ouvir() {
      const pedida = (visaoDaUrl() ?? inicial) as V;
      if (pedida === atual.current) return;
      const ok = await mudarRef.current(pedida);
      if (ok === false) {
        // Fica: devolve a entrada de onde estava.
        window.history.pushState(null, "", urlCom(atual.current === inicial ? null : atual.current));
        return;
      }
      atual.current = pedida;
    }
    window.addEventListener("popstate", ouvir);
    return () => window.removeEventListener("popstate", ouvir);
  }, [inicial]);

  return {
    // Vai pra uma tela nova (empilha).
    abrir(visao: V) {
      atual.current = visao;
      window.history.pushState(null, "", urlCom(visao === inicial ? null : visao));
    },
    // Troca a tela sem empilhar (ex.: salvou o editor e foi pra ficha).
    trocar(visao: V) {
      atual.current = visao;
      window.history.replaceState(null, "", urlCom(visao === inicial ? null : visao));
    },
    // Recua uma tela; sem tela empilhada, vai pra inicial.
    voltar() {
      if (visaoDaUrl()) window.history.back();
      else void mudarRef.current(inicial);
    },
  };
}
