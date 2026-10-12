// Combate como o jogador vê: a iniciativa com todos os envolvidos, e de cada
// criatura só o que o narrador liberou. Puro (cliente e servidor).

export type AcaoVista = {
  id: string;
  nome: string;
  // Bloco do statblock ("Ação Padrão", "Reações"…).
  categoria: string;
  descricao: string;
  // Linhas curtas: "Ataque +5", "Dano: 1d8 Cortante", "Alcance: 1,5 m".
  stats: string[];
};

export type ParticipanteVisto = {
  id: string;
  nome: string;
  foto: string | null;
  tipo: "personagem" | "criatura";
  // É o personagem desta ficha.
  voce: boolean;
  iniciativa: number;
  // null = o narrador não liberou (criatura) ou não se aplica.
  pv: { atual: number; max: number } | null;
  pp: { atual: number; max: number } | null;
  cr: number | null;
  // Prévia da ficha: as ações que a criatura já usou. null = fechada.
  acoes: AcaoVista[] | null;
};

export type CombateVisto = {
  id: string;
  sessaoId: string;
  rodada: number;
  // Índice em `participantes` de quem está na vez.
  turno: number;
  participantes: ParticipanteVisto[];
};

// Ordem do combate: a posição (`ordem`) manda. Ela nasce da iniciativa rolada
// (maior primeiro) e o narrador pode rearrumar arrastando.
export function ordenarParticipantes<T extends { iniciativa: number; ordem: number }>(participantes: T[]): T[] {
  return participantes.slice().sort((a, b) => a.ordem - b.ordem || b.iniciativa - a.iniciativa);
}

// O que o narrador pode mostrar de uma criatura.
export const CAMPOS_VISIVEIS = ["pvVisivel", "ppVisivel", "crVisivel", "fichaVisivel"] as const;
export type CampoVisivel = (typeof CAMPOS_VISIVEIS)[number];
