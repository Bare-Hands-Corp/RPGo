"use client";

import { useMemo, useState } from "react";
import { ICONES_CATALOGO } from "@/components/icone-picker";
import { parseFormulaDados } from "@/lib/dice";
import { ATRIBUTOS_RICOS } from "@/lib/descricao-rica";
import type { TipoDanoCatalogo } from "@/lib/tipos-dano";
import {
  EFEITOS_CATALOGO,
  EFEITOS_COR,
  ICONE_COND,
  ICONE_REF,
  PALETA_TEXTO,
  estiloDeCor,
  resumoRolagem,
  type Atomo,
  type ContextoRico,
  type OpcaoEfeitoAcao,
  type OpcaoRef,
} from "./atomos";

/* ─── Inserir (ação, habilidade, item, condição, efeito, dano) ─── */

type Categoria = "tudo" | "daacao" | "acao" | "hab" | "item" | "cond" | "efeito" | "dano" | "attr";
const CATEGORIAS: { id: Categoria; nome: string }[] = [
  { id: "tudo", nome: "Tudo" },
  { id: "daacao", nome: "Desta ação" },
  { id: "acao", nome: "Ações" },
  { id: "hab", nome: "Habilidades" },
  { id: "item", nome: "Itens" },
  { id: "cond", nome: "Condições" },
  { id: "efeito", nome: "Efeitos" },
  { id: "dano", nome: "Dano" },
  { id: "attr", nome: "Atributos" },
];

type Opcao = {
  chave: string;
  cat: Exclude<Categoria, "tudo">;
  rotulo: string;
  icone: string;
  cor?: string;
  rotuloCat: string;
  no?: Atomo;
  // Efeito que pede um parâmetro (tipo de dano ou condição) antes de entrar.
  pedeParam?: "dano" | "cond";
  slug?: string;
};

export const PEDE_DANO = new Set(["resistencia", "imunidade", "vulnerabilidade"]);
export const PEDE_COND = new Set(["condicao_imune", "condicao_aplicar", "condicao_remover"]);

