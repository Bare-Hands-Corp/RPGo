import type { Combate, InstanciaCombate, Sessao } from "@prisma/client";
import type { CombateSerializado, InstanciaCombateSerializada, SessaoSerializada } from "./types";

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
  };
}

export function serializarCombate(c: Combate & { participantes: InstanciaCombate[] }): CombateSerializado {
  return {
    id: c.id,
    sessaoId: c.sessaoId,
    rodadaAtual: c.rodadaAtual,
    turnoAtual: c.turnoAtual,
    participantes: c.participantes
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map(serializarInstancia),
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
