"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ICONES_CATALOGO } from "@/components/icone-picker";
import { parseFormulaDados } from "@/lib/dice";
import type { TipoDanoCatalogo } from "@/lib/tipos-dano";
import {
  EFEITOS_CATALOGO,
  resumoRolagem,
  type Atomo,
  type ContextoRico,
  type OpcaoEfeitoAcao,
  type OpcaoRef,
} from "./atomos";
import { ATRIBUTOS_RICOS } from "@/lib/descricao-rica";
import { PEDE_COND, PEDE_DANO } from "./paineis";

// Editar um chip que já está no texto (toque/clique nele). Um formulário por
// tipo; "Aplicar" troca o chip, "Remover chip" tira.

const NOME_DO_TIPO: Record<Atomo["t"], string> = {
  ref: "referência",
  cond: "condição",
  efeito: "efeito",
  dano: "tipo de dano",
  rolagem: "rolagem",
  icone: "ícone",
  duracao: "duração",
  salv: "salvaguarda",
  attr: "atributo",
};

type Comuns = { aoRemover: () => void; aoFechar: () => void };

function Moldura({
  no,
  podeAplicar = true,
  aoAplicar,
  aoRemover,
  aoFechar,
  children,
}: {
  no: Atomo;
  podeAplicar?: boolean;
  aoAplicar?: () => void;
  children: ReactNode;
} & Comuns) {
  return (
    <div className="desc-painel-rico" onKeyDown={(e) => e.key === "Escape" && aoFechar()}>
      <span className="desc-painel-dica">
        <strong>Editar {NOME_DO_TIPO[no.t]}</strong>
      </span>
      {children}
      <div className="desc-painel-acoes">
        <button type="button" className="perigo" onClick={aoRemover}>
          Remover chip
        </button>
        <button type="button" onClick={aoFechar}>
          Cancelar
        </button>
        {aoAplicar && (
          <button type="button" className="primario" disabled={!podeAplicar} onClick={aoAplicar}>
            Aplicar
          </button>
        )}
      </div>
    </div>
  );
}

// Opções com o valor atual garantido (mesmo que não esteja mais no catálogo).
const comAtual = (opcoes: string[], atual?: string) => (atual && !opcoes.includes(atual) ? [atual, ...opcoes] : opcoes);

export function PainelEditarAtomo({
  no,
  refs,
  condicoes,
  tiposDano,
  efeitosAcao,
  ctx,
  aoSalvar,
  aoRemover,
  aoFechar,
}: {
  no: Atomo;
  refs: OpcaoRef[];
  condicoes: string[];
  tiposDano: TipoDanoCatalogo[];
  efeitosAcao: OpcaoEfeitoAcao[];
  ctx: ContextoRico;
  aoSalvar: (novo: Atomo) => void;
} & Comuns) {
  const base = { aoSalvar, aoRemover, aoFechar };
  switch (no.t) {
    case "rolagem":
      return <EdRolagem no={no} tiposDano={tiposDano} ctx={ctx} {...base} />;
    case "efeito":
      return no.idx !== undefined && efeitosAcao.length > 0 ? (
        <EdEfeitoDaAcao no={no} efeitosAcao={efeitosAcao} {...base} />
      ) : (
        <EdEfeito no={no} condicoes={condicoes} tiposDano={tiposDano} {...base} />
      );
    case "duracao":
      return (
        <Moldura no={no} aoRemover={aoRemover} aoFechar={aoFechar}>
          <span className="desc-painel-dica">
            É a duração da própria ação. Ela muda quando você muda a duração nos campos da ação.
          </span>
        </Moldura>
      );
    case "salv":
    case "attr":
      return <EdAtributo no={no} {...base} />;
    case "dano":
      return (
        <EdLista no={no} atual={no.tipo} opcoes={tiposDano.map((t) => t.nome)} rotulo="Tipo de dano" fazer={(v) => ({ t: "dano", tipo: v })} {...base} />
      );
    case "cond":
      return <EdLista no={no} atual={no.nome} opcoes={condicoes} rotulo="Condição" fazer={(v) => ({ t: "cond", nome: v })} {...base} />;
    case "ref":
      return <EdRef no={no} refs={refs} {...base} />;
    case "icone":
      return <EdIcone no={no} {...base} />;
  }
}

