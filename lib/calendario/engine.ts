// Engine pura de calendário (TS, compartilhado entre server e client).
//
// Convenções:
//   - "dataDias" = Int absoluto desde o dia 0 do calendário (Ano 1, Mês 1, Dia 1).
//   - "config" = CalendarioConfig.
//   - Mês e dia são 1-based na API pública; índices internos são 0-based.

export type Mes = { nome: string; dias: number };
export type Estacao = { nome: string; mesInicio: number; mesFim: number };

export type CalendarioConfig = {
  meses: Mes[];
  diasSemana: string[];
  estacoes: Estacao[];
  cicloLuaDias: number;
  diaSemanaEpoch?: number;
  anoEpoch?: number;
};

export type DataExpandida = {
  ano: number;
  mes: number;
  dia: number;
  nomeMes: string;
  diaSemana: string;
  estacao: string;
};

export type FaseLua = { fracao: number; nome: string; emoji: string };

export type TipoClimaLike = {
  id: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
  pesosPorEstacao: Record<string, number> | unknown;
};

export function diasNoAno(config: CalendarioConfig): number {
  return config.meses.reduce((soma, m) => soma + m.dias, 0);
}

// Cap absoluto de ano in-game. Cobre qualquer campanha plausível e evita
// estouro visual / dataDias gigante por engano.
export const ANO_MAX = 9999;

// Caps de configuração: evitam meses/anos absurdos que estouram o grid
// ou geram dataDias overflow (e+33 etc).
export const DIAS_POR_MES_MAX = 366;
export const MESES_POR_ANO_MAX = 60;

// dataDias máximo permitido neste calendário (último dia do ANO_MAX).
export function diasMaximos(config: CalendarioConfig): number {
  const anoEpoch = config.anoEpoch ?? 1;
  return (ANO_MAX - anoEpoch + 1) * diasNoAno(config) - 1;
}

export function diasParaData(
  { ano, mes, dia }: { ano: number; mes: number; dia: number },
  config: CalendarioConfig,
): number {
  const anoEpoch = config.anoEpoch ?? 1;
  const anosDecorridos = ano - anoEpoch;
  let dias = anosDecorridos * diasNoAno(config);
  for (let i = 0; i < mes - 1; i++) {
    dias += config.meses[i].dias;
  }
  dias += dia - 1;
  return dias;
}

export function dataParaDias(dataDias: number, config: CalendarioConfig): DataExpandida {
  const anoEpoch = config.anoEpoch ?? 1;
  const tamanhoAno = diasNoAno(config);

  let restante = dataDias;
  let ano = anoEpoch;
  if (restante >= 0) {
    ano += Math.floor(restante / tamanhoAno);
    restante = restante % tamanhoAno;
  } else {
    const anosNegativos = Math.ceil(-restante / tamanhoAno);
    ano -= anosNegativos;
    restante += anosNegativos * tamanhoAno;
  }

  let mes = 1;
  for (let i = 0; i < config.meses.length; i++) {
    if (restante < config.meses[i].dias) {
      mes = i + 1;
      break;
    }
    restante -= config.meses[i].dias;
  }
  const dia = restante + 1;
  const nomeMes = config.meses[mes - 1].nome;

  return {
    ano,
    mes,
    dia,
    nomeMes,
    diaSemana: diaSemana(dataDias, config),
    estacao: estacaoDoMes(mes, config),
  };
}

export function diaSemana(dataDias: number, config: CalendarioConfig): string {
  const lista = config.diasSemana;
  const epoch = config.diaSemanaEpoch ?? 0;
  const len = lista.length;
  const idx = (((epoch + dataDias) % len) + len) % len;
  return lista[idx];
}

export function estacaoDoMes(mes: number, config: CalendarioConfig): string {
  for (const e of config.estacoes) {
    if (e.mesInicio <= e.mesFim) {
      if (mes >= e.mesInicio && mes <= e.mesFim) return e.nome;
    } else {
      if (mes >= e.mesInicio || mes <= e.mesFim) return e.nome;
    }
  }
  return config.estacoes[0]?.nome ?? "Indefinida";
}

