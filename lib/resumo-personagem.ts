// Resumo de combate de um personagem pra visão do narrador: vida/PP efetivos,
// CR, iniciativa e percepção passiva. Mesmas regras da ficha
// (app/ficha/[uid]/page.tsx + perfil-sidebar.tsx) — se mudar lá, mude aqui,
// senão o narrador vê um número e o jogador outro.

import type {
  Arvore,
  ArvoreNo,
  Habilidade,
  Item,
  Personagem,
  PericiaCustom,
  Recurso,
} from "@prisma/client";
import { pvComSinal } from "./dano";
import { agregadoDaFicha, penalidadeDesDasArmaduras } from "./efeitos-servidor";
import { lerAbas, type AbaFicha } from "./subficha";
import {
  ATRIBUTOS,
  type HabilidadeFonte,
  atributoDeCalculo,
  atributosEfetivos,
  bonusTesteAmplo,
  comValoresIguais,
  contextoDasFormulas,
  crBase,
  deslocamentoEfetivo,
  exaustaoQueConta,
  fontesDeEfeitoDeItens,
  iniciativa,
  lerProficiencias,
  maximoDoRecurso,
  modoDosEfeitos,
  modosDeDeslocamento,
  penalidadeD20Exaustao,
  poolsEfetivos,
  resolverTeste,
  testePassivo,
} from "./op-rpg";

export type PersonagemComFontes = Personagem & {
  itens: Item[];
  habilidades: Habilidade[];
  periciasCustom: Pick<PericiaCustom, "slug">[];
  arvores: (Pick<Arvore, "id"> & { nos: ArvoreNo[] })[];
};

export type ResumoPersonagem = {
  id: string;
  nome: string;
  nivel: number;
  fotoUrl: string | null;
  // PV com sinal: abaixo de 0 são os PV negativos.
  hpAtual: number;
  hpTemp: number;
  hpMax: number;
  ppAtual: number;
  ppMax: number;
  exaustao: number;
  cr: number;
  iniciativa: number;
  percepcaoPassiva: number;
  destreza: number;
  // Soma das reduções que valem sempre e pra todo dano.
  reducaoDano: number;
};

