"use client";

import { useContext, useEffect, useEffectEvent, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { DescricaoCard } from "@/components/descricao-rica/descricao-card";
import { EditorRico } from "@/components/descricao-rica/editor-rico";
import { ContextoDescricaoCtx, condicoesCatalogoNomes, useContextoRico } from "./contexto-rico";
import { ehTemporario, exigir, idTemporario } from "@/lib/acoes";
import { EditableStat } from "./editable-stat";
import { useReordenar } from "@/lib/use-reordenar";
import {
  atualizarItem,
  criarItem,
  deletarItem,
  equiparItem,
  gastarMunicao,
  passarItem,
  patchPersonagem,
  reordenarItens,
  usarItem,
} from "./actions";
import { useRefreshAgrupado } from "@/lib/use-refresh-agrupado";
import {
  ALCANCES_ARMA,
  ATRIBUTOS,
  CATEGORIAS_ARMA,
  PROPRIEDADES_ARMA,
  alvoDaCura,
  textoDaCura,
  bonusProficiencia,
  computarDeltasInstantaneos,
  curasComFormula,
  efeitoInstantaneo,
  efeitosComArma,
  efeitosDoContexto,
  exaustaoQueConta,
  extrasDeCura,
  formulaResolvidaTexto,
  lerEfeitos,
  penalidadeD20Exaustao,
  resolverFormula,
  resumoEfeito,
  resolverAtaqueArma,
  resolverDanoArma,
  formatarBerries,
  formatarMod,
  type AlcanceArma,
  type Atributo,
  type CategoriaArma,
  type DanoArmaResolvido,
  type EfeitoHabilidade,
  type EfeitosAgregados,
  type EfeitosContexto,
  type PropriedadeArma,
  gruposDosEfeitos,
} from "@/lib/op-rpg";
import { empilharD20, empilharRolagem, rolarCuras } from "@/lib/empilhar-rolagem";
import { juntarTipoNoDano, juntarTipos, separarTipoDoDano, tiposDoDano } from "@/lib/dano";
import {
  ChipEfeito,
  FormulaContext,
  AcoesDaFichaContext,
  ItensDaFichaContext,
  GruposEfeitoContext,
  NomesRecursoContext,
  DatalistAlvos,
  EfeitosEditor,
  PassosProgressivos,
  useContagemDoRolador,
  type RecursoMinimo,
} from "./efeitos-editor";
import { ACadaTurnoCampo, comPorTurno, porTurnoDe } from "./duracao-campo";
import { useExaustaoOtimista } from "./use-exaustao-otimista";
import { useGastoMunicao } from "./use-municao";
import { SeletorUnico } from "./seletor-multiplo";
import { CampoPasso, SecaoModal, TipoDanoCampo } from "./campos-modal";
import { CampoFormula } from "./campo-formula";
import {
  EVENTO_GASTAR_MUNICAO,
  danoComMunicao,
  municaoDaArma,
  textoMunicao,
  type GastoMunicao,
  type MunicaoDaArma,
} from "@/lib/municao";
import { useEscolherAlvo } from "./escolher-alvo";
import type { Tripulante } from "./tripulacao-tab";
import { MarcaExausto } from "./marca-exausto";
import { BarraFiltros, casaBusca, pastasDe } from "./barra-filtros";
import { SecaoRecolhivel } from "./secao-recolhivel";
import { BotaoGuardar } from "./pastas";
import { BotaoPacotes } from "./pacotes";
import { useGravacaoAgrupada } from "./use-gravacao-agrupada";
import { Tooltip } from "@/components/tooltip";
import { TagChip, TagsEditor } from "./estilo-cor-picker";
import {
  lerEstilosTag,
  podarEstilosTag,
  separarTags,
  tagsDaFicha,
  type MapaEstilosTag,
} from "@/lib/estilos-cor";

type Item = {
  id: string;
  nome: string;
  peso: number;
  tipo: string;
  tags: string | null;
  tagsEstilo: unknown;
  descricao: string | null;
  dano: string | null;
  modificador: number;
  ca: number;
  penalidadeDes: number;
  equipado: boolean;
  favorito: boolean;
  categoria: string;
  alcance: string;
  alcanceMetros: string | null;
  propriedades: unknown;
  atributoAtaque: string | null;
  proficienteArma: boolean;
  armaFavorita: boolean;
  danoBonus: string | null;
  danoSomaAtributo: boolean;
  danoSomaProficiencia: boolean;
  efeitos: unknown;
  quantidade: number;
  municaoId?: string | null;
  // Posição na lista (0 = nunca arrastado, vai pro fim).
  ordem?: number;
  // Pasta em que o item está (etiqueta de filtro).
  pasta?: string | null;
};

// Unidades do item; só a munição pode ficar em zero.
function quantidadeDe(i: { tipo: string; quantidade: number }): number {
  return i.tipo === "municao" ? Math.max(0, i.quantidade) : Math.max(1, i.quantidade || 1);
}

// Ação/habilidade concedida por um item.
type Concedido = { id: string; nome: string; itemId: string | null };

const CATEGORIAS_ARMA_VALIDAS = new Set<string>(CATEGORIAS_ARMA.map((c) => c.slug));
const ALCANCES_ARMA_VALIDOS = new Set<string>(ALCANCES_ARMA.map((a) => a.slug));

type Props = {
  personagemId: string;
  cargaMaxima: number;
  berries: number;
  itens: Item[];
  nivel: number;
  exaustao: number;
  penalidadeDesArmadura: number;
  atributos: Record<Atributo, number>;
  efeitosAgregados: EfeitosAgregados;
  recursos: RecursoMinimo[];
  /** Ações concedidas por itens — pro card listar o que o item libera. */
  acoes: Concedido[];
  /** Habilidades concedidas por itens. */
  habilidades: Concedido[];
  /** Personagens da mesa (inclui o próprio). */
  tripulantes: Tripulante[];
  /** Graus das técnicas do personagem (GRAU nos chips). */
  grausTecnicas: number[];
  /** Todas as ações da ficha (as descrições citam `[[acao:…]]`). */
  acoesFicha: { id: string; nome: string; tipo: string; tecnica: boolean; grau: number }[];
  /** Atributo da CD das técnicas (o chip de salvaguarda sem CD usa). */
  atributoCdTecnicas: string | null;
};

function lerPropriedades(raw: unknown): PropriedadeArma[] {
  if (!Array.isArray(raw)) return [];
  const validas = new Set(PROPRIEDADES_ARMA.map((p) => p.slug));
  return raw.filter(
    (p): p is PropriedadeArma => typeof p === "string" && validas.has(p as PropriedadeArma),
  );
}

// Berries com controle de transação: clicar no número edita o valor absoluto
// (EditableStat) e o campo com −/+ tira/adiciona a quantia digitada — assim não
// precisa abrir a edição e digitar "+5000" na mão. A quantia é formatada com
// separador de milhar enquanto se digita, os botões só ativam quando há valor e
// o saldo pisca (verde sobe / vermelho desce) ao confirmar. Otimismo em ambos.
function BerriesControle({
  personagemId,
  berries,
}: {
  personagemId: string;
  berries: number;
}) {
  const [valor, definirValor] = useOptimistic(berries, (_atual, novo: number) => novo);
  const [, startTransition] = useTransition();
  const [qtd, setQtd] = useState("");
  const [flash, setFlash] = useState<"sobe" | "desce" | null>(null);

  // Só dígitos importam; a quantia é sempre reexibida com separador de milhar.
  const quantia = Math.trunc(Number(qtd.replace(/\D/g, "")) || 0);

  function aoDigitar(bruto: string) {
    const limpo = bruto.replace(/\D/g, "");
    setQtd(limpo ? formatarBerries(Number(limpo)) : "");
  }

  function transacionar(sinal: 1 | -1) {
    if (quantia <= 0) return;
    const novo = Math.max(0, valor + sinal * quantia);
    setQtd("");
    if (novo === valor) return;
    setFlash(novo > valor ? "sobe" : "desce");
    startTransition(async () => {
      definirValor(novo);
      try {
        exigir(await patchPersonagem(personagemId, { berries: novo }));
      } catch (err) {
        Swal.fire({
          icon: "error",
          title: "Erro",
          text: err instanceof Error ? err.message : "Operação falhou.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      }
    });
  }

  const semQuantia = quantia <= 0;

  return (
    <div className="berries-display" title="Berries (moeda do One Piece)">
      <span className="berries-simbolo">฿</span>
      <span
        className={`berries-valor ${flash ? `flash-${flash}` : ""}`}
        onAnimationEnd={() => setFlash(null)}
      >
        <EditableStat
          personagemId={personagemId}
          campo="berries"
          valor={valor}
          formato="milhar"
          onOtimista={(n) => definirValor(n)}
        />
      </span>
      <div className="berries-ctrl">
        <button
          type="button"
          className="berries-btn tirar"
          onClick={() => transacionar(-1)}
          disabled={semQuantia}
          title="Tirar a quantia digitada"
          aria-label="Tirar berries"
        >
          <i className="fas fa-minus" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={qtd}
          placeholder="0"
          aria-label="Quantia a adicionar ou tirar"
          onChange={(e) => aoDigitar(e.target.value)}
          onKeyDown={(e) => {
            // Enter adiciona, Shift+Enter tira — Escape limpa.
            if (e.key === "Enter") transacionar(e.shiftKey ? -1 : 1);
            else if (e.key === "Escape") setQtd("");
          }}
        />
        <button
          type="button"
          className="berries-btn adicionar"
          onClick={() => transacionar(1)}
          disabled={semQuantia}
          title="Adicionar a quantia digitada"
          aria-label="Adicionar berries"
        >
          <i className="fas fa-plus" />
        </button>
      </div>
    </div>
  );
}

const SIGLA_ATRIBUTO: Record<Atributo, string> = {
  forca: "FOR",
  destreza: "DES",
  constituicao: "CON",
  sabedoria: "SAB",
  vontade: "VON",
  presenca: "PRE",
};

type Categoria = "arsenal" | "armaria" | "mochila";

function categoriaDoItem(tipo: string): Categoria {
  if (tipo === "arma" || tipo === "municao") return "arsenal";
  if (tipo === "armadura") return "armaria";
  return "mochila";
}

const SECOES: { categoria: Categoria; titulo: string; icone: string; cor: string }[] = [
  { categoria: "arsenal", titulo: "Arsenal", icone: "fa-fist-raised", cor: "var(--danger)" },
  { categoria: "armaria", titulo: "Armaria", icone: "fa-shield-alt", cor: "var(--info)" },
  { categoria: "mochila", titulo: "Mochila", icone: "fa-shopping-bag", cor: "var(--warning)" },
];

type Filtro = "todos" | "equipados" | "favoritos" | "usaveis";

const FILTROS: readonly (readonly [Filtro, string])[] = [
  ["todos", "Todos"],
  ["equipados", "Equipados"],
  ["favoritos", "Favoritos"],
  ["usaveis", "Usáveis"],
];

const FILTROS_TIPO = [
  ["arma", "Arma"],
  ["municao", "Munição"],
  ["armadura", "Armadura"],
  ["comum", "Comum"],
] as const;

// Tiros seguidos viram um gasto de munição só.
const ESPERA_GASTO_MS = 800;

type FormState = {
  id: string | null;
  nome: string;
  peso: string;
  tipo: string;
  tags: string;
  tagsEstilo: MapaEstilosTag;
  descricao: string;
  // Fórmula e tipo à parte; no banco viram um texto só ("1d8 cortante").
  dano: string;
  tipoDano: string;
  modificador: string;
  ca: string;
  penalidadeDes: string;
  categoria: CategoriaArma;
  alcance: AlcanceArma;
  alcanceMetros: string;
  propriedades: PropriedadeArma[];
  atributoAtaque: string; // "" = auto
  proficienteArma: boolean;
  armaFavorita: boolean;
  danoBonus: string;
  tipoBonus: string;
  danoSomaAtributo: boolean;
  danoSomaProficiencia: boolean;
  efeitos: EfeitoHabilidade[];
  quantidade: string;
  municaoId: string;
};

const FORM_VAZIO: FormState = {
  id: null,
  nome: "",
  peso: "1.0",
  tipo: "comum",
  tags: "",
  tagsEstilo: {},
  descricao: "",
  dano: "",
  tipoDano: "",
  modificador: "",
  ca: "",
  penalidadeDes: "",
  categoria: "cortante",
  alcance: "corpo_a_corpo",
  alcanceMetros: "",
  propriedades: [],
  atributoAtaque: "",
  proficienteArma: true,
  armaFavorita: false,
  danoBonus: "",
  tipoBonus: "",
  danoSomaAtributo: false,
  danoSomaProficiencia: false,
  efeitos: [],
  quantidade: "1",
  municaoId: "",
};

export function InventarioTab({
  personagemId,
  cargaMaxima,
  berries,
  itens,
  nivel,
  exaustao: exaustaoServer,
  penalidadeDesArmadura,
  atributos,
  efeitosAgregados,
  recursos,
  acoes,
  habilidades,
  tripulantes,
  grausTecnicas,
  acoesFicha,
  atributoCdTecnicas,
}: Props) {
  // Contexto dos chips da descrição: o mesmo das abas de ações e habilidades.
  const { base: contextoBaseRico } = useContextoRico({
    nivel,
    atributos,
    atributoCd: atributoCdTecnicas,
    acoes: acoesFicha,
    habilidades,
    itens,
    recursos,
  });
  // Penalidade de exaustão (−2 × nível) some no acerto da arma (teste de d20).
  const exaustao = useExaustaoOtimista(exaustaoServer);
  const penD20 = penalidadeD20Exaustao(exaustaoQueConta(exaustao, efeitosAgregados));
  const alvo = useEscolherAlvo(tripulantes, personagemId);
  const atualizar = useRefreshAgrupado(0);
  const nomesRecurso = new Map(recursos.map((r) => [r.id, r.nome]));
  const ctxFormula = useMemo(
    () => ({ nivel, atributos, graus: grausTecnicas }),
    [nivel, atributos, grausTecnicas],
  );
  const extraCura = useMemo(() => extrasDeCura(efeitosAgregados), [efeitosAgregados]);

  // DES reduzida pela armadura: armas que usam DES leem a pontuação ajustada.
  const atributosParaTeste: Record<Atributo, number> = {
    ...atributos,
    destreza: atributos.destreza + 2 * penalidadeDesArmadura,
  };
  const desReduz = penalidadeDesArmadura < 0;
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null);
  const [tagFiltro, setTagFiltro] = useState<string | null>(null);
  const [pastaFiltro, setPastaFiltro] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [, startTransition] = useTransition();

  // Optimistic: aplica patch local antes do server responder. Quando o
  // realtime/revalidate trazem dados novos, `itens` muda e o estado otimista
  // é resetado automaticamente pelo React.
  type Patch =
    | { kind: "update"; id: string; patch: Partial<Item> }
    | { kind: "updateMany"; ids: string[]; patch: Partial<Item> }
    | { kind: "create"; item: Item }
    | { kind: "delete"; id: string }
    // Ids na ordem nova.
    | { kind: "reordenar"; ids: string[] };
  const [itensOtimistas, aplicarOtimista] = useOptimistic(itens, (state, p: Patch) => {
    if (p.kind === "update") {
      return state.map((i) => (i.id === p.id ? { ...i, ...p.patch } : i));
    }
    if (p.kind === "updateMany") {
      const set = new Set(p.ids);
      return state.map((i) => (set.has(i.id) ? { ...i, ...p.patch } : i));
    }
    if (p.kind === "create") return [...state, p.item];
    if (p.kind === "reordenar") {
      const lugar = new Map(p.ids.map((id, i) => [id, i + 1]));
      return state.map((i) => (lugar.has(i.id) ? { ...i, ordem: lugar.get(i.id)! } : i));
    }
    return state.filter((i) => i.id !== p.id);
  });

  // Munição gasta pelo Rolador: some na hora; os tiros seguidos vão juntos pro servidor.
  const gastoMunicao = useGastoMunicao(itens);
  const gastosNaFila = useRef(new Map<string, number>());
  const timerGastos = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enviarGastos = useEffectEvent(() => {
    timerGastos.current = null;
    const lista = [...gastosNaFila.current];
    gastosNaFila.current.clear();
    for (const [id, quantidade] of lista) {
      startTransition(async () => {
        try {
          exigir(await gastarMunicao(personagemId, id, quantidade));
        } catch (err) {
          atualizar();
          mostrarErro(err);
        }
      });
    }
  });
  useEffect(() => {
    const fila = gastosNaFila.current;
    function ouvir(e: Event) {
      const d = (e as CustomEvent<GastoMunicao>).detail;
      if (!d?.id) return;
      fila.set(d.id, (fila.get(d.id) ?? 0) + d.quantidade);
      timerGastos.current ??= setTimeout(() => enviarGastos(), ESPERA_GASTO_MS);
    }
    window.addEventListener(EVENTO_GASTAR_MUNICAO, ouvir);
    return () => {
      window.removeEventListener(EVENTO_GASTAR_MUNICAO, ouvir);
      if (timerGastos.current) {
        clearTimeout(timerGastos.current);
        enviarGastos();
      }
    };
  }, []);

  // −/+ da munição: a quantidade que fica (o gasto ainda na fila já sai dela).
  const quantidades = useGravacaoAgrupada<number>((id, n) => {
    startTransition(async () => {
      aplicarOtimista({ kind: "update", id, patch: { quantidade: n + gastoMunicao(id) } });
      quantidades.soltar(id, n);
      try {
        exigir(await atualizarItem(personagemId, id, { tipo: "municao", quantidade: n }));
      } catch (err) {
        mostrarErro(err);
      }
    });
  });

  // Contador do bônus progressivo: muda na hora; os efeitos vão quando os cliques param.
  const efeitosNaFila = useGravacaoAgrupada<EfeitoHabilidade[]>((id, efeitos) => {
    startTransition(async () => {
      aplicarOtimista({ kind: "update", id, patch: { efeitos } });
      efeitosNaFila.soltar(id, efeitos);
      try {
        exigir(await atualizarItem(personagemId, id, { efeitos }));
      } catch (err) {
        mostrarErro(err);
      }
    });
  });

  // O que a tela mostra: servidor, otimista e os cliques ainda na fila.
  const itensNaTela = itensOtimistas.map((i) => {
    const n = quantidades.naTela[i.id];
    const efeitos = efeitosNaFila.naTela[i.id];
    if (n === undefined && efeitos === undefined) return i;
    return {
      ...i,
      ...(n !== undefined ? { quantidade: n + gastoMunicao(i.id) } : {}),
      ...(efeitos !== undefined ? { efeitos } : {}),
    };
  });

  function mudarQuantidade(item: Item, n: number) {
    quantidades.mudar(item.id, n);
  }

  function mudarEfeitos(item: Item, efeitos: EfeitoHabilidade[]) {
    efeitosNaFila.mudar(item.id, efeitos);
  }
  useContagemDoRolador(itensNaTela, mudarEfeitos);

  function abrirNovo() {
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdit(item: Item) {
    const dano = separarTipoDoDano(item.dano || "");
    const bonus = separarTipoDoDano(item.danoBonus || "");
    setForm({
      id: item.id,
      nome: item.nome,
      peso: String(item.peso),
      tipo: item.tipo,
      tags: item.tags || "",
      tagsEstilo: lerEstilosTag(item.tagsEstilo),
      descricao: item.descricao || "",
      dano: dano.formula,
      tipoDano: dano.tipo,
      modificador: String(item.modificador || ""),
      ca: String(item.ca || ""),
      penalidadeDes: String(item.penalidadeDes || ""),
      categoria: CATEGORIAS_ARMA_VALIDAS.has(item.categoria)
        ? (item.categoria as CategoriaArma)
        : "cortante",
      alcance: ALCANCES_ARMA_VALIDOS.has(item.alcance)
        ? (item.alcance as AlcanceArma)
        : "corpo_a_corpo",
      alcanceMetros: item.alcanceMetros || "",
      propriedades: lerPropriedades(item.propriedades),
      atributoAtaque: item.atributoAtaque || "",
      proficienteArma: item.proficienteArma,
      armaFavorita: item.armaFavorita,
      danoBonus: bonus.formula,
      tipoBonus: bonus.tipo,
      danoSomaAtributo: item.danoSomaAtributo,
      danoSomaProficiencia: item.danoSomaProficiencia,
      efeitos: lerEfeitos(item.efeitos),
      quantidade: String(quantidadeDe(item)),
      municaoId: item.municaoId ?? "",
    });
    setModalAberto(true);
  }

  function fechar() {
    setModalAberto(false);
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
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

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) {
      Swal.fire({
        icon: "warning",
        title: "Campo obrigatório",
        text: "Nome é obrigatório.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }

    const ehArma = form.tipo === "arma";
    const ehMunicao = form.tipo === "municao";
    const payload = {
      nome: form.nome,
      peso: Number(form.peso) || 0,
      tipo: form.tipo,
      tags: form.tags,
      tagsEstilo: podarEstilosTag(form.tagsEstilo, form.tags),
      descricao: form.descricao,
      dano: ehArma || ehMunicao ? juntarTipoNoDano(form.dano, form.tipoDano) : "",
      modificador: ehArma ? Number(form.modificador) || 0 : 0,
      ca: form.tipo === "armadura" ? Number(form.ca) || 0 : 0,
      penalidadeDes: form.tipo === "armadura" ? Number(form.penalidadeDes) || 0 : 0,
      categoria: ehArma ? form.categoria : "cortante",
      alcance: ehArma ? form.alcance : "corpo_a_corpo",
      alcanceMetros: ehArma ? form.alcanceMetros.trim() || null : null,
      propriedades: ehArma ? form.propriedades : [],
      atributoAtaque: ehArma && form.atributoAtaque ? form.atributoAtaque : null,
      proficienteArma: ehArma ? form.proficienteArma : true,
      armaFavorita: ehArma ? form.armaFavorita : false,
      danoBonus: ehArma ? juntarTipoNoDano(form.danoBonus, form.tipoBonus) || null : null,
      danoSomaAtributo: ehArma ? form.danoSomaAtributo : false,
      danoSomaProficiencia: ehArma ? form.danoSomaProficiencia : false,
      // Efeitos valem pra qualquer tipo de item.
      efeitos: form.efeitos,
      quantidade: ehMunicao
        ? Math.max(0, Math.trunc(Number(form.quantidade) || 0))
        : Math.max(1, Number(form.quantidade) || 1),
      municaoId: ehArma && form.propriedades.includes("municao") && form.municaoId ? form.municaoId : null,
    };

    const editandoId = form.id;
    setModalAberto(false);

    startTransition(async () => {
      if (editandoId) {
        aplicarOtimista({ kind: "update", id: editandoId, patch: payload });
        try {
          exigir(await atualizarItem(personagemId, editandoId, payload));
        } catch (err) {
          mostrarErro(err);
        }
      } else {
        const novoItem: Item = {
          id: idTemporario(),
          nome: payload.nome,
          peso: payload.peso,
          tipo: payload.tipo,
          tags: payload.tags || null,
          tagsEstilo: payload.tagsEstilo,
          descricao: payload.descricao || null,
          dano: payload.dano || null,
          modificador: payload.modificador,
          ca: payload.ca,
          penalidadeDes: payload.penalidadeDes,
          equipado: false,
          favorito: false,
          categoria: payload.categoria,
          alcance: payload.alcance,
          alcanceMetros: payload.alcanceMetros,
          propriedades: payload.propriedades,
          atributoAtaque: payload.atributoAtaque,
          proficienteArma: payload.proficienteArma,
          armaFavorita: payload.armaFavorita,
          danoBonus: payload.danoBonus,
          danoSomaAtributo: payload.danoSomaAtributo,
          danoSomaProficiencia: payload.danoSomaProficiencia,
          efeitos: payload.efeitos,
          quantidade: payload.quantidade,
          municaoId: payload.municaoId,
        };
        aplicarOtimista({ kind: "create", item: novoItem });
        try {
          exigir(await criarItem(personagemId, payload));
        } catch (err) {
          mostrarErro(err);
        }
      }
    });
  }

  function toggleFavorito(item: Item) {
    const novo = !item.favorito;
    startTransition(async () => {
      aplicarOtimista({ kind: "update", id: item.id, patch: { favorito: novo } });
      try {
        exigir(await atualizarItem(personagemId, item.id, { favorito: novo }));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function toggleEquipar(item: Item) {
    const novo = !item.equipado;
    // Se vai equipar armadura, desequipa outras armaduras primeiro.
    const outras =
      novo && item.tipo === "armadura"
        ? itensOtimistas.filter(
            (i) => i.tipo === "armadura" && i.equipado && i.id !== item.id,
          )
        : [];

    // Atualiza a sidebar antes do servidor responder.
    const overlay: Record<string, boolean> = { [item.id]: novo };
    for (const o of outras) overlay[o.id] = false;
    window.dispatchEvent(new CustomEvent("rpgo:toggle-item", { detail: overlay }));

    startTransition(async () => {
      if (outras.length > 0) {
        aplicarOtimista({
          kind: "updateMany",
          ids: outras.map((i) => i.id),
          patch: { equipado: false },
        });
      }
      aplicarOtimista({ kind: "update", id: item.id, patch: { equipado: novo } });
      try {
        exigir(await equiparItem(personagemId, item.id, novo));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  async function apagar(itemId: string) {
    const confirm = await Swal.fire({
      title: "Deletar Item",
      text: "Tem certeza que quer apagar este item?",
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
      aplicarOtimista({ kind: "delete", id: itemId });
      try {
        exigir(await deletarItem(personagemId, itemId));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  // Põe na pasta (etiqueta da ficha) ou tira.
  function guardarEmPasta(item: Item, pasta: string | null) {
    startTransition(async () => {
      aplicarOtimista({ kind: "update", id: item.id, patch: { pasta } });
      try {
        exigir(await atualizarItem(personagemId, item.id, { pasta }));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  // Passa unidades pra outra ficha do grupo (aliado, subficha ou o dono).
  async function passar(item: Item) {
    const total = quantidadeDe(item);
    const tem = total - (item.tipo === "municao" ? gastoMunicao(item.id) : 0);
    if (tem <= 0) return;
    const concede = concedidosPorItem.get(item.id);
    const destino = await alvo.escolher(`Passar ${item.nome} pra quem?`, {
      detalhe:
        concede && concede.acoes.length + concede.habilidades.length > 0
          ? "As ações e habilidades que ele dá ficam nesta ficha."
          : undefined,
    });
    if (!destino) return;
    let n = 1;
    if (tem > 1) {
      const r = await Swal.fire({
        title: "Quantas?",
        input: "number",
        inputValue: String(tem),
        inputAttributes: { min: "1", max: String(tem), step: "1" },
        showCancelButton: true,
        confirmButtonText: "Passar",
        cancelButtonText: "Cancelar",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      if (!r.isConfirmed) return;
      n = Math.min(tem, Math.max(1, Math.trunc(Number(r.value) || 0)));
    }
    startTransition(async () => {
      aplicarOtimista(
        n >= total
          ? { kind: "delete", id: item.id }
          : { kind: "update", id: item.id, patch: { quantidade: total - n } },
      );
      try {
        exigir(await passarItem(personagemId, item.id, destino, n));
      } catch (err) {
        atualizar();
        mostrarErro(err);
      }
    });
  }

  // Usa 1 unidade: os efeitos na hora vão pra quem usa ou pra um aliado da mesa.
  async function usar(item: Item) {
    const efeitos = lerEfeitos(item.efeitos).filter(efeitoInstantaneo);
    if (efeitos.length === 0) return;
    const qtd = Math.max(1, item.quantidade || 1);
    const detalhe = [
      efeitos
        .map((e) =>
          e.tipo === "cura"
            ? textoDaCura(
                e,
                `${formulaResolvidaTexto(e.valor, atributos, nivel)}${
                  extraCura.texto && alvoDaCura(e) === "hp" ? ` + ${extraCura.texto}` : ""
                }`,
              )
            : resumoEfeito(e, (id) => nomesRecurso.get(id), { nivel, atributos }),
        )
        .join(", ") + ".",
      qtd > 1 ? `Sobram ${qtd - 1}.` : "É o último.",
    ].join(" ");

    let alvoId: string | undefined;
    if (alvo.temAliados) {
      const escolhido = await alvo.escolher(`Usar ${item.nome} em quem?`, { comVoce: true, detalhe });
      if (!escolhido) return;
      if (escolhido !== personagemId) alvoId = escolhido;
    } else {
      const c = await Swal.fire({
        title: `Usar ${item.nome}?`,
        text: detalhe,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Usar",
        cancelButtonText: "Cancelar",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      if (!c.isConfirmed) return;
    }

    // Cura com fórmula rola aqui; vai pra action e, se ela passar, pro chat.
    const { rolagens, publicar } = rolarCuras(
      curasComFormula(efeitos, !!extraCura.texto),
      (valor) => resolverFormula(valor, atributos, nivel),
      item.nome,
      extraCura,
    );
    const deltas = computarDeltasInstantaneos(efeitos, {
      incluirMax: false,
      rolagens,
      ctx: efeitosAgregados.ctxFormula,
    });
    if (!alvoId) {
      const deltaPersonagem = {
        deltaHpAtual: deltas.hpAtual || undefined,
        concedeHpTemp: deltas.hpTemp || undefined,
        deltaPpAtual: deltas.ppAtual || undefined,
        deltaExaustao: deltas.exaustao || undefined,
      };
      if (Object.values(deltaPersonagem).some((v) => v !== undefined)) {
        window.dispatchEvent(new CustomEvent("rpgo:patch-personagem", { detail: deltaPersonagem }));
      }
    }
    if (Object.keys(deltas.recursos).length > 0) {
      window.dispatchEvent(new CustomEvent("rpgo:patch-recurso", { detail: deltas.recursos }));
    }

    startTransition(async () => {
      aplicarOtimista(
        qtd > 1
          ? { kind: "update", id: item.id, patch: { quantidade: qtd - 1 } }
          : { kind: "delete", id: item.id },
      );
      try {
        exigir(await usarItem(personagemId, item.id, rolagens, alvoId));
        publicar();
      } catch (err) {
        // Recarrega a página pra desfazer o otimismo.
        atualizar();
        mostrarErro(err);
      }
    });
  }

  // Acerto e dano da arma (o dano usa o atributo do acerto).
  function calcArma(item: Item): ArmaResolvida {
    if (item.tipo !== "arma") return null;
    const municao = municaoDaArma(item, itensNaTela, gastoMunicao);
    // Ficha + efeitos de rolagem da arma.
    const agg = efeitosComArma(efeitosAgregados, item);
    const r = resolverAtaqueArma({
      alcanceRaw: item.alcance,
      propriedadesRaw: item.propriedades,
      atributoOverride: item.atributoAtaque,
      modificadorArma: item.modificador || 0,
      proficiente: item.proficienteArma,
      atributos: atributosParaTeste,
      nivel,
      efeitosAgregados: agg,
      favorita: item.armaFavorita,
    });
    if (!r) return null;
    const dano = resolverDanoArma({
      danoBase: danoComMunicao(item.dano, municao),
      danoBonus: item.danoBonus,
      passos: agg.passosDanoArma.valor,
      somaAtributo: item.danoSomaAtributo,
      atributoDano: r.atributo,
      atributos: atributosParaTeste,
      nivel,
      proficiencia: item.danoSomaProficiencia ? bonusProficiencia(nivel) : 0,
      alcance: r.alcance,
      efeitosAgregados: agg,
      dadoFixo: agg.dadoArmaFixo?.formula,
      favorita: item.armaFavorita,
    });
    return {
      ataque: {
        atributo: r.atributo,
        bonus: r.bonus - penD20,
        fontesHab: r.fontes.length ? r.fontes : undefined,
        exausto: penD20 > 0 || (r.atributo === "destreza" && desReduz),
      },
      dano,
      alcance: r.alcance,
      efeitos: efeitosDoContexto(agg),
      municao,
    };
  }

  // O que cada item concede, por itemId.
  const concedidosPorItem = new Map<string, Concedidos>();
  for (const [lista, chave] of [
    [acoes, "acoes"],
    [habilidades, "habilidades"],
  ] as const) {
    for (const c of lista) {
      if (!c.itemId) continue;
      const atual = concedidosPorItem.get(c.itemId) ?? { acoes: [], habilidades: [] };
      atual[chave].push(c.nome);
      concedidosPorItem.set(c.itemId, atual);
    }
  }

  // Carga conta cada unidade da pilha.
  const pesoTotal = itensNaTela.reduce(
    (acc, i) => acc + (Number(i.peso) || 0) * (quantidadeDe(i) - gastoMunicao(i.id)),
    0,
  );
  // Carga base + bônus aditivos × fator multiplicativo (Espécie Gigante etc).
  const multCarga = efeitosAgregados.multiplicadores.carga;
  const maxPesoBase = (cargaMaxima || 20) + efeitosAgregados.bonusCarga.valor;
  const maxPeso = multCarga ? maxPesoBase * multCarga.fator : maxPesoBase;
  const pesoPct = Math.min(100, (pesoTotal / maxPeso) * 100);

  let corBarra = "var(--success)";
  let msgSobrecarga: string | null = null;
  if (pesoPct >= 100) {
    corBarra = "var(--danger)";
    msgSobrecarga = "LIMITE ATINGIDO!";
  } else if (pesoPct >= 90) {
    corBarra = "var(--danger)";
    msgSobrecarga = "SOBRECARGA";
  } else if (pesoPct >= 75) {
    corBarra = "color-mix(in oklch, var(--warning) 30%, var(--danger))";
    msgSobrecarga = "SOBRECARGA";
  } else if (pesoPct > 50) {
    corBarra = "color-mix(in oklch, var(--warning) 60%, var(--danger))";
    msgSobrecarga = "SOBRECARGA";
  } else if (pesoPct >= 25) {
    corBarra = "var(--warning)";
  }

  // Na ordem arrastada; quem nunca foi arrastado (ordem 0) vai pro fim, em ordem alfabética.
  const porOrdem = [...itensNaTela].sort(
    (a, b) =>
      (a.ordem || Number.MAX_SAFE_INTEGER) - (b.ordem || Number.MAX_SAFE_INTEGER) || a.nome.localeCompare(b.nome),
  );
  // Reordenar arrastando (lib/use-reordenar.ts), só dentro da categoria: ela
  // vem do tipo do item, que arrastar não deve trocar.
  const reordenar = useReordenar({
    itens: porOrdem.filter((i) => !ehTemporario(i.id)).map((i) => ({ id: i.id, grupo: categoriaDoItem(i.tipo) })),
    mudaGrupo: false,
    aoSoltar: (lista) => {
      const ids = lista.map((x) => x.id);
      startTransition(async () => {
        aplicarOtimista({ kind: "reordenar", ids });
        try {
          exigir(await reordenarItens(personagemId, ids));
        } catch (err) {
          atualizar();
          mostrarErro(err);
        }
      });
    },
  });
  const ordenados = reordenar.ordenar(porOrdem);

  // Pastas da ficha, filtros e busca.
  const pastas = pastasDe(itensNaTela);
  const nomesDasPastas = pastas.map((p) => p.nome);
  const pastaAtiva = pastas.some((p) => p.nome === pastaFiltro) ? pastaFiltro : null;
  const opcoesTag = tagsDaFicha(itens).map((t) => [t.nome, t.nome] as const);
  const tagAtiva = opcoesTag.some(([t]) => t === tagFiltro) ? tagFiltro : null;
  const casaFiltro = (i: Item) =>
    filtro === "equipados"
      ? i.equipado
      : filtro === "favoritos"
        ? i.favorito
        : filtro === "usaveis"
          ? lerEfeitos(i.efeitos).some(efeitoInstantaneo)
          : true;
  const visiveis = ordenados.filter(
    (i) =>
      casaFiltro(i) &&
      (!tipoFiltro || i.tipo === tipoFiltro) &&
      (!tagAtiva || separarTags(i.tags).includes(tagAtiva)) &&
      (!pastaAtiva || i.pasta === pastaAtiva) &&
      casaBusca(busca, [i.nome, i.tags, i.descricao, i.dano, i.pasta]),
  );
  const filtrando = filtro !== "todos" || !!tipoFiltro || !!tagAtiva || !!pastaAtiva || busca.trim() !== "";
  // Destaques ficam fora das seções; filtrando, cada item aparece no lugar dele.
  const favoritos = filtrando ? [] : visiveis.filter((i) => i.favorito);
  const nasSecoes = filtrando ? visiveis : visiveis.filter((i) => !i.favorito);

  // Filtrando, a lista está incompleta: não arrasta.
  const card = (item: Item, arrasta: boolean) => (
    <CardItem
      key={item.id}
      item={item}
      reordenar={
        arrasta && !filtrando && !ehTemporario(item.id)
          ? { item: reordenar.item(item.id), alca: reordenar.alca(item.id), vaga: reordenar.vaga(item.id) }
          : undefined
      }
      arma={calcArma(item)}
      concedidos={concedidosPorItem.get(item.id)}
      personagemId={personagemId}
      pastasDaFicha={nomesDasPastas}
      podePassar={alvo.temAliados}
      onToggleFavorito={() => toggleFavorito(item)}
      onToggleEquipar={() => toggleEquipar(item)}
      onUsar={() => usar(item)}
      onEdit={() => abrirEdit(item)}
      onDelete={() => apagar(item.id)}
      onQuantidade={(n) => mudarQuantidade(item, n)}
      onEfeitos={(efeitos) => mudarEfeitos(item, efeitos)}
      onPasta={(pasta) => guardarEmPasta(item, pasta)}
      onFiltrarPasta={setPastaFiltro}
      onPassar={() => passar(item)}
      gasto={gastoMunicao(item.id)}
    />
  );

  return (
    <ContextoDescricaoCtx.Provider value={contextoBaseRico}>
    <AcoesDaFichaContext.Provider value={acoesFicha.map((a) => ({ id: a.id, nome: a.nome, tipo: a.tipo }))}>
    <GruposEfeitoContext.Provider value={gruposDosEfeitos(itensNaTela)}>
    <ItensDaFichaContext.Provider value={itensNaTela.map((i) => ({ id: i.id, nome: i.nome, tipo: i.tipo }))}>
    <NomesRecursoContext.Provider value={new Map(recursos.map((r) => [r.id, r.nome]))}>
    <FormulaContext.Provider value={ctxFormula}>
      <div>
      <div className="tab-topo">
        <h1>Inventário</h1>
        <BerriesControle personagemId={personagemId} berries={berries} />
        <div className="tab-topo-botoes">
          <BotaoPacotes />
          <button type="button" className="btn-rect primary" onClick={abrirNovo}>
            + Novo Item
          </button>
        </div>
      </div>

      <div className="bar-group peso-bar">
        <div className="bar-label">
          <span><i className="fas fa-scale-balanced" /> Carga</span>
          <div className="stat-values">
            <span>{pesoTotal.toFixed(1)}</span> /{" "}
            <EditableStat personagemId={personagemId} campo="cargaMaxima" valor={cargaMaxima} />
            {efeitosAgregados.bonusCarga.fontes.length > 0 && (
              <Tooltip
                titulo="Carga"
                icone="fa-scale-balanced"
                texto={`${formatarMod(efeitosAgregados.bonusCarga.valor)} de ${efeitosAgregados.bonusCarga.fontes.join(", ")}`}
              >
                <span>
                  {" "}
                  {efeitosAgregados.bonusCarga.valor > 0 ? "+" : ""}
                  {efeitosAgregados.bonusCarga.valor}
                  <i className="fas fa-link prof-fonte" />
                </span>
              </Tooltip>
            )}
            {multCarga && (
              <Tooltip titulo="Carga" icone="fa-scale-balanced" texto={`×${multCarga.fator} de ${multCarga.fontes.join(", ")}`}>
                <span>
                  {" "}×{multCarga.fator}
                  <i className="fas fa-link prof-fonte" />
                </span>
              </Tooltip>
            )}
            {" "}PC
          </div>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pesoPct}%`, background: corBarra }} />
        </div>
        {msgSobrecarga && (
          <div className="msg-sobrecarga">
            <i className="fas fa-triangle-exclamation" /> {msgSobrecarga}
          </div>
        )}
      </div>

      <BarraFiltros
        busca={busca}
        onBusca={setBusca}
        rotulo="item"
        filtros={FILTROS}
        filtro={filtro}
        onFiltro={setFiltro}
        pastas={pastas}
        pasta={pastaAtiva}
        onPasta={setPastaFiltro}
        grupos={[
          { rotulo: "Tipo", opcoes: FILTROS_TIPO, valor: tipoFiltro, onValor: setTipoFiltro },
          ...(opcoesTag.length > 0
            ? [{ rotulo: "Tag", opcoes: opcoesTag, valor: tagAtiva, onValor: setTagFiltro }]
            : []),
        ]}
      />

      {favoritos.length > 0 && (
        <SecaoRecolhivel
          chave="itens:destaques"
          icone="fa-star"
          cor="var(--highlight)"
          titulo="Destaques"
          contagem={favoritos.length}
        >
          <div className="action-grid">{favoritos.map((item) => card(item, false))}</div>
        </SecaoRecolhivel>
      )}

      {SECOES.map((secao) => {
        const lista = nasSecoes.filter((i) => categoriaDoItem(i.tipo) === secao.categoria);
        if (lista.length === 0) return null;
        return (
          <SecaoRecolhivel
            key={secao.categoria}
            chave={`itens:${secao.categoria}`}
            icone={secao.icone}
            cor={secao.cor}
            titulo={secao.titulo}
            contagem={lista.length}
            forcarAberta={filtrando}
          >
            <div
              className={`action-grid reordenar-zona${reordenar.recebendo(secao.categoria)}`}
              {...reordenar.zona(secao.categoria)}
            >
              {lista.map((item) => card(item, true))}
            </div>
          </SecaoRecolhivel>
        );
      })}

      {visiveis.length === 0 && (
        <p className="inv-vazio">{filtrando ? "Nada encontrado." : "Inventário vazio."}</p>
      )}

      {alvo.modal}

      {modalAberto && (
        <div className="modal-overlay" onClick={fechar}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" onClick={fechar} aria-label="Fechar">
              <i className="fas fa-times" />
            </button>
            <h2>{form.id ? "Editar Item" : "Novo Item"}</h2>

            <div className="tipo-cards tipo-cards-2">
              {(
                [
                  ["comum", "fa-bag-shopping", "Item Comum", "Mochila, ferramenta, consumível"],
                  ["arma", "fa-khanda", "Arma", "Define ataque, dano, propriedades"],
                  ["municao", "fa-circle-dot", "Munição", "Flecha, bala, dardo"],
                  ["armadura", "fa-shield-alt", "Armadura", "Soma CA na sua CR"],
                ] as const
              ).map(([slug, icone, titulo, sub]) => (
                <button
                  type="button"
                  key={slug}
                  className={`tipo-card ${form.tipo === slug ? "ativo" : ""}`}
                  aria-pressed={form.tipo === slug}
                  onClick={() => set("tipo", slug)}
                >
                  <span className="tipo-card-icone">
                    <i className={`fas ${icone}`} />
                  </span>
                  <span className="tipo-card-titulo">{titulo}</span>
                  <span className="tipo-card-sub">{sub}</span>
                </button>
              ))}
            </div>

            <form onSubmit={salvar}>
              <label>Nome do Item</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => set("nome", e.target.value)}
                placeholder={
                  form.tipo === "arma"
                    ? "Ex: Espada Longa"
                    : form.tipo === "municao"
                      ? "Ex: Flecha"
                      : form.tipo === "armadura"
                        ? "Ex: Cota de Malha"
                        : "Ex: Poção de Cura"
                }
                autoFocus
              />

              <div className="campo-duo">
                <div>
                  <label>Peso por unidade (PC)</label>
                  <input type="number" step="0.1" value={form.peso} onChange={(e) => set("peso", e.target.value)} />
                </div>
                <div>
                  <label>Quantidade</label>
                  <input
                    type="number"
                    min={form.tipo === "municao" ? 0 : 1}
                    value={form.quantidade}
                    onChange={(e) => set("quantidade", e.target.value)}
                    placeholder="1"
                  />
                </div>
              </div>

              <SecaoModal titulo="Descrição" icone="fa-align-left" aberta resumo={form.tags || undefined}>
                <EditorRico
                  valor={form.descricao}
                  onChange={(t) => set("descricao", t)}
                  refs={[
                    ...acoesFicha.map((x) => ({ tipo: "acao" as const, id: x.id, nome: x.nome })),
                    ...habilidades.map((h) => ({ tipo: "hab" as const, id: h.id, nome: h.nome })),
                    ...itens.filter((i) => i.id !== form.id).map((i) => ({ tipo: "item" as const, id: i.id, nome: i.nome })),
                  ]}
                  condicoes={condicoesCatalogoNomes(contextoBaseRico)}
                  contexto={{ ...contextoBaseRico, nomeRolagem: form.nome }}
                  placeholder="Descrição do item… (@ insere, / blocos)"
                />
                <label>Tags</label>
                <TagsEditor
                  tags={form.tags}
                  estilos={form.tagsEstilo}
                  onTags={(v) => set("tags", v)}
                  onEstilos={(v) => set("tagsEstilo", v)}
                  placeholder="Ex: Cortante, Duas Mãos, Raro"
                  classePadraoChip="tag-damage"
                />
              </SecaoModal>

              {form.tipo === "municao" && (
                <SecaoModal
                  titulo="Dano"
                  icone="fa-burst"
                  aberta
                  resumo={juntarTipoNoDano(form.dano, form.tipoDano) || undefined}
                >
                  <CampoFormula
                    label="Dano da munição"
                    valor={form.dano}
                    onChange={(v) => set("dano", v)}
                    placeholder="1d6"
                    dados
                  />
                  {form.dano.trim() && (
                    <TipoDanoCampo valor={form.tipoDano} onChange={(t) => set("tipoDano", t)} />
                  )}
                </SecaoModal>
              )}

              {form.tipo === "arma" && (
                <>
                  <SecaoModal
                    titulo="Ataque"
                    icone="fa-crosshairs"
                    aberta
                    resumo={[CATEGORIAS_ARMA.find((c) => c.slug === form.categoria)?.nome, form.alcanceMetros]
                      .filter(Boolean)
                      .join(" · ")}
                  >
                    <label>Categoria</label>
                    <div className="categoria-pills">
                      {CATEGORIAS_ARMA.map((c) => (
                        <button
                          type="button"
                          key={c.slug}
                          className={`categoria-pill ${form.categoria === c.slug ? "ativo" : ""}`}
                          aria-pressed={form.categoria === c.slug}
                          onClick={() => set("categoria", c.slug)}
                        >
                          <i className={`fas ${c.icone}`} />
                          <span>{c.nome}</span>
                        </button>
                      ))}
                    </div>

                    <label>Alcance</label>
                    <div className="categoria-pills">
                      {ALCANCES_ARMA.map((a) => (
                        <button
                          type="button"
                          key={a.slug}
                          className={`categoria-pill ${form.alcance === a.slug ? "ativo" : ""}`}
                          aria-pressed={form.alcance === a.slug}
                          onClick={() => set("alcance", a.slug)}
                        >
                          <i className={`fas ${a.icone}`} />
                          <span>{a.nome}</span>
                        </button>
                      ))}
                    </div>

                    <label>Alcance em metros</label>
                    <input
                      type="text"
                      value={form.alcanceMetros}
                      onChange={(e) => set("alcanceMetros", e.target.value)}
                      placeholder={form.alcance === "distancia" ? "Ex: 9/15 m" : "Ex: 1,5 m"}
                    />

                    <div className="campo-duo">
                      <div>
                        <label>Atributo de Ataque</label>
                        <select value={form.atributoAtaque} onChange={(e) => set("atributoAtaque", e.target.value)}>
                          <option value="">Automático</option>
                          {ATRIBUTOS.map((a) => (
                            <option key={a.slug} value={a.slug}>
                              {a.sigla} — {a.nome}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label>Bônus de acerto</label>
                        <input
                          type="number"
                          value={form.modificador}
                          onChange={(e) => set("modificador", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div className="sugestoes item-opcoes">
                      <button
                        type="button"
                        className={`sugestao chip-opcao ${form.proficienteArma ? "ativo" : ""}`}
                        aria-pressed={form.proficienteArma}
                        onClick={() => set("proficienteArma", !form.proficienteArma)}
                      >
                        <i className="fas fa-graduation-cap" /> Proficiente
                      </button>
                      <button
                        type="button"
                        className={`sugestao chip-opcao ${form.armaFavorita ? "ativo" : ""}`}
                        aria-pressed={form.armaFavorita}
                        onClick={() => set("armaFavorita", !form.armaFavorita)}
                      >
                        <i className="fas fa-heart" /> Arma favorita
                      </button>
                    </div>
                  </SecaoModal>

                  <SecaoModal
                    titulo="Dano"
                    icone="fa-burst"
                    aberta
                    resumo={
                      [juntarTipoNoDano(form.dano, form.tipoDano), juntarTipoNoDano(form.danoBonus, form.tipoBonus)]
                        .filter(Boolean)
                        .join(" + ") || undefined
                    }
                  >
                    <CampoFormula
                      label="Dado de dano"
                      valor={form.dano}
                      onChange={(v) => set("dano", v)}
                      placeholder={form.propriedades.includes("municao") ? "Da munição" : "1d8"}
                      dados
                    />
                    {form.dano.trim() && (
                      <TipoDanoCampo valor={form.tipoDano} onChange={(t) => set("tipoDano", t)} />
                    )}
                    <CampoFormula
                      label="Dano bônus"
                      valor={form.danoBonus}
                      onChange={(v) => set("danoBonus", v)}
                      placeholder="Ex: 1d6"
                      dados
                    />
                    {form.danoBonus.trim() && (
                      <TipoDanoCampo
                        valor={form.tipoBonus}
                        onChange={(t) => set("tipoBonus", t)}
                        rotulo="Tipo do dano bônus"
                      />
                    )}
                    <div className="sugestoes item-opcoes">
                      <button
                        type="button"
                        className={`sugestao chip-opcao ${form.danoSomaAtributo ? "ativo" : ""}`}
                        aria-pressed={form.danoSomaAtributo}
                        onClick={() => set("danoSomaAtributo", !form.danoSomaAtributo)}
                      >
                        <i className="fas fa-dumbbell" /> Soma o atributo
                      </button>
                      <button
                        type="button"
                        className={`sugestao chip-opcao ${form.danoSomaProficiencia ? "ativo" : ""}`}
                        aria-pressed={form.danoSomaProficiencia}
                        onClick={() => set("danoSomaProficiencia", !form.danoSomaProficiencia)}
                      >
                        <i className="fas fa-graduation-cap" /> Soma a proficiência
                      </button>
                    </div>
                  </SecaoModal>

                  <SecaoModal
                    titulo="Propriedades"
                    icone="fa-tags"
                    aberta={form.propriedades.length > 0}
                    resumo={
                      form.propriedades
                        .map((slug) => PROPRIEDADES_ARMA.find((x) => x.slug === slug)?.nome)
                        .filter(Boolean)
                        .join(", ") || undefined
                    }
                  >
                    <div className="propriedades-pills">
                      {PROPRIEDADES_ARMA.map((prop) => {
                        const ativo = form.propriedades.includes(prop.slug);
                        return (
                          <button
                            type="button"
                            key={prop.slug}
                            className={`propriedade-pill ${ativo ? "ativo" : ""}`}
                            aria-pressed={ativo}
                            onClick={() =>
                              set(
                                "propriedades",
                                ativo ? form.propriedades.filter((x) => x !== prop.slug) : [...form.propriedades, prop.slug],
                              )
                            }
                          >
                            <i className={`fas ${prop.icone}`} />
                            <span>{prop.nome}</span>
                          </button>
                        );
                      })}
                    </div>

                    {form.propriedades.includes("municao") && (
                      <>
                        <label>Munição</label>
                        <SeletorUnico
                          rotulo="munição"
                          vazio="Nenhuma munição no inventário."
                          marcado={form.municaoId}
                          onChange={(id) => set("municaoId", id)}
                          opcoes={itensOtimistas
                            .filter((i) => i.tipo === "municao")
                            .map((i) => ({
                              id: i.id,
                              nome: i.nome,
                              icone: "fa-circle-dot",
                              detalhe: [i.dano, `×${quantidadeDe(i)}`].filter(Boolean).join(" · "),
                              inativo: quantidadeDe(i) <= 0,
                            }))}
                        />
                      </>
                    )}
                  </SecaoModal>
                </>
              )}

              {form.tipo === "armadura" && (
                <SecaoModal
                  titulo="Defesa"
                  icone="fa-shield-alt"
                  aberta
                  resumo={Number(form.ca) ? `+${Number(form.ca)} CA` : undefined}
                >
                  <div className="campo-duo">
                    <div>
                      <label>Bônus de CA</label>
                      <input type="number" value={form.ca} onChange={(e) => set("ca", e.target.value)} placeholder="2" />
                    </div>
                    <div>
                      <label>Penalidade DES</label>
                      <input
                        type="number"
                        value={form.penalidadeDes}
                        onChange={(e) => set("penalidadeDes", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </SecaoModal>
              )}

              <SecaoModal
                titulo={`Efeitos (${form.efeitos.filter((e) => e.tipo !== "por_turno").length})`}
                icone="fa-list-check"
                aberta={form.efeitos.length > 0}
              >
                <EfeitosEditor
                  efeitos={form.efeitos}
                  onChange={(v) => set("efeitos", v)}
                  recursos={recursos}
                  pergunta="O que esse item faz?"
                />
                <ACadaTurnoCampo
                  lista={porTurnoDe(form.efeitos)}
                  onChange={(lista) => set("efeitos", comPorTurno(form.efeitos, lista))}
                  recursos={recursos}
                />
              </SecaoModal>

              <div className="modal-actions">
                <button type="button" className="modal-btn-cancel" onClick={fechar}>
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
    </ItensDaFichaContext.Provider>
    </GruposEfeitoContext.Provider>
    </AcoesDaFichaContext.Provider>
    </ContextoDescricaoCtx.Provider>
  );
}

// ─── Sub-componentes ────────────────────────────────────────

type Ataque = {
  atributo: Atributo;
  bonus: number;
  fontesHab?: string[];
  exausto?: boolean;
};

// Tudo que o card precisa pra desenhar (e rolar) uma arma.
type ArmaResolvida = {
  ataque: Ataque;
  dano: DanoArmaResolvido | null;
  alcance: "corpo_a_corpo" | "distancia";
  // Efeitos que viajam com a rolagem até o Rolador (ficha + arma).
  efeitos: EfeitosContexto;
  municao: MunicaoDaArma;
} | null;

type Concedidos = { acoes: string[]; habilidades: string[] };

type Traco = { icone: string; texto: string; titulo: string };

// O que o dano da arma leva além do dado base.
function tracosDaArma(item: Item): Traco[] {
  const tracos: Traco[] = [];
  if (item.danoBonus) {
    tracos.push({
      icone: "fa-fire",
      texto: `${item.danoBonus} de dano bônus`,
      titulo: "Dano extra desta arma — entra em todo ataque feito com ela",
    });
  }
  if (item.danoSomaProficiencia) {
    tracos.push({
      icone: "fa-graduation-cap",
      texto: "Proficiência no dano",
      titulo: "Soma o bônus de proficiência no dano dela, inclusive nas técnicas",
    });
  }
  return tracos;
}

function CardItem({
  item,
  arma,
  concedidos,
  personagemId,
  pastasDaFicha,
  podePassar,
  onToggleFavorito,
  onToggleEquipar,
  onUsar,
  onEdit,
  onDelete,
  onQuantidade,
  onEfeitos,
  onPasta,
  onFiltrarPasta,
  onPassar,
  gasto,
  reordenar,
}: {
  item: Item;
  personagemId: string;
  // Pastas que já existem na ficha.
  pastasDaFicha: string[];
  // Tem pra quem passar (aliado, subficha ou o dono).
  podePassar: boolean;
  onPasta: (pasta: string | null) => void;
  onFiltrarPasta: (pasta: string) => void;
  onPassar: () => void;
  // Arrastar pra reordenar: props do item, da alça e a classe da vaga.
  reordenar?: { item: object; alca: object; vaga: string };
  arma: ArmaResolvida;
  concedidos?: Concedidos;
  onToggleFavorito: () => void;
  onToggleEquipar: () => void;
  onUsar: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onQuantidade: (n: number) => void;
  // Contador do bônus progressivo mudou.
  onEfeitos: (efeitos: EfeitoHabilidade[]) => void;
  // Munição gasta que o servidor ainda não contou.
  gasto: number;
}) {
  const efeitos = lerEfeitos(item.efeitos);
  const contextoBase = useContext(ContextoDescricaoCtx);
  const contextoDoItem = useMemo(() => ({ ...contextoBase, nomeRolagem: item.nome }), [contextoBase, item.nome]);
  // Efeito na hora (cura, PV temporário, recurso) é de usar e gastar; o resto vale equipado.
  const usavel = efeitos.some(efeitoInstantaneo);
  const nEquipado = efeitos.filter((e) => !efeitoInstantaneo(e)).length;
  const nConcedido =
    (concedidos?.acoes.length ?? 0) + (concedidos?.habilidades.length ?? 0);
  // Arma e armadura sempre equipam; item comum, se tiver efeito ou concessão.
  const equipavel =
    item.tipo === "arma" ||
    item.tipo === "armadura" ||
    nEquipado > 0 ||
    nConcedido > 0;
  // Efeitos e concessões só valem equipados; desequipado o card mostra apagado.
  const inativo = equipavel && !item.equipado && (nEquipado > 0 || nConcedido > 0);
  const estilosTag = lerEstilosTag(item.tagsEstilo);
  const ehMunicao = item.tipo === "municao";
  const qtd = quantidadeDe(item) - (ehMunicao ? gasto : 0);
  const ataque = arma?.ataque ?? null;
  const dano = arma?.dano ?? null;
  const tracos = item.tipo === "arma" ? tracosDaArma(item) : [];
  const municao = arma?.municao;
  // Arma de munição sem munição não ataca.
  const semMunicao = !!municao?.usa && (!municao.item || municao.restante <= 0);
  return (
    <div
      className={`action-card type-comum ${item.equipado ? "item-equipado" : ""} ${item.favorito ? "item-favorito" : ""} ${ehTemporario(item.id) ? "item-pendente" : ""}${reordenar ? " com-alca" : ""}${reordenar?.vaga ?? ""}`}
      inert={ehTemporario(item.id)}
      {...reordenar?.item}
    >
      {reordenar && (
        <button
          type="button"
          className="btn-card-alca"
          title="Arraste pra mudar a ordem (ou use as setas)"
          aria-label={`Mudar ${item.nome} de posição`}
          {...reordenar.alca}
        >
          <i className="fas fa-grip-vertical" />
        </button>
      )}
      <div className="item-card-topo">
        <div className="card-title">
          <button
            type="button"
            className={`btn-favorito ${item.favorito ? "ativo" : ""}`}
            onClick={onToggleFavorito}
            title={item.favorito ? "Desfavoritar" : "Favoritar"}
          >
            <i className="fas fa-star" />
          </button>
          {item.nome}{" "}
          {qtd > 1 && !ehMunicao && <span className="item-qtd">×{qtd}</span>}{" "}
          {item.equipado && <i className="fas fa-check-circle item-equipado-marca" />}
        </div>
        <div className="item-peso">
          {qtd === 1 ? item.peso : Number((item.peso * qtd).toFixed(1))} PC
        </div>
      </div>

      {item.tipo === "arma" && (ataque || dano) && (
        <div className="acao-stats item-stats">
          {ataque && (
            <button
              type="button"
              className={`acao-stat acao-rolar ${ataque.exausto ? "valor-exausto" : ""}`}
              disabled={semMunicao}
              title={
                [
                  semMunicao ? "Sem munição" : "Empilhar ataque no Rolador",
                  ataque.fontesHab?.length ? `inclui bônus de ${ataque.fontesHab.join(", ")}` : null,
                  ataque.exausto ? "reduzido por penalidade ativa (exaustão/armadura)" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              }
              onClick={() =>
                empilharD20(
                  ataque.bonus,
                  `Atacar ${item.nome}`,
                  {
                    tipo: "ataque",
                    alcance: arma?.alcance ?? "corpo_a_corpo",
                    // Atacar direto com a arma: o Multiataque vale.
                    multiataque: true,
                    favorita: item.armaFavorita,
                    ...(municao?.item ? { municao: { id: municao.item.id, nome: municao.item.nome } } : {}),
                  },
                  arma?.efeitos,
                )
              }
            >
              <i className="fas fa-crosshairs" /> Acerto{" "}
              <strong>{formatarMod(ataque.bonus)}</strong>{" "}
              <span className="item-stat-sigla">({SIGLA_ATRIBUTO[ataque.atributo]})</span>
              {ataque.fontesHab?.length ? <i className="fas fa-link prof-fonte" /> : null}
              {ataque.exausto && <MarcaExausto titulo="Reduzido por exaustão" />}
            </button>
          )}
          {dano &&
            (dano.rolavel ? (
              <button
                type="button"
                className="acao-stat acao-rolar"
                title={`Empilhar dano no Rolador · ${dano.partes
                  .map((x) => `${x.rotulo}: ${x.texto}`)
                  .join(" · ")}`}
                onClick={() =>
                  empilharRolagem({
                    dados: dano.dados,
                    modificador: dano.modificador,
                    nomePreset: `Dano ${item.nome}`,
                    contexto: {
                      tipo: "dano",
                      alcance: arma?.alcance ?? "corpo_a_corpo",
                      favorita: item.armaFavorita,
                      tiposDano: juntarTipos(
                        tiposDoDano((municao ? danoComMunicao(item.dano, municao) : item.dano) ?? ""),
                        tiposDoDano(item.danoBonus ?? ""),
                      ),
                    },
                    efeitos: arma?.efeitos,
                  })
                }
              >
                <i className="fas fa-burst" /> {dano.formula}
                {dano.partes.length > 1 && <i className="fas fa-link prof-fonte" />}
              </button>
            ) : (
              <span className="acao-stat">
                <i className="fas fa-burst" /> {item.dano}
              </span>
            ))}
          {item.alcanceMetros && (
            <span className="acao-stat">
              <i className="fas fa-ruler-horizontal" /> {item.alcanceMetros}
            </span>
          )}
          {municao?.usa && (
            <span
              className={`acao-stat${semMunicao ? " sem-municao" : ""}`}
              title={municao.item ? "Munição desta arma" : "Escolha a munição na edição da arma"}
            >
              <i className="fas fa-circle-dot" /> {textoMunicao(municao)}
            </span>
          )}
        </div>
      )}
      {ehMunicao && (
        <div className="acao-stats item-stats municao-stats">
          {item.dano && (
            <span className="acao-stat">
              <i className="fas fa-burst" /> {item.dano}
            </span>
          )}
          <CampoPasso
            valor={qtd}
            min={0}
            max={99999}
            rotulo={`Quantidade de ${item.nome}`}
            onChange={onQuantidade}
          />
        </div>
      )}
      {tracos.length > 0 && (
        <div className="item-tracos">
          {tracos.map((t) => (
            <Tooltip key={t.icone} titulo={t.texto} icone={t.icone} texto={t.titulo}>
              <span className="item-traco">
                <i className={`fas ${t.icone}`} /> {t.texto}
              </span>
            </Tooltip>
          ))}
        </div>
      )}
      {item.tipo === "armadura" && (item.ca > 0 || item.penalidadeDes !== 0) && (
        <div className="item-armadura">
          {item.ca > 0 && (
            <span>
              <i className="fas fa-shield-alt" /> +{item.ca} CA
            </span>
          )}
          {item.penalidadeDes !== 0 && (
            <span>{item.penalidadeDes > 0 ? `+${item.penalidadeDes}` : item.penalidadeDes} DES</span>
          )}
          {item.equipado && <span className="item-armadura-nota">· ativa na CR</span>}
        </div>
      )}

      {(efeitos.length > 0 || nConcedido > 0) && (
        <div className={`item-concessoes ${inativo ? "inativo" : ""}`}>
          {inativo && (
            <div className="item-concessoes-aviso">
              <i className="fas fa-lock" /> equipe pra ativar
            </div>
          )}
          {efeitos.length > 0 && (
            <div className="efeito-chips">
              {efeitos.map((e, i) => (
                <ChipEfeito key={i} efeito={e} />
              ))}
            </div>
          )}
          <PassosProgressivos efeitos={efeitos} onChange={onEfeitos} />
          {nConcedido > 0 && (
            <div className="card-tags">
              {concedidos?.acoes.map((n) => (
                <span key={`a-${n}`} className="tag tag-custo" title="Ação deste item">
                  <i className="fas fa-gavel" /> {n}
                </span>
              ))}
              {concedidos?.habilidades.map((n) => (
                <span key={`h-${n}`} className="tag tag-custo" title="Habilidade deste item">
                  <i className="fas fa-star" /> {n}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {item.descricao && (
        <DescricaoCard texto={item.descricao} contexto={contextoDoItem} />
      )}

      {(item.tags || item.pasta || item.armaFavorita) && (
        <div className="card-tags">
          {item.armaFavorita && (
            <span className="tag tag-custo" title="Arma favorita">
              <i className="fas fa-heart" /> Arma favorita
            </span>
          )}
          {separarTags(item.tags ?? "").map((t, i) => (
            <TagChip
              key={i}
              nome={t}
              estilo={estilosTag[t]}
              classePadrao="tag tag-damage"
            />
          ))}
          {item.pasta && (
            <button
              type="button"
              className="tag tag-pasta"
              title="Filtrar por esta pasta"
              onClick={() => onFiltrarPasta(item.pasta!)}
            >
              <i className="fas fa-folder" /> {item.pasta}
            </button>
          )}
        </div>
      )}

      <div className="item-card-actions">
        {usavel && (
          <button type="button" className="hab-usar" onClick={onUsar}>
            <i className="fas fa-play" /> Usar
          </button>
        )}
        {equipavel && (
          <button
            type="button"
            className={`btn-rect outline sm ${item.equipado ? "active" : ""}`}
            onClick={onToggleEquipar}
          >
            {item.equipado ? "Desequipar" : "Equipar"}
          </button>
        )}
        {podePassar && (
          <button
            type="button"
            className="btn-edit-item"
            onClick={onPassar}
            title="Passar pra outra ficha"
            aria-label={`Passar ${item.nome}`}
          >
            <i className="fas fa-hand-holding-hand" />
          </button>
        )}
        <BotaoGuardar
          origem={{ nome: item.nome, pasta: item.pasta ?? null }}
          personagemId={personagemId}
          pastasDaFicha={pastasDaFicha}
          sugestoes={separarTags(item.tags ?? "")}
          onGuardar={onPasta}
          soFicha
          classe="btn-edit-item"
        />
        <button type="button" className="btn-edit-item" onClick={onEdit} title="Editar" aria-label={`Editar ${item.nome}`}>
          <i className="fas fa-edit" />
        </button>
        <button
          type="button"
          className="btn-edit-item perigo"
          onClick={onDelete}
          title="Apagar"
          aria-label={`Apagar ${item.nome}`}
        >
          <i className="fas fa-trash" />
        </button>
      </div>
    </div>
  );
}
