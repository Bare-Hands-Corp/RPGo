"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Tooltip } from "@/components/tooltip";
import { parseFormulaDados } from "@/lib/dice";
import { empilharRolagem } from "@/lib/empilhar-rolagem";
import {
  numerarBlocos,
  parseDescricaoRica,
  type Bloco,
  type Inline,
} from "@/lib/descricao-rica";
import { condicaoNoCatalogo } from "@/lib/condicoes";
import { linhasDaMecanica, mecanicaDa } from "@/lib/condicoes-mecanica";
import { formatarMod, modificador } from "@/lib/op-rpg";
import {
  aparenciaDoAtomo,
  atributoRico,
  cdDaSalvaguarda,
  efeitoDaAcao,
  efeitoMeta,
  estiloDeCor,
  resumoRolagem,
  tipoDanoDe,
  type Atomo,
  type ContextoRico,
} from "./atomos";
import { serializarFragmento } from "./dom-rico";
import "../descricao/descricao.css";
import "./descricao-rica.css";

export function DescricaoRica({
  texto,
  contexto,
  className,
}: {
  texto: string | null | undefined;
  contexto?: ContextoRico;
  className?: string;
}) {
  const blocos = useMemo(() => parseDescricaoRica(texto), [texto]);
  const numeros = useMemo(() => numerarBlocos(blocos), [blocos]);
  if (blocos.length === 0) return null;

  // Copiar um trecho leva os códigos ({{efeito:cura#2}}…), não o texto dos chips:
  // colado no editor, eles voltam a ser chips.
  function copiar(e: React.ClipboardEvent<HTMLDivElement>) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (!e.currentTarget.contains(r.commonAncestorContainer)) return;
    e.clipboardData.setData("text/plain", serializarFragmento(r.cloneContents()));
    e.preventDefault();
  }

  return (
    <div className={`desc desc-rica${className ? ` ${className}` : ""}`} onCopy={copiar}>
      {blocos.map((bl, i) => (
        <BlocoView key={i} bl={bl} numero={numeros[i]} ctx={contexto} />
      ))}
    </div>
  );
}

export function renderDescricaoRica(texto: string | null | undefined, contexto?: ContextoRico): ReactNode {
  return <DescricaoRica texto={texto} contexto={contexto} />;
}

function BlocoView({ bl, numero, ctx }: { bl: Bloco; numero: number | null; ctx?: ContextoRico }) {
  if (bl.b === "hr") {
    return (
      <div className="desc-l" data-b="hr">
        <hr />
      </div>
    );
  }
  const filhos = bl.filhos.length ? <InlineView nos={bl.filhos} ctx={ctx} /> : <br />;
  if (bl.b === "lista" || bl.b === "num") {
    return (
      <div className="desc-l" data-b={bl.b} data-n={bl.nivel} data-i={bl.b === "lista" ? (bl.icone ?? "") : undefined}>
        <span className="desc-marcador" aria-hidden="true">
          {bl.b === "num" ? `${numero}.` : <i className={`fas fa-${bl.icone ?? "circle"}`} />}
        </span>
        {filhos}
      </div>
    );
  }
  return (
    <div className="desc-l" data-b={bl.b}>
      {filhos}
    </div>
  );
}

function InlineView({ nos, ctx }: { nos: Inline[]; ctx?: ContextoRico }) {
  return (
    <>
      {nos.map((no, i) => (
        <NoView key={i} no={no} ctx={ctx} />
      ))}
    </>
  );
}

function NoView({ no, ctx }: { no: Inline; ctx?: ContextoRico }) {
  switch (no.t) {
    case "texto":
      return <>{no.v}</>;
    case "marca": {
      const dentro = <InlineView nos={no.filhos} ctx={ctx} />;
      return no.m === "negrito" ? <strong>{dentro}</strong> : no.m === "italico" ? <em>{dentro}</em> : <u>{dentro}</u>;
    }
    case "cor": {
      const { className, style } = estiloDeCor(no.cor, no.cor2, no.efeito);
      return (
        <span
          className={className}
          style={style}
          data-cor={no.cor}
          data-cor2={no.cor2}
          data-fx={no.efeito}
        >
          <InlineView nos={no.filhos} ctx={ctx} />
        </span>
      );
    }
    case "icone":
      return <i className={`fas fa-${no.slug} desc-icone`} aria-hidden="true" data-no={JSON.stringify(no)} />;
    default:
      return <ChipView no={no} ctx={ctx} />;
  }
}

