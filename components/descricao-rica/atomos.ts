import type { CSSProperties } from "react";
import { mesmoTipo } from "@/lib/dano";
import { estiloAplicado, normalizarEfeitoCor, varsEstiloCor, EFEITOS_COR, type EfeitoCor } from "@/lib/estilos-cor";
import { META_EFEITOS, iconeDoEfeito, nomeDoEfeito, type EfeitoHabilidade, type TipoEfeito } from "@/lib/op-rpg";
import { CATALOGO_PADRAO, type TipoDanoCatalogo } from "@/lib/tipos-dano";
import { condicaoNoCatalogo, corDaCondicao, type CondicaoCatalogo } from "@/lib/condicoes";
import { EFEITO_COR_PADRAO } from "@/lib/estilos-cor";
import { formulaTexto, faixaDaRolagem, type Dado } from "@/lib/dice";
import { avaliarFormula, type ContextoAvaliacao } from "@/lib/formula";
import type { Duracao } from "@/lib/duracao";
import { rotuloDuracao } from "@/lib/descricao-gerada";
import { ATRIBUTOS_RICOS, type Inline, type TipoRef } from "@/lib/descricao-rica";

// O que o editor e a visualização sabem de fora. Tudo opcional.
export type InfoRef = { titulo?: string; texto?: string; icone?: string; selo?: string };
export type InfoCondicao = { nome: string; descricao?: string; cor?: string };
export type OpcaoRef = { tipo: TipoRef; id: string; nome: string };

export type ContextoRico = {
  refs?: Record<string, InfoRef>;
  condicoes?: InfoCondicao[];
  // Condições da Biblioteca do narrador: o chip leva a cor, a 2ª cor e o efeito
  // dela, como na ficha (`useEstiloCondicao`). Sem isso, só `condicoes`.
  catalogoCondicoes?: CondicaoCatalogo[];
  tiposDano?: TipoDanoCatalogo[];
  // Fórmula → dados, com as siglas da ficha. Sem isso, `parseFormulaDados`
  // (que ignora FOR, PROF…). Na integração: `avaliarFormula` com o valor da ficha.
  resolverFormula?: (formula: string) => { dados: Dado[]; modificador: number };
  nomeRolagem?: string;
  aoAbrirRef?: (tipo: TipoRef, id: string) => void;
  // A ação dona da descrição: os chips `{{efeito:tipo#N}}` apontam pros efeitos
  // dela e mostram o valor calculado; `{{duracao}}` mostra a duração dela.
  efeitos?: EfeitoHabilidade[];
  duracao?: Duracao | null;
  // Resumo do efeito pro chip. `resolvido`: com os valores da ficha ("+2");
  // sem, a fórmula crua ("+PROF/2"). Na integração: `resumoEfeito` do op-rpg.
  resumoEfeito?: (e: EfeitoHabilidade, resolvido: boolean) => string;
  // Valores dos atributos de quem lê (16 = +3): o chip de atributo mostra o
  // modificador na dica. Na integração: os atributos da ficha.
  atributos?: Partial<Record<string, number>>;
  // CD das técnicas de quem lê, pro chip `{{salv:atributo}}` sem CD escrita.
  cdPadrao?: number;
};

// Atributo (slug) → sigla e nome.
export function atributoRico(slug: string): { sigla: string; nome: string } {
  const a = ATRIBUTOS_RICOS.find((x) => x.slug === slug);
  return { sigla: a?.sigla ?? slug.slice(0, 3).toUpperCase(), nome: a?.nome ?? slug };
}

// A CD de um chip de salvaguarda: a escrita nele, ou a das técnicas de quem lê.
export const cdDaSalvaguarda = (no: { cd?: number }, ctx?: ContextoRico): number | undefined =>
  no.cd ?? ctx?.cdPadrao;

// O efeito da ação que um chip `{{efeito:tipo#N}}` aponta. `undefined`: o chip
// não é de efeito da ação (ou o contexto não traz os efeitos); `null`: o efeito
// não existe mais. Se a ordem mudou, acha o primeiro do mesmo tipo.
export function efeitoDaAcao(
  no: { slug: string; idx?: number },
  ctx?: ContextoRico,
): { e: EfeitoHabilidade; i: number } | null | undefined {
  if (no.idx === undefined || !ctx?.efeitos) return undefined;
  const direto = ctx.efeitos[no.idx];
  if (direto && direto.tipo === no.slug) return { e: direto, i: no.idx };
  const i = ctx.efeitos.findIndex((x) => x.tipo === no.slug);
  return i >= 0 ? { e: ctx.efeitos[i], i } : null;
}

export const ICONE_REF: Record<TipoRef, string> = { acao: "fa-bolt", hab: "fa-star", item: "fa-box" };
export const ICONE_COND = "fa-triangle-exclamation";
export const ICONE_ROLAGEM = "fa-dice-d20";
export const ICONE_DANO_PADRAO = "fa-burst";
export const MARCADOR_PADRAO = "skull";

