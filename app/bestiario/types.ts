// Categorias possíveis de um TraitInstance — mesmos blocos do statblock do manual.
export type ComponenteCategoria =
  | "aspecto"
  | "acao"
  | "acaoBonus"
  | "reacao"
  | "acaoPoderosa"
  | "acaoLendaria";

// Como o componente é resolvido contra um alvo — decide quais campos de
// mecânica fazem sentido mostrar (bônus de ataque vs. CD + atributo salvo).
export type ModoResolucao = "nenhum" | "ataque" | "salvaguarda";

export type AtributoSalvaguarda = "forca" | "destreza" | "constituicao" | "sabedoria" | "presenca" | "vontade";

// Uma técnica pode causar dano de mais de um tipo (dano composto, ex: "1d6
// cortante + 1d4 fogo") ou dar escolha entre tipos (ex: "Contundente, Cortante
// ou Perfurante") — os dois casos cabem numa lista de tipos por entrada de dano.
export type DanoEntrada = {
  id: string;
  formula: string; // "2d10", "1d6+2"
  tipos: string[]; // ["Cortante"] ou ["Contundente", "Cortante", "Perfurante"]
};

export type FormaArea = "nenhuma" | "cone" | "linha" | "esfera" | "emanacao" | "cilindro";

// Sugestões de tipo de dano vistos no manual — texto livre, não enum fechado,
// mesmo padrão que EfeitoHabilidade.tipoDano já usa em lib/op-rpg.ts (pra não
// travar homebrew com um tipo de dano fora da lista).
export const TIPOS_DANO_SUGERIDOS = [
  "Cortante",
  "Contundente",
  "Perfurante",
  "Fogo",
  "Psíquico",
  "Veneno",
  "Verdadeiro",
];

export const FORMAS_AREA: { key: FormaArea; label: string }[] = [
  { key: "nenhuma", label: "Nenhuma (alvo único)" },
  { key: "cone", label: "Cone" },
  { key: "linha", label: "Linha" },
  { key: "esfera", label: "Esfera" },
  { key: "emanacao", label: "Emanação" },
  { key: "cilindro", label: "Cilindro" },
];

export type ComponentePayload = {
  id: string; // id local (React key) — vira TraitInstance.id só depois de salvo
  nome: string;
  categoria: ComponenteCategoria;
  ordem: number;
  // Descrição/texto final da regra — vira TraitInstance.textoRenderizado.
  descricao: string;

  modoResolucao: ModoResolucao;
  bonusAtaque: string; // usado quando modoResolucao === "ataque" (ex: "+5")
  salvaguardaAtributo: AtributoSalvaguarda; // usado quando modoResolucao === "salvaguarda"
  cd: number | null; // usado quando modoResolucao === "salvaguarda"

  danos: DanoEntrada[];
  area: { forma: FormaArea; tamanho: string };

  alcance: string;
  custo: string;
};

export type CaracteristicasPayload = {
  pericias: { id: string; nome: string; bonus: number }[];
  salvaguardas: { id: string; nome: string; bonus: number }[];
  percepcaoPassiva: number | null;
  sentidosExtras: string;
};

export type ResistenciasPayload = {
  danoResistencia: string[];
  danoImunidade: string[];
  danoVulneravel: string[];
  condicaoImunidade: string[];
};

export type CriaturaPayload = {
  nome: string;
  categoria: string;
  tamanho: string;
  imagemUrl: string | null;
  tags: string[];
  personalidade: string | null;

  nd: string;
  ndValor: number;
  xp: number;
  pontosPoder: number;

  classeResistencia: number;
  pvFormula: string;
  pvMedio: number;
  bonusProficiencia: number;
  classeDificuldade: number;

  deslocamento: number;
  deslocamentoNado: number | null;
  deslocamentoVoo: number | null;

  forca: number;
  destreza: number;
  constituicao: number;
  sabedoria: number;
  presenca: number;
  vontade: number;

  caracteristicas: CaracteristicasPayload;
  resistencias: ResistenciasPayload;

  anotacoesPrivadas: string;
  loot: string;

  componentes: ComponentePayload[];
};

export type CriaturaSerializada = CriaturaPayload & {
  id: string;
  criadoEm: string;
  atualizadoEm: string;
};

export const CATEGORIAS_COMPONENTE: { key: ComponenteCategoria; label: string }[] = [
  { key: "aspecto", label: "Aspectos" },
  { key: "acao", label: "Ações" },
  { key: "acaoBonus", label: "Ações Bônus" },
  { key: "reacao", label: "Reações" },
  { key: "acaoPoderosa", label: "Ações Poderosas" },
  { key: "acaoLendaria", label: "Ações Lendárias" },
];

// ─── Biblioteca de traits (TraitTemplate) ─────────────────────────────────
// "Tipos de derivação" fixos em vez de fórmula livre interpretada: cobre os
// dois padrões regulares do manual (bônus de ataque = prof + mod. atributo;
// CD = 8 + prof + mod. atributo) sem precisar de um mini-interpretador de
// expressões. "fixo" ignora a criatura e usa o valor cadastrado no template.
export type DerivacaoTexto = { modo: "fixo"; valor: string } | { modo: "padrao"; atributo: AtributoSalvaguarda };

export type DerivacaoNumero = { modo: "fixo"; valor: number } | { modo: "padrao"; atributo: AtributoSalvaguarda };

// O resto do componente (dano, área, alcance, custo) não tem matemática de
// verdade no manual — é copiado literal do template pro componente novo, e o
// mestre ajusta à mão o que precisar (ex: o "+N" de dano cresce com o ND, mas
// o dado em si não muda, então isso fica manual por enquanto).
export type TemplateFormula = {
  modoResolucao: ModoResolucao;
  bonusAtaque: DerivacaoTexto;
  salvaguardaAtributo: AtributoSalvaguarda;
  cd: DerivacaoNumero;
  danos: DanoEntrada[];
  area: { forma: FormaArea; tamanho: string };
  alcance: string;
  custo: string;
};

export type TemplatePayload = {
  nome: string;
  categoria: ComponenteCategoria;
  // Texto com placeholders opcionais {cd} e {bonus_ataque}, substituídos
  // pelos valores calculados ao aplicar o template numa criatura.
  textoTemplate: string;
  formula: TemplateFormula;
  tagsProve: string[];
  tagsConsome: string[];
  tagsReageA: string[];
};

export type TemplateSerializado = TemplatePayload & { id: string; criadoEm: string };

// ─── Esquadrões e Encontros ────────────────────────────────────────────────
// Mesmo formato de composição pros dois — um esquadrão é só um atalho de
// preenchimento na hora de montar um encontro (a cópia é congelada, sem
// vínculo vivo: editar o esquadrão depois não muda encontros já montados).
export type ItemComposicao = { criaturaId: string; quantidade: number };

export type EsquadraoPayload = {
  nome: string;
  itens: ItemComposicao[];
};

export type EsquadraoSerializado = EsquadraoPayload & { id: string; criadoEm: string };

export type EncontroPayload = {
  nome: string;
  tags: string[];
  itens: ItemComposicao[];
};

export type EncontroSerializado = EncontroPayload & { id: string; criadoEm: string };
