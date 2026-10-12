// Catálogo de tipos de dano: o narrador define na Biblioteca e as fichas das
// mesas dele escolhem dali. Puro (cliente e servidor).

import { TIPOS_DANO, mesmoTipo } from "./dano";
import { EFEITO_COR_PADRAO, corValida, normalizarEfeitoCor, type EfeitoCor } from "./estilos-cor";

// Tipo de dano com a cara que o narrador deu: cor (com efeito) e ícone.
export type TipoDanoCatalogo = {
  nome: string;
  cor: string | null;
  cor2: string | null;
  efeito: EfeitoCor;
  // Classe Font Awesome ("fa-fire"); null = sem ícone.
  icone: string | null;
};

// Cara padrão dos tipos do livro.
const CARA_DO_LIVRO: Record<string, { icone: string; cor: string }> = {
  Contundente: { icone: "fa-hammer", cor: "#8d99ae" },
  Cortante: { icone: "fa-khanda", cor: "#c0392b" },
  Perfurante: { icone: "fa-crosshairs", cor: "#b08d57" },
  Fogo: { icone: "fa-fire", cor: "#e67e22" },
  Frio: { icone: "fa-snowflake", cor: "#4fb8c4" },
  Elétrico: { icone: "fa-bolt", cor: "#d4c445" },
  Ácido: { icone: "fa-flask", cor: "#6fbf6f" },
  Veneno: { icone: "fa-skull-crossbones", cor: "#8e44ad" },
  Psíquico: { icone: "fa-brain", cor: "#e068b8" },
  Trovejante: { icone: "fa-volume-high", cor: "#5a8fe0" },
  Energia: { icone: "fa-atom", cor: "#a06fe0" },
  Verdadeiro: { icone: "fa-star", cor: "#f1c40f" },
};

// Tipos do livro; valem enquanto o narrador não cadastra os dele, e fora de mesa.
export const CATALOGO_PADRAO: TipoDanoCatalogo[] = TIPOS_DANO.map((t) => ({
  nome: t.nome,
  cor: CARA_DO_LIVRO[t.nome]?.cor ?? null,
  cor2: null,
  efeito: EFEITO_COR_PADRAO,
  icone: CARA_DO_LIVRO[t.nome]?.icone ?? null,
}));

export const TIPOS_DANO_PADRAO = CATALOGO_PADRAO.map((t) => t.nome);

export const MAX_TIPOS_CATALOGO = 40;

const ICONE_VALIDO = /^fa-[a-z0-9-]{1,40}$/;

// Cara do livro pra um tipo com esse nome ("fogo", "Cort."); null = não é do livro.
export function caraDoLivro(nome: string): { icone: string; cor: string } | null {
  const doLivro = TIPOS_DANO.find((t) => mesmoTipo(t.nome, nome));
  return doLivro ? (CARA_DO_LIVRO[doLivro.nome] ?? null) : null;
}

// Tipo cadastrado (nome + estilo cru do Json) → entrada do catálogo. Tipo do
// livro que o narrador ainda não estilizou (sem cor nem ícone) fica com a
// cara do livro.
export function tipoDoCatalogo(nome: string, estilo: Record<string, unknown> = {}): TipoDanoCatalogo {
  const iconeCru = String(estilo.icone ?? "");
  const cor = corValida(estilo.cor);
  const icone = ICONE_VALIDO.test(iconeCru) ? iconeCru : null;
  const padrao = !cor && !icone ? caraDoLivro(nome) : null;
  return {
    nome: nome.trim(),
    cor: cor ?? padrao?.cor ?? null,
    cor2: corValida(estilo.cor2),
    efeito: normalizarEfeitoCor(estilo.efeito),
    icone: icone ?? padrao?.icone ?? null,
  };
}

// Catálogo a partir dos tipos cadastrados: sem vazio nem repetido pelas letras;
// nenhum = os tipos do livro.
export function lerCatalogoTipos(tipos: TipoDanoCatalogo[]): TipoDanoCatalogo[] {
  const lista: TipoDanoCatalogo[] = [];
  for (const t of tipos) {
    if (t.nome && !lista.some((x) => mesmoTipo(x.nome, t.nome))) lista.push(t);
  }
  return lista.length > 0 ? lista.slice(0, MAX_TIPOS_CATALOGO) : CATALOGO_PADRAO;
}

export function tipoNoCatalogo(catalogo: TipoDanoCatalogo[], nome: string): TipoDanoCatalogo | undefined {
  return catalogo.find((t) => mesmoTipo(t.nome, nome));
}
