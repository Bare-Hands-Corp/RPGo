// Leitor de fórmula: conta (+ − × ÷, divisão pra baixo), parênteses, dados
// ("2d6", "NIVELd4", "(PROF)d6"), siglas e funções (min, max, POR_NIVEL).
// Palavra solta ("fogo", "pra acertar") e parêntese com palavra são anotação.
// Puro: serve cliente e servidor.

import type { Dado } from "./dice";

export type Rolagem = { dados: Dado[]; modificador: number };

export type ContextoAvaliacao = {
  // Valor de uma sigla canônica (FOR…PRE = modificador, PROF, NIVEL, GRAU, DESLOC).
  valor: (sigla: string) => number;
  nivel: number;
};

export type ResultadoFormula =
  | { ok: true; rolagem: Rolagem; usados: { sigla: string; valor: number }[] }
  | { ok: false; erro: string };

// Siglas aceitas, com o nome que a tela mostra.
export const SIGLAS_FORMULA: { sigla: string; nome: string; grupo: "atributo" | "personagem" }[] = [
  { sigla: "FOR", nome: "Modificador de Força", grupo: "atributo" },
  { sigla: "DES", nome: "Modificador de Destreza", grupo: "atributo" },
  { sigla: "CON", nome: "Modificador de Constituição", grupo: "atributo" },
  { sigla: "SAB", nome: "Modificador de Sabedoria", grupo: "atributo" },
  { sigla: "VON", nome: "Modificador de Vontade", grupo: "atributo" },
  { sigla: "PRE", nome: "Modificador de Presença", grupo: "atributo" },
  { sigla: "PROF", nome: "Bônus de proficiência", grupo: "personagem" },
  { sigla: "NIVEL", nome: "Nível do personagem", grupo: "personagem" },
  { sigla: "GRAU", nome: "Grau da técnica", grupo: "personagem" },
  { sigla: "DESLOC", nome: "Deslocamento atual (só no efeito Deslocamento)", grupo: "personagem" },
];

// Funções aceitas; `modelo` é o que o atalho escreve.
export const FUNCOES_FORMULA: { nome: string; rotulo: string; descricao: string; modelo: string }[] = [
  { nome: "min", rotulo: "menor de", descricao: "O menor dos valores: min(CON, NIVEL/2)", modelo: "min(" },
  { nome: "max", rotulo: "maior de", descricao: "O maior dos valores: max(1, CON)", modelo: "max(" },
  {
    nome: "POR_NIVEL",
    rotulo: "por nível",
    descricao: "Muda com o nível: POR_NIVEL(1d4, 6: 1d6, 11: 1d8)",
    modelo: "POR_NIVEL(",
  },
];

// Apelidos → sigla canônica.
const APELIDOS_SIGLA: Record<string, string> = {
  "NÍVEL": "NIVEL",
  NV: "NIVEL",
  LEVEL: "NIVEL",
  LVL: "NIVEL",
  DESLOCAMENTO: "DESLOC",
};
const SIGLAS = new Set([...SIGLAS_FORMULA.map((s) => s.sigla), ...Object.keys(APELIDOS_SIGLA)]);

type Funcao = "min" | "max" | "por_nivel";
const FUNCOES: Record<string, Funcao> = {
  min: "min",
  "mín": "min",
  max: "max",
  "máx": "max",
  por_nivel: "por_nivel",
  "por_nível": "por_nivel",
  pornivel: "por_nivel",
};

const LETRA = /[A-Za-zÀ-ÖØ-öø-ÿ_]/;
const MAX_DADOS_TERMO = 200;
const MAX_DADOS_TOTAL = 500;

function funcaoDe(palavra: string): Funcao | null {
  return FUNCOES[palavra.toLowerCase()] ?? null;
}

function siglaCanonica(s: string): string {
  return APELIDOS_SIGLA[s] ?? s;
}

function normalizar(texto: string): string {
  return texto.replace(/[−–—]/g, "-").replace(/[×·]/g, "*").replace(/÷/g, "/");
}

function proximoNaoEspaco(s: string, i: number): string {
  while (i < s.length && /\s/.test(s[i])) i++;
  return s[i] ?? "";
}

// Palavra que não é sigla, função, dado nem "x" de multiplicar.
function ehAnotacao(w: string, depois: string): boolean {
  if (SIGLAS.has(w) || funcaoDe(w)) return false;
  if (/^[xX]$/.test(w)) return false;
  if (/^[dD]$/.test(w) && /\d/.test(depois)) return false;
  if (/[dD]$/.test(w) && SIGLAS.has(w.slice(0, -1)) && /\d/.test(depois)) return false;
  return true;
}

