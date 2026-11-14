// HTML de rolagem que vai pro chat. O Rolador monta a string no navegador
// (lib/dados-html.ts) e ela é gravada e depois renderizada pra mesa inteira, então
// nada do que chega do cliente é confiável: só passam as tags e os atributos que
// o Rolador de fato usa. Puro: roda no servidor (ao gravar) e no cliente (ao
// renderizar, pra cobrir mensagem antiga ou gravada por outro caminho).

const TAGS = new Set([
  "span",
  "div",
  "b",
  "i",
  "details",
  "summary",
  "svg",
  "polygon",
  "rect",
  "circle",
  "text",
]);

// Sem href, src, style nem on*: nenhum atributo aqui carrega URL ou código.
const ATRIBUTOS = new Set([
  "class",
  "title",
  "role",
  "aria-label",
  "width",
  "height",
  "viewbox",
  "points",
  "x",
  "y",
  "rx",
  "cx",
  "cy",
  "r",
  "stroke-width",
  "stroke-linejoin",
  "text-anchor",
  "dominant-baseline",
  "font-size",
]);

// Classes que o Rolador põe no resultado (lib/dados-html.ts e painel-rolador).
const CLASSE = /^(rd-[a-z-]+|dado-descartado|dado-explosao|roll-fontes|fas|fa-chevron-(up|down))$/;

// Nome com a caixa que o SVG exige.
const NOME_ATRIBUTO: Record<string, string> = { viewbox: "viewBox" };

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z][a-zA-Z0-9-]*(?:\s*=\s*"[^"<>]*")?)*)\s*(\/?)>/g;
const ATRIBUTO = /([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*"([^"<>]*)")?/g;

export const LIMITE_HTML_ROLAGEM = 60_000;

function texto(s: string): string {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function atributos(bruto: string): string {
  let saida = "";
  for (const m of bruto.matchAll(ATRIBUTO)) {
    const nome = m[1].toLowerCase();
    if (!ATRIBUTOS.has(nome)) continue;
    let valor = (m[2] ?? "").replace(/&(?![a-zA-Z#][a-zA-Z0-9]*;)/g, "&amp;");
    if (nome === "class") {
      // Só as classes do resultado de rolagem: qualquer outra do app (modal,
      // overlay, a própria bandeja) deixaria a mensagem cobrir a tela.
      valor = valor.split(/\s+/).filter((c) => CLASSE.test(c)).join(" ");
      if (!valor) continue;
    }
    saida += ` ${NOME_ATRIBUTO[nome] ?? nome}="${valor}"`;
  }
  return saida;
}

// Devolve só o que é seguro renderizar; o resto vira texto. Fecha as tags que
// ficaram abertas, pra uma mensagem não engolir as seguintes.
export function sanitizarHtmlRolagem(html: unknown): string {
  if (typeof html !== "string" || html.length === 0) return "";
  const entrada = html.length > LIMITE_HTML_ROLAGEM ? html.slice(0, LIMITE_HTML_ROLAGEM) : html;
  const abertas: string[] = [];
  let saida = "";
  let ultimo = 0;
  for (const m of entrada.matchAll(TAG)) {
    const inicio = m.index ?? 0;
    saida += texto(entrada.slice(ultimo, inicio));
    ultimo = inicio + m[0].length;
    const nome = m[2].toLowerCase();
    if (!TAGS.has(nome)) {
      saida += texto(m[0]);
      continue;
    }
    if (m[1]) {
      // Fechamento: só vale se a tag estiver aberta (fecha as de dentro junto).
      const onde = abertas.lastIndexOf(nome);
      if (onde === -1) continue;
      while (abertas.length > onde) saida += `</${abertas.pop()}>`;
      continue;
    }
    saida += `<${nome}${atributos(m[3] ?? "")}>`;
    if (m[4]) saida += `</${nome}>`;
    else abertas.push(nome);
  }
  saida += texto(entrada.slice(ultimo));
  while (abertas.length > 0) saida += `</${abertas.pop()}>`;
  return saida;
}
