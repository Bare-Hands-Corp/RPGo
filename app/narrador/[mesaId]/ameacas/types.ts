export type AmeacaPericia = {
  id: string;
  nome: string;
  bonus: number;
};

export type AmeacaSalvaguarda = {
  id: string;
  nome: string;
  bonus: number;
};

export type AmeacaSentidos = {
  percepcaoPassiva: number | null;
  extras: string;
};

export type AmeacaCaracteristicas = {
  pericias: AmeacaPericia[];
  sentidos: AmeacaSentidos;
  salvaguardas: AmeacaSalvaguarda[];
};

export type AmeacaAspecto = {
  id: string;
  nome: string;
  descricao: string;
};

export type AmeacaAcao = {
  id: string;
  nome: string;
  descricao: string;
  acerto: string;
  dano: string;
  custo: string;
};

export type AmeacaAcoes = {
  padrao: AmeacaAcao[];
  bonus: AmeacaAcao[];
  reacoes: AmeacaAcao[];
  poderosas: AmeacaAcao[];
};

export type AmeacaSerializada = {
  id: string;
  mesaId: string;
  nome: string;
  classeResistencia: number;
  pontosVida: number;
  classeDificuldade: number;
  nivelDesafio: number;
  deslocamento: number;
  deslocamentoNado: number | null;
  pontosPoder: number;
  bonusProficiencia: number;
  forca: number;
  destreza: number;
  constituicao: number;
  sabedoria: number;
  presenca: number;
  vontade: number;
  caracteristicas: AmeacaCaracteristicas;
  aspectos: AmeacaAspecto[];
  acoes: AmeacaAcoes;
  criadoEm: string;
  atualizadoEm: string;
};

export type AmeacaPayload = Omit<AmeacaSerializada, "id" | "mesaId" | "criadoEm" | "atualizadoEm">;
