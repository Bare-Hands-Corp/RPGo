"use client";

import { Fragment, useMemo, useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { ehTemporario, exigir, idTemporario } from "@/lib/acoes";
import {
  adicionarDaPasta,
  atualizarAcao,
  criarAcao,
  deletarAcao,
  guardarNaPasta,
  usarAcao,
} from "./actions";
import { BarraFiltros, casaBusca, pastasDe } from "./barra-filtros";
import { useConfirmarUso } from "./usar-modal";
import { doModelo, type ModeloView } from "@/lib/pastas";
import { BotaoGuardar, BotaoPastas } from "./pastas";
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
  exaustaoQueConta,
  extrasDeCura,
  formatarMod,
  formulaResolvidaTexto,
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
  subirPassosDano,
  usosMaximos,
  type Atributo,
  type EfeitoHabilidade,
  type EfeitosAgregados,
} from "@/lib/op-rpg";
import { empilharD20, empilharRolagem, rolarCuras } from "@/lib/empilhar-rolagem";
import {
  ChipEfeito,
  DatalistAlvos,
  EfeitoDeAcaoContext,
  EfeitosEditor,
  FormulaContext,
  NomesRecursoContext,
  PassosProgressivos,
  StatsPorTurno,
  useContagemDoRolador,
} from "./efeitos-editor";
import { useExaustaoOtimista, usePpOtimista } from "./use-exaustao-otimista";
import { useEscolherAlvo } from "./escolher-alvo";
import type { Tripulante } from "./tripulacao-tab";
import { MarcaExausto } from "./marca-exausto";
import { TagChip } from "./estilo-cor-picker";
import { normalizarEfeitoCor, type EstiloCor } from "@/lib/estilos-cor";
import { SeletorMultiplo, SeletorUnico, type OpcaoVinculo } from "./seletor-multiplo";
import { DuracaoCampo, comPorTurno, porTurnoDe } from "./duracao-campo";
import { Segmentos, Sugestoes, TipoDanoCampo, type OpcaoSegmento } from "./campos-modal";
import { CustosCampo } from "./custos-campo";
import { CampoFormula } from "./campo-formula";
import { juntarTipos, mesmoTipo, tiposDoDano } from "@/lib/dano";
import { danoComMunicao, municaoDaArma, textoMunicao } from "@/lib/municao";
import { useGastoMunicao } from "./use-municao";
import {
  anunciarConcentracao,
  lerDuracao,
  pedeConcentracao,
  textoDuracao,
  turnosDaDuracao,
  type Duracao,
} from "@/lib/duracao";

// O modelo de Ação só guarda alcance como texto livre, então inferimos CC vs
// distância por palavra-chave / metragem pra montar o contexto da rolagem.
// Best-effort: o usuário pode trocar o chip de alcance no Rolador (etapa 3.3).
function inferirAlcance(alcance: string | null): "corpo_a_corpo" | "distancia" {
  if (!alcance) return "corpo_a_corpo";
  const t = alcance.toLowerCase();
  if (/corpo a corpo|adjacente|toque|melee/.test(t)) return "corpo_a_corpo";
  if (/dist|arremess|tiro|proj|longo|alcance/.test(t)) return "distancia";
  const num = t.match(/(\d+(?:[.,]\d+)?)\s*m/);
  if (num) return parseFloat(num[1].replace(",", ".")) >= 3 ? "distancia" : "corpo_a_corpo";
  return "corpo_a_corpo";
}

type Acao = {
  id: string;
  nome: string;
  descricao: string;
  tipo: string;
  tag: string | null;
  custoPp: number;
  custoPa: number;
  custoRecursoId: string | null;
  custoRecursoValor: number;
  atributoAtaque: string | null;
  atributoSalv: string | null;
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
  duracao?: unknown;
  pasta?: string | null;
  // Ação de que esta é forma alternativa.
  formaDe?: string | null;
  // Custo por fórmula; `custoPp` e `custoRecursoValor` já chegam resolvidos.
  custoPpFormula?: string | null;
  custoRecursoFormula?: string | null;
  // Usos limitados (null = ilimitado).
  usos?: number | null;
  usosAtual?: number | null;
  usosFormula?: string | null;
  recarga?: string | null;
};

type Filtro = "todas" | "tecnicas" | "sem_custo";

const FILTROS = [
  ["todas", "Todas"],
  ["tecnicas", "Técnicas"],
  ["sem_custo", "Sem custo"],
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
  efeitos: unknown;
  quantidade: number;
  municaoId?: string | null;
};

