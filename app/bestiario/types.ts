// Categorias possíveis de um TraitInstance — mesmos blocos do statblock do
// manual, mais "condicao": não é algo que uma criatura "tem" como as outras,
// é uma definição de condição (nome + descrição) que outras ações referenciam
// através de um efeito do tipo "condicao" — cadastrada pela biblioteca igual
// qualquer trait.
export type ComponenteCategoria =
  | "aspecto"
  | "acao"
  | "acaoBonus"
  | "reacao"
  | "acaoPoderosa"
  | "acaoLendaria"
  | "condicao";

export type AtributoSalvaguarda = "forca" | "destreza" | "constituicao" | "sabedoria" | "presenca" | "vontade";

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

// "nenhuma" é o alcance de toque — alvo único por definição. Qualquer outra
// forma (cone, linha, esfera...) é área, logo alvo múltiplo por definição —
// por isso não existe um campo "alvo" separado, a forma já diz isso.
export const FORMAS_AREA: { key: FormaArea; label: string }[] = [
  { key: "nenhuma", label: "Toque (alvo único)" },
  { key: "cone", label: "Cone" },
  { key: "linha", label: "Linha" },
  { key: "esfera", label: "Esfera" },
  { key: "emanacao", label: "Emanação" },
  { key: "cilindro", label: "Cilindro" },
];

// ─── Efeitos de ação ────────────────────────────────────────────────────
// Uma ação não é mais um bloco fixo de campos (que assumia "só ataque OU só
// salvaguarda, um dano só, uma área só"). Muitas ações do Manual dos Inimigos
// não causam dano, não fazem uma jogada de ataque, ou não afetam ninguém além
// de quem usa (ex: "Recuperação: recupera 20 PV no início do turno",
// "Movimento: se move até metade do deslocamento" numa ação lendária). Em vez
// disso, uma ação começa vazia e acumula uma lista de efeitos independentes —
// mesmo tratamento que a criação de habilidades do jogador já usa
// (`EfeitoHabilidade` em lib/op-rpg.ts), adaptado pro que um statblock de
// criatura precisa expressar.
export type EfeitoAcaoTipo =
  | "ataque"
  | "salvaguarda"
  | "dano"
  | "area"
  | "movimento"
  | "bonus_numerico"
  | "cura"
  | "condicao"
  | "livre";

export type EfeitoAcao =
  // Jogada de ataque contra a CR do alvo (ex: "+5 para atingir").
  | { id: string; tipo: "ataque"; bonus: string }
  // O alvo faz uma salvaguarda contra uma CD.
  | { id: string; tipo: "salvaguarda"; atributo: AtributoSalvaguarda; cd: number }
  // Uma entrada de dano — repetível (dano composto = duas entradas, ex: "1d6
  // Cortante" + "1d4 Fogo"). Vários tipos na mesma entrada = escolha entre
  // eles, não soma (ex: "Contundente, Cortante ou Perfurante").
  | { id: string; tipo: "dano"; formula: string; tipos: string[] }
  // A ação afeta uma área em vez de um alvo só.
  | { id: string; tipo: "area"; forma: FormaArea; tamanho: string }
  // Concede ou altera deslocamento (ex: ação lendária "se move até metade
  // do deslocamento", ou um traço que dá voo enquanto durar).
  | { id: string; tipo: "movimento"; tipoMov: string; valor: number; duracao: string }
  // Bônus numérico genérico em qualquer coisa — deslocamento, CR, CD, bônus
  // de ataque, dano de outra técnica, perícia... `alvo` é texto livre
  // (o mesmo vocabulário usado em qualquer outro lugar do statblock) porque
  // o Manual dos Inimigos tem alvos variados demais pra travar num enum.
  | { id: string; tipo: "bonus_numerico"; alvo: string; valor: number; duracao: string }
  // Recupera Pontos de Vida — fórmula de dado (ex: "2d8") ou valor fixo.
  | { id: string; tipo: "cura"; formula: string }
  // Mesmo formato de antes: condição cadastrada na biblioteca, "congelada"
  // no momento em que é escolhida (editar a condição depois não muda ações
  // já criadas). `duracaoTurnos` null = indefinida/narrativa.
  | { id: string; tipo: "condicao"; condicaoId: string; nome: string; descricao: string; cor: string; duracaoTurnos: number | null }
  // Catch-all pra mecânica que não cabe nos tipos acima (comum em ações
  // lendárias e poderosas, que variam demais pra modelar tudo).
  | { id: string; tipo: "livre"; texto: string };

export type CondicaoEfeito = Extract<EfeitoAcao, { tipo: "condicao" }>;

export const META_EFEITO_ACAO: Record<EfeitoAcaoTipo, { nome: string; icone: string; cor: string }> = {
  ataque: { nome: "Ataque", icone: "fa-hand-fist", cor: "#e05555" },
  salvaguarda: { nome: "Salvaguarda", icone: "fa-burst", cor: "#e0a555" },
  dano: { nome: "Dano", icone: "fa-heart-crack", cor: "#c0392b" },
  area: { nome: "Área", icone: "fa-circle-notch", cor: "#5a8fe0" },
  movimento: { nome: "Movimento", icone: "fa-person-running", cor: "#6fbf6f" },
  bonus_numerico: { nome: "Bônus Numérico", icone: "fa-plus-minus", cor: "#d4c445" },
  cura: { nome: "Recuperar Vida", icone: "fa-heart", cor: "#27ae60" },
  condicao: { nome: "Condição", icone: "fa-triangle-exclamation", cor: "#a06fe0" },
  livre: { nome: "Livre", icone: "fa-feather", cor: "#8a8a8a" },
};

