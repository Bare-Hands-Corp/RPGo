"use server";

import { randomInt, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { ErroDeUso, executar } from "@/lib/acoes";
import {
  ATRIBUTOS,
  META_EFEITOS,
  PERICIAS,
  atributosEfetivos,
  comCustosResolvidos,
  comDura,
  computarDeltasInstantaneos,
  crescerPorTurno,
  curasComFormula,
  custoDaAcao,
  efeitoInstantaneo,
  extrasDeCura,
  efeitosDaTecnica,
  agregarEfeitos,
  fatorDeDano,
  lerEfeitos,
  lerAlvoAcao,
  comoDura,
  efeitoNoAliado,
  efeitosNoInimigo,
  rolagensDoPedaco,
  maximoDoRecurso,
  modificador,
  lerProficiencias,
  motivoSemSobrecarga,
  acoesGanhasNoUso,
  formatarMod,
  normalizarEfeito,
  poolsEfetivos,
  resolverFormula,
  slugPericiaCustom,
  usosMaximos,
  type Atributo,
  type DeltasInstantaneos,
  type EfeitoHabilidade,
  type ExtraDeCura,
  type EfeitosAgregados,
  type PericiaSlug,
  type TipoEfeito,
} from "@/lib/op-rpg";
import { faixaDaRolagem } from "@/lib/dice";
import { SELECT_ACAO_QUE_DURA, acabaComOPvTemp, carregarAgregado } from "@/lib/efeitos-servidor";
import { aplicarColaterais, colateraisDaConcentracao, colateraisDoFim } from "@/lib/colaterais-servidor";
import {
  bloqueioDe,
  lerBloqueios,
  passarRodadaDosBloqueios,
  tempoDoBloqueio,
  textoDoBloqueio,
} from "@/lib/colaterais";
import {
  MAX_TIPOS_SALVOS,
  cdConcentracao,
  defesasDoAgregado,
  descreverParte,
  juntarTipos,
  lerTiposSalvos,
  mesmoTipo,
  negativosAtuais,
  resolverDano,
  separarPv,
  type ParteDano,
} from "@/lib/dano";
import {
  acabaSemPvTemp,
  duracaoPvTempNoBanco,
  lerConcentracao,
  lerDuracao,
  pedeConcentracao,
  turnosDaDuracao,
  type Concentracao,
} from "@/lib/duracao";
import {
  acoesEmCurso,
  aplicarTurno,
  concentracaoEmCurso,
  duracoesDasAcoes,
  duracoesEmCurso,
  ficaEmCurso,
  porTurnoDasAcoes,
  turnosDaAcao,
  validarRolagensTurno,
} from "@/lib/turno";
import { serializarMensagem } from "@/lib/mensagens";
import {
  MAX_MODELOS,
  doModelo,
  nomeDePasta,
  paraModelo,
  type ModeloView,
  type TipoModelo,
} from "@/lib/pastas";
import {
  MAX_ARVORES_PACOTE,
  MAX_ITENS_PACOTE,
  MAX_NOME_PACOTE,
  MAX_NOS_ARVORE,
  MAX_PACOTES,
  contarPacote,
  lerCodigo,
  lerPacote,
  montarPacote,
  nomeDoPacote,
  novoCodigo,
  planejarImportacao,
  type PacoteView,
} from "@/lib/pacote";
import {
  BOLAS_POR_CANHAO,
  BOLA_DE_CHUMBO,
  acaoDosCanhoes,
  armaDosCanhoes,
  DANO_ANCORA,
  DANO_PRA_SOLTAR_ANCORA,
  MANOBRA_GRAUS,
  MANOBRA_NOS,
  NOS_PRA_COLIDIR,
  danoDeColisao,
  lerEstadoNavio,
  lerMontagem,
  lerNavio,
  metrosPorRodada,
  presetDeNavio,
  textoRumo,
  velocidadeComDano,
  type MontagemNavio,
} from "@/lib/navio";
import { INCLUDE_ACESSO, SO_PRINCIPAIS, acessoAFicha, mesmoGrupo, sessaoDoChat } from "@/lib/acesso-ficha";
import {
  MAX_COPIAS,
  MAX_NOME_SUBFICHA,
  MAX_SUBFICHAS,
  MAX_SUBFICHAS_DA_MESA,
  PERFIS_DE_SUBFICHA,
  ehSubficha,
  lerAbas,
  nomesDasCopias,
  perfilDe,
} from "@/lib/subficha";
import { carregarParaCopia, copiarFicha, opsDeCopia, semLinhas } from "@/lib/clonar-ficha";
import {
  corValida,
  normalizarEfeitoCor,
  normalizarEstilosTag,
  separarTags,
} from "@/lib/estilos-cor";
import {
  NIVEL_MAXIMO,
  PP_POR_NIVEL,
  clampGanhoPv,
  pvRetroativoPorCon,
  tetoGanhoPv,
  tetosNoNivel,
  validarAprimoramento,
  type Aprimoramento,
} from "@/lib/nivel";
import {
  dadosVidaRecuperados,
  facesDadoVida,
  ppDoDescansoLongo,
  recuperaNoDescanso,
  type ResumoDescanso,
  type TipoDescanso,
} from "@/lib/descanso";
import {
  MAX_RANKS_TETO,
  bloqueiosDevolver,
  estadoNo,
  lerRequisitos,
  acharPreset,
  clampColuna,
  clampLinha,
  noNaCelula,
  normalizarCriterio,
  primeiraLinhaLivre,
  raiaEfetiva,
  type ContextoArvore,
  type NoArvore,
  type RequisitoNo,
} from "@/lib/arvore";
import { nosDoMolde } from "@/lib/moldes-arvore";
import {
  ACAO_COMBATE,
  TEXTO_RESULTADO,
  ehAcaoDeCombate,
  gatilhoCabe,
  comAcoesGanhas,
  lerAcoesGastas,
  lerDanosExtras,
  lerGatilho,
  maximoDeAcoes,
  resultadoDaSalvaguarda,
  resultadoDoAtaque,
  sofreDano,
  textoDaSalvaguarda,
  type AcoesGastas,
  type AlvoResolucao,
  type OpcaoReacao,
  type ReacaoUsada,
  type Resolucao,
  type TipoAcaoCombate,
} from "@/lib/combate";
import { crComReacao, efeitosDaReacao, resumoDaReacao, type EfeitoDeReacao } from "@/lib/reacoes";
import { inferirAlcance, lerResolucoes, ordenarParticipantes } from "@/lib/combate";
import { tipoDominante } from "@/lib/estatisticas-combate";
import {
  registrarAtaques,
  registrarCura,
  registrarCuraEmPersonagem,
  registrarDano,
  registrarDanoEmPersonagem,
  registrarPp,
  registrarPpDePersonagem,
} from "@/lib/estatisticas-servidor";
import {
  aplicarCondicoes,
  aplicarCondicoesNoPersonagem,
  tirarCondicaoDoPersonagem,
  avancarTurnoDoCombate,
  bonusDePericiaDaCriatura,
  bonusDeSalvaguardaDaCriatura,
  gastarCondicoes,
  tirarCondicao,
  crDoPersonagem,
  mudarResolucoes,
  participacaoEmCombate,
  removerCondicoesPorEfeito,
  type DanoPeriodico,
} from "@/lib/combate-servidor";
import { defesasDaCriatura } from "@/lib/dano";
import {
  RODADAS_MAX,
  lerCondicoesAtivas,
  passarRodadaNaFicha,
  lerRodadas,
  textoRodadas,
  type CondicaoAplicada,
  type CondicaoAtiva,
} from "@/lib/condicoes";
import {
  condicoesDosEfeitos,
  fontesDasCondicoes,
  lerMecanica,
  mecanicaDa,
  modoDaSalvaguarda,
  bonusDasCondicoesNaCriatura,
  modoDoAtaque,
  travaDaCondicaoNaAcao,
  travasDasCondicoes,
  viraCritico,
} from "@/lib/condicoes-mecanica";
import {
  CHAVE_LENDARIAS,
  comoResistencias,
  efeitosDeReacaoDaCriatura,
  gastosDaAcao,
  margemDeCritico,
  serializarCriatura,
} from "@/app/bestiario/utils";
import { lerUsosAcoes } from "@/app/narrador/[mesaId]/sessao/utils";
import { parseFormulaDados, rolarD20Contextual, rolarDados } from "@/lib/dice";

// ─── Auth helper interno ───────────────────────────────────
// Verifica sessão + acesso (lib/acesso-ficha.ts) e retorna o personagem com a
// mesa e o dono. Auth (Supabase) e personagem (Postgres) rodam em paralelo —
// checagem de ownership é feita depois que as duas resolvem.
async function autorizar(personagemId: string) {
  const [user, personagem] = await Promise.all([
    usuarioDaRequest(),
    prisma.personagem.findUnique({
      where: { id: personagemId },
      include: INCLUDE_ACESSO,
    }),
  ]);
  if (!user) throw new ErroDeUso("Não autenticado.");
  if (!personagem) throw new ErroDeUso("Personagem não encontrado.");
  if (!(await acessoAFicha(personagem, user.id))) throw new ErroDeUso("Acesso negado.");

  return { user, personagem };
}

// ─── Personagem ────────────────────────────────────────────
const ALLOWED_PERSONAGEM = [
  "nome",
  "nivel",
  "pe",
  "hpAtual",
  "hpMax",
  "hpTemp",
  "ppAtual",
  "ppMax",
  "exaustao",
  "cargaMaxima",
  "ultimaRolagem",
  "fotoUrl",
  "forca",
  "destreza",
  "constituicao",
  "sabedoria",
  "vontade",
  "presenca",
  "berries",
  "tipoDadoVida",
  "dadosVidaGastos",
  "crOutros",
  "deslocamento",
  "nado",
  "atributoCdTecnicas",
] as const;

type PersonagemPatch = Partial<
  Record<(typeof ALLOWED_PERSONAGEM)[number], unknown>
>;

export async function patchPersonagem(
  personagemId: string,
  patch: PersonagemPatch,
) {
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);

    const data: Record<string, unknown> = {};
    for (const key of ALLOWED_PERSONAGEM) {
      if (patch[key] !== undefined) data[key] = patch[key];
    }
    if (data.nome !== undefined) {
      const nome = String(data.nome).trim().slice(0, 80);
      if (!nome) throw new ErroDeUso("Nome é obrigatório.");
      data.nome = nome;
    }
    if (data.atributoCdTecnicas !== undefined) {
      const v = data.atributoCdTecnicas ? String(data.atributoCdTecnicas) : null;
      if (v && !ATRIBUTOS_VALIDOS.has(v as Atributo)) throw new ErroDeUso("Atributo inválido.");
      data.atributoCdTecnicas = v;
    }
    // PV editado à mão: abaixo de 0 vira PV negativo; de 0 pra cima, os negativos zeram.
    if (data.hpAtual !== undefined) Object.assign(data, separarPv(Number(data.hpAtual)));
    // PV temporário mexido à mão dura até acabar.
    if (data.hpTemp !== undefined) data.hpTempDuracao = null;
    // 0 PV ou exaustão 6 incapacitam: a concentração acaba.
    const incapacitou =
      (data.hpAtual !== undefined && Number(data.hpAtual) <= 0) ||
      (data.exaustao !== undefined && Number(data.exaustao) >= 6);
    // PV temporário zerado à mão: acaba o que durava enquanto ele durasse.
    const semPvTemp =
      data.hpTemp !== undefined && Number(data.hpTemp) <= 0 && personagem.hpTemp > 0;
    const fim = semPvTemp ? await acabaComOPvTemp(personagemId, personagem.concentracao) : null;

    await prisma.$transaction([
      prisma.personagem.update({
        where: { id: personagemId },
        data,
      }),
      ...(fim?.ops ?? []),
      ...(incapacitou || fim?.soltaConcentracao
        ? opsConcentracao(personagemId, personagem.concentracao, null)
        : []),
    ]);
    // O que acabou (concentração, ações que duravam com o PV temporário): colaterais "no fim".
    if (incapacitou || fim?.soltaConcentracao) await colateraisDaConcentracao(personagemId, personagem.concentracao);
    await colateraisDoFim(personagemId, (fim?.acoes ?? []).map((a) => a.id));
    revalidarFicha(personagem);
  });
}

// Revalida a ficha e quem mostra o card dela: o dono ou, se for da mesa, todo membro.
function revalidarFicha(p: {
  id: string;
  donoPersonagemId: string | null;
  donoMesaId: string | null;
}) {
  if (p.donoMesaId) return revalidatePath("/ficha/[uid]", "page");
  revalidatePath(`/ficha/${p.id}`);
  if (p.donoPersonagemId) revalidatePath(`/ficha/${p.donoPersonagemId}`);
}

// Campo que aceita fórmula sem dados ("PROF", "NIVEL/2"): só número vira null.
function formulaOuNulo(v: unknown): string | null {
  const f = v ? String(v).trim() : "";
  return f && !Number.isFinite(Number(f)) ? f.slice(0, 60) : null;
}

// Usos limitados (ação e habilidade): máximo, o que sobrou, fórmula do máximo e recarga.
function normalizarUsosInput(
  input: Partial<Record<"usos" | "usosAtual" | "usosFormula" | "recarga", unknown>>,
  data: Record<string, unknown>,
) {
  if (input.usos !== undefined) {
    if (input.usos === null || input.usos === "") {
      data.usos = null;
      data.usosAtual = null;
    } else {
      const n = Math.max(0, Math.trunc(Number(input.usos) || 0));
      data.usos = n;
      // Se usosAtual não veio explícito, encha o tanque.
      if (input.usosAtual === undefined) data.usosAtual = n;
    }
  }
  if (input.usosAtual !== undefined && data.usosAtual === undefined) {
    if (input.usosAtual === null || input.usosAtual === "") {
      data.usosAtual = null;
    } else {
      data.usosAtual = Math.max(0, Math.trunc(Number(input.usosAtual) || 0));
    }
  }
  if (input.recarga !== undefined) {
    if (!input.recarga) {
      data.recarga = null;
    } else {
      const v = String(input.recarga);
      if (!RECARGAS_VALIDAS_HAB.has(v)) throw new ErroDeUso("Recarga inválida.");
      data.recarga = v;
    }
  }
  if (input.usosFormula !== undefined) data.usosFormula = formulaOuNulo(input.usosFormula);
}

// ─── Ações ─────────────────────────────────────────────────
const ALLOWED_ACAO = [
  "nome",
  "descricao",
  "tipo",
  "gatilho",
  "tag",
  "custoPp",
  "custoPa",
  "custoRecursoId",
  "custoRecursoValor",
  "atributoAtaque",
  "atributoSalv",
  "atributoCd",
  "salvSucesso",
  "danosExtras",
  "dano",
  "alcance",
  "armaIds",
  "itemId",
  "habilidadeIds",
  "tecnica",
  "grau",
  "efeitos",
  "aliado",
  "alvo",
  "bonusAcerto",
  "armaDeFogo",
  "multiataque",
  "duracao",
  "tipoDano",
  "pasta",
  "formaDe",
  "custoPpFormula",
  "custoRecursoFormula",
  "usos",
  "usosAtual",
  "usosFormula",
  "recarga",
] as const;

type AcaoInput = Partial<Record<(typeof ALLOWED_ACAO)[number], unknown>>;

const TIPOS_ACAO_VALIDOS = new Set(["padrao", "bonus", "power", "react", "livre"]);

function normalizarAcaoInput(input: AcaoInput) {
  const data: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = (input.nome as string).trim();
    if (!nome) throw new ErroDeUso("Nome é obrigatório.");
    data.nome = nome;
  }
  if (input.descricao !== undefined) data.descricao = String(input.descricao);
  if (input.tipo !== undefined) {
    const tipo = String(input.tipo);
    if (!TIPOS_ACAO_VALIDOS.has(tipo)) throw new ErroDeUso("Tipo de ação inválido.");
    data.tipo = tipo;
  }
  // Gatilho da reação; "qualquer" (o padrão) fica nulo.
  if (input.gatilho !== undefined) {
    const gatilho = lerGatilho(input.gatilho);
    data.gatilho = gatilho === "qualquer" ? null : gatilho;
  }
  if (input.tag !== undefined) data.tag = String(input.tag);
  if (input.custoPp !== undefined) data.custoPp = Math.max(0, Number(input.custoPp) || 0);
  if (input.custoPa !== undefined) data.custoPa = Math.max(0, Number(input.custoPa) || 0);
  if (input.custoRecursoId !== undefined) {
    data.custoRecursoId = input.custoRecursoId ? String(input.custoRecursoId) : null;
  }
  if (input.custoRecursoValor !== undefined) {
    data.custoRecursoValor = Math.max(0, Number(input.custoRecursoValor) || 0);
  }
  if (input.custoPpFormula !== undefined) data.custoPpFormula = formulaOuNulo(input.custoPpFormula);
  if (input.custoRecursoFormula !== undefined) {
    data.custoRecursoFormula = formulaOuNulo(input.custoRecursoFormula);
  }
  normalizarUsosInput(input, data);
  for (const k of ["atributoAtaque", "atributoSalv", "atributoCd"] as const) {
    if (input[k] !== undefined) {
      const v = input[k] ? String(input[k]) : null;
      if (v && !ATRIBUTOS_VALIDOS.has(v as Atributo)) {
        throw new ErroDeUso(`Atributo inválido em ${k}.`);
      }
      data[k] = v;
    }
  }
  if (input.bonusAcerto !== undefined) data.bonusAcerto = formulaOuNulo(input.bonusAcerto);
  if (input.salvSucesso !== undefined) data.salvSucesso = input.salvSucesso === "metade" ? "metade" : "nada";
  if (input.danosExtras !== undefined) data.danosExtras = lerDanosExtras(input.danosExtras);
  if (input.dano !== undefined) data.dano = input.dano ? String(input.dano) : null;
  if (input.pasta !== undefined) data.pasta = nomeDePasta(input.pasta) || null;
  if (input.tipoDano !== undefined) {
    data.tipoDano = input.tipoDano ? String(input.tipoDano).trim().slice(0, 40) || null : null;
  }
  if (input.alcance !== undefined) data.alcance = input.alcance ? String(input.alcance) : null;
  // Refs soltas a Item e Habilidade (sem checar ownership).
  if (input.armaIds !== undefined) data.armaIds = normalizarIds(input.armaIds);
  if (input.habilidadeIds !== undefined) {
    data.habilidadeIds = normalizarIds(input.habilidadeIds);
  }
  // Item que concede a ação.
  if (input.itemId !== undefined) data.itemId = input.itemId ? String(input.itemId) : null;
  if (input.tecnica !== undefined) data.tecnica = Boolean(input.tecnica);
  if (input.grau !== undefined) {
    data.grau = Math.min(7, Math.max(0, Math.trunc(Number(input.grau) || 0)));
  }
  if (input.efeitos !== undefined) data.efeitos = normalizarEfeitosInput(input.efeitos);
  if (input.alvo !== undefined) data.alvo = lerAlvoAcao({ alvo: input.alvo });
  // Ação inteira "em aliado" é de antes do `quem` por efeito; só lido em ação antiga.
  if (input.aliado !== undefined) data.aliado = Boolean(input.aliado);
  if (input.armaDeFogo !== undefined) data.armaDeFogo = input.armaDeFogo === true;
  if (input.multiataque !== undefined) data.multiataque = input.multiataque === true;
  if (input.duracao !== undefined) data.duracao = lerDuracao(input.duracao) ?? Prisma.DbNull;
  if (input.formaDe !== undefined) data.formaDe = input.formaDe ? String(input.formaDe) : null;
  return data;
}

// Forma alternativa: a origem tem que ser outra do personagem, e nunca outra forma.
async function conferirForma(
  tipo: TipoModelo,
  personagemId: string,
  data: Record<string, unknown>,
  proprioId?: string,
) {
  if (!data.formaDe) return;
  const consulta = {
    where: { id: data.formaDe as string, personagemId },
    select: { id: true, formaDe: true },
  };
  const origem =
    tipo === "acao"
      ? await prisma.acao.findFirst(consulta)
      : await prisma.habilidade.findFirst(consulta);
  const raiz = origem?.formaDe ?? origem?.id ?? null;
  data.formaDe = raiz && raiz !== proprioId ? raiz : null;
}

// Lista de ids: só strings não-vazias, sem repetição, com teto defensivo.
function normalizarIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= 20) break;
  }
  return out;
}

// Linha de `acoes` a partir do input já normalizado.
function dadosDaAcao(personagemId: string, data: Record<string, unknown>) {
  return {
    personagemId,
    nome: data.nome as string,
    descricao: (data.descricao as string) ?? "",
    tipo: (data.tipo as string) ?? "padrao",
    gatilho: (data.gatilho as string | null) ?? null,
    tag: (data.tag as string) ?? "",
    custoPp: (data.custoPp as number) ?? 0,
    custoPa: (data.custoPa as number) ?? 0,
    custoRecursoId: (data.custoRecursoId as string | null) ?? null,
    custoRecursoValor: (data.custoRecursoValor as number) ?? 0,
    custoPpFormula: (data.custoPpFormula as string | null) ?? null,
    custoRecursoFormula: (data.custoRecursoFormula as string | null) ?? null,
    usos: (data.usos as number | null) ?? null,
    usosAtual: (data.usosAtual as number | null) ?? null,
    usosFormula: (data.usosFormula as string | null) ?? null,
    recarga: (data.recarga as string | null) ?? null,
    atributoAtaque: (data.atributoAtaque as string | null) ?? null,
    bonusAcerto: (data.bonusAcerto as string | null) ?? null,
    atributoSalv: (data.atributoSalv as string | null) ?? null,
    atributoCd: (data.atributoCd as string | null) ?? null,
    salvSucesso: (data.salvSucesso as string) ?? "nada",
    danosExtras: (data.danosExtras as Prisma.InputJsonValue) ?? [],
    dano: (data.dano as string | null) ?? null,
    tipoDano: (data.tipoDano as string | null) ?? null,
    pasta: (data.pasta as string | null) ?? null,
    alcance: (data.alcance as string | null) ?? null,
    armaIds: (data.armaIds as string[]) ?? [],
    itemId: (data.itemId as string | null) ?? null,
    habilidadeIds: (data.habilidadeIds as string[]) ?? [],
    tecnica: (data.tecnica as boolean) ?? false,
    grau: (data.grau as number) ?? 0,
    efeitos: (data.efeitos as EfeitoHabilidade[]) ?? [],
    aliado: (data.aliado as boolean) ?? false,
    alvo: (data.alvo as string) ?? "nenhum",
    armaDeFogo: (data.armaDeFogo as boolean) ?? false,
    multiataque: (data.multiataque as boolean) ?? false,
    duracao: (data.duracao as Prisma.InputJsonValue | typeof Prisma.DbNull) ?? Prisma.DbNull,
    ...(data.formaDe ? { formaDe: data.formaDe as string } : {}),
  };
}