function temPalavra(trecho: string): boolean {
  for (const m of trecho.matchAll(/[A-Za-zÀ-ÖØ-öø-ÿ_]+/g)) {
    const depois = proximoNaoEspaco(trecho, (m.index ?? 0) + m[0].length);
    if (ehAnotacao(m[0], depois)) return true;
  }
  return false;
}

// Tira os parênteses de anotação ("10d12 (14d12 com X)", "1d8 (CON)"): os com
// palavra dentro e os colados num valor sem operador antes. Os de conta ficam.
function semAnotacoes(s: string): string {
  const ABRE = "\u0001";
  const FECHA = "\u0002";
  let atual = s;
  for (let volta = 0; volta < 20; volta++) {
    const novo = atual.replace(/\(([^()]*)\)/g, (todo: string, dentro: string, offset: number) => {
      const antes = atual.slice(0, offset).trimEnd();
      const depois = atual.slice(offset + todo.length).trimStart();
      const conta =
        !temPalavra(dentro) &&
        (antes === "" ||
          /[+\-*/,:;\u0001]$/.test(antes) ||
          /(?:^|[\s\d)])[xX]$/.test(antes) ||
          /(?:min|mín|max|máx|por_nivel|por_nível|pornivel)$/i.test(antes) ||
          /^[dD]\s*\d/.test(depois));
      return conta ? `${ABRE}${dentro}${FECHA}` : " ";
    });
    if (novo === atual) break;
    atual = novo;
  }
  return atual.split(ABRE).join("(").split(FECHA).join(")");
}

type Token =
  | { t: "num"; v: number }
  | { t: "sigla"; v: string }
  | { t: "func"; v: Funcao }
  | { t: "d" }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "(" }
  | { t: ")" }
  | { t: "," }
  | { t: ":" };

function tokenizar(bruto: string): Token[] {
  const s = semAnotacoes(normalizar(bruto));
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/\d/.test(c)) {
      let j = i;
      while (j < s.length && /\d/.test(s[j])) j++;
      out.push({ t: "num", v: Math.min(1e7, parseInt(s.slice(i, j), 10)) });
      i = j;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "(" || c === ")" || c === ":") {
      out.push({ t: c });
      i++;
      continue;
    }
    if (c === "," || c === ";") {
      out.push({ t: "," });
      i++;
      continue;
    }
    if (LETRA.test(c)) {
      let j = i;
      while (j < s.length && LETRA.test(s[j])) j++;
      const w = s.slice(i, j);
      const colado = s[j] ?? "";
      const depois = proximoNaoEspaco(s, j);
      i = j;
      if (/^[dD]$/.test(w) && /\d/.test(depois)) {
        out.push({ t: "d" });
      } else if (/[dD]$/.test(w) && SIGLAS.has(w.slice(0, -1)) && /\d/.test(colado)) {
        out.push({ t: "sigla", v: siglaCanonica(w.slice(0, -1)) }, { t: "d" });
      } else if (SIGLAS.has(w)) {
        out.push({ t: "sigla", v: siglaCanonica(w) });
      } else if (funcaoDe(w) && depois === "(") {
        out.push({ t: "func", v: funcaoDe(w)! });
      } else if (/^[xX]$/.test(w)) {
        out.push({ t: "op", v: "*" });
      } else if (/^[xX]/.test(w) && SIGLAS.has(w.slice(1))) {
        out.push({ t: "op", v: "*" }, { t: "sigla", v: siglaCanonica(w.slice(1)) });
      }
      // Qualquer outra palavra é anotação.
      continue;
    }
    i++;
  }
  return out;
}

class ErroFormula extends Error {}

const VAZIA: Rolagem = { dados: [], modificador: 0 };

function numero(v: number): Rolagem {
  return { dados: [], modificador: v };
}

function ehNumero(r: Rolagem): boolean {
  return r.dados.length === 0;
}

function somar(a: Rolagem, b: Rolagem): Rolagem {
  const dados = [...a.dados, ...b.dados];
  if (dados.length > MAX_DADOS_TOTAL) throw new ErroFormula("Dados demais");
  return { dados, modificador: a.modificador + b.modificador };
}

function negar(r: Rolagem): Rolagem {
  return {
    dados: r.dados.map((d) => ({ faces: d.faces, sinal: d.sinal === 1 ? -1 : 1 })),
    modificador: -r.modificador,
  };
}

