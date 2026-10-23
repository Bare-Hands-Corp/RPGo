// Passar turno: aplica o "a cada turno" e conta as durações em turnos.
// Puro (cliente e servidor), como o dano; o combate reaproveita.

import { faixaDaRolagem, rolarDados, type Dado, type DadoRolado } from "./dice";
import {
  defesasDesligadasDePadrao,
  descreverParte,
  resolverDano,
  type DefesaDano,
} from "./dano";
import {
  agregarEfeitos,
  alvoDaCura,
  efeitosDuram,
  efeitosQueFicamNoAliado,
  lerEfeitos,
  nomeDoPool,
  type EfeitoHabilidade,
  type EfeitosAgregados,
  type PorTurno,
} from "./op-rpg";
import { duraAlemDoUso, lerConcentracao, lerDuracao, pedeConcentracao, turnosDaDuracao } from "./duracao";

export type EstadoTurno = {
  hpAtual: number;
  hpTemp: number;
  hpMax: number;
  pvNegativos: number;
  ppAtual: number;
  ppMax: number;
  exaustao: number;
  recursos: Record<string, { nome: string; valorAtual: number; valorMax: number }>;
};

// Habilidade ligada com duração em turnos.
export type DuracaoEmCurso = { id: string; nome: string; turnos: number };

// Técnica em concentração com duração em turnos.
export type ConcentracaoEmCurso = { id: string; nome: string; turnos: number };

// Rolagem de um efeito: os dados, o que soma e o total.
export type RolagemTurno = { total: number; detalhes: DadoRolado[]; modificador: number };

// `rolagem` abre os dados no chat; `detalhe` mostra as defesas do dano.
export type LinhaTurno = {
  fonte: string;
  texto: string;
  o?: PorTurno["o"] | "fim";
  rolagem?: { detalhes: DadoRolado[]; modificador: number };
  detalhe?: string;
};

export type ResultadoTurno = {
  estado: EstadoTurno;
  linhas: LinhaTurno[];
  // Habilidades e ações em curso que acabam (duração acabou ou o gasto zerou o recurso).
  desligar: { id: string; nome: string }[];
  // As que seguem valendo, com os turnos que faltam.
  turnos: Record<string, number>;
  // Técnica em concentração: turnos que faltam; 0 = acabou; null = não conta.
  concentracaoTurnos: number | null;
  // Dano final de cada fonte (um teste de concentração por fonte).
  danos: number[];
  // O gasto da técnica em concentração zerou o recurso.
  concentracaoSemRecurso: boolean;
  // A técnica em concentração durava enquanto houvesse PV temporário, e ele zerou.
  concentracaoSemPvTemp: boolean;
  caiu: boolean;
  morreu: boolean;
};

// `grau`: o da técnica que traz o efeito, pro GRAU da fórmula.
type Resolver = (formula: string, grau?: number) => { dados: Dado[]; modificador: number };

// Ligadas com duração em turnos; sem a contagem salva, começa pela duração.
export function duracoesEmCurso(
  ligadas: { id: string; nome: string; duracao?: unknown; turnosRestantes?: number | null }[],
): DuracaoEmCurso[] {
  const out: DuracaoEmCurso[] = [];
  for (const h of ligadas) {
    const turnos = h.turnosRestantes ?? turnosDaDuracao(lerDuracao(h.duracao));
    if (turnos != null && turnos > 0) out.push({ id: h.id, nome: h.nome, turnos });
  }
  return out;
}

// Técnica em concentração que conta turnos.
export function concentracaoEmCurso(raw: unknown): ConcentracaoEmCurso | null {
  const c = lerConcentracao(raw);
  return c?.tipo === "acao" && c.turnos ? { id: c.id, nome: c.nome, turnos: c.turnos } : null;
}

// ─── Ação em curso ─────────────────────────────────────────
// Ação com duração, depois de usada: o "a cada turno" e os efeitos marcados
// pra durar seguem até ela acabar. Técnica de concentração está em curso
// enquanto o personagem concentra nela; as outras, pelo `emCurso` da ação.

