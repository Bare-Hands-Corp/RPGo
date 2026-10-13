// Helpers puros de cálculo do OP RPG v1.5.7.
// Sem estado, sem I/O — podem ser usados em Server Component, Client Component
// ou Server Action.

import { faixaDaRolagem, parseFormulaDados, type Dado } from "./dice";
import { avaliarFormula, formulaUsaGrau, formulaVariavel } from "./formula";
import { cobre, lerCobertura } from "./dano";
import { duracaoPvTempNoBanco, lerDuracaoPvTemp, type DuracaoPvTemp } from "./duracao";

export function modificador(valor: number): number {
  return Math.floor((valor - 10) / 2);
}

// Formata um modificador como string com sinal (+3, 0, -2).
export function formatarMod(mod: number): string {
  if (mod > 0) return `+${mod}`;
  return String(mod);
}

// Bônus de proficiência por nível (livro do jogador, p. 32).
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

export type FormulaResolvida = {
  dados: Dado[];
  modificador: number;
  // Siglas resolvidas, pro tooltip ("CON +3").
  usados: { sigla: string; mod: number }[];
};

// Valor de uma sigla canônica da fórmula.
function valorDaSigla(
  sigla: string,
  atributos: Record<Atributo, number>,
  nivel: number,
  grau: number,
): number {
  if (sigla === "PROF") return bonusProficiencia(nivel);
  if (sigla === "NIVEL") return nivel;
  if (sigla === "GRAU") return grau;
  const slug = SIGLA_PARA_SLUG[sigla];
  return slug ? modificador(atributos[slug]) : 0;
}

// Resolve uma fórmula (lib/formula.ts): dados, conta, siglas (FOR…PRE =
// modificador, PROF, NIVEL, GRAU) e min/max/POR_NIVEL. Mal escrita, fica com os
// dados e números soltos.
export function resolverFormula(
  bruta: string,
  atributos: Record<Atributo, number>,
  nivel: number,
  { grau = 0 }: { grau?: number } = {},
): FormulaResolvida {
  const r = avaliarFormula(bruta, {
    nivel,
    valor: (sigla) => valorDaSigla(sigla, atributos, nivel, grau),
  });
  if (r.ok) {
    return {
      dados: r.rolagem.dados,
      modificador: r.rolagem.modificador,
      usados: r.usados.map((u) => ({ sigla: u.sigla, mod: u.valor })),
    };
  }
  const p = parseFormulaDados(bruta);
  return { dados: p.dados, modificador: p.modificador, usados: [] };
}

// Prévia da edição: a fórmula resolvida ("2d10+3") ou o erro dela.
export function conferirFormula(
  bruta: string,
  atributos: Record<Atributo, number>,
  nivel: number,
  { grau = 0 }: { grau?: number } = {},
): { ok: true; texto: string } | { ok: false; erro: string } {
  const r = avaliarFormula(bruta, {
    nivel,
    valor: (sigla) => valorDaSigla(sigla, atributos, nivel, grau),
  });
  if (!r.ok) return r;
  return { ok: true, texto: formulaAgrupada(r.rolagem.dados, r.rolagem.modificador) };
}

// Valor de cada sigla pro personagem (autocompletar e atalhos).
export function valoresDasSiglas(
  atributos: Record<Atributo, number>,
  nivel: number,
  grau?: number,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of ATRIBUTOS) out[a.sigla] = formatarMod(modificador(atributos[a.slug]));
  out.PROF = formatarMod(bonusProficiencia(nivel));
  out.NIVEL = String(nivel);
  if (grau !== undefined) out.GRAU = grau > 0 ? String(grau) : "—";
  return out;
}

// Número de uma fórmula sem dados ("PROF/2+1", "3*NIVEL", "12").
export function valorDaFormula(
  formula: string,
  atributos: Record<Atributo, number>,
  nivel: number,
  extras: { grau?: number } = {},
): number {
  return resolverFormula(formula, atributos, nivel, extras).modificador;
}

// Fórmula com as siglas e funções resolvidas ("2d10+CON" → "2d10+3"); sem elas, fica igual.
export function formulaResolvidaTexto(
  bruta: string,
  atributos: Record<Atributo, number>,
  nivel: number,
  extras: { grau?: number } = {},
): string {
  if (!formulaVariavel(bruta)) return bruta.trim();
  const r = resolverFormula(bruta, atributos, nivel, extras);
  return formulaAgrupada(r.dados, r.modificador);
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

// Bônus total de uma salvaguarda (dobrada: ex. Força Colossal dos Gigantes).
export function bonusSalvaguarda(opts: {
  valorAtributo: number;
  nivel: number;
  proficiente: boolean;
  dobrado?: boolean;
  outros?: number;
}): number {
  const mod = modificador(opts.valorAtributo);
  const extra = opts.outros ?? 0;
  if (!opts.proficiente) return mod + extra;
  return mod + bonusProficiencia(opts.nivel) * (opts.dobrado ? 2 : 1) + extra;
}

// Teste passivo: 10 + bônus do teste; vantagem +5, desvantagem −5.
export function testePassivo(bonus: number, vantagem: boolean, desvantagem: boolean): number {
  const ajuste = vantagem && !desvantagem ? 5 : desvantagem && !vantagem ? -5 : 0;
  return 10 + bonus + ajuste;
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
  // Rolagem de técnica (senão, ataque comum).
  tecnica?: boolean;
}): { atributo: Atributo; bonus: number; fontes: string[]; alcance: AlcanceArma } | null {
  const alcance: AlcanceArma = ALCANCES_ARMA_VALIDOS.has(opts.alcanceRaw)
    ? (opts.alcanceRaw as AlcanceArma)
    : "corpo_a_corpo";
  const agg = opts.efeitosAgregados;
  const propriedades = lerPropriedadesArma(opts.propriedadesRaw);
  // Sem atributo escolhido na arma, um efeito pode trocar o do ataque.
  let override = (opts.atributoOverride as Atributo | null) || null;
  if (!override) {
    const padrao = melhorAtributo(atributosCandidatos(alcance, propriedades), opts.atributos);
    if (padrao) {
      const sub = atributoDeCalculo(
        alcance === "corpo_a_corpo" ? "ataque-cc" : "ataque-distancia",
        padrao,
        agg.substituicoesAtributo,
        opts.atributos,
      );
      if (sub.substituido) override = sub.atributo;
    }
  }
  const base = bonusAtaqueArma({
    alcance,
    propriedades,
    atributoOverride: override,
    atributos: opts.atributos,
    nivel: opts.nivel,
    modificadorArma: opts.modificadorArma,
    proficiente: opts.proficiente,
  });
  if (!base) return null;
  // Bônus de habilidade: genérico, do alcance, técnica/comum e todas as jogadas.
  const extra = bonusDeAtaque(agg, alcance, !!opts.tecnica);
  return {
    atributo: base.atributo,
    bonus: base.bonus + extra.valor,
    fontes: extra.fontes,
    alcance,
  };
}

// Bônus de efeito num ataque: geral, do alcance, técnica/comum e todas as jogadas.
export function bonusDeAtaque(
  agg: EfeitosAgregados,
  alcance: AlcanceArma,
  tecnica: boolean,
): FonteValor {
  return somarFontes(
    agg.bonusAtaque,
    alcance === "corpo_a_corpo" ? agg.bonusAtaqueCC : agg.bonusAtaqueDistancia,
    tecnica ? agg.bonusAtaqueTecnica : agg.bonusAtaqueComum,
    agg.bonusQualquer,
  );
}

// ─── Passos de dano e desconto de técnica (Meito, cap. 8) ────────────

// Sobe o primeiro dado da fórmula na escada do livro (1d4 → … → 1d12 → 2d6).
export function subirPassosDano(formula: string, passos: number): string {
  let f = formula;
  for (let i = 0; i < passos; i++) f = subirUmPasso(f);
  return f;
}

const FACES_ESCADA = [4, 6, 8, 10, 12];

function subirUmPasso(formula: string): string {
  const m = /(\d*)\s*d\s*(\d+)/i.exec(formula);
  if (!m) return formula.replace(/^\s*1(?!\d)/, "1d4");
  const qtd = m[1] === "" ? 1 : parseInt(m[1], 10);
  const faces = parseInt(m[2], 10);
  const proxima = FACES_ESCADA.find((f) => f > faces);
  let novo: string;
  if (faces === 12) novo = `${qtd * 2}d6`;
  else if (proxima && faces < 12) novo = `${qtd}d${proxima}`;
  else return formula;
  return formula.slice(0, m.index) + novo + formula.slice(m.index + m[0].length);
}

// Custo com os descontos que valem pro grau: as reduções somam e o piso é o
// maior mínimo entre elas (sem mínimo, a metade do custo). "De graça" zera.
export function custoComDescontos(
  base: number,
  custo: "pp" | "pa",
  grau: number,
  descontos: DescontoTecnica[],
  ctx: ContextoFormula | null,
): { final: number; fontes: string[] } {
  if (base <= 0) return { final: base, fontes: [] };
  const validos = descontos.filter(
    (d) => d.custo === custo && (!d.graus?.length || d.graus.includes(grau)),
  );
  const zero = validos.filter((d) => d.modo === "zero");
  if (zero.length) return { final: 0, fontes: dedup(zero.map((d) => d.fonte)) };
  let reducao = 0;
  let piso = 0;
  const fontes: string[] = [];
  for (const d of validos) {
    const r =
      d.modo === "metade"
        ? base - Math.floor(base / 2)
        : d.formula
          ? ctx
            ? valorDaFormula(d.formula, ctx.atributos, ctx.nivel, { grau })
            : 0
          : d.valor;
    if (r <= 0) continue;
    reducao += r;
    piso = Math.max(piso, d.minimo ?? (d.modo === "metade" ? 0 : Math.floor(base / 2)));
    fontes.push(d.fonte);
  }
  if (reducao <= 0) return { final: base, fontes: [] };
  return { final: Math.min(base, Math.max(piso, base - reducao)), fontes: dedup(fontes) };
}

// O maior entre o dado da arma e o dado fixo por efeito (máximo possível).
export function maiorDado(dano: string | null, fixo: string | null | undefined): string {
  const base = dano?.trim() ?? "";
  if (!fixo) return base;
  const maximo = (x: string) => {
    const d = parseFormulaDados(x);
    return faixaDaRolagem(d.dados, d.modificador).max;
  };
  return !base || maximo(fixo) > maximo(base) ? fixo : base;
}

// Parcela do dano composto (tooltip).
export type ParteDano = { rotulo: string; texto: string };

export type DanoArmaResolvido = {
  dados: Dado[];
  modificador: number;
  // Fórmula total normalizada ("1d8+1d6+3").
  formula: string;
  partes: ParteDano[];
  fontes: string[];
  // false quando não há nada pra rolar.
  rolavel: boolean;
};

// Compõe o dano da arma a partir das parcelas; null se não houver nenhuma.
export function resolverDanoArma(opts: {
  danoBase: string | null;
  danoBonus: string | null;
  passos?: number;
  somaAtributo: boolean;
  atributoDano: Atributo | null;
  atributos: Record<Atributo, number>;
  nivel: number;
  // Bônus de proficiência a somar; 0 quando a arma não soma.
  proficiencia?: number;
  alcance: AlcanceArma;
  efeitosAgregados: EfeitosAgregados;
  // Dano de técnica (senão, de ataque comum).
  tecnica?: boolean;
  // Dado da arma fixo por efeito ("1d10"): vale o maior.
  dadoFixo?: string | null;
  // Grau da técnica, pro GRAU das fórmulas.
  grau?: number;
}): DanoArmaResolvido | null {
  const partes: ParteDano[] = [];
  const dados: Dado[] = [];
  let total = 0;
  const extras = { grau: opts.grau ?? 0 };

  const bruto = maiorDado(opts.danoBase?.trim() ?? "", opts.dadoFixo);
  if (bruto) {
    const passos = opts.passos ?? 0;
    // Com função (POR_NIVEL…), o passo sobe o dado já resolvido.
    const base =
      passos > 0
        ? subirPassosDano(
            formulaVariavel(bruto)
              ? formulaResolvidaTexto(bruto, opts.atributos, opts.nivel, extras)
              : bruto,
            passos,
          )
        : bruto;
    const p = resolverFormula(base, opts.atributos, opts.nivel, extras);
    dados.push(...p.dados);
    total += p.modificador;
    partes.push({
      rotulo: passos > 0 ? `Arma (+${passos} passo${passos > 1 ? "s" : ""})` : "Arma",
      texto: base,
    });
  }

  const bonus = opts.danoBonus?.trim() ?? "";
  if (bonus) {
    const p = resolverFormula(bonus, opts.atributos, opts.nivel, extras);
    dados.push(...p.dados);
    total += p.modificador;
    partes.push({ rotulo: "Dano bônus", texto: bonus });
  }

  if (opts.somaAtributo && opts.atributoDano) {
    const mod = modificador(opts.atributos[opts.atributoDano]);
    if (mod !== 0) {
      total += mod;
      const sigla =
        ATRIBUTOS.find((a) => a.slug === opts.atributoDano)?.sigla ?? opts.atributoDano;
      partes.push({ rotulo: sigla, texto: formatarMod(mod) });
    }
  }

  const prof = opts.proficiencia ?? 0;
  if (prof !== 0) {
    total += prof;
    partes.push({ rotulo: "Proficiência", texto: formatarMod(prof) });
  }

  const agg = opts.efeitosAgregados;
  const somado = somarFontes(
    agg.bonusDano,
    opts.alcance === "corpo_a_corpo" ? agg.bonusDanoCC : agg.bonusDanoDistancia,
    opts.tecnica ? agg.bonusDanoTecnica : agg.bonusDanoComum,
  );
  const extra = somado.valor;
  const fontes = somado.fontes;
  if (extra !== 0) {
    total += extra;
    partes.push({
      rotulo: fontes.join(", ") || "Habilidade",
      texto: formatarMod(extra),
    });
  }

  if (partes.length === 0) return null;
  return {
    dados,
    modificador: total,
    formula: formulaAgrupada(dados, total),
    partes,
    fontes,
    rolavel: dados.length > 0 || total !== 0,
  };
}

