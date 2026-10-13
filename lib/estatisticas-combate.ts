// Estatísticas de combate. Puro (cliente e servidor).
//
// Durante o combate o servidor grava eventos crus (dano, cura, PP, troca de
// vez) em LogCombate.resumo; tudo abaixo é derivado desses eventos. Guardar o
// cru, e não só os totais, deixa qualquer métrica nova sair dos combates já
// jogados, e é o que um balanceador de encontros vai consumir:
// `calcularEstatisticas` (um combate) e `resumirSessao` (vários) devolvem
// totais por participante e por lado (jogadores × inimigos), com ND, XP e PV
// dos participantes junto.
//
// LogCombate.id é o id do Combate: um registro por combate, sem coluna nova.

export const VERSAO_RESUMO = 2;
const MAX_EVENTOS = 4000;
const MAX_TURNOS = 1500;

export type Lado = "jogadores" | "inimigos";

export type ParticipanteRegistro = {
  // InstanciaCombate.id; some junto com o combate, o resto do registro fica.
  id: string;
  nome: string;
  tipo: "criatura" | "personagem";
  // criaturaId ou personagemId: junta as cópias de uma criatura entre combates.
  ref: string | null;
  pvMax: number;
  pvFinal: number | null;
  // Criatura.
  nd?: string;
  ndValor?: number;
  xp?: number;
  cr?: number;
  pp?: number;
  // Personagem.
  nivel?: number;
  entrou: number;
  saiu?: number | null;
};

type Base = { t: number; r: number };
// `de` nulo = sem origem (ajuste do narrador, dano posto à mão).
export type EventoDano = Base & {
  k: "dano";
  de: string | null;
  para: string;
  // Depois das defesas do alvo; `bruto` é o rolado.
  valor: number;
  bruto: number;
  // Tipo que mais pesou no golpe.
  tipo: string;
  acao: string;
  // O golpe derrubou o alvo (levou o PV a 0).
  caiu?: boolean;
};
export type EventoCura = Base & { k: "cura"; de: string | null; para: string; valor: number; acao: string };
export type EventoPp = Base & { k: "pp"; de: string; valor: number; acao: string };
// Uma jogada de ataque contra a CR do alvo; `total` é o valor rolado (o acerto).
export type EventoAtaque = Base & {
  k: "ataque";
  de: string;
  para: string;
  total: number;
  res: "acerto" | "critico" | "erro";
  acao: string;
};
export type EventoCombate = EventoDano | EventoCura | EventoPp | EventoAtaque;

// Um turno: da vez começar até passar. Fim nulo = em andamento.
export type TurnoRegistro = { id: string; r: number; ini: number; fim: number | null };

export type ResultadoCombate = "vitoria" | "derrota" | "encerrado";

export type ResumoCombate = {
  v: typeof VERSAO_RESUMO;
  combateId: string;
  iniciadoEm: number;
  encerradoEm: number | null;
  // O registro começou depois do combate (estava em andamento quando o recurso entrou).
  parcial: boolean;
  rodadas: number;
  resultado: ResultadoCombate | null;
  participantes: ParticipanteRegistro[];
  eventos: EventoCombate[];
  turnos: TurnoRegistro[];
};

export function resumoVazio(combateId: string, agora: number, parcial: boolean): ResumoCombate {
  return {
    v: VERSAO_RESUMO,
    combateId,
    iniciadoEm: agora,
    encerradoEm: null,
    parcial,
    rodadas: 1,
    resultado: null,
    participantes: [],
    eventos: [],
    turnos: [],
  };
}

const num = (x: unknown, padrao = 0) => (Number.isFinite(Number(x)) ? Number(x) : padrao);

