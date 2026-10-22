import {
  lerInline,
  numerarBlocos,
  parseDescricaoRica,
  serializarDescricaoRica,
  serializarInline,
  type Bloco,
  type Inline,
} from "@/lib/descricao-rica";
import { aparenciaDoAtomo, estiloDeCor, type Atomo, type ContextoRico } from "./atomos";

// O editor é uma pilha de linhas: <div class="desc-l" data-b="…">. Cada linha é
// um bloco do formato. Daqui sai e volta a string de tokens; o que o navegador
// inventar (div solto, <b>, <br>) é normalizado em `sincronizar`.

const ZERO = /​/g;

/* ─── Átomos (chips) ─────────────────────────────────────── */

export function elementoAtomo(no: Atomo, ctx?: ContextoRico): HTMLElement {
  const ap = aparenciaDoAtomo(no, ctx);
  const el = document.createElement("span");
  el.contentEditable = "false";
  el.dataset.no = JSON.stringify(no);
  el.className = `desc-chip ${ap.classe}${ap.fx ? ` ${ap.fx.className}` : ""}`;
  if (ap.fx) for (const [k, v] of Object.entries(ap.fx.style)) el.style.setProperty(k, String(v));
  else if (ap.cor) el.style.setProperty("--chip-cor", ap.cor);
  const i = document.createElement("i");
  i.className = `fas ${ap.icone}`;
  if (ap.corIcone && !ap.fx) i.style.color = ap.corIcone;
  el.append(i);
  if (ap.detalhe) {
    // Efeito da ação: nome + valor calculado, igual ao chip da visualização.
    const nome = document.createElement("span");
    nome.className = "desc-chip-nome";
    nome.textContent = ap.rotulo;
    const det = document.createElement("span");
    det.className = "desc-chip-detalhe";
    det.textContent = ap.detalhe;
    el.append(nome, det);
  } else if (ap.rotulo) {
    if (ap.fx) {
      const txt = document.createElement("span");
      txt.className = "fx-texto";
      txt.textContent = ap.rotulo;
      el.append(txt);
    } else el.append(ap.rotulo);
  }
  return el;
}

// Redesenha os chips já no campo (o valor calculado ou a duração da ação mudou).
export function atualizarChips(root: HTMLElement, ctx?: ContextoRico) {
  root.querySelectorAll<HTMLElement>("[data-no]").forEach((chip) => {
    try {
      const novo = elementoAtomo(JSON.parse(chip.dataset.no ?? "") as Atomo, ctx);
      if (novo.outerHTML !== chip.outerHTML) chip.replaceWith(novo);
    } catch {
      /* chip corrompido: deixa como está */
    }
  });
}

function elementoCor(no: Extract<Inline, { t: "cor" }>, ctx?: ContextoRico): HTMLElement {
  const el = document.createElement("span");
  const { className, style } = estiloDeCor(no.cor, no.cor2, no.efeito);
  el.className = className;
  if (style) for (const [k, v] of Object.entries(style)) el.style.setProperty(k, String(v));
  el.dataset.cor = no.cor;
  if (no.cor2) el.dataset.cor2 = no.cor2;
  if (no.efeito) el.dataset.fx = no.efeito;
  el.append(...inlineParaDom(no.filhos, ctx));
  return el;
}

export function inlineParaDom(nos: Inline[], ctx?: ContextoRico): Node[] {
  return nos.map((no): Node => {
    switch (no.t) {
      case "texto":
        return document.createTextNode(no.v);
      case "marca": {
        const el = document.createElement(no.m === "negrito" ? "strong" : no.m === "italico" ? "em" : "u");
        el.append(...inlineParaDom(no.filhos, ctx));
        return el;
      }
      case "cor":
        return elementoCor(no, ctx);
      default:
        return elementoAtomo(no, ctx);
    }
  });
}

/* ─── Linhas ─────────────────────────────────────────────── */

export const ehLinha = (n: Node | null): n is HTMLElement =>
  n instanceof HTMLElement && n.classList.contains("desc-l");

export function criarLinha(bl: Bloco, ctx?: ContextoRico): HTMLElement {
  const el = document.createElement("div");
  el.className = "desc-l";
  el.dataset.b = bl.b;
  if (bl.b === "hr") {
    el.contentEditable = "false";
    el.append(document.createElement("hr"));
    return el;
  }
  if (bl.b === "lista") {
    el.dataset.n = String(bl.nivel);
    el.dataset.i = bl.icone ?? "";
  }
  if (bl.b === "num") el.dataset.n = String(bl.nivel);
  el.append(...inlineParaDom(bl.filhos, ctx));
  if (bl.filhos.length === 0) el.append(document.createElement("br"));
  marcadorDe(el);
  return el;
}