// Fórmula agrupando dados iguais ("3d6+1d4+3").
function formulaAgrupada(dados: Dado[], mod: number): string {
  const partes: string[] = [];
  const contagem = new Map<string, number>();
  for (const d of dados) {
    const k = `${d.sinal}|${d.faces}`;
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  for (const [k, qtd] of contagem) {
    const [sinal, faces] = k.split("|");
    const prefixo = sinal === "-1" ? "−" : partes.length ? "+" : "";
    partes.push(`${prefixo}${qtd}d${faces}`);
  }
  if (mod !== 0) partes.push(`${mod > 0 ? (partes.length ? "+" : "") : "−"}${Math.abs(mod)}`);
  return partes.join("") || "0";
}

// ─── Técnicas / Ações ─────────────────────────────────────────────────

// Nível que libera cada grau de técnica (índice = grau − 1).
export const NIVEL_DO_GRAU = [1, 3, 6, 9, 12, 16, 20];

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

// Teto de atributo: limite do Aprimoramento, não um teto duro (vai até 30).
// A ficha só avisa. `teto-<atributo>` leva o limite a 20 + N.
export const TETO_ATRIBUTO_BASE = 20;

// Teto do Aprimoramento pelo nível: 20, 22 a partir do 12º, 24 a partir do 16º.
export function tetoDoNivel(nivel: number): number {
  if (nivel >= 16) return 24;
  if (nivel >= 12) return 22;
  return TETO_ATRIBUTO_BASE;
}

// Vale o maior entre o teto do nível e o dos efeitos.
export function tetoAtributo(
  bonusTeto: Partial<Record<Atributo, FonteValor>>,
  atributo: Atributo,
  nivel: number,
): { valor: number; fontes: string[] } {
  const b = bonusTeto[atributo];
  const doEfeito = TETO_ATRIBUTO_BASE + (b?.valor ?? 0);
  const doNivel = tetoDoNivel(nivel);
  return doEfeito > doNivel
    ? { valor: doEfeito, fontes: b?.fontes ?? [] }
    : { valor: doNivel, fontes: [] };
}

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
  | "item"
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
  { slug: "item", nome: "Item", icone: "fa-sack-dollar", cor: "var(--color-bonus)" },
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

// Tipos de efeito. Estruturados ao máximo possível pra automação
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
  | "vulnerabilidade"
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
  | "margem_critico"
  | "passo_dano"
  | "desconto_tecnica"
  | "dano_melhor_de"
  | "dano_extra"
  | "dados_extra"
  | "valor_fixo"
  | "falha_auto"
  | "reducao_dano"
  | "dano_maximo"
  | "piso_dado"
  | "critico_extra"
  | "ataque_poderoso"
  | "ignora_exaustao"
  | "descanso"
  | "por_turno"
  | "multi_ataque"
  | "explosao"
  | "progressivo"
  | "valor_igual"
  | "livre";

// Dano: dado no máximo, dado a partir de um número ou dano total. Ataque:
// crítico ou d20 a partir de um número.
export type GatilhoExplosao = "maximo" | "valor" | "total" | "critico";

// O que faz o bônus progressivo subir sozinho; sem isso, só na mão.
export type GatilhoProgressivo = "turno" | "rolagem";

export type EfeitoHabilidade =
  // `formula` (ex: "PROF/2+1", "3*NIVEL") vale no lugar de `valor` quando existe.
  // `duracaoPv`: em PV temporário, até quando ele dura (ausente = até acabar).
  | { tipo: "modificador"; alvo: string; valor: number; formula?: string; quando?: string; duracaoPv?: DuracaoPvTemp }
  | { tipo: "vantagem"; alvo: string; quando?: string }
  | { tipo: "desvantagem"; alvo: string; quando?: string }
  | { tipo: "proficiencia"; alvo: string; dobrada?: boolean }
  | { tipo: "recurso_delta"; recurso: string; valor: number }
  | { tipo: "cura"; valor: string; alvoCura?: string; duracaoPv?: DuracaoPvTemp }
  | { tipo: "condicao_imune"; condicao: string }
  | { tipo: "condicao_remover"; condicao: string }
  // `rodadas`: quanto dura no combate (1, 3 ou 10 = um minuto; ausente = 1).
  // `repete`: o afetado pode repetir a salvaguarda pra sair antes. `duracao`
  // é o texto livre de antes das rodadas, só descritivo.
  | { tipo: "condicao_aplicar"; condicao: string; cd?: number; duracao?: string; rodadas?: number; repete?: boolean }
  | { tipo: "resistencia"; tipoDano: string }
  | { tipo: "imunidade"; tipoDano: string }
  // Recebe o dobro do tipo de dano (depois da resistência).
  | { tipo: "vulnerabilidade"; tipoDano: string }
  | { tipo: "deslocamento"; tipoMov: string; valor: number }
  | { tipo: "multiplicador"; alvo: string; fator: number }
  // Faz um cálculo derivado (CR, iniciativa, salvaguarda, perícia, ataque) usar
  // outro atributo no lugar do padrão; `seMaior` só troca quando é melhor.
  | { tipo: "substituir_atributo"; alvo: string; atributo: Atributo; seMaior?: boolean }
  | { tipo: "rolagem"; formula: string; quando?: string }
  | { tipo: "trigger"; gatilho: string; efeito: string }
  // Faixa de crítico expandida (19-20, 18-20…). minimo = 19 significa
  // crítico em 19 e 20. `alvo` = em qual ataque (ausente = qualquer).
  | { tipo: "crit_range"; minimo: number; alvo?: string }
  // Rerrola uma jogada do contexto `gatilho`; `usos` por descanso longo.
  | { tipo: "reroll"; gatilho: string; usos: number }
  // Floor no d20: resultados ≤ minimo são tratados como minimo, nas jogadas
  // de `alvo` (slug contextual; ausente = qualquer d20).
  | { tipo: "floor_d20"; minimo: number; alvo?: string }
  // Sentido especial (visão no escuro, sentir presença, percepção sísmica…).
  // alcance opcional em metros — 0 = sem alcance explícito (passivo).
  | { tipo: "sentido"; sentido: string; alcance: number }
  // Ação/ataque/reação adicional. quantidade default = 1.
  // gatilho descreve quando se aplica (ex: "no turno", "1× por descanso").
  | { tipo: "acao_extra"; acao: string; quantidade: number; gatilho?: string }
  // Sucesso automático no tipo de jogada `alvo`.
  | { tipo: "sucesso_auto"; alvo: string; quando?: string }
  // Piso de dano: garante metade do dano MÁXIMO da fórmula rolada (arredonda
  // pra cima). Ex: "Preparação pra Batalha". Sem parâmetro — o piso depende da
  // fórmula, calculado no Rolador. `quando` é descritivo opcional.
  | ({ tipo: "dano_min"; quando?: string; em?: string } & FiltroDano)
  // Alcance: soma metros ou, com `vira`, troca por outro ("campo de visão").
  // DESCRITIVO: anota no chip da rolagem (o alcance da ficha é texto livre).
  // `alvo` = em qual ataque (ausente = qualquer).
  | { tipo: "alcance"; valor: number; vira?: string; alvo?: string; quando?: string }
  // Ignora uma defesa do alvo (resistência, imunidade, reação, cobertura).
  // Informativo: anota no chip de ataque/dano. `alvo` = o que ignora.
  | { tipo: "ignora"; alvo: string }
  // Substitui o tipo de dano (ex: Destruição Interna → Verdadeiro; Haki Ígneo →
  // Fogo). Informativo: anota no chip de dano.
  | { tipo: "trocar_dano"; tipoDano: string }
  // Imune a acerto crítico (defensivo). Descritivo no card; passiva na sidebar
  // fica pra etapa 4 (junto de resistências/imunidades).
  | { tipo: "crit_imune" }
  // Efeitos de arma (Meito): numa arma valem só nas rolagens com ela.
  // Soma à margem de crítico: 19-20 com margem 1 vira 18-20.
  | { tipo: "margem_critico"; valor: number }
  // Sobe o dado de dano da arma ou das técnicas.
  | { tipo: "passo_dano"; passos: number; alvo: "arma" | "tecnica" }
  // Desconto no custo de técnica: `valor` (ou `formula`, com GRAU) a menos, pela
  // metade ou de graça. `graus` limita aos graus dados; sem `minimo`, para na metade.
  | {
      tipo: "desconto_tecnica";
      valor: number;
      custo: "pp" | "pa";
      formula?: string;
      modo?: "metade" | "zero";
      minimo?: number;
      graus?: number[];
    }
  // Rola o dano N vezes e fica com o maior.
  | { tipo: "dano_melhor_de"; vezes: number; usos: number; quando?: string }
  // Soma uma fórmula numa rolagem ("1d10 fogo", "NIVELd4", "1d4"). Sem `sempre`,
  // nasce desligado no Rolador. `em` = dano (ausente = todo dano) ou jogada de d20.
  | ({ tipo: "dano_extra"; formula: string; sempre?: boolean; em?: string } & FiltroDano)
  // Mais dados iguais ao dado do dano ("2", "GRAU").
  | ({ tipo: "dados_extra"; quantidade: string; sempre?: boolean; em?: string } & FiltroDano)
  // O valor vira um número (vale o maior): CR, deslocamentos ou o dado da arma.
  | { tipo: "valor_fixo"; alvo: string; valor: string }
  // Falha automática no tipo de jogada `alvo`.
  | { tipo: "falha_auto"; alvo: string; quando?: string }
  // Reduz o dano recebido; `tipos` vazio = todos.
  | { tipo: "reducao_dano"; valor: number; formula?: string; tipos?: string; quando?: string }
  // Dados do dano no máximo. `apartir` liga sozinho com esse d20 (ou mais) no ataque.
  | ({ tipo: "dano_maximo"; em?: string; sempre?: boolean; apartir?: number } & FiltroDano)
  // Dado de dano que rolar até `ate` vira `vira` (0 = o máximo do dado).
  | ({ tipo: "piso_dado"; ate: number; vira: number; em?: string } & FiltroDano)
  // No crítico, os dados rolam `vezes` vezes e somam `dados` a mais.
  | ({ tipo: "critico_extra"; dados: number; vezes: number; em?: string } & FiltroDano)
  // Troca acerto por dano: −`penalidade` no ataque, +`bonus` no dano.
  | { tipo: "ataque_poderoso"; penalidade: number; bonus: number; alvo?: string }
  // Ignora os efeitos da exaustão até o nível `ate` (6 = todos).
  | { tipo: "ignora_exaustao"; ate: number }
  // Recupera a mais no descanso: níveis de exaustão, PP (fórmula) e Dados de Vida.
  | { tipo: "descanso"; em: "curto" | "longo" | "ambos"; exaustao: number; pp: string; dv: number }
  // Repete a cada turno (botão Passar turno): cura, PV temporário, dano em quem
  // tem o efeito ou recurso (PP, exaustão ou custom; `gasta` tira).
  | {
      tipo: "por_turno";
      o: OQuePorTurno;
      valor: string;
      recurso?: string;
      gasta?: boolean;
      tipoDano?: string;
    }
  // Ataca `vezes` de uma vez; com `soma`, são ataques a mais.
  | { tipo: "multi_ataque"; vezes: number; soma?: boolean; alvo?: string }
  // No gatilho, rola de novo e soma (dano) ou ataca de novo (ataque), até `limite` vezes.
  | { tipo: "explosao"; gatilho: GatilhoExplosao; valor?: number; limite: number; em?: string }
  // Bônus que cresce: `formula` por passo, até `max`. `passos` é a contagem, mexida
  // no card ou no Rolador; `cresce` sobe um passo sozinho (Passar turno ou rolagem).
  | {
      tipo: "progressivo";
      formula: string;
      max: number;
      em?: string;
      por?: string;
      passos?: number;
      cresce?: GatilhoProgressivo;
    }
  // O valor de `alvo` passa a ser o de `de` (com `metade`, a metade); vale o maior.
  | { tipo: "valor_igual"; alvo: string; de: string; metade?: boolean }
  | { tipo: "livre"; texto: string };

export type OQuePorTurno = "cura" | "pv_temp" | "dano" | "recurso";
const O_POR_TURNO = new Set<string>(["cura", "pv_temp", "dano", "recurso"]);

export const META_EFEITOS: Record<
  TipoEfeito,
  { nome: string; icone: string; cor: string }
> = {
  modificador:      { nome: "Bônus",       icone: "fa-plus-minus",     cor: "var(--efeito-neutro)" },
  vantagem:         { nome: "Vantagem",          icone: "fa-arrow-up",       cor: "var(--efeito-bom)" },
  desvantagem:      { nome: "Desvantagem",       icone: "fa-arrow-down",     cor: "var(--efeito-ruim)" },
  proficiencia:     { nome: "Proficiência",      icone: "fa-check-double",   cor: "var(--efeito-bom)" },
  recurso_delta:    { nome: "Recurso",           icone: "fa-droplet",        cor: "var(--efeito-neutro)" },
  cura:             { nome: "Cura",              icone: "fa-heart",          cor: "var(--efeito-bom)" },
  condicao_imune:   { nome: "Imune a Condição",           icone: "fa-shield",         cor: "var(--efeito-defesa)" },
  condicao_remover: { nome: "Remove Condição",            icone: "fa-broom",          cor: "var(--efeito-condicao)" },
  condicao_aplicar: { nome: "Aplica Condição",            icone: "fa-bolt",           cor: "var(--efeito-condicao)" },
  resistencia:      { nome: "Resistência",       icone: "fa-shield-halved",  cor: "var(--efeito-defesa)" },
  imunidade:        { nome: "Imunidade",         icone: "fa-shield",         cor: "var(--efeito-defesa)" },
  vulnerabilidade:  { nome: "Vulnerabilidade",   icone: "fa-heart-crack",    cor: "var(--efeito-ruim)" },
  deslocamento:     { nome: "Deslocamento",      icone: "fa-person-running", cor: "var(--efeito-neutro)" },
  multiplicador:    { nome: "Multiplicador",        icone: "fa-xmark",          cor: "var(--efeito-neutro)" },
  substituir_atributo: { nome: "Trocar Atributo", icone: "fa-right-left",    cor: "var(--efeito-neutro)" },
  rolagem:          { nome: "Rolagem à Parte",           icone: "fa-dice",           cor: "var(--efeito-neutro)" },
  trigger:          { nome: "Gatilho",           icone: "fa-bell",           cor: "var(--efeito-ataque)" },
  crit_range:       { nome: "Crítico Expandido", icone: "fa-burst",          cor: "var(--efeito-ataque)" },
  reroll:           { nome: "Rolar de Novo",     icone: "fa-rotate",         cor: "var(--efeito-bom)" },
  floor_d20:        { nome: "Mínimo no d20",     icone: "fa-circle-up",      cor: "var(--efeito-neutro)" },
  sentido:          { nome: "Sentido",            icone: "fa-eye",            cor: "var(--efeito-neutro)" },
  acao_extra:       { nome: "Ação Extra",         icone: "fa-forward",        cor: "var(--efeito-ataque)" },
  sucesso_auto:     { nome: "Sucesso Automático",       icone: "fa-check",          cor: "var(--efeito-bom)" },
  dano_min:         { nome: "Piso de Dano",       icone: "fa-shield-halved",  cor: "var(--efeito-ataque)" },
  alcance:          { nome: "Alcance Extra",      icone: "fa-ruler-horizontal", cor: "var(--efeito-neutro)" },
  ignora:           { nome: "Ignora Defesa",      icone: "fa-bolt-lightning", cor: "var(--efeito-ataque)" },
  trocar_dano:      { nome: "Troca de Dano", icone: "fa-fire",           cor: "var(--efeito-ataque)" },
  crit_imune:       { nome: "Imune a Crítico",    icone: "fa-shield",         cor: "var(--efeito-defesa)" },
  margem_critico:   { nome: "Margem de Crítico",  icone: "fa-burst",          cor: "var(--efeito-ataque)" },
  passo_dano:       { nome: "Passo de Dano",      icone: "fa-angles-up",      cor: "var(--efeito-ataque)" },
  desconto_tecnica: { nome: "Desconto em Técnica", icone: "fa-tag",           cor: "var(--efeito-bom)" },
  dano_melhor_de:   { nome: "Melhor no Dano",     icone: "fa-dice",           cor: "var(--efeito-bom)" },
  dano_extra:       { nome: "Dano Extra",         icone: "fa-plus",           cor: "var(--efeito-ataque)" },
  dados_extra:      { nome: "Dados Extras",       icone: "fa-dice-d6",        cor: "var(--efeito-ataque)" },
  valor_fixo:       { nome: "Valor Fixo",         icone: "fa-equals",         cor: "var(--efeito-neutro)" },
  falha_auto:       { nome: "Falha Automática",         icone: "fa-xmark",          cor: "var(--efeito-ruim)" },
  reducao_dano:     { nome: "Redução de Dano",    icone: "fa-shield-halved",  cor: "var(--efeito-defesa)" },
  dano_maximo:      { nome: "Dano Máximo",        icone: "fa-maximize",       cor: "var(--efeito-ataque)" },
  piso_dado:        { nome: "Dado Mínimo",        icone: "fa-dice-five",      cor: "var(--efeito-ataque)" },
  critico_extra:    { nome: "Crítico Maior",      icone: "fa-skull-crossbones", cor: "var(--efeito-ataque)" },
  ataque_poderoso:  { nome: "Acerto por Dano",    icone: "fa-scale-unbalanced", cor: "var(--efeito-ataque)" },
  ignora_exaustao:  { nome: "Ignora Exaustão",    icone: "fa-battery-full",   cor: "var(--efeito-bom)" },
  descanso:         { nome: "No Descanso",        icone: "fa-bed",            cor: "var(--efeito-neutro)" },
  por_turno:        { nome: "A Cada Turno",       icone: "fa-clock-rotate-left", cor: "var(--efeito-bom)" },
  multi_ataque:     { nome: "Multiataque",        icone: "fa-layer-group",    cor: "var(--efeito-ataque)" },
  explosao:         { nome: "Explosão",           icone: "fa-explosion",      cor: "var(--efeito-ataque)" },
  progressivo:      { nome: "Bônus Progressivo",  icone: "fa-arrow-trend-up", cor: "var(--efeito-ataque)" },
  valor_igual:      { nome: "Valor Igual",        icone: "fa-right-long",     cor: "var(--efeito-neutro)" },
  livre:            { nome: "Texto Livre",             icone: "fa-feather",        cor: "var(--text-sec)" },
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
    descricao: "Dá pontos de vida temporários",
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
    cor: "var(--bar-hp)",
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
    nome: "Cura",
    descricao: "Recupera PV (fórmula ou valor fixo)",
    icone: "fa-heart",
    cor: "var(--success)",
    grupo: "ajuste",
    criar: () => ({ tipo: "cura", valor: "" }),
  },
  {
    id: "bonus",
    nome: "Bônus",
    descricao: "Bônus numérico (perícia, atributo, CR, ataque…)",
    icone: "fa-plus-minus",
    cor: "var(--primary)",
    grupo: "ajuste",
    criar: () => ({ tipo: "modificador", alvo: "", valor: 0 }),
  },
  {
    id: "dado_em",
    nome: "Dado Extra",
    descricao: "Soma dados num ataque, teste ou salvaguarda (+1d4)",
    icone: "fa-dice-four",
    cor: "var(--primary)",
    grupo: "ajuste",
    criar: () => ({ tipo: "dano_extra", formula: "", em: "teste", sempre: true }),
  },
  {
    id: "multiplicador",
    nome: "Multiplicador",
    descricao: "Dobra capacidade de carga, etc",
    icone: "fa-xmark",
    cor: "var(--color-power)",
    grupo: "ajuste",
    criar: () => ({ tipo: "multiplicador", alvo: "", fator: 2 }),
  },
  {
    id: "valor_fixo",
    nome: "Valor Fixo",
    descricao: "CR, deslocamento, atributo ou dado da arma vira um número",
    icone: "fa-equals",
    cor: "var(--primary)",
    grupo: "ajuste",
    criar: () => ({ tipo: "valor_fixo", alvo: "cr", valor: "" }),
  },
  {
    id: "valor_igual",
    nome: "Valor Igual",
    descricao: "Um valor passa a ser igual a outro, ou à metade",
    icone: "fa-right-long",
    cor: "var(--primary)",
    grupo: "ajuste",
    criar: () => ({ tipo: "valor_igual", alvo: "nadar", de: "deslocamento" }),
  },
  {
    id: "descanso",
    nome: "No Descanso",
    descricao: "Recupera mais exaustão, PP ou Dados de Vida",
    icone: "fa-bed",
    cor: "var(--color-bonus)",
    grupo: "ajuste",
    criar: () => ({ tipo: "descanso", em: "longo", exaustao: 1, pp: "", dv: 0 }),
  },
  {
    id: "substituir_atributo",
    nome: "Trocar Atributo",
    descricao: "CR, iniciativa ou teste usa outro atributo (ex: CR via FOR)",
    icone: "fa-right-left",
    cor: "var(--primary)",
    grupo: "avancado",
    criar: () => ({ tipo: "substituir_atributo", alvo: "", atributo: "forca" }),
  },
  // ─ Buff / Debuff ─
  {
    id: "vantagem",
    nome: "Vantagem",
    descricao: "Vantagem em um tipo de teste",
    icone: "fa-arrow-up",
    cor: "var(--color-bonus)",
    grupo: "buff",
    criar: () => ({ tipo: "vantagem", alvo: "" }),
  },
  {
    id: "desvantagem",
    nome: "Desvantagem",
    descricao: "Desvantagem em um tipo de teste",
    icone: "fa-arrow-down",
    cor: "var(--danger)",
    grupo: "buff",
    criar: () => ({ tipo: "desvantagem", alvo: "" }),
  },
  {
    id: "proficiencia",
    nome: "Proficiência",
    descricao: "Proficiência em perícia ou salvaguarda",
    icone: "fa-check-double",
    cor: "var(--color-power)",
    grupo: "buff",
    criar: () => ({ tipo: "proficiencia", alvo: "" }),
  },
  // ─ Defesa ─
  {
    id: "resistencia",
    nome: "Resistência",
    descricao: "Reduz dano de um tipo pela metade",
    icone: "fa-shield-halved",
    cor: "var(--color-react)",
    grupo: "defesa",
    criar: () => ({ tipo: "resistencia", tipoDano: "" }),
  },
  {
    id: "imunidade",
    nome: "Imunidade",
    descricao: "Imune a um tipo de dano",
    icone: "fa-shield",
    cor: "var(--color-react)",
    grupo: "defesa",
    criar: () => ({ tipo: "imunidade", tipoDano: "" }),
  },
  {
    id: "vulnerabilidade",
    nome: "Vulnerabilidade",
    descricao: "Recebe o dobro de um tipo de dano",
    icone: "fa-heart-crack",
    cor: "var(--color-danger)",
    grupo: "defesa",
    criar: () => ({ tipo: "vulnerabilidade", tipoDano: "" }),
  },
  {
    id: "reducao_dano",
    nome: "Redução de Dano",
    descricao: "Recebe menos dano (−5)",
    icone: "fa-shield-halved",
    cor: "var(--color-react)",
    grupo: "defesa",
    criar: () => ({ tipo: "reducao_dano", valor: 5 }),
  },
  // ─ Condição ─
  {
    id: "condicao_imune",
    nome: "Imune a Condição",
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
    descricao: "Causa uma condição, com CD de salvaguarda",
    icone: "fa-bolt",
    cor: "var(--color-power)",
    grupo: "condicao",
    criar: () => ({ tipo: "condicao_aplicar", condicao: "" }),
  },
  {
    id: "ignora_exaustao",
    nome: "Ignora Exaustão",
    descricao: "Exaustão não pesa nos testes nem no deslocamento",
    icone: "fa-battery-full",
    cor: "var(--color-bonus)",
    grupo: "condicao",
    criar: () => ({ tipo: "ignora_exaustao", ate: 5 }),
  },
  // ─ Movimento ─
  {
    id: "deslocamento",
    nome: "Deslocamento",
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
    id: "margem_critico",
    nome: "Margem de Crítico",
    descricao: "Critica um número antes; soma com outras faixas",
    icone: "fa-burst",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "margem_critico", valor: 1 }),
  },
  {
    id: "passo_dano",
    nome: "Passo de Dano",
    descricao: "Sobe o dado de dano (1d8 → 1d10 → 1d12 → 2d6)",
    icone: "fa-angles-up",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "passo_dano", passos: 1, alvo: "arma" }),
  },
  {
    id: "desconto_tecnica",
    nome: "Desconto em Técnica",
    descricao: "Técnicas custam menos PP ou PA",
    icone: "fa-tag",
    cor: "var(--color-bonus)",
    grupo: "ativo",
    criar: () => ({ tipo: "desconto_tecnica", valor: 1, custo: "pp", minimo: 1 }),
  },
  {
    id: "dano_melhor_de",
    nome: "Melhor no Dano",
    descricao: "Rola o dano N vezes e fica com o maior",
    icone: "fa-dice",
    cor: "var(--color-bonus)",
    grupo: "ativo",
    criar: () => ({ tipo: "dano_melhor_de", vezes: 2, usos: 0 }),
  },
  {
    id: "dano_extra",
    nome: "Dano Extra",
    descricao: "Soma dados no dano (+1d4, +1d10 fogo)",
    icone: "fa-plus",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "dano_extra", formula: "" }),
  },
  {
    id: "dados_extra",
    nome: "Dados Extras",
    descricao: "Mais dados iguais aos do dano (+2 dados)",
    icone: "fa-dice-d6",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "dados_extra", quantidade: "1" }),
  },
  {
    id: "potencializacao",
    nome: "Potencialização",
    descricao: "Dados de dano a mais pelo grau da técnica",
    icone: "fa-dice-d6",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "dados_extra", quantidade: "GRAU", em: "dano-tecnica", sempre: true }),
  },
  {
    id: "progressivo",
    nome: "Bônus Progressivo",
    descricao: "Cresce a cada turno, acerto ou ponto gasto; em rolagem ou valor",
    icone: "fa-arrow-trend-up",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "progressivo", formula: "", max: 5 }),
  },
  {
    id: "multi_ataque",
    nome: "Multiataque",
    descricao: "Ataca várias vezes de uma vez",
    icone: "fa-layer-group",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "multi_ataque", vezes: 2 }),
  },
  {
    id: "explosao",
    nome: "Explosão",
    descricao: "No dado máximo ou no crítico, rola de novo",
    icone: "fa-explosion",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "explosao", gatilho: "maximo", limite: 1 }),
  },
  {
    id: "dano_maximo",
    nome: "Dano Máximo",
    descricao: "Os dados do dano saem no máximo",
    icone: "fa-maximize",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "dano_maximo" }),
  },
  {
    id: "piso_dado",
    nome: "Dado Mínimo",
    descricao: "Dado de dano baixo vira o máximo (1-2 vira 6)",
    icone: "fa-dice-five",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "piso_dado", ate: 2, vira: 0 }),
  },
  {
    id: "critico_extra",
    nome: "Crítico Maior",
    descricao: "Mais dados no crítico, ou crítico ×3",
    icone: "fa-skull-crossbones",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "critico_extra", dados: 1, vezes: 2 }),
  },
  {
    id: "ataque_poderoso",
    nome: "Acerto por Dano",
    descricao: "−5 no ataque, +10 no dano",
    icone: "fa-scale-unbalanced",
    cor: "var(--color-power)",
    grupo: "ativo",
    criar: () => ({ tipo: "ataque_poderoso", penalidade: 5, bonus: 10 }),
  },
  {
    id: "reroll",
    nome: "Rolar de Novo",
    descricao: "Rerrola um teste ou ataque",
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
    criar: () => ({ tipo: "floor_d20", minimo: 10, alvo: "teste" }),
  },
  {
    id: "recurso_delta",
    nome: "Recurso",
    descricao: "Mexe num recurso customizado (PC, PN…)",
    icone: "fa-droplet",
    cor: "var(--color-bonus)",
    grupo: "ativo",
    criar: () => ({ tipo: "recurso_delta", recurso: "", valor: 0 }),
  },
  {
    id: "sentido",
    nome: "Sentido",
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
    id: "falha_auto",
    nome: "Falha Automática",
    descricao: "Falha sem rolar em algum teste",
    icone: "fa-xmark",
    cor: "var(--color-danger)",
    grupo: "buff",
    criar: () => ({ tipo: "falha_auto", alvo: "" }),
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
    descricao: "Soma metros ao alcance, ou troca por outro (campo de visão)",
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
    nome: "Troca de Dano",
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
    nome: "Rolagem à Parte",
    descricao: "Botão no card pra rolar (ex: 12d12)",
    icone: "fa-dice",
    cor: "var(--primary)",
    grupo: "avancado",
    criar: () => ({ tipo: "rolagem", formula: "" }),
  },
  {
    id: "trigger",
    nome: "Gatilho",
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

// Graus de técnica (1º–7º), sem repetir e em ordem.
function lerGraus(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((g) => Math.trunc(Number(g))))]
    .filter((g) => g >= 1 && g <= 7)
    .sort((a, b) => a - b);
}

