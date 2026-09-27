// Talentos prontos dos moldes de árvore (só o servidor importa).

import type { RequisitoNo } from "./arvore";

/** Talento de molde. `chave` liga os requisitos e vira um id novo na criação. */
export type TalentoMolde = {
  chave: string;
  nome: string;
  descricao: string;
  icone: string;
  custo: number;
  maxRanks: number;
  /** Índice em `PresetArvore.camadas`. */
  camada: number;
  /** Índice em `PresetArvore.ramos`. */
  ramo: number;
  /** Célula na grade: coluna dentro da raia, linha dentro da camada. */
  coluna: number;
  linha: number;
  /** rank 2 = Forma Dominada (✩), 3 = Avançada (★). */
  requisitos: { chave: string; rank: number }[];
};

type Base = Omit<TalentoMolde, "camada" | "ramo" | "icone">;

/** Os talentos de uma camada numa raia, com o ícone do tipo. */
function celula(camada: number, ramo: number, icone: string, lista: Base[]): TalentoMolde[] {
  return lista.map((t) => ({ ...t, camada, ramo, icone }));
}

const req = (chave: string, rank = 1) => ({ chave, rank });

// ─── Haki (OP RPG v1.5.7, cap. 7) ──────────────────────────────────────
// Os três Haki numa árvore só, uma raia por tipo.

const INEXPERIENTE = 0;
const TREINADO = 1;
const PERITO = 2;
const OBSERVACAO = 0;
const ARMAMENTO = 1;
const REI = 2;

const OLHO = "fa-eye";
const PUNHO = "fa-fist-raised";
const COROA = "fa-crown";

