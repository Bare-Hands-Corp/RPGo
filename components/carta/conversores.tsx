"use client";

// Converte ação, habilidade e item da ficha no modelo comum da carta.
//
// Identidade visual:
// - cor (banner e faixa) = tipo da ação / origem da habilidade / tipo do item;
// - ícone = tipo de dano (catálogo da Biblioteca, com a cor dele); sem dano,
//   a origem (habilidade de onde a ação vem, item que a concede) ou o tipo.
import { DescricaoRica } from "@/components/descricao-rica/descricao-rica";
import type { ContextoRico } from "@/components/descricao-rica/atomos";
import { ATRIBUTOS, CATEGORIAS_ARMA, ORIGENS_HABILIDADE } from "@/lib/op-rpg";
import { tiposDoDano } from "@/lib/dano";
import { tipoNoCatalogo, type TipoDanoCatalogo } from "@/lib/tipos-dano";
import type { ModeloCarta, Raridade } from "./carta";

// Só os campos que a carta usa (vêm serializados do servidor).
export type AcaoCarta = {
  id: string;
  nome: string;
  descricao: string;
  tipo: string;
  tecnica: boolean;
  grau: number;
  custoPp: number;
  custoPa: number;
  custoPpFormula?: string | null;
  custoRecursoId: string | null;
  custoRecursoValor: number;
  dano: string | null;
  tipoDano?: string | null;
  alcance: string | null;
  atributoSalv: string | null;
  usos?: number | null;
  usosAtual?: number | null;
  recarga?: string | null;
  pasta?: string | null;
  habilidadeIds?: unknown;
  itemId: string | null;
  efeitos?: unknown;
  duracao?: unknown;
};

export type HabilidadeCarta = {
  id: string;
  nome: string;
  descricao: string;
  origem: string;
  tipo: string;
  custoPp: number;
  custoPa: number;
  custoPpFormula: string | null;
  custoRecursoId: string | null;
  custoRecursoValor: number;
  usos: number | null;
  usosAtual: number | null;
  recarga: string | null;
  tags: string | null;
  ligada: boolean;
  itemId: string | null;
};

export type ItemCarta = {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: string;
  categoria: string;
  quantidade: number;
  peso: number;
  dano: string | null;
  danoBonus: string | null;
  ca: number;
  alcanceMetros: string | null;
  equipado: boolean;
  propriedades: unknown;
};

export type ContextoCartas = {
  personagem: string;
  recursos: Record<string, string>; // id → nome
  tiposDano: TipoDanoCatalogo[]; // catálogo do narrador da mesa
  habilidades: Record<string, { nome: string; origem: string }>;
  itens: Record<string, { nome: string; tipo: string; categoria: string }>;
};

type Icone = { classe: string; cor?: string; titulo: string };

const fa = (i: Icone | null | undefined) => (i ? <i className={`fas ${i.classe}`} title={i.titulo} aria-hidden /> : null);

const TIPO_ACAO: Record<string, { faixa: string; cor: string; icone: string }> = {
  padrao: { faixa: "AÇÃO", cor: "#2f7fc1", icone: "fa-hand-fist" },
  bonus: { faixa: "AÇÃO BÔNUS", cor: "#b8860b", icone: "fa-forward-fast" },
  power: { faixa: "PODEROSA", cor: "#c0571b", icone: "fa-burst" },
  react: { faixa: "REAÇÃO", cor: "#239b56", icone: "fa-rotate-left" },
  livre: { faixa: "LIVRE", cor: "#7b4fa0", icone: "fa-feather" },
};

// Cor fixa da carta por origem (as do app são variáveis de tema).
const COR_ORIGEM: Record<string, string> = {
  profissao: "#2f7fc1",
  estilo: "#c0571b",
  haki: "#1e8a7a",
  especie: "#a0761b",
  akumaNoMi: "#8e2f6b",
  treinamento: "#3c6e8f",
  item: "#8a6d1f",
  livre: "#5d6d7e",
};

const TIPO_ITEM: Record<string, { faixa: string; cor: string; icone: string }> = {
  arma: { faixa: "ARMA", cor: "#8a3b1f", icone: "fa-khanda" },
  armadura: { faixa: "ARMADURA", cor: "#4a5a6a", icone: "fa-shield-alt" },
  municao: { faixa: "MUNIÇÃO", cor: "#6b5a2a", icone: "fa-circle-dot" },
  comum: { faixa: "ITEM", cor: "#7b4fa0", icone: "fa-bag-shopping" },
};