function vezes(r: Rolagem, n: number): Rolagem {
  if (ehNumero(r)) return numero(r.modificador * n);
  const qtd = Math.abs(Math.trunc(n));
  if (qtd * r.dados.length > MAX_DADOS_TOTAL) throw new ErroFormula("Dados demais");
  const base = n < 0 ? negar(r) : r;
  const dados: Dado[] = [];
  for (let k = 0; k < qtd; k++) dados.push(...base.dados);
  return { dados, modificador: base.modificador * qtd };
}

// Média, pra min/max entre rolagens.
function media(r: Rolagem): number {
  return r.dados.reduce((t, d) => t + d.sinal * ((d.faces + 1) / 2), r.modificador);
}

class Leitor {
  private pos = 0;
  private readonly toks: Token[];
  private readonly ctx: ContextoAvaliacao;
  readonly usados = new Map<string, number>();

  constructor(toks: Token[], ctx: ContextoAvaliacao) {
    this.toks = toks;
    this.ctx = ctx;
  }

  private olhar(): Token | undefined {
    return this.toks[this.pos];
  }

  // Termos lado a lado somam ("1d10 fogo 1d6" vira 1d10+1d6); vírgula solta separa.
  tudo(): Rolagem {
    let total = VAZIA;
    while (this.pos < this.toks.length) {
      const t = this.olhar()!;
      if (t.t === "," || t.t === ")" || t.t === ":") {
        this.pos++;
        continue;
      }
      total = somar(total, this.expr());
    }
    return total;
  }

  private expr(): Rolagem {
    let v = this.termo();
    for (let t = this.olhar(); t?.t === "op" && (t.v === "+" || t.v === "-"); t = this.olhar()) {
      this.pos++;
      const r = this.termo();
      v = somar(v, t.v === "+" ? r : negar(r));
    }
    return v;
  }

  private termo(): Rolagem {
    let v = this.unario();
    for (let t = this.olhar(); t?.t === "op" && (t.v === "*" || t.v === "/"); t = this.olhar()) {
      this.pos++;
      const r = this.unario();
      if (t.v === "*") {
        if (ehNumero(r)) v = vezes(v, r.modificador);
        else if (ehNumero(v)) v = vezes(r, v.modificador);
        else throw new ErroFormula("Não dá pra multiplicar dado por dado");
      } else {
        if (!ehNumero(v) || !ehNumero(r)) throw new ErroFormula("Divisão só entre números");
        if (r.modificador === 0) throw new ErroFormula("Divisão por zero");
        v = numero(Math.floor(v.modificador / r.modificador));
      }
    }
    return v;
  }

  private unario(): Rolagem {
    const t = this.olhar();
    if (t?.t === "op" && t.v === "-") {
      this.pos++;
      return negar(this.unario());
    }
    if (t?.t === "op" && t.v === "+") {
      this.pos++;
      return this.unario();
    }
    return this.dado();
  }

  private dado(): Rolagem {
    const qtd = this.olhar()?.t === "d" ? null : this.primario();
    if (this.olhar()?.t !== "d") return qtd!;
    this.pos++;
    const faces = this.olhar();
    if (faces?.t !== "num" || faces.v < 1) throw new ErroFormula("Faltou o número de faces do dado");
    this.pos++;
    if (qtd && !ehNumero(qtd)) throw new ErroFormula("Quantidade de dados tem que ser número");
    const n = qtd ? qtd.modificador : 1;
    const quantos = Math.min(MAX_DADOS_TERMO, Math.max(0, Math.trunc(Math.abs(n))));
    const dados: Dado[] = Array.from({ length: quantos }, () => ({
      faces: Math.min(1000, faces.v),
      sinal: n < 0 ? (-1 as const) : (1 as const),
    }));
    return { dados, modificador: 0 };
  }

  private primario(): Rolagem {
    const t = this.olhar();
    if (!t) throw new ErroFormula("Fórmula incompleta");
    if (t.t === "num") {
      this.pos++;
      return numero(t.v);
    }
    if (t.t === "sigla") {
      this.pos++;
      const v = Math.trunc(this.ctx.valor(t.v)) || 0;
      this.usados.set(t.v, v);
      return numero(v);
    }
    if (t.t === "(") {
      this.pos++;
      const v = this.expr();
      if (this.olhar()?.t === ")") this.pos++;
      return v;
    }
    if (t.t === "func") {
      this.pos++;
      if (this.olhar()?.t !== "(") throw new ErroFormula("Faltou abrir parêntese");
      this.pos++;
      return t.v === "por_nivel" ? this.porNivel() : this.minMax(t.v);
    }
    throw new ErroFormula("Fórmula mal escrita");
  }

  private fecharArgs() {
    if (this.olhar()?.t === ")") this.pos++;
  }

