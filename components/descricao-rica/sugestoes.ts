// Sugestões de chip enquanto se digita: "envenenado" → a condição Envenenado,
// "2d6+3 fogo" → a rolagem com o tipo de dano. Puro (sem DOM): recebe o texto
// que está antes do cursor e devolve o que pode ser trocado por um chip.

import type { Atomo } from "./atomos";

export type Candidato = {
  chave: string;
  // Nomes pelos quais a pessoa pode chamar a coisa ("Soco de Teste").
  nomes: string[];
  no: Atomo;
  rotulo: string;
  categoria: string;
  icone: string;
  cor?: string;
  // Menor = aparece primeiro quando o casamento empata.
  prioridade: number;
};

export type Sugestao = {
  chave: string;
  no: Atomo;
  rotulo: string;
  categoria: string;
  icone: string;
  cor?: string;
  // Trecho de `antes` que o chip substitui: [inicio, fim).
  inicio: number;
  fim: number;
  exata: boolean;
  // Veio de o código estar sendo digitado (`{{efeito:`): Enter também aceita.
  codigo?: boolean;
};

export type OpcoesSugestao = {
  // A fórmula tem dados que se possa rolar?
  ehFormula: (formula: string) => boolean;
  tiposDano: string[];
  max?: number;
};

const LETRA = String.raw`\p{L}\p{N}`;
const FIM_DE_PALAVRA = /[\s.,;:!?)]$/;

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Rolagem no fim do texto: "2d6", "1d8+FOR", "2d6 + 3", e, depois, um tipo de dano.
const RE_ROLAGEM = new RegExp(
  String.raw`(?<![${LETRA}])(\d*d\d+(?:\s*[+\-]\s*[${LETRA}]+)*)(?:\s+([${LETRA}]{2,}))?$`,
  "u",
);

// Casa o que foi digitado com um nome do catálogo: começo do nome, ou, em
// palavra já inteira, a mesma raiz ("envenenada" → "Envenenado").
function casa(nome: string, frase: string): boolean {
  if (nome.startsWith(frase)) return true;
  return frase.length >= 6 && nome.length - frase.length <= 1 && nome.startsWith(frase.slice(0, -1));
}

function ultimasPalavras(base: string): { inicio: number; texto: string }[] {
  // Até 3 palavras seguidas (separadas só por espaço) que terminam no fim do texto.
  const palavras: { inicio: number; fim: number }[] = [];
  const re = /[^\s.,;:!?()]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(base))) palavras.push({ inicio: m.index, fim: m.index + m[0].length });
  const ult = palavras[palavras.length - 1];
  if (!ult || ult.fim !== base.length) return [];
  const frases: { inicio: number; texto: string }[] = [{ inicio: ult.inicio, texto: base.slice(ult.inicio) }];
  for (let k = 2; k <= 3; k++) {
    const p = palavras[palavras.length - k];
    const seguinte = palavras[palavras.length - k + 1];
    if (!p || !seguinte || !/^\s+$/.test(base.slice(p.fim, seguinte.inicio))) break;
    frases.push({ inicio: p.inicio, texto: base.slice(p.inicio) });
  }
  return frases;
}

