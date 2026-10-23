"use client";

import { useMemo, type ReactNode } from "react";
import { Tooltip } from "@/components/tooltip";
import { faixaDaRolagem, formulaTexto, parseFormulaDados, type Dado } from "@/lib/dice";
import { empilharRolagem } from "@/lib/empilhar-rolagem";
import {
  ICONE_COND,
  ICONE_REF,
  ICONE_ROLAGEM,
  parseDescricao,
  type NoDescricao,
  type TipoRef,
} from "@/lib/descricao";
import "./descricao.css";

export type InfoRef = { titulo?: string; texto?: string; icone?: string; selo?: string };
export type InfoCondicao = { nome: string; descricao?: string; cor?: string };

// O que o renderizador precisa saber de fora. Tudo opcional: sem contexto o
// texto ainda aparece, só sem tooltips ricos.
export type ContextoDescricao = {
  // "acao:ID" → o que mostrar na dica. Sem entrada = a referência foi apagada.
  refs?: Record<string, InfoRef>;
  condicoes?: InfoCondicao[];
  // Fórmula → dados. Padrão: `parseFormulaDados` (ignora siglas como FOR; a
  // ficha passa o resolvedor que as troca pelo valor, como o CampoFormula).
  resolverFormula?: (formula: string) => { dados: Dado[]; modificador: number };
  // Prefixo da rolagem no chat. Ex: o nome da ação dona da descrição.
  nomeRolagem?: string;
  aoAbrirRef?: (tipo: TipoRef, id: string) => void;
};

export function Descricao({
  texto,
  contexto,
  className,
}: {
  texto: string | null | undefined;
  contexto?: ContextoDescricao;
  className?: string;
}) {
  const nos = useMemo(() => parseDescricao(texto), [texto]);
  if (nos.length === 0) return null;
  return (
    <span className={`desc${className ? ` ${className}` : ""}`}>
      {nos.map((no, i) => (
        <NoView key={i} no={no} ctx={contexto} />
      ))}
    </span>
  );
}

// Forma de função, pra quem renderiza em lugar que já espera um ReactNode.
export function renderDescricao(texto: string | null | undefined, contexto?: ContextoDescricao): ReactNode {
  return <Descricao texto={texto} contexto={contexto} />;
}

function NoView({ no, ctx }: { no: NoDescricao; ctx?: ContextoDescricao }) {
  switch (no.t) {
    case "texto":
      return <>{no.v}</>;
    case "negrito":
      return <strong>{no.v}</strong>;
    case "icone":
      return <i className={`fas fa-${no.slug} desc-icone`} aria-hidden="true" />;
    case "ref":
      return <RefChip no={no} ctx={ctx} />;
    case "cond":
      return <CondChip nome={no.nome} ctx={ctx} />;
    case "rolagem":
      return <RolagemChip formula={no.formula} ctx={ctx} />;
  }
}

function RefChip({ no, ctx }: { no: Extract<NoDescricao, { t: "ref" }>; ctx?: ContextoDescricao }) {
  const info = ctx?.refs?.[`${no.tipo}:${no.id}`];
  // Só considera apagada quando o contexto traz o mapa e a chave não está nele.
  const apagada = !!ctx?.refs && !info;
  const icone = info?.icone ?? ICONE_REF[no.tipo];
  const nome = info?.titulo ?? no.nome;
  const chip = (
    <span
      className={`desc-chip desc-chip--${no.tipo}${apagada ? " desc-chip--morta" : ""}`}
      tabIndex={0}
      role={ctx?.aoAbrirRef && !apagada ? "button" : undefined}
      onClick={() => !apagada && ctx?.aoAbrirRef?.(no.tipo, no.id)}
    >
      <i className={`fas ${icone}`} />
      {nome}
    </span>
  );
  return (
    <Tooltip
      icone={icone}
      titulo={nome}
      selo={apagada ? "removida" : info?.selo}
      texto={apagada ? "Esta referência foi apagada." : info?.texto}
    >
      {chip}
    </Tooltip>
  );
}

function CondChip({ nome, ctx }: { nome: string; ctx?: ContextoDescricao }) {
  const cond = ctx?.condicoes?.find((c) => c.nome.toLowerCase() === nome.toLowerCase());
  return (
    <Tooltip icone={ICONE_COND} titulo={nome} cor={cond?.cor} texto={cond?.descricao}>
      <span
        className="desc-chip desc-chip--cond"
        tabIndex={0}
        style={cond?.cor ? ({ "--chip-cor": cond.cor } as React.CSSProperties) : undefined}
      >
        <i className={`fas ${ICONE_COND}`} />
        {nome}
      </span>
    </Tooltip>
  );
}

function RolagemChip({ formula, ctx }: { formula: string; ctx?: ContextoDescricao }) {
  const { dados, modificador } = (ctx?.resolverFormula ?? parseFormulaDados)(formula);
  const rolavel = dados.length > 0;
  const faixa = rolavel ? faixaDaRolagem(dados, modificador) : null;
  return (
    <Tooltip
      icone={ICONE_ROLAGEM}
      titulo={rolavel ? "Empilhar no Rolador" : "Fórmula sem dados"}
      selo={faixa ? `${faixa.min}–${faixa.max}` : undefined}
      texto={rolavel ? formulaTexto(dados, modificador) : "Nada para rolar."}
    >
      <button
        type="button"
        className="desc-chip desc-chip--rolagem"
        disabled={!rolavel}
        onClick={() =>
          empilharRolagem({
            dados,
            modificador,
            nomePreset: ctx?.nomeRolagem ? `${ctx.nomeRolagem}: ${formula}` : formula,
          })
        }
      >
        <i className={`fas ${ICONE_ROLAGEM}`} />
        {formula}
      </button>
    </Tooltip>
  );
}
