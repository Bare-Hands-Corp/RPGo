// Última ficha aberta neste aparelho; o "Abrir" das novidades volta pra ela.
const CHAVE = "rpgo:ultima-ficha";

export function lembrarUltimaFicha(id: string) {
  try {
    localStorage.setItem(CHAVE, id);
  } catch {}
}

export function lerUltimaFicha(): string | null {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}
