"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import {
  ATRIBUTOS,
  PERICIAS,
  atributosEfetivos,
  chipsDoContexto,
  efeitosDoContexto,
  exaustaoQueConta,
  lerProficiencias,
  modificador,
  modoDosEfeitos,
  penalidadeD20Exaustao,
  resolverTeste,
  type Atributo,
  type ContextoRolagem,
  type HabilidadeFonte,
  type PericiaSlug,
} from "@/lib/op-rpg";
import {
  SELECT_HABILIDADE_FONTE,
  SELECT_ITEM_FONTE,
  agregadoDaFicha,
  penalidadeDesDasArmaduras,
  recebidasDaMesa,
} from "@/lib/efeitos-servidor";
import type { Prisma } from "@prisma/client";
import type { Dado } from "@/lib/dice";

type ModoTeste = "normal" | "vantagem" | "desvantagem";

type SelecaoTestePayload =
  | {
      tipo: "pericia";
      chave: string;
      nome: string;
      atributo: Atributo;
      slugCanonico?: PericiaSlug | null;
    }
  | {
      tipo: "salvaguarda";
      atributo: Atributo;
    };

type PersonagemTeste = {
  id: string;
  nome: string;
  nivel: number;
  exaustao: number;
  forca: number;
  destreza: number;
  constituicao: number;
  sabedoria: number;
  vontade: number;
  presenca: number;
  proficiencias: unknown;
  periciasCustom: Array<{
    nome: string;
    slug: string;
    atributo: string;
    proficiente: boolean;
    dobrada: boolean;
    bonusOutros: number;
  }>;
  habilidades: Array<{
    id: string;
    nome: string;
    tipo: string;
    efeitos: unknown;
    ligada: boolean;
    itemId: string | null;
    alternavel: boolean;
    aliado: boolean;
    usos: number | null;
    usosAtual: number | null;
    usosFormula: string | null;
  }>;
  itens: Array<{
    id: string;
    nome: string;
    tipo: string;
    equipado: boolean;
    efeitos: unknown;
    penalidadeDes: number;
  }>;
  arvores: Array<{ nos: Array<{ habilidadeId: string | null; rankAtual: number }> }>;
};

// Campos que o cálculo do teste lê (efeitos, exaustão e armadura inclusos).
const SELECT_PERSONAGEM_TESTE = {
  id: true,
  nome: true,
  nivel: true,
  exaustao: true,
  forca: true,
  destreza: true,
  constituicao: true,
  sabedoria: true,
  vontade: true,
  presenca: true,
  proficiencias: true,
  periciasCustom: {
    select: {
      nome: true,
      slug: true,
      atributo: true,
      proficiente: true,
      dobrada: true,
      bonusOutros: true,
    },
  },
  habilidades: { select: SELECT_HABILIDADE_FONTE },
  itens: { select: SELECT_ITEM_FONTE },
  arvores: { select: { nos: { select: { habilidadeId: true, rankAtual: true } } } },
} as const;

function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isAtributo(valor: string): valor is Atributo {
  return ATRIBUTOS.some((a) => a.slug === valor);
}

function formatarComSinal(valor: number): string {
  return valor >= 0 ? `+${valor}` : `${valor}`;
}

async function requireNarradorMesa(mesaId: string) {
  const [user, mesa] = await Promise.all([
    usuarioDaRequest(),
    prisma.mesa.findUnique({ where: { id: mesaId }, select: { userId: true } }),
  ]);

  if (!user) throw new Error("Não autenticado.");
  if (!mesa) throw new Error("Mesa não encontrada.");
  if (mesa.userId !== user.id) throw new Error("Apenas o narrador pode executar esta ação.");

  return { userId: user.id };
}

async function obterPersonagensMesaParaTeste(mesaId: string): Promise<PersonagemTeste[]> {
  return prisma.personagem.findMany({
    where: { mesaId },
    orderBy: { nome: "asc" },
    select: SELECT_PERSONAGEM_TESTE,
  });
}

