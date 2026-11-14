// Exportar a carta como imagem (html-to-image). As fontes vêm de outros sites
// (Font Awesome no cdnjs, Inter no Google Fonts), cujas regras o navegador não
// deixa ler; então o CSS das fontes é montado aqui, com os arquivos embutidos.
import { toBlob, toPng } from "html-to-image";

const FA = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/webfonts/";
const INTER = "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap";

// O tipo vem fixo: o cdnjs responde "application/octet-stream; charset=utf-8",
// e esse espaço dentro do data: quebrava o url() (os ícones sumiam da imagem).
async function comoDataUrl(url: string, tipo = "font/woff2"): Promise<string> {
  const bytes = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.arrayBuffer();
  });
  const blob = new Blob([bytes], { type: tipo });
  return new Promise((ok, erro) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result));
    leitor.onerror = erro;
    leitor.readAsDataURL(blob);
  });
}

async function cssInter(): Promise<string> {
  const css = await fetch(INTER).then((r) => r.text());
  // Só latim (o resto dos alfabetos não aparece nas cartas).
  const blocos = css.split(/(?=\/\*)/).filter((b) => /\/\* latin(-ext)? \*\//.test(b));
  const comDados = await Promise.all(
    blocos.map(async (b) => {
      const m = b.match(/url\(([^)]+)\)/);
      if (!m) return b;
      const url = m[1].replace(/^["']|["']$/g, "");
      return b.replace(m[0], `url("${await comoDataUrl(url)}")`);
    }),
  );
  return comDados.join("\n");
}

async function cssFontAwesome(): Promise<string> {
  const [solid, regular] = await Promise.all([
    comoDataUrl(`${FA}fa-solid-900.woff2`),
    comoDataUrl(`${FA}fa-regular-400.woff2`),
  ]);
  return [
    `@font-face{font-family:"Font Awesome 6 Free";font-style:normal;font-weight:900;font-display:block;src:url("${solid}") format("woff2")}`,
    `@font-face{font-family:"Font Awesome 6 Free";font-style:normal;font-weight:400;font-display:block;src:url("${regular}") format("woff2")}`,
  ].join("\n");
}

let cache: Promise<string | undefined> | null = null;

// CSS das fontes, buscado uma vez; undefined = deixa o html-to-image tentar sozinho.
function cssDasFontes() {
  cache ??= Promise.all([cssFontAwesome(), cssInter()])
    .then((partes) => partes.join("\n"))
    .catch((e) => {
      console.warn("Fontes da carta não embutidas:", e);
      cache = null;
      return undefined;
    });
  return cache;
}

// Sem o brilho holográfico na imagem.
const semBrilho = (n: Node) =>
  !(n instanceof HTMLElement && (n.classList.contains("carta-foil") || n.classList.contains("carta-reflexo")));

async function opcoes() {
  return { pixelRatio: 3, filter: semBrilho, fontEmbedCSS: await cssDasFontes() };
}

export async function cartaComoPng(no: HTMLElement) {
  return toPng(no, await opcoes());
}

export async function cartaComoBlob(no: HTMLElement) {
  return toBlob(no, await opcoes());
}

export function nomeDoArquivo(titulo: string) {
  return (
    titulo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "carta"
  );
}