// Graus e tipos de dano em que um efeito de dano vale; vazio = todos.
function lerFiltroDano(obj: Record<string, unknown>): FiltroDano {
  const graus = lerGraus(obj.graus);
  const tipos = typeof obj.tipos === "string" ? obj.tipos.trim().slice(0, 80) : "";
  return { ...(graus.length ? { graus } : {}), ...(tipos ? { tipos } : {}) };
}

// Duração do PV temporário, só em efeito que dá PV temporário e só fora do padrão.
function duracaoPvDe(alvo: string, raw: unknown): { duracaoPv?: DuracaoPvTemp } {
  const a = alvo.trim().toLowerCase();
  if (a !== "hp-temp" && a !== "hptemp") return {};
  const d = lerDuracaoPvTemp(raw);
  return d === "acabar" ? {} : { duracaoPv: d };
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
    case "modificador": {
      if (!str(obj.alvo)) return null;
      // Fórmula que é só número vira `valor`.
      const formula = str(obj.formula).trim();
      const numerica = formula !== "" && Number.isFinite(Number(formula));
      return {
        tipo,
        alvo: str(obj.alvo),
        valor: Math.trunc(numerica ? Number(formula) : num(obj.valor)),
        ...(formula && !numerica ? { formula } : {}),
        ...(str(obj.quando) ? { quando: str(obj.quando) } : {}),
        ...duracaoPvDe(str(obj.alvo), obj.duracaoPv),
      };
    }
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
    case "recurso_delta": {
      if (!str(obj.recurso)) return null;
      // Legado: "Recurso → PV Máx" vira `modificador` de PV Máximo.
      const r = str(obj.recurso).trim().toLowerCase();
      if (r === "hp-max" || r === "hpmax") {
        return { tipo: "modificador", alvo: "hp-max", valor: Math.trunc(num(obj.valor)) };
      }
      return {
        tipo,
        recurso: str(obj.recurso),
        valor: Math.trunc(num(obj.valor)),
      };
    }
    case "cura":
      if (!str(obj.valor)) return null;
      return {
        tipo,
        valor: str(obj.valor),
        ...(str(obj.alvoCura) ? { alvoCura: str(obj.alvoCura) } : {}),
        ...duracaoPvDe(alvoDaCura({ alvoCura: str(obj.alvoCura) }), obj.duracaoPv),
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
      const rodadas = Math.trunc(num(obj.rodadas));
      if (rodadas > 0) e.rodadas = Math.min(100, rodadas);
      if (obj.repete === true) e.repete = true;
      return e;
    }
    case "resistencia":
    case "imunidade":
    case "vulnerabilidade":
      if (!str(obj.tipoDano)) return null;
      return { tipo, tipoDano: str(obj.tipoDano) };
    case "deslocamento":
      if (!str(obj.tipoMov)) return null;
      return { tipo, tipoMov: str(obj.tipoMov), valor: num(obj.valor) };
    case "valor_igual": {
      const alvo = str(obj.alvo).trim().toLowerCase();
      const de = str(obj.de).trim().toLowerCase();
      if (!VALORES_IGUAIS_SET.has(alvo) || !VALORES_IGUAIS_SET.has(de) || alvo === de) return null;
      // Atributo só copia de outro atributo.
      if (ATRIBUTOS_SET.has(alvo) && !ATRIBUTOS_SET.has(de)) return null;
      return { tipo, alvo, de, ...(obj.metade ? { metade: true } : {}) };
    }
    case "multiplicador":
      if (!str(obj.alvo)) return null;
      return { tipo, alvo: str(obj.alvo), fator: num(obj.fator) };
    case "substituir_atributo": {
      const alvo = str(obj.alvo);
      const atributo = str(obj.atributo);
      if (!alvo || !ATRIBUTOS_SET.has(atributo)) return null;
      return { tipo, alvo, atributo: atributo as Atributo, ...(obj.seMaior ? { seMaior: true } : {}) };
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
      return { tipo, minimo: clamp, ...(str(obj.alvo) ? { alvo: str(obj.alvo) } : {}) };
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
      return { tipo, minimo: clamp, ...(str(obj.alvo) ? { alvo: str(obj.alvo) } : {}) };
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
      return {
        tipo,
        ...(str(obj.quando) ? { quando: str(obj.quando) } : {}),
        ...(str(obj.em) ? { em: str(obj.em) } : {}),
        ...lerFiltroDano(obj),
      };
    case "alcance": {
      const vira = str(obj.vira).trim().slice(0, 40);
      const valor = vira ? 0 : Math.trunc(num(obj.valor));
      if (!vira && !valor) return null;
      return {
        tipo,
        valor,
        ...(vira ? { vira } : {}),
        ...(str(obj.alvo) && str(obj.alvo) !== "ataque" ? { alvo: str(obj.alvo) } : {}),
        ...(str(obj.quando) ? { quando: str(obj.quando) } : {}),
      };
    }
    case "ignora":
      if (!str(obj.alvo)) return null;
      return { tipo, alvo: str(obj.alvo) };
    case "trocar_dano":
      if (!str(obj.tipoDano)) return null;
      return { tipo, tipoDano: str(obj.tipoDano) };
    case "crit_imune":
      return { tipo };
    case "margem_critico":
      // Margem no máximo 18 (o 1 é sempre falha).
      return { tipo, valor: Math.min(18, Math.max(1, Math.trunc(num(obj.valor)) || 1)) };
    case "passo_dano":
      return {
        tipo,
        passos: Math.min(6, Math.max(1, Math.trunc(num(obj.passos)) || 1)),
        alvo: obj.alvo === "tecnica" ? "tecnica" : "arma",
      };
    case "desconto_tecnica": {
      const formula = str(obj.formula).trim();
      const numerica = formula !== "" && Number.isFinite(Number(formula));
      const graus = lerGraus(obj.graus);
      const semMinimo = obj.minimo === undefined || obj.minimo === null || obj.minimo === "";
      return {
        tipo,
        valor: Math.max(1, Math.trunc(numerica ? Number(formula) : num(obj.valor)) || 1),
        custo: obj.custo === "pa" ? "pa" : "pp",
        ...(formula && !numerica ? { formula } : {}),
        ...(obj.modo === "metade" || obj.modo === "zero" ? { modo: obj.modo } : {}),
        ...(semMinimo ? {} : { minimo: Math.max(0, Math.trunc(num(obj.minimo))) }),
        ...(graus.length ? { graus } : {}),
      };
    }
    case "dano_melhor_de":
      return {
        tipo,
        vezes: Math.min(5, Math.max(2, Math.trunc(num(obj.vezes)) || 2)),
        usos: Math.max(0, Math.trunc(num(obj.usos))),
        ...(str(obj.quando) ? { quando: str(obj.quando) } : {}),
      };
    case "dano_extra":
      if (!str(obj.formula).trim()) return null;
      return {
        tipo,
        formula: str(obj.formula).trim(),
        ...(obj.sempre ? { sempre: true } : {}),
        ...(str(obj.em) ? { em: str(obj.em) } : {}),
        ...lerFiltroDano(obj),
      };
    case "dados_extra":
      if (!str(obj.quantidade).trim() && !num(obj.quantidade)) return null;
      return {
        tipo,
        quantidade: str(obj.quantidade).trim() || String(Math.trunc(num(obj.quantidade))),
        ...(obj.sempre ? { sempre: true } : {}),
        ...(str(obj.em) ? { em: str(obj.em) } : {}),
        ...lerFiltroDano(obj),
      };
    case "valor_fixo":
      if (!str(obj.alvo) || !str(obj.valor).trim()) return null;
      return { tipo, alvo: str(obj.alvo), valor: str(obj.valor).trim() };
    case "falha_auto":
      if (!str(obj.alvo)) return null;
      return {
        tipo,
        alvo: str(obj.alvo),
        ...(str(obj.quando) ? { quando: str(obj.quando) } : {}),
      };
    case "reducao_dano": {
      const formula = str(obj.formula).trim();
      const numerica = formula !== "" && Number.isFinite(Number(formula));
      return {
        tipo,
        valor: Math.max(0, Math.trunc(numerica ? Number(formula) : num(obj.valor))),
        ...(formula && !numerica ? { formula } : {}),
        ...(str(obj.tipos).trim() ? { tipos: str(obj.tipos).trim() } : {}),
        ...(str(obj.quando) ? { quando: str(obj.quando) } : {}),
      };
    }
    case "dano_maximo": {
      const apartir = Math.trunc(num(obj.apartir));
      return {
        tipo,
        ...(str(obj.em) ? { em: str(obj.em) } : {}),
        ...(obj.sempre ? { sempre: true } : {}),
        ...(apartir >= 2 && apartir <= 20 ? { apartir } : {}),
        ...lerFiltroDano(obj),
      };
    }
    case "piso_dado":
      return {
        tipo,
        ate: Math.min(20, Math.max(1, Math.trunc(num(obj.ate)) || 1)),
        vira: Math.min(100, Math.max(0, Math.trunc(num(obj.vira)))),
        ...(str(obj.em) ? { em: str(obj.em) } : {}),
        ...lerFiltroDano(obj),
      };
    case "critico_extra":
      return {
        tipo,
        dados: Math.min(10, Math.max(0, Math.trunc(num(obj.dados)))),
        vezes: Math.min(4, Math.max(2, Math.trunc(num(obj.vezes)) || 2)),
        ...(str(obj.em) ? { em: str(obj.em) } : {}),
        ...lerFiltroDano(obj),
      };
    case "ataque_poderoso":
      return {
        tipo,
        penalidade: Math.min(20, Math.max(0, Math.trunc(num(obj.penalidade)))),
        bonus: Math.min(50, Math.max(0, Math.trunc(num(obj.bonus)))),
        ...(str(obj.alvo) ? { alvo: str(obj.alvo) } : {}),
      };
    case "ignora_exaustao":
      return { tipo, ate: Math.min(6, Math.max(1, Math.trunc(num(obj.ate)) || 5)) };
    case "descanso": {
      const exaustao = Math.min(6, Math.max(0, Math.trunc(num(obj.exaustao))));
      const pp = str(obj.pp).trim();
      const dv = Math.min(20, Math.max(0, Math.trunc(num(obj.dv))));
      if (!exaustao && !pp && !dv) return null;
      return {
        tipo,
        em: obj.em === "curto" || obj.em === "ambos" ? obj.em : "longo",
        exaustao,
        pp,
        dv,
      };
    }
    case "por_turno": {
      const o = str(obj.o);
      const valor = str(obj.valor).trim();
      if (!O_POR_TURNO.has(o) || !valor) return null;
      const recurso = str(obj.recurso).trim();
      if (o === "recurso" && !recurso) return null;
      return {
        tipo,
        o: o as OQuePorTurno,
        valor,
        ...(o === "recurso" ? { recurso } : {}),
        ...(o === "recurso" && obj.gasta ? { gasta: true } : {}),
        ...(o === "dano" && str(obj.tipoDano).trim() ? { tipoDano: str(obj.tipoDano).trim().slice(0, 40) } : {}),
      };
    }
    case "multi_ataque": {
      const soma = !!obj.soma;
      const minimo = soma ? 1 : 2;
      return {
        tipo,
        vezes: Math.min(20, Math.max(minimo, Math.trunc(num(obj.vezes)) || minimo)),
        ...(soma ? { soma: true } : {}),
        ...(str(obj.alvo) ? { alvo: str(obj.alvo) } : {}),
      };
    }
    case "explosao": {
      const em = str(obj.em).trim().toLowerCase();
      const noAtaque = em.startsWith("ataque");
      const g = str(obj.gatilho);
      const gatilho: GatilhoExplosao = noAtaque
        ? g === "valor"
          ? "valor"
          : "critico"
        : g === "valor" || g === "total"
          ? g
          : "maximo";
      const comValor = gatilho === "valor" || gatilho === "total";
      // No d20 o número vai de 2 a 20.
      const teto = noAtaque ? 20 : 999;
      const padrao = noAtaque || gatilho === "total" ? 20 : 6;
      return {
        tipo,
        gatilho,
        ...(comValor
          ? { valor: Math.min(teto, Math.max(2, Math.trunc(num(obj.valor)) || padrao)) }
          : {}),
        limite: Math.min(10, Math.max(1, Math.trunc(num(obj.limite)) || 1)),
        ...(em && em !== "dano" ? { em } : {}),
      };
    }
    case "progressivo": {
      const formula = str(obj.formula).trim();
      if (!formula) return null;
      const por = str(obj.por).trim().slice(0, 24);
      const max = Math.min(20, Math.max(1, Math.trunc(num(obj.max)) || 5));
      const passos = Math.min(max, Math.max(0, Math.trunc(num(obj.passos))));
      const cresce = obj.cresce === "turno" || obj.cresce === "rolagem" ? obj.cresce : null;
      return {
        tipo,
        formula,
        max,
        ...(str(obj.em) ? { em: str(obj.em) } : {}),
        // Com gatilho, o "por" é o próprio gatilho.
        ...(por && !cresce ? { por } : {}),
        ...(passos ? { passos } : {}),
        ...(cresce ? { cresce } : {}),
      };
    }
    case "livre":
      if (!str(obj.texto)) return null;
      return { tipo, texto: str(obj.texto) };
    default:
      return null;
  }
}

// Deslocamentos que um efeito mexe; "caminhar" é o deslocamento base.
export const MOVIMENTOS: { slug: string; nome: string }[] = [
  { slug: "caminhar", nome: "Andar" },
  { slug: "nadar", nome: "Nadar" },
  { slug: "voar", nome: "Voar" },
  { slug: "escalar", nome: "Escalar" },
  { slug: "cavar", nome: "Cavar" },
];


// ─── Alvos canônicos de efeito (slugs que a automação reconhece) ─────

// Slugs aceitos pelo `agregarEfeitos`. Alvos fora desta lista continuam
// salvos no banco mas são apenas descritivos (mostram no chip, não mexem
// em nenhum cálculo). Útil pra exibir como datalist no editor.
export const ALVOS_AGREGAVEIS: { slug: string; nome: string; grupo: string }[] = [
  ...PERICIAS.map((p) => ({ slug: p.slug, nome: p.nome, grupo: "Perícia" })),
  { slug: "teste", nome: "Testes (todos)", grupo: "Testes" },
  ...ATRIBUTOS.map((a) => ({
    slug: `teste-${a.slug}`,
    nome: `Testes de ${a.nome}`,
    grupo: "Testes",
  })),
  { slug: "salvaguarda", nome: "Salvaguardas (todas)", grupo: "Salvaguarda" },
  ...ATRIBUTOS.map((a) => ({
    slug: `salv-${a.slug}`,
    nome: `Salv. ${a.nome}`,
    grupo: "Salvaguarda",
  })),
  { slug: "concentracao", nome: "Concentração", grupo: "Salvaguarda" },
  ...ATRIBUTOS.map((a) => ({ slug: a.slug, nome: a.nome, grupo: "Atributo" })),
  ...ATRIBUTOS.map((a) => ({
    slug: `teto-${a.slug}`,
    nome: `Limite ${a.nome}`,
    grupo: "Limite de Atributo",
  })),
  { slug: "qualquer", nome: "Todas as jogadas", grupo: "Geral" },
  { slug: "cr", nome: "Classe de Resistência", grupo: "Geral" },
  { slug: "iniciativa", nome: "Iniciativa", grupo: "Geral" },
  { slug: "percepcao-passiva", nome: "Percepção Passiva", grupo: "Geral" },
  { slug: "deslocamento", nome: "Deslocamento", grupo: "Geral" },
  { slug: "carga", nome: "Capacidade de Carga", grupo: "Geral" },
  { slug: "hp-max", nome: "PV Máximo", grupo: "PV e PP" },
  { slug: "hp-temp", nome: "PV Temporário", grupo: "PV e PP" },
  { slug: "pp-max", nome: "PP Máximo", grupo: "PV e PP" },
  { slug: "ataque", nome: "Ataque (geral)", grupo: "Combate" },
  { slug: "ataque-cc", nome: "Ataque CC", grupo: "Combate" },
  { slug: "ataque-distancia", nome: "Ataque à Distância", grupo: "Combate" },
  { slug: "ataque-tecnica", nome: "Ataque de técnica", grupo: "Combate" },
  { slug: "ataque-comum", nome: "Ataque comum", grupo: "Combate" },
  { slug: "dano", nome: "Dano (geral)", grupo: "Combate" },
  { slug: "dano-cc", nome: "Dano CC", grupo: "Combate" },
  { slug: "dano-distancia", nome: "Dano à Distância", grupo: "Combate" },
  { slug: "dano-tecnica", nome: "Dano de técnica", grupo: "Combate" },
  { slug: "dano-comum", nome: "Dano de ataque comum", grupo: "Combate" },
  { slug: "cd-tecnicas", nome: "CD das Técnicas", grupo: "Combate" },
];

const PERICIAS_SET = new Set<string>(PERICIAS.map((p) => p.slug));
const ATRIBUTOS_SET = new Set<string>(ATRIBUTOS.map((a) => a.slug));

// ─── Alvos contextuais (rolagens) ─────────────────────────────
// Slugs que vantagem, desvantagem, sucesso_auto e reroll casam com a rolagem.
export const ALVOS_CONTEXTUAIS: { slug: string; nome: string; grupo: string }[] = [
  { slug: "qualquer", nome: "Qualquer d20", grupo: "Genérico" },
  { slug: "ataque", nome: "Ataque (qualquer)", grupo: "Combate" },
  { slug: "ataque-cc", nome: "Ataque CC", grupo: "Combate" },
  { slug: "ataque-distancia", nome: "Ataque à Distância", grupo: "Combate" },
  { slug: "ataque-tecnica", nome: "Ataque de técnica", grupo: "Combate" },
  { slug: "ataque-comum", nome: "Ataque comum", grupo: "Combate" },
  { slug: "iniciativa", nome: "Iniciativa", grupo: "Combate" },
  { slug: "salvaguarda", nome: "Salvaguardas (todas)", grupo: "Salvaguarda" },
  ...ATRIBUTOS.map((a) => ({
    slug: `salv-${a.slug}`,
    nome: `Salv. ${a.nome}`,
    grupo: "Salvaguarda",
  })),
  { slug: "concentracao", nome: "Concentração", grupo: "Salvaguarda" },
  { slug: "teste", nome: "Testes (todos)", grupo: "Testes" },
  ...ATRIBUTOS.map((a) => ({
    slug: `teste-${a.slug}`,
    nome: `Testes de ${a.nome}`,
    grupo: "Testes",
  })),
  ...PERICIAS.map((p) => ({ slug: p.slug, nome: p.nome, grupo: "Perícia" })),
];

const ALVOS_CONTEXTUAIS_SET = new Set(ALVOS_CONTEXTUAIS.map((a) => a.slug));

