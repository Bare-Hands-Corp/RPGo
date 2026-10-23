"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ICONES_CATALOGO } from "@/components/icone-picker";
import { faixaDaRolagem, formulaTexto, parseFormulaDados } from "@/lib/dice";
import {
  ICONE_COND,
  ICONE_REF,
  ICONE_ROLAGEM,
  juntarPartes,
  parseDescricao,
  tokenDoNo,
  type NoDescricao,
  type ParteToken,
  type TipoRef,
} from "@/lib/descricao";
import "./descricao.css";

export type OpcaoRef = { tipo: TipoRef; id: string; nome: string; detalhe?: string };

type Painel = "ref" | "icone" | "rolagem" | null;

const ROTULO_TIPO: Record<TipoRef, string> = { acao: "Ação", hab: "Habilidade", item: "Item" };

// Editor leve: um contentEditable em que os tokens viram chips não editáveis
// (`data-tok` guarda o token) e o texto livre segue normal. O valor é sempre a
// string de tokens — ler = `lerDom`, escrever = `paraDom`. Sem biblioteca.
export function EditorDescricao({
  valor,
  onChange,
  refs = [],
  condicoes = [],
  placeholder = "Descreva o efeito…",
}: {
  valor: string;
  onChange: (texto: string) => void;
  refs?: OpcaoRef[];
  condicoes?: string[];
  placeholder?: string;
}) {
  const campo = useRef<HTMLDivElement>(null);
  // Último texto que o próprio editor emitiu: se `valor` for outro, veio de
  // fora (carregar, rascunho) e o DOM é refeito; se for igual, não mexe, pra
  // não jogar o cursor pro início a cada tecla.
  const ultimo = useRef<string | null>(null);
  const rangeSalvo = useRef<Range | null>(null);
  const [painel, setPainel] = useState<Painel>(null);

  useEffect(() => {
    const el = campo.current;
    if (!el || ultimo.current === valor) return;
    el.replaceChildren(...paraDom(parseDescricao(valor)));
    ultimo.current = valor;
  }, [valor]);

  function emitir() {
    const el = campo.current;
    if (!el) return;
    const texto = lerDom(el);
    ultimo.current = texto;
    onChange(texto);
  }

  // Onde inserir: a seleção, se estiver no campo; senão, o fim.
  function rangeAtual(): Range {
    const el = campo.current!;
    const sel = window.getSelection();
    if (sel && sel.rangeCount && el.contains(sel.anchorNode)) return sel.getRangeAt(0);
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    return r;
  }

  function abrir(p: Exclude<Painel, null>) {
    rangeSalvo.current = rangeAtual().cloneRange();
    setPainel((atual) => (atual === p ? null : p));
  }

  function inserir(nos: NoDescricao[]) {
    const el = campo.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection()!;
    if (rangeSalvo.current) {
      sel.removeAllRanges();
      sel.addRange(rangeSalvo.current);
    }
    const r = rangeAtual();
    r.deleteContents();
    const frag = document.createDocumentFragment();
    frag.append(...paraDom(nos));
    // Espaço depois do chip: sem nada depois dele o cursor não tem onde ficar.
    if (nos.length === 1 && nos[0].t !== "texto" && nos[0].t !== "negrito") frag.append(" ");
    const ult = frag.lastChild;
    r.insertNode(frag);
    if (ult) r.setStartAfter(ult);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    rangeSalvo.current = null;
    setPainel(null);
    emitir();
  }

  function negrito() {
    const el = campo.current;
    if (!el) return;
    const r = rangeAtual();
    if (r.collapsed) return;
    // Só o texto: chip dentro de negrito não existe no formato.
    const txt = r.toString();
    if (!txt.trim() || txt.includes("\n")) return;
    r.deleteContents();
    const strong = document.createElement("strong");
    strong.textContent = txt;
    r.insertNode(strong);
    const sel = window.getSelection()!;
    r.setStartAfter(strong);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    emitir();
  }

  function colar(e: React.ClipboardEvent) {
    e.preventDefault();
    // Sempre texto puro; se vier com tokens (copiado de outra descrição), eles
    // viram chips.
    rangeSalvo.current = null;
    inserir(parseDescricao(e.clipboardData.getData("text/plain")));
  }

  function teclas(e: React.KeyboardEvent) {
    if (e.key === "Escape") setPainel(null);
    if (e.key === "Enter") {
      // O navegador criaria <div>/<br>; o formato guarda "\n" mesmo.
      e.preventDefault();
      rangeSalvo.current = null;
      inserir([{ t: "texto", v: "\n" }]);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      negrito();
    }
  }

  return (
    <div className="desc-editor">
      <div className="desc-barra" role="toolbar" aria-label="Formatação da descrição">
        {/* mouseDown impede a perda da seleção ao clicar na barra */}
        <button type="button" title="Negrito (Ctrl+B)" onMouseDown={(e) => e.preventDefault()} onClick={negrito}>
          <i className="fas fa-bold" />
        </button>
        <button
          type="button"
          aria-pressed={painel === "icone"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => abrir("icone")}
        >
          <i className="fas fa-icons" /> Ícone
        </button>
        <button
          type="button"
          aria-pressed={painel === "ref"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => abrir("ref")}
        >
          <i className="fas fa-link" /> Referência
        </button>
        <button
          type="button"
          aria-pressed={painel === "rolagem"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => abrir("rolagem")}
        >
          <i className={`fas ${ICONE_ROLAGEM}`} /> Rolagem
        </button>
      </div>

      {painel === "icone" && <PainelIcone aoEscolher={(slug) => inserir([{ t: "icone", slug }])} />}
      {painel === "ref" && (
        <PainelRef
          refs={refs}
          condicoes={condicoes}
          aoEscolher={(no) => inserir([no])}
          aoFechar={() => setPainel(null)}
        />
      )}
      {painel === "rolagem" && (
        <PainelRolagem aoInserir={(formula) => inserir([{ t: "rolagem", formula }])} aoFechar={() => setPainel(null)} />
      )}

      <div
        ref={campo}
        className="desc-campo"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Descrição"
        data-placeholder={placeholder}
        spellCheck
        onInput={emitir}
        onPaste={colar}
        onKeyDown={teclas}
      />
    </div>
  );
}