type Props = {
  personagemId: string;
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

const ALCANCES_RAPIDOS = ["Pessoal", "Toque", "1,5 m"];

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
  | { kind: "delete"; id: string };

type FormState = {
  id: string | null;
  nome: string;
  descricao: string;
  tipo: string;
  tag: string;
  custoPp: string;
  custoRecursoId: string;
  custoRecursoValor: string;
  atributoAtaque: string;
  atributoSalv: string;
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
  aliado: boolean;
  duracao: Duracao | null;
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
  tag: "",
  custoPp: "",
  custoRecursoId: "",
  custoRecursoValor: "",
  atributoAtaque: "",
  atributoSalv: "",
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
  aliado: false,
  duracao: null,
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
}: Props) {
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
  const uso = useConfirmarUso();
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  // Forma à mostra em cada card (id da ação de origem → id da forma).
  const [formaAtiva, setFormaAtiva] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();
  const atualizar = useRefreshAgrupado(0);

  // Formas alternativas ficam dentro do card da ação de origem.
  const acoesPorId = new Map(acoesOtimistas.map((a) => [a.id, a]));
  function origemDe(acao: Acao): Acao | undefined {
    let origem = acao.formaDe && acao.formaDe !== acao.id ? acoesPorId.get(acao.formaDe) : undefined;
    for (let i = 0; i < 5 && origem?.formaDe && acoesPorId.has(origem.formaDe); i++) {
      origem = acoesPorId.get(origem.formaDe);
    }
    return origem?.id === acao.id ? undefined : origem;
  }
  const formasDe = new Map<string, Acao[]>();
  for (const a of acoesOtimistas) {
    const origem = origemDe(a);
    if (origem) formasDe.set(origem.id, [...(formasDe.get(origem.id) ?? []), a]);
  }

  function abrirNova() {
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
      tag: acao.tag || "",
      custoPp: acao.custoPpFormula ?? (acao.custoPp ? String(acao.custoPp) : ""),
      custoRecursoId: acao.custoRecursoId || "",
      custoRecursoValor:
        acao.custoRecursoFormula ?? (acao.custoRecursoValor ? String(acao.custoRecursoValor) : ""),
      usos: acao.usosFormula ?? (acao.usos != null ? String(acao.usos) : ""),
      recarga: acao.recarga ?? "",
      atributoAtaque: acao.atributoAtaque || "",
      atributoSalv: acao.atributoSalv || "",
      atributoCd: acao.atributoCd || "",
      dano: acao.dano || "",
      tipoDano: acao.tipoDano || "",
      alcance: acao.alcance || "",
      armaIds: lerIds(acao.armaIds),
      itemId: acao.itemId || "",
      habilidadeIds: lerIds(acao.habilidadeIds),
      tecnica: acao.tecnica,
      grau: acao.grau,
      efeitos: lerEfeitos(acao.efeitos),
      aliado: acao.aliado,
      duracao: lerDuracao(acao.duracao),
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
      atributoAtaque: form.atributoAtaque || null,
      atributoSalv: form.atributoSalv || null,
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
      aliado: form.aliado,
      duracao: form.duracao,
      // Só vai quando o modal ofereceu a escolha.
      ...(form.origemForma ? { formaDe: form.formaDe || null } : {}),
    };

    const editandoId = form.id;
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
  async function usar(acao: Acao, custoPp: number, recurso: RecursoMinimo | undefined) {
    const instantaneos = lerEfeitos(acao.efeitos).filter(efeitoInstantaneo);
    const usosMax = usosMaximos(acao, ctxFormula);
    const usosAtual = acao.usosAtual ?? usosMax ?? 0;
    if (usosMax != null && usosAtual <= 0) {
      mostrarErro(new Error("Sem usos restantes."));
      return;
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
    const linhas = [
      sobrecarga ? `Sem PP: recebe <b>${acao.grau}</b> de exaustão.` : null,
      partes.length > 0 ? `Vai consumir: ${partes.join(", ")}.` : null,
      curas.length > 0 ? `Cura: <b>${curas.join(" + ")}</b>.` : null,
      concentra ? "Passa a concentrar nela." : null,
    ].filter((l): l is string => !!l);

    // Em aliado: escolher quem já confirma.
    let alvoId: string | undefined;
    if (acao.aliado && instantaneos.length > 0) {
      if (!alvo.temAliados) {
        mostrarErro(new Error("Nenhum aliado na mesa."));
        return;
      }
      const escolhido = await alvo.escolher(
        `${sobrecarga ? "Sobrecarga: " : ""}${acao.nome} em quem?`,
        { detalhe: linhas.map((l) => l.replace(/<\/?b>/g, "")).join(" ") },
      );
      if (!escolhido) return;
      alvoId = escolhido;
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
            ],
            faz: [...curas.map((c) => `Cura ${c}`), ...(concentra ? ["Concentração"] : [])],
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
    const deltas = computarDeltasInstantaneos(instantaneos, {
      incluirMax: false,
      rolagens,
      ctx: efeitosAgregados.ctxFormula ? { ...efeitosAgregados.ctxFormula, grau: acao.grau } : null,
    });
    const noAliado = !!alvoId;
    const deltaPersonagem = {
      deltaHpAtual: (!noAliado && deltas.hpAtual) || undefined,
      concedeHpTemp: (!noAliado && deltas.hpTemp) || undefined,
      deltaPpAtual: (noAliado ? 0 : deltas.ppAtual) - pp || undefined,
      deltaExaustao: (sobrecarga ? acao.grau : 0) + (noAliado ? 0 : deltas.exaustao) || undefined,
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
    }
    startTransition(async () => {
      if (usosMax != null) {
        aplicarPatch({ kind: "update", id: acao.id, patch: { usosAtual: usosAtual - 1 } });
      }
      try {
        exigir(await usarAcao(personagemId, acao.id, rolagens, { sobrecarga, alvoId }));
        publicar();
      } catch (err) {
        // Recarrega a página pra desfazer o otimismo.
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
  function guardarEmPasta(acao: Acao, pasta: string | null) {
    startTransition(async () => {
      aplicarPatch({ kind: "update", id: acao.id, patch: { pasta } });
      try {
        if (pasta) exigir(await guardarNaPasta(personagemId, "acao", acao.id, pasta));
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
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
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
    (filtro !== "tecnicas" || a.tecnica) &&
    (filtro !== "sem_custo" ||
      (a.custoPp === 0 && a.custoPa === 0 && (!a.custoRecursoId || a.custoRecursoValor === 0))) &&
    (!pastaAtiva || a.pasta === pastaAtiva) &&
    casaBusca(busca, [a.nome, a.descricao, a.tag, a.pasta, a.dano, a.tipoDano, a.tecnica ? "técnica" : null]);
  // Um card por ação de origem; aparece se ela ou uma forma dela casar.
  const visiveis = acoesOtimistas.filter(
    (a) => !origemDe(a) && [a, ...(formasDe.get(a.id) ?? [])].some(casaFiltros),
  );
  const filtrando = filtro !== "todas" || !!pastaAtiva || busca.trim() !== "";

  return (
    <NomesRecursoContext.Provider value={new Map(recursos.map((r) => [r.id, r.nome]))}>
    <FormulaContext.Provider value={ctxFormula}>
    <EfeitoDeAcaoContext.Provider value>
    <div>
      <div className="tab-topo">
        <h1>Ações de Combate</h1>
        <div className="tab-topo-botoes">
          <BotaoPastas tipo="acao" onAdicionar={adicionarDasPastas} />
          <button
            type="button"
            className="btn-rect primary"
            onClick={abrirNova}
          >
            + Nova Ação
          </button>
        </div>
      </div>

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
      />

      {GRUPOS.map((grupo) => {
        const lista = visiveis.filter((a) => a.tipo === grupo.tipo);
        if (filtrando && lista.length === 0) return null;
        return (
          <section key={grupo.tipo}>
            <div className="section-header">
              <i className={`fas ${grupo.icone}`} style={{ color: grupo.cor }} />
              <h3>{grupo.titulo}</h3>
            </div>
            {lista.length > 0 ? (
              <div className="action-grid">
                {lista.map((origem) => {
                  const formas = [origem, ...(formasDe.get(origem.id) ?? [])];
                  // A forma escolhida; filtrando, a primeira que casa.
                  const acao =
                    formas.find((f) => f.id === formaAtiva[origem.id]) ??
                    (filtrando ? formas.find(casaFiltros) : undefined) ??
                    origem;
                  const recursoCusto = recursos.find(
                    (r) => r.id === acao.custoRecursoId,
                  );
                  const atributoAtq = acao.atributoAtaque as Atributo | null;
                  const atributoCd = acao.atributoCd as Atributo | null;
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
                  const aggDaArma = (arma: ItemArma) => efeitosDaTecnica(efeitosDa(arma), acao);
                  // Um acerto e um dano por arma equipada.
                  const golpes = armasEquipadas.map((arma) => {
                    const atq = resolverAtaqueArma({
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
                        }) + extraAtaqueSemArma.valor
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
                  const fontesAtaque = ataqueArma ? ataqueArma.fontes : extraAtaqueSemArma.fontes;
                  // Dano da técnica + dano bônus e proficiência da arma + bônus de habilidade.
                  const comporDano = (arma: ItemArma | null) => {
                    const agg = arma ? aggDaArma(arma) : aggAcao;
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
                  const podeUsar =
                    ppFinal > 0 ||
                    !!recursoGasto ||
                    usosMax != null ||
                    efeitosAcao.some(efeitoInstantaneo) ||
                    pedeConcentracao(acao.duracao);
                  const duracaoTexto = textoDuracao(lerDuracao(acao.duracao));
                  const temPorTurno = efeitosAcao.some((e) => e.tipo === "por_turno");
                  const chipsAcao = efeitosAcao.filter((e) => e.tipo !== "por_turno");
                  // Tipo escolhido que o texto do dano ainda não diz.
                  const tipoNoChip =
                    acao.tipoDano && !tiposDoDano(acao.dano ?? "").some((t) => mesmoTipo(t, acao.tipoDano!))
                      ? ` ${acao.tipoDano.toLowerCase()}`
                      : "";
                  const origens = [...habsDerivadas.map((h) => h.nome), ...(itemOrigem ? [itemOrigem.nome] : [])];
                  return (
                    <div
                      key={origem.id}
                      className={`action-card com-copia type-${acao.tipo}${travada ? " hab-travada" : ""}${
                        ehTemporario(acao.id) ? " item-pendente" : ""
                      }`}
                      inert={ehTemporario(acao.id)}
                    >
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
                        pastasDaFicha={nomesDasPastas}
                        sugestoes={[...habsDerivadas.map((h) => h.nome), ...(acao.tag ? [acao.tag] : [])]}
                        onGuardar={(p) => guardarEmPasta(acao, p)}
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
                            <StatsPorTurno
                              efeitos={efeitosAcao}
                              grau={acao.tecnica && acao.grau > 0 ? acao.grau : undefined}
                            />
                            {usosMax != null && (
                              <span
                                className="acao-stat"
                                title={acao.usosFormula ? `Máximo: ${acao.usosFormula}` : undefined}
                              >
                                <i className="fas fa-bolt-lightning" /> {usosAtual}/{usosMax}
                              </span>
                            )}
                            {usosMax != null && acao.recarga && (
                              <span className="acao-stat">
                                <i className="fas fa-rotate" />{" "}
                                {RECARGAS_HABILIDADE.find((r) => r.slug === acao.recarga)?.nome ??
                                  acao.recarga}
                              </span>
                            )}
                            {acao.aliado && (
                              <span className="acao-stat acao-aliado">
                                <i className="fas fa-hand-holding-heart" /> Em aliado
                              </span>
                            )}
                            {/* Um chip de acerto por arma equipada; sem arma, o cálculo da técnica. */}
                            {golpes.length > 0
                              ? golpes.map(({ arma, atq, municao, semMunicao }) =>
                                  atq ? (
                                    <button
                                      key={arma.id}
                                      type="button"
                                      disabled={travada || semMunicao}
                                      className={`acao-stat acao-rolar ${penD20 > 0 || (atq.atributo === "destreza" && desReduz) ? "valor-exausto" : ""}`}
                                      title={`${semMunicao ? textoMunicao(municao) : `Empilhar ataque com ${arma.nome}`}${
                                        atq.fontes.length
                                          ? ` · inclui bônus de ${atq.fontes.join(", ")}`
                                          : ""
                                      }${penD20 ? ` · −${penD20} de exaustão` : ""}${
                                        municao.item && !semMunicao ? ` · ${textoMunicao(municao)}` : ""
                                      }`}
                                      onClick={() =>
                                        empilharD20(
                                          atq.bonus - penD20,
                                          `Atacar ${acao.nome} (${arma.nome})`,
                                          {
                                            tipo: "ataque",
                                            alcance: atq.alcance,
                                            tecnica: acao.tecnica,
                                            ...(municao.item
                                              ? { municao: { id: municao.item.id, nome: municao.item.nome } }
                                              : {}),
                                          },
                                          efeitosDoContexto(aggDaArma(arma)),
                                        )
                                      }
                                    >
                                      <i className="fas fa-crosshairs" /> {arma.nome}{" "}
                                      <strong>{formatarMod(atq.bonus - penD20)}</strong>
                                      {atq.fontes.length > 0 && <i className="fas fa-link prof-fonte" />}
                                      {penD20 > 0 && <MarcaExausto titulo={`−${penD20} de exaustão`} />}
                                    </button>
                                  ) : null,
                                )
                              : bonusAtq != null && (
                                  <button
                                    type="button"
                                    disabled={travada}
                                    className={`acao-stat acao-rolar ${penD20 > 0 || desReduzAtq ? "valor-exausto" : ""}`}
                                    title={`Empilhar ataque no Rolador${
                                      fontesAtaque.length
                                        ? ` · inclui bônus de ${fontesAtaque.join(", ")}`
                                        : ""
                                    }${desReduzAtq ? ` · −${Math.abs(penalidadeDesArmadura)} de DES (armadura)` : ""}${penD20 ? ` · −${penD20} de exaustão` : ""}`}
                                    onClick={() =>
                                      empilharD20(
                                        bonusAtq - penD20,
                                        `Atacar ${acao.nome}`,
                                        { tipo: "ataque", alcance: alcanceContexto, tecnica: acao.tecnica },
                                        efeitosDoContexto(aggAcao),
                                      )
                                    }
                                  >
                                    <i className="fas fa-crosshairs" /> Acerto{" "}
                                    <strong>{formatarMod(bonusAtq - penD20)}</strong>
                                    {fontesAtaque.length > 0 && <i className="fas fa-link prof-fonte" />}
                                    {penD20 > 0 && <MarcaExausto titulo={`−${penD20} de exaustão`} />}
                                  </button>
                                )}
                            {danos.map(({ rotulo, d, efeitos, tiposDano }, i) => {
                              if (!d) return null;
                              const titulo = d.partes
                                .map((x) => `${x.rotulo}: ${x.texto}`)
                                .join(" · ");
                              const miolo = (
                                <>
                                  <i className="fas fa-burst" />{" "}
                                  {rotulo ? `${rotulo}: ` : ""}
                                  {d.formula}
                                  {tipoNoChip}
                                  {d.partes.length > 1 && <i className="fas fa-link prof-fonte" />}
                                </>
                              );
                              return d.rolavel && !travada ? (
                                <button
                                  key={`d${i}`}
                                  type="button"
                                  className="acao-stat acao-rolar"
                                  title={`Empilhar dano no Rolador · ${titulo}`}
                                  onClick={() =>
                                    empilharRolagem({
                                      dados: d.dados,
                                      modificador: d.modificador,
                                      nomePreset: `Dano ${acao.nome}${rotulo ? ` (${rotulo})` : ""}`,
                                      // Contexto de dano pros efeitos de dano do Rolador.
                                      contexto: {
                                        tipo: "dano",
                                        alcance: alcanceContexto,
                                        tecnica: acao.tecnica,
                                        grau: acao.grau,
                                        tiposDano,
                                      },
                                      efeitos,
                                    })
                                  }
                                >
                                  {miolo}
                                </button>
                              ) : (
                                <span key={`d${i}`} className="acao-stat" title={titulo || undefined}>
                                  {miolo}
                                </span>
                              );
                            })}
                            {cd != null && atributoSalv && (
                              <span
                                className="acao-stat"
                                title={
                                  fontesCd.length
                                    ? `${formatarMod(extraCd)} de ${fontesCd.join(", ")}`
                                    : undefined
                                }
                              >
                                <i className="fas fa-shield-alt" /> Salv {SIGLA[atributoSalv]} CD <strong>{cd}</strong>
                                {fontesCd.length > 0 && <i className="fas fa-link prof-fonte" />}
                              </span>
                            )}
                            {(acao.alcance || alcancesAcao.length > 0) && (
                              <span
                                className="acao-stat"
                                title={
                                  alcancesAcao.length
                                    ? `de ${[...new Set(alcancesAcao.map((a) => a.fonte))].join(", ")}`
                                    : undefined
                                }
                              >
                                <i className="fas fa-ruler-horizontal" /> {alcanceVira ?? acao.alcance}
                                {alcanceSoma !== 0 ? ` ${formatarMod(alcanceSoma)} m` : ""}
                                {alcancesAcao.length > 0 && <i className="fas fa-link prof-fonte" />}
                              </span>
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
                        <div className="card-desc">{acao.descricao}</div>
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
                              disabled={travada || (usosMax != null && usosAtual <= 0)}
                              title={usosMax != null && usosAtual <= 0 ? "Sem usos" : undefined}
                              onClick={() => usar(acao, ppFinal, recursoGasto)}
                            >
                              <i className="fas fa-play" /> Usar
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
                                  <span
                                    className={`acao-deriva-nome${a.equipado ? "" : " fora"}`}
                                    title={a.equipado ? undefined : "Não equipada"}
                                  >
                                    {a.nome}
                                    {a.danoBonus && a.equipado ? ` ${comSinal(a.danoBonus)}` : ""}
                                  </span>
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
          </section>
        );
      })}

      {filtrando && visiveis.length === 0 && <p className="filtros-vazio">Nada encontrado.</p>}

      {alvo.modal}
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
                aCadaTurno="concentrando"
              />

              <h3 className="modal-secao">
                <i className="fas fa-link" /> De onde vem
              </h3>

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

              <h3 className="modal-secao">
                <i className="fas fa-khanda" /> Usa
              </h3>

              <label>Armas</label>
              <SeletorMultiplo
                opcoes={opcoesArma}
                marcados={form.armaIds}
                onChange={(ids) => setF("armaIds", ids)}
                rotulo="arma"
                vazio="Nenhuma arma no inventário."
              />

              <h3 className="modal-secao">
                <i className="fas fa-gears" /> Números
              </h3>
              <div className="numeros-linha">
                <CampoFormula
                  label="Dano"
                  valor={form.dano}
                  onChange={(v) => setF("dano", v)}
                  placeholder="Ex: 2d6 fogo"
                  dados
                  comGrau={form.tecnica}
                  grau={form.tecnica && form.grau > 0 ? form.grau : undefined}
                />
                <div>
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
                  </Sugestoes>
                </div>
              </div>
              {form.dano.trim() && (
                <TipoDanoCampo valor={form.tipoDano} onChange={(t) => setF("tipoDano", t)} />
              )}

              <div className="atrib-grade">
                {(
                  [
                    ["atributoAtaque", "Acerto"],
                    ["atributoSalv", "Salvaguarda"],
                    ["atributoCd", "CD"],
                  ] as const
                ).map(([campo, rotulo]) => (
                  <Fragment key={campo}>
                    <span className="atrib-grade-rotulo">{rotulo}</span>
                    <Segmentos
                      rotulo={rotulo}
                      valor={form[campo]}
                      onChange={(v) => setF(campo, v)}
                      opcoes={OPCOES_ATRIBUTO}
                    />
                  </Fragment>
                ))}
              </div>

              <details
                className="modal-secao-detalhe"
                open={!!(form.custoPp || form.custoRecursoId)}
              >
                <summary><i className="fas fa-coins" /> Custos</summary>
                <div className="modal-secao-corpo">
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
                </div>
              </details>

              <details className="modal-secao-detalhe" open={!!(form.usos || form.recarga)}>
                <summary>
                  <i className="fas fa-bolt-lightning" /> Usos limitados
                </summary>
                <div className="modal-secao-corpo">
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
                </div>
              </details>

              <details
                className="modal-secao-detalhe"
                open={form.efeitos.some((e) => e.tipo !== "por_turno")}
              >
                <summary>
                  <i className="fas fa-list-check" /> Efeitos (
                  {form.efeitos.filter((e) => e.tipo !== "por_turno").length})
                </summary>
                <div className="modal-secao-corpo">
                  <label>Efeitos na hora em</label>
                  <div className="origem-pills" style={{ marginBottom: 10 }}>
                    {(
                      [
                        [false, "Você", "fa-user"],
                        [true, "Aliado", "fa-hand-holding-heart"],
                      ] as const
                    ).map(([valor, rotulo, icone]) => (
                      <button
                        type="button"
                        key={rotulo}
                        className={`origem-pill ${form.aliado === valor ? "ativo" : ""}`}
                        aria-pressed={form.aliado === valor}
                        onClick={() => setF("aliado", valor)}
                      >
                        <i className={`fas ${icone}`} /> {rotulo}
                      </button>
                    ))}
                  </div>
                  <EfeitosEditor
                    efeitos={form.efeitos}
                    onChange={(efeitos) => setF("efeitos", efeitos)}
                    recursos={recursos}
                    pergunta="O que essa ação faz?"
                    presets={PRESETS_ACAO}
                  />
                </div>
              </details>

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