// Cálculos cujo atributo pode ser trocado por um efeito `substituir_atributo`:
// CR, iniciativa, testes, salvaguardas, perícias e ataque com arma (sem atributo
// escolhido na arma). Técnica já tem seletor de atributo na própria Ação.
export const ALVOS_SUBSTITUIVEIS: { slug: string; nome: string; grupo: string }[] = [
  { slug: "cr", nome: "Classe de Resistência", grupo: "Geral" },
  { slug: "iniciativa", nome: "Iniciativa", grupo: "Geral" },
  { slug: "ataque-cc", nome: "Ataque CC com arma", grupo: "Combate" },
  { slug: "ataque-distancia", nome: "Ataque à distância com arma", grupo: "Combate" },
  ...ATRIBUTOS.map((a) => ({
    slug: `teste-${a.slug}`,
    nome: `Testes de ${a.nome}`,
    grupo: "Testes",
  })),
  ...ATRIBUTOS.map((a) => ({
    slug: `salv-${a.slug}`,
    nome: `Salv. ${a.nome}`,
    grupo: "Salvaguarda",
  })),
  ...PERICIAS.map((p) => ({ slug: p.slug, nome: p.nome, grupo: "Perícia" })),
];

// Em qual ataque (crítico expandido).
export const ALVOS_ATAQUE = ALVOS_CONTEXTUAIS.filter((a) => a.slug.startsWith("ataque"));

// Em qual dano (dano extra, dados extras, piso de dano).
export const ALVOS_DANO: { slug: string; nome: string; grupo: string }[] = [
  { slug: "dano", nome: "Todo dano", grupo: "Dano" },
  { slug: "dano-cc", nome: "Dano CC", grupo: "Dano" },
  { slug: "dano-distancia", nome: "Dano à distância", grupo: "Dano" },
  { slug: "dano-tecnica", nome: "Dano de técnica", grupo: "Dano" },
  { slug: "dano-comum", nome: "Dano de ataque comum", grupo: "Dano" },
];

const ALVOS_DANO_SET = new Set(ALVOS_DANO.map((a) => a.slug));

// Cura de PV como alvo de dado a mais (soma sempre, na hora do uso).
const ALVO_CURA = { slug: "cura", nome: "Cura de PV", grupo: "Cura" };

// Em qual rolagem um dado extra soma: dano, cura de PV ou jogada de d20.
export const ALVOS_DADO_EXTRA: { slug: string; nome: string; grupo: string }[] = [
  ...ALVOS_DANO,
  ALVO_CURA,
  ...ALVOS_CONTEXTUAIS,
];

// Dado extra que soma no dano (sem alvo = todo dano).
export function extraNoDano(em: string | undefined): boolean {
  const alvo = (em ?? "").trim().toLowerCase();
  return !alvo || ALVOS_DANO_SET.has(alvo);
}

// Nome do efeito no card; Dano Extra numa jogada de d20 vira "Dado Extra".
export function nomeDoEfeito(e: EfeitoHabilidade): string {
  if (e.tipo === "dano_extra" && !extraNoDano(e.em)) return "Dado Extra";
  return META_EFEITOS[e.tipo].nome;
}

// Alvo de bônus que cai numa rolagem (teste, ataque ou dano), não num valor fixo.
export function alvoDeRolagem(alvoRaw: string, slugsPericiaCustom: Set<string> = new Set()): boolean {
  const alvo = alvoRaw.trim().toLowerCase();
  return ALVOS_CONTEXTUAIS_SET.has(alvo) || ALVOS_DANO_SET.has(alvo) || slugsPericiaCustom.has(alvo);
}

// O que um `valor_fixo` pode definir.
export const ALVOS_VALOR_FIXO: { slug: string; nome: string; grupo: string }[] = [
  { slug: "cr", nome: "Classe de Resistência", grupo: "Geral" },
  { slug: "deslocamento", nome: "Deslocamento", grupo: "Deslocamento" },
  { slug: "nadar", nome: "Nadar", grupo: "Deslocamento" },
  { slug: "voar", nome: "Voar", grupo: "Deslocamento" },
  { slug: "escalar", nome: "Escalar", grupo: "Deslocamento" },
  { slug: "cavar", nome: "Cavar", grupo: "Deslocamento" },
  ...ATRIBUTOS.map((a) => ({ slug: a.slug, nome: a.nome, grupo: "Atributo" })),
  { slug: "dado-arma", nome: "Dado da arma", grupo: "Combate" },
];

// Valores que um `valor_igual` define e de onde copia.
export const ALVOS_VALOR_IGUAL = ALVOS_VALOR_FIXO.filter((a) => a.slug !== "dado-arma");

const VALORES_IGUAIS_SET = new Set(ALVOS_VALOR_IGUAL.map((a) => a.slug));

// CR e atributo são inteiros: a metade arredonda pra baixo.
const VALORES_INTEIROS = new Set<string>(["cr", ...ATRIBUTOS.map((a) => a.slug)]);

export type ValorIgual = { alvo: string; de: string; metade: boolean; fonte: string };

// Valores já calculados com os "valor igual" por cima (vale o maior).
export function comValoresIguais(
  base: Record<string, { valor: number; fontes: string[] }>,
  iguais: ValorIgual[],
): Record<string, { valor: number; fontes: string[] }> {
  const out = { ...base };
  // Duas voltas: uma cópia pode partir de outra.
  for (let volta = 0; volta < 2; volta++) {
    for (const c of iguais) {
      const origem = out[c.de];
      if (!origem) continue;
      const metade = VALORES_INTEIROS.has(c.alvo) ? Math.floor(origem.valor / 2) : origem.valor / 2;
      const valor = c.metade ? metade : origem.valor;
      if (valor > (out[c.alvo]?.valor ?? 0)) out[c.alvo] = { valor, fontes: [c.fonte] };
    }
  }
  return out;
}

// Atributos com os "valor igual" entre atributos por cima.
function comAtributosIguais(
  atributos: Record<Atributo, number>,
  iguais: ValorIgual[],
): Record<Atributo, number> {
  const copias = iguais.filter((c) => ATRIBUTOS_SET.has(c.alvo) && ATRIBUTOS_SET.has(c.de));
  if (copias.length === 0) return atributos;
  const com = comValoresIguais(
    Object.fromEntries(ATRIBUTOS.map((a) => [a.slug, { valor: atributos[a.slug], fontes: [] }])),
    copias,
  );
  const out = { ...atributos };
  for (const a of ATRIBUTOS) out[a.slug] = com[a.slug].valor;
  return out;
}

// Bônus progressivo num valor da ficha (não numa rolagem): a contagem fica no efeito.
export function progressivoNaFicha(
  em: string | undefined,
  slugsPericiaCustom: Set<string> = new Set(),
): boolean {
  const alvo = (em ?? "").trim().toLowerCase();
  return !!alvo && !alvoDeRolagem(alvo, slugsPericiaCustom);
}

// "turno", "rolagem" ou o texto livre do efeito.
function porDoProgressivo(e: { cresce?: GatilhoProgressivo; por?: string }): string {
  return e.cresce ?? e.por ?? "vez";
}

// Evento do Rolador: a contagem de um bônus progressivo mudou lá.
export const EVENTO_PASSOS = "rpgo:passos-progressivo";

// `passos` grava a contagem; `soma` sobe a partir da que a ficha tem.
type ContagemDoRolador = { formula: string; em: string } & ({ passos: number } | { soma: number });

export type PassosDoRolador = { fonte: string } & ContagemDoRolador;

// Efeitos com a contagem nova no progressivo que casa; null se nada muda.
export function comPassosProgressivos(
  efeitos: EfeitoHabilidade[],
  d: ContagemDoRolador,
): EfeitoHabilidade[] | null {
  let mudou = false;
  const novos = efeitos.map((e) => {
    if (e.tipo !== "progressivo" || e.formula !== d.formula) return e;
    if (((e.em ?? "dano").trim().toLowerCase() || "dano") !== d.em) return e;
    const pedido = "soma" in d ? (e.passos ?? 0) + d.soma : d.passos;
    const passos = Math.min(e.max, Math.max(0, Math.trunc(pedido)));
    if (passos === (e.passos ?? 0)) return e;
    mudou = true;
    return { ...e, passos: passos || undefined };
  });
  return mudou ? novos : null;
}

// Passar turno: os progressivos "por turno" sobem um passo; null se nenhum sobe.
export function crescerPorTurno(
  raw: unknown,
): { efeitos: EfeitoHabilidade[]; textos: string[] } | null {
  const textos: string[] = [];
  const efeitos = lerEfeitos(raw).map((e) => {
    if (e.tipo !== "progressivo" || e.cresce !== "turno" || (e.passos ?? 0) >= e.max) return e;
    const passos = (e.passos ?? 0) + 1;
    textos.push(`bônus progressivo ${passos} de ${e.max}`);
    return { ...e, passos };
  });
  return textos.length ? { efeitos, textos } : null;
}

export type Substituicao = { atributo: Atributo; fontes: string[]; seMaior?: boolean };

// Resolve o atributo efetivo de um cálculo derivado: a primeira substituição
// que existe entre os alvos (ex: perícia, depois "Testes de X"); com `seMaior`,
// só troca quando o modificador novo é maior.
export function atributoDeCalculo(
  alvo: string | string[],
  padrao: Atributo,
  subs: Partial<Record<string, Substituicao>>,
  atributos?: Record<Atributo, number>,
): { atributo: Atributo; fontes: string[]; substituido: boolean } {
  for (const a of Array.isArray(alvo) ? alvo : [alvo]) {
    const s = subs[a.trim().toLowerCase()];
    if (!s) continue;
    if (s.seMaior && atributos && modificador(atributos[s.atributo]) <= modificador(atributos[padrao])) {
      continue;
    }
    return { atributo: s.atributo, fontes: s.fontes, substituido: true };
  }
  return { atributo: padrao, fontes: [], substituido: false };
}

// Rótulo amigável de um slug de alvo canônico (perícia, salvaguarda, pool…),
// pra chips/resumos não vazarem o slug cru ("hp-temp"). Cobre os dois catálogos
// (agregáveis + contextuais); cai pro próprio slug se for texto livre.
const ROTULO_ALVO = new Map<string, string>(
  [...ALVOS_AGREGAVEIS, ...ALVOS_CONTEXTUAIS, ALVO_CURA].map((a) => [a.slug, a.nome]),
);
export function rotuloAlvo(slug: string): string {
  return ROTULO_ALVO.get(slug.trim().toLowerCase()) ?? slug;
}

// Marca o tipo de rolagem que tá acontecendo. Quem dispara a rolagem
// monta um `ContextoRolagem`, e `casaContexto(alvo, ctx)` decide se o
// efeito daquele alvo se aplica.
export type ContextoRolagem =
  // `municao`: item que o ataque gasta ao rolar.
  | {
      tipo: "ataque";
      alcance: "corpo_a_corpo" | "distancia";
      tecnica?: boolean;
      municao?: { id: string; nome: string };
    }
  // `concentracao`: a salvaguarda de CON pra manter a concentração.
  | { tipo: "salvaguarda"; atributo: Atributo; concentracao?: boolean }
  // `pericia` é string livre: cobre as 18 canônicas e perícias customizadas
  // (slug por-personagem, fora do set canônico). `atributo` = o usado no teste.
  | { tipo: "pericia"; pericia: string; atributo?: Atributo }
  | { tipo: "teste-atributo"; atributo: Atributo }
  | { tipo: "iniciativa" }
  // Rolagem de dano (não é d20): só valem os efeitos de dano. `tiposDano` = os
  // tipos escritos no dano (vazio = não se sabe).
  | {
      tipo: "dano";
      alcance: "corpo_a_corpo" | "distancia";
      tecnica?: boolean;
      grau?: number;
      tiposDano?: string[];
    };

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
      if (alvo === "ataque-tecnica") return !!ctx.tecnica;
      if (alvo === "ataque-comum") return !ctx.tecnica;
      return false;
    case "salvaguarda":
      if (!ALVOS_CONTEXTUAIS_SET.has(alvo)) return false;
      if (alvo === "salvaguarda") return true;
      if (alvo === "concentracao") return !!ctx.concentracao;
      return alvo === `salv-${ctx.atributo}`;
    case "pericia":
      // Casa por igualdade exata com o slug rolado — não exige presença no set
      // canônico, então perícias customizadas (slug por-personagem) também casam.
      // Sem risco de falso-positivo: ctx.pericia é sempre uma perícia que existe.
      if (alvo === "teste") return true;
      if (ctx.atributo && alvo === `teste-${ctx.atributo}`) return true;
      return alvo === ctx.pericia;
    case "teste-atributo":
      if (alvo === "teste") return true;
      return alvo === `teste-${ctx.atributo}`;
    case "iniciativa":
      // Iniciativa é um Teste de Destreza.
      return alvo === "iniciativa" || alvo === "teste" || alvo === "teste-destreza";
  }
}

// Grau e tipo do efeito contra o dano rolado: "talvez" quando a técnica não tem
// grau ou o dano não diz o tipo (o chip nasce desligado e o jogador decide).
export function filtroDeDano(x: FiltroDano, ctx: ContextoRolagem): "sim" | "talvez" | "nao" {
  if (ctx.tipo !== "dano") return "nao";
  let talvez = false;
  if (x.graus?.length) {
    if (!ctx.tecnica) return "nao";
    if (!ctx.grau) talvez = true;
    else if (!x.graus.includes(ctx.grau)) return "nao";
  }
  if (x.tipos?.trim()) {
    const tipos = ctx.tiposDano ?? [];
    const cob = lerCobertura(x.tipos);
    if (tipos.length === 0) talvez = true;
    else if (!tipos.some((t) => cobre(cob, t, false))) return "nao";
  }
  return talvez ? "talvez" : "sim";
}

// "só no 1º–4º grau, em cortante".
export function textoFiltroDano(x: FiltroDano): string | undefined {
  const partes: string[] = [];
  if (x.graus?.length) {
    const g = x.graus;
    const seguidos = g.every((v, i) => i === 0 || v === g[i - 1] + 1);
    partes.push(
      g.length === 1
        ? `no ${g[0]}º grau`
        : seguidos
          ? `do ${g[0]}º ao ${g[g.length - 1]}º grau`
          : `nos graus ${g.map((v) => `${v}º`).join(", ")}`,
    );
  }
  if (x.tipos?.trim()) partes.push(`em ${x.tipos.trim()}`);
  return partes.length ? `só ${partes.join(", ")}` : undefined;
}

// Efeito de dano (`em`) casa com a rolagem de dano. Vazio = todo dano.
export function casaDano(emRaw: string | undefined, ctx: ContextoRolagem): boolean {
  if (ctx.tipo !== "dano") return false;
  const em = (emRaw ?? "").trim().toLowerCase();
  if (!em || em === "dano") return true;
  if (em === "dano-cc") return ctx.alcance === "corpo_a_corpo";
  if (em === "dano-distancia") return ctx.alcance === "distancia";
  if (em === "dano-tecnica") return !!ctx.tecnica;
  if (em === "dano-comum") return !ctx.tecnica;
  return false;
}

type FonteValor = { valor: number; fontes: string[] };
// Efeito que gasta os usos da habilidade que o dá. `livre`: alguma fonte não
// tem limite; senão `gasta` é a habilidade que perde 1 uso e `usos` o saldo.
export type UsoLimitado = { fontes: string[]; livre: boolean; gasta?: string; usos?: string };
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
// Proficiência em perícia vinda de efeito; `dobrada` se alguma fonte dobra.
type FonteProficiencia = FonteLista & { dobrada: boolean };

// Efeito que depende do contexto da rolagem (casa via `casaContexto`). Guardado
// "cru" no agregado com alvo + fonte; quem rola decide se casa com o contexto
// atual (ataque CC, perícia X…). Diferente de crit_range/floor_d20 (globais) e
// reroll (por gatilho), que já têm bucket próprio.
export type EfeitoContextual = {
  tipo: "vantagem" | "desvantagem" | "sucesso_auto" | "falha_auto";
  alvo: string;
  fonte: string;
  quando?: string;
};

// Desconto de técnica cru; o custo sai de `custoComDescontos` com o grau da ação.
export type DescontoTecnica = {
  custo: "pp" | "pa";
  valor: number;
  formula?: string;
  modo?: "metade" | "zero";
  minimo?: number;
  graus?: number[];
  fonte: string;
};

// Nível e atributos com que as fórmulas dos efeitos são resolvidas.
export type ContextoFormula = { nivel: number; atributos: Record<Atributo, number> };

// Dano extra ou dados extras guardados crus. `gasta` = habilidade de Usar que o
// chip gasta ao rolar (dano sob demanda, tipo Heat); `usos` e `custo` vão pro tooltip.
// `vezes` = quantos usos dá pra empilhar na mesma rolagem (usos, recurso e PP que sobram).
export type ExtraDano = FiltroDano & {
  chave: string;
  tipo: "dano_extra" | "dados_extra";
  formula: string;
  sempre: boolean;
  em: string;
  fonte: string;
  gasta?: string;
  usos?: string;
  custo?: string;
  vezes?: number;
};

// Teto de usos da mesma habilidade empilhados numa rolagem.
const MAX_EMPILHAR = 10;

// Efeito de "a cada turno" agregado, com a fonte.
export type PorTurno = {
  o: OQuePorTurno;
  valor: string;
  recurso?: string;
  gasta?: boolean;
  tipoDano?: string;
  fonte: string;
  habilidadeId?: string;
  // Técnica em concentração que traz o efeito.
  acaoId?: string;
};

// Efeito de dano só em certos graus de técnica ou tipos de dano.
export type FiltroDano = { graus?: number[]; tipos?: string };