export function PainelInserir({
  refs,
  condicoes,
  tiposDano,
  efeitosAcao = [],
  duracaoAcao,
  inicial = "tudo",
  aoEscolher,
  aoFechar,
}: {
  refs: OpcaoRef[];
  condicoes: string[];
  tiposDano: TipoDanoCatalogo[];
  // Efeitos reais da ação (com o valor calculado) e o rótulo da duração dela.
  efeitosAcao?: OpcaoEfeitoAcao[];
  duracaoAcao?: string;
  inicial?: Categoria;
  aoEscolher: (no: Atomo) => void;
  aoFechar: () => void;
}) {
  const [cat, setCat] = useState<Categoria>(inicial);
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(0);
  const [pendente, setPendente] = useState<Opcao | null>(null);

  const todas = useMemo<Opcao[]>(() => {
    const rotuloRef = { acao: "Ação", hab: "Habilidade", item: "Item" } as const;
    return [
      ...efeitosAcao.map((e): Opcao => ({
        chave: `daacao:${e.i}`,
        cat: "daacao",
        rotulo: e.nome,
        icone: e.icone,
        cor: e.cor,
        rotuloCat: e.resumo ?? "Efeito desta ação",
        no: { t: "efeito", slug: e.slug, idx: e.i },
      })),
      ...(duracaoAcao
        ? [
            {
              chave: "daacao:duracao",
              cat: "daacao" as const,
              rotulo: duracaoAcao,
              icone: "fa-hourglass-half",
              rotuloCat: "Duração da ação",
              no: { t: "duracao" } as Atomo,
            },
          ]
        : []),
      ...refs.map((r): Opcao => ({
        chave: `${r.tipo}:${r.id}`,
        cat: r.tipo,
        rotulo: r.nome,
        icone: ICONE_REF[r.tipo],
        rotuloCat: rotuloRef[r.tipo],
        no: { t: "ref", tipo: r.tipo, id: r.id, nome: r.nome },
      })),
      ...condicoes.map((c): Opcao => ({
        chave: `cond:${c}`,
        cat: "cond",
        rotulo: c,
        icone: ICONE_COND,
        rotuloCat: "Condição",
        no: { t: "cond", nome: c },
      })),
      ...EFEITOS_CATALOGO.map((e): Opcao => ({
        chave: `efeito:${e.slug}`,
        cat: "efeito",
        rotulo: e.nome,
        icone: e.icone,
        cor: e.cor,
        rotuloCat: "Efeito",
        slug: e.slug,
        pedeParam: PEDE_DANO.has(e.slug) ? "dano" : PEDE_COND.has(e.slug) ? "cond" : undefined,
        no: { t: "efeito", slug: e.slug },
      })),
      ...ATRIBUTOS_RICOS.map((a): Opcao => ({
        chave: `attr:${a.slug}`,
        cat: "attr",
        rotulo: a.nome,
        icone: "fa-dumbbell",
        rotuloCat: "Atributo",
        no: { t: "attr", atributo: a.slug },
      })),
      ...ATRIBUTOS_RICOS.map((a): Opcao => ({
        chave: `salv:${a.slug}`,
        cat: "attr",
        rotulo: `Salvaguarda de ${a.nome}`,
        icone: "fa-shield-halved",
        rotuloCat: "Salvaguarda (CD das técnicas)",
        no: { t: "salv", atributo: a.slug },
      })),
      ...tiposDano.map((t): Opcao => ({
        chave: `dano:${t.nome}`,
        cat: "dano",
        rotulo: t.nome,
        icone: t.icone ?? "fa-burst",
        cor: t.cor ?? undefined,
        rotuloCat: "Tipo de dano",
        no: { t: "dano", tipo: t.nome },
      })),
    ];
  }, [refs, condicoes, tiposDano, efeitosAcao, duracaoAcao]);

  const temDaAcao = efeitosAcao.length > 0 || !!duracaoAcao;
  const q = busca.trim().toLowerCase();
  const lista = todas.filter(
    (o) => (cat === "tudo" || o.cat === cat) && (!q || o.rotulo.toLowerCase().includes(q)),
  );

  function escolher(o: Opcao) {
    if (o.pedeParam) setPendente(o);
    else if (o.no) aoEscolher(o.no);
  }

  if (pendente?.slug) {
    const opcoes =
      pendente.pedeParam === "dano"
        ? tiposDano.map((t) => ({ nome: t.nome, icone: t.icone ?? "fa-burst", cor: t.cor ?? undefined }))
        : condicoes.map((c) => ({ nome: c, icone: ICONE_COND, cor: undefined }));
    return (
      <div className="desc-painel-rico">
        <span className="desc-painel-dica">
          {pendente.rotulo} de quê? <button type="button" className="desc-opcao" onClick={() => setPendente(null)}>← voltar</button>
        </span>
        <div className="desc-opcoes">
          <button
            type="button"
            className="desc-opcao"
            onClick={() => aoEscolher({ t: "efeito", slug: pendente.slug! })}
          >
            <i className={`fas ${pendente.icone}`} /> Sem {pendente.pedeParam === "dano" ? "tipo" : "condição"} (só “{pendente.rotulo}”)
          </button>
          {opcoes.map((p) => (
            <button
              key={p.nome}
              type="button"
              className="desc-opcao"
              onClick={() => aoEscolher({ t: "efeito", slug: pendente.slug!, param: p.nome })}
            >
              <i className={`fas ${p.icone}`} style={p.cor ? { color: p.cor } : undefined} /> {p.nome}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="desc-painel-rico">
      <input
        type="text"
        autoFocus
        placeholder="Buscar ação, habilidade, condição, efeito, dano…"
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value);
          setAtivo(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAtivo((a) => Math.min(a + 1, lista.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (lista[ativo]) escolher(lista[ativo]);
          } else if (e.key === "Escape") aoFechar();
        }}
      />
      <div className="desc-filtros" role="group" aria-label="Categoria">
        {CATEGORIAS.filter((c) => c.id !== "daacao" || temDaAcao).map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={cat === c.id}
            onClick={() => {
              setCat(c.id);
              setAtivo(0);
            }}
          >
            {c.nome}
          </button>
        ))}
      </div>
      <div className="desc-opcoes" role="listbox">
        {lista.map((o, i) => (
          <button
            key={o.chave}
            type="button"
            role="option"
            aria-selected={i === ativo}
            className="desc-opcao"
            onClick={() => escolher(o)}
          >
            <i className={`fas ${o.icone}`} style={o.cor ? { color: o.cor } : undefined} /> {o.rotulo}
            <small>
              {o.pedeParam ? "Efeito ›" : o.rotuloCat}
            </small>
          </button>
        ))}
        {lista.length === 0 && <span className="desc-painel-dica">Nada encontrado.</span>}
      </div>
    </div>
  );
}

/* ─── Rolagem (com tipo de dano) ─────────────────────────── */

export function PainelRolagem({
  tiposDano,
  ctx,
  aoInserir,
  aoFechar,
}: {
  tiposDano: TipoDanoCatalogo[];
  ctx: ContextoRico;
  aoInserir: (formula: string, dano?: string) => void;
  aoFechar: () => void;
}) {
  const [formula, setFormula] = useState("");
  const [dano, setDano] = useState("");
  const f = formula.trim();
  const { dados, modificador } = (ctx.resolverFormula ?? parseFormulaDados)(f);
  const r = resumoRolagem(dados, modificador);
  // `((…))` não aceita parênteses soltos, barra nem quebra de linha.
  const valida = !!f && dados.length > 0 && /^(?:[^()\n|]|\([^()\n]*\))+$/.test(f);
  return (
    <div className="desc-painel-rico">
      <input
        type="text"
        autoFocus
        placeholder="Ex: 2d6+FOR"
        value={formula}
        onChange={(e) => setFormula(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (valida) aoInserir(f, dano || undefined);
          }
          if (e.key === "Escape") aoFechar();
        }}
      />
      <div className="desc-linha-par">
        <label htmlFor="desc-tipo-dano">Tipo de dano</label>
        <select id="desc-tipo-dano" value={dano} onChange={(e) => setDano(e.target.value)}>
          <option value="">— nenhum —</option>
          {tiposDano.map((t) => (
            <option key={t.nome} value={t.nome}>
              {t.nome}
            </option>
          ))}
        </select>
      </div>
      <span className="desc-painel-dica">
        {valida
          ? `${r.texto} · de ${r.faixa!.min} a ${r.faixa!.max}${ctx.resolverFormula ? " (com os valores da ficha)" : ""}`
          : "Escreva dados, como 1d8, 2d6+FOR."}
      </span>
      <div className="desc-painel-acoes">
        <button type="button" onClick={aoFechar}>
          Cancelar
        </button>
        <button type="button" className="primario" disabled={!valida} onClick={() => aoInserir(f, dano || undefined)}>
          Inserir
        </button>
      </div>
    </div>
  );
}