export function criarEfeitoAcao(tipo: EfeitoAcaoTipo): EfeitoAcao {
  const id = crypto.randomUUID();
  switch (tipo) {
    case "ataque":
      return { id, tipo, bonus: "+0" };
    case "salvaguarda":
      return { id, tipo, atributo: "destreza", cd: 10 };
    case "dano":
      return { id, tipo, formula: "", tipos: [] };
    case "area":
      return { id, tipo, forma: "esfera", tamanho: "6 metros" };
    case "movimento":
      return { id, tipo, tipoMov: "caminhar", valor: 0, duracao: "" };
    case "bonus_numerico":
      return { id, tipo, alvo: "", valor: 0, duracao: "" };
    case "cura":
      return { id, tipo, formula: "" };
    case "condicao":
      return { id, tipo, condicaoId: "", nome: "", descricao: "", cor: "", duracaoTurnos: null };
    case "livre":
      return { id, tipo, texto: "" };
  }
}

// Como um uso limitado volta a ficar disponível. "combate" é o caso mais
// comum do manual ("3/dia", "5/dia"...) — como InstanciaCombate só existe
// durante um combate e some quando ele acaba, "por dia" e "por combate" dão
// no mesmo aqui: cada combate novo começa com os usos cheios de novo, sem
// precisar de um reset explícito. "dado" é recarga ao estilo "5-6" do
// manual — rola 1d6 no início do turno, recarrega se bater o mínimo.
export type RecargaAcao = { tipo: "combate" } | { tipo: "dado"; minimo: number } | { tipo: "manual" };

export const RECARGAS_ACAO: { tipo: RecargaAcao["tipo"]; label: string }[] = [
  { tipo: "combate", label: "A cada combate (ex: 3/dia)" },
  { tipo: "dado", label: "Dado (ex: Recarga 5-6)" },
  { tipo: "manual", label: "Manual (o narrador reseta)" },
];

export type ComponentePayload = {
  id: string; // id local (React key) — vira TraitInstance.id só depois de salvo
  nome: string;
  categoria: ComponenteCategoria;
  ordem: number;
  // Descrição/texto final da regra — vira TraitInstance.textoRenderizado.
  descricao: string;

  efeitos: EfeitoAcao[];

  // Usos limitados (ex: "5/dia", "Recarga 5-6"). null = ilimitado. O
  // contador de quanto já foi usado não mora aqui — isso é por cópia da
  // criatura em combate (InstanciaCombate), não na definição da ação.
  usos: number | null;
  recarga: RecargaAcao | null;

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

  // Nome da linhagem (texto livre — resolvido/criado por nome no server, não
  // um id). Vazio = sem linhagem. `ordemTier` só importa com linhagem setada:
  // posição na progressão (1=Recruta...8=Almirante, por ex.), usada pro "a
  // partir de" do wizard sugerir o próximo tier de uma linhagem existente.
  linhagem: string;
  ordemTier: number | null;

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

export const CATEGORIAS_COMPONENTE: { key: ComponenteCategoria; label: string; icone: string }[] = [
  { key: "aspecto", label: "Aspectos", icone: "fa-star" },
  { key: "acao", label: "Ação Padrão", icone: "fa-hand-fist" },
  { key: "acaoBonus", label: "Ações Bônus", icone: "fa-forward" },
  { key: "reacao", label: "Reações", icone: "fa-shield-halved" },
  { key: "acaoPoderosa", label: "Ações Poderosas", icone: "fa-burst" },
  { key: "acaoLendaria", label: "Ações Lendárias", icone: "fa-crown" },
  { key: "condicao", label: "Condições", icone: "fa-triangle-exclamation" },
];

// Categorias de ação que a biblioteca agrupa dentro da pasta "Ações" (o
// statblock trata cada uma como bloco próprio, mas na biblioteca elas cabem
// juntas — só "Aspectos" e "Condições" ganham pasta própria).
export const CATEGORIAS_ACAO: ComponenteCategoria[] = ["acao", "acaoBonus", "reacao", "acaoPoderosa", "acaoLendaria"];

// ─── Biblioteca de traits (TraitTemplate) ─────────────────────────────────
// Mesma lista de efeitos do componente — aplicar um template só copia os
// efeitos literalmente pra criatura (o mestre ajusta os números à mão pro
// ND dela depois; não tem cálculo automático de proficiência/atributo aqui).
export type TemplateFormula = {
  efeitos: EfeitoAcao[];
  usos: number | null;
  recarga: RecargaAcao | null;
  // Só relevante pra templates de categoria "condicao" — cor escolhida pelo
  // narrador na criação (vazia = cor automática por hash do nome).
  cor: string;
  alcance: string;
  custo: string;
};

export type TemplatePayload = {
  nome: string;
  categoria: ComponenteCategoria;
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