// Json do banco → resumo; null pro registro antigo (sem eventos) ou ilegível.
export function lerResumo(raw: unknown): ResumoCombate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== VERSAO_RESUMO || typeof o.combateId !== "string") return null;
  const lista = <T>(x: unknown) => (Array.isArray(x) ? (x as T[]) : []);
  return {
    v: VERSAO_RESUMO,
    combateId: o.combateId,
    iniciadoEm: num(o.iniciadoEm),
    encerradoEm: o.encerradoEm == null ? null : num(o.encerradoEm),
    parcial: o.parcial === true,
    rodadas: Math.max(1, Math.trunc(num(o.rodadas, 1))),
    resultado: o.resultado === "vitoria" || o.resultado === "derrota" || o.resultado === "encerrado" ? o.resultado : null,
    participantes: lista<ParticipanteRegistro>(o.participantes).filter((p) => p && typeof p.id === "string"),
    eventos: lista<EventoCombate>(o.eventos).filter((e) => e && (e.k === "dano" || e.k === "cura" || e.k === "pp" || e.k === "ataque")),
    turnos: lista<TurnoRegistro>(o.turnos).filter((t) => t && typeof t.id === "string"),
  };
}

// ─── Gravação (muta o resumo; o servidor guarda e trava a linha) ───────────

export function garantirParticipante(resumo: ResumoCombate, novo: ParticipanteRegistro) {
  const atual = resumo.participantes.find((p) => p.id === novo.id);
  if (!atual) resumo.participantes.push(novo);
  else Object.assign(atual, { ...novo, entrou: atual.entrou });
}

export function anotarEvento(resumo: ResumoCombate, evento: EventoCombate) {
  if (resumo.eventos.length < MAX_EVENTOS) resumo.eventos.push(evento);
}

export function fecharVez(resumo: ResumoCombate, agora: number) {
  for (const t of resumo.turnos) if (t.fim === null) t.fim = agora;
}

// A vez passou pra `id` (nulo = ninguém). Repetir a mesma vez não abre outra.
export function abrirVez(resumo: ResumoCombate, id: string | null, rodada: number, agora: number) {
  const aberto = resumo.turnos.find((t) => t.fim === null);
  if (aberto && aberto.id === id && aberto.r === rodada) return;
  fecharVez(resumo, agora);
  if (id && resumo.turnos.length < MAX_TURNOS) resumo.turnos.push({ id, r: rodada, ini: agora, fim: null });
}

export function decidirResultado(participantes: Pick<ParticipanteRegistro, "tipo" | "pvFinal">[]): ResultadoCombate {
  const inimigos = participantes.filter((p) => p.tipo === "criatura" && p.pvFinal !== null);
  const jogadores = participantes.filter((p) => p.tipo === "personagem" && p.pvFinal !== null);
  if (jogadores.length > 0 && jogadores.every((p) => (p.pvFinal ?? 0) <= 0)) return "derrota";
  if (inimigos.length > 0 && inimigos.every((p) => (p.pvFinal ?? 0) <= 0)) return "vitoria";
  return "encerrado";
}

// Tipo de dano que mais pesou num golpe de vários tipos.
export function tipoDominante(partes: { tipo: string; final: number }[]): string {
  let melhor = "";
  let valor = -1;
  for (const p of partes) {
    if (p.final > valor) {
      valor = p.final;
      melhor = p.tipo;
    }
  }
  return melhor;
}

// ─── Cálculo ───────────────────────────────────────────────────────────────

export type LinhaParticipante = {
  chave: string;
  // criaturaId ou personagemId; junta cópias de uma criatura entre combates.
  ref: string | null;
  nome: string;
  tipo: "criatura" | "personagem";
  lado: Lado;
  // Quantas cópias foram somadas (1 num combate; várias numa sessão).
  copias: number;
  turnos: number;
  tempoMs: number;
  maiorTurnoMs: number;
  danoCausado: number;
  danoBruto: number;
  danoTomado: number;
  // Cura que ele fez em si, em aliados, e a que recebeu de outros ou sem origem.
  curaEmSi: number;
  curaEmAliados: number;
  curaRecebida: number;
  curaSemOrigem: number;
  ppGasto: number;
  // Jogadas de ataque: quantas fez, quantas acertaram (críticos dentro) e a
  // soma dos valores rolados, pra média do acerto.
  ataques: number;
  acertos: number;
  criticos: number;
  somaAcerto: number;
  abates: number;
  quedas: number;
  pvMax: number;
};

