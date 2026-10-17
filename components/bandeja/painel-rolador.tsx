"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import {
  type Dado,
  type DadoRolado,
  type ModoRolagem,
  formulaTexto,
  formatarResultadoRolagemHtml,
  rolarDados,
  rolarLote,
  resolverD20,
} from "@/lib/dice";
import { addPreset, getPresets, removePreset, type Preset } from "@/lib/presets";
import { registrarRolagem } from "./actions";
import { anunciarGastoMunicao } from "@/lib/municao";
import type { MensagemSerializada } from "@/lib/mensagens";
import {
  EVENTO_EMPILHAR,
  EVENTO_PUBLICAR,
  type EmpilharRolagemDetail,
  type PublicarRolagemDetail,
} from "@/lib/empilhar-rolagem";
import {
  EVENTO_PASSOS,
  chipsDoContexto,
  type ChipContexto,
  type ContextoRolagem,
  type EfeitosContexto,
  type PassosDoRolador,
} from "@/lib/op-rpg";

type Props = {
  userId: string;
  userName: string;
  sessionId: string;
  onMensagemCriada: (msg: MensagemSerializada) => void;
  efeitosContexto?: EfeitosContexto;
  // Rolagens saem sem os números no chat.
  privado?: boolean;
};

// Escapa partes dinâmicas (nomes de habilidade) antes de entrar na string HTML
// persistida — ela é renderizada via dangerouslySetInnerHTML no chat, então
// nomes controlados pelo jogador não podem injetar markup.
function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const ICONE_CHIP: Record<ChipContexto["tipo"], string> = {
  vantagem: "fa-arrow-up",
  desvantagem: "fa-arrow-down",
  sucesso_auto: "fa-check",
  falha_auto: "fa-xmark",
  crit_range: "fa-burst",
  floor_d20: "fa-circle-up",
  reroll: "fa-rotate",
  dano_min: "fa-shield-halved",
  trocar_dano: "fa-fire",
  ignora: "fa-bolt-lightning",
  alcance: "fa-ruler-horizontal",
  melhor_de: "fa-dice",
  critico: "fa-skull",
  dano_extra: "fa-plus",
  dados_extra: "fa-dice-d6",
  bonus: "fa-plus-minus",
  dano_maximo: "fa-maximize",
  piso_dado: "fa-dice-five",
  ataque_poderoso: "fa-scale-unbalanced",
  dano_poderoso: "fa-scale-unbalanced",
  multi_ataque: "fa-layer-group",
  explosao: "fa-explosion",
  progressivo: "fa-arrow-trend-up",
};

const FACES = [4, 6, 8, 10, 12, 20, 100] as const;

// Estado de exibição: ou um preview derivado de dados+mod, ou o resultado da
// última rolagem (mantido até o usuário mexer em qualquer input).
type Resultado =
  | { tipo: "preview" }
  | { tipo: "rolado"; total: string; detalhesHtml: string };

function rotuloModo(modo: ModoRolagem): string {
  if (modo === "vantagem") return "Vantagem";
  if (modo === "desvantagem") return "Desvantagem";
  return "Normal";
}

// Opções que o contexto da rolagem injeta no d20 primário (vant/desv/floor/crit).
// Separadas dos chips (estado da UI) pra `montarDadosContextuais` ser pura e
// poder ser re-executada num reroll sem reler estado.
type OpcoesContextuais = {
  vantagem: boolean;
  desvantagem: boolean;
  floorD20: number;
  critRange: number;
  // Piso de dano (etapa 3.5): eleva o TOTAL ao mínimo garantido. 0 = sem piso.
  // Vale só em rolagem de dano — calculado a partir da fórmula (metade do máx).
  danoMinFloor: number;
  // Rola o lance inteiro N× e fica com o maior total. 1 = normal.
  melhorDe: number;
  // Dados do dano no máximo.
  danoMaximo: boolean;
  // Dado de dano que rolar até `ate` vira `vira` (0 = o máximo).
  pisosDado: { ate: number; vira: number }[];
  // Dado de dano que explode: a partir de quanto (0 = a face máxima) e até quantas vezes.
  explosoesDado: { minimo: number; limite: number }[];
  // Dano total que explode: os dados rolam de novo e somam.
  explosoesTotal: { minimo: number; limite: number }[];
};

type RegraExplosao = NonNullable<ChipContexto["explosao"]>;

// Habilidade de Usar que a rolagem gasta, e quantos usos empilhados.
type Gasto = { id: string; vezes: number };

// Chip sob demanda que dá pra usar mais de uma vez na mesma rolagem.
function empilhavel(c: ChipContexto): boolean {
  return c.tipo !== "progressivo" && !!c.gasta && (c.max ?? 1) > 1;
}

// Avisa a ficha da contagem nova de um bônus progressivo (quem tem o efeito grava).
function anunciarPassos(c: ChipContexto, passos: number) {
  if (!c.progressivo) return;
  const { fonte, formula, em } = c.progressivo;
  window.dispatchEvent(
    new CustomEvent<PassosDoRolador>(EVENTO_PASSOS, { detail: { fonte, formula, em, passos } }),
  );
}

// Snapshot de uma rolagem contextual que ofereceu rerroll — fica "pendente" até
// o usuário Manter ou esgotar as rerrolagens. Só persiste no chat ao Manter.
type Pendente = {
  dadosUsar: Dado[];
  modUsar: number;
  nomePreset: string | null;
  opc: OpcoesContextuais;
  notas: string[]; // anotações de fonte (já escapadas), sem o reroll
  stringDados: string; // parte dos dados da rolagem atual (HTML)
  total: number;
  rolls: DadoRolado[];
  rerollsRestantes: number;
  rerollsUsados: number;
  // Crítico e d20 natural do lance, pra explosão de ataque ao manter.
  critico: Lance["critico"];
  natural: number | null;
  explosoes: RegraExplosao[];
  // Rolagem de ataque (o crítico dela liga o Crítico do próximo dano).
  ataque: boolean;
  // Habilidades que os chips ligados gastam quando a rolagem for mantida.
  gastos: Gasto[];
  // Valores do lance, pra rerrolar só um d20.
  valores: ValoresLance;
  // Habilidade que perde 1 uso a cada rerrolagem.
  gastaReroll?: string;
};

// Um dado sorteado: `cru` = o que rolou antes do dado mínimo; `extras` = explosões.
type ValorDado = { resultado: number; cru: number | null; extras?: number[] };

// Valores sorteados de um lance: os d20 do primário (2 com vantagem ou
// desvantagem) e os outros dados, na ordem.
type ValoresLance = { d20: number[]; outros: ValorDado[] };

type Lance = {
  total: number;
  rolls: DadoRolado[];
  stringDados: string;
  // Crítico/falha do d20 primário (null sem d20).
  critico: "sucesso" | "falha" | null;
  // Valor natural do d20 primário (null sem d20).
  natural: number | null;
  valores: ValoresLance;
  // Ataque a mais que veio de uma explosão.
  explosao?: boolean;
};

// Resultado de um dado de dano com dano máximo, dado mínimo e explosão.
function rolarDadoDeDano(d: Dado, opc: OpcoesContextuais): ValorDado {
  if (opc.danoMaximo) return { resultado: d.sinal > 0 ? d.faces : 1, cru: null };
  const rolado = Math.floor(Math.random() * d.faces) + 1;
  if (d.sinal < 0) return { resultado: rolado, cru: null };
  const elevados = opc.pisosDado
    .filter((p) => rolado <= p.ate)
    .map((p) => (p.vira > 0 ? Math.min(d.faces, p.vira) : d.faces));
  const resultado = Math.max(rolado, ...elevados);
  const extras = explosoesDoDado(d.faces, rolado, opc.explosoesDado);
  return {
    resultado,
    cru: resultado !== rolado ? rolado : null,
    ...(extras.length ? { extras } : {}),
  };
}