export type EfeitoCatalogo = { slug: string; nome: string; icone: string; cor: string };

// Todos os efeitos que o editor de efeitos da ficha conhece.
export const EFEITOS_CATALOGO: EfeitoCatalogo[] = (Object.entries(META_EFEITOS) as [TipoEfeito, (typeof META_EFEITOS)[TipoEfeito]][])
  .filter(([slug]) => slug !== "livre")
  .map(([slug, m]) => ({ slug, nome: m.nome, icone: m.icone, cor: m.cor }));

export function efeitoMeta(slug: string): EfeitoCatalogo | null {
  return EFEITOS_CATALOGO.find((e) => e.slug === slug) ?? null;
}

// Os efeitos da própria ação, prontos pra listar (inserir, editar, avisar):
// cada um com o nome, o ícone e o valor calculado.
export type OpcaoEfeitoAcao = {
  i: number;
  slug: string;
  nome: string;
  icone: string;
  cor?: string;
  resumo?: string;
};

export function efeitosDaAcao(ctx?: ContextoRico): OpcaoEfeitoAcao[] {
  return (ctx?.efeitos ?? []).map((e, i) => {
    const m = efeitoMeta(e.tipo);
    return {
      i,
      slug: e.tipo,
      nome: nomeDoEfeito(e),
      icone: m ? iconeDoEfeito(e) : "fa-wand-magic-sparkles",
      cor: m?.cor,
      resumo: ctx?.resumoEfeito?.(e, true) || undefined,
    };
  });
}

export function tipoDanoDe(nome: string, catalogo: TipoDanoCatalogo[] = CATALOGO_PADRAO): TipoDanoCatalogo | null {
  return catalogo.find((t) => mesmoTipo(t.nome, nome)) ?? null;
}

// A cara do chip de um tipo de dano: a mesma que a ficha e o bestiário dão
// (`useEstiloTipoDano`): cor, 2ª cor e efeito escolhidos na Biblioteca. Tipo
// fora do catálogo, ou sem cor, fica com o chip comum.
export function faceDoTipo(t: TipoDanoCatalogo | null): { className: string; style: CSSProperties } | null {
  if (!t) return null;
  const { className, style } = estiloAplicado({ cor: t.cor, cor2: t.cor2, efeito: t.efeito }, "chip");
  return style ? { className, style } : null;
}

// Paleta de cores de texto: as mesmas da ficha (SWATCHES_COR) mais neutras.
export const PALETA_TEXTO: { cor: string; nome: string }[] = [
  { cor: "#e74c3c", nome: "Vermelho" },
  { cor: "#f39c12", nome: "Laranja" },
  { cor: "#d4af37", nome: "Ouro" },
  { cor: "#27ae60", nome: "Verde" },
  { cor: "#14b8a6", nome: "Turquesa" },
  { cor: "#1f9eff", nome: "Azul" },
  { cor: "#9b59b6", nome: "Roxo" },
  { cor: "#ec4899", nome: "Rosa" },
  { cor: "#64748b", nome: "Cinza" },
];

export { EFEITOS_COR };
export type { EfeitoCor };

// Cor de texto: as mesmas classes e variáveis `fx-*` do resto do app (que já
// cuidam de claro/escuro). Cor inválida = sem estilo.
export function estiloDeCor(
  cor: string,
  cor2?: string,
  efeito?: string,
): { className: string; style: CSSProperties | undefined } {
  const vars = varsEstiloCor(cor, cor2);
  if (!vars) return { className: "", style: undefined };
  return { className: `fx-texto-solto fx-${normalizarEfeitoCor(efeito)}`, style: vars };
}

// Resolve a fórmula com os dados da ficha (siglas, NIVEL, funções). Fórmula
// ruim vira "sem dados", como o `parseFormulaDados` faz.
export function resolvedorDaFicha(ctx: ContextoAvaliacao): (f: string) => { dados: Dado[]; modificador: number } {
  return (f) => {
    const r = avaliarFormula(f, ctx);
    return r.ok ? r.rolagem : { dados: [], modificador: 0 };
  };
}

export function resumoRolagem(dados: Dado[], modificador: number) {
  const faixa = dados.length ? faixaDaRolagem(dados, modificador) : null;
  return { texto: dados.length ? formulaTexto(dados, modificador) : "", faixa };
}

// Rótulo e ícone de um átomo: o editor e a visualização desenham o mesmo chip.
export type Atomo = Exclude<Inline, { t: "texto" } | { t: "marca" } | { t: "cor" }>;

