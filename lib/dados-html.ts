// Resultado de rolagem em HTML: dados desenhados (SVG com cantos arredondados),
// agrupados por tipo e com colapso (<details>, sem JS) quando fica grande.
// Puro: serve cliente e servidor. A string vai pro chat (dangerouslySetInnerHTML),
// então só entram números e textos fixos — nada vindo do jogador.
// As cores vêm de variáveis do tema (classes .rd-* em bandeja.css).

export type DadoVisual = {
  faces: number;
  sinal: 1 | -1;
  // Valor que conta no total (já com vantagem, piso e dado mínimo aplicados).
  valor: number;
  // Força o destaque (crítico do d20); sem isso, face máxima = sucesso e 1 = falha.
  destaque?: "sucesso" | "falha" | null;
  // Valores que não contam, riscados ao lado (d20 descartado, valor antes do piso).
  riscados?: { valor: number; titulo?: string }[];
  // Dados de explosão que somam ao dado.
  extras?: number[];
};

// A partir de quanto o resultado vira resumo clicável.
export const LIMITE_DADOS_GRUPO = 6;
export const LIMITE_DADOS_TOTAL = 12;
export const LIMITE_GRUPOS = 4;

// Junta termos vizinhos iguais, mantendo a ordem ("6d6 + 2d8 - 1d4").
export function agruparConsecutivos<T extends { faces: number; sinal: 1 | -1 }>(
  itens: T[],
): { faces: number; sinal: 1 | -1; itens: T[] }[] {
  const grupos: { faces: number; sinal: 1 | -1; itens: T[] }[] = [];
  for (const it of itens) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.faces === it.faces && ultimo.sinal === it.sinal) ultimo.itens.push(it);
    else grupos.push({ faces: it.faces, sinal: it.sinal, itens: [it] });
  }
  return grupos;
}

// Vértices (viewBox 36×36) de cada dado; o d6 é um quadrado, o d100 um círculo.
const PONTOS: Record<number, [number, number][]> = {
  4: [[18, 4], [32, 30], [4, 30]],
  8: [[18, 3], [32, 18], [18, 33], [4, 18]],
  10: [[18, 2], [33, 14], [18, 34], [3, 14]],
  12: [[18, 3], [32, 13], [26, 31], [10, 31], [4, 13]],
  20: [[18, 3], [31, 10], [31, 26], [18, 33], [5, 26], [5, 10]],
};

function pontos(faces: number, escala: number): string {
  return PONTOS[faces]
    .map(([x, y]) => `${(18 + (x - 18) * escala).toFixed(2)},${(18 + (y - 18) * escala).toFixed(2)}`)
    .join(" ");
}

// Borda e miolo: o traço grosso com junta redonda é o que arredonda os cantos.
function formaSvg(faces: number): string {
  if (faces === 6) {
    return (
      '<rect class="rd-borda" x="5" y="5" width="26" height="26" rx="9" stroke-width="0"/>' +
      '<rect class="rd-miolo" x="6.2" y="6.2" width="23.6" height="23.6" rx="8" stroke-width="0"/>'
    );
  }
  if (PONTOS[faces]) {
    const p = pontos(faces, 0.86);
    return (
      `<polygon class="rd-borda" points="${p}" stroke-width="5" stroke-linejoin="round"/>` +
      `<polygon class="rd-miolo" points="${p}" stroke-width="3.2" stroke-linejoin="round"/>`
    );
  }
  return (
    '<circle class="rd-borda" cx="18" cy="18" r="15" stroke-width="0"/>' +
    '<circle class="rd-miolo" cx="18" cy="18" r="13.8" stroke-width="0"/>'
  );
}

// Corpo do SVG de um botão de dado ("d6" dentro da forma), pro teclado do Rolador.
export function botaoDadoSvg(faces: number): string {
  const dy = yTexto(faces);
  const fonte = faces >= 100 ? 8.5 : faces >= 10 ? 10 : 11;
  return (
    formaSvg(faces) +
    `<text class="rd-num" x="18" y="${dy}" text-anchor="middle" dominant-baseline="central" font-size="${fonte}">d${faces}</text>`
  );
}

// Altura do número dentro de cada forma (o centro visual, não o geométrico).
function yTexto(faces: number): number {
  return faces === 4 ? 21 : faces === 10 ? 17 : faces === 12 ? 18.5 : 18;
}

function tamanhoFonte(valor: number): number {
  const digitos = String(Math.abs(valor)).length;
  return digitos >= 4 ? 8 : digitos === 3 ? 10 : digitos === 2 ? 12 : 14;
}

export function dadoSvg(faces: number, valor: number, destaque: "sucesso" | "falha" | null): string {
  const cls = destaque === "sucesso" ? " rd-sucesso" : destaque === "falha" ? " rd-falha" : "";
  const dy = yTexto(faces);
  return (
    `<svg class="rd-dado${cls}" width="38" height="38" viewBox="0 0 36 36" role="img" aria-label="d${faces}: ${valor}">` +
    formaSvg(faces) +
    `<text class="rd-num" x="18" y="${dy}" text-anchor="middle" dominant-baseline="central" font-size="${tamanhoFonte(valor)}">${valor}</text>` +
    "</svg>"
  );
}

