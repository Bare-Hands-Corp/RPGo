// Descrição rica v2. O texto salvo continua sendo uma string na coluna de
// sempre; o v1 (lib/descricao.ts) é um subconjunto: tudo que ele escreve, este
// lê igual. Puro (sem DOM nem React): serve ao editor, à visualização, à busca.
//
// Em linha (podem se aninhar):
//   **negrito**  *itálico*  __sublinhado__
//   {{cor:#e67e22|texto}}   {{cor:#e67e22+#3498db:gradiente|texto}}
//   [[acao:ID|Nome]]  (acao | hab | item)      {{cond:Atordoado}}
//   {{efeito:vantagem}}  {{efeito:resistencia|Fogo}}   {{dano:Fogo}}
//   ((2d6+FOR))  ((2d6+FOR|Fogo))  rolagem, com o tipo de dano depois da barra
//   :skull:  ícone
//
// Em bloco (uma linha = um bloco):
//   -  ou  -:skull:  tópico (2 espaços de recuo por nível)      1.  numerado
//   ## título    > citação    ---  linha
//
// Barra invertida escapa o que viraria marcação: `\*`, `\{`, `\-`…

export type TipoRef = "acao" | "hab" | "item";
export type MarcaTexto = "negrito" | "italico" | "sublinhado";

export type Inline =
  | { t: "texto"; v: string }
  | { t: "marca"; m: MarcaTexto; filhos: Inline[] }
  | { t: "cor"; cor: string; cor2?: string; efeito?: string; filhos: Inline[] }
  | { t: "ref"; tipo: TipoRef; id: string; nome: string }
  | { t: "cond"; nome: string }
  // `idx`: aponta pro efeito número N da própria ação, e o chip mostra o valor
  // calculado dele (`{{efeito:dano_extra#2}}`). Sem idx é o efeito do catálogo,
  // só o nome (e o `param`, como o tipo de dano de uma resistência).
  | { t: "efeito"; slug: string; idx?: number; param?: string }
  // A duração da própria ação ("Imediatamente", "Por 3 turnos"…).
  | { t: "duracao" }
  // Salvaguarda do alvo: só o atributo e a CD ("CON | CD 18"). Sem `cd`, vale a
  // CD das técnicas de quem escreve (o contexto resolve).
  | { t: "salv"; atributo: string; cd?: number }
  // Um atributo citado no texto ("FOR"): chip com o valor de quem lê.
  | { t: "attr"; atributo: string }
  | { t: "dano"; tipo: string }
  | { t: "icone"; slug: string }
  | { t: "rolagem"; formula: string; dano?: string };

export type Bloco =
  | { b: "p"; filhos: Inline[] }
  | { b: "lista"; nivel: number; icone?: string; filhos: Inline[] }
  | { b: "num"; nivel: number; filhos: Inline[] }
  | { b: "titulo"; filhos: Inline[] }
  | { b: "citacao"; filhos: Inline[] }
  | { b: "hr" };

export const NIVEL_MAXIMO = 3;

// Os seis atributos (a mesma tabela do op-rpg, aqui pra este arquivo seguir puro).
export const ATRIBUTOS_RICOS: { slug: string; sigla: string; nome: string }[] = [
  { slug: "forca", sigla: "FOR", nome: "Força" },
  { slug: "destreza", sigla: "DES", nome: "Destreza" },
  { slug: "constituicao", sigla: "CON", nome: "Constituição" },
  { slug: "sabedoria", sigla: "SAB", nome: "Sabedoria" },
  { slug: "vontade", sigla: "VON", nome: "Vontade" },
  { slug: "presenca", sigla: "PRE", nome: "Presença" },
];

export const siglaDoAtributo = (slug: string) =>
  ATRIBUTOS_RICOS.find((a) => a.slug === slug)?.sigla ?? slug.slice(0, 3).toUpperCase();

const ESC = "\\*_[{(:-#>.}";
const PALAVRA = String.raw`\p{L}\p{N}_:`;
const HEX = String.raw`#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?`;

