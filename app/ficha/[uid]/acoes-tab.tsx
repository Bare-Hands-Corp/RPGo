"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import Swal from "sweetalert2";
import { ehTemporario, exigir, idTemporario } from "@/lib/acoes";
import {
  adicionarDaPasta,
  atualizarAcao,
  criarAcao,
  deletarAcao,
  encerrarAcao,
  guardarNaPasta,
  reordenarAcoes,
  usarAcao,
  resolverAtaqueEmCombate,
  aplicarDanoEmCombate,
} from "./actions";
import { BarraFiltros, casaBusca, pastasDe } from "./barra-filtros";
import { useReordenar } from "@/lib/use-reordenar";
import { useConfirmarUso } from "./usar-modal";
import { doModelo, type ModeloView } from "@/lib/pastas";
import { agruparFormas } from "@/lib/formas";
import { BotaoGuardar, BotaoPastas } from "./pastas";
import { BotaoPacotes, EVENTO_IMPORTADO, type Importado } from "./pacotes";
import { useRefreshAgrupado } from "@/lib/use-refresh-agrupado";
import {
  ATRIBUTOS,
  RECARGAS_HABILIDADE,
  bonusAtaqueTecnica,
  bonusDeAtaque,
  bonusProficiencia,
  casaContexto,
  cdTecnica,
  computarDeltasInstantaneos,
  alvoDaCura,
  curasComFormula,
  custoDaAcao,
  efeitoInstantaneo,
  efeitosComArma,
  efeitosDaTecnica,
  efeitosDoContexto,
  efeitosDuram,
  exaustaoQueConta,
  extrasDeCura,
  formatarMod,
  normalizarAlcance,
  ALVOS_ACAO,
  alvoDeCombate,
  lerAlvoAcao,
  efeitoNoAliado,
  efeitoNoInimigo,
  efeitosNoInimigo,
  condicaoPedeSalvaguarda,
  efeitosQueFicamNoAliado,
  nomeDoEfeito,
  resumoEfeito,
  rolagensDoPedaco,
  type AlvoAcao,
  formulaResolvidaTexto,
  acoesGanhasNoUso,
  lerEfeitos,
  lerNumeroOuFormula,
  maiorDado,
  motivoSemSobrecarga,
  NIVEL_DO_GRAU,
  penalidadeD20Exaustao,
  poolsEfetivos,
  resolverAtaqueArma,
  resolverDanoArma,
  resolverFormula,
  chipsDoContexto,
  subirPassosDano,
  usosMaximos,
  type Atributo,
  type EfeitoHabilidade,
  type EfeitosAgregados,
} from "@/lib/op-rpg";
import {
  empilharD20,
  empilharRolagem,
  publicarRolagem,
  rolarCuras,
  type EmpilharRolagemDetail,
} from "@/lib/empilhar-rolagem";
import { rolarDados, type ModoRolagem } from "@/lib/dice";
import {
  ChipEfeito,
  DatalistAlvos,
  EfeitoDeAcaoContext,
  EfeitosDuramContext,
  EfeitosEditor,
  FormulaContext,
  NomesRecursoContext,
  PassosProgressivos,
  StatsPorTurno,
  useContagemDoRolador,
} from "./efeitos-editor";
import { useExaustaoOtimista, usePpOtimista } from "./use-exaustao-otimista";
import {
  ACAO_COMBATE,
  GATILHOS_REACAO,
  MAX_DANOS_EXTRAS,
  ehAcaoDeCombate,
  inferirAlcance,
  lerDanosExtras,
  lerGatilho,
  comAcoesGanhas,
  maximoDeAcoes,
  textoGatilho,
  type AcoesGastas,
  type CombateVisto,
  type DanoExtra,
  type GatilhoReacao,
  type ResultadoAlvo,
} from "@/lib/combate";
import { travaDaCondicaoNaAcao } from "@/lib/condicoes-mecanica";
import { AcoesDoTurno, EVENTO_CD_TECNICAS } from "./acoes-do-turno";
import { useEscolherAlvo } from "./escolher-alvo";
import { useEscolherAlvosCombate } from "./escolher-alvos-combate";
import type { Tripulante } from "./tripulacao-tab";
import { DescricaoRecolhivel } from "./descricao-recolhivel";
import { SecaoRecolhivel } from "./secao-recolhivel";
import { rascunho } from "./rascunho";
import { Tooltip } from "@/components/tooltip";
import { MarcaExausto } from "./marca-exausto";
import { TagChip } from "./estilo-cor-picker";
import { normalizarEfeitoCor, type EstiloCor } from "@/lib/estilos-cor";
import { SeletorMultiplo, SeletorUnico, type OpcaoVinculo } from "./seletor-multiplo";
import { DuracaoCampo, comPorTurno, porTurnoDe } from "./duracao-campo";
import { SecaoModal, Segmentos, Sugestoes, TipoDanoCampo, type OpcaoSegmento } from "./campos-modal";
import { CustosCampo } from "./custos-campo";
import { CampoFormula } from "./campo-formula";
import { juntarTipos, mesmoTipo, tiposDoDano } from "@/lib/dano";
import { danoComMunicao, municaoDaArma, textoMunicao } from "@/lib/municao";
import { useGastoMunicao } from "./use-municao";
import {
  anunciarConcentracao,
  duraAlemDoUso,
  lerDuracao,
  pedeConcentracao,
  textoDuracao,
  textoTurnosRestantes,
  turnosDaDuracao,
  type Duracao,
} from "@/lib/duracao";
import {
  EVENTO_ACAO_EM_CURSO,
  anunciarAcaoEmCurso,
  ficaEmCurso,
  turnosDaAcao,
  type AcaoEmCursoDetail,
} from "@/lib/turno";

// O modelo de Ação só guarda alcance como texto livre, então inferimos CC vs
// distância por palavra-chave / metragem pra montar o contexto da rolagem.
// Best-effort: o usuário pode trocar o chip de alcance no Rolador (etapa 3.3).

type Acao = {
  id: string;
  nome: string;
  descricao: string;
  tipo: string;
  // Reação: o que a dispara no combate (null = qualquer ação que o pegue).
  gatilho?: string | null;
  tag: string | null;
  custoPp: number;
  custoPa: number;
  custoRecursoId: string | null;
  custoRecursoValor: number;
  atributoAtaque: string | null;
  bonusAcerto?: string | null;
  atributoSalv: string | null;
  salvSucesso?: string;
  danosExtras?: unknown;
  atributoCd: string | null;
  dano: string | null;
  tipoDano?: string | null;
  alcance: string | null;
  armaIds: unknown;
  itemId: string | null;
  habilidadeIds: unknown;
  tecnica: boolean;
  grau: number;
  efeitos: unknown;
  aliado: boolean;
  alvo?: string | null;
  armaDeFogo?: boolean;
  multiataque?: boolean;
  duracao?: unknown;
  // Usada e ainda valendo, com os turnos que faltam.
  emCurso?: boolean;
  turnosRestantes?: number | null;
  pasta?: string | null;
  // Ação de que esta é forma alternativa.
  formaDe?: string | null;
  // Posição dentro do tipo (0 = sem posição, vai pro fim).
  ordem?: number;
  // Custo por fórmula; `custoPp` e `custoRecursoValor` já chegam resolvidos.
  custoPpFormula?: string | null;
  custoRecursoFormula?: string | null;
  // Usos limitados (null = ilimitado).
  usos?: number | null;
  usosAtual?: number | null;
  usosFormula?: string | null;
  recarga?: string | null;
};

type Filtro = "todas" | "sem_custo";

const FILTROS = [
  ["todas", "Todas"],
  ["sem_custo", "Sem custo"],
] as const;

const FILTROS_TIPO = [
  ["padrao", "Padrão"],
  ["bonus", "Bônus"],
  ["power", "Poderosa"],
  ["react", "Reação"],
  ["livre", "Livre"],
] as const;

const FILTROS_TECNICA = [
  ["tecnica", "Técnicas"],
  ["comum", "Comuns"],
] as const;

const FILTROS_ORIGEM = [
  ["item", "Item"],
  ["habilidade", "Habilidade"],
  ["propria", "Própria"],
] as const;

// Efeitos que cabem numa ação: rolagem dela ou na hora do uso.
const PRESETS_ACAO = [
  "pv_temp",
  "cura",
  "bonus",
  "dado_em",
  "vantagem",
  "desvantagem",
  "sucesso_auto",
  "reducao_dano",
  "interceptar",
  "evasao",
  "crit_range",
  "margem_critico",
  "passo_dano",
  "dano_extra",
  "dados_extra",
  "potencializacao",
  "progressivo",
  "multi_ataque",
  "explosao",
  "dano_maximo",
  "piso_dado",
  "critico_extra",
  "ataque_poderoso",
  "dano_min",
  "dano_melhor_de",
  "desconto_tecnica",
  "reroll",
  "floor_d20",
  "ignora",
  "trocar_dano",
  "alcance",
  "recurso_delta",
  "condicao_aplicar",
  "condicao_remover",
  "acao_extra",
  "colateral",
  "rolagem",
  "trigger",
  "livre",
];

type RecursoMinimo = {
  id: string;
  nome: string;
  cor: string | null;
  cor2: string | null;
  efeito: string;
};

// Subconjunto de Habilidade pra exibir/selecionar o vínculo "deriva de".
type HabilidadeRef = { id: string; nome: string };

// Subconjunto de Item necessário pra resolver o ataque/dano de uma arma.
type ItemArma = {
  id: string;
  nome: string;
  tipo: string;
  equipado: boolean;
  dano: string | null;
  danoBonus: string | null;
  modificador: number;
  alcance: string;
  propriedades: unknown;
  atributoAtaque: string | null;
  proficienteArma: boolean;
  danoSomaProficiencia: boolean;
  danoSomaAtributo: boolean;
  efeitos: unknown;
  quantidade: number;
  municaoId?: string | null;
};

// O que a ação resolve num alvo do combate e como empilhar as rolagens dela.
type Resolve = {
  ataque: boolean;
  salvaguarda: boolean;
  dano: boolean;
  // A ação põe condição em quem ela pega (efeito "Aplica Condição").
  condicao: boolean;
  cd: number | null;
  // Quantos ataques a rolagem de acerto faz (multiataque): um alvo pra cada.
  ataques: number;
  // Chips de vantagem e desvantagem da ficha que já ligam no acerto ("Vantagem: Ajudar (condição)").
  modosDaFicha: string[];
  atacar: (extras: Pick<EmpilharRolagemDetail, "aoConcluir" | "rolarAuto" | "modos">) => void;
  danar: (extras: Pick<EmpilharRolagemDetail, "aoConcluir" | "critico">) => void;
  // Tipo do dano principal.
  tipoDano: string;
  // Ataque a 1,5 m (condições do alvo: Caído, Paralisado).
  corpoACorpo: boolean;
};

type Props = {
  personagemId: string;
  // O personagem no combate ativo da mesa; null = fora de combate.
  turno: CombateVisto["voce"];
  // Quem está no combate, pra escolher alvo.
  alvosCombate: CombateVisto["participantes"];
  // Atributo da CD das técnicas do personagem (padrão das ações com salvaguarda).
  atributoCdTecnicas: string | null;
  acoes: Acao[];
  nivel: number;
  exaustao: number;
  penalidadeDesArmadura: number;
  atributos: Record<Atributo, number>;
  recursos: RecursoMinimo[];
  efeitosAgregados: EfeitosAgregados;
  itens: ItemArma[];
  habilidades: HabilidadeRef[];
  ppAtual: number;
  ppMax: number;
  /** Personagens da mesa (inclui o próprio). */
  tripulantes: Tripulante[];
};

const SIGLA: Record<Atributo, string> = {
  forca: "FOR",
  destreza: "DES",
  constituicao: "CON",
  sabedoria: "SAB",
  vontade: "VON",
  presenca: "PRE",
};

const ALCANCES_RAPIDOS = ["Pessoal", "1,5 m"];

const DICA_ALVO: Record<AlvoAcao, string> = {
  nenhum: "Sem ataque, salvaguarda ou dano em alguém.",
  inimigo: "Em combate, escolhe na iniciativa quem é atacado, faz a salvaguarda ou leva o dano.",
  qualquer: "Em combate, escolhe na iniciativa qualquer participante, aliado ou inimigo.",
};

const OPCOES_ATRIBUTO: OpcaoSegmento<string>[] = [
  { valor: "", rotulo: "—", titulo: "Nenhum" },
  ...ATRIBUTOS.map((a) => ({ valor: a.slug, rotulo: a.sigla, titulo: a.nome })),
];

const GRUPOS = [
  { tipo: "padrao", titulo: "Ações Padrão", icone: "fa-gavel", cor: "var(--color-padrao)" },
  { tipo: "bonus", titulo: "Ações Bônus", icone: "fa-bolt", cor: "var(--color-bonus)" },
  { tipo: "power", titulo: "Ações Poderosas", icone: "fa-bomb", cor: "var(--color-power)" },
  { tipo: "react", titulo: "Reações", icone: "fa-shield-alt", cor: "var(--color-react)" },
  { tipo: "livre", titulo: "Ações Livres", icone: "fa-feather", cor: "var(--color-livre)" },
] as const;

type Patch =
  | { kind: "create"; acao: Acao }
  | { kind: "update"; id: string; patch: Partial<Acao> }
  | { kind: "delete"; id: string }
  // A lista toda na ordem nova, cada ação com o tipo que passou a ter.
  | { kind: "reordenar"; itens: ItemArrastado[] };

type ItemArrastado = { id: string; tipo: string };

