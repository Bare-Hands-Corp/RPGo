// Fim da última action desta aba que deu certo. A action já volta com a página
// revalidada; o eco dela no realtime não precisa refazer a página de novo.

const JANELA_ECO_MS = 1500;

let ultima = 0;

export function marcarMutacaoLocal() {
  ultima = Date.now();
}

export function ehEcoLocal(): boolean {
  return Date.now() - ultima < JANELA_ECO_MS;
}