const FASES_LUA: { limite: number; nome: string; emoji: string }[] = [
  { limite: 0.03, nome: "Lua Nova", emoji: "🌑" },
  { limite: 0.22, nome: "Crescente", emoji: "🌒" },
  { limite: 0.28, nome: "Quarto Crescente", emoji: "🌓" },
  { limite: 0.47, nome: "Crescente Gibosa", emoji: "🌔" },
  { limite: 0.53, nome: "Lua Cheia", emoji: "🌕" },
  { limite: 0.72, nome: "Minguante Gibosa", emoji: "🌖" },
  { limite: 0.78, nome: "Quarto Minguante", emoji: "🌗" },
  { limite: 0.97, nome: "Minguante", emoji: "🌘" },
];

export function fasesLua(dataDias: number, cicloLuaDias: number): FaseLua {
  const ciclo = cicloLuaDias || 29.5;
  let f = (dataDias % ciclo) / ciclo;
  if (f < 0) f += 1;
  for (const fase of FASES_LUA) {
    if (f < fase.limite) return { fracao: f, nome: fase.nome, emoji: fase.emoji };
  }
  return { fracao: f, nome: "Lua Nova", emoji: "🌑" };
}

export function dataRelativa(dataDias: number, refDias: number): string {
  const delta = refDias - dataDias;
  if (delta === 0) return "hoje";
  if (delta === 1) return "ontem";
  if (delta === -1) return "amanhã";
  if (delta > 1) return `há ${delta} dias`;
  return `em ${-delta} dias`;
}

// Sorteia 1 tipo de clima ponderado pelos pesos daquela estação.
// `rand` é opcional pra testes determinísticos. Retorna null se nenhum tipo é válido.
export function sortearTipoClima(
  tiposClima: TipoClimaLike[],
  estacao: string,
  rand: () => number = Math.random,
): TipoClimaLike | null {
  const candidatos: { tipo: TipoClimaLike; peso: number }[] = [];
  let total = 0;
  for (const t of tiposClima) {
    const pesos = (t.pesosPorEstacao as Record<string, number> | null) || {};
    const peso = Number(pesos[estacao]) || 0;
    if (peso > 0) {
      candidatos.push({ tipo: t, peso });
      total += peso;
    }
  }
  if (total === 0) return null;

  let r = rand() * total;
  for (const c of candidatos) {
    r -= c.peso;
    if (r < 0) return c.tipo;
  }
  return candidatos[candidatos.length - 1].tipo;
}

export function mesesNaEstacao(estacao: Estacao, totalMeses: number): number {
  if (estacao.mesInicio <= estacao.mesFim) {
    return estacao.mesFim - estacao.mesInicio + 1;
  }
  return totalMeses - estacao.mesInicio + 1 + estacao.mesFim;
}

export function posicaoMesNaEstacao(mes: number, estacao: Estacao, totalMeses: number): number {
  if (estacao.mesInicio <= estacao.mesFim) {
    return mes - estacao.mesInicio + 1;
  }
  if (mes >= estacao.mesInicio) return mes - estacao.mesInicio + 1;
  return totalMeses - estacao.mesInicio + 1 + mes;
}

// Valida `config` no PATCH. Retorna null se OK, mensagem de erro caso contrário.
export function validarConfig(config: unknown): string | null {
  if (!config || typeof config !== "object") return "config inválido.";
  const c = config as Partial<CalendarioConfig>;
  if (!Array.isArray(c.meses) || c.meses.length === 0) return "config.meses inválido.";
  if (c.meses.length > MESES_POR_ANO_MAX) {
    return `Máximo de ${MESES_POR_ANO_MAX} meses por ano.`;
  }
  for (const m of c.meses) {
    if (!m.nome || typeof m.nome !== "string") return "config.meses[].nome inválido.";
    if (!Number.isInteger(m.dias) || m.dias < 1) return "config.meses[].dias inválido.";
    if (m.dias > DIAS_POR_MES_MAX) {
      return `Máximo de ${DIAS_POR_MES_MAX} dias por mês.`;
    }
  }
  if (!Array.isArray(c.diasSemana) || c.diasSemana.length === 0) return "config.diasSemana inválido.";
  if (!Array.isArray(c.estacoes) || c.estacoes.length === 0) return "config.estacoes inválido.";
  if (!(Number(c.cicloLuaDias) > 0)) return "config.cicloLuaDias inválido.";
  return null;
}