export function sugerir(antes: string, candidatos: Candidato[], op: OpcoesSugestao): Sugestao[] {
  const terminou = FIM_DE_PALAVRA.test(antes);
  // Uma pontuação/espaço logo depois da palavra: só sugere se a palavra já está
  // inteira (exata); com a palavra ainda sendo escrita, aceita começo de nome.
  const base = terminou ? antes.slice(0, -1) : antes;
  if (!base || FIM_DE_PALAVRA.test(base)) return [];
  const out: Sugestao[] = [];

  // 1) Rolagem (com tipo de dano opcional).
  const mr = RE_ROLAGEM.exec(base);
  if (mr) {
    const formula = mr[1].replace(/\s+/g, "");
    // O lookbehind não consome nada: o casamento já começa nos dados.
    const inicio = mr.index;
    const palavra = mr[2];
    if (op.ehFormula(formula)) {
      if (palavra) {
        const np = norm(palavra);
        const tipo = op.tiposDano.find((t) => (terminou ? norm(t) === np : norm(t).startsWith(np)));
        if (tipo) {
          out.push({
            chave: `rolagem:${formula}|${tipo}`,
            no: { t: "rolagem", formula, dano: tipo },
            rotulo: `${formula} ${tipo}`,
            categoria: "Rolagem",
            icone: "fa-dice-d20",
            inicio,
            fim: base.length,
            exata: terminou,
          });
        }
      } else {
        out.push({
          chave: `rolagem:${formula}`,
          no: { t: "rolagem", formula },
          rotulo: formula,
          categoria: "Rolagem",
          icone: "fa-dice-d20",
          inicio,
          fim: base.length,
          exata: true,
        });
      }
    }
  }

  // 2) Nomes do catálogo (condições, efeitos, tipos de dano, ações…).
  const frases = ultimasPalavras(base);
  const achados: { s: Sugestao; tam: number; prio: number; nome: number }[] = [];
  for (const c of candidatos) {
    let melhor: { s: Sugestao; tam: number; prio: number; nome: number } | null = null;
    for (const nome of c.nomes) {
      const nn = norm(nome);
      for (const f of frases) {
        const nf = norm(f.texto);
        if (nf.length < 3) continue;
        const exata = nn === nf;
        if (terminou ? !exata : !casa(nn, nf)) continue;
        if (!melhor || nf.length > melhor.tam) {
          melhor = {
            s: {
              chave: c.chave,
              no: c.no,
              rotulo: c.rotulo,
              categoria: c.categoria,
              icone: c.icone,
              cor: c.cor,
              inicio: f.inicio,
              fim: base.length,
              exata,
            },
            tam: nf.length,
            prio: c.prioridade,
            nome: nn.length,
          };
        }
        break;
      }
    }
    if (melhor) achados.push(melhor);
  }
  achados.sort(
    (a, b) => Number(b.s.exata) - Number(a.s.exata) || b.tam - a.tam || a.prio - b.prio || a.nome - b.nome,
  );
  out.push(...achados.map((a) => a.s));
  return out.slice(0, op.max ?? 4);
}

/* ─── Autocompletar o código: `{{efeito:`, `{{cond:`, `[[acao:` ─── */

// Que tipo de chip cada palavra do código pede.
const TIPOS_CODIGO: Record<string, (n: Atomo) => boolean> = {
  efeito: (n) => n.t === "efeito",
  cond: (n) => n.t === "cond",
  dano: (n) => n.t === "dano",
  duracao: (n) => n.t === "duracao",
  salv: (n) => n.t === "salv",
  attr: (n) => n.t === "attr",
  acao: (n) => n.t === "ref" && n.tipo === "acao",
  hab: (n) => n.t === "ref" && n.tipo === "hab",
  item: (n) => n.t === "ref" && n.tipo === "item",
};
const COLCHETE = new Set(["acao", "hab", "item"]);

// Código aberto no fim do texto: `{{`, `{{ef`, `{{efeito:`, `{{efeito:dan`, `[[acao:so`.
const RE_CODIGO = /(\{\{|\[\[)([a-z]*)(?::([^}\]|\n#]*))?$/;

const semSublinhado = (s: string) => norm(s).replace(/_/g, " ").trim();

// Sugestões enquanto a pessoa escreve o próprio código. Só `{{` (ou `[[`) mostra o
// que existe (os efeitos da ação primeiro); com a palavra, filtra pelo nome ou
// pelo identificador (`dano_extra`). O chip substitui o código inteiro até o cursor.
export function sugerirCodigo(antes: string, candidatos: Candidato[], max = 8): Sugestao[] {
  const m = RE_CODIGO.exec(antes);
  if (!m) return [];
  const [, abre, palavra, depoisDosDoisPontos] = m;
  const temDoisPontos = depoisDosDoisPontos !== undefined;
  let tipoOk: (n: Atomo) => boolean = () => true;
  if (temDoisPontos) {
    const f = TIPOS_CODIGO[palavra];
    // `[[` só serve pra ação/habilidade/item e `{{` pro resto.
    if (!f || (abre === "[[") !== COLCHETE.has(palavra)) return [];
    tipoOk = f;
  } else if (abre === "[[") {
    tipoOk = (n) => n.t === "ref";
  }
  const q = semSublinhado(temDoisPontos ? depoisDosDoisPontos : palavra);
  const achados = candidatos
    .filter((c) => tipoOk(c.no))
    .filter(
      (c) =>
        !q ||
        c.nomes.some((n) => semSublinhado(n).includes(q)) ||
        // `{{ef` : a palavra começada também escolhe pelo tipo ("efeito", "cond"…).
        (!temDoisPontos && Object.entries(TIPOS_CODIGO).some(([k, f]) => k.startsWith(q) && f(c.no))),
    )
    .sort((a, b) => a.prioridade - b.prioridade || a.rotulo.localeCompare(b.rotulo));
  return achados.slice(0, max).map((c) => ({
    chave: c.chave,
    no: c.no,
    rotulo: c.rotulo,
    categoria: c.categoria,
    icone: c.icone,
    cor: c.cor,
    inicio: m.index,
    fim: antes.length,
    exata: false,
    codigo: true,
  }));
}
