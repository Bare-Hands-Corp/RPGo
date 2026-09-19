// Estilos de cor: a cor vira custom properties --fx-* e o efeito vira classe fx-<slug>.

import type { CSSProperties } from "react";

export type EfeitoCor =
  | "solido"
  | "gradiente"
  | "neon"
  | "metalico"
  | "contorno"
  | "holo"
  | "pulse";

export const EFEITOS_COR: {
  slug: EfeitoCor;
  nome: string;
  dica: string;
}[] = [
  { slug: "solido", nome: "Sólido", dica: "Cor chapada, sem brilho" },
  { slug: "gradiente", nome: "Gradiente", dica: "Duas cores deslizando (a 2ª é escolhível)" },
  { slug: "neon", nome: "Neon", dica: "Texto aceso com halo ao redor" },
  { slug: "metalico", nome: "Metálico", dica: "Cromo polido com brilho passando" },
  { slug: "contorno", nome: "Contorno", dica: "Só borda e texto, fundo vazado" },
  { slug: "holo", nome: "Holo", dica: "Arco-íris deslizando (animado)" },
  { slug: "pulse", nome: "Pulse", dica: "Brilho que respira (animado)" },
];

export const EFEITO_COR_PADRAO: EfeitoCor = "solido";

const EFEITOS_VALIDOS = new Set<string>(EFEITOS_COR.map((e) => e.slug));

export function normalizarEfeitoCor(raw: unknown): EfeitoCor {
  const v = typeof raw === "string" ? raw : "";
  return EFEITOS_VALIDOS.has(v) ? (v as EfeitoCor) : EFEITO_COR_PADRAO;
}

/** `cor` null = padrão do tema. `cor2` só vale no gradiente; null = derivada (+38°). */
export type EstiloCor = {
  cor: string | null;
  cor2?: string | null;
  efeito: EfeitoCor;
};

/** Mapa nome-da-tag → estilo. É o formato guardado em `Item.tagsEstilo`. */
export type MapaEstilosTag = Record<string, EstiloCor>;

// Limites defensivos: o mapa vem do cliente e é gravado como Json cru.
const MAX_TAGS_ESTILIZADAS = 40;
const MAX_NOME_TAG = 40;

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function corValida(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return HEX_RE.test(v) ? v.toLowerCase() : null;
}

/** Nunca lança: roda no render. */
export function lerEstilosTag(raw: unknown): MapaEstilosTag {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: MapaEstilosTag = {};
  for (const [nome, valor] of Object.entries(raw as Record<string, unknown>)) {
    if (!nome || nome.length > MAX_NOME_TAG) continue;
    if (!valor || typeof valor !== "object") continue;
    const v = valor as Record<string, unknown>;
    const cor = corValida(v.cor);
    const cor2 = corValida(v.cor2);
    const efeito = normalizarEfeitoCor(v.efeito);
    if (!cor && efeito === EFEITO_COR_PADRAO) continue;
    out[nome] = { cor, cor2, efeito };
    if (Object.keys(out).length >= MAX_TAGS_ESTILIZADAS) break;
  }
  return out;
}

/** Versão do server: descarta estilos de tags que não existem mais. */
export function normalizarEstilosTag(
  raw: unknown,
  tagsAtuais?: string[],
): MapaEstilosTag | null {
  const mapa = lerEstilosTag(raw);
  if (tagsAtuais) {
    const vivas = new Set(tagsAtuais);
    for (const nome of Object.keys(mapa)) {
      if (!vivas.has(nome)) delete mapa[nome];
    }
  }
  return Object.keys(mapa).length > 0 ? mapa : null;
}

/** Versão do cliente da poda. */
export function podarEstilosTag(
  mapa: MapaEstilosTag,
  tagsTexto: string,
): MapaEstilosTag {
  const vivas = new Set(separarTags(tagsTexto));
  const out: MapaEstilosTag = {};
  for (const [nome, estilo] of Object.entries(mapa)) {
    if (vivas.has(nome)) out[nome] = estilo;
  }
  return out;
}

export function separarTags(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

// ─── Derivação de tons ─────────────────────────────────────

type Hsl = { h: number; s: number; l: number };

function hexParaHsl(hex: string): Hsl | null {
  const v = hex.trim().replace("#", "");
  const full =
    v.length === 3 ? v.split("").map((c) => c + c).join("") : v.length === 6 ? v : null;
  if (!full || !/^[0-9a-f]{6}$/i.test(full)) return null;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l: l * 100 };

  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;

  return { h, s: s * 100, l: l * 100 };
}

function css({ h, s, l }: Hsl): string {
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  return `hsl(${((h % 360) + 360) % 360} ${clamp(s, 0, 100).toFixed(1)}% ${clamp(l, 0, 100).toFixed(1)}%)`;
}

/** Cor inválida ou ausente → null. */
export function varsEstiloCor(
  cor: string | null | undefined,
  cor2?: string | null,
): CSSProperties | null {
  if (!cor) return null;
  const base = hexParaHsl(cor);
  if (!base) return null;

  // cor2 explícita ou derivada (+38°); saturação mínima pra cinza ainda gradiar.
  const s = Math.max(base.s, 12);
  const escolhida = corValida(cor2);
  const par = escolhida ? hexParaHsl(escolhida) : null;
  const companheira = par ?? { h: base.h + 38, s, l: base.l };

  const vars: Record<string, string> = {
    "--fx-cor": cor,
    "--fx-cor-2": escolhida ?? css(companheira),
    "--fx-clara": css({ h: base.h, s, l: Math.min(base.l + 24, 88) }),
    "--fx-clara-2": css({
      h: companheira.h,
      s: Math.max(companheira.s, 12),
      l: Math.min(companheira.l + 24, 88),
    }),
    "--fx-escura": css({ h: base.h, s, l: Math.max(base.l - 22, 10) }),
    "--fx-brilho": css({ h: base.h, s: Math.min(s, 30), l: 96 }),
    "--fx-h1": css({ h: base.h + 90, s: Math.max(s, 65), l: Math.max(base.l, 58) }),
    "--fx-h2": css({ h: base.h + 180, s: Math.max(s, 65), l: Math.max(base.l, 58) }),
    "--fx-h3": css({ h: base.h + 270, s: Math.max(s, 65), l: Math.max(base.l, 58) }),
  };
  return vars as CSSProperties;
}

/** Sem cor válida devolve `{ className: "", style: undefined }`. */
export function estiloAplicado(
  estilo: EstiloCor | null | undefined,
  familia: "chip" | "barra" | "texto",
): { className: string; style: CSSProperties | undefined } {
  const vars = varsEstiloCor(estilo?.cor, estilo?.cor2);
  if (!vars) return { className: "", style: undefined };
  const efeito = normalizarEfeitoCor(estilo?.efeito);
  return { className: `fx-${familia} fx-${efeito}`, style: vars };
}
