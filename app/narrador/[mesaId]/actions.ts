"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  ATRIBUTOS,
  PERICIAS,
  bonusPericia,
  bonusProficiencia,
  bonusSalvaguarda,
  lerProficiencias,
  modificador,
  type Atributo,
  type PericiaSlug,
} from "@/lib/op-rpg";
import type { Prisma } from "@prisma/client";

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
  forca: number;
  destreza: number;
  constituicao: number;
  sabedoria: number;
  vontade: number;
  presenca: number;
  proficiencias: unknown;
  periciasCustom: Array<{
    nome: string;
    atributo: string;
    proficiente: boolean;
    dobrada: boolean;
    bonusOutros: number;
  }>;
};

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

function valorDoAtributo(personagem: PersonagemTeste, atributo: Atributo): number {
  return personagem[atributo];
}

async function requireNarradorMesa(mesaId: string) {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    mesa,
  ] = await Promise.all([
    supabase.auth.getUser(),
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
    select: {
      id: true,
      nome: true,
      nivel: true,
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
          atributo: true,
          proficiente: true,
          dobrada: true,
          bonusOutros: true,
        },
      },
    },
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

function calcularBonusTesteInterno(personagem: PersonagemTeste, selecao: SelecaoTestePayload) {
  const prof = lerProficiencias(personagem.proficiencias);

  if (selecao.tipo === "salvaguarda") {
    const valorAtributo = valorDoAtributo(personagem, selecao.atributo);
    const modAtributo = modificador(valorAtributo);
    const proficiente = prof.salvaguardas.includes(selecao.atributo);
    const outros = prof.outrosSalvaguardas[selecao.atributo] ?? 0;
    const total = bonusSalvaguarda({
      valorAtributo,
      nivel: personagem.nivel,
      proficiente,
      outros,
    });

    const nomeAtributo = ATRIBUTOS.find((a) => a.slug === selecao.atributo)?.nome ?? selecao.atributo;
    const profValor = proficiente ? bonusProficiencia(personagem.nivel) : 0;
    const detalhe = `${nomeAtributo} ${formatarComSinal(modAtributo)} + Prof ${formatarComSinal(
      profValor,
    )} + Outro ${formatarComSinal(outros)} = ${formatarComSinal(total)}`;

    return { bonus: total, detalhe };
  }

  const valorAtributo = valorDoAtributo(personagem, selecao.atributo);
  const modAtributo = modificador(valorAtributo);
  const slugCanonico = resolverSlugCanonico(selecao);
  if (slugCanonico) {
    const proficiente = prof.pericias.includes(slugCanonico);
    const dobrado = proficiente && prof.periciasDobradas.includes(slugCanonico);
    const outros = prof.outrosPericias[slugCanonico] ?? 0;
    const total = bonusPericia({
      valorAtributo,
      nivel: personagem.nivel,
      proficiente,
      dobrado,
      outros,
    });
    const profValor = proficiente ? bonusProficiencia(personagem.nivel) * (dobrado ? 2 : 1) : 0;
    const nomeAtributo = ATRIBUTOS.find((a) => a.slug === selecao.atributo)?.nome ?? selecao.atributo;
    const detalhe = `${nomeAtributo} ${formatarComSinal(modAtributo)} + Prof ${formatarComSinal(
      profValor,
    )} + Outro ${formatarComSinal(outros)} = ${formatarComSinal(total)}`;
    return { bonus: total, detalhe };
  }

  const nomeNormalizado = normalizarTexto(selecao.nome);
  const custom = personagem.periciasCustom.find(
    (p) => isAtributo(p.atributo) && p.atributo === selecao.atributo && normalizarTexto(p.nome) === nomeNormalizado,
  );

  if (!custom) {
    const nomeAtributo = ATRIBUTOS.find((a) => a.slug === selecao.atributo)?.nome ?? selecao.atributo;
    return {
      bonus: modAtributo,
      detalhe: `${nomeAtributo} ${formatarComSinal(modAtributo)} + Prof +0 + Outro +0 = ${formatarComSinal(
        modAtributo,
      )}`,
    };
  }

  const profValor = custom.proficiente
    ? bonusProficiencia(personagem.nivel) * (custom.dobrada ? 2 : 1)
    : 0;
  const total = modAtributo + profValor + custom.bonusOutros;
  const nomeAtributo = ATRIBUTOS.find((a) => a.slug === selecao.atributo)?.nome ?? selecao.atributo;
  const detalhe = `${nomeAtributo} ${formatarComSinal(modAtributo)} + Prof ${formatarComSinal(
    profValor,
  )} + Outro ${formatarComSinal(custom.bonusOutros)} = ${formatarComSinal(total)}`;
  return { bonus: total, detalhe };
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
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    personagem,
  ] = await Promise.all([
    supabase.auth.getUser(),
    prisma.personagem.findUnique({
      where: { id: personagemId },
      select: {
        id: true,
        nome: true,
        nivel: true,
        forca: true,
        destreza: true,
        constituicao: true,
        sabedoria: true,
        vontade: true,
        presenca: true,
        proficiencias: true,
        mesa: { select: { userId: true } },
        periciasCustom: {
          select: {
            nome: true,
            atributo: true,
            proficiente: true,
            dobrada: true,
            bonusOutros: true,
          },
        },
      },
    }),
  ]);

  if (!user) throw new Error("Não autenticado.");
  if (!personagem) throw new Error("Personagem não encontrado.");
  if (personagem.mesa?.userId !== user.id) {
    throw new Error("Apenas o narrador da mesa pode calcular bônus.");
  }

  const { bonus, detalhe } = calcularBonusTesteInterno(personagem, selecao);
  return {
    personagemId: personagem.id,
    nome: personagem.nome,
    bonus,
    detalhe,
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
  return base.map((p) => {
    const { bonus, detalhe } = calcularBonusTesteInterno(p, selecao);
    return {
      personagemId: p.id,
      nome: p.nome,
      bonus,
      detalhe,
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

  const bonusPorAlvoLista = personagens
    .filter((p) => alvosIds.includes(p.id))
    .map((personagem) => {
      const { bonus, detalhe } = calcularBonusTesteInterno(personagem, payload.selecao);
      return {
        personagemId: personagem.id,
        bonus,
        detalhe,
      };
    });

  const bonusPorAlvo: Record<string, number> = {};
  const bonusDetalhesPorAlvo: Record<string, string> = {};
  for (const item of bonusPorAlvoLista) {
    bonusPorAlvo[item.personagemId] = item.bonus;
    bonusDetalhesPorAlvo[item.personagemId] = item.detalhe;
  }

  const modosPorAlvo: Record<string, ModoTeste> = {};
  for (const personagemId of alvosIds) {
    const modo = payload.modosPorAlvo?.[personagemId];
    modosPorAlvo[personagemId] =
      modo === "vantagem" || modo === "desvantagem" ? modo : "normal";
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
      },
    } as Prisma.MensagemCreateInput,
  });

  revalidatePath(`/narrador/${mesaId}`);
  return mensagem;
}