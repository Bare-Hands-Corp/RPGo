// Helpers puros de cálculo do OP RPG v1.5.7.
// Sem estado, sem I/O — podem ser usados em Server Component, Client Component
// ou Server Action.

export function modificador(valor: number): number {
  return Math.floor((valor - 10) / 2);
}

// Formata um modificador como string com sinal (+3, 0, -2).
export function formatarMod(mod: number): string {
  if (mod > 0) return `+${mod}`;
  return String(mod);
}

// Bônus de proficiência por nível (livro do jogador, p. 32).
// 1–6 → +2, 7–10 → +3, 11–14 → +4, 15–18 → +5, 19–20 → +6.
export function bonusProficiencia(nivel: number): number {
  if (nivel >= 19) return 6;
  if (nivel >= 15) return 5;
  if (nivel >= 11) return 4;
  if (nivel >= 7) return 3;
  return 2;
}

// CR = 10 + mod_DES + outros (armadura, escudo, característica, etc).
export function crBase(destreza: number, outros = 0): number {
  return 10 + modificador(destreza) + outros;
}

// Iniciativa = mod_DES (+ outros bônus aplicados pela mesa).
export function iniciativa(destreza: number): number {
  return modificador(destreza);
}

// Percepção passiva = 10 + mod_VON (+ bônus_prof se proficiente em Percepção).
export function percepcaoPassiva(opts: {
  vontade: number;
  nivel: number;
  proficienteEmPercepcao: boolean;
}): number {
  const base = 10 + modificador(opts.vontade);
  return opts.proficienteEmPercepcao ? base + bonusProficiencia(opts.nivel) : base;
}

// Capacidade de carga em kg = valor_FOR × 10. Multiplicador de tamanho
// aplicado por cima (Grande = ×2, Miúdo = ×0.5, etc).
export function cargaPadrao(forca: number, multiplicadorTamanho = 1): number {
  return forca * 10 * multiplicadorTamanho;
}

const fmtBerries = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

// Formata Berries com separador de milhar pt-BR (6.200.000).
export function formatarBerries(n: number): string {
  return fmtBerries.format(n);
}

// ─── Catálogo de Atributos / Perícias / Salvaguardas ──────────────────

export type Atributo =
  | "forca"
  | "destreza"
  | "constituicao"
  | "sabedoria"
  | "vontade"
  | "presenca";

export const ATRIBUTOS: { slug: Atributo; sigla: string; nome: string }[] = [
  { slug: "forca", sigla: "FOR", nome: "Força" },
  { slug: "destreza", sigla: "DES", nome: "Destreza" },
  { slug: "constituicao", sigla: "CON", nome: "Constituição" },
  { slug: "sabedoria", sigla: "SAB", nome: "Sabedoria" },
  { slug: "vontade", sigla: "VON", nome: "Vontade" },
  { slug: "presenca", sigla: "PRE", nome: "Presença" },
];

// Slug = identificador estável usado em DB. Não traduz — em PT-BR sem acentos.
export type PericiaSlug =
  | "atletismo"
  | "acrobacia"
  | "furtividade"
  | "prestidigitacao"
  | "historia"
  | "investigacao"
  | "natureza"
  | "sobrevivencia"
  | "haki"
  | "intuicao"
  | "percepcao"
  | "sobrenatural"
  | "sorte"
  | "atuacao"
  | "enganacao"
  | "intimidacao"
  | "persuasao"
  | "provocacao";

export type Pericia = {
  slug: PericiaSlug;
  nome: string;
  atributo: Atributo;
};

// CON não tem perícia (livro do jogador, p. 76).
export const PERICIAS: Pericia[] = [
  { slug: "atletismo", nome: "Atletismo", atributo: "forca" },
  { slug: "acrobacia", nome: "Acrobacia", atributo: "destreza" },
  { slug: "furtividade", nome: "Furtividade", atributo: "destreza" },
  { slug: "prestidigitacao", nome: "Prestidigitação", atributo: "destreza" },
  { slug: "historia", nome: "História", atributo: "sabedoria" },
  { slug: "investigacao", nome: "Investigação", atributo: "sabedoria" },
  { slug: "natureza", nome: "Natureza", atributo: "sabedoria" },
  { slug: "sobrevivencia", nome: "Sobrevivência", atributo: "sabedoria" },
  { slug: "haki", nome: "Haki", atributo: "vontade" },
  { slug: "intuicao", nome: "Intuição", atributo: "vontade" },
  { slug: "percepcao", nome: "Percepção", atributo: "vontade" },
  { slug: "sobrenatural", nome: "Sobrenatural", atributo: "vontade" },
  { slug: "sorte", nome: "Sorte", atributo: "vontade" },
  { slug: "atuacao", nome: "Atuação", atributo: "presenca" },
  { slug: "enganacao", nome: "Enganação", atributo: "presenca" },
  { slug: "intimidacao", nome: "Intimidação", atributo: "presenca" },
  { slug: "persuasao", nome: "Persuasão", atributo: "presenca" },
  { slug: "provocacao", nome: "Provocação", atributo: "presenca" },
];

// ─── Proficiências (estrutura armazenada em Personagem.proficiencias) ─

export type Proficiencias = {
  pericias: PericiaSlug[];
  periciasDobradas: PericiaSlug[];
  salvaguardas: Atributo[];
  // Bônus extra por perícia/salvaguarda (item, característica, etc).
  // Independe de proficiência — persiste mesmo se desligar a proficiência.
  outrosPericias: Partial<Record<PericiaSlug, number>>;
  outrosSalvaguardas: Partial<Record<Atributo, number>>;
};

// Lê proficiencias do Json do banco, com defaults. Aceita unknown porque o
// Json pode vir corrompido/legado.
export function lerProficiencias(raw: unknown): Proficiencias {
  const obj = (raw ?? {}) as Partial<Proficiencias>;
  return {
    pericias: Array.isArray(obj.pericias) ? (obj.pericias as PericiaSlug[]) : [],
    periciasDobradas: Array.isArray(obj.periciasDobradas)
      ? (obj.periciasDobradas as PericiaSlug[])
      : [],
    salvaguardas: Array.isArray(obj.salvaguardas)
      ? (obj.salvaguardas as Atributo[])
      : [],
    outrosPericias:
      obj.outrosPericias && typeof obj.outrosPericias === "object"
        ? (obj.outrosPericias as Partial<Record<PericiaSlug, number>>)
        : {},
    outrosSalvaguardas:
      obj.outrosSalvaguardas && typeof obj.outrosSalvaguardas === "object"
        ? (obj.outrosSalvaguardas as Partial<Record<Atributo, number>>)
        : {},
  };
}