export type AcaoQueDura = {
  id: string;
  nome: string;
  efeitos: unknown;
  grau?: number;
  duracao?: unknown;
  aliado?: boolean;
  emCurso?: boolean;
  turnosRestantes?: number | null;
};

// `turnos`: o que falta (a de concentração conta na concentração).
export type AcaoEmCurso = {
  id: string;
  nome: string;
  grau: number;
  efeitos: EfeitoHabilidade[];
  concentra: boolean;
  turnos: number | null;
};

// Efeitos que seguem depois do uso: o "a cada turno", os marcados pra durar e
// os que ficam valendo no aliado (esses, até em ação instantânea). No combate
// (`aliadoEmCondicao`), o do aliado vira condição nele e não prende a ação.
export function efeitosQueSeguem(
  acao: Pick<AcaoQueDura, "efeitos" | "duracao" | "aliado">,
  aliadoEmCondicao = false,
): EfeitoHabilidade[] {
  const noAliado = aliadoEmCondicao ? [] : efeitosQueFicamNoAliado(acao);
  if (!duraAlemDoUso(acao.duracao)) return noAliado;
  const dura = efeitosDuram(acao);
  return [
    ...lerEfeitos(acao.efeitos).filter((e) => e.tipo === "por_turno" || (dura && !!e.dura)),
    ...noAliado,
  ];
}

// Turnos que a ação em curso conta. Instantânea só fica em curso pelo que dá
// ao aliado: vale até o próximo turno de quem usa.
export function turnosDaAcao(duracao: unknown): number | null {
  return turnosDaDuracao(lerDuracao(duracao)) ?? (duraAlemDoUso(duracao) ? null : 1);
}

// Sem concentração, a ação fica em curso ao usar quando tem efeito que segue.
export function ficaEmCurso(
  acao: Pick<AcaoQueDura, "efeitos" | "duracao" | "aliado">,
  aliadoEmCondicao = false,
): boolean {
  return !pedeConcentracao(acao.duracao) && efeitosQueSeguem(acao, aliadoEmCondicao).length > 0;
}

export function acoesEmCurso(acoes: AcaoQueDura[], concentracao: unknown): AcaoEmCurso[] {
  const c = lerConcentracao(concentracao);
  return acoes.flatMap((a) => {
    const concentra = pedeConcentracao(a.duracao);
    if (concentra ? c?.tipo !== "acao" || c.id !== a.id : !a.emCurso) return [];
    const efeitos = efeitosQueSeguem(a);
    if (efeitos.length === 0) return [];
    return [
      {
        id: a.id,
        nome: a.nome,
        grau: a.grau ?? 0,
        efeitos,
        concentra,
        turnos: concentra ? null : (a.turnosRestantes ?? turnosDaAcao(a.duracao)),
      },
    ];
  });
}

// Efeito na hora que repete, no formato do "a cada turno".
function comoPorTurno(e: EfeitoHabilidade): Pick<PorTurno, "o" | "valor" | "recurso" | "gasta"> | null {
  if (e.tipo === "cura") {
    const alvo = alvoDaCura(e);
    if (alvo === "pp") return { o: "recurso", recurso: "pp", valor: e.valor };
    return { o: alvo === "hp-temp" ? "pv_temp" : "cura", valor: e.valor };
  }
  if (e.tipo === "modificador") return { o: "pv_temp", valor: e.formula ?? String(e.valor) };
  if (e.tipo === "recurso_delta") {
    return {
      o: "recurso",
      recurso: e.recurso,
      valor: String(Math.abs(e.valor)),
      ...(e.valor < 0 ? { gasta: true } : {}),
    };
  }
  return null;
}