export type PorRodada = {
  rodada: number;
  danoJogadores: number;
  danoInimigos: number;
  curaJogadores: number;
  curaInimigos: number;
};

export type TotaisDoLado = {
  participantes: number;
  danoCausado: number;
  danoTomado: number;
  cura: number;
  ppGasto: number;
  ataques: number;
  acertos: number;
  somaAcerto: number;
  turnos: number;
  tempoMs: number;
  pvMax: number;
};

export type EstatisticasCombate = {
  combateId: string;
  iniciadoEm: number;
  encerradoEm: number | null;
  duracaoMs: number;
  parcial: boolean;
  rodadas: number;
  resultado: ResultadoCombate | null;
  linhas: LinhaParticipante[];
  porRodada: PorRodada[];
  jogadores: TotaisDoLado;
  inimigos: TotaisDoLado;
  // Dano e cura que não vieram de ninguém (ajustes do narrador).
  semOrigem: { dano: number; cura: number };
};

export const ladoDe = (tipo: "criatura" | "personagem"): Lado => (tipo === "personagem" ? "jogadores" : "inimigos");

export function novaLinha(
  chave: string,
  nome: string,
  tipo: LinhaParticipante["tipo"],
  pvMax = 0,
  ref: string | null = null,
): LinhaParticipante {
  return {
    chave,
    ref,
    nome,
    tipo,
    lado: ladoDe(tipo),
    copias: 1,
    turnos: 0,
    tempoMs: 0,
    maiorTurnoMs: 0,
    danoCausado: 0,
    danoBruto: 0,
    danoTomado: 0,
    curaEmSi: 0,
    curaEmAliados: 0,
    curaRecebida: 0,
    curaSemOrigem: 0,
    ppGasto: 0,
    ataques: 0,
    acertos: 0,
    criticos: 0,
    somaAcerto: 0,
    abates: 0,
    quedas: 0,
    pvMax,
  };
}

function totaisDe(linhas: LinhaParticipante[], lado: Lado): TotaisDoLado {
  const t: TotaisDoLado = {
    participantes: 0,
    danoCausado: 0,
    danoTomado: 0,
    cura: 0,
    ppGasto: 0,
    ataques: 0,
    acertos: 0,
    somaAcerto: 0,
    turnos: 0,
    tempoMs: 0,
    pvMax: 0,
  };
  for (const l of linhas) {
    if (l.lado !== lado) continue;
    t.participantes += l.copias;
    t.danoCausado += l.danoCausado;
    t.danoTomado += l.danoTomado;
    t.cura += l.curaEmSi + l.curaEmAliados;
    t.ppGasto += l.ppGasto;
    t.ataques += l.ataques;
    t.acertos += l.acertos;
    t.somaAcerto += l.somaAcerto;
    t.turnos += l.turnos;
    t.tempoMs += l.tempoMs;
    t.pvMax += l.pvMax * l.copias;
  }
  return t;
}

