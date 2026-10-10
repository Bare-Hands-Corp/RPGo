"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { BotaoVoltar } from "@/components/botao-voltar";
import { EditableStat } from "./editable-stat";
import { EditFichaModal } from "./edit-ficha-modal";
import { AvatarUploadModal } from "./avatar-upload-modal";
import { RecursosSidebar, type Recurso } from "./recursos-sidebar";
import { CrEditavel } from "./cr-editavel";
import { ExaustaoControle } from "./exaustao-controle";
import { DescansoControle } from "./descanso-controle";
import { NivelModal, type CamadaQueAbre } from "./nivel-modal";
import { VidaModal, type ModoVida } from "./vida-modal";
import { FaixaVitais } from "./faixa-vitais";
import { faixaPeDoNivel, pctPeDoNivel } from "@/lib/nivel";
import { MarcaExausto } from "./marca-exausto";
import { dispensarRecebida, encerrarConcentracao, passarTurno } from "./actions";
import { exigir } from "@/lib/acoes";
import { useRefreshAgrupado } from "@/lib/use-refresh-agrupado";
import {
  EVENTO_CONCENTRACAO,
  anunciarConcentracao,
  lerConcentracao,
  textoTurnosRestantes,
  type Concentracao,
} from "@/lib/duracao";
import { defesasDoAgregado, estaMorto, lerTiposSalvos, negativosAtuais } from "@/lib/dano";
import {
  aplicarTurno,
  anunciarTurnos,
  concentracaoEmCurso,
  duracoesEmCurso,
  facesDoTurno,
  porTurnoDaConcentracao,
  rolarTurno,
} from "@/lib/turno";
import {
  agregarEfeitos,
  fontesDeEfeitoDeItens,
  atributoDeCalculo,
  atributosEfetivos as somarBonusDeAtributo,
  bonusProficiencia,
  bonusTesteAmplo,
  crBase,
  deslocamentoEfetivo,
  exaustaoQueConta,
  fonteDeAliado,
  formatarMod,
  iniciativa,
  lerProficiencias,
  modificador,
  modoDosEfeitos,
  penalidadeD20Exaustao,
  poolsEfetivos,
  resolverFormula,
  resolverTeste,
  resumoEfeito,
  estadoDefesa,
  testePassivo,
  tetoAtributo,
  type Atributo,
  type DefesaAgregada,
  type EfeitosAgregados,
} from "@/lib/op-rpg";
import { anunciarMensagem, empilharD20 } from "@/lib/empilhar-rolagem";

type Personagem = {
  id: string;
  nome: string;
  nivel: number;
  pe: number;
  fotoUrl: string | null;
  hpAtual: number;
  hpMax: number;
  hpTemp: number;
  // Opcional: client Prisma antigo não traz a coluna.
  pvNegativos?: number;
  ppAtual: number;
  ppMax: number;
  exaustao: number;
  deslocamento: number;
  nado: number;
  forca: number;
  destreza: number;
  constituicao: number;
  sabedoria: number;
  vontade: number;
  presenca: number;
  proficiencias: unknown;
  berries: number;
  tipoDadoVida: string;
  dadosVidaGastos: number;
  crOutros: number;
  concentracao?: unknown;
  tiposDano?: unknown;
  recursos: Recurso[];
  itens: Array<{
    id: string;
    nome: string;
    tipo: string;
    equipado: boolean;
    ca: number;
    penalidadeDes: number;
    efeitos: unknown;
  }>;
};

// Habilidade crua o suficiente pra `agregarEfeitos` recomputar o agregado na
// sidebar (id pra casar com o overlay de `ligada`).
type HabSidebar = {
  id: string;
  nome: string;
  tipo: string;
  efeitos: unknown;
  ligada: boolean;
  itemId: string | null;
  aliado: boolean;
  duracao?: unknown;
  turnosRestantes?: number | null;
};

// Habilidade de um aliado ligada neste personagem.
type Recebida = { id: string; nome: string; de: string; efeitos: unknown };

function pct(atual: number, max: number): number {
  if (!max) return 0;
  return Math.max(0, Math.min(100, (atual / max) * 100));
}

const SIGLA_ATRIBUTO: Record<Atributo, string> = {
  forca: "FOR",
  destreza: "DES",
  constituicao: "CON",
  sabedoria: "SAB",
  vontade: "VON",
  presenca: "PRE",
};

// Ícone/rótulo dos modos de deslocamento especial (alinhado com o select do
// editor de efeitos em habilidades-tab). Tipo livre cai no fallback.
const ICONE_MOV: Record<string, string> = {
  voar: "fa-dove",
  nadar: "fa-person-swimming",
  escalar: "fa-person-hiking",
  cavar: "fa-shovel",
};
const ROTULO_MOV: Record<string, string> = {
  voar: "Voar",
  nadar: "Nadar",
  escalar: "Escalar",
  cavar: "Cavar",
};

// Voar/nadar/escalar/cavar: o maior entre efeito de deslocamento e valor fixo.
function modosDeDeslocamento(
  agg: EfeitosAgregados,
): Record<string, { valor: number; fontes: string[] }> {
  const out: Record<string, { valor: number; fontes: string[] }> = {};
  for (const [tipo, fv] of Object.entries(agg.deslocamentosExtra)) {
    if (fv) out[tipo] = fv;
  }
  for (const tipo of ["nadar", "voar", "escalar", "cavar"]) {
    const fixo = agg.valoresFixos[tipo];
    if (fixo && fixo.valor > (out[tipo]?.valor ?? 0)) out[tipo] = fixo;
  }
  return out;
}

function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

type PatchPersonagem = Partial<
  Pick<
    Personagem,
    | "nivel"
    | "pe"
    | "hpAtual"
    | "hpTemp"
    | "pvNegativos"
    | "hpMax"
    | "ppAtual"
    | "ppMax"
    | "tipoDadoVida"
    | "deslocamento"
    | "nado"
    | "exaustao"
    | "forca"
    | "destreza"
    | "constituicao"
    | "sabedoria"
    | "vontade"
    | "presenca"
    | "concentracao"
  >
>;

// Patch cross-tab via CustomEvent `rpgo:patch-personagem`. Deltas (somam ao
// valor atual) em vez de absolutos pra evitar precisar do snapshot completo
// do personagem em quem dispara (ex: HabilidadesTab).
type DeltaPersonagem = Partial<{
  deltaHpAtual: number;
  deltaPpAtual: number;
  deltaHpMax: number;
  deltaPpMax: number;
  // PV temporário concedido: fica o maior (não soma).
  concedeHpTemp: number;
  // Absoluto (não delta) — o ExaustaoControle manda o nível novo direto.
  exaustao: number;
  // Delta de exaustão (Sobrecarga, efeitos).
  deltaExaustao: number;
}>;

