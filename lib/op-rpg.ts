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
  // Progressão padrão D&D 5e: +2 + ⌊(nível−1)/4⌋ (sobe a cada 4 níveis a
  // partir do 5). Faixas: 1–4 +2, 5–8 +3, 9–12 +4, 13–16 +5, 17–20 +6.
  if (nivel >= 17) return 6;
  if (nivel >= 13) return 5;
  if (nivel >= 9) return 4;
  if (nivel >= 5) return 3;
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

const SIGLA_PARA_SLUG: Record<string, Atributo> = {
  FOR: "forca",
  DES: "destreza",
  CON: "constituicao",
  SAB: "sabedoria",
  VON: "vontade",
  PRE: "presenca",
};

// Resolve siglas de atributo (FOR, DES, CON…) numa fórmula livre pro modificador
// somado dos modificadores correspondentes. Complementa `parseFormulaDados` (que
// cuida de dados + constantes numéricas e ignora palavras): aqui pegamos só os
// termos de atributo, pra empilhar uma rolagem tipo "1d8+CON" já resolvida.
// Só siglas MAIÚSCULAS casam (convenção da ficha) — evita falso positivo com
// palavras tipo "concentração". `usados` alimenta tooltip ("CON +3").
export function resolverAtributosNaFormula(
  expr: string,
  atributos: Record<Atributo, number>,
): { modificador: number; usados: { sigla: string; mod: number }[] } {
  const usados: { sigla: string; mod: number }[] = [];
  let total = 0;
  if (!expr) return { modificador: 0, usados };
  const re = /([+-]?)\s*\b(FOR|DES|CON|SAB|VON|PRE)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr))) {
    const sinal = m[1] === "-" ? -1 : 1;
    const sigla = m[2];
    const mod = sinal * modificador(atributos[SIGLA_PARA_SLUG[sigla]]);
    total += mod;
    usados.push({ sigla, mod });
  }
  return { modificador: total, usados };
}

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

// ─── Perícias customizadas ────────────────────────────────────────────
// Perícias fora do set fixo (Profissão, homebrew). Vivem em linhas próprias
// (tabela pericias_custom), não no Json de proficiências.
const PERICIAS_BUILTIN_SLUGS = new Set<string>(PERICIAS.map((p) => p.slug));