// Bônus total de uma perícia: mod_atributo + (proficiente ? bonus_prof : 0) * (dobrado ? 2 : 1) + outros.
// Dobro de zero = zero (não-proficiente com flag "dobrado" ainda dá 0).
export function bonusPericia(opts: {
  pericia: Pericia;
  valorAtributo: number;
  nivel: number;
  proficiente: boolean;
  dobrado: boolean;
  outros?: number;
}): number {
  const mod = modificador(opts.valorAtributo);
  const extra = opts.outros ?? 0;
  if (!opts.proficiente) return mod + extra;
  const prof = bonusProficiencia(opts.nivel) * (opts.dobrado ? 2 : 1);
  return mod + prof + extra;
}

// Bônus total de uma salvaguarda.
export function bonusSalvaguarda(opts: {
  valorAtributo: number;
  nivel: number;
  proficiente: boolean;
  outros?: number;
}): number {
  const mod = modificador(opts.valorAtributo);
  const extra = opts.outros ?? 0;
  return opts.proficiente ? mod + bonusProficiencia(opts.nivel) + extra : mod + extra;
}

// ─── Progressão de nível (PE) ─────────────────────────────────────────

// PE acumulados pra entrar em cada nível (índice = nível-1).
// Fonte: 01-core-rules.md.
export const PE_POR_NIVEL: number[] = [
  0, 300, 900, 2_700, 6_500, 14_000, 23_000, 34_000, 48_000, 64_000,
  85_000, 100_000, 120_000, 140_000, 165_000, 195_000, 225_000, 265_000, 305_000, 355_000,
];

// Retorna nível atual + PE pro próximo + PE base do nível atual.
export function progresso(pe: number) {
  const nivel = Math.max(
    1,
    PE_POR_NIVEL.reduce((acc, marco, i) => (pe >= marco ? i + 1 : acc), 1),
  );
  const peBase = PE_POR_NIVEL[nivel - 1] ?? 0;
  const peProximo = PE_POR_NIVEL[nivel] ?? null; // null = nível 20+
  return { nivel, peBase, peProximo };
}

// ─── Armas: categorias e propriedades ────────────────────────────────

// Categoria oficial do livro (cap. 8). Define como técnicas/estilos
// interagem com a arma (ex: Espadachim exige Cortante; Marcial conta
// como ataque desarmado).
export type CategoriaArma = "cortante" | "fogo" | "especial" | "marcial";

export const CATEGORIAS_ARMA: {
  slug: CategoriaArma;
  nome: string;
  icone: string;
}[] = [
  { slug: "cortante", nome: "Cortante", icone: "fa-khanda" },
  { slug: "fogo", nome: "De Fogo", icone: "fa-gun" },
  { slug: "especial", nome: "Especial", icone: "fa-star" },
  { slug: "marcial", nome: "Marcial", icone: "fa-hand-fist" },
];

// Eixo separado: define o cálculo padrão do atributo de ataque.
export type AlcanceArma = "corpo_a_corpo" | "distancia";

export const ALCANCES_ARMA: {
  slug: AlcanceArma;
  nome: string;
  icone: string;
}[] = [
  { slug: "corpo_a_corpo", nome: "Corpo a Corpo", icone: "fa-fist-raised" },
  { slug: "distancia", nome: "À Distância", icone: "fa-crosshairs" },
];

export type PropriedadeArma =
  | "acuidade"
  | "arremesso"
  | "duasMaos"
  | "versatil"
  | "municao"
  | "recarga"
  | "sutil"
  | "pesada"
  | "alcance"
  | "invencao"
  | "especial";

export const PROPRIEDADES_ARMA: {
  slug: PropriedadeArma;
  nome: string;
  icone: string; // classe FontAwesome (sem o "fa-" prefix)
  descricao: string;
}[] = [
  { slug: "acuidade", nome: "Acuidade", icone: "fa-bolt", descricao: "Em CC, pode usar DES no lugar de FOR." },
  { slug: "arremesso", nome: "Arremesso", icone: "fa-bullseye", descricao: "À distância, pode usar FOR no lugar de DES." },
  { slug: "duasMaos", nome: "Duas Mãos", icone: "fa-hands", descricao: "Exige duas mãos pra empunhar." },
  { slug: "versatil", nome: "Versátil", icone: "fa-shuffle", descricao: "1 ou 2 mãos (dano alternativo)." },
  { slug: "municao", nome: "Munição", icone: "fa-circle", descricao: "Requer munição pra atacar." },
  { slug: "recarga", nome: "Recarga", icone: "fa-rotate", descricao: "Só 1 ataque por turno (recarrega ação)." },
  { slug: "sutil", nome: "Sutil", icone: "fa-feather", descricao: "Leve e fácil de ocultar." },
  { slug: "pesada", nome: "Pesada", icone: "fa-weight-hanging", descricao: "Desvantagem pra criaturas Pequenas." },
  { slug: "alcance", nome: "Alcance", icone: "fa-ruler-horizontal", descricao: "CC com 3m de alcance." },
  { slug: "invencao", nome: "Invenção", icone: "fa-microchip", descricao: "Tecnologia — ataque/dano usa SAB." },
  { slug: "especial", nome: "Especial", icone: "fa-star", descricao: "Regras próprias na descrição." },
];

// Atributos que podem ser usados no ataque da arma. A regra:
// cc + invenção         → [SAB]
// cc + acuidade         → [FOR, DES]   ← jogador (ou auto) escolhe o melhor
// cc                    → [FOR]
// distância + invenção  → [SAB]
// distância + arremesso → [DES, FOR]
// distância             → [DES]
export function atributosCandidatos(
  alcance: AlcanceArma,
  propriedades: PropriedadeArma[],
): Atributo[] {
  const tem = (p: PropriedadeArma) => propriedades.includes(p);
  if (tem("invencao")) return ["sabedoria"];
  if (alcance === "corpo_a_corpo") {
    return tem("acuidade") ? ["forca", "destreza"] : ["forca"];
  }
  return tem("arremesso") ? ["destreza", "forca"] : ["destreza"];
}

// Dado um conjunto de atributos candidatos, retorna o que tem o maior modificador.
export function melhorAtributo(
  candidatos: Atributo[],
  atributos: Record<Atributo, number>,
): Atributo | null {
  if (candidatos.length === 0) return null;
  let melhor = candidatos[0];
  for (const c of candidatos) {
    if (modificador(atributos[c]) > modificador(atributos[melhor])) melhor = c;
  }
  return melhor;
}