/* ─── Leitura em linha ───────────────────────────────────── */

const ATOMOS: { re: RegExp; fazer: (m: RegExpExecArray) => Inline }[] = [
  {
    re: /\[\[(acao|hab|item):([^|\]\n]+)\|([^\]\n]*)\]\]/uy,
    fazer: (m) => ({ t: "ref", tipo: m[1] as TipoRef, id: m[2], nome: m[3] }),
  },
  { re: /\{\{cond:([^}\n]+)\}\}/uy, fazer: (m) => ({ t: "cond", nome: m[1].trim() }) },
  {
    re: /\{\{efeito:([a-z][a-z0-9_]*)(?:#(\d+))?(?:\|([^}\n]*))?\}\}/uy,
    fazer: (m) => ({
      t: "efeito",
      slug: m[1],
      ...(m[2] ? { idx: Number(m[2]) } : {}),
      ...(m[3]?.trim() ? { param: m[3].trim() } : {}),
    }),
  },
  { re: /\{\{duracao\}\}/uy, fazer: () => ({ t: "duracao" }) },
  {
    re: /\{\{salv:([a-z]+)(?:\|(\d{1,2}))?\}\}/uy,
    fazer: (m) => ({ t: "salv", atributo: m[1], ...(m[2] ? { cd: Number(m[2]) } : {}) }),
  },
  { re: /\{\{attr:([a-z]+)\}\}/uy, fazer: (m) => ({ t: "attr", atributo: m[1] }) },
  { re: /\{\{dano:([^}\n]+)\}\}/uy, fazer: (m) => ({ t: "dano", tipo: m[1].trim() }) },
  {
    re: /\(\(((?:[^()\n|]|\([^()\n]*\))+)(?:\|([^()\n]+))?\)\)/uy,
    fazer: (m) => ({ t: "rolagem", formula: m[1].trim(), ...(m[2]?.trim() ? { dano: m[2].trim() } : {}) }),
  },
  {
    re: new RegExp(String.raw`(?<![${PALAVRA}]):([a-z][a-z0-9-]*):(?![${PALAVRA}])`, "uy"),
    fazer: (m) => ({ t: "icone", slug: m[1] }),
  },
];

const COR_ABRE = new RegExp(String.raw`\{\{cor:(${HEX})(?:\+(${HEX}))?(?::([a-z]+))?\|`, "uy");

function atomoEm(s: string, i: number): { no: Inline; tam: number } | null {
  for (const a of ATOMOS) {
    a.re.lastIndex = i;
    const m = a.re.exec(s);
    if (m) return { no: a.fazer(m), tam: m[0].length };
  }
  return null;
}

const ehEspaco = (c: string | undefined) => c === undefined || /\s/.test(c);
// Abre marca se o próximo caractere existe, não é espaço e não é outro `*`/`_`.
const abre = (s: string, i: number, delim: string) =>
  !ehEspaco(s[i + delim.length]) && s[i + delim.length] !== delim[0];

type Leitura = { nodes: Inline[]; i: number; fechou: boolean };

// `fecha`: o delimitador que encerra esta leitura (null = fim do texto).
// Marca que não fecha vira texto: o delimitador entra como está.
function ler(s: string, i: number, fecha: string | null, fundo: number): Leitura {
  const nodes: Inline[] = [];
  let buf = "";
  const solta = () => {
    if (buf) {
      nodes.push({ t: "texto", v: buf });
      buf = "";
    }
  };

  while (i < s.length) {
    const c = s[i];

    if (c === "\\" && i + 1 < s.length && ESC.includes(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
      continue;
    }

    // Fechamentos. `*` dentro de `**…`: se parece abertura de negrito, abre.
    const tam = fecha && s.startsWith(fecha, i) ? fecha.length : 0;
    if (
      tam > 0 &&
      (fecha !== "*" || (!(s.startsWith("**", i) && abre(s, i, "**")) && !ehEspaco(s[i - 1])))
    ) {
      solta();
      return { nodes, i: i + tam, fechou: true };
    }

    const atomo = atomoEm(s, i);
    if (atomo) {
      solta();
      nodes.push(atomo.no);
      i += atomo.tam;
      continue;
    }

    if (fundo < 8) {
      COR_ABRE.lastIndex = i;
      const m = COR_ABRE.exec(s);
      if (m) {
        const r = ler(s, i + m[0].length, "}}", fundo + 1);
        if (r.fechou) {
          solta();
          nodes.push({
            t: "cor",
            cor: m[1].toLowerCase(),
            ...(m[2] ? { cor2: m[2].toLowerCase() } : {}),
            ...(m[3] ? { efeito: m[3] } : {}),
            filhos: r.nodes,
          });
          i = r.i;
          continue;
        }
      }
      let abriu = false;
      for (const [delim, marca] of [
        ["**", "negrito"],
        ["__", "sublinhado"],
        ["*", "italico"],
      ] as [string, MarcaTexto][]) {
        if (!s.startsWith(delim, i) || !abre(s, i, delim)) continue;
        const r = ler(s, i + delim.length, delim, fundo + 1);
        if (r.fechou && r.nodes.length > 0) {
          solta();
          nodes.push({ t: "marca", m: marca, filhos: r.nodes });
          i = r.i;
          abriu = true;
        }
        break;
      }
      if (abriu) continue;
    }

    buf += c;
    i++;
  }
  solta();
  return { nodes, i, fechou: false };
}

export function lerInline(s: string): Inline[] {
  return ler(s, 0, null, 0).nodes;
}

// Os átomos (chips) completos que aparecem num trecho de texto, com a posição:
// `{{efeito:cura#2}}`, `[[acao:id|Nome]]`, `((2d6))`, `:fogo:`. O editor usa pra
// trocar por chip o código que a pessoa digitou ou colou.
export function acharAtomos(s: string): { inicio: number; fim: number; no: Inline }[] {
  const out: { inicio: number; fim: number; no: Inline }[] = [];
  let i = 0;
  while (i < s.length) {
    const a = atomoEm(s, i);
    if (a) {
      out.push({ inicio: i, fim: i + a.tam, no: a.no });
      i += a.tam;
    } else i++;
  }
  return out;
}

/* ─── Leitura em bloco ───────────────────────────────────── */

const RE_LISTA = /^( *)-(?::([a-z][a-z0-9-]*):)? (.*)$/;
const RE_NUM = /^( *)\d+\. (.*)$/;

const nivelDe = (recuo: string) => Math.min(NIVEL_MAXIMO, Math.floor(recuo.length / 2));

export function lerBloco(linha: string): Bloco {
  if (linha === "---") return { b: "hr" };
  let m: RegExpExecArray | null;
  if ((m = RE_LISTA.exec(linha))) {
    return { b: "lista", nivel: nivelDe(m[1]), ...(m[2] ? { icone: m[2] } : {}), filhos: lerInline(m[3]) };
  }
  if ((m = RE_NUM.exec(linha))) return { b: "num", nivel: nivelDe(m[1]), filhos: lerInline(m[2]) };
  if (linha.startsWith("## ")) return { b: "titulo", filhos: lerInline(linha.slice(3)) };
  if (linha.startsWith("> ")) return { b: "citacao", filhos: lerInline(linha.slice(2)) };
  return { b: "p", filhos: lerInline(linha) };
}

export function parseDescricaoRica(texto: string | null | undefined): Bloco[] {
  if (!texto) return [];
  return texto.split("\n").map(lerBloco);
}

/* ─── Escrita ────────────────────────────────────────────── */

// Escapa só o que, relido, viraria marcação: um texto comum passa intacto.
function escaparTexto(v: string): string {
  let out = "";
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    const prox = v[i + 1];
    const ant = v[i - 1];
    let esc = false;
    if (c === "\\") esc = prox !== undefined && ESC.includes(prox);
    else if (c === "*") esc = !ehEspaco(prox) || !ehEspaco(ant);
    else if (c === "_") esc = prox === "_" || ant === "_";
    else if (c === "[" || c === "{" || c === "(") esc = prox === c;
    else if (c === "}") esc = prox === "}";
    else if (c === ":") {
      const resto = /^:([a-z][a-z0-9-]*):/.exec(v.slice(i));
      esc = !!resto && (i === 0 || !new RegExp(`[${PALAVRA}]`, "u").test(ant!));
    }
    out += esc ? `\\${c}` : c;
  }
  return out;
}

const DELIM: Record<MarcaTexto, string> = { negrito: "**", italico: "*", sublinhado: "__" };

// Parte de texto de um nó, pra poder tirar os espaços das pontas de uma marca
// (`** a**` não abre).
function aparar(filhos: Inline[]): { ini: string; fim: string; filhos: Inline[] } {
  const copia = filhos.map((f) => ({ ...f })) as Inline[];
  let ini = "";
  let fim = "";
  const primeiro = copia[0];
  if (primeiro?.t === "texto") {
    const m = /^\s+/.exec(primeiro.v);
    if (m) {
      ini = m[0];
      primeiro.v = primeiro.v.slice(m[0].length);
    }
  }
  const ultimo = copia[copia.length - 1];
  if (ultimo?.t === "texto") {
    const m = /\s+$/.exec(ultimo.v);
    if (m) {
      fim = m[0];
      ultimo.v = ultimo.v.slice(0, ultimo.v.length - m[0].length);
    }
  }
  return { ini, fim, filhos: copia.filter((f) => f.t !== "texto" || f.v !== "") };
}

type ParteToken = { v: string; icone?: boolean };

const TERMINA_EM_PALAVRA = new RegExp(`[${PALAVRA}]$`, "u");
const COMECA_EM_PALAVRA = new RegExp(`^[${PALAVRA}]`, "u");

// Ícone encostado em letra, dígito ou ":" ganha um espaço (senão `abc:fogo:`
// voltaria como texto puro). O espaço automático que o v1 já tinha.
function juntar(partes: ParteToken[]): string {
  let s = "";
  let aposIcone = false;
  for (const p of partes) {
    if (!p.v) continue;
    if (p.icone && TERMINA_EM_PALAVRA.test(s)) s += " ";
    else if (aposIcone && COMECA_EM_PALAVRA.test(p.v)) s += " ";
    s += p.v;
    aposIcone = !!p.icone;
  }
  return s;
}

function partes(nos: Inline[]): ParteToken[] {
  const out: ParteToken[] = [];
  for (const no of nos) {
    switch (no.t) {
      case "texto": {
        // Só escapa se, relido cru, o trecho deixasse de ser texto: assim o texto
        // antigo não ganha barras só por ter sido editado.
        const lido = lerInline(no.v);
        const igual = lido.length === 0 || (lido.length === 1 && lido[0].t === "texto" && lido[0].v === no.v);
        out.push({ v: igual ? no.v : escaparTexto(no.v) });
        break;
      }
      case "marca": {
        const a = aparar(no.filhos);
        const dentro = juntar(partes(a.filhos));
        const d = DELIM[no.m];
        out.push({ v: dentro ? `${a.ini}${d}${dentro}${d}${a.fim}` : a.ini + a.fim });
        break;
      }
      case "cor": {
        const dentro = juntar(partes(no.filhos));
        if (!dentro) break;
        const spec = `${no.cor}${no.cor2 ? `+${no.cor2}` : ""}${no.efeito ? `:${no.efeito}` : ""}`;
        out.push({ v: `{{cor:${spec}|${dentro}}}` });
        break;
      }
      case "ref":
        out.push({ v: `[[${no.tipo}:${no.id}|${no.nome}]]` });
        break;
      case "cond":
        out.push({ v: `{{cond:${no.nome}}}` });
        break;
      case "efeito":
        out.push({ v: `{{efeito:${no.slug}${no.idx !== undefined ? `#${no.idx}` : ""}${no.param ? `|${no.param}` : ""}}}` });
        break;
      case "duracao":
        out.push({ v: "{{duracao}}" });
        break;
      case "salv":
        out.push({ v: `{{salv:${no.atributo}${no.cd ? `|${no.cd}` : ""}}}` });
        break;
      case "attr":
        out.push({ v: `{{attr:${no.atributo}}}` });
        break;
      case "dano":
        out.push({ v: `{{dano:${no.tipo}}}` });
        break;
      case "icone":
        out.push({ v: `:${no.slug}:`, icone: true });
        break;
      case "rolagem":
        out.push({ v: `((${no.formula}${no.dano ? `|${no.dano}` : ""}))` });
        break;
    }
  }
  return out;
}

export function serializarInline(nos: Inline[]): string {
  return juntar(partes(nos));
}

export function serializarBloco(bl: Bloco): string {
  if (bl.b === "hr") return "---";
  const corpo = serializarInline(bl.filhos);
  switch (bl.b) {
    case "lista":
      return `${"  ".repeat(bl.nivel)}-${bl.icone ? `:${bl.icone}:` : ""} ${corpo}`;
    case "num":
      return `${"  ".repeat(bl.nivel)}1. ${corpo}`;
    case "titulo":
      return `## ${corpo}`;
    case "citacao":
      return `> ${corpo}`;
    case "p":
      // Parágrafo que, escrito cru, seria lido como bloco: escapa o começo.
      if (/^ *-(?::[a-z][a-z0-9-]*:)? /.test(corpo)) return corpo.replace("-", "\\-");
      if (/^ *\d+\. /.test(corpo)) return corpo.replace(".", "\\.");
      if (corpo.startsWith("## ")) return `\\${corpo}`;
      if (corpo.startsWith("> ")) return `\\${corpo}`;
      if (corpo === "---") return "\\---";
      return corpo;
  }
}

export function serializarDescricaoRica(blocos: Bloco[]): string {
  return blocos.map(serializarBloco).join("\n");
}

// Número de cada item numerado (null nos outros blocos). Cada nível conta
// por conta própria e zera quando a lista numerada é interrompida.
export function numerarBlocos(blocos: { b: string; nivel?: number }[]): (number | null)[] {
  const cont: number[] = [];
  return blocos.map((bl) => {
    if (bl.b === "lista") return null;
    if (bl.b !== "num") {
      cont.length = 0;
      return null;
    }
    const n = bl.nivel ?? 0;
    cont.length = n + 1;
    cont[n] = (cont[n] ?? 0) + 1;
    return cont[n];
  });
}

/* ─── Consultas ──────────────────────────────────────────── */

export function percorrer(nos: Inline[], fn: (no: Inline) => void) {
  for (const no of nos) {
    fn(no);
    if (no.t === "marca" || no.t === "cor") percorrer(no.filhos, fn);
  }
}

function todosInline(texto: string | null | undefined): Inline[] {
  const out: Inline[] = [];
  for (const bl of parseDescricaoRica(texto)) if (bl.b !== "hr") percorrer(bl.filhos, (n) => out.push(n));
  return out;
}

export function textoPuroInline(nos: Inline[]): string {
  let s = "";
  for (const no of nos) {
    switch (no.t) {
      case "texto":
        s += no.v;
        break;
      case "marca":
      case "cor":
        s += textoPuroInline(no.filhos);
        break;
      case "ref":
      case "cond":
        s += no.nome;
        break;
      case "efeito":
        s += no.param ? `${no.slug} ${no.param}` : no.slug;
        break;
      case "duracao":
        s += "duração";
        break;
      case "salv":
        s += `${siglaDoAtributo(no.atributo)}${no.cd ? ` CD ${no.cd}` : ""}`;
        break;
      case "attr":
        s += siglaDoAtributo(no.atributo);
        break;
      case "dano":
        s += no.tipo;
        break;
      case "rolagem":
        s += no.dano ? `${no.formula} ${no.dano}` : no.formula;
        break;
      case "icone":
        break;
    }
  }
  return s;
}

// Só o que se lê: pra busca e resumo de card. Tópicos viram linhas com "• ".
export function textoPuroRico(texto: string | null | undefined): string {
  return parseDescricaoRica(texto)
    .map((bl) => (bl.b === "hr" ? "" : (bl.b === "lista" || bl.b === "num" ? "• " : "") + textoPuroInline(bl.filhos)))
    .join("\n")
    .trim();
}

// Primeiro trecho que diz algo (pula título, linha e linhas vazias): vira o
// resumo de uma linha do card. Devolve o bloco como parágrafo (sem o marcador
// de tópico), pronto pra serializar e desenhar.
export function resumoRico(texto: string | null | undefined): Bloco | null {
  for (const bl of parseDescricaoRica(texto)) {
    if (bl.b === "hr" || bl.b === "titulo" || textoPuroInline(bl.filhos).trim() === "") continue;
    return { b: "p", filhos: bl.filhos };
  }
  return null;
}

// O texto usa algum recurso da descrição rica (chip, marca, lista, título…)? Texto
// antigo, puro, devolve false e segue com o destaque de condição de sempre.
export function temMarcacaoRica(texto: string | null | undefined): boolean {
  return parseDescricaoRica(texto).some(
    (bl) => bl.b !== "p" || bl.filhos.some((n) => n.t !== "texto"),
  );
}

export function referenciasDeRica(texto: string | null | undefined): { tipo: TipoRef; id: string }[] {
  const vistas = new Set<string>();
  const out: { tipo: TipoRef; id: string }[] = [];
  for (const no of todosInline(texto)) {
    if (no.t !== "ref") continue;
    const k = `${no.tipo}:${no.id}`;
    if (!vistas.has(k)) {
      vistas.add(k);
      out.push({ tipo: no.tipo, id: no.id });
    }
  }
  return out;
}

// Índices dos efeitos da ação que a descrição cita (`{{efeito:…#N}}`).
export function efeitosCitados(texto: string | null | undefined): number[] {
  const out = new Set<number>();
  for (const no of todosInline(texto)) if (no.t === "efeito" && no.idx !== undefined) out.add(no.idx);
  return [...out].sort((a, b) => a - b);
}

// Os chips de efeito da ação, como estão no texto (tipo e índice gravados).
// Quem sabe os efeitos atuais resolve cada um (o índice pode ter envelhecido).
export function chipsDeEfeitoDaAcao(texto: string | null | undefined): { slug: string; idx: number }[] {
  const out: { slug: string; idx: number }[] = [];
  for (const no of todosInline(texto)) if (no.t === "efeito" && no.idx !== undefined) out.push({ slug: no.slug, idx: no.idx });
  return out;
}

// A descrição cita a duração da ação?
export function citaDuracao(texto: string | null | undefined): boolean {
  return todosInline(texto).some((no) => no.t === "duracao");
}

// Tudo que a descrição chama do catálogo: efeitos, tipos de dano, condições.
export function usosDoCatalogo(texto: string | null | undefined): {
  efeitos: string[];
  danos: string[];
  condicoes: string[];
} {
  const efeitos = new Set<string>();
  const danos = new Set<string>();
  const condicoes = new Set<string>();
  for (const no of todosInline(texto)) {
    if (no.t === "efeito") efeitos.add(no.slug);
    if (no.t === "dano") danos.add(no.tipo);
    if (no.t === "rolagem" && no.dano) danos.add(no.dano);
    if (no.t === "cond") condicoes.add(no.nome);
  }
  return { efeitos: [...efeitos], danos: [...danos], condicoes: [...condicoes] };
}
