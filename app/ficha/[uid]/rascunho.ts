// Rascunho de formulário no navegador (localStorage): sobrevive a fechar o
// modal ou recarregar a página, só neste aparelho. Sem acesso ao storage (aba
// anônima, bloqueio), simplesmente não guarda.
export function rascunho<T>(chave: string) {
  return {
    ler(): T | null {
      try {
        const v = localStorage.getItem(chave);
        return v ? (JSON.parse(v) as T) : null;
      } catch {
        return null;
      }
    },
    gravar(valor: T) {
      try {
        localStorage.setItem(chave, JSON.stringify(valor));
      } catch {}
    },
    apagar() {
      try {
        localStorage.removeItem(chave);
      } catch {}
    },
  };
}