// Bônus de ataque com arma. Retorna o atributo escolhido + o bônus total
// (mod_atributo + bônus de proficiência se proficiente + modificador da arma).
export function bonusAtaqueArma(opts: {
  alcance: AlcanceArma;
  propriedades: PropriedadeArma[];
  atributoOverride: Atributo | null; // se setado, ignora a regra
  atributos: Record<Atributo, number>;
  nivel: number;
  modificadorArma: number;
  proficiente: boolean;
}): { atributo: Atributo; bonus: number } | null {
  let atributo: Atributo | null = null;
  if (opts.atributoOverride) {
    atributo = opts.atributoOverride;
  } else {
    const candidatos = atributosCandidatos(opts.alcance, opts.propriedades);
    atributo = melhorAtributo(candidatos, opts.atributos);
  }
  if (!atributo) return null;
  const mod = modificador(opts.atributos[atributo]);
  const prof = opts.proficiente ? bonusProficiencia(opts.nivel) : 0;
  return { atributo, bonus: mod + prof + opts.modificadorArma };
}

// ─── Técnicas / Ações ─────────────────────────────────────────────────

// CD de uma técnica/salvaguarda forçada = 8 + bônus_prof + mod_atributo_primário.
export function cdTecnica(opts: {
  nivel: number;
  valorAtributoPrim: number;
}): number {
  return 8 + bonusProficiencia(opts.nivel) + modificador(opts.valorAtributoPrim);
}

// Bônus de ataque de técnica = bônus_prof + mod_atributo.
export function bonusAtaqueTecnica(opts: {
  nivel: number;
  valorAtributo: number;
}): number {
  return bonusProficiencia(opts.nivel) + modificador(opts.valorAtributo);
}

// ─── Exaustão ─────────────────────────────────────────────────────────

// Efeitos por nível (D&D 5e padrão; OP RPG segue a mesma tabela).
export const EXAUSTAO_EFEITOS: { nivel: number; efeito: string }[] = [
  { nivel: 1, efeito: "Desvantagem em testes de atributo." },
  { nivel: 2, efeito: "Deslocamento reduzido pela metade." },
  { nivel: 3, efeito: "Desvantagem em ataques e salvaguardas." },
  { nivel: 4, efeito: "PV máximo reduzido pela metade." },
  { nivel: 5, efeito: "Deslocamento reduzido a 0." },
  { nivel: 6, efeito: "Morte." },
];

// ─── Habilidades — taxonomia de origens, tipos e efeitos ─────────────

export type OrigemHabilidade =
  | "profissao"
  | "estilo"
  | "haki"
  | "especie"
  | "akumaNoMi"
  | "treinamento"
  | "livre";

export const ORIGENS_HABILIDADE: {
  slug: OrigemHabilidade;
  nome: string;
  icone: string;
  cor: string;
}[] = [
  { slug: "profissao", nome: "Profissão", icone: "fa-briefcase", cor: "var(--color-padrao)" },
  { slug: "estilo", nome: "Estilo de Combate", icone: "fa-fist-raised", cor: "var(--color-power)" },
  { slug: "haki", nome: "Haki", icone: "fa-eye", cor: "var(--color-react)" },
  { slug: "especie", nome: "Espécie", icone: "fa-paw", cor: "var(--color-bonus)" },
  { slug: "akumaNoMi", nome: "Akuma no Mi", icone: "fa-apple-whole", cor: "var(--primary)" },
  { slug: "treinamento", nome: "Treinamento", icone: "fa-dumbbell", cor: "var(--color-padrao)" },
  { slug: "livre", nome: "Livre", icone: "fa-star", cor: "var(--text-sec)" },
];

export type TipoHabilidade = "passiva" | "ativa" | "reativa" | "livre";

export const TIPOS_HABILIDADE: {
  slug: TipoHabilidade;
  nome: string;
  icone: string;
  cor: string;
}[] = [
  { slug: "passiva", nome: "Passiva", icone: "fa-circle-dot", cor: "var(--color-padrao)" },
  { slug: "ativa", nome: "Ativa", icone: "fa-bolt", cor: "var(--color-power)" },
  { slug: "reativa", nome: "Reativa", icone: "fa-shield-alt", cor: "var(--color-react)" },
  { slug: "livre", nome: "Livre", icone: "fa-feather", cor: "var(--text-sec)" },
];

export type RecargaHabilidade =
  | "descansoCurto"
  | "descansoLongo"
  | "encontro"
  | "manual";

export const RECARGAS_HABILIDADE: { slug: RecargaHabilidade; nome: string }[] = [
  { slug: "descansoCurto", nome: "Descanso Curto" },
  { slug: "descansoLongo", nome: "Descanso Longo" },
  { slug: "encontro", nome: "Por Encontro" },
  { slug: "manual", nome: "Manual" },
];

// 22 tipos de efeito. Estruturados ao máximo possível pra automação
// conseguir aplicar diretamente em cálculos (perícias, salvaguardas, CR,
// crítico expandido, reroll, floor de d20, etc). Slugs ficam estáveis no
// banco; rótulos podem evoluir.
export type TipoEfeito =
  | "modificador"
  | "vantagem"
  | "desvantagem"
  | "proficiencia"
  | "recurso_delta"
  | "cura"
  | "condicao_imune"
  | "condicao_remover"
  | "condicao_aplicar"
  | "resistencia"
  | "imunidade"
  | "deslocamento"
  | "multiplicador"
  | "rolagem"
  | "trigger"
  | "crit_range"
  | "reroll"
  | "floor_d20"
  | "sentido"
  | "acao_extra"
  | "sucesso_auto"
  | "livre";