function filtroDe(e: FiltroDano): FiltroDano {
  return { ...(e.graus?.length ? { graus: e.graus } : {}), ...(e.tipos ? { tipos: e.tipos } : {}) };
}

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
  proficienciasPericia: Partial<Record<string, FonteProficiencia>>;
  proficienciasSalvaguarda: Partial<Record<Atributo, FonteProficiencia>>;
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
  // Alvos largos: todas as salvaguardas, todos os testes, testes de um
  // atributo (perícias dele + teste puro), todas as jogadas de d20.
  bonusSalvaguardaTodas: FonteValor;
  bonusTesteTodos: FonteValor;
  bonusTesteAtributo: Partial<Record<Atributo, FonteValor>>;
  bonusQualquer: FonteValor;
  // A mais no teste de concentração (salvaguarda de CON ao tomar dano).
  bonusConcentracao: FonteValor;
  // Ataque/dano só de técnica ou só de ataque comum.
  bonusAtaqueTecnica: FonteValor;
  bonusAtaqueComum: FonteValor;
  bonusDanoTecnica: FonteValor;
  bonusDanoComum: FonteValor;
  // Nível e atributos usados pelas fórmulas dos efeitos (null = sem fórmula).
  ctxFormula: ContextoFormula | null;
  // Crítico expandido por alvo de ataque; na jogada vale o menor que casa.
  critsFaixa: { minimo: number; alvo: string; fonte: string }[];
  // Mínimos no d20 por alvo; na jogada vale o maior que casa.
  floorsD20: { minimo: number; alvo: string; fonte: string }[];
  // Rerrolagens por gatilho (ataque/salvaguarda/teste). Usos somam.
  rerolls: Partial<Record<string, UsoLimitado>>;
  // Sentidos especiais (visão escuro, sentir presença…). Indexado por nome
  // do sentido; o maior alcance vence.
  sentidos: Partial<Record<string, FonteValor>>;
  // Deslocamentos especiais (voar/nadar/escalar/cavar). Indexado pelo tipo de
  // movimento; o maior valor por tipo vence (é o modo, não soma — "prevalece o
  // maior", regra das espécies). "caminhar" NÃO entra aqui: soma no
  // bonusDeslocamento (deslocamento base) pra casar com `modificador→deslocamento`.
  deslocamentosExtra: Partial<Record<string, FonteValor>>;
  // Fatores multiplicativos (ex: Espécie Gigante ×2 carga). Indexado pelo
  // slug do alvo. Vários multiplicadores compõem por produto (×2 × ×1.5 = ×3).
  // Default 1 (sem efeito). Ordem com aditivo: (base + bônus) × fator.
  multiplicadores: Partial<Record<string, { fator: number; fontes: string[] }>>;
  // Vantagem/desvantagem/sucesso_auto crus — casam com o contexto na hora de
  // rolar (via `chipsDoContexto`). Não somam: importa só "casa ou não casa".
  contextuais: EfeitoContextual[];
  // Substituição de atributo por cálculo (CR/iniciativa/salvaguarda/perícia).
  // Indexado pelo slug do alvo; a primeira habilidade a definir vence.
  substituicoesAtributo: Partial<Record<string, Substituicao>>;
  // ─ Contextuais de dano/ataque (etapa 3.5) ─
  // Piso de dano (metade do MÁXIMO da fórmula), por dano (`em`). O piso depende
  // da fórmula rolada, então é calculado no Rolador.
  danosMin: (FiltroDano & { em: string; fonte: string; quando?: string })[];
  // Bônus com `quando` numa rolagem: chip desligado no Rolador, fora dos totais.
  situacionais: { alvo: string; valor: number; fonte: string; quando: string }[];
  // Dano máximo por dano; `gasta` = habilidade de Usar (sob demanda).
  danosMaximos: (FiltroDano & {
    em: string;
    sempre: boolean;
    apartir: number;
    fonte: string;
    gasta?: string;
    usos?: string;
    custo?: string;
  })[];
  // Dado de dano mínimo.
  pisosDado: (FiltroDano & { ate: number; vira: number; em: string; fonte: string })[];
  // Crítico maior: multiplicador dos dados e dados a mais.
  critsExtra: (FiltroDano & { dados: number; vezes: number; em: string; fonte: string })[];
  // Acerto por dano (alvo de ataque).
  ataquesPoderosos: { penalidade: number; bonus: number; alvo: string; fonte: string }[];
  // Redução de dano recebido (painel de defesas).
  reducoesDano: { valor: number; tipos: string; quando?: string; fonte: string; passiva: boolean }[];
  // Maior nível de exaustão ignorado.
  ignoraExaustao: { ate: number; fontes: string[] } | null;
  // A mais em cada descanso.
  descansoExtra: Record<"curto" | "longo", { exaustao: number; pp: number; dv: number; fontes: string[] }>;
  // Dano extra e dados extras, crus; o Rolador resolve (com o grau da técnica).
  extrasDano: ExtraDano[];
  // O que acontece a cada turno; `habilidadeId` = ligada que desliga se o gasto zerar.
  porTurno: PorTurno[];
  // Ações a mais por turno ("Ação Extra" sem condição), por tipo de ação.
  acoesExtras: Partial<Record<"padrao" | "bonus" | "react", FonteValor>>;
  // Valor igual a outro (ou à metade dele): CR, deslocamentos e atributos.
  valoresIguais: ValorIgual[];
  // Multiataque por alvo de ataque: vale o maior total, mais os ataques a mais.
  multiAtaques: { vezes: number; soma: boolean; alvo: string; fonte: string }[];
  // Explosões de dano e de ataque.
  explosoes: { gatilho: GatilhoExplosao; valor: number; limite: number; em: string; fonte: string }[];
  // Bônus progressivos de rolagem, crus, com a contagem atual.
  progressivos: {
    formula: string;
    max: number;
    em: string;
    por: string;
    passos: number;
    cresce?: GatilhoProgressivo;
    fonte: string;
  }[];
  // Valor fixo por alvo (CR, deslocamentos): vale o maior.
  valoresFixos: Partial<Record<string, FonteValor>>;
  // Dado da arma fixo (vale o maior).
  dadoArmaFixo: { formula: string; fontes: string[] } | null;
  // Troca de tipo de dano. Primeira habilidade a definir vence; fontes acumulam.
  trocaDano: { tipoDano: string; fontes: string[] } | null;
  // Defesas ignoradas (resistência/imunidade/reação/cobertura). Indexado pelo
  // que ignora; fontes acumulam.
  ignora: Partial<Record<string, FonteLista>>;
  // Alcance a mais ou trocado, por alvo de ataque — DESCRITIVO (chip da rolagem).
  // `opcional`: vem de habilidade de Usar ou tem `quando`; nasce desligado.
  alcances: {
    valor: number;
    vira?: string;
    alvo: string;
    quando?: string;
    opcional?: boolean;
    fonte: string;
  }[];
  // Imune a acerto crítico (defensivo). Presença (fontes) = imune. Não é
  // consumido no Rolador (é sobre ser atacado) — só exibição na sidebar.
  critImune: DefesaAgregada;
  // ─ Qualidade de arma (Meito) ─
  // Margem de crítico extra.
  margemCritico: FonteValor;
  // Passos no dado da arma e no dado das técnicas (somam).
  passosDanoArma: FonteValor;
  passosDanoTecnica: FonteValor;
  // Descontos no custo de técnica.
  descontos: DescontoTecnica[];
  // Melhor de N no dano (maior N vence; usos somam).
  danoMelhorDe: (UsoLimitado & { vezes: number }) | null;
  // ─ Defesas (painel read-only da sidebar) ─
  // Resistências e imunidades a tipo de dano + imunidades a condição. Indexados
  // pelo nome (casing preservado). Agregam de QUALQUER tipo de habilidade (é
  // traço, não rolagem); de fonte ativável entram como condicional. Só exibição.
  resistencias: Partial<Record<string, DefesaAgregada>>;
  imunidades: Partial<Record<string, DefesaAgregada>>;
  vulnerabilidades: Partial<Record<string, DefesaAgregada>>;
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
    bonusSalvaguardaTodas: { valor: 0, fontes: [] },
    bonusTesteTodos: { valor: 0, fontes: [] },
    bonusTesteAtributo: {},
    bonusQualquer: { valor: 0, fontes: [] },
    bonusConcentracao: { valor: 0, fontes: [] },
    bonusAtaqueTecnica: { valor: 0, fontes: [] },
    bonusAtaqueComum: { valor: 0, fontes: [] },
    bonusDanoTecnica: { valor: 0, fontes: [] },
    bonusDanoComum: { valor: 0, fontes: [] },
    ctxFormula: null,
    critsFaixa: [],
    floorsD20: [],
    rerolls: {},
    sentidos: {},
    deslocamentosExtra: {},
    multiplicadores: {},
    contextuais: [],
    substituicoesAtributo: {},
    danosMin: [],
    situacionais: [],
    danosMaximos: [],
    pisosDado: [],
    critsExtra: [],
    ataquesPoderosos: [],
    reducoesDano: [],
    ignoraExaustao: null,
    descansoExtra: {
      curto: { exaustao: 0, pp: 0, dv: 0, fontes: [] },
      longo: { exaustao: 0, pp: 0, dv: 0, fontes: [] },
    },
    extrasDano: [],
    porTurno: [],
    acoesExtras: {},
    valoresIguais: [],
    multiAtaques: [],
    explosoes: [],
    progressivos: [],
    valoresFixos: {},
    dadoArmaFixo: null,
    trocaDano: null,
    ignora: {},
    alcances: [],
    critImune: { fontes: [], passiva: false },
    margemCritico: { valor: 0, fontes: [] },
    passosDanoArma: { valor: 0, fontes: [] },
    passosDanoTecnica: { valor: 0, fontes: [] },
    descontos: [],
    danoMelhorDe: null,
    resistencias: {},
    imunidades: {},
    vulnerabilidades: {},
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
// `hpTemp` é a maior concessão de PV temporário: não soma com o que já tem.
export type DeltasInstantaneos = {
  hpAtual: number;
  hpTemp: number;
  // Até quando dura o `hpTemp` concedido, como vai pro banco (null = até acabar).
  hpTempDuracao?: string | null;
  ppAtual: number;
  hpMax: number;
  ppMax: number;
  // Níveis de exaustão (recurso "exaustao").
  exaustao: number;
  recursos: Record<string, number>;
};

export type AlvoCura = "hp" | "hp-temp" | "pp";

// Pool da cura; aliases antigos (pv, ppv, pv-temp, hptemp) caem no canônico.
export function alvoDaCura(e: { alvoCura?: string }): AlvoCura {
  const onde = (e.alvoCura ?? "hp").trim().toLowerCase();
  if (onde === "pp") return "pp";
  if (onde === "hp-temp" || onde === "hptemp" || onde === "pv-temp" || onde === "ppv") return "hp-temp";
  return "hp";
}

// Valor de cura fixo ("10"); null quando é fórmula ("2d10+CON").
export function curaFixa(valor: string): number | null {
  const t = valor.trim();
  const n = Number(t);
  return t !== "" && Number.isFinite(n) ? Math.trunc(n) : null;
}

// Curas que rolam no cliente ao usar, pelo índice do efeito: as com fórmula e,
// com dado a mais na cura, também as de PV com valor fixo.
export function curasComFormula(
  efeitos: EfeitoHabilidade[],
  comDadoNaCura = false,
): { idx: number; valor: string; alvo: AlvoCura }[] {
  const out: { idx: number; valor: string; alvo: AlvoCura }[] = [];
  efeitos.forEach((e, idx) => {
    if (e.tipo !== "cura") return;
    const alvo = alvoDaCura(e);
    if (curaFixa(e.valor) === null || (comDadoNaCura && alvo === "hp")) {
      out.push({ idx, valor: e.valor, alvo });
    }
  });
  return out;
}

// Dados a mais que valem sempre na cura de PV ("+1d6"), já resolvidos.
export type ExtraDeCura = { dados: Dado[]; modificador: number; texto: string; fontes: string[] };

export function extrasDeCura(
  agg: Pick<EfeitosAgregados, "extrasDano" | "ctxFormula">,
): ExtraDeCura {
  const dados: Dado[] = [];
  let modificador = 0;
  const fontes: string[] = [];
  const f = agg.ctxFormula;
  for (const x of agg.extrasDano) {
    if (x.tipo !== "dano_extra" || !x.sempre || x.gasta || x.em !== "cura") continue;
    const r = f ? resolverFormula(x.formula, f.atributos, f.nivel) : parseFormulaDados(x.formula);
    dados.push(...r.dados);
    modificador += r.modificador;
    if (!fontes.includes(x.fonte)) fontes.push(x.fonte);
  }
  const texto = dados.length || modificador ? formulaAgrupada(dados, modificador) : "";
  return { dados, modificador, texto, fontes };
}

export function computarDeltasInstantaneos(
  efeitos: EfeitoHabilidade[],
  // `incluirMax: false` ignora `modificador` em hp-max/pp-max. Usado ao LIGAR
  // uma habilidade sustentada: bônus de PV/PP máximo são revertíveis, então
  // vivem no agregado (bonusHpMax/bonusPpMax enquanto ligada) em vez de baterem
  // permanentemente no valor armazenado. cura/PV-temp/recurso seguem instantâneos.
  // `rolagens`: total rolado de cada cura com fórmula, pelo índice do efeito.
  // `ctx`: nível, atributos e grau da técnica pras fórmulas (ex: PV temporário
  // "2d10+CON" já rolado, ou "10*NIVEL" fixo).
  {
    incluirMax = true,
    rolagens = {},
    ctx = null,
  }: {
    incluirMax?: boolean;
    rolagens?: Record<number, number>;
    ctx?: (ContextoFormula & { grau?: number }) | null;
  } = {},
): DeltasInstantaneos {
  const valorDe = (e: { valor: number; formula?: string }) =>
    e.formula
      ? ctx
        ? valorDaFormula(e.formula, ctx.atributos, ctx.nivel, { grau: ctx.grau ?? 0 })
        : 0
      : e.valor;
  const d: DeltasInstantaneos = {
    hpAtual: 0,
    hpTemp: 0,
    ppAtual: 0,
    hpMax: 0,
    ppMax: 0,
    exaustao: 0,
    recursos: {},
  };
  // Vale a maior concessão, com a duração dela.
  const darTemp = (v: number, duracao?: DuracaoPvTemp) => {
    if (v <= d.hpTemp) return;
    d.hpTemp = v;
    d.hpTempDuracao = duracaoPvTempNoBanco(duracao ?? "acabar");
  };
  // Slugs canônicos de pool: hp (PV atual), hp-temp, hp-max, pp (PP atual),
  // pp-max. Aliases antigos (pv, ppv, pv-temp, hpMax, hptemp…) são tolerados
  // aqui pra não quebrar habilidades já salvas no banco.
  efeitos.forEach((e, idx) => {
    if (e.tipo === "cura") {
      // O total rolado vale mais que o fixo (cura fixa com dado a mais também rola).
      const n = rolagens[idx] ?? curaFixa(e.valor);
      if (n == null || !Number.isFinite(n) || n <= 0) return;
      const v = Math.trunc(n);
      const onde = alvoDaCura(e);
      if (onde === "pp") d.ppAtual += v;
      else if (onde === "hp-temp") darTemp(v, e.duracaoPv);
      else d.hpAtual += v;
    } else if (e.tipo === "modificador") {
      const alvo = e.alvo.trim().toLowerCase();
      const v = Math.trunc(valorDe(e));
      if (alvo === "hp-temp" || alvo === "hptemp") darTemp(v, e.duracaoPv);
      else if (incluirMax && (alvo === "hp-max" || alvo === "hpmax")) d.hpMax += v;
      else if (incluirMax && (alvo === "pp-max" || alvo === "ppmax")) d.ppMax += v;
    } else if (e.tipo === "recurso_delta") {
      const v = Math.trunc(e.valor);
      if (!v) return;
      const k = e.recurso.trim(); // pode ser UUID de recurso custom (case-sensitive)
      // PV Máx legado já vem como `modificador`.
      if (k === "pp") d.ppAtual += v;
      else if (k === "exaustao") d.exaustao += v;
      else if (k === "pa") return; // PA não é pool rastreável (legado)
      else d.recursos[k] = (d.recursos[k] ?? 0) + v;
    }
  });
  return d;
}

// Voar/nadar/escalar/cavar: o maior entre efeito de deslocamento e valor fixo.
export function modosDeDeslocamento(
  agg: Pick<EfeitosAgregados, "deslocamentosExtra" | "valoresFixos">,
): Record<string, { valor: number; fontes: string[] }> {
  const out: Record<string, { valor: number; fontes: string[] }> = {};
  for (const [tipo, fv] of Object.entries(agg.deslocamentosExtra)) {
    if (fv) out[tipo] = fv;
  }
  for (const tipo of ["nadar", "voar", "escalar", "cavar"]) {
    const fixo = agg.valoresFixos[tipo];
    if (fixo && fixo.valor > (out[tipo]?.valor ?? 0)) out[tipo] = fixo;
  }
  return out;
}

// Máximos efetivos de PV e PP: (base + bônus) × fator, arredondado pra baixo.
export function poolsEfetivos(
  base: { hpMax: number; ppMax: number },
  agg: Pick<EfeitosAgregados, "bonusHpMax" | "bonusPpMax" | "multiplicadores">,
): { hpMax: number; ppMax: number } {
  const hp = base.hpMax + agg.bonusHpMax.valor;
  const pp = base.ppMax + agg.bonusPpMax.valor;
  const mHp = agg.multiplicadores["hp-max"]?.fator;
  const mPp = agg.multiplicadores["pp-max"]?.fator;
  return {
    hpMax: Math.max(1, mHp ? Math.floor(hp * mHp) : hp),
    ppMax: Math.max(0, mPp ? Math.floor(pp * mPp) : pp),
  };
}

// Atributos com o bônus dos efeitos; o valor fixo vale se for maior.
export function atributosEfetivos(
  base: Record<Atributo, number>,
  agg: Pick<EfeitosAgregados, "bonusAtributo" | "valoresFixos"> & { valoresIguais?: ValorIgual[] },
): Record<Atributo, number> {
  const out = {} as Record<Atributo, number>;
  for (const a of ATRIBUTOS) {
    const somado = base[a.slug] + (agg.bonusAtributo[a.slug]?.valor ?? 0);
    out[a.slug] = Math.max(somado, agg.valoresFixos[a.slug]?.valor ?? 0);
  }
  return comAtributosIguais(out, agg.valoresIguais ?? []);
}

// Teste de perícia ou salvaguarda com proficiência, bônus e troca de atributo
// vindos dos efeitos. `atributos` já vem com a penalidade de DES da armadura.
// Sem a exaustão (quem rola desconta; teste passivo não).
export function resolverTeste(opts: {
  tipo: "pericia" | "salvaguarda";
  // Slug da perícia (canônica ou custom) ou atributo da salvaguarda.
  slug: string;
  atributoPadrao: Atributo;
  nivel: number;
  atributos: Record<Atributo, number>;
  proficiente: boolean;
  dobrado: boolean;
  outros: number;
  agg: Pick<
    EfeitosAgregados,
    | "proficienciasPericia"
    | "proficienciasSalvaguarda"
    | "bonusPericia"
    | "bonusSalvaguarda"
    | "substituicoesAtributo"
    | "bonusSalvaguardaTodas"
    | "bonusTesteTodos"
    | "bonusTesteAtributo"
    | "bonusQualquer"
  >;
}): {
  bonus: number;
  // Parcelas do bônus: mod + prof + outros.
  mod: number;
  prof: number;
  outros: number;
  atributo: Atributo;
  substituicao: string[] | null;
  proficiente: boolean;
  dobrado: boolean;
  profPorEfeito: FonteProficiencia | undefined;
  bonusPorEfeito: FonteValor | undefined;
  // Bônus de alvos largos (todas as salvaguardas, testes, todas as jogadas).
  bonusAmplo: FonteValor;
} {
  const ehSalv = opts.tipo === "salvaguarda";
  const profPorEfeito = ehSalv
    ? opts.agg.proficienciasSalvaguarda[opts.slug as Atributo]
    : opts.agg.proficienciasPericia[opts.slug];
  const bonusPorEfeito = ehSalv
    ? opts.agg.bonusSalvaguarda[opts.slug as Atributo]
    : opts.agg.bonusPericia[opts.slug];
  const proficiente = opts.proficiente || !!profPorEfeito;
  const dobrado = proficiente && (opts.dobrado || !!profPorEfeito?.dobrada);
  const sub = atributoDeCalculo(
    ehSalv ? `salv-${opts.slug}` : [opts.slug, `teste-${opts.atributoPadrao}`],
    opts.atributoPadrao,
    opts.agg.substituicoesAtributo,
    opts.atributos,
  );
  const bonusAmplo = ehSalv
    ? somarFontes(opts.agg.bonusSalvaguardaTodas, opts.agg.bonusQualquer)
    : bonusTesteAmplo(opts.agg, sub.atributo);
  const outros = opts.outros + (bonusPorEfeito?.valor ?? 0) + bonusAmplo.valor;
  const valorAtributo = opts.atributos[sub.atributo];
  const bonus = ehSalv
    ? bonusSalvaguarda({ valorAtributo, nivel: opts.nivel, proficiente, dobrado, outros })
    : bonusPericia({ valorAtributo, nivel: opts.nivel, proficiente, dobrado, outros });
  const mod = modificador(valorAtributo);
  return {
    bonus,
    mod,
    prof: bonus - mod - outros,
    outros,
    atributo: sub.atributo,
    substituicao: sub.substituido ? sub.fontes : null,
    proficiente,
    dobrado,
    profPorEfeito,
    bonusPorEfeito,
    bonusAmplo,
  };
}

// Efeitos de d20 que valem sempre na jogada (os com `quando` ficam de fora).
export function modoDosEfeitos(
  contextuais: EfeitoContextual[],
  ctx: ContextoRolagem,
): { vantagem: string[]; desvantagem: string[]; sucesso: string[]; falha: string[] } {
  const out = { vantagem: [] as string[], desvantagem: [] as string[], sucesso: [] as string[], falha: [] as string[] };
  for (const c of contextuais) {
    if (c.quando?.trim() || !casaContexto(c.alvo, ctx)) continue;
    if (c.tipo === "vantagem") out.vantagem.push(c.fonte);
    else if (c.tipo === "desvantagem") out.desvantagem.push(c.fonte);
    else if (c.tipo === "sucesso_auto") out.sucesso.push(c.fonte);
    else out.falha.push(c.fonte);
  }
  return {
    vantagem: dedup(out.vantagem),
    desvantagem: dedup(out.desvantagem),
    sucesso: dedup(out.sucesso),
    falha: dedup(out.falha),
  };
}

// Nível de exaustão que pesa nas jogadas e no deslocamento (0 se ignorado).
export function exaustaoQueConta(
  exaustao: number,
  agg: Pick<EfeitosAgregados, "ignoraExaustao">,
): number {
  return exaustao <= (agg.ignoraExaustao?.ate ?? 0) ? 0 : exaustao;
}

// Um efeito é "sustentado" quando o agregador o transforma num traço/bônus
// persistente (aplicado enquanto a habilidade estiver passiva ou ligada e
// revertido ao desligar). NÃO são sustentados: os instantâneos (cura,
// recurso_delta, `modificador` em hp-temp — grants one-shot que persistem) nem
// os puramente descritivos (livre/trigger/rolagem/condicao_*/acao_extra).
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
    case "vulnerabilidade":
    case "condicao_imune":
    case "crit_imune":
    case "multiplicador":
    case "substituir_atributo":
    case "deslocamento":
    case "sentido":
    case "dano_min":
    case "ignora":
    case "trocar_dano":
    case "margem_critico":
    case "passo_dano":
    case "desconto_tecnica":
    case "dano_melhor_de":
    case "valor_fixo":
    case "falha_auto":
    case "reducao_dano":
    case "piso_dado":
    case "critico_extra":
    case "ataque_poderoso":
    case "ignora_exaustao":
    case "descanso":
    case "por_turno":
    case "multi_ataque":
    case "explosao":
    case "progressivo":
    case "valor_igual":
      return true;
    default:
      return false;
  }
}

// Efeito que acontece na hora do uso (não fica valendo).
export function efeitoInstantaneo(e: EfeitoHabilidade): boolean {
  if (e.tipo === "cura" || e.tipo === "recurso_delta") return true;
  if (e.tipo === "modificador") {
    const a = e.alvo.trim().toLowerCase();
    return a === "hp-temp" || a === "hptemp";
  }
  return false;
}