function aplicarDelta(
  shadow: PatchPersonagem,
  inicial: Personagem,
  delta: DeltaPersonagem,
  maximos: { hp: number; pp: number },
): PatchPersonagem {
  const next = { ...shadow };
  const valor = (campo: "hpAtual" | "hpTemp" | "ppAtual" | "hpMax" | "ppMax") =>
    next[campo] ?? inicial[campo];
  // Ganho para no máximo (sem derrubar o que já estava acima); perda para em 0.
  const soma = (campo: "hpAtual" | "ppAtual" | "hpMax" | "ppMax", d?: number, max = Infinity) => {
    if (!d) return;
    const base = valor(campo);
    next[campo] = d > 0 ? Math.max(base, Math.min(base + d, max)) : Math.max(0, base + d);
  };
  soma("hpAtual", delta.deltaHpAtual, maximos.hp);
  soma("ppAtual", delta.deltaPpAtual, maximos.pp);
  soma("hpMax", delta.deltaHpMax);
  soma("ppMax", delta.deltaPpMax);
  if (delta.concedeHpTemp) next.hpTemp = Math.max(valor("hpTemp"), delta.concedeHpTemp);
  return next;
}

/** Enter/Espaço num card clicável — os cards de rolar são div, não botão. */
function porTeclado(acao: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    acao();
  };
}