export async function criarAcao(personagemId: string, input: AcaoInput) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarAcaoInput(input);
    if (data.nome === undefined) throw new ErroDeUso("Nome é obrigatório.");
    await conferirForma("acao", personagemId, data);

    await prisma.acao.create({ data: dadosDaAcao(personagemId, data) });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function atualizarAcao(
  personagemId: string,
  acaoId: string,
  patch: AcaoInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarAcaoInput(patch);
    await conferirForma("acao", personagemId, data, acaoId);
    // Editada sem nada que siga depois do uso: deixa de estar em curso.
    if (data.efeitos !== undefined && data.duracao !== undefined && data.aliado !== undefined) {
      const segue = ficaEmCurso({
        efeitos: data.efeitos,
        duracao: data.duracao === Prisma.DbNull ? null : data.duracao,
        aliado: data.aliado as boolean,
      });
      if (!segue) Object.assign(data, { emCurso: false, turnosRestantes: null });
    }
    await prisma.acao.update({
      where: { id: acaoId, personagemId },
      data,
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// Grava a ordem arrastada: `itens` é a lista toda na ordem nova, cada ação com
// o tipo que passou a ter. A posição é o lugar dentro do tipo (1, 2, 3…). Quem
// mudou de tipo leva as formas alternativas que tinham o tipo antigo; sair de
// Reação solta o gatilho.
export async function reordenarAcoes(personagemId: string, itens: { id: string; tipo: string }[]) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    if (!Array.isArray(itens) || itens.length > 500) throw new ErroDeUso("Lista de ações inválida.");
    const ids = itens.map((i) => i.id);
    if (new Set(ids).size !== ids.length) throw new ErroDeUso("Lista de ações inválida.");
    if (itens.some((i) => !TIPOS_ACAO_VALIDOS.has(i.tipo))) throw new ErroDeUso("Tipo de ação inválido.");

    const atuais = new Map(
      (await prisma.acao.findMany({ where: { personagemId, id: { in: ids } }, select: { id: true, tipo: true, ordem: true } })).map(
        (a) => [a.id, a],
      ),
    );
    if (atuais.size !== ids.length) throw new ErroDeUso("Ação não encontrada.");

    // Um UPDATE só (e não um por ação): o banco é remoto e dezenas de idas e
    // voltas estouravam o tempo da transação.
    const porTipo = new Map<string, number>();
    const mudou = { ids: [] as string[], ordens: [] as number[], tipos: [] as string[] };
    const formas = { ids: [] as string[], antigos: [] as string[], novos: [] as string[] };
    for (const { id, tipo } of itens) {
      const ordem = (porTipo.get(tipo) ?? 0) + 1;
      porTipo.set(tipo, ordem);
      const atual = atuais.get(id)!;
      if (atual.tipo === tipo && atual.ordem === ordem) continue;
      mudou.ids.push(id);
      mudou.ordens.push(ordem);
      mudou.tipos.push(tipo);
      if (atual.tipo !== tipo) {
        formas.ids.push(id);
        formas.antigos.push(atual.tipo);
        formas.novos.push(tipo);
      }
    }
    if (mudou.ids.length > 0) {
      await prisma.$transaction([
        prisma.$executeRaw`
          UPDATE acoes SET ordem = v.ordem, tipo = v.tipo,
            gatilho = CASE WHEN v.tipo <> 'react' AND acoes.tipo <> v.tipo THEN NULL ELSE acoes.gatilho END
          FROM (SELECT unnest(${mudou.ids}::text[]) AS id, unnest(${mudou.ordens}::int[]) AS ordem,
                       unnest(${mudou.tipos}::text[]) AS tipo) v
          WHERE acoes.id::text = v.id AND acoes.personagem_id::text = ${personagemId}`,
        prisma.$executeRaw`
          UPDATE acoes SET tipo = v.novo, gatilho = CASE WHEN v.novo <> 'react' THEN NULL ELSE acoes.gatilho END
          FROM (SELECT unnest(${formas.ids}::text[]) AS id, unnest(${formas.antigos}::text[]) AS antigo,
                       unnest(${formas.novos}::text[]) AS novo) v
          WHERE acoes.forma_de::text = v.id AND acoes.tipo = v.antigo AND acoes.personagem_id::text = ${personagemId}`,
      ]);
    }
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// Grava a ordem arrastada das habilidades: `itens` é a lista toda na ordem
// nova, cada uma com a origem que passou a ter. A posição é o lugar dentro da
// origem (1, 2, 3…). Quem mudou de origem leva as formas alternativas que
// tinham a origem antiga.
export async function reordenarHabilidades(personagemId: string, itens: { id: string; origem: string }[]) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    if (!Array.isArray(itens) || itens.length > 500) throw new ErroDeUso("Lista de habilidades inválida.");
    const ids = itens.map((i) => i.id);
    if (new Set(ids).size !== ids.length) throw new ErroDeUso("Lista de habilidades inválida.");
    if (itens.some((i) => !ORIGENS_HAB_VALIDAS.has(i.origem))) throw new ErroDeUso("Origem inválida.");

    const atuais = new Map(
      (
        await prisma.habilidade.findMany({
          where: { personagemId, id: { in: ids } },
          select: { id: true, origem: true, ordem: true },
        })
      ).map((h) => [h.id, h]),
    );
    if (atuais.size !== ids.length) throw new ErroDeUso("Habilidade não encontrada.");

    // Um UPDATE só (ver reordenarAcoes).
    const porOrigem = new Map<string, number>();
    const mudou = { ids: [] as string[], ordens: [] as number[], origens: [] as string[] };
    const formas = { ids: [] as string[], antigas: [] as string[], novas: [] as string[] };
    for (const { id, origem } of itens) {
      const ordem = (porOrigem.get(origem) ?? 0) + 1;
      porOrigem.set(origem, ordem);
      const atual = atuais.get(id)!;
      if (atual.origem === origem && atual.ordem === ordem) continue;
      mudou.ids.push(id);
      mudou.ordens.push(ordem);
      mudou.origens.push(origem);
      if (atual.origem !== origem) {
        formas.ids.push(id);
        formas.antigas.push(atual.origem);
        formas.novas.push(origem);
      }
    }
    if (mudou.ids.length > 0) {
      await prisma.$transaction([
        prisma.$executeRaw`
          UPDATE habilidades SET ordem = v.ordem, origem = v.origem
          FROM (SELECT unnest(${mudou.ids}::text[]) AS id, unnest(${mudou.ordens}::int[]) AS ordem,
                       unnest(${mudou.origens}::text[]) AS origem) v
          WHERE habilidades.id::text = v.id AND habilidades.personagem_id::text = ${personagemId}`,
        prisma.$executeRaw`
          UPDATE habilidades SET origem = v.nova
          FROM (SELECT unnest(${formas.ids}::text[]) AS id, unnest(${formas.antigas}::text[]) AS antiga,
                       unnest(${formas.novas}::text[]) AS nova) v
          WHERE habilidades.forma_de::text = v.id AND habilidades.origem = v.antiga
            AND habilidades.personagem_id::text = ${personagemId}`,
      ]);
    }
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// Grava a ordem arrastada do inventário: `ids` é a lista toda na ordem nova.
export async function reordenarItens(personagemId: string, ids: string[]) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    if (!Array.isArray(ids) || ids.length > 1000 || new Set(ids).size !== ids.length) {
      throw new ErroDeUso("Lista de itens inválida.");
    }
    const atuais = new Map(
      (await prisma.item.findMany({ where: { personagemId, id: { in: ids } }, select: { id: true, ordem: true } })).map(
        (i) => [i.id, i.ordem],
      ),
    );
    if (atuais.size !== ids.length) throw new ErroDeUso("Item não encontrado.");
    // Um UPDATE só (ver reordenarAcoes).
    const mudou = { ids: [] as string[], ordens: [] as number[] };
    ids.forEach((id, i) => {
      if (atuais.get(id) === i + 1) return;
      mudou.ids.push(id);
      mudou.ordens.push(i + 1);
    });
    if (mudou.ids.length > 0) {
      await prisma.$executeRaw`
        UPDATE itens SET ordem = v.ordem
        FROM (SELECT unnest(${mudou.ids}::text[]) AS id, unnest(${mudou.ordens}::int[]) AS ordem) v
        WHERE itens.id::text = v.id AND itens.personagem_id::text = ${personagemId}`;
    }
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarAcao(personagemId: string, acaoId: string) {
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);
    await prisma.$transaction([
      prisma.acao.delete({ where: { id: acaoId, personagemId } }),
      ...soltarConcentracaoEm(personagemId, personagem.concentracao, acaoId),
    ]);
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// Usa a ação: debita o PP (com desconto) e o recurso de custo e aplica os
// efeitos na hora dela (cura, PV temporário, recurso). Sem PP, técnica de grau
// 1–5 pode ir com Sobrecarga; com `aliado`, os efeitos vão pro aliado escolhido.
export async function usarAcao(
  personagemId: string,
  acaoId: string,
  rolagens?: RolagensCura,
  opcoes?: {
    sobrecarga?: boolean;
    // Aliado de cada efeito que vai pra aliado, pelo índice na lista de efeitos.
    aliados?: Record<number, string>;
    // Em combate: alvos (InstanciaCombate.id), como a ficha vai resolver a
    // ação neles e a CD que ela calculou.
    combate?: { alvos?: string[]; modo?: string; cd?: number | null; corpoACorpo?: boolean };
  },
) {
  return executar("ficha", async () => {
    const [{ personagem }, { agg, itens }, bruta, combate] = await Promise.all([
      autorizar(personagemId),
      carregarAgregado(personagemId),
      prisma.acao.findFirst({ where: { id: acaoId, personagemId } }),
      participacaoEmCombate(personagemId),
    ]);
    if (!bruta) throw new ErroDeUso("Ação não encontrada.");
    // Em combate, a ação gasta uma das ações do turno do tipo dela. Reação
    // vale fora da vez; as outras, só na vez do personagem.
    const tipoAcao = combate && ehAcaoDeCombate(bruta.tipo) ? bruta.tipo : null;
    if (combate && tipoAcao) {
      if (tipoAcao !== "react" && !combate.naVez) throw new ErroDeUso("Não é a sua vez.");
      if (tipoAcao === "react" && combate.naVez) throw new ErroDeUso("Reação é só fora da sua vez.");
      if ((combate.gastas[tipoAcao] ?? 0) >= maximoDeAcoes(agg.acoesExtras, combate.gastas.ganhas)[tipoAcao]) {
        throw new ErroDeUso(`Sem ação ${ACAO_COMBATE[tipoAcao].nome.toLowerCase()} neste turno.`);
      }
      // Incapacitado, Sonolento, Letárgico…
      const pelaCondicao = travaDaCondicaoNaAcao(
        combate.condicoes,
        tipoAcao,
        combate.gastas,
      );
      if (pelaCondicao) throw new ErroDeUso(pelaCondicao);
    }
    // Custo por fórmula vira número com o nível, os atributos e o grau.
    const acao = comCustosResolvidos(bruta, agg.ctxFormula, bruta.grau);
    if (acao.itemId && !itens.some((i) => i.id === acao.itemId && i.equipado)) {
      throw new ErroDeUso("Equipe o item pra usar esta ação.");
    }
    const usosMax = usosMaximos(acao, agg.ctxFormula);
    const usosAtual = acao.usosAtual ?? usosMax;
    if (usosMax != null && (usosAtual ?? 0) <= 0) throw new ErroDeUso("Sem usos restantes.");
    // Com alvo: confere como a ação resolve neles antes de gastar qualquer coisa.
    // Vale pra qualquer tipo de ação, inclusive a Livre (que não gasta ação do turno).
    const pedidos = combate ? opcoes?.combate?.alvos : null;
    const alvos = Array.isArray(pedidos)
      ? pedidos.filter((id): id is string => typeof id === "string" && !!id).slice(0, 12)
      : [];
    const cdDaFicha = Number(opcoes?.combate?.cd) || 0;
    const modoResolucao = alvos.length > 0 ? modoDaResolucao(acao, opcoes?.combate?.modo, cdDaFicha) : null;
    // Condição que se evita com salvaguarda precisa da CD: confere antes de gastar.
    if (
      modoResolucao &&
      cdDaFicha <= 0 &&
      lerEfeitos(acao.efeitos).some(
        (e) => e.tipo === "condicao_aplicar" && e.evita && !(modoResolucao === "salvaguarda" && acao.atributoSalv === e.evita),
      )
    ) {
      throw new ErroDeUso("Escolha a CD das suas técnicas na ficha lateral: a condição pede salvaguarda.");
    }
    const ids = new Set([...normalizarIds(acao.armaIds), ...(acao.itemId ? [acao.itemId] : [])]);
    const armas = itens.filter((i) => ids.has(i.id));
    const aggAcao = efeitosDaTecnica(agg, acao);
    let custoPp = custoDaAcao(aggAcao, armas, "pp", acao.custoPp, acao.grau).final;
    let exaustaoExtra = 0;
    // Colateral de outra técnica: sem PP / sem Haki por um tempo.
    const bloqueios = lerBloqueios(personagem.bloqueios);
    const semPp = custoPp > 0 ? bloqueioDe(bloqueios, "pp") : null;
    if (semPp) throw new ErroDeUso(`${textoDoBloqueio(semPp)}: falta ${tempoDoBloqueio(semPp.rodadas)}.`);
    const semHaki = bloqueioDe(bloqueios, "haki");
    if (semHaki && (await vemDeHaki(personagemId, acao.habilidadeIds))) {
      throw new ErroDeUso(`${textoDoBloqueio(semHaki)}: falta ${tempoDoBloqueio(semHaki.rodadas)}.`);
    }
    if (custoPp > personagem.ppAtual) {
      const motivo = motivoSemSobrecarga(acao, personagem.exaustao);
      if (motivo || !opcoes?.sobrecarga) throw new ErroDeUso(motivo ?? "PP insuficiente.");
      exaustaoExtra = acao.grau;
      custoPp = 0;
    }
    const recurso = await recursoDeCusto(personagemId, acao.custoRecursoId, acao.custoRecursoValor);
    // Cada efeito na hora vai em quem usa ou no aliado escolhido pra ele.
    const todosEfeitos = lerEfeitos(acao.efeitos);
    const aliadoDe = (i: number): string | null =>
      efeitoNoAliado(todosEfeitos[i], acao) ? String(opcoes?.aliados?.[i] ?? "") : null;
    const destinos = todosEfeitos.map((e, i) => ({ e, quem: aliadoDe(i) }));
    const aliados = new Map<string, AliadoDoUso>();
    for (const id of new Set(destinos.flatMap((d) => (d.quem === null ? [] : [d.quem])))) {
      aliados.set(id, await aliadoDoUso(personagem, id));
    }
    // As rolagens vêm pelo índice na lista dos efeitos na hora.
    const instantaneos = destinos.filter((d) => efeitoInstantaneo(d.e));
    const pedaco = (quem: string | null) => {
      const posicoes = instantaneos.flatMap((d, pos) => (d.quem === quem ? [pos] : []));
      return {
        efeitos: posicoes.map((pos) => instantaneos[pos].e),
        rolagens: rolagensDoPedaco(rolagens, posicoes),
      };
    };
    // O que fica valendo no aliado (o mesmo pra todos). No combate vira condição
    // nele, que conta na sua vez e por isso dura até ele jogar; fora, vale
    // enquanto a ação estiver em curso.
    const fica = destinos.filter((d) => d.quem !== null && comoDura(d.e) === "mantem");
    const aliadoFica = fica[0]?.quem ?? null;
    const instanciaDoAliado =
      combate && aliadoFica
        ? await prisma.instanciaCombate.findFirst({
            where: { combateId: combate.combateId, personagemId: aliadoFica },
            select: { id: true, nomeExibicao: true },
          })
        : null;
    const aliadoEmCursoId = instanciaDoAliado ? null : aliadoFica;
    const rodadasDaAcao = Math.min(RODADAS_MAX, turnosDaAcao(acao.duracao) ?? RODADAS_MAX);
    const removeDe = (quem: string | null) =>
      destinos.filter((d) => d.quem === quem && d.e.tipo === "condicao_remover").map((d) => d.e);

    const proprio = pedaco(null);
    const ops = await opsDoUso({
      personagemId,
      personagem,
      agg,
      efeitos: proprio.efeitos,
      rolagens: proprio.rolagens,
      incluirMax: false,
      custoPp,
      recurso,
      custoRecurso: acao.custoRecursoValor,
      exaustaoExtra,
      grau: acao.grau,
    });
    for (const [id, aliado] of aliados) {
      const doAliado = pedaco(id);
      ops.push(...opsNoAliado({ personagem, agg, aliado, ...doAliado, grau: acao.grau }));
    }
    if (usosMax != null) {
      ops.push(
        prisma.acao.update({
          where: { id: acao.id, personagemId },
          data: { usosAtual: Math.max(0, (usosAtual ?? usosMax) - 1) },
        }),
      );
    }
    if (pedeConcentracao(acao.duracao)) {
      const turnos = turnosDaDuracao(lerDuracao(acao.duracao));
      ops.push(
        ...opsConcentracao(personagemId, personagem.concentracao, {
          tipo: "acao",
          id: acao.id,
          nome: acao.nome,
          ...(turnos ? { turnos } : {}),
        }),
        prisma.acao.update({ where: { id: acao.id, personagemId }, data: { aliadoEmCursoId } }),
      );
    } else if (ficaEmCurso(acao, !!instanciaDoAliado)) {
      // Fica em curso: o que repete e o que se mantém seguem até ela acabar.
      ops.push(
        prisma.acao.update({
          where: { id: acao.id, personagemId },
          data: { emCurso: true, turnosRestantes: turnosDaAcao(acao.duracao), aliadoEmCursoId },
        }),
      );
    }
    // Ação Extra da técnica: as ações a mais valem neste turno (bolinhas a mais).
    const ganhas = combate ? acoesGanhasNoUso(todosEfeitos) : {};
    if (combate && (tipoAcao || Object.keys(ganhas).length > 0)) {
      const gastas = tipoAcao
        ? { ...combate.gastas, [tipoAcao]: (combate.gastas[tipoAcao] ?? 0) + 1 }
        : combate.gastas;
      ops.push(
        prisma.instanciaCombate.update({
          where: { id: combate.instanciaId },
          data: { acoesGastas: comAcoesGanhas(gastas, ganhas) },
        }),
      );
    }
    if (ops.length > 0) await prisma.$transaction(ops);
    if (combate && instanciaDoAliado) {
      const condicoes = condicoesDosEfeitos(
        acao.nome,
        fica.map((d) => d.e),
        rodadasDaAcao,
      );
      const { receberam } = await aplicarCondicoes({
        combateId: combate.combateId,
        instanciaIds: [instanciaDoAliado.id],
        condicoes,
        fonteId: combate.instanciaId,
        origem: `${acao.nome} de ${personagem.nome}`,
      });
      if (receberam.length > 0) {
        await avisarCombate(
          combate.mesaId,
          instanciaDoAliado.nomeExibicao,
          `ficou: ${condicoes.map((c) => c.nome).join(", ")} (${personagem.nome}).`,
        );
        revalidatePath(`/narrador/${combate.mesaId}`);
      }
    }
    await removerCondicoesPorEfeito(personagemId, removeDe(null), acao.nome);
    for (const id of aliados.keys()) await removerCondicoesPorEfeito(id, removeDe(id), acao.nome);
    await estatisticasDoUso({
      personagemId,
      nome: acao.nome,
      custoPp,
      curou: instantaneos.some((d) => d.e.tipo === "cura"),
      antes: [
        { id: personagemId, hp: personagem.hpAtual },
        ...[...aliados.values()].map((a) => ({ id: a.personagem.id, hp: a.personagem.hpAtual })),
      ],
    });
    // Com alvo, abre a resolução: daqui saem as rolagens de ataque, salvaguarda e dano.
    const resolucaoId =
      combate && modoResolucao
        ? await abrirResolucao({
            combate,
            atacante: personagem.nome,
            acao,
            alvos,
            modo: modoResolucao,
            cd: cdDaFicha,
            corpoACorpo: opcoes?.combate?.corpoACorpo === true,
            // A tag da ação ou uma arma De Fogo ligada nela.
            armaDeFogo:
              acao.armaDeFogo ||
              (ids.size > 0 &&
                (await prisma.item.count({ where: { id: { in: [...ids] }, personagemId, categoria: "fogo" } })) > 0),
            ppGasto: acao.tecnica ? custoPp : 0,
          })
        : null;
    // Colaterais e Aplica Condição "em você" do uso; ação que não dura
    // (instantânea) já acaba aqui, com os "no fim".
    await aplicarColaterais(personagemId, acao, "uso");
    if (!pedeConcentracao(acao.duracao) && !ficaEmCurso(acao, !!instanciaDoAliado)) {
      await aplicarColaterais(personagemId, acao, "fim");
    }
    revalidatePath(`/ficha/${personagemId}`);
    for (const id of aliados.keys()) revalidatePath(`/ficha/${id}`);
    if (combate && (tipoAcao || resolucaoId)) revalidatePath(`/narrador/${combate.mesaId}`);
    return { resolucaoId };
  });
}

// Põe uma condição no personagem pela ficha (o jogador ou o narrador da mesa):
// no combate, se ele está num; senão, na lista da ficha.
export async function adicionarCondicao(personagemId: string, condicao: { nome: string; rodadas?: number }) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const nome = String(condicao?.nome ?? "").trim().slice(0, 40);
    if (!nome) throw new ErroDeUso("Escolha a condição.");
    const rodadas = Math.trunc(Number(condicao?.rodadas) || 0);
    const { receberam, imunes } = await aplicarCondicoesNoPersonagem(
      personagemId,
      [{ nome, rodadas: lerRodadas(rodadas), ...(rodadas > 0 ? {} : { usaPadroes: true }), salvaguarda: null }],
      "",
    );
    if (!receberam && imunes.length > 0) throw new ErroDeUso(`Imune a ${imunes.join(", ")}.`);
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// Tira uma condição do personagem (do combate, se está num; senão, da ficha).
export async function removerCondicao(personagemId: string, condicaoId: string) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const saiu = await tirarCondicaoDoPersonagem(personagemId, String(condicaoId ?? ""));
    if (!saiu) throw new ErroDeUso("Essa condição já saiu.");
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// Encerra a ação em curso antes da duração acabar.
export async function encerrarAcao(personagemId: string, acaoId: string) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const acao = await prisma.acao.findFirst({
      where: { id: acaoId, personagemId },
      select: { aliadoEmCursoId: true },
    });
    await prisma.acao.updateMany({
      where: { id: acaoId, personagemId },
      data: { emCurso: false, turnosRestantes: null, aliadoEmCursoId: null },
    });
    // Acabou: os colaterais "no fim".
    await colateraisDoFim(personagemId, [acaoId]);
    revalidatePath(`/ficha/${personagemId}`);
    if (acao?.aliadoEmCursoId) revalidatePath(`/ficha/${acao.aliadoEmCursoId}`);
  });
}

// Finalizar turno: quem está na vez passa pro próximo, mesmo com ações sobrando.
export async function finalizarTurno(personagemId: string) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const combate = await participacaoEmCombate(personagemId);
    if (!combate) throw new ErroDeUso("O personagem não está em combate.");
    if (!combate.naVez) throw new ErroDeUso("Não é a sua vez.");

    const { periodicos } = await avancarTurnoDoCombate(combate.combateId);
    await descontarPeriodicos(combate.mesaId, periodicos);
    revalidatePath(`/ficha/${personagemId}`);
    revalidatePath(`/narrador/${combate.mesaId}`);
  });
}

// Dano por turno de condição (sangramento, veneno) nos jogadores: passa pelas
// defesas da ficha de cada um, como qualquer dano do combate.
async function descontarPeriodicos(mesaId: string, periodicos: DanoPeriodico[]) {
  for (const item of periodicos) {
    const [personagem, { agg }] = await Promise.all([
      prisma.personagem.findUnique({ where: { id: item.personagemId }, include: INCLUDE_ACESSO }),
      carregarAgregado(item.personagemId),
    ]);
    if (!personagem) continue;
    await avisarCombate(mesaId, item.nome, `sofre com ${item.condicao}.`);
    await danoNoPersonagem({
      personagem,
      agg,
      uid: UID_COMBATE,
      partes: item.partes,
      fonte: { de: item.fonteId, acao: item.condicao },
    });
  }
}

// O mesmo, quando quem passou a vez foi o narrador. Só vale pra personagens
// que estão num combate aberto da mesa dele.
export async function descontarPeriodicosDoNarrador(mesaId: string, combateId: string, periodicos: DanoPeriodico[]) {
  const [user, combate] = await Promise.all([
    usuarioDaRequest(),
    prisma.combate.findUnique({
      where: { id: combateId },
      select: {
        encerradoEm: true,
        sessao: { select: { mesaId: true, mesa: { select: { userId: true } } } },
        participantes: { select: { personagemId: true } },
      },
    }),
  ]);
  if (!user || !combate || combate.encerradoEm || combate.sessao.mesaId !== mesaId) return;
  if (combate.sessao.mesa.userId !== user.id) return;
  const noCombate = new Set(combate.participantes.map((p) => p.personagemId));
  await descontarPeriodicos(
    mesaId,
    (Array.isArray(periodicos) ? periodicos : [])
      .filter((p) => noCombate.has(p?.personagemId))
      .slice(0, 24)
      .map((p) => ({ ...p, partes: normalizarPartesDano(p.partes) })),
  );
}

// ─── Concentração ──────────────────────────────────────────

// Troca a concentração; a habilidade ligada que segurava a anterior desliga.
function opsConcentracao(
  personagemId: string,
  atualRaw: unknown,
  nova: Concentracao | null,
): Prisma.PrismaPromise<unknown>[] {
  const atual = lerConcentracao(atualRaw);
  if (!atual && !nova) return [];
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (atual?.tipo === "habilidade" && atual.id !== nova?.id) {
    ops.push(
      prisma.habilidade.updateMany({
        where: { id: atual.id, personagemId, ligada: true },
        data: { ligada: false },
      }),
    );
  }
  ops.push(
    prisma.personagem.update({
      where: { id: personagemId },
      data: { concentracao: nova ?? Prisma.DbNull },
    }),
  );
  return ops;
}

// A habilidade ou ação apagada/desligada era a da concentração: ela acaba.
function soltarConcentracaoEm(
  personagemId: string,
  atualRaw: unknown,
  id: string,
): Prisma.PrismaPromise<unknown>[] {
  if (lerConcentracao(atualRaw)?.id !== id) return [];
  return [
    prisma.personagem.update({
      where: { id: personagemId },
      data: { concentracao: Prisma.DbNull },
    }),
  ];
}

export async function encerrarConcentracao(personagemId: string) {
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);
    const ops = opsConcentracao(personagemId, personagem.concentracao, null);
    if (ops.length > 0) await prisma.$transaction(ops);
    await colateraisDaConcentracao(personagemId, personagem.concentracao);
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Itens ─────────────────────────────────────────────────
const ALLOWED_ITEM = [
  "nome",
  "peso",
  "tipo",
  "tags",
  "tagsEstilo",
  "descricao",
  "dano",
  "modificador",
  "ca",
  "penalidadeDes",
  "equipado",
  "favorito",
  "categoria",
  "alcance",
  "alcanceMetros",
  "propriedades",
  "atributoAtaque",
  "proficienteArma",
  "danoBonus",
  "danoSomaAtributo",
  "danoSomaProficiencia",
  "efeitos",
  "quantidade",
  "municaoId",
] as const;

type ItemInput = Partial<Record<(typeof ALLOWED_ITEM)[number], unknown>>;

const CATEGORIAS_VALIDAS = new Set(["cortante", "fogo", "especial", "marcial"]);
const ALCANCES_VALIDOS = new Set(["corpo_a_corpo", "distancia"]);
const PROPRIEDADES_VALIDAS = new Set([
  "acuidade",
  "arremesso",
  "duasMaos",
  "versatil",
  "municao",
  "recarga",
  "sutil",
  "pesada",
  "alcance",
  "invencao",
  "especial",
]);

function normalizarPropriedades(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((p): p is string => typeof p === "string" && PROPRIEDADES_VALIDAS.has(p)))];
}

function normalizarItemInput(input: ItemInput) {
  const data: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = (input.nome as string).trim();
    if (!nome) throw new ErroDeUso("Nome é obrigatório.");
    data.nome = nome;
  }
  if (input.peso !== undefined) data.peso = Number(input.peso) || 0;
  if (input.tipo !== undefined) data.tipo = String(input.tipo) || "comum";
  if (input.tags !== undefined) data.tags = (input.tags as string) || "";
  if (input.tagsEstilo !== undefined) {
    // Poda estilos de tags que sumiram do texto.
    const tagsDoPatch =
      input.tags !== undefined ? separarTags(String(input.tags)) : undefined;
    data.tagsEstilo =
      normalizarEstilosTag(input.tagsEstilo, tagsDoPatch) ?? Prisma.DbNull;
  }
  if (input.descricao !== undefined) data.descricao = (input.descricao as string) || "";
  if (input.dano !== undefined) data.dano = (input.dano as string) || "";
  if (input.modificador !== undefined) data.modificador = Number(input.modificador) || 0;
  if (input.ca !== undefined) data.ca = Number(input.ca) || 0;
  if (input.penalidadeDes !== undefined) data.penalidadeDes = Number(input.penalidadeDes) || 0;
  if (input.equipado !== undefined) data.equipado = Boolean(input.equipado);
  if (input.favorito !== undefined) data.favorito = Boolean(input.favorito);
  if (input.categoria !== undefined) {
    const v = String(input.categoria);
    if (!CATEGORIAS_VALIDAS.has(v)) throw new ErroDeUso("Categoria inválida.");
    data.categoria = v;
  }
  if (input.alcance !== undefined) {
    const v = String(input.alcance);
    if (!ALCANCES_VALIDOS.has(v)) throw new ErroDeUso("Alcance inválido.");
    data.alcance = v;
  }
  if (input.alcanceMetros !== undefined) {
    // Texto livre descritivo; corta em 40 chars como defesa.
    const v = input.alcanceMetros ? String(input.alcanceMetros).trim().slice(0, 40) : "";
    data.alcanceMetros = v || null;
  }
  if (input.propriedades !== undefined) {
    data.propriedades = normalizarPropriedades(input.propriedades);
  }
  if (input.atributoAtaque !== undefined) {
    const v = input.atributoAtaque ? String(input.atributoAtaque) : null;
    if (v && !ATRIBUTOS_VALIDOS.has(v as Atributo)) {
      throw new ErroDeUso("Atributo de ataque inválido.");
    }
    data.atributoAtaque = v;
  }
  if (input.proficienteArma !== undefined) {
    data.proficienteArma = Boolean(input.proficienteArma);
  }
  if (input.danoBonus !== undefined) {
    const v = input.danoBonus ? String(input.danoBonus).trim().slice(0, 60) : "";
    data.danoBonus = v || null;
  }
  if (input.danoSomaAtributo !== undefined) {
    data.danoSomaAtributo = Boolean(input.danoSomaAtributo);
  }
  if (input.danoSomaProficiencia !== undefined) {
    data.danoSomaProficiencia = Boolean(input.danoSomaProficiencia);
  }
  if (input.efeitos !== undefined) data.efeitos = normalizarEfeitosInput(input.efeitos);
  if (input.quantidade !== undefined) {
    // Munição pode zerar e continuar no inventário.
    const minimo = input.tipo === "municao" ? 0 : 1;
    const n = Math.trunc(Number(input.quantidade));
    data.quantidade = Math.min(99999, Math.max(minimo, Number.isFinite(n) ? n : 1));
  }
  if (input.municaoId !== undefined) {
    const v = typeof input.municaoId === "string" ? input.municaoId.trim().slice(0, 64) : "";
    data.municaoId = v || null;
  }
  return data;
}

