"use client";

import { useEffect, useEffectEvent, useMemo, useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { ehTemporario, exigir, idTemporario } from "@/lib/acoes";
import { useRefreshAgrupado } from "@/lib/use-refresh-agrupado";
import {
  adicionarDaPasta,
  alternarHabilidade,
  atualizarHabilidade,
  criarHabilidade,
  deletarHabilidade,
  guardarNaPasta,
  usarHabilidade,
} from "./actions";
import {
  ORIGENS_HABILIDADE,
  RECARGAS_HABILIDADE,
  TIPOS_HABILIDADE,
  alvoDaCura,
  alvosPericiaCustom,
  computarDeltasInstantaneos,
  curasComFormula,
  extrasDeCura,
  formatarMod,
  formulaResolvidaTexto,
  lerEfeitos,
  resolverFormula,
  temEfeitoSustentado,
  lerNumeroOuFormula,
  usosMaximos,
  valorDaFormula,
  type Atributo,
  type EfeitoHabilidade,
  type EfeitosAgregados,
  type OrigemHabilidade,
  type TipoHabilidade,
} from "@/lib/op-rpg";
import { SeletorUnico } from "./seletor-multiplo";
import { doModelo, type ModeloView } from "@/lib/pastas";
import { agruparFormas } from "@/lib/formas";
import { BotaoGuardar, BotaoPastas } from "./pastas";
import { BotaoPacotes, EVENTO_IMPORTADO, type Importado } from "./pacotes";
import { BarraFiltros, casaBusca, pastasDe } from "./barra-filtros";
import { useConfirmarUso, type ItemDeUso } from "./usar-modal";
import { Segmentos } from "./campos-modal";
import {
  AlvosCustomContext,
  ChipEfeito,
  FormulaContext,
  NomesRecursoContext,
  DatalistAlvos,
  EfeitosEditor,
  PassosProgressivos,
  StatsPorTurno,
  useContagemDoRolador,
  type RecursoMinimo,
} from "./efeitos-editor";
import type { Dado } from "@/lib/dice";
import { empilharRolagem, rolarCuras } from "@/lib/empilhar-rolagem";
import { TagChip, TagsEditor } from "./estilo-cor-picker";
import { useEscolherAlvo } from "./escolher-alvo";
import { ACadaTurnoCampo, DuracaoCampo, comPorTurno, porTurnoDe } from "./duracao-campo";
import { CustosCampo } from "./custos-campo";
import { CampoFormula } from "./campo-formula";
import {
  anunciarConcentracao,
  lerDuracao,
  pedeConcentracao,
  textoDuracao,
  textoTurnosRestantes,
  turnosDaDuracao,
  type Duracao,
} from "@/lib/duracao";
import { EVENTO_TURNOS } from "@/lib/turno";
import type { Tripulante } from "./tripulacao-tab";
import {
  lerEstilosTag,
  podarEstilosTag,
  separarTags,
  type MapaEstilosTag,
} from "@/lib/estilos-cor";

type Habilidade = {
  id: string;
  nome: string;
  origem: string;
  tipo: string;
  descricao: string;
  custoPp: number;
  custoPa: number;
  custoRecursoId: string | null;
  custoRecursoValor: number;
  // Custo por fórmula; os números acima já chegam resolvidos.
  custoPpFormula?: string | null;
  custoRecursoFormula?: string | null;
  usos: number | null;
  usosAtual: number | null;
  recarga: string | null;
  tags: string | null;
  tagsEstilo: unknown;
  favorita: boolean;
  ordem: number;
  efeitos: unknown;
  ligada: boolean;
  itemId: string | null;
  itemUsa?: boolean;
  pasta?: string | null;
  alternavel: boolean;
  usosFormula: string | null;
  aliado: boolean;
  alvoPersonagemId: string | null;
  duracao?: unknown;
  turnosRestantes?: number | null;
  // Habilidade de que esta é forma alternativa.
  formaDe?: string | null;
};

// Item que pode conceder habilidade.
type ItemRef = { id: string; nome: string; equipado: boolean };

type Props = {
  personagemId: string;
  habilidades: Habilidade[];
  recursos: RecursoMinimo[];
  atributos: Record<Atributo, number>;
  nivel: number;
  periciasCustom: { slug: string; nome: string }[];
  /** IDs de habilidade presas a um nó de árvore ainda não liberado. */
  travadas?: string[];
  /** Itens do personagem. */
  itens: ItemRef[];
  /** Personagens da mesa (inclui o próprio). */
  tripulantes: Tripulante[];
  /** Agregado da ficha (dado a mais na cura). */
  efeitosAgregados: EfeitosAgregados;
  /** Graus das técnicas do personagem (GRAU nos chips). */
  grausTecnicas: number[];
};

type Patch =
  | { kind: "create"; habilidade: Habilidade }
  | { kind: "update"; id: string; patch: Partial<Habilidade> }
  | { kind: "delete"; id: string }
  | { kind: "usar"; id: string; vezes?: number };

function aplicarPatch(state: Habilidade[], p: Patch): Habilidade[] {
  if (p.kind === "create") return [...state, p.habilidade];
  if (p.kind === "update")
    return state.map((h) => (h.id === p.id ? { ...h, ...p.patch } : h));
  if (p.kind === "delete") return state.filter((h) => h.id !== p.id);
  return state.map((h) =>
    h.id === p.id && h.usosAtual != null
      ? { ...h, usosAtual: Math.max(0, h.usosAtual - (p.vezes ?? 1)) }
      : h,
  );
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

type Filtro = "todas" | "disponiveis" | "sem_custo";

const FILTROS = [
  ["todas", "Todas"],
  ["disponiveis", "Disponíveis"],
  ["sem_custo", "Sem custo"],
] as const;

// Habilidade recém-trazida de uma pasta, antes do servidor responder.
const HABILIDADE_BASE: Omit<Habilidade, "id"> = {
  nome: "",
  origem: "livre",
  tipo: "passiva",
  descricao: "",
  custoPp: 0,
  custoPa: 0,
  custoRecursoId: null,
  custoRecursoValor: 0,
  usos: null,
  usosAtual: null,
  recarga: null,
  tags: null,
  tagsEstilo: null,
  favorita: false,
  ordem: 0,
  efeitos: [],
  ligada: false,
  itemId: null,
  itemUsa: false,
  pasta: null,
  alternavel: false,
  usosFormula: null,
  aliado: false,
  alvoPersonagemId: null,
  duracao: null,
  formaDe: null,
};

export function HabilidadesTab({
  personagemId,
  habilidades,
  recursos,
  atributos,
  nivel,
  periciasCustom,
  travadas = [],
  itens,
  tripulantes,
  efeitosAgregados,
  grausTecnicas,
}: Props) {
  const travadasSet = useMemo(() => new Set(travadas), [travadas]);
  const alvo = useEscolherAlvo(tripulantes, personagemId);
  const nomeDoTripulante = (id: string | null) => tripulantes.find((t) => t.id === id)?.nome;
  const [otimistas, aplicar] = useOptimistic(habilidades, aplicarPatch);
  const [, startTransition] = useTransition();
  const atualizar = useRefreshAgrupado(0);
  const alvosCustom = useMemo(() => alvosPericiaCustom(periciasCustom), [periciasCustom]);
  const [modalAberto, setModalAberto] = useState(false);
  const [edit, setEdit] = useState<Habilidade | null>(null);
  // Habilidade que a nova copia.
  const [copiaDe, setCopiaDe] = useState<Habilidade | null>(null);
  // Forma à mostra em cada card (id da habilidade de origem → id da forma).
  const [formaAtiva, setFormaAtiva] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const [pastaFiltro, setPastaFiltro] = useState<string | null>(null);
  const uso = useConfirmarUso();

  // Itens por id.
  const itemPorId = useMemo(() => {
    const m = new Map<string, ItemRef>();
    for (const i of itens) m.set(i.id, i);
    return m;
  }, [itens]);

  const recursoNomePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of recursos) m.set(r.id, r.nome);
    return m;
  }, [recursos]);

  const ctxFormula = useMemo(() => ({ nivel, atributos }), [nivel, atributos]);
  const ctxChips = useMemo(
    () => ({ nivel, atributos, graus: grausTecnicas }),
    [nivel, atributos, grausTecnicas],
  );
  const extraCura = useMemo(() => extrasDeCura(efeitosAgregados), [efeitosAgregados]);

  const porFiltro = useMemo(() => {
    if (filtro === "todas") return otimistas;
    if (filtro === "sem_custo") {
      return otimistas.filter(
        (h) =>
          h.custoPp === 0 &&
          h.custoPa === 0 &&
          (!h.custoRecursoId || h.custoRecursoValor === 0) &&
          usosMaximos(h, ctxFormula) == null,
      );
    }
    // disponíveis: tem usos (ou não consome) e não está esgotada.
    return otimistas.filter((h) => {
      const max = usosMaximos(h, ctxFormula);
      return max == null || (h.usosAtual ?? max) > 0;
    });
  }, [otimistas, filtro, ctxFormula]);

  // Pastas da ficha: filtro e busca.
  const pastas = useMemo(() => pastasDe(otimistas), [otimistas]);
  const nomesDasPastas = useMemo(() => pastas.map((p) => p.nome), [pastas]);
  const pastaAtiva = pastas.some((p) => p.nome === pastaFiltro) ? pastaFiltro : null;
  const filtradas = porFiltro.filter(
    (h) =>
      (!pastaAtiva || h.pasta === pastaAtiva) &&
      casaBusca(busca, [
        h.nome,
        h.descricao,
        h.tags,
        h.pasta,
        ORIGENS_HABILIDADE.find((o) => o.slug === h.origem)?.nome,
      ]),
  );
  const filtrando = filtro !== "todas" || !!pastaAtiva || busca.trim() !== "";

  // Formas alternativas ficam dentro do card da habilidade de origem.
  const { origemDe, grupoDe } = agruparFormas(otimistas);
  const casam = new Set(filtradas.map((h) => h.id));
  // Um card por habilidade de origem; aparece se ela ou uma forma dela casar.
  const visiveis = otimistas.filter(
    (h) => !origemDe(h) && grupoDe(h).some((f) => casam.has(f.id)),
  );
  const favoritas = visiveis.filter((h) => h.favorita);

  // Turnos que faltam, contados pelo Passar turno antes do servidor responder.
  const [turnosOverlay, setTurnosOverlay] = useState<Record<string, number>>({});
  const [habsAnterior, setHabsAnterior] = useState(habilidades);
  if (habsAnterior !== habilidades) {
    setHabsAnterior(habilidades);
    setTurnosOverlay({});
  }
  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<Record<string, number>>).detail;
      if (det) setTurnosOverlay((o) => ({ ...o, ...det }));
    }
    window.addEventListener(EVENTO_TURNOS, ouvir);
    return () => window.removeEventListener(EVENTO_TURNOS, ouvir);
  }, []);
  // Ligada: o que o servidor contou ou, recém-ligada, a duração inteira.
  const turnosDe = (h: Habilidade): number | null => {
    if (!h.ligada) return null;
    if (h.id in turnosOverlay) return turnosOverlay[h.id];
    const doServidor = habilidades.find((x) => x.id === h.id);
    if (doServidor?.ligada && doServidor.turnosRestantes != null) return doServidor.turnosRestantes;
    return turnosDaDuracao(lerDuracao(h.duracao));
  };

  function abrirNova() {
    setEdit(null);
    setCopiaDe(null);
    setModalAberto(true);
  }

  function abrirEdit(h: Habilidade) {
    setEdit(h);
    setCopiaDe(null);
    setModalAberto(true);
  }

  // Duplicar: abre uma habilidade nova já preenchida; no modal dá pra virar forma alternativa.
  function abrirCopia(h: Habilidade) {
    setEdit(null);
    setCopiaDe(h);
    setModalAberto(true);
  }

  async function apagar(id: string, nome: string) {
    const c = await Swal.fire({
      title: "Deletar Habilidade",
      text: `Apagar "${nome}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "var(--danger)",
      cancelButtonColor: "var(--text-sec)",
      confirmButtonText: "Deletar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!c.isConfirmed) return;
    startTransition(async () => {
      aplicar({ kind: "delete", id });
      try {
        exigir(await deletarHabilidade(personagemId, id));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  // Contador do bônus progressivo: vale na hora (a barra lateral ouve) e grava os efeitos.
  function mudarEfeitos(h: Habilidade, efeitos: EfeitoHabilidade[]) {
    window.dispatchEvent(
      new CustomEvent("rpgo:efeitos-habilidade", { detail: { id: h.id, efeitos } }),
    );
    startTransition(async () => {
      aplicar({ kind: "update", id: h.id, patch: { efeitos } });
      try {
        exigir(await atualizarHabilidade(personagemId, h.id, { efeitos }));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }
  useContagemDoRolador(otimistas, mudarEfeitos);

  function toggleFavorita(h: Habilidade) {
    startTransition(async () => {
      aplicar({ kind: "update", id: h.id, patch: { favorita: !h.favorita } });
      try {
        exigir(await atualizarHabilidade(personagemId, h.id, { favorita: !h.favorita }));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  // `ligar`: null = botão "Usar" de habilidade não-sustentada (consome, sem
  // estado); true = liga sustentada (consome + marca ligada); false = desliga
  // (sem custo, sem confirmação, sem reversão de pools já concedidos).
  async function acionar(h: Habilidade, ligar: boolean | null) {
    if (ligar === false) {
      window.dispatchEvent(
        new CustomEvent("rpgo:toggle-habilidade", {
          detail: { id: h.id, ligada: false },
        }),
      );
      startTransition(async () => {
        aplicar({ kind: "update", id: h.id, patch: { ligada: false } });
        try {
          exigir(await alternarHabilidade(personagemId, h.id, false));
        } catch (err) {
          mostrarErro(err);
        }
      });
      return;
    }

    const item = itemDeUso(h);

    // Em aliado: escolher quem já confirma.
    if (h.aliado) {
      if (!alvo.temAliados) {
        mostrarErro(new Error("Nenhum aliado na mesa."));
        return;
      }
      const alvoId = await alvo.escolher(`${ligar ? "Ligar" : "Usar"} ${h.nome} em quem?`, {
        detalhe: [
          item.custos.length > 0
            ? `Vai consumir: ${item.custos.map((c) => `${c.valor} ${c.nome}`).join(", ")}.`
            : null,
          ...item.faz,
        ]
          .filter(Boolean)
          .join(" "),
      });
      if (alvoId) executarUso(h, ligar, alvoId);
      return;
    }

    const ok = await uso.confirmar({
      titulo: ligar ? "Ligar" : "Usar",
      nome: h.nome,
      icone: ligar ? "fa-toggle-on" : "fa-play",
      botao: ligar ? "Ligar" : "Usar",
      itens: [item],
    });
    if (!ok) return;
    executarUso(h, ligar);
  }

  // Custo e o que acontece ao usar ou ligar, pra confirmação.
  function itemDeUso(h: Habilidade): ItemDeUso {
    const custos: ItemDeUso["custos"] = [];
    if (h.custoPp > 0) custos.push({ valor: h.custoPp, nome: "PP" });
    if (h.custoPa > 0) custos.push({ valor: h.custoPa, nome: "PA" });
    if (h.custoRecursoId && h.custoRecursoValor > 0) {
      custos.push({
        valor: h.custoRecursoValor,
        nome: recursoNomePorId.get(h.custoRecursoId) ?? "recurso",
      });
    }
    if (usosMaximos(h, ctxFormula) != null) custos.push({ valor: 1, nome: "uso", proprio: true });
    const efeitos = lerEfeitos(h.efeitos);
    const faz: string[] = [];
    for (const e of efeitos) {
      if (e.tipo !== "cura") continue;
      const extra = extraCura.texto && alvoDaCura(e) === "hp" ? ` + ${extraCura.texto}` : "";
      faz.push(`Cura ${formulaResolvidaTexto(e.valor, atributos, nivel)}${extra}`);
    }
    const exaustao = efeitos.reduce(
      (soma, e) => soma + (e.tipo === "recurso_delta" && e.recurso === "exaustao" ? e.valor : 0),
      0,
    );
    if (exaustao) faz.push(`Exaustão ${formatarMod(exaustao)}`);
    const duracao = textoDuracao(lerDuracao(h.duracao));
    if (duracao) faz.push(duracao);
    return { id: h.id, nome: h.nome, custos, faz };
  }

  const ehAlternavel = (h: Habilidade) => h.alternavel || temEfeitoSustentado(lerEfeitos(h.efeitos));
  const estaTravada = (h: Habilidade) =>
    travadasSet.has(h.id) || (!!h.itemId && !itemPorId.get(h.itemId)?.equipado);

  // Liga (ou usa) de uma vez o que dá pra ativar numa pasta.
  async function ativarPasta(pasta: string) {
    const daPasta = otimistas.filter((h) => h.pasta === pasta && h.tipo !== "passiva");
    const itens = daPasta.map((h) => {
      const max = usosMaximos(h, ctxFormula);
      const fora = estaTravada(h)
        ? "travada"
        : ehAlternavel(h) && h.ligada
          ? "já ligada"
          : h.aliado
            ? "em aliado"
            : max != null && (h.usosAtual ?? max) <= 0
              ? "sem usos"
              : undefined;
      return { ...itemDeUso(h), ...(fora ? { fora } : {}) };
    });
    if (!itens.some((i) => !i.fora)) {
      mostrarErro(new Error("Nada pra ativar nesta pasta."));
      return;
    }
    const ids = await uso.confirmar({
      titulo: "Ativar pasta",
      nome: pasta,
      icone: "fa-bolt",
      botao: "Ativar",
      itens,
      lista: true,
    });
    for (const id of ids ?? []) {
      const h = daPasta.find((x) => x.id === id);
      if (h) executarUso(h, ehAlternavel(h) ? true : null);
    }
  }

  function desligarPasta(pasta: string) {
    for (const h of otimistas) {
      if (h.pasta === pasta && h.ligada && ehAlternavel(h)) acionar(h, false);
    }
  }

  // Põe na pasta (etiqueta + cópia guardada) ou tira a etiqueta.
  function guardarEmPasta(h: Habilidade, pasta: string | null, exclusiva?: boolean) {
    startTransition(async () => {
      aplicar({ kind: "update", id: h.id, patch: { pasta } });
      try {
        if (pasta) {
          exigir(await guardarNaPasta(personagemId, "habilidade", h.id, pasta, exclusiva));
        } else {
          exigir(await atualizarHabilidade(personagemId, h.id, { pasta: null }));
        }
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  // Debita e aplica (Usar ou Ligar), com otimismo; `ligar` null = Usar. Com
  // `alvoId` (aliado), PV, PP e exaustão dos efeitos vão pra ele. `vezes` = usos
  // empilhados numa rolagem do Rolador (o custo e os usos saem de uma vez).
  function executarUso(h: Habilidade, ligar: boolean | null, alvoId?: string, vezes = 1) {
    // Cura com fórmula rola aqui; o resultado vai pra action e, se ela passar, pro chat.
    const efeitos = lerEfeitos(h.efeitos);
    const { rolagens, publicar } = rolarCuras(
      curasComFormula(efeitos, !!extraCura.texto),
      (valor) => resolverFormula(valor, atributos, nivel),
      h.nome,
      extraCura,
    );

    // Otimismo cross-tab: dispara deltas pra sidebar (HP/PP) e RecursosSidebar
    // refletirem antes do server. Mirror da lógica do server — ao LIGAR,
    // hp-max/pp-max ficam de fora (incluirMax:false): são bônus sustentados que
    // vêm do agregado (a sidebar recomputa com o `ligada` otimista via
    // rpgo:toggle-habilidade), não deltas instantâneos.
    const deltas = computarDeltasInstantaneos(efeitos, {
      incluirMax: !ligar,
      rolagens,
      ctx: ctxFormula,
    });
    const noAliado = !!alvoId;
    const deltaPersonagem = {
      deltaHpAtual: (!noAliado && deltas.hpAtual) || undefined,
      concedeHpTemp: (!noAliado && deltas.hpTemp) || undefined,
      deltaPpAtual: ((noAliado ? 0 : deltas.ppAtual) - h.custoPp * vezes) || undefined,
      deltaHpMax: (!noAliado && deltas.hpMax) || undefined,
      deltaPpMax: (!noAliado && deltas.ppMax) || undefined,
      deltaExaustao: (!noAliado && deltas.exaustao) || undefined,
    };
    if (Object.values(deltaPersonagem).some((v) => v !== undefined)) {
      window.dispatchEvent(
        new CustomEvent("rpgo:patch-personagem", { detail: deltaPersonagem }),
      );
    }
    const deltaRecursos: Record<string, number> = { ...deltas.recursos };
    if (h.custoRecursoId && h.custoRecursoValor > 0) {
      deltaRecursos[h.custoRecursoId] =
        (deltaRecursos[h.custoRecursoId] ?? 0) - h.custoRecursoValor * vezes;
    }
    if (Object.keys(deltaRecursos).length > 0) {
      window.dispatchEvent(
        new CustomEvent("rpgo:patch-recurso", { detail: deltaRecursos }),
      );
    }
    if (ligar) {
      // Ligar uma forma desliga as outras do mesmo card.
      for (const f of grupoDe(origemDe(h) ?? h)) {
        if (f.id !== h.id && f.ligada && ehAlternavel(f)) acionar(f, false);
      }
      window.dispatchEvent(
        new CustomEvent("rpgo:toggle-habilidade", {
          detail: { id: h.id, ligada: true },
        }),
      );
    }
    if (pedeConcentracao(h.duracao)) {
      anunciarConcentracao({ tipo: "habilidade", id: h.id, nome: h.nome });
    }

    startTransition(async () => {
      aplicar({ kind: "usar", id: h.id, vezes });
      if (ligar) {
        aplicar({
          kind: "update",
          id: h.id,
          patch: { ligada: true, ...(alvoId ? { alvoPersonagemId: alvoId } : {}) },
        });
      }
      try {
        if (ligar) exigir(await alternarHabilidade(personagemId, h.id, true, rolagens, alvoId));
        else exigir(await usarHabilidade(personagemId, h.id, rolagens, alvoId, vezes));
        publicar();
      } catch (err) {
        // Recarrega a página pra desfazer o otimismo.
        atualizar();
        mostrarErro(err);
      }
    });
  }

  // Chip de dano sob demanda do Rolador gasta a habilidade, sem confirmar.
  const gastarPeloRolador = useEffectEvent((id: string, vezes: number) => {
    const h = otimistas.find((x) => x.id === id);
    if (h) executarUso(h, null, undefined, vezes);
  });
  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<{ id: string; vezes?: number }>).detail;
      if (det?.id) gastarPeloRolador(det.id, Math.max(1, Math.trunc(det.vezes ?? 1)));
    }
    window.addEventListener("rpgo:gastar-habilidade", ouvir);
    return () => window.removeEventListener("rpgo:gastar-habilidade", ouvir);
  }, []);

  // Traz das pastas: aparece na hora e o servidor cria de verdade.
  function adicionarDasPastas(modelos: ModeloView[]) {
    startTransition(async () => {
      for (const m of modelos) {
        const dados = doModelo("habilidade", m.dados, recursos);
        aplicar({
          kind: "create",
          habilidade: {
            ...HABILIDADE_BASE,
            ...dados,
            pasta: m.pasta,
            usosAtual: (dados.usos as number | null | undefined) ?? null,
            id: idTemporario(),
          } as Habilidade,
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
      for (const h of (e as CustomEvent<Importado>).detail?.habilidades ?? []) {
        aplicar({
          kind: "create",
          habilidade: {
            ...HABILIDADE_BASE,
            ...h.input,
            usosAtual: (h.input.usos as number | null | undefined) ?? null,
            id: h.id,
          } as Habilidade,
        });
      }
    }
    window.addEventListener(EVENTO_IMPORTADO, ouvir);
    return () => window.removeEventListener(EVENTO_IMPORTADO, ouvir);
  }, [aplicar]);

  function salvarForm(dados: HabilidadeFormDados) {
    const editandoId = edit?.id ?? null;
    setModalAberto(false);
    startTransition(async () => {
      if (editandoId) {
        aplicar({ kind: "update", id: editandoId, patch: dados as Partial<Habilidade> });
        try {
          exigir(await atualizarHabilidade(personagemId, editandoId, dados));
        } catch (err) {
          mostrarErro(err);
        }
      } else {
        const nova: Habilidade = {
          id: idTemporario(),
          favorita: false,
          ordem: 0,
          ligada: false,
          alvoPersonagemId: null,
          ...dados,
          efeitos: dados.efeitos,
        };
        aplicar({ kind: "create", habilidade: nova });
        try {
          exigir(await criarHabilidade(personagemId, dados));
        } catch (err) {
          mostrarErro(err);
        }
      }
    });
  }

  // Card da habilidade de origem, com a forma escolhida à mostra.
  function card(origem: Habilidade, chave: string) {
    const formas = grupoDe(origem);
    // A forma escolhida; senão a ligada ou a primeira, entre as que casam com o filtro.
    const candidatas = filtrando ? formas.filter((f) => casam.has(f.id)) : formas;
    const h =
      formas.find((f) => f.id === formaAtiva[origem.id]) ??
      candidatas.find((f) => f.ligada && ehAlternavel(f)) ??
      candidatas[0] ??
      origem;
    return (
      <CardHabilidade
        key={chave}
        pastasDaFicha={nomesDasPastas}
        onEfeitos={(efeitos) => mudarEfeitos(h, efeitos)}
        personagemId={personagemId}
        onPasta={(p, exclusiva) => guardarEmPasta(h, p, exclusiva)}
        onFiltrarPasta={setPastaFiltro}
        habilidade={h}
        formas={formas.map((f) => ({
          id: f.id,
          nome: f.nome,
          ligada: f.ligada && ehAlternavel(f),
        }))}
        onForma={(id) => setFormaAtiva((s) => ({ ...s, [origem.id]: id }))}
        travada={travadasSet.has(h.id)}
        itemOrigem={h.itemId ? itemPorId.get(h.itemId) : undefined}
        recursoNomePorId={recursoNomePorId}
        atributos={atributos}
        nivel={nivel}
        nomeDoAlvo={nomeDoTripulante(h.alvoPersonagemId)}
        turnosRestantes={turnosDe(h)}
        onEdit={() => abrirEdit(h)}
        onCopia={() => abrirCopia(h)}
        onApagar={() => apagar(h.id, h.nome)}
        onUsar={() => acionar(h, null)}
        onAlternar={() => acionar(h, !h.ligada)}
        favorita={origem.favorita}
        onFavorita={() => toggleFavorita(origem)}
      />
    );
  }

  return (
    <AlvosCustomContext.Provider value={alvosCustom}>
      <NomesRecursoContext.Provider value={recursoNomePorId}>
      <FormulaContext.Provider value={ctxChips}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <h1>Habilidades</h1>
          <div className="tab-topo-botoes">
            <BotaoPacotes />
            <BotaoPastas
              tipo="habilidade"
              personagemId={personagemId}
              onAdicionar={adicionarDasPastas}
            />
            <button
              type="button"
              className="btn-rect primary"
              onClick={abrirNova}
            >
              + Nova Habilidade
            </button>
          </div>
        </div>

        <BarraFiltros
          busca={busca}
          onBusca={setBusca}
          rotulo="habilidade"
          filtros={FILTROS}
          filtro={filtro}
          onFiltro={setFiltro}
          pastas={pastas}
          pasta={pastaAtiva}
          onPasta={setPastaFiltro}
        >
          {pastaAtiva && otimistas.some((h) => h.pasta === pastaAtiva && h.tipo !== "passiva") && (
            <>
              <button type="button" className="hab-usar" onClick={() => ativarPasta(pastaAtiva)}>
                <i className="fas fa-bolt" /> Ativar pasta
              </button>
              {otimistas.some((h) => h.pasta === pastaAtiva && h.ligada && ehAlternavel(h)) && (
                <button type="button" className="hab-filtro" onClick={() => desligarPasta(pastaAtiva)}>
                  Desligar
                </button>
              )}
            </>
          )}
        </BarraFiltros>

        {favoritas.length > 0 && (
          <section>
            <div className="section-header">
              <i className="fas fa-star" style={{ color: "var(--highlight)" }} />
              <h3>Destaques</h3>
            </div>
            <div className="action-grid">{favoritas.map((h) => card(h, `fav-${h.id}`))}</div>
          </section>
        )}

        {ORIGENS_HABILIDADE.map((origem) => {
          const lista = visiveis.filter((h) => h.origem === origem.slug);
          if (lista.length === 0) return null;
          return (
            <section key={origem.slug}>
              <div className="section-header">
                <i className={`fas ${origem.icone}`} style={{ color: origem.cor }} />
                <h3>{origem.nome}</h3>
                <span style={{ color: "var(--text-sec)", fontSize: "0.85rem" }}>
                  ({lista.length})
                </span>
              </div>
              <div className="action-grid">{lista.map((h) => card(h, h.id))}</div>
            </section>
          );
        })}

        {visiveis.length === 0 && (
          <p
            style={{
              color: "var(--text-sec)",
              fontSize: "0.9rem",
              fontStyle: "italic",
              textAlign: "center",
              padding: "40px 0",
            }}
          >
            {filtrando ? "Nada encontrado." : "Nenhuma habilidade cadastrada."}
          </p>
        )}

        {alvo.modal}
        {uso.modal}

        {modalAberto && (
          <HabilidadeModal
            inicial={edit}
            copiaDe={copiaDe}
            origemForma={
              copiaDe ? (origemDe(copiaDe) ?? copiaDe) : edit ? (origemDe(edit) ?? null) : null
            }
            recursos={recursos}
            itens={itens}
            atributos={atributos}
            nivel={nivel}
            onCancelar={() => setModalAberto(false)}
            onSalvar={salvarForm}
          />
        )}
      </FormulaContext.Provider>
      </NomesRecursoContext.Provider>
    </AlvosCustomContext.Provider>
  );
}

// ─── Card de habilidade ────────────────────────────────────────────────
function CardHabilidade({
  personagemId,
  pastasDaFicha,
  onEfeitos,
  onPasta,
  onFiltrarPasta,
  habilidade,
  formas,
  onForma,
  travada,
  itemOrigem,
  recursoNomePorId,
  atributos,
  nivel,
  nomeDoAlvo,
  turnosRestantes,
  onEdit,
  onCopia,
  onApagar,
  onUsar,
  onAlternar,
  favorita,
  onFavorita,
}: {
  personagemId: string;
  // Pastas que já existem na ficha.
  pastasDaFicha: string[];
  // Contador do bônus progressivo mudou.
  onEfeitos: (efeitos: EfeitoHabilidade[]) => void;
  onPasta: (pasta: string | null, exclusiva?: boolean) => void;
  onFiltrarPasta: (pasta: string) => void;
  // A forma à mostra.
  habilidade: Habilidade;
  // A habilidade de origem e as formas dela.
  formas: { id: string; nome: string; ligada: boolean }[];
  onForma: (id: string) => void;
  travada: boolean;
  itemOrigem?: ItemRef;
  recursoNomePorId: Map<string, string>;
  atributos: Record<Atributo, number>;
  nivel: number;
  // Aliado em que está ligada.
  nomeDoAlvo?: string;
  // Ligada com duração em turnos: quanto falta.
  turnosRestantes?: number | null;
  onEdit: () => void;
  onCopia: () => void;
  onApagar: () => void;
  onUsar: () => void;
  onAlternar: () => void;
  // Destaque da habilidade de origem.
  favorita: boolean;
  onFavorita: () => void;
}) {
  const efeitos = lerEfeitos(habilidade.efeitos);
  // O "a cada turno" aparece junto da duração.
  const chips = efeitos.filter((e) => e.tipo !== "por_turno");
  // Concedida por item: só vale com ele equipado.
  const travadaPorItem = !!habilidade.itemId && !itemOrigem?.equipado;
  const bloqueada = travada || travadaPorItem;
  const tipoMeta = TIPOS_HABILIDADE.find((t) => t.slug === habilidade.tipo);
  // Tudo que não é passiva é ativável (Usar ou toggle).
  const ehAtivavel = habilidade.tipo !== "passiva";
  // Habilidade ativável com efeito sustentado ganha switch on/off (estado
  // `ligada`); sem efeito sustentado (cura pura etc.) mantém o "Usar" pontual.
  const mostrarToggle = ehAtivavel && (habilidade.alternavel || temEfeitoSustentado(efeitos));
  const mostrarUsar = ehAtivavel && !mostrarToggle;
  const ligadaAtiva = mostrarToggle && habilidade.ligada;
  const usosMax = usosMaximos(habilidade, { nivel, atributos });

  // Efeitos com fórmula de dado viram links "rolar" que empilham na Bandeja.
  // Cura só vira link em passiva: nas outras o "Usar"/"Ligar" já rola e aplica.
  // Siglas (FOR…PRE, PROF, NIVEL) são resolvidas pro valor do personagem.
  const rolagens: {
    formula: string;
    texto: string;
    dados: Dado[];
    modificador: number;
  }[] = [];
  for (const e of efeitos) {
    const fonte =
      e.tipo === "rolagem" ? e.formula : e.tipo === "cura" && !ehAtivavel ? e.valor : null;
    if (fonte == null) continue;
    const f = resolverFormula(fonte, atributos, nivel);
    const rolavel =
      e.tipo === "rolagem" ? f.dados.length > 0 || f.modificador !== 0 : f.dados.length > 0;
    if (!rolavel) continue;
    rolagens.push({
      formula: fonte,
      texto: formulaResolvidaTexto(fonte, atributos, nivel),
      dados: f.dados,
      modificador: f.modificador,
    });
  }

  const custos: string[] = [];
  if (habilidade.custoPp > 0) custos.push(`${habilidade.custoPp} PP`);
  if (habilidade.custoPa > 0) custos.push(`${habilidade.custoPa} PA`);
  if (habilidade.custoRecursoId && habilidade.custoRecursoValor > 0) {
    custos.push(
      `${habilidade.custoRecursoValor} ${recursoNomePorId.get(habilidade.custoRecursoId) ?? "?"}`,
    );
  }
  const tags = separarTags(habilidade.tags);
  const estilosTag = lerEstilosTag(habilidade.tagsEstilo);
  // Nome pronto pra uma pasta nova.
  const origemNome =
    habilidade.origem === "livre"
      ? undefined
      : ORIGENS_HABILIDADE.find((o) => o.slug === habilidade.origem)?.nome;

  // Mapeia tipo de habilidade pra classe de cor de borda (reusa as do .action-card).
  const tipoClass =
    habilidade.tipo === "ativa"
      ? "type-power"
      : habilidade.tipo === "reativa"
      ? "type-react"
      : habilidade.tipo === "passiva"
      ? "type-padrao"
      : "type-comum";

  const pendente = ehTemporario(habilidade.id);

  return (
    <div
      className={`action-card com-copia ${tipoClass}${ligadaAtiva ? " hab-card-ligada" : ""}${
        bloqueada ? " hab-travada" : ""
      }${pendente ? " item-pendente" : ""}`}
      inert={pendente}
    >
      <button
        type="button"
        className={`btn-favorito ${favorita ? "ativo" : ""}`}
        title="Favoritar"
        onClick={onFavorita}
        style={{ position: "absolute", top: 12, left: 12 }}
      >
        <i className={`fa-star ${favorita ? "fas" : "far"}`} />
      </button>
      <button
        type="button"
        className="btn-card-copia"
        title="Duplicar"
        aria-label={`Duplicar ${habilidade.nome}`}
        onClick={onCopia}
      >
        <i className="fas fa-copy" />
      </button>
      <BotaoGuardar
        origem={{ nome: habilidade.nome, pasta: habilidade.pasta ?? null }}
        personagemId={personagemId}
        pastasDaFicha={pastasDaFicha}
        sugestoes={[...(origemNome ? [origemNome] : []), ...tags]}
        onGuardar={onPasta}
      />
      <button
        type="button"
        className="btn-card-edit"
        title="Editar"
        onClick={onEdit}
      >
        <i className="fas fa-edit" />
      </button>
      <button
        type="button"
        className="btn-card-trash"
        title="Apagar"
        onClick={onApagar}
      >
        <i className="fas fa-trash" />
      </button>

      <div>
        <div className="card-title" style={{ paddingLeft: 26 }}>
          {habilidade.nome}
        </div>
        {formas.length > 1 && (
          <div className="acao-formas" role="group" aria-label="Formas">
            {formas.map((f) => (
              <button
                type="button"
                key={f.id}
                className={`acao-forma${f.id === habilidade.id ? " ativo" : ""}${
                  f.ligada ? " ligada" : ""
                }`}
                aria-pressed={f.id === habilidade.id}
                onClick={() => onForma(f.id)}
              >
                {f.nome}
              </button>
            ))}
          </div>
        )}
        <div className="acao-stats">
          {tipoMeta && (
            <span className="acao-stat" style={{ color: tipoMeta.cor }}>
              <i className={`fas ${tipoMeta.icone}`} /> {tipoMeta.nome}
            </span>
          )}
          {usosMax != null && (
            <span
              className="acao-stat"
              title={habilidade.usosFormula ? `Máximo: ${habilidade.usosFormula}` : undefined}
            >
              <i className="fas fa-bolt-lightning" /> {habilidade.usosAtual ?? usosMax}/{usosMax}
            </span>
          )}
          {habilidade.recarga && (
            <span className="acao-stat">
              <i className="fas fa-rotate" />{" "}
              {RECARGAS_HABILIDADE.find((r) => r.slug === habilidade.recarga)?.nome ??
                habilidade.recarga}
            </span>
          )}
          {textoDuracao(lerDuracao(habilidade.duracao)) && (
            <span
              className="acao-stat"
              title={ligadaAtiva && turnosRestantes != null ? textoDuracao(lerDuracao(habilidade.duracao)) ?? undefined : undefined}
            >
              <i className="fas fa-hourglass-half" />{" "}
              {ligadaAtiva && turnosRestantes != null
                ? textoTurnosRestantes(turnosRestantes)
                : textoDuracao(lerDuracao(habilidade.duracao))}
            </span>
          )}
          <StatsPorTurno efeitos={efeitos} />
          {habilidade.aliado && (
            <span className="acao-stat acao-aliado">
              <i className="fas fa-hand-holding-heart" />{" "}
              {ligadaAtiva && nomeDoAlvo ? `em ${nomeDoAlvo}` : "Em aliado"}
            </span>
          )}
          {itemOrigem && !travadaPorItem && (
            <span className="acao-stat">
              <i className={`fas ${habilidade.itemUsa ? "fa-khanda" : "fa-sack-dollar"}`} />{" "}
              {habilidade.itemUsa ? "Usa" : "Vem de"} {itemOrigem.nome}
            </span>
          )}
        </div>
        {bloqueada && (
          <div className="hab-travada-nota">
            <i className="fas fa-lock" /> Habilidade travada ·{" "}
            {travadaPorItem ? `equipe ${itemOrigem?.nome ?? "o item"}` : "talento não liberado"}
          </div>
        )}
        {chips.length > 0 && (
          <div className="efeito-chips">
            {chips.map((e, i) => (
              <ChipEfeito key={i} efeito={e} />
            ))}
          </div>
        )}
        <PassosProgressivos efeitos={efeitos} onChange={onEfeitos} travado={bloqueada} />
        {habilidade.descricao && (
          <div className="card-desc">{habilidade.descricao}</div>
        )}
      </div>

      {(custos.length > 0 ||
        tags.length > 0 ||
        !!habilidade.pasta ||
        mostrarUsar ||
        mostrarToggle ||
        rolagens.length > 0) && (
        <div className="card-tags">
          {custos.map((c, i) => (
            <span key={`c${i}`} className="tag tag-custo">
              {c}
            </span>
          ))}
          {tags.map((t, i) => (
            <TagChip key={`t${i}`} nome={t} estilo={estilosTag[t]} />
          ))}
          {habilidade.pasta && (
            <button
              type="button"
              className="tag tag-pasta"
              title="Filtrar por esta pasta"
              onClick={() => onFiltrarPasta(habilidade.pasta!)}
            >
              <i className="fas fa-folder" /> {habilidade.pasta}
            </button>
          )}
          {rolagens.map((r, i) => (
            <button
              key={`r${i}`}
              type="button"
              className="hab-rolar"
              title={`Empilhar ${r.texto} no Rolador${r.texto !== r.formula ? ` · ${r.formula}` : ""}`}
              onClick={() =>
                empilharRolagem({
                  dados: r.dados,
                  modificador: r.modificador,
                  nomePreset: `${habilidade.nome}: ${r.texto}`,
                })
              }
            >
              <i className="fas fa-dice" /> {r.texto}
            </button>
          ))}
          {mostrarUsar && (
            <button type="button" className="hab-usar" onClick={onUsar}>
              <i className="fas fa-play" /> Usar
            </button>
          )}
          {mostrarToggle && (
            <button
              type="button"
              className={`hab-toggle${habilidade.ligada ? " ligada" : ""}`}
              role="switch"
              aria-checked={habilidade.ligada}
              title={habilidade.ligada ? "Desligar habilidade" : "Ligar habilidade"}
              onClick={onAlternar}
            >
              <span className="hab-toggle-trilho">
                <span className="hab-toggle-bolha" />
              </span>
              {habilidade.ligada ? "Ligada" : "Desligada"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────
type HabilidadeFormDados = {
  nome: string;
  origem: OrigemHabilidade;
  tipo: TipoHabilidade;
  descricao: string;
  custoPp: number;
  custoPa: number;
  custoRecursoId: string | null;
  custoRecursoValor: number;
  custoPpFormula: string | null;
  custoRecursoFormula: string | null;
  usos: number | null;
  usosAtual: number | null;
  usosFormula: string | null;
  recarga: string | null;
  tags: string | null;
  tagsEstilo: MapaEstilosTag;
  efeitos: EfeitoHabilidade[];
  itemId: string | null;
  itemUsa: boolean;
  alternavel: boolean;
  aliado: boolean;
  duracao: Duracao | null;
  formaDe?: string | null;
};

function HabilidadeModal({
  inicial,
  copiaDe,
  origemForma,
  recursos,
  itens,
  atributos,
  nivel,
  onCancelar,
  onSalvar,
}: {
  inicial: Habilidade | null;
  // Habilidade que a nova copia.
  copiaDe: Habilidade | null;
  // Habilidade de que esta pode ser forma alternativa.
  origemForma: Habilidade | null;
  recursos: RecursoMinimo[];
  itens: ItemRef[];
  atributos: Record<Atributo, number>;
  nivel: number;
  onCancelar: () => void;
  onSalvar: (d: HabilidadeFormDados) => void;
}) {
  // Campos começam da habilidade editada ou da copiada.
  const base = inicial ?? copiaDe;
  const [nome, setNome] = useState(
    inicial?.nome ?? (copiaDe ? `${copiaDe.nome} (cópia)` : ""),
  );
  const [formaDe, setFormaDe] = useState(inicial && origemForma ? origemForma.id : "");
  const [origem, setOrigem] = useState<OrigemHabilidade>(
    (base?.origem as OrigemHabilidade) ?? "livre",
  );
  const [tipo, setTipo] = useState<TipoHabilidade>(
    (base?.tipo as TipoHabilidade) ?? "passiva",
  );
  const [descricao, setDescricao] = useState(base?.descricao ?? "");
  const [custoPp, setCustoPp] = useState(
    base?.custoPpFormula ?? (base?.custoPp ? String(base.custoPp) : ""),
  );
  const [custoRecursoId, setCustoRecursoId] = useState(
    base?.custoRecursoId ?? "",
  );
  const [custoRecursoValor, setCustoRecursoValor] = useState(
    base?.custoRecursoFormula ??
      (base?.custoRecursoValor ? String(base.custoRecursoValor) : ""),
  );
  const [usos, setUsos] = useState(
    base?.usosFormula ?? (base?.usos != null ? String(base.usos) : ""),
  );
  const [alternavel, setAlternavel] = useState(base?.alternavel ?? false);
  const [aliado, setAliado] = useState(base?.aliado ?? false);
  const [duracao, setDuracao] = useState<Duracao | null>(lerDuracao(base?.duracao));
  const [recarga, setRecarga] = useState(base?.recarga ?? "");
  const [tags, setTags] = useState(base?.tags ?? "");
  const [tagsEstilo, setTagsEstilo] = useState<MapaEstilosTag>(
    lerEstilosTag(base?.tagsEstilo),
  );
  const [efeitos, setEfeitos] = useState<EfeitoHabilidade[]>(
    lerEfeitos(base?.efeitos),
  );
  const [itemId, setItemId] = useState(base?.itemId ?? "");
  const [itemUsa, setItemUsa] = useState(base?.itemUsa ?? false);
  // Com efeito que fica valendo, a habilidade só pode ser de Liga e desliga.
  const temSustentado = temEfeitoSustentado(efeitos);
  const ligaDesliga = alternavel || temSustentado;
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      Swal.fire({
        icon: "warning",
        title: "Campo obrigatório",
        text: "Dê um nome pra habilidade.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }
    // Máximo de usos: número ou fórmula (salva o valor de agora como reserva).
    const usosTexto = usos.trim();
    const usosNumerico = usosTexto !== "" && Number.isFinite(Number(usosTexto));
    const usosFormula = usosTexto && !usosNumerico ? usosTexto : null;
    const usosNum =
      usosTexto === ""
        ? null
        : Math.max(0, usosFormula ? valorDaFormula(usosFormula, atributos, nivel) : Number(usosTexto) || 0);
    // Custos: número ou fórmula (o valor de agora vai junto, como reserva).
    const pp = lerNumeroOuFormula(custoPp, { nivel, atributos });
    const doRecurso = lerNumeroOuFormula(custoRecursoId ? custoRecursoValor : "", { nivel, atributos });
    onSalvar({
      nome: nomeLimpo,
      origem,
      tipo,
      descricao,
      custoPp: pp.numero,
      custoPpFormula: pp.formula,
      custoPa: base?.custoPa ?? 0,
      custoRecursoId: custoRecursoId || null,
      custoRecursoValor: doRecurso.numero,
      custoRecursoFormula: doRecurso.formula,
      usos: usosNum,
      // Edição preserva o tanque atual; criação começa cheio (= usos).
      usosAtual: inicial ? inicial.usosAtual : usosNum,
      usosFormula,
      recarga: recarga || null,
      tags: tags.trim() || null,
      tagsEstilo: podarEstilosTag(tagsEstilo, tags),
      efeitos,
      itemId: itemId || null,
      itemUsa: !!itemId && itemUsa,
      alternavel: tipo !== "passiva" && alternavel,
      aliado: tipo !== "passiva" && aliado,
      duracao: tipo !== "passiva" ? duracao : null,
      // Só vai quando o modal ofereceu a escolha.
      ...(origemForma ? { formaDe: formaDe || null } : {}),
    });
  }

  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onCancelar} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
        <h2>{inicial ? "Editar Habilidade" : "Nova Habilidade"}</h2>

        <form onSubmit={submit}>
          <label>Origem</label>
          <div className="origem-pills">
            {ORIGENS_HABILIDADE.map((o) => (
              <button
                type="button"
                key={o.slug}
                className={`origem-pill ${origem === o.slug ? "ativo" : ""}`}
                aria-pressed={origem === o.slug}
                onClick={() => setOrigem(o.slug)}
                style={origem === o.slug ? { borderColor: o.cor, color: o.cor } : undefined}
              >
                <i className={`fas ${o.icone}`} /> {o.nome}
              </button>
            ))}
          </div>

          <label style={{ marginTop: 14 }}>Tipo</label>
          <div className="tipo-cards tipo-cards-4">
            {TIPOS_HABILIDADE.map((t) => (
              <button
                type="button"
                key={t.slug}
                className={`tipo-card ${tipo === t.slug ? "ativo" : ""}`}
                style={{ "--tipo-cor": t.cor } as React.CSSProperties}
                aria-pressed={tipo === t.slug}
                onClick={() => setTipo(t.slug)}
              >
                <i className={`fas ${t.icone} tipo-card-icone`} />
                <span className="tipo-card-titulo">{t.nome}</span>
              </button>
            ))}
          </div>

          {tipo !== "passiva" && (
            <>
              <label>Uso</label>
              <div className="tipo-cards tipo-cards-2">
                <button
                  type="button"
                  className={`tipo-card ${!ligaDesliga ? "ativo" : ""}`}
                  style={{ "--tipo-cor": "var(--color-power)" } as React.CSSProperties}
                  aria-pressed={!ligaDesliga}
                  disabled={temSustentado}
                  title={temSustentado ? "Tem efeito que fica valendo" : undefined}
                  onClick={() => setAlternavel(false)}
                >
                  <i className="fas fa-play tipo-card-icone" />
                  <span className="tipo-card-titulo">Usar</span>
                </button>
                <button
                  type="button"
                  className={`tipo-card ${ligaDesliga ? "ativo" : ""}`}
                  style={{ "--tipo-cor": "var(--color-power)" } as React.CSSProperties}
                  aria-pressed={ligaDesliga}
                  onClick={() => setAlternavel(true)}
                >
                  <i className="fas fa-toggle-on tipo-card-icone" />
                  <span className="tipo-card-titulo">Liga e desliga</span>
                </button>
              </div>

              <label>Efeitos em</label>
              <div className="origem-pills">
                {(
                  [
                    [false, "Você", "fa-user"],
                    [true, "Aliado", "fa-hand-holding-heart"],
                  ] as const
                ).map(([valor, rotulo, icone]) => (
                  <button
                    type="button"
                    key={rotulo}
                    className={`origem-pill ${aliado === valor ? "ativo" : ""}`}
                    aria-pressed={aliado === valor}
                    onClick={() => setAliado(valor)}
                  >
                    <i className={`fas ${icone}`} /> {rotulo}
                  </button>
                ))}
              </div>

              <DuracaoCampo
                valor={duracao}
                onChange={setDuracao}
                porTurno={porTurnoDe(efeitos)}
                onPorTurno={(lista) => setEfeitos(comPorTurno(efeitos, lista))}
                recursos={recursos}
              />
            </>
          )}
          {tipo === "passiva" && (
            <ACadaTurnoCampo
              lista={porTurnoDe(efeitos)}
              onChange={(lista) => setEfeitos(comPorTurno(efeitos, lista))}
              recursos={recursos}
            />
          )}

          <label>Nome</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Golpe Certeiro"
            autoFocus
          />

          {origemForma && (
            <>
              <label>Forma alternativa</label>
              <Segmentos
                rotulo="Forma alternativa"
                valor={formaDe}
                onChange={setFormaDe}
                opcoes={[
                  { valor: "", rotulo: "Não" },
                  { valor: origemForma.id, rotulo: `De ${origemForma.nome}` },
                ]}
              />
            </>
          )}

          <label>Descrição</label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Como funciona, quando se aplica, regras especiais..."
          />

          <label>Item</label>
          {itemId && (
            <Segmentos
              rotulo="Relação com o item"
              valor={itemUsa ? "usa" : "vem"}
              onChange={(v) => setItemUsa(v === "usa")}
              opcoes={[
                { valor: "vem", rotulo: "Vem de" },
                { valor: "usa", rotulo: "Usa" },
              ]}
            />
          )}
          <SeletorUnico
            opcoes={itens.map((i) => ({
              id: i.id,
              nome: i.nome,
              icone: "fa-sack-dollar",
              detalhe: i.equipado ? undefined : "desequipado",
              inativo: !i.equipado,
            }))}
            marcado={itemId}
            onChange={setItemId}
            rotulo="item"
            vazio="Nenhum item no inventário."
          />
          <details
            className="modal-secao-detalhe"
            open={!!(custoPp || custoRecursoId)}
          >
            <summary>
              <i className="fas fa-coins" /> Custos
            </summary>
            <div className="modal-secao-corpo">
              <CustosCampo
                pp={custoPp}
                onPp={setCustoPp}
                recursos={recursos}
                recursoId={custoRecursoId}
                onRecursoId={setCustoRecursoId}
                recursoValor={custoRecursoValor}
                onRecursoValor={setCustoRecursoValor}
              />
            </div>
          </details>

          <details className="modal-secao-detalhe" open={!!(usos || recarga)}>
            <summary>
              <i className="fas fa-bolt-lightning" /> Usos limitados
            </summary>
            <div className="modal-secao-corpo">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                <CampoFormula
                  label="Máximo"
                  valor={usos}
                  onChange={setUsos}
                  placeholder="3, PROF, NIVEL…"
                />
                <div>
                  <label>Recarga</label>
                  <select
                    value={recarga}
                    onChange={(e) => setRecarga(e.target.value)}
                  >
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
            open={efeitos.some((e) => e.tipo !== "por_turno")}
          >
            <summary>
              <i className="fas fa-list-check" /> Efeitos (
              {efeitos.filter((e) => e.tipo !== "por_turno").length})
            </summary>
            <div className="modal-secao-corpo">
              <EfeitosEditor
                efeitos={efeitos}
                onChange={setEfeitos}
                recursos={recursos}
                pergunta="O que essa habilidade faz?"
              />
            </div>
          </details>

          <label style={{ marginTop: 14 }}>Tags (separadas por vírgula)</label>
          <TagsEditor
            tags={tags}
            estilos={tagsEstilo}
            onTags={setTags}
            onEstilos={setTagsEstilo}
            placeholder="combate, descanso longo, graduacao:profissional"
          />

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onCancelar}>
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
  );
}