// Dados que a explosão soma: rola outro enquanto o último disparar, até o limite.
function explosoesDoDado(
  faces: number,
  rolado: number,
  regras: OpcoesContextuais["explosoesDado"],
): number[] {
  const extras: number[] = [];
  if (faces < 2) return extras;
  let ultimo = rolado;
  for (;;) {
    const limite = Math.max(
      0,
      ...regras.filter((r) => ultimo >= (r.minimo || faces)).map((r) => r.limite),
    );
    if (extras.length >= limite) return extras;
    ultimo = Math.floor(Math.random() * faces) + 1;
    extras.push(ultimo);
  }
}

// Dano que chega ao gatilho rola os dados de novo e soma, até o limite.
function comExplosaoDoTotal(lance: Lance, dadosUsar: Dado[], opc: OpcoesContextuais): Lance {
  if (opc.explosoesTotal.length === 0) return lance;
  const semGatilho = { ...opc, danoMinFloor: 0, explosoesTotal: [] };
  let out = lance;
  let ultimo = lance.total;
  for (let feitas = 0; ; feitas++) {
    const limite = Math.max(
      0,
      ...opc.explosoesTotal.filter((r) => ultimo >= r.minimo).map((r) => r.limite),
    );
    if (feitas >= limite) return out;
    const novo = montarUmLance(dadosUsar, 0, semGatilho);
    ultimo = novo.total;
    out = {
      ...out,
      total: out.total + novo.total,
      rolls: [...out.rolls, ...novo.rolls],
      stringDados: `${out.stringDados} <span class="dado-explosao">+ explosão</span> ${novo.stringDados}`,
    };
  }
}

// Ataque que dispara a explosão ganha outro ataque em seguida, até o limite.
function comAtaquesExplosivos(primeiro: Lance, regras: RegraExplosao[], rolar: () => Lance): Lance[] {
  const lances = [primeiro];
  let ultimo = primeiro;
  for (;;) {
    const limite = Math.max(
      0,
      ...regras
        .filter((r) =>
          r.gatilho === "critico" ? ultimo.critico === "sucesso" : (ultimo.natural ?? 0) >= r.valor,
        )
        .map((r) => r.limite),
    );
    if (lances.length - 1 >= limite) return lances;
    ultimo = rolar();
    lances.push({ ...ultimo, explosao: true });
  }
}

// Linha de um lance no lote; o que veio de explosão leva a marca.
function textoDoLance(l: Lance): string {
  return l.explosao ? `${l.stringDados} <span class="dado-explosao">explosão</span>` : l.stringDados;
}

// Rola o d20 primário (1d20 positivo) com vant/desv/floor/crit e os demais dados
// normalmente. Retorna total, rolls crus e a string HTML da parte dos dados —
// sem as anotações de fonte (montadas à parte, pra reroll reaproveitar).
function montarDadosContextuais(
  dadosUsar: Dado[],
  modUsar: number,
  opc: OpcoesContextuais,
): Lance {
  const vezes = Math.max(1, opc.melhorDe);
  const lances = Array.from({ length: vezes }, () =>
    comExplosaoDoTotal(montarUmLance(dadosUsar, modUsar, opc), dadosUsar, opc),
  );
  if (vezes === 1) return lances[0];
  // Melhor de N: os totais descartados aparecem riscados depois do que ficou.
  const fica = lances.reduce((a, b) => (b.total > a.total ? b : a));
  const descartados = lances
    .filter((l) => l !== fica)
    .map(
      (l) =>
        `<span class="dado-descartado" title="rolou ${vezes}× e ficou com o maior">${l.total}</span>`,
    )
    .join(" ");
  return { ...fica, stringDados: `${fica.stringDados} ${descartados}` };
}

function primarioD20(dadosUsar: Dado[]): number {
  return dadosUsar.findIndex((d) => d.faces === 20 && d.sinal === 1);
}

function sortearLance(dadosUsar: Dado[], opc: OpcoesContextuais): ValoresLance {
  const idx = primarioD20(dadosUsar);
  const d20 = () => Math.floor(Math.random() * 20) + 1;
  return {
    d20: idx < 0 ? [] : opc.vantagem !== opc.desvantagem ? [d20(), d20()] : [d20()],
    outros: dadosUsar.filter((_, i) => i !== idx).map((d) => rolarDadoDeDano(d, opc)),
  };
}

function montarUmLance(
  dadosUsar: Dado[],
  modUsar: number,
  opc: OpcoesContextuais,
  valores: ValoresLance = sortearLance(dadosUsar, opc),
): Lance {
  const idxPrimario = primarioD20(dadosUsar);
  let total = modUsar;
  let stringDados = "";
  let critico: Lance["critico"] = null;
  let natural: number | null = null;
  const rolls: DadoRolado[] = [];
  let outro = 0;

  dadosUsar.forEach((d, i) => {
    const op =
      i === 0 ? (d.sinal === -1 ? "- " : "") : d.sinal === 1 ? " + " : " - ";
    if (i === idxPrimario) {
      const r = resolverD20(valores.d20, {
        vantagem: opc.vantagem,
        desvantagem: opc.desvantagem,
        floorD20: opc.floorD20,
        critRange: opc.critRange,
      });
      total += r.resultado * d.sinal;
      rolls.push({ faces: 20, sinal: d.sinal, resultado: r.resultado });
      critico = r.critico;
      natural = r.mantido;
      const cls =
        r.critico === "sucesso"
          ? "crit-success"
          : r.critico === "falha"
            ? "crit-fail"
            : null;
      const resHtml = cls ? `<span class="${cls}">${r.resultado}</span>` : `${r.resultado}`;
      let extra = "";
      // Dado descartado da vantagem/desvantagem (riscado).
      if (r.descartado != null)
        extra += ` <span class="dado-descartado">${r.descartado}</span>`;
      // Valor cru antes do floor (riscado) — deixa claro o quanto o piso elevou.
      if (r.comFloor)
        extra += ` <span class="dado-descartado" title="elevado pelo mínimo">${r.mantido}</span>`;
      stringDados += `${op}(${resHtml}${extra}) 1d20`;
    } else {
      const { resultado, cru, extras = [] } = valores.outros[outro++] ?? rolarDadoDeDano(d, opc);
      total += (resultado + extras.reduce((s, x) => s + x, 0)) * d.sinal;
      rolls.push({ faces: d.faces, sinal: d.sinal, resultado });
      for (const x of extras) rolls.push({ faces: d.faces, sinal: d.sinal, resultado: x });
      let resHtml = `${resultado}`;
      if (resultado === 1) resHtml = `<span class="crit-fail">${resultado}</span>`;
      else if (resultado === d.faces)
        resHtml = `<span class="crit-success">${resultado}</span>`;
      // Valor cru antes do dado mínimo (riscado).
      if (cru != null) resHtml += ` <span class="dado-descartado" title="dado mínimo">${cru}</span>`;
      // Dados que a explosão somou.
      for (const x of extras) resHtml += ` <span class="dado-explosao" title="explosão">+${x}</span>`;
      stringDados += `${op}(${resHtml}) 1d${d.faces}`;
    }
  });

  if (modUsar !== 0) {
    stringDados += ` ${modUsar >= 0 ? "+" : "-"} ${Math.abs(modUsar)}`;
  }

  // Piso de dano: eleva o total ao mínimo garantido, mostrando o cru riscado.
  if (opc.danoMinFloor > 0 && total < opc.danoMinFloor) {
    stringDados += ` <span class="dado-descartado" title="elevado pelo piso de dano">${total}</span>`;
    total = opc.danoMinFloor;
  }

  return { total, rolls, stringDados, critico, natural, valores };
}

