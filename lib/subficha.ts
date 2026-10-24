// Subficha: ficha com dono (lacaio, animal, barco). O dono é um personagem ou a
// mesa inteira, e a subficha não tem subficha. Puro (cliente e servidor).

export type PerfilFicha = "personagem" | "criatura" | "veiculo";

export type AbaFicha =
  | "combate"
  | "habilidades"
  | "arvores"
  | "pericias"
  | "objetivos"
  | "inventario"
  | "subfichas"
  | "tripulacao"
  | "calendario";

// Blocos da sidebar que um perfil esconde.
export type BlocoFicha = "nivel" | "pp" | "exaustao" | "descanso" | "atributos" | "testes";

export const ABAS: { id: AbaFicha; label: string; icone: string }[] = [
  { id: "combate", label: "Combate", icone: "fa-fist-raised" },
  { id: "habilidades", label: "Habilidades", icone: "fa-star" },
  { id: "arvores", label: "Árvores", icone: "fa-sitemap" },
  { id: "pericias", label: "Perícias", icone: "fa-dice-d20" },
  { id: "objetivos", label: "Objetivos", icone: "fa-scroll" },
  { id: "inventario", label: "Inventário", icone: "fa-sack-dollar" },
  { id: "subfichas", label: "Subfichas", icone: "fa-address-card" },
  { id: "tripulacao", label: "Tripulação", icone: "fa-users" },
  { id: "calendario", label: "Calendário", icone: "fa-calendar-days" },
];

// Abas que só a ficha principal tem.
const SO_DA_PRINCIPAL: AbaFicha[] = ["subfichas", "tripulacao", "calendario"];

// Abas que a subficha pode ligar e desligar.
export const ABAS_DE_SUBFICHA = ABAS.filter((a) => !SO_DA_PRINCIPAL.includes(a.id));

export type Perfil = {
  slug: PerfilFicha;
  nome: string;
  icone: string;
  // Abas de partida.
  abas: AbaFicha[];
  semBlocos: BlocoFicha[];
  // Como a ficha chama e mede o deslocamento base.
  deslocamento: { rotulo: string; unidade: string; icone: string };
};

const ANDAR = { rotulo: "Andar", unidade: "m", icone: "fa-person-walking" };

export const PERFIS: Perfil[] = [
  {
    slug: "personagem",
    nome: "Personagem",
    icone: "fa-user",
    abas: ABAS.map((a) => a.id),
    semBlocos: [],
    deslocamento: ANDAR,
  },
  {
    slug: "criatura",
    nome: "Criatura",
    icone: "fa-paw",
    abas: ["combate", "habilidades", "pericias", "inventario"],
    semBlocos: [],
    deslocamento: ANDAR,
  },
  {
    slug: "veiculo",
    nome: "Veículo",
    icone: "fa-ship",
    abas: ["combate", "habilidades", "inventario"],
    semBlocos: ["nivel", "pp", "exaustao", "descanso", "atributos", "testes"],
    deslocamento: { rotulo: "Velocidade", unidade: "nós", icone: "fa-gauge-high" },
  },
];

// Perfis que uma subficha pode ter.
export const PERFIS_DE_SUBFICHA = PERFIS.filter((p) => p.slug !== "personagem");

export function perfilDe(slug: unknown): Perfil {
  return PERFIS.find((p) => p.slug === slug) ?? PERFIS[0];
}

export function ehSubficha(p: {
  donoPersonagemId?: string | null;
  donoMesaId?: string | null;
}): boolean {
  return !!(p.donoPersonagemId || p.donoMesaId);
}

// Abas escolhidas na subficha; null = as do perfil.
export function lerAbas(raw: unknown): AbaFicha[] | null {
  if (!Array.isArray(raw)) return null;
  const validas = new Set<string>(ABAS_DE_SUBFICHA.map((a) => a.id));
  const abas = raw.filter((a): a is AbaFicha => typeof a === "string" && validas.has(a));
  return abas.length > 0 ? abas : null;
}

