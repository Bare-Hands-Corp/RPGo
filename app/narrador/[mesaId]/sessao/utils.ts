import type { Combate, InstanciaCombate, Sessao } from "@prisma/client";
import { lerAcoesGastas, lerResolucoes, ordenarParticipantes, resolucaoAberta } from "@/lib/combate";
import { lerCondicoesAtivas } from "@/lib/condicoes";
import type { CombateSerializado, InstanciaCombateSerializada, SessaoSerializada } from "./types";

// Usos restantes por ação (InstanciaCombate.estadoRecargas); valor que não
// é número é do formato antigo e não conta.
export function lerUsosAcoes(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[id] = Math.max(0, Math.trunc(v));
  }
  return out;
}

export function serializarInstancia(i: InstanciaCombate): InstanciaCombateSerializada {
  return {
    id: i.id,
    criaturaId: i.criaturaId,
    personagemId: i.personagemId,
    nomeExibicao: i.nomeExibicao,
    iniciativa: i.iniciativa,
    ordem: i.ordem,
    pvAtual: i.pvAtual,
    pvMax: i.pvMax,
    pvTemp: i.pvTemp,
    condicoes: lerCondicoesAtivas(i.condicoesAtivas),
    acoesGastas: lerAcoesGastas(i.acoesGastas),
    usosAcoes: lerUsosAcoes(i.estadoRecargas),
    ppGasto: i.ppGasto,
    pvVisivel: i.pvVisivel,
    ppVisivel: i.ppVisivel,
    crVisivel: i.crVisivel,
    fichaVisivel: i.fichaVisivel,
    acoesReveladas: i.acoesReveladas,
    autoRevelarAcoes: i.autoRevelarAcoes,
  };
}

export function serializarCombate(c: Combate & { participantes: InstanciaCombate[] }): CombateSerializado {
  return {
    id: c.id,
    sessaoId: c.sessaoId,
    rodadaAtual: c.rodadaAtual,
    turnoAtual: c.turnoAtual,
    participantes: ordenarParticipantes(c.participantes).map(serializarInstancia),
    resolucoes: lerResolucoes(c.resolucoes).filter(resolucaoAberta),
    rolagensPrivadas: c.rolagensPrivadas,
  };
}

export function serializarSessao(
  s: Sessao & { combates: (Combate & { participantes: InstanciaCombate[] })[] },
): SessaoSerializada {
  const combateAtivo = s.combates.find((c) => c.encerradoEm === null) ?? null;
  return {
    id: s.id,
    mesaId: s.mesaId,
    iniciadaEm: s.iniciadaEm.toISOString(),
    combateAtivo: combateAtivo ? serializarCombate(combateAtivo) : null,
  };
}