/* ─── Painéis ────────────────────────────────────────────── */

function PainelIcone({ aoEscolher }: { aoEscolher: (slug: string) => void }) {
  const [busca, setBusca] = useState("");
  const todos = useMemo(() => ICONES_CATALOGO.flatMap((g) => g.icones), []);
  const q = busca.trim().toLowerCase();
  const lista = q ? todos.filter((i) => i.nome.toLowerCase().includes(q) || i.slug.includes(q)) : todos;
  return (
    <div className="desc-painel">
      <input autoFocus placeholder="Buscar ícone…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="desc-painel-grade">
        {lista.map((i) => (
          <button key={i.slug} type="button" title={i.nome} onClick={() => aoEscolher(i.slug.replace(/^fa-/, ""))}>
            <i className={`fas ${i.slug}`} />
          </button>
        ))}
        {lista.length === 0 && <span className="desc-painel-dica">Nenhum ícone.</span>}
      </div>
    </div>
  );
}

function PainelRef({
  refs,
  condicoes,
  aoEscolher,
  aoFechar,
}: {
  refs: OpcaoRef[];
  condicoes: string[];
  aoEscolher: (no: NoDescricao) => void;
  aoFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const q = busca.trim().toLowerCase();
  const itens = useMemo(() => {
    const todos: { chave: string; rotulo: string; icone: string; tipo: string; no: NoDescricao }[] = [
      ...refs.map((r) => ({
        chave: `${r.tipo}:${r.id}`,
        rotulo: r.nome,
        icone: ICONE_REF[r.tipo],
        tipo: ROTULO_TIPO[r.tipo],
        no: { t: "ref", tipo: r.tipo, id: r.id, nome: r.nome } as NoDescricao,
      })),
      ...condicoes.map((c) => ({
        chave: `cond:${c}`,
        rotulo: c,
        icone: ICONE_COND,
        tipo: "Condição",
        no: { t: "cond", nome: c } as NoDescricao,
      })),
    ];
    return q ? todos.filter((i) => i.rotulo.toLowerCase().includes(q)) : todos;
  }, [refs, condicoes, q]);

  return (
    <div className="desc-painel">
      <input
        autoFocus
        placeholder="Buscar ação, habilidade, item ou condição…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && itens[0]) {
            e.preventDefault();
            aoEscolher(itens[0].no);
          }
          if (e.key === "Escape") aoFechar();
        }}
      />
      <div className="desc-painel-lista">
        {itens.map((i) => (
          <button key={i.chave} type="button" className="desc-painel-item" onClick={() => aoEscolher(i.no)}>
            <i className={`fas ${i.icone}`} /> {i.rotulo}
            <small>{i.tipo}</small>
          </button>
        ))}
        {itens.length === 0 && <span className="desc-painel-dica">Nada encontrado.</span>}
      </div>
    </div>
  );
}

