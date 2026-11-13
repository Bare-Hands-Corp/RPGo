// Escolha do narrador de rolar em privado: guardada por mesa neste navegador e
// lida pela Bandeja (useSyncExternalStore). Só cliente; quem grava a rolagem sem
// números é registrarRolagem (somenteNarrador).

const EVENTO = "rpgo:rolagem-privada";
const chave = (sessionId: string) => `rpgo:rolagem-privada:${sessionId}`;

export function lerRolagemPrivada(sessionId: string): boolean {
  try {
    return localStorage.getItem(chave(sessionId)) === "1";
  } catch {
    return false;
  }
}

export function gravarRolagemPrivada(sessionId: string, ligada: boolean) {
  try {
    if (ligada) localStorage.setItem(chave(sessionId), "1");
    else localStorage.removeItem(chave(sessionId));
  } catch {
    // Sem armazenamento (aba privada): vale só até recarregar.
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function assinarRolagemPrivada(aviso: () => void): () => void {
  window.addEventListener(EVENTO, aviso);
  window.addEventListener("storage", aviso);
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener("storage", aviso);
  };
}