export type EfeitoHabilidade =
  | { tipo: "modificador"; alvo: string; valor: number; quando?: string }
  | { tipo: "vantagem"; alvo: string; quando?: string }
  | { tipo: "desvantagem"; alvo: string; quando?: string }
  | { tipo: "proficiencia"; alvo: string; dobrada?: boolean }
  | { tipo: "recurso_delta"; recurso: string; valor: number }
  | { tipo: "cura"; valor: string; alvoCura?: string }
  | { tipo: "condicao_imune"; condicao: string }
  | { tipo: "condicao_remover"; condicao: string }
  | { tipo: "condicao_aplicar"; condicao: string; cd?: number; duracao?: string }
  | { tipo: "resistencia"; tipoDano: string }
  | { tipo: "imunidade"; tipoDano: string }
  | { tipo: "deslocamento"; tipoMov: string; valor: number }
  | { tipo: "multiplicador"; alvo: string; fator: number }
  | { tipo: "rolagem"; formula: string; quando?: string }
  | { tipo: "trigger"; gatilho: string; efeito: string }
  // Faixa de crítico expandida (19-20, 18-20…). minimo = 19 significa
  // crítico em 19 e 20. Padrão sem efeito = 20.
  | { tipo: "crit_range"; minimo: number }
  // Permite rerrolar o resultado de uma jogada. gatilho identifica o
  // contexto (ataque, salvaguarda, teste); usos = vezes por descanso longo.
  | { tipo: "reroll"; gatilho: string; usos: number }
  // Floor no d20: resultados ≤ minimo são tratados como minimo.
  // Ex: minimo=10 ⇒ qualquer 1-10 vira 10.
  | { tipo: "floor_d20"; minimo: number }
  // Sentido especial (visão no escuro, sentir presença, percepção sísmica…).
  // alcance opcional em metros — 0 = sem alcance explícito (passivo).
  | { tipo: "sentido"; sentido: string; alcance: number }
  // Ação/ataque/reação adicional. quantidade default = 1.
  // gatilho descreve quando se aplica (ex: "no turno", "1× por descanso").
  | { tipo: "acao_extra"; acao: string; quantidade: number; gatilho?: string }
  // Sucesso automático numa categoria de teste. alvo é o tipo de jogada
  // (ex: "concentracao", "intuicao", "salv-vontade"); quando descreve a
  // condição opcional.
  | { tipo: "sucesso_auto"; alvo: string; quando?: string }
  | { tipo: "livre"; texto: string };

export const META_EFEITOS: Record<
  TipoEfeito,
  { nome: string; icone: string; cor: string }
> = {
  modificador:      { nome: "Modificador",       icone: "fa-plus-minus",     cor: "var(--primary)" },
  vantagem:         { nome: "Vantagem",          icone: "fa-arrow-up",       cor: "var(--color-bonus)" },
  desvantagem:      { nome: "Desvantagem",       icone: "fa-arrow-down",     cor: "#e74c3c" },
  proficiencia:     { nome: "Proficiência",      icone: "fa-check-double",   cor: "var(--color-power)" },
  recurso_delta:    { nome: "Recurso",           icone: "fa-droplet",        cor: "var(--color-bonus)" },
  cura:             { nome: "Cura",              icone: "fa-heart",          cor: "#27ae60" },
  condicao_imune:   { nome: "Imune a",           icone: "fa-shield",         cor: "var(--color-react)" },
  condicao_remover: { nome: "Remove",            icone: "fa-broom",          cor: "var(--color-bonus)" },
  condicao_aplicar: { nome: "Aplica",            icone: "fa-bolt",           cor: "var(--color-power)" },
  resistencia:      { nome: "Resistência",       icone: "fa-shield-halved",  cor: "var(--color-react)" },
  imunidade:        { nome: "Imunidade",         icone: "fa-shield",         cor: "var(--color-react)" },
  deslocamento:     { nome: "Deslocamento",      icone: "fa-person-running", cor: "var(--primary)" },
  multiplicador:    { nome: "Multiplica",        icone: "fa-xmark",          cor: "var(--color-power)" },
  rolagem:          { nome: "Rolagem",           icone: "fa-dice",           cor: "var(--primary)" },
  trigger:          { nome: "Gatilho",           icone: "fa-bell",           cor: "var(--color-power)" },
  crit_range:       { nome: "Crítico Expandido", icone: "fa-burst",          cor: "var(--color-power)" },
  reroll:           { nome: "Rolar de novo",     icone: "fa-rotate",         cor: "var(--color-bonus)" },
  floor_d20:        { nome: "Mínimo no d20",     icone: "fa-circle-up",      cor: "var(--primary)" },
  sentido:          { nome: "Sentido",            icone: "fa-eye",            cor: "var(--color-react)" },
  acao_extra:       { nome: "Ação Extra",         icone: "fa-forward",        cor: "var(--color-power)" },
  sucesso_auto:     { nome: "Sucesso Auto",       icone: "fa-check",          cor: "var(--color-bonus)" },
  livre:            { nome: "Livre",             icone: "fa-feather",        cor: "var(--text-sec)" },
};

// Presets em linguagem natural pro picker do modal. Cada preset cria um
// EfeitoHabilidade pré-configurado pro caso comum daquele frasema. O usuário
// pensa "PV Temporário", não "modificador alvo=hp-temp".
export type PresetEfeito = {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  cor: string;
  grupo: "ajuste" | "buff" | "defesa" | "condicao" | "ativo" | "movimento" | "avancado";
  criar: () => EfeitoHabilidade;
};

