import type { AmeacaAcoes, AmeacaCaracteristicas, AmeacaPayload, AmeacaSerializada } from "./types";

const CARACTERISTICAS_VAZIAS: AmeacaCaracteristicas = {
  pericias: [],
  sentidos: {
    percepcaoPassiva: null,
    extras: "",
  },
  salvaguardas: [],
};

const ACOES_VAZIAS: AmeacaAcoes = {
  padrao: [],
  bonus: [],
  reacoes: [],
  poderosas: [],
};

function comoNumero(valor: unknown, fallback = 0): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : fallback;
}

function comoTexto(valor: unknown, fallback = ""): string {
  return typeof valor === "string" ? valor : fallback;
}

function comoArray<T>(valor: unknown, fallback: T[]): T[] {
  return Array.isArray(valor) ? (valor as T[]) : fallback;
}

function comoObjeto<T extends Record<string, unknown>>(valor: unknown, fallback: T): T {
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    return valor as T;
  }
  return fallback;
}

function normalizarCaracteristicas(valor: unknown): AmeacaCaracteristicas {
  const objeto = comoObjeto<Record<string, unknown>>(valor, {});
  const sentidos = comoObjeto<Record<string, unknown>>(objeto.sentidos, {});
  const pericias = comoArray<Record<string, unknown>>(objeto.pericias, []);
  const salvaguardas = comoArray<Record<string, unknown>>(objeto.salvaguardas, []);

  return {
    pericias: pericias.map((item) => ({
      id: comoTexto(item?.id, crypto.randomUUID()),
      nome: comoTexto(item?.nome, ""),
      bonus: comoNumero(item?.bonus, 0),
    })),
    sentidos: {
      percepcaoPassiva:
        sentidos.percepcaoPassiva === null || sentidos.percepcaoPassiva === undefined
          ? null
          : comoNumero(sentidos.percepcaoPassiva, 0),
      extras: comoTexto(sentidos.extras, ""),
    },
    salvaguardas: salvaguardas.map((item) => ({
      id: comoTexto(item?.id, crypto.randomUUID()),
      nome: comoTexto(item?.nome, ""),
      bonus: comoNumero(item?.bonus, 0),
    })),
  };
}

function normalizarAcoes(valor: unknown): AmeacaAcoes {
  const objeto = comoObjeto<Record<string, unknown>>(valor, {});
  const normalizarGrupo = (grupo: unknown) =>
    comoArray<Record<string, unknown>>(grupo, []).map((item) => ({
      id: comoTexto(item?.id, crypto.randomUUID()),
      nome: comoTexto(item?.nome, ""),
      descricao: comoTexto(item?.descricao, ""),
      acerto: comoTexto(item?.acerto, ""),
      dano: comoTexto(item?.dano, ""),
      custo: comoTexto(item?.custo, ""),
    }));

  return {
    padrao: normalizarGrupo(objeto.padrao),
    bonus: normalizarGrupo(objeto.bonus),
    reacoes: normalizarGrupo(objeto.reacoes),
    poderosas: normalizarGrupo(objeto.poderosas),
  };
}

export function criarAmeacaVazia(): AmeacaPayload {
  return {
    nome: "",
    classeResistencia: 0,
    pontosVida: 0,
    classeDificuldade: 0,
    nivelDesafio: 0,
    deslocamento: 0,
    deslocamentoNado: null,
    pontosPoder: 0,
    bonusProficiencia: 0,
    forca: 0,
    destreza: 0,
    constituicao: 0,
    sabedoria: 0,
    presenca: 0,
    vontade: 0,
    caracteristicas: CARACTERISTICAS_VAZIAS,
    aspectos: [],
    acoes: ACOES_VAZIAS,
  };
}

export function serializarAmeaca(ameaca: {
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
  caracteristicas: unknown;
  aspectos: unknown;
  acoes: unknown;
  criadoEm: Date;
  atualizadoEm: Date;
}): AmeacaSerializada {
  return {
    id: ameaca.id,
    mesaId: ameaca.mesaId,
    nome: ameaca.nome,
    classeResistencia: ameaca.classeResistencia,
    pontosVida: ameaca.pontosVida,
    classeDificuldade: ameaca.classeDificuldade,
    nivelDesafio: ameaca.nivelDesafio,
    deslocamento: ameaca.deslocamento,
    deslocamentoNado: ameaca.deslocamentoNado,
    pontosPoder: ameaca.pontosPoder,
    bonusProficiencia: ameaca.bonusProficiencia,
    forca: ameaca.forca,
    destreza: ameaca.destreza,
    constituicao: ameaca.constituicao,
    sabedoria: ameaca.sabedoria,
    presenca: ameaca.presenca,
    vontade: ameaca.vontade,
    caracteristicas: normalizarCaracteristicas(ameaca.caracteristicas),
    aspectos: comoArray<Record<string, unknown>>(ameaca.aspectos, []).map((item) => ({
      id: comoTexto(item?.id, crypto.randomUUID()),
      nome: comoTexto(item?.nome, ""),
      descricao: comoTexto(item?.descricao, ""),
    })),
    acoes: normalizarAcoes(ameaca.acoes),
    criadoEm: ameaca.criadoEm.toISOString(),
    atualizadoEm: ameaca.atualizadoEm.toISOString(),
  };
}