// Marcador (ícone do tópico ou número). Não é editável nem entra no texto.
function marcadorDe(linha: HTMLElement) {
  const b = linha.dataset.b;
  const atuais = [...linha.querySelectorAll(":scope > .desc-marcador")];
  const querMarcador = b === "lista" || b === "num";
  const icone = linha.dataset.i || "circle";
  const certo =
    querMarcador &&
    atuais.length === 1 &&
    atuais[0] === linha.firstChild &&
    (b === "num" || atuais[0].querySelector("i")?.className === `fas fa-${icone}`);
  if (certo || (!querMarcador && atuais.length === 0)) return;
  atuais.forEach((a) => a.remove());
  if (!querMarcador) return;
  const m = document.createElement("span");
  m.className = "desc-marcador";
  m.contentEditable = "false";
  if (b === "lista") {
    const i = document.createElement("i");
    i.className = `fas fa-${icone}`;
    m.append(i);
  }
  linha.prepend(m);
}

export function linhasDe(root: HTMLElement): HTMLElement[] {
  return [...root.children].filter(ehLinha);
}

// Põe o editor em ordem: tudo é linha, marcadores certos, numeração em dia,
// linha vazia com <br> pro cursor poder entrar.
export function sincronizar(root: HTMLElement) {
  for (const n of [...root.childNodes]) {
    if (ehLinha(n)) continue;
    if (n instanceof HTMLElement && n.tagName === "DIV") {
      n.className = "desc-l";
      n.dataset.b = "p";
    } else {
      const l = document.createElement("div");
      l.className = "desc-l";
      l.dataset.b = "p";
      n.replaceWith(l);
      l.append(n);
    }
  }
  const linhas = linhasDe(root);
  for (const l of linhas) {
    if (l.dataset.b === "hr") continue;
    // Nó de texto vazio engana a checagem de conteúdo e o Chrome não segura o
    // cursor numa linha assim (ele pula pra seguinte): some com eles.
    for (const c of [...l.childNodes]) if (c.nodeType === Node.TEXT_NODE && c.textContent === "") c.remove();
    marcadorDe(l);
    const temConteudo = [...l.childNodes].some((c) => !(c instanceof HTMLElement && c.classList.contains("desc-marcador")) && !(c instanceof HTMLBRElement));
    const br = l.querySelector(":scope > br");
    if (!temConteudo && !br) l.append(document.createElement("br"));
    if (temConteudo && br) br.remove();
  }
  const numeros = numerarBlocos(
    linhas.map((l) => ({ b: l.dataset.b ?? "p", nivel: Number(l.dataset.n ?? 0) })),
  );
  linhas.forEach((l, i) => {
    if (l.dataset.b === "num") {
      const m = l.querySelector(":scope > .desc-marcador");
      if (m) m.textContent = `${numeros[i]}.`;
    }
  });
}

export function montar(root: HTMLElement, texto: string, ctx?: ContextoRico) {
  const blocos = parseDescricaoRica(texto);
  if (blocos.length === 0) blocos.push({ b: "p", filhos: [] });
  root.replaceChildren(...blocos.map((b) => criarLinha(b, ctx)));
  sincronizar(root);
}

/* ─── DOM → texto ────────────────────────────────────────── */

function lerInlineDom(pai: Node): Inline[] {
  const nos: Inline[] = [];
  const junta = (n: Inline) => {
    const ult = nos[nos.length - 1];
    if (n.t === "texto" && ult?.t === "texto") ult.v += n.v;
    else if (n.t !== "texto" || n.v) nos.push(n);
  };
  pai.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      junta({ t: "texto", v: (n.textContent ?? "").replace(ZERO, "") });
      return;
    }
    if (!(n instanceof HTMLElement)) return;
    if (n.classList.contains("desc-marcador") || n instanceof HTMLBRElement) return;
    if (n.dataset.no) {
      try {
        junta(JSON.parse(n.dataset.no) as Inline);
      } catch {
        /* chip corrompido: some */
      }
      return;
    }
    const tag = n.tagName;
    const marca = tag === "STRONG" || tag === "B" ? "negrito" : tag === "EM" || tag === "I" ? "italico" : tag === "U" ? "sublinhado" : null;
    const filhos = lerInlineDom(n);
    if (marca) {
      if (filhos.length) junta({ t: "marca", m: marca, filhos });
    } else if (n.dataset.cor) {
      if (filhos.length) {
        junta({
          t: "cor",
          cor: n.dataset.cor,
          ...(n.dataset.cor2 ? { cor2: n.dataset.cor2 } : {}),
          ...(n.dataset.fx ? { efeito: n.dataset.fx } : {}),
          filhos,
        });
      }
    } else {
      // span/font/div que o navegador criou: só o conteúdo importa.
      filhos.forEach(junta);
    }
  });
  return nos;
}