export const PRESETS_EFEITO: PresetEfeito[] = [
  // ─ Ajuste numérico ─
  {
    id: "pv_temp",
    nome: "PV Temporário",
    descricao: "Concede pontos de vida temporários",
    icone: "fa-shield-heart",
    cor: "var(--color-bonus)",
    grupo: "ajuste",
    criar: () => ({ tipo: "modificador", alvo: "hp-temp", valor: 0 }),
  },
  {
    id: "pv_max",
    nome: "PV Máximo",
    descricao: "Aumenta o teto de PV",
    icone: "fa-heart-pulse",
    cor: "#e74c3c",
    grupo: "ajuste",
    criar: () => ({ tipo: "modificador", alvo: "hp-max", valor: 0 }),
  },
  {
    id: "pp_max",
    nome: "PP Máximo",
    descricao: "Aumenta o teto de Pontos de Poder",
    icone: "fa-bolt",
    cor: "var(--color-power)",
    grupo: "ajuste",
    criar: () => ({ tipo: "modificador", alvo: "pp-max", valor: 0 }),
  },
  {
    id: "cura",
    nome: "Curar PV",
    descricao: "Recupera PV (fórmula ou valor fixo)",
    icone: "fa-heart",
    cor: "#27ae60",
    grupo: "ajuste",
    criar: () => ({ tipo: "cura", valor: "" }),
  },
  {
    id: "bonus",
    nome: "Bônus em…",
    descricao: "Bônus numérico (perícia, atributo, CR, ataque…)",
    icone: "fa-plus-minus",
    cor: "var(--primary)",
    grupo: "ajuste",
    criar: () => ({ tipo: "modificador", alvo: "", valor: 0 }),
  },
  {
    id: "multiplicador",
    nome: "Multiplica…",
    descricao: "Dobra capacidade de carga, etc",
    icone: "fa-xmark",
    cor: "var(--color-power)",
    grupo: "ajuste",
    criar: () => ({ tipo: "multiplicador", alvo: "", fator: 2 }),
  },
  // ─ Buff / Debuff ─
  {
    id: "vantagem",
    nome: "Vantagem em…",
    descricao: "Vantagem em um tipo de teste",
    icone: "fa-arrow-up",
    cor: "var(--color-bonus)",
    grupo: "buff",
    criar: () => ({ tipo: "vantagem", alvo: "" }),
  },
  {
    id: "desvantagem",
    nome: "Desvantagem em…",
    descricao: "Desvantagem em um tipo de teste",
    icone: "fa-arrow-down",
    cor: "#e74c3c",
    grupo: "buff",
    criar: () => ({ tipo: "desvantagem", alvo: "" }),
  },
  {
    id: "proficiencia",
    nome: "Proficiência em…",
    descricao: "Proficiência em perícia ou salvaguarda",
    icone: "fa-check-double",
    cor: "var(--color-power)",
    grupo: "buff",
    criar: () => ({ tipo: "proficiencia", alvo: "" }),
  },
  // ─ Defesa ─
  {
    id: "resistencia",
    nome: "Resistência a…",
    descricao: "Reduz dano de um tipo pela metade",
    icone: "fa-shield-halved",
    cor: "var(--color-react)",
    grupo: "defesa",
    criar: () => ({ tipo: "resistencia", tipoDano: "" }),
  },
  {
    id: "imunidade",
    nome: "Imune a…",
    descricao: "Imune a um tipo de dano",
    icone: "fa-shield",
    cor: "var(--color-react)",
    grupo: "defesa",
    criar: () => ({ tipo: "imunidade", tipoDano: "" }),
  },
  // ─ Condição ─
  {
    id: "condicao_imune",
    nome: "Imune à Condição",
    descricao: "Imune a envenenado, atordoado, etc",
    icone: "fa-virus-slash",
    cor: "var(--color-react)",
    grupo: "condicao",
    criar: () => ({ tipo: "condicao_imune", condicao: "" }),
  },
  {
    id: "condicao_remover",
    nome: "Remove Condição",
    descricao: "Encerra uma condição já ativa",
    icone: "fa-broom",
    cor: "var(--color-bonus)",
    grupo: "condicao",
    criar: () => ({ tipo: "condicao_remover", condicao: "" }),
  },
  {
    id: "condicao_aplicar",
    nome: "Aplica Condição",
    descricao: "Impõe condição (com CD de salvaguarda)",
    icone: "fa-bolt",
    cor: "var(--color-power)",
    grupo: "condicao",
    criar: () => ({ tipo: "condicao_aplicar", condicao: "" }),
  },
  // ─ Movimento ─
  {
    id: "deslocamento",
    nome: "Velocidade",
    descricao: "Velocidade extra (voar, nadar, escalar…)",
    icone: "fa-person-running",
    cor: "var(--primary)",
    grupo: "movimento",
    criar: () => ({ tipo: "deslocamento", tipoMov: "caminhar", valor: 0 }),
  },
  // ─ Ativo / Combate ─
  {
    id: "crit_range",
    nome: "Crítico Expandido",
    descricao: "Crítico em 19-20 ou mais amplo",
    icone: "fa-burst",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "crit_range", minimo: 19 }),
  },
  {
    id: "reroll",
    nome: "Rolar de Novo",
    descricao: "Re-rolar testes/ataques por descanso",
    icone: "fa-rotate",
    cor: "var(--color-bonus)",
    grupo: "ativo",
    criar: () => ({ tipo: "reroll", gatilho: "ataque", usos: 1 }),
  },
  {
    id: "floor_d20",
    nome: "Mínimo no d20",
    descricao: "Resultados baixos viram o piso (ex: ≤9 vira 10)",
    icone: "fa-circle-up",
    cor: "var(--primary)",
    grupo: "ativo",
    criar: () => ({ tipo: "floor_d20", minimo: 10 }),
  },
  {
    id: "recurso_delta",
    nome: "Ganha/Gasta Recurso",
    descricao: "Mexe num recurso customizado (PC, PN…)",
    icone: "fa-droplet",
    cor: "var(--color-bonus)",
    grupo: "ativo",
    criar: () => ({ tipo: "recurso_delta", recurso: "", valor: 0 }),
  },
  {
    id: "sentido",
    nome: "Sentido Especial",
    descricao: "Visão noturna, sentir presença, sonar…",
    icone: "fa-eye",
    cor: "var(--color-react)",
    grupo: "ativo",
    criar: () => ({ tipo: "sentido", sentido: "", alcance: 0 }),
  },
  {
    id: "acao_extra",
    nome: "Ação Extra",
    descricao: "1 ataque/ação/reação a mais por turno",
    icone: "fa-forward",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "acao_extra", acao: "ataque", quantidade: 1 }),
  },
  {
    id: "sucesso_auto",
    nome: "Sucesso Automático",
    descricao: "Passa sem rolar em algum teste/condição",
    icone: "fa-check",
    cor: "var(--color-bonus)",
    grupo: "buff",
    criar: () => ({ tipo: "sucesso_auto", alvo: "" }),
  },
  // ─ Avançado ─
  {
    id: "rolagem",
    nome: "Rolagem Extra",
    descricao: "Adiciona dados (ex: +1d4 dano)",
    icone: "fa-dice",
    cor: "var(--primary)",
    grupo: "avancado",
    criar: () => ({ tipo: "rolagem", formula: "" }),
  },
  {
    id: "trigger",
    nome: "Gatilho (Quando X, faz Y)",
    descricao: "Reage a uma situação específica",
    icone: "fa-bell",
    cor: "var(--color-power)",
    grupo: "avancado",
    criar: () => ({ tipo: "trigger", gatilho: "", efeito: "" }),
  },
  {
    id: "livre",
    nome: "Texto Livre",
    descricao: "Pra mecânicas que não dá pra automatizar",
    icone: "fa-feather",
    cor: "var(--text-sec)",
    grupo: "avancado",
    criar: () => ({ tipo: "livre", texto: "" }),
  },
];

export const GRUPOS_PRESET: { slug: PresetEfeito["grupo"]; nome: string }[] = [
  { slug: "ajuste", nome: "Números" },
  { slug: "buff", nome: "Vantagem / Desvantagem" },
  { slug: "defesa", nome: "Defesa" },
  { slug: "condicao", nome: "Condições" },
  { slug: "movimento", nome: "Movimento" },
  { slug: "ativo", nome: "Combate" },
  { slug: "avancado", nome: "Avançado" },
];

