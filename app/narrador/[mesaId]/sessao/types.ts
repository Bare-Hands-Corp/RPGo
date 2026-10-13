import type { CriaturaSerializada } from "@/app/bestiario/types";
import type { AcoesGastas, Resolucao } from "@/lib/combate";
import type { CondicaoAtiva } from "@/lib/condicoes";

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
  // Condições valendo nele (lib/condicoes.ts).
  condicoes: CondicaoAtiva[];
  // Ações que o participante já usou neste turno (lib/combate.ts).
  acoesGastas: AcoesGastas;
  // Usos que restam das ações com usos limitados (id do componente → número).
  usosAcoes: Record<string, number>;
  // PP que a criatura já gastou neste combate (o máximo é Criatura.pontosPoder).
  ppGasto: number;
  // O que os jogadores veem desta criatura (lib/combate.ts).
  pvVisivel: boolean;
  ppVisivel: boolean;
  crVisivel: boolean;
  fichaVisivel: boolean;
  // Ações (TraitInstance.id) que aparecem na prévia da ficha.
  acoesReveladas: string[];
  autoRevelarAcoes: boolean;
};

export type CombateSerializado = {
  id: string;
  sessaoId: string;
  rodadaAtual: number;
  // Índice em `participantes`, que vem na ordem do combate (InstanciaCombate.ordem).
  turnoAtual: number;
  participantes: InstanciaCombateSerializada[];
  // Ações com alvo que ainda têm rolagem ou dano pendente.
  resolucoes: Resolucao[];
  // As rolagens do narrador vão pro chat sem os números.
  rolagensPrivadas: boolean;
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
  // Bônus de iniciativa como está na ficha (atributo, efeitos, exaustão).
  iniciativa: number;
  fotoUrl: string | null;
};
export type EncontroParaCombate = {
  id: string;
  nome: string;
  itens: { criaturaId: string; quantidade: number }[];
};

// Participante a incluir num combate novo ou já em andamento. A lista chega
// na ordem em que o combate começa.
export type NovoParticipante = {
  criaturaId?: string;
  personagemId?: string;
  quantidade: number; // só relevante pra criatura
  iniciativa: number;
  agrupar: boolean; // mesma iniciativa pra todas as cópias (só relevante se quantidade > 1)
};