// "A cada turno" das ações em curso: o da duração e os efeitos na hora que repetem.
export function porTurnoDasAcoes(emCurso: AcaoEmCurso[]): PorTurno[] {
  return emCurso.flatMap((a) =>
    a.efeitos.flatMap((e) => {
      const base =
        e.tipo === "por_turno"
          ? {
              o: e.o,
              valor: e.valor,
              ...(e.recurso ? { recurso: e.recurso } : {}),
              ...(e.gasta ? { gasta: true } : {}),
              ...(e.tipoDano ? { tipoDano: e.tipoDano } : {}),
            }
          : e.dura === "turno"
            ? comoPorTurno(e)
            : null;
      if (!base) return [];
      return [
        {
          ...base,
          ...(e.dura === "turno" ? { noUso: true } : {}),
          fonte: a.nome,
          acaoId: a.id,
          ...(a.concentra ? {} : { emCurso: true }),
          ...(a.grau ? { grau: a.grau } : {}),
        },
      ];
    }),
  );
}

// Ações em curso que contam turnos (a de concentração conta na concentração).
export function duracoesDasAcoes(emCurso: AcaoEmCurso[]): DuracaoEmCurso[] {
  return emCurso.flatMap((a) =>
    !a.concentra && a.turnos != null && a.turnos > 0 ? [{ id: a.id, nome: a.nome, turnos: a.turnos }] : [],
  );
}

// Agregado da ficha com os efeitos que as ações em curso mantêm.
export function comAcoesEmCurso(
  base: EfeitosAgregados,
  emCurso: AcaoEmCurso[],
  slugsPericiaCustom: Set<string> = new Set(),
): EfeitosAgregados {
  let agg = base;
  for (const a of emCurso) {
    const mantidos = a.efeitos.filter((e) => e.dura === "mantem");
    if (mantidos.length === 0) continue;
    agg = agregarEfeitos(
      [{ nome: a.nome, tipo: "ativa", ligada: true, efeitos: mantidos }],
      slugsPericiaCustom,
      agg,
      { grau: a.grau },
    );
  }
  return agg;
}

// Evento da ficha: a ação entrou em curso, contou turno ou acabou.
export const EVENTO_ACAO_EM_CURSO = "rpgo:acao-em-curso";
export type AcaoEmCursoDetail = { id: string; emCurso: boolean; turnos?: number | null };

export function anunciarAcaoEmCurso(detail: AcaoEmCursoDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AcaoEmCursoDetail>(EVENTO_ACAO_EM_CURSO, { detail }));
}

function rolar(f: { dados: Dado[]; modificador: number }): RolagemTurno {
  const r = rolarDados(f.dados, f.modificador);
  return { total: r.total, detalhes: r.detalhes, modificador: f.modificador };
}

// Rola cada efeito (cliente); número fixo vale como está.
export function rolarTurno(porTurno: PorTurno[], resolver: Resolver): RolagemTurno[] {
  return porTurno.map((p) => rolar(resolver(p.valor, p.grau)));
}

// O que vai pro servidor: as faces de cada efeito.
export function facesDoTurno(rolagens: RolagemTurno[]): number[][] {
  return rolagens.map((r) => r.detalhes.map((d) => d.resultado));
}

// Confere as faces do cliente contra os dados de cada fórmula; o que falta, rola aqui.
// Total solto (cliente antigo) fica preso na faixa da fórmula.
export function validarRolagensTurno(
  porTurno: PorTurno[],
  rolagens: unknown,
  resolver: Resolver,
): RolagemTurno[] {
  const lista = Array.isArray(rolagens) ? rolagens : [];
  return porTurno.map((p, i) => {
    const f = resolver(p.valor, p.grau);
    const bruto: unknown = lista[i];
    if (Array.isArray(bruto) && bruto.length === f.dados.length) {
      const faces = bruto.map((x) => Math.trunc(Number(x)));
      if (faces.every((x, j) => x >= 1 && x <= f.dados[j].faces)) {
        const detalhes = f.dados.map((d, j) => ({ faces: d.faces, sinal: d.sinal, resultado: faces[j] }));
        const total = detalhes.reduce((soma, d) => soma + d.resultado * d.sinal, f.modificador);
        return { total, detalhes, modificador: f.modificador };
      }
    }
    if (typeof bruto === "number" && Number.isFinite(bruto)) {
      const { min, max } = faixaDaRolagem(f.dados, f.modificador);
      return { total: Math.min(max, Math.max(min, Math.trunc(bruto))), detalhes: [], modificador: 0 };
    }
    return rolar(f);
  });
}