const RECARGA: Record<string, string> = {
  descansoCurto: "descanso curto",
  descansoLongo: "descanso longo",
  encontro: "encontro",
  manual: "manual",
};

const TIPO_HAB: Record<string, string> = { passiva: "Passiva", ativa: "Ativa", reativa: "Reativa", livre: "Livre" };

function sigla(slug: string | null) {
  return ATRIBUTOS.find((a) => a.slug === slug)?.sigla ?? slug ?? "";
}

function iconeDoDano(tipo: string | null | undefined, ctx: ContextoCartas): Icone | null {
  if (!tipo) return null;
  const t = tipoNoCatalogo(ctx.tiposDano, tipo);
  return t?.icone ? { classe: t.icone, cor: t.cor ?? undefined, titulo: t.nome } : null;
}

function iconeDaOrigem(origem: string): Icone {
  const o = ORIGENS_HABILIDADE.find((x) => x.slug === origem) ?? ORIGENS_HABILIDADE.at(-1)!;
  return { classe: o.icone, titulo: o.nome };
}

function iconeDoItem(item: { tipo: string; categoria: string; nome: string }): Icone {
  if (item.tipo === "arma") {
    const c = CATEGORIAS_ARMA.find((x) => x.slug === item.categoria);
    if (c) return { classe: c.icone, titulo: `Arma ${c.nome.toLowerCase()}` };
  }
  return { classe: (TIPO_ITEM[item.tipo] ?? TIPO_ITEM.comum).icone, titulo: item.nome };
}

type Custos = Pick<AcaoCarta, "custoPp" | "custoPa" | "custoPpFormula" | "custoRecursoId" | "custoRecursoValor">;

// O primeiro custo vai pro círculo; os outros, pra linha de informações.
function custos(c: Custos, ctx: ContextoCartas) {
  const lista: { valor: string; simbolo: string; titulo: string }[] = [];
  if (c.custoPpFormula) lista.push({ valor: c.custoPpFormula, simbolo: "PP", titulo: "Pontos de Poder" });
  else if (c.custoPp > 0) lista.push({ valor: String(c.custoPp), simbolo: "PP", titulo: "Pontos de Poder" });
  if (c.custoPa > 0) lista.push({ valor: String(c.custoPa), simbolo: "PA", titulo: "Pontos de Ação" });
  if (c.custoRecursoId && c.custoRecursoValor > 0) {
    const nome = ctx.recursos[c.custoRecursoId] ?? "recurso";
    lista.push({ valor: String(c.custoRecursoValor), simbolo: nome.slice(0, 2).toUpperCase(), titulo: nome });
  }
  const [primeiro, ...resto] = lista;
  return {
    custo: primeiro && primeiro.valor.length <= 3 ? primeiro : undefined,
    extras: (primeiro && primeiro.valor.length > 3 ? lista : resto).map((x) => ({
      rotulo: "Custo",
      valor: `${x.valor} ${x.titulo}`,
    })),
  };
}

function usosInfo(u: { usos?: number | null; usosAtual?: number | null; recarga?: string | null }) {
  if (u.usos == null) return { info: [], gasta: undefined };
  const atual = u.usosAtual ?? u.usos;
  const recarga = u.recarga ? RECARGA[u.recarga] ?? u.recarga : null;
  return {
    info: [{ rotulo: "Usos", valor: `${atual}/${u.usos}${recarga ? ` · ${recarga}` : ""}` }],
    gasta: atual <= 0 ? { motivo: recarga ? `recupera no ${recarga}` : "sem usos" } : undefined,
  };
}

const corpo = (texto: string | null, rico?: ContextoRico) => <DescricaoRica texto={texto} contexto={rico} />;