type FormState = {
  id: string | null;
  nome: string;
  descricao: string;
  tipo: string;
  gatilho: GatilhoReacao;
  tag: string;
  custoPp: string;
  custoRecursoId: string;
  custoRecursoValor: string;
  atributoAtaque: string;
  // Somado ao acerto (número ou fórmula sem dado).
  bonusAcerto: string;
  atributoSalv: string;
  salvSucesso: "nada" | "metade";
  danosExtras: DanoExtra[];
  atributoCd: string;
  dano: string;
  tipoDano: string;
  alcance: string;
  armaIds: string[];
  itemId: string;
  habilidadeIds: string[];
  tecnica: boolean;
  grau: number;
  efeitos: EfeitoHabilidade[];
  alvo: AlvoAcao;
  armaDeFogo: boolean;
  // Recebe o Multiataque da ficha.
  multiataque: boolean;
  duracao: Duracao | null;
  // Seção de dano aberta no modal mesmo sem dano escrito (não vai pro banco).
  comDano: boolean;
  // Ação de origem da forma alternativa ("" = ação separada).
  formaDe: string;
  // Origem oferecida no modal ("" = não oferece).
  origemForma: string;
  // Máximo de usos (número ou fórmula; "" = ilimitado) e quando recarrega.
  usos: string;
  recarga: string;
};

const FORM_VAZIO: FormState = {
  id: null,
  nome: "",
  descricao: "",
  tipo: "padrao",
  gatilho: "qualquer",
  tag: "",
  custoPp: "",
  custoRecursoId: "",
  custoRecursoValor: "",
  atributoAtaque: "",
  bonusAcerto: "",
  atributoSalv: "",
  salvSucesso: "nada",
  danosExtras: [],
  atributoCd: "",
  dano: "",
  tipoDano: "",
  alcance: "",
  armaIds: [],
  itemId: "",
  habilidadeIds: [],
  tecnica: false,
  grau: 0,
  efeitos: [],
  // Sem nada a resolver (ataque, salvaguarda, dano), não pede alvo nenhum.
  alvo: "inimigo",
  armaDeFogo: false,
  multiataque: false,
  duracao: null,
  comDano: false,
  formaDe: "",
  origemForma: "",
  usos: "",
  recarga: "",
};

// Ação recém-trazida de uma pasta, antes do servidor responder.
const ACAO_BASE: Omit<Acao, "id"> = {
  nome: "",
  descricao: "",
  tipo: "padrao",
  tag: null,
  custoPp: 0,
  custoPa: 0,
  custoRecursoId: null,
  custoRecursoValor: 0,
  atributoAtaque: null,
  atributoSalv: null,
  atributoCd: null,
  dano: null,
  tipoDano: null,
  alcance: null,
  armaIds: [],
  itemId: null,
  habilidadeIds: [],
  tecnica: false,
  grau: 0,
  efeitos: [],
  aliado: false,
  alvo: "nenhum",
  bonusAcerto: null,
  armaDeFogo: false,
  multiataque: false,
  duracao: null,
  pasta: null,
  formaDe: null,
  custoPpFormula: null,
  custoRecursoFormula: null,
  usos: null,
  usosAtual: null,
  usosFormula: null,
  recarga: null,
};

// Lê um Json de ids vindo do banco com defesa contra lixo/legado.
// De onde a ação vem: item que a concede, habilidade de que deriva ou o próprio jogador.
function origemDaAcao(a: Acao): "item" | "habilidade" | "propria" {
  if (a.itemId) return "item";
  return lerIds(a.habilidadeIds).length > 0 ? "habilidade" : "propria";
}

function lerIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.length > 0);
}

// Dano bônus com um sinal só: "+2" fica "+2", "1d6 fogo" vira "+1d6 fogo".
function comSinal(bonus: string): string {
  return /^[+-]/.test(bonus.trim()) ? bonus.trim() : `+${bonus.trim()}`;
}

