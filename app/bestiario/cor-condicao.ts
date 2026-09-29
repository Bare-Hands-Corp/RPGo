// Cor determinística por nome de condição — sem campo de cor no banco, dá pra
// dar consistência visual (a mesma condição sempre com a mesma cor em toda
// a UI) só com um hash simples numa paleta fixa.
const PALETA = [
  "#e05555", // vermelho
  "#e0a555", // laranja
  "#d4c445", // amarelo
  "#6fbf6f", // verde
  "#4fb8c4", // ciano
  "#5a8fe0", // azul
  "#a06fe0", // roxo
  "#e068b8", // rosa
];

export function corDaCondicao(nome: string): string {
  let hash = 0;
  for (let i = 0; i < nome.length; i += 1) {
    hash = (hash * 31 + nome.charCodeAt(i)) >>> 0;
  }
  return PALETA[hash % PALETA.length];
}
