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