function mostrarErro(err: unknown) {
  Swal.fire({
    icon: "error",
    title: "Erro",
    text: err instanceof Error ? err.message : "Operação falhou.",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

// "Vantagem (Qualquer d20 · próxima rolagem)": o efeito que vai pra outro, no "em quem?".
function textoDoEfeito(e: EfeitoHabilidade): string {
  const vale = e.vale === "proxima" ? "próxima rolagem" : e.vale === "turno" ? "próximo turno dele" : "";
  return `${nomeDoEfeito(e)} (${[resumoEfeito(e), vale].filter(Boolean).join(" · ")})`;
}

export function AcoesTab({
  personagemId,
  acoes,
  nivel,
  exaustao: exaustaoServer,
  penalidadeDesArmadura,
  atributos,
  recursos,
  efeitosAgregados,
  itens,
  habilidades,
  ppAtual: ppServer,
  ppMax,
  tripulantes,
  turno,
  alvosCombate,
  atributoCdTecnicas,
}: Props) {
  const alvosDoCombate = useEscolherAlvosCombate(alvosCombate);
  // Os participantes (dentro de `usar`, `alvosCombate` são os alvos escolhidos).
  const participantesDoCombate = alvosCombate;
  // Condições deste personagem no combate (travam ações: Incapacitado, Sonolento…).
  const minhasCondicoes = useMemo(
    () => alvosCombate.find((p) => p.voce)?.condicoes ?? [],
    [alvosCombate],
  );
  // Atributo da CD das técnicas, escolhido na ficha lateral.
  const [cdPadrao, setCdPadrao] = useState(atributoCdTecnicas ?? "");
  const [cdPadraoDoServidor, setCdPadraoDoServidor] = useState(atributoCdTecnicas);
  if (atributoCdTecnicas !== cdPadraoDoServidor) {
    setCdPadraoDoServidor(atributoCdTecnicas);
    setCdPadrao(atributoCdTecnicas ?? "");
  }
  // Ações do turno: o que o servidor diz mais o que acabou de ser gasto aqui.
  const [gastasLocal, setGastasLocal] = useState<AcoesGastas>({});
  const [gastasDoServidor, setGastasDoServidor] = useState(turno?.gastas);
  if (turno?.gastas !== gastasDoServidor) {
    setGastasDoServidor(turno?.gastas);
    setGastasLocal({});
  }
  const gastas: AcoesGastas = { ganhas: {} };
  for (const tipo of ["padrao", "bonus", "power", "react"] as const) {
    gastas[tipo] = (turno?.gastas[tipo] ?? 0) + (gastasLocal[tipo] ?? 0);
    gastas.ganhas![tipo] = (turno?.gastas.ganhas?.[tipo] ?? 0) + (gastasLocal.ganhas?.[tipo] ?? 0);
  }
  const maximoAcoes = maximoDeAcoes(efeitosAgregados.acoesExtras ?? {}, gastas.ganhas);
  // A ficha lateral muda a CD das técnicas; os cards acompanham na hora.
  useEffect(() => {
    const ouvir = (e: Event) => setCdPadrao((e as CustomEvent<string>).detail ?? "");
    window.addEventListener(EVENTO_CD_TECNICAS, ouvir);
    return () => window.removeEventListener(EVENTO_CD_TECNICAS, ouvir);
  }, []);

  // Danos a mais da ação: cada um é rolado à parte (o crítico dobra os dados),
  // vai pro chat e volta com o próprio tipo.
  function rolarDanosExtras(acao: Acao, critico: boolean): { valor: number; tipo: string }[] {
    return lerDanosExtras(acao.danosExtras).map((e) => {
      const f = resolverFormula(e.formula, atributos, nivel, { grau: acao.grau });
      const dados = critico ? [...f.dados, ...f.dados] : f.dados;
      if (dados.length === 0) return { valor: Math.max(0, f.modificador), tipo: e.tipo };
      const r = rolarDados(dados, f.modificador);
      publicarRolagem(
        r,
        `Dano ${acao.nome}: ${e.formula}${e.tipo ? ` ${e.tipo.toLowerCase()}` : ""}${critico ? " (crítico)" : ""}`,
      );
      return { valor: Math.max(0, r.total), tipo: e.tipo };
    });
  }

  // Dano de cada acerto, um por vez: empilha a rolagem e, quando ela sai,
  // desconta do alvo e pede a do próximo acerto.
  function pedirDano(resolucaoId: string, acao: Acao, resolve: Resolve, acertos: ResultadoAlvo[]) {
    const [atual, ...resto] = acertos;
    if (!atual) return;
    const critico = atual === "critico";
    resolve.danar({
      critico,
      aoConcluir: (lances) => {
        const lance = lances[0];
        if (!lance) return;
        const partes = [{ valor: lance.total, tipo: resolve.tipoDano }, ...rolarDanosExtras(acao, critico)];
        startTransition(async () => {
          try {
            exigir(await aplicarDanoEmCombate(personagemId, resolucaoId, partes));
            pedirDano(resolucaoId, acao, resolve, resto);
          } catch (err) {
            mostrarErro(err);
          }
        });
      },
    });
  }

  // Acerto de uma resolução: o servidor compara com a CR de cada alvo e os
  // acertos já pedem o dano. Com `modos` (vantagem ou desvantagem de cada
  // ataque, já decidida) a rolagem sai sem esperar o "ROLAR!".
  function pedirAtaque(resolucaoId: string, acao: Acao, resolve: Resolve, modos?: ModoRolagem[]) {
    resolve.atacar({
      rolarAuto: !!modos,
      modos,
      aoConcluir: (lances) => {
        // Ataque que veio de explosão é no mesmo alvo do lance que explodiu.
        let ataque = -1;
        const comAlvo = lances.map((l) => {
          if (!l.explosao || ataque < 0) ataque += 1;
          return { total: l.total, natural: l.natural, critico: l.critico, ataque };
        });
        startTransition(async () => {
          try {
            const { resultados } = exigir(await resolverAtaqueEmCombate(personagemId, resolucaoId, comAlvo));
            if (resolve.dano) {
              pedirDano(
                resolucaoId,
                acao,
                resolve,
                resultados.filter((r) => r !== "erro"),
              );
            }
          } catch (err) {
            mostrarErro(err);
          }
        });
      },
    });
  }

  // Por que a ação não dá pra usar agora no combate; null = dá (ou não é de combate).
  function travaDoTurno(tipo: string): string | null {
    if (!turno || !ehAcaoDeCombate(tipo)) return null;
    if (tipo !== "react" && !turno.naVez) return "Não é a sua vez.";
    if (tipo === "react" && turno.naVez) return "Reação é só fora da sua vez.";
    if ((gastas[tipo] ?? 0) >= maximoAcoes[tipo]) {
      return `Sem ação ${ACAO_COMBATE[tipo].nome.toLowerCase()} neste turno.`;
    }
    return travaDaCondicaoNaAcao(minhasCondicoes, tipo, gastas);
  }
  // Penalidade de exaustão (−2 × nível) some no acerto (teste de d20). NÃO entra
  // no dano (não é d20) nem na CD da técnica (quem rola é o alvo). Otimista.
  const exaustao = useExaustaoOtimista(exaustaoServer);
  const penD20 = penalidadeD20Exaustao(exaustaoQueConta(exaustao, efeitosAgregados));
  // PP otimista pra oferecer a Sobrecarga antes do servidor responder.
  const ppAtual = usePpOtimista(ppServer, poolsEfetivos({ hpMax: 1, ppMax }, efeitosAgregados).ppMax);
  const alvo = useEscolherAlvo(tripulantes, personagemId);
  const ctxFormula = useMemo(() => ({ nivel, atributos }), [nivel, atributos]);
  const extraCura = useMemo(() => extrasDeCura(efeitosAgregados), [efeitosAgregados]);

  // DES reduzida pela armadura: cálculos que usam DES (ataque/CD com DES) leem a
  // pontuação ajustada; FOR e outros leem o valor real.
  const atributosParaTeste: Record<Atributo, number> = {
    ...atributos,
    destreza: atributos.destreza + 2 * penalidadeDesArmadura,
  };
  const desReduz = penalidadeDesArmadura < 0;
  const armas = itens.filter((i) => i.tipo === "arma");
  const gastoMunicao = useGastoMunicao(itens);
  const municaoDe = (arma: ItemArma) => municaoDaArma(arma, itens, gastoMunicao);
  // Agregado por arma: ficha + efeitos da arma.
  const efeitosPorArma = new Map(armas.map((a) => [a.id, efeitosComArma(efeitosAgregados, a)]));
  const efeitosDa = (a: ItemArma) => efeitosPorArma.get(a.id) ?? efeitosAgregados;

  // Opções dos pickers visuais do modal.
  const opcoesArma: OpcaoVinculo[] = armas.map((a) => ({
    id: a.id,
    nome: a.nome,
    icone: "fa-khanda",
    detalhe: [
      maiorDado(a.dano, efeitosDa(a).dadoArmaFixo?.formula)
        ? subirPassosDano(
            maiorDado(a.dano, efeitosDa(a).dadoArmaFixo?.formula),
            efeitosDa(a).passosDanoArma.valor,
          )
        : null,
      a.danoBonus ? comSinal(a.danoBonus) : null,
      a.equipado ? null : "desequipada",
    ]
      .filter(Boolean)
      .join(" · "),
    inativo: !a.equipado,
  }));
  const opcoesItem: OpcaoVinculo[] = itens.map((i) => ({
    id: i.id,
    nome: i.nome,
    icone: "fa-sack-dollar",
    detalhe: i.equipado ? undefined : "desequipado",
    inativo: !i.equipado,
  }));
  const opcoesHabilidade: OpcaoVinculo[] = habilidades.map((h) => ({
    id: h.id,
    nome: h.nome,
    icone: "fa-star",
  }));
  const [acoesOtimistas, aplicarPatch] = useOptimistic(
    acoes,
    (state: Acao[], p: Patch) => {
      if (p.kind === "create") return [...state, p.acao];
      if (p.kind === "update")
        return state.map((a) => (a.id === p.id ? { ...a, ...p.patch } : a));
      if (p.kind === "reordenar") {
        const arrastadas = new Map(p.itens.map((x, i) => [x.id, { ...x, pos: i }]));
        const tipoAntes = new Map(state.map((a) => [a.id, a.tipo]));
        const contagem = new Map<string, number>();
        return state
          .map((a) => {
            const x = arrastadas.get(a.id);
            if (x) {
              const ordem = (contagem.get(x.tipo) ?? 0) + 1;
              contagem.set(x.tipo, ordem);
              return { ...a, tipo: x.tipo, ordem };
            }
            // A forma alternativa acompanha a origem se tinha o mesmo tipo dela.
            const origem = a.formaDe ? arrastadas.get(a.formaDe) : undefined;
            return origem && tipoAntes.get(a.formaDe!) === a.tipo ? { ...a, tipo: origem.tipo } : a;
          })
          .sort((a, b) => (arrastadas.get(a.id)?.pos ?? 1e9) - (arrastadas.get(b.id)?.pos ?? 1e9));
      }
      return state.filter((a) => a.id !== p.id);
    },
  );

  // Grau acima do que o nível libera fica apagado (avisa, não bloqueia).
  const opcoesGrau: OpcaoSegmento<number>[] = [
    { valor: 0, rotulo: "—", titulo: "Sem grau" },
    ...NIVEL_DO_GRAU.map((nv, i) => ({
      valor: i + 1,
      rotulo: `${i + 1}º`,
      sub: `nv ${nv}`,
      titulo: nv > nivel ? `Liberado no ${nv}º nível` : undefined,
      apagada: nv > nivel,
    })),
  ];

  const [modalAberto, setModalAberto] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const [pastaFiltro, setPastaFiltro] = useState<string | null>(null);
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null);
  const [tecnicaFiltro, setTecnicaFiltro] = useState<string | null>(null);
  const [origemFiltro, setOrigemFiltro] = useState<string | null>(null);
  const uso = useConfirmarUso();
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  // Forma à mostra em cada card (id da ação de origem → id da forma).
  const [formaAtiva, setFormaAtiva] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();
  const atualizar = useRefreshAgrupado(0);

  // Ação que entrou em curso, contou turno ou acabou antes do servidor responder.
  const [emCursoLocal, setEmCursoLocal] = useState<Record<string, AcaoEmCursoDetail>>({});
  const [acoesAnterior, setAcoesAnterior] = useState(acoes);
  if (acoesAnterior !== acoes) {
    setAcoesAnterior(acoes);
    setEmCursoLocal({});
  }
  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<AcaoEmCursoDetail>).detail;
      if (det) setEmCursoLocal((o) => ({ ...o, [det.id]: det }));
    }
    window.addEventListener(EVENTO_ACAO_EM_CURSO, ouvir);
    return () => window.removeEventListener(EVENTO_ACAO_EM_CURSO, ouvir);
  }, []);

  // Encerra a ação em curso antes da duração acabar.
  function encerrar(acao: Acao) {
    anunciarAcaoEmCurso({ id: acao.id, emCurso: false });
    startTransition(async () => {
      try {
        exigir(await encerrarAcao(personagemId, acao.id));
      } catch (err) {
        atualizar();
        mostrarErro(err);
      }
    });
  }

  // Formas alternativas ficam dentro do card da ação de origem.
  const acoesPorId = new Map(acoesOtimistas.map((a) => [a.id, a]));
  const { origemDe, grupoDe } = agruparFormas(acoesOtimistas);

  // Reordenar arrastando (lib/use-reordenar.ts); arrastar pra outra categoria
  // troca o tipo. A ordem vai pro servidor ao soltar.
  const reordenar = useReordenar({
    itens: acoesOtimistas
      .filter((a) => !origemDe(a) && !ehTemporario(a.id))
      .map((a) => ({ id: a.id, grupo: a.tipo })),
    aoSoltar: (lista) => {
      const itens = lista.map((x) => ({ id: x.id, tipo: x.grupo }));
      startTransition(async () => {
        aplicarPatch({ kind: "reordenar", itens });
        try {
          exigir(await reordenarAcoes(personagemId, itens));
        } catch (err) {
          atualizar();
          mostrarErro(err);
        }
      });
    },
  });

  // Ação nova em andamento fica no navegador até salvar.
  const rascunhoAcao = useMemo(() => rascunho<FormState>(`rpgo:rascunho-acao:${personagemId}`), [personagemId]);
  useEffect(() => {
    if (modalAberto && !form.id) rascunhoAcao.gravar(form);
  }, [modalAberto, form, rascunhoAcao]);

  async function abrirNova() {
    const guardado = rascunhoAcao.ler();
    if (guardado?.nome || guardado?.descricao) {
      const r = await Swal.fire({
        icon: "question",
        title: "Retomar o rascunho?",
        text: `Tem uma ação começada${guardado.nome ? `: ${guardado.nome}` : ""}.`,
        showDenyButton: true,
        confirmButtonText: "Retomar",
        denyButtonText: "Começar do zero",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      if (r.isDismissed) return;
      if (r.isConfirmed) {
        setForm({ ...FORM_VAZIO, ...guardado, id: null });
        setModalAberto(true);
        return;
      }
      rascunhoAcao.apagar();
    }
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdit(acao: Acao) {
    setForm(formDe(acao));
    setModalAberto(true);
  }

  // Duplicar: abre uma ação nova já preenchida; no modal dá pra virar forma alternativa.
  function abrirCopia(acao: Acao) {
    const origem = origemDe(acao) ?? acao;
    setForm({
      ...formDe(acao),
      id: null,
      nome: `${acao.nome} (cópia)`,
      formaDe: "",
      origemForma: origem.id,
    });
    setModalAberto(true);
  }

  function formDe(acao: Acao): FormState {
    const origem = origemDe(acao);
    return {
      id: acao.id,
      nome: acao.nome,
      descricao: acao.descricao,
      tipo: acao.tipo,
      gatilho: lerGatilho(acao.gatilho),
      tag: acao.tag || "",
      custoPp: acao.custoPpFormula ?? (acao.custoPp ? String(acao.custoPp) : ""),
      custoRecursoId: acao.custoRecursoId || "",
      custoRecursoValor:
        acao.custoRecursoFormula ?? (acao.custoRecursoValor ? String(acao.custoRecursoValor) : ""),
      usos: acao.usosFormula ?? (acao.usos != null ? String(acao.usos) : ""),
      recarga: acao.recarga ?? "",
      atributoAtaque: acao.atributoAtaque || "",
      bonusAcerto: acao.bonusAcerto || "",
      atributoSalv: acao.atributoSalv || "",
      salvSucesso: acao.salvSucesso === "metade" ? "metade" : "nada",
      danosExtras: lerDanosExtras(acao.danosExtras),
      atributoCd: acao.atributoCd || "",
      dano: acao.dano || "",
      tipoDano: acao.tipoDano || "",
      alcance: normalizarAlcance(acao.alcance || ""),
      armaIds: lerIds(acao.armaIds),
      itemId: acao.itemId || "",
      habilidadeIds: lerIds(acao.habilidadeIds),
      tecnica: acao.tecnica,
      grau: acao.grau,
      efeitos: lerEfeitos(acao.efeitos).map((e) =>
        efeitoNoAliado(e, acao) ? { ...e, quem: "aliado" as const } : e,
      ),
      alvo: lerAlvoAcao(acao),
      armaDeFogo: !!acao.armaDeFogo,
      multiataque: !!acao.multiataque,
      duracao: lerDuracao(acao.duracao),
      comDano: false,
      formaDe: origem?.id ?? "",
      origemForma: origem?.id ?? "",
    };
  }

  function fecharModal() {
    setModalAberto(false);
  }

  function setF<K extends keyof FormState>(key: K, valor: FormState[K]) {
    setForm((f) => ({ ...f, [key]: valor }));
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const nomeLimpo = form.nome.trim();
    if (!nomeLimpo) {
      Swal.fire({
        icon: "warning",
        title: "Campo obrigatório",
        text: "Dê um nome para sua ação!",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }

    // Custos e usos: número ou fórmula (o valor de agora vai junto, como reserva).
    const grau = form.tecnica ? form.grau : 0;
    const pp = lerNumeroOuFormula(form.custoPp, ctxFormula, grau);
    const doRecurso = lerNumeroOuFormula(form.custoRecursoId ? form.custoRecursoValor : "", ctxFormula, grau);
    const usos = form.usos.trim() ? lerNumeroOuFormula(form.usos, ctxFormula) : null;
    // Edição preserva o que sobrou; ação nova começa cheia.
    const antes = form.id ? acoesPorId.get(form.id) : undefined;
    const dados = {
      nome: nomeLimpo,
      descricao: form.descricao,
      tipo: form.tipo,
      gatilho: form.tipo === "react" && form.gatilho !== "qualquer" ? form.gatilho : null,
      tag: form.tag,
      custoPp: pp.numero,
      custoPpFormula: pp.formula,
      custoRecursoId: form.custoRecursoId || null,
      custoRecursoValor: doRecurso.numero,
      custoRecursoFormula: doRecurso.formula,
      usos: usos ? usos.numero : null,
      usosAtual: !usos ? null : antes ? (antes.usosAtual ?? null) : usos.numero,
      usosFormula: usos?.formula ?? null,
      recarga: usos && form.recarga ? form.recarga : null,
      // Com arma, o acerto é o dela.
      atributoAtaque: form.armaIds.length > 0 ? null : form.atributoAtaque || null,
      bonusAcerto: form.bonusAcerto.trim() || null,
      atributoSalv: form.atributoSalv || null,
      salvSucesso: form.salvSucesso,
      danosExtras: form.danosExtras.filter((d) => d.formula.trim()),
      atributoCd: form.atributoCd || null,
      dano: form.dano || null,
      tipoDano: form.dano ? form.tipoDano.trim() || null : null,
      alcance: form.alcance || null,
      armaIds: form.armaIds,
      itemId: form.itemId || null,
      habilidadeIds: form.habilidadeIds,
      tecnica: form.tecnica,
      grau: form.tecnica ? form.grau : 0,
      efeitos: form.efeitos,
      alvo: form.alvo,
      // Cada efeito diz se vai pro aliado (`quem`).
      aliado: false,
      armaDeFogo: form.armaDeFogo,
      // Sem acerto, não tem o que multiplicar.
      multiataque: (form.armaIds.length > 0 || !!form.atributoAtaque) && form.multiataque,
      duracao: form.duracao,
      // Só vai quando o modal ofereceu a escolha.
      ...(form.origemForma ? { formaDe: form.formaDe || null } : {}),
    };

    const editandoId = form.id;
    if (!editandoId) rascunhoAcao.apagar();
    fecharModal();

    startTransition(async () => {
      if (editandoId) {
        aplicarPatch({ kind: "update", id: editandoId, patch: dados });
        try {
          exigir(await atualizarAcao(personagemId, editandoId, dados));
        } catch (err) {
          mostrarErro(err);
        }
      } else {
        const novaAcao: Acao = {
          id: idTemporario(),
          ...dados,
          custoPa: 0,
          tag: dados.tag || null,
        };
        aplicarPatch({ kind: "create", acao: novaAcao });
        try {
          exigir(await criarAcao(personagemId, dados));
        } catch (err) {
          mostrarErro(err);
        }
      }
    });
  }

  // Debita os custos (PP já com desconto) e aplica os efeitos na hora da ação.
  // Sem PP, técnica de grau 1–5 vai com Sobrecarga (exaustão = grau).
  async function usar(
    acao: Acao,
    custoPp: number,
    recurso: RecursoMinimo | undefined,
    // O que a ação tem pra resolver num alvo (em combate).
    resolve?: Resolve,
  ) {
    const usosMax = usosMaximos(acao, ctxFormula);
    const usosAtual = acao.usosAtual ?? usosMax ?? 0;
    if (usosMax != null && usosAtual <= 0) {
      mostrarErro(new Error("Sem usos restantes."));
      return;
    }
    // Em combate, gasta uma ação do turno do tipo dela.
    const tipoAcao = turno && ehAcaoDeCombate(acao.tipo) ? acao.tipo : null;
    const trava = travaDoTurno(acao.tipo);
    if (trava) {
      mostrarErro(new Error(trava));
      return;
    }
    const instantaneos = lerEfeitos(acao.efeitos).filter(efeitoInstantaneo);
    // Em quem: o alvo da ação decide. No combate, um alvo por ataque
    // (multiataque escolhe o de cada um); vários de uma vez na salvaguarda e no
    // dano direto. Vale pra qualquer tipo de ação, inclusive a Livre.
    const alvoAcao = lerAlvoAcao(acao);
    // Desvantagem no inimigo também pede alvo: o do acerto ou da salvaguarda, se
    // a ação tiver; sem eles, o usuário escolhe em quem ela cai.
    const noInimigo = efeitosNoInimigo(acao).length > 0;
    const condicaoDoCatalogo = lerEfeitos(acao.efeitos).some((e) => e.tipo === "condicao_aplicar" && !e.emVoce);
    const escolheNoCombate = !!turno && !!resolve && (alvoDeCombate(alvoAcao) || noInimigo);
    if (
      escolheNoCombate &&
      resolve.cd == null &&
      ((!resolve.ataque && acao.atributoSalv) || condicaoPedeSalvaguarda(acao))
    ) {
      mostrarErro(new Error("Escolha a CD das suas técnicas na ficha lateral antes de usar esta ação."));
      return;
    }
    let alvosCombate: string[] = [];
    // Vantagem ou desvantagem de cada ataque, decidida junto com o alvo.
    let modosAtaque: ModoRolagem[] = [];
    if (escolheNoCombate && (resolve.ataque || resolve.salvaguarda || resolve.dano || resolve.condicao)) {
      if (resolve.ataque) {
        const ataques = await alvosDoCombate.escolherAtaques(`${acao.nome}: em quem?`, resolve.ataques, {
          daFicha: resolve.modosDaFicha,
          corpoACorpo: resolve.corpoACorpo,
        });
        if (ataques === null) return;
        alvosCombate = ataques.map((a) => a.alvo);
        modosAtaque = ataques.map((a) => a.modo);
      } else {
        // Sem acerto nem salvaguarda, o alvo é só de quem recebe a desvantagem.
        const soDesvantagem = !resolve.salvaguarda && !resolve.dano && noInimigo && !condicaoDoCatalogo;
        const escolhidos = await alvosDoCombate.escolher(
          `${acao.nome}: ${soDesvantagem ? "em qual inimigo?" : "em quem?"}`,
          noInimigo
            ? { detalhe: `No alvo: ${efeitosNoInimigo(acao).map(textoDoEfeito).join(", ")}.` }
            : undefined,
        );
        if (escolhidos === null) return;
        alvosCombate = escolhidos;
      }
    }
    const sobrecarga = custoPp > ppAtual;
    if (sobrecarga) {
      const motivo = motivoSemSobrecarga(acao, exaustao);
      if (motivo) {
        mostrarErro(new Error(motivo));
        return;
      }
    }
    const pp = sobrecarga ? 0 : custoPp;
    const partes: string[] = [];
    if (pp > 0) partes.push(`<b>${pp}</b> PP`);
    if (recurso) partes.push(`<b>${acao.custoRecursoValor}</b> ${recurso.nome}`);
    const curas = instantaneos.flatMap((e) =>
      e.tipo === "cura"
        ? [
            formulaResolvidaTexto(e.valor, atributos, nivel, { grau: acao.grau }) +
              (extraCura.texto && alvoDaCura(e) === "hp" ? ` + ${extraCura.texto}` : ""),
          ]
        : [],
    );
    const concentra = pedeConcentracao(acao.duracao);
    // Sem concentração, o que repete e o que se mantém seguem até ela acabar.
    // No combate, o que fica valendo no aliado vira condição nele e não prende a ação.
    const segue = ficaEmCurso(acao, !!turno);
    const linhas = [
      sobrecarga ? `Sem PP: recebe <b>${acao.grau}</b> de exaustão.` : null,
      partes.length > 0 ? `Vai consumir: ${partes.join(", ")}.` : null,
      curas.length > 0 ? `Cura: <b>${curas.join(" + ")}</b>.` : null,
      concentra ? "Passa a concentrar nela." : null,
      noInimigo && !turno ? "Fora do combate a desvantagem no inimigo não vai pra ninguém." : null,
      segue ? "Fica em curso até a duração acabar." : null,
    ].filter((l): l is string => !!l);

    // Efeitos que vão pra aliado: todos no mesmo, escolhido aqui (vai pelo
    // índice na lista de efeitos). Escolher já confirma o uso.
    const todosEfeitos = lerEfeitos(acao.efeitos);
    const paraAliado = todosEfeitos.flatMap((e, i) => (efeitoNoAliado(e, acao) ? [{ e, i }] : []));
    const aliados: Record<number, string> = {};
    if (paraAliado.length > 0) {
      if (!alvo.temAliados) {
        mostrarErro(new Error("Nenhum aliado na mesa."));
        return;
      }
      const ficam = efeitosQueFicamNoAliado(acao).length > 0;
      const detalhe = [
        `No aliado: ${[...new Set(paraAliado.map(({ e }) => textoDoEfeito(e)))].join(", ")}.`,
        ...linhas.map((l) => l.replace(/<\/?b>/g, "")),
        ficam
          ? turno
            ? "No combate, vira uma condição nele."
            : duraAlemDoUso(acao.duracao)
              ? "Fica valendo nele enquanto a ação durar."
              : "Fica valendo nele até o seu próximo turno."
          : null,
      ].filter((l): l is string => !!l);
      const titulo = `${sobrecarga ? "Sobrecarga: " : ""}${acao.nome}: em qual aliado?`;
      // No combate, o mesmo "em quem?" dos alvos, só com os personagens que estão nele.
      let escolhido: string | null | undefined;
      if (turno) {
        const ids = await alvosDoCombate.escolher(titulo, {
          detalhe: detalhe.join(" "),
          um: true,
          so: (p) => p.tipo === "personagem" && !p.voce,
        });
        if (ids === null) return;
        escolhido = participantesDoCombate.find((p) => p.id === ids[0])?.personagemId;
        if (!escolhido) {
          mostrarErro(new Error("Escolha o aliado que recebe o efeito."));
          return;
        }
      } else {
        escolhido = await alvo.escolher(titulo, { detalhe: detalhe.join(" ") });
      }
      if (!escolhido) return;
      for (const { i } of paraAliado) aliados[i] = escolhido;
    } else {
      const ok = await uso.confirmar({
        titulo: sobrecarga ? "Usar com Sobrecarga" : "Usar",
        nome: acao.nome,
        icone: sobrecarga ? "fa-bolt" : "fa-play",
        botao: sobrecarga ? "Sobrecarga" : "Usar",
        aviso: sobrecarga ? `Sem PP: recebe ${acao.grau} de exaustão.` : undefined,
        itens: [
          {
            id: acao.id,
            nome: acao.nome,
            custos: [
              ...(pp > 0 ? [{ valor: pp, nome: "PP" }] : []),
              ...(recurso ? [{ valor: acao.custoRecursoValor, nome: recurso.nome }] : []),
              ...(usosMax != null ? [{ valor: 1, nome: "uso", proprio: true }] : []),
              ...(tipoAcao
                ? [{ valor: 1, nome: `ação ${ACAO_COMBATE[tipoAcao].nome.toLowerCase()}`, proprio: true }]
                : []),
            ],
            faz: [
              ...curas.map((c) => `Cura ${c}`),
              ...(concentra ? ["Concentração"] : []),
              ...(segue ? ["Fica em curso"] : []),
            ],
          },
        ],
      });
      if (!ok) return;
    }

    // Cura com fórmula rola aqui; vai pra action e, se ela passar, pro chat.
    const { rolagens, publicar } = rolarCuras(
      curasComFormula(instantaneos, !!extraCura.texto),
      (valor) => resolverFormula(valor, atributos, nivel, { grau: acao.grau }),
      acao.nome,
      extraCura,
    );
    // Na ficha, na hora: só o que fica em quem usa.
    const proprios = instantaneos.flatMap((e, pos) => (efeitoNoAliado(e, acao) ? [] : [pos]));
    const deltas = computarDeltasInstantaneos(
      proprios.map((pos) => instantaneos[pos]),
      {
        incluirMax: false,
        rolagens: rolagensDoPedaco(rolagens, proprios),
        ctx: efeitosAgregados.ctxFormula ? { ...efeitosAgregados.ctxFormula, grau: acao.grau } : null,
      },
    );
    const deltaPersonagem = {
      deltaHpAtual: deltas.hpAtual || undefined,
      concedeHpTemp: deltas.hpTemp || undefined,
      deltaPpAtual: deltas.ppAtual - pp || undefined,
      deltaExaustao: (sobrecarga ? acao.grau : 0) + deltas.exaustao || undefined,
    };
    if (Object.values(deltaPersonagem).some((v) => v !== undefined)) {
      window.dispatchEvent(new CustomEvent("rpgo:patch-personagem", { detail: deltaPersonagem }));
    }
    const deltaRecursos: Record<string, number> = { ...deltas.recursos };
    if (recurso) {
      deltaRecursos[recurso.id] = (deltaRecursos[recurso.id] ?? 0) - acao.custoRecursoValor;
    }
    if (Object.keys(deltaRecursos).length > 0) {
      window.dispatchEvent(new CustomEvent("rpgo:patch-recurso", { detail: deltaRecursos }));
    }
    if (concentra) {
      const turnos = turnosDaDuracao(lerDuracao(acao.duracao));
      anunciarConcentracao({ tipo: "acao", id: acao.id, nome: acao.nome, ...(turnos ? { turnos } : {}) });
    } else if (segue) {
      anunciarAcaoEmCurso({ id: acao.id, emCurso: true, turnos: turnosDaAcao(acao.duracao) });
    }
    startTransition(async () => {
      if (usosMax != null) {
        aplicarPatch({ kind: "update", id: acao.id, patch: { usosAtual: usosAtual - 1 } });
      }
      if (turno) {
        setGastasLocal((g) =>
          comAcoesGanhas(tipoAcao ? { ...g, [tipoAcao]: (g[tipoAcao] ?? 0) + 1 } : g, acoesGanhasNoUso(todosEfeitos)),
        );
      }
      try {
        const { resolucaoId } = exigir(
          await usarAcao(personagemId, acao.id, rolagens, {
            sobrecarga,
            aliados,
            combate: {
              alvos: alvosCombate,
              modo: resolve?.ataque ? "ataque" : resolve?.salvaguarda ? "salvaguarda" : "direto",
              cd: resolve?.cd ?? null,
              corpoACorpo: resolve?.corpoACorpo === true,
            },
          }),
        );
        publicar();
        // Com alvo, as rolagens seguem sozinhas: o acerto já sai rolado e o dano
        // fica pronto no Rolador.
        if (resolucaoId && resolve) {
          if (resolve.ataque) pedirAtaque(resolucaoId, acao, resolve, modosAtaque);
          else if (resolve.dano) pedirDano(resolucaoId, acao, resolve, ["acerto"]);
        }
      } catch (err) {
        // Recarrega a página pra desfazer o otimismo.
        setGastasLocal({});
        setEmCursoLocal({});
        atualizar();
        mostrarErro(err);
      }
    });
  }

  // Traz das pastas: aparece na hora e o servidor cria de verdade.
  function adicionarDasPastas(modelos: ModeloView[]) {
    startTransition(async () => {
      for (const m of modelos) {
        aplicarPatch({
          kind: "create",
          acao: {
            ...ACAO_BASE,
            ...doModelo("acao", m.dados, recursos),
            pasta: m.pasta,
            id: idTemporario(),
          } as Acao,
        });
      }
      try {
        exigir(await adicionarDaPasta(personagemId, modelos.map((m) => m.id)));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  // Importadas por código: aparecem na hora; quem importou grava.
  useEffect(() => {
    function ouvir(e: Event) {
      for (const a of (e as CustomEvent<Importado>).detail?.acoes ?? []) {
        aplicarPatch({ kind: "create", acao: { ...ACAO_BASE, ...a.input, id: a.id } as Acao });
      }
    }
    window.addEventListener(EVENTO_IMPORTADO, ouvir);
    return () => window.removeEventListener(EVENTO_IMPORTADO, ouvir);
  }, [aplicarPatch]);

  // Contador do bônus progressivo: muda na hora e grava os efeitos.
  function mudarEfeitos(acao: Acao, efeitos: EfeitoHabilidade[]) {
    startTransition(async () => {
      aplicarPatch({ kind: "update", id: acao.id, patch: { efeitos } });
      try {
        exigir(await atualizarAcao(personagemId, acao.id, { efeitos }));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }
  useContagemDoRolador(acoesOtimistas, mudarEfeitos);

  // Põe na pasta (etiqueta + cópia guardada) ou tira a etiqueta.
  function guardarEmPasta(acao: Acao, pasta: string | null, exclusiva?: boolean) {
    startTransition(async () => {
      aplicarPatch({ kind: "update", id: acao.id, patch: { pasta } });
      try {
        if (pasta) exigir(await guardarNaPasta(personagemId, "acao", acao.id, pasta, exclusiva));
        else exigir(await atualizarAcao(personagemId, acao.id, { pasta: null }));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  async function apagar(acaoId: string) {
    const confirm = await Swal.fire({
      title: "Deletar Ação",
      text: "Tem certeza que quer apagar essa técnica?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "var(--danger)",
      cancelButtonColor: "var(--text-sec)",
      confirmButtonText: "Deletar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      aplicarPatch({ kind: "delete", id: acaoId });
      try {
        exigir(await deletarAcao(personagemId, acaoId));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  // Pastas da ficha: filtro e busca.
  const pastas = pastasDe(acoesOtimistas);
  const nomesDasPastas = pastas.map((p) => p.nome);
  const pastaAtiva = pastas.some((p) => p.nome === pastaFiltro) ? pastaFiltro : null;
  const casaFiltros = (a: Acao) =>
    (!tipoFiltro || a.tipo === tipoFiltro) &&
    (!tecnicaFiltro || a.tecnica === (tecnicaFiltro === "tecnica")) &&
    (!origemFiltro || origemDaAcao(a) === origemFiltro) &&
    (filtro !== "sem_custo" ||
      (a.custoPp === 0 && a.custoPa === 0 && (!a.custoRecursoId || a.custoRecursoValor === 0))) &&
    (!pastaAtiva || a.pasta === pastaAtiva) &&
    casaBusca(busca, [a.nome, a.descricao, a.tag, a.pasta, a.dano, a.tipoDano, a.tecnica ? "técnica" : null]);
  // Um card por ação de origem; aparece se ela ou uma forma dela casar.
  const visiveis = acoesOtimistas.filter((a) => !origemDe(a) && grupoDe(a).some(casaFiltros));
  const filtrando =
    filtro !== "todas" || !!pastaAtiva || !!tipoFiltro || !!tecnicaFiltro || !!origemFiltro || busca.trim() !== "";
  // Com filtro a lista está incompleta, então não dá pra reordenar.
  const podeArrastar = !filtrando;
  const tipoNaTela = (a: Acao) => reordenar.grupoDe(a.id, a.tipo);
  const naTela = reordenar.ordenar(visiveis);

  // Modal: o que a arma decide e quando a seção de dano aparece.
  const formComArma = form.armaIds.length > 0;
  // Ação comum com arma: o dano é o da arma; o campo vira adicional.
  const danoDaArma = formComArma && !form.tecnica;
  const formTemAcerto = formComArma || !!form.atributoAtaque;
  const formTemDano = form.comDano || !!form.dano.trim() || form.danosExtras.length > 0;

  return (
    <NomesRecursoContext.Provider value={new Map(recursos.map((r) => [r.id, r.nome]))}>
    <FormulaContext.Provider value={ctxFormula}>
    <EfeitoDeAcaoContext.Provider value>
    <div>
      <div className="tab-topo">
        <h1>Ações de Combate</h1>
        <div className="tab-topo-botoes">
          <BotaoPacotes />
          <BotaoPastas tipo="acao" personagemId={personagemId} onAdicionar={adicionarDasPastas} />
          <button
            type="button"
            className="btn-rect primary"
            onClick={abrirNova}
          >
            + Nova Ação
          </button>
        </div>
      </div>

      {turno && (
        <AcoesDoTurno
          personagemId={personagemId}
          naVez={turno.naVez}
          rolagensPendentes={turno.resolucoes.length}
          gastas={gastas}
          maximo={maximoAcoes}
          fontesExtras={{
            padrao: efeitosAgregados.acoesExtras?.padrao?.fontes,
            bonus: efeitosAgregados.acoesExtras?.bonus?.fontes,
            power: efeitosAgregados.acoesExtras?.power?.fontes,
            react: efeitosAgregados.acoesExtras?.react?.fontes,
          }}
        />
      )}

      <BarraFiltros
        busca={busca}
        onBusca={setBusca}
        rotulo="ação"
        filtros={FILTROS}
        filtro={filtro}
        onFiltro={setFiltro}
        pastas={pastas}
        pasta={pastaAtiva}
        onPasta={setPastaFiltro}
        grupos={[
          { rotulo: "Tipo", opcoes: FILTROS_TIPO, valor: tipoFiltro, onValor: setTipoFiltro },
          { rotulo: "Técnica", opcoes: FILTROS_TECNICA, valor: tecnicaFiltro, onValor: setTecnicaFiltro },
          { rotulo: "Origem", opcoes: FILTROS_ORIGEM, valor: origemFiltro, onValor: setOrigemFiltro },
        ]}
      />

      {GRUPOS.map((grupo) => {
        const lista = naTela.filter((a) => tipoNaTela(a) === grupo.tipo);
        if (filtrando && lista.length === 0) return null;
        return (
          <SecaoRecolhivel
            key={grupo.tipo}
            chave={`acoes:${grupo.tipo}`}
            icone={grupo.icone}
            cor={grupo.cor}
            titulo={grupo.titulo}
            contagem={lista.length}
            forcarAberta={filtrando}
            zona={reordenar.zona(grupo.tipo)}
            recebendo={!!reordenar.recebendo(grupo.tipo)}
          >
            <div className="reordenar-zona" {...reordenar.zona(grupo.tipo)}>
            {lista.length > 0 ? (
              <div className="action-grid">
                {lista.map((origem) => {
                  const formas = grupoDe(origem);
                  // A forma escolhida; filtrando, a primeira que casa.
                  const acao =
                    formas.find((f) => f.id === formaAtiva[origem.id]) ??
                    (filtrando ? formas.find(casaFiltros) : undefined) ??
                    origem;
                  const recursoCusto = recursos.find(
                    (r) => r.id === acao.custoRecursoId,
                  );
                  // Técnica acerta com o atributo primário (o da CD); o gravado só
                  // diz que ela tem acerto.
                  const atributoAtq = (
                    acao.atributoAtaque ? (acao.tecnica && cdPadrao) || acao.atributoAtaque : null
                  ) as Atributo | null;
                  // Adicional no acerto da própria ação (com arma ou sem).
                  const adicionalAcerto = acao.bonusAcerto
                    ? resolverFormula(acao.bonusAcerto, atributosParaTeste, nivel, { grau: acao.grau }).modificador
                    : 0;
                  const comAdicional = <T extends { bonus: number; fontes: string[] }>(atq: T): T =>
                    adicionalAcerto ? { ...atq, bonus: atq.bonus + adicionalAcerto, fontes: [...atq.fontes, "adicional da ação"] } : atq;
                  // A CD da ação com salvaguarda (ou com condição que pede uma) é a
                  // das técnicas do personagem (ficha lateral). O atributo gravado na
                  // ação é de antes disso e só vale enquanto o personagem não escolheu o dele.
                  const pedeCd = !!acao.atributoSalv || condicaoPedeSalvaguarda(acao);
                  const atributoCd = ((pedeCd ? cdPadrao || acao.atributoCd : "") || null) as Atributo | null;
                  // Armas ligadas à ação; só as equipadas desferem.
                  const armasDaAcao = lerIds(acao.armaIds)
                    .map((id) => armas.find((a) => a.id === id))
                    .filter((a): a is ItemArma => !!a);
                  const armasEquipadas = armasDaAcao.filter((a) => a.equipado);
                  // Habilidades de onde a ação deriva.
                  const habsDerivadas = lerIds(acao.habilidadeIds)
                    .map((id) => habilidades.find((h) => h.id === id))
                    .filter((h): h is HabilidadeRef => !!h);
                  // Efeitos da própria ação por cima da ficha (e da arma).
                  const aggAcao = efeitosDaTecnica(efeitosAgregados, acao);
                  // O Multiataque da ficha só vale nas ações que o jogador marcou.
                  const multiataque = !!acao.multiataque;
                  const aggDaArma = (arma: ItemArma) => efeitosDaTecnica(efeitosDa(arma), acao);
                  // Um acerto e um dano por arma equipada.
                  const golpes = armasEquipadas.map((arma) => {
                    const doAtaque = resolverAtaqueArma({
                      alcanceRaw: arma.alcance,
                      propriedadesRaw: arma.propriedades,
                      atributoOverride: arma.atributoAtaque,
                      modificadorArma: arma.modificador || 0,
                      proficiente: arma.proficienteArma,
                      atributos: atributosParaTeste,
                      nivel,
                      efeitosAgregados: aggDaArma(arma),
                      tecnica: acao.tecnica,
                    });
                    const atq = doAtaque && comAdicional(doAtaque);
                    const municao = municaoDe(arma);
                    const semMunicao = municao.usa && (!municao.item || municao.restante <= 0);
                    return { arma, atq, municao, semMunicao };
                  });
                  // A 1ª arma equipada define o alcance quando a ação não tem ataque próprio.
                  const ataqueArma = golpes[0]?.atq ?? null;
                  const alcanceContexto = ataqueArma
                    ? ataqueArma.alcance
                    : inferirAlcance(acao.alcance);
                  // Sem arma: bônus de ataque do alcance da ação, técnica/comum e geral.
                  const extraAtaqueSemArma = bonusDeAtaque(aggAcao, alcanceContexto, acao.tecnica);
                  const extraCd = aggAcao.bonusCdTecnicas.valor;
                  const fontesCd = aggAcao.bonusCdTecnicas.fontes;
                  // Item que concede a ação; sem ele equipado, a ação fica travada.
                  const itemOrigem = acao.itemId
                    ? itens.find((i) => i.id === acao.itemId)
                    : undefined;
                  const travadaPorItem = !!acao.itemId && !itemOrigem?.equipado;
                  // Só o item de onde a ação vem trava; arma que ela usa, não.
                  const travada = travadaPorItem;
                  // Acerto: vem da arma (que já embute o bônus de habilidade do
                  // alcance) ou do cálculo manual da técnica.
                  const bonusAtq = ataqueArma
                    ? ataqueArma.bonus
                    : atributoAtq
                      ? bonusAtaqueTecnica({
                          nivel,
                          valorAtributo: atributosParaTeste[atributoAtq],
                        }) +
                        extraAtaqueSemArma.valor +
                        adicionalAcerto
                      : null;
                  // Alcance a mais (ou trocado) que vale sempre nesta ação; o opcional fica no Rolador.
                  const alcancesAcao = (aggAcao.alcances ?? []).filter(
                    (a) =>
                      !a.opcional &&
                      casaContexto(a.alvo, {
                        tipo: "ataque",
                        alcance: alcanceContexto,
                        tecnica: acao.tecnica,
                      }),
                  );
                  const alcanceVira = alcancesAcao.find((a) => a.vira)?.vira;
                  const alcanceSoma = alcancesAcao.reduce((s, a) => s + (a.vira ? 0 : a.valor), 0);
                  // Passo de dano da própria ação sobe o dado dela.
                  const passosProprios = lerEfeitos(acao.efeitos).reduce(
                    (soma, e) => soma + (e.tipo === "passo_dano" ? e.passos : 0),
                    0,
                  );
                  // DES reduzida pela armadura morde o acerto quando ele usa DES.
                  const atributoAcerto = ataqueArma ? ataqueArma.atributo : atributoAtq;
                  const desReduzAtq = atributoAcerto === "destreza" && desReduz;
                  const fontesAtaque = ataqueArma
                    ? ataqueArma.fontes
                    : [...extraAtaqueSemArma.fontes, ...(adicionalAcerto ? ["adicional da ação"] : [])];
                  // Dano da técnica + dano bônus e proficiência da arma + bônus de habilidade.
                  const comporDano = (arma: ItemArma | null) => {
                    const agg = arma ? aggDaArma(arma) : aggAcao;
                    // Ação comum com arma: o dano da arma (dado, atributo,
                    // proficiência) e o da ação entra como adicional.
                    if (arma && !acao.tecnica) {
                      const atq = golpes.find((g) => g.arma.id === arma.id)?.atq;
                      const d = resolverDanoArma({
                        danoBase: danoComMunicao(arma.dano, municaoDe(arma)),
                        danoBonus: arma.danoBonus,
                        adicional: acao.dano,
                        passos: agg.passosDanoArma.valor + passosProprios,
                        somaAtributo: arma.danoSomaAtributo,
                        atributoDano: atq?.atributo ?? null,
                        atributos: atributosParaTeste,
                        nivel,
                        proficiencia: arma.danoSomaProficiencia ? bonusProficiencia(nivel) : 0,
                        alcance: atq?.alcance ?? alcanceContexto,
                        efeitosAgregados: agg,
                        dadoFixo: agg.dadoArmaFixo?.formula,
                      });
                      const tiposDano = juntarTipos(
                        acao.tipoDano ? [acao.tipoDano] : [],
                        tiposDoDano(acao.dano ?? ""),
                        tiposDoDano(danoComMunicao(arma.dano, municaoDe(arma)) ?? ""),
                        tiposDoDano(arma.danoBonus ?? ""),
                      );
                      return { d, efeitos: efeitosDoContexto(agg), tiposDano };
                    }
                    const d = acao.dano
                      ? resolverDanoArma({
                          danoBase: acao.dano,
                          danoBonus: arma?.danoBonus ?? null,
                          // Passos de técnica da ficha só valem em técnica; os da ação, sempre.
                          passos:
                            (acao.tecnica
                              ? (arma ? efeitosDa(arma) : efeitosAgregados).passosDanoTecnica.valor
                              : 0) + passosProprios,
                          grau: acao.grau,
                          somaAtributo: false,
                          atributoDano: null,
                          atributos: atributosParaTeste,
                          nivel,
                          proficiencia: arma?.danoSomaProficiencia
                            ? bonusProficiencia(nivel)
                            : 0,
                          alcance: alcanceContexto,
                          efeitosAgregados: agg,
                          tecnica: acao.tecnica,
                        })
                      : null;
                    // Tipos escritos no dano da técnica e na arma, pros efeitos só de um tipo.
                    const tiposDano = juntarTipos(
                      acao.tipoDano ? [acao.tipoDano] : [],
                      tiposDoDano(acao.dano ?? ""),
                      tiposDoDano((arma ? danoComMunicao(arma.dano, municaoDe(arma)) : null) ?? ""),
                      tiposDoDano(arma?.danoBonus ?? ""),
                    );
                    return { d, efeitos: efeitosDoContexto(agg), tiposDano };
                  };
                  // Um dano por arma equipada; sem arma, o dano da técnica.
                  const danos =
                    armasEquipadas.length > 0
                      ? armasEquipadas.map((a) => ({
                          rotulo: armasEquipadas.length > 1 ? a.nome : null,
                          ...comporDano(a),
                        }))
                      : [{ rotulo: null, ...comporDano(null) }];
                  const cd = atributoCd
                    ? cdTecnica({
                        nivel,
                        valorAtributoPrim: atributosParaTeste[atributoCd],
                      }) + extraCd
                    : null;
                  const atributoSalv = acao.atributoSalv as Atributo | null;
                  // Cada custo carrega cor opcional pra colorir o chip.
                  // Recurso customizado usa a cor configurada; PP/PA usam padrão.
                  const custos: { texto: string; estilo?: EstiloCor; titulo?: string }[] = [];
                  // Desconto em técnica: ficha + arma que desfere ou concede (vale o maior).
                  const armasDoCusto = [...armasEquipadas, ...(itemOrigem ? [itemOrigem] : [])];
                  let ppFinal = 0;
                  for (const [custo, valor, sigla] of [
                    ["pp", acao.custoPp, "PP"],
                    ["pa", acao.custoPa, "PA"],
                  ] as const) {
                    if (valor <= 0) continue;
                    const { final, fontes } = custoDaAcao(
                      aggAcao,
                      armasDoCusto,
                      custo,
                      valor,
                      acao.grau,
                    );
                    if (custo === "pp") ppFinal = final;
                    custos.push(
                      final < valor
                        ? {
                            texto: `${valor}→${final} ${sigla}`,
                            titulo: `−${valor - final} ${sigla} de ${fontes.join(", ")}`,
                          }
                        : { texto: `${valor} ${sigla}` },
                    );
                  }
                  if (recursoCusto && acao.custoRecursoValor > 0) {
                    custos.push({
                      texto: `${acao.custoRecursoValor} ${recursoCusto.nome}`,
                      estilo: {
                        cor: recursoCusto.cor,
                        cor2: recursoCusto.cor2,
                        efeito: normalizarEfeitoCor(recursoCusto.efeito),
                      },
                    });
                  }
                  const recursoGasto =
                    recursoCusto && acao.custoRecursoValor > 0 ? recursoCusto : undefined;
                  const efeitosAcao = lerEfeitos(acao.efeitos);
                  const usosMax = usosMaximos(acao, ctxFormula);
                  const usosAtual = acao.usosAtual ?? usosMax ?? 0;
                  const travaTurno = travaDoTurno(acao.tipo);
                  const podeUsar =
                    (!!turno && ehAcaoDeCombate(acao.tipo)) ||
                    ppFinal > 0 ||
                    !!recursoGasto ||
                    usosMax != null ||
                    efeitosAcao.some(efeitoInstantaneo) ||
                    pedeConcentracao(acao.duracao) ||
                    ficaEmCurso(acao);
                  // Em curso: usada e ainda valendo (a de concentração aparece na ficha lateral).
                  const curso = emCursoLocal[acao.id] ?? {
                    emCurso: !!acao.emCurso,
                    turnos: acao.turnosRestantes ?? null,
                  };
                  const emCursoAgora = curso.emCurso && ficaEmCurso(acao);
                  const duram = efeitosDuram(acao);
                  const duracaoTexto = textoDuracao(lerDuracao(acao.duracao));
                  const temPorTurno = efeitosAcao.some((e) => e.tipo === "por_turno");
                  const chipsAcao = efeitosAcao.filter((e) => e.tipo !== "por_turno");
                  // Tipo escolhido que o texto do dano ainda não diz.
                  const tipoNoChip =
                    acao.tipoDano && !tiposDoDano(acao.dano ?? "").some((t) => mesmoTipo(t, acao.tipoDano!))
                      ? ` ${acao.tipoDano.toLowerCase()}`
                      : "";
                  const origens = [...habsDerivadas.map((h) => h.nome), ...(itemOrigem ? [itemOrigem.nome] : [])];
                  const danosExtras = lerDanosExtras(acao.danosExtras);
                  // Uso desta ação em combate que ainda espera rolagem.
                  const pendente = turno?.resolucoes.find((r) => r.acaoId === acao.id) ?? null;
                  const esperaAcerto = pendente?.etapa === "ataque";
                  // Acertos que ainda esperam a rolagem de dano.
                  const acertosPendentes: ResultadoAlvo[] =
                    pendente?.etapa !== "dano"
                      ? []
                      : pendente.modo !== "ataque"
                        ? ["acerto"]
                        : pendente.alvos.flatMap((a) =>
                            !a.danoAplicado && (a.resultado === "acerto" || a.resultado === "critico")
                              ? [a.resultado]
                              : [],
                          );
                  // Acerto: com a arma (1ª equipada com munição, se nenhuma for dada) ou o da técnica.
                  const golpePadrao = golpes.find((g) => g.atq && !g.semMunicao) ?? null;
                  const empilharAcerto = (
                    golpe: (typeof golpes)[number] | null,
                    extras?: Pick<EmpilharRolagemDetail, "aoConcluir" | "rolarAuto" | "modos">,
                  ) => {
                    if (golpe?.atq) {
                      empilharD20(
                        golpe.atq.bonus - penD20,
                        `Atacar ${acao.nome} (${golpe.arma.nome})`,
                        {
                          tipo: "ataque",
                          alcance: golpe.atq.alcance,
                          tecnica: acao.tecnica,
                          multiataque,
                          ...(golpe.municao.item
                            ? { municao: { id: golpe.municao.item.id, nome: golpe.municao.item.nome } }
                            : {}),
                        },
                        efeitosDoContexto(aggDaArma(golpe.arma)),
                        extras,
                      );
                    } else if (bonusAtq != null) {
                      empilharD20(
                        bonusAtq - penD20,
                        `Atacar ${acao.nome}`,
                        { tipo: "ataque", alcance: alcanceContexto, tecnica: acao.tecnica, multiataque },
                        efeitosDoContexto(aggAcao),
                        extras,
                      );
                    }
                  };
                  const empilharDano = (i: number, extras?: Pick<EmpilharRolagemDetail, "aoConcluir" | "critico">) => {
                    const x = danos[i];
                    if (!x?.d) return;
                    empilharRolagem({
                      dados: x.d.dados,
                      modificador: x.d.modificador,
                      nomePreset: `Dano ${acao.nome}${x.rotulo ? ` (${x.rotulo})` : ""}`,
                      // Contexto de dano pros efeitos de dano do Rolador.
                      contexto: {
                        tipo: "dano",
                        alcance: alcanceContexto,
                        tecnica: acao.tecnica,
                        grau: acao.grau,
                        tiposDano: x.tiposDano,
                      },
                      efeitos: x.efeitos,
                      ...extras,
                    });
                  };
                  const iDano = danos.findIndex((x) => x.d?.rolavel);
                  // Chips do acerto que a ficha já liga (multiataque, vantagem, desvantagem).
                  const chipsDoAcerto = chipsDoContexto(efeitosDoContexto(golpePadrao ? aggDaArma(golpePadrao.arma) : aggAcao), {
                    tipo: "ataque",
                    alcance: golpePadrao?.atq?.alcance ?? alcanceContexto,
                    tecnica: acao.tecnica,
                    multiataque,
                  });
                  const resolve: Resolve = {
                    ataque: !!golpePadrao || bonusAtq != null,
                    salvaguarda: cd != null && !!atributoSalv,
                    dano: iDano >= 0,
                    // Condição do catálogo ou efeito que fica valendo no inimigo.
                    condicao: efeitosAcao.some((e) => (e.tipo === "condicao_aplicar" && !e.emVoce) || efeitoNoInimigo(e)),
                    cd,
                    // Multiataque ligado de saída: um alvo pra cada ataque.
                    ataques: chipsDoAcerto.find((c) => c.tipo === "multi_ataque" && !c.opcional)?.valor ?? 1,
                    modosDaFicha: chipsDoAcerto
                      .filter((c) => (c.tipo === "vantagem" || c.tipo === "desvantagem") && !c.opcional)
                      .map((c) => `${c.rotulo}: ${c.fontes.join(", ")}`),
                    atacar: (extras) => empilharAcerto(golpePadrao, extras),
                    danar: (extras) => empilharDano(iDano, extras),
                    tipoDano: acao.tipoDano || danos[iDano]?.tiposDano[0] || "",
                    corpoACorpo: (golpePadrao?.atq?.alcance ?? alcanceContexto) === "corpo_a_corpo",
                  };
                  return (
                    <div
                      key={origem.id}
                      className={`action-card com-copia type-${reordenar.arrastando ? tipoNaTela(origem) : acao.tipo}${travada ? " hab-travada" : ""}${
                        ehTemporario(acao.id) ? " item-pendente" : ""
                      }${podeArrastar ? " com-alca" : ""}${reordenar.vaga(origem.id)}`}
                      inert={ehTemporario(acao.id)}
                      {...(podeArrastar && !ehTemporario(origem.id) ? reordenar.item(origem.id) : {})}
                    >
                      {podeArrastar && !ehTemporario(origem.id) && (
                        <button
                          type="button"
                          className="btn-card-alca"
                          title="Arraste pra mudar a ordem ou a categoria (ou use as setas)"
                          aria-label={`Mudar ${acao.nome} de posição`}
                          {...reordenar.alca(origem.id)}
                        >
                          <i className="fas fa-grip-vertical" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-card-copia"
                        title="Duplicar"
                        aria-label={`Duplicar ${acao.nome}`}
                        onClick={() => abrirCopia(acao)}
                      >
                        <i className="fas fa-copy" />
                      </button>
                      <BotaoGuardar
                        origem={{ nome: acao.nome, pasta: acao.pasta ?? null }}
                        personagemId={personagemId}
                        pastasDaFicha={nomesDasPastas}
                        sugestoes={[...habsDerivadas.map((h) => h.nome), ...(acao.tag ? [acao.tag] : [])]}
                        onGuardar={(p, exclusiva) => guardarEmPasta(acao, p, exclusiva)}
                      />
                      <button
                        type="button"
                        className="btn-card-edit"
                        title="Editar"
                        onClick={() => abrirEdit(acao)}
                      >
                        <i className="fas fa-edit" />
                      </button>
                      <button
                        type="button"
                        className="btn-card-trash"
                        title="Apagar"
                        onClick={() => apagar(acao.id)}
                      >
                        <i className="fas fa-trash" />
                      </button>
                      <div>
                        <div className="card-title">{acao.nome}</div>
                        {formas.length > 1 && (
                          <div className="acao-formas" role="group" aria-label="Formas">
                            {formas.map((f) => (
                              <button
                                type="button"
                                key={f.id}
                                className={`acao-forma${f.id === acao.id ? " ativo" : ""}`}
                                aria-pressed={f.id === acao.id}
                                onClick={() => setFormaAtiva((s) => ({ ...s, [origem.id]: f.id }))}
                              >
                                {f.nome}
                              </button>
                            ))}
                          </div>
                        )}
                        {pendente && (
                          <div className="acao-pendente">
                            <i className="fas fa-crosshairs" />
                            <span>
                              <strong>{pendente.alvos.map((a) => a.nome).join(", ")}</strong>
                              {pendente.etapa === "ataque" ? " · role o acerto" : " · role o dano"}
                            </span>
                          </div>
                        )}
                        {(bonusAtq != null || cd != null || atributoSalv || acao.dano || acao.alcance || alcancesAcao.length > 0 || golpes.length > 0 || acao.tecnica || duracaoTexto || temPorTurno || usosMax != null) && (
                          <div className="acao-stats">
                            {acao.tecnica && (
                              <span className="acao-stat acao-tecnica">
                                <i className="fas fa-wand-magic-sparkles" /> Técnica
                                {acao.grau > 0 ? ` ${acao.grau}º grau` : ""}
                              </span>
                            )}
                            {duracaoTexto && (
                              <span className="acao-stat">
                                <i className="fas fa-hourglass-half" /> {duracaoTexto}
                              </span>
                            )}
                            {acao.tipo === "react" && acao.gatilho && (
                              <span className="acao-stat" title="Gatilho da reação">
                                <i className="fas fa-bell" /> {textoGatilho(lerGatilho(acao.gatilho))}
                              </span>
                            )}
                            {emCursoAgora && (
                              <span className="acao-stat acao-em-curso">
                                <i className="fas fa-circle-play" /> Em curso
                                {curso.turnos != null && curso.turnos > 0
                                  ? ` · ${textoTurnosRestantes(curso.turnos).toLowerCase()}`
                                  : ""}
                              </span>
                            )}
                            <StatsPorTurno
                              efeitos={efeitosAcao}
                              grau={acao.tecnica && acao.grau > 0 ? acao.grau : undefined}
                            />
                            {usosMax != null && (
                              <Tooltip
                                titulo="Usos"
                                icone="fa-bolt-lightning"
                                texto={acao.usosFormula ? `Máximo: ${acao.usosFormula}` : undefined}
                              >
                                <span className="acao-stat">
                                  <i className="fas fa-bolt-lightning" /> {usosAtual}/{usosMax}
                                </span>
                              </Tooltip>
                            )}
                            {usosMax != null && acao.recarga && (
                              <span className="acao-stat">
                                <i className="fas fa-rotate" />{" "}
                                {RECARGAS_HABILIDADE.find((r) => r.slug === acao.recarga)?.nome ??
                                  acao.recarga}
                              </span>
                            )}
                            {lerEfeitos(acao.efeitos).some((e) => efeitoNoAliado(e, acao)) && (
                              <span className="acao-stat acao-aliado">
                                <i className="fas fa-hand-holding-heart" /> Em aliado
                              </span>
                            )}
                            {lerAlvoAcao(acao) === "qualquer" && (
                              <span className="acao-stat">
                                <i className="fas fa-users" /> Qualquer criatura
                              </span>
                            )}
                            {/* Um chip de acerto por arma equipada; sem arma, o cálculo da técnica. */}
                            {golpes.length > 0
                              ? golpes.map(({ arma, atq, municao, semMunicao }) =>
                                  atq ? (
                                    <Tooltip
                                      key={arma.id}
                                      titulo={`Ataque com ${arma.nome}`}
                                      icone="fa-crosshairs"
                                      texto={[
                                        atq.fontes.length > 0 && `Inclui bônus de ${atq.fontes.join(", ")}`,
                                        penD20 > 0 && `−${penD20} de exaustão`,
                                        !!municao.item && textoMunicao(municao),
                                        semMunicao ? textoMunicao(municao) : "Clique para empilhar no Rolador",
                                      ]}
                                    >
                                    <button
                                      type="button"
                                      disabled={travada || semMunicao}
                                      className={`acao-stat acao-rolar ${esperaAcerto ? "esperando" : ""} ${penD20 > 0 || (atq.atributo === "destreza" && desReduz) ? "valor-exausto" : ""}`}
                                      onClick={() => {
                                        const golpe = golpes.find((g) => g.arma.id === arma.id) ?? null;
                                        if (pendente && esperaAcerto) {
                                          pedirAtaque(
                                            pendente.id,
                                            acao,
                                            { ...resolve, atacar: (extras) => empilharAcerto(golpe, extras) },
                                          );
                                        } else empilharAcerto(golpe);
                                      }}
                                    >
                                      <i className="fas fa-crosshairs" /> {arma.nome}{" "}
                                      <strong>{formatarMod(atq.bonus - penD20)}</strong>
                                      {atq.fontes.length > 0 && <i className="fas fa-link prof-fonte" />}
                                      {penD20 > 0 && <MarcaExausto />}
                                    </button>
                                    </Tooltip>
                                  ) : null,
                                )
                              : bonusAtq != null && (
                                  <Tooltip
                                    titulo="Acerto"
                                    icone="fa-crosshairs"
                                    texto={[
                                      fontesAtaque.length > 0 && `Inclui bônus de ${fontesAtaque.join(", ")}`,
                                      desReduzAtq && `−${Math.abs(penalidadeDesArmadura)} de DES (armadura)`,
                                      penD20 > 0 && `−${penD20} de exaustão`,
                                      "Clique para empilhar no Rolador",
                                    ]}
                                  >
                                  <button
                                    type="button"
                                    disabled={travada}
                                    className={`acao-stat acao-rolar ${esperaAcerto ? "esperando" : ""} ${penD20 > 0 || desReduzAtq ? "valor-exausto" : ""}`}
                                    onClick={() => {
                                      if (pendente && esperaAcerto) pedirAtaque(pendente.id, acao, resolve);
                                      else empilharAcerto(null);
                                    }}
                                  >
                                    <i className="fas fa-crosshairs" /> Acerto{" "}
                                    <strong>{formatarMod(bonusAtq - penD20)}</strong>
                                    {fontesAtaque.length > 0 && <i className="fas fa-link prof-fonte" />}
                                    {penD20 > 0 && <MarcaExausto />}
                                  </button>
                                  </Tooltip>
                                )}
                            {danos.map(({ rotulo, d }, i) => {
                              if (!d) return null;
                              const partes = d.partes.map((x) => `${x.rotulo}: ${x.texto}`);
                              const miolo = (
                                <>
                                  <i className="fas fa-burst" />{" "}
                                  {rotulo ? `${rotulo}: ` : ""}
                                  {d.formula}
                                  {tipoNoChip}
                                  {d.partes.length > 1 && <i className="fas fa-link prof-fonte" />}
                                </>
                              );
                              const rolar = d.rolavel && !travada;
                              return (
                                <Tooltip
                                  key={`d${i}`}
                                  titulo={rotulo ? `Dano: ${rotulo}` : "Dano"}
                                  icone="fa-burst"
                                  texto={[...partes, rolar && "Clique para empilhar no Rolador"]}
                                >
                                {rolar ? (
                                <button
                                  type="button"
                                  className={`acao-stat acao-rolar${acertosPendentes.length > 0 ? " esperando" : ""}`}
                                  onClick={() => {
                                    if (pendente && acertosPendentes.length > 0) {
                                      pedirDano(
                                        pendente.id,
                                        acao,
                                        { ...resolve, danar: (extras) => empilharDano(i, extras) },
                                        acertosPendentes,
                                      );
                                    } else {
                                      // Fora de uma resolução, os danos a mais só vão pro chat.
                                      empilharDano(
                                        i,
                                        danosExtras.length > 0
                                          ? { aoConcluir: () => void rolarDanosExtras(acao, false) }
                                          : undefined,
                                      );
                                    }
                                  }}
                                >
                                  {miolo}
                                </button>
                                ) : (
                                  <span className="acao-stat">{miolo}</span>
                                )}
                                </Tooltip>
                              );
                            })}
                            {danosExtras.map((e, i) => (
                              <Tooltip key={`x${i}`} titulo="Dano extra" icone="fa-plus" texto="Rolado à parte, junto com o dano">
                                <span className="acao-stat">
                                  <i className="fas fa-plus" /> {e.formula}
                                  {e.tipo ? ` ${e.tipo.toLowerCase()}` : ""}
                                </span>
                              </Tooltip>
                            ))}
                            {cd != null && atributoSalv && (
                              <Tooltip
                                titulo="Salvaguarda"
                                icone="fa-shield-alt"
                                texto={fontesCd.length ? `${formatarMod(extraCd)} de ${fontesCd.join(", ")}` : undefined}
                              >
                                <span className="acao-stat">
                                  <i className="fas fa-shield-alt" /> Salv {SIGLA[atributoSalv]} CD <strong>{cd}</strong>
                                  {fontesCd.length > 0 && <i className="fas fa-link prof-fonte" />}
                                </span>
                              </Tooltip>
                            )}
                            {(acao.alcance || alcancesAcao.length > 0) && (
                              <Tooltip
                                titulo="Alcance"
                                icone="fa-ruler-horizontal"
                                texto={
                                  alcancesAcao.length
                                    ? `de ${[...new Set(alcancesAcao.map((a) => a.fonte))].join(", ")}`
                                    : undefined
                                }
                              >
                                <span className="acao-stat">
                                  <i className="fas fa-ruler-horizontal" /> {normalizarAlcance(alcanceVira ?? acao.alcance ?? "")}
                                  {alcanceSoma !== 0 ? ` ${formatarMod(alcanceSoma)} m` : ""}
                                  {alcancesAcao.length > 0 && <i className="fas fa-link prof-fonte" />}
                                </span>
                              </Tooltip>
                            )}
                          </div>
                        )}
                        {travada && (
                          <div className="hab-travada-nota">
                            <i className="fas fa-lock" /> Ação travada · equipe {itemOrigem?.nome ?? "o item"}
                          </div>
                        )}
                        {chipsAcao.length > 0 && (
                          <div className="efeito-chips">
                            {chipsAcao.map((e, i) => (
                              <ChipEfeito
                                key={i}
                                efeito={e}
                                grau={acao.tecnica && acao.grau > 0 ? acao.grau : undefined}
                                dura={duram ? e.dura : undefined}
                              />
                            ))}
                          </div>
                        )}
                        <PassosProgressivos
                          efeitos={efeitosAcao}
                          onChange={(efeitos) => mudarEfeitos(acao, efeitos)}
                          travado={travada}
                          grau={acao.tecnica && acao.grau > 0 ? acao.grau : undefined}
                        />
                        <DescricaoRecolhivel texto={acao.descricao} />
                      </div>
                      {(custos.length > 0 || podeUsar || acao.tag || acao.pasta || origens.length > 0 || armasDaAcao.length > 0) && (
                        <div className="card-tags">
                          {custos.map((c, i) => (
                            <TagChip
                              key={i}
                              nome={c.texto}
                              estilo={c.estilo}
                              classePadrao="tag tag-custo"
                              title={c.titulo}
                            />
                          ))}
                          {podeUsar && (
                            <button
                              type="button"
                              className="hab-usar"
                              disabled={travada || !!travaTurno || (usosMax != null && usosAtual <= 0)}
                              title={usosMax != null && usosAtual <= 0 ? "Sem usos" : (travaTurno ?? undefined)}
                              onClick={() => usar(acao, ppFinal, recursoGasto, resolve)}
                            >
                              <i className="fas fa-play" /> Usar
                            </button>
                          )}
                          {emCursoAgora && (
                            <button
                              type="button"
                              className="hab-usar"
                              title="Encerrar antes da duração acabar"
                              onClick={() => encerrar(acao)}
                            >
                              <i className="fas fa-stop" /> Encerrar
                            </button>
                          )}
                          {acao.tag && (
                            <span className="tag tag-damage">{acao.tag}</span>
                          )}
                          {acao.pasta && (
                            <button
                              type="button"
                              className="tag tag-pasta"
                              title="Filtrar por esta pasta"
                              onClick={() => setPastaFiltro(acao.pasta!)}
                            >
                              <i className="fas fa-folder" /> {acao.pasta}
                            </button>
                          )}
                          {(origens.length > 0 || armasDaAcao.length > 0) && (
                          <span className="acao-derivas">
                          {origens.length > 0 && (
                            <span className="acao-deriva">
                              Vem de{" "}
                              {origens.map((nome, i) => (
                                <span key={i}>
                                  {i > 0 && ", "}
                                  <span className="acao-deriva-nome">{nome}</span>
                                </span>
                              ))}
                            </span>
                          )}
                          {armasDaAcao.length > 0 && (
                            <span className="acao-deriva">
                              Usa{" "}
                              {armasDaAcao.map((a, i) => (
                                <span key={a.id}>
                                  {i > 0 && ", "}
                                  <Tooltip titulo={a.equipado ? undefined : a.nome} icone="fa-khanda" texto={a.equipado ? undefined : "Não equipada"}>
                                    <span className={`acao-deriva-nome${a.equipado ? "" : " fora"}`}>
                                      {a.nome}
                                      {a.danoBonus && a.equipado ? ` ${comSinal(a.danoBonus)}` : ""}
                                    </span>
                                  </Tooltip>
                                </span>
                              ))}
                            </span>
                          )}
                          </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: "var(--text-sec)", fontSize: "0.85rem", fontStyle: "italic" }}>
                Nenhuma ação nessa categoria.
              </p>
            )}
            </div>
          </SecaoRecolhivel>
        );
      })}

      {filtrando && visiveis.length === 0 && <p className="filtros-vazio">Nada encontrado.</p>}

      {alvo.modal}
      {alvosDoCombate.modal}
      {uso.modal}

      {modalAberto && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" onClick={fecharModal} aria-label="Fechar">
              <i className="fas fa-times" />
            </button>
            <h2>{form.id ? "Editar Ação" : "Nova Ação"}</h2>

            <div className="tipo-cards tipo-cards-5">
              {(
                [
                  ["padrao", "fa-gavel", "Padrão", "var(--color-padrao)"],
                  ["bonus", "fa-bolt", "Bônus", "var(--color-bonus)"],
                  ["power", "fa-bomb", "Poderosa", "var(--color-power)"],
                  ["react", "fa-shield-alt", "Reação", "var(--color-react)"],
                  ["livre", "fa-feather", "Livre", "var(--color-livre)"],
                ] as const
              ).map(([slug, icone, titulo, cor]) => (
                <button
                  type="button"
                  key={slug}
                  className={`tipo-card ${form.tipo === slug ? "ativo" : ""}`}
                  style={{ "--tipo-cor": cor } as React.CSSProperties}
                  aria-pressed={form.tipo === slug}
                  onClick={() => setF("tipo", slug)}
                >
                  <i className={`fas ${icone} tipo-card-icone`} />
                  <span className="tipo-card-titulo">{titulo}</span>
                </button>
              ))}
            </div>

            <form onSubmit={salvar}>
              <label>Nome</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setF("nome", e.target.value)}
                placeholder="Ex: Soco Meteoro"
                autoFocus
              />

              {form.tipo === "react" && (
                <>
                  <label>Gatilho da reação</label>
                  <select value={form.gatilho} onChange={(e) => setF("gatilho", e.target.value as GatilhoReacao)}>
                    {GATILHOS_REACAO.map((g) => (
                      <option key={g.slug} value={g.slug}>
                        {g.texto}
                      </option>
                    ))}
                  </select>
                  <p className="campo-dica">
                    Em combate, quando o gatilho bate, a reação é oferecida antes de a ação valer. Efeitos que entram
                    sozinhos: bônus na CR (o ataque é comparado de novo), PV temporário (o dano sai dele primeiro),
                    Redução de Dano (aceita dado, como 2d12+NIVEL), Interceptar (com o gatilho de aliado) e Evasão.
                  </p>
                </>
              )}

              {form.origemForma && acoesPorId.has(form.origemForma) && (
                <>
                  <label>Forma alternativa</label>
                  <Segmentos
                    rotulo="Forma alternativa"
                    valor={form.formaDe}
                    onChange={(v) => setF("formaDe", v)}
                    opcoes={[
                      { valor: "", rotulo: "Não" },
                      {
                        valor: form.origemForma,
                        rotulo: `De ${acoesPorId.get(form.origemForma)!.nome}`,
                      },
                    ]}
                  />
                </>
              )}

              <SecaoModal titulo="Descrição" icone="fa-align-left" aberta resumo={form.tag || undefined}>
                <label>Descrição</label>
                <textarea
                  value={form.descricao}
                  onChange={(e) => setF("descricao", e.target.value)}
                  placeholder="Descreva o efeito..."
                />

                <label>Tag</label>
                <input
                  type="text"
                  value={form.tag}
                  onChange={(e) => setF("tag", e.target.value)}
                  placeholder="Ex: Cortante, Empurrão, Ignição"
                />
              </SecaoModal>

              <SecaoModal
                titulo="Técnica e duração"
                icone="fa-wand-magic-sparkles"
                aberta={form.tecnica || !!form.duracao}
                resumo={
                  [form.tecnica ? `Técnica${form.grau ? ` · ${form.grau}º grau` : ""}` : null, textoDuracao(form.duracao)]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
              >
                <label>Técnica</label>
                <div className="origem-pills">
                  {(
                    [
                      [false, "Não", "fa-hand-fist"],
                      [true, "Sim", "fa-wand-magic-sparkles"],
                    ] as const
                  ).map(([valor, rotulo, icone]) => (
                    <button
                      type="button"
                      key={rotulo}
                      className={`origem-pill ${form.tecnica === valor ? "ativo" : ""}`}
                      aria-pressed={form.tecnica === valor}
                      onClick={() => setF("tecnica", valor)}
                    >
                      <i className={`fas ${icone}`} /> {rotulo}
                    </button>
                  ))}
                </div>
                {form.tecnica && (
                  <>
                    <label>Grau</label>
                    <Segmentos
                      rotulo="Grau"
                      valor={form.grau}
                      onChange={(g) => setF("grau", g)}
                      opcoes={opcoesGrau}
                    />
                  </>
                )}

                <DuracaoCampo
                  valor={form.duracao}
                  onChange={(d) => setF("duracao", d)}
                  porTurno={porTurnoDe(form.efeitos)}
                  onPorTurno={(lista) => setF("efeitos", comPorTurno(form.efeitos, lista))}
                  recursos={recursos}
                  aCadaTurno="durando"
                />
              </SecaoModal>

              <SecaoModal
                titulo="De onde vem"
                icone="fa-link"
                aberta={form.habilidadeIds.length > 0 || !!form.itemId}
                resumo={
                  [
                    ...form.habilidadeIds.map((id) => opcoesHabilidade.find((o) => o.id === id)?.nome),
                    opcoesItem.find((o) => o.id === form.itemId)?.nome,
                  ]
                    .filter(Boolean)
                    .join(", ") || undefined
                }
              >
                <label>Habilidades</label>
                <SeletorMultiplo
                  opcoes={opcoesHabilidade}
                  marcados={form.habilidadeIds}
                  onChange={(ids) => setF("habilidadeIds", ids)}
                  rotulo="habilidade"
                  vazio="Nenhuma habilidade na ficha."
                />

                <label style={{ marginTop: 14 }}>Item</label>
                <SeletorUnico
                  opcoes={opcoesItem}
                  marcado={form.itemId}
                  onChange={(id) => setF("itemId", id)}
                  rotulo="item"
                  vazio="Nenhum item no inventário."
                />
              </SecaoModal>

              <SecaoModal
                titulo="Ataque"
                icone="fa-crosshairs"
                aberta={formTemAcerto}
                resumo={
                  formComArma
                    ? form.armaIds.map((id) => opcoesArma.find((o) => o.id === id)?.nome).filter(Boolean).join(", ")
                    : form.atributoAtaque
                      ? `Acerto ${SIGLA[(form.tecnica && cdPadrao ? cdPadrao : form.atributoAtaque) as Atributo]}`
                      : undefined
                }
              >
                <label>Armas</label>
                <SeletorMultiplo
                  opcoes={opcoesArma}
                  marcados={form.armaIds}
                  onChange={(ids) => setF("armaIds", ids)}
                  rotulo="arma"
                  vazio="Nenhuma arma no inventário."
                />

                {formComArma ? (
                  <p className="campo-dica">
                    {form.tecnica
                      ? "O acerto vem da arma. O dano é o da técnica, mais o bônus da arma."
                      : "O acerto e o dano vêm da arma; aqui vai só o que a ação soma."}
                  </p>
                ) : form.tecnica ? (
                  <>
                    <label>Jogada de ataque</label>
                    <Segmentos
                      rotulo="Jogada de ataque"
                      valor={form.atributoAtaque ? "sim" : "nao"}
                      onChange={(v) => setF("atributoAtaque", v === "sim" ? cdPadrao || "destreza" : "")}
                      opcoes={[
                        { valor: "nao", rotulo: "Não" },
                        { valor: "sim", rotulo: cdPadrao ? `Sim (${SIGLA[cdPadrao as Atributo]})` : "Sim" },
                      ]}
                    />
                    <p className="campo-dica">
                      {cdPadrao
                        ? "A técnica acerta com o atributo primário, o mesmo da CD."
                        : "A técnica acerta com o atributo primário: escolha a CD das suas técnicas na ficha lateral."}
                    </p>
                  </>
                ) : (
                  <div className="atrib-grade">
                    <span className="atrib-grade-rotulo">Acerto</span>
                    <Segmentos
                      rotulo="Acerto"
                      valor={form.atributoAtaque}
                      onChange={(v) => setF("atributoAtaque", v)}
                      opcoes={OPCOES_ATRIBUTO}
                    />
                  </div>
                )}

                {formTemAcerto && (
                  <CampoFormula
                    label="Adicional no acerto"
                    valor={form.bonusAcerto}
                    onChange={(v) => setF("bonusAcerto", v)}
                    placeholder="Ex: 2, PROF"
                  />
                )}

                {formTemAcerto && (
                  <>
                    <label>Recebe Multiataque</label>
                    <Segmentos
                      rotulo="Recebe Multiataque"
                      valor={form.multiataque ? "sim" : "nao"}
                      onChange={(v) => setF("multiataque", v === "sim")}
                      opcoes={[
                        { valor: "nao", rotulo: "Não" },
                        { valor: "sim", rotulo: "Sim" },
                      ]}
                    />
                    <p className="campo-dica">
                      O Multiataque da ficha (Ataque Extra, itens…) vale nesta ação. Marque nas ações em que você
                      ataca com ele, como Agredir.
                    </p>
                  </>
                )}
              </SecaoModal>

              {formTemDano ? (
                <SecaoModal
                  titulo={danoDaArma ? "Dano adicional" : "Dano"}
                  icone="fa-burst"
                  aberta
                  resumo={form.dano || undefined}
                >
                  <CampoFormula
                    label={danoDaArma ? "Adicional no dano" : "Dano"}
                    valor={form.dano}
                    onChange={(v) => setF("dano", v)}
                    placeholder={danoDaArma ? "Ex: 1d6 fogo" : "Ex: 2d6 fogo"}
                    dados
                    comGrau={form.tecnica}
                    grau={form.tecnica && form.grau > 0 ? form.grau : undefined}
                  />
                  {form.dano.trim() && (
                    <TipoDanoCampo valor={form.tipoDano} onChange={(t) => setF("tipoDano", t)} />
                  )}

                  {(form.dano.trim() || danoDaArma) && (
                    <div className="danos-extras">
                  {form.danosExtras.map((extra, i) => {
                    const mudar = (patch: Partial<DanoExtra>) =>
                      setF(
                        "danosExtras",
                        form.danosExtras.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                      );
                    return (
                      <div key={i} className="dano-extra">
                        <div className="dano-extra-topo">
                          <CampoFormula
                            label={`Dano ${i + 2}`}
                            valor={extra.formula}
                            onChange={(v) => mudar({ formula: v })}
                            placeholder="Ex: 1d4"
                            dados
                            comGrau={form.tecnica}
                            grau={form.tecnica && form.grau > 0 ? form.grau : undefined}
                          />
                          <button
                            type="button"
                            className="dano-extra-tirar"
                            aria-label={`Tirar o dano ${i + 2}`}
                            title="Tirar este dano"
                            onClick={() =>
                              setF(
                                "danosExtras",
                                form.danosExtras.filter((_, j) => j !== i),
                              )
                            }
                          >
                            <i className="fas fa-xmark" />
                          </button>
                        </div>
                        <TipoDanoCampo valor={extra.tipo} onChange={(t) => mudar({ tipo: t })} rotulo={`Tipo do dano ${i + 2}`} />
                      </div>
                    );
                  })}
                  {form.danosExtras.length < MAX_DANOS_EXTRAS && (
                    <button
                      type="button"
                      className="sugestao"
                      onClick={() => setF("danosExtras", [...form.danosExtras, { formula: "", tipo: "" }])}
                    >
                      <i className="fas fa-plus" /> Outro dano, de outro tipo
                    </button>
                  )}
                    </div>
                  )}
                </SecaoModal>
              ) : (
                <button type="button" className="sugestao secao-adicionar" onClick={() => setF("comDano", true)}>
                  <i className="fas fa-plus" /> {danoDaArma ? "Dano adicional" : "Dano"}
                </button>
              )}

              <SecaoModal
                titulo="Salvaguarda"
                icone="fa-shield-alt"
                aberta={!!form.atributoSalv}
                resumo={form.atributoSalv ? SIGLA[form.atributoSalv as Atributo] : undefined}
              >
                <div className="atrib-grade">
                  <span className="atrib-grade-rotulo">Atributo</span>
                  <Segmentos
                    rotulo="Salvaguarda"
                    valor={form.atributoSalv}
                    onChange={(v) => setF("atributoSalv", v)}
                    opcoes={OPCOES_ATRIBUTO}
                  />
                </div>

                {form.atributoSalv && (
                  <p className="campo-dica">
                    {cdPadrao
                      ? `A CD é a das suas técnicas (${SIGLA[cdPadrao as Atributo]}), definida na ficha lateral.`
                      : form.atributoCd
                        ? `A CD usa ${SIGLA[form.atributoCd as Atributo]}, como estava nesta ação. Escolha a CD das suas técnicas na ficha lateral pra valer em todas.`
                        : "Escolha a CD das suas técnicas na ficha lateral pra esta ação ter CD."}
                  </p>
                )}

                {form.atributoSalv && (
                  <div className="atrib-grade">
                    <span className="atrib-grade-rotulo">Quem passa</span>
                    <Segmentos
                      rotulo="Dano de quem passa na salvaguarda"
                      valor={form.salvSucesso}
                      onChange={(v) => setF("salvSucesso", v)}
                      opcoes={[
                        { valor: "nada", rotulo: "Não leva dano" },
                        { valor: "metade", rotulo: "Leva metade" },
                      ]}
                    />
                  </div>
                )}
              </SecaoModal>

              <SecaoModal
                titulo="Alcance e alvo"
                icone="fa-bullseye"
                aberta
                resumo={[form.alcance, ALVOS_ACAO.find((a) => a.slug === form.alvo)?.nome].filter(Boolean).join(" · ")}
              >
                <label>Alcance</label>
                <input
                  type="text"
                  value={form.alcance}
                  onChange={(e) => setF("alcance", e.target.value)}
                  placeholder="Ex: 9 m"
                />
                <Sugestoes>
                  {ALCANCES_RAPIDOS.map((a) => (
                    <button
                      type="button"
                      key={a}
                      className={`sugestao ${form.alcance === a ? "ativo" : ""}`}
                      aria-pressed={form.alcance === a}
                      onClick={() => setF("alcance", a)}
                    >
                      {a}
                    </button>
                  ))}
                  {/* Efeito de dano pode deixar a arma de fogo de fora (Letárgico). */}
                  <button
                    type="button"
                    className={`sugestao chip-opcao ${form.armaDeFogo ? "ativo" : ""}`}
                    aria-pressed={form.armaDeFogo}
                    onClick={() => setF("armaDeFogo", !form.armaDeFogo)}
                  >
                    <i className="fas fa-gun" /> Arma de fogo
                  </button>
                </Sugestoes>

                <label>Alvo do ataque</label>
                <Segmentos
                  rotulo="Alvo do ataque"
                  valor={form.alvo}
                  onChange={(v) => setF("alvo", v)}
                  opcoes={ALVOS_ACAO.map((a) => ({ valor: a.slug, rotulo: a.nome }))}
                />
                <p className="campo-dica">
                  {DICA_ALVO[form.alvo]} Cura, PV temporário e outros efeitos na hora escolhem em quem vão, cada
                  um na lista de efeitos.
                </p>
              </SecaoModal>

              <SecaoModal
                titulo="Custos"
                icone="fa-coins"
                aberta={!!(form.custoPp || form.custoRecursoId)}
                resumo={form.custoPp ? `${form.custoPp} PP` : undefined}
              >
                <CustosCampo
                  pp={form.custoPp}
                  onPp={(v) => setF("custoPp", v)}
                  recursos={recursos}
                  recursoId={form.custoRecursoId}
                  onRecursoId={(id) => setF("custoRecursoId", id)}
                  recursoValor={form.custoRecursoValor}
                  onRecursoValor={(v) => setF("custoRecursoValor", v)}
                  comGrau={form.tecnica}
                  grau={form.tecnica && form.grau > 0 ? form.grau : undefined}
                />
              </SecaoModal>

              <SecaoModal
                titulo="Usos limitados"
                icone="fa-bolt-lightning"
                aberta={!!(form.usos || form.recarga)}
                resumo={form.usos ? `Máx. ${form.usos}` : undefined}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                  <CampoFormula
                    label="Máximo"
                    valor={form.usos}
                    onChange={(v) => setF("usos", v)}
                    placeholder="3, PROF, NIVEL…"
                  />
                  <div>
                    <label>Recarga</label>
                    <select value={form.recarga} onChange={(e) => setF("recarga", e.target.value)}>
                      <option value="">—</option>
                      {RECARGAS_HABILIDADE.map((r) => (
                        <option key={r.slug} value={r.slug}>
                          {r.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </SecaoModal>

              <SecaoModal
                titulo={`Efeitos (${form.efeitos.filter((e) => e.tipo !== "por_turno").length})`}
                icone="fa-list-check"
                aberta={form.efeitos.some((e) => e.tipo !== "por_turno")}
              >
                <EfeitosDuramContext.Provider
                  value={efeitosDuram({ duracao: form.duracao })}
                >
                  <EfeitosEditor
                    efeitos={form.efeitos}
                    onChange={(efeitos) => setF("efeitos", efeitos)}
                    recursos={recursos}
                    pergunta="O que essa ação faz?"
                    presets={PRESETS_ACAO}
                  />
                </EfeitosDuramContext.Provider>
              </SecaoModal>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={fecharModal}
                >
                  Cancelar
                </button>
                <button type="submit" className="modal-btn-save">
                  Salvar
                </button>
              </div>
            </form>
            <DatalistAlvos />
          </div>
        </div>
      )}
    </div>
    </EfeitoDeAcaoContext.Provider>
    </FormulaContext.Provider>
    </NomesRecursoContext.Provider>
  );
}