const TALENTOS_HAKI: TalentoMolde[] = [
  // ─ Observação ─
  ...celula(INEXPERIENTE, OBSERVACAO, OLHO, [
    {
      chave: "identificar-emocoes",
      coluna: 0,
      linha: 0,
      nome: "Identificar Emoções",
      custo: 1,
      maxRanks: 1,
      requisitos: [],
      descricao:
        "Você passa automaticamente no teste de VON (Haki) pra saber se uma criatura está hostil, neutra ou amigável a você.",
    },
    {
      chave: "senso-de-desafio",
      coluna: 0,
      linha: 1,
      nome: "Senso de Desafio",
      custo: 1,
      maxRanks: 1,
      requisitos: [req("identificar-emocoes")],
      descricao:
        "Uma vez por encontro, escolha uma criatura a até 6 m e descubra o quão forte ela é — o Narrador revela ND, CR ou PV aproximados.",
    },
    {
      chave: "perceber-presenca",
      coluna: 1,
      linha: 0,
      nome: "Perceber Presença",
      custo: 1,
      maxRanks: 3,
      requisitos: [],
      descricao:
        "Com uma ação e mantendo Concentração, faz um teste de VON (Haki) com vantagem pra sentir criaturas vivas a até 3 m. Você as vê como uma aura, mesmo invisíveis.\n✩ Alcance de 18 m.\n★ Alcance de 36 m.",
    },
    {
      chave: "clarividencia",
      coluna: 1,
      linha: 1,
      nome: "Clarividência",
      custo: 2,
      maxRanks: 3,
      requisitos: [req("identificar-emocoes"), req("perceber-presenca")],
      descricao:
        "Quando uma técnica com jogada de ataque erra, você perde só metade do PP.\n✩ Pode não perder PP nenhum, 3× por descanso longo.\n★ Vale também pra técnicas de área que não atingiram ninguém.",
    },
    {
      chave: "previsao",
      coluna: 2,
      linha: 0,
      nome: "Previsão",
      custo: 2,
      maxRanks: 3,
      requisitos: [],
      descricao: "+1 nas jogadas de ataque.\n✩ +2.\n★ +3.",
    },
    {
      chave: "percepcao-agil",
      coluna: 2,
      linha: 1,
      nome: "Percepção Ágil",
      custo: 2,
      maxRanks: 1,
      requisitos: [req("previsao")],
      descricao:
        "Você decide usar uma característica que depende do acerto só depois de saber se o ataque acertou — não gasta PP nem usos à toa.",
    },
    {
      chave: "antevisao",
      coluna: 3,
      linha: 0,
      nome: "Antevisão",
      custo: 3,
      maxRanks: 2,
      requisitos: [],
      descricao:
        "Com uma ação bônus e mantendo Concentração, ganha +1 na CR. Sem Concentração: como reação, +2 na CR até o seu próximo turno.\n✩ +2 com Concentração e +3 na reação.",
    },
  ]),
  ...celula(TREINADO, OBSERVACAO, OLHO, [
    {
      chave: "antecipacao",
      coluna: 1,
      linha: 0,
      nome: "Antecipação",
      custo: 2,
      maxRanks: 1,
      requisitos: [req("perceber-presenca")],
      descricao:
        "Uma vez por rodada, ignora um ataque de oportunidade provocado pelo seu deslocamento (inclusive Ataque de Oportunidade Superior).",
    },
    {
      chave: "premonicao",
      coluna: 0,
      linha: 0,
      nome: "Premonição",
      custo: 2,
      maxRanks: 1,
      requisitos: [req("clarividencia", 2)],
      descricao: "Você não pode ser surpreendido e não rola iniciativa: age sempre primeiro.",
    },
    {
      chave: "impeto-antecipado",
      coluna: 0,
      linha: 1,
      nome: "Ímpeto Antecipado",
      custo: 3,
      maxRanks: 1,
      requisitos: [req("clarividencia", 3), req("premonicao")],
      descricao:
        "Ao usar uma técnica de combate com dano direto como Ação Poderosa, faz uma jogada de ataque extra como parte da ação. 3× por descanso longo (soma com o Ímpeto Desperto das Akuma no Mi).",
    },
    {
      chave: "previsao-sobrenatural",
      coluna: 2,
      linha: 0,
      nome: "Previsão Sobrenatural",
      custo: 2,
      maxRanks: 1,
      requisitos: [req("previsao", 2)],
      descricao:
        "Você pode esperar pra decidir se usa uma reação até saber se o ataque acertou ou errou.",
    },
    {
      chave: "vidente",
      coluna: 2,
      linha: 1,
      nome: "Vidente",
      custo: 2,
      maxRanks: 3,
      requisitos: [req("antevisao"), req("previsao")],
      descricao:
        "No início do dia, role 1d20 e guarde o resultado. Até o próximo descanso longo, pode trocar qualquer Teste ou Salvaguarda — seu ou de uma criatura que você veja — pelo valor guardado.\n✩ Sem efeito novo.\n★ Guarda 2 dados por descanso longo.",
    },
    {
      chave: "antevisao-sobrenatural",
      coluna: 3,
      linha: 0,
      nome: "Antevisão Sobrenatural",
      custo: 2,
      maxRanks: 1,
      requisitos: [req("antevisao", 2)],
      descricao:
        "Em efeitos com Salvaguarda de DES pra sofrer metade do dano: se passar, não sofre dano; se falhar, sofre só metade.",
    },
  ]),
  ...celula(PERITO, OBSERVACAO, OLHO, [
    {
      chave: "ver-o-futuro",
      coluna: 0,
      linha: 0,
      nome: "Ver o Futuro",
      custo: 5,
      maxRanks: 1,
      requisitos: [req("premonicao"), req("vidente", 3)],
      descricao:
        "Quando falhar numa Salvaguarda ou errar um ataque, pode escolher ter sucesso. 3× por descanso longo.",
    },
    {
      chave: "previsao-especial",
      coluna: 2,
      linha: 0,
      nome: "Previsão Especial",
      custo: 5,
      maxRanks: 1,
      requisitos: [
        req("previsao-sobrenatural"),
        req("percepcao-agil"),
        req("identificar-emocoes"),
      ],
      descricao:
        "Ao atacar criaturas sem este talento, você ignora as reações que o seu ataque provocaria, e a criatura perde a reação.",
    },
    {
      chave: "antevisao-especial",
      coluna: 3,
      linha: 0,
      nome: "Antevisão Especial",
      custo: 5,
      maxRanks: 1,
      requisitos: [req("antevisao-sobrenatural"), req("antecipacao")],
      descricao:
        "Criaturas sem este talento atacam você com desvantagem, e você tem vantagem nas Salvaguardas de DES contra elas.",
    },
  ]),

  // ─ Armamento ─
  ...celula(INEXPERIENTE, ARMAMENTO, PUNHO, [
    {
      chave: "ataque-infuso",
      coluna: 0,
      linha: 0,
      nome: "Ataque Infuso",
      custo: 1,
      maxRanks: 3,
      requisitos: [],
      descricao:
        "Seus ataques e técnicas corpo a corpo desarmados (Contundente, Cortante ou Perfurante) ignoram resistência e invulnerabilidade de usuários de Akuma no Mi — menos as resistências não sobrenaturais de Zoan.\n✩ Vale também pra armas corpo a corpo.\n★ Vale também pra ataques à distância com projéteis.",
    },
    {
      chave: "fortalecimento",
      coluna: 0,
      linha: 1,
      nome: "Fortalecimento",
      custo: 1,
      maxRanks: 1,
      requisitos: [req("ataque-infuso")],
      descricao:
        "Suas técnicas com dano Contundente, Cortante ou Perfurante somam o modificador de VON ao dano (metade, se tiverem vários alvos).",
    },
    {
      chave: "endurecimento-ofensivo",
      coluna: 0,
      linha: 2,
      nome: "Endurecimento Ofensivo",
      custo: 2,
      maxRanks: 3,
      requisitos: [req("ataque-infuso"), req("fortalecimento")],
      descricao: "+1 de dano nos ataques Contundentes, Cortantes ou Perfurantes.\n✩ +1d4.\n★ +1d6.",
    },
    {
      chave: "potencializacao",
      coluna: 1,
      linha: 2,
      nome: "Potencialização",
      custo: 3,
      maxRanks: 1,
      requisitos: [req("fortalecimento")],
      descricao:
        "Numa técnica de combate instantânea com dano Contundente, Cortante ou Perfurante, soma dados de dano (ou de redução) iguais ao grau da técnica — técnica de 2º grau com 5d8 ganha +2d8. Não soma com Técnicas Potencializadas das Akuma no Mi.",
    },
    {
      chave: "endurecimento-defensivo",
      coluna: 2,
      linha: 0,
      nome: "Endurecimento Defensivo",
      custo: 2,
      maxRanks: 3,
      requisitos: [],
      descricao:
        "Ganha 20 PV temporários até o fim da batalha e resistência a dano Contundente, Cortante e Perfurante enquanto eles durarem. Recupera depois de 10 minutos de descanso sem usar Haki do Armamento.\n✩ 40 PV temporários.\n★ 60 PV temporários.",
    },
  ]),
  ...celula(TREINADO, ARMAMENTO, PUNHO, [
    {
      chave: "emissao-de-haki",
      coluna: 0,
      linha: 0,
      nome: "Emissão de Haki",
      custo: 3,
      maxRanks: 1,
      requisitos: [req("ataque-infuso", 2), req("endurecimento-ofensivo", 2)],
      descricao:
        "+1,5 m de alcance corpo a corpo. Um resultado de 15 a 19 no dado de ataque (sem ser crítico) causa dano máximo — dos danos extras, só o do Endurecimento Ofensivo entra no máximo.",
    },
    {
      chave: "haki-igneo",
      coluna: 1,
      linha: 0,
      nome: "Haki Ígneo",
      custo: 2,
      maxRanks: 1,
      requisitos: [req("endurecimento-ofensivo", 2), req("potencializacao")],
      descricao:
        "O dano extra do Fortalecimento e da Potencialização vira dano de Fogo, e a Potencialização ganha +1 dado de Fogo.",
    },
    {
      chave: "emissao-defensiva",
      coluna: 1,
      linha: 1,
      nome: "Emissão Defensiva",
      custo: 2,
      maxRanks: 1,
      requisitos: [req("endurecimento-defensivo", 2), req("emissao-de-haki")],
      descricao:
        "Como reação ao ser alvo, cria uma barreira que protege você e um cone de 6 m atrás de você de todo o dano. 1× por descanso curto ou longo.",
    },
    {
      chave: "escudo-de-vontade",
      coluna: 2,
      linha: 0,
      nome: "Escudo de Vontade",
      custo: 3,
      maxRanks: 3,
      requisitos: [req("endurecimento-defensivo", 2)],
      descricao:
        "Com uma ação, faça uma Salvaguarda de VON CD 21 pra desfazer uma habilidade ou efeito de Akuma no Mi que esteja afetando seu corpo (menos dano puro).\n✩ Sem efeito novo.\n★ A CD cai pra 18.",
    },
    {
      chave: "defesa-suprema",
      coluna: 2,
      linha: 1,
      nome: "Defesa Suprema",
      custo: 3,
      maxRanks: 1,
      requisitos: [req("endurecimento-defensivo", 2)],
      descricao:
        "Ao sofrer dano, gaste 2 PP como reação pra manter sua resistência ou invulnerabilidade contra aquele ataque ou técnica (menos dano Verdadeiro).",
    },
  ]),
  ...celula(PERITO, ARMAMENTO, PUNHO, [
    {
      chave: "destruicao-interna",
      coluna: 0,
      linha: 0,
      nome: "Destruição Interna",
      custo: 5,
      maxRanks: 1,
      requisitos: [req("emissao-de-haki")],
      descricao:
        "Seus ataques e técnicas com dano Contundente, Cortante ou Perfurante passam a causar dano Verdadeiro.",
    },
    {
      chave: "escudo-agil",
      coluna: 1,
      linha: 0,
      nome: "Escudo Ágil",
      custo: 5,
      maxRanks: 1,
      requisitos: [req("escudo-de-vontade", 3)],
      descricao: "Pode usar o Escudo de Vontade como reação, gastando 2 PP; a CD do teste vira 16.",
    },
    {
      chave: "armadura-suprema",
      coluna: 2,
      linha: 0,
      nome: "Armadura Suprema",
      custo: 5,
      maxRanks: 1,
      requisitos: [req("endurecimento-defensivo", 3), req("defesa-suprema")],
      descricao:
        "Quem acerta você com ataque corpo a corpo sem ter Emissão de Haki sofre 1d10 de dano Contundente. Enquanto usa o Haki do Armamento, você é imune a acerto crítico (recebe o dano normal).",
    },
  ]),

  // ─ Rei ─
  ...celula(INEXPERIENTE, REI, COROA, [
    {
      chave: "rei",
      coluna: 0,
      linha: 0,
      nome: "Rei",
      custo: 0,
      maxRanks: 1,
      requisitos: [],
      descricao:
        "Vem de graça pra quem tem Haki do Rei.\n• Presença Real: sob estresse, solta uma onda involuntária a 9 m que desmaia ou amedronta inimigos.\n• Carisma do Conquistador: o limite de VON vira 26.\n• Ambição Crescente: +1 PA nos níveis 12, 14, 16 e 18.\n• Espírito Selvagem: vantagem nas Salvaguardas de VON contra animais; animais com VON menor que a sua têm desvantagem contra sua Intimidação (menos lendários e abissais).\nDesmaiar inimigos: quem tem VON menor que a sua faz uma Salvaguarda de VON contra a CD do seu Haki; se falhar, fica Inconsciente por até 5 minutos (acorda com dano ou sacudido). Imunes: VON igual ou maior que a sua ou 18+, imunes a Amedrontado, com ações lendárias ou com Haki do Rei. Se preferir só amedrontar, vale contra VON até 20+.",
    },
  ]),
  ...celula(TREINADO, REI, COROA, [
    {
      chave: "autoridade-do-rei",
      coluna: 0,
      linha: 0,
      nome: "Autoridade do Rei",
      custo: 3,
      maxRanks: 3,
      requisitos: [req("rei")],
      descricao: "Com uma ação, amedronta ou desmaia 1 criatura.\n✩ Sem efeito novo.\n★ Usa com ação bônus.",
    },
    {
      chave: "soberania-do-rei",
      coluna: 0,
      linha: 1,
      nome: "Soberania do Rei",
      custo: 3,
      maxRanks: 3,
      requisitos: [req("autoridade-do-rei")],
      descricao:
        "Com uma ação, amedronta ou desmaia todas as criaturas que você escolher a até 15 m. Quem passa na Salvaguarda, mas pode ser desmaiado, se move como em terreno difícil dentro da aura.\n✩ Sem efeito novo.\n★ +60 m de alcance.",
    },
    {
      chave: "imposicao-do-rei",
      coluna: 0,
      linha: 2,
      nome: "Imposição do Rei",
      custo: 3,
      maxRanks: 3,
      requisitos: [req("soberania-do-rei")],
      descricao:
        "Uma jogada de ataque que acerta derrota na hora criaturas de ND 2 ou menos que podem ser desmaiadas: caem a 0 PV e se recuperam depois de 1 hora.\n✩ Sem efeito novo.\n★ O ND máximo vira 5.",
    },
    {
      chave: "vontade-do-rei",
      coluna: 1,
      linha: 0,
      nome: "Vontade do Rei",
      custo: 3,
      maxRanks: 3,
      requisitos: [req("rei")],
      descricao:
        "Ao cair inconsciente com 0 PV, depois de 2 turnos pode recuperar todos os PV e metade do PP e voltar. Passados 2 minutos, fica com Exaustão nível 5 (recupera 1 nível por vez, e o descanso longo leva o dobro).\n✩ Sem efeito novo.\n★ O descanso longo volta ao tempo normal.",
    },
    {
      chave: "espirito-vigoroso",
      coluna: 1,
      linha: 1,
      nome: "Espírito Vigoroso",
      custo: 3,
      maxRanks: 3,
      requisitos: [req("rei")],
      descricao:
        "Gaste PA que ainda não foram aplicados em talentos pra recuperar 10 PV por PA.\n✩ Sem efeito novo.\n★ 20 PV por PA.",
    },
  ]),
  ...celula(PERITO, REI, COROA, [
    {
      chave: "presenca-esmagadora",
      coluna: 0,
      linha: 0,
      nome: "Presença Esmagadora",
      custo: 5,
      maxRanks: 1,
      requisitos: [req("imposicao-do-rei", 2)],
      descricao:
        "Criatura hostil sem Haki do Rei que comece o turno a até 3 m de você faz uma Salvaguarda de VON; se falhar, sofre 2d6 de dano Psíquico.",
    },
    {
      chave: "armamento-do-rei",
      coluna: 1,
      linha: 1,
      nome: "Armamento do Rei",
      custo: 5,
      maxRanks: 1,
      requisitos: [req("destruicao-interna")],
      descricao:
        "Uma vez por turno, gaste 2 PP pra transformar um ataque em acerto crítico automático com dano máximo (nas regras da Emissão de Haki).",
    },
    {
      chave: "emissao-de-autoridade",
      coluna: 0,
      linha: 1,
      nome: "Emissão de Autoridade",
      custo: 5,
      maxRanks: 1,
      requisitos: [req("ver-o-futuro")],
      descricao:
        "Com uma ação, escolha uma criatura a até 120 m (que você veja ou sinta com o Haki da Observação); ela faz uma Salvaguarda de VON CD 18. Se passar, tem desvantagem numa jogada à sua escolha. Se falhar, no próximo turno dela perde o deslocamento e só faz uma coisa: ação, Ação Poderosa, ação bônus ou reação.",
    },
  ]),
];

export const TALENTOS_POR_MOLDE: Record<string, TalentoMolde[]> = {
  haki: TALENTOS_HAKI,
};

/** Talentos do molde com ids novos, prontos pro createMany. */
export function nosDoMolde(
  slug: string,
  ids: { arvoreId: string; camadaIds: string[]; ramoIds: string[] },
  novoId: () => string,
) {
  const talentos = TALENTOS_POR_MOLDE[slug] ?? [];
  const idPorChave = new Map(talentos.map((t) => [t.chave, novoId()]));
  return talentos.map((t, ordem) => ({
    id: idPorChave.get(t.chave)!,
    arvoreId: ids.arvoreId,
    camadaId: ids.camadaIds[t.camada],
    ramoId: ids.ramoIds[t.ramo] ?? null,
    coluna: t.coluna,
    linha: t.linha,
    nome: t.nome,
    descricao: t.descricao,
    icone: t.icone,
    custo: t.custo,
    maxRanks: t.maxRanks,
    rankAtual: 0,
    nivelMinimo: 0,
    habilidadeId: null,
    requisitos: t.requisitos.map(
      (r): RequisitoNo => ({ noId: idPorChave.get(r.chave)!, rank: r.rank }),
    ),
    ordem,
  }));
}