// Lê efeitos do Json do banco com defaults defensivos. Descarta entradas que
// não casam com nenhuma forma conhecida — UI nunca precisa lidar com lixo.
export function lerEfeitos(raw: unknown): EfeitoHabilidade[] {
  if (!Array.isArray(raw)) return [];
  const out: EfeitoHabilidade[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const t = obj.tipo;
    if (typeof t !== "string") continue;
    const e = normalizarEfeito(t as TipoEfeito, obj);
    if (e) out.push(e);
  }
  return out;
}

// Normaliza um único efeito vindo do form/banco. Retorna null se for inválido.
// Não joga erro — efeitos malformados são silenciosamente descartados pra que
// um efeito ruim não derrube a habilidade inteira.
export function normalizarEfeito(
  tipo: TipoEfeito,
  obj: Record<string, unknown>,
): EfeitoHabilidade | null {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0;
  switch (tipo) {
    case "modificador":
      if (!str(obj.alvo)) return null;
      return {
        tipo,
        alvo: str(obj.alvo),
        valor: Math.trunc(num(obj.valor)),
        ...(str(obj.quando) ? { quando: str(obj.quando) } : {}),
      };
    case "vantagem":
    case "desvantagem":
      if (!str(obj.alvo)) return null;
      return {
        tipo,
        alvo: str(obj.alvo),
        ...(str(obj.quando) ? { quando: str(obj.quando) } : {}),
      };
    case "proficiencia":
      if (!str(obj.alvo)) return null;
      return {
        tipo,
        alvo: str(obj.alvo),
        ...(obj.dobrada ? { dobrada: true } : {}),
      };
    case "recurso_delta":
      if (!str(obj.recurso)) return null;
      return {
        tipo,
        recurso: str(obj.recurso),
        valor: Math.trunc(num(obj.valor)),
      };
    case "cura":
      if (!str(obj.valor)) return null;
      return {
        tipo,
        valor: str(obj.valor),
        ...(str(obj.alvoCura) ? { alvoCura: str(obj.alvoCura) } : {}),
      };
    case "condicao_imune":
    case "condicao_remover":
      if (!str(obj.condicao)) return null;
      return { tipo, condicao: str(obj.condicao) };
    case "condicao_aplicar": {
      if (!str(obj.condicao)) return null;
      const e: EfeitoHabilidade = { tipo, condicao: str(obj.condicao) };
      if (typeof obj.cd === "number" && Number.isFinite(obj.cd)) e.cd = Math.trunc(obj.cd);
      if (str(obj.duracao)) e.duracao = str(obj.duracao);
      return e;
    }
    case "resistencia":
    case "imunidade":
      if (!str(obj.tipoDano)) return null;
      return { tipo, tipoDano: str(obj.tipoDano) };
    case "deslocamento":
      if (!str(obj.tipoMov)) return null;
      return { tipo, tipoMov: str(obj.tipoMov), valor: num(obj.valor) };
    case "multiplicador":
      if (!str(obj.alvo)) return null;
      return { tipo, alvo: str(obj.alvo), fator: num(obj.fator) };
    case "rolagem":
      if (!str(obj.formula)) return null;
      return {
        tipo,
        formula: str(obj.formula),
        ...(str(obj.quando) ? { quando: str(obj.quando) } : {}),
      };
    case "trigger":
      if (!str(obj.gatilho) && !str(obj.efeito)) return null;
      return { tipo, gatilho: str(obj.gatilho), efeito: str(obj.efeito) };
    case "crit_range": {
      const minimo = Math.trunc(num(obj.minimo));
      // Faixa válida: 2-20. Default 20 (sem efeito) se vier lixo.
      const clamp = Math.min(20, Math.max(2, minimo || 20));
      return { tipo, minimo: clamp };
    }
    case "reroll": {
      const gatilho = str(obj.gatilho) || "ataque";
      const usos = Math.max(1, Math.trunc(num(obj.usos)) || 1);
      return { tipo, gatilho, usos };
    }
    case "floor_d20": {
      const minimo = Math.trunc(num(obj.minimo));
      // Floor faz sentido entre 1 e 19. 0 = sem efeito.
      const clamp = Math.min(19, Math.max(0, minimo));
      return { tipo, minimo: clamp };
    }
    case "sentido": {
      const sentido = str(obj.sentido);
      if (!sentido) return null;
      return { tipo, sentido, alcance: Math.max(0, num(obj.alcance)) };
    }
    case "acao_extra": {
      const acao = str(obj.acao);
      if (!acao) return null;
      const qtd = Math.max(1, Math.trunc(num(obj.quantidade)) || 1);
      const e: EfeitoHabilidade = { tipo, acao, quantidade: qtd };
      if (str(obj.gatilho)) e.gatilho = str(obj.gatilho);
      return e;
    }
    case "sucesso_auto": {
      if (!str(obj.alvo)) return null;
      return {
        tipo,
        alvo: str(obj.alvo),
        ...(str(obj.quando) ? { quando: str(obj.quando) } : {}),
      };
    }
    case "livre":
      if (!str(obj.texto)) return null;
      return { tipo, texto: str(obj.texto) };
    default:
      return null;
  }
}

// ─── Alvos canônicos de efeito (slugs que a automação reconhece) ─────

// Slugs aceitos pelo `agregarEfeitos`. Alvos fora desta lista continuam
// salvos no banco mas são apenas descritivos (mostram no chip, não mexem
// em nenhum cálculo). Útil pra exibir como datalist no editor.
export const ALVOS_AGREGAVEIS: { slug: string; nome: string; grupo: string }[] = [
  ...PERICIAS.map((p) => ({ slug: p.slug, nome: p.nome, grupo: "Perícia" })),
  ...ATRIBUTOS.map((a) => ({
    slug: `salv-${a.slug}`,
    nome: `Salv. ${a.nome}`,
    grupo: "Salvaguarda",
  })),
  ...ATRIBUTOS.map((a) => ({ slug: a.slug, nome: a.nome, grupo: "Atributo" })),
  ...ATRIBUTOS.map((a) => ({
    slug: `teto-${a.slug}`,
    nome: `Teto ${a.nome}`,
    grupo: "Teto de Atributo",
  })),
  { slug: "cr", nome: "Classe de Resistência", grupo: "Derivado" },
  { slug: "iniciativa", nome: "Iniciativa", grupo: "Derivado" },
  { slug: "percepcao-passiva", nome: "Percepção Passiva", grupo: "Derivado" },
  { slug: "deslocamento", nome: "Deslocamento", grupo: "Derivado" },
  { slug: "carga", nome: "Capacidade de Carga", grupo: "Derivado" },
  { slug: "hp-max", nome: "PV Máximo", grupo: "Pool" },
  { slug: "hp-temp", nome: "PV Temporário", grupo: "Pool" },
  { slug: "pp-max", nome: "PP Máximo", grupo: "Pool" },
  { slug: "ataque", nome: "Ataque (geral)", grupo: "Combate" },
  { slug: "ataque-cc", nome: "Ataque CC", grupo: "Combate" },
  { slug: "ataque-distancia", nome: "Ataque à Distância", grupo: "Combate" },
  { slug: "dano", nome: "Dano (geral)", grupo: "Combate" },
  { slug: "dano-cc", nome: "Dano CC", grupo: "Combate" },
  { slug: "dano-distancia", nome: "Dano à Distância", grupo: "Combate" },
  { slug: "cd-tecnicas", nome: "CD das Técnicas", grupo: "Combate" },
];