// Habilidade ativável (ativa/reativa) com ≥1 efeito sustentado ganha toggle
// on/off (estado `ligada`) em vez do botão "Usar" de disparo único. Auto-detect:
// sem passo novo de autoria.
export function temEfeitoSustentado(efeitos: EfeitoHabilidade[]): boolean {
  return efeitos.some(efeitoEhSustentado);
}

// Fonte de efeito do `agregarEfeitos`; item equipado entra como passiva.
export type FonteEfeito = {
  nome: string;
  tipo: string;
  efeitos: unknown;
  ligada?: boolean;
};

const ALVOS_ROLAGEM_ARMA = new Set([
  "ataque",
  "ataque-cc",
  "ataque-distancia",
  "ataque-tecnica",
  "ataque-comum",
  "dano",
  "dano-cc",
  "dano-distancia",
  "dano-tecnica",
  "dano-comum",
]);

// Efeito de rolagem de arma: numa arma, vale só nas rolagens com ela.
export function efeitoDeRolagemDeArma(e: EfeitoHabilidade): boolean {
  switch (e.tipo) {
    case "modificador":
      return ALVOS_ROLAGEM_ARMA.has(e.alvo.trim().toLowerCase());
    case "vantagem":
    case "desvantagem":
      return e.alvo.trim().toLowerCase().startsWith("ataque");
    case "reroll":
      return e.gatilho.trim().toLowerCase().startsWith("ataque");
    case "floor_d20":
      return (e.alvo ?? "").trim().toLowerCase().startsWith("ataque");
    case "crit_range":
    case "margem_critico":
    case "passo_dano":
    case "desconto_tecnica":
    case "dano_melhor_de":
    case "dano_min":
    case "alcance":
    case "ignora":
    case "trocar_dano":
    case "dano_extra":
    case "dados_extra":
    case "dano_maximo":
    case "piso_dado":
    case "critico_extra":
    case "ataque_poderoso":
    case "multi_ataque":
    case "explosao":
      return true;
    case "progressivo":
      return !progressivoNaFicha(e.em);
    case "valor_fixo":
      return e.alvo === "dado-arma";
    default:
      return false;
  }
}

// Fontes de efeito dos itens equipados, sem os efeitos de rolagem de arma.
export function fontesDeEfeitoDeItens(
  itens: { nome: string; tipo: string; equipado: boolean; efeitos: unknown }[],
): FonteEfeito[] {
  return itens
    .filter((i) => i.equipado)
    .map((i) => ({
      nome: i.nome,
      tipo: "passiva",
      efeitos:
        i.tipo === "arma"
          ? lerEfeitos(i.efeitos).filter((e) => !efeitoDeRolagemDeArma(e))
          : lerEfeitos(i.efeitos),
    }))
    .filter((f) => f.efeitos.length > 0);
}

// Habilidade que um aliado ligou neste personagem: vale como passiva, sem os instantâneos.
export function fonteDeAliado(h: { nome: string; de: string; efeitos: unknown }): FonteEfeito {
  return {
    nome: `${h.nome} de ${h.de}`,
    tipo: "passiva",
    efeitos: lerEfeitos(h.efeitos).filter((e) => !efeitoInstantaneo(e)),
  };
}

// Agregado da ficha + efeitos de rolagem da arma.
export function efeitosComArma(
  ficha: EfeitosAgregados,
  arma: { nome: string; equipado: boolean; efeitos: unknown },
): EfeitosAgregados {
  if (!arma.equipado) return ficha;
  const proprios = lerEfeitos(arma.efeitos).filter(efeitoDeRolagemDeArma);
  if (proprios.length === 0) return ficha;
  return agregarEfeitos([{ nome: arma.nome, tipo: "passiva", efeitos: proprios }], new Set(), ficha);
}

// Custo da ação: ficha + armas equipadas que a desferem ou concedem (vale o menor).
export function custoDaAcao(
  ficha: EfeitosAgregados,
  armas: { nome: string; tipo: string; equipado: boolean; efeitos: unknown }[],
  custo: "pp" | "pa",
  base: number,
  grau: number,
): { final: number; fontes: string[] } {
  const equipadas = armas.filter((a) => a.tipo === "arma" && a.equipado);
  const aggs = equipadas.length ? equipadas.map((a) => efeitosComArma(ficha, a)) : [ficha];
  let melhor = { final: base, fontes: [] as string[] };
  for (const a of aggs) {
    const c = custoComDescontos(base, custo, grau, a.descontos, a.ctxFormula);
    if (c.final < melhor.final) melhor = c;
  }
  return melhor;
}

// Sobrecarga (cap. 3): técnica de grau 1–5 sem PP custa exaustão = grau, sem
// passar do 5º nível. Devolve o motivo quando não dá.
export function motivoSemSobrecarga(
  acao: { tecnica: boolean; grau: number },
  exaustao: number,
): string | null {
  if (!acao.tecnica || acao.grau < 1) return "PP insuficiente.";
  if (acao.grau > 5) return "PP insuficiente. Técnica de 6º ou 7º grau não aceita Sobrecarga.";
  if (exaustao + acao.grau > 5) {
    return "PP insuficiente. A Sobrecarga passaria do 5º nível de exaustão.";
  }
  return null;
}

// Fonte de efeito do agregador. `id`, `alternavel` e usos servem pro dano sob
// demanda (habilidade de Usar com dano extra); `aliado` vai pra outro personagem.
export type HabilidadeFonte = {
  nome: string;
  tipo: string;
  efeitos: unknown;
  ligada?: boolean;
  id?: string;
  alternavel?: boolean;
  aliado?: boolean;
  usos?: number | null;
  usosAtual?: number | null;
  usosFormula?: string | null;
  custoPp?: number;
  custoRecursoId?: string | null;
  custoRecursoValor?: number;
};

// Recurso do personagem, pro custo dos chips sob demanda (ex.: Dados Brutais).
export type RecursoFonte = { id: string; nome: string; valorAtual: number; valorMax: number };

const agrega = (h: { tipo: string; ligada?: boolean }) => h.tipo === "passiva" || h.ligada === true;

// Limite de usos da habilidade que dá o efeito (null = sem limite).
function limiteDeUso(
  h: HabilidadeFonte,
  f: ContextoFormula | null,
): { gasta: string; usos: string } | "esgotado" | null {
  const max = usosMaximos(h, f);
  if (max == null || !h.id) return null;
  const atual = h.usosAtual ?? max;
  if (atual <= 0) return "esgotado";
  return { gasta: h.id, usos: `${atual}/${max}` };
}

// Junta uma fonte num efeito de uso limitado; uma fonte sem limite o deixa livre.
function somarUsoLimitado(
  atual: UsoLimitado | undefined,
  fonte: string,
  limite: { gasta: string; usos: string } | null,
): UsoLimitado {
  const out: UsoLimitado = atual
    ? { ...atual, fontes: [...atual.fontes] }
    : { fontes: [], livre: false };
  if (!out.fontes.includes(fonte)) out.fontes.push(fonte);
  if (!limite) out.livre = true;
  else if (!out.gasta) {
    out.gasta = limite.gasta;
    out.usos = limite.usos;
  }
  return out;
}

// Atributos com os bônus e valores fixos sem fórmula das fontes que agregam.
function atributosComBonusFixos(
  habilidades: HabilidadeFonte[],
  base: Record<Atributo, number>,
): Record<Atributo, number> {
  const out = { ...base };
  const fixos: Partial<Record<Atributo, number>> = {};
  const iguais: ValorIgual[] = [];
  for (const h of habilidades) {
    if (!agrega(h) || h.aliado) continue;
    for (const e of lerEfeitos(h.efeitos)) {
      if (e.tipo === "modificador" && !e.formula) {
        const a = e.alvo.trim().toLowerCase();
        if (ATRIBUTOS_SET.has(a)) out[a as Atributo] += e.valor;
      } else if (e.tipo === "valor_fixo" && ATRIBUTOS_SET.has(e.alvo) && /^\d+$/.test(e.valor)) {
        const a = e.alvo as Atributo;
        fixos[a] = Math.max(fixos[a] ?? 0, Number(e.valor));
      } else if (e.tipo === "valor_igual") {
        iguais.push({ alvo: e.alvo, de: e.de, metade: !!e.metade, fonte: h.nome });
      }
    }
  }
  for (const [a, v] of Object.entries(fixos) as [Atributo, number][]) out[a] = Math.max(out[a], v);
  return comAtributosIguais(out, iguais);
}

// Máximo de usos: a fórmula (com nível/atributos) ou o número salvo.
export function usosMaximos(
  h: { usos?: number | null; usosFormula?: string | null },
  ctx: ContextoFormula | null,
): number | null {
  if (h.usosFormula && ctx) return Math.max(0, valorDaFormula(h.usosFormula, ctx.atributos, ctx.nivel));
  return h.usos ?? null;
}

// Campo que aceita número ou fórmula sem dados ("PROF", "NIVEL/2"): vale a
// fórmula; sem ela (ou sem contexto), o número salvo.
export function valorOuFormula(
  numero: number,
  formula: string | null | undefined,
  ctx: ContextoFormula | null,
  grau = 0,
): number {
  if (!formula || !ctx) return numero;
  return Math.max(0, valorDaFormula(formula, ctx.atributos, ctx.nivel, { grau }));
}

// Texto de um campo que aceita número ou fórmula: o número de agora e a fórmula
// (null quando é só número).
export function lerNumeroOuFormula(
  texto: string,
  ctx: ContextoFormula | null,
  grau = 0,
): { numero: number; formula: string | null } {
  const t = texto.trim();
  if (t === "" || Number.isFinite(Number(t))) {
    return { numero: Math.max(0, Math.trunc(Number(t) || 0)), formula: null };
  }
  return { numero: valorOuFormula(0, t, ctx, grau), formula: t };
}

// Máximo do recurso: a fórmula ou o número salvo.
export function maximoDoRecurso(
  r: { valorMax: number; valorMaxFormula?: string | null },
  ctx: ContextoFormula | null,
): number {
  return valorOuFormula(r.valorMax, r.valorMaxFormula, ctx);
}

// Custos de PP e de recurso já em número (`grau` resolve GRAU na técnica).
export function comCustosResolvidos<
  T extends {
    custoPp: number;
    custoRecursoValor: number;
    custoPpFormula?: string | null;
    custoRecursoFormula?: string | null;
  },
>(x: T, ctx: ContextoFormula | null, grau = 0): T {
  if (!x.custoPpFormula && !x.custoRecursoFormula) return x;
  return {
    ...x,
    custoPp: valorOuFormula(x.custoPp, x.custoPpFormula, ctx, grau),
    custoRecursoValor: valorOuFormula(x.custoRecursoValor, x.custoRecursoFormula, ctx, grau),
  };
}

// Nível e atributos das fórmulas, antes de agregar (o mesmo `ctxFormula` do agregado).
export function contextoDasFormulas(
  fontes: HabilidadeFonte[],
  base: { nivel: number; atributos: Record<Atributo, number> },
): ContextoFormula {
  return { nivel: base.nivel, atributos: atributosComBonusFixos(fontes, base.atributos) };
}

// Efeito de alcance no formato do agregado; com `quando`, nasce desligado.
function alcanceDe(
  e: Extract<EfeitoHabilidade, { tipo: "alcance" }>,
  fonte: string,
): EfeitosAgregados["alcances"][number] {
  const quando = e.quando?.trim();
  return {
    valor: e.valor,
    ...(e.vira ? { vira: e.vira } : {}),
    alvo: (e.alvo ?? "ataque").trim().toLowerCase() || "ataque",
    ...(quando ? { quando, opcional: true } : {}),
    fonte,
  };
}

// Agrega os efeitos sustentados de habilidades passivas ou ligadas.
// Instantâneos ficam com `computarDeltasInstantaneos`.
export function agregarEfeitos(
  habilidades: HabilidadeFonte[],
  // Slugs de perícias customizadas do personagem. Permite que `modificador` e
  // `proficiencia` mirando uma perícia custom caiam em bonusPericia/
  // proficienciasPericia em vez de virarem efeito descritivo sem dono.
  slugsPericiaCustom: Set<string> = new Set(),
  // Agregado de partida (copiado, não muda).
  base?: EfeitosAgregados,
  // Nível e atributos base pras fórmulas; `grau` = grau da técnica; `recursos`
  // e `ppAtual` dão o saldo do custo dos chips sob demanda.
  ctx?: {
    nivel?: number;
    atributos?: Record<Atributo, number>;
    grau?: number;
    recursos?: RecursoFonte[];
    ppAtual?: number;
  },
): EfeitosAgregados {
  // Base de um render anterior pode não ter os campos mais novos.
  const out = base ? { ...vazio(), ...structuredClone(base) } : vazio();
  if (!base && ctx?.nivel != null && ctx.atributos) {
    out.ctxFormula = {
      nivel: ctx.nivel,
      atributos: atributosComBonusFixos(habilidades, ctx.atributos),
    };
  }
  const grau = ctx?.grau ?? 0;
  const f = out.ctxFormula;
  const numero = (formula: string) =>
    f ? valorDaFormula(formula, f.atributos, f.nivel, { grau }) : Number(formula) || 0;
  const novoExtra = (x: Omit<ExtraDano, "chave">) =>
    out.extrasDano.push({ ...x, chave: `extra-${out.extrasDano.length}` });

  for (const h of habilidades) {
    // Efeito em aliado vale no aliado, não em quem usa.
    if (h.aliado) continue;
    const ehPassiva = h.tipo === "passiva";
    const efeitos = lerEfeitos(h.efeitos);
    // Habilidade não-passiva só agrega enquanto ligada. As de Usar oferecem o
    // dano extra e o dano máximo sob demanda (o chip gasta um uso).
    if (!agrega(h)) {
      if (!h.id || h.alternavel || temEfeitoSustentado(efeitos)) continue;
      // Alcance de habilidade de Usar: chip desligado, sem custo.
      for (const e of efeitos) {
        if (e.tipo === "alcance") out.alcances.push({ ...alcanceDe(e, h.nome), opcional: true });
      }
      const max = usosMaximos(h, f);
      const atual = h.usosAtual ?? max;
      if (max != null && (atual ?? 0) <= 0) continue;
      // Custo por uso: recurso (sem saldo, o chip some) e PP.
      const custoRecurso = h.custoRecursoValor ?? 0;
      const recurso =
        h.custoRecursoId && custoRecurso > 0
          ? ctx?.recursos?.find((r) => r.id === h.custoRecursoId)
          : undefined;
      if (recurso && recurso.valorAtual < custoRecurso) continue;
      const custo = [
        (h.custoPp ?? 0) > 0 ? `${h.custoPp} PP` : null,
        recurso ? `${custoRecurso} ${recurso.nome} (${recurso.valorAtual}/${recurso.valorMax})` : null,
      ]
        .filter(Boolean)
        .join(" e ");
      const usos = {
        ...(max != null ? { usos: `${atual}/${max}` } : {}),
        ...(custo ? { custo } : {}),
      };
      // Empilhar: quantos usos dá pra pagar de uma vez. Sem custo nenhum, não empilha.
      const custoPp = h.custoPp ?? 0;
      const tetos = [
        max != null ? (atual ?? 0) : null,
        recurso ? Math.floor(recurso.valorAtual / custoRecurso) : null,
        custoPp > 0 && ctx?.ppAtual != null ? Math.floor(ctx.ppAtual / custoPp) : null,
      ].filter((n): n is number => n != null);
      const vezes = tetos.length ? Math.min(MAX_EMPILHAR, ...tetos) : 1;
      for (const e of efeitos) {
        if (e.tipo === "dano_maximo") {
          out.danosMaximos.push({
            em: e.em ?? "dano",
            sempre: false,
            apartir: 0,
            fonte: h.nome,
            gasta: h.id,
            ...usos,
            ...filtroDe(e),
          });
          continue;
        }
        if (e.tipo !== "dano_extra" && e.tipo !== "dados_extra") continue;
        novoExtra({
          tipo: e.tipo,
          formula: e.tipo === "dano_extra" ? e.formula : e.quantidade,
          sempre: false,
          em: e.em ?? "dano",
          fonte: h.nome,
          gasta: h.id,
          ...usos,
          ...(vezes > 1 ? { vezes } : {}),
          ...filtroDe(e),
        });
      }
      continue;
    }
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
      if (e.tipo === "vulnerabilidade") {
        aplicarDefesa(out.vulnerabilidades, e.tipoDano, h.nome, ehPassiva);
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
        const valor = e.formula ? numero(e.formula) : e.valor;
        // Com `quando`, bônus de rolagem vira chip desligado (fora dos totais).
        if (e.quando?.trim() && alvoDeRolagem(e.alvo, slugsPericiaCustom)) {
          if (valor) {
            out.situacionais.push({
              alvo: e.alvo.trim().toLowerCase(),
              valor,
              fonte: h.nome,
              quando: e.quando.trim(),
            });
          }
        } else {
          aplicarModificador(out, e.alvo, valor, h.nome, slugsPericiaCustom);
        }
      } else if (e.tipo === "proficiencia") {
        aplicarProficiencia(out, e.alvo, !!e.dobrada, h.nome, slugsPericiaCustom);
      } else if (e.tipo === "crit_range") {
        if (e.minimo < 20) {
          out.critsFaixa.push({
            minimo: e.minimo,
            alvo: (e.alvo ?? "ataque").trim().toLowerCase() || "ataque",
            fonte: h.nome,
          });
        }
      } else if (e.tipo === "floor_d20") {
        if (e.minimo > 0) {
          out.floorsD20.push({
            minimo: e.minimo,
            alvo: (e.alvo ?? "qualquer").trim().toLowerCase() || "qualquer",
            fonte: h.nome,
          });
        }
      } else if (e.tipo === "reroll") {
        const limite = limiteDeUso(h, f);
        if (limite === "esgotado") continue;
        out.rerolls[e.gatilho] = somarUsoLimitado(out.rerolls[e.gatilho], h.nome, limite);
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
            out.substituicoesAtributo[alvo] = {
              atributo: e.atributo,
              fontes: [h.nome],
              ...(e.seMaior ? { seMaior: true } : {}),
            };
          } else if (!atual.fontes.includes(h.nome)) {
            atual.fontes.push(h.nome);
          }
        }
      } else if (
        e.tipo === "vantagem" ||
        e.tipo === "desvantagem" ||
        e.tipo === "sucesso_auto" ||
        e.tipo === "falha_auto"
      ) {
        const alvo = e.alvo.trim().toLowerCase();
        if (alvo) {
          out.contextuais.push({ tipo: e.tipo, alvo, fonte: h.nome, quando: e.quando });
        }
      } else if (e.tipo === "dano_min") {
        out.danosMin.push({
          em: (e.em ?? "dano").trim().toLowerCase() || "dano",
          fonte: h.nome,
          ...(e.quando?.trim() ? { quando: e.quando.trim() } : {}),
          ...filtroDe(e),
        });
      } else if (e.tipo === "dano_maximo") {
        out.danosMaximos.push({
          em: (e.em ?? "dano").trim().toLowerCase() || "dano",
          sempre: !!e.sempre,
          apartir: e.apartir ?? 0,
          fonte: h.nome,
          ...filtroDe(e),
        });
      } else if (e.tipo === "piso_dado") {
        out.pisosDado.push({
          ate: e.ate,
          vira: e.vira,
          em: (e.em ?? "dano").trim().toLowerCase() || "dano",
          fonte: h.nome,
          ...filtroDe(e),
        });
      } else if (e.tipo === "critico_extra") {
        out.critsExtra.push({
          dados: e.dados,
          vezes: e.vezes,
          em: (e.em ?? "dano").trim().toLowerCase() || "dano",
          fonte: h.nome,
          ...filtroDe(e),
        });
      } else if (e.tipo === "ataque_poderoso") {
        if (e.penalidade || e.bonus) {
          out.ataquesPoderosos.push({
            penalidade: e.penalidade,
            bonus: e.bonus,
            alvo: (e.alvo ?? "ataque").trim().toLowerCase() || "ataque",
            fonte: h.nome,
          });
        }
      } else if (e.tipo === "reducao_dano") {
        const valor = e.formula ? numero(e.formula) : e.valor;
        if (valor > 0) {
          out.reducoesDano.push({
            valor,
            tipos: e.tipos ?? "",
            ...(e.quando?.trim() ? { quando: e.quando.trim() } : {}),
            fonte: h.nome,
            passiva: ehPassiva,
          });
        }
      } else if (e.tipo === "ignora_exaustao") {
        const atual = out.ignoraExaustao ?? { ate: 0, fontes: [] };
        atual.ate = Math.max(atual.ate, e.ate);
        if (!atual.fontes.includes(h.nome)) atual.fontes.push(h.nome);
        out.ignoraExaustao = atual;
      } else if (e.tipo === "descanso") {
        const pp = e.pp ? numero(e.pp) : 0;
        for (const tipo of e.em === "ambos" ? (["curto", "longo"] as const) : [e.em]) {
          const d = out.descansoExtra[tipo];
          d.exaustao += e.exaustao;
          d.pp += Math.max(0, pp);
          d.dv += e.dv;
          if (!d.fontes.includes(h.nome)) d.fontes.push(h.nome);
        }
      } else if (e.tipo === "acao_extra") {
        // Com condição ("1× por descanso") fica descritivo: não vira ação de todo turno.
        const tipoAcao = ({ acao: "padrao", "acao bônus": "bonus", reacao: "react" } as const)[
          e.acao as "acao" | "acao bônus" | "reacao"
        ];
        if (tipoAcao && !e.gatilho) {
          const atual = out.acoesExtras[tipoAcao] ?? { valor: 0, fontes: [] };
          atual.valor += e.quantidade;
          if (!atual.fontes.includes(h.nome)) atual.fontes.push(h.nome);
          out.acoesExtras[tipoAcao] = atual;
        }
      } else if (e.tipo === "por_turno") {
        out.porTurno.push({
          o: e.o,
          valor: e.valor,
          ...(e.recurso ? { recurso: e.recurso } : {}),
          ...(e.gasta ? { gasta: true } : {}),
          ...(e.tipoDano ? { tipoDano: e.tipoDano } : {}),
          fonte: h.nome,
          ...(!ehPassiva && h.id ? { habilidadeId: h.id } : {}),
        });
      } else if (e.tipo === "dano_extra" || e.tipo === "dados_extra") {
        novoExtra({
          tipo: e.tipo,
          formula: e.tipo === "dano_extra" ? e.formula : e.quantidade,
          sempre: !!e.sempre,
          em: (e.em ?? "dano").trim().toLowerCase() || "dano",
          fonte: h.nome,
          ...filtroDe(e),
        });
      } else if (e.tipo === "valor_fixo") {
        const alvo = e.alvo.trim().toLowerCase();
        if (alvo === "dado-arma") {
          const maximo = (x: string) => {
            const d = parseFormulaDados(x);
            return faixaDaRolagem(d.dados, d.modificador).max;
          };
          if (!out.dadoArmaFixo || maximo(e.valor) > maximo(out.dadoArmaFixo.formula)) {
            out.dadoArmaFixo = { formula: e.valor, fontes: [h.nome] };
          }
        } else if (alvo) {
          const v = numero(e.valor);
          const atual = out.valoresFixos[alvo];
          if (!atual || v > atual.valor) out.valoresFixos[alvo] = { valor: v, fontes: [h.nome] };
        }
      } else if (e.tipo === "alcance") {
        out.alcances.push(alcanceDe(e, h.nome));
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
      } else if (e.tipo === "margem_critico") {
        somarBucketSimples(out.margemCritico, e.valor, h.nome);
      } else if (e.tipo === "passo_dano") {
        somarBucketSimples(
          e.alvo === "tecnica" ? out.passosDanoTecnica : out.passosDanoArma,
          e.passos,
          h.nome,
        );
      } else if (e.tipo === "desconto_tecnica") {
        out.descontos.push({
          custo: e.custo,
          valor: e.valor,
          ...(e.formula ? { formula: e.formula } : {}),
          ...(e.modo ? { modo: e.modo } : {}),
          ...(e.minimo != null ? { minimo: e.minimo } : {}),
          ...(e.graus?.length ? { graus: e.graus } : {}),
          fonte: h.nome,
        });
      } else if (e.tipo === "dano_melhor_de") {
        const limite = limiteDeUso(h, f);
        if (limite === "esgotado") continue;
        const atual = somarUsoLimitado(out.danoMelhorDe ?? undefined, h.nome, limite);
        out.danoMelhorDe = { ...atual, vezes: Math.max(out.danoMelhorDe?.vezes ?? 0, e.vezes) };
      } else if (e.tipo === "multi_ataque") {
        out.multiAtaques.push({
          vezes: e.vezes,
          soma: !!e.soma,
          alvo: (e.alvo ?? "ataque").trim().toLowerCase() || "ataque",
          fonte: h.nome,
        });
      } else if (e.tipo === "explosao") {
        out.explosoes.push({
          gatilho: e.gatilho,
          valor: e.valor ?? 0,
          limite: e.limite,
          em: (e.em ?? "dano").trim().toLowerCase() || "dano",
          fonte: h.nome,
        });
      } else if (e.tipo === "progressivo") {
        const em = (e.em ?? "dano").trim().toLowerCase() || "dano";
        if (progressivoNaFicha(em, slugsPericiaCustom)) {
          // Valor da ficha: a fórmula uma vez por passo contado no card.
          if (e.passos) {
            aplicarModificador(out, em, numero(e.formula) * e.passos, h.nome, slugsPericiaCustom);
          }
        } else {
          out.progressivos.push({
            formula: e.formula,
            max: e.max,
            em,
            por: porDoProgressivo(e),
            passos: e.passos ?? 0,
            ...(e.cresce ? { cresce: e.cresce } : {}),
            fonte: h.nome,
          });
        }
      } else if (e.tipo === "valor_igual") {
        out.valoresIguais.push({ alvo: e.alvo, de: e.de, metade: !!e.metade, fonte: h.nome });
      } else if (e.tipo === "deslocamento") {
        const tipo = e.tipoMov.trim().toLowerCase();
        if (tipo && e.valor) {
          if (tipo === "caminhar") {
            // Deslocamento terrestre é o base — soma como bônus.
            somarBucketSimples(out.bonusDeslocamento, e.valor, h.nome);
          } else {
            // Voar/nadar/escalar/cavar: modo próprio, prevalece o maior.
            const atual = out.deslocamentosExtra[tipo] ?? { valor: 0, fontes: [] };
            if (e.valor > atual.valor) atual.valor = e.valor;
            if (!atual.fontes.includes(h.nome)) atual.fontes.push(h.nome);
            out.deslocamentosExtra[tipo] = atual;
          }
        }
      }
    }
  }
  return out;
}