function destaqueDe(d: DadoVisual): "sucesso" | "falha" | null {
  if (d.destaque !== undefined) return d.destaque;
  if (d.faces > 1 && d.valor === d.faces) return "sucesso";
  if (d.valor === 1) return "falha";
  return null;
}

function dadoHtml(d: DadoVisual): string {
  let aux = "";
  for (const r of d.riscados ?? []) {
    aux += `<span class="dado-descartado"${r.titulo ? ` title="${r.titulo}"` : ""}>${r.valor}</span>`;
  }
  for (const x of d.extras ?? []) aux += `<span class="dado-explosao" title="explosão">+${x}</span>`;
  return `<span class="rd-d">${dadoSvg(d.faces, d.valor, destaqueDe(d))}${aux}</span>`;
}

function somaDoDado(d: DadoVisual): number {
  return d.valor + (d.extras ?? []).reduce((s, x) => s + x, 0);
}

function sinalDoRotulo(sinal: 1 | -1, primeiro: boolean): string {
  if (sinal < 0) return "− ";
  return primeiro ? "" : "+ ";
}

function modTexto(mod: number, primeiro: boolean): string {
  const abs = Math.abs(mod);
  return mod < 0 ? `− ${abs}` : primeiro ? `${abs}` : `+ ${abs}`;
}

type Grupo = ReturnType<typeof agruparConsecutivos<DadoVisual>>[number];

function grupoHtml(g: Grupo, indice: number): string {
  const n = g.itens.length;
  const soma = g.itens.reduce((s, d) => s + somaDoDado(d), 0);
  const nome = `${n}d${g.faces}`;
  const ini = sinalDoRotulo(g.sinal, indice === 0);
  const dados = `<span class="rd-dados">${g.itens.map(dadoHtml).join("")}</span>`;
  const rotulo = `<span class="rd-rot">${ini}<b>${nome}</b>${n > 1 ? ` = ${g.sinal * soma}` : ""}</span>`;
  if (n <= LIMITE_DADOS_GRUPO) return `<span class="rd-grupo">${dados}${rotulo}</span>`;
  const tile = `<span class="rd-tile">${dadoSvg(g.faces, soma, null)}<span class="rd-rot">${ini}${nome}</span></span>`;
  return (
    '<details class="rd-grupo rd-det">' +
    `<summary title="${n} dados: clique para ver"><span class="rd-fechado">${tile}</span><span class="rd-aberto"><i class="fas fa-chevron-up"></i> recolher</span></summary>` +
    `${dados}${rotulo}</details>`
  );
}

function tileResumoHtml(g: Grupo, indice: number): string {
  const n = g.itens.length;
  const ini = sinalDoRotulo(g.sinal, indice === 0);
  const valor = n === 1 ? g.itens[0].valor : g.itens.reduce((s, d) => s + somaDoDado(d), 0);
  const destaque = n === 1 ? destaqueDe(g.itens[0]) : null;
  return `<span class="rd-tile">${dadoSvg(g.faces, valor, destaque)}<span class="rd-rot">${ini}${n}d${g.faces}</span></span>`;
}

// Os dados de uma rolagem (+ modificador) como HTML. `sufixo` é HTML extra no fim
// (ex.: total elevado pelo piso de dano).
export function dadosRoladosHtml(dados: DadoVisual[], modificador: number, sufixo = ""): string {
  if (dados.length === 0) {
    return `<span class="rd-mod">${modTexto(modificador, true)}</span>${sufixo}`;
  }
  const grupos = agruparConsecutivos(dados);
  const mod = modificador !== 0 ? `<span class="rd-mod">${modTexto(modificador, false)}</span>` : "";
  const corpo = grupos.map(grupoHtml).join("") + mod;
  const grande = dados.length > LIMITE_DADOS_TOTAL || grupos.length > LIMITE_GRUPOS;
  if (!grande) return `<span class="rd-res">${corpo}${sufixo}</span>`;
  const resumo = grupos.map(tileResumoHtml).join("") + mod;
  const contagem = `${dados.length} dados em ${grupos.length} grupos`;
  return (
    '<details class="rd-res rd-det rd-todos">' +
    `<summary title="${contagem}: clique para ver"><span class="rd-fechado"><span class="rd-linha">${resumo}</span>` +
    `<span class="rd-mais"><i class="fas fa-chevron-down"></i> ver ${contagem}</span></span>` +
    '<span class="rd-aberto"><i class="fas fa-chevron-up"></i> recolher tudo</span></summary>' +
    `<span class="rd-res">${corpo}${sufixo}</span></details>`
  );
}