  private minMax(f: "min" | "max"): Rolagem {
    const args: Rolagem[] = [];
    while (this.olhar() && this.olhar()!.t !== ")") {
      if (this.olhar()!.t === ",") {
        this.pos++;
        continue;
      }
      args.push(this.expr());
    }
    this.fecharArgs();
    if (args.length === 0) throw new ErroFormula(`${f}() vazio`);
    return args.reduce((a, b) => {
      const ma = media(a);
      const mb = media(b);
      return f === "min" ? (mb < ma ? b : a) : mb > ma ? b : a;
    });
  }

  // POR_NIVEL(base, 6: valor, 11: valor): vale o do maior nível já alcançado.
  private porNivel(): Rolagem {
    const faixas: { nivel: number; v: Rolagem }[] = [];
    while (this.olhar() && this.olhar()!.t !== ")") {
      if (this.olhar()!.t === ",") {
        this.pos++;
        continue;
      }
      const a = this.olhar()!;
      const b = this.toks[this.pos + 1];
      let nivel = 0;
      if (a.t === "num" && b?.t === ":") {
        nivel = a.v;
        this.pos += 2;
      }
      faixas.push({ nivel, v: this.expr() });
    }
    this.fecharArgs();
    if (faixas.length === 0) throw new ErroFormula("POR_NIVEL() vazio");
    const ordem = [...faixas].sort((x, y) => x.nivel - y.nivel);
    const alcancadas = ordem.filter((f) => f.nivel <= this.ctx.nivel);
    return (alcancadas[alcancadas.length - 1] ?? ordem[0]).v;
  }
}

const cacheTokens = new Map<string, Token[]>();

function tokensDe(texto: string): Token[] {
  let toks = cacheTokens.get(texto);
  if (!toks) {
    toks = tokenizar(texto);
    if (cacheTokens.size > 500) cacheTokens.clear();
    cacheTokens.set(texto, toks);
  }
  return toks;
}

export function avaliarFormula(texto: string, ctx: ContextoAvaliacao): ResultadoFormula {
  if (!texto || !texto.trim()) return { ok: true, rolagem: VAZIA, usados: [] };
  try {
    const leitor = new Leitor(tokensDe(texto), ctx);
    const rolagem = leitor.tudo();
    return {
      ok: true,
      rolagem,
      usados: [...leitor.usados].map(([sigla, valor]) => ({ sigla, valor })),
    };
  } catch (err) {
    return { ok: false, erro: err instanceof ErroFormula ? err.message : "Fórmula mal escrita" };
  }
}

// Fórmula depende do personagem (tem sigla ou função).
export function formulaVariavel(texto: string): boolean {
  return tokensDe(texto).some((t) => t.t === "sigla" || t.t === "func");
}

// Usa GRAU (resolve com o grau de cada técnica).
export function formulaUsaGrau(texto: string): boolean {
  return tokensDe(texto).some((t) => t.t === "sigla" && t.v === "GRAU");
}

// ─── POR_NIVEL em linhas (atalho visual) ───────────────────────────────

export type FaixaNivel = { nivel: number; valor: string };

// Lê "POR_NIVEL(1d4, 6: 1d6)" em faixas; null se a fórmula não for só isso.
export function lerPorNivel(texto: string): FaixaNivel[] | null {
  const m = /^\s*por_n[ií]vel\s*\((.*)\)\s*$/i.exec(texto);
  if (!m) return null;
  const partes: string[] = [];
  let nivelParen = 0;
  let atual = "";
  for (const c of m[1]) {
    if (c === "(") nivelParen++;
    if (c === ")") nivelParen--;
    if (c === "," && nivelParen === 0) {
      partes.push(atual);
      atual = "";
    } else atual += c;
  }
  partes.push(atual);
  const faixas: FaixaNivel[] = [];
  for (const p of partes) {
    const f = /^\s*(\d+)\s*:\s*(.*)$/.exec(p);
    if (f) faixas.push({ nivel: Number(f[1]), valor: f[2].trim() });
    else faixas.push({ nivel: 1, valor: p.trim() });
  }
  return faixas.filter((f) => f.valor);
}

export function escreverPorNivel(faixas: FaixaNivel[]): string {
  const validas = faixas
    .filter((f) => f.valor.trim())
    .sort((a, b) => a.nivel - b.nivel);
  if (validas.length === 0) return "";
  if (validas.length === 1) return validas[0].valor.trim();
  return `POR_NIVEL(${validas
    .map((f, i) => (i === 0 && f.nivel <= 1 ? f.valor.trim() : `${f.nivel}: ${f.valor.trim()}`))
    .join(", ")})`;
}