// Deriva um slug estável a partir do nome: sem acentos, minúsculo, só [a-z0-9-].
// `existentes` evita colisão com slugs já usados (built-in ou outras custom):
// na colisão, sufixa -2, -3… Usado ao criar uma perícia custom.
export function slugPericiaCustom(nome: string, existentes: Set<string> = new Set()): string {
  const base =
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // remove diacríticos
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "pericia";
  const reservados = new Set([...PERICIAS_BUILTIN_SLUGS, ...existentes]);
  if (!reservados.has(base)) return base;
  let i = 2;
  while (reservados.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

// Entradas de datalist/select pra perícias customizadas, no mesmo formato dos
// ALVOS_* canônicos. O editor de habilidades concatena estas às listas fixas pra
// que o usuário escolha uma perícia custom como alvo de modificador/proficiência/
// vantagem (em vez de digitar o slug na mão).
export function alvosPericiaCustom(
  periciasCustom: { slug: string; nome: string }[],
): { slug: string; nome: string; grupo: string }[] {
  return periciasCustom.map((p) => ({
    slug: p.slug,
    nome: p.nome,
    grupo: "Perícia (custom)",
  }));
}

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

// Lê propriedades cruas (Json do banco) filtrando pros slugs canônicos.
export function lerPropriedadesArma(raw: unknown): PropriedadeArma[] {
  if (!Array.isArray(raw)) return [];
  const validas = new Set(PROPRIEDADES_ARMA.map((p) => p.slug));
  return raw.filter(
    (p): p is PropriedadeArma =>
      typeof p === "string" && validas.has(p as PropriedadeArma),
  );
}

const ALCANCES_ARMA_VALIDOS = new Set<string>(ALCANCES_ARMA.map((a) => a.slug));

// Resolve o ataque de uma arma "ao vivo" a partir dos campos crus do Item:
// atributo escolhido + bônus total (mod + prof + modificador da arma + bônus de
// habilidade do alcance) + as fontes desse extra + alcance normalizado. Usado
// pelo card do inventário e por Ações ligadas a uma arma (ex: Seiken na arma
// marcial equipada), garantindo o mesmo cálculo nos dois lugares.
export function resolverAtaqueArma(opts: {
  alcanceRaw: string;
  propriedadesRaw: unknown;
  atributoOverride: string | null;
  modificadorArma: number;
  proficiente: boolean;
  atributos: Record<Atributo, number>;
  nivel: number;
  efeitosAgregados: EfeitosAgregados;
}): { atributo: Atributo; bonus: number; fontes: string[]; alcance: AlcanceArma } | null {
  const alcance: AlcanceArma = ALCANCES_ARMA_VALIDOS.has(opts.alcanceRaw)
    ? (opts.alcanceRaw as AlcanceArma)
    : "corpo_a_corpo";
  const base = bonusAtaqueArma({
    alcance,
    propriedades: lerPropriedadesArma(opts.propriedadesRaw),
    atributoOverride: (opts.atributoOverride as Atributo | null) || null,
    atributos: opts.atributos,
    nivel: opts.nivel,
    modificadorArma: opts.modificadorArma,
    proficiente: opts.proficiente,
  });
  if (!base) return null;
  // Bônus de habilidade: genérico (Ataque) + específico do alcance.
  const generico = opts.efeitosAgregados.bonusAtaque;
  const doAlcance =
    alcance === "corpo_a_corpo"
      ? opts.efeitosAgregados.bonusAtaqueCC
      : opts.efeitosAgregados.bonusAtaqueDistancia;
  const fontes = [
    ...generico.fontes,
    ...doAlcance.fontes.filter((f) => !generico.fontes.includes(f)),
  ];
  return {
    atributo: base.atributo,
    bonus: base.bonus + generico.valor + doAlcance.valor,
    fontes,
    alcance,
  };
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

// Efeitos por nível — regra OP RPG (v1.5.7), NÃO a do D&D 5e. A exaustão é
// acumulativa (1–6); cada nível aplica DOIS efeitos cumulativos:
//   • d20: resultado de qualquer teste com d20 reduzido em −2 × nível.
//   • Deslocamento: reduzido em −1,5 m × nível.
// Nível 6 = desmaio. Sai 1 nível por descanso longo.
export const EXAUSTAO_EFEITOS: {
  nivel: number;
  d20: number; // penalidade no resultado do d20 (negativa)
  deslocamento: number; // redução de deslocamento em metros (negativa)
  desmaio?: boolean;
}[] = [
  { nivel: 1, d20: -2, deslocamento: -1.5 },
  { nivel: 2, d20: -4, deslocamento: -3 },
  { nivel: 3, d20: -6, deslocamento: -4.5 },
  { nivel: 4, d20: -8, deslocamento: -6 },
  { nivel: 5, d20: -10, deslocamento: -7.5 },
  { nivel: 6, d20: -10, deslocamento: -9, desmaio: true },
];

// Deslocamento efetivo em metros: (base + bônus de habilidade) − 1,5 m por
// nível de exaustão (regra OP RPG). Nível 6 = desmaio → 0. Nunca negativo.
export function deslocamentoEfetivo(
  base: number,
  bonus: number,
  exaustao: number,
): number {
  const bruto = Math.max(0, base + bonus);
  if (exaustao >= 6) return 0;
  return Math.max(0, bruto - 1.5 * Math.max(0, exaustao));
}

// Penalidade em testes de d20 por exaustão (regra OP RPG): −2 × nível, somada
// ao resultado de qualquer teste que use d20. Retorna valor ≥ 0 (quem consome
// subtrai). Nível 6 é desmaio — mantém −10 caso ainda role.
export function penalidadeD20Exaustao(exaustao: number): number {
  return Math.max(0, Math.min(5, exaustao)) * 2;
}

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
  | "substituir_atributo"
  | "rolagem"
  | "trigger"
  | "crit_range"
  | "reroll"
  | "floor_d20"
  | "sentido"
  | "acao_extra"
  | "sucesso_auto"
  | "dano_min"
  | "alcance"
  | "ignora"
  | "trocar_dano"
  | "crit_imune"
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
  // Faz um cálculo derivado (CR, iniciativa, salvaguarda, perícia) usar outro
  // atributo no lugar do padrão. Ex: "Revestimento Interno" → CR usa Força.
  | { tipo: "substituir_atributo"; alvo: string; atributo: Atributo }
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
  // Piso de dano: garante metade do dano MÁXIMO da fórmula rolada (arredonda
  // pra cima). Ex: "Preparação pra Batalha". Sem parâmetro — o piso depende da
  // fórmula, calculado no Rolador. `quando` é descritivo opcional.
  | { tipo: "dano_min"; quando?: string }
  // Soma metros ao alcance de uma arma. DESCRITIVO: anota a fonte no chip de
  // ataque (não há campo numérico de alcance — `Item.alcanceMetros` é texto livre).
  | { tipo: "alcance"; valor: number; quando?: string }
  // Ignora uma defesa do alvo (resistência, imunidade, reação, cobertura).
  // Informativo: anota no chip de ataque/dano. `alvo` = o que ignora.
  | { tipo: "ignora"; alvo: string }
  // Substitui o tipo de dano (ex: Destruição Interna → Verdadeiro; Haki Ígneo →
  // Fogo). Informativo: anota no chip de dano.
  | { tipo: "trocar_dano"; tipoDano: string }
  // Imune a acerto crítico (defensivo). Descritivo no card; passiva na sidebar
  // fica pra etapa 4 (junto de resistências/imunidades).
  | { tipo: "crit_imune" }
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
  substituir_atributo: { nome: "Trocar Atributo", icone: "fa-right-left",    cor: "var(--primary)" },
  rolagem:          { nome: "Rolagem",           icone: "fa-dice",           cor: "var(--primary)" },
  trigger:          { nome: "Gatilho",           icone: "fa-bell",           cor: "var(--color-power)" },
  crit_range:       { nome: "Crítico Expandido", icone: "fa-burst",          cor: "var(--color-power)" },
  reroll:           { nome: "Rolar de novo",     icone: "fa-rotate",         cor: "var(--color-bonus)" },
  floor_d20:        { nome: "Mínimo no d20",     icone: "fa-circle-up",      cor: "var(--primary)" },
  sentido:          { nome: "Sentido",            icone: "fa-eye",            cor: "var(--color-react)" },
  acao_extra:       { nome: "Ação Extra",         icone: "fa-forward",        cor: "var(--color-power)" },
  sucesso_auto:     { nome: "Sucesso Auto",       icone: "fa-check",          cor: "var(--color-bonus)" },
  dano_min:         { nome: "Piso de Dano",       icone: "fa-shield-halved",  cor: "var(--color-power)" },
  alcance:          { nome: "Alcance Extra",      icone: "fa-ruler-horizontal", cor: "var(--primary)" },
  ignora:           { nome: "Ignora Defesa",      icone: "fa-bolt-lightning", cor: "var(--color-power)" },
  trocar_dano:      { nome: "Troca Tipo de Dano", icone: "fa-fire",           cor: "var(--color-power)" },
  crit_imune:       { nome: "Imune a Crítico",    icone: "fa-shield",         cor: "var(--color-react)" },
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
    descricao: "Aumenta o limite de PV",
    icone: "fa-heart-pulse",
    cor: "#e74c3c",
    grupo: "ajuste",
    criar: () => ({ tipo: "modificador", alvo: "hp-max", valor: 0 }),
  },
  {
    id: "pp_max",
    nome: "PP Máximo",
    descricao: "Aumenta o limite de Pontos de Poder",
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
  {
    id: "substituir_atributo",
    nome: "Trocar atributo de…",
    descricao: "CR, iniciativa ou teste usa outro atributo (ex: CR via FOR)",
    icone: "fa-right-left",
    cor: "var(--primary)",
    grupo: "avancado",
    criar: () => ({ tipo: "substituir_atributo", alvo: "", atributo: "forca" }),
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
  {
    id: "dano_min",
    nome: "Piso de Dano",
    descricao: "Garante metade do dano máximo da rolagem",
    icone: "fa-shield-halved",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "dano_min" }),
  },
  {
    id: "alcance",
    nome: "Alcance Extra",
    descricao: "Soma metros ao alcance de uma arma",
    icone: "fa-ruler-horizontal",
    cor: "var(--primary)",
    grupo: "ativo",
    criar: () => ({ tipo: "alcance", valor: 0 }),
  },
  {
    id: "ignora",
    nome: "Ignora Defesa",
    descricao: "Ignora resistência, imunidade, reação ou cobertura",
    icone: "fa-bolt-lightning",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "ignora", alvo: "resistência" }),
  },
  {
    id: "trocar_dano",
    nome: "Troca Tipo de Dano",
    descricao: "Muda o tipo de dano (vira Verdadeiro, Fogo…)",
    icone: "fa-fire",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "trocar_dano", tipoDano: "" }),
  },
  // ─ Defesa ─
  {
    id: "crit_imune",
    nome: "Imune a Crítico",
    descricao: "Não pode sofrer acerto crítico",
    icone: "fa-shield",
    cor: "var(--color-react)",
    grupo: "defesa",
    criar: () => ({ tipo: "crit_imune" }),
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
    case "substituir_atributo": {
      const alvo = str(obj.alvo);
      const atributo = str(obj.atributo);
      if (!alvo || !ATRIBUTOS_SET.has(atributo)) return null;
      return { tipo, alvo, atributo: atributo as Atributo };
    }
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
    case "dano_min":
      return { tipo, ...(str(obj.quando) ? { quando: str(obj.quando) } : {}) };
    case "alcance":
      return {
        tipo,
        valor: Math.trunc(num(obj.valor)),
        ...(str(obj.quando) ? { quando: str(obj.quando) } : {}),
      };
    case "ignora":
      if (!str(obj.alvo)) return null;
      return { tipo, alvo: str(obj.alvo) };
    case "trocar_dano":
      if (!str(obj.tipoDano)) return null;
      return { tipo, tipoDano: str(obj.tipoDano) };
    case "crit_imune":
      return { tipo };
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
    nome: `Limite ${a.nome}`,
    grupo: "Limite de Atributo",
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

// ─── Alvos contextuais (rolagens) ─────────────────────────────
// Lista finita de slugs que `vantagem`, `desvantagem`, `sucesso_auto` e
// `reroll` aceitam pra casar com o contexto da rolagem. Diferente de
// ALVOS_AGREGAVEIS (passivos somáveis), aqui só importa "casa ou não casa".
//
// Convenções:
// - Perícia: slug direto (`atletismo`, `furtividade`…) — alinhado com agregador.
// - Salvaguarda: `salv-<atrib>` (ex: `salv-vontade`). `concentracao` é um
//   pseudo-slug de salvaguarda especial.
// - Teste puro de atributo: `teste-<atrib>` (ex: `teste-forca`) — distingue
//   de modificador passivo de FOR.
// - Combate: `ataque`, `ataque-cc`, `ataque-distancia`, `iniciativa`.
// - Umbrellas: `ataque` (qualquer ataque), `salvaguarda` (qualquer salv),
//   `teste` (qualquer teste/perícia), `qualquer` (qualquer d20). Útil em
//   `reroll` ("rerrola qualquer ataque") e em descrições genéricas.
export const ALVOS_CONTEXTUAIS: { slug: string; nome: string; grupo: string }[] = [
  { slug: "qualquer", nome: "Qualquer d20", grupo: "Genérico" },
  { slug: "ataque", nome: "Ataque (qualquer)", grupo: "Combate" },
  { slug: "ataque-cc", nome: "Ataque CC", grupo: "Combate" },
  { slug: "ataque-distancia", nome: "Ataque à Distância", grupo: "Combate" },
  { slug: "iniciativa", nome: "Iniciativa", grupo: "Combate" },
  { slug: "salvaguarda", nome: "Salv. (qualquer)", grupo: "Salvaguarda" },
  ...ATRIBUTOS.map((a) => ({
    slug: `salv-${a.slug}`,
    nome: `Salv. ${a.nome}`,
    grupo: "Salvaguarda",
  })),
  { slug: "concentracao", nome: "Salv. Concentração", grupo: "Salvaguarda" },
  { slug: "teste", nome: "Teste (qualquer)", grupo: "Teste de Atributo" },
  ...ATRIBUTOS.map((a) => ({
    slug: `teste-${a.slug}`,
    nome: `Teste ${a.nome}`,
    grupo: "Teste de Atributo",
  })),
  ...PERICIAS.map((p) => ({ slug: p.slug, nome: p.nome, grupo: "Perícia" })),
];

const ALVOS_CONTEXTUAIS_SET = new Set(ALVOS_CONTEXTUAIS.map((a) => a.slug));

// Cálculos cujo atributo pode ser trocado por um efeito `substituir_atributo`.
// Só os derivados que usam um atributo fixo (CR/iniciativa via DES) ou testes
// (salvaguardas, perícias). Ataque/CD já têm seletor de atributo na própria Ação.
export const ALVOS_SUBSTITUIVEIS: { slug: string; nome: string; grupo: string }[] = [
  { slug: "cr", nome: "Classe de Resistência", grupo: "Derivado" },
  { slug: "iniciativa", nome: "Iniciativa", grupo: "Derivado" },
  ...ATRIBUTOS.map((a) => ({
    slug: `salv-${a.slug}`,
    nome: `Salv. ${a.nome}`,
    grupo: "Salvaguarda",
  })),
  ...PERICIAS.map((p) => ({ slug: p.slug, nome: p.nome, grupo: "Perícia" })),
];

// Resolve o atributo efetivo de um cálculo derivado: se uma habilidade
// substituiu o atributo daquele alvo, usa o novo; senão, o padrão.
export function atributoDeCalculo(
  alvo: string,
  padrao: Atributo,
  subs: Partial<Record<string, { atributo: Atributo; fontes: string[] }>>,
): { atributo: Atributo; fontes: string[]; substituido: boolean } {
  const s = subs[alvo.trim().toLowerCase()];
  return s
    ? { atributo: s.atributo, fontes: s.fontes, substituido: true }
    : { atributo: padrao, fontes: [], substituido: false };
}

// Rótulo amigável de um slug de alvo canônico (perícia, salvaguarda, pool…),
// pra chips/resumos não vazarem o slug cru ("hp-temp"). Cobre os dois catálogos
// (agregáveis + contextuais); cai pro próprio slug se for texto livre.
const ROTULO_ALVO = new Map<string, string>(
  [...ALVOS_AGREGAVEIS, ...ALVOS_CONTEXTUAIS].map((a) => [a.slug, a.nome]),
);
export function rotuloAlvo(slug: string): string {
  return ROTULO_ALVO.get(slug.trim().toLowerCase()) ?? slug;
}

// Marca o tipo de rolagem que tá acontecendo. Quem dispara a rolagem
// monta um `ContextoRolagem`, e `casaContexto(alvo, ctx)` decide se o
// efeito daquele alvo se aplica.
export type ContextoRolagem =
  | { tipo: "ataque"; alcance: "corpo_a_corpo" | "distancia" }
  | { tipo: "salvaguarda"; atributo: Atributo; concentracao?: boolean }
  // `pericia` é string livre: cobre as 18 canônicas e perícias customizadas
  // (slug por-personagem, fora do set canônico).
  | { tipo: "pericia"; pericia: string }
  | { tipo: "teste-atributo"; atributo: Atributo }
  | { tipo: "iniciativa" }
  // Rolagem de DANO (não é d20). Carrega o alcance pra casar efeitos CC/distância.
  // Efeitos de d20 (vantagem/reroll/crit/floor) NÃO se aplicam; só os de dano
  // (dano_min/trocar_dano/ignora) — ver `chipsDoContexto`.
  | { tipo: "dano"; alcance: "corpo_a_corpo" | "distancia" };

// Verifica se um alvo (slug salvo no efeito) casa com o contexto da
// rolagem. Slugs livres (fora de ALVOS_CONTEXTUAIS) NUNCA casam — viram
// chip descritivo no card mas não disparam automação.
export function casaContexto(alvoRaw: string, ctx: ContextoRolagem): boolean {
  const alvo = alvoRaw.trim().toLowerCase();
  if (!alvo) return false;
  // Dano não é d20 — vantagem/desvantagem/sucesso_auto/reroll (e o curinga
  // "qualquer") nunca casam. Efeitos de dano têm bucket próprio (não passam aqui).
  if (ctx.tipo === "dano") return false;
  if (alvo === "qualquer") return true;

  switch (ctx.tipo) {
    case "ataque":
      if (!ALVOS_CONTEXTUAIS_SET.has(alvo)) return false;
      if (alvo === "ataque") return true;
      if (alvo === "ataque-cc" && ctx.alcance === "corpo_a_corpo") return true;
      if (alvo === "ataque-distancia" && ctx.alcance === "distancia") return true;
      return false;
    case "salvaguarda":
      if (!ALVOS_CONTEXTUAIS_SET.has(alvo)) return false;
      if (alvo === "salvaguarda") return true;
      if (alvo === `salv-${ctx.atributo}`) return true;
      if (alvo === "concentracao" && ctx.concentracao) return true;
      return false;
    case "pericia":
      // Casa por igualdade exata com o slug rolado — não exige presença no set
      // canônico, então perícias customizadas (slug por-personagem) também casam.
      // Sem risco de falso-positivo: ctx.pericia é sempre uma perícia que existe.
      if (alvo === "teste") return true;
      return alvo === ctx.pericia;
    case "teste-atributo":
      if (alvo === "teste") return true;
      return alvo === `teste-${ctx.atributo}`;
    case "iniciativa":
      return alvo === "iniciativa";
  }
}

type FonteValor = { valor: number; fontes: string[] };
// Defesa agregada pro painel da sidebar. `passiva` marca se ALGUMA fonte é
// passiva (traço permanente → sempre ligada). Defesa que só vem de habilidade
// ativável só entra no agregado quando a habilidade está LIGADA (o gate é o
// `h.ligada` no agregador), então sua presença já significa "ativa agora";
// `estadoDefesa` só decide o marcador condicional.
export type DefesaAgregada = {
  fontes: string[];
  passiva: boolean;
};

// Resolve o marcador de uma defesa no painel. Defesa de fonte passiva é traço
// permanente (sem marcador). Defesa que só vem de habilidade ligada é
// condicional (esmaecida + legenda "enquanto X estiver ativa") — some sozinha
// quando a habilidade desliga, porque aí não é mais agregada.
export function estadoDefesa(
  d: DefesaAgregada,
): { condicional: boolean; motivo?: string } {
  if (d.passiva) return { condicional: false };
  const nomes = d.fontes.join(", ");
  return {
    condicional: true,
    motivo: `enquanto ${nomes || "a habilidade"} estiver ativa`,
  };
}
type FonteLista = { fontes: string[] };

// Efeito que depende do contexto da rolagem (casa via `casaContexto`). Guardado
// "cru" no agregado com alvo + fonte; quem rola decide se casa com o contexto
// atual (ataque CC, perícia X…). Diferente de crit_range/floor_d20 (globais) e
// reroll (por gatilho), que já têm bucket próprio.
export type EfeitoContextual = {
  tipo: "vantagem" | "desvantagem" | "sucesso_auto";
  alvo: string;
  fonte: string;
  quando?: string;
};

// Agregação de todos os efeitos `modificador` e `proficiencia` das habilidades
// do personagem. Resultado é "frio": pode ser calculado em qualquer momento
// a partir da lista de habilidades, sem estado interno.
export type EfeitosAgregados = {
  // Indexado por slug de perícia: canônica (PericiaSlug) ou customizada (slug
  // livre por-personagem) — por isso a chave é string, não PericiaSlug.
  bonusPericia: Partial<Record<string, FonteValor>>;
  bonusSalvaguarda: Partial<Record<Atributo, FonteValor>>;
  bonusAtributo: Partial<Record<Atributo, FonteValor>>;
  // Bônus no limite do atributo (ex: Mente Afiada eleva o limite de SAB pra 26).
  // Aplicação fica a cargo da UI que controla AVA; aqui é só consolidação.
  // Campo segue `bonusTetoAtributo` / slug `teto-` (identificadores estáveis).
  bonusTetoAtributo: Partial<Record<Atributo, FonteValor>>;
  proficienciasPericia: Partial<Record<string, FonteLista>>;
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
  // Fatores multiplicativos (ex: Espécie Gigante ×2 carga). Indexado pelo
  // slug do alvo. Vários multiplicadores compõem por produto (×2 × ×1.5 = ×3).
  // Default 1 (sem efeito). Ordem com aditivo: (base + bônus) × fator.
  multiplicadores: Partial<Record<string, { fator: number; fontes: string[] }>>;
  // Vantagem/desvantagem/sucesso_auto crus — casam com o contexto na hora de
  // rolar (via `chipsDoContexto`). Não somam: importa só "casa ou não casa".
  contextuais: EfeitoContextual[];
  // Substituição de atributo por cálculo (CR/iniciativa/salvaguarda/perícia).
  // Indexado pelo slug do alvo; a primeira habilidade a definir vence.
  substituicoesAtributo: Partial<Record<string, { atributo: Atributo; fontes: string[] }>>;
  // ─ Contextuais de dano/ataque (etapa 3.5) ─
  // Piso de dano (metade do MÁXIMO da fórmula). Presença = ativo; sem valor —
  // o piso depende da fórmula rolada, então é calculado no Rolador. Fontes somam.
  danoMinMetade: FonteLista;
  // Troca de tipo de dano. Primeira habilidade a definir vence; fontes acumulam.
  trocaDano: { tipoDano: string; fontes: string[] } | null;
  // Defesas ignoradas (resistência/imunidade/reação/cobertura). Indexado pelo
  // que ignora; fontes acumulam.
  ignora: Partial<Record<string, FonteLista>>;
  // Metros extras de alcance de arma — DESCRITIVO (anota no chip de ataque).
  bonusAlcance: FonteValor;
  // Imune a acerto crítico (defensivo). Presença (fontes) = imune. Não é
  // consumido no Rolador (é sobre ser atacado) — só exibição na sidebar.
  critImune: DefesaAgregada;
  // ─ Defesas (painel read-only da sidebar) ─
  // Resistências e imunidades a tipo de dano + imunidades a condição. Indexados
  // pelo nome (casing preservado). Agregam de QUALQUER tipo de habilidade (é
  // traço, não rolagem); de fonte ativável entram como condicional. Só exibição.
  resistencias: Partial<Record<string, DefesaAgregada>>;
  imunidades: Partial<Record<string, DefesaAgregada>>;
  condicoesImunes: Partial<Record<string, DefesaAgregada>>;
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
    multiplicadores: {},
    contextuais: [],
    substituicoesAtributo: {},
    danoMinMetade: { fontes: [] },
    trocaDano: null,
    ignora: {},
    bonusAlcance: { valor: 0, fontes: [] },
    critImune: { fontes: [], passiva: false },
    resistencias: {},
    imunidades: {},
    condicoesImunes: {},
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

// Marca uma fonte numa defesa (acumula fonte + liga `passiva` se a fonte for
// passiva). Uma única fonte passiva já torna a defesa um traço permanente.
function marcarOrigemDefesa(d: DefesaAgregada, fonte: string, passiva: boolean) {
  if (!d.fontes.includes(fonte)) d.fontes.push(fonte);
  if (passiva) d.passiva = true;
}

// Adiciona uma defesa (resistência/imunidade/condição) ao bucket do painel.
// Casing da chave é preservado pra exibição.
function aplicarDefesa(
  bucket: Partial<Record<string, DefesaAgregada>>,
  chaveRaw: string,
  fonte: string,
  passiva: boolean,
) {
  const k = chaveRaw.trim();
  if (!k) return;
  const atual = bucket[k] ?? { fontes: [], passiva: false };
  marcarOrigemDefesa(atual, fonte, passiva);
  bucket[k] = atual;
}

// Deltas instantâneos aplicados quando uma habilidade ativa é usada. Cura,
// `modificador` em pools temporários e `recurso_delta` viram aqui. Usado
// tanto pelo server (Server Action) quanto pelo client (otimismo cross-tab).
// Recursos custom ficam indexados pelo id (UUID) que vive em `e.recurso`.
export type DeltasInstantaneos = {
  hpAtual: number;
  hpTemp: number;
  ppAtual: number;
  hpMax: number;
  ppMax: number;
  recursos: Record<string, number>;
};

export function computarDeltasInstantaneos(
  efeitos: EfeitoHabilidade[],
  // `incluirMax: false` ignora `modificador` em hp-max/pp-max. Usado ao LIGAR
  // uma habilidade sustentada: bônus de PV/PP máximo são revertíveis, então
  // vivem no agregado (bonusHpMax/bonusPpMax enquanto ligada) em vez de baterem
  // permanentemente no valor armazenado. cura/PV-temp/recurso seguem instantâneos.
  { incluirMax = true }: { incluirMax?: boolean } = {},
): DeltasInstantaneos {
  const d: DeltasInstantaneos = {
    hpAtual: 0,
    hpTemp: 0,
    ppAtual: 0,
    hpMax: 0,
    ppMax: 0,
    recursos: {},
  };
  // Slugs canônicos de pool: hp (PV atual), hp-temp, hp-max, pp (PP atual),
  // pp-max. Aliases antigos (pv, ppv, pv-temp, hpMax, hptemp…) são tolerados
  // aqui pra não quebrar habilidades já salvas no banco.
  for (const e of efeitos) {
    if (e.tipo === "cura") {
      const n = Number(e.valor);
      if (!Number.isFinite(n) || n <= 0) continue;
      const v = Math.trunc(n);
      const onde = (e.alvoCura ?? "hp").trim().toLowerCase();
      if (onde === "pp") d.ppAtual += v;
      else if (onde === "hp-temp" || onde === "hptemp" || onde === "pv-temp" || onde === "ppv")
        d.hpTemp += v;
      else d.hpAtual += v; // hp / pv / vazio
    } else if (e.tipo === "modificador") {
      const alvo = e.alvo.trim().toLowerCase();
      if (alvo === "hp-temp" || alvo === "hptemp") d.hpTemp += Math.trunc(e.valor);
      else if (incluirMax && (alvo === "hp-max" || alvo === "hpmax")) d.hpMax += Math.trunc(e.valor);
      else if (incluirMax && (alvo === "pp-max" || alvo === "ppmax")) d.ppMax += Math.trunc(e.valor);
    } else if (e.tipo === "recurso_delta") {
      const v = Math.trunc(e.valor);
      if (!v) continue;
      const k = e.recurso.trim(); // pode ser UUID de recurso custom (case-sensitive)
      if (k === "pp") d.ppAtual += v;
      else if (k === "hp-max" || k === "hpMax" || k === "hpmax") d.hpMax += v;
      else if (k === "pa") continue; // PA não é pool rastreável (legado)
      else d.recursos[k] = (d.recursos[k] ?? 0) + v;
    }
  }
  return d;
}

// Um efeito é "sustentado" quando o agregador o transforma num traço/bônus
// persistente (aplicado enquanto a habilidade estiver passiva ou ligada e
// revertido ao desligar). NÃO são sustentados: os instantâneos (cura,
// recurso_delta, `modificador` em hp-temp — grants one-shot que persistem) nem
// os puramente descritivos (livre/trigger/rolagem/condicao_*/sentido/acao_extra).
// `modificador` em hp-max/pp-max É sustentado (bônus de máximo revertível).
export function efeitoEhSustentado(e: EfeitoHabilidade): boolean {
  switch (e.tipo) {
    case "modificador": {
      const a = e.alvo.trim().toLowerCase();
      return a !== "hp-temp" && a !== "hptemp";
    }
    case "vantagem":
    case "desvantagem":
    case "sucesso_auto":
    case "reroll":
    case "floor_d20":
    case "crit_range":
    case "proficiencia":
    case "resistencia":
    case "imunidade":
    case "condicao_imune":
    case "crit_imune":
    case "multiplicador":
    case "substituir_atributo":
    case "deslocamento":
    case "dano_min":
    case "alcance":
    case "ignora":
    case "trocar_dano":
      return true;
    default:
      return false;
  }
}

// Habilidade ativável (ativa/reativa) com ≥1 efeito sustentado ganha toggle
// on/off (estado `ligada`) em vez do botão "Usar" de disparo único. Auto-detect:
// sem passo novo de autoria.
export function temEfeitoSustentado(efeitos: EfeitoHabilidade[]): boolean {
  return efeitos.some(efeitoEhSustentado);
}

// Varre habilidades e aplica efeitos sustentados (modificador, proficiência,
// contextuais, defesas, multiplicador…) nos alvos canônicos. Alvos não
// reconhecidos são ignorados silenciosamente.
// Gate único: um efeito sustentado entra no agregado quando a habilidade é
// `passiva` (sempre ligada) OU está `ligada` (habilidade sustentada que o
// usuário ativou via toggle). `ativa`/`reativa` DESLIGADA não agrega nada;
// quando ligada, agrega exatamente como uma passiva (e some ao desligar).
// Efeitos instantâneos (cura/PV-temp/recurso) não entram aqui — são consumidos
// por `computarDeltasInstantaneos` no momento de ligar/usar.
export function agregarEfeitos(
  habilidades: { nome: string; tipo: string; efeitos: unknown; ligada?: boolean }[],
  // Slugs de perícias customizadas do personagem. Permite que `modificador` e
  // `proficiencia` mirando uma perícia custom caiam em bonusPericia/
  // proficienciasPericia em vez de virarem efeito descritivo sem dono.
  slugsPericiaCustom: Set<string> = new Set(),
): EfeitosAgregados {
  const out = vazio();
  for (const h of habilidades) {
    const ehPassiva = h.tipo === "passiva";
    // Habilidade não-passiva só agrega enquanto ligada. Passiva sempre agrega.
    if (!ehPassiva && h.ligada !== true) continue;
    const efeitos = lerEfeitos(h.efeitos);
    for (const e of efeitos) {
      // Defesas (resistência/imunidade/imune a condição/imune a crítico) são
      // traços; `passiva` marca se a fonte é permanente (vs. condicional ao
      // estado ligada).
      if (e.tipo === "resistencia") {
        aplicarDefesa(out.resistencias, e.tipoDano, h.nome, ehPassiva);
        continue;
      }
      if (e.tipo === "imunidade") {
        aplicarDefesa(out.imunidades, e.tipoDano, h.nome, ehPassiva);
        continue;
      }
      if (e.tipo === "condicao_imune") {
        aplicarDefesa(out.condicoesImunes, e.condicao, h.nome, ehPassiva);
        continue;
      }
      if (e.tipo === "crit_imune") {
        marcarOrigemDefesa(out.critImune, h.nome, ehPassiva);
        continue;
      }
      if (e.tipo === "modificador") {
        aplicarModificador(out, e.alvo, e.valor, h.nome, slugsPericiaCustom);
      } else if (e.tipo === "proficiencia") {
        aplicarProficiencia(out, e.alvo, h.nome, slugsPericiaCustom);
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
      } else if (e.tipo === "multiplicador") {
        const key = e.alvo.trim().toLowerCase();
        if (!key || !e.fator || e.fator === 1) continue;
        const atual = out.multiplicadores[key] ?? { fator: 1, fontes: [] };
        // Vários multiplicadores compõem por produto.
        atual.fator *= e.fator;
        if (!atual.fontes.includes(h.nome)) atual.fontes.push(h.nome);
        out.multiplicadores[key] = atual;
      } else if (e.tipo === "substituir_atributo") {
        const alvo = e.alvo.trim().toLowerCase();
        if (alvo && ATRIBUTOS_SET.has(e.atributo)) {
          const atual = out.substituicoesAtributo[alvo];
          if (!atual) {
            // Primeira habilidade a definir a substituição vence.
            out.substituicoesAtributo[alvo] = { atributo: e.atributo, fontes: [h.nome] };
          } else if (!atual.fontes.includes(h.nome)) {
            atual.fontes.push(h.nome);
          }
        }
      } else if (
        e.tipo === "vantagem" ||
        e.tipo === "desvantagem" ||
        e.tipo === "sucesso_auto"
      ) {
        const alvo = e.alvo.trim().toLowerCase();
        if (alvo) {
          out.contextuais.push({ tipo: e.tipo, alvo, fonte: h.nome, quando: e.quando });
        }
      } else if (e.tipo === "dano_min") {
        if (!out.danoMinMetade.fontes.includes(h.nome)) out.danoMinMetade.fontes.push(h.nome);
      } else if (e.tipo === "alcance") {
        if (e.valor) somarBucketSimples(out.bonusAlcance, e.valor, h.nome);
      } else if (e.tipo === "ignora") {
        const k = e.alvo.trim().toLowerCase();
        if (k) adicionarFonteLista(out.ignora, k, h.nome);
      } else if (e.tipo === "trocar_dano") {
        const t = e.tipoDano.trim();
        if (t) {
          // Primeira a definir vence; demais só acumulam fonte.
          if (!out.trocaDano) out.trocaDano = { tipoDano: t, fontes: [h.nome] };
          else if (!out.trocaDano.fontes.includes(h.nome)) out.trocaDano.fontes.push(h.nome);
        }
      }
    }
  }
  return out;
}

// Chip aplicável a uma rolagem específica — derivado do agregado + contexto.
// O Rolador (Bandeja) renderiza um por chip com toggle de override. Mecânicos
// (vantagem/desvantagem/crit_range/floor_d20) mudam o d20; informativos
// (sucesso_auto/reroll) só anotam na string da rolagem.
export type ChipContexto = {
  tipo:
    | "vantagem"
    | "desvantagem"
    | "sucesso_auto"
    | "crit_range"
    | "floor_d20"
    | "reroll"
    | "dano_min"
    | "trocar_dano"
    | "ignora"
    | "alcance";
  rotulo: string;
  fontes: string[];
  // Parâmetro do efeito (minimo do crit/floor, usos do reroll, metros do alcance).
  // Ignorado nos demais.
  valor?: number;
};

// Subconjunto do agregado que o Rolador precisa pra montar os chips — evita
// serializar o EfeitosAgregados inteiro como prop da Bandeja.
export type EfeitosContexto = Pick<
  EfeitosAgregados,
  | "contextuais"
  | "critRangeMinimo"
  | "floorD20"
  | "rerolls"
  | "danoMinMetade"
  | "trocaDano"
  | "ignora"
  | "bonusAlcance"
>;

export function chipsDoContexto(
  agg: EfeitosContexto,
  ctx: ContextoRolagem,
): ChipContexto[] {
  const chips: ChipContexto[] = [];
  const ehDano = ctx.tipo === "dano";

  // ─ Efeitos de d20 — só em rolagens de d20 (não em dano) ─
  if (!ehDano) {
    // Vantagem/desvantagem/sucesso_auto: agrupa por tipo as fontes que casam.
    const grupos: Partial<Record<EfeitoContextual["tipo"], string[]>> = {};
    for (const c of agg.contextuais) {
      if (!casaContexto(c.alvo, ctx)) continue;
      (grupos[c.tipo] ??= []).push(c.fonte);
    }
    if (grupos.vantagem)
      chips.push({ tipo: "vantagem", rotulo: "Vantagem", fontes: dedup(grupos.vantagem) });
    if (grupos.desvantagem)
      chips.push({ tipo: "desvantagem", rotulo: "Desvantagem", fontes: dedup(grupos.desvantagem) });
    if (grupos.sucesso_auto)
      chips.push({ tipo: "sucesso_auto", rotulo: "Sucesso automático", fontes: dedup(grupos.sucesso_auto) });

    // Crítico expandido só importa em ataque (crit só acontece atacando).
    if (ctx.tipo === "ataque" && agg.critRangeMinimo.valor < 20) {
      chips.push({
        tipo: "crit_range",
        rotulo: `Crítico ${agg.critRangeMinimo.valor}-20`,
        fontes: agg.critRangeMinimo.fontes,
        valor: agg.critRangeMinimo.valor,
      });
    }
    // Floor no d20 vale pra qualquer rolagem de d20.
    if (agg.floorD20.valor > 0) {
      chips.push({
        tipo: "floor_d20",
        rotulo: `Mínimo ${agg.floorD20.valor} no d20`,
        fontes: agg.floorD20.fontes,
        valor: agg.floorD20.valor,
      });
    }
    // Reroll: gatilho segue a mesma convenção de slug do casaContexto.
    for (const [gatilho, fv] of Object.entries(agg.rerolls)) {
      if (fv && fv.valor > 0 && casaContexto(gatilho, ctx)) {
        chips.push({
          tipo: "reroll",
          rotulo: `Rerrolar (${fv.valor}×)`,
          fontes: fv.fontes,
          valor: fv.valor,
        });
        break;
      }
    }
  }

  // ─ Efeitos de dano/ataque (etapa 3.5) ─
  // Piso de dano: só em rolagem de dano. Sem valor — o Rolador calcula a partir
  // da fórmula (metade do máximo dos dados).
  if (ehDano && agg.danoMinMetade.fontes.length) {
    chips.push({
      tipo: "dano_min",
      rotulo: "Dano mín. (½ do máx)",
      fontes: agg.danoMinMetade.fontes,
    });
  }
  // Troca de tipo de dano: só em dano.
  if (ehDano && agg.trocaDano) {
    chips.push({
      tipo: "trocar_dano",
      rotulo: `Dano vira ${agg.trocaDano.tipoDano}`,
      fontes: agg.trocaDano.fontes,
    });
  }
  // Ignora defesa: vale em ataque e em dano (anotação informativa).
  if (ctx.tipo === "ataque" || ehDano) {
    for (const [alvo, fl] of Object.entries(agg.ignora)) {
      if (fl) chips.push({ tipo: "ignora", rotulo: `Ignora ${alvo}`, fontes: fl.fontes });
    }
  }
  // Alcance extra: descritivo, só no chip de ataque.
  if (ctx.tipo === "ataque" && agg.bonusAlcance.valor > 0) {
    chips.push({
      tipo: "alcance",
      rotulo: `+${agg.bonusAlcance.valor} m de alcance`,
      fontes: agg.bonusAlcance.fontes,
      valor: agg.bonusAlcance.valor,
    });
  }

  return chips;
}

function dedup(xs: string[]): string[] {
  return Array.from(new Set(xs));
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
  slugsPericiaCustom: Set<string> = new Set(),
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
  if (bucket) {
    somarBucketSimples(bucket(out), valor, fonte);
    return;
  }
  // Perícia customizada — só captura o slug se nenhum alvo reservado o reivindicou.
  if (slugsPericiaCustom.has(alvo)) {
    somarFonteValor(out.bonusPericia, alvo, valor, fonte);
  }
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
  slugsPericiaCustom: Set<string> = new Set(),
) {
  const alvo = alvoRaw.trim().toLowerCase();
  if (!alvo) return;
  if (PERICIAS_SET.has(alvo) || slugsPericiaCustom.has(alvo)) {
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
      return `${formatarMod(e.valor)} ${rotuloAlvo(e.alvo)}`;
    case "vantagem":
    case "desvantagem":
      return rotuloAlvo(e.alvo);
    case "proficiencia":
      return `${rotuloAlvo(e.alvo)}${e.dobrada ? " (2×)" : ""}`;
    case "recurso_delta": {
      const lbl =
        e.recurso === "pp"
          ? "PP"
          : e.recurso === "hp-max" || e.recurso === "hpMax"
            ? "PV Máx"
            : e.recurso;
      return `${formatarMod(e.valor)} ${lbl}`;
    }
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
    case "substituir_atributo": {
      const sigla = ATRIBUTOS.find((a) => a.slug === e.atributo)?.sigla ?? e.atributo;
      return `${rotuloAlvo(e.alvo)} → ${sigla}`;
    }
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
      return rotuloAlvo(e.alvo);
    case "dano_min":
      return "metade do máx";
    case "alcance":
      return `+${e.valor} m alcance`;
    case "ignora":
      return `ignora ${e.alvo}`;
    case "trocar_dano":
      return `→ ${e.tipoDano}`;
    case "crit_imune":
      return "imune a crítico";
    case "livre":
      return e.texto;
  }
}
