// Resumo de combate de um personagem pra visão do narrador: vida/PP efetivos,
// CR, iniciativa e percepção passiva. Mesmas regras da ficha
// (app/ficha/[uid]/page.tsx + perfil-sidebar.tsx) — se mudar lá, mude aqui,
// senão o narrador vê um número e o jogador outro.

import type { Arvore, ArvoreNo, Habilidade, Item, Personagem, PericiaCustom } from "@prisma/client";
import { habilidadesTravadas } from "./arvore";
import {
  type Atributo,
  agregarEfeitos,
  atributoDeCalculo,
  crBase,
  fontesDeEfeitoDeItens,
  iniciativa,
  lerProficiencias,
  penalidadeD20Exaustao,
  percepcaoPassiva,
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
};

const ATRIBUTOS: Atributo[] = ["forca", "destreza", "constituicao", "sabedoria", "vontade", "presenca"];

export function resumirPersonagem(p: PersonagemComFontes): ResumoPersonagem {
  // Habilidades travadas por árvore ou por item desequipado ficam fora do agregado.
  const travadas = habilidadesTravadas(p.arvores.flatMap((a) => a.nos));
  const equipados = new Set(p.itens.filter((i) => i.equipado).map((i) => i.id));
  const habilidades = p.habilidades.filter(
    (h) => !travadas.has(h.id) && (!h.itemId || equipados.has(h.itemId)),
  );
  const ef = agregarEfeitos(
    [...habilidades, ...fontesDeEfeitoDeItens(p.itens)],
    new Set(p.periciasCustom.map((c) => c.slug)),
  );

  const efetivos = Object.fromEntries(
    ATRIBUTOS.map((a) => [a, p[a] + (ef.bonusAtributo[a]?.valor ?? 0)]),
  ) as Record<Atributo, number>;

  // DES de testes/CR já com a penalidade das armaduras equipadas.
  const penalidadeDes = p.itens.reduce(
    (acc, i) => (i.tipo === "armadura" && i.equipado ? acc + i.penalidadeDes : acc),
    0,
  );
  const paraTeste = { ...efetivos, destreza: efetivos.destreza + 2 * penalidadeDes };
  const subs = ef.substituicoesAtributo;

  const caArmadura = p.itens.reduce(
    (acc, i) => (i.tipo === "armadura" && i.equipado ? acc + i.ca : acc),
    0,
  );
  const crAtrib = atributoDeCalculo("cr", "destreza", subs).atributo;
  const cr = crBase(paraTeste[crAtrib], p.crOutros) + caArmadura + ef.bonusCR.valor;

  const iniAtrib = atributoDeCalculo("iniciativa", "destreza", subs).atributo;
  const ini =
    iniciativa(paraTeste[iniAtrib]) + ef.bonusIniciativa.valor - penalidadeD20Exaustao(p.exaustao);

  const profPercepcao =
    lerProficiencias(p.proficiencias).pericias.includes("percepcao") ||
    !!ef.proficienciasPericia.percepcao;
  const percepcao =
    percepcaoPassiva({ vontade: efetivos.vontade, nivel: p.nivel, proficienteEmPercepcao: profPercepcao }) +
    ef.bonusPercepcaoPassiva.valor;

  // Pools: (base + aditivo) × fator, arredondado.
  const multHp = ef.multiplicadores["hp-max"];
  const multPp = ef.multiplicadores["pp-max"];
  const hpBase = p.hpMax + ef.bonusHpMax.valor;
  const ppBase = p.ppMax + ef.bonusPpMax.valor;

  return {
    id: p.id,
    nome: p.nome,
    nivel: p.nivel,
    fotoUrl: p.fotoUrl,
    hpAtual: p.hpAtual,
    hpTemp: p.hpTemp,
    hpMax: multHp ? Math.round(hpBase * multHp.fator) : hpBase,
    ppAtual: p.ppAtual,
    ppMax: multPp ? Math.round(ppBase * multPp.fator) : ppBase,
    exaustao: p.exaustao,
    cr,
    iniciativa: ini,
    percepcaoPassiva: percepcao,
    destreza: p.destreza,
  };
}