// Soma até o máximo; nunca derruba o que já estava acima dele.
function somarAteOMaximo(atual: number, delta: number, max: number): number {
  if (delta <= 0) return Math.max(0, atual + delta);
  return Math.max(atual, Math.min(atual + delta, max));
}

export function aplicarTurno(entrada: {
  porTurno: PorTurno[];
  rolagens: RolagemTurno[];
  estado: EstadoTurno;
  defesas: DefesaDano[];
  duracoes: DuracaoEmCurso[];
  concentracao: ConcentracaoEmCurso | null;
  // O que dura enquanto houver PV temporário: habilidades ligadas e a técnica em concentração.
  enquantoPvTemp?: { habilidades: { id: string; nome: string }[]; tecnica?: string };
}): ResultadoTurno {
  const e: EstadoTurno = {
    ...entrada.estado,
    recursos: Object.fromEntries(
      Object.entries(entrada.estado.recursos).map(([id, r]) => [id, { ...r }]),
    ),
  };
  const linhas: LinhaTurno[] = [];
  const desligar = new Map<string, string>();
  const danos: number[] = [];
  let caiu = false;
  let morreu = false;
  let concentracaoSemRecurso = false;
  const desligadasDePadrao = defesasDesligadasDePadrao(entrada.defesas);

  entrada.porTurno.forEach((p, i) => {
    // O que vem de uma habilidade que já desligou neste turno para.
    if (p.habilidadeId && desligar.has(p.habilidadeId)) return;
    if (p.acaoId && (p.emCurso ? desligar.has(p.acaoId) : concentracaoSemRecurso)) return;
    // Já aconteceu no uso, que conta como um turno: no turno em que a ação acaba, não repete.
    if (p.noUso && p.acaoId) {
      const restam = p.emCurso
        ? entrada.duracoes.find((d) => d.id === p.acaoId)?.turnos
        : entrada.concentracao?.id === p.acaoId
          ? entrada.concentracao.turnos
          : undefined;
      if (restam === 1) return;
    }
    const rolagem = entrada.rolagens[i];
    const v = Math.max(0, Math.trunc(rolagem?.total ?? 0));
    const linha = (texto: string, detalhe?: string) =>
      linhas.push({
        fonte: p.fonte,
        texto,
        o: p.o,
        ...(rolagem?.detalhes.length
          ? { rolagem: { detalhes: rolagem.detalhes, modificador: rolagem.modificador } }
          : {}),
        ...(detalhe ? { detalhe } : {}),
      });

    if (p.o === "cura") {
      const antes = e.hpAtual;
      e.hpAtual = somarAteOMaximo(e.hpAtual, v, e.hpMax);
      // Cura acorda: os PV negativos zeram.
      if (antes <= 0 && e.hpAtual > 0) e.pvNegativos = 0;
      linha(`+${e.hpAtual - antes} PV`);
    } else if (p.o === "pv_temp") {
      if (v > e.hpTemp) {
        e.hpTemp = v;
        linha(`${v} PV temporário`);
      } else {
        linha(`PV temporário segue ${e.hpTemp}`);
      }
    } else if (p.o === "dano") {
      if (v <= 0) return;
      const r = resolverDano([{ valor: v, tipo: p.tipoDano ?? "" }], entrada.defesas, e, {
        desligadas: desligadasDePadrao,
        rolar: true,
      });
      e.hpAtual = r.hpAtual.depois;
      e.hpTemp = r.hpTemp.depois;
      e.pvNegativos = r.pvNegativos.depois;
      caiu ||= r.caiu;
      morreu ||= r.morreu;
      danos.push(r.final);
      const parte = r.partes[0];
      linha(
        `${r.final} de dano${p.tipoDano ? ` ${p.tipoDano.toLowerCase()}` : ""}`,
        parte?.passos.length ? descreverParte(parte) : undefined,
      );
    } else {
      const id = p.recurso ?? "";
      const nome = nomeDoPool(id, (x) => e.recursos[x]?.nome);
      const delta = p.gasta ? -v : v;
      let zerou = false;
      if (id === "pp") {
        const antes = e.ppAtual;
        e.ppAtual = somarAteOMaximo(e.ppAtual, delta, e.ppMax);
        zerou = p.gasta === true && e.ppAtual === 0 && v > 0;
        linha(`${e.ppAtual - antes >= 0 ? "+" : "−"}${Math.abs(e.ppAtual - antes)} ${nome}`);
      } else if (id === "exaustao") {
        const antes = e.exaustao;
        e.exaustao = Math.min(6, Math.max(0, e.exaustao + delta));
        linha(`${e.exaustao - antes >= 0 ? "+" : "−"}${Math.abs(e.exaustao - antes)} ${nome}`);
      } else if (e.recursos[id]) {
        const r = e.recursos[id];
        const antes = r.valorAtual;
        r.valorAtual = Math.min(r.valorMax, Math.max(0, r.valorAtual + delta));
        zerou = p.gasta === true && r.valorAtual === 0 && v > 0;
        linha(`${r.valorAtual - antes >= 0 ? "+" : "−"}${Math.abs(r.valorAtual - antes)} ${nome}`);
      } else {
        return;
      }
      // Gasto que zera o recurso desliga a habilidade (ou a ação) que o cobra.
      if (zerou && (p.habilidadeId || p.acaoId)) {
        if (p.habilidadeId) desligar.set(p.habilidadeId, p.fonte);
        else if (p.emCurso) desligar.set(p.acaoId!, p.fonte);
        else concentracaoSemRecurso = true;
        linhas.push({ fonte: p.fonte, texto: `acabou (sem ${nome})`, o: "fim" });
      }
    }
  });

  // PV temporário zerou neste turno: acaba o que durava enquanto ele durasse.
  let concentracaoSemPvTemp = false;
  if (entrada.estado.hpTemp > 0 && e.hpTemp <= 0) {
    const fim = (fonte: string) => linhas.push({ fonte, texto: "acabou (sem PV temporário)", o: "fim" });
    for (const h of entrada.enquantoPvTemp?.habilidades ?? []) {
      if (desligar.has(h.id)) continue;
      desligar.set(h.id, h.nome);
      fim(h.nome);
    }
    const tecnica = entrada.enquantoPvTemp?.tecnica;
    if (tecnica && !concentracaoSemRecurso) {
      concentracaoSemPvTemp = true;
      fim(tecnica);
    }
  }

  // Durações em turnos: menos um; em zero, acaba.
  const turnos: Record<string, number> = {};
  for (const d of entrada.duracoes) {
    if (desligar.has(d.id)) continue;
    const resta = d.turnos - 1;
    if (resta <= 0) {
      desligar.set(d.id, d.nome);
      linhas.push({ fonte: d.nome, texto: "acabou", o: "fim" });
    } else {
      turnos[d.id] = resta;
    }
  }

  let concentracaoTurnos: number | null = null;
  if (entrada.concentracao) {
    concentracaoTurnos = Math.max(0, entrada.concentracao.turnos - 1);
    if (concentracaoTurnos === 0 && !concentracaoSemRecurso && !concentracaoSemPvTemp) {
      linhas.push({ fonte: entrada.concentracao.nome, texto: "acabou", o: "fim" });
    }
  }

  if (e.exaustao >= 6 && entrada.estado.exaustao < 6) {
    linhas.push({ fonte: "Exaustão", texto: "desmaiou", o: "fim" });
  }

  return {
    estado: e,
    linhas,
    desligar: [...desligar].map(([id, nome]) => ({ id, nome })),
    turnos,
    concentracaoTurnos,
    danos,
    concentracaoSemRecurso,
    concentracaoSemPvTemp,
    caiu,
    morreu,
  };
}

// Evento da ficha: turnos que faltam em cada habilidade depois do Passar turno.
export const EVENTO_TURNOS = "rpgo:turnos";

export function anunciarTurnos(turnos: Record<string, number>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Record<string, number>>(EVENTO_TURNOS, { detail: turnos }));
}
