// Cópia inteira de uma ficha (molde → cópias): linhas novas, vínculos religados. Só servidor.

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { agregadoDaFicha } from "@/lib/efeitos-servidor";
import { poolsEfetivos } from "@/lib/op-rpg";

const INCLUDE_COPIA = {
  recursos: true,
  itens: true,
  habilidades: true,
  acoes: true,
  periciasCustom: true,
  arvores: { include: { camadas: true, ramos: true, nos: true } },
} as const;

export function carregarParaCopia(id: string) {
  return prisma.personagem.findUnique({ where: { id }, include: INCLUDE_COPIA });
}

export type FichaInteira = NonNullable<Awaited<ReturnType<typeof carregarParaCopia>>>;

type Linha = Record<string, unknown>;

// Linhas de cada tabela, na ordem em que as chaves estrangeiras deixam criar.
export type LinhasDeCopia = {
  personagens: Linha[];
  recursos: Linha[];
  itens: Linha[];
  habilidades: Linha[];
  acoes: Linha[];
  pericias: Linha[];
  arvores: Linha[];
  camadas: Linha[];
  ramos: Linha[];
  nos: Linha[];
};

export function semLinhas(): LinhasDeCopia {
  return {
    personagens: [],
    recursos: [],
    itens: [],
    habilidades: [],
    acoes: [],
    pericias: [],
    arvores: [],
    camadas: [],
    ramos: [],
    nos: [],
  };
}

// PV e PP cheios da ficha, com os efeitos dela.
function poolsCheios(origem: FichaInteira): { hpAtual: number; ppAtual: number } {
  const agg = agregadoDaFicha({
    habilidades: origem.habilidades,
    itens: origem.itens,
    nos: origem.arvores.flatMap((a) => a.nos),
    slugsPericiaCustom: origem.periciasCustom.map((p) => p.slug),
    base: origem,
  });
  const cheios = poolsEfetivos(origem, agg);
  return { hpAtual: cheios.hpMax, ppAtual: cheios.ppMax };
}

// Junta em `linhas` uma cópia de `origem` e devolve o id dela. A cópia nasce
// descansada: PV e PP cheios, sem exaustão, concentração, ação em curso nem alvo em aliado.
export function copiarFicha(
  origem: FichaInteira,
  sobre: { nome: string; molde: boolean; moldeId: string | null },
  linhas: LinhasDeCopia,
): string {
  const { recursos, itens, habilidades, acoes, periciasCustom, arvores, ...ficha } = origem;
  const camadas = arvores.flatMap((a) => a.camadas);
  const ramos = arvores.flatMap((a) => a.ramos);
  const nos = arvores.flatMap((a) => a.nos);

  const ids = new Map<string, string>();
  for (const x of [ficha, ...recursos, ...itens, ...habilidades, ...acoes, ...periciasCustom]) {
    ids.set(x.id, randomUUID());
  }
  for (const x of [...arvores, ...camadas, ...ramos, ...nos]) ids.set(x.id, randomUUID());

  // Troca os ids antigos pelos novos, nas colunas e dentro dos Json. Saem os
  // campos de `fora` e os nulos (o createMany não aceita null em coluna Json).
  const religar = (linha: object, fora: string[] = []): Linha =>
    Object.fromEntries(
      Object.entries(
        JSON.parse(
          JSON.stringify(linha),
          (_chave, v) => (typeof v === "string" ? (ids.get(v) ?? v) : v),
        ) as Linha,
      ).filter(([campo, v]) => v !== null && !fora.includes(campo)),
    );

  linhas.personagens.push({
    ...religar(ficha, ["concentracao", "ultimaRolagem", "moldeId", "hpTempDuracao"]),
    ...poolsCheios(origem),
    hpTemp: 0,
    pvNegativos: 0,
    exaustao: 0,
    dadosVidaGastos: 0,
    nome: sobre.nome,
    molde: sobre.molde,
    ...(sobre.moldeId ? { moldeId: sobre.moldeId } : {}),
  });
  linhas.recursos.push(...recursos.map((r) => religar(r)));
  linhas.itens.push(...itens.map((i) => religar(i)));
  linhas.habilidades.push(
    ...habilidades.map((h) => {
      const linha = religar(h, ["alvoPersonagemId"]);
      return h.aliado ? { ...linha, ligada: false } : linha;
    }),
  );
  linhas.acoes.push(...acoes.map((a) => ({ ...religar(a, ["turnosRestantes"]), emCurso: false })));
  linhas.pericias.push(...periciasCustom.map((p) => religar(p)));
  linhas.arvores.push(...arvores.map((a) => religar(a, ["camadas", "ramos", "nos"])));
  linhas.camadas.push(...camadas.map((c) => religar(c)));
  linhas.ramos.push(...ramos.map((r) => religar(r)));
  linhas.nos.push(...nos.map((n) => religar(n)));
  return ids.get(ficha.id)!;
}

// Operações que gravam as linhas, pra rodar numa transação só.
export function opsDeCopia(l: LinhasDeCopia): Prisma.PrismaPromise<unknown>[] {
  const tabelas: [Linha[], (data: never[]) => Prisma.PrismaPromise<unknown>][] = [
    [l.personagens, (data) => prisma.personagem.createMany({ data })],
    [l.recursos, (data) => prisma.recurso.createMany({ data })],
    [l.itens, (data) => prisma.item.createMany({ data })],
    [l.habilidades, (data) => prisma.habilidade.createMany({ data })],
    [l.acoes, (data) => prisma.acao.createMany({ data })],
    [l.pericias, (data) => prisma.periciaCustom.createMany({ data })],
    [l.arvores, (data) => prisma.arvore.createMany({ data })],
    [l.camadas, (data) => prisma.arvoreCamada.createMany({ data })],
    [l.ramos, (data) => prisma.arvoreRamo.createMany({ data })],
    [l.nos, (data) => prisma.arvoreNo.createMany({ data })],
  ];
  return tabelas.flatMap(([linhas, criar]) => (linhas.length > 0 ? [criar(linhas as never[])] : []));
}