/* ─── Cor do texto ───────────────────────────────────────── */

export type EscolhaCor = { cor: string; cor2?: string; efeito?: string };

export function PainelCor({
  aoAplicar,
  aoRemover,
  aoFechar,
}: {
  aoAplicar: (c: EscolhaCor) => void;
  aoRemover: () => void;
  aoFechar: () => void;
}) {
  const [cor, setCor] = useState(PALETA_TEXTO[0].cor);
  const [cor2, setCor2] = useState("#1f9eff");
  const [efeito, setEfeito] = useState("solido");
  const usa2 = efeito === "gradiente" || efeito === "contorno";
  const amostra = estiloDeCor(cor, usa2 ? cor2 : undefined, efeito);
  return (
    <div className="desc-painel-rico" onKeyDown={(e) => e.key === "Escape" && aoFechar()}>
      <div className="desc-cores" role="group" aria-label="Cores">
        {PALETA_TEXTO.map((p) => (
          <button
            key={p.cor}
            type="button"
            title={p.nome}
            aria-label={p.nome}
            aria-pressed={cor === p.cor}
            style={{ background: p.cor }}
            onClick={() => setCor(p.cor)}
          />
        ))}
      </div>
      <div className="desc-linha-par">
        <label htmlFor="desc-cor-livre">Outra cor</label>
        <input id="desc-cor-livre" type="color" value={cor} onChange={(e) => setCor(e.target.value)} />
        <label htmlFor="desc-efeito-cor">Efeito</label>
        <select id="desc-efeito-cor" value={efeito} onChange={(e) => setEfeito(e.target.value)}>
          {EFEITOS_COR.map((e) => (
            <option key={e.slug} value={e.slug}>
              {e.nome}
            </option>
          ))}
        </select>
      </div>
      {usa2 && (
        <div className="desc-linha-par">
          <label htmlFor="desc-cor2">{efeito === "contorno" ? "Preenchimento" : "2ª cor"}</label>
          <input id="desc-cor2" type="color" value={cor2} onChange={(e) => setCor2(e.target.value)} />
        </div>
      )}
      <span className="desc-painel-dica">
        Prévia: <strong className={amostra.className} style={amostra.style}>Golpe Meteoro</strong>
      </span>
      <div className="desc-painel-acoes">
        <button type="button" onClick={aoRemover}>
          Remover cor
        </button>
        <button
          type="button"
          className="primario"
          onClick={() => aoAplicar({ cor, ...(usa2 ? { cor2 } : {}), ...(efeito !== "solido" ? { efeito } : {}) })}
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}

/* ─── Ícone (e marcador dos tópicos) ─────────────────────── */

const SUGESTOES_MARCADOR = ["skull", "skull-crossbones", "fire", "bolt", "star", "khanda", "hand-fist", "droplet", "shield-halved", "circle"];

export function PainelIcone({
  titulo,
  sugestoes = false,
  aoEscolher,
  aoFechar,
}: {
  titulo: string;
  sugestoes?: boolean;
  aoEscolher: (slug: string) => void;
  aoFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const todos = useMemo(() => ICONES_CATALOGO.flatMap((g) => g.icones), []);
  const q = busca.trim().toLowerCase();
  // Uma grade só: os sugeridos vêm primeiro e não se repetem no resto do catálogo.
  const sugeridos = sugestoes ? SUGESTOES_MARCADOR.map((s) => ({ slug: `fa-${s}`, nome: s })) : [];
  const jaSugeridos = new Set(sugeridos.map((i) => i.slug));
  const lista = q
    ? todos.filter((i) => i.nome.toLowerCase().includes(q) || i.slug.includes(q))
    : [...sugeridos, ...todos.filter((i) => !jaSugeridos.has(i.slug))];
  const grade = (itens: { slug: string; nome: string }[]) =>
    itens.map((i) => (
      <button key={i.slug} type="button" title={i.nome} onClick={() => aoEscolher(i.slug.replace(/^fa-/, ""))}>
        <i className={`fas ${i.slug}`} />
      </button>
    ));
  return (
    <div className="desc-painel-rico" onKeyDown={(e) => e.key === "Escape" && aoFechar()}>
      <span className="desc-painel-dica">{titulo}</span>
      <input type="text" autoFocus placeholder="Buscar ícone…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="desc-grade-icones">{grade(lista)}</div>
    </div>
  );
}

/* ─── Blocos (menu "/") ──────────────────────────────────── */

export type ComandoBloco = "p" | "titulo" | "lista" | "num" | "citacao" | "hr" | "modelo";

const COMANDOS: { id: ComandoBloco; nome: string; icone: string; dica: string }[] = [
  { id: "p", nome: "Parágrafo", icone: "fa-paragraph", dica: "Texto normal" },
  { id: "titulo", nome: "Título", icone: "fa-heading", dica: "Subtítulo em destaque" },
  { id: "lista", nome: "Tópicos", icone: "fa-list-ul", dica: "Com o ícone do marcador" },
  { id: "num", nome: "Lista numerada", icone: "fa-list-ol", dica: "1. 2. 3." },
  { id: "citacao", nome: "Nota", icone: "fa-quote-left", dica: "Observação destacada" },
  { id: "hr", nome: "Linha divisória", icone: "fa-minus", dica: "Separa partes da descrição" },
  { id: "modelo", nome: "Modelo de técnica", icone: "fa-scroll", dica: "Efeito, tópicos e observação" },
];

export function PainelComandos({
  aoEscolher,
  aoFechar,
}: {
  aoEscolher: (c: ComandoBloco) => void;
  aoFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const q = busca.trim().toLowerCase();
  const lista = COMANDOS.filter((c) => !q || c.nome.toLowerCase().includes(q));
  return (
    <div className="desc-painel-rico">
      <input
        type="text"
        autoFocus
        placeholder="Inserir bloco…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && lista[0]) {
            e.preventDefault();
            aoEscolher(lista[0].id);
          }
          if (e.key === "Escape") aoFechar();
        }}
      />
      <div className="desc-opcoes">
        {lista.map((c) => (
          <button key={c.id} type="button" className="desc-opcao" onClick={() => aoEscolher(c.id)}>
            <i className={`fas ${c.icone}`} /> {c.nome}
            <small>{c.dica}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

