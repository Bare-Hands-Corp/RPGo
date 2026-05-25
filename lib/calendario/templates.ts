// Templates pré-definidos de calendário. Usados em `aplicarTemplate`.

import type { CalendarioConfig } from "./engine";

export const TEMPLATE_GREGORIANO: CalendarioConfig = {
  meses: [
    { nome: "Janeiro", dias: 31 },
    { nome: "Fevereiro", dias: 28 },
    { nome: "Março", dias: 31 },
    { nome: "Abril", dias: 30 },
    { nome: "Maio", dias: 31 },
    { nome: "Junho", dias: 30 },
    { nome: "Julho", dias: 31 },
    { nome: "Agosto", dias: 31 },
    { nome: "Setembro", dias: 30 },
    { nome: "Outubro", dias: 31 },
    { nome: "Novembro", dias: 30 },
    { nome: "Dezembro", dias: 31 },
  ],
  diasSemana: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
  // Estações do hemisfério sul (projeto é pt-BR).
  estacoes: [
    { nome: "Verão", mesInicio: 12, mesFim: 2 },
    { nome: "Outono", mesInicio: 3, mesFim: 5 },
    { nome: "Inverno", mesInicio: 6, mesFim: 8 },
    { nome: "Primavera", mesInicio: 9, mesFim: 11 },
  ],
  cicloLuaDias: 29.5,
  diaSemanaEpoch: 0,
  anoEpoch: 1,
};

// Template inspirado em One Piece.
export const TEMPLATE_OP: CalendarioConfig = {
  meses: [
    { nome: "Mar Azul", dias: 30 },
    { nome: "Mar Vermelho", dias: 30 },
    { nome: "Reverse Mountain", dias: 30 },
    { nome: "Whiskey Peak", dias: 30 },
    { nome: "Drum", dias: 30 },
    { nome: "Alabasta", dias: 30 },
    { nome: "Skypiea", dias: 30 },
    { nome: "Water Seven", dias: 30 },
    { nome: "Enies Lobby", dias: 30 },
    { nome: "Thriller Bark", dias: 30 },
    { nome: "Sabaody", dias: 30 },
    { nome: "Marineford", dias: 30 },
  ],
  diasSemana: ["Sol", "Mar", "Vento", "Tempestade", "Calmaria", "Lua", "Estrela"],
  estacoes: [
    { nome: "Primavera", mesInicio: 1, mesFim: 3 },
    { nome: "Verão", mesInicio: 4, mesFim: 6 },
    { nome: "Outono", mesInicio: 7, mesFim: 9 },
    { nome: "Inverno", mesInicio: 10, mesFim: 12 },
  ],
  cicloLuaDias: 28,
  diaSemanaEpoch: 0,
  anoEpoch: 1500,
};

export const TEMPLATES: Record<string, CalendarioConfig> = {
  gregoriano: TEMPLATE_GREGORIANO,
  op: TEMPLATE_OP,
};

export type TipoClimaDefault = {
  nome: string;
  icone: string;
  descricao: string;
  pesos: Record<string, number>;
};

export const TIPOS_CLIMA_DEFAULT: TipoClimaDefault[] = [
  { nome: "Sol forte",     icone: "☀️", descricao: "Dia ensolarado, calor intenso.",            pesos: { Primavera: 3, "Verão": 6, Outono: 1, Inverno: 0 } },
  { nome: "Nublado",       icone: "☁️", descricao: "Céu encoberto, sem chuva.",                 pesos: { Primavera: 3, "Verão": 2, Outono: 3, Inverno: 3 } },
  { nome: "Chuva fraca",   icone: "🌧️", descricao: "Chuva leve, contínua.",                    pesos: { Primavera: 4, "Verão": 2, Outono: 4, Inverno: 2 } },
  { nome: "Tempestade",    icone: "⛈️", descricao: "Chuva forte com raios e ventos.",           pesos: { Primavera: 1, "Verão": 2, Outono: 3, Inverno: 1 } },
  { nome: "Neve",          icone: "❄️", descricao: "Queda de neve. Temperatura abaixo de zero.", pesos: { Primavera: 0, "Verão": 0, Outono: 0, Inverno: 4 } },
  { nome: "Vento intenso", icone: "💨", descricao: "Ventania forte, dificulta navegação.",      pesos: { Primavera: 2, "Verão": 1, Outono: 3, Inverno: 2 } },
  { nome: "Neblina densa", icone: "🌫️", descricao: "Visibilidade reduzida, ar úmido.",          pesos: { Primavera: 1, "Verão": 0, Outono: 2, Inverno: 2 } },
];