function EdRolagem({
  no,
  tiposDano,
  ctx,
  aoSalvar,
  aoRemover,
  aoFechar,
}: {
  no: Extract<Atomo, { t: "rolagem" }>;
  tiposDano: TipoDanoCatalogo[];
  ctx: ContextoRico;
  aoSalvar: (n: Atomo) => void;
} & Comuns) {
  const [formula, setFormula] = useState(no.formula);
  const [dano, setDano] = useState(no.dano ?? "");
  const f = formula.trim();
  const { dados, modificador } = (ctx.resolverFormula ?? parseFormulaDados)(f);
  const r = resumoRolagem(dados, modificador);
  // `((…))` não aceita parênteses soltos, barra nem quebra de linha.
  const valida = !!f && dados.length > 0 && /^(?:[^()\n|]|\([^()\n]*\))+$/.test(f);
  const aplicar = () => {
    if (valida) aoSalvar({ t: "rolagem", formula: f, ...(dano ? { dano } : {}) });
  };
  return (
    <Moldura no={no} podeAplicar={valida} aoAplicar={aplicar} aoRemover={aoRemover} aoFechar={aoFechar}>
      <input
        type="text"
        autoFocus
        aria-label="Fórmula"
        value={formula}
        onChange={(e) => setFormula(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            aplicar();
          }
        }}
      />
      <div className="desc-linha-par">
        <label htmlFor="desc-ed-dano">Tipo de dano</label>
        <select id="desc-ed-dano" value={dano} onChange={(e) => setDano(e.target.value)}>
          <option value="">— nenhum —</option>
          {comAtual(
            tiposDano.map((t) => t.nome),
            no.dano,
          ).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <span className="desc-painel-dica">
        {valida ? `${r.texto} · de ${r.faixa!.min} a ${r.faixa!.max}` : "Escreva dados, como 1d8, 2d6+FOR."}
      </span>
    </Moldura>
  );
}