// Agregado das rolagens de uma técnica: a base (ficha ou ficha + arma) com os
// efeitos próprios dela, resolvendo GRAU pelo grau da técnica.
export function efeitosDaTecnica(
  base: EfeitosAgregados,
  acao: { nome: string; efeitos: unknown; grau: number },
): EfeitosAgregados {
  const proprios = lerEfeitos(acao.efeitos).filter((e) => !efeitoInstantaneo(e));
  if (proprios.length === 0) return base;
  return agregarEfeitos([{ nome: acao.nome, tipo: "passiva", efeitos: proprios }], new Set(), base, {
    grau: acao.grau,
  });
}

// Soma de buckets (valor + fontes sem repetir).
function somarFontes(...fvs: (FonteValor | undefined)[]): FonteValor {
  const out: FonteValor = { valor: 0, fontes: [] };
  for (const fv of fvs) {
    if (!fv) continue;
    out.valor += fv.valor;
    for (const f of fv.fontes) if (!out.fontes.includes(f)) out.fontes.push(f);
  }
  return out;
}

// Bônus dos alvos largos num teste de atributo puro (e na iniciativa, que é de DES).
export function bonusTesteAmplo(
  agg: Pick<EfeitosAgregados, "bonusTesteTodos" | "bonusTesteAtributo" | "bonusQualquer">,
  atributo: Atributo,
): FonteValor {
  return somarFontes(agg.bonusTesteTodos, agg.bonusTesteAtributo[atributo], agg.bonusQualquer);
}

// Chip aplicável a uma rolagem específica — derivado do agregado + contexto.
// O Rolador (Bandeja) renderiza um por chip com toggle de override. Mecânicos
// (vantagem/desvantagem/crit_range/floor_d20) mudam o d20; informativos
// (sucesso_auto/reroll) só anotam na string da rolagem.
export type ChipContexto = {
  // Identifica o chip no Rolador (o toggle é por chave).
  chave: string;
  tipo:
    | "vantagem"
    | "desvantagem"
    | "sucesso_auto"
    | "falha_auto"
    | "crit_range"
    | "floor_d20"
    | "reroll"
    | "dano_min"
    | "trocar_dano"
    | "ignora"
    | "alcance"
    | "melhor_de"
    | "critico"
    | "dano_extra"
    | "dados_extra"
    | "bonus"
    | "dano_maximo"
    | "piso_dado"
    | "ataque_poderoso"
    | "dano_poderoso"
    | "multi_ataque"
    | "explosao"
    | "progressivo";
  rotulo: string;
  fontes: string[];
  // Parâmetro do efeito (mínimo do crit/floor, rerrolagens, metros, dados,
  // vezes do crítico, bônus; no dano máximo, o d20 que liga sozinho).
  valor?: number;
  // Nasce desligado (uso limitado).
  opcional?: boolean;
  // Complemento do tooltip (ex: usos por descanso).
  detalhe?: string;
  // Dados que o chip soma ao dano (dano extra).
  dados?: Dado[];
  // Dados a mais no crítico.
  extras?: number;
  // Dado mínimo: até quanto e no que vira (0 = o máximo).
  piso?: { ate: number; vira: number };
  // Habilidade de Usar que o chip gasta ao rolar.
  gasta?: string;
  // Explosão: quando dispara e quantas vezes.
  explosao?: { gatilho: GatilhoExplosao; valor: number; limite: number };
  // Teto da contagem: passos do bônus progressivo, ou usos empilháveis do chip sob demanda.
  max?: number;
  memoria?: string;
  progressivo?: { fonte: string; formula: string; em: string; passos: number; cresce?: GatilhoProgressivo };
};

// Subconjunto do agregado que o Rolador precisa pra montar os chips — evita
// serializar o EfeitosAgregados inteiro como prop da Bandeja.
export type EfeitosContexto = Pick<
  EfeitosAgregados,
  | "contextuais"
  | "critsFaixa"
  | "margemCritico"
  | "floorsD20"
  | "rerolls"
  | "danosMin"
  | "trocaDano"
  | "ignora"
  | "alcances"
  | "danoMelhorDe"
  | "extrasDano"
  | "ctxFormula"
  | "situacionais"
  | "danosMaximos"
  | "pisosDado"
  | "critsExtra"
  | "ataquesPoderosos"
  | "multiAtaques"
  | "explosoes"
  | "progressivos"
>;

export function efeitosDoContexto(agg: EfeitosAgregados): EfeitosContexto {
  return {
    contextuais: agg.contextuais,
    critsFaixa: agg.critsFaixa,
    margemCritico: agg.margemCritico,
    floorsD20: agg.floorsD20,
    rerolls: agg.rerolls,
    danosMin: agg.danosMin,
    trocaDano: agg.trocaDano,
    ignora: agg.ignora,
    alcances: agg.alcances ?? [],
    danoMelhorDe: agg.danoMelhorDe,
    extrasDano: agg.extrasDano,
    ctxFormula: agg.ctxFormula,
    situacionais: agg.situacionais,
    danosMaximos: agg.danosMaximos,
    pisosDado: agg.pisosDado,
    critsExtra: agg.critsExtra,
    ataquesPoderosos: agg.ataquesPoderosos,
    multiAtaques: agg.multiAtaques ?? [],
    explosoes: agg.explosoes ?? [],
    progressivos: agg.progressivos ?? [],
  };
}

const ROTULO_CONTEXTUAL: Record<EfeitoContextual["tipo"], string> = {
  vantagem: "Vantagem",
  desvantagem: "Desvantagem",
  sucesso_auto: "Sucesso automático",
  falha_auto: "Falha automática",
};

export function chipsDoContexto(
  agg: EfeitosContexto,
  ctx: ContextoRolagem,
): ChipContexto[] {
  const chips: ChipContexto[] = [];
  const ehDano = ctx.tipo === "dano";
  const multiAtaques = agg.multiAtaques ?? [];
  const explosoes = agg.explosoes ?? [];
  const progressivos = agg.progressivos ?? [];

  // Dano extra e dados extras (no dano) e dado extra (em jogada de d20); os sob
  // demanda gastam a habilidade ao rolar.
  const empilharExtras = () => {
    const f = agg.ctxFormula;
    const grau = ctx.tipo === "dano" ? (ctx.grau ?? 0) : 0;
    for (const x of agg.extrasDano) {
      const filtro = ehDano ? filtroDeDano(x, ctx) : "sim";
      const casa = ehDano
        ? casaDano(x.em, ctx) && filtro !== "nao"
        : x.tipo === "dano_extra" && !extraNoDano(x.em) && casaContexto(x.em, ctx);
      if (!casa) continue;
      const r = f
        ? resolverFormula(x.formula, f.atributos, f.nivel, { grau })
        : { ...parseFormulaDados(x.formula), usados: [] };
      const talvez = filtro === "talvez";
      const detalhe = juntarDetalhes(detalheDoGasto(x), talvez ? textoFiltroDano(x) : undefined);
      if (x.tipo === "dano_extra") {
        if (r.dados.length === 0 && r.modificador === 0) continue;
        const texto = formulaVariavel(x.formula)
          ? formulaAgrupada(r.dados, r.modificador)
          : x.formula.trim();
        chips.push({
          chave: x.chave,
          tipo: "dano_extra",
          rotulo: `+${texto.replace(/^\+\s*/, "")}`,
          fontes: [x.fonte],
          opcional: !x.sempre || talvez,
          dados: r.dados,
          valor: r.modificador,
          gasta: x.gasta,
          ...(x.vezes ? { max: x.vezes } : {}),
          detalhe,
        });
      } else {
        const n = r.modificador;
        if (n <= 0) continue;
        chips.push({
          chave: x.chave,
          tipo: "dados_extra",
          rotulo: `+${n} dado${n > 1 ? "s" : ""}`,
          fontes: [x.fonte],
          opcional: !x.sempre || talvez,
          valor: n,
          gasta: x.gasta,
          ...(x.vezes ? { max: x.vezes } : {}),
          detalhe,
        });
      }
    }
  };

  // ─ Efeitos de d20 — só em rolagens de d20 (não em dano) ─
  if (!ehDano) {
    // Vantagem, desvantagem, sucesso e falha automáticos: um chip ligado com as
    // fontes que valem sempre e um desligado por fonte com `quando`.
    for (const tipo of ["vantagem", "desvantagem", "sucesso_auto", "falha_auto"] as const) {
      const casados = agg.contextuais.filter((c) => c.tipo === tipo && casaContexto(c.alvo, ctx));
      const sempre = casados.filter((c) => !c.quando?.trim());
      if (sempre.length) {
        chips.push({
          chave: tipo,
          tipo,
          rotulo: ROTULO_CONTEXTUAL[tipo],
          fontes: dedup(sempre.map((c) => c.fonte)),
        });
      }
      casados
        .filter((c) => c.quando?.trim())
        .forEach((c, i) =>
          chips.push({
            chave: `${tipo}-quando-${i}`,
            tipo,
            rotulo: ROTULO_CONTEXTUAL[tipo],
            fontes: [c.fonte],
            opcional: true,
            detalhe: `quando: ${c.quando!.trim()}`,
          }),
        );
    }

    // Crítico expandido só em ataque: o menor mínimo que casa, menos a margem.
    if (ctx.tipo === "ataque") {
      const casados = agg.critsFaixa.filter((c) => casaContexto(c.alvo, ctx));
      const faixa = casados.length ? Math.min(...casados.map((c) => c.minimo)) : 20;
      const minimo = Math.max(2, faixa - agg.margemCritico.valor);
      if (minimo < 20) {
        chips.push({
          chave: "crit_range",
          tipo: "crit_range",
          rotulo: `Crítico ${minimo}-20`,
          fontes: dedup([...casados.map((c) => c.fonte), ...agg.margemCritico.fontes]),
          valor: minimo,
        });
      }
    }
    // Mínimo no d20: vale o maior entre os que casam com a jogada.
    const floors = agg.floorsD20.filter((f) => casaContexto(f.alvo, ctx));
    if (floors.length) {
      const minimo = Math.max(...floors.map((f) => f.minimo));
      chips.push({
        chave: "floor_d20",
        tipo: "floor_d20",
        rotulo: `Mínimo ${minimo} no d20`,
        fontes: dedup(floors.filter((f) => f.minimo === minimo).map((f) => f.fonte)),
        valor: minimo,
      });
    }
    // Reroll: nasce desligado e vale 1 rerrolagem por jogada; com uso limitado,
    // gasta 1 uso da habilidade ao rerrolar.
    const rerolls = Object.entries(agg.rerolls).flatMap(([gatilho, r]) =>
      r && casaContexto(gatilho, ctx) ? [r] : [],
    );
    if (rerolls.length > 0) {
      const limitado = rerolls.some((r) => r.livre) ? undefined : rerolls.find((r) => r.gasta);
      chips.push({
        chave: "reroll",
        tipo: "reroll",
        rotulo: "Rerrolar",
        fontes: dedup(rerolls.flatMap((r) => r.fontes)),
        valor: 1,
        opcional: true,
        ...(limitado ? { gasta: limitado.gasta, detalhe: detalheDoGasto(limitado) } : {}),
      });
    }
    empilharExtras();
    // Acerto por dano: só em ataque, nasce desligado.
    if (ctx.tipo === "ataque") {
      agg.ataquesPoderosos.forEach((a, i) => {
        if (!casaContexto(a.alvo, ctx)) return;
        chips.push({
          chave: `poderoso-${i}`,
          tipo: "ataque_poderoso",
          rotulo: `−${a.penalidade} no ataque`,
          fontes: [a.fonte],
          valor: a.penalidade,
          opcional: true,
          detalhe: `+${a.bonus} no dano se acertar`,
        });
      });
      // Multiataque: o maior total que casa, mais os ataques a mais.
      const multis = multiAtaques.filter((m) => casaContexto(m.alvo, ctx));
      const vezes =
        Math.max(1, ...multis.filter((m) => !m.soma).map((m) => m.vezes)) +
        multis.filter((m) => m.soma).reduce((s, m) => s + m.vezes, 0);
      if (vezes > 1) {
        chips.push({
          chave: "multi_ataque",
          tipo: "multi_ataque",
          rotulo: `${vezes} ataques`,
          fontes: dedup(multis.map((m) => m.fonte)),
          valor: vezes,
        });
      }
      // Explosão no ataque: ataca de novo.
      explosoes.forEach((x, i) => {
        if (!x.em.startsWith("ataque") || !casaContexto(x.em, ctx)) return;
        chips.push({
          chave: `explosao-${i}`,
          tipo: "explosao",
          rotulo: x.gatilho === "critico" ? "Crítico ataca de novo" : `${x.valor}+ ataca de novo`,
          fontes: [x.fonte],
          explosao: { gatilho: x.gatilho, valor: x.valor, limite: x.limite },
          ...(x.limite > 1 ? { detalhe: `até ${x.limite} vezes` } : {}),
        });
      });
    }
  }

  // Bônus progressivo: nasce em zero e o Rolador conta os passos.
  progressivos.forEach((p, i) => {
    const casa = ehDano
      ? extraNoDano(p.em) && casaDano(p.em, ctx)
      : !extraNoDano(p.em) && casaContexto(p.em, ctx);
    if (!casa) return;
    const f = agg.ctxFormula;
    const grau = ctx.tipo === "dano" ? (ctx.grau ?? 0) : 0;
    const r = f
      ? resolverFormula(p.formula, f.atributos, f.nivel, { grau })
      : { ...parseFormulaDados(p.formula), usados: [] };
    if (r.dados.length === 0 && r.modificador === 0) return;
    const texto = formulaAgrupada(r.dados, r.modificador);
    chips.push({
      chave: `progressivo-${i}`,
      tipo: "progressivo",
      rotulo: texto.startsWith("−") ? texto : `+${texto}`,
      fontes: [p.fonte],
      dados: r.dados,
      valor: r.modificador,
      max: p.max,
      memoria: `${p.fonte}|${p.formula}|${p.em}`,
      progressivo: {
        fonte: p.fonte,
        formula: p.formula,
        em: p.em,
        passos: p.passos ?? 0,
        ...(p.cresce ? { cresce: p.cresce } : {}),
      },
      detalhe: `por ${p.por ?? "vez"}`,
    });
  });

  // Bônus com `quando`: desligados, somam no modificador.
  agg.situacionais.forEach((s, i) => {
    const casa = ehDano ? s.alvo.startsWith("dano") && casaDano(s.alvo, ctx) : casaContexto(s.alvo, ctx);
    if (!casa) return;
    chips.push({
      chave: `bonus-${i}`,
      tipo: "bonus",
      rotulo: `${formatarMod(s.valor)} ${s.quando}`,
      fontes: [s.fonte],
      valor: s.valor,
      opcional: true,
      detalhe: `quando: ${s.quando}`,
    });
  });

  // ─ Efeitos de dano/ataque (etapa 3.5) ─
  if (ehDano) {
    // Crítico: multiplica os dados (×2 no padrão) e soma os dados a mais.
    const crits = agg.critsExtra.filter(
      (c) => casaDano(c.em, ctx) && filtroDeDano(c, ctx) !== "nao",
    );
    const vezes = Math.max(2, ...crits.map((c) => c.vezes));
    const extras = crits.reduce((s, c) => s + c.dados, 0);
    chips.push({
      chave: "critico",
      tipo: "critico",
      rotulo: "Crítico",
      fontes: dedup(crits.map((c) => c.fonte)),
      opcional: true,
      valor: vezes,
      extras,
      detalhe: [
        vezes === 2 ? "dobra os dados" : vezes === 3 ? "triplica os dados" : `dados ×${vezes}`,
        extras ? `+${extras} dado${extras > 1 ? "s" : ""}` : null,
      ]
        .filter(Boolean)
        .join(", "),
    });
    // Dano máximo (sob demanda gasta a habilidade ao rolar).
    agg.danosMaximos.forEach((d, i) => {
      const filtro = filtroDeDano(d, ctx);
      if (!casaDano(d.em, ctx) || filtro === "nao") return;
      chips.push({
        chave: `maximo-${i}`,
        tipo: "dano_maximo",
        rotulo: "Dano máximo",
        fontes: [d.fonte],
        opcional: !d.sempre || filtro === "talvez",
        valor: d.apartir,
        gasta: d.gasta,
        detalhe: juntarDetalhes(
          d.apartir ? `liga com ${d.apartir}+ no d20 do ataque, sem crítico` : undefined,
          detalheDoGasto(d),
          filtro === "talvez" ? textoFiltroDano(d) : undefined,
        ),
      });
    });
    // Dado mínimo: vale sempre (desligado se o dano não diz o grau ou o tipo).
    agg.pisosDado.forEach((p, i) => {
      const filtro = filtroDeDano(p, ctx);
      if (!casaDano(p.em, ctx) || filtro === "nao") return;
      chips.push({
        chave: `piso-${i}`,
        tipo: "piso_dado",
        rotulo: `${p.ate === 1 ? "1" : `1-${p.ate}`} vira ${p.vira || "o máximo"}`,
        fontes: [p.fonte],
        piso: { ate: p.ate, vira: p.vira },
        ...(filtro === "talvez" ? { opcional: true, detalhe: textoFiltroDano(p) } : {}),
      });
    });
    // Acerto por dano: o bônus no dano; liga sozinho se o ataque usou.
    agg.ataquesPoderosos.forEach((a, i) => {
      if (!casaDano(a.alvo.replace(/^ataque/, "dano"), ctx)) return;
      chips.push({
        chave: `poderoso-dano-${i}`,
        tipo: "dano_poderoso",
        rotulo: `+${a.bonus} no dano`,
        fontes: [a.fonte],
        valor: a.bonus,
        opcional: true,
      });
    });
    // Explosão no dano: o dado (ou o dano todo) rola de novo e soma.
    explosoes.forEach((x, i) => {
      if (x.em.startsWith("ataque") || !casaDano(x.em, ctx)) return;
      chips.push({
        chave: `explosao-${i}`,
        tipo: "explosao",
        rotulo:
          x.gatilho === "maximo"
            ? "Explode no máximo"
            : x.gatilho === "total"
              ? `Explode com ${x.valor}+ de dano`
              : `Explode com ${x.valor}+ no dado`,
        fontes: [x.fonte],
        explosao: { gatilho: x.gatilho, valor: x.valor, limite: x.limite },
        ...(x.limite > 1 ? { detalhe: `até ${x.limite} vezes` } : {}),
      });
    });
    empilharExtras();
  }
  // Piso de dano: só em rolagem de dano. Sem valor — o Rolador calcula a partir
  // da fórmula (metade do máximo dos dados). Com `quando`, nasce desligado.
  const pisos = ehDano
    ? agg.danosMin.filter((d) => casaDano(d.em, ctx) && filtroDeDano(d, ctx) !== "nao")
    : [];
  const pisoCerto = (d: (typeof pisos)[number]) => !d.quando && filtroDeDano(d, ctx) === "sim";
  const pisosSempre = pisos.filter(pisoCerto);
  if (pisosSempre.length) {
    chips.push({
      chave: "dano_min",
      tipo: "dano_min",
      rotulo: "Dano mín. (½ do máx)",
      fontes: dedup(pisosSempre.map((d) => d.fonte)),
    });
  }
  pisos
    .filter((d) => !pisoCerto(d))
    .forEach((d, i) =>
      chips.push({
        chave: `dano_min-quando-${i}`,
        tipo: "dano_min",
        rotulo: "Dano mín. (½ do máx)",
        fontes: [d.fonte],
        opcional: true,
        detalhe: juntarDetalhes(d.quando ? `quando: ${d.quando}` : undefined, textoFiltroDano(d)),
      }),
    );
  // Melhor de N: só em dano, nasce desligado.
  if (ehDano && agg.danoMelhorDe) {
    const m = agg.danoMelhorDe;
    chips.push({
      chave: "melhor_de",
      tipo: "melhor_de",
      rotulo: `Melhor de ${m.vezes} no dano`,
      fontes: m.fontes,
      valor: m.vezes,
      opcional: true,
      ...(!m.livre && m.gasta ? { gasta: m.gasta, detalhe: detalheDoGasto(m) } : {}),
    });
  }
  // Troca de tipo de dano: só em dano.
  if (ehDano && agg.trocaDano) {
    chips.push({
      chave: "trocar_dano",
      tipo: "trocar_dano",
      rotulo: `Dano vira ${agg.trocaDano.tipoDano}`,
      fontes: agg.trocaDano.fontes,
    });
  }
  // Ignora defesa: vale em ataque e em dano (anotação informativa).
  if (ctx.tipo === "ataque" || ehDano) {
    for (const [alvo, fl] of Object.entries(agg.ignora)) {
      if (fl) {
        chips.push({ chave: `ignora-${alvo}`, tipo: "ignora", rotulo: `Ignora ${alvo}`, fontes: fl.fontes });
      }
    }
  }
  // Alcance: descritivo, no ataque e no dano. Os metros que valem sempre somam num
  // chip só; alcance trocado e os opcionais ganham um chip cada.
  if (ctx.tipo === "ataque" || ehDano) {
    const casados = (agg.alcances ?? []).filter((a) =>
      ehDano ? casaDano(a.alvo.replace(/^ataque/, "dano"), ctx) : casaContexto(a.alvo, ctx),
    );
    const fixos = casados.filter((a) => !a.vira && !a.opcional);
    const soma = fixos.reduce((s, a) => s + a.valor, 0);
    if (soma !== 0) {
      chips.push({
        chave: "alcance",
        tipo: "alcance",
        rotulo: `${formatarMod(soma)} m de alcance`,
        fontes: dedup(fixos.map((a) => a.fonte)),
        valor: soma,
      });
    }
    casados
      .filter((a) => a.vira || a.opcional)
      .forEach((a, i) =>
        chips.push({
          chave: `alcance-${i}`,
          tipo: "alcance",
          rotulo: a.vira ? `Alcance: ${a.vira}` : `${formatarMod(a.valor)} m de alcance`,
          fontes: [a.fonte],
          ...(a.opcional ? { opcional: true } : {}),
          ...(a.quando ? { detalhe: `quando: ${a.quando}` } : {}),
        }),
      );
  }

  return chips;
}

