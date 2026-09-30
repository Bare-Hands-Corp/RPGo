import type { CriaturaSerializada } from "@/app/bestiario/types";

export type InstanciaCombateSerializada = {
  id: string;
  criaturaId: string | null;
  personagemId: string | null;
  nomeExibicao: string;
  iniciativa: number;
  ordem: number;
  // null quando é PJ (PV mora em Personagem.hpAtual/hpMax, não aqui).
  pvAtual: number | null;
  pvMax: number | null;
};

export type CombateSerializado = {
  id: string;
  sessaoId: string;
  rodadaAtual: number;
  turnoAtual: number;
  participantes: InstanciaCombateSerializada[];
};

export type SessaoSerializada = {
  id: string;
  mesaId: string;
  iniciadaEm: string;
  combateAtivo: CombateSerializado | null;
};

// Ficha completa — precisa dos componentes/perícias/PV em dados pra alimentar
// tanto os seletores de "adicionar participante" quanto a ficha rolável que
// abre a partir da lista de iniciativa durante o combate.
export type CriaturaParaCombate = CriaturaSerializada;
export type PersonagemParaCombate = {
  id: string;
  nome: string;
  hpAtual: number;
  hpMax: number;
  destreza: number;
};
export type EncontroParaCombate = {
  id: string;
  nome: string;
  itens: { criaturaId: string; quantidade: number }[];
};

// Participante a incluir num combate novo ou já em andamento.
export type NovoParticipante = {
  criaturaId?: string;
  personagemId?: string;
  quantidade: number; // só relevante pra criatura
  iniciativa: number;
  agrupar: boolean; // mesma iniciativa pra todas as cópias (só relevante se quantidade > 1)
};