function EdEfeito({
  no,
  condicoes,
  tiposDano,
  aoSalvar,
  aoRemover,
  aoFechar,
}: {
  no: Extract<Atomo, { t: "efeito" }>;
  condicoes: string[];
  tiposDano: TipoDanoCatalogo[];
  aoSalvar: (n: Atomo) => void;
} & Comuns) {
  const [slug, setSlug] = useState(no.slug);
  const [param, setParam] = useState(no.param ?? "");
  const tipo = PEDE_DANO.has(slug) ? "dano" : PEDE_COND.has(slug) ? "cond" : "livre";
  const opcoes = tipo === "dano" ? tiposDano.map((t) => t.nome) : condicoes;
  const conhecido = EFEITOS_CATALOGO.some((e) => e.slug === slug);
  const aplicar = () => aoSalvar({ t: "efeito", slug, ...(param.trim() ? { param: param.trim() } : {}) });
  return (
    <Moldura no={no} aoAplicar={aplicar} aoRemover={aoRemover} aoFechar={aoFechar}>
      <div className="desc-linha-par">
        <label htmlFor="desc-ed-efeito">Efeito</label>
        <select id="desc-ed-efeito" value={slug} onChange={(e) => setSlug(e.target.value)}>
          {!conhecido && <option value={slug}>{slug} (desconhecido)</option>}
          {EFEITOS_CATALOGO.map((e) => (
            <option key={e.slug} value={e.slug}>
              {e.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="desc-linha-par">
        <label htmlFor="desc-ed-param">{tipo === "dano" ? "Tipo de dano" : tipo === "cond" ? "Condição" : "Detalhe"}</label>
        {tipo === "livre" ? (
          <input
            id="desc-ed-param"
            type="text"
            placeholder="Opcional, ex.: +3m"
            value={param}
            onChange={(e) => setParam(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                aplicar();
              }
            }}
          />
        ) : (
          <select id="desc-ed-param" value={param} onChange={(e) => setParam(e.target.value)}>
            <option value="">— nenhum —</option>
            {comAtual(opcoes, param || undefined).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
      </div>
    </Moldura>
  );
}

// Efeito ligado a um efeito da ação: troca por outro efeito da mesma ação.
function EdEfeitoDaAcao({
  no,
  efeitosAcao,
  aoSalvar,
  aoRemover,
  aoFechar,
}: {
  no: Extract<Atomo, { t: "efeito" }>;
  efeitosAcao: OpcaoEfeitoAcao[];
  aoSalvar: (n: Atomo) => void;
} & Comuns) {
  const [i, setI] = useState(no.idx ?? efeitosAcao[0].i);
  const escolhido = efeitosAcao.find((e) => e.i === i);
  return (
    <Moldura
      no={no}
      aoAplicar={() => escolhido && aoSalvar({ t: "efeito", slug: escolhido.slug, idx: escolhido.i })}
      aoRemover={aoRemover}
      aoFechar={aoFechar}
    >
      <div className="desc-linha-par">
        <label htmlFor="desc-ed-efeito-acao">Efeito da ação</label>
        <select id="desc-ed-efeito-acao" autoFocus value={i} onChange={(e) => setI(Number(e.target.value))}>
          {efeitosAcao.map((e) => (
            <option key={e.i} value={e.i}>
              {e.nome}
              {e.resumo ? ` · ${e.resumo}` : ""}
            </option>
          ))}
        </select>
      </div>
      <span className="desc-painel-dica">
        O chip mostra o valor calculado deste efeito e acompanha o que você mudar nele.
      </span>
    </Moldura>
  );
}

function EdLista({
  no,
  atual,
  opcoes,
  rotulo,
  fazer,
  aoSalvar,
  aoRemover,
  aoFechar,
}: {
  no: Atomo;
  atual: string;
  opcoes: string[];
  rotulo: string;
  fazer: (v: string) => Atomo;
  aoSalvar: (n: Atomo) => void;
} & Comuns) {
  const [v, setV] = useState(atual);
  return (
    <Moldura no={no} aoAplicar={() => aoSalvar(fazer(v))} aoRemover={aoRemover} aoFechar={aoFechar}>
      <div className="desc-linha-par">
        <label htmlFor="desc-ed-lista">{rotulo}</label>
        <select id="desc-ed-lista" autoFocus value={v} onChange={(e) => setV(e.target.value)}>
          {comAtual(opcoes, atual).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    </Moldura>
  );
}

// Salvaguarda ou atributo: escolhe o atributo; na salvaguarda, a CD é opcional
// (vazia = a das técnicas de quem lê).
function EdAtributo({
  no,
  aoSalvar,
  aoRemover,
  aoFechar,
}: {
  no: Extract<Atomo, { t: "salv" | "attr" }>;
  aoSalvar: (n: Atomo) => void;
} & Comuns) {
  const [atributo, setAtributo] = useState(no.atributo);
  const [cd, setCd] = useState(no.t === "salv" && no.cd ? String(no.cd) : "");
  const cdNum = Number(cd);
  const cdOk = cd === "" || (Number.isInteger(cdNum) && cdNum >= 1 && cdNum <= 99);
  const aplicar = () =>
    aoSalvar(
      no.t === "salv"
        ? { t: "salv", atributo, ...(cd !== "" ? { cd: cdNum } : {}) }
        : { t: "attr", atributo },
    );
  return (
    <Moldura no={no} podeAplicar={cdOk} aoAplicar={aplicar} aoRemover={aoRemover} aoFechar={aoFechar}>
      <div className="desc-linha-par">
        <label htmlFor="desc-ed-atributo">Atributo</label>
        <select id="desc-ed-atributo" autoFocus value={atributo} onChange={(e) => setAtributo(e.target.value)}>
          {ATRIBUTOS_RICOS.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.nome}
            </option>
          ))}
        </select>
      </div>
      {no.t === "salv" && (
        <div className="desc-linha-par">
          <label htmlFor="desc-ed-cd">CD</label>
          <input
            id="desc-ed-cd"
            inputMode="numeric"
            placeholder="A das técnicas"
            value={cd}
            onChange={(e) => setCd(e.target.value.replace(/\D/g, "").slice(0, 2))}
          />
        </div>
      )}
    </Moldura>
  );
}

function EdRef({
  no,
  refs,
  aoSalvar,
  aoRemover,
  aoFechar,
}: {
  no: Extract<Atomo, { t: "ref" }>;
  refs: OpcaoRef[];
  aoSalvar: (n: Atomo) => void;
} & Comuns) {
  const doTipo = refs.filter((r) => r.tipo === no.tipo);
  const existe = doTipo.some((r) => r.id === no.id);
  const [id, setId] = useState(no.id);
  const nomeTipo = { acao: "Ação", hab: "Habilidade", item: "Item" }[no.tipo];
  const aplicar = () => aoSalvar({ t: "ref", tipo: no.tipo, id, nome: doTipo.find((r) => r.id === id)?.nome ?? no.nome });
  return (
    <Moldura no={no} aoAplicar={aplicar} aoRemover={aoRemover} aoFechar={aoFechar}>
      <div className="desc-linha-par">
        <label htmlFor="desc-ed-ref">{nomeTipo}</label>
        <select id="desc-ed-ref" autoFocus value={id} onChange={(e) => setId(e.target.value)}>
          {!existe && <option value={no.id}>{no.nome} (removida)</option>}
          {doTipo.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </select>
      </div>
    </Moldura>
  );
}

function EdIcone({
  no,
  aoSalvar,
  aoRemover,
  aoFechar,
}: {
  no: Extract<Atomo, { t: "icone" }>;
  aoSalvar: (n: Atomo) => void;
} & Comuns) {
  const [busca, setBusca] = useState("");
  const todos = useMemo(() => ICONES_CATALOGO.flatMap((g) => g.icones), []);
  const q = busca.trim().toLowerCase();
  const lista = q ? todos.filter((i) => i.nome.toLowerCase().includes(q) || i.slug.includes(q)) : todos;
  // Tocar num ícone já aplica: não há botão "Aplicar".
  return (
    <Moldura no={no} aoRemover={aoRemover} aoFechar={aoFechar}>
      <input type="text" autoFocus placeholder="Buscar ícone…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="desc-grade-icones">
        {lista.map((i) => (
          <button
            key={i.slug}
            type="button"
            title={i.nome}
            aria-pressed={`fa-${no.slug}` === i.slug}
            onClick={() => aoSalvar({ t: "icone", slug: i.slug.replace(/^fa-/, "") })}
          >
            <i className={`fas ${i.slug}`} />
          </button>
        ))}
      </div>
    </Moldura>
  );
}