function resolverSlugCanonico(selecao: Extract<SelecaoTestePayload, { tipo: "pericia" }>): PericiaSlug | null {
  const porSlug = PERICIAS.find((p) => p.slug === selecao.slugCanonico);
  if (porSlug) return porSlug.slug;

  const nomeNormalizado = normalizarTexto(selecao.nome);
  const porNome = PERICIAS.find(
    (p) => p.atributo === selecao.atributo && normalizarTexto(p.nome) === nomeNormalizado,
  );
  return porNome?.slug ?? null;
}

// Vantagem e desvantagem se anulam.
function combinarModos(a: ModoTeste, b: ModoTeste): ModoTeste {
  const vantagem = a === "vantagem" || b === "vantagem";
  const desvantagem = a === "desvantagem" || b === "desvantagem";
  if (vantagem && !desvantagem) return "vantagem";
  if (desvantagem && !vantagem) return "desvantagem";
  return "normal";
}

// Bônus do teste como a ficha calcula: efeitos (inclusive os de aliados),
// armadura e exaustão inclusos.
function calcularBonusTesteInterno(
  personagem: PersonagemTeste,
  selecao: SelecaoTestePayload,
  recebidas: HabilidadeFonte[] = [],
) {
  const prof = lerProficiencias(personagem.proficiencias);
  const agg = agregadoDaFicha({
    habilidades: personagem.habilidades,
    itens: personagem.itens,
    nos: personagem.arvores.flatMap((a) => a.nos),
    slugsPericiaCustom: personagem.periciasCustom.map((p) => p.slug),
    base: personagem,
    recebidas,
  });
  const efetivos = atributosEfetivos(personagem, agg);
  const atributos = {
    ...efetivos,
    destreza: efetivos.destreza + 2 * penalidadeDesDasArmaduras(personagem.itens),
  };
  const base = { nivel: personagem.nivel, atributos, agg };

  let teste: ReturnType<typeof resolverTeste> | null = null;
  let ctx: ContextoRolagem;
  if (selecao.tipo === "salvaguarda") {
    ctx = { tipo: "salvaguarda", atributo: selecao.atributo };
    teste = resolverTeste({
      ...base,
      tipo: "salvaguarda",
      slug: selecao.atributo,
      atributoPadrao: selecao.atributo,
      proficiente: prof.salvaguardas.includes(selecao.atributo),
      dobrado: false,
      outros: prof.outrosSalvaguardas[selecao.atributo] ?? 0,
    });
  } else {
    const slugCanonico = resolverSlugCanonico(selecao);
    const nomeNormalizado = normalizarTexto(selecao.nome);
    const custom = slugCanonico
      ? undefined
      : personagem.periciasCustom.find(
          (p) =>
            isAtributo(p.atributo) &&
            p.atributo === selecao.atributo &&
            normalizarTexto(p.nome) === nomeNormalizado,
        );
    if (slugCanonico) {
      ctx = { tipo: "pericia", pericia: slugCanonico };
      teste = resolverTeste({
        ...base,
        tipo: "pericia",
        slug: slugCanonico,
        atributoPadrao: selecao.atributo,
        proficiente: prof.pericias.includes(slugCanonico),
        dobrado: prof.periciasDobradas.includes(slugCanonico),
        outros: prof.outrosPericias[slugCanonico] ?? 0,
      });
    } else if (custom) {
      ctx = { tipo: "pericia", pericia: custom.slug };
      teste = resolverTeste({
        ...base,
        tipo: "pericia",
        slug: custom.slug,
        atributoPadrao: selecao.atributo,
        proficiente: custom.proficiente,
        dobrado: custom.dobrada,
        outros: custom.bonusOutros,
      });
    } else {
      ctx = { tipo: "teste-atributo", atributo: selecao.atributo };
    }
  }

  // Dados a mais que valem sempre nessa jogada (ex.: +1d4 em testes).
  const extras = chipsDoContexto(efeitosDoContexto(agg), ctx).filter(
    (c) => c.tipo === "dano_extra" && !c.opcional,
  );
  const dados: Dado[] = extras.flatMap((c) => c.dados ?? []);

  const atributoUsado = teste?.atributo ?? selecao.atributo;
  const mod = teste?.mod ?? modificador(atributos[atributoUsado]);
  const profValor = teste?.prof ?? 0;
  const outros = (teste?.outros ?? 0) + extras.reduce((soma, c) => soma + (c.valor ?? 0), 0);
  const exaustao = penalidadeD20Exaustao(exaustaoQueConta(personagem.exaustao, agg));
  const bonus = mod + profValor + outros - exaustao;

  const efeitosModo = modoDosEfeitos(agg.contextuais, ctx);
  const modo = combinarModos(
    efeitosModo.vantagem.length ? "vantagem" : "normal",
    efeitosModo.desvantagem.length ? "desvantagem" : "normal",
  );

  const nomeAtributo = ATRIBUTOS.find((a) => a.slug === atributoUsado)?.nome ?? atributoUsado;
  const partes = [
    `${nomeAtributo} ${formatarComSinal(mod)}`,
    `Prof ${formatarComSinal(profValor)}`,
    `Outro ${formatarComSinal(outros)}`,
    ...(exaustao ? [`Exaustão -${exaustao}`] : []),
  ];
  const notas = [
    ...(efeitosModo.vantagem.length ? [`vantagem por ${efeitosModo.vantagem.join(", ")}`] : []),
    ...(efeitosModo.desvantagem.length
      ? [`desvantagem por ${efeitosModo.desvantagem.join(", ")}`]
      : []),
    ...(efeitosModo.sucesso.length
      ? [`sucesso automático por ${efeitosModo.sucesso.join(", ")}`]
      : []),
    ...(efeitosModo.falha.length ? [`falha automática por ${efeitosModo.falha.join(", ")}`] : []),
    ...extras.map((c) => `${c.rotulo} por ${c.fontes.join(", ")}`),
  ];
  const detalhe = `${partes.join(" + ")} = ${formatarComSinal(bonus)}${
    notas.length ? ` · ${notas.join(" · ")}` : ""
  }`;
  return { bonus, detalhe, modo, dados };
}