function PainelRolagem({ aoInserir, aoFechar }: { aoInserir: (formula: string) => void; aoFechar: () => void }) {
  const [formula, setFormula] = useState("");
  const f = formula.trim();
  const { dados, modificador } = parseFormulaDados(f);
  const faixa = dados.length ? faixaDaRolagem(dados, modificador) : null;
  // `((…))` não aceita parênteses soltos nem quebra de linha.
  const valida = !!f && dados.length > 0 && /^(?:[^()\n]|\([^()\n]*\))+$/.test(f);
  return (
    <div className="desc-painel">
      <input
        autoFocus
        placeholder="Ex: 2d6+FOR"
        value={formula}
        onChange={(e) => setFormula(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (valida) aoInserir(f);
          }
          if (e.key === "Escape") aoFechar();
        }}
      />
      <span className="desc-painel-dica">
        {faixa
          ? `${formulaTexto(dados, modificador)} · de ${faixa.min} a ${faixa.max} (siglas como FOR são resolvidas pela ficha na hora de rolar)`
          : "Escreva dados, como 1d8, 2d6+3."}
      </span>
      <div className="desc-painel-acoes">
        <button type="button" onClick={aoFechar}>
          Cancelar
        </button>
        <button type="button" className="primario" disabled={!valida} onClick={() => aoInserir(f)}>
          Inserir
        </button>
      </div>
    </div>
  );
}

/* ─── DOM ⇄ tokens ───────────────────────────────────────── */

// Chip como elemento. O texto é só aparência; o que vale é o `data-tok`.
function elementoChip(no: Exclude<NoDescricao, { t: "texto" } | { t: "negrito" }>): HTMLElement {
  const el = document.createElement("span");
  el.contentEditable = "false";
  el.dataset.tok = tokenDoNo(no);
  const i = document.createElement("i");
  let classe = "";
  let rotulo = "";
  switch (no.t) {
    case "ref":
      classe = `desc-chip--${no.tipo}`;
      i.className = `fas ${ICONE_REF[no.tipo]}`;
      rotulo = no.nome;
      break;
    case "cond":
      classe = "desc-chip--cond";
      i.className = `fas ${ICONE_COND}`;
      rotulo = no.nome;
      break;
    case "rolagem":
      classe = "desc-chip--rolagem";
      i.className = `fas ${ICONE_ROLAGEM}`;
      rotulo = no.formula;
      break;
    case "icone":
      el.className = "desc-chip desc-chip--icone";
      i.className = `fas fa-${no.slug}`;
      el.append(i);
      return el;
  }
  el.className = `desc-chip ${classe}`;
  el.append(i, rotulo);
  return el;
}

export function paraDom(nos: NoDescricao[]): Node[] {
  return nos.map((no) => {
    if (no.t === "texto") return document.createTextNode(no.v);
    if (no.t === "negrito") {
      const s = document.createElement("strong");
      s.textContent = no.v;
      return s;
    }
    return elementoChip(no);
  });
}

// Lê o campo de volta pra string de tokens. Tolera o que o navegador insere
// por conta própria (<br>, <div>, <b>), mesmo com o Enter e o colar tratados.
export function lerDom(pai: Node): string {
  return juntarPartes(partesDoDom(pai));
}

function partesDoDom(pai: Node): ParteToken[] {
  const partes: ParteToken[] = [];
  pai.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      partes.push({ v: (n.textContent ?? "").replace(/​/g, "") });
      return;
    }
    if (!(n instanceof HTMLElement)) return;
    const tok = n.dataset.tok;
    if (tok) partes.push({ v: tok, icone: n.classList.contains("desc-chip--icone") });
    else if (n.tagName === "BR") partes.push({ v: "\n" });
    else if (n.tagName === "STRONG" || n.tagName === "B") {
      const t = (n.textContent ?? "").replace(/​/g, "");
      if (t) partes.push({ v: `**${t}**` });
    } else {
      // <div>/<p> que o navegador criou por conta própria: vira linha.
      const dentro = partesDoDom(n);
      const atual = partes.map((p) => p.v).join("");
      if (atual && !atual.endsWith("\n")) partes.push({ v: "\n" });
      partes.push(...dentro);
    }
  });
  return partes;
}
