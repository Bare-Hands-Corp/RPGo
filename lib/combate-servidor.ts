// Combate ativo da mesa, filtrado pro jogador: de criatura só sai o que o
// narrador liberou (PV, PP, CR, ações reveladas). Só servidor.

import { prisma } from "@/lib/prisma";
import { serializarCriatura, textoEfeitoAcao } from "@/app/bestiario/utils";
import { CATEGORIAS_COMPONENTE } from "@/app/bestiario/types";
import { ordenarParticipantes, type AcaoVista, type CombateVisto, type ParticipanteVisto } from "@/lib/combate";

export async function carregarCombateDoJogador(
  mesaId: string | null | undefined,
  personagemId: string,
): Promise<{ sessaoId: string | null; combate: CombateVisto | null }> {
  if (!mesaId) return { sessaoId: null, combate: null };

  const sessao = await prisma.sessao.findFirst({
    where: { mesaId, encerradaEm: null },
    select: {
      id: true,
      combates: { where: { encerradoEm: null }, include: { participantes: true }, take: 1 },
    },
  });
  if (!sessao) return { sessaoId: null, combate: null };
  const combate = sessao.combates[0];
  if (!combate) return { sessaoId: sessao.id, combate: null };

  const ids = (campo: "criaturaId" | "personagemId") => [
    ...new Set(combate.participantes.map((p) => p[campo]).filter((id): id is string => !!id)),
  ];
  const [criaturas, personagens] = await Promise.all([
    prisma.criatura.findMany({ where: { id: { in: ids("criaturaId") } }, include: { componentes: true } }),
    prisma.personagem.findMany({
      where: { id: { in: ids("personagemId") } },
      select: { id: true, fotoUrl: true, hpAtual: true, hpMax: true },
    }),
  ]);
  const criaturaDe = new Map(criaturas.map((c) => [c.id, serializarCriatura(c)]));
  const personagemDe = new Map(personagens.map((p) => [p.id, p]));

  const participantes = ordenarParticipantes(combate.participantes).map((p): ParticipanteVisto => {
    const base = { id: p.id, nome: p.nomeExibicao, iniciativa: p.iniciativa };
    if (p.personagemId) {
      const pj = personagemDe.get(p.personagemId);
      return {
        ...base,
        foto: pj?.fotoUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${p.personagemId}`,
        tipo: "personagem",
        voce: p.personagemId === personagemId,
        pv: pj ? { atual: pj.hpAtual, max: pj.hpMax } : null,
        pp: null,
        cr: null,
        acoes: null,
      };
    }
    const c = p.criaturaId ? criaturaDe.get(p.criaturaId) : undefined;
    const reveladas = new Set(p.acoesReveladas);
    const acoes: AcaoVista[] | null =
      p.fichaVisivel && c
        ? c.componentes
            .filter((comp) => reveladas.has(comp.id))
            .map((comp) => ({
              id: comp.id,
              nome: comp.nome,
              categoria: CATEGORIAS_COMPONENTE.find((cat) => cat.key === comp.categoria)?.label ?? "",
              descricao: comp.descricao,
              stats: [
                ...comp.efeitos.map(textoEfeitoAcao).filter((t): t is string => t !== null),
                ...(comp.alcance.trim() ? [`Alcance: ${comp.alcance.trim()}`] : []),
                ...(comp.custo.trim() ? [`Custo: ${comp.custo.trim()}`] : []),
              ],
            }))
        : null;
    return {
      ...base,
      foto: c?.imagemUrl ?? null,
      tipo: "criatura",
      voce: false,
      pv: p.pvVisivel ? { atual: p.pvAtual ?? 0, max: p.pvMax ?? 0 } : null,
      pp: p.ppVisivel && c ? { atual: Math.max(0, c.pontosPoder - p.ppGasto), max: c.pontosPoder } : null,
      cr: p.crVisivel && c ? c.classeResistencia : null,
      acoes,
    };
  });

  return {
    sessaoId: sessao.id,
    combate: {
      id: combate.id,
      sessaoId: sessao.id,
      rodada: combate.rodadaAtual,
      turno: combate.turnoAtual,
      participantes,
    },
  };
}
