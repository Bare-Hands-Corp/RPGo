"use client";

import { Fragment, useMemo, useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { ehTemporario, exigir, idTemporario } from "@/lib/acoes";
import { atualizarAcao, criarAcao, deletarAcao, usarAcao } from "./actions";
import { useRefreshAgrupado } from "@/lib/use-refresh-agrupado";
import {
  ATRIBUTOS,
  bonusAtaqueTecnica,
  bonusDeAtaque,
  bonusProficiencia,
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
  maiorDado,
  motivoSemSobrecarga,
  NIVEL_DO_GRAU,
  penalidadeD20Exaustao,
  poolsEfetivos,
  resolverAtaqueArma,
  resolverDanoArma,
  resolverFormula,
  subirPassosDano,
  type Atributo,
  type EfeitoHabilidade,
  type EfeitosAgregados,
} from "@/lib/op-rpg";
import { empilharD20, empilharRolagem, rolarCuras } from "@/lib/empilhar-rolagem";
import {
  ChipEfeito,
  DatalistAlvos,
  EfeitosEditor,
  FormulaContext,
  NomesRecursoContext,
} from "./efeitos-editor";
import { useExaustaoOtimista, usePpOtimista } from "./use-exaustao-otimista";
import { useEscolherAlvo } from "./escolher-alvo";
import type { Tripulante } from "./tripulacao-tab";
import { MarcaExausto } from "./marca-exausto";
import { TagChip } from "./estilo-cor-picker";
import { normalizarEfeitoCor, type EstiloCor } from "@/lib/estilos-cor";
import { SeletorMultiplo, SeletorUnico, type OpcaoVinculo } from "./seletor-multiplo";
import { DuracaoCampo } from "./duracao-campo";
import { Segmentos, type OpcaoSegmento } from "./campos-modal";
import { CustosCampo } from "./custos-campo";
import { CampoFormula } from "./campo-formula";
import { juntarTipos, tiposDoDano } from "@/lib/dano";
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
  alcance: string | null;
  armaIds: unknown;
  itemId: string | null;
  habilidadeIds: unknown;
  tecnica: boolean;
  grau: number;
  efeitos: unknown;
  aliado: boolean;
  duracao?: unknown;
};

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
  alcance: string;
  armaIds: string[];
  itemId: string;
  habilidadeIds: string[];
  tecnica: boolean;
  grau: number;
  efeitos: EfeitoHabilidade[];
  aliado: boolean;
  duracao: Duracao | null;
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
  alcance: "",
  armaIds: [],
  itemId: "",
  habilidadeIds: [],
  tecnica: false,
  grau: 0,
  efeitos: [],
  aliado: false,
  duracao: null,
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
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [, startTransition] = useTransition();
  const atualizar = useRefreshAgrupado(0);

  function abrirNova() {
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdit(acao: Acao) {
    setForm({
      id: acao.id,
      nome: acao.nome,
      descricao: acao.descricao,
      tipo: acao.tipo,
      tag: acao.tag || "",
      custoPp: acao.custoPp ? String(acao.custoPp) : "",
      custoRecursoId: acao.custoRecursoId || "",
      custoRecursoValor: acao.custoRecursoValor ? String(acao.custoRecursoValor) : "",
      atributoAtaque: acao.atributoAtaque || "",
      atributoSalv: acao.atributoSalv || "",
      atributoCd: acao.atributoCd || "",
      dano: acao.dano || "",
      alcance: acao.alcance || "",
      armaIds: lerIds(acao.armaIds),
      itemId: acao.itemId || "",
      habilidadeIds: lerIds(acao.habilidadeIds),
      tecnica: acao.tecnica,
      grau: acao.grau,
      efeitos: lerEfeitos(acao.efeitos),
      aliado: acao.aliado,
      duracao: lerDuracao(acao.duracao),
    });
    setModalAberto(true);
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

    const dados = {
      nome: nomeLimpo,
      descricao: form.descricao,
      tipo: form.tipo,
      tag: form.tag,
      custoPp: Number(form.custoPp) || 0,
      custoRecursoId: form.custoRecursoId || null,
      custoRecursoValor: Number(form.custoRecursoValor) || 0,
      atributoAtaque: form.atributoAtaque || null,
      atributoSalv: form.atributoSalv || null,
      atributoCd: form.atributoCd || null,
      dano: form.dano || null,
      alcance: form.alcance || null,
      armaIds: form.armaIds,
      itemId: form.itemId || null,
      habilidadeIds: form.habilidadeIds,
      tecnica: form.tecnica,
      grau: form.tecnica ? form.grau : 0,
      efeitos: form.efeitos,
      aliado: form.aliado,
      duracao: form.duracao,
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
      const c = await Swal.fire({
        title: sobrecarga ? `${acao.nome} com Sobrecarga?` : `Usar ${acao.nome}?`,
        html: linhas.join("<br>"),
        icon: "question",
        showCancelButton: true,
        confirmButtonText: sobrecarga ? "Sobrecarga" : "Usar",
        cancelButtonText: "Cancelar",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      if (!c.isConfirmed) return;
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

  return (
    <NomesRecursoContext.Provider value={new Map(recursos.map((r) => [r.id, r.nome]))}>
    <FormulaContext.Provider value={ctxFormula}>
    <div>
      <div className="tab-topo">
        <h1>Ações de Combate</h1>
        <button
          type="button"
          className="btn-rect primary"
          onClick={abrirNova}
        >
          + Nova Ação
        </button>
      </div>

      {GRUPOS.map((grupo) => {
        const lista = acoesOtimistas.filter((a) => a.tipo === grupo.tipo);
        return (
          <section key={grupo.tipo}>
            <div className="section-header">
              <i className={`fas ${grupo.icone}`} style={{ color: grupo.cor }} />
              <h3>{grupo.titulo}</h3>
            </div>
            {lista.length > 0 ? (
              <div className="action-grid">
                {lista.map((acao) => {
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
                          // Passos de técnica só valem em técnica.
                          passos: acao.tecnica ? agg.passosDanoTecnica.valor : 0,
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
                  const podeUsar =
                    ppFinal > 0 ||
                    !!recursoGasto ||
                    efeitosAcao.some(efeitoInstantaneo) ||
                    pedeConcentracao(acao.duracao);
                  const duracaoTexto = textoDuracao(lerDuracao(acao.duracao));
                  return (
                    <div
                      key={acao.id}
                      className={`action-card type-${acao.tipo}${travadaPorItem ? " hab-travada" : ""}${
                        ehTemporario(acao.id) ? " item-pendente" : ""
                      }`}
                      inert={ehTemporario(acao.id)}
                    >
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
                        {(bonusAtq != null || cd != null || atributoSalv || acao.dano || acao.alcance || armasDaAcao.length > 0 || acao.itemId || acao.tecnica || duracaoTexto) && (
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
                                      disabled={travadaPorItem || semMunicao}
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
                                    disabled={travadaPorItem}
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
                                  {d.partes.length > 1 && <i className="fas fa-link prof-fonte" />}
                                </>
                              );
                              return d.rolavel && !travadaPorItem ? (
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
                            {acao.alcance && (
                              <span className="acao-stat"><i className="fas fa-ruler-horizontal" /> {acao.alcance}</span>
                            )}
                            {itemOrigem && (
                              <span
                                className="acao-stat"
                                style={travadaPorItem ? { color: "var(--text-sec)" } : undefined}
                                title={
                                  travadaPorItem
                                    ? "Vem de um item que não está equipado"
                                    : "Vem deste item"
                                }
                              >
                                <i className={`fas ${travadaPorItem ? "fa-lock" : "fa-sack-dollar"}`} />{" "}
                                {itemOrigem.nome}
                              </span>
                            )}
                            {armasDaAcao.map((a) => (
                              <span
                                key={a.id}
                                className="acao-stat"
                                style={a.equipado ? undefined : { color: "var(--text-sec)" }}
                                title={
                                  a.equipado
                                    ? "Arma desta ação"
                                    : "Arma não equipada"
                                }
                              >
                                <i className={`fas ${a.equipado ? "fa-khanda" : "fa-link-slash"}`} />{" "}
                                {a.nome}
                                {a.danoBonus && a.equipado ? ` ${comSinal(a.danoBonus)}` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                        {travadaPorItem && (
                          <div className="hab-travada-nota">
                            <i className="fas fa-lock" /> vem de{" "}
                            {itemOrigem?.nome ?? "um item"} — equipe o item pra usar
                          </div>
                        )}
                        {efeitosAcao.length > 0 && (
                          <div className="efeito-chips">
                            {efeitosAcao.map((e, i) => (
                              <ChipEfeito
                                key={i}
                                efeito={e}
                                grau={acao.tecnica && acao.grau > 0 ? acao.grau : undefined}
                              />
                            ))}
                          </div>
                        )}
                        <div className="card-desc">{acao.descricao}</div>
                      </div>
                      {(custos.length > 0 || podeUsar || acao.tag || habsDerivadas.length > 0) && (
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
                              disabled={travadaPorItem}
                              onClick={() => usar(acao, ppFinal, recursoGasto)}
                            >
                              <i className="fas fa-play" /> Usar
                            </button>
                          )}
                          {acao.tag && (
                            <span className="tag tag-damage">{acao.tag}</span>
                          )}
                          {habsDerivadas.length > 0 && (
                            <span className="acao-deriva">
                              Vem de{" "}
                              {habsDerivadas.map((h, i) => (
                                <span key={h.id}>
                                  {i > 0 && ", "}
                                  <span className="acao-deriva-nome">{h.nome}</span>
                                </span>
                              ))}
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

      {alvo.modal}

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

              <DuracaoCampo valor={form.duracao} onChange={(d) => setF("duracao", d)} />

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

              <label style={{ marginTop: 14 }}>Armas</label>
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
                  <div className="sugestoes">
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
                  </div>
                </div>
              </div>

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
                  />
                </div>
              </details>

              <details className="modal-secao-detalhe" open={form.efeitos.length > 0}>
                <summary>
                  <i className="fas fa-list-check" /> Efeitos ({form.efeitos.length})
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
    </FormulaContext.Provider>
    </NomesRecursoContext.Provider>
  );
}