function ChipView({ no, ctx }: { no: Atomo; ctx?: ContextoRico }) {
  const ap = aparenciaDoAtomo(no, ctx);
  const estilo = ap.fx ? ap.fx.style : ap.cor ? ({ "--chip-cor": ap.cor } as CSSProperties) : undefined;
  const classeChip = `desc-chip ${ap.classe}${ap.fx ? ` ${ap.fx.className}` : ""}`;
  const icone = (
    <i className={`fas ${ap.icone}`} style={!ap.fx && ap.corIcone ? { color: ap.corIcone } : undefined} />
  );
  const rotulo = ap.fx ? <span className="fx-texto">{ap.rotulo}</span> : ap.rotulo;

  if (no.t === "rolagem") {
    const { dados, modificador } = (ctx?.resolverFormula ?? parseFormulaDados)(no.formula);
    const rolavel = dados.length > 0;
    const r = resumoRolagem(dados, modificador);
    return (
      <Tooltip
        icone={ap.icone}
        titulo={rolavel ? "Empilhar no Rolador" : "Fórmula sem dados"}
        selo={r.faixa ? `${r.faixa.min}–${r.faixa.max}` : undefined}
        texto={rolavel ? [r.texto, no.dano && `Dano ${no.dano}`] : "Nada para rolar."}
        cor={ap.cor}
      >
        <button
          type="button"
          className={classeChip}
          style={estilo}
          data-no={JSON.stringify(no)}
          disabled={!rolavel}
          onClick={() =>
            empilharRolagem({
              dados,
              modificador,
              nomePreset: `${ctx?.nomeRolagem ? `${ctx.nomeRolagem}: ` : ""}${no.formula}${no.dano ? ` (${no.dano})` : ""}`,
            })
          }
        >
          {icone}
          {rotulo}
        </button>
      </Tooltip>
    );
  }

  let dica: { titulo: string; selo?: string; texto?: string } = { titulo: ap.rotulo };
  if (no.t === "ref") {
    const info = ctx?.refs?.[`${no.tipo}:${no.id}`];
    dica = {
      titulo: ap.rotulo,
      selo: ap.apagada ? "removida" : info?.selo,
      texto: ap.apagada ? "Esta referência foi apagada." : info?.texto,
    };
  } else if (no.t === "cond") {
    const c = ctx?.condicoes?.find((x) => x.nome.toLowerCase() === no.nome.toLowerCase());
    const e = ctx?.catalogoCondicoes ? condicaoNoCatalogo(ctx.catalogoCondicoes, no.nome) : null;
    const m = mecanicaDa({ nome: no.nome, mecanica: e?.mecanica });
    dica = {
      titulo: no.nome,
      selo: "Condição",
      texto: [...(m ? linhasDaMecanica(m) : []), e?.descricao || c?.descricao || ""].filter(Boolean).join("\n"),
    };
  } else if (no.t === "efeito") {
    const m = efeitoMeta(no.slug);
    const daAcao = efeitoDaAcao(no, ctx);
    if (daAcao) {
      // Mesma dica do chip de efeito do card: o valor, a fórmula crua e quem recebe.
      const { e } = daAcao;
      const resumo = ctx?.resumoEfeito?.(e, true) ?? "";
      const cru = ctx?.resumoEfeito?.(e, false) ?? "";
      dica = {
        titulo: ap.rotulo,
        selo: e.dura ? SELO_DURA[e.dura] : undefined,
        texto: [
          resumo,
          cru && cru !== resumo ? `Fórmula: ${cru}` : "",
          e.quem === "aliado" ? "Vai num aliado, escolhido no uso" : "",
          e.quem === "inimigo" ? "Vai no inimigo que a ação pega" : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    } else if (daAcao === null) {
      dica = { titulo: ap.rotulo, selo: "removido", texto: "Este efeito não existe mais na ação." };
    } else {
      dica = {
        titulo: ap.rotulo,
        selo: m ? "Efeito" : "desconhecido",
        texto: m ? undefined : "Este efeito não existe mais no catálogo.",
      };
    }
  } else if (no.t === "duracao") {
    dica = { titulo: "Duração da ação", selo: "Ao ativar", texto: ap.rotulo };
  } else if (no.t === "salv") {
    const cd = cdDaSalvaguarda(no, ctx);
    const a = atributoRico(no.atributo);
    dica = {
      titulo: `Salvaguarda de ${a.nome}`,
      selo: cd !== undefined ? `CD ${cd}` : "Salvaguarda",
      texto: cd !== undefined ? undefined : "A CD é a das técnicas de quem usa.",
    };
  } else if (no.t === "attr") {
    const a = atributoRico(no.atributo);
    const valor = ctx?.atributos?.[no.atributo];
    dica = {
      titulo: a.nome,
      selo: "Atributo",
      texto: valor !== undefined ? `Valor ${valor} (${formatarMod(modificador(valor))})` : undefined,
    };
  } else if (no.t === "dano") {
    const t = tipoDanoDe(no.tipo, ctx?.tiposDano);
    dica = { titulo: `Dano ${t?.nome ?? no.tipo}`, selo: "Tipo de dano" };
  }

  return (
    <Tooltip icone={ap.icone} titulo={dica.titulo} selo={dica.selo} texto={dica.texto} cor={ap.cor}>
      <span
        className={classeChip}
        style={estilo}
        data-no={JSON.stringify(no)}
        tabIndex={0}
        role={no.t === "ref" && ctx?.aoAbrirRef && !ap.apagada ? "button" : undefined}
        onClick={() => no.t === "ref" && !ap.apagada && ctx?.aoAbrirRef?.(no.tipo, no.id)}
      >
        {icone}
        {ap.detalhe ? <span className="desc-chip-nome">{ap.rotulo}</span> : rotulo}
        {ap.detalhe && <span className="desc-chip-detalhe">{ap.detalhe}</span>}
      </span>
    </Tooltip>
  );
}

// O que o chip de efeito diz sobre quando ele age (como o chip do card).
const SELO_DURA: Record<string, string> = { turno: "A cada turno", mantem: "Enquanto durar" };
