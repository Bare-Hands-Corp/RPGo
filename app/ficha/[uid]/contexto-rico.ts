import { createContext, useMemo } from "react";
import { useCatalogoTiposCompleto } from "@/components/tipos-dano/tipos-dano";
import { useCatalogoCondicoesCompleto } from "@/components/tipos-dano/condicoes";
import type { ContextoRico } from "@/components/descricao-rica/atomos";
import type { CondicaoCatalogo } from "@/lib/condicoes";
import type { Duracao } from "@/lib/duracao";
import { cdTecnica, resolverFormula, resumoEfeito, type Atributo, type EfeitoHabilidade } from "@/lib/op-rpg";
import type { TipoDanoCatalogo } from "@/lib/tipos-dano";

const SELO_TIPO: Record<string, string> = { padrao: "Padrão", bonus: "Bônus", power: "Poderosa", react: "Reação", livre: "Livre" };

type FichaParaContexto = {
  nivel: number;
  atributos: Record<Atributo, number>;
  // Atributo da CD das técnicas (a escolha da ficha lateral).
  atributoCd: string | null;
  acoes: { id: string; nome: string; tipo: string; tecnica: boolean; grau: number }[];
  habilidades: { id: string; nome: string }[];
  itens: { id: string; nome: string }[];
  nomeRecurso: (id: string) => string | undefined;
  tiposDano: TipoDanoCatalogo[];
  catalogoCondicoes: CondicaoCatalogo[];
};

// A parte do contexto que vale pra ficha inteira: monta uma vez e serve a todos os cards.
export function contextoBaseDaFicha(f: FichaParaContexto): ContextoRico {
  const refs: NonNullable<ContextoRico["refs"]> = {};
  for (const a of f.acoes) refs[`acao:${a.id}`] = { titulo: a.nome, selo: SELO_TIPO[a.tipo] ?? a.tipo };
  for (const h of f.habilidades) refs[`hab:${h.id}`] = { titulo: h.nome, selo: "Habilidade" };
  for (const i of f.itens) refs[`item:${i.id}`] = { titulo: i.nome, selo: "Item" };
  return {
    refs,
    condicoes: f.catalogoCondicoes.map((c) => ({ nome: c.nome, descricao: c.descricao })),
    catalogoCondicoes: f.catalogoCondicoes,
    tiposDano: f.tiposDano,
    atributos: f.atributos,
    cdPadrao: f.atributoCd
      ? cdTecnica({ nivel: f.nivel, valorAtributoPrim: f.atributos[f.atributoCd as Atributo] ?? 10 })
      : undefined,
  };
}

// A parte que depende da ação dona da descrição: os chips `{{efeito:tipo#N}}` e
// `{{duracao}}` apontam pra ela, e as siglas das rolagens resolvem com o grau dela.
export function contextoDaAcao(
  base: ContextoRico,
  f: Pick<FichaParaContexto, "nivel" | "atributos" | "acoes" | "nomeRecurso">,
  a: { nome: string; tecnica: boolean; grau: number },
  efeitos: EfeitoHabilidade[],
  duracao: Duracao | null,
): ContextoRico {
  const grau = a.tecnica && a.grau > 0 ? a.grau : undefined;
  const graus = f.acoes.filter((x) => x.tecnica && x.grau > 0).map((x) => x.grau);
  return {
    ...base,
    nomeRolagem: a.nome,
    efeitos,
    duracao,
    // O mesmo resumo do chip de efeito do card de antes, com a ficha real.
    resumoEfeito: (e, resolvido) =>
      resumoEfeito(e, f.nomeRecurso, resolvido ? { nivel: f.nivel, atributos: f.atributos, grau, graus } : undefined),
    resolverFormula: (formula) => resolverFormula(formula, f.atributos, f.nivel, { grau }),
  };
}

// Uma vez por aba: a ficha com os catálogos da mesa e o contexto base dos chips.
// Cada card monta o seu com `contextoDaAcao(base, ficha, acao, efeitos, duracao)`.
export function useContextoRico(e: {
  nivel: number;
  atributos: Record<Atributo, number>;
  atributoCd: string | null;
  acoes: FichaParaContexto["acoes"];
  habilidades: FichaParaContexto["habilidades"];
  itens: FichaParaContexto["itens"];
  recursos: { id: string; nome: string }[];
}) {
  const tiposDano = useCatalogoTiposCompleto();
  const catalogoCondicoes = useCatalogoCondicoesCompleto();
  const { nivel, atributos, atributoCd, acoes, habilidades, itens, recursos } = e;
  const ficha = useMemo<FichaParaContexto>(
    () => ({
      nivel,
      atributos,
      atributoCd,
      acoes,
      habilidades: habilidades.map((h) => ({ id: h.id, nome: h.nome })),
      itens: itens.map((i) => ({ id: i.id, nome: i.nome })),
      nomeRecurso: (id) => recursos.find((r) => r.id === id)?.nome,
      tiposDano,
      catalogoCondicoes,
    }),
    [nivel, atributos, atributoCd, acoes, habilidades, itens, recursos, tiposDano, catalogoCondicoes],
  );
  const base = useMemo(() => contextoBaseDaFicha(ficha), [ficha]);
  return { ficha, base };
}

// Contexto base da ficha pra quem está fundo na árvore (card de item): evita passar por todos os níveis.
export const ContextoDescricaoCtx = createContext<ContextoRico | undefined>(undefined);

// Nomes das condições da Biblioteca (o editor sugere e insere por nome).
export function condicoesCatalogoNomes(base: ContextoRico): string[] {
  return (base.catalogoCondicoes ?? []).map((x) => x.nome);
}