export async function aggregatePericiasForMesa(mesaId: string) {
  await requireNarradorMesa(mesaId);
  const personagens = await obterPersonagensMesaParaTeste(mesaId);

  const mapa = new Map<
    string,
    {
      chave: string;
      nome: string;
      atributo: Atributo;
      slugCanonico: PericiaSlug | null;
      origem: "canonica" | "custom";
      personagensIds: Set<string>;
    }
  >();

  for (const pericia of PERICIAS) {
    mapa.set(`canonica:${pericia.slug}`, {
      chave: `canonica:${pericia.slug}`,
      nome: pericia.nome,
      atributo: pericia.atributo,
      slugCanonico: pericia.slug,
      origem: "canonica",
      personagensIds: new Set(personagens.map((p) => p.id)),
    });
  }

  for (const personagem of personagens) {
    for (const custom of personagem.periciasCustom) {
      if (!isAtributo(custom.atributo)) continue;
      const chaveNormalizada = `custom:${normalizarTexto(custom.nome)}:${custom.atributo}`;
      const atual = mapa.get(chaveNormalizada);
      if (atual) {
        atual.personagensIds.add(personagem.id);
        continue;
      }
      mapa.set(chaveNormalizada, {
        chave: chaveNormalizada,
        nome: custom.nome,
        atributo: custom.atributo,
        slugCanonico: null,
        origem: "custom",
        personagensIds: new Set([personagem.id]),
      });
    }
  }

  return Array.from(mapa.values())
    .map((item) => {
      const atributo = ATRIBUTOS.find((a) => a.slug === item.atributo);
      const quantidade = item.personagensIds.size;
      return {
        chave: item.chave,
        nome: item.nome,
        atributo: item.atributo,
        siglaAtributo: atributo?.sigla ?? item.atributo,
        slugCanonico: item.slugCanonico,
        origem: item.origem,
        quantidade,
        personagensIds: Array.from(item.personagensIds),
        label: `${item.nome} (${atributo?.nome ?? item.atributo}) — ${quantidade} jogador(es) têm`,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function aggregateSalvaguardasForMesa(mesaId: string) {
  await requireNarradorMesa(mesaId);
  const quantidadeJogadores = await prisma.personagem.count({ where: { mesaId } });
  return ATRIBUTOS.map((atributo) => ({
    chave: `salvaguarda:${atributo.slug}`,
    atributo: atributo.slug,
    nome: atributo.nome,
    sigla: atributo.sigla,
    quantidade: quantidadeJogadores,
    label: `${atributo.nome} (${atributo.sigla}) — ${quantidadeJogadores} jogador(es)`,
  }));
}

export async function calcularBonusTeste(personagemId: string, selecao: SelecaoTestePayload) {
  const [user, personagem] = await Promise.all([
    usuarioDaRequest(),
    prisma.personagem.findUnique({
      where: { id: personagemId },
      select: { ...SELECT_PERSONAGEM_TESTE, mesaId: true, mesa: { select: { userId: true } } },
    }),
  ]);

  if (!user) throw new Error("Não autenticado.");
  if (!personagem) throw new Error("Personagem não encontrado.");
  if (personagem.mesa?.userId !== user.id || !personagem.mesaId) {
    throw new Error("Apenas o narrador da mesa pode calcular bônus.");
  }

  const recebidas = await recebidasDaMesa(personagem.mesaId, [personagem.id]);
  const { bonus, detalhe, modo } = calcularBonusTesteInterno(
    personagem,
    selecao,
    recebidas.get(personagem.id),
  );
  return {
    personagemId: personagem.id,
    nome: personagem.nome,
    bonus,
    detalhe,
    modo,
  };
}

export async function calcularBonusTesteMesa(
  mesaId: string,
  selecao: SelecaoTestePayload,
  alvos?: string[] | "TODOS",
) {
  await requireNarradorMesa(mesaId);
  const personagens = await obterPersonagensMesaParaTeste(mesaId);
  const idsSelecionados =
    alvos === "TODOS" || !Array.isArray(alvos) ? null : new Set(alvos);

  const base = personagens.filter((p) => !idsSelecionados || idsSelecionados.has(p.id));
  const recebidas = await recebidasDaMesa(
    mesaId,
    base.map((p) => p.id),
  );
  return base.map((p) => {
    const { bonus, detalhe, modo } = calcularBonusTesteInterno(p, selecao, recebidas.get(p.id));
    return {
      personagemId: p.id,
      nome: p.nome,
      bonus,
      detalhe,
      modo,
    };
  });
}

export async function removerPersonagemDaMesa(mesaId: string, personagemId: string) {
  await requireNarradorMesa(mesaId);
  const personagem = await prisma.personagem.findFirst({
    where: { id: personagemId, mesaId },
    select: { id: true, nome: true },
  });
  if (!personagem) throw new Error("Personagem não encontrado nesta mesa.");

  await prisma.personagem.update({
    where: { id: personagem.id },
    data: { mesaId: null },
  });

  revalidatePath(`/narrador/${mesaId}`);
  revalidatePath("/dashboard");
}

export async function criarSolicitacaoTeste(
  mesaId: string,
  payload: {
    selecao: SelecaoTestePayload;
    cd: number;
    privacidade: {
      ocultarCd: boolean;
      ocultarRolagem: boolean;
      ocultarResultado: boolean;
    };
    alvos?: string[] | "TODOS";
    alvosNomes?: string[];
    modosPorAlvo?: Record<string, ModoTeste>;
  },
) {
  const { userId } = await requireNarradorMesa(mesaId);

  const personagens = await obterPersonagensMesaParaTeste(mesaId);
  const alvosIds =
    payload.alvos === "TODOS" || !Array.isArray(payload.alvos)
      ? personagens.map((p) => p.id)
      : personagens.filter((p) => payload.alvos?.includes(p.id)).map((p) => p.id);
  const alvosNomes = personagens
    .filter((p) => alvosIds.includes(p.id))
    .map((p) => p.nome);
  const recebidas = await recebidasDaMesa(mesaId, alvosIds);

  const bonusPorAlvoLista = personagens
    .filter((p) => alvosIds.includes(p.id))
    .map((personagem) => {
      const { bonus, detalhe, modo, dados } = calcularBonusTesteInterno(
        personagem,
        payload.selecao,
        recebidas.get(personagem.id),
      );
      return {
        personagemId: personagem.id,
        bonus,
        detalhe,
        modo,
        dados,
      };
    });

  const bonusPorAlvo: Record<string, number> = {};
  const bonusDetalhesPorAlvo: Record<string, string> = {};
  // Dados a mais de cada alvo, rolados junto do d20.
  const dadosPorAlvo: Record<string, Dado[]> = {};
  for (const item of bonusPorAlvoLista) {
    bonusPorAlvo[item.personagemId] = item.bonus;
    bonusDetalhesPorAlvo[item.personagemId] = item.detalhe;
    if (item.dados.length > 0) dadosPorAlvo[item.personagemId] = item.dados;
  }

  const modoDosEfeitosPorAlvo = new Map(bonusPorAlvoLista.map((b) => [b.personagemId, b.modo]));
  const modosPorAlvo: Record<string, ModoTeste> = {};
  for (const personagemId of alvosIds) {
    const modo = payload.modosPorAlvo?.[personagemId];
    const doNarrador: ModoTeste =
      modo === "vantagem" || modo === "desvantagem" ? modo : "normal";
    modosPorAlvo[personagemId] = combinarModos(
      doNarrador,
      modoDosEfeitosPorAlvo.get(personagemId) ?? "normal",
    );
  }

  const atributoSlug =
    payload.selecao.tipo === "salvaguarda" ? payload.selecao.atributo : payload.selecao.atributo;
  const atributoNome = ATRIBUTOS.find((a) => a.slug === atributoSlug)?.nome ?? atributoSlug;
  const titulo =
    payload.selecao.tipo === "salvaguarda"
      ? `Salvaguarda de ${atributoNome}`
      : payload.selecao.nome;

  const mensagem = await prisma.mensagem.create({
    data: {
      sessionId: mesaId,
      uid: userId,
      nome: "Narrador",
      mensagem: null,
      tipo: "teste",
      detalhes: {
        tipoTeste: payload.selecao.tipo,
        pericia: titulo,
        periciaChave: payload.selecao.tipo === "pericia" ? payload.selecao.chave : null,
        periciaSlugCanonico:
          payload.selecao.tipo === "pericia" ? payload.selecao.slugCanonico ?? null : null,
        atributo: atributoSlug,
        cd: payload.privacidade.ocultarCd ? null : payload.cd,
        cdInterna: payload.cd,
        ocultarCd: payload.privacidade.ocultarCd,
        ocultarRolagem: payload.privacidade.ocultarRolagem,
        ocultarResultado: payload.privacidade.ocultarResultado,
        privacidadeCd: !payload.privacidade.ocultarCd,
        privacidadeResultado: !payload.privacidade.ocultarResultado,
        alvos: payload.alvos ?? "TODOS",
        alvosNomes,
        statusPorNome: {},
        modosPorAlvo,
        bonusPorAlvo,
        bonusDetalhesPorAlvo,
        dadosPorAlvo,
      },
    } as Prisma.MensagemCreateInput,
  });

  revalidatePath(`/narrador/${mesaId}`);
  return mensagem;
}