const PERICIAS_SET = new Set<string>(PERICIAS.map((p) => p.slug));
const ATRIBUTOS_SET = new Set<string>(ATRIBUTOS.map((a) => a.slug));

type FonteValor = { valor: number; fontes: string[] };
type FonteLista = { fontes: string[] };

// Agregação de todos os efeitos `modificador` e `proficiencia` das habilidades
// do personagem. Resultado é "frio": pode ser calculado em qualquer momento
// a partir da lista de habilidades, sem estado interno.
export type EfeitosAgregados = {
  bonusPericia: Partial<Record<PericiaSlug, FonteValor>>;
  bonusSalvaguarda: Partial<Record<Atributo, FonteValor>>;
  bonusAtributo: Partial<Record<Atributo, FonteValor>>;
  // Bônus no teto do atributo (ex: Mente Afiada eleva teto de SAB pra 26).
  // Aplicação fica a cargo da UI que controla AVA; aqui é só consolidação.
  bonusTetoAtributo: Partial<Record<Atributo, FonteValor>>;
  proficienciasPericia: Partial<Record<PericiaSlug, FonteLista>>;
  proficienciasSalvaguarda: Partial<Record<Atributo, FonteLista>>;
  bonusCR: FonteValor;
  bonusIniciativa: FonteValor;
  bonusPercepcaoPassiva: FonteValor;
  bonusDeslocamento: FonteValor;
  bonusCarga: FonteValor;
  bonusHpMax: FonteValor;
  bonusHpTemp: FonteValor;
  bonusPpMax: FonteValor;
  bonusAtaque: FonteValor;
  bonusAtaqueCC: FonteValor;
  bonusAtaqueDistancia: FonteValor;
  bonusDano: FonteValor;
  bonusDanoCC: FonteValor;
  bonusDanoDistancia: FonteValor;
  bonusCdTecnicas: FonteValor;
  // Crítico expandido — menor "minimo" observado entre todas as habilidades.
  // 20 = sem efeito (crítico só no 20). 19 = crítico em 19-20. Etc.
  critRangeMinimo: FonteValor;
  // Floor no d20 — maior "minimo" observado. 0 = sem efeito.
  floorD20: FonteValor;
  // Rerrolagens por gatilho (ataque/salvaguarda/teste). Usos somam.
  rerolls: Partial<Record<string, FonteValor>>;
  // Sentidos especiais (visão escuro, sentir presença…). Indexado por nome
  // do sentido; o maior alcance vence.
  sentidos: Partial<Record<string, FonteValor>>;
};

function vazio(): EfeitosAgregados {
  return {
    bonusPericia: {},
    bonusSalvaguarda: {},
    bonusAtributo: {},
    bonusTetoAtributo: {},
    proficienciasPericia: {},
    proficienciasSalvaguarda: {},
    bonusCR: { valor: 0, fontes: [] },
    bonusIniciativa: { valor: 0, fontes: [] },
    bonusPercepcaoPassiva: { valor: 0, fontes: [] },
    bonusDeslocamento: { valor: 0, fontes: [] },
    bonusCarga: { valor: 0, fontes: [] },
    bonusHpMax: { valor: 0, fontes: [] },
    bonusHpTemp: { valor: 0, fontes: [] },
    bonusPpMax: { valor: 0, fontes: [] },
    bonusAtaque: { valor: 0, fontes: [] },
    bonusAtaqueCC: { valor: 0, fontes: [] },
    bonusAtaqueDistancia: { valor: 0, fontes: [] },
    bonusDano: { valor: 0, fontes: [] },
    bonusDanoCC: { valor: 0, fontes: [] },
    bonusDanoDistancia: { valor: 0, fontes: [] },
    bonusCdTecnicas: { valor: 0, fontes: [] },
    critRangeMinimo: { valor: 20, fontes: [] },
    floorD20: { valor: 0, fontes: [] },
    rerolls: {},
    sentidos: {},
  };
}

function somarFonteValor(
  bucket: Partial<Record<string, FonteValor>>,
  key: string,
  valor: number,
  fonte: string,
) {
  const atual = bucket[key] ?? { valor: 0, fontes: [] };
  atual.valor += valor;
  if (!atual.fontes.includes(fonte)) atual.fontes.push(fonte);
  bucket[key] = atual;
}

function adicionarFonteLista(
  bucket: Partial<Record<string, FonteLista>>,
  key: string,
  fonte: string,
) {
  const atual = bucket[key] ?? { fontes: [] };
  if (!atual.fontes.includes(fonte)) atual.fontes.push(fonte);
  bucket[key] = atual;
}

