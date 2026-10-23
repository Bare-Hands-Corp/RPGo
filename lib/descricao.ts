// Descrição rica: o texto salvo continua sendo uma string (coluna `descricao`
// de sempre), com tokens no meio. Descrição antiga, em texto puro, é válida.
//
//   [[acao:ID|Nome]]  referência (acao | hab | item), mostra o nome guardado
//   {{cond:Atordoado}} condição, pelo nome
//   :fogo:             ícone Font Awesome (`fa-fogo`)
//   ((2d6+FOR))        rolagem, vira link que empilha no Rolador
//   **negrito**
//
// Módulo puro (sem DOM, sem React): serve ao renderizador, ao editor e ao
// servidor (busca, pré-visualização).

export type TipoRef = "acao" | "hab" | "item";

export type NoDescricao =
  | { t: "texto"; v: string }
  | { t: "negrito"; v: string }
  | { t: "ref"; tipo: TipoRef; id: string; nome: string }
  | { t: "cond"; nome: string }
  | { t: "icone"; slug: string }
  | { t: "rolagem"; formula: string };

export const ICONE_REF: Record<TipoRef, string> = {
  acao: "fa-bolt",
  hab: "fa-star",
  item: "fa-box",
};
export const ICONE_COND = "fa-triangle-exclamation";
export const ICONE_ROLAGEM = "fa-dice-d20";

// Uma alternativa por token. Grupos: 1 tipo, 2 id, 3 nome, 4 condição,
// 5 rolagem (aceita um nível de parênteses, ex. "2d6+(FOR)"), 6 ícone,
// 7 negrito. O ícone não casa colado em letra/dígito ("12:30:45", "Nota:a:"),
// pra não comer texto antigo; o serializador põe um espaço onde ele encostar.
const PALAVRA = String.raw`\p{L}\p{N}_:`;
const TOKEN = new RegExp(
  [
    String.raw`\[\[(acao|hab|item):([^|\]\n]+)\|([^\]\n]*)\]\]`,
    String.raw`\{\{cond:([^}\n]+)\}\}`,
    String.raw`\(\(((?:[^()\n]|\([^()\n]*\))+)\)\)`,
    String.raw`(?<![${PALAVRA}]):([a-z][a-z0-9-]*):(?![${PALAVRA}])`,
    String.raw`\*\*([^*\n]+)\*\*`,
  ].join("|"),
  "gu",
);

export function parseDescricao(texto: string | null | undefined): NoDescricao[] {
  const nos: NoDescricao[] = [];
  if (!texto) return nos;
  let fim = 0;
  for (const m of texto.matchAll(TOKEN)) {
    const ini = m.index ?? 0;
    if (ini > fim) nos.push({ t: "texto", v: texto.slice(fim, ini) });
    if (m[1]) nos.push({ t: "ref", tipo: m[1] as TipoRef, id: m[2], nome: m[3] });
    else if (m[4]) nos.push({ t: "cond", nome: m[4].trim() });
    else if (m[5]) nos.push({ t: "rolagem", formula: m[5].trim() });
    else if (m[6]) nos.push({ t: "icone", slug: m[6] });
    else nos.push({ t: "negrito", v: m[7] });
    fim = ini + m[0].length;
  }
  if (fim < texto.length) nos.push({ t: "texto", v: texto.slice(fim) });
  return nos;
}

export function tokenDoNo(no: NoDescricao): string {
  switch (no.t) {
    case "texto":
      return no.v;
    case "negrito":
      return `**${no.v}**`;
    case "ref":
      return `[[${no.tipo}:${no.id}|${no.nome}]]`;
    case "cond":
      return `{{cond:${no.nome}}}`;
    case "icone":
      return `:${no.slug}:`;
    case "rolagem":
      return `((${no.formula}))`;
  }
}

// Pedaço de texto já em token. `icone` marca o `:slug:`, o único que precisa de
// cuidado com o vizinho.
export type ParteToken = { v: string; icone?: boolean };

const TERMINA_EM_PALAVRA = new RegExp(`[${PALAVRA}]$`, "u");
const COMECA_EM_PALAVRA = new RegExp(`^[${PALAVRA}]`, "u");

// Junta as partes. Ícone encostado em letra, dígito ou ":" ganha um espaço, senão
// `abc:fogo:` voltaria como texto puro ao reabrir a descrição.
export function juntarPartes(partes: ParteToken[]): string {
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

export function serializarDescricao(nos: NoDescricao[]): string {
  return juntarPartes(nos.map((no) => ({ v: tokenDoNo(no), icone: no.t === "icone" })));
}

// Só o que se lê: pra busca, resumo de card e e-mail. Ícones somem.
export function textoPuro(texto: string | null | undefined): string {
  return parseDescricao(texto)
    .map((no) => {
      switch (no.t) {
        case "texto":
        case "negrito":
          return no.v;
        case "ref":
        case "cond":
          return no.nome;
        case "rolagem":
          return no.formula;
        case "icone":
          return "";
      }
    })
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Referências usadas num texto (pra avisar quando a ação/habilidade apontada
// for apagada, ou pra montar o mapa de tooltips de uma só vez).
export function referenciasDe(texto: string | null | undefined): { tipo: TipoRef; id: string }[] {
  const vistas = new Set<string>();
  const out: { tipo: TipoRef; id: string }[] = [];
  for (const no of parseDescricao(texto)) {
    if (no.t !== "ref") continue;
    const k = `${no.tipo}:${no.id}`;
    if (vistas.has(k)) continue;
    vistas.add(k);
    out.push({ tipo: no.tipo, id: no.id });
  }
  return out;
}