export function calcularEstatisticas(resumo: ResumoCombate): EstatisticasCombate {
  const fimTotal = resumo.encerradoEm ?? Math.max(resumo.iniciadoEm, ...resumo.turnos.map((t) => t.fim ?? t.ini));
  const linhas = new Map<string, LinhaParticipante>();
  for (const p of resumo.participantes) linhas.set(p.id, novaLinha(p.id, p.nome, p.tipo, p.pvMax, p.ref));
  // Evento de quem nunca foi registrado (não deveria): ainda conta, sob o id.
  const de = (id: string, tipo: LinhaParticipante["tipo"] = "criatura") => {
    let l = linhas.get(id);
    if (!l) {
      l = novaLinha(id, "?", tipo);
      linhas.set(id, l);
    }
    return l;
  };

  for (const t of resumo.turnos) {
    const l = de(t.id);
    const dur = Math.max(0, (t.fim ?? fimTotal) - t.ini);
    l.turnos += 1;
    l.tempoMs += dur;
    l.maiorTurnoMs = Math.max(l.maiorTurnoMs, dur);
  }

  const rodadas = new Map<number, PorRodada>();
  const rodada = (r: number) => {
    let x = rodadas.get(r);
    if (!x) {
      x = { rodada: r, danoJogadores: 0, danoInimigos: 0, curaJogadores: 0, curaInimigos: 0 };
      rodadas.set(r, x);
    }
    return x;
  };
  for (let r = 1; r <= resumo.rodadas; r += 1) rodada(r);
  const semOrigem = { dano: 0, cura: 0 };

  for (const e of resumo.eventos) {
    if (e.k === "dano") {
      const alvo = de(e.para);
      alvo.danoTomado += e.valor;
      if (e.caiu) alvo.quedas += 1;
      if (e.de) {
        const autor = de(e.de);
        autor.danoCausado += e.valor;
        autor.danoBruto += e.bruto;
        if (e.caiu) autor.abates += 1;
        rodada(e.r)[autor.lado === "jogadores" ? "danoJogadores" : "danoInimigos"] += e.valor;
      } else {
        semOrigem.dano += e.valor;
      }
    } else if (e.k === "cura") {
      const alvo = de(e.para);
      if (e.de === null) {
        alvo.curaSemOrigem += e.valor;
        semOrigem.cura += e.valor;
      } else if (e.de === e.para) {
        alvo.curaEmSi += e.valor;
        rodada(e.r)[alvo.lado === "jogadores" ? "curaJogadores" : "curaInimigos"] += e.valor;
      } else {
        const autor = de(e.de);
        autor.curaEmAliados += e.valor;
        alvo.curaRecebida += e.valor;
        rodada(e.r)[autor.lado === "jogadores" ? "curaJogadores" : "curaInimigos"] += e.valor;
      }
    } else if (e.k === "ataque") {
      const autor = de(e.de);
      autor.ataques += 1;
      autor.somaAcerto += e.total;
      if (e.res !== "erro") autor.acertos += 1;
      if (e.res === "critico") autor.criticos += 1;
    } else {
      de(e.de).ppGasto += e.valor;
    }
  }

  const lista = [...linhas.values()];
  return {
    combateId: resumo.combateId,
    iniciadoEm: resumo.iniciadoEm,
    encerradoEm: resumo.encerradoEm,
    duracaoMs: Math.max(0, fimTotal - resumo.iniciadoEm),
    parcial: resumo.parcial,
    rodadas: resumo.rodadas,
    resultado: resumo.resultado,
    linhas: lista,
    porRodada: [...rodadas.values()].sort((a, b) => a.rodada - b.rodada),
    jogadores: totaisDe(lista, "jogadores"),
    inimigos: totaisDe(lista, "inimigos"),
    semOrigem,
  };
}

// ─── Sessão: vários combates somados ───────────────────────────────────────

export type ResumoSessao = {
  combates: number;
  rodadas: number;
  duracaoMs: number;
  vitorias: number;
  derrotas: number;
  // Somadas por participante (personagem; criatura pelo cadastro, cópias juntas).
  linhas: LinhaParticipante[];
  jogadores: TotaisDoLado;
  inimigos: TotaisDoLado;
  semOrigem: { dano: number; cura: number };
};

// "Soldado 2" e "Soldado 3" são o mesmo Soldado numa soma.
export const semNumeracao = (nome: string) => nome.replace(/\s+\d+$/, "");