// `rico`: contexto dos chips da descrição (efeitos e duração da própria ação, CD da ficha).
export function cartaDeAcao(a: AcaoCarta, ctx: ContextoCartas, rico?: ContextoRico): ModeloCarta {
  const t = TIPO_ACAO[a.tipo] ?? TIPO_ACAO.padrao;
  const { custo, extras } = custos(a, ctx);
  const usos = usosInfo(a);

  // Ícone: dano > habilidade de origem > item que concede > tipo da ação.
  const tipoDano = a.tipoDano ?? (a.dano ? tiposDoDano(a.dano)[0] : null);
  const habIds = Array.isArray(a.habilidadeIds) ? (a.habilidadeIds as string[]) : [];
  const hab = habIds.map((id) => ctx.habilidades[id]).find(Boolean);
  const item = a.itemId ? ctx.itens[a.itemId] : undefined;
  const icone: Icone =
    iconeDoDano(tipoDano, ctx) ??
    (hab ? { ...iconeDaOrigem(hab.origem), titulo: hab.nome } : null) ??
    (item ? iconeDoItem(item) : null) ?? { classe: t.icone, titulo: t.faixa };

  const info = [
    ...(a.alcance ? [{ rotulo: "Alcance", valor: a.alcance }] : []),
    ...(a.dano ? [{ rotulo: "Dano", valor: [a.dano, a.tipoDano].filter(Boolean).join(" ") }] : []),
    ...(a.atributoSalv ? [{ rotulo: "Salv.", valor: sigla(a.atributoSalv) }] : []),
    ...extras,
    ...usos.info,
  ];
  const raridade: Raridade = a.tecnica && a.grau >= 5 ? "lendario" : a.tecnica && a.grau >= 3 ? "raro" : "comum";
  return {
    titulo: a.nome,
    subtitulo: [
      a.tecnica ? `Técnica${a.grau ? ` · Grau ${a.grau}` : ""}` : t.faixa.charAt(0) + t.faixa.slice(1).toLowerCase(),
      hab?.nome ?? item?.nome,
    ]
      .filter(Boolean)
      .join(" · "),
    faixa: a.tecnica ? `TÉCNICA · ${t.faixa}` : t.faixa,
    cor: t.cor,
    icone: fa(icone),
    corIcone: icone.cor,
    nivel: a.tecnica && a.grau ? a.grau : undefined,
    custo,
    linhaInfo: info,
    corpo: corpo(a.descricao, rico),
    rodape: [ctx.personagem, a.pasta].filter(Boolean).join(" · "),
    raridade,
    gasta: usos.gasta,
  };
}

export function cartaDeHabilidade(h: HabilidadeCarta, ctx: ContextoCartas, rico?: ContextoRico): ModeloCarta {
  const icone = iconeDaOrigem(h.origem);
  const { custo, extras } = custos(h, ctx);
  const usos = usosInfo(h);
  const item = h.itemId ? ctx.itens[h.itemId] : undefined;
  return {
    titulo: h.nome,
    subtitulo: [icone.titulo, TIPO_HAB[h.tipo] ?? h.tipo, h.ligada ? "ligada" : null, item?.nome]
      .filter(Boolean)
      .join(" · "),
    faixa: "HABILIDADE",
    cor: COR_ORIGEM[h.origem] ?? COR_ORIGEM.livre,
    icone: fa(icone),
    custo,
    linhaInfo: [...extras, ...usos.info],
    corpo: corpo(h.descricao, rico),
    rodape: [ctx.personagem, h.tags].filter(Boolean).join(" · "),
    raridade: h.origem === "haki" || h.origem === "akumaNoMi" ? "raro" : "comum",
    gasta: usos.gasta,
  };
}

export function cartaDeItem(i: ItemCarta, ctx: ContextoCartas): ModeloCarta {
  const t = TIPO_ITEM[i.tipo] ?? TIPO_ITEM.comum;
  const icone = iconeDoItem(i);
  const danoCor = i.dano ? iconeDoDano(tiposDoDano(i.dano)[0], ctx)?.cor : undefined;
  const props = Array.isArray(i.propriedades) ? (i.propriedades as string[]) : [];
  const info = [
    ...(i.dano ? [{ rotulo: "Dano", valor: [i.dano, i.danoBonus].filter(Boolean).join(" + ") }] : []),
    ...(i.ca ? [{ rotulo: "CA", valor: `+${i.ca}` }] : []),
    ...(i.alcanceMetros ? [{ rotulo: "Alcance", valor: i.alcanceMetros }] : []),
    ...(i.peso ? [{ rotulo: "Peso", valor: String(i.peso) }] : []),
  ];
  return {
    titulo: i.nome,
    subtitulo:
      [props.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(", "), i.equipado ? "Equipado" : null]
        .filter(Boolean)
        .join(" · ") || undefined,
    faixa: t.faixa,
    cor: t.cor,
    icone: fa(icone),
    corIcone: danoCor,
    custo: i.quantidade > 1 ? { valor: `×${i.quantidade}`, simbolo: "", titulo: "Quantidade" } : undefined,
    linhaInfo: info,
    corpo: i.descricao ? corpo(i.descricao) : <p className="carta-vazia">Sem descrição.</p>,
    rodape: ctx.personagem,
    raridade: i.tipo === "arma" && i.equipado ? "raro" : "comum",
  };
}