export function aparenciaDoAtomo(
  no: Atomo,
  ctx?: ContextoRico,
): {
  icone: string;
  rotulo: string;
  // Valor calculado (efeito da ação): "+2 CA", "1d6 · dano de técnica".
  detalhe?: string;
  classe: string;
  cor?: string;
  corIcone?: string;
  // Estilo do tipo de dano na Biblioteca (cor, 2ª cor, efeito): vira o chip todo.
  fx?: { className: string; style: CSSProperties };
  apagada?: boolean;
} {
  switch (no.t) {
    case "ref": {
      const info = ctx?.refs?.[`${no.tipo}:${no.id}`];
      const apagada = !!ctx?.refs && !info;
      return {
        icone: info?.icone ?? ICONE_REF[no.tipo],
        rotulo: info?.titulo ?? no.nome,
        classe: `desc-chip--${no.tipo}${apagada ? " desc-chip--morta" : ""}`,
        apagada,
      };
    }
    case "cond": {
      const c = ctx?.condicoes?.find((x) => x.nome.toLowerCase() === no.nome.toLowerCase());
      if (ctx?.catalogoCondicoes) {
        // Mesma cara da ficha: estilo da Biblioteca ou, fora dela, a cor fixa do nome.
        const e = condicaoNoCatalogo(ctx.catalogoCondicoes, no.nome);
        const cor = e?.cor ?? corDaCondicao(no.nome);
        const { className, style } = estiloAplicado(
          { cor, cor2: e?.cor2 ?? null, efeito: e?.efeito ?? EFEITO_COR_PADRAO },
          "chip",
        );
        return {
          icone: ICONE_COND,
          rotulo: no.nome,
          classe: "desc-chip--cond",
          cor,
          fx: style ? { className, style } : undefined,
        };
      }
      return { icone: ICONE_COND, rotulo: no.nome, classe: "desc-chip--cond", cor: c?.cor };
    }
    case "duracao":
      return {
        icone: "fa-hourglass-half",
        rotulo: rotuloDuracao(ctx?.duracao),
        classe: "desc-chip--duracao",
        cor: "var(--efeito-neutro)",
      };
    case "salv": {
      const cd = cdDaSalvaguarda(no, ctx);
      const { sigla } = atributoRico(no.atributo);
      return {
        icone: "fa-shield-halved",
        rotulo: cd !== undefined ? `${sigla} | CD ${cd}` : sigla,
        classe: "desc-chip--salv",
      };
    }
    case "attr":
      return { icone: "fa-dumbbell", rotulo: atributoRico(no.atributo).sigla, classe: "desc-chip--attr" };
    case "efeito": {
      const m = efeitoMeta(no.slug);
      const daAcao = efeitoDaAcao(no, ctx);
      if (daAcao !== undefined) {
        // Chip ligado ao efeito da ação: nome + valor calculado, como no card de hoje.
        if (daAcao === null) {
          return {
            icone: m?.icone ?? "fa-wand-magic-sparkles",
            rotulo: m?.nome ?? no.slug,
            classe: "desc-chip--efeito desc-chip--morta",
            apagada: true,
          };
        }
        return {
          icone: m ? iconeDoEfeito(daAcao.e) : "fa-wand-magic-sparkles",
          rotulo: nomeDoEfeito(daAcao.e),
          detalhe: ctx?.resumoEfeito?.(daAcao.e, true) || undefined,
          classe: "desc-chip--efeito",
          cor: m?.cor,
        };
      }
      const tipo = no.param ? tipoDanoDe(no.param, ctx?.tiposDano) : null;
      return {
        icone: m?.icone ?? "fa-wand-magic-sparkles",
        rotulo: no.param ? `${m?.nome ?? no.slug} ${no.param}` : (m?.nome ?? no.slug),
        classe: `desc-chip--efeito${m ? "" : " desc-chip--morta"}`,
        cor: m?.cor,
        corIcone: tipo?.cor ?? undefined,
      };
    }
    case "dano": {
      const t = tipoDanoDe(no.tipo, ctx?.tiposDano);
      return {
        icone: t?.icone ?? ICONE_DANO_PADRAO,
        rotulo: t?.nome ?? no.tipo,
        classe: "desc-chip--dano",
        cor: t?.cor ?? undefined,
        fx: faceDoTipo(t) ?? undefined,
      };
    }
    case "rolagem": {
      const t = no.dano ? tipoDanoDe(no.dano, ctx?.tiposDano) : null;
      return {
        // Rolagem de um tipo de dano leva o ícone dele na Biblioteca.
        icone: t?.icone ?? ICONE_ROLAGEM,
        rotulo: no.dano ? `${no.formula} ${t?.nome ?? no.dano}` : no.formula,
        classe: "desc-chip--rolagem",
        cor: t?.cor ?? undefined,
        corIcone: t?.cor ?? undefined,
        fx: faceDoTipo(t) ?? undefined,
      };
    }
    case "icone":
      return { icone: `fa-${no.slug}`, rotulo: "", classe: "desc-chip--icone" };
  }
}