// Abas que a ficha mostra, na ordem de ABAS.
export function abasDaFicha(ficha: {
  perfil: unknown;
  abas: unknown;
  subficha: boolean;
  temCalendario: boolean;
}): AbaFicha[] {
  const escolhidas = new Set<AbaFicha>(
    (ficha.subficha && lerAbas(ficha.abas)) || perfilDe(ficha.perfil).abas,
  );
  return ABAS.filter((a) => {
    if (!escolhidas.has(a.id)) return false;
    if (a.id === "calendario") return ficha.temCalendario;
    return !ficha.subficha || !SO_DA_PRINCIPAL.includes(a.id);
  }).map((a) => a.id);
}

// ─── No combate ────────────────────────────────────────────

// Entra junto quando o narrador põe o dono, ou só se ele puser a subficha.
export type EntradaCombate = "junto" | "manual";
// A iniciativa: o mesmo valor do dono, d20 + a da própria ficha ou d20 + PRE do
// capitão (navio, cap. 14).
export type IniciativaSubficha = "dono" | "propria" | "capitao";
export type CombateSubficha = { entra: EntradaCombate; iniciativa: IniciativaSubficha };

export const ENTRADAS_COMBATE: { slug: EntradaCombate; nome: string; sub: string }[] = [
  { slug: "junto", nome: "Com o dono", sub: "entra junto" },
  { slug: "manual", nome: "Pelo narrador", sub: "só se ele puser" },
];

export const INICIATIVAS_SUBFICHA: { slug: IniciativaSubficha; nome: string; sub: string }[] = [
  { slug: "dono", nome: "A do dono", sub: "mesmo valor" },
  { slug: "propria", nome: "Própria", sub: "d20 + a ficha" },
  { slug: "capitao", nome: "Do capitão", sub: "d20 + PRE" },
];

// Sem escolha gravada, o do livro: animal e lacaio agem na iniciativa do dono
// (Adestrador, cap. 4); navio entra com o teste de PRE do capitão (cap. 14).
// Subficha da mesa não tem dono pra seguir.
export function combateDaSubficha(
  ficha: { perfil: unknown; combate?: unknown },
  daMesa = false,
): CombateSubficha {
  const veiculo = perfilDe(ficha.perfil).slug === "veiculo";
  const raw = ficha.combate && typeof ficha.combate === "object" ? (ficha.combate as Record<string, unknown>) : {};
  const entra = ENTRADAS_COMBATE.find((e) => e.slug === raw.entra)?.slug ?? (veiculo ? "manual" : "junto");
  const iniciativa =
    INICIATIVAS_SUBFICHA.find((i) => i.slug === raw.iniciativa)?.slug ?? (veiculo ? "capitao" : "dono");
  if (!daMesa) return { entra, iniciativa };
  return { entra: "manual", iniciativa: iniciativa === "dono" ? (veiculo ? "capitao" : "propria") : iniciativa };
}

// Gravado na ficha: só o que casa com as opções.
export function lerCombateSubficha(raw: unknown): CombateSubficha | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const entra = ENTRADAS_COMBATE.find((e) => e.slug === o?.entra)?.slug;
  const iniciativa = INICIATIVAS_SUBFICHA.find((i) => i.slug === o?.iniciativa)?.slug;
  return entra && iniciativa ? { entra, iniciativa } : null;
}

export const MAX_SUBFICHAS = 30;
export const MAX_SUBFICHAS_DA_MESA = 10;
export const MAX_COPIAS = 20;
export const MAX_NOME_SUBFICHA = 60;

// Nome da próxima cópia: "Lobo 3" depois de "Lobo 1" e "Lobo 2".
export function nomesDasCopias(molde: string, existentes: string[], quantas: number): string[] {
  const usados = new Set(existentes);
  const nomes: string[] = [];
  for (let n = 1; nomes.length < quantas; n++) {
    const nome = `${molde} ${n}`;
    if (!usados.has(nome)) nomes.push(nome);
  }
  return nomes;
}