export function lerLinha(l: HTMLElement): Bloco {
  const b = l.dataset.b;
  if (b === "hr") return { b: "hr" };
  const filhos = lerInlineDom(l);
  const nivel = Math.max(0, Math.min(3, Number(l.dataset.n ?? 0) || 0));
  if (b === "lista") return { b: "lista", nivel, ...(l.dataset.i ? { icone: l.dataset.i } : {}), filhos };
  if (b === "num") return { b: "num", nivel, filhos };
  if (b === "titulo") return { b: "titulo", filhos };
  if (b === "citacao") return { b: "citacao", filhos };
  return { b: "p", filhos };
}

export function lerEditor(root: HTMLElement): string {
  return serializarDescricaoRica(linhasDe(root).map(lerLinha));
}

// Um trecho selecionado (`range.cloneContents()`) como texto com os códigos:
// várias linhas viram blocos (tópico, título…), dentro de uma linha só vira o
// texto corrido. Serve ao copiar/recortar do editor e da visualização, pra o
// que sai da área de transferência poder voltar como chips.
export function serializarFragmento(frag: Node): string {
  const linhas = [...frag.childNodes].filter(ehLinha);
  if (linhas.length > 0) return serializarDescricaoRica(linhas.map(lerLinha));
  return serializarInline(lerInlineDom(frag));
}

// Linha de texto cru: o que a linha tem de legível (sem marcador).
export function linhaVazia(l: HTMLElement): boolean {
  return lerLinha(l).b === "hr" ? false : lerInlineDom(l).length === 0;
}

export function inlineDoTexto(texto: string): Inline[] {
  return lerInline(texto);
}

/* ─── Cursor ─────────────────────────────────────────────── */

export function linhaDoNo(root: HTMLElement, n: Node | null): HTMLElement | null {
  let atual: Node | null = n;
  while (atual && atual !== root) {
    if (ehLinha(atual) && atual.parentNode === root) return atual;
    atual = atual.parentNode;
  }
  return null;
}

// Posição do cursor como número de caracteres desde o início do editor.
export function medirCursor(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !root.contains(sel.anchorNode)) return null;
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEnd(sel.anchorNode!, sel.anchorOffset);
  return r.toString().length;
}

// Volta o cursor pra essa posição; se cair dentro de um chip, vai pra depois dele.
export function posicionarCursor(root: HTMLElement, pos: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let resta = pos;
  let n: Node | null;
  const r = document.createRange();
  while ((n = w.nextNode())) {
    const t = (n.textContent ?? "").length;
    if (resta <= t) {
      const chip = (n.parentElement as HTMLElement | null)?.closest("[data-no],.desc-marcador");
      if (chip) r.setStartAfter(chip);
      else r.setStart(n, resta);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      return;
    }
    resta -= t;
  }
  r.selectNodeContents(root);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

// Começo editável de uma linha (depois do marcador).
export function cursorNoInicio(linha: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  const primeiro = [...linha.childNodes].find((c) => !(c instanceof HTMLElement && c.classList.contains("desc-marcador")));
  if (!primeiro) r.setStart(linha, linha.childNodes.length);
  else if (primeiro.nodeType === Node.TEXT_NODE) r.setStart(primeiro, 0);
  else r.setStartBefore(primeiro);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

export function cursorNoFim(linha: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(linha);
  const ult = linha.lastChild;
  if (ult instanceof HTMLBRElement) r.setEndBefore(ult);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

// Cursor no começo do texto da linha (nada antes dele, fora o marcador)?
export function noInicioDaLinha(linha: HTMLElement, r: Range): boolean {
  const antes = document.createRange();
  antes.selectNodeContents(linha);
  antes.setEnd(r.startContainer, r.startOffset);
  const frag = antes.cloneContents();
  frag.querySelectorAll(".desc-marcador").forEach((m) => m.remove());
  return (frag.textContent ?? "").replace(ZERO, "") === "" && !frag.querySelector("[data-no]");
}

export type { Atomo };