export function PerfilSidebar({
  personagem: inicial,
  habilidades,
  recebidas,
  slugsPericiaCustom,
  penalidadeDesArmadura,
  camadasQueAbrem,
  tiposDosAtaques,
  acoes,
}: {
  personagem: Personagem;
  // Habilidades cruas — a sidebar recomputa o agregado client-side pra refletir
  // o toggle `ligada` na hora (defesas/atributos/etc.), sem esperar o server.
  habilidades: HabSidebar[];
  recebidas: Recebida[];
  slugsPericiaCustom: string[];
  penalidadeDesArmadura: number;
  camadasQueAbrem: CamadaQueAbre[];
  // Tipos de dano lidos dos ataques e efeitos (sugestões do dano recebido).
  tiposDosAtaques: string[];
  // Ações da ficha: a técnica em concentração traz o "a cada turno" dela.
  acoes: { id: string; nome: string; efeitos: unknown }[];
}) {
  // useOptimistic do personagem inteiro: o EditFichaModal e qualquer outro
  // editor podem aplicar patches via `aplicarOtimista` pra refletir mudanças
  // antes do server responder.
  //
  // `shadow` é o canal de patch cross-tab — outros componentes (ex:
  // HabilidadesTab usando uma habilidade ativa) disparam o CustomEvent
  // `rpgo:patch-personagem` com deltas, e a sidebar reflete sem precisar de
  // prop drilling. Reseta quando inicial muda (Server Component re-renderizou
  // com a verdade).
  const [modalNivel, setModalNivel] = useState(false);
  const [modalVida, setModalVida] = useState<ModoVida | null>(null);
  // Âncora da faixa condensada.
  const vitaisRef = useRef<HTMLDivElement>(null);
  const [shadow, setShadow] = useState<PatchPersonagem>({});
  // Máximos efetivos do último render, pro patch cross-tab parar neles.
  const maximosRef = useRef({ hp: Infinity, pp: Infinity });
  useEffect(() => {
    setShadow({});
  }, [inicial]);
  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<DeltaPersonagem>).detail;
      if (!det) return;
      // Exaustão 6 é desmaio: a concentração acaba.
      if ((det.exaustao ?? 0) >= 6) anunciarConcentracao(null);
      setShadow((s) => {
        const next = aplicarDelta(s, inicial, det, maximosRef.current);
        // Exaustão vem absoluta (do ExaustaoControle) ou como delta (dos usos).
        if (typeof det.exaustao === "number") next.exaustao = det.exaustao;
        if (typeof det.deltaExaustao === "number") {
          const atual = next.exaustao ?? inicial.exaustao;
          next.exaustao = Math.min(6, Math.max(0, atual + det.deltaExaustao));
        }
        return next;
      });
    }
    window.addEventListener("rpgo:patch-personagem", ouvir);
    return () => window.removeEventListener("rpgo:patch-personagem", ouvir);
  }, [inicial]);

  // Overlay otimista do estado `ligada` por habilidade. HabilidadesTab dispara
  // `rpgo:toggle-habilidade` ao ligar/desligar; a sidebar sobrescreve e recomputa
  // o agregado na hora.
  const [ligadaOverlay, setLigadaOverlay] = useState<Record<string, boolean>>({});
  // Reset do overlay quando as habilidades chegam frescas do server (revalidate)
  // — feito durante o render (padrão React), não em effect, pra não disparar
  // set-state-in-effect.
  // Turnos que faltam, contados pelo Passar turno antes do servidor responder.
  const [turnosOverlay, setTurnosOverlay] = useState<Record<string, number>>({});
  const [habsAnterior, setHabsAnterior] = useState(habilidades);
  if (habsAnterior !== habilidades) {
    setHabsAnterior(habilidades);
    setLigadaOverlay({});
    setTurnosOverlay({});
  }
  // Concentração atual, lida pelos ouvintes de evento.
  const concentracaoRef = useRef<Concentracao | null>(null);
  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<{ id: string; ligada: boolean }>).detail;
      if (!det) return;
      setLigadaOverlay((o) => ({ ...o, [det.id]: det.ligada }));
      // Desligar a habilidade da concentração encerra a concentração.
      if (!det.ligada && concentracaoRef.current?.id === det.id) {
        concentracaoRef.current = null;
        setShadow((s) => ({ ...s, concentracao: null }));
      }
    }
    window.addEventListener("rpgo:toggle-habilidade", ouvir);
    return () => window.removeEventListener("rpgo:toggle-habilidade", ouvir);
  }, []);

  // Começou a concentrar em outra coisa: a habilidade ligada que segurava a anterior desliga.
  useEffect(() => {
    function ouvir(e: Event) {
      const nova = (e as CustomEvent<Concentracao | null>).detail ?? null;
      const atual = concentracaoRef.current;
      concentracaoRef.current = nova;
      setShadow((s) => ({ ...s, concentracao: nova }));
      if (atual?.tipo === "habilidade" && atual.id !== nova?.id) {
        window.dispatchEvent(
          new CustomEvent("rpgo:toggle-habilidade", { detail: { id: atual.id, ligada: false } }),
        );
      }
    }
    window.addEventListener(EVENTO_CONCENTRACAO, ouvir);
    return () => window.removeEventListener(EVENTO_CONCENTRACAO, ouvir);
  }, []);

  // Overlay otimista de `equipado` (evento `rpgo:toggle-item`).
  const [equipadoOverlay, setEquipadoOverlay] = useState<Record<string, boolean>>({});
  const [itensAnterior, setItensAnterior] = useState(inicial.itens);
  if (itensAnterior !== inicial.itens) {
    setItensAnterior(inicial.itens);
    setEquipadoOverlay({});
  }
  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<Record<string, boolean>>).detail;
      if (!det) return;
      setEquipadoOverlay((o) => ({ ...o, ...det }));
    }
    window.addEventListener("rpgo:toggle-item", ouvir);
    return () => window.removeEventListener("rpgo:toggle-item", ouvir);
  }, []);

  // Recebidas de aliados, com o dispensar otimista.
  const [recebidasVisiveis, esconderRecebida] = useOptimistic(
    recebidas,
    (lista: Recebida[], id: string) => lista.filter((r) => r.id !== id),
  );
  const [, startTransition] = useTransition();
  const atualizar = useRefreshAgrupado(0);
  function dispensar(r: Recebida) {
    startTransition(async () => {
      esconderRecebida(r.id);
      try {
        exigir(await dispensarRecebida(inicial.id, r.id));
      } catch {
        // Em erro, o efeito volta pra lista ao fim da transição.
      }
    });
  }

  const itensComOverlay = useMemo(
    () =>
      inicial.itens.map((i) =>
        i.id in equipadoOverlay ? { ...i, equipado: equipadoOverlay[i.id] } : i,
      ),
    [inicial.itens, equipadoOverlay],
  );

  const [p, aplicarOtimista] = useOptimistic(
    { ...inicial, ...shadow },
    (state: Personagem, patch: PatchPersonagem) => ({ ...state, ...patch }),
  );
  const { nivel, forca, destreza, constituicao, sabedoria, vontade, presenca } = p;
  const concentracaoAtual = lerConcentracao(p.concentracao);
  useEffect(() => {
    concentracaoRef.current = lerConcentracao(p.concentracao);
  }, [p.concentracao]);

  function encerrarConcentracaoAgora() {
    if (!concentracaoAtual) return;
    // A habilidade que segurava a concentração desliga junto.
    anunciarConcentracao(null);
    startTransition(async () => {
      aplicarOtimista({ concentracao: null });
      try {
        exigir(await encerrarConcentracao(inicial.id));
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

  // Agregado recalculado no cliente com os overlays de `ligada`/`equipado`.
  const efeitosAgregados = useMemo(() => {
    const habs = habilidades
      .map((h) => (h.id in ligadaOverlay ? { ...h, ligada: ligadaOverlay[h.id] } : h))
      // Habilidade concedida por item só conta com o item equipado.
      .filter(
        (h) =>
          !h.itemId || itensComOverlay.some((i) => i.id === h.itemId && i.equipado),
      );
    return agregarEfeitos(
      [
        ...habs,
        ...fontesDeEfeitoDeItens(itensComOverlay),
        ...recebidasVisiveis.map(fonteDeAliado),
      ],
      new Set(slugsPericiaCustom),
      undefined,
      { nivel, atributos: { forca, destreza, constituicao, sabedoria, vontade, presenca } },
    );
  }, [
    habilidades,
    ligadaOverlay,
    itensComOverlay,
    recebidasVisiveis,
    slugsPericiaCustom,
    nivel,
    forca,
    destreza,
    constituicao,
    sabedoria,
    vontade,
    presenca,
  ]);

  const avatarSrc =
    p.fotoUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${p.id}`;

  // Âncora no nível DECLARADO, não no derivado do PE — ver faixaPeDoNivel.
  const { peProximo } = faixaPeDoNivel(p.nivel);
  const podeSubir = peProximo != null && p.pe >= peProximo;
  const pePct = pctPeDoNivel(p.nivel, p.pe);

  // CR ganha automaticamente o `ca` de cada armadura equipada. A penalidade de
  // DES NÃO entra aqui — é aplicada via `atributosParaTeste` (reduz o mod de DES),
  // pra também pegar iniciativa/salv/perícia e respeitar substituição de atributo.
  const caArmadura = itensComOverlay.reduce(
    (acc, i) => (i.tipo === "armadura" && i.equipado ? acc + i.ca : acc),
    0,
  );

  // Atributos efetivos: valor base + bônus vindo de habilidades.
  // Usado pelos cards de atributo (exibição) e por derivados (Iniciativa,
  // Percepção Passiva).
  const atributosEfetivos = somarBonusDeAtributo(p, efeitosAgregados);

  // Atributos para TESTES de d20 e CR: igual aos efetivos, mas com a DES
  // reduzida pela penalidade da armadura. Reduzir a pontuação em 2× a penalidade
  // (do modificador) reduz o modificador em exatamente a penalidade. Cálculos
  // que usam outro atributo (substituição) leem o valor não-ajustado e escapam.
  const atributosParaTeste: Record<Atributo, number> = {
    ...atributosEfetivos,
    destreza: atributosEfetivos.destreza + 2 * penalidadeDesArmadura,
  };
  const subs = efeitosAgregados.substituicoesAtributo;
  const desReduz = penalidadeDesArmadura < 0;

  // Percepção Passiva: 10 + bônus da perícia (sem exaustão), ±5 com vantagem/desvantagem.
  const profManual = lerProficiencias(p.proficiencias);
  const testePercepcao = resolverTeste({
    tipo: "pericia",
    slug: "percepcao",
    atributoPadrao: "vontade",
    nivel: p.nivel,
    atributos: atributosParaTeste,
    proficiente: profManual.pericias.includes("percepcao"),
    dobrado: profManual.periciasDobradas.includes("percepcao"),
    outros: profManual.outrosPericias.percepcao ?? 0,
    agg: efeitosAgregados,
  });
  const modoPercepcao = modoDosEfeitos(efeitosAgregados.contextuais, {
    tipo: "pericia",
    pericia: "percepcao",
    atributo: testePercepcao.atributo,
  });
  const percepcaoPassiva =
    testePassivo(
      testePercepcao.bonus,
      modoPercepcao.vantagem.length > 0,
      modoPercepcao.desvantagem.length > 0,
    ) + efeitosAgregados.bonusPercepcaoPassiva.valor;

  // Pools efetivos: (base + aditivo) × fator. Mantém o banco como "valor base"
  // e a UI mostra o total.
  const multHpMax = efeitosAgregados.multiplicadores["hp-max"];
  const multPpMax = efeitosAgregados.multiplicadores["pp-max"];
  const { hpMax: hpMaxEfetivo, ppMax: ppMaxEfetivo } = poolsEfetivos(p, efeitosAgregados);
  // A 0 PV: incapacitado; morre quando os PV negativos chegam ao PV máximo.
  const pvNegativos = negativosAtuais(p.hpAtual, p.pvNegativos);
  const morto = estaMorto(p.hpAtual, p.pvNegativos, hpMaxEfetivo);
  useEffect(() => {
    maximosRef.current = { hp: hpMaxEfetivo, pp: ppMaxEfetivo };
  }, [hpMaxEfetivo, ppMaxEfetivo]);

  // Penalidade de exaustão em testes de d20 (−2 × nível). Some no acerto, nos
  // testes de atributo, na iniciativa, etc. — todos derivam dela aqui na ficha.
  // "Ignora Exaustão" zera o nível que conta.
  const exaustaoConta = exaustaoQueConta(p.exaustao, efeitosAgregados);
  const penD20 = penalidadeD20Exaustao(exaustaoConta);

  // Salvaguarda de CON da concentração, com o que vale só nela.
  function rolarConcentracao(cd: number) {
    const t = resolverTeste({
      tipo: "salvaguarda",
      slug: "constituicao",
      atributoPadrao: "constituicao",
      nivel: p.nivel,
      atributos: atributosParaTeste,
      proficiente: profManual.salvaguardas.includes("constituicao"),
      dobrado: false,
      outros: profManual.outrosSalvaguardas.constituicao ?? 0,
      agg: efeitosAgregados,
    });
    empilharD20(
      t.bonus + efeitosAgregados.bonusConcentracao.valor - penD20,
      `Concentração (CD ${cd})`,
      { tipo: "salvaguarda", atributo: "constituicao", concentracao: true },
    );
  }

  // Deslocamento: (base + bônus) × fator, reduzido pela exaustão. O multiplicador
  // entra antes da exaustão; a redução por exaustão é reaproveitada passando o
  // bruto já multiplicado como "base" (bonus 0) pra `deslocamentoEfetivo`.
  const deslocBonus = efeitosAgregados.bonusDeslocamento;
  const multDesloc = efeitosAgregados.multiplicadores["deslocamento"];
  const deslocFixo = efeitosAgregados.valoresFixos["deslocamento"];
  const deslocSemMult = Math.max(0, p.deslocamento + deslocBonus.valor, deslocFixo?.valor ?? 0);
  const deslocBruto = multDesloc ? Math.floor(deslocSemMult * multDesloc.fator) : deslocSemMult;
  const deslocEfetivo = deslocamentoEfetivo(deslocBruto, 0, exaustaoConta);
  const deslocReduzido = deslocEfetivo !== deslocBruto;
  const deslocTitulo =
    [
      deslocBonus.fontes.length
        ? `${formatarMod(deslocBonus.valor)} de ${deslocBonus.fontes.join(", ")}`
        : null,
      multDesloc ? `×${multDesloc.fator} de ${multDesloc.fontes.join(", ")}` : null,
      deslocFixo ? `Vira ${deslocFixo.valor} m por ${deslocFixo.fontes.join(", ")}` : null,
      deslocReduzido ? `Reduzido por exaustão (de ${deslocBruto} m)` : null,
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  // Nado: stat base de espécie (não reduzido pela exaustão). Um efeito que
  // concede nado (`deslocamento`/`nadar`) prevalece o maior contra o base.
  const modosExtra = modosDeDeslocamento(efeitosAgregados);
  const nadarExtra = modosExtra["nadar"];
  const nadoEfetivo = Math.max(p.nado, nadarExtra?.valor ?? 0);
  const nadoPorEfeito = (nadarExtra?.valor ?? 0) >= p.nado && !!nadarExtra?.fontes.length;

  // CR calculada aqui porque a faixa condensada também usa.
  const crAtrib = atributoDeCalculo("cr", "destreza", subs, atributosParaTeste);
  const crBonusFixo = caArmadura + efeitosAgregados.bonusCR.valor;
  const crFixa = efeitosAgregados.valoresFixos["cr"];
  const crTotal = Math.max(
    crBase(atributosParaTeste[crAtrib.atributo], p.crOutros) + crBonusFixo,
    crFixa?.valor ?? 0,
  );

  // A cada turno: efeitos que repetem e durações em turnos das ligadas.
  const porTurno = [
    ...efeitosAgregados.porTurno,
    ...porTurnoDaConcentracao(p.concentracao, acoes),
  ];
  const duracoesTurno = duracoesEmCurso(
    habilidades
      .filter((h) => ligadaOverlay[h.id] ?? h.ligada)
      .map((h) => ({
        ...h,
        // Ligada agora no cliente: a contagem começa pela duração.
        turnosRestantes: turnosOverlay[h.id] ?? (h.ligada ? h.turnosRestantes : null),
      })),
  );
  const tecnicaTurnos = concentracaoEmCurso(p.concentracao);
  const temTurno = porTurno.length > 0 || duracoesTurno.length > 0 || !!tecnicaTurnos;
  const nomeRecurso = (id: string) => p.recursos.find((r) => r.id === id)?.nome;
  const ctxTurno = efeitosAgregados.ctxFormula ?? { nivel: p.nivel, atributos: atributosEfetivos };
  const resumoTurno = [
    ...porTurno.map((x) => ({
      fonte: x.fonte,
      texto: resumoEfeito({ tipo: "por_turno", ...x }, nomeRecurso, ctxTurno),
    })),
    ...[...duracoesTurno, ...(tecnicaTurnos ? [tecnicaTurnos] : [])].map((d) => ({
      fonte: d.nome,
      texto: textoTurnosRestantes(d.turnos).toLowerCase(),
    })),
  ];

  // Rola aqui, mostra na hora e manda os totais pro servidor conferir.
  function passarTurnoAgora() {
    const resolver = (f: string) => resolverFormula(f, ctxTurno.atributos, ctxTurno.nivel);
    const rolagens = rolarTurno(porTurno, resolver);
    const r = aplicarTurno({
      porTurno,
      rolagens,
      estado: {
        hpAtual: p.hpAtual,
        hpTemp: p.hpTemp,
        hpMax: hpMaxEfetivo,
        pvNegativos,
        ppAtual: p.ppAtual,
        ppMax: ppMaxEfetivo,
        exaustao: p.exaustao,
        recursos: Object.fromEntries(
          p.recursos.map((x) => [x.id, { nome: x.nome, valorAtual: x.valorAtual, valorMax: x.valorMax }]),
        ),
      },
      defesas: defesasDoAgregado(efeitosAgregados),
      duracoes: duracoesTurno,
      concentracao: tecnicaTurnos,
    });

    const deltaPp = r.estado.ppAtual - p.ppAtual;
    const deltaExaustao = r.estado.exaustao - p.exaustao;
    if (deltaPp || deltaExaustao) {
      window.dispatchEvent(
        new CustomEvent("rpgo:patch-personagem", {
          detail: { deltaPpAtual: deltaPp || undefined, deltaExaustao: deltaExaustao || undefined },
        }),
      );
    }
    const deltaRecursos: Record<string, number> = {};
    for (const x of p.recursos) {
      const d = (r.estado.recursos[x.id]?.valorAtual ?? x.valorAtual) - x.valorAtual;
      if (d) deltaRecursos[x.id] = d;
    }
    if (Object.keys(deltaRecursos).length > 0) {
      window.dispatchEvent(new CustomEvent("rpgo:patch-recurso", { detail: deltaRecursos }));
    }
    for (const h of r.desligar) {
      window.dispatchEvent(new CustomEvent("rpgo:toggle-habilidade", { detail: { id: h.id, ligada: false } }));
    }
    setTurnosOverlay((o) => ({ ...o, ...r.turnos }));
    anunciarTurnos(r.turnos);
    const c = concentracaoAtual;
    const perde =
      !!c &&
      (r.estado.hpAtual <= 0 ||
        r.estado.exaustao >= 6 ||
        r.concentracaoTurnos === 0 ||
        r.concentracaoSemRecurso ||
        r.desligar.some((h) => h.id === c.id));
    if (perde) anunciarConcentracao(null);
    else if (c && r.concentracaoTurnos != null) anunciarConcentracao({ ...c, turnos: r.concentracaoTurnos });

    startTransition(async () => {
      aplicarOtimista({
        hpAtual: r.estado.hpAtual,
        hpTemp: r.estado.hpTemp,
        pvNegativos: r.estado.pvNegativos,
      });
      try {
        const res = exigir(await passarTurno(p.id, facesDoTurno(rolagens)));
        anunciarMensagem(res.mensagem);
        if (res.testes.length > 0) {
          const cd = Math.max(...res.testes);
          const q = await Swal.fire({
            title: "Teste de concentração",
            text:
              res.testes.length > 1
                ? `Uma salvaguarda de CON por fonte: CD ${res.testes.join(", CD ")}.`
                : `Salvaguarda de CON, CD ${cd}.`,
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Rolar",
            cancelButtonText: "Depois",
            background: "var(--bg-card)",
            color: "var(--text-main)",
          });
          if (q.isConfirmed) rolarConcentracao(cd);
        }
      } catch (err) {
        setTurnosOverlay({});
        atualizar();
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

  return (
    <aside className="sidebar">
      <FaixaVitais
        personagemId={p.id}
        hpAtual={p.hpAtual}
        hpTemp={p.hpTemp}
        hpMax={hpMaxEfetivo}
        ppAtual={p.ppAtual}
        ppMax={ppMaxEfetivo}
        cr={crTotal}
        exaustao={p.exaustao}
        ancora={vitaisRef}
        onOtimista={aplicarOtimista}
        onDano={() => setModalVida("dano")}
      />
      <div className="sidebar-icons right">
        <EditFichaModal
          personagemId={p.id}
          inicial={{
            hpMax: p.hpMax,
            ppMax: p.ppMax,
            tipoDadoVida: p.tipoDadoVida,
            deslocamento: p.deslocamento,
            nado: p.nado,
            forca: p.forca,
            destreza: p.destreza,
            constituicao: p.constituicao,
            sabedoria: p.sabedoria,
            vontade: p.vontade,
            presenca: p.presenca,
          }}
          nivel={p.nivel}
          bonusTetoAtributo={efeitosAgregados.bonusTetoAtributo}
          onOtimista={aplicarOtimista}
        />
      </div>

      <div className="profile-header">
        <AvatarUploadModal personagemId={p.id} avatarAtual={avatarSrc} />
        <h2 className="char-name">{p.nome || "Sem Nome"}</h2>
        <span className="char-level">
          Nível{" "}
          <EditableStat
            personagemId={p.id}
            campo="nivel"
            valor={p.nivel}
            onOtimista={(novo) => aplicarOtimista({ nivel: novo })}
          />
          <span className="char-prof">
            {" · Prof "}
            {formatarMod(bonusProficiencia(p.nivel))}
          </span>
        </span>
        <div className={`pe-bar ${podeSubir ? "pe-pronto" : ""}`}>
          <div className="pe-track">
            <div className="pe-fill" style={{ width: `${pePct}%` }} />
          </div>
          <div className="pe-label">
            <EditableStat
              personagemId={p.id}
              campo="pe"
              valor={p.pe}
              formato="milhar"
              onOtimista={(novo) => aplicarOtimista({ pe: novo })}
            />
            {peProximo && (
              <span className="pe-prox"> / {peProximo.toLocaleString("pt-BR")}</span>
            )}
          </div>
        </div>

        <button
          type="button"
          className={`nivel-subir ${podeSubir ? "pronto" : ""}`}
          onClick={() => setModalNivel(true)}
          title={
            podeSubir
              ? "PE suficiente — abrir o assistente de nível"
              : "Abrir o assistente de nível mesmo sem o PE do limiar"
          }
        >
          <i className="fas fa-arrow-up" /> Subir de nível
        </button>
      </div>

      <hr />

      <div className="bar-group bar-hp">
        <div className="bar-label">
          <span>
            <i className="fas fa-heart" /> Vida
            {p.hpAtual <= 0 && (
              <span
                className={`vida-estado${morto ? " morto" : ""}`}
                title={pvNegativos > 0 ? `PV negativos: ${pvNegativos} de ${hpMaxEfetivo}` : undefined}
              >
                {morto ? "Morto" : pvNegativos > 0 ? `Incapacitado · −${pvNegativos}` : "Incapacitado"}
              </span>
            )}
          </span>
          <div className="stat-values">
            <EditableStat
              personagemId={p.id}
              campo="hpAtual"
              valor={p.hpAtual}
              max={hpMaxEfetivo}
              onOtimista={(novo) => {
                // A 0 PV fica incapacitado e perde a concentração.
                if (novo <= 0 && concentracaoAtual) anunciarConcentracao(null);
                aplicarOtimista({ hpAtual: novo, pvNegativos: 0 });
              }}
            />
            {" / "}
            <span
              title={
                [
                  efeitosAgregados.bonusHpMax.fontes.length
                    ? `${formatarMod(efeitosAgregados.bonusHpMax.valor)} de ${efeitosAgregados.bonusHpMax.fontes.join(", ")}`
                    : null,
                  multHpMax
                    ? `×${multHpMax.fator} de ${multHpMax.fontes.join(", ")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            >
              {hpMaxEfetivo}
              {(efeitosAgregados.bonusHpMax.fontes.length > 0 || multHpMax) && (
                <i className="fas fa-link prof-fonte" />
              )}
            </span>
            <span className={`hp-temp ${p.hpTemp > 0 ? "ativo" : ""}`}>
              {" +"}
              <EditableStat
                personagemId={p.id}
                campo="hpTemp"
                valor={p.hpTemp}
                onOtimista={(novo) => aplicarOtimista({ hpTemp: novo })}
              />
            </span>
          </div>
        </div>
        {(() => {
          // Denominador escala quando atual+temp passa do max efetivo,
          // mantendo proporção visual coerente.
          const totalVisivel = Math.max(hpMaxEfetivo, p.hpAtual + p.hpTemp, 1);
          const hpPct = (Math.max(0, p.hpAtual) / totalVisivel) * 100;
          const tempPct = (Math.max(0, p.hpTemp) / totalVisivel) * 100;
          return (
            <div className="progress-track hp-track">
              <div className="progress-fill" style={{ width: `${hpPct}%` }} />
              <div className="progress-fill-temp" style={{ width: `${tempPct}%` }} />
            </div>
          );
        })()}
        <div className="vida-botoes">
          <button type="button" className="vida-btn" onClick={() => setModalVida("dano")}>
            <i className="fas fa-heart-crack" /> Dano
          </button>
          <button type="button" className="vida-btn" onClick={() => setModalVida("cura")}>
            <i className="fas fa-heart-circle-plus" /> Curar
          </button>
        </div>
      </div>

      <div className="bar-group bar-en" ref={vitaisRef}>
        <div className="bar-label">
          <span><i className="fas fa-bolt" /> Pontos de Poder</span>
          <div className="stat-values">
            <EditableStat
              personagemId={p.id}
              campo="ppAtual"
              valor={p.ppAtual}
              max={ppMaxEfetivo}
              onOtimista={(novo) => aplicarOtimista({ ppAtual: novo })}
            />{" "}
            /{" "}
            <span
              title={
                [
                  efeitosAgregados.bonusPpMax.fontes.length
                    ? `${formatarMod(efeitosAgregados.bonusPpMax.valor)} de ${efeitosAgregados.bonusPpMax.fontes.join(", ")}`
                    : null,
                  multPpMax
                    ? `×${multPpMax.fator} de ${multPpMax.fontes.join(", ")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            >
              {ppMaxEfetivo}
              {(efeitosAgregados.bonusPpMax.fontes.length > 0 || multPpMax) && (
                <i className="fas fa-link prof-fonte" />
              )}
            </span>
          </div>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct(p.ppAtual, ppMaxEfetivo)}%` }} />
        </div>
      </div>

      {concentracaoAtual && (
        <div className="recurso-linha concentracao-linha">
          <span className="recurso-icone">
            <i className="fas fa-brain" />
          </span>
          <span className="recurso-nome">
            Concentrando: <strong>{concentracaoAtual.nome || "—"}</strong>
          </span>
          <button
            type="button"
            className="concentracao-encerrar"
            onClick={encerrarConcentracaoAgora}
          >
            Encerrar
          </button>
        </div>
      )}

      {temTurno && (
        <div className="recurso-linha concentracao-linha turno-linha">
          <span className="recurso-icone">
            <i className="fas fa-clock-rotate-left" />
          </span>
          <span className="recurso-nome">A cada turno</span>
          <button type="button" className="concentracao-encerrar" onClick={passarTurnoAgora}>
            Passar turno
          </button>
          <ul className="turno-lista">
            {resumoTurno.map((l, i) => (
              <li key={i}>
                <strong>{l.fonte}</strong> {l.texto}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ExaustaoControle
        personagemId={p.id}
        exaustao={p.exaustao}
        ignoradaPor={exaustaoConta === 0 ? efeitosAgregados.ignoraExaustao?.fontes : undefined}
      />

      <DescansoControle
        personagemId={p.id}
        nivel={p.nivel}
        hpAtual={p.hpAtual}
        dadosVidaGastos={p.dadosVidaGastos}
        tipoDadoVida={p.tipoDadoVida}
        modConstituicao={modificador(atributosEfetivos.constituicao)}
        onOtimista={(patch) =>
          aplicarOtimista({
            hpAtual: Math.max(p.hpAtual, Math.min(p.hpAtual + patch.deltaHpAtual, hpMaxEfetivo)),
          })
        }
      />

      {/* Deslocamento + Nado lado a lado: dois stats base de movimento na altura
          de uma linha só. */}
      <div className="recurso-dupla">
        <div className="recurso-linha" title={deslocTitulo}>
          <span className="recurso-icone"><i className="fas fa-person-running" /></span>
          <span className="recurso-nome">Deslocamento</span>
          <span className={`stat-values ${deslocReduzido ? "valor-exausto" : ""}`}>
            {deslocEfetivo.toLocaleString("pt-BR")} m
            {(deslocBonus.fontes.length > 0 || multDesloc || deslocFixo) && (
              <i className="fas fa-link prof-fonte" />
            )}
            {deslocReduzido && (
              <MarcaExausto titulo={`Reduzido por exaustão (de ${deslocBruto} m)`} />
            )}
          </span>
        </div>

        {/* Nado: stat base de espécie, sempre exibido (igual ao deslocamento). */}
        <div
          className="recurso-linha"
          title={nadoPorEfeito ? `de ${nadarExtra!.fontes.join(", ")}` : undefined}
        >
          <span className="recurso-icone"><i className="fas fa-person-swimming" /></span>
          <span className="recurso-nome">Nadar</span>
          <span className="stat-values">
            {nadoEfetivo.toLocaleString("pt-BR")} m
            {nadoPorEfeito && <i className="fas fa-link prof-fonte" />}
          </span>
        </div>
      </div>

      {/* Deslocamentos especiais (voar/escalar/cavar) — modos próprios concedidos
          por habilidade, não reduzidos pela exaustão. Nado tem linha própria acima. */}
      {Object.entries(modosExtra).map(([tipo, fv]) =>
        fv && tipo !== "nadar" ? (
          <div
            key={`mov-${tipo}`}
            className="recurso-linha"
            title={fv.fontes.length ? `de ${fv.fontes.join(", ")}` : undefined}
          >
            <span className="recurso-icone">
              <i className={`fas ${ICONE_MOV[tipo] ?? "fa-person-running"}`} />
            </span>
            <span className="recurso-nome">{ROTULO_MOV[tipo] ?? capitalizar(tipo)}</span>
            <span className="stat-values">
              {fv.valor.toLocaleString("pt-BR")} m
              {fv.fontes.length > 0 && <i className="fas fa-link prof-fonte" />}
            </span>
          </div>
        ) : null,
      )}

      <RecursosSidebar personagemId={p.id} recursos={p.recursos} />

      <div className="derivados-grid">
        {(() => {
          const crDesReduz = crAtrib.atributo === "destreza" && desReduz;
          const titulo =
            [
              crAtrib.substituido
                ? `Usa ${SIGLA_ATRIBUTO[crAtrib.atributo]} por ${crAtrib.fontes.join(", ")}`
                : null,
              crDesReduz ? `−${Math.abs(penalidadeDesArmadura)} de DES (armadura)` : null,
              crFixa ? `Vira ${crFixa.valor} por ${crFixa.fontes.join(", ")}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined;
          return (
            <CrEditavel
              personagemId={p.id}
              atributoScore={atributosParaTeste[crAtrib.atributo]}
              crOutros={p.crOutros}
              bonusFixo={crBonusFixo}
              minimo={crFixa?.valor}
              siglaSubstituida={
                crAtrib.substituido ? SIGLA_ATRIBUTO[crAtrib.atributo] : undefined
              }
              titulo={titulo}
              reduzido={crDesReduz}
            />
          );
        })()}
        {(() => {
          const iniAtrib = atributoDeCalculo("iniciativa", "destreza", subs, atributosParaTeste);
          const iniDesReduz = iniAtrib.atributo === "destreza" && desReduz;
          const iniAmplo = bonusTesteAmplo(efeitosAgregados, "destreza");
          const iniBruta =
            iniciativa(atributosParaTeste[iniAtrib.atributo]) +
            efeitosAgregados.bonusIniciativa.valor +
            iniAmplo.valor;
          const iniEf = iniBruta - penD20;
          const reduzido = penD20 > 0 || iniDesReduz;
          const titulo =
            [
              iniAtrib.substituido
                ? `Usa ${SIGLA_ATRIBUTO[iniAtrib.atributo]} por ${iniAtrib.fontes.join(", ")}`
                : null,
              efeitosAgregados.bonusIniciativa.fontes.length
                ? `${formatarMod(efeitosAgregados.bonusIniciativa.valor)} de ${efeitosAgregados.bonusIniciativa.fontes.join(", ")}`
                : null,
              iniAmplo.fontes.length
                ? `${formatarMod(iniAmplo.valor)} de ${iniAmplo.fontes.join(", ")}`
                : null,
              iniDesReduz ? `−${Math.abs(penalidadeDesArmadura)} de DES (armadura)` : null,
              penD20 ? `−${penD20} de exaustão` : null,
            ]
              .filter(Boolean)
              .join(" · ");
          return (
            <div
              className="derivado-card derivado-rolar"
              title={`Empilhar Iniciativa no Rolador${titulo ? ` · ${titulo}` : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => empilharD20(iniEf, "Iniciativa", { tipo: "iniciativa" })}
              onKeyDown={porTeclado(() =>
                empilharD20(iniEf, "Iniciativa", { tipo: "iniciativa" }),
              )}
            >
              <div className="derivado-label">Iniciativa</div>
              <div className={`derivado-value ${reduzido ? "valor-exausto" : ""}`}>
                {formatarMod(iniEf)}
                {penD20 > 0 && <MarcaExausto titulo={`−${penD20} de exaustão`} />}
              </div>
            </div>
          );
        })()}
        <div
          className="derivado-card"
          title={
            [
              efeitosAgregados.bonusPercepcaoPassiva.fontes.length
                ? `${formatarMod(efeitosAgregados.bonusPercepcaoPassiva.valor)} de ${efeitosAgregados.bonusPercepcaoPassiva.fontes.join(", ")}`
                : null,
              modoPercepcao.vantagem.length
                ? `+5 (vantagem) de ${modoPercepcao.vantagem.join(", ")}`
                : null,
              modoPercepcao.desvantagem.length
                ? `−5 (desvantagem) de ${modoPercepcao.desvantagem.join(", ")}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
        >
          <div className="derivado-label">Perc. Pass.</div>
          <div className="derivado-value">{percepcaoPassiva}</div>
        </div>
      </div>

      {(() => {
        // Painel de defesas (read-only): lê do agregador recomputado, não muta
        // nada. Defesa só está aqui se vier de passiva OU de habilidade ligada
        // (o gate é no agregador) — então é sempre visível; `estadoDefesa` só
        // marca como condicional (esmaecida + legenda) quando vem de ligada.
        type Linha = [string, DefesaAgregada, ReturnType<typeof estadoDefesa>];
        const linhas = (entradas: [string, DefesaAgregada | undefined][]): Linha[] =>
          entradas
            .filter((e): e is [string, DefesaAgregada] => !!e[1])
            .map(([nome, d]) => [nome, d, estadoDefesa(d)] as Linha);
        const resist = linhas(Object.entries(efeitosAgregados.resistencias));
        const imun = linhas(Object.entries(efeitosAgregados.imunidades));
        const vul = linhas(Object.entries(efeitosAgregados.vulnerabilidades));
        const condImun = linhas(Object.entries(efeitosAgregados.condicoesImunes));
        const critImune = efeitosAgregados.critImune;
        const critSt = estadoDefesa(critImune);
        const critVis = critImune.fontes.length > 0;
        const reducoes = efeitosAgregados.reducoesDano;
        if (
          !resist.length &&
          !imun.length &&
          !vul.length &&
          !condImun.length &&
          !critVis &&
          !reducoes.length
        ) {
          return null;
        }
        const titulo = (fontes: string[], motivo?: string) =>
          [fontes.length ? `de ${fontes.join(", ")}` : null, motivo]
            .filter(Boolean)
            .join(" · ") || undefined;
        const grupo = (icone: string, rotulo: string, linhas: Linha[], prefixo: string) =>
          linhas.length > 0 && (
            <div className={`defesa-grupo${prefixo === "vul" ? " fraqueza" : ""}`}>
              <span className="defesa-rotulo">
                <i className={`fas ${icone}`} /> {rotulo}
              </span>
              <div className="defesa-valores">
                {linhas.map(([nome, d, st]) => (
                  <div
                    key={`${prefixo}-${nome}`}
                    className={`defesa-entrada${st.condicional ? " cond" : ""}`}
                    title={titulo(d.fontes, undefined)}
                  >
                    <div className="defesa-pills">
                      {nome
                        .split(/\s*,\s*/)
                        .filter(Boolean)
                        .map((v, j) => (
                          <span key={j} className="defesa-chip">
                            {v}
                          </span>
                        ))}
                    </div>
                    {st.condicional && st.motivo && (
                      <span className="defesa-cond-nota">{st.motivo}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        return (
          <>
            <div className="bar-label" style={{ marginTop: 15, color: "var(--color-react)" }}>
              DEFESAS
            </div>
            <div className="defesas-secao">
              {grupo("fa-shield-halved", "Resistência", resist, "res")}
              {grupo("fa-shield", "Imunidade", imun, "imu")}
              {grupo("fa-heart-crack", "Vulnerável", vul, "vul")}
              {grupo("fa-virus-slash", "Imune à condição", condImun, "cond")}
              {reducoes.length > 0 && (
                <div className="defesa-grupo">
                  <span className="defesa-rotulo">
                    <i className="fas fa-shield-halved" /> Redução de dano
                  </span>
                  <div className="defesa-valores">
                    {reducoes.map((r, i) => {
                      const cond = !r.passiva || !!r.quando;
                      return (
                        <div
                          key={`red-${i}`}
                          className={`defesa-entrada${cond ? " cond" : ""}`}
                          title={titulo([r.fonte], r.quando ? `quando: ${r.quando}` : undefined)}
                        >
                          <div className="defesa-pills">
                            <span className="defesa-chip">
                              −{r.valor}
                              {r.tipos ? ` ${r.tipos}` : ""}
                            </span>
                          </div>
                          {!r.passiva && (
                            <span className="defesa-cond-nota">enquanto {r.fonte} estiver ativa</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {critVis && (
                <div className="defesa-grupo">
                  <span className="defesa-rotulo" title={titulo(critImune.fontes, undefined)}>
                    <i className="fas fa-burst" /> Imune a crítico
                  </span>
                  {critSt.condicional && critSt.motivo && (
                    <span className="defesa-cond-nota">{critSt.motivo}</span>
                  )}
                </div>
              )}
            </div>
          </>
        );
      })()}

      {(() => {
        // Sentidos especiais (visão no escuro, sentir presença…). Mesma fonte
        // do agregador (passiva ou habilidade ligada). Só exibição.
        const sentidos = Object.entries(efeitosAgregados.sentidos).filter(
          (e): e is [string, { valor: number; fontes: string[] }] => !!e[1],
        );
        if (!sentidos.length) return null;
        return (
          <>
            <div className="bar-label" style={{ marginTop: 15, color: "var(--color-react)" }}>
              SENTIDOS
            </div>
            <div className="defesas-secao">
              <div className="defesa-grupo">
                <div className="defesa-valores">
                  {sentidos.map(([nome, fv]) => (
                    <div
                      key={`sen-${nome}`}
                      className="defesa-entrada"
                      title={fv.fontes.length ? `de ${fv.fontes.join(", ")}` : undefined}
                    >
                      <div className="defesa-pills">
                        <span className="defesa-chip">
                          <i className="fas fa-eye" /> {capitalizar(nome)}
                          {fv.valor > 0 ? ` ${fv.valor} m` : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {recebidasVisiveis.length > 0 && (
        <>
          <div className="bar-label" style={{ marginTop: 15, color: "var(--color-bonus)" }}>
            DE ALIADOS
          </div>
          <div className="defesas-secao">
            {recebidasVisiveis.map((r) => (
              <div key={r.id} className="recebida-linha">
                <i className="fas fa-hand-holding-heart" />
                <span className="recebida-nome">{r.nome}</span>
                <span className="recebida-de">{r.de}</span>
                <button
                  type="button"
                  className="recebida-rm"
                  title="Dispensar"
                  aria-label={`Dispensar ${r.nome}`}
                  onClick={() => dispensar(r)}
                >
                  <i className="fas fa-xmark" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="bar-label" style={{ marginTop: 15, color: "var(--color-power)" }}>
        ATRIBUTOS
      </div>
      <div className="attr-grid">
        {(
          [
            ["FOR", "forca"],
            ["DES", "destreza"],
            ["CON", "constituicao"],
            ["SAB", "sabedoria"],
            ["VON", "vontade"],
            ["PRE", "presenca"],
          ] as const
        ).map(([label, slug]) => {
          const valor = atributosEfetivos[slug];
          const bonus = efeitosAgregados.bonusAtributo[slug];
          // Valor fixo só conta quando passa do valor com bônus.
          const fixo = efeitosAgregados.valoresFixos[slug];
          const fixoVale = !!fixo && fixo.valor > p[slug] + (bonus?.valor ?? 0);
          // Teste puro: atributo trocado por "Testes de X" e bônus de alvos largos.
          const subTeste = atributoDeCalculo(`teste-${slug}`, slug, subs, atributosParaTeste);
          const amplo = bonusTesteAmplo(efeitosAgregados, slug);
          // DES com armadura: o teste perde a penalidade dela.
          const armaduraReduz = subTeste.atributo === "destreza" && desReduz;
          const modEf = modificador(atributosParaTeste[subTeste.atributo]) + amplo.valor - penD20;
          // Compara a pontuação base: bônus de habilidade não passa pelo Aprimoramento.
          const teto = tetoAtributo(efeitosAgregados.bonusTetoAtributo, slug, p.nivel);
          const acimaDoTeto = p[slug] > teto.valor;
          const titulo = [
            bonus ? `${formatarMod(bonus.valor)} de ${bonus.fontes.join(", ")}` : null,
            fixoVale && fixo ? `Vira ${fixo.valor} por ${fixo.fontes.join(", ")}` : null,
            subTeste.substituido
              ? `Usa ${SIGLA_ATRIBUTO[subTeste.atributo]} por ${subTeste.fontes.join(", ")}`
              : null,
            amplo.fontes.length ? `${formatarMod(amplo.valor)} de ${amplo.fontes.join(", ")}` : null,
            armaduraReduz ? `−${Math.abs(penalidadeDesArmadura)} de DES (armadura)` : null,
            penD20 ? `−${penD20} de exaustão` : null,
            acimaDoTeto
              ? `${p[slug]} acima do teto de ${teto.valor}${
                  teto.fontes.length ? ` (elevado por ${teto.fontes.join(", ")})` : ""
                }`
              : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div
              className="attr-card attr-rolar"
              key={label}
              title={`Empilhar Teste ${label} no Rolador${titulo ? ` · ${titulo}` : ""}`}
              role="button"
              tabIndex={0}
              onClick={() =>
                empilharD20(modEf, `Teste ${label}`, {
                  tipo: "teste-atributo",
                  atributo: slug,
                })
              }
              onKeyDown={porTeclado(() =>
                empilharD20(modEf, `Teste ${label}`, {
                  tipo: "teste-atributo",
                  atributo: slug,
                }),
              )}
            >
              <div className="attr-label">
                {label}
                {(bonus || fixoVale || amplo.fontes.length > 0 || subTeste.substituido) && (
                  <i className="fas fa-link prof-fonte" />
                )}
                {acimaDoTeto && (
                  <i
                    className="fas fa-triangle-exclamation attr-acima-teto"
                    title={`Acima do teto de ${teto.valor}`}
                  />
                )}
              </div>
              <div className={`attr-value ${penD20 > 0 || armaduraReduz ? "valor-exausto" : ""}`}>
                {formatarMod(modEf)}
                {penD20 > 0 && <MarcaExausto titulo={`−${penD20} de exaustão`} />}
              </div>
              <div className="attr-base">{valor}</div>
            </div>
          );
        })}
      </div>

      <BotaoVoltar fallbackHref="/dashboard" className="btn-voltar-ficha">
        ← Voltar
      </BotaoVoltar>

      {modalNivel && (
        <NivelModal
          personagemId={p.id}
          nivel={p.nivel}
          pe={p.pe}
          tipoDadoVida={p.tipoDadoVida}
          atributos={atributosEfetivos}
          atributosBase={{ forca, destreza, constituicao, sabedoria, vontade, presenca }}
          bonusTetoAtributo={efeitosAgregados.bonusTetoAtributo}
          camadasQueAbrem={camadasQueAbrem}
          onFechar={() => setModalNivel(false)}
        />
      )}
      {modalVida && (
        <VidaModal
          personagemId={p.id}
          modoInicial={modalVida}
          hpAtual={p.hpAtual}
          hpTemp={p.hpTemp}
          pvNegativos={pvNegativos}
          hpMax={hpMaxEfetivo}
          agg={efeitosAgregados}
          tiposAtaques={tiposDosAtaques}
          tiposSalvos={lerTiposSalvos(p.tiposDano)}
          concentrando={concentracaoAtual ? concentracaoAtual.nome || "concentração" : null}
          onOtimista={aplicarOtimista}
          onAplicado={(d) => {
            for (const h of d.acabaram) {
              window.dispatchEvent(
                new CustomEvent("rpgo:toggle-habilidade", { detail: { id: h.id, ligada: false } }),
              );
            }
            if (d.perdeuConcentracao) anunciarConcentracao(null);
          }}
          onRolarConcentracao={rolarConcentracao}
          onPerderConcentracao={encerrarConcentracaoAgora}
          onFechar={() => setModalVida(null)}
        />
      )}
    </aside>
  );
}