export async function criarItem(personagemId: string, input: ItemInput) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarItemInput(input);
    if (data.nome === undefined) throw new ErroDeUso("Nome é obrigatório.");

    await prisma.item.create({
      data: {
        personagemId,
        nome: data.nome as string,
        peso: (data.peso as number) ?? 0,
        tipo: (data.tipo as string) ?? "comum",
        tags: (data.tags as string) ?? "",
        tagsEstilo:
          (data.tagsEstilo as Prisma.InputJsonValue | typeof Prisma.DbNull) ??
          Prisma.DbNull,
        descricao: (data.descricao as string) ?? "",
        dano: (data.dano as string) ?? "",
        modificador: (data.modificador as number) ?? 0,
        ca: (data.ca as number) ?? 0,
        penalidadeDes: (data.penalidadeDes as number) ?? 0,
        categoria: (data.categoria as string) ?? "cortante",
        alcance: (data.alcance as string) ?? "corpo_a_corpo",
        alcanceMetros: (data.alcanceMetros as string | null) ?? null,
        propriedades: (data.propriedades as string[]) ?? [],
        atributoAtaque: (data.atributoAtaque as string | null) ?? null,
        proficienteArma:
          data.proficienteArma === undefined ? true : (data.proficienteArma as boolean),
        danoBonus: (data.danoBonus as string | null) ?? null,
        danoSomaAtributo: (data.danoSomaAtributo as boolean) ?? false,
        danoSomaProficiencia: (data.danoSomaProficiencia as boolean) ?? false,
        efeitos: (data.efeitos as EfeitoHabilidade[]) ?? [],
        quantidade: (data.quantidade as number) ?? 1,
        municaoId: (data.municaoId as string | null) ?? null,
      },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function atualizarItem(
  personagemId: string,
  itemId: string,
  patch: ItemInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarItemInput(patch);

    await prisma.item.update({
      where: { id: itemId, personagemId },
      data,
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// Gasta munição de um ataque rolado.
export async function gastarMunicao(personagemId: string, itemId: string, quantidade = 1) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const item = await prisma.item.findFirst({
      where: { id: itemId, personagemId, tipo: "municao" },
      select: { id: true, nome: true, quantidade: true },
    });
    if (!item) throw new ErroDeUso("Munição não encontrada.");
    if (item.quantidade <= 0) throw new ErroDeUso(`Sem ${item.nome}.`);
    const n = Math.min(100, Math.max(1, Math.trunc(Number(quantidade) || 1)));
    await prisma.item.update({
      where: { id: item.id, personagemId },
      data: { quantidade: Math.max(0, item.quantidade - n) },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarItem(personagemId: string, itemId: string) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await prisma.item.delete({
      where: { id: itemId, personagemId },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Proficiências (perícias e salvaguardas) ──────────────
const PERICIAS_VALIDAS = new Set(PERICIAS.map((p) => p.slug));
const ATRIBUTOS_VALIDOS = new Set<string>(ATRIBUTOS.map((a) => a.slug));

function toggleEm<T extends string>(lista: T[], slug: T, ligado: boolean): T[] {
  const set = new Set(lista);
  if (ligado) set.add(slug);
  else set.delete(slug);
  return Array.from(set);
}

export async function togglePericia(
  personagemId: string,
  slug: PericiaSlug,
  proficiente: boolean,
) {
  return executar("ficha", async () => {
    if (!PERICIAS_VALIDAS.has(slug)) throw new ErroDeUso("Perícia inválida.");
    const { personagem } = await autorizar(personagemId);

    const prof = lerProficiencias(personagem.proficiencias);
    prof.pericias = toggleEm(prof.pericias, slug, proficiente);
    // Desligar a proficiência também limpa o "dobrado".
    if (!proficiente) {
      prof.periciasDobradas = prof.periciasDobradas.filter((p) => p !== slug);
    }

    await prisma.personagem.update({
      where: { id: personagemId },
      data: { proficiencias: prof },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function setPericiaOutros(
  personagemId: string,
  slug: PericiaSlug,
  valor: number,
) {
  return executar("ficha", async () => {
    if (!PERICIAS_VALIDAS.has(slug)) throw new ErroDeUso("Perícia inválida.");
    if (!Number.isFinite(valor)) throw new ErroDeUso("Valor inválido.");
    const { personagem } = await autorizar(personagemId);

    const prof = lerProficiencias(personagem.proficiencias);
    const truncado = Math.trunc(valor);
    if (truncado === 0) {
      delete prof.outrosPericias[slug];
    } else {
      prof.outrosPericias[slug] = truncado;
    }

    await prisma.personagem.update({
      where: { id: personagemId },
      data: { proficiencias: prof },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function togglePericiaDobrada(
  personagemId: string,
  slug: PericiaSlug,
  dobrado: boolean,
) {
  return executar("ficha", async () => {
    if (!PERICIAS_VALIDAS.has(slug)) throw new ErroDeUso("Perícia inválida.");
    const { personagem } = await autorizar(personagemId);

    const prof = lerProficiencias(personagem.proficiencias);
    // "Dobrado" só faz sentido se for proficiente.
    if (dobrado && !prof.pericias.includes(slug)) {
      throw new ErroDeUso("É preciso ser proficiente antes de dobrar.");
    }
    prof.periciasDobradas = toggleEm(prof.periciasDobradas, slug, dobrado);

    await prisma.personagem.update({
      where: { id: personagemId },
      data: { proficiencias: prof },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function toggleSalvaguarda(
  personagemId: string,
  atributo: Atributo,
  proficiente: boolean,
) {
  return executar("ficha", async () => {
    if (!ATRIBUTOS_VALIDOS.has(atributo)) throw new ErroDeUso("Atributo inválido.");
    const { personagem } = await autorizar(personagemId);

    const prof = lerProficiencias(personagem.proficiencias);
    prof.salvaguardas = toggleEm(prof.salvaguardas, atributo, proficiente);

    await prisma.personagem.update({
      where: { id: personagemId },
      data: { proficiencias: prof },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function setSalvaguardaOutros(
  personagemId: string,
  atributo: Atributo,
  valor: number,
) {
  return executar("ficha", async () => {
    if (!ATRIBUTOS_VALIDOS.has(atributo)) throw new ErroDeUso("Atributo inválido.");
    if (!Number.isFinite(valor)) throw new ErroDeUso("Valor inválido.");
    const { personagem } = await autorizar(personagemId);

    const prof = lerProficiencias(personagem.proficiencias);
    const truncado = Math.trunc(valor);
    if (truncado === 0) {
      delete prof.outrosSalvaguardas[atributo];
    } else {
      prof.outrosSalvaguardas[atributo] = truncado;
    }

    await prisma.personagem.update({
      where: { id: personagemId },
      data: { proficiencias: prof },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Perícias customizadas ────────────────────────────────
// Perícias fora do set fixo (Profissão, homebrew). Cada uma é uma linha em
// pericias_custom; proficiência/dobrada/bônus vivem na própria linha.
function serializarPericiaCustom(p: {
  id: string;
  nome: string;
  slug: string;
  atributo: string;
  origem: string;
  proficiente: boolean;
  dobrada: boolean;
  bonusOutros: number;
  ordem: number;
}) {
  return {
    id: p.id,
    nome: p.nome,
    slug: p.slug,
    atributo: p.atributo,
    origem: p.origem,
    proficiente: p.proficiente,
    dobrada: p.dobrada,
    bonusOutros: p.bonusOutros,
    ordem: p.ordem,
  };
}

export async function criarPericiaCustom(
  personagemId: string,
  input: { nome: string; atributo: string; origem?: string },
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);

    const nome = String(input.nome ?? "").trim();
    if (!nome) throw new ErroDeUso("Dê um nome à perícia.");
    if (!ATRIBUTOS_VALIDOS.has(input.atributo)) throw new ErroDeUso("Atributo inválido.");
    const origem = String(input.origem ?? "").trim();

    // Slug único por personagem — deriva do nome evitando colisão com built-ins
    // e com as customizadas que já existem.
    const existentes = await prisma.periciaCustom.findMany({
      where: { personagemId },
      select: { slug: true },
    });
    const slug = slugPericiaCustom(nome, new Set(existentes.map((p) => p.slug)));

    const criada = await prisma.periciaCustom.create({
      data: {
        personagemId,
        nome,
        slug,
        atributo: input.atributo,
        origem,
        ordem: existentes.length,
      },
    });
    revalidatePath(`/ficha/${personagemId}`);
    return serializarPericiaCustom(criada);
  });
}

const ALLOWED_PERICIA_CUSTOM = [
  "nome",
  "atributo",
  "origem",
  "proficiente",
  "dobrada",
  "bonusOutros",
] as const;

type PericiaCustomPatch = Partial<
  Record<(typeof ALLOWED_PERICIA_CUSTOM)[number], unknown>
>;

export async function patchPericiaCustom(
  personagemId: string,
  id: string,
  patch: PericiaCustomPatch,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);

    const data: Record<string, unknown> = {};
    for (const key of ALLOWED_PERICIA_CUSTOM) {
      if (patch[key] !== undefined) data[key] = patch[key];
    }

    if (typeof data.nome === "string") {
      const nome = data.nome.trim();
      if (!nome) throw new ErroDeUso("Nome inválido.");
      data.nome = nome;
    }
    if (data.atributo !== undefined && !ATRIBUTOS_VALIDOS.has(String(data.atributo))) {
      throw new ErroDeUso("Atributo inválido.");
    }
    if (typeof data.origem === "string") data.origem = data.origem.trim();
    if (data.bonusOutros !== undefined) {
      const n = Number(data.bonusOutros);
      if (!Number.isFinite(n)) throw new ErroDeUso("Valor inválido.");
      data.bonusOutros = Math.trunc(n);
    }
    // Invariantes: dobrar exige proficiência; tirar proficiência tira o dobro.
    if (data.dobrada === true) data.proficiente = true;
    if (data.proficiente === false) data.dobrada = false;

    if (Object.keys(data).length === 0) return;

    await prisma.periciaCustom.update({
      where: { id, personagemId },
      data,
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarPericiaCustom(personagemId: string, id: string) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await prisma.periciaCustom.delete({
      where: { id, personagemId },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Recursos customizados ────────────────────────────────
const ALLOWED_RECURSO = [
  "nome",
  "valorAtual",
  "valorMax",
  "valorMaxFormula",
  "ordem",
  "cor",
  "cor2",
  "efeito",
  "resetEm",
] as const;
type RecursoInput = Partial<Record<(typeof ALLOWED_RECURSO)[number], unknown>>;

const RESET_VALIDOS = new Set(["manual", "encontro", "descansoCurto", "descansoLongo"]);

function normalizarRecurso(input: RecursoInput, parcial: boolean) {
  const data: Record<string, unknown> = {};
  for (const key of ALLOWED_RECURSO) {
    if (input[key] === undefined) continue;
    if (key === "nome") {
      const nome = (input.nome as string).trim();
      if (!nome) throw new ErroDeUso("Nome do recurso é obrigatório.");
      data.nome = nome;
    } else if (key === "valorAtual" || key === "valorMax" || key === "ordem") {
      data[key] = Number(input[key]) || 0;
    } else if (key === "valorMaxFormula") {
      data.valorMaxFormula = formulaOuNulo(input.valorMaxFormula);
    } else if (key === "resetEm") {
      const v = String(input.resetEm);
      if (!RESET_VALIDOS.has(v)) throw new ErroDeUso("resetEm inválido.");
      data.resetEm = v;
    } else if (key === "cor") {
      data.cor = corValida(input.cor);
    } else if (key === "cor2") {
      data.cor2 = corValida(input.cor2);
    } else if (key === "efeito") {
      data.efeito = normalizarEfeitoCor(input.efeito);
    }
  }
  if (!parcial && data.nome === undefined) {
    throw new ErroDeUso("Nome do recurso é obrigatório.");
  }
  return data;
}

export async function criarRecurso(personagemId: string, input: RecursoInput) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarRecurso(input, false);

    const atual =
      typeof data.valorAtual === "number" ? data.valorAtual : Number(data.valorMax) || 0;

    await prisma.recurso.create({
      data: {
        personagemId,
        nome: data.nome as string,
        valorAtual: atual,
        valorMax: (data.valorMax as number) ?? 0,
        valorMaxFormula: (data.valorMaxFormula as string | null) ?? null,
        ordem: (data.ordem as number) ?? 0,
        cor: (data.cor as string | null) ?? null,
        cor2: (data.cor2 as string | null) ?? null,
        efeito: (data.efeito as string) ?? "solido",
        resetEm: (data.resetEm as string) ?? "manual",
      },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function atualizarRecurso(
  personagemId: string,
  recursoId: string,
  patch: RecursoInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarRecurso(patch, true);

    await prisma.recurso.update({
      where: { id: recursoId, personagemId },
      data,
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarRecurso(personagemId: string, recursoId: string) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await prisma.recurso.delete({
      where: { id: recursoId, personagemId },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Habilidades ───────────────────────────────────────────
const ALLOWED_HABILIDADE = [
  "nome",
  "origem",
  "tipo",
  "descricao",
  "custoPp",
  "custoPa",
  "custoRecursoId",
  "custoRecursoValor",
  "usos",
  "usosAtual",
  "recarga",
  "tags",
  "tagsEstilo",
  "favorita",
  "ordem",
  "itemId",
  "efeitos",
  "alternavel",
  "usosFormula",
  "aliado",
  "duracao",
  "itemUsa",
  "pasta",
  "custoPpFormula",
  "custoRecursoFormula",
  "formaDe",
] as const;

type HabilidadeInput = Partial<
  Record<(typeof ALLOWED_HABILIDADE)[number], unknown>
>;

const ORIGENS_HAB_VALIDAS = new Set([
  "profissao",
  "estilo",
  "haki",
  "especie",
  "akumaNoMi",
  "treinamento",
  "item",
  "livre",
]);
const TIPOS_HAB_VALIDOS = new Set(["passiva", "ativa", "reativa", "livre"]);
const RECARGAS_VALIDAS_HAB = new Set([
  "descansoCurto",
  "descansoLongo",
  "encontro",
  "manual",
]);
// Tipos válidos derivados do catálogo de efeitos.
const TIPOS_EFEITO_VALIDOS = new Set<TipoEfeito>(
  Object.keys(META_EFEITOS) as TipoEfeito[],
);

function normalizarEfeitosInput(raw: unknown): EfeitoHabilidade[] {
  if (!Array.isArray(raw)) return [];
  const out: EfeitoHabilidade[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const t = obj.tipo;
    if (typeof t !== "string" || !TIPOS_EFEITO_VALIDOS.has(t as TipoEfeito)) continue;
    const e = normalizarEfeito(t as TipoEfeito, obj);
    if (!e) continue;
    // Condição criada no Aplica Condição: a mecânica passa pela leitura de sempre.
    if (e.tipo === "condicao_aplicar" && e.mecanica) {
      const m = lerMecanica(e.mecanica);
      if (m) e.mecanica = m;
      else delete e.mecanica;
    }
    out.push(comDura(e, obj.dura));
  }
  return out;
}

function normalizarHabilidadeInput(input: HabilidadeInput) {
  const data: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = String(input.nome).trim();
    if (!nome) throw new ErroDeUso("Nome é obrigatório.");
    data.nome = nome;
  }
  if (input.origem !== undefined) {
    const v = String(input.origem);
    if (!ORIGENS_HAB_VALIDAS.has(v)) throw new ErroDeUso("Origem inválida.");
    data.origem = v;
  }
  if (input.tipo !== undefined) {
    const v = String(input.tipo);
    if (!TIPOS_HAB_VALIDOS.has(v)) throw new ErroDeUso("Tipo de habilidade inválido.");
    data.tipo = v;
  }
  if (input.descricao !== undefined) data.descricao = String(input.descricao);
  if (input.custoPp !== undefined) data.custoPp = Math.max(0, Number(input.custoPp) || 0);
  if (input.custoPa !== undefined) data.custoPa = Math.max(0, Number(input.custoPa) || 0);
  if (input.custoRecursoId !== undefined) {
    data.custoRecursoId = input.custoRecursoId ? String(input.custoRecursoId) : null;
  }
  if (input.custoRecursoValor !== undefined) {
    data.custoRecursoValor = Math.max(0, Number(input.custoRecursoValor) || 0);
  }
  if (input.custoPpFormula !== undefined) data.custoPpFormula = formulaOuNulo(input.custoPpFormula);
  if (input.custoRecursoFormula !== undefined) {
    data.custoRecursoFormula = formulaOuNulo(input.custoRecursoFormula);
  }
  normalizarUsosInput(input, data);
  if (input.tags !== undefined) data.tags = input.tags ? String(input.tags) : null;
  if (input.tagsEstilo !== undefined) {
    const tagsDoPatch =
      input.tags !== undefined ? separarTags(String(input.tags ?? "")) : undefined;
    data.tagsEstilo =
      normalizarEstilosTag(input.tagsEstilo, tagsDoPatch) ?? Prisma.DbNull;
  }
  if (input.favorita !== undefined) data.favorita = Boolean(input.favorita);
  if (input.ordem !== undefined) data.ordem = Math.trunc(Number(input.ordem) || 0);
  // Item que concede a habilidade.
  if (input.itemId !== undefined) data.itemId = input.itemId ? String(input.itemId) : null;
  if (input.itemUsa !== undefined) data.itemUsa = Boolean(input.itemUsa);
  if (input.pasta !== undefined) data.pasta = nomeDePasta(input.pasta) || null;
  if (input.efeitos !== undefined) data.efeitos = normalizarEfeitosInput(input.efeitos);
  if (input.alternavel !== undefined) data.alternavel = Boolean(input.alternavel);
  if (input.aliado !== undefined) data.aliado = Boolean(input.aliado);
  if (input.duracao !== undefined) data.duracao = lerDuracao(input.duracao) ?? Prisma.DbNull;
  if (input.formaDe !== undefined) data.formaDe = input.formaDe ? String(input.formaDe) : null;
  return data;
}

// Linha de `habilidades` a partir do input já normalizado.
function dadosDaHabilidade(personagemId: string, data: Record<string, unknown>) {
  return {
    personagemId,
    nome: data.nome as string,
    origem: (data.origem as string) ?? "livre",
    tipo: (data.tipo as string) ?? "passiva",
    descricao: (data.descricao as string) ?? "",
    custoPp: (data.custoPp as number) ?? 0,
    custoPa: (data.custoPa as number) ?? 0,
    custoRecursoId: (data.custoRecursoId as string | null) ?? null,
    custoRecursoValor: (data.custoRecursoValor as number) ?? 0,
    custoPpFormula: (data.custoPpFormula as string | null) ?? null,
    custoRecursoFormula: (data.custoRecursoFormula as string | null) ?? null,
    usos: (data.usos as number | null) ?? null,
    usosAtual: (data.usosAtual as number | null) ?? null,
    recarga: (data.recarga as string | null) ?? null,
    tags: (data.tags as string | null) ?? null,
    tagsEstilo:
      (data.tagsEstilo as Prisma.InputJsonValue | typeof Prisma.DbNull) ?? Prisma.DbNull,
    favorita: (data.favorita as boolean) ?? false,
    ordem: (data.ordem as number) ?? 0,
    itemId: (data.itemId as string | null) ?? null,
    itemUsa: (data.itemUsa as boolean) ?? false,
    pasta: (data.pasta as string | null) ?? null,
    efeitos: (data.efeitos as EfeitoHabilidade[]) ?? [],
    alternavel: (data.alternavel as boolean) ?? false,
    aliado: (data.aliado as boolean) ?? false,
    usosFormula: (data.usosFormula as string | null) ?? null,
    duracao: (data.duracao as Prisma.InputJsonValue | typeof Prisma.DbNull) ?? Prisma.DbNull,
    ...(data.formaDe ? { formaDe: data.formaDe as string } : {}),
  };
}

export async function criarHabilidade(
  personagemId: string,
  input: HabilidadeInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarHabilidadeInput(input);
    if (data.nome === undefined) throw new ErroDeUso("Nome é obrigatório.");
    await conferirForma("habilidade", personagemId, data);

    await prisma.habilidade.create({ data: dadosDaHabilidade(personagemId, data) });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function atualizarHabilidade(
  personagemId: string,
  habilidadeId: string,
  patch: HabilidadeInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarHabilidadeInput(patch);
    await conferirForma("habilidade", personagemId, data, habilidadeId);
    await prisma.habilidade.update({
      where: { id: habilidadeId, personagemId },
      data,
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarHabilidade(
  personagemId: string,
  habilidadeId: string,
) {
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);
    await prisma.$transaction([
      prisma.habilidade.delete({ where: { id: habilidadeId, personagemId } }),
      ...soltarConcentracaoEm(personagemId, personagem.concentracao, habilidadeId),
    ]);
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// Total rolado de cada cura com fórmula, pelo índice do efeito.
export type RolagensCura = Record<number, number>;

// Aceita só as curas que rolam, presas à faixa possível da fórmula (com o dado a
// mais na cura de PV).
function validarRolagensCura(
  efeitos: EfeitoHabilidade[],
  rolagens: unknown,
  atributos: Record<Atributo, number>,
  nivel: number,
  grau = 0,
  extra?: ExtraDeCura,
): RolagensCura {
  const out: RolagensCura = {};
  if (!rolagens || typeof rolagens !== "object") return out;
  const comExtra = !!extra?.texto;
  for (const c of curasComFormula(efeitos, comExtra)) {
    const bruto = Number((rolagens as Record<string, unknown>)[c.idx]);
    if (!Number.isFinite(bruto)) continue;
    const f = resolverFormula(c.valor, atributos, nivel, { grau });
    const soma = comExtra && c.alvo === "hp" ? extra : undefined;
    const { min, max } = faixaDaRolagem(
      [...f.dados, ...(soma?.dados ?? [])],
      f.modificador + (soma?.modificador ?? 0),
    );
    out[c.idx] = Math.max(0, Math.min(max, Math.max(min, Math.trunc(bruto))));
  }
  return out;
}

type PersonagemDoUso = Awaited<ReturnType<typeof autorizar>>["personagem"];
type RecursoDoUso = NonNullable<Awaited<ReturnType<typeof prisma.recurso.findFirst>>>;

// Confere e busca o recurso de custo.
async function recursoDeCusto(
  personagemId: string,
  recursoId: string | null,
  valor: number,
): Promise<RecursoDoUso | null> {
  if (!recursoId || valor <= 0) return null;
  const r = await prisma.recurso.findFirst({ where: { id: recursoId, personagemId } });
  if (!r) throw new ErroDeUso("Recurso configurado não existe mais.");
  if (r.valorAtual < valor) throw new ErroDeUso(`${r.nome} insuficiente.`);
  return r;
}

// Pools de quem recebe os efeitos: o próprio personagem ou um aliado da mesa.
type PoolsDoUso = {
  id: string;
  hpAtual: number;
  hpMax: number;
  hpTemp: number;
  ppAtual: number;
  ppMax: number;
  exaustao: number;
};
type AliadoDoUso = { personagem: PoolsDoUso; agg: EfeitosAgregados };

const SEM_DELTAS: Omit<DeltasInstantaneos, "recursos"> = {
  hpAtual: 0,
  hpTemp: 0,
  ppAtual: 0,
  hpMax: 0,
  ppMax: 0,
  exaustao: 0,
};

// Aliado do mesmo grupo (não o próprio), com o agregado dele pros máximos.
async function aliadoDoUso(personagem: PersonagemDoUso, alvoId: unknown): Promise<AliadoDoUso> {
  const id = typeof alvoId === "string" ? alvoId : "";
  if (!id || id === personagem.id) throw new ErroDeUso("Escolha um aliado.");
  const [alvo, { agg }] = await Promise.all([
    prisma.personagem.findFirst({ where: { id, molde: false, ...mesmoGrupo(personagem.id) } }),
    carregarAgregado(id),
  ]);
  if (!alvo) throw new ErroDeUso("Esse aliado não joga com você.");
  return { personagem: alvo, agg };
}

// Patch dos pools: PV/PP param no máximo efetivo, PV temporário fica o maior e a
// exaustão fica entre 0 e 6. `custoPp` e `exaustaoExtra` são de quem usa.
function patchDePools(
  p: PoolsDoUso,
  agg: EfeitosAgregados,
  d: Omit<DeltasInstantaneos, "recursos">,
  custoPp: number,
  exaustaoExtra: number,
): Record<string, number> {
  const hpMax = Math.max(1, p.hpMax + d.hpMax);
  const ppMax = Math.max(0, p.ppMax + d.ppMax);
  const efetivos = poolsEfetivos({ hpMax, ppMax }, agg);
  const novo = {
    hpAtual: somarAteOMaximo(p.hpAtual, d.hpAtual, efetivos.hpMax),
    ppAtual: somarAteOMaximo(Math.max(0, p.ppAtual - custoPp), d.ppAtual, efetivos.ppMax),
    hpTemp: Math.max(p.hpTemp, d.hpTemp),
    hpMax,
    ppMax,
    exaustao: clamp(p.exaustao + d.exaustao + exaustaoExtra, 0, 6),
  };
  const patch: Record<string, number> = {};
  for (const campo of Object.keys(novo) as (keyof typeof novo)[]) {
    if (novo[campo] !== p[campo]) patch[campo] = novo[campo];
  }
  return patch;
}

// Operações de um uso: debita PP e recurso e aplica os efeitos instantâneos
// (cura — a de fórmula chega rolada —, PV temporário, PV/PP máx, exaustão,
// recurso). Com `aliado`, PV, PP e exaustão dos efeitos vão pra ele; custos,
// Sobrecarga e recursos ficam com quem usa.
async function opsDoUso(opts: {
  personagemId: string;
  personagem: PersonagemDoUso;
  agg: EfeitosAgregados;
  efeitos: EfeitoHabilidade[];
  rolagens: unknown;
  incluirMax: boolean;
  custoPp: number;
  recurso: RecursoDoUso | null;
  custoRecurso: number;
  exaustaoExtra?: number;
  aliado?: AliadoDoUso | null;
  // Grau da técnica, pro GRAU das fórmulas.
  grau?: number;
}): Promise<Prisma.PrismaPromise<unknown>[]> {
  const { personagemId, personagem, agg, efeitos, aliado } = opts;
  const grau = opts.grau ?? 0;
  const atributos = atributosEfetivos(atributosDoPersonagem(personagem), agg);
  const deltas = computarDeltasInstantaneos(efeitos, {
    incluirMax: opts.incluirMax,
    rolagens: validarRolagensCura(
      efeitos,
      opts.rolagens,
      atributos,
      personagem.nivel,
      grau,
      extrasDeCura(agg),
    ),
    ctx: agg.ctxFormula ? { ...agg.ctxFormula, grau } : null,
  });
  const recursoIds = Object.keys(deltas.recursos);
  const recursosEfeito =
    recursoIds.length > 0
      ? await prisma.recurso.findMany({ where: { personagemId, id: { in: recursoIds } } })
      : [];

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const proprio = patchDePools(
    personagem,
    agg,
    aliado ? SEM_DELTAS : deltas,
    opts.custoPp,
    opts.exaustaoExtra ?? 0,
  );
  // PV temporário novo que passa o que havia leva junto até quando ele dura.
  const duracaoTemp = (p: PoolsDoUso, d: Omit<DeltasInstantaneos, "recursos">) =>
    d.hpTemp > p.hpTemp ? { hpTempDuracao: d.hpTempDuracao ?? null } : {};
  if (Object.keys(proprio).length > 0) {
    ops.push(
      prisma.personagem.update({
        where: { id: personagemId },
        data: { ...proprio, ...duracaoTemp(personagem, aliado ? SEM_DELTAS : deltas) },
      }),
    );
  }
  if (aliado) {
    const doAliado = patchDePools(aliado.personagem, aliado.agg, deltas, 0, 0);
    if (Object.keys(doAliado).length > 0) {
      ops.push(
        prisma.personagem.update({
          where: { id: aliado.personagem.id },
          data: { ...doAliado, ...duracaoTemp(aliado.personagem, deltas) },
        }),
      );
    }
  }
  const { recurso, custoRecurso } = opts;
  if (recurso) {
    ops.push(
      prisma.recurso.update({
        where: { id: recurso.id, personagemId },
        data: { valorAtual: recurso.valorAtual - custoRecurso },
      }),
    );
  }
  for (const r of recursosEfeito) {
    const delta = deltas.recursos[r.id] ?? 0;
    if (!delta) continue;
    // Custo do recurso já foi debitado acima — não deduzir de novo.
    const base = recurso?.id === r.id ? r.valorAtual - custoRecurso : r.valorAtual;
    const novo = clamp(base + delta, 0, maximoDoRecurso(r, agg.ctxFormula));
    if (novo === r.valorAtual) continue;
    ops.push(prisma.recurso.update({ where: { id: r.id, personagemId }, data: { valorAtual: novo } }));
  }
  return ops;
}

// Efeitos na hora que vão pra um aliado (cura, PV temporário, PP, exaustão).
// Só mexe nele: o custo e o resto ficam com quem usa, no `opsDoUso`. As rolagens
// são de quem usa, então a conferência usa os atributos dele.
function opsNoAliado(opts: {
  personagem: PersonagemDoUso;
  agg: EfeitosAgregados;
  aliado: AliadoDoUso;
  efeitos: EfeitoHabilidade[];
  rolagens: unknown;
  grau: number;
}): Prisma.PrismaPromise<unknown>[] {
  const { personagem, agg, aliado, efeitos, grau } = opts;
  if (efeitos.length === 0) return [];
  const atributos = atributosEfetivos(atributosDoPersonagem(personagem), agg);
  const deltas = computarDeltasInstantaneos(efeitos, {
    incluirMax: false,
    rolagens: validarRolagensCura(efeitos, opts.rolagens, atributos, personagem.nivel, grau, extrasDeCura(agg)),
    ctx: agg.ctxFormula ? { ...agg.ctxFormula, grau } : null,
  });
  const patch = patchDePools(aliado.personagem, aliado.agg, deltas, 0, 0);
  if (Object.keys(patch).length === 0) return [];
  const duracaoTemp =
    deltas.hpTemp > aliado.personagem.hpTemp ? { hpTempDuracao: deltas.hpTempDuracao ?? null } : {};
  return [prisma.personagem.update({ where: { id: aliado.personagem.id }, data: { ...patch, ...duracaoTemp } })];
}

// Debita custos (PP, recurso de custo, usos) e aplica os efeitos instantâneos
// da habilidade numa transação. PA não tem campo no Personagem — quem quiser
// controle automático cria um Recurso customizado "PA".
//
// `extraHabData` é mesclado no update da habilidade (ex: `{ ligada: true }` ao
// ligar uma sustentada). `incluirMax: false` deixa hp-max/pp-max fora dos
// deltas instantâneos — ao LIGAR uma sustentada, o bônus de máximo é revertível
// e vive no agregado (bonusHpMax/bonusPpMax enquanto ligada), não no valor
// armazenado. Botão "Usar" usa o default (instantâneo permanente).
async function aplicarUsoHabilidade(
  personagemId: string,
  habilidadeId: string,
  extraHabData: Record<string, unknown> = {},
  {
    incluirMax = true,
    rolagens,
    alvoId,
    vezes: vezesRaw,
  }: { incluirMax?: boolean; rolagens?: unknown; alvoId?: unknown; vezes?: unknown } = {},
) {
  const ligando = extraHabData.ligada === true;
  // Usos empilhados numa rolagem: paga o custo e gasta os usos de todos de uma vez
  // (os efeitos na hora entram uma vez só).
  const vezes = Math.min(10, Math.max(1, Math.trunc(Number(vezesRaw) || 1)));
  const [{ personagem }, { agg }, bruta] = await Promise.all([
    autorizar(personagemId),
    carregarAgregado(personagemId, ligando ? { id: habilidadeId, ligada: true } : undefined),
    prisma.habilidade.findFirst({ where: { id: habilidadeId, personagemId } }),
  ]);
  if (!bruta) throw new ErroDeUso("Habilidade não encontrada.");
  // Custo por fórmula vira número com o nível e os atributos.
  const hab = comCustosResolvidos(bruta, agg.ctxFormula);
  const custoPp = hab.custoPp * vezes;
  const custoRecurso = hab.custoRecursoValor * vezes;

  // Colateral de uma técnica: sem PP / sem Haki por um tempo.
  const bloqueios = lerBloqueios(personagem.bloqueios);
  const bloqueio =
    (custoPp > 0 ? bloqueioDe(bloqueios, "pp") : null) ?? (hab.origem === "haki" ? bloqueioDe(bloqueios, "haki") : null);
  if (bloqueio) throw new ErroDeUso(`${textoDoBloqueio(bloqueio)}: falta ${tempoDoBloqueio(bloqueio.rodadas)}.`);
  if (custoPp > 0 && personagem.ppAtual < custoPp) {
    throw new ErroDeUso("PP insuficiente.");
  }
  const usosMax = usosMaximos(hab, agg.ctxFormula);
  const usosAtual = hab.usosAtual ?? usosMax;
  if (usosMax != null && (usosAtual ?? 0) < vezes) {
    throw new ErroDeUso(vezes > 1 ? "Usos insuficientes." : "Sem usos restantes.");
  }
  const recurso = await recursoDeCusto(personagemId, hab.custoRecursoId, custoRecurso);
  const aliado = hab.aliado ? await aliadoDoUso(personagem, alvoId) : null;

  const ops = await opsDoUso({
    personagemId,
    personagem,
    agg,
    efeitos: lerEfeitos(hab.efeitos),
    rolagens,
    incluirMax,
    custoPp,
    recurso,
    custoRecurso,
    aliado,
  });
  const habData: Record<string, unknown> = { ...extraHabData };
  if (usosMax != null) habData.usosAtual = Math.max(0, (usosAtual ?? usosMax) - vezes);
  if (ligando) habData.turnosRestantes = turnosDaDuracao(lerDuracao(hab.duracao));
  // Ligada num aliado: os efeitos que ficam valendo passam a contar nele.
  if (ligando && aliado) habData.alvoPersonagemId = aliado.personagem.id;
  if (Object.keys(habData).length > 0) {
    ops.push(prisma.habilidade.update({ where: { id: hab.id, personagemId }, data: habData }));
  }
  if (pedeConcentracao(hab.duracao)) {
    ops.push(
      ...opsConcentracao(personagemId, personagem.concentracao, {
        tipo: "habilidade",
        id: hab.id,
        nome: hab.nome,
      }),
    );
  }

  if (ops.length > 0) await prisma.$transaction(ops);
  await removerCondicoesPorEfeito(aliado?.personagem.id ?? personagemId, lerEfeitos(hab.efeitos), hab.nome);
  await estatisticasDoUso({
    personagemId,
    nome: hab.nome,
    custoPp,
    curou: lerEfeitos(hab.efeitos).some((e) => e.tipo === "cura"),
    antes: [
      { id: personagemId, hp: personagem.hpAtual },
      ...(aliado ? [{ id: aliado.personagem.id, hp: aliado.personagem.hpAtual }] : []),
    ],
  });
  revalidatePath(`/ficha/${personagemId}`);
  if (aliado) revalidatePath(`/ficha/${aliado.personagem.id}`);
}

// PP gasto e PV curados num uso de ação ou habilidade, pras estatísticas do
// combate (só valem se o personagem está num). A cura sai da diferença de PV,
// porque quem rola e soma é opsDoUso.
async function estatisticasDoUso(e: {
  personagemId: string;
  nome: string;
  custoPp: number;
  curou: boolean;
  antes: { id: string; hp: number }[];
}) {
  await registrarPpDePersonagem(e.personagemId, e.custoPp, e.nome);
  if (!e.curou) return;
  const depois = await prisma.personagem.findMany({
    where: { id: { in: e.antes.map((a) => a.id) } },
    select: { id: true, hpAtual: true },
  });
  for (const a of e.antes) {
    const d = depois.find((x) => x.id === a.id);
    if (d && d.hpAtual > a.hp) await registrarCuraEmPersonagem(a.id, d.hpAtual - a.hp, e.nome, e.personagemId);
  }
}

// Botão "Usar" de habilidade não-sustentada (ou ativa só-instantânea): consome
// custos + aplica efeitos instantâneos, sem estado persistente.
export async function usarHabilidade(
  personagemId: string,
  habilidadeId: string,
  rolagens?: RolagensCura,
  alvoId?: string,
  // Usos empilhados numa rolagem do Rolador.
  vezes?: number,
) {
  return executar("ficha", async () => {
    await aplicarUsoHabilidade(personagemId, habilidadeId, {}, { rolagens, alvoId, vezes });
  });
}

// Liga (consome custos e aplica instantâneos) ou desliga uma habilidade sustentada.
export async function alternarHabilidade(
  personagemId: string,
  habilidadeId: string,
  ligada: boolean,
  rolagens?: RolagensCura,
  alvoId?: string,
) {
  return executar("ficha", async () => {
    if (!ligada) {
      const { personagem } = await autorizar(personagemId);
      const hab = await prisma.habilidade.update({
        where: { id: habilidadeId, personagemId },
        data: { ligada: false },
        select: { alvoPersonagemId: true, aliado: true },
      });
      const soltar = soltarConcentracaoEm(personagemId, personagem.concentracao, habilidadeId);
      if (soltar.length > 0) await prisma.$transaction(soltar);
      revalidatePath(`/ficha/${personagemId}`);
      if (hab.aliado && hab.alvoPersonagemId) revalidatePath(`/ficha/${hab.alvoPersonagemId}`);
      return;
    }
    await aplicarUsoHabilidade(
      personagemId,
      habilidadeId,
      { ligada: true },
      { incluirMax: false, rolagens, alvoId },
    );
  });
}

// O Rolador rolou com a vantagem ou desvantagem de uso único de uma técnica:
// a condição que a dava some.
export async function gastarCondicaoDaRolagem(personagemId: string, condicaoIds: string[]) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const ids = (Array.isArray(condicaoIds) ? condicaoIds : []).filter((x) => typeof x === "string").slice(0, 12);
    const combate = await participacaoEmCombate(personagemId);
    if (!combate || ids.length === 0) return;
    await gastarCondicoes(combate.instanciaId, ids);
    revalidatePath(`/ficha/${personagemId}`);
    revalidatePath(`/narrador/${combate.mesaId}`);
  });
}

// Quem recebe desliga a habilidade que um aliado ligou nele, ou tira de si o
// que a ação de um aliado deixou valendo (a ação segue em curso no dono).
export async function dispensarRecebida(personagemId: string, habilidadeId: string) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const hab = await prisma.habilidade.findFirst({
      where: { id: habilidadeId, alvoPersonagemId: personagemId, ligada: true },
      select: { id: true, personagemId: true },
    });
    if (!hab) {
      const acao = await prisma.acao.findFirst({
        where: { id: habilidadeId, aliadoEmCursoId: personagemId },
        select: { personagemId: true },
      });
      if (!acao) throw new ErroDeUso("Esse efeito já não está em você.");
      await prisma.acao.update({
        where: { id: habilidadeId, aliadoEmCursoId: personagemId },
        data: { aliadoEmCursoId: null },
      });
      revalidatePath(`/ficha/${personagemId}`);
      revalidatePath(`/ficha/${acao.personagemId}`);
      return;
    }
    await prisma.habilidade.update({
      where: { id: hab.id, alvoPersonagemId: personagemId },
      data: { ligada: false },
    });
    revalidatePath(`/ficha/${personagemId}`);
    revalidatePath(`/ficha/${hab.personagemId}`);
  });
}

// Usa 1 unidade do item: aplica os efeitos na hora dele em quem usa ou num
// aliado da mesa e tira o item quando acaba.
export async function usarItem(
  personagemId: string,
  itemId: string,
  rolagens?: RolagensCura,
  alvoId?: string,
) {
  return executar("ficha", async () => {
    const [{ personagem }, { agg }, item] = await Promise.all([
      autorizar(personagemId),
      carregarAgregado(personagemId),
      prisma.item.findFirst({ where: { id: itemId, personagemId } }),
    ]);
    if (!item) throw new ErroDeUso("Item não encontrado.");
    const efeitos = lerEfeitos(item.efeitos).filter(efeitoInstantaneo);
    if (efeitos.length === 0) throw new ErroDeUso("Esse item não tem o que usar.");
    const aliado = alvoId && alvoId !== personagemId ? await aliadoDoUso(personagem, alvoId) : null;

    const ops = await opsDoUso({
      personagemId,
      personagem,
      agg,
      efeitos,
      rolagens,
      incluirMax: false,
      custoPp: 0,
      recurso: null,
      custoRecurso: 0,
      aliado,
    });
    ops.push(
      item.quantidade > 1
        ? prisma.item.update({
            where: { id: item.id, personagemId },
            data: { quantidade: item.quantidade - 1 },
          })
        : prisma.item.delete({ where: { id: item.id, personagemId } }),
    );
    await prisma.$transaction(ops);
    revalidatePath(`/ficha/${personagemId}`);
    if (aliado) revalidatePath(`/ficha/${aliado.personagem.id}`);
  });
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

// Soma até o máximo; nunca derruba o que já estava acima dele.
function somarAteOMaximo(atual: number, delta: number, max: number): number {
  if (delta <= 0) return Math.max(0, atual + delta);
  return Math.max(atual, Math.min(atual + delta, max));
}

function atributosDoPersonagem(p: Record<Atributo, number>): Record<Atributo, number> {
  return {
    forca: p.forca,
    destreza: p.destreza,
    constituicao: p.constituicao,
    sabedoria: p.sabedoria,
    vontade: p.vontade,
    presenca: p.presenca,
  };
}

// ─── Subfichas ─────────────────────────────────────────────
// Ficha com dono: de um personagem (lacaio, animal) ou da mesa (o navio da
// tripulação). Subficha não tem subficha.

type SubfichaInput = {
  nome?: unknown;
  perfil?: unknown;
  molde?: unknown;
  hpMax?: unknown;
  // Vale pra mesa inteira (a ficha de quem cria precisa estar numa).
  daMesa?: unknown;
  // Navio do livro como ficha de partida (lib/navio.ts, MontagemNavio).
  navio?: unknown;
};

function nomeDeSubficha(raw: unknown): string {
  const nome = typeof raw === "string" ? raw.trim().slice(0, MAX_NOME_SUBFICHA) : "";
  if (!nome) throw new ErroDeUso("Dê um nome pra subficha.");
  return nome;
}

function perfilDeSubficha(raw: unknown): string {
  if (!PERFIS_DE_SUBFICHA.some((p) => p.slug === raw)) throw new ErroDeUso("Perfil inválido.");
  return raw as string;
}

export async function criarSubficha(personagemId: string, input: SubfichaInput) {
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);
    if (ehSubficha(personagem)) throw new ErroDeUso("Subficha não tem subficha.");

    const daMesa = input.daMesa === true;
    const mesa = daMesa ? personagem.mesa : null;
    if (daMesa && !mesa) throw new ErroDeUso("Entre em uma mesa pra criar a ficha dela.");
    const id = await novaSubficha(
      mesa
        ? { userId: mesa.userId, donoMesaId: mesa.id, mesaId: mesa.id, doNarrador: false }
        : { userId: personagem.userId, donoPersonagemId: personagemId, mesaId: personagem.mesaId },
      input,
    );
    revalidatePath(`/ficha/${personagemId}`);
    return { id };
  });
}

// Navio do narrador (inimigo): ficha da mesa que só ele vê.
export async function criarNavioDoNarrador(mesaId: string, input: SubfichaInput) {
  return executar("narrador", async () => {
    const [user, mesa] = await Promise.all([
      usuarioDaRequest(),
      prisma.mesa.findUnique({ where: { id: mesaId }, select: { userId: true } }),
    ]);
    if (!user) throw new ErroDeUso("Não autenticado.");
    if (!mesa || mesa.userId !== user.id) throw new ErroDeUso("Só o narrador da mesa cria navio inimigo.");
    const id = await novaSubficha(
      { userId: user.id, donoMesaId: mesaId, mesaId, doNarrador: true },
      { ...input, perfil: "veiculo", molde: false },
    );
    revalidatePath(`/narrador/${mesaId}`);
    return { id };
  });
}

// Cria a subficha (e, num navio do livro, as habilidades, os canhões e a montagem).
async function novaSubficha(
  dono: {
    userId: string;
    mesaId: string | null;
    donoPersonagemId?: string;
    donoMesaId?: string;
    doNarrador?: boolean;
  },
  input: SubfichaInput,
): Promise<string> {
  const doDono = dono.donoMesaId
    ? { donoMesaId: dono.donoMesaId, doNarrador: !!dono.doNarrador }
    : { donoPersonagemId: dono.donoPersonagemId! };
  const quantas = await prisma.personagem.count({ where: { ...doDono, moldeId: null } });
  if (quantas >= (dono.donoMesaId ? MAX_SUBFICHAS_DA_MESA : MAX_SUBFICHAS)) {
    throw new ErroDeUso("Limite de subfichas atingido.");
  }

  const nome = nomeDeSubficha(input.nome);
  const perfil = perfilDeSubficha(input.perfil);
  const navio = perfil === "veiculo" && input.navio ? lerMontagem(input.navio) : null;
  if (perfil === "veiculo" && input.navio && !navio) throw new ErroDeUso("Navio inválido.");
  const preset = navio ? presetDeNavio(navio) : null;
  const hpMax = preset?.hpMax ?? clamp(Math.trunc(Number(input.hpMax) || 0), 0, 99999);

  const id = randomUUID();
  await prisma.$transaction([
    prisma.personagem.create({
      data: {
        id,
        // A da mesa é do narrador; a de personagem, de quem é o dono.
        userId: dono.userId,
        ...doDono,
        // Joga na mesa do dono.
        mesaId: dono.mesaId,
        nome,
        perfil,
        molde: !dono.donoMesaId && input.molde === true,
        hpMax,
        hpAtual: hpMax,
        ...(navio ? { navio: { montagem: navio, comandanteId: null } } : {}),
        // Veículo não tem atributo: 10 deixa todo modificador em zero.
        ...(perfil === "veiculo"
          ? {
              forca: 10,
              destreza: 10,
              constituicao: 10,
              sabedoria: 10,
              vontade: 10,
              presenca: 10,
              deslocamento: preset?.deslocamento ?? 0,
              nado: 0,
            }
          : {}),
      },
    }),
    ...(preset
      ? [
          prisma.habilidade.createMany({
            data: preset.habilidades.map((h, ordem) => ({
              personagemId: id,
              nome: h.nome,
              tipo: "passiva",
              descricao: h.descricao,
              tags: h.tags,
              ordem,
              efeitos: h.efeitos,
            })),
          }),
          ...opsDosCanhoes(id, navio!),
        ]
      : []),
  ]);
  return id;
}

// Canhões do navio: a arma (quantidade = canhões), a munição e a ação que dispara.
function opsDosCanhoes(personagemId: string, m: MontagemNavio): Prisma.PrismaPromise<unknown>[] {
  if (m.canhoes <= 0) return [];
  const canhaoId = randomUUID();
  const bolaId = randomUUID();
  const arma = armaDosCanhoes(m);
  return [
    prisma.item.create({
      data: {
        id: bolaId,
        personagemId,
        nome: BOLA_DE_CHUMBO.nome,
        tipo: "municao",
        quantidade: m.canhoes * BOLAS_POR_CANHAO,
        dano: `${BOLA_DE_CHUMBO.dano} ${BOLA_DE_CHUMBO.tipo.toLowerCase()}`,
      },
    }),
    prisma.item.create({
      data: {
        id: canhaoId,
        personagemId,
        nome: arma.nome,
        descricao: arma.descricao,
        tipo: "arma",
        quantidade: m.canhoes,
        categoria: "fogo",
        alcance: "distancia",
        alcanceMetros: arma.alcanceMetros,
        modificador: arma.modificador,
        propriedades: ["municao"],
        proficienteArma: false,
        equipado: true,
        municaoId: bolaId,
        efeitos: arma.efeitos,
      },
    }),
    prisma.acao.create({
      data: {
        personagemId,
        ...acaoDosCanhoes(m),
        armaIds: [canhaoId],
        tipoDano: BOLA_DE_CHUMBO.tipo,
        armaDeFogo: true,
      },
    }),
  ];
}

// Quem comanda o navio (a salvaguarda de estrutura sai da VON dele): um
// jogador da mesa do navio; null tira.
export async function definirComandante(navioId: string, comandanteId: string | null) {
  return executar("ficha", async () => {
    const { personagem } = await autorizar(navioId);
    const navio = lerNavio(personagem.navio);
    if (!navio) throw new ErroDeUso("Esta ficha não é de navio.");
    if (comandanteId) {
      const ok = await prisma.personagem.findFirst({
        where: { id: comandanteId, mesaId: personagem.mesaId ?? "-", ...SO_PRINCIPAIS },
        select: { id: true },
      });
      if (!ok) throw new ErroDeUso("Comandante não é jogador desta mesa.");
    }
    await prisma.personagem.update({
      where: { id: navioId },
      data: { navio: { ...navio, comandanteId: comandanteId || null } },
    });
    revalidarFicha(personagem);
  });
}

// Subficha autorizada; `autorizar` já cobre dono, narrador e membro da mesa.
async function autorizarSubficha(subfichaId: string) {
  const acesso = await autorizar(subfichaId);
  if (!ehSubficha(acesso.personagem)) throw new ErroDeUso("Esta ficha não é subficha.");
  return acesso;
}

export async function atualizarSubficha(
  subfichaId: string,
  patch: { nome?: unknown; perfil?: unknown; molde?: unknown; abas?: unknown },
) {
  return executar("ficha", async () => {
    const { personagem } = await autorizarSubficha(subfichaId);

    const data: Prisma.PersonagemUpdateInput = {};
    if (patch.nome !== undefined) data.nome = nomeDeSubficha(patch.nome);
    if (patch.perfil !== undefined) data.perfil = perfilDeSubficha(patch.perfil);
    if (patch.molde !== undefined) {
      // Só ficha de personagem que não é cópia vira molde.
      if (patch.molde === true && (personagem.donoMesaId || personagem.moldeId)) {
        throw new ErroDeUso("Esta subficha não pode ser molde.");
      }
      data.molde = patch.molde === true;
    }
    if (patch.abas !== undefined) {
      const abas = lerAbas(patch.abas);
      const padrao = perfilDe(data.perfil ?? personagem.perfil).abas;
      // Iguais às do perfil, não guarda nada.
      const iguais = !!abas && abas.length === padrao.length && abas.every((a) => padrao.includes(a));
      data.abas = !abas || iguais ? Prisma.DbNull : abas;
    }
    if (Object.keys(data).length === 0) return;

    await prisma.personagem.update({ where: { id: subfichaId }, data });
    revalidarFicha(personagem);
  });
}

// Apaga as fichas e desliga as habilidades de aliado que estavam nelas.
async function apagarFichas(where: Prisma.PersonagemWhereInput) {
  const ids = (await prisma.personagem.findMany({ where, select: { id: true } })).map((p) => p.id);
  if (ids.length === 0) return;
  await prisma.$transaction([
    prisma.habilidade.updateMany({
      where: { alvoPersonagemId: { in: ids }, ligada: true },
      data: { ligada: false },
    }),
    prisma.personagem.deleteMany({ where: { id: { in: ids } } }),
  ]);
}

// Apaga a subficha; se for molde, as cópias somem junto.
export async function apagarSubficha(subfichaId: string) {
  return executar("ficha", async () => {
    const { personagem } = await autorizarSubficha(subfichaId);
    await apagarFichas({
      OR: [
        { id: subfichaId },
        ...(personagem.molde && personagem.donoPersonagemId
          ? [{ moldeId: subfichaId, donoPersonagemId: personagem.donoPersonagemId }]
          : []),
      ],
    });
    revalidarFicha(personagem);
  });
}

// Cópias novas de um molde, cada uma com a ficha inteira dele.
export async function invocarCopias(moldeId: string, quantidade: number) {
  return executar("ficha", async () => {
    const [{ personagem }, origem] = await Promise.all([
      autorizarSubficha(moldeId),
      carregarParaCopia(moldeId),
    ]);
    const donoPersonagemId = personagem.donoPersonagemId;
    if (!personagem.molde || !donoPersonagemId || !origem) {
      throw new ErroDeUso("Só um molde invoca cópias.");
    }
    const quantas = clamp(Math.trunc(Number(quantidade) || 0), 1, MAX_COPIAS);
    const existentes = await prisma.personagem.findMany({
      where: { moldeId, donoPersonagemId },
      select: { nome: true },
    });
    if (existentes.length + quantas > MAX_COPIAS) {
      throw new ErroDeUso(`Um molde tem até ${MAX_COPIAS} cópias.`);
    }

    const linhas = semLinhas();
    const nomes = nomesDasCopias(
      origem.nome,
      existentes.map((c) => c.nome),
      quantas,
    );
    const copias = nomes.map((nome) => ({
      id: copiarFicha(origem, { nome, molde: false, moldeId }, linhas),
      nome,
    }));
    await prisma.$transaction(opsDeCopia(linhas));
    revalidarFicha(personagem);
    return { copias };
  });
}

// Dispensa (apaga) cópias de um molde; sem `ids`, todas.
export async function dispensarCopias(moldeId: string, ids?: string[]) {
  return executar("ficha", async () => {
    const { personagem } = await autorizarSubficha(moldeId);
    if (!personagem.donoPersonagemId) throw new ErroDeUso("Só um molde tem cópias.");
    await apagarFichas({
      moldeId,
      donoPersonagemId: personagem.donoPersonagemId,
      ...(Array.isArray(ids) ? { id: { in: ids.filter((i) => typeof i === "string") } } : {}),
    });
    revalidarFicha(personagem);
  });
}

// ─── Árvores de talento ────────────────────────────────────

const ALLOWED_ARVORE = [
  "nome",
  "icone",
  "cor",
  "cor2",
  "efeito",
  "ordem",
  "criterio",
  "recursoCustoId",
  "fundoUrl",
] as const;
type ArvoreInput = Partial<Record<(typeof ALLOWED_ARVORE)[number], unknown>>;

function normalizarArvore(input: ArvoreInput) {
  const data: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = String(input.nome).trim();
    if (!nome) throw new ErroDeUso("Nome da árvore é obrigatório.");
    data.nome = nome.slice(0, 60);
  }
  if (input.icone !== undefined) {
    data.icone = String(input.icone).trim().slice(0, 40) || "fa-sitemap";
  }
  if (input.cor !== undefined) data.cor = corValida(input.cor);
  if (input.cor2 !== undefined) data.cor2 = corValida(input.cor2);
  if (input.efeito !== undefined) data.efeito = normalizarEfeitoCor(input.efeito);
  if (input.ordem !== undefined) data.ordem = Math.trunc(Number(input.ordem) || 0);
  if (input.criterio !== undefined) data.criterio = normalizarCriterio(input.criterio);
  if (input.recursoCustoId !== undefined) {
    data.recursoCustoId = input.recursoCustoId ? String(input.recursoCustoId) : null;
  }
  if (input.fundoUrl !== undefined) {
    const v = input.fundoUrl ? String(input.fundoUrl).trim().slice(0, 500) : "";
    // Só http(s) — evita javascript:/data: virando background do canvas.
    data.fundoUrl = /^https?:\/\//i.test(v) ? v : null;
  }
  return data;
}

async function arvoreDoPersonagem(personagemId: string, arvoreId: string) {
  const arvore = await prisma.arvore.findFirst({
    where: { id: arvoreId, personagemId },
    include: {
      camadas: { orderBy: { ordem: "asc" } },
      ramos: { orderBy: { ordem: "asc" } },
      nos: { orderBy: { ordem: "asc" } },
    },
  });
  if (!arvore) throw new ErroDeUso("Árvore não encontrada.");
  return arvore;
}

export async function criarArvore(
  personagemId: string,
  input: ArvoreInput & { preset?: unknown },
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarArvore(input);
    if (data.nome === undefined) throw new ErroDeUso("Nome da árvore é obrigatório.");

    // Sem preset explícito cai no "Em branco".
    const preset = acharPreset(input.preset);

    // Ids gerados aqui pros requisitos do molde apontarem pros nós novos.
    const arvoreId = randomUUID();
    const camadaIds = preset.camadas.map(() => randomUUID());
    const ramoIds = preset.ramos.map(() => randomUUID());
    const nos = nosDoMolde(preset.slug, { arvoreId, camadaIds, ramoIds }, randomUUID);

    await prisma.$transaction([
      prisma.arvore.create({
        data: {
          id: arvoreId,
          personagemId,
          nome: data.nome as string,
          icone: (data.icone as string) ?? preset.icone,
          cor: (data.cor as string | null) ?? null,
          cor2: (data.cor2 as string | null) ?? null,
          efeito: (data.efeito as string) ?? "solido",
          ordem: (data.ordem as number) ?? 0,
          criterio: (data.criterio as string) ?? preset.criterio,
          recursoCustoId: (data.recursoCustoId as string | null) ?? null,
          fundoUrl: (data.fundoUrl as string | null) ?? null,
          camadas: {
            create: preset.camadas.map((c, i) => ({
              id: camadaIds[i],
              nome: c.nome,
              ordem: i,
              limiar: c.limiar,
            })),
          },
          ramos: {
            create: preset.ramos.map((nome, i) => ({ id: ramoIds[i], nome, ordem: i })),
          },
        },
      }),
      ...(nos.length > 0 ? [prisma.arvoreNo.createMany({ data: nos })] : []),
    ]);
    revalidatePath(`/ficha/${personagemId}`);
    return { id: arvoreId, camadaId: camadaIds[0] ?? null };
  });
}

export async function atualizarArvore(
  personagemId: string,
  arvoreId: string,
  patch: ArvoreInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarArvore(patch);
    await prisma.arvore.update({ where: { id: arvoreId, personagemId }, data });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarArvore(personagemId: string, arvoreId: string) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await prisma.arvore.delete({ where: { id: arvoreId, personagemId } });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Camadas ───────────────────────────────────────────────
const ALLOWED_CAMADA = ["nome", "ordem", "limiar"] as const;
type CamadaInput = Partial<Record<(typeof ALLOWED_CAMADA)[number], unknown>>;

function normalizarCamada(input: CamadaInput) {
  const data: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = String(input.nome).trim();
    if (!nome) throw new ErroDeUso("Nome da camada é obrigatório.");
    data.nome = nome.slice(0, 40);
  }
  if (input.ordem !== undefined) data.ordem = Math.trunc(Number(input.ordem) || 0);
  if (input.limiar !== undefined) {
    data.limiar = Math.max(0, Math.trunc(Number(input.limiar) || 0));
  }
  return data;
}

export async function criarCamada(
  personagemId: string,
  arvoreId: string,
  input: CamadaInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
    const data = normalizarCamada(input);

    const camada = await prisma.arvoreCamada.create({
      data: {
        arvoreId,
        nome: (data.nome as string) ?? `Camada ${arvore.camadas.length + 1}`,
        ordem: (data.ordem as number) ?? arvore.camadas.length,
        limiar: (data.limiar as number) ?? 0,
      },
    });
    revalidatePath(`/ficha/${personagemId}`);
    return { id: camada.id };
  });
}

export async function atualizarCamada(
  personagemId: string,
  arvoreId: string,
  camadaId: string,
  patch: CamadaInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await arvoreDoPersonagem(personagemId, arvoreId);
    const data = normalizarCamada(patch);
    await prisma.arvoreCamada.update({ where: { id: camadaId, arvoreId }, data });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarCamada(
  personagemId: string,
  arvoreId: string,
  camadaId: string,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
    if (arvore.camadas.length <= 1) {
      throw new ErroDeUso("A árvore precisa de pelo menos uma camada.");
    }
    await prisma.arvoreCamada.delete({ where: { id: camadaId, arvoreId } });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Nós ───────────────────────────────────────────────────
const ALLOWED_NO = [
  "camadaId",
  "ramoId",
  "coluna",
  "linha",
  "nome",
  "descricao",
  "icone",
  "custo",
  "maxRanks",
  "nivelMinimo",
  "habilidadeId",
  "requisitos",
  "ordem",
] as const;
type NoInput = Partial<Record<(typeof ALLOWED_NO)[number], unknown>>;

function normalizarNo(input: NoInput) {
  const data: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = String(input.nome).trim();
    if (!nome) throw new ErroDeUso("Nome do talento é obrigatório.");
    data.nome = nome.slice(0, 60);
  }
  if (input.camadaId !== undefined) data.camadaId = String(input.camadaId);
  if (input.ramoId !== undefined) data.ramoId = input.ramoId ? String(input.ramoId) : null;
  if (input.coluna !== undefined) data.coluna = clampColuna(input.coluna);
  if (input.linha !== undefined) data.linha = clampLinha(input.linha);
  if (input.descricao !== undefined) data.descricao = String(input.descricao);
  if (input.icone !== undefined) {
    data.icone = String(input.icone).trim().slice(0, 40) || "fa-circle-nodes";
  }
  if (input.custo !== undefined) data.custo = Math.max(0, Math.trunc(Number(input.custo) || 0));
  if (input.maxRanks !== undefined) {
    const n = Math.trunc(Number(input.maxRanks) || 1);
    data.maxRanks = Math.max(1, Math.min(n, MAX_RANKS_TETO));
  }
  if (input.nivelMinimo !== undefined) {
    data.nivelMinimo = Math.max(0, Math.trunc(Number(input.nivelMinimo) || 0));
  }
  if (input.habilidadeId !== undefined) {
    data.habilidadeId = input.habilidadeId ? String(input.habilidadeId) : null;
  }
  if (input.ordem !== undefined) data.ordem = Math.trunc(Number(input.ordem) || 0);
  if (input.requisitos !== undefined) {
    data.requisitos = lerRequisitos(input.requisitos);
  }
  return data;
}

function validarVinculosDoNo(
  data: Record<string, unknown>,
  arvore: { camadas: { id: string }[]; ramos: { id: string }[]; nos: { id: string }[] },
  noId: string | null,
) {
  if (data.camadaId !== undefined) {
    const ok = arvore.camadas.some((c) => c.id === data.camadaId);
    if (!ok) throw new ErroDeUso("Camada não pertence a esta árvore.");
  }
  if (data.ramoId) {
    const ok = arvore.ramos.some((r) => r.id === data.ramoId);
    if (!ok) throw new ErroDeUso("Ramo não pertence a esta árvore.");
  }
  if (data.requisitos !== undefined) {
    const idsValidos = new Set(arvore.nos.map((n) => n.id));
    const reqs = data.requisitos as RequisitoNo[];
    for (const r of reqs) {
      if (r.noId === noId) throw new ErroDeUso("Um talento não pode exigir a si mesmo.");
      if (!idsValidos.has(r.noId)) {
        throw new ErroDeUso("Requisito aponta pra talento de outra árvore.");
      }
    }
    if (noId && criaCiclo(noId, reqs, arvore.nos as NoArvore[])) {
      throw new ErroDeUso("Esse requisito criaria um ciclo na árvore.");
    }
  }
}

function criaCiclo(noId: string, novosReqs: RequisitoNo[], nos: NoArvore[]): boolean {
  const porId = new Map(nos.map((n) => [n.id, n]));
  const vistos = new Set<string>();
  const pilha = novosReqs.map((r) => r.noId);
  while (pilha.length) {
    const atual = pilha.pop()!;
    if (atual === noId) return true;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    const pai = porId.get(atual);
    if (!pai) continue;
    for (const r of lerRequisitos(pai.requisitos)) pilha.push(r.noId);
  }
  return false;
}

export async function criarNo(
  personagemId: string,
  arvoreId: string,
  input: NoInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
    const data = normalizarNo(input);
    if (data.nome === undefined) throw new ErroDeUso("Nome do talento é obrigatório.");
    if (data.camadaId === undefined) throw new ErroDeUso("Escolha a camada do talento.");
    validarVinculosDoNo(data, arvore, null);

    // A célula pedida, se livre; senão a primeira linha livre da mesma coluna.
    const nos = arvore.nos as NoArvore[];
    const celula = {
      camadaId: data.camadaId as string,
      ramoId: raiaEfetiva((data.ramoId as string | null | undefined) ?? null, arvore.ramos),
      coluna: (data.coluna as number | undefined) ?? 0,
    };
    const linhaPedida = data.linha as number | undefined;
    const linha =
      linhaPedida !== undefined && !noNaCelula({ ...celula, linha: linhaPedida }, nos, arvore.ramos)
        ? linhaPedida
        : primeiraLinhaLivre(celula, nos, arvore.ramos);

    const no = await prisma.arvoreNo.create({
      data: {
        arvoreId,
        ...celula,
        linha,
        nome: data.nome as string,
        descricao: (data.descricao as string) ?? "",
        icone: (data.icone as string) ?? "fa-circle-nodes",
        custo: (data.custo as number) ?? 0,
        maxRanks: (data.maxRanks as number) ?? 1,
        nivelMinimo: (data.nivelMinimo as number) ?? 0,
        habilidadeId: (data.habilidadeId as string | null) ?? null,
        requisitos: (data.requisitos as RequisitoNo[]) ?? [],
        ordem: (data.ordem as number) ?? arvore.nos.length,
      },
    });
    revalidatePath(`/ficha/${personagemId}`);
    return { id: no.id };
  });
}

export async function atualizarNo(
  personagemId: string,
  arvoreId: string,
  noId: string,
  patch: NoInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
    const data = normalizarNo(patch);
    validarVinculosDoNo(data, arvore, noId);
    const atual = arvore.nos.find((n) => n.id === noId);
    if (!atual) throw new ErroDeUso("Talento não encontrado.");

    // Baixar o teto de ranks não pode deixar o progresso acima dele.
    if (data.maxRanks !== undefined && atual.rankAtual > (data.maxRanks as number)) {
      data.rankAtual = data.maxRanks;
    }

    // Mudou de célula: se ocupada, desce pra primeira linha livre.
    if (["camadaId", "ramoId", "coluna", "linha"].some((k) => data[k] !== undefined)) {
      const nos = arvore.nos as NoArvore[];
      const alvo = {
        camadaId: (data.camadaId as string | undefined) ?? atual.camadaId,
        ramoId: raiaEfetiva(
          data.ramoId !== undefined ? (data.ramoId as string | null) : atual.ramoId,
          arvore.ramos,
        ),
        coluna: (data.coluna as number | undefined) ?? atual.coluna,
        linha: (data.linha as number | undefined) ?? atual.linha,
      };
      if (noNaCelula(alvo, nos, arvore.ramos, noId)) {
        alvo.linha = primeiraLinhaLivre(alvo, nos, arvore.ramos, noId);
      }
      Object.assign(data, alvo);
    }

    await prisma.arvoreNo.update({ where: { id: noId, arvoreId }, data });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarNo(
  personagemId: string,
  arvoreId: string,
  noId: string,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);

    // Limpa requisitos órfãos nos filhos antes de apagar o pai.
    const filhos = arvore.nos.filter((n) =>
      lerRequisitos(n.requisitos).some((r) => r.noId === noId),
    );
    await prisma.$transaction([
      ...filhos.map((f) =>
        prisma.arvoreNo.update({
          where: { id: f.id, arvoreId },
          data: {
            requisitos: lerRequisitos(f.requisitos).filter((r) => r.noId !== noId),
          },
        }),
      ),
      prisma.arvoreNo.delete({ where: { id: noId, arvoreId } }),
    ]);
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Comprar / devolver rank ───────────────────────────────
// O server revalida com o mesmo `estadoNo` do cliente.

async function contextoDaArvore(
  personagemId: string,
  arvore: { criterio: string; recursoCustoId: string | null; nos: NoArvore[] },
  nivelPersonagem: number,
): Promise<ContextoArvore> {
  let saldoRecurso: number | null = null;
  if (arvore.recursoCustoId) {
    const recurso = await prisma.recurso.findFirst({
      where: { id: arvore.recursoCustoId, personagemId },
    });
    saldoRecurso = recurso ? recurso.valorAtual : null;
  }
  return {
    criterio: normalizarCriterio(arvore.criterio),
    nivelPersonagem,
    nos: arvore.nos,
    saldoRecurso,
  };
}

export async function comprarNo(
  personagemId: string,
  arvoreId: string,
  noId: string,
) {
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
    const no = arvore.nos.find((n) => n.id === noId);
    if (!no) throw new ErroDeUso("Talento não encontrado.");

    const ctx = await contextoDaArvore(
      personagemId,
      { ...arvore, nos: arvore.nos as NoArvore[] },
      personagem.nivel,
    );
    const estado = estadoNo(no as NoArvore, arvore.camadas, ctx);
    if (!estado.podeComprar) {
      throw new ErroDeUso(estado.bloqueios[0] ?? "Talento indisponível.");
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.arvoreNo.update({
        where: { id: noId, arvoreId },
        data: { rankAtual: { increment: 1 } },
      }),
    ];
    if (arvore.recursoCustoId && ctx.saldoRecurso !== null && estado.custoProximo > 0) {
      ops.push(
        prisma.recurso.update({
          where: { id: arvore.recursoCustoId, personagemId },
          data: { valorAtual: { decrement: estado.custoProximo } },
        }),
      );
    }
    await prisma.$transaction(ops);
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function devolverNo(
  personagemId: string,
  arvoreId: string,
  noId: string,
) {
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
    const no = arvore.nos.find((n) => n.id === noId);
    if (!no) throw new ErroDeUso("Talento não encontrado.");
    if (no.rankAtual <= 0) throw new ErroDeUso("Esse talento não está comprado.");

    const rankAlvo = no.rankAtual - 1;
    const ctx = await contextoDaArvore(
      personagemId,
      { ...arvore, nos: arvore.nos as NoArvore[] },
      personagem.nivel,
    );
    const bloqueios = bloqueiosDevolver(noId, arvore.camadas, ctx);
    if (bloqueios.length > 0) {
      throw new ErroDeUso(`Devolva antes: ${bloqueios.join("; ")}.`);
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.arvoreNo.update({
        where: { id: noId, arvoreId },
        data: { rankAtual: rankAlvo },
      }),
    ];
    if (arvore.recursoCustoId && no.custo > 0) {
      // Reembolso clampado no valorMax, fora da transação.
      const recurso = await prisma.recurso.findFirst({
        where: { id: arvore.recursoCustoId, personagemId },
      });
      if (recurso) {
        // Máximo por fórmula precisa do nível e dos atributos da ficha.
        const max = recurso.valorMaxFormula
          ? maximoDoRecurso(recurso, (await carregarAgregado(personagemId)).agg.ctxFormula)
          : recurso.valorMax;
        ops.push(
          prisma.recurso.update({
            where: { id: recurso.id, personagemId },
            data: {
              valorAtual: Math.min(recurso.valorAtual + no.custo, max),
            },
          }),
        );
      }
    }
    await prisma.$transaction(ops);
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Ramos ────────────────────────────────────────────────

export async function criarRamo(
  personagemId: string,
  arvoreId: string,
  nome: string,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
    const limpo = String(nome).trim().slice(0, 40);
    if (!limpo) throw new ErroDeUso("Nome do ramo é obrigatório.");

    const ramo = await prisma.arvoreRamo.create({
      data: { arvoreId, nome: limpo, ordem: arvore.ramos.length },
    });
    revalidatePath(`/ficha/${personagemId}`);
    return { id: ramo.id };
  });
}

export async function atualizarRamo(
  personagemId: string,
  arvoreId: string,
  ramoId: string,
  patch: { nome?: unknown; ordem?: unknown },
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await arvoreDoPersonagem(personagemId, arvoreId);
    const data: Record<string, unknown> = {};
    if (patch.nome !== undefined) {
      const limpo = String(patch.nome).trim().slice(0, 40);
      if (!limpo) throw new ErroDeUso("Nome do ramo é obrigatório.");
      data.nome = limpo;
    }
    if (patch.ordem !== undefined) data.ordem = Math.trunc(Number(patch.ordem) || 0);

    await prisma.arvoreRamo.update({ where: { id: ramoId, arvoreId }, data });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarRamo(
  personagemId: string,
  arvoreId: string,
  ramoId: string,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await arvoreDoPersonagem(personagemId, arvoreId);
    // ramoId é SetNull: os nós voltam pro primeiro ramo.
    await prisma.arvoreRamo.delete({ where: { id: ramoId, arvoreId } });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

/** Leva o nó pra outra célula da grade; se ela tiver dono, os dois trocam de lugar. */
export async function moverNo(
  personagemId: string,
  arvoreId: string,
  noId: string,
  destino: { camadaId: string; ramoId: string | null; coluna: number; linha: number },
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const arvore = await arvoreDoPersonagem(personagemId, arvoreId);
    const no = arvore.nos.find((n) => n.id === noId);
    if (!no) throw new ErroDeUso("Talento não encontrado.");
    if (!arvore.camadas.some((c) => c.id === destino.camadaId)) {
      throw new ErroDeUso("Camada não pertence a esta árvore.");
    }
    if (destino.ramoId && !arvore.ramos.some((r) => r.id === destino.ramoId)) {
      throw new ErroDeUso("Ramo não pertence a esta árvore.");
    }

    const alvo = {
      camadaId: destino.camadaId,
      ramoId: raiaEfetiva(destino.ramoId, arvore.ramos),
      coluna: clampColuna(destino.coluna),
      linha: clampLinha(destino.linha),
    };
    const ocupante = noNaCelula(alvo, arvore.nos as NoArvore[], arvore.ramos, noId);
    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.arvoreNo.update({ where: { id: noId, arvoreId }, data: alvo }),
    ];
    if (ocupante) {
      ops.push(
        prisma.arvoreNo.update({
          where: { id: ocupante.id, arvoreId },
          data: {
            camadaId: no.camadaId,
            ramoId: raiaEfetiva(no.ramoId, arvore.ramos),
            coluna: no.coluna,
            linha: no.linha,
          },
        }),
      );
    }
    await prisma.$transaction(ops);
    revalidatePath(`/ficha/${personagemId}`);
  });
}

/**
 * Copia a estrutura da árvore (sem progresso) pra outro personagem ou pro mesmo.
 * habilidadeId e recursoCustoId são religados por nome no destino, ou viram null.
 */
export async function duplicarArvore(
  personagemId: string,
  arvoreOrigemId: string,
) {
  return executar("ficha", async () => {
    const { user } = await autorizar(personagemId);

    const origem = await prisma.arvore.findUnique({
      where: { id: arvoreOrigemId },
      include: {
        personagem: { include: { mesa: true } },
        camadas: { orderBy: { ordem: "asc" } },
        ramos: { orderBy: { ordem: "asc" } },
        nos: { orderBy: { ordem: "asc" } },
      },
    });
    if (!origem) throw new ErroDeUso("Árvore de origem não encontrada.");

    // Acesso à origem é checado à parte: `autorizar` cobriu só o destino.
    const podeLerOrigem =
      origem.personagem.userId === user.id ||
      origem.personagem.mesa?.userId === user.id;
    if (!podeLerOrigem) throw new ErroDeUso("Sem acesso à árvore de origem.");

    const [habilidadesDestino, recursosDestino] = await Promise.all([
      prisma.habilidade.findMany({
        where: { personagemId },
        select: { id: true, nome: true },
      }),
      prisma.recurso.findMany({
        where: { personagemId },
        select: { id: true, nome: true },
      }),
    ]);
    const habPorNome = new Map(
      habilidadesDestino.map((h) => [h.nome.trim().toLowerCase(), h.id]),
    );
    const recPorNome = new Map(
      recursosDestino.map((r) => [r.nome.trim().toLowerCase(), r.id]),
    );

    let recursoCustoId: string | null = null;
    if (origem.recursoCustoId) {
      const original = await prisma.recurso.findUnique({
        where: { id: origem.recursoCustoId },
        select: { nome: true },
      });
      if (original) {
        recursoCustoId = recPorNome.get(original.nome.trim().toLowerCase()) ?? null;
      }
    }

    const mesmoDono = origem.personagemId === personagemId;
    const nome = mesmoDono ? `${origem.nome} (cópia)`.slice(0, 60) : origem.nome;

    const ordemFinal = await prisma.arvore.count({ where: { personagemId } });

    // 1: árvore, camadas e raias.
    const nova = await prisma.arvore.create({
      data: {
        personagemId,
        nome,
        icone: origem.icone,
        cor: origem.cor,
        cor2: origem.cor2,
        efeito: origem.efeito,
        ordem: ordemFinal,
        criterio: origem.criterio,
        recursoCustoId,
        fundoUrl: origem.fundoUrl,
        camadas: {
          create: origem.camadas.map((c) => ({
            nome: c.nome,
            ordem: c.ordem,
            limiar: c.limiar,
          })),
        },
        ramos: {
          create: origem.ramos.map((r) => ({ nome: r.nome, ordem: r.ordem })),
        },
      },
      include: {
        camadas: { orderBy: { ordem: "asc" } },
        ramos: { orderBy: { ordem: "asc" } },
      },
    });

    // Pareamento por índice: a ordem é preservada, nomes podem repetir.
    const mapaCamada = new Map<string, string>();
    origem.camadas.forEach((c, i) => {
      const destino = nova.camadas[i];
      if (destino) mapaCamada.set(c.id, destino.id);
    });
    const mapaRamo = new Map<string, string>();
    origem.ramos.forEach((r, i) => {
      const destino = nova.ramos[i];
      if (destino) mapaRamo.set(r.id, destino.id);
    });

    // 2: talentos, ainda sem requisitos.
    const mapaNo = new Map<string, string>();
    for (const no of origem.nos) {
      const camadaId = mapaCamada.get(no.camadaId);
      if (!camadaId) continue; // camada órfã — não deveria acontecer
      const criado = await prisma.arvoreNo.create({
        data: {
          arvoreId: nova.id,
          camadaId,
          ramoId: no.ramoId ? mapaRamo.get(no.ramoId) ?? null : null,
          coluna: no.coluna,
          linha: no.linha,
          nome: no.nome,
          descricao: no.descricao,
          icone: no.icone,
          custo: no.custo,
          maxRanks: no.maxRanks,
          rankAtual: 0,
          nivelMinimo: no.nivelMinimo,
          habilidadeId: habPorNome.get(no.nome.trim().toLowerCase()) ?? null,
          requisitos: [],
          ordem: no.ordem,
        },
        select: { id: true },
      });
      mapaNo.set(no.id, criado.id);
    }

    // 3: requisitos com os ids novos.
    const comRequisitos = origem.nos
      .map((no) => {
        const reqs = lerRequisitos(no.requisitos)
          .map((r) => {
            const alvo = mapaNo.get(r.noId);
            return alvo ? { noId: alvo, rank: r.rank } : null;
          })
          .filter((r): r is RequisitoNo => r !== null);
        const id = mapaNo.get(no.id);
        return id && reqs.length > 0 ? { id, reqs } : null;
      })
      .filter((x): x is { id: string; reqs: RequisitoNo[] } => x !== null);

    if (comRequisitos.length > 0) {
      await prisma.$transaction(
        comRequisitos.map((x) =>
          prisma.arvoreNo.update({
            where: { id: x.id, arvoreId: nova.id },
            data: { requisitos: x.reqs },
          }),
        ),
      );
    }

    revalidatePath(`/ficha/${personagemId}`);
    return { id: nova.id, talentos: mapaNo.size };
  });
}

// ─── Dano e cura ───────────────────────────────────────────

const MAX_PARTES_DANO = 6;

function normalizarPartesDano(raw: unknown): ParteDano[] {
  if (!Array.isArray(raw)) return [];
  const out: ParteDano[] = [];
  for (const item of raw.slice(0, MAX_PARTES_DANO)) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const valor = Math.min(99999, Math.max(0, Math.trunc(Number(obj.valor) || 0)));
    if (valor <= 0) continue;
    out.push({ valor, tipo: typeof obj.tipo === "string" ? obj.tipo.trim().slice(0, 40) : "" });
  }
  return out;
}

// Desconta o dano de um personagem com as defesas dele, cuida do que acaba
// junto (PV temporário, concentração) e publica no chat. `uid` é quem assina a
// mensagem; no combate é o sistema, pra chegar a todos pelo realtime.
async function danoNoPersonagem(entrada: {
  personagem: Awaited<ReturnType<typeof autorizar>>["personagem"];
  agg: EfeitosAgregados;
  uid: string;
  partes: ParteDano[];
  desligadas?: string[];
  semTemp?: boolean;
  // Quem causou (instância do combate) e com o quê, pras estatísticas.
  fonte?: { de: string | null; acao: string };
}) {
  const { personagem, agg, partes } = entrada;
  const personagemId = personagem.id;
  const hpMax = poolsEfetivos(personagem, agg).hpMax;
  const r = resolverDano(partes, defesasDoAgregado(agg), { ...personagem, hpMax }, {
    desligadas: entrada.desligadas ?? [],
    semTemp: entrada.semTemp === true,
    rolar: true,
  });

  // Habilidade que dura "enquanto tiver PV temporário" desliga quando ele acaba.
  const semTempAgora = r.hpTemp.antes > 0 && r.hpTemp.depois === 0;
  const fim = semTempAgora ? await acabaComOPvTemp(personagemId, personagem.concentracao) : null;
  const acabaram = fim?.habilidades ?? [];
  const acoesAcabaram = fim?.acoes ?? [];
  // A 0 PV (incapacitado), ou sem o que a segurava, a concentração acaba.
  const concentracao = lerConcentracao(personagem.concentracao);
  const perdeu = !!concentracao && (r.hpAtual.depois <= 0 || !!fim?.soltaConcentracao);
  const cd = concentracao && !perdeu ? cdConcentracao(r.final) : null;
  const teste = concentracao && cd ? { nome: concentracao.nome, cd } : null;

  const detalhes = {
    personagemId,
    partes: r.partes.map((p) => ({
      valor: p.valor,
      tipo: p.tipo,
      final: p.final,
      texto: descreverParte(p),
    })),
    final: r.final,
    absorvido: r.absorvido,
    hpTemp: [r.hpTemp.antes, r.hpTemp.depois],
    hpAtual: [r.hpAtual.antes, r.hpAtual.depois],
    hpMax,
    pvNegativos: [r.pvNegativos.antes, r.pvNegativos.depois],
    caiu: r.caiu,
    morreu: r.morreu,
    concentracao: teste,
    perdeuConcentracao: perdeu ? concentracao!.nome : null,
    acabaram: [...acabaram, ...acoesAcabaram].map((h) => h.nome),
  };
  const mensagem = prisma.mensagem.create({
    data: {
      sessionId: sessaoDoChat(personagem),
      uid: entrada.uid,
      nome: personagem.nome,
      mensagem: `recebeu ${r.final} de dano`,
      tipo: "dano",
      total: r.final,
      detalhes,
    },
  });
  // Tipo digitado que ainda não estava salvo entra na frente da lista.
  const salvos = lerTiposSalvos(personagem.tiposDano);
  const novos = partes.map((p) => p.tipo).filter((t) => t && !salvos.some((s) => mesmoTipo(s, t)));
  const [criada] = await prisma.$transaction([
    mensagem,
    prisma.personagem.update({
      where: { id: personagemId },
      data: {
        hpAtual: r.hpAtual.depois,
        hpTemp: r.hpTemp.depois,
        ...(semTempAgora ? { hpTempDuracao: null } : {}),
        pvNegativos: r.pvNegativos.depois,
        ...(novos.length > 0
          ? { tiposDano: juntarTipos(novos, salvos).slice(0, MAX_TIPOS_SALVOS) }
          : {}),
      },
    }),
    ...(fim?.ops ?? []),
    ...(perdeu ? opsConcentracao(personagemId, concentracao, null) : []),
  ]);
  if (perdeu) await colateraisDaConcentracao(personagemId, personagem.concentracao);
  await colateraisDoFim(personagemId, acoesAcabaram.map((a) => a.id));
  revalidatePath(`/ficha/${personagemId}`);
  await registrarDanoEmPersonagem(personagemId, r, entrada.fonte);
  return {
    resultado: r,
    mensagem: serializarMensagem(criada as Awaited<typeof mensagem>),
    teste,
    perdeuConcentracao: perdeu,
    acabaram: acabaram.map((h) => ({ id: h.id, nome: h.nome })),
  };
}

// Aplica o dano com as defesas do servidor; o cliente só desliga as que não
// valem no golpe. Publica no chat.
export async function receberDano(
  personagemId: string,
  entrada: { partes: unknown; desligadas?: unknown; semTemp?: unknown },
) {
  return executar("ficha", async () => {
    const partes = normalizarPartesDano(entrada.partes);
    if (partes.length === 0) throw new ErroDeUso("Informe o dano.");
    const desligadas = Array.isArray(entrada.desligadas)
      ? entrada.desligadas.filter((d): d is string => typeof d === "string").slice(0, 40)
      : [];
    const [{ user, personagem }, { agg }] = await Promise.all([
      autorizar(personagemId),
      carregarAgregado(personagemId),
    ]);
    return danoNoPersonagem({
      personagem,
      agg,
      uid: user.id,
      partes,
      desligadas,
      semTemp: entrada.semTemp === true,
    });
  });
}

// Tira um tipo da lista salva (comparado pelas letras).
export async function esquecerTipoDano(personagemId: string, tipo: unknown) {
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);
    const alvo = typeof tipo === "string" ? tipo : "";
    const salvos = lerTiposSalvos(personagem.tiposDano);
    const restantes = salvos.filter((s) => !mesmoTipo(s, alvo));
    if (restantes.length === salvos.length) return;
    await prisma.personagem.update({
      where: { id: personagemId },
      data: { tiposDano: restantes },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// Cura manual de PV, até o máximo efetivo. Publica no chat.
export async function curarPv(personagemId: string, valor: unknown) {
  return executar("ficha", async () => {
    const cura = Math.min(99999, Math.max(0, Math.trunc(Number(valor) || 0)));
    if (cura <= 0) throw new ErroDeUso("Informe a cura.");
    const [{ user, personagem }, { agg }] = await Promise.all([
      autorizar(personagemId),
      carregarAgregado(personagemId),
    ]);
    const hpMax = poolsEfetivos(personagem, agg).hpMax;
    const depois = somarAteOMaximo(personagem.hpAtual, cura, hpMax);
    const [, criada] = await prisma.$transaction([
      prisma.personagem.update({ where: { id: personagemId }, data: { hpAtual: depois } }),
      prisma.mensagem.create({
        data: {
          sessionId: sessaoDoChat(personagem),
          uid: user.id,
          nome: personagem.nome,
          mensagem: `recuperou ${depois - personagem.hpAtual} PV`,
          tipo: "cura",
          total: depois - personagem.hpAtual,
          detalhes: { personagemId, valor: cura, hpAtual: [personagem.hpAtual, depois], hpMax },
        },
      }),
    ]);
    revalidatePath(`/ficha/${personagemId}`);
    await registrarCuraEmPersonagem(personagemId, depois - personagem.hpAtual, "Cura na ficha", "self");
    return { hpAtual: depois, mensagem: serializarMensagem(criada) };
  });
}

// ─── Turno ─────────────────────────────────────────────────

// Passar turno: aplica o "a cada turno" e conta as durações em turnos. O
// cliente rola; o servidor confere cada dado contra a fórmula. Publica no chat.
export async function passarTurno(personagemId: string, rolagens?: unknown) {
  return executar("ficha", async () => {
    const [{ user, personagem }, { agg }, recursos, ligadas, habsValendo, itensEquipados] =
      await Promise.all([
        autorizar(personagemId),
        carregarAgregado(personagemId),
        prisma.recurso.findMany({ where: { personagemId } }),
        prisma.habilidade.findMany({
          where: { personagemId, ligada: true },
          select: { id: true, nome: true, duracao: true, turnosRestantes: true },
        }),
        // Fontes que estão valendo, pro bônus progressivo "por turno".
        prisma.habilidade.findMany({
          where: { personagemId, OR: [{ tipo: "passiva" }, { ligada: true }] },
          select: { id: true, nome: true, efeitos: true },
        }),
        prisma.item.findMany({
          where: { personagemId, equipado: true },
          select: { id: true, nome: true, efeitos: true },
        }),
      ]);
    const concentracao = lerConcentracao(personagem.concentracao);
    const tecnica = concentracaoEmCurso(personagem.concentracao);
    // Ações que seguem valendo: as em curso e a técnica da concentração.
    const acoesValendo = await prisma.acao.findMany({
      where: {
        personagemId,
        OR: [{ emCurso: true }, ...(concentracao?.tipo === "acao" ? [{ id: concentracao.id }] : [])],
      },
      select: SELECT_ACAO_QUE_DURA,
    });
    const acaoConcentrada =
      concentracao?.tipo === "acao" ? (acoesValendo.find((a) => a.id === concentracao.id) ?? null) : null;
    const emCurso = acoesEmCurso(acoesValendo, personagem.concentracao);
    const idsDeAcao = new Set(emCurso.map((a) => a.id));
    const duracoes = [...duracoesEmCurso(ligadas), ...duracoesDasAcoes(emCurso)];
    const porTurno = [...agg.porTurno, ...porTurnoDasAcoes(emCurso)];
    // Bônus progressivo "por turno": um passo a mais em cada fonte que está valendo.
    const crescem = [
      ...habsValendo.map((h) => ({ tabela: "habilidade" as const, ...h })),
      ...itensEquipados.map((i) => ({ tabela: "item" as const, ...i })),
      // Ações em curso e a da concentração (PV máx, CR… que crescem enquanto duram).
      ...acoesValendo.filter((a) => idsDeAcao.has(a.id)).map((a) => ({ tabela: "acao" as const, ...a })),
    ].flatMap((x) => {
      const novo = crescerPorTurno(x.efeitos);
      return novo ? [{ tabela: x.tabela, id: x.id, nome: x.nome, novo }] : [];
    });
    // Condições da ficha (fora do combate): uma rodada a menos.
    const condicoesFicha = lerCondicoesAtivas(personagem.condicoes);
    const bloqueiosAntes = lerBloqueios(personagem.bloqueios);
    if (
      porTurno.length === 0 &&
      duracoes.length === 0 &&
      !tecnica &&
      crescem.length === 0 &&
      !condicoesFicha.some((c) => c.rodadas < RODADAS_MAX) &&
      bloqueiosAntes.length === 0
    ) {
      throw new ErroDeUso("Nada acontece a cada turno.");
    }

    const ctx = agg.ctxFormula ?? { nivel: personagem.nivel, atributos: atributosDoPersonagem(personagem) };
    const resolver = (f: string, grau?: number) => resolverFormula(f, ctx.atributos, ctx.nivel, { grau });
    const pools = poolsEfetivos(personagem, agg);
    const r = aplicarTurno({
      porTurno,
      rolagens: validarRolagensTurno(porTurno, rolagens, resolver),
      estado: {
        hpAtual: personagem.hpAtual,
        hpTemp: personagem.hpTemp,
        hpMax: pools.hpMax,
        pvNegativos: negativosAtuais(personagem.hpAtual, personagem.pvNegativos),
        ppAtual: personagem.ppAtual,
        ppMax: pools.ppMax,
        exaustao: personagem.exaustao,
        recursos: Object.fromEntries(
          recursos.map((x) => [
            x.id,
            { nome: x.nome, valorAtual: x.valorAtual, valorMax: maximoDoRecurso(x, agg.ctxFormula) },
          ]),
        ),
      },
      defesas: defesasDoAgregado(agg),
      duracoes,
      concentracao: tecnica,
      enquantoPvTemp: {
        habilidades: ligadas.filter((h) => acabaSemPvTemp(h.duracao)),
        ...(acaoConcentrada && acabaSemPvTemp(acaoConcentrada.duracao)
          ? { tecnica: acaoConcentrada.nome }
          : {}),
      },
    });

    // Incapacitado, duração acabou, faltou recurso ou a habilidade que segurava desligou: a concentração acaba.
    const perdeu =
      !!concentracao &&
      (r.estado.hpAtual <= 0 ||
        r.estado.exaustao >= 6 ||
        r.concentracaoTurnos === 0 ||
        r.concentracaoSemRecurso ||
        r.concentracaoSemPvTemp ||
        r.desligar.some((h) => h.id === concentracao.id));
    const testes =
      concentracao && !perdeu
        ? r.danos.map(cdConcentracao).filter((cd): cd is number => cd != null)
        : [];

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    // O que desliga neste turno (ou a técnica que perde a concentração) não cresce.
    const desligadas = new Set(r.desligar.map((h) => h.id));
    for (const x of crescem) {
      if (desligadas.has(x.id) || (perdeu && x.id === acaoConcentrada?.id)) continue;
      for (const texto of x.novo.textos) r.linhas.push({ fonte: x.nome, texto });
      const where = { id: x.id, personagemId };
      const data = { efeitos: x.novo.efeitos as unknown as Prisma.InputJsonValue };
      if (x.tabela === "habilidade") ops.push(prisma.habilidade.update({ where, data }));
      else if (x.tabela === "item") ops.push(prisma.item.update({ where, data }));
      else ops.push(prisma.acao.update({ where, data }));
    }
    const dadosPersonagem: Record<string, unknown> = {};
    for (const campo of ["hpAtual", "hpTemp", "pvNegativos", "ppAtual", "exaustao"] as const) {
      if (r.estado[campo] !== personagem[campo]) dadosPersonagem[campo] = r.estado[campo];
    }
    if (perdeu) dadosPersonagem.concentracao = Prisma.DbNull;
    else if (concentracao && r.concentracaoTurnos != null) {
      dadosPersonagem.concentracao = { ...concentracao, turnos: r.concentracaoTurnos };
    }
    // Bloqueios dos colaterais: uma rodada a menos.
    if (bloqueiosAntes.length > 0) {
      const b = passarRodadaDosBloqueios(bloqueiosAntes);
      dadosPersonagem.bloqueios = b.bloqueios;
      for (const x of b.acabaram) r.linhas.push({ fonte: x.fonte || "Colateral", texto: `${textoDoBloqueio(x)} acabou` });
    }
    const passou = passarRodadaNaFicha(condicoesFicha);
    if (passou.condicoes.some((c, i) => c.rodadas !== condicoesFicha[i]?.rodadas) || passou.acabaram.length > 0) {
      dadosPersonagem.condicoes = passou.condicoes;
      for (const nome of passou.acabaram) r.linhas.push({ fonte: nome, texto: "acabou" });
    }
    if (Object.keys(dadosPersonagem).length > 0) {
      ops.push(prisma.personagem.update({ where: { id: personagemId }, data: dadosPersonagem }));
    }
    for (const x of recursos) {
      const novo = r.estado.recursos[x.id]?.valorAtual;
      if (novo != null && novo !== x.valorAtual) {
        ops.push(prisma.recurso.update({ where: { id: x.id, personagemId }, data: { valorAtual: novo } }));
      }
    }
    for (const h of r.desligar) {
      const where = { id: h.id, personagemId };
      ops.push(
        idsDeAcao.has(h.id)
          ? prisma.acao.update({ where, data: { emCurso: false, turnosRestantes: null } })
          : prisma.habilidade.update({ where, data: { ligada: false, turnosRestantes: null } }),
      );
    }
    for (const [id, turnos] of Object.entries(r.turnos)) {
      const args = { where: { id, personagemId }, data: { turnosRestantes: turnos } };
      ops.push(idsDeAcao.has(id) ? prisma.acao.update(args) : prisma.habilidade.update(args));
    }
    const mensagem = prisma.mensagem.create({
      data: {
        sessionId: sessaoDoChat(personagem),
        uid: user.id,
        nome: personagem.nome,
        mensagem: "passou o turno",
        tipo: "turno",
        detalhes: {
          personagemId,
          linhas: r.linhas,
          hpAtual: [personagem.hpAtual, r.estado.hpAtual],
          hpMax: pools.hpMax,
          caiu: r.caiu,
          morreu: r.morreu,
          perdeuConcentracao: perdeu ? concentracao!.nome : null,
          testes: testes.length ? { nome: concentracao!.nome, cds: testes } : null,
        },
      },
    });
    const [criada] = await prisma.$transaction([mensagem, ...ops]);
    // Ações que acabaram neste turno (duração, concentração perdida): colaterais "no fim".
    await colateraisDoFim(personagemId, [
      ...r.desligar.filter((h) => idsDeAcao.has(h.id)).map((h) => h.id),
      ...(perdeu && acaoConcentrada ? [acaoConcentrada.id] : []),
    ]);
    revalidatePath(`/ficha/${personagemId}`);
    return {
      estado: r.estado,
      desligar: r.desligar,
      turnos: r.turnos,
      concentracaoTurnos: r.concentracaoTurnos,
      perdeuConcentracao: perdeu,
      testes,
      mensagem: serializarMensagem(criada as Awaited<typeof mensagem>),
    };
  });
}

// ─── Descanso ──────────────────────────────────────────────

/**
 * Curto recupera o que é "encontro" e "descansoCurto"; longo também o "descansoLongo", PV/PP cheios,
 * PV temporário zerado, exaustão −1 e metade dos Dados de Vida. Sustentada não é desligada,
 * salvo a que durava enquanto houvesse PV temporário.
 */
export async function descansar(personagemId: string, tipo: TipoDescanso) {
  return executar("ficha", async () => {
    if (tipo !== "curto" && tipo !== "longo") {
      throw new ErroDeUso("Tipo de descanso inválido.");
    }
    const [{ personagem }, { agg }, recursos, habilidades, acoes] = await Promise.all([
      autorizar(personagemId),
      carregarAgregado(personagemId),
      prisma.recurso.findMany({ where: { personagemId } }),
      prisma.habilidade.findMany({ where: { personagemId } }),
      prisma.acao.findMany({ where: { personagemId, recarga: { not: null } } }),
    ]);
    if (tipo === "longo" && personagem.hpAtual < 1) {
      throw new ErroDeUso("O descanso longo precisa começar com pelo menos 1 PV.");
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    const resumo: ResumoDescanso = {
      tipo,
      recursos: [],
      habilidades: [],
      pvRestaurado: 0,
      ppRestaurado: 0,
      ppPelaMetade: false,
      pvTempPerdido: 0,
      exaustaoRecuperada: 0,
      dadosVidaDevolvidos: 0,
    };
    // A mais neste descanso (efeitos "No Descanso").
    const extra = agg.descansoExtra[tipo];

    for (const r of recursos) {
      if (!recuperaNoDescanso(r.resetEm, tipo)) continue;
      const max = maximoDoRecurso(r, agg.ctxFormula);
      if (r.valorAtual >= max) continue;
      ops.push(
        prisma.recurso.update({
          where: { id: r.id, personagemId },
          data: { valorAtual: max },
        }),
      );
      resumo.recursos.push(r.nome);
    }

    // Usos das ações recarregam como os das habilidades.
    for (const a of acoes) {
      if (!recuperaNoDescanso(a.recarga, tipo)) continue;
      const max = usosMaximos(a, agg.ctxFormula);
      if (max == null || (a.usosAtual ?? 0) >= max) continue;
      ops.push(prisma.acao.update({ where: { id: a.id, personagemId }, data: { usosAtual: max } }));
      resumo.habilidades.push(a.nome);
    }

    for (const h of habilidades) {
      if (!recuperaNoDescanso(h.recarga, tipo)) continue;
      const max = usosMaximos(h, agg.ctxFormula);
      if (max == null || (h.usosAtual ?? 0) >= max) continue;
      ops.push(
        prisma.habilidade.update({
          where: { id: h.id, personagemId },
          data: { usosAtual: max },
        }),
      );
      resumo.habilidades.push(h.nome);
    }

    const maximos = poolsEfetivos(personagem, agg);
    if (tipo === "longo") {
      const hpNovo = Math.max(personagem.hpAtual, maximos.hpMax);
      const ppDoDescanso = ppDoDescansoLongo(personagem.ppAtual, maximos.ppMax, personagem.exaustao);
      const ppNovo = Math.max(personagem.ppAtual, Math.min(maximos.ppMax, ppDoDescanso + extra.pp));
      resumo.pvRestaurado = hpNovo - personagem.hpAtual;
      resumo.ppRestaurado = ppNovo - personagem.ppAtual;
      resumo.ppPelaMetade = personagem.exaustao > 0 && ppDoDescanso < maximos.ppMax;
      resumo.pvTempPerdido = Math.max(0, personagem.hpTemp);
      // A temporária (colateral) sai inteira, além da recuperação normal.
      resumo.exaustaoRecuperada = Math.min(
        personagem.exaustao,
        1 + extra.exaustao + personagem.exaustaoTemporaria,
      );
      resumo.dadosVidaDevolvidos = Math.min(
        personagem.dadosVidaGastos,
        dadosVidaRecuperados(personagem.nivel, personagem.dadosVidaGastos) + extra.dv,
      );

      ops.push(
        prisma.personagem.update({
          where: { id: personagemId },
          data: {
            hpAtual: hpNovo,
            ppAtual: ppNovo,
            hpTemp: 0,
            exaustao: personagem.exaustao - resumo.exaustaoRecuperada,
            // A exaustão temporária (colateral) já saiu junto.
            exaustaoTemporaria: 0,
            bloqueios: [],
            dadosVidaGastos: personagem.dadosVidaGastos - resumo.dadosVidaDevolvidos,
            // As condições com duração acabam; "até tirar" fica.
            condicoes: lerCondicoesAtivas(personagem.condicoes).filter(
              (c) => c.rodadas >= RODADAS_MAX,
            ) as unknown as Prisma.InputJsonValue,
          },
        }),
      );
      // Sem PV temporário, acaba o que durava enquanto ele durasse.
      if (personagem.hpTemp > 0) {
        const fim = await acabaComOPvTemp(personagemId, personagem.concentracao);
        ops.push(...fim.ops);
        if (fim.soltaConcentracao) {
          ops.push(...opsConcentracao(personagemId, personagem.concentracao, null));
        }
      }
    } else {
      const ppNovo = somarAteOMaximo(personagem.ppAtual, extra.pp, maximos.ppMax);
      resumo.ppRestaurado = ppNovo - personagem.ppAtual;
      resumo.exaustaoRecuperada = Math.min(personagem.exaustao, extra.exaustao);
      resumo.dadosVidaDevolvidos = Math.min(personagem.dadosVidaGastos, extra.dv);
      if (resumo.ppRestaurado || resumo.exaustaoRecuperada || resumo.dadosVidaDevolvidos) {
        ops.push(
          prisma.personagem.update({
            where: { id: personagemId },
            data: {
              ppAtual: ppNovo,
              exaustao: personagem.exaustao - resumo.exaustaoRecuperada,
              dadosVidaGastos: personagem.dadosVidaGastos - resumo.dadosVidaDevolvidos,
            },
          }),
        );
      }
    }

    // Descanso curto também acaba os bloqueios (sem PP / sem Haki).
    if (tipo === "curto" && lerBloqueios(personagem.bloqueios).length > 0) {
      ops.push(prisma.personagem.update({ where: { id: personagemId }, data: { bloqueios: [] } }));
    }
    if (ops.length > 0) await prisma.$transaction(ops);
    revalidatePath(`/ficha/${personagemId}`);
    return resumo;
  });
}

/** A rolagem é no cliente (vai pro chat); aqui só debita o dado e clampa a cura. */
export async function gastarDadoDeVida(personagemId: string, curado: number) {
  return executar("ficha", async () => {
    const [{ personagem }, { agg }] = await Promise.all([
      autorizar(personagemId),
      carregarAgregado(personagemId),
    ]);

    const disponiveis = personagem.nivel - personagem.dadosVidaGastos;
    if (disponiveis <= 0) throw new ErroDeUso("Sem Dados de Vida disponíveis.");

    // Teto: um dado + mod CON não passa de faces + 10 em qualquer cenário são.
    const teto = facesDadoVida(personagem.tipoDadoVida) + 10;
    const cura = Math.max(0, Math.min(Math.trunc(Number(curado) || 0), teto));

    await prisma.personagem.update({
      where: { id: personagemId },
      data: {
        dadosVidaGastos: { increment: 1 },
        hpAtual: somarAteOMaximo(personagem.hpAtual, cura, poolsEfetivos(personagem, agg).hpMax),
      },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Subir de nível ────────────────────────────────────────

/** Aplica a proposta do assistente. PV e aprimoramento vindos do cliente são revalidados. */
export async function subirDeNivel(
  personagemId: string,
  entrada: { pvGanho: unknown; aprimoramento?: unknown },
) {
  return executar("ficha", async () => {
    const [{ personagem }, { agg }] = await Promise.all([
      autorizar(personagemId),
      carregarAgregado(personagemId),
    ]);

    if (personagem.nivel >= NIVEL_MAXIMO) {
      throw new ErroDeUso(`Nível máximo (${NIVEL_MAXIMO}) já atingido.`);
    }
    const nivelNovo = personagem.nivel + 1;

    // PV usa a CON com os bônus; o Aprimoramento valida contra a base.
    const conEfetiva = atributosEfetivos(atributosDoPersonagem(personagem), agg).constituicao;
    const modCon = modificador(conEfetiva);
    const teto = tetoGanhoPv(personagem.tipoDadoVida, modCon);
    const pvGanho = Math.min(clampGanhoPv(Number(entrada.pvGanho) || 0), teto);

    const bruto = (entrada.aprimoramento ?? {}) as Record<string, unknown>;
    const apr: Aprimoramento = {};
    for (const a of ATRIBUTOS) {
      const v = Math.trunc(Number(bruto[a.slug]) || 0);
      if (v > 0) apr[a.slug] = v;
    }

    const atuais = {
      forca: personagem.forca,
      destreza: personagem.destreza,
      constituicao: personagem.constituicao,
      sabedoria: personagem.sabedoria,
      vontade: personagem.vontade,
      presenca: personagem.presenca,
    };
    const recusa = validarAprimoramento(
      apr,
      atuais,
      tetosNoNivel(agg.bonusTetoAtributo, nivelNovo),
    );
    if (recusa) throw new ErroDeUso(recusa);

    // CON que sobe de modificador dá PV retroativo por nível já atingido.
    const conDepois = conEfetiva + (apr.constituicao ?? 0);
    const retroativo = pvRetroativoPorCon(conEfetiva, conDepois, nivelNovo);

    const data: Record<string, unknown> = {
      nivel: nivelNovo,
      hpMax: personagem.hpMax + pvGanho + retroativo,
      hpAtual: personagem.hpAtual + pvGanho + retroativo,
      ppMax: personagem.ppMax + PP_POR_NIVEL,
      ppAtual: personagem.ppAtual + PP_POR_NIVEL,
    };
    for (const [slug, ganho] of Object.entries(apr)) {
      data[slug] = atuais[slug as Atributo] + ganho;
    }

    await prisma.personagem.update({ where: { id: personagemId }, data });
    revalidatePath(`/ficha/${personagemId}`);
    return { nivelNovo, pvGanho, retroativo, ppGanho: PP_POR_NIVEL };
  });
}

// ─── Objetivos ─────────────────────────────────────────────
// O prazo fica em dias absolutos do calendário da mesa.

const ALLOWED_OBJETIVO = ["titulo", "descricao", "estado", "icone", "prazoDias", "ordem"] as const;
type ObjetivoInput = Partial<Record<(typeof ALLOWED_OBJETIVO)[number], unknown>>;

// Sem export: arquivo "use server" so pode exportar funcao async.
const ESTADOS_OBJETIVO = ["aberto", "feito", "abandonado"] as const;
const ESTADOS_VALIDOS = new Set<string>(ESTADOS_OBJETIVO);

function normalizarObjetivo(input: ObjetivoInput, parcial: boolean) {
  const data: Record<string, unknown> = {};
  for (const key of ALLOWED_OBJETIVO) {
    if (input[key] === undefined) continue;
    if (key === "titulo") {
      const titulo = String(input.titulo).trim();
      if (!titulo) throw new ErroDeUso("Título do objetivo é obrigatório.");
      data.titulo = titulo.slice(0, 160);
    } else if (key === "descricao") {
      data.descricao = String(input.descricao).trim();
    } else if (key === "estado") {
      const v = String(input.estado);
      if (!ESTADOS_VALIDOS.has(v)) throw new ErroDeUso("Estado de objetivo inválido.");
      data.estado = v;
    } else if (key === "icone") {
      data.icone = String(input.icone).trim() || "fa-scroll";
    } else if (key === "prazoDias") {
      data.prazoDias =
        input.prazoDias === null ? null : Math.trunc(Number(input.prazoDias) || 0);
    } else if (key === "ordem") {
      data.ordem = Number(input.ordem) || 0;
    }
  }
  if (!parcial && data.titulo === undefined) {
    throw new ErroDeUso("Título do objetivo é obrigatório.");
  }
  return data;
}

export async function criarObjetivo(personagemId: string, input: ObjetivoInput) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarObjetivo(input, false);

    const ultimo = await prisma.objetivo.findFirst({
      where: { personagemId },
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });

    const criado = await prisma.objetivo.create({
      data: {
        personagemId,
        titulo: data.titulo as string,
        descricao: (data.descricao as string) ?? "",
        estado: (data.estado as string) ?? "aberto",
        icone: (data.icone as string) ?? "fa-scroll",
        prazoDias: (data.prazoDias as number | null) ?? null,
        ordem: (data.ordem as number) ?? (ultimo ? ultimo.ordem + 1 : 0),
      },
    });
    revalidatePath(`/ficha/${personagemId}`);
    return {
      id: criado.id,
      titulo: criado.titulo,
      descricao: criado.descricao,
      estado: criado.estado,
      icone: criado.icone,
      prazoDias: criado.prazoDias,
      ordem: criado.ordem,
    };
  });
}

export async function atualizarObjetivo(
  personagemId: string,
  objetivoId: string,
  patch: ObjetivoInput,
) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    const data = normalizarObjetivo(patch, true);

    await prisma.objetivo.update({
      where: { id: objetivoId, personagemId },
      data,
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function deletarObjetivo(personagemId: string, objetivoId: string) {
  return executar("ficha", async () => {
    await autorizar(personagemId);
    await prisma.objetivo.delete({
      where: { id: objetivoId, personagemId },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}

// ─── Pastas ────────────────────────────────────────────────

const MAX_POR_VEZ = 60;

function modeloView(m: {
  id: string;
  pasta: string;
  tipo: string;
  nome: string;
  dados: Prisma.JsonValue;
  personagemId: string | null;
}): ModeloView {
  return {
    id: m.id,
    pasta: m.pasta,
    tipo: m.tipo === "acao" ? "acao" : "habilidade",
    nome: m.nome,
    dados:
      m.dados && typeof m.dados === "object" && !Array.isArray(m.dados)
        ? (m.dados as Record<string, unknown>)
        : {},
    personagemId: m.personagemId,
  };
}

async function requireUser() {
  const user = await usuarioDaRequest();
  if (!user) throw new ErroDeUso("Não autenticado.");
  return user;
}

// Pastas que a ficha enxerga: as de todas as fichas e as só dela.
function visiveisNa(personagemId: string) {
  return [{ personagemId: null }, { personagemId }];
}

// De quem é a pasta: de um personagem (conferido) ou de todas as fichas do usuário.
async function donoDaPasta(exclusivaDe: unknown) {
  if (typeof exclusivaDe !== "string" || !exclusivaDe) {
    return { user: await requireUser(), personagemId: null };
  }
  const { user } = await autorizar(exclusivaDe);
  return { user, personagemId: exclusivaDe };
}

// O que o usuário logado guardou; com a ficha, entram as pastas só dela.
export async function listarPastas(personagemId?: string) {
  return executar("pastas", async () => {
    const user = await requireUser();
    const modelos = await prisma.modelo.findMany({
      where: {
        userId: user.id,
        OR: personagemId ? visiveisNa(String(personagemId)) : [{ personagemId: null }],
      },
      orderBy: [{ pasta: "asc" }, { criadoEm: "asc" }],
    });
    return { modelos: modelos.map(modeloView) };
  });
}

// Guarda uma habilidade ou ação da ficha numa pasta. Pasta nova nasce só do
// personagem se `exclusiva`; a que já existe segue como está.
export async function guardarNaPasta(
  personagemId: string,
  tipo: TipoModelo,
  origemId: string,
  pasta: unknown,
  exclusiva?: unknown,
) {
  return executar("pastas", async () => {
    const nomePasta = nomeDePasta(pasta);
    if (!nomePasta) throw new ErroDeUso("Dê um nome pra pasta.");
    if (tipo !== "habilidade" && tipo !== "acao") throw new ErroDeUso("Tipo inválido.");
    const [{ user }, origem, recursos] = await Promise.all([
      autorizar(personagemId),
      tipo === "acao"
        ? prisma.acao.findFirst({ where: { id: origemId, personagemId } })
        : prisma.habilidade.findFirst({ where: { id: origemId, personagemId } }),
      prisma.recurso.findMany({ where: { personagemId }, select: { id: true, nome: true } }),
    ]);
    if (!origem) throw new ErroDeUso("Não encontrado. Pode ter sido apagado.");
    const dados = paraModelo(
      tipo,
      origem as unknown as Record<string, unknown>,
      recursos,
    ) as Prisma.InputJsonObject;
    const [naPasta, total] = await Promise.all([
      prisma.modelo.findMany({
        where: { userId: user.id, pasta: nomePasta, OR: visiveisNa(personagemId) },
        select: { id: true, tipo: true, nome: true, personagemId: true },
      }),
      prisma.modelo.count({ where: { userId: user.id } }),
    ]);
    const dono =
      naPasta.length > 0
        ? naPasta.some((m) => m.personagemId === null)
          ? null
          : personagemId
        : exclusiva === true
          ? personagemId
          : null;
    // Guardar de novo com o mesmo nome atualiza a cópia.
    const existente = naPasta.find(
      (m) => m.tipo === tipo && m.nome === origem.nome && m.personagemId === dono,
    );
    if (!existente && total >= MAX_MODELOS) throw new ErroDeUso("Limite de itens guardados atingido.");
    const etiqueta =
      tipo === "acao"
        ? prisma.acao.update({ where: { id: origemId, personagemId }, data: { pasta: nomePasta } })
        : prisma.habilidade.update({ where: { id: origemId, personagemId }, data: { pasta: nomePasta } });
    const copia = existente
      ? prisma.modelo.update({ where: { id: existente.id }, data: { dados } })
      : prisma.modelo.create({
          data: {
            userId: user.id,
            pasta: nomePasta,
            tipo,
            nome: origem.nome,
            dados,
            personagemId: dono,
          },
        });
    const [salvo] = await prisma.$transaction([copia, etiqueta]);
    revalidatePath(`/ficha/${personagemId}`);
    return { modelo: modeloView(salvo) };
  });
}

// Cria na ficha as habilidades e ações escolhidas das pastas que ela enxerga.
export async function adicionarDaPasta(personagemId: string, modeloIds: unknown) {
  return executar("pastas", async () => {
    const ids = (Array.isArray(modeloIds) ? modeloIds : [])
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .slice(0, MAX_POR_VEZ);
    if (ids.length === 0) throw new ErroDeUso("Escolha o que adicionar.");
    const [{ user }, recursos] = await Promise.all([
      autorizar(personagemId),
      prisma.recurso.findMany({ where: { personagemId }, select: { id: true, nome: true } }),
    ]);
    const modelos = await prisma.modelo.findMany({
      where: { id: { in: ids }, userId: user.id, OR: visiveisNa(personagemId) },
    });
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const id of ids) {
      const achado = modelos.find((m) => m.id === id);
      if (!achado) continue;
      const m = modeloView(achado);
      const input = doModelo(m.tipo, m.dados, recursos);
      ops.push(
        m.tipo === "acao"
          ? prisma.acao.create({
              data: { ...dadosDaAcao(personagemId, normalizarAcaoInput(input)), pasta: m.pasta },
            })
          : prisma.habilidade.create({
              data: {
                ...dadosDaHabilidade(personagemId, normalizarHabilidadeInput(input)),
                pasta: m.pasta,
              },
            }),
      );
    }
    if (ops.length === 0) throw new ErroDeUso("Não encontrado. Pode ter sido apagado.");
    await prisma.$transaction(ops);
    revalidatePath(`/ficha/${personagemId}`);
  });
}

export async function apagarModelo(modeloId: string) {
  return executar("pastas", async () => {
    const user = await requireUser();
    await prisma.modelo.deleteMany({ where: { id: String(modeloId), userId: user.id } });
  });
}

// Apaga a pasta e tira a etiqueta dela (os itens ficam): das fichas do usuário,
// ou só do personagem em `exclusivaDe`.
export async function apagarPasta(pasta: unknown, exclusivaDe?: unknown) {
  return executar("pastas", async () => {
    const { user, personagemId } = await donoDaPasta(exclusivaDe);
    const nome = String(pasta ?? "");
    const daFicha = personagemId
      ? { pasta: nome, personagemId }
      : { pasta: nome, personagem: { userId: user.id } };
    await prisma.$transaction([
      prisma.modelo.deleteMany({ where: { pasta: nome, userId: user.id, personagemId } }),
      prisma.habilidade.updateMany({ where: daFicha, data: { pasta: null } }),
      prisma.acao.updateMany({ where: daFicha, data: { pasta: null } }),
    ]);
    revalidatePath("/ficha/[uid]", "page");
  });
}

export async function renomearPasta(de: unknown, para: unknown, exclusivaDe?: unknown) {
  return executar("pastas", async () => {
    const { user, personagemId } = await donoDaPasta(exclusivaDe);
    const novo = nomeDePasta(para);
    if (!novo) throw new ErroDeUso("Dê um nome pra pasta.");
    const antigo = String(de ?? "");
    const daFicha = personagemId
      ? { pasta: antigo, personagemId }
      : { pasta: antigo, personagem: { userId: user.id } };
    await prisma.$transaction([
      prisma.modelo.updateMany({
        where: { pasta: antigo, userId: user.id, personagemId },
        data: { pasta: novo },
      }),
      prisma.habilidade.updateMany({ where: daFicha, data: { pasta: novo } }),
      prisma.acao.updateMany({ where: daFicha, data: { pasta: novo } }),
    ]);
    revalidatePath("/ficha/[uid]", "page");
  });
}

// Deixa a pasta só do personagem, ou de volta em todas as fichas do usuário.
export async function mudarDonoDaPasta(personagemId: string, pasta: unknown, exclusiva: unknown) {
  return executar("pastas", async () => {
    const { user } = await autorizar(personagemId);
    const so = exclusiva === true;
    await prisma.modelo.updateMany({
      where: { userId: user.id, pasta: String(pasta ?? ""), personagemId: so ? null : personagemId },
      data: { personagemId: so ? personagemId : null },
    });
  });
}

// ─── Pacotes ───────────────────────────────────────────────

function pacoteView(p: {
  id: string;
  codigo: string;
  nome: string;
  dados: Prisma.JsonValue;
}): PacoteView {
  return { id: p.id, codigo: p.codigo, nome: p.nome, ...contarPacote(lerPacote(p.dados)) };
}

function idsUnicos(raw: unknown, max: number): string[] {
  const ids = (Array.isArray(raw) ? raw : []).filter(
    (id): id is string => typeof id === "string" && id !== "",
  );
  return [...new Set(ids)].slice(0, max);
}

// Códigos que o usuário logado gerou.
export async function listarPacotes() {
  return executar("pacotes", async () => {
    const user = await requireUser();
    const pacotes = await prisma.pacote.findMany({
      where: { userId: user.id },
      orderBy: { criadoEm: "desc" },
    });
    return { pacotes: pacotes.map(pacoteView) };
  });
}

// Gera um código com as habilidades, ações e árvores escolhidas da ficha.
export async function exportarPacote(
  personagemId: string,
  entrada: { nome?: unknown; habilidadeIds?: unknown; acaoIds?: unknown; arvoreIds?: unknown },
) {
  return executar("pacotes", async () => {
    const habilidadeIds = idsUnicos(entrada?.habilidadeIds, MAX_ITENS_PACOTE);
    const acaoIds = idsUnicos(entrada?.acaoIds, MAX_ITENS_PACOTE);
    const arvoreIds = idsUnicos(entrada?.arvoreIds, MAX_ARVORES_PACOTE);
    if (habilidadeIds.length + acaoIds.length + arvoreIds.length === 0) {
      throw new ErroDeUso("Escolha o que exportar.");
    }
    const [{ user, personagem }, habilidades, acoes, arvores, recursos] = await Promise.all([
      autorizar(personagemId),
      // A forma alternativa vai junto da origem.
      prisma.habilidade.findMany({
        where: {
          personagemId,
          OR: [{ id: { in: habilidadeIds } }, { formaDe: { in: habilidadeIds } }],
        },
        orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
      }),
      prisma.acao.findMany({
        where: { personagemId, OR: [{ id: { in: acaoIds } }, { formaDe: { in: acaoIds } }] },
        orderBy: { nome: "asc" },
      }),
      prisma.arvore.findMany({
        where: { id: { in: arvoreIds }, personagemId },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
        include: { camadas: true, ramos: true, nos: true },
      }),
      prisma.recurso.findMany({ where: { personagemId } }),
    ]);
    if (habilidades.length + acoes.length + arvores.length === 0) {
      throw new ErroDeUso("Não encontrado. Pode ter sido apagado.");
    }
    const total = await prisma.pacote.count({ where: { userId: user.id } });
    if (total >= MAX_PACOTES) throw new ErroDeUso("Limite de códigos atingido. Apague um antes.");
    if (habilidades.length > MAX_ITENS_PACOTE) {
      throw new ErroDeUso(`Um código leva até ${MAX_ITENS_PACOTE} habilidades.`);
    }
    if (acoes.length > MAX_ITENS_PACOTE) {
      throw new ErroDeUso(`Um código leva até ${MAX_ITENS_PACOTE} ações.`);
    }
    if (arvores.some((a) => a.nos.length > MAX_NOS_ARVORE)) {
      throw new ErroDeUso(`Um código leva árvores de até ${MAX_NOS_ARVORE} talentos.`);
    }

    const dados = montarPacote({ de: personagem.nome, habilidades, acoes, arvores, recursos });
    const nome =
      nomeDoPacote(entrada?.nome) || `Pacote de ${personagem.nome}`.slice(0, MAX_NOME_PACOTE);
    // Código repetido: sorteia outro.
    for (let tentativa = 0; ; tentativa++) {
      try {
        const pacote = await prisma.pacote.create({
          data: {
            codigo: novoCodigo((n) => randomInt(n)),
            userId: user.id,
            nome,
            dados: dados as unknown as Prisma.InputJsonObject,
          },
        });
        return { pacote: pacoteView(pacote) };
      } catch (e) {
        if (tentativa >= 4 || (e as { code?: unknown })?.code !== "P2002") throw e;
      }
    }
  });
}

// Conteúdo de um código, pra conferir antes de importar.
export async function verPacote(codigo: unknown) {
  return executar("pacotes", async () => {
    const limpo = lerCodigo(codigo);
    if (!limpo) throw new ErroDeUso("Código inválido.");
    const [, pacote] = await Promise.all([
      requireUser(),
      prisma.pacote.findUnique({ where: { codigo: limpo } }),
    ]);
    if (!pacote) throw new ErroDeUso("Código não encontrado.");
    return { pacote: { codigo: pacote.codigo, nome: pacote.nome, dados: lerPacote(pacote.dados) } };
  });
}

// Cria na ficha o que foi escolhido de um código.
export async function importarPacote(personagemId: string, codigo: unknown, escolha: unknown) {
  return executar("pacotes", async () => {
    const limpo = lerCodigo(codigo);
    if (!limpo) throw new ErroDeUso("Código inválido.");
    const quer = (escolha && typeof escolha === "object" ? escolha : {}) as Record<string, unknown>;
    const [, pacote, recursos, habilidades, arvoresNaFicha] = await Promise.all([
      autorizar(personagemId),
      prisma.pacote.findUnique({ where: { codigo: limpo } }),
      prisma.recurso.findMany({ where: { personagemId }, select: { id: true, nome: true } }),
      prisma.habilidade.findMany({ where: { personagemId }, select: { id: true, nome: true } }),
      prisma.arvore.count({ where: { personagemId } }),
    ]);
    if (!pacote) throw new ErroDeUso("Código não encontrado.");
    const plano = planejarImportacao(
      lerPacote(pacote.dados),
      {
        habilidades: idsUnicos(quer.habilidades, MAX_ITENS_PACOTE),
        acoes: idsUnicos(quer.acoes, MAX_ITENS_PACOTE),
        arvores: idsUnicos(quer.arvores, MAX_ARVORES_PACOTE),
      },
      { recursos, habilidades },
      randomUUID,
    );
    if (plano.habilidades.length + plano.acoes.length + plano.arvores.length === 0) {
      throw new ErroDeUso("Escolha o que importar.");
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (plano.recursos.length > 0) {
      ops.push(
        prisma.recurso.createMany({
          data: plano.recursos.map((r, i) => {
            const data = normalizarRecurso(
              {
                nome: r.nome,
                valorMax: r.valorMax,
                valorMaxFormula: r.valorMaxFormula,
                cor: r.cor,
                cor2: r.cor2,
                efeito: r.efeito,
                resetEm: r.resetEm,
              },
              false,
            );
            return {
              id: r.id,
              personagemId,
              nome: data.nome as string,
              valorAtual: (data.valorMax as number) ?? 0,
              valorMax: (data.valorMax as number) ?? 0,
              valorMaxFormula: (data.valorMaxFormula as string | null) ?? null,
              ordem: recursos.length + i,
              cor: (data.cor as string | null) ?? null,
              cor2: (data.cor2 as string | null) ?? null,
              efeito: (data.efeito as string) ?? "solido",
              resetEm: (data.resetEm as string) ?? "manual",
            };
          }),
        }),
      );
    }
    if (plano.habilidades.length > 0) {
      ops.push(
        prisma.habilidade.createMany({
          data: plano.habilidades.map((h) => ({
            ...dadosDaHabilidade(personagemId, normalizarHabilidadeInput(h.input)),
            id: h.id,
          })),
        }),
      );
    }
    if (plano.acoes.length > 0) {
      ops.push(
        prisma.acao.createMany({
          data: plano.acoes.map((a) => ({
            ...dadosDaAcao(personagemId, normalizarAcaoInput(a.input)),
            id: a.id,
          })),
        }),
      );
    }
    plano.arvores.forEach((a, i) => {
      const data = normalizarArvore(a);
      ops.push(
        prisma.arvore.create({
          data: {
            id: a.id,
            personagemId,
            nome: data.nome as string,
            icone: data.icone as string,
            cor: (data.cor as string | null) ?? null,
            cor2: (data.cor2 as string | null) ?? null,
            efeito: data.efeito as string,
            ordem: arvoresNaFicha + i,
            criterio: data.criterio as string,
            recursoCustoId: a.recursoCustoId,
            fundoUrl: (data.fundoUrl as string | null) ?? null,
            camadas: {
              create: a.camadas.map((c) => ({
                id: c.id,
                nome: c.nome.trim() || `Camada ${c.ordem + 1}`,
                ordem: c.ordem,
                limiar: c.limiar,
              })),
            },
            ramos: {
              create: a.ramos.map((r) => ({
                id: r.id,
                nome: r.nome.trim() || `Ramo ${r.ordem + 1}`,
                ordem: r.ordem,
              })),
            },
          },
        }),
      );
      if (a.nos.length === 0) return;
      ops.push(
        prisma.arvoreNo.createMany({
          data: a.nos.map((n) => {
            const no = normalizarNo(n);
            return {
              id: n.id,
              arvoreId: a.id,
              camadaId: n.camadaId,
              ramoId: n.ramoId,
              coluna: no.coluna as number,
              linha: no.linha as number,
              nome: no.nome as string,
              descricao: no.descricao as string,
              icone: no.icone as string,
              custo: no.custo as number,
              maxRanks: no.maxRanks as number,
              nivelMinimo: no.nivelMinimo as number,
              habilidadeId: n.habilidadeId,
              requisitos: no.requisitos as RequisitoNo[],
              ordem: n.ordem,
            };
          }),
        }),
      );
    });
    await prisma.$transaction(ops);
    revalidatePath(`/ficha/${personagemId}`);
    return {
      habilidades: plano.habilidades.length,
      acoes: plano.acoes.length,
      arvores: plano.arvores.map((a) => a.id),
    };
  });
}

export async function apagarPacote(pacoteId: string) {
  return executar("pacotes", async () => {
    const user = await requireUser();
    await prisma.pacote.deleteMany({ where: { id: String(pacoteId), userId: user.id } });
  });
}

// ─── Combate: ação com alvo ────────────────────────────────────────────────

// Quem assina as mensagens do combate no chat. Não é o uid de ninguém, então
// chegam a todos pelo realtime (que ignora as do próprio usuário).
const UID_COMBATE = "combate";

function avisarCombate(mesaId: string, nome: string, mensagem: string) {
  return prisma.mensagem.create({
    data: { sessionId: mesaId, uid: UID_COMBATE, nome, mensagem, tipo: "texto" },
  });
}

type Participacao = NonNullable<Awaited<ReturnType<typeof participacaoEmCombate>>>;

// Como a ação resolve nos alvos, ou null se ela não tem o que resolver. Vale o
// que a ficha pediu, desde que a ação comporte: ataque precisa de acerto ou
// arma; salvaguarda, de atributo e CD. O que não fecha vira erro antes de
// gastar a ação, em vez de dano sem teste.
function modoDaResolucao(
  acao: {
    atributoAtaque: string | null;
    atributoSalv: string | null;
    dano: string | null;
    armaIds: unknown;
    efeitos: unknown;
  },
  pedido: string | undefined,
  cd: number,
): Resolucao["modo"] | null {
  const temArma = normalizarIds(acao.armaIds).length > 0;
  const comportaAtaque = !!acao.atributoAtaque || temArma;
  if (pedido === "ataque" && comportaAtaque) return "ataque";
  if (acao.atributoSalv) {
    if (cd <= 0) {
      throw new ErroDeUso("Escolha a CD das suas técnicas na ficha lateral antes de usar esta ação num alvo.");
    }
    return "salvaguarda";
  }
  if (comportaAtaque) throw new ErroDeUso("Sem como rolar o acerto: equipe a arma (e a munição) desta ação.");
  // Sem teste: dano direto, ou só a condição que a ação põe.
  const poeCondicao =
    lerEfeitos(acao.efeitos).some((e) => e.tipo === "condicao_aplicar" && !e.emVoce) || efeitosNoInimigo(acao).length > 0;
  return acao.dano?.trim() || poeCondicao ? "direto" : null;
}

// Quem está usando a ação no combate: o personagem de um jogador ou uma
// criatura do narrador.
type Lado = Pick<Participacao, "instanciaId" | "combateId" | "mesaId">;

// Abre a resolução de uma ação usada em alvos do combate e devolve o id dela.
// No ataque, a lista tem um alvo por ataque (multiataque pode repetir o mesmo);
// salvaguarda e dano direto pegam cada alvo uma vez. Criatura alvo de
// salvaguarda já rola aqui.
async function criarResolucao(
  lado: Lado,
  entrada: {
    atacante: string;
    acaoId: string | null;
    nome: string;
    modo: Resolucao["modo"];
    temDano: boolean;
    salvaguarda: Resolucao["salvaguarda"];
    condicoes: CondicaoAplicada[];
    alvos: string[];
    corpoACorpo?: boolean;
    armaDeFogo?: boolean;
    ppGasto?: number;
    // Sem janela de reação (a salvaguarda que evita a condição de uma ação que já pegou).
    semReacao?: boolean;
  },
): Promise<string | null> {
  const { modo, salvaguarda } = entrada;
  const achadas = await prisma.instanciaCombate.findMany({
    where: { combateId: lado.combateId, id: { in: entrada.alvos } },
    select: { id: true, nomeExibicao: true, personagemId: true, criaturaId: true, condicoesAtivas: true },
  });
  if (achadas.length === 0) return null;

  // Na ordem pedida; só o ataque repete alvo.
  const ids = modo === "ataque" ? entrada.alvos : [...new Set(entrada.alvos)];
  const instancias = ids.flatMap((id) => achadas.filter((i) => i.id === id));

  // Salvaguarda de criatura: rola na hora, com o bônus do bestiário.
  const criaturas =
    modo === "salvaguarda"
      ? await prisma.criatura.findMany({
          where: { id: { in: instancias.flatMap((i) => (i.criaturaId ? [i.criaturaId] : [])) } },
        })
      : [];
  const linhas: string[] = [];
  // Condições de uso único da criatura que valeram na salvaguarda.
  const gastas = new Map<string, string[]>();
  const alvos: AlvoResolucao[] = instancias.map((i) => {
    let resultado: AlvoResolucao["resultado"] = null;
    const criatura = criaturas.find((c) => c.id === i.criaturaId);
    if (modo === "salvaguarda" && salvaguarda && criatura) {
      // Condições da criatura: falha automática, vantagem ou desvantagem.
      const pelaCondicao = modoDaSalvaguarda(lerCondicoesAtivas(i.condicoesAtivas), salvaguarda.atributo);
      if (pelaCondicao.gastas.length > 0) gastas.set(i.id, pelaCondicao.gastas);
      if (pelaCondicao.falha) {
        resultado = "falha";
        linhas.push(`${i.nomeExibicao} falhou na salvaguarda (${pelaCondicao.falha})`);
      } else {
        // Bônus e penalidades das condições dela também entram.
        const daCondicao = bonusDasCondicoesNaCriatura(lerCondicoesAtivas(i.condicoesAtivas), {
          tipo: "salvaguarda",
          atributo: salvaguarda.atributo,
        });
        const bonus = bonusDeSalvaguardaDaCriatura(criatura, salvaguarda.atributo) + daCondicao.valor;
        const natural = rolarD20Contextual({
          vantagem: pelaCondicao.modo === "vantagem",
          desvantagem: pelaCondicao.modo === "desvantagem",
        }).mantido;
        const salv = resultadoDaSalvaguarda({ total: natural + bonus, natural }, salvaguarda.cd);
        resultado = salv.resultado;
        linhas.push(
          `${i.nomeExibicao} ${textoDaSalvaguarda(salv)}` +
            (pelaCondicao.modo !== "normal" ? ` (com ${pelaCondicao.modo})` : "") +
            (daCondicao.valor ? ` (${formatarMod(daCondicao.valor)} de ${daCondicao.fontes.join(", ")})` : ""),
        );
      }
    }
    return { instanciaId: i.id, nome: i.nomeExibicao, personagemId: i.personagemId, resultado, danoAplicado: false };
  });
  for (const [id, ids] of gastas) await gastarCondicoes(id, ids);

  const resolucao: Resolucao = {
    id: crypto.randomUUID(),
    atacanteId: lado.instanciaId,
    atacanteNome: entrada.atacante,
    acaoId: entrada.acaoId,
    nome: entrada.nome,
    modo,
    ...(entrada.corpoACorpo ? { corpoACorpo: true } : {}),
    ...(entrada.armaDeFogo ? { armaDeFogo: true } : {}),
    ...(entrada.ppGasto ? { ppGasto: entrada.ppGasto } : {}),
    etapa: modo === "ataque" ? "ataque" : entrada.temDano ? "dano" : "feito",
    salvaguarda: modo === "salvaguarda" ? salvaguarda : null,
    temDano: entrada.temDano,
    dano: null,
    condicoes: entrada.condicoes,
    alvos,
    criadaEm: Date.now(),
  };
  await mudarResolucoes(lado.combateId, (lista) => {
    lista.push(resolucao);
  });

  const nomes = alvos.map((a) => a.nome).join(", ");
  const esperando = alvos.filter((a) => a.personagemId && a.resultado === null && modo === "salvaguarda");
  await avisarCombate(
    lado.mesaId,
    entrada.atacante,
    `usou ${entrada.nome} em ${nomes}.` +
      (linhas.length > 0 ? ` ${linhas.join("; ")}.` : "") +
      (esperando.length > 0 ? ` Salvaguarda de ${esperando.map((a) => a.nome).join(", ")} pendente.` : ""),
  );
  // Quem já falhou (criatura) ou é pego sem teste decide se reage; sem reação
  // a escolher, já recebe as condições.
  if (!entrada.semReacao) await janelasDeReacao(lado.combateId, resolucao.id);
  await condicoesDaResolucao(lado, resolucao.id);
  return resolucao.id;
}

// Resolução da ação de um jogador: tira da ficha o que ela resolve.
async function abrirResolucao(entrada: {
  combate: Participacao;
  atacante: string;
  acao: {
    id: string;
    nome: string;
    atributoAtaque: string | null;
    atributoSalv: string | null;
    salvSucesso: string;
    dano: string | null;
    armaIds: unknown;
    efeitos: unknown;
    duracao: unknown;
  };
  alvos: string[];
  modo: Resolucao["modo"];
  cd: number;
  corpoACorpo?: boolean;
  armaDeFogo?: boolean;
  ppGasto?: number;
}): Promise<string | null> {
  const { acao } = entrada;
  // Condições que a ação põe em quem ela pega (efeito "Aplica Condição").
  const condicoes: CondicaoAplicada[] = lerEfeitos(acao.efeitos).flatMap((e) => {
    // As "em você" vão em quem usou (condicoesEmQuemUsou).
    if (e.tipo !== "condicao_aplicar" || e.emVoce) return [];
    const cd = entrada.cd > 0 ? entrada.cd : (e.cd ?? 0);
    // Salvaguarda que evita a condição, contra a CD das técnicas. Se é a mesma
    // da ação, vale o resultado dela (não rola duas vezes).
    const evita = e.evita && !(entrada.modo === "salvaguarda" && acao.atributoSalv === e.evita) ? e.evita : null;
    if (evita && cd <= 0) {
      throw new ErroDeUso("Escolha a CD das suas técnicas na ficha lateral: a condição pede salvaguarda.");
    }
    return [
      {
        nome: e.condicao,
        rodadas: lerRodadas(e.rodadas),
        // Sem duração própria, valem os padrões da condição na Biblioteca.
        ...(e.rodadas ? {} : { usaPadroes: true }),
        salvaguarda: e.repete && (evita ?? acao.atributoSalv) && cd > 0 ? { atributo: (evita ?? acao.atributoSalv)!, cd } : null,
        ...(evita ? { evita: { atributo: evita, cd } } : {}),
        ...(cd > 0 ? { cdDaFonte: cd } : {}),
        // Criada no efeito: a mecânica vem com ela.
        ...(e.mecanica ? { mecanica: e.mecanica } : {}),
      },
    ];
  });
  // O que fica valendo no inimigo (desvantagem) vira condição com o nome da
  // ação, pelo "Vale" de cada efeito.
  condicoes.push(
    ...condicoesDosEfeitos(
      acao.nome,
      efeitosNoInimigo(acao),
      Math.min(RODADAS_MAX, turnosDaAcao(acao.duracao) ?? RODADAS_MAX),
    ),
  );
  return criarResolucao(entrada.combate, {
    atacante: entrada.atacante,
    acaoId: acao.id,
    nome: acao.nome,
    modo: entrada.modo,
    temDano: !!acao.dano?.trim() || normalizarIds(acao.armaIds).length > 0,
    salvaguarda: acao.atributoSalv
      ? {
          atributo: acao.atributoSalv,
          cd: entrada.cd,
          emSucesso: acao.salvSucesso === "metade" ? "metade" : "nada",
        }
      : null,
    condicoes,
    alvos: entrada.alvos,
    corpoACorpo: entrada.corpoACorpo,
    armaDeFogo: entrada.armaDeFogo,
    ppGasto: entrada.ppGasto,
  });
}

// Põe as condições da ação em quem ela pegou em cheio (acerto, falha na
// salvaguarda, dano sem teste) e ainda não as tinha recebido. Quem está com a
// janela de reação aberta espera: a reação pode fazer o ataque errar.
async function condicoesDaResolucao(combate: Pick<Lado, "combateId" | "mesaId">, resolucaoId: string) {
  const feito = await mudarResolucoes(combate.combateId, (lista) => {
    const r = lista.find((x) => x.id === resolucaoId);
    if (!r || r.condicoes.length === 0) return null;
    const pegos = r.alvos.filter(
      (a) =>
        !a.condicaoAplicada &&
        a.reacao !== "pendente" &&
        (r.modo === "direto" || a.resultado !== null) &&
        sofreDano(r, a) === 1,
    );
    for (const a of pegos) a.condicaoAplicada = true;
    return pegos.length > 0 ? { resolucao: structuredClone(r), ids: pegos.map((a) => a.instanciaId) } : null;
  });
  if (!feito) return;
  const { resolucao } = feito;
  // Condição com salvaguarda própria: quem foi pego rola pra evitar (uma
  // resolução por atributo, contra a CD das técnicas de quem usou).
  const comSalv = resolucao.condicoes.filter((c) => c.evita);
  for (const atributo of new Set(comSalv.map((c) => c.evita!.atributo))) {
    const doAtributo = comSalv.filter((c) => c.evita!.atributo === atributo);
    await criarResolucao(
      { instanciaId: resolucao.atacanteId, combateId: combate.combateId, mesaId: combate.mesaId },
      {
        atacante: resolucao.atacanteNome,
        acaoId: resolucao.acaoId,
        nome: `${resolucao.nome}: ${doAtributo.map((c) => c.nome).join(", ")}`,
        modo: "salvaguarda",
        temDano: false,
        salvaguarda: { atributo, cd: doAtributo[0].evita!.cd, emSucesso: "nada" },
        condicoes: doAtributo.map((c) => ({ ...c, evita: null })),
        alvos: feito.ids,
        semReacao: true,
      },
    );
  }
  const diretas = resolucao.condicoes.filter((c) => !c.evita);
  if (diretas.length === 0) return;
  const { receberam: nomes, imunes, aplicadas } = await aplicarCondicoes({
    combateId: combate.combateId,
    instanciaIds: feito.ids,
    condicoes: diretas,
    fonteId: resolucao.atacanteId,
    origem: `${resolucao.nome} de ${resolucao.atacanteNome}`,
  });
  if (imunes.length > 0) await avisarCombate(combate.mesaId, resolucao.nome, `imune: ${imunes.join(", ")}.`);
  if (nomes.length === 0) return;
  await avisarCombate(
    combate.mesaId,
    nomes.join(", "),
    (nomes.length > 1 ? "ficaram: " : "ficou: ") +
      aplicadas
        .map(
          (c) =>
            `${c.nome} (${c.uso ? "próxima rolagem" : c.ateOProximoTurno ? "até o fim do próximo turno" : textoRodadas(c.rodadas)})`,
        )
        .join(", ") +
      ".",
  );
}

type Leva = { alvo: AlvoResolucao; fator: number; partes: ParteDano[]; reducao: number };

// Desconta o dano de uma resolução de quem deve levar e ainda não levou. Roda
// depois de gravar a resolução (com a marca de "aplicado" já feita). A redução
// de uma reação sai do dano antes das defesas do alvo.
async function descontarDano(mesaId: string, combateId: string, resolucao: Resolucao, alvos: Leva[]) {
  // Multiplicador no dano de quem atacou (Letárgico: metade, menos arma de fogo).
  const doAtacante = alvos.length > 0 ? await fatorDoAtacante(resolucao) : { fator: 1, fontes: [] };
  if (doAtacante.fator !== 1 && alvos.length > 0) {
    await avisarCombate(mesaId, resolucao.atacanteNome, `dano ×${String(doAtacante.fator).replace(".", ",")} (${doAtacante.fontes.join(", ")}).`);
  }
  for (const { alvo, fator, partes: roladas, reducao } of alvos) {
    let resta = reducao;
    const partes = roladas
      .map((p) => {
        const valor = Math.floor(p.valor * fator * doAtacante.fator);
        const menos = Math.min(resta, valor);
        resta -= menos;
        return { valor: valor - menos, tipo: p.tipo };
      })
      .filter((p) => p.valor > 0);
    if (partes.length === 0) {
      if (reducao > 0 || doAtacante.fator < 1) await avisarCombate(mesaId, alvo.nome, "não recebeu dano.");
      continue;
    }
    const { teste } = await danoNaInstancia({ mesaId, combateId }, alvo, partes, {
      de: resolucao.atacanteId,
      acao: resolucao.nome,
    });
    if (teste) {
      // O jogador recebe o pedido na faixa da iniciativa e rola quando puder.
      await mudarResolucoes(combateId, (lista) => {
        const a = lista
          .find((r) => r.id === resolucao.id)
          ?.alvos.find((x) => x.instanciaId === alvo.instanciaId && !x.concentracao);
        if (a) a.concentracao = teste;
      });
    }
  }
}

// Dano em quem está no combate: o jogador pela ficha (defesas, PV temporário,
// concentração); a criatura pelo bestiário. Devolve o teste de concentração
// que o dano pediu ao jogador.
async function danoNaInstancia(
  lado: { mesaId: string; combateId: string },
  alvo: { instanciaId: string; nome: string; personagemId: string | null },
  partes: ParteDano[],
  fonte: { de: string | null; acao: string },
): Promise<{ teste: { nome: string; cd: number } | null }> {
  if (alvo.personagemId) {
    const [personagem, { agg }] = await Promise.all([
      prisma.personagem.findUnique({ where: { id: alvo.personagemId }, include: INCLUDE_ACESSO }),
      carregarAgregado(alvo.personagemId),
    ]);
    if (!personagem) return { teste: null };
    const { teste } = await danoNoPersonagem({ personagem, agg, uid: UID_COMBATE, partes, fonte });
    return { teste };
  }

  const instancia = await prisma.instanciaCombate.findUnique({
    where: { id: alvo.instanciaId },
    select: { criaturaId: true, pvAtual: true, pvMax: true, pvTemp: true },
  });
  if (!instancia?.criaturaId) return { teste: null };
  const criatura = await prisma.criatura.findUnique({
    where: { id: instancia.criaturaId },
    select: { resistencias: true },
  });
  // O dano sai primeiro do PV temporário; o que sobrar, do PV.
  const r = resolverDano(
    partes,
    defesasDaCriatura(comoResistencias(criatura?.resistencias)),
    { hpAtual: instancia.pvAtual ?? 0, hpTemp: instancia.pvTemp, hpMax: instancia.pvMax ?? 0 },
  );
  await prisma.instanciaCombate.update({
    where: { id: alvo.instanciaId },
    data: {
      pvAtual: r.hpAtual.depois,
      pvTemp: r.hpTemp.depois,
      ...(r.hpTemp.depois === 0 ? { pvTempDuracao: null } : {}),
    },
  });
  await registrarDano(lado.combateId, {
    de: fonte.de,
    para: alvo.instanciaId,
    valor: r.final,
    bruto: r.bruto,
    tipo: tipoDominante(r.partes),
    acao: fonte.acao,
    caiu: r.hpAtual.antes > 0 && r.hpAtual.depois <= 0,
  });
  await avisarCombate(
    lado.mesaId,
    alvo.nome,
    `recebeu ${r.final} de dano` + (r.absorvido > 0 ? ` (${r.absorvido} no PV temporário).` : "."),
  );
  return { teste: null };
}

// Multiplicador no dano de quem atacou: o jogador pela ficha (que já soma as
// condições); a criatura só pelas condições.
async function fatorDoAtacante(resolucao: Resolucao): Promise<{ fator: number; fontes: string[] }> {
  const instancia = await prisma.instanciaCombate.findUnique({
    where: { id: resolucao.atacanteId },
    select: { personagemId: true, condicoesAtivas: true },
  });
  if (!instancia) return { fator: 1, fontes: [] };
  const agg = instancia.personagemId
    ? (await carregarAgregado(instancia.personagemId)).agg
    : agregarEfeitos(fontesDasCondicoes(lerCondicoesAtivas(instancia.condicoesAtivas)));
  return fatorDeDano(agg, { corpoACorpo: !!resolucao.corpoACorpo, armaDeFogo: !!resolucao.armaDeFogo });
}

// Marca como aplicado o dano de quem já pode levar e devolve a lista pra
// descontar: quem tem resultado, tem o dano rolado (no ataque, o do próprio
// acerto) e não está com a janela de reação aberta.
function quemLevaAgora(r: Resolucao): Leva[] {
  const leva: Leva[] = [];
  for (const alvo of r.alvos) {
    if (alvo.danoAplicado || (r.modo !== "direto" && alvo.resultado === null)) continue;
    const partes = r.modo === "ataque" ? alvo.danoRolado : r.dano;
    if (!partes || alvo.reacao === "pendente") continue;
    alvo.danoAplicado = true;
    const fator = sofreDano(r, alvo);
    if (fator > 0) {
      const reducao = alvo.reacao && typeof alvo.reacao === "object" ? alvo.reacao.reducao : 0;
      leva.push({ alvo: { ...alvo }, fator, partes, reducao });
    }
  }
  return leva;
}

// Acertos de um ataque que ainda esperam a rolagem de dano.
function acertosSemDano(r: Resolucao): AlvoResolucao[] {
  return r.alvos.filter((a) => !a.danoAplicado && !a.danoRolado && sofreDano(r, a) > 0);
}

// Reações que o alvo pode usar agora contra a ação que o pegou: não é a vez
// dele, ainda tem a reação do turno, e o gatilho de cada uma cabe na ação
// (ataque, salvaguarda que causa dano…). Do jogador, as da ficha; da criatura,
// as do statblock. Lista vazia = não tem como reagir. Com `deAliado`, quem
// reage não é o pego pela ação, é um aliado dele (gatilho "aliado alvo de ataque").
async function reacoesCabiveis(
  combateId: string,
  alvo: { instanciaId: string; personagemId: string | null },
  acao: { modo: Resolucao["modo"]; temDano: boolean },
  deAliado = false,
): Promise<OpcaoReacao[]> {
  const [instancia, combate] = await Promise.all([
    prisma.instanciaCombate.findUnique({
      where: { id: alvo.instanciaId },
      select: { acoesGastas: true, criaturaId: true, estadoRecargas: true, condicoesAtivas: true },
    }),
    prisma.combate.findUnique({
      where: { id: combateId },
      select: { turnoAtual: true, participantes: { select: { id: true, iniciativa: true, ordem: true } } },
    }),
  ]);
  if (!instancia || !combate) return [];
  if (ordenarParticipantes(combate.participantes)[combate.turnoAtual]?.id === alvo.instanciaId) return [];
  // Incapacitado ou Sonolento não reage.
  if (travasDasCondicoes(lerCondicoesAtivas(instancia.condicoesAtivas)).semReacao) return [];
  const gastasDoAlvo = lerAcoesGastas(instancia.acoesGastas);
  const gasta = gastasDoAlvo.react ?? 0;

  if (!alvo.personagemId) {
    if (!instancia.criaturaId || gasta >= 1) return [];
    const bruta = await prisma.criatura.findUnique({
      where: { id: instancia.criaturaId },
      include: { componentes: true },
    });
    if (!bruta) return [];
    const usos = lerUsosAcoes(instancia.estadoRecargas);
    return serializarCriatura(bruta)
      .componentes.filter(
        (c) =>
          c.categoria === "reacao" &&
          gatilhoCabe(c.gatilho, acao, deAliado) &&
          (c.usos === null || (usos[c.id] ?? c.usos) > 0),
      )
      .map((c) => ({ id: c.id, nome: c.nome || "Reação", efeito: resumoDaReacao(efeitosDeReacaoDaCriatura(c)) }));
  }

  const reacoes = (
    await prisma.acao.findMany({
      where: { personagemId: alvo.personagemId, tipo: "react" },
      select: { id: true, nome: true, gatilho: true, efeitos: true, usosAtual: true },
      orderBy: { nome: "asc" },
    })
  ).filter((a) => gatilhoCabe(lerGatilho(a.gatilho), acao, deAliado) && a.usosAtual !== 0);
  if (reacoes.length === 0) return [];
  const { agg } = await carregarAgregado(alvo.personagemId);
  if (gasta >= maximoDeAcoes(agg.acoesExtras, gastasDoAlvo.ganhas).react) return [];
  return reacoes.map((a) => {
    const efeitos = lerEfeitos(a.efeitos);
    return { id: a.id, nome: a.nome, efeito: resumoDaReacao(efeitos) };
  });
}

// Reações dos aliados do alvo (outros jogadores no combate, fora da ação) pro
// gatilho "aliado alvo de ataque", com quem reage em `de`.
async function reacoesDeAliados(
  combateId: string,
  alvo: { instanciaId: string; personagemId: string | null },
  resolucao: { atacanteId: string; alvos: { instanciaId: string }[] },
  acao: { modo: Resolucao["modo"]; temDano: boolean },
): Promise<OpcaoReacao[]> {
  if (!alvo.personagemId || acao.modo !== "ataque") return [];
  const aliados = await prisma.instanciaCombate.findMany({
    where: {
      combateId,
      personagemId: { not: null },
      id: { notIn: [resolucao.atacanteId, ...resolucao.alvos.map((a) => a.instanciaId)] },
    },
    select: { id: true, nomeExibicao: true, personagemId: true },
  });
  const out: OpcaoReacao[] = [];
  for (const aliado of aliados) {
    const opcoes = await reacoesCabiveis(combateId, { instanciaId: aliado.id, personagemId: aliado.personagemId }, acao, true);
    for (const o of opcoes) {
      out.push({ ...o, de: { instanciaId: aliado.id, personagemId: aliado.personagemId!, nome: aliado.nomeExibicao } });
    }
  }
  return out;
}

// A ação pegou o alvo de um jeito que dá pra reagir: acerto de ataque, ou
// dano que vai entrar (falha na salvaguarda, metade no sucesso, dano direto).
function pegoPelaAcao(r: Resolucao, a: AlvoResolucao): boolean {
  if (r.modo !== "direto" && a.resultado === null) return false;
  return sofreDano(r, a) > 0 && (r.temDano || r.modo === "ataque");
}

// Abre a janela de reação de quem acabou de ser pego por uma ação: quem tem
// reação que cabe fica "pendente", com a lista delas (a ação espera a decisão:
// do jogador, ou do narrador se é criatura); os outros seguem direto. Roda
// quando os resultados aparecem.
async function janelasDeReacao(combateId: string, resolucaoId: string) {
  const aberta = await mudarResolucoes(combateId, (lista) => {
    const r = lista.find((x) => x.id === resolucaoId);
    if (!r) return null;
    return {
      acao: { modo: r.modo, temDano: r.temDano },
      atacanteId: r.atacanteId,
      todos: r.alvos.map((a) => ({ instanciaId: a.instanciaId })),
      pegos: r.alvos
        .filter((a) => a.reacao == null && !a.danoAplicado && pegoPelaAcao(r, a))
        .map((a) => ({ instanciaId: a.instanciaId, personagemId: a.personagemId })),
    };
  });
  if (!aberta || aberta.pegos.length === 0) return;
  const cabem = new Map<string, OpcaoReacao[]>();
  for (const alvo of aberta.pegos) {
    if (cabem.has(alvo.instanciaId)) continue;
    cabem.set(alvo.instanciaId, [
      ...(await reacoesCabiveis(combateId, alvo, aberta.acao)),
      ...(await reacoesDeAliados(
        combateId,
        alvo,
        { atacanteId: aberta.atacanteId, alvos: aberta.todos },
        aberta.acao,
      )),
    ]);
  }
  await mudarResolucoes(combateId, (lista) => {
    const r = lista.find((x) => x.id === resolucaoId);
    for (const a of r?.alvos ?? []) {
      if (a.reacao != null || !cabem.has(a.instanciaId)) continue;
      const opcoes = cabem.get(a.instanciaId) ?? [];
      if (opcoes.length > 0 && !a.danoAplicado) {
        a.reacao = "pendente";
        a.reacoes = opcoes;
      } else {
        a.reacao = "nenhuma";
      }
    }
  });
}

async function minhaResolucao(personagemId: string) {
  await autorizar(personagemId);
  const combate = await participacaoEmCombate(personagemId);
  if (!combate) throw new ErroDeUso("O personagem não está em combate.");
  return combate;
}

function revalidarCombate(combate: Pick<Lado, "mesaId">, personagemId: string) {
  revalidatePath(`/ficha/${personagemId}`);
  revalidatePath(`/narrador/${combate.mesaId}`);
}

// CR de um alvo da resolução (jogador: a da ficha; criatura: a do bestiário).
async function crDoAlvo(alvo: AlvoResolucao): Promise<number> {
  if (alvo.personagemId) return crDoPersonagem(alvo.personagemId);
  const instancia = await prisma.instanciaCombate.findUnique({
    where: { id: alvo.instanciaId },
    select: { criaturaId: true, condicoesAtivas: true },
  });
  const criatura = instancia?.criaturaId
    ? await prisma.criatura.findUnique({ where: { id: instancia.criaturaId }, select: { classeResistencia: true } })
    : null;
  // Bônus e penalidades de CR das condições dela.
  const daCondicao = bonusDasCondicoesNaCriatura(lerCondicoesAtivas(instancia?.condicoesAtivas), { tipo: "cr" });
  return (criatura?.classeResistencia ?? 10) + daCondicao.valor;
}

type LanceDeAtaque = { total: number; natural: number | null; critico: boolean; ataque?: number };

// Resultado das rolagens de ataque contra a CR de cada alvo. `ataque` diz de
// qual ataque o lance é (o que veio de explosão repete o do lance anterior);
// sem ele, o 1º lance vale pro 1º alvo e assim por diante. Alvo sem lance sai
// da resolução. A CR não sai do servidor.
async function resolverAtaque(lado: Lado, resolucaoId: string, lances: LanceDeAtaque[]) {
  const rolados = (Array.isArray(lances) ? lances : []).slice(0, 12).map((l, i) => ({
    total: Math.trunc(Number(l?.total) || 0),
    natural: l?.natural == null ? null : Math.trunc(Number(l.natural) || 0),
    critico: l?.critico === true,
    ataque: Number.isInteger(l?.ataque) ? Math.max(0, Number(l.ataque)) : i,
  }));
  if (rolados.length === 0) throw new ErroDeUso("Sem rolagem de ataque.");

  const aberta = await mudarResolucoes(lado.combateId, (lista) =>
    lista.find((r) => r.id === resolucaoId && r.atacanteId === lado.instanciaId && r.etapa === "ataque"),
  );
  if (!aberta || aberta.alvos.length === 0) throw new ErroDeUso("Esse ataque já foi resolvido.");

  const alvos = rolados.map((l) => aberta.alvos[Math.min(l.ataque, aberta.alvos.length - 1)]);
  const crs = new Map<string, number>();
  for (const alvo of alvos) {
    if (!crs.has(alvo.instanciaId)) crs.set(alvo.instanciaId, await crDoAlvo(alvo));
  }
  // Acerto a 1,5 m em alvo indefeso (Paralisado, Inconsciente) é crítico.
  const condicoesDosAlvos = new Map(
    (
      await prisma.instanciaCombate.findMany({
        where: { id: { in: [...crs.keys()] } },
        select: { id: true, condicoesAtivas: true },
      })
    ).map((i) => [i.id, lerCondicoesAtivas(i.condicoesAtivas)]),
  );
  const resultados = rolados.map((lance, i) => {
    const r = resultadoDoAtaque(lance, crs.get(alvos[i].instanciaId) ?? 10);
    const indefeso = viraCritico(condicoesDosAlvos.get(alvos[i].instanciaId) ?? [], !!aberta.corpoACorpo);
    return r === "acerto" && indefeso ? "critico" : r;
  });

  const gravou = await mudarResolucoes(lado.combateId, (lista) => {
    const r = lista.find((x) => x.id === resolucaoId && x.etapa === "ataque");
    if (!r) return false;
    // O lance fica guardado: reação que sobe a CR compara o ataque de novo.
    r.alvos = alvos.map((a, i) => ({
      ...a,
      resultado: resultados[i],
      danoAplicado: false,
      lance: { total: rolados[i].total, natural: rolados[i].natural, critico: rolados[i].critico },
    }));
    r.etapa = r.temDano && resultados.some((x) => x !== "erro") ? "dano" : "feito";
    return true;
  });
  if (!gravou) throw new ErroDeUso("Esse ataque já foi resolvido.");

  await registrarAtaques(
    lado.combateId,
    lado.instanciaId,
    aberta.nome,
    alvos.map((a, i) => ({
      para: a.instanciaId,
      total: rolados[i].total,
      res: resultados[i] === "critico" ? "critico" : resultados[i] === "acerto" ? "acerto" : "erro",
    })),
  );

  await avisarCombate(
    lado.mesaId,
    aberta.atacanteNome,
    `${aberta.nome}: ` +
      alvos.map((a, i) => `${a.nome} · ${TEXTO_RESULTADO[resultados[i]]}`).join("; ") +
      (resultados.includes("critico") ? "!" : "."),
  );
  // Técnica que errou todos com quem está Empoderado: o PP volta.
  if (aberta.ppGasto && resultados.every((r) => r === "erro")) await devolverPpDoErro(lado, aberta);
  // Dano de condição no 1º ataque do turno (Queimado).
  await danoDeGatilho(lado, lado.instanciaId, "ataque");
  // Quem foi acertado decide se reage; sem reação a escolher, as condições já entram.
  await janelasDeReacao(lado.combateId, resolucaoId);
  await condicoesDaResolucao(lado, resolucaoId);
  return { resultados };
}

// PP da técnica que errou todos volta pra quem está com condição que devolve.
async function devolverPpDoErro(lado: Lado, resolucao: Resolucao) {
  const instancia = await prisma.instanciaCombate.findUnique({
    where: { id: lado.instanciaId },
    select: { personagemId: true, nomeExibicao: true, condicoesAtivas: true },
  });
  const quem = instancia ? travasDasCondicoes(lerCondicoesAtivas(instancia.condicoesAtivas)).ppDeErroVolta : null;
  if (!instancia?.personagemId || !quem || !resolucao.ppGasto) return;
  await prisma.personagem.update({
    where: { id: instancia.personagemId },
    data: { ppAtual: { increment: resolucao.ppGasto } },
  });
  await avisarCombate(lado.mesaId, instancia.nomeExibicao, `recuperou ${resolucao.ppGasto} PP (${quem}).`);
}

// Dano de condição com gatilho (1º ataque do turno, ao se mover): uma vez por
// turno de combate. `condicaoId` restringe a uma. Devolve quantas dispararam.
async function danoDeGatilho(
  lado: { mesaId: string; combateId: string },
  instanciaId: string,
  gatilho: "ataque" | "movimento",
  condicaoId?: string,
): Promise<number> {
  const [instancia, combate] = await Promise.all([
    prisma.instanciaCombate.findUnique({
      where: { id: instanciaId },
      select: { combateId: true, nomeExibicao: true, personagemId: true, condicoesAtivas: true },
    }),
    prisma.combate.findUnique({ where: { id: lado.combateId }, select: { rodadaAtual: true, turnoAtual: true } }),
  ]);
  if (!instancia || !combate || instancia.combateId !== lado.combateId) return 0;
  const vez = `${combate.rodadaAtual}:${combate.turnoAtual}`;
  const condicoes = lerCondicoesAtivas(instancia.condicoesAtivas);
  const disparam = condicoes.filter(
    (c) => (!condicaoId || c.id === condicaoId) && mecanicaDa(c)?.dano?.quando === gatilho && c.disparou !== vez,
  );
  if (disparam.length === 0) return 0;
  await prisma.instanciaCombate.update({
    where: { id: instanciaId },
    data: {
      condicoesAtivas: condicoes.map((c) =>
        disparam.includes(c) ? { ...c, disparou: vez } : c,
      ) as unknown as Prisma.InputJsonValue,
    },
  });
  for (const c of disparam) {
    const dano = mecanicaDa(c)!.dano!;
    const f = parseFormulaDados(dano.formula);
    const valor = f.dados.length > 0 ? rolarDados(f.dados, f.modificador).total : f.modificador;
    if (!(valor > 0)) continue;
    await avisarCombate(lado.mesaId, instancia.nomeExibicao, `sofre com ${c.nome}.`);
    await danoNaInstancia(
      lado,
      { instanciaId, nome: instancia.nomeExibicao, personagemId: instancia.personagemId },
      [{ valor, tipo: dano.tipo }],
      { de: c.fonteId, acao: c.nome },
    );
  }
  return disparam.length;
}

// Ação de uma condição (Apagar, Tratar): gasta a ação do turno e tira, troca
// por outra ou testa pra tirar. `total`: o teste, já rolado.
async function acaoDaCondicao(
  lado: { mesaId: string; combateId: string },
  quem: {
    instanciaId: string;
    nome: string;
    naVez: boolean;
    gastas: AcoesGastas;
    maximo: Record<TipoAcaoCombate, number>;
    condicoes: CondicaoAtiva[];
  },
  condicaoId: string,
  indice: number,
  total: number | null,
) {
  const condicao = quem.condicoes.find((c) => c.id === condicaoId);
  const acao = condicao ? mecanicaDa(condicao)?.acoes?.[Math.trunc(Number(indice))] : undefined;
  if (!condicao || !acao) throw new ErroDeUso("Essa ação não existe mais.");
  if (acao.custo !== "livre") {
    if (!quem.naVez) throw new ErroDeUso("Não é a sua vez.");
    if ((quem.gastas[acao.custo] ?? 0) >= quem.maximo[acao.custo]) {
      throw new ErroDeUso(`Sem ação ${ACAO_COMBATE[acao.custo].nome.toLowerCase()} neste turno.`);
    }
    const trava = travaDaCondicaoNaAcao(quem.condicoes, acao.custo, quem.gastas);
    if (trava) throw new ErroDeUso(trava);
  }
  if (acao.faz === "teste" && total == null) throw new ErroDeUso("Role o teste.");

  if (acao.custo !== "livre") {
    await prisma.instanciaCombate.update({
      where: { id: quem.instanciaId },
      data: { acoesGastas: { ...quem.gastas, [acao.custo]: (quem.gastas[acao.custo] ?? 0) + 1 } },
    });
  }
  const passou = acao.faz !== "teste" || (total ?? 0) >= (acao.teste?.cd ?? 10);
  if (passou) await tirarCondicao(lado.combateId, quem.instanciaId, condicaoId);
  if (passou && acao.faz === "trocar" && acao.condicao) {
    await aplicarCondicoes({
      combateId: lado.combateId,
      instanciaIds: [quem.instanciaId],
      condicoes: [{ nome: acao.condicao, rodadas: RODADAS_MAX, salvaguarda: null }],
      fonteId: null,
      origem: condicao.nome,
    });
  }
  const teste = acao.faz === "teste" ? ` (${total} contra CD ${acao.teste?.cd})` : "";
  await avisarCombate(
    lado.mesaId,
    quem.nome,
    passou
      ? `${acao.nome}${teste}: não está mais com ${condicao.nome}` +
          (acao.faz === "trocar" ? `, agora com ${acao.condicao}.` : ".")
      : `${acao.nome}${teste}: continua com ${condicao.nome}.`,
  );
}

// O jogador usa uma ação da condição dele.
export async function usarAcaoDeCondicao(
  personagemId: string,
  condicaoId: string,
  indice: number,
  teste?: { total: number },
) {
  return executar("ficha", async () => {
    const combate = await minhaResolucao(personagemId);
    const [{ agg }, instancia] = await Promise.all([
      carregarAgregado(personagemId),
      prisma.instanciaCombate.findUnique({ where: { id: combate.instanciaId }, select: { nomeExibicao: true } }),
    ]);
    await acaoDaCondicao(
      combate,
      {
        instanciaId: combate.instanciaId,
        nome: instancia?.nomeExibicao ?? "",
        naVez: combate.naVez,
        gastas: combate.gastas,
        maximo: maximoDeAcoes(agg.acoesExtras, combate.gastas.ganhas),
        condicoes: combate.condicoes,
      },
      condicaoId,
      indice,
      teste ? Math.trunc(Number(teste.total) || 0) : null,
    );
    revalidarCombate(combate, personagemId);
  });
}

// O narrador usa a ação de uma condição numa criatura; o teste rola aqui.
export async function acaoDeCondicaoDaCriatura(
  mesaId: string,
  combateId: string,
  instanciaId: string,
  condicaoId: string,
  indice: number,
) {
  return executar("sessao", async () => {
    const { lado, instancia, criaturaId } = await ladoDaCriatura(mesaId, combateId, instanciaId);
    const [combate, criatura] = await Promise.all([
      prisma.combate.findUniqueOrThrow({
        where: { id: combateId },
        select: { turnoAtual: true, participantes: { select: { id: true, iniciativa: true, ordem: true } } },
      }),
      prisma.criatura.findUnique({ where: { id: criaturaId } }),
    ]);
    const condicoes = lerCondicoesAtivas(instancia.condicoesAtivas);
    const acao = mecanicaDa(condicoes.find((c) => c.id === condicaoId) ?? { nome: "" })?.acoes?.[indice];
    let total: number | null = null;
    if (acao?.faz === "teste" && acao.teste && criatura) {
      const bonus = bonusDePericiaDaCriatura(criatura, acao.teste.pericia);
      total = rolarD20Contextual().mantido + bonus;
    }
    await acaoDaCondicao(
      lado,
      {
        instanciaId,
        nome: instancia.nomeExibicao,
        naVez: ordenarParticipantes(combate.participantes)[combate.turnoAtual]?.id === instanciaId,
        gastas: lerAcoesGastas(instancia.acoesGastas),
        maximo: maximoDeAcoes(),
        condicoes,
      },
      condicaoId,
      indice,
      total,
    );
    revalidatePath(`/narrador/${mesaId}`);
  });
}

// A criatura se moveu com uma condição que dói ao se mover.
export async function moverCriaturaComCondicao(mesaId: string, combateId: string, instanciaId: string, condicaoId: string) {
  return executar("sessao", async () => {
    const { lado } = await ladoDaCriatura(mesaId, combateId, instanciaId);
    if ((await danoDeGatilho(lado, instanciaId, "movimento", condicaoId)) === 0) {
      throw new ErroDeUso("Esse dano já caiu neste turno.");
    }
    revalidatePath(`/narrador/${mesaId}`);
  });
}

// O jogador se moveu com uma condição que dói ao se mover (Sangramento).
export async function moverComCondicao(personagemId: string, condicaoId: string) {
  return executar("ficha", async () => {
    const combate = await minhaResolucao(personagemId);
    if ((await danoDeGatilho(combate, combate.instanciaId, "movimento", condicaoId)) === 0) {
      throw new ErroDeUso("Esse dano já caiu neste turno.");
    }
    revalidarCombate(combate, personagemId);
  });
}

// Dano rolado de uma resolução, uma parte por tipo: passa pelas defesas de cada
// alvo e desconta o PV. No ataque vale pro próximo acerto; `restam` diz quantos
// acertos ainda esperam a própria rolagem de dano.
async function aplicarDano(lado: Lado, resolucaoId: string, dano: { valor: number; tipo?: string }[]) {
  const partes = normalizarPartesDano(dano);

  const feito = await mudarResolucoes(lado.combateId, (lista) => {
    const r = lista.find((x) => x.id === resolucaoId && x.atacanteId === lado.instanciaId);
    if (!r) return null;
    if (r.etapa !== "dano") {
      // Uma reação fez o ataque errar depois de o dano ter sido pedido: não há o que descontar.
      const anulado = r.alvos.some((a) => a.reacao && typeof a.reacao === "object" && a.reacao.anulou);
      return anulado ? { resolucao: structuredClone(r), leva: [], restam: 0 } : null;
    }
    r.dano = partes;
    if (r.modo === "ataque") {
      const proximo = acertosSemDano(r)[0];
      if (proximo) proximo.danoRolado = partes;
    }
    const leva = quemLevaAgora(r);
    const restam = r.modo === "ataque" ? acertosSemDano(r).length : 0;
    if (restam === 0) r.etapa = "feito";
    return { resolucao: structuredClone(r), leva, restam };
  });
  if (!feito) throw new ErroDeUso("Esse dano já foi aplicado.");

  await descontarDano(lado.mesaId, lado.combateId, feito.resolucao, feito.leva);
  return { restam: feito.restam };
}

export async function resolverAtaqueEmCombate(personagemId: string, resolucaoId: string, lances: LanceDeAtaque[]) {
  return executar("ficha", async () => {
    const combate = await minhaResolucao(personagemId);
    const saida = await resolverAtaque(combate, resolucaoId, lances);
    revalidarCombate(combate, personagemId);
    return saida;
  });
}

export async function aplicarDanoEmCombate(
  personagemId: string,
  resolucaoId: string,
  dano: { valor: number; tipo?: string }[],
) {
  return executar("ficha", async () => {
    const combate = await minhaResolucao(personagemId);
    const saida = await aplicarDano(combate, resolucaoId, dano);
    revalidarCombate(combate, personagemId);
    return saida;
  });
}

// Salvaguarda que pediram do personagem: compara com a CD e, se o dano já foi
// rolado, desconta na hora.
export async function responderSalvaguarda(
  personagemId: string,
  resolucaoId: string,
  rolagem: { total: number; natural: number | null },
  // Salvaguarda de estrutura: o navio (InstanciaCombate.id) que ele comanda.
  pelo?: string,
) {
  return executar("ficha", async () => {
    const combate = await minhaResolucao(personagemId);
    const quem = pelo ? await navioComandado(combate.combateId, pelo, personagemId) : { instanciaId: combate.instanciaId, personagemId };
    const total = Math.trunc(Number(rolagem?.total) || 0);
    const natural = rolagem?.natural == null ? null : Math.trunc(Number(rolagem.natural) || 0);
    const temDano = await mudarResolucoes(
      combate.combateId,
      (lista) => lista.find((x) => x.id === resolucaoId && x.salvaguarda)?.temDano === true,
    );
    const reacoes = await reacoesCabiveis(combate.combateId, quem, { modo: "salvaguarda", temDano });
    // Evasão passiva (de uma habilidade): sucesso não sofre dano, falha sofre metade.
    const evasao = quem.personagemId ? (await carregarAgregado(quem.personagemId)).agg.evasao.length > 0 : false;

    const feito = await mudarResolucoes(combate.combateId, (lista) => {
      const r = lista.find((x) => x.id === resolucaoId && x.salvaguarda);
      const alvo = r?.alvos.find((a) => a.instanciaId === quem.instanciaId && a.resultado === null);
      if (!r || !alvo) return null;
      const salv = resultadoDaSalvaguarda({ total, natural }, r.salvaguarda!.cd);
      alvo.resultado = salv.resultado;
      if (evasao) alvo.evasao = true;
      // Vai levar dano e tem reação que cabe: o dano espera a decisão dele.
      if (r.temDano && alvo.reacao == null) {
        if (reacoes.length > 0 && pegoPelaAcao(r, alvo)) {
          alvo.reacao = "pendente";
          alvo.reacoes = reacoes;
        } else {
          alvo.reacao = "nenhuma";
        }
      }
      return { resolucao: structuredClone(r), alvo: { ...alvo }, salv, leva: quemLevaAgora(r) };
    });
    if (!feito) throw new ErroDeUso("Essa salvaguarda já foi respondida.");

    await avisarCombate(
      combate.mesaId,
      feito.alvo.nome,
      `${textoDaSalvaguarda(feito.salv)} contra ${feito.resolucao.nome} (CD ${feito.resolucao.salvaguarda!.cd}).`,
    );
    await descontarDano(combate.mesaId, combate.combateId, feito.resolucao, feito.leva);
    await condicoesDaResolucao(combate, resolucaoId);
    revalidarCombate(combate, personagemId);
    return { resultado: feito.alvo.resultado };
  });
}

// O navio do combate que o personagem comanda (ficha de navio com ele de comandante).
async function navioComandado(combateId: string, instanciaId: string, comandanteId: string) {
  const instancia = await prisma.instanciaCombate.findFirst({
    where: { id: instanciaId, combateId },
    select: { personagemId: true },
  });
  const navio = instancia?.personagemId
    ? await prisma.personagem.findUnique({ where: { id: instancia.personagemId }, select: { navio: true } })
    : null;
  if (!instancia?.personagemId || lerNavio(navio?.navio)?.comandanteId !== comandanteId) {
    throw new ErroDeUso("Você não comanda esse navio.");
  }
  return { instanciaId, personagemId: instancia.personagemId };
}

// ─── Navio no combate ──────────────────────────────────────────────────────

type Manobra = { tipo: "velocidade"; valor: number } | { tipo: "virar"; lado: number } | { tipo: "ancora"; baixar: boolean };

// O navio na vez dele: a ficha, o estado no combate e a velocidade máxima com o dano.
async function navioNaVez(navioId: string, acao: TipoAcaoCombate) {
  const combate = await minhaResolucao(navioId);
  const [navio, instancia] = await Promise.all([
    prisma.personagem.findUnique({
      where: { id: navioId },
      select: { navio: true, deslocamento: true, hpAtual: true, hpMax: true, nome: true },
    }),
    prisma.instanciaCombate.findUnique({ where: { id: combate.instanciaId }, select: { estadoNavio: true } }),
  ]);
  const dados = lerNavio(navio?.navio);
  if (!navio || !dados) throw new ErroDeUso("Esta ficha não é de navio.");
  if (!combate.naVez) throw new ErroDeUso("Não é a vez do navio.");
  if ((combate.gastas[acao] ?? 0) >= 1) {
    throw new ErroDeUso(acao === "bonus" ? "O navio já manobrou neste turno." : "O navio já usou a ação de combate.");
  }
  const maxima = velocidadeComDano(navio.deslocamento, navio.hpAtual, navio.hpMax);
  return { combate, navio, dados, maxima, estado: lerEstadoNavio(instancia?.estadoNavio, maxima) };
}

// Manobra do navio (cap. 14.5), gasta a ação de manobra do turno: muda a
// velocidade até 6 nós (entre 2 e o máximo), vira até 45° ou sobe/baixa a
// âncora. Mover com a âncora baixada dá 8d10 contundente no navio a cada 6
// nós; a cada 80 de dano, d20 ≤ 5 solta a âncora.
export async function manobrarNavio(navioId: string, manobra: Manobra) {
  return executar("ficha", async () => {
    const { combate, navio, maxima, estado } = await navioNaVez(navioId, "bonus");
    let texto = "";
    if (manobra?.tipo === "velocidade") {
      const pedido = Math.min(maxima, Math.max(2, Math.trunc(Number(manobra.valor) || 0)));
      const alvo = Math.min(estado.velocidade + MANOBRA_NOS, Math.max(estado.velocidade - MANOBRA_NOS, pedido));
      if (estado.ancora) {
        const f = parseFormulaDados(DANO_ANCORA);
        const vezes = Math.max(1, Math.ceil(alvo / MANOBRA_NOS));
        let dano = 0;
        for (let i = 0; i < vezes; i++) dano += rolarDados(f.dados, f.modificador).total;
        const antes = Math.floor(estado.danoAncora / DANO_PRA_SOLTAR_ANCORA);
        estado.danoAncora += dano;
        let soltou = false;
        for (let i = antes; i < Math.floor(estado.danoAncora / DANO_PRA_SOLTAR_ANCORA); i++) {
          if (1 + Math.floor(Math.random() * 20) <= 5) soltou = true;
        }
        await avisarCombate(combate.mesaId, navio.nome, `forçou a âncora (${vezes * 8}d10).`);
        await danoNaInstancia(combate, { instanciaId: combate.instanciaId, nome: navio.nome, personagemId: navioId }, [
          { valor: dano, tipo: "Contundente" },
        ], { de: null, acao: "Âncora" });
        if (soltou) {
          estado.ancora = false;
          estado.velocidade = alvo;
          texto = `a âncora soltou: ${alvo} nós.`;
        } else {
          texto = "a âncora segura o navio.";
        }
      } else {
        estado.velocidade = alvo;
        texto = `${alvo > pedido || alvo < pedido ? "mudou pra " : ""}${alvo} nós (${metrosPorRodada(alvo).toLocaleString("pt-BR")} m por rodada).`;
      }
    } else if (manobra?.tipo === "virar") {
      const lado = Number(manobra.lado) < 0 ? -1 : 1;
      estado.rumo = (((estado.rumo + lado * MANOBRA_GRAUS) % 360) + 360) % 360;
      texto = `virou a ${lado < 0 ? "bombordo" : "estibordo"}: rumo ${textoRumo(estado.rumo)}.`;
    } else if (manobra?.tipo === "ancora") {
      estado.ancora = manobra.baixar === true;
      if (estado.ancora) estado.velocidade = 0;
      texto = estado.ancora ? "baixou a âncora e parou." : "subiu a âncora.";
    } else {
      throw new ErroDeUso("Manobra inválida.");
    }
    await prisma.instanciaCombate.update({
      where: { id: combate.instanciaId },
      data: {
        estadoNavio: estado,
        acoesGastas: { ...combate.gastas, bonus: (combate.gastas.bonus ?? 0) + 1 },
      },
    });
    await avisarCombate(combate.mesaId, navio.nome, texto);
    revalidarCombate(combate, navioId);
  });
}

// Colisão (cap. 14.5), gasta a ação de combate: só acima de 16 nós; o dano é
// o da maior categoria, e quem tem mais CR leva metade (CR igual, os dois inteiro).
export async function colidirNavio(navioId: string, alvoInstanciaId: string) {
  return executar("ficha", async () => {
    const { combate, navio, dados, estado } = await navioNaVez(navioId, "padrao");
    if (estado.velocidade <= NOS_PRA_COLIDIR) throw new ErroDeUso(`Precisa de mais de ${NOS_PRA_COLIDIR} nós pra colidir.`);
    const alvo = await prisma.instanciaCombate.findFirst({
      where: { id: alvoInstanciaId, combateId: combate.combateId, NOT: { id: combate.instanciaId } },
      select: { id: true, nomeExibicao: true, personagemId: true },
    });
    if (!alvo) throw new ErroDeUso("Alvo não está no combate.");
    // Navio contra navio: a maior categoria dos dois; contra outra coisa, a do próprio.
    const fichaDoAlvo = alvo.personagemId
      ? await prisma.personagem.findUnique({ where: { id: alvo.personagemId }, select: { navio: true } })
      : null;
    const tamanhoAlvo = lerNavio(fichaDoAlvo?.navio)?.montagem.tamanho ?? dados.montagem.tamanho;
    const formula = danoDeColisao(dados.montagem.tamanho, tamanhoAlvo);
    const f = parseFormulaDados(formula);
    const dano = rolarDados(f.dados, f.modificador).total;
    const [crMeu, crAlvo] = await Promise.all([
      crDoPersonagem(navioId),
      crDoAlvo({ instanciaId: alvo.id, nome: alvo.nomeExibicao, personagemId: alvo.personagemId, resultado: null, danoAplicado: false }),
    ]);
    await prisma.instanciaCombate.update({
      where: { id: combate.instanciaId },
      data: { acoesGastas: { ...combate.gastas, padrao: (combate.gastas.padrao ?? 0) + 1 } },
    });
    await avisarCombate(
      combate.mesaId,
      navio.nome,
      `colidiu com ${alvo.nomeExibicao} a ${estado.velocidade} nós: ${formula} = ${dano}.`,
    );
    const metade = (cr: number, outra: number) => (cr > outra ? Math.floor(dano / 2) : dano);
    await danoNaInstancia(
      combate,
      { instanciaId: alvo.id, nome: alvo.nomeExibicao, personagemId: alvo.personagemId },
      [{ valor: metade(crAlvo, crMeu), tipo: "Contundente" }],
      { de: combate.instanciaId, acao: "Colisão" },
    );
    await danoNaInstancia(
      combate,
      { instanciaId: combate.instanciaId, nome: navio.nome, personagemId: navioId },
      [{ valor: metade(crMeu, crAlvo), tipo: "Contundente" }],
      { de: alvo.id, acao: "Colisão" },
    );
    revalidarCombate(combate, navioId);
  });
}

// Repetir a salvaguarda de uma condição pra sair dela antes do fim.
export async function tentarSairDaCondicao(
  personagemId: string,
  condicaoId: string,
  rolagem: { total: number; natural: number | null },
) {
  return executar("ficha", async () => {
    const combate = await minhaResolucao(personagemId);
    const condicao = combate.condicoes.find((c) => c.id === condicaoId);
    if (!condicao?.salvaguarda) throw new ErroDeUso("Essa condição não tem salvaguarda pra repetir.");

    const salv = resultadoDaSalvaguarda(
      {
        total: Math.trunc(Number(rolagem?.total) || 0),
        natural: rolagem?.natural == null ? null : Math.trunc(Number(rolagem.natural) || 0),
      },
      condicao.salvaguarda.cd,
    );
    const saiu = salv.resultado === "sucesso" ? await tirarCondicao(combate.combateId, combate.instanciaId, condicaoId) : null;
    const nome = saiu?.nome ?? (await prisma.personagem.findUnique({ where: { id: personagemId }, select: { nome: true } }))?.nome ?? "";
    await avisarCombate(
      combate.mesaId,
      nome,
      salv.resultado === "sucesso"
        ? `${textoDaSalvaguarda(salv)} e não está mais com ${condicao.nome}.`
        : `${textoDaSalvaguarda(salv)} e continua com ${condicao.nome}.`,
    );
    revalidarCombate(combate, personagemId);
    return { saiu: salv.resultado === "sucesso" };
  });
}

// A reação que o alvo escolheu, com os efeitos já rolados. `de` é quem reage;
// `reator` só vem de jogador (pra interceptar o ataque de um aliado).
type ReacaoFeita = {
  de: string;
  nome: string;
  efeito: EfeitoDeReacao;
  reator?: { instanciaId: string; personagemId: string | null; nome: string };
};

// "CR +2 e o ataque errou, 10 PV temporário, −5 de dano".
function textoDaReacao(u: ReacaoUsada): string {
  return [
    u.interceptou ? `recebeu o ataque no lugar de ${u.interceptou}` : null,
    u.evasao ? "com Evasão" : null,
    u.cr ? `CR +${u.cr}${u.anulou ? " e o ataque errou" : ""}` : null,
    u.pvTemp ? `${u.pvTemp} PV temporário` : null,
    u.reducao > 0 ? `−${u.reducao} de dano` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

// As reações que cabem na janela aberta do alvo; null = a janela já fechou.
function opcoesDaJanela(combateId: string, resolucaoId: string, instanciaId: string) {
  return mudarResolucoes(combateId, (lista) => {
    const alvo = lista
      .find((r) => r.id === resolucaoId)
      ?.alvos.find((a) => a.instanciaId === instanciaId && a.reacao === "pendente");
    return alvo ? (alvo.reacoes ?? []) : null;
  });
}

// Fecha a janela de reação de um alvo e segue com a ação que estava esperando.
// Com reação, os efeitos dela entram antes: a CR maior compara o ataque de novo
// (se não passa mais, ele erra), a redução sai do dano, e o PV temporário (que
// quem chamou já deu) é consumido antes do PV. `null` = não reagiu.
async function fecharJanela(
  lado: Pick<Lado, "combateId" | "mesaId">,
  resolucaoId: string,
  instanciaId: string,
  reacao: ReacaoFeita | null,
) {
  // CR do alvo com a reação valendo; null = a reação não mexe na CR (ou não é ataque).
  // Interceptar não compara: quem reage toma o ataque, que acerta.
  let cr: { antes: number; depois: number } | null = null;
  if (reacao && !reacao.efeito.interceptar && (reacao.efeito.cr > 0 || reacao.efeito.crFixa > 0)) {
    const alvo = await mudarResolucoes(lado.combateId, (lista) =>
      lista
        .find((r) => r.id === resolucaoId && r.modo === "ataque")
        ?.alvos.find((a) => a.instanciaId === instanciaId && a.reacao === "pendente"),
    );
    if (alvo) {
      const antes = await crDoAlvo(alvo);
      const depois = crComReacao(antes, reacao.efeito);
      if (depois > antes) cr = { antes, depois };
    }
  }

  const feito = await mudarResolucoes(lado.combateId, (lista) => {
    const r = lista.find((x) => x.id === resolucaoId);
    const alvos = r?.alvos.filter((a) => a.instanciaId === instanciaId && a.reacao === "pendente") ?? [];
    if (!r || alvos.length === 0) return null;

    // 20 natural e crítico continuam acertando; o resto precisa passar a CR nova.
    let anulou = false;
    if (cr) {
      for (const a of alvos) {
        if (a.lance && resultadoDoAtaque(a.lance, cr.depois) === "erro") {
          a.resultado = "erro";
          anulou = true;
        }
      }
    }
    // Interceptar: quem reage vira o alvo do ataque, que acerta (crítico continua).
    let interceptou: string | undefined;
    const reator = reacao?.efeito.interceptar ? reacao.reator : undefined;
    if (reator && r.modo === "ataque" && !r.alvos.some((x) => x.instanciaId === reator.instanciaId)) {
      interceptou = alvos[0].nome;
      for (const a of alvos) {
        a.instanciaId = reator.instanciaId;
        a.nome = reator.nome;
        a.personagemId = reator.personagemId;
        a.resultado = a.resultado === "critico" ? "critico" : "acerto";
      }
    }
    // Evasão: a salvaguarda passa a valer com ela (sucesso nada, falha metade).
    const evasao = !!reacao?.efeito.evasao && r.modo === "salvaguarda";
    if (evasao) for (const a of alvos) a.evasao = true;
    const usada: ReacaoUsada | null = reacao
      ? {
          nome: reacao.nome,
          reducao: reacao.efeito.reducao,
          ...(cr ? { cr: cr.depois - cr.antes } : {}),
          ...(reacao.efeito.pvTemp > 0 ? { pvTemp: reacao.efeito.pvTemp } : {}),
          ...(anulou ? { anulou: true } : {}),
          ...(interceptou ? { interceptou } : {}),
          ...(evasao ? { evasao: true } : {}),
        }
      : null;
    // A CR vale pra todos os ataques da ação nele; a redução, pra um golpe só
    // (no multiataque no mesmo alvo, o 1º acerto que sobrou).
    let reduziu = false;
    for (const a of alvos) {
      const leva = sofreDano(r, a) > 0;
      a.reacao = usada ? { ...usada, reducao: leva && !reduziu ? usada.reducao : 0 } : "nenhuma";
      a.reacoes = [];
      if (leva) reduziu = true;
    }
    // Nenhum acerto sobrou esperando dano: não há mais o que rolar.
    if (r.modo === "ataque" && r.etapa === "dano" && acertosSemDano(r).length === 0) r.etapa = "feito";
    return { resolucao: structuredClone(r), leva: quemLevaAgora(r), usada };
  });
  if (!feito) throw new ErroDeUso("Essa reação já foi decidida.");

  if (reacao && feito.usada) {
    const texto = textoDaReacao(feito.usada);
    await avisarCombate(lado.mesaId, reacao.de, `reagiu com ${reacao.nome}` + (texto ? `: ${texto}.` : "."));
  }
  await descontarDano(lado.mesaId, lado.combateId, feito.resolucao, feito.leva);
  await condicoesDaResolucao(lado, resolucaoId);
  return feito.usada;
}

// O jogador que a ação pegou (ou um aliado dele, no gatilho "aliado alvo de
// ataque") decide: reage com uma das reações da ficha que cabem (gasta a reação
// do turno e os custos dela) ou deixa a ação seguir. Os efeitos da reação são
// rolados aqui e valem antes do resto: CR maior (o ataque é comparado de novo),
// PV temporário (o dano sai dele primeiro), redução de dano, Interceptar (quem
// reagiu vira o alvo do ataque) e Evasão. `alvoId` = o pego, quando é um aliado.
export async function reagirEmCombate(
  personagemId: string,
  resolucaoId: string,
  acaoId: string | null,
  opcoes?: { alvoId?: string },
) {
  return executar("ficha", async () => {
    const combate = await minhaResolucao(personagemId);
    const janela = typeof opcoes?.alvoId === "string" && opcoes.alvoId ? opcoes.alvoId : combate.instanciaId;
    if (!acaoId) {
      // Não reagir tira só as reações dele; a janela fecha quando ninguém mais pode.
      const restam = await mudarResolucoes(combate.combateId, (lista) => {
        const alvos =
          lista.find((r) => r.id === resolucaoId)?.alvos.filter((a) => a.instanciaId === janela && a.reacao === "pendente") ?? [];
        if (alvos.length === 0) return null;
        for (const a of alvos) {
          a.reacoes = (a.reacoes ?? []).filter((o) => (o.de ? o.de.instanciaId : a.instanciaId) !== combate.instanciaId);
        }
        return alvos[0].reacoes?.length ?? 0;
      });
      if (restam === null) throw new ErroDeUso("Essa reação já foi decidida.");
      if (restam === 0) await fecharJanela(combate, resolucaoId, janela, null);
      revalidarCombate(combate, personagemId);
      return { reacao: null };
    }

    const [acao, { agg }, personagem] = await Promise.all([
      prisma.acao.findFirst({ where: { id: acaoId, personagemId, tipo: "react" } }),
      carregarAgregado(personagemId),
      prisma.personagem.findUniqueOrThrow({ where: { id: personagemId } }),
    ]);
    if (!acao) throw new ErroDeUso("Reação não encontrada.");
    const daJanela = await opcoesDaJanela(combate.combateId, resolucaoId, janela);
    if (!daJanela) throw new ErroDeUso("Essa reação já foi decidida.");
    const minhas = daJanela.filter((o) => (o.de ? o.de.instanciaId : janela) === combate.instanciaId);
    if (!minhas.some((o) => o.id === acaoId)) throw new ErroDeUso("Essa reação não cabe nesta ação.");
    // Usar a reação gasta a ação do turno e os custos, com as mesmas travas de sempre.
    const uso = await usarAcao(personagemId, acaoId);
    if (!uso.ok) throw new ErroDeUso(uso.erro);

    const ctx = agg.ctxFormula ?? { nivel: personagem.nivel, atributos: atributosDoPersonagem(personagem) };
    const efeito = efeitosDaReacao(lerEfeitos(acao.efeitos), (f) =>
      resolverFormula(f, ctx.atributos, ctx.nivel, { grau: acao.grau }),
    );
    // PV temporário entra antes do dano. O de valor fixo o uso já deu; o de
    // fórmula com dado foi rolado aqui e fica se for maior que o que ele tem.
    if (efeito.pvTemp > 0) {
      const { hpTemp } = await prisma.personagem.findUniqueOrThrow({
        where: { id: personagemId },
        select: { hpTemp: true },
      });
      if (efeito.pvTemp > hpTemp) {
        await prisma.personagem.update({
          where: { id: personagemId },
          data: { hpTemp: efeito.pvTemp, hpTempDuracao: duracaoPvTempNoBanco(efeito.duracaoPv) },
        });
      }
    }

    const reacao = await fecharJanela(combate, resolucaoId, janela, {
      de: personagem.nome,
      nome: acao.nome,
      efeito,
      reator: { instanciaId: combate.instanciaId, personagemId, nome: personagem.nome },
    });
    revalidarCombate(combate, personagemId);
    return { reacao };
  });
}

// Narrador destrava uma janela de reação parada: o dano segue sem reação.
export async function seguirSemReacao(mesaId: string, combateId: string, resolucaoId: string, instanciaId: string) {
  return executar("sessao", async () => {
    const [user, combate] = await Promise.all([
      usuarioDaRequest(),
      prisma.combate.findUnique({
        where: { id: combateId },
        select: { sessao: { select: { mesaId: true, mesa: { select: { userId: true } } } } },
      }),
    ]);
    if (!user) throw new ErroDeUso("Não autenticado.");
    if (!combate || combate.sessao.mesaId !== mesaId) throw new ErroDeUso("Combate não encontrado.");
    if (combate.sessao.mesa.userId !== user.id) throw new ErroDeUso("Só o narrador destrava a reação.");

    await fecharJanela({ combateId, mesaId }, resolucaoId, instanciaId, null);
    revalidatePath(`/narrador/${mesaId}`);
  });
}

// Teste de concentração pedido por um dano do combate. `total` nulo = o
// jogador desistiu de rolar. Abaixo da CD, a concentração acaba.
export async function responderConcentracao(personagemId: string, resolucaoId: string, total: number | null) {
  return executar("ficha", async () => {
    const [{ personagem }, combate] = await Promise.all([autorizar(personagemId), participacaoEmCombate(personagemId)]);
    if (!combate) throw new ErroDeUso("O personagem não está em combate.");

    const teste = await mudarResolucoes(combate.combateId, (lista) => {
      const alvo = lista
        .find((r) => r.id === resolucaoId)
        ?.alvos.find((a) => a.instanciaId === combate.instanciaId && a.concentracao);
      if (!alvo?.concentracao) return null;
      const pedido = alvo.concentracao;
      alvo.concentracao = null;
      return pedido;
    });
    if (!teste) throw new ErroDeUso("Esse teste já foi respondido.");

    const manteve = total != null && Math.trunc(Number(total) || 0) >= teste.cd;
    const concentracao = lerConcentracao(personagem.concentracao);
    if (!manteve && concentracao) {
      await prisma.$transaction(opsConcentracao(personagemId, concentracao, null));
      await colateraisDaConcentracao(personagemId, personagem.concentracao);
    }
    await avisarCombate(
      combate.mesaId,
      personagem.nome,
      manteve
        ? `manteve a concentração em ${teste.nome} (CD ${teste.cd}).`
        : `perdeu a concentração em ${teste.nome}.`,
    );
    revalidarCombate(combate, personagemId);
    return { manteve };
  });
}

// ─── Combate: ações de criatura (narrador) ─────────────────────────────────

// Bloco do statblock → ação do turno que a criatura gasta. Aspecto e ação
// lendária não gastam.
const ACAO_DO_BLOCO: Record<string, TipoAcaoCombate> = {
  acao: "padrao",
  acaoBonus: "bonus",
  acaoPoderosa: "power",
  reacao: "react",
};

// O narrador da mesa mexendo numa criatura do combate dela.
async function ladoDaCriatura(mesaId: string, combateId: string, instanciaId: string) {
  const [user, combate] = await Promise.all([
    usuarioDaRequest(),
    prisma.combate.findUnique({
      where: { id: combateId },
      select: { encerradoEm: true, sessao: { select: { mesaId: true, mesa: { select: { userId: true } } } } },
    }),
  ]);
  if (!user) throw new ErroDeUso("Não autenticado.");
  if (!combate || combate.sessao.mesaId !== mesaId || combate.encerradoEm) throw new ErroDeUso("Combate não encontrado.");
  if (combate.sessao.mesa.userId !== user.id) throw new ErroDeUso("Só o narrador usa as ações das criaturas.");

  const instancia = await prisma.instanciaCombate.findFirst({
    where: { id: instanciaId, combateId },
    select: {
      id: true,
      nomeExibicao: true,
      criaturaId: true,
      ppGasto: true,
      estadoRecargas: true,
      acoesGastas: true,
      acoesReveladas: true,
      autoRevelarAcoes: true,
      pvTemp: true,
      condicoesAtivas: true,
    },
  });
  if (!instancia?.criaturaId) throw new ErroDeUso("Criatura não encontrada neste combate.");
  return { lado: { instanciaId, combateId, mesaId } satisfies Lado, instancia, criaturaId: instancia.criaturaId };
}

type CriaturaEmCombate = Awaited<ReturnType<typeof ladoDaCriatura>>;

// O que a criatura gasta pra usar uma ação do statblock (usos, PP, recursos
// próprios, ação lendária), conferido antes de gastar. `forcar`: o narrador
// decidiu usar mesmo sem ter; nada fica negativo.
async function custoDaAcaoDeCriatura(
  { instancia, criaturaId }: CriaturaEmCombate,
  componenteId: string,
  forcar: boolean,
) {
  const bruta = await prisma.criatura.findUnique({
    where: { id: criaturaId },
    include: { componentes: true, linhagem: true },
  });
  if (!bruta) throw new ErroDeUso("Criatura não encontrada no bestiário.");
  const criatura = serializarCriatura(bruta);
  const acao = criatura.componentes.find((c) => c.id === componenteId);
  if (!acao) throw new ErroDeUso("Ação não encontrada.");

  const usos = lerUsosAcoes(instancia.estadoRecargas);
  if (acao.usos !== null) {
    const restam = usos[acao.id] ?? acao.usos;
    if (restam <= 0 && !forcar) throw new ErroDeUso("Sem usos restantes desta ação.");
    usos[acao.id] = Math.max(0, restam - 1);
  }
  const gastos = gastosDaAcao(acao, criatura.recursos);
  const ppRestante = Math.max(0, criatura.pontosPoder - instancia.ppGasto);
  if (gastos.pp > ppRestante && !forcar) throw new ErroDeUso("PP insuficiente.");
  const pp = Math.min(gastos.pp, ppRestante);
  // Recursos próprios: o que resta de cada um fica junto dos usos, pelo id.
  for (const { recurso, delta } of gastos.recursos) {
    const resta = Math.min(recurso.valorMax, usos[recurso.id] ?? recurso.valorMax);
    if (resta + delta < 0 && !forcar) throw new ErroDeUso(`${recurso.nome} insuficiente.`);
    usos[recurso.id] = Math.min(recurso.valorMax, Math.max(0, resta + delta));
  }
  // Ação lendária: sai do que resta na rodada (volta no começo do turno dela).
  if (acao.categoria === "acaoLendaria" && criatura.acoesLendarias > 0) {
    const restam = Math.min(criatura.acoesLendarias, usos[CHAVE_LENDARIAS] ?? criatura.acoesLendarias);
    if (restam < acao.custoLendario && !forcar) throw new ErroDeUso("Sem ações lendárias nesta rodada.");
    usos[CHAVE_LENDARIAS] = Math.max(0, restam - acao.custoLendario);
  }
  return { acao, usos, pp, tipoAcao: ACAO_DO_BLOCO[acao.categoria] as TipoAcaoCombate | undefined };
}

// Grava o gasto: usos, PP, as `vezes` da ação do turno e a ação revelada aos jogadores.
async function gastarAcaoDeCriatura(
  { lado, instancia }: CriaturaEmCombate,
  custo: Awaited<ReturnType<typeof custoDaAcaoDeCriatura>>,
  vezes = 1,
) {
  const { acao, tipoAcao } = custo;
  const gastas = lerAcoesGastas(instancia.acoesGastas);
  await prisma.instanciaCombate.update({
    where: { id: lado.instanciaId },
    data: {
      ppGasto: instancia.ppGasto + custo.pp,
      estadoRecargas: custo.usos,
      ...(tipoAcao ? { acoesGastas: { ...gastas, [tipoAcao]: (gastas[tipoAcao] ?? 0) + vezes } } : {}),
      ...(instancia.autoRevelarAcoes && !instancia.acoesReveladas.includes(acao.id)
        ? { acoesReveladas: [...instancia.acoesReveladas, acao.id] }
        : {}),
    },
  });
  await registrarPp(lado.combateId, { de: lado.instanciaId, valor: custo.pp, acao: acao.nome });
}

// A criatura usa uma ação do statblock: gasta usos, PP e a ação do turno,
// revela a ação aos jogadores e, com alvo, abre a resolução. Devolve o que o
// painel do narrador precisa pra empilhar as rolagens.
export async function usarAcaoDeCriatura(
  mesaId: string,
  combateId: string,
  instanciaId: string,
  componenteId: string,
  alvosPedidos: string[],
  // O narrador decidiu usar mesmo sem usos ou PP: nada fica negativo.
  forcar = false,
) {
  return executar("sessao", async () => {
    const emCombate = await ladoDaCriatura(mesaId, combateId, instanciaId);
    const { lado, instancia } = emCombate;
    // Usos e PP conferidos antes de gastar.
    const custo = await custoDaAcaoDeCriatura(emCombate, componenteId, forcar);
    const { acao, tipoAcao } = custo;
    // Incapacitado, Sonolento, Letárgico… (o narrador pode forçar).
    const pelaCondicao = tipoAcao
      ? travaDaCondicaoNaAcao(lerCondicoesAtivas(instancia.condicoesAtivas), tipoAcao, lerAcoesGastas(instancia.acoesGastas))
      : null;
    if (pelaCondicao && !forcar) throw new ErroDeUso(pelaCondicao);

    const ataque = acao.efeitos.flatMap((e) => (e.tipo === "ataque" && e.bonus.trim() ? [e] : []))[0];
    const salv = acao.efeitos.flatMap((e) => (e.tipo === "salvaguarda" ? [e] : []))[0];
    const danos = acao.efeitos.flatMap((e) =>
      e.tipo === "dano" && e.formula.trim() ? [{ formula: e.formula.trim(), tipo: e.tipos.find(Boolean) ?? "" }] : [],
    );
    const condicoes: CondicaoAplicada[] = acao.efeitos.flatMap((e) =>
      e.tipo === "condicao"
        ? [
            {
              nome: e.nome,
              rodadas: lerRodadas(e.duracaoTurnos),
              // Com salvaguarda na ação, o afetado pode repeti-la pra sair antes.
              salvaguarda: salv ? { atributo: salv.atributo, cd: salv.cd } : null,
              porTurno: e.danoPorTurno ?? null,
              // Salvaguarda que evita: rolada depois, por quem a ação pegou. Se
              // é a mesma da ação, já valeu o resultado dela.
              ...(e.evita && !(salv && !ataque && salv.atributo === e.evita.atributo) ? { evita: e.evita } : {}),
            },
          ]
        : [],
    );
    // As do "Aplica Condição" (efeitos extras, o mesmo editor da ficha). A CD
    // é a do efeito, a da salvaguarda da ação ou a da criatura.
    const aplica = acao.efeitosExtras.flatMap((e) => (e.tipo === "condicao_aplicar" && !e.emVoce ? [e] : []));
    if (aplica.length > 0) {
      const criatura = await prisma.criatura.findUnique({
        where: { id: emCombate.criaturaId },
        select: { classeDificuldade: true },
      });
      for (const e of aplica) {
        const cd = e.cd ?? salv?.cd ?? criatura?.classeDificuldade ?? 0;
        // Mesma salvaguarda da ação: já valeu o resultado dela.
        const evita = e.evita && !(salv && !ataque && salv.atributo === e.evita) ? e.evita : null;
        const repete = e.repete ? (evita ?? salv?.atributo ?? null) : null;
        condicoes.push({
          nome: e.condicao,
          rodadas: lerRodadas(e.rodadas),
          // Sem duração própria, valem os padrões da condição na Biblioteca.
          ...(e.rodadas ? {} : { usaPadroes: true }),
          salvaguarda: repete && cd > 0 ? { atributo: repete, cd } : null,
          ...(evita && cd > 0 ? { evita: { atributo: evita, cd } } : {}),
          ...(cd > 0 ? { cdDaFonte: cd } : {}),
          ...(e.mecanica ? { mecanica: e.mecanica } : {}),
        });
      }
    }
    // "Em você": a própria criatura fica com elas.
    const emSi: CondicaoAplicada[] = acao.efeitosExtras.flatMap((e) =>
      e.tipo === "condicao_aplicar" && e.emVoce
        ? [
            {
              nome: e.condicao,
              rodadas: lerRodadas(e.rodadas),
              ...(e.rodadas ? {} : { usaPadroes: true }),
              salvaguarda: null,
              ...(e.mecanica ? { mecanica: e.mecanica } : {}),
            },
          ]
        : [],
    );
    if (emSi.length > 0) {
      await aplicarCondicoes({
        combateId: lado.combateId,
        instanciaIds: [lado.instanciaId],
        condicoes: emSi,
        fonteId: lado.instanciaId,
        origem: acao.nome || "Ação",
      });
    }
    const modo: Resolucao["modo"] | null = ataque
      ? "ataque"
      : salv
        ? "salvaguarda"
        : danos.length > 0 || condicoes.length > 0
          ? "direto"
          : null;

    const alvos = (Array.isArray(alvosPedidos) ? alvosPedidos : [])
      .filter((id): id is string => typeof id === "string" && !!id)
      .slice(0, 12);
    // Multiataque: cada ataque feito conta um da ação padrão do turno.
    const vezes = modo === "ataque" && tipoAcao === "padrao" ? Math.max(1, alvos.length) : 1;
    await gastarAcaoDeCriatura(emCombate, custo, vezes);

    const resolucaoId =
      modo && alvos.length > 0
        ? await criarResolucao(lado, {
            atacante: instancia.nomeExibicao,
            acaoId: acao.id,
            nome: acao.nome || "Ação",
            modo,
            temDano: danos.length > 0,
            salvaguarda: salv
              ? {
                  atributo: salv.atributo,
                  cd: salv.cd,
                  // Ação de antes do campo existir: vale o que o texto dela diz.
                  emSucesso: salv.metade || /metade/i.test(acao.descricao) ? "metade" : "nada",
                }
              : null,
            condicoes,
            alvos,
            corpoACorpo: inferirAlcance(acao.alcance) === "corpo_a_corpo",
          })
        : null;

    revalidatePath(`/narrador/${mesaId}`);
    return { resolucaoId, modo, ataque: ataque?.bonus.trim() ?? null, danos };
  });
}

export async function resolverAtaqueDeCriatura(
  mesaId: string,
  combateId: string,
  instanciaId: string,
  resolucaoId: string,
  lances: LanceDeAtaque[],
) {
  return executar("sessao", async () => {
    const { lado, criaturaId } = await ladoDaCriatura(mesaId, combateId, instanciaId);
    // Margem de crítico da ação (e dos aspectos da criatura): o d20 natural a
    // partir dela já é crítico.
    const [combate, bruta] = await Promise.all([
      prisma.combate.findUnique({ where: { id: combateId }, select: { resolucoes: true } }),
      prisma.criatura.findUnique({ where: { id: criaturaId }, include: { componentes: true, linhagem: true } }),
    ]);
    const acaoId = lerResolucoes(combate?.resolucoes).find((r) => r.id === resolucaoId)?.acaoId;
    const componentes = bruta ? serializarCriatura(bruta).componentes : [];
    const acao = componentes.find((c) => c.id === acaoId);
    const margem = acao ? margemDeCritico(componentes, acao) : 20;
    const comMargem = (Array.isArray(lances) ? lances : []).map((l) => ({
      ...l,
      critico: l?.critico === true || (l?.natural != null && Number(l.natural) >= margem),
    }));
    const saida = await resolverAtaque(lado, resolucaoId, comMargem);
    // Vantagem ou desvantagem de uso único na criatura (de uma técnica) já valeu.
    const atacante = await prisma.instanciaCombate.findUnique({
      where: { id: instanciaId },
      select: { condicoesAtivas: true },
    });
    await gastarCondicoes(instanciaId, modoDoAtaque([], lerCondicoesAtivas(atacante?.condicoesAtivas)).gastas);
    revalidatePath(`/narrador/${mesaId}`);
    return saida;
  });
}

export async function aplicarDanoDeCriatura(
  mesaId: string,
  combateId: string,
  instanciaId: string,
  resolucaoId: string,
  dano: { valor: number; tipo?: string }[],
) {
  return executar("sessao", async () => {
    const { lado } = await ladoDaCriatura(mesaId, combateId, instanciaId);
    const saida = await aplicarDano(lado, resolucaoId, dano);
    revalidatePath(`/narrador/${mesaId}`);
    return saida;
  });
}

// A criatura cura PV de quem o narrador escolheu (ela mesma ou aliados): o
// valor já veio rolado. Jogador alvo respeita o PV máximo da ficha; criatura,
// o do combate. Cada cura entra nas estatísticas com quem curou e quem recebeu.
export async function aplicarCuraDeCriatura(
  mesaId: string,
  combateId: string,
  instanciaId: string,
  alvoIds: string[],
  valor: number,
  acao: string,
) {
  return executar("sessao", async () => {
    const { lado, instancia } = await ladoDaCriatura(mesaId, combateId, instanciaId);
    const cura = Math.min(99999, Math.max(0, Math.trunc(Number(valor) || 0)));
    if (cura <= 0) throw new ErroDeUso("Sem cura pra aplicar.");
    const ids = [...new Set((Array.isArray(alvoIds) ? alvoIds : []).filter((x): x is string => typeof x === "string"))].slice(0, 12);
    const alvos = await prisma.instanciaCombate.findMany({
      where: { combateId: lado.combateId, id: { in: ids } },
      select: { id: true, nomeExibicao: true, personagemId: true, pvAtual: true, pvMax: true },
    });
    if (alvos.length === 0) throw new ErroDeUso("Escolha quem recebe a cura.");
    const nome = String(acao ?? "").slice(0, 80) || "Cura";

    for (const alvo of alvos) {
      let recuperou = 0;
      if (alvo.personagemId) {
        const [personagem, { agg }] = await Promise.all([
          prisma.personagem.findUnique({ where: { id: alvo.personagemId } }),
          carregarAgregado(alvo.personagemId),
        ]);
        if (!personagem) continue;
        const depois = somarAteOMaximo(personagem.hpAtual, cura, poolsEfetivos(personagem, agg).hpMax);
        recuperou = depois - personagem.hpAtual;
        if (recuperou > 0) {
          await prisma.personagem.update({ where: { id: personagem.id }, data: { hpAtual: depois } });
          revalidatePath(`/ficha/${personagem.id}`);
        }
      } else {
        const antes = alvo.pvAtual ?? 0;
        const teto = alvo.pvMax ?? 0;
        const depois = teto > 0 ? Math.min(teto, antes + cura) : antes + cura;
        recuperou = Math.max(0, depois - antes);
        if (recuperou > 0) await prisma.instanciaCombate.update({ where: { id: alvo.id }, data: { pvAtual: depois } });
      }
      if (recuperou <= 0) continue;
      await avisarCombate(mesaId, alvo.nomeExibicao, `recuperou ${recuperou} PV (${nome} de ${instancia.nomeExibicao}).`);
      await registrarCura(lado.combateId, { de: instanciaId, para: alvo.id, valor: recuperou, acao: nome });
    }
    revalidatePath(`/narrador/${mesaId}`);
  });
}

// Criatura que a ação pegou reage (decisão do narrador) com uma das reações do
// statblock que cabem: gasta a reação do turno e os custos dela, e os efeitos
// valem antes do resto — CR maior (o ataque é comparado de novo), PV
// temporário (o dano sai dele primeiro) e redução de dano. `reducaoExtra` é o
// que o narrador tira do dano à mão, pra reação cujo texto não virou efeito;
// sem `componenteId`, a reação é só isso.
export async function reagirComoCriatura(
  mesaId: string,
  combateId: string,
  resolucaoId: string,
  instanciaId: string,
  componenteId: string | null,
  reducaoExtra = 0,
) {
  return executar("sessao", async () => {
    const emCombate = await ladoDaCriatura(mesaId, combateId, instanciaId);
    const { lado, instancia } = emCombate;
    const opcoes = await opcoesDaJanela(combateId, resolucaoId, instanciaId);
    if (!opcoes) throw new ErroDeUso("Essa reação já foi decidida.");

    let nome = "uma reação";
    let efeitos: EfeitoHabilidade[] = [];
    if (componenteId) {
      if (!opcoes.some((o) => o.id === componenteId)) throw new ErroDeUso("Essa reação não cabe nesta ação.");
      const custo = await custoDaAcaoDeCriatura(emCombate, componenteId, false);
      await gastarAcaoDeCriatura(emCombate, custo);
      nome = custo.acao.nome || "Reação";
      efeitos = efeitosDeReacaoDaCriatura(custo.acao);
    } else {
      const gastas = lerAcoesGastas(instancia.acoesGastas);
      await prisma.instanciaCombate.update({
        where: { id: instanciaId },
        data: { acoesGastas: { ...gastas, react: (gastas.react ?? 0) + 1 } },
      });
    }

    const efeito = efeitosDaReacao(efeitos);
    efeito.reducao += Math.max(0, Math.trunc(Number(reducaoExtra) || 0));
    // PV temporário entra antes do dano; fica o maior, com a duração dele.
    if (efeito.pvTemp > instancia.pvTemp) {
      await prisma.instanciaCombate.update({
        where: { id: instanciaId },
        data: { pvTemp: efeito.pvTemp, pvTempDuracao: duracaoPvTempNoBanco(efeito.duracaoPv) },
      });
    }
    const reacao = await fecharJanela(lado, resolucaoId, instanciaId, { de: instancia.nomeExibicao, nome, efeito });
    revalidatePath(`/narrador/${mesaId}`);
    return { reacao };
  });
}

// A ação vem de uma habilidade de origem Haki (pra o colateral "sem Haki").
async function vemDeHaki(personagemId: string, habilidadeIds: unknown): Promise<boolean> {
  const ids = normalizarIds(habilidadeIds);
  if (ids.length === 0) return false;
  return (await prisma.habilidade.count({ where: { personagemId, id: { in: ids }, origem: "haki" } })) > 0;
}

// Encerra à mão um bloqueio de colateral (sem PP / sem Haki), pela posição na lista.
export async function encerrarBloqueio(personagemId: string, indice: number) {
  return executar("ficha", async () => {
    const { personagem } = await autorizar(personagemId);
    const bloqueios = lerBloqueios(personagem.bloqueios);
    const i = Math.trunc(Number(indice));
    if (!(i >= 0 && i < bloqueios.length)) throw new ErroDeUso("Esse bloqueio já acabou.");
    await prisma.personagem.update({
      where: { id: personagemId },
      data: { bloqueios: bloqueios.filter((_, j) => j !== i) as unknown as Prisma.InputJsonValue },
    });
    revalidatePath(`/ficha/${personagemId}`);
  });
}