// `recebidas`: habilidades de aliados ligadas neste personagem.
export function resumirPersonagem(
  p: PersonagemComFontes,
  recebidas: HabilidadeFonte[] = [],
): ResumoPersonagem {
  const ef = agregadoDaFicha({
    habilidades: p.habilidades,
    itens: p.itens,
    nos: p.arvores.flatMap((a) => a.nos),
    slugsPericiaCustom: p.periciasCustom.map((c) => c.slug),
    base: p,
    recebidas,
  });

  // DES de testes/CR já com a penalidade das armaduras equipadas.
  const efetivos = atributosEfetivos(p, ef);
  const paraTeste = {
    ...efetivos,
    destreza: efetivos.destreza + 2 * penalidadeDesDasArmaduras(p.itens),
  };
  const subs = ef.substituicoesAtributo;
  const exaustao = exaustaoQueConta(p.exaustao, ef);

  const caArmadura = p.itens.reduce(
    (acc, i) => (i.tipo === "armadura" && i.equipado ? acc + i.ca : acc),
    0,
  );
  const crAtrib = atributoDeCalculo("cr", "destreza", subs, paraTeste).atributo;
  const crPropria = Math.max(
    crBase(paraTeste[crAtrib], p.crOutros) + caArmadura + ef.bonusCR.valor,
    ef.valoresFixos["cr"]?.valor ?? 0,
  );

  // "Valor igual" parte dos valores já calculados; vale o maior.
  const modos = modosDeDeslocamento(ef, p.nado);
  const multDesloc = ef.multiplicadores["deslocamento"];
  const deslocSemMult = Math.max(
    0,
    p.deslocamento + ef.bonusDeslocamento.valor,
    ef.valoresFixos["deslocamento"]?.valor ?? 0,
  );
  const deslocBruto = multDesloc
    ? Math.floor(deslocSemMult * multDesloc.fator * 2) / 2
    : deslocSemMult;
  const valores = comValoresIguais(
    {
      ...modos,
      ...Object.fromEntries(
        ATRIBUTOS.map((a) => [a.slug, { valor: efetivos[a.slug], fontes: [] as string[] }]),
      ),
      deslocamento: { valor: deslocamentoEfetivo(deslocBruto, 0, exaustao), fontes: [] },
      nadar: modos.nadar ?? { valor: p.nado, fontes: [] },
      cr: { valor: crPropria, fontes: [] },
    },
    ef.valoresIguais ?? [],
  );

  const iniAtrib = atributoDeCalculo("iniciativa", "destreza", subs, paraTeste).atributo;
  const ini =
    iniciativa(paraTeste[iniAtrib]) +
    ef.bonusIniciativa.valor +
    bonusTesteAmplo(ef, "destreza").valor -
    penalidadeD20Exaustao(exaustao);

  // Percepção Passiva: 10 + bônus da perícia (sem exaustão), ±5 com vantagem/desvantagem.
  const profManual = lerProficiencias(p.proficiencias);
  const testePercepcao = resolverTeste({
    tipo: "pericia",
    slug: "percepcao",
    atributoPadrao: "vontade",
    nivel: p.nivel,
    atributos: paraTeste,
    proficiente: profManual.pericias.includes("percepcao"),
    dobrado: profManual.periciasDobradas.includes("percepcao"),
    outros: profManual.outrosPericias.percepcao ?? 0,
    agg: ef,
  });
  const modoPercepcao = modoDosEfeitos(ef.contextuais, {
    tipo: "pericia",
    pericia: "percepcao",
    atributo: testePercepcao.atributo,
  });
  const percepcao =
    testePassivo(
      testePercepcao.bonus,
      modoPercepcao.vantagem.length > 0,
      modoPercepcao.desvantagem.length > 0,
    ) + ef.bonusPercepcaoPassiva.valor;

  const pools = poolsEfetivos(p, ef);

  return {
    id: p.id,
    nome: p.nome,
    nivel: p.nivel,
    fotoUrl: p.fotoUrl,
    hpAtual: pvComSinal(p.hpAtual, p.pvNegativos),
    hpTemp: p.hpTemp,
    hpMax: pools.hpMax,
    ppAtual: p.ppAtual,
    ppMax: pools.ppMax,
    exaustao: p.exaustao,
    cr: valores.cr.valor,
    iniciativa: ini,
    percepcaoPassiva: percepcao,
    destreza: p.destreza,
    reducaoDano: ef.reducoesDano
      .filter((r) => r.passiva && !r.quando && !r.tipos)
      .reduce((soma, r) => soma + r.valor, 0),
  };
}

// Card de uma subficha na ficha do dono (ou da mesa, na Tripulação).
export type SubfichaCard = ResumoPersonagem & {
  perfil: string;
  abas: AbaFicha[] | null;
  molde: boolean;
  moldeId: string | null;
  daMesa: boolean;
  deslocamento: number;
  recursos: { id: string; nome: string; valorAtual: number; valorMax: number }[];
};

export function resumirSubficha(
  p: PersonagemComFontes & { recursos: Recurso[] },
  recebidas: HabilidadeFonte[] = [],
): SubfichaCard {
  const ctx = contextoDasFormulas([...p.habilidades, ...fontesDeEfeitoDeItens(p.itens)], {
    nivel: p.nivel,
    atributos: p,
  });
  return {
    ...resumirPersonagem(p, recebidas),
    perfil: p.perfil,
    abas: lerAbas(p.abas),
    molde: p.molde,
    moldeId: p.moldeId,
    daMesa: !!p.donoMesaId,
    deslocamento: p.deslocamento,
    recursos: p.recursos.map((r) => ({
      id: r.id,
      nome: r.nome,
      valorAtual: r.valorAtual,
      valorMax: maximoDoRecurso(r, ctx),
    })),
  };
}