function dedup(xs: string[]): string[] {
  return Array.from(new Set(xs));
}

function juntarDetalhes(...partes: (string | undefined)[]): string | undefined {
  return partes.filter(Boolean).join(" · ") || undefined;
}

// "gasta 1 uso (7/9), 1 Dados Brutais (4/8)" do chip sob demanda.
function detalheDoGasto(x: { usos?: string; custo?: string }): string | undefined {
  const partes = [x.usos ? `1 uso (${x.usos})` : null, x.custo ?? null].filter(Boolean);
  return partes.length ? `gasta ${partes.join(", ")}` : undefined;
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
  if (alvo.startsWith("teste-")) {
    const at = alvo.slice(6);
    if (ATRIBUTOS_SET.has(at)) {
      somarFonteValor(out.bonusTesteAtributo, at, valor, fonte);
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
  salvaguarda: (o) => o.bonusSalvaguardaTodas,
  concentracao: (o) => o.bonusConcentracao,
  teste: (o) => o.bonusTesteTodos,
  qualquer: (o) => o.bonusQualquer,
  "ataque-tecnica": (o) => o.bonusAtaqueTecnica,
  "ataque-comum": (o) => o.bonusAtaqueComum,
  "dano-tecnica": (o) => o.bonusDanoTecnica,
  "dano-comum": (o) => o.bonusDanoComum,
};

function aplicarProficiencia(
  out: EfeitosAgregados,
  alvoRaw: string,
  dobrada: boolean,
  fonte: string,
  slugsPericiaCustom: Set<string> = new Set(),
) {
  const alvo = alvoRaw.trim().toLowerCase();
  if (!alvo) return;
  const marcar = (bucket: Partial<Record<string, FonteProficiencia>>, chave: string) => {
    const atual = bucket[chave] ?? { fontes: [], dobrada: false };
    if (!atual.fontes.includes(fonte)) atual.fontes.push(fonte);
    if (dobrada) atual.dobrada = true;
    bucket[chave] = atual;
  };
  if (PERICIAS_SET.has(alvo) || slugsPericiaCustom.has(alvo)) {
    marcar(out.proficienciasPericia, alvo);
    return;
  }
  if (alvo.startsWith("salv-")) {
    const at = alvo.slice(5);
    if (ATRIBUTOS_SET.has(at)) marcar(out.proficienciasSalvaguarda, at);
  }
}

// Nível, atributos e grau com que o resumo mostra as fórmulas já resolvidas;
// `graus` (das técnicas do personagem) resolve GRAU em faixa fora da técnica.
export type ContextoResumo = {
  nivel: number;
  atributos: Record<Atributo, number>;
  grau?: number;
  graus?: number[];
};

// Resumo curto do efeito pro chip; `nomeRecurso` traduz id de recurso. Com `ctx`,
// as fórmulas saem resolvidas ("+PROF/2" → "+2"); sem grau, GRAU fica escrito.
export function resumoEfeito(
  e: EfeitoHabilidade,
  nomeRecurso?: (id: string) => string | undefined,
  ctx?: ContextoResumo,
): string {
  const quando = (q?: string) => (q?.trim() ? ` · ${q.trim()}` : "");
  // Efeitos que resolvem GRAU com o grau de cada técnica; fora dela, faixa dos graus.
  const porTecnica =
    e.tipo === "dano_extra" || e.tipo === "dados_extra" || e.tipo === "desconto_tecnica";
  // Graus com que a fórmula resolve; null = fica a fórmula.
  const grausDe = (f: string): number[] | null => {
    if (!ctx || !formulaVariavel(f)) return null;
    if (!formulaUsaGrau(f)) return [0];
    if (ctx.grau !== undefined) return [ctx.grau];
    return porTecnica && ctx.graus?.length ? [...new Set(ctx.graus)].sort((a, b) => a - b) : null;
  };
  // Um valor por grau: iguais viram um, diferentes viram "menor a maior".
  const porGrau = (f: string, calc: (grau: number) => string): string | null => {
    const graus = grausDe(f);
    if (!graus) return null;
    const valores = [...new Set(graus.map(calc))];
    return valores.length === 1 ? valores[0] : `${valores[0]} a ${valores[valores.length - 1]}`;
  };
  // Número de uma fórmula sem dados, ou o texto dela quando não dá pra resolver.
  const numero = (f: string) =>
    porGrau(f, (grau) => String(valorDaFormula(f, ctx!.atributos, ctx!.nivel, { grau }))) ?? f;
  // Fórmula com dados ("2d10+CON" → "2d10+3").
  const texto = (f: string) =>
    porGrau(f, (grau) => formulaResolvidaTexto(f, ctx!.atributos, ctx!.nivel, { grau })) ?? f;
  switch (e.tipo) {
    case "modificador": {
      const f = e.formula;
      const valor = f
        ? (porGrau(f, (grau) => formatarMod(valorDaFormula(f, ctx!.atributos, ctx!.nivel, { grau }))) ??
          (/^[+-]/.test(f) ? f : `+${f}`))
        : formatarMod(e.valor);
      return `${valor} ${rotuloAlvo(e.alvo)}${quando(e.quando)}`;
    }
    case "vantagem":
    case "desvantagem":
      return `${rotuloAlvo(e.alvo)}${quando(e.quando)}`;
    case "proficiencia":
      return `${rotuloAlvo(e.alvo)}${e.dobrada ? " (2×)" : ""}`;
    case "recurso_delta": {
      const lbl =
        e.recurso === "pp"
          ? "PP"
          : e.recurso === "exaustao"
            ? "exaustão"
            : (nomeRecurso?.(e.recurso) ?? "recurso");
      return `${formatarMod(e.valor)} ${lbl}`;
    }
    case "cura":
      return texto(e.valor);
    case "condicao_imune":
    case "condicao_remover":
      return e.condicao;
    case "condicao_aplicar":
      return (
        (e.cd ? `${e.condicao} (CD ${e.cd})` : e.condicao) +
        ` · ${e.rodadas === 10 ? "1 minuto" : `${e.rodadas ?? 1} rodada${(e.rodadas ?? 1) === 1 ? "" : "s"}`}`
      );
    case "resistencia":
    case "imunidade":
    case "vulnerabilidade":
      return e.tipoDano;
    case "deslocamento":
      return `${e.tipoMov} ${e.valor}m`;
    case "valor_igual": {
      const nome = (slug: string) => ALVOS_VALOR_IGUAL.find((a) => a.slug === slug)?.nome ?? slug;
      return `${nome(e.alvo)} = ${e.metade ? "metade de " : ""}${nome(e.de)}`;
    }
    case "multiplicador":
      return `${e.alvo} ×${e.fator}`;
    case "substituir_atributo": {
      const sigla = ATRIBUTOS.find((a) => a.slug === e.atributo)?.sigla ?? e.atributo;
      return `${rotuloAlvo(e.alvo)} → ${sigla}${e.seMaior ? " se maior" : ""}`;
    }
    case "rolagem":
      return texto(e.formula);
    case "trigger":
      return e.gatilho || e.efeito;
    case "crit_range":
      return `${e.minimo}-20${e.alvo && e.alvo !== "ataque" ? ` · ${rotuloAlvo(e.alvo)}` : ""}`;
    case "reroll":
      return rotuloAlvo(e.gatilho);
    case "floor_d20":
      return `≤${e.minimo} ⇒ ${e.minimo} · ${rotuloAlvo(e.alvo ?? "qualquer")}`;
    case "sentido":
      return e.alcance > 0 ? `${e.sentido} ${e.alcance}m` : e.sentido;
    case "acao_extra":
      return e.quantidade > 1 ? `${e.quantidade}× ${e.acao}` : e.acao;
    case "sucesso_auto":
    case "falha_auto":
      return `${rotuloAlvo(e.alvo)}${quando(e.quando)}`;
    case "dano_min":
      return `metade do máx${e.em && e.em !== "dano" ? ` · ${rotuloAlvo(e.em)}` : ""}${quando(e.quando)}`;
    case "alcance":
      return `${e.vira ? e.vira : `${formatarMod(e.valor)} m`}${
        e.alvo && e.alvo !== "ataque" ? ` · ${rotuloAlvo(e.alvo)}` : ""
      }${quando(e.quando)}`;
    case "ignora":
      return `ignora ${e.alvo}`;
    case "trocar_dano":
      return `→ ${e.tipoDano}`;
    case "crit_imune":
      return "imune a crítico";
    case "margem_critico":
      return `+${e.valor}`;
    case "passo_dano":
      return `+${e.passos} ${e.alvo === "tecnica" ? "nas técnicas" : "na arma"}`;
    case "desconto_tecnica": {
      const sigla = e.custo === "pa" ? "PA" : "PP";
      const quanto =
        e.modo === "zero"
          ? `sem ${sigla}`
          : e.modo === "metade"
            ? `${sigla} pela metade`
            : `−${e.formula ? numero(e.formula) : e.valor} ${sigla}`;
      const graus = e.graus?.length ? ` · ${e.graus.map((g) => `${g}º`).join(", ")}` : "";
      return `${quanto}${graus}`;
    }
    case "dano_melhor_de":
      return `${e.vezes} rolagens`;
    case "dano_extra":
      return `+${texto(e.formula).replace(/^\+\s*/, "")}${e.em && e.em !== "dano" ? ` · ${rotuloAlvo(e.em)}` : ""}`;
    case "dados_extra": {
      const qtd = numero(e.quantidade);
      return `+${qtd} dado${qtd === "1" ? "" : "s"}${e.em && e.em !== "dano" ? ` · ${rotuloAlvo(e.em)}` : ""}`;
    }
    case "valor_fixo":
      return `${ALVOS_VALOR_FIXO.find((a) => a.slug === e.alvo)?.nome ?? e.alvo} vira ${texto(e.valor)}`;
    case "reducao_dano":
      return `−${e.formula ? numero(e.formula) : e.valor}${e.tipos ? ` ${e.tipos}` : ""}${quando(e.quando)}`;
    case "dano_maximo":
      return `${e.em && e.em !== "dano" ? rotuloAlvo(e.em) : "todo dano"}${e.apartir ? ` · d20 ${e.apartir}+` : ""}`;
    case "piso_dado":
      return `${e.ate === 1 ? "1" : `1-${e.ate}`} vira ${e.vira || "o máximo"}${e.em && e.em !== "dano" ? ` · ${rotuloAlvo(e.em)}` : ""}`;
    case "critico_extra":
      return [e.vezes > 2 ? `×${e.vezes}` : null, e.dados ? `+${e.dados} dado${e.dados > 1 ? "s" : ""}` : null]
        .filter(Boolean)
        .join(", ");
    case "ataque_poderoso":
      return `−${e.penalidade} ataque, +${e.bonus} dano${e.alvo && e.alvo !== "ataque" ? ` · ${rotuloAlvo(e.alvo)}` : ""}`;
    case "ignora_exaustao":
      return e.ate >= 6 ? "toda" : `até o ${e.ate}º nível`;
    case "descanso": {
      const partes = [
        e.exaustao ? `−${e.exaustao} exaustão` : null,
        e.pp ? `+${numero(e.pp)} PP` : null,
        e.dv ? `+${e.dv} Dado${e.dv > 1 ? "s" : ""} de Vida` : null,
      ].filter(Boolean);
      const qual = e.em === "ambos" ? "curto e longo" : e.em;
      return `${partes.join(", ")} · ${qual}`;
    }
    case "por_turno":
      return resumoPorTurno(e, texto, numero, nomeRecurso);
    case "multi_ataque":
      return `${e.soma ? `+${e.vezes} ataque${e.vezes > 1 ? "s" : ""}` : `${e.vezes} ataques`}${
        e.alvo && e.alvo !== "ataque" ? ` · ${rotuloAlvo(e.alvo)}` : ""
      }`;
    case "explosao": {
      const noAtaque = (e.em ?? "").startsWith("ataque");
      const gatilho =
        e.gatilho === "critico"
          ? "no crítico"
          : e.gatilho === "maximo"
            ? "dado no máximo"
            : e.gatilho === "total"
              ? `dano ${e.valor}+`
              : `${noAtaque ? "d20" : "dado"} ${e.valor}+`;
      return `${gatilho}${e.limite > 1 ? ` · até ${e.limite}×` : ""}${
        e.em && e.em !== "dano" ? ` · ${rotuloAlvo(e.em)}` : ""
      }`;
    }
    case "progressivo":
      return `+${texto(e.formula).replace(/^\+\s*/, "")} por ${porDoProgressivo(e)} · até ${e.max}×${
        e.em && e.em !== "dano" ? ` · ${rotuloAlvo(e.em)}` : ""
      }`;
    case "livre":
      return e.texto;
  }
}

// "cura 1d6+3", "+5 PV temporário", "1d6 fogo em você", "−1 PP".
function resumoPorTurno(
  e: Extract<EfeitoHabilidade, { tipo: "por_turno" }>,
  texto: (f: string) => string,
  numero: (f: string) => string,
  nomeRecurso?: (id: string) => string | undefined,
): string {
  if (e.o === "cura") return `cura ${texto(e.valor)}`;
  if (e.o === "pv_temp") return `${texto(e.valor)} PV temporário`;
  if (e.o === "dano") return `${texto(e.valor)}${e.tipoDano ? ` ${e.tipoDano.toLowerCase()}` : ""} em você`;
  return `${e.gasta ? "−" : "+"}${numero(e.valor)} ${nomeDoPool(e.recurso ?? "", nomeRecurso)}`;
}

// Nome de um pool de recurso (PP, exaustão ou recurso custom).
export function nomeDoPool(id: string, nomeRecurso?: (id: string) => string | undefined): string {
  if (id === "pp") return "PP";
  if (id === "exaustao") return "exaustão";
  return nomeRecurso?.(id) ?? "recurso";
}