// Cola as anotações de fonte ("· Vantagem por …") na parte dos dados.
function montarStringFinal(stringDados: string, notas: string[]): string {
  return notas.length
    ? `${stringDados} <span class="roll-fontes">· ${notas.join(" · ")}</span>`
    : stringDados;
}

export function PainelRolador({
  userId,
  userName,
  sessionId,
  onMensagemCriada,
  efeitosContexto,
  privado = false,
}: Props) {
  // Rolagem privada (narrador, com o combate marcado assim): vai pro chat sem números.
  const registrar: typeof registrarRolagem = (sessao, nome, rolagem) =>
    registrarRolagem(
      sessao,
      nome,
      privado ? { ...rolagem, ocultarRolagem: true, ocultarResultado: true, somenteNarrador: true } : rolagem,
    );
  const [dados, setDados] = useState<Dado[]>([]);
  const [modificadorTexto, setModificadorTexto] = useState("0");
  const [negativo, setNegativo] = useState(false);
  const [modoRolagem, setModoRolagem] = useState<ModoRolagem>("normal");
  const [quantidadeTexto, setQuantidadeTexto] = useState("1");
  const [modoGravacao, setModoGravacao] = useState(false);
  const [resultado, setResultado] = useState<Resultado>({ tipo: "preview" });
  const [presetsAbertos, setPresetsAbertos] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [pedindoNome, setPedindoNome] = useState(false);
  const [nomePresetTmp, setNomePresetTmp] = useState("");
  // Contexto da rolagem empilhada (etapa 3): casa efeitos contextuais no
  // Rolador (3.3) e prefixa a mensagem no chat. Null = rolagem manual avulsa.
  const [contexto, setContexto] = useState<ContextoRolagem | null>(null);
  const [nomeContexto, setNomeContexto] = useState<string | null>(null);
  // Efeitos da rolagem empilhada (ficha + arma que desfere). Null = os da ficha.
  const [efeitosRolagem, setEfeitosRolagem] = useState<EfeitosContexto | null>(null);
  // Chips que o usuário alternou; o resto segue o padrão do tipo.
  const [chipsAlternados, setChipsAlternados] = useState<Set<string>>(new Set());
  // Rolagem contextual que ofereceu rerroll — segura a persistência no chat até
  // o usuário decidir (Manter / Rerrolar). Null = nada pendente.
  const [pendente, setPendente] = useState<Pendente | null>(null);
  // Último ataque rolado: crítico, d20 natural e se trocou acerto por dano. O
  // próximo dano empilhado liga sozinho os chips que dependem disso.
  const ultimoAtaque = useRef({ critico: false, natural: 0, poderoso: false });
  // Rolagem empilhada que já sai rolada: aperta o "ROLAR!" depois que o estado
  // dela (dados, contexto, chips) assentou.
  const [rolarAuto, setRolarAuto] = useState(0);
  const botaoRolar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!rolarAuto) return;
    const espera = setTimeout(() => botaoRolar.current?.click(), 0);
    return () => clearTimeout(espera);
  }, [rolarAuto]);
  // Quem empilhou a rolagem quer saber o resultado (combate).
  const aoConcluir = useRef<EmpilharRolagemDetail["aoConcluir"] | null>(null);
  function avisarConclusao(lances: Lance[]) {
    const avisar = aoConcluir.current;
    aoConcluir.current = null;
    avisar?.(
      lances.map((l) => ({
        total: l.total,
        natural: l.natural,
        critico: l.critico === "sucesso",
        explosao: l.explosao === true,
      })),
    );
  }
  // Vantagem/desvantagem que veio decidida com a rolagem empilhada, por lance.
  const modosEmpilhados = useRef<ModoRolagem[] | null>(null);
  const efeitosContextoRef = useRef(efeitosContexto);
  useEffect(() => {
    efeitosContextoRef.current = efeitosContexto;
  }, [efeitosContexto]);

  // Chips que casam com o contexto atual (vantagem, crit expandido…).
  const chips = useMemo<ChipContexto[]>(() => {
    const efeitos = efeitosRolagem ?? efeitosContexto;
    return contexto && efeitos ? chipsDoContexto(efeitos, contexto) : [];
  }, [contexto, efeitosContexto, efeitosRolagem]);
  // Bônus progressivo conta passos em vez de ligar e desligar: a contagem vem da
  // ficha e o que for mexido aqui fica por cima até a próxima rolagem empilhada.
  const [passosAjustados, setPassosAjustados] = useState<Record<string, number>>({});
  const passosDe = (c: ChipContexto) =>
    Math.min(c.max ?? 0, passosAjustados[c.memoria ?? c.chave] ?? c.progressivo?.passos ?? 0);
  const chipLigado = (c: ChipContexto) =>
    c.tipo === "progressivo" ? passosDe(c) > 0 : !c.opcional !== chipsAlternados.has(c.chave);
  // Usos empilhados de cada chip sob demanda ligado (1 = um uso só).
  const [vezesDosChips, setVezesDosChips] = useState<Record<string, number>>({});
  const vezesDe = (c: ChipContexto) =>
    empilhavel(c) ? Math.min(c.max ?? 1, Math.max(1, vezesDosChips[c.chave] ?? 1)) : 1;

  useEffect(() => {
    setPresets(getPresets(userId));
  }, [userId]);

  // Escuta empilhamentos vindos da ficha (cards de ação, chips de perícia…).
  // Substitui a rolagem atual pela empilhada — dados, modificador e contexto.
  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<EmpilharRolagemDetail>).detail;
      if (!det) return;
      const ataque = ultimoAtaque.current;
      ultimoAtaque.current = { critico: false, natural: 0, poderoso: false };
      // Dano depois do ataque: Crítico, acerto por dano e dano máximo por d20
      // (o máximo não liga no crítico, que já dobra os dados).
      const ligados: string[] = [];
      const efeitos = det.efeitos ?? efeitosContextoRef.current;
      if (det.contexto?.tipo === "dano") {
        if (ataque.critico || det.critico) ligados.push("critico");
        for (const c of efeitos ? chipsDoContexto(efeitos, det.contexto) : []) {
          if (c.tipo === "dano_poderoso" && ataque.poderoso) ligados.push(c.chave);
          if (
            c.tipo === "dano_maximo" &&
            c.opcional &&
            c.valor &&
            !ataque.critico &&
            ataque.natural >= c.valor
          ) {
            ligados.push(c.chave);
          }
        }
      }
      aoConcluir.current = det.aoConcluir ?? null;
      modosEmpilhados.current = det.modos?.length ? det.modos : null;
      setDados(det.dados ?? []);
      setModificadorTexto(String(det.modificador ?? 0));
      setNegativo(false);
      setContexto(det.contexto ?? null);
      setNomeContexto(det.nomePreset ?? null);
      setEfeitosRolagem(det.efeitos ?? null);
      setChipsAlternados(new Set<string>(ligados));
      setPassosAjustados({});
      setVezesDosChips({});
      setPendente(null);
      setModoGravacao(false);
      setResultado({ tipo: "preview" });
      if (det.rolarAuto) setRolarAuto((n) => n + 1);
    }
    window.addEventListener(EVENTO_EMPILHAR, ouvir);
    return () => window.removeEventListener(EVENTO_EMPILHAR, ouvir);
  }, []);

  // Rolagem já feita na ficha (cura, Dado de Vida): mostra e manda pro chat.
  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<PublicarRolagemDetail>).detail;
      if (!det) return;
      const r = det.resultado;
      const detalhesHtml = `[${r.total}] = ${formatarResultadoRolagemHtml(r)}`;
      setResultado({ tipo: "rolado", total: String(r.total), detalhesHtml });
      registrar(sessionId, userName, {
        tipo: "rolagem",
        total: r.total,
        detalhes: r.detalhes,
        modificador: r.modificador,
        modo: "normal",
        nomePreset: det.nomePreset,
        texto: detalhesHtml,
      })
        .then((msg) => onMensagemCriada(msg))
        .catch((err) => console.error(err));
    }
    window.addEventListener(EVENTO_PUBLICAR, ouvir);
    return () => window.removeEventListener(EVENTO_PUBLICAR, ouvir);
  }, [sessionId, userName, onMensagemCriada]);

  const modificador = Number(modificadorTexto || 0);
  const quantidade = Number(quantidadeTexto || 1);
  const vazio = dados.length === 0 && modificador === 0;
  const quantidadeValida = Math.max(1, Math.trunc(quantidade || 0));
  // Multiataque ligado rola o ataque várias vezes de uma vez (com mais de um chip, o maior).
  const vezesMulti = Math.max(
    1,
    ...chips.filter((c) => c.tipo === "multi_ataque" && chipLigado(c)).map((c) => c.valor ?? 1),
  );
  const repeticoes = Math.max(quantidadeValida, vezesMulti);
  const loteAtivo = repeticoes > 1;

  const preview = useMemo(() => {
    if (vazio) {
      return {
        total: "--",
        detalhes: modoGravacao
          ? "Monte a rolagem do preset..."
          : loteAtivo
            ? `Lote ${repeticoes}x · ${rotuloModo(modoRolagem).toLowerCase()}`
            : "Selecione dados...",
      };
    }
    return {
      total: "??",
      detalhes: `${formulaTexto(dados, modificador)}${loteAtivo ? ` ×${repeticoes}` : ""}${
        modoRolagem !== "normal" ? ` · ${rotuloModo(modoRolagem)}` : ""
      }`,
    };
  }, [vazio, dados, modificador, modoGravacao, loteAtivo, repeticoes, modoRolagem]);

  const display =
    resultado.tipo === "rolado"
      ? { total: String(resultado.total), detalhes: resultado.detalhesHtml }
      : preview;

  function adicionarDado(faces: number) {
    setDados((d) => [...d, { faces, sinal: negativo ? -1 : 1 }]);
    setResultado({ tipo: "preview" });
  }

  function mudarMod(v: string) {
    setModificadorTexto(v);
    setResultado({ tipo: "preview" });
  }

  function mudarQuantidade(v: string) {
    setQuantidadeTexto(v);
    setResultado({ tipo: "preview" });
  }

  function normalizarModificador() {
    if (modificadorTexto.trim() === "") {
      setModificadorTexto("0");
      return;
    }
    setModificadorTexto(String(Number(modificadorTexto) || 0));
  }

  function normalizarQuantidade() {
    if (quantidadeTexto.trim() === "") {
      setQuantidadeTexto("1");
      return;
    }
    const valor = Math.max(1, Math.trunc(Number(quantidadeTexto) || 1));
    setQuantidadeTexto(String(valor));
  }

  function desfocarCampoAtivo(event: React.MouseEvent<HTMLDivElement>) {
    const alvo = event.target as HTMLElement | null;
    if (!alvo) return;
    if (alvo.closest("input") || alvo.closest("button")) return;
    const ativo = document.activeElement;
    if (ativo instanceof HTMLElement) ativo.blur();
  }

  function alternarModoRolagem(modo: Exclude<ModoRolagem, "normal">) {
    setModoRolagem((atual) => (atual === modo ? "normal" : modo));
    setResultado({ tipo: "preview" });
  }

  function limpar() {
    aoConcluir.current = null;
    modosEmpilhados.current = null;
    setDados([]);
    setModificadorTexto("0");
    setNegativo(false);
    setModoRolagem("normal");
    setQuantidadeTexto("1");
    setContexto(null);
    setNomeContexto(null);
    setEfeitosRolagem(null);
    setChipsAlternados(new Set());
    setPassosAjustados({});
    setVezesDosChips({});
    setPendente(null);
    setResultado({ tipo: "preview" });
  }

  // − e + do chip empilhável: abaixo de 1 uso, desliga.
  function mudarVezes(c: ChipContexto, delta: number) {
    const n = vezesDe(c) + delta;
    if (n < 1) {
      setVezesDosChips((s) => ({ ...s, [c.chave]: 1 }));
      alternarChip(c.chave);
      return;
    }
    setVezesDosChips((s) => ({ ...s, [c.chave]: Math.min(c.max ?? 1, n) }));
    setResultado({ tipo: "preview" });
  }

  function alternarChip(t: string) {
    setChipsAlternados((s) => {
      const next = new Set(s);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
    setResultado({ tipo: "preview" });
  }

  function mudarPassos(c: ChipContexto, delta: number) {
    const n = Math.min(c.max ?? 0, Math.max(0, passosDe(c) + delta));
    setPassosAjustados((s) => ({ ...s, [c.memoria ?? c.chave]: n }));
    anunciarPassos(c, n);
    setResultado({ tipo: "preview" });
  }

  // Grava a rolagem no chat (com o HTML do Rolador) e atualiza o display.
  function finalizar(
    total: number,
    rolls: DadoRolado[],
    modUsar: number,
    stringFinal: string,
    nomePreset: string | null,
  ) {
    const detalhesHtml = `[${total}] = ${stringFinal}`;
    setResultado({ tipo: "rolado", total: String(total), detalhesHtml });

    registrar(sessionId, userName, {
      tipo: "rolagem",
      total,
      detalhes: rolls,
      modificador: modUsar,
      modo: "normal",
      nomePreset: nomePreset || null,
      texto: detalhesHtml,
    })
      .then((msg) => onMensagemCriada(msg))
      .catch((err) => console.error(err));
  }

  function executarRolagem(
    dadosUsar: Dado[],
    modUsar: number,
    nomePreset: string | null,
    quantidadeUsar: number,
    modoUsar: ModoRolagem,
  ) {
    if (dadosUsar.length === 0 && modUsar === 0) return;

    if (quantidadeUsar > 1) {
      const lote = rolarLote(dadosUsar, modUsar, quantidadeUsar, modoUsar);
      const linhas = lote.execucoes
        .map(
          (execucao, indice) =>
            `<div class="roll-batch-row"><span class="roll-batch-index">#${indice + 1}</span><span class="roll-batch-total">[${execucao.total}]</span><span class="roll-batch-formula">= ${formatarResultadoRolagemHtml(execucao)}</span></div>`,
        )
        .join("");
      const resumo = `${quantidadeUsar}x ${rotuloModo(modoUsar).toLowerCase()}`;

      setResultado({
        tipo: "rolado",
        total: `${quantidadeUsar}x`,
        detalhesHtml: `[${resumo}] ${formulaTexto(dadosUsar, modUsar)}${modUsar !== 0 ? ` ${modUsar >= 0 ? "+" : "-"} ${Math.abs(modUsar)}` : ""}<div class="roll-batch-list">${linhas}</div>`,
      });

      registrar(sessionId, userName, {
        tipo: "lote",
        total: null,
        quantidade: lote.quantidade,
        modificador: modUsar,
        modo: modoUsar,
        execucoes: lote.execucoes.map((execucao) => ({
          total: execucao.total,
          modificador: execucao.modificador,
          modo: execucao.modo,
          detalhes: execucao.detalhes,
        })),
        nomePreset: nomePreset || null,
      })
        .then((msg) => onMensagemCriada(msg))
        .catch((err) => console.error(err));
      return;
    }

    const r = rolarDados(dadosUsar, modUsar, modoUsar);
    const stringFinal = formatarResultadoRolagemHtml(r);

    setResultado({
      tipo: "rolado",
      total: String(r.total),
      detalhesHtml: `[${r.total}] = ${stringFinal}`,
    });

    registrar(sessionId, userName, {
      tipo: "rolagem",
      total: r.total,
      detalhes: r.detalhes,
      modificador: modUsar,
      modo: modoUsar,
      nomePreset: nomePreset || null,
    })
      .then((msg) => onMensagemCriada(msg))
      .catch((err) => console.error(err));
  }

  // Rolagem contextual: aplica vantagem/desvantagem/floor/crit no d20 primário
  // e anota as fontes dos efeitos ligados. Se houver rerroll disponível (chip
  // `reroll` ligado), entra em modo "pendente" — mostra o resultado mas só
  // persiste no chat quando o usuário Mantém. Usa o memo `chips`.
  function rolarContextual(dadosBase: Dado[], modBase: number, nomePreset: string | null) {
    if (dadosBase.length === 0 && modBase === 0) return;
    const ligados = chips.filter(chipLigado);
    const ehDano = contexto?.tipo === "dano";
    const explosoes = ligados.flatMap((c) => (c.tipo === "explosao" && c.explosao ? [c.explosao] : []));
    const ligado = (t: ChipContexto["tipo"]) => ligados.some((c) => c.tipo === t);
    // Valor do tipo entre os chips ligados; com mais de um (o que vale sempre e o
    // de uso limitado), `melhor` escolhe.
    const valorChip = (t: ChipContexto["tipo"], melhor: (...ns: number[]) => number = Math.max) => {
      const valores = ligados.flatMap((c) => (c.tipo === t && c.valor != null ? [c.valor] : []));
      return valores.length ? melhor(...valores) : undefined;
    };
    const somaLigados = (t: ChipContexto["tipo"]) =>
      ligados.filter((c) => c.tipo === t).reduce((soma, c) => soma + (c.valor ?? 0), 0);
    // Dano extra e dados extras dos chips ligados (dados iguais ao 1º dado do dano).
    const extras = ligados.filter((c) => c.tipo === "dano_extra" || c.tipo === "dados_extra");
    const dadoDoDano = dadosBase.find((d) => d.sinal > 0);
    const copias = (n: number) => (dadoDoDano ? Array.from({ length: n }, () => dadoDoDano) : []);
    // Bônus progressivo: a fórmula uma vez por passo.
    const progressivos = ligados.filter((c) => c.tipo === "progressivo");
    const dadosExtras = [
      // Empilhado, o chip sob demanda entra uma vez por uso.
      ...extras.flatMap((c) =>
        c.tipo === "dano_extra"
          ? Array.from({ length: vezesDe(c) }, () => c.dados ?? []).flat()
          : copias((c.valor ?? 0) * vezesDe(c)),
      ),
      ...progressivos.flatMap((c) => Array.from({ length: passosDe(c) }, () => c.dados ?? []).flat()),
    ];
    // Bônus situacionais e acerto por dano mexem no modificador.
    const modUsar =
      modBase +
      extras.reduce((soma, c) => soma + (c.tipo === "dano_extra" ? (c.valor ?? 0) * vezesDe(c) : 0), 0) +
      progressivos.reduce((soma, c) => soma + passosDe(c) * (c.valor ?? 0), 0) +
      somaLigados("bonus") +
      somaLigados("dano_poderoso") -
      somaLigados("ataque_poderoso");
    // A rerrolagem gasta o uso só quando acontece. Chips da mesma habilidade
    // gastam juntos: vale o maior empilhamento entre eles.
    const vezesPorHabilidade = new Map<string, number>();
    for (const c of ligados) {
      if (!c.gasta || c.tipo === "reroll") continue;
      vezesPorHabilidade.set(c.gasta, Math.max(vezesPorHabilidade.get(c.gasta) ?? 1, vezesDe(c)));
    }
    const gastos: Gasto[] = [...vezesPorHabilidade].map(([id, vezes]) => ({ id, vezes }));
    const comExtras = [...dadosBase, ...dadosExtras];
    // Crítico no dano: rola os dados 2× (ou mais) e soma os dados a mais.
    const critico = ligados.find((c) => c.tipo === "critico");
    const dadosUsar = critico
      ? [
          ...Array.from({ length: critico.valor ?? 2 }, () => comExtras).flat(),
          ...copias(critico.extras ?? 0),
        ]
      : comExtras;

    // Piso de dano = metade do dano MÁXIMO da fórmula (arredonda pra cima).
    // Máximo: dado positivo rende `faces`, negativo rende -1 (mínimo do dado).
    const maxDano =
      modUsar + dadosUsar.reduce((s, d) => s + (d.sinal > 0 ? d.faces : -1), 0);
    const danoMinFloor =
      ligado("dano_min") && maxDano > 0 ? Math.ceil(maxDano / 2) : 0;

    // Vantagem/desvantagem do d20 = chip do contexto OU o toggle manual do
    // Rolador (vantagem situacional do narrador). As duas juntas se cancelam —
    // o d20 rola um só. Mesmo casamento da regra de 5e.
    const vantManual = modoRolagem === "vantagem";
    const desvManual = modoRolagem === "desvantagem";

    const opc: OpcoesContextuais = {
      vantagem: ligado("vantagem") || vantManual,
      desvantagem: ligado("desvantagem") || desvManual,
      floorD20: valorChip("floor_d20") ?? 0,
      critRange: valorChip("crit_range", Math.min) ?? 20,
      danoMinFloor,
      melhorDe: valorChip("melhor_de") ?? 1,
      danoMaximo: ligado("dano_maximo"),
      pisosDado: ligados.flatMap((c) => (c.tipo === "piso_dado" && c.piso ? [c.piso] : [])),
      explosoesDado: explosoes.flatMap((x) =>
        ehDano && x.gatilho !== "total"
          ? [{ minimo: x.gatilho === "valor" ? x.valor : 0, limite: x.limite }]
          : [],
      ),
      explosoesTotal: explosoes.flatMap((x) =>
        ehDano && x.gatilho === "total" ? [{ minimo: x.valor, limite: x.limite }] : [],
      ),
    };
    // No ataque, a explosão rende outro ataque.
    const explosoesAtaque = contexto?.tipo === "ataque" ? explosoes : [];
    // Modo decidido antes de empilhar (alvo já escolhido) soma com os chips, por lance.
    const modos = modosEmpilhados.current;
    modosEmpilhados.current = null;
    const opcDe = (i: number): OpcoesContextuais => {
      const modo = modos?.[Math.min(i, modos.length - 1)];
      if (!modo) return opc;
      return {
        ...opc,
        vantagem: ligado("vantagem") || modo === "vantagem",
        desvantagem: ligado("desvantagem") || modo === "desvantagem",
      };
    };
    const rolar = (i = 0) => montarDadosContextuais(dadosUsar, modUsar, opcDe(i));
    // Multiataque ou repetições: o maior dos dois.
    const vezes = Math.max(quantidadeValida, valorChip("multi_ataque") ?? 1);

    // Anota as fontes dos efeitos ligados (exceto reroll, que vira interação).
    // Escapa nomes — vão pra string HTML renderizada no chat.
    const notas = chips
      .filter((c) => chipLigado(c) && c.tipo !== "reroll")
      .map((c) => {
        const base = escaparHtml(
          c.tipo === "progressivo"
            ? `${c.rotulo} ×${passosDe(c)}`
            : vezesDe(c) > 1
              ? `${c.rotulo} ×${vezesDe(c)}`
              : c.rotulo,
        );
        return c.fontes.length
          ? `${base} por ${escaparHtml(c.fontes.join(", "))}`
          : base;
      });
    // Vant./desv. vinda só do toggle manual (sem chip) vira anotação própria.
    if (vantManual && !ligado("vantagem")) notas.push("Vantagem");
    if (desvManual && !ligado("desvantagem")) notas.push("Desvantagem");

    // Progressivo "por rolagem": esta rolagem vale a contagem atual e a próxima sobe um.
    for (const c of chips) {
      if (c.progressivo?.cresce === "rolagem" && passosDe(c) < (c.max ?? 0)) {
        anunciarPassos(c, passosDe(c) + 1);
      }
    }

    // Lote contextual: mais de uma vez roda N execuções contextuais e persiste
    // como lote. Reroll não se aplica num lote — só no lance único.
    if (vezes > 1) {
      const execucoes = Array.from({ length: vezes }, (_, i) =>
        comAtaquesExplosivos(rolar(i), explosoesAtaque, () => rolar(i)),
      ).flat();
      gastarMunicao(execucoes.length);
      avisarConclusao(execucoes);
      publicarLote(execucoes, dadosUsar, modUsar, nomePreset, opc, notas);
      gastarHabilidades(gastos);
      return;
    }

    const opcUm = opcDe(0);
    if (modos?.[0] === "vantagem" && !ligado("vantagem")) notas.push("Vantagem");
    if (modos?.[0] === "desvantagem" && !ligado("desvantagem")) notas.push("Desvantagem");
    const r = rolar();
    if (contexto?.tipo === "ataque") {
      ultimoAtaque.current = {
        critico: r.critico === "sucesso",
        natural: r.natural ?? 0,
        poderoso: ligado("ataque_poderoso"),
      };
    }
    const rerolls = valorChip("reroll") ?? 0;

    if (rerolls > 0) {
      gastarMunicao(1);
      // Segura no preview "rolado" e espera a decisão; nada vai pro chat ainda.
      const stringFinal = montarStringFinal(r.stringDados, notas);
      setResultado({ tipo: "rolado", total: String(r.total), detalhesHtml: `[${r.total}] = ${stringFinal}` });
      setPendente({
        dadosUsar: [...dadosUsar],
        modUsar,
        nomePreset,
        opc: opcUm,
        notas,
        stringDados: r.stringDados,
        total: r.total,
        rolls: r.rolls,
        rerollsRestantes: rerolls,
        rerollsUsados: 0,
        critico: r.critico,
        natural: r.natural,
        explosoes: explosoesAtaque,
        ataque: contexto?.tipo === "ataque",
        gastos,
        valores: r.valores,
        gastaReroll: ligados.find((c) => c.tipo === "reroll")?.gasta,
      });
    } else {
      const lances = comAtaquesExplosivos(r, explosoesAtaque, () => rolar(0));
      gastarMunicao(lances.length);
      concluir(lances, dadosUsar, modUsar, nomePreset, opcUm, notas);
      gastarHabilidades(gastos);
    }
  }

  // Um lance vai pro chat sozinho; com os ataques da explosão, vai como lote.
  function concluir(
    lances: Lance[],
    dadosUsar: Dado[],
    modUsar: number,
    nomePreset: string | null,
    opc: OpcoesContextuais,
    notas: string[],
  ) {
    avisarConclusao(lances);
    if (lances.length > 1) return publicarLote(lances, dadosUsar, modUsar, nomePreset, opc, notas);
    const r = lances[0];
    finalizar(r.total, r.rolls, modUsar, montarStringFinal(r.stringDados, notas), nomePreset);
  }

  // Ataque com arma de munição gasta uma por lance (a rerrolagem não gasta).
  function gastarMunicao(lances: number) {
    if (contexto?.tipo === "ataque" && contexto.municao && lances > 0) {
      anunciarGastoMunicao(contexto.municao.id, lances);
    }
  }

  // Lote contextual: persiste N execuções contextuais (vant/desv/floor/crit por
  // d20) como lote no chat. Cada execução leva sua string HTML formatada
  // (`texto`) pra preservar dado descartado/crit/piso por linha. As fontes (notas)
  // aparecem no resumo do Rolador; o lote no chat mostra a tag do modo efetivo.
  function publicarLote(
    execucoes: Lance[],
    dadosUsar: Dado[],
    modUsar: number,
    nomePreset: string | null,
    opc: OpcoesContextuais,
    notas: string[],
  ) {
    const quantidade = execucoes.length;
    const modoEfetivo: ModoRolagem =
      opc.vantagem && !opc.desvantagem
        ? "vantagem"
        : opc.desvantagem && !opc.vantagem
          ? "desvantagem"
          : "normal";

    const resumo = `${quantidade}x ${rotuloModo(modoEfetivo).toLowerCase()}`;
    const notasHtml = notas.length
      ? ` <span class="roll-fontes">· ${notas.join(" · ")}</span>`
      : "";
    const linhas = execucoes
      .map(
        (e, i) =>
          `<div class="roll-batch-row"><span class="roll-batch-index">#${i + 1}</span><span class="roll-batch-total">[${e.total}]</span><span class="roll-batch-formula">= ${textoDoLance(e)}</span></div>`,
      )
      .join("");
    setResultado({
      tipo: "rolado",
      total: `${quantidade}x`,
      detalhesHtml: `[${resumo}] ${formulaTexto(dadosUsar, modUsar)}${notasHtml}<div class="roll-batch-list">${linhas}</div>`,
    });

    registrar(sessionId, userName, {
      tipo: "lote",
      total: null,
      quantidade,
      modificador: modUsar,
      modo: modoEfetivo,
      execucoes: execucoes.map((e) => ({
        total: e.total,
        modificador: modUsar,
        modo: modoEfetivo,
        detalhes: e.rolls,
        texto: textoDoLance(e),
      })),
      nomePreset: nomePreset || null,
    })
      .then((msg) => onMensagemCriada(msg))
      .catch((err) => console.error(err));
  }

  // Rerrola só um d20 do lance pendente (com vantagem/desvantagem, o escolhido);
  // os outros dados ficam. Consome uma rerrolagem e o uso da habilidade.
  function rerrolar(indice = 0) {
    if (!pendente || pendente.rerollsRestantes <= 0) return;
    const d20 = [...pendente.valores.d20];
    if (d20.length > 0) d20[Math.min(indice, d20.length - 1)] = Math.floor(Math.random() * 20) + 1;
    const r = montarUmLance(pendente.dadosUsar, pendente.modUsar, pendente.opc, {
      ...pendente.valores,
      d20,
    });
    if (pendente.gastaReroll) gastarHabilidades([{ id: pendente.gastaReroll, vezes: 1 }]);
    if (pendente.ataque) {
      ultimoAtaque.current = {
        ...ultimoAtaque.current,
        critico: r.critico === "sucesso",
        natural: r.natural ?? 0,
      };
    }
    const usados = pendente.rerollsUsados + 1;
    const notas = [...pendente.notas, `rerrolado ${usados}×`];
    const stringFinal = montarStringFinal(r.stringDados, notas);
    setResultado({ tipo: "rolado", total: String(r.total), detalhesHtml: `[${r.total}] = ${stringFinal}` });
    setPendente({
      ...pendente,
      stringDados: r.stringDados,
      total: r.total,
      rolls: r.rolls,
      valores: r.valores,
      critico: r.critico,
      natural: r.natural,
      rerollsRestantes: pendente.rerollsRestantes - 1,
      rerollsUsados: usados,
    });
  }

  // Aceita o lance pendente e persiste no chat (anota "rerrolado" se houve).
  function manter() {
    if (!pendente) return;
    const notas = [...pendente.notas];
    if (pendente.rerollsUsados > 0) notas.push(`rerrolado ${pendente.rerollsUsados}×`);
    const { dadosUsar, modUsar, opc } = pendente;
    const mantido: Lance = {
      total: pendente.total,
      rolls: pendente.rolls,
      stringDados: pendente.stringDados,
      critico: pendente.critico,
      natural: pendente.natural,
      valores: pendente.valores,
    };
    const lances = comAtaquesExplosivos(mantido, pendente.explosoes, () =>
      montarDadosContextuais(dadosUsar, modUsar, opc),
    );
    concluir(lances, dadosUsar, modUsar, pendente.nomePreset, opc, notas);
    gastarHabilidades(pendente.gastos);
    setPendente(null);
  }

  // Chip de dano sob demanda gasta a habilidade (a aba Habilidades debita).
  function gastarHabilidades(gastos: Gasto[]) {
    for (const detail of gastos) {
      window.dispatchEvent(new CustomEvent("rpgo:gastar-habilidade", { detail }));
    }
  }

  function clicarRolar() {
    if (vazio) return;
    if (modoGravacao) {
      setPedindoNome(true);
      setNomePresetTmp("");
      return;
    }
    setPendente(null);
    // Com contexto empilhado, a rolagem é contextual (vant/floor/crit/reroll no
    // d20) e ignora o lote. Sem contexto, segue o fluxo manual (lote + modo).
    if (contexto) rolarContextual(dados, modificador, nomeContexto);
    else executarRolagem(dados, modificador, nomeContexto, quantidadeValida, modoRolagem);
    // Mantém modificador, limpa só os dados (igual legacy). Contexto foi
    // consumido nesta rolagem — zera pra não vazar pro próximo lance manual.
    // (rolarContextual já guardou o snapshot necessário na pendência.)
    setDados([]);
    setContexto(null);
    setNomeContexto(null);
    setEfeitosRolagem(null);
    setChipsAlternados(new Set());
    setPassosAjustados({});
    setVezesDosChips({});
  }

  function salvarPresetComNome() {
    const nv = nomePresetTmp.trim();
    if (!nv) return;
    addPreset(userId, {
      nome: nv,
      dados,
      modificador,
      modoRolagem,
      quantidade: quantidadeValida,
    });
    setPresets(getPresets(userId));
    setPedindoNome(false);
    setNomePresetTmp("");
    setModoGravacao(false);
    setDados([]);
    setModificadorTexto("0");
    setModoRolagem("normal");
    setQuantidadeTexto("1");
    setResultado({ tipo: "preview" });
    setPresetsAbertos(true);
  }

  function entrarGravacao() {
    setModoGravacao(true);
    setDados([]);
    setModificadorTexto("0");
    setNegativo(false);
    setModoRolagem("normal");
    setQuantidadeTexto("1");
    setPendente(null);
    setResultado({ tipo: "preview" });
  }

  function cancelarGravacao() {
    setModoGravacao(false);
    setDados([]);
    setModificadorTexto("0");
    setModoRolagem("normal");
    setQuantidadeTexto("1");
    setResultado({ tipo: "preview" });
  }

  async function executarPreset(p: Preset) {
    if (modoGravacao) cancelarGravacao();
    executarRolagem(p.dados, p.modificador, p.nome, p.quantidade, p.modoRolagem);
  }

  async function apagarPreset(p: Preset) {
    const r = await Swal.fire({
      title: "Remover preset",
      text: `Remover "${p.nome}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remover",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!r.isConfirmed) return;
    removePreset(userId, p.id);
    setPresets(getPresets(userId));
  }

  return (
    <>
      <div className={"dice-grid-buttons" + (negativo ? " negative-mode" : "")}>
        <button
          type="button"
          className="dice-btn sign-btn"
          onClick={() => setNegativo((v) => !v)}
          title="Alternar Somar/Subtrair"
        >
          {negativo ? "-" : "+"}
        </button>
        {FACES.map((f) => (
          <button
            type="button"
            key={f}
            className="dice-btn"
            onClick={() => adicionarDado(f)}
          >
            d{f}
          </button>
        ))}
      </div>

      <div className="tray-footer roll-footer-row" onMouseDownCapture={desfocarCampoAtivo}>
        <label className="roll-footer-field">
          <span>Repetições</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={quantidadeTexto}
            onFocus={() => {
              if (quantidadeTexto === "0") setQuantidadeTexto("");
            }}
            onChange={(e) => mudarQuantidade(e.target.value)}
            onBlur={normalizarQuantidade}
          />
        </label>

        <span className="roll-footer-separator">x</span>

        <label className="roll-footer-field roll-footer-mod">
          <span>Modificador</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="-?[0-9]*"
            value={modificadorTexto}
            onFocus={() => {
              if (modificadorTexto === "0") setModificadorTexto("");
            }}
            onChange={(e) => mudarMod(e.target.value)}
            placeholder="+0"
            onBlur={normalizarModificador}
          />
        </label>

        <button type="button" className="btn-rect neutro sm" title="Limpar" onClick={limpar}>
          <i className="fas fa-trash" />
        </button>
      </div>

      <div className="roll-settings">
        <div className="roll-mode-switch" role="group" aria-label="Modo de rolagem">
          {([
            ["vantagem", "Vant.", "fa-clone", "vantagem"],
            ["desvantagem", "Desv.", "fa-clone", "desvantagem"],
          ] as const).map(([modo, texto, icone, tipo]) => (
            <button
              key={modo}
              type="button"
              className={"roll-toggle-btn " + tipo + (modoRolagem === modo ? " active" : "")}
              onClick={() => alternarModoRolagem(modo)}
              aria-pressed={modoRolagem === modo}
            >
              <i className={`fas ${icone}`} />
              <span>{texto}</span>
            </button>
          ))}
        </div>
      </div>

      {(contexto || nomeContexto) && (
        <div className="rolador-contexto" title="Rolagem empilhada da ficha">
          <i className="fas fa-crosshairs" />
          <span>{nomeContexto ?? "Rolagem da ficha"}</span>
        </div>
      )}

      {chips.length > 0 && (
        <div className="rolador-chips">
          {chips.map((c) => {
            const on = chipLigado(c);
            if (c.tipo === "progressivo") {
              const n = passosDe(c);
              return (
                <span
                  key={c.chave}
                  className={`rolador-chip rolador-chip-passos${on ? " on" : ""}`}
                  title={[`${c.rotulo} — ${c.fontes.join(", ")}`, c.detalhe, `até ${c.max}`]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <button
                    type="button"
                    aria-label={`Menos ${c.rotulo}`}
                    disabled={n <= 0}
                    onClick={() => mudarPassos(c, -1)}
                  >
                    <i className="fas fa-minus" />
                  </button>
                  <span>
                    <i className={`fas ${ICONE_CHIP[c.tipo]}`} /> {c.rotulo} ×{n}
                  </span>
                  <button
                    type="button"
                    aria-label={`Mais ${c.rotulo}`}
                    disabled={n >= (c.max ?? 0)}
                    onClick={() => mudarPassos(c, 1)}
                  >
                    <i className="fas fa-plus" />
                  </button>
                </span>
              );
            }
            // Sob demanda e ligado: − e + empilham os usos na mesma rolagem.
            if (on && empilhavel(c)) {
              const n = vezesDe(c);
              return (
                <span
                  key={c.chave}
                  className="rolador-chip rolador-chip-passos on"
                  title={[`${c.rotulo} — ${c.fontes.join(", ")}`, c.detalhe, `até ${c.max}×`]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <button type="button" aria-label={`Menos ${c.rotulo}`} onClick={() => mudarVezes(c, -1)}>
                    <i className="fas fa-minus" />
                  </button>
                  <span>
                    <i className={`fas ${ICONE_CHIP[c.tipo]}`} /> {c.rotulo} ×{n}
                    {c.usos && <span className="rolador-chip-usos">{c.usos}</span>}
                  </span>
                  <button
                    type="button"
                    aria-label={`Mais ${c.rotulo}`}
                    disabled={n >= (c.max ?? 1)}
                    onClick={() => mudarVezes(c, 1)}
                  >
                    <i className="fas fa-plus" />
                  </button>
                </span>
              );
            }
            return (
              <button
                key={c.chave}
                type="button"
                className={`rolador-chip${on ? " on" : ""}`}
                aria-pressed={on}
                title={[
                  c.fontes.length ? `${c.rotulo} — ${c.fontes.join(", ")}` : c.rotulo,
                  c.detalhe,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                onClick={() => alternarChip(c.chave)}
              >
                <i className={`fas ${ICONE_CHIP[c.tipo]}`} />
                {c.rotulo}
                {c.usos && <span className="rolador-chip-usos">{c.usos}</span>}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        ref={botaoRolar}
        className={"roll-btn" + (modoGravacao ? " recording" : "")}
        onClick={clicarRolar}
        disabled={vazio}
      >
        {modoGravacao ? "SALVAR PRESET" : loteAtivo ? `ROLAR X${repeticoes}` : "ROLAR!"}
      </button>

      <div className="tray-result-box">
        <div style={{ fontSize: "0.8rem", color: "var(--text-sec)" }}>Resultado:</div>
        <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--primary)" }}>{display.total}</div>
        <div
          style={{ fontSize: "0.85rem", color: "var(--text-sec)", marginTop: 5 }}
          dangerouslySetInnerHTML={{ __html: display.detalhes }}
        />
      </div>

      {pendente && (
        <div className="rolador-pendente">
          <span className="rolador-pendente-info">
            <i className="fas fa-rotate" /> Pode rerrolar
            {pendente.rerollsRestantes > 0
              ? ` (${pendente.rerollsRestantes}× restante${pendente.rerollsRestantes > 1 ? "s" : ""})`
              : " — sem usos"}
          </span>
          <div className="rolador-pendente-acoes">
            {/* Com vantagem/desvantagem, escolhe qual d20 relançar (só um). */}
            {(pendente.valores.d20.length > 1 ? pendente.valores.d20 : [null]).map((v, i) => (
              <button
                type="button"
                key={i}
                className="btn-rect neutro sm rolador-pendente-btn rerrolar"
                onClick={() => rerrolar(i)}
                disabled={pendente.rerollsRestantes <= 0}
              >
                <i className="fas fa-dice" /> Rerrolar{v != null ? ` ${v}` : ""}
              </button>
            ))}
            <button
              type="button"
              className="btn-rect neutro sm rolador-pendente-btn manter"
              onClick={manter}
            >
              <i className="fas fa-check" /> Manter
            </button>
          </div>
        </div>
      )}

      {modoGravacao && (
        <div className="preset-rec-banner">
          <span>
            <i className="fas fa-circle preset-rec-dot" /> Gravando preset...
          </span>
          <button
            type="button"
            className="preset-rec-cancel"
            title="Cancelar gravação"
            onClick={cancelarGravacao}
          >
            <i className="fas fa-times" />
          </button>
        </div>
      )}

      <button
        type="button"
        className={"preset-toggle-btn" + (presetsAbertos ? " open" : "")}
        onClick={() => setPresetsAbertos((v) => !v)}
      >
        <i className="fas fa-bookmark" />
        <span>Presets</span>
        <i className="fas fa-chevron-down preset-toggle-chevron" />
      </button>

      <div className={"presets-wrapper" + (presetsAbertos ? "" : " collapsed")}>
        <div className="presets-area">
          {presets.length === 0 ? (
            <div className="presets-empty">
              <i className="fas fa-bookmark" style={{ fontSize: "1.5rem", opacity: 0.4 }} />
              <p>Nenhum preset criado</p>
              <button
                type="button"
                className="btn-rect tracejado"
                onClick={entrarGravacao}
              >
                <i className="fas fa-plus" /> Criar Preset
              </button>
            </div>
          ) : (
            <>
              <div className="presets-grid">
                {presets.map((p) => (
                  <div
                    key={p.id}
                    className="preset-card"
                    title={`Rolar: ${p.nome}`}
                    onClick={() => executarPreset(p)}
                  >
                    <span className="preset-card-name">{p.nome}</span>
                    <span className="preset-card-formula">
                      {formulaTexto(p.dados, p.modificador)}
                      {p.quantidade > 1 ? ` ×${p.quantidade}` : ""}
                      {p.modoRolagem !== "normal" ? ` · ${rotuloModo(p.modoRolagem)}` : ""}
                    </span>
                    <button
                      type="button"
                      className="preset-card-del"
                      title="Remover preset"
                      onClick={(e) => {
                        e.stopPropagation();
                        apagarPreset(p);
                      }}
                    >
                      <i className="fas fa-times" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn-rect tracejado"
                onClick={entrarGravacao}
              >
                <i className="fas fa-plus" /> Novo Preset
              </button>
            </>
          )}
        </div>
      </div>

      {pedindoNome && (
        <div className="preset-name-overlay" onClick={() => setPedindoNome(false)}>
          <div className="preset-name-modal" onClick={(e) => e.stopPropagation()}>
            <h4>
              <i className="fas fa-bookmark" /> Nome do Preset
            </h4>
            <input
              type="text"
              autoFocus
              maxLength={40}
              placeholder="Ex: Ataque com machado"
              value={nomePresetTmp}
              onChange={(e) => setNomePresetTmp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  salvarPresetComNome();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setPedindoNome(false);
                }
              }}
            />
            <div className="preset-name-actions">
              <button
                type="button"
                className="btn-rect neutro sm"
                onClick={() => setPedindoNome(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-rect primary sm"
                onClick={salvarPresetComNome}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