export function resumirSessao(combates: EstatisticasCombate[]): ResumoSessao {
  const somadas = new Map<string, LinhaParticipante>();
  for (const c of combates) {
    for (const l of c.linhas) {
      const chave = `${l.tipo}:${l.ref ?? semNumeracao(l.nome)}`;
      const x = somadas.get(chave);
      if (!x) {
        somadas.set(chave, { ...l, chave, nome: l.tipo === "criatura" ? semNumeracao(l.nome) : l.nome });
        continue;
      }
      // O personagem que lutou em três combates continua sendo um só.
      if (l.tipo === "criatura") x.copias += l.copias;
      x.turnos += l.turnos;
      x.tempoMs += l.tempoMs;
      x.maiorTurnoMs = Math.max(x.maiorTurnoMs, l.maiorTurnoMs);
      x.danoCausado += l.danoCausado;
      x.danoBruto += l.danoBruto;
      x.danoTomado += l.danoTomado;
      x.curaEmSi += l.curaEmSi;
      x.curaEmAliados += l.curaEmAliados;
      x.curaRecebida += l.curaRecebida;
      x.curaSemOrigem += l.curaSemOrigem;
      x.ppGasto += l.ppGasto;
      x.ataques += l.ataques;
      x.acertos += l.acertos;
      x.criticos += l.criticos;
      x.somaAcerto += l.somaAcerto;
      x.abates += l.abates;
      x.quedas += l.quedas;
      x.pvMax = Math.max(x.pvMax, l.pvMax);
    }
  }
  const linhas = [...somadas.values()];
  return {
    combates: combates.length,
    rodadas: combates.reduce((s, c) => s + c.rodadas, 0),
    duracaoMs: combates.reduce((s, c) => s + c.duracaoMs, 0),
    vitorias: combates.filter((c) => c.resultado === "vitoria").length,
    derrotas: combates.filter((c) => c.resultado === "derrota").length,
    linhas,
    jogadores: totaisDe(linhas, "jogadores"),
    inimigos: totaisDe(linhas, "inimigos"),
    semOrigem: {
      dano: combates.reduce((s, c) => s + c.semOrigem.dano, 0),
      cura: combates.reduce((s, c) => s + c.semOrigem.cura, 0),
    },
  };
}

// ─── Leitura ───────────────────────────────────────────────────────────────

// Média por turno do próprio participante; null sem turno (não dá pra dividir).
export function porTurno(valor: number, turnos: number): number | null {
  return turnos > 0 ? valor / turnos : null;
}

export function formatarDuracao(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

export function formatarNumero(n: number, casas = 0): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export const ROTULO_RESULTADO: Record<ResultadoCombate, string> = {
  vitoria: "Vitória dos jogadores",
  derrota: "Derrota dos jogadores",
  encerrado: "Encerrado",
};

// Registro de antes das estatísticas: só rodadas e PV final.
export type CombateLegado = {
  rodadas: number;
  participantes: { nome: string; tipo: string; pvFinal: number | null }[];
};

export function lerLegado(raw: unknown): CombateLegado {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    rodadas: Math.max(1, Math.trunc(num(o.rodadas, 1))),
    participantes: (Array.isArray(o.participantes) ? (o.participantes as Record<string, unknown>[]) : []).map((p) => ({
      nome: String(p?.nome ?? ""),
      tipo: String(p?.tipo ?? ""),
      pvFinal: p?.pvFinal == null ? null : num(p.pvFinal),
    })),
  };
}

export type CombateHistorico = {
  id: string;
  encerradoEm: string;
  // null = registro antigo, sem estatísticas.
  estatisticas: EstatisticasCombate | null;
  legado: CombateLegado | null;
};

export type SessaoHistorico = {
  id: string;
  iniciadaEm: string;
  encerradaEm: string | null;
  combates: CombateHistorico[];
  resumo: ResumoSessao | null;
};