// Varre habilidades e aplica efeitos `modificador` e `proficiencia` nos
// alvos canônicos. Alvos não reconhecidos são ignorados silenciosamente.
export function agregarEfeitos(
  habilidades: { nome: string; efeitos: unknown }[],
): EfeitosAgregados {
  const out = vazio();
  for (const h of habilidades) {
    const efeitos = lerEfeitos(h.efeitos);
    for (const e of efeitos) {
      if (e.tipo === "modificador") {
        aplicarModificador(out, e.alvo, e.valor, h.nome);
      } else if (e.tipo === "proficiencia") {
        aplicarProficiencia(out, e.alvo, h.nome);
      } else if (e.tipo === "crit_range") {
        // Menor "minimo" vence (faixa mais ampla).
        if (e.minimo < out.critRangeMinimo.valor) out.critRangeMinimo.valor = e.minimo;
        if (!out.critRangeMinimo.fontes.includes(h.nome)) {
          out.critRangeMinimo.fontes.push(h.nome);
        }
      } else if (e.tipo === "floor_d20") {
        // Maior "minimo" vence (floor mais alto).
        if (e.minimo > out.floorD20.valor) out.floorD20.valor = e.minimo;
        if (!out.floorD20.fontes.includes(h.nome)) {
          out.floorD20.fontes.push(h.nome);
        }
      } else if (e.tipo === "reroll") {
        const atual = out.rerolls[e.gatilho] ?? { valor: 0, fontes: [] };
        atual.valor += e.usos;
        if (!atual.fontes.includes(h.nome)) atual.fontes.push(h.nome);
        out.rerolls[e.gatilho] = atual;
      } else if (e.tipo === "sentido") {
        const key = e.sentido.trim().toLowerCase();
        if (!key) continue;
        const atual = out.sentidos[key] ?? { valor: 0, fontes: [] };
        // Maior alcance vence (sentido mais potente).
        if (e.alcance > atual.valor) atual.valor = e.alcance;
        if (!atual.fontes.includes(h.nome)) atual.fontes.push(h.nome);
        out.sentidos[key] = atual;
      }
    }
  }
  return out;
}

// Aplica um único bônus num bucket FonteValor simples (não-indexado).
function somarBucketSimples(bucket: FonteValor, valor: number, fonte: string) {
  bucket.valor += valor;
  if (!bucket.fontes.includes(fonte)) bucket.fontes.push(fonte);
}

function aplicarModificador(
  out: EfeitosAgregados,
  alvoRaw: string,
  valor: number,
  fonte: string,
) {
  const alvo = alvoRaw.trim().toLowerCase();
  if (!alvo || !valor) return;
  if (PERICIAS_SET.has(alvo)) {
    somarFonteValor(out.bonusPericia, alvo, valor, fonte);
    return;
  }
  if (alvo.startsWith("salv-")) {
    const at = alvo.slice(5);
    if (ATRIBUTOS_SET.has(at)) {
      somarFonteValor(out.bonusSalvaguarda, at, valor, fonte);
    }
    return;
  }
  if (alvo.startsWith("teto-")) {
    const at = alvo.slice(5);
    if (ATRIBUTOS_SET.has(at)) {
      somarFonteValor(out.bonusTetoAtributo, at, valor, fonte);
    }
    return;
  }
  if (ATRIBUTOS_SET.has(alvo)) {
    somarFonteValor(out.bonusAtributo, alvo, valor, fonte);
    return;
  }
  // Derivados e pools — slug → bucket simples. Map evita switch gigante.
  const bucket = BUCKETS_SIMPLES[alvo];
  if (bucket) somarBucketSimples(bucket(out), valor, fonte);
}

// Cada slug aponta pro bucket FonteValor correspondente em EfeitosAgregados.
// Tolera variantes (com `-` ou `_`) pra UX mais permissiva no datalist.
const BUCKETS_SIMPLES: Record<string, (o: EfeitosAgregados) => FonteValor> = {
  cr: (o) => o.bonusCR,
  iniciativa: (o) => o.bonusIniciativa,
  "percepcao-passiva": (o) => o.bonusPercepcaoPassiva,
  "percepcao_passiva": (o) => o.bonusPercepcaoPassiva,
  deslocamento: (o) => o.bonusDeslocamento,
  carga: (o) => o.bonusCarga,
  "hp-max": (o) => o.bonusHpMax,
  hpmax: (o) => o.bonusHpMax,
  "hp-temp": (o) => o.bonusHpTemp,
  hptemp: (o) => o.bonusHpTemp,
  "pp-max": (o) => o.bonusPpMax,
  ppmax: (o) => o.bonusPpMax,
  ataque: (o) => o.bonusAtaque,
  "ataque-cc": (o) => o.bonusAtaqueCC,
  "ataque-distancia": (o) => o.bonusAtaqueDistancia,
  dano: (o) => o.bonusDano,
  "dano-cc": (o) => o.bonusDanoCC,
  "dano-distancia": (o) => o.bonusDanoDistancia,
  "cd-tecnicas": (o) => o.bonusCdTecnicas,
  cd_tecnicas: (o) => o.bonusCdTecnicas,
};

function aplicarProficiencia(
  out: EfeitosAgregados,
  alvoRaw: string,
  fonte: string,
) {
  const alvo = alvoRaw.trim().toLowerCase();
  if (!alvo) return;
  if (PERICIAS_SET.has(alvo)) {
    adicionarFonteLista(out.proficienciasPericia, alvo, fonte);
    return;
  }
  if (alvo.startsWith("salv-")) {
    const at = alvo.slice(5);
    if (ATRIBUTOS_SET.has(at)) {
      adicionarFonteLista(out.proficienciasSalvaguarda, at, fonte);
    }
  }
}

// Resumo curto pra exibir dentro do chip do efeito na listagem.
export function resumoEfeito(e: EfeitoHabilidade): string {
  switch (e.tipo) {
    case "modificador":
      return `${formatarMod(e.valor)} ${e.alvo}`;
    case "vantagem":
    case "desvantagem":
      return e.alvo;
    case "proficiencia":
      return `${e.alvo}${e.dobrada ? " (2×)" : ""}`;
    case "recurso_delta":
      return `${formatarMod(e.valor)} ${e.recurso}`;
    case "cura":
      return e.valor;
    case "condicao_imune":
    case "condicao_remover":
      return e.condicao;
    case "condicao_aplicar":
      return e.cd ? `${e.condicao} (CD ${e.cd})` : e.condicao;
    case "resistencia":
    case "imunidade":
      return e.tipoDano;
    case "deslocamento":
      return `${e.tipoMov} ${e.valor}m`;
    case "multiplicador":
      return `${e.alvo} ×${e.fator}`;
    case "rolagem":
      return e.formula;
    case "trigger":
      return e.gatilho || e.efeito;
    case "crit_range":
      return `${e.minimo}-20`;
    case "reroll":
      return `${e.usos}× ${e.gatilho}`;
    case "floor_d20":
      return `≤${e.minimo} ⇒ ${e.minimo}`;
    case "sentido":
      return e.alcance > 0 ? `${e.sentido} ${e.alcance}m` : e.sentido;
    case "acao_extra":
      return e.quantidade > 1 ? `${e.quantidade}× ${e.acao}` : e.acao;
    case "sucesso_auto":
      return e.alvo;
    case "livre":
      return e.texto;
  }
}
