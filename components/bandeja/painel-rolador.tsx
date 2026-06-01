"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  type Dado,
  type DadoRolado,
  type ModoRolagem,
  formulaTexto,
  formatarResultadoRolagemHtml,
  rolarDados,
  rolarLote,
  rolarD20Contextual,
} from "@/lib/dice";
import { addPreset, getPresets, removePreset, type Preset } from "@/lib/presets";
import { registrarRolagem } from "./actions";
import type { MensagemSerializada } from "@/lib/mensagens";
import { EVENTO_EMPILHAR, type EmpilharRolagemDetail } from "@/lib/empilhar-rolagem";
import {
  chipsDoContexto,
  type ChipContexto,
  type ContextoRolagem,
  type EfeitosContexto,
} from "@/lib/op-rpg";

type Props = {
  userId: string;
  userName: string;
  sessionId: string;
  personagemId: string | null;
  onMensagemCriada: (msg: MensagemSerializada) => void;
  efeitosContexto?: EfeitosContexto;
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
  crit_range: "fa-burst",
  floor_d20: "fa-circle-up",
  reroll: "fa-rotate",
  dano_min: "fa-shield-halved",
  trocar_dano: "fa-fire",
  ignora: "fa-bolt-lightning",
  alcance: "fa-ruler-horizontal",
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
};

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
};

// Rola o d20 primário (1d20 positivo) com vant/desv/floor/crit e os demais dados
// normalmente. Retorna total, rolls crus e a string HTML da parte dos dados —
// sem as anotações de fonte (montadas à parte, pra reroll reaproveitar).
function montarDadosContextuais(
  dadosUsar: Dado[],
  modUsar: number,
  opc: OpcoesContextuais,
): { total: number; rolls: DadoRolado[]; stringDados: string } {
  const idxPrimario = dadosUsar.findIndex((d) => d.faces === 20 && d.sinal === 1);
  let total = modUsar;
  let stringDados = "";
  const rolls: DadoRolado[] = [];

  dadosUsar.forEach((d, i) => {
    const op =
      i === 0 ? (d.sinal === -1 ? "- " : "") : d.sinal === 1 ? " + " : " - ";
    if (i === idxPrimario) {
      const r = rolarD20Contextual({
        vantagem: opc.vantagem,
        desvantagem: opc.desvantagem,
        floorD20: opc.floorD20,
        critRange: opc.critRange,
      });
      total += r.resultado * d.sinal;
      rolls.push({ faces: 20, sinal: d.sinal, resultado: r.resultado });
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
      const resultado = Math.floor(Math.random() * d.faces) + 1;
      total += resultado * d.sinal;
      rolls.push({ faces: d.faces, sinal: d.sinal, resultado });
      let resHtml = `${resultado}`;
      if (resultado === 1) resHtml = `<span class="crit-fail">${resultado}</span>`;
      else if (resultado === d.faces)
        resHtml = `<span class="crit-success">${resultado}</span>`;
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

  return { total, rolls, stringDados };
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
  personagemId,
  onMensagemCriada,
  efeitosContexto,
}: Props) {
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
  // Chips contextuais começam todos ligados; guardamos só os que o usuário
  // desligou manualmente (override). Reseta a cada novo empilhar. Evitamos
  // set-state-in-effect derivando "ligado" daqui em vez de um Set de ativos.
  const [chipsDesativados, setChipsDesativados] = useState<
    Set<ChipContexto["tipo"]>
  >(new Set());
  // Rolagem contextual que ofereceu rerroll — segura a persistência no chat até
  // o usuário decidir (Manter / Rerrolar). Null = nada pendente.
  const [pendente, setPendente] = useState<Pendente | null>(null);

  // Chips que casam com o contexto atual (vantagem, crit expandido…).
  const chips = useMemo<ChipContexto[]>(
    () =>
      contexto && efeitosContexto ? chipsDoContexto(efeitosContexto, contexto) : [],
    [contexto, efeitosContexto],
  );
  const chipLigado = (t: ChipContexto["tipo"]) => !chipsDesativados.has(t);

  useEffect(() => {
    setPresets(getPresets(userId));
  }, [userId]);

  // Escuta empilhamentos vindos da ficha (cards de ação, chips de perícia…).
  // Substitui a rolagem atual pela empilhada — dados, modificador e contexto.
  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<EmpilharRolagemDetail>).detail;
      if (!det) return;
      setDados(det.dados ?? []);
      setModificadorTexto(String(det.modificador ?? 0));
      setNegativo(false);
      setContexto(det.contexto ?? null);
      setNomeContexto(det.nomePreset ?? null);
      setChipsDesativados(new Set());
      setPendente(null);
      setModoGravacao(false);
      setResultado({ tipo: "preview" });
    }
    window.addEventListener(EVENTO_EMPILHAR, ouvir);
    return () => window.removeEventListener(EVENTO_EMPILHAR, ouvir);
  }, []);

  const modificador = Number(modificadorTexto || 0);
  const quantidade = Number(quantidadeTexto || 1);
  const vazio = dados.length === 0 && modificador === 0;
  const quantidadeValida = Math.max(1, Math.trunc(quantidade || 0));
  const loteAtivo = quantidadeValida > 1;

  const preview = useMemo(() => {
    if (vazio) {
      return {
        total: "--",
        detalhes: modoGravacao
          ? "Monte a rolagem do preset..."
          : loteAtivo
            ? `Lote ${quantidadeValida}x · ${rotuloModo(modoRolagem).toLowerCase()}`
            : "Selecione dados...",
      };
    }
    return {
      total: "??",
      detalhes: `${formulaTexto(dados, modificador)}${loteAtivo ? ` ×${quantidadeValida}` : ""}${
        modoRolagem !== "normal" ? ` · ${rotuloModo(modoRolagem)}` : ""
      }`,
    };
  }, [vazio, dados, modificador, modoGravacao, loteAtivo, quantidadeValida, modoRolagem]);

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
    setDados([]);
    setModificadorTexto("0");
    setNegativo(false);
    setModoRolagem("normal");
    setQuantidadeTexto("1");
    setContexto(null);
    setNomeContexto(null);
    setChipsDesativados(new Set());
    setPendente(null);
    setResultado({ tipo: "preview" });
  }

  function alternarChip(t: ChipContexto["tipo"]) {
    setChipsDesativados((s) => {
      const next = new Set(s);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
    setResultado({ tipo: "preview" });
  }

  // Persiste a rolagem (chat + ultimaRolagem) e atualiza o display local.
  // `stringFinal` é a fração HTML após "[total] = "; persistimos como `texto`
  // pro chat renderizar igual ao Rolador (sem reconstruir dos rolls).
  function finalizar(
    total: number,
    rolls: DadoRolado[],
    modUsar: number,
    stringFinal: string,
    nomePreset: string | null,
  ) {
    const detalhesHtml = `[${total}] = ${stringFinal}`;
    setResultado({ tipo: "rolado", total: String(total), detalhesHtml });

    const textoLimpo = stringFinal.replace(/<[^>]*>?/gm, "");
    const prefixo = nomePreset ? `[${nomePreset}] ` : "";
    const ultimaRolagemTexto = personagemId
      ? `${prefixo}[${total}] = ${textoLimpo}`
      : null;

    registrarRolagem(
      sessionId,
      userName,
      {
        tipo: "rolagem",
        total,
        detalhes: rolls,
        modificador: modUsar,
        modo: "normal",
        nomePreset: nomePreset || null,
        texto: detalhesHtml,
      },
      personagemId,
      ultimaRolagemTexto,
    )
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
    const prefixo = nomePreset ? `[${nomePreset}] ` : "";

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

      const ultimaRolagemTexto = personagemId ? `${prefixo}[${resumo}] ${formulaTexto(dadosUsar, modUsar)}` : null;

      registrarRolagem(
        sessionId,
        userName,
        {
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
        },
        personagemId,
        ultimaRolagemTexto,
      )
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

    // Uma única chamada: registra a mensagem no chat E salva ultimaRolagem no
    // personagem (em paralelo no servidor). Retorna a mensagem pra append local.
    const textoLimpo = stringFinal.replace(/<[^>]*>?/gm, "");
    const ultimaRolagemTexto = personagemId ? `${prefixo}[${r.total}] = ${textoLimpo}` : null;

    registrarRolagem(
      sessionId,
      userName,
      {
        tipo: "rolagem",
        total: r.total,
        detalhes: r.detalhes,
        modificador: modUsar,
        modo: modoUsar,
        nomePreset: nomePreset || null,
      },
      personagemId,
      ultimaRolagemTexto,
    )
      .then((msg) => onMensagemCriada(msg))
      .catch((err) => console.error(err));
  }

  // Rolagem contextual: aplica vantagem/desvantagem/floor/crit no d20 primário
  // e anota as fontes dos efeitos ligados. Se houver rerroll disponível (chip
  // `reroll` ligado), entra em modo "pendente" — mostra o resultado mas só
  // persiste no chat quando o usuário Mantém. Usa o memo `chips`.
  function rolarContextual(dadosUsar: Dado[], modUsar: number, nomePreset: string | null) {
    if (dadosUsar.length === 0 && modUsar === 0) return;
    const ligado = (t: ChipContexto["tipo"]) =>
      !chipsDesativados.has(t) && chips.some((c) => c.tipo === t);
    const valorChip = (t: ChipContexto["tipo"]) =>
      chips.find((c) => c.tipo === t)?.valor;

    // Piso de dano = metade do dano MÁXIMO da fórmula (arredonda pra cima).
    // Máximo: dado positivo rende `faces`, negativo rende -1 (mínimo do dado).
    const maxDano =
      modUsar + dadosUsar.reduce((s, d) => s + (d.sinal > 0 ? d.faces : -1), 0);
    const danoMinFloor =
      ligado("dano_min") && maxDano > 0 ? Math.ceil(maxDano / 2) : 0;

    // Vantagem/desvantagem do d20 = chip do contexto OU o toggle manual do
    // Rolador (vantagem situacional do narrador). As duas juntas se cancelam —
    // `rolarD20Contextual` rola um só. Mesmo casamento da regra de 5e.
    const vantManual = modoRolagem === "vantagem";
    const desvManual = modoRolagem === "desvantagem";

    const opc: OpcoesContextuais = {
      vantagem: ligado("vantagem") || vantManual,
      desvantagem: ligado("desvantagem") || desvManual,
      floorD20: ligado("floor_d20") ? valorChip("floor_d20") ?? 0 : 0,
      critRange: ligado("crit_range") ? valorChip("crit_range") ?? 20 : 20,
      danoMinFloor,
    };

    // Anota as fontes dos efeitos ligados (exceto reroll, que vira interação).
    // Escapa nomes — vão pra string HTML renderizada no chat.
    const notas = chips
      .filter((c) => !chipsDesativados.has(c.tipo) && c.tipo !== "reroll")
      .map((c) => {
        const base = escaparHtml(c.rotulo);
        return c.fontes.length
          ? `${base} por ${escaparHtml(c.fontes.join(", "))}`
          : base;
      });
    // Vant./desv. vinda só do toggle manual (sem chip) vira anotação própria.
    if (vantManual && !ligado("vantagem")) notas.push("Vantagem");
    if (desvManual && !ligado("desvantagem")) notas.push("Desvantagem");

    // Lote contextual: quantidade > 1 roda N execuções contextuais e persiste
    // como lote. Reroll não se aplica num lote — só no lance único.
    if (quantidadeValida > 1) {
      finalizarLoteContextual(dadosUsar, modUsar, nomePreset, opc, notas, quantidadeValida);
      return;
    }

    const r = montarDadosContextuais(dadosUsar, modUsar, opc);
    const rerolls = ligado("reroll") ? valorChip("reroll") ?? 0 : 0;

    if (rerolls > 0) {
      // Segura no preview "rolado" e espera a decisão; nada vai pro chat ainda.
      const stringFinal = montarStringFinal(r.stringDados, notas);
      setResultado({ tipo: "rolado", total: String(r.total), detalhesHtml: `[${r.total}] = ${stringFinal}` });
      setPendente({
        dadosUsar: [...dadosUsar],
        modUsar,
        nomePreset,
        opc,
        notas,
        stringDados: r.stringDados,
        total: r.total,
        rolls: r.rolls,
        rerollsRestantes: rerolls,
        rerollsUsados: 0,
      });
    } else {
      finalizar(r.total, r.rolls, modUsar, montarStringFinal(r.stringDados, notas), nomePreset);
    }
  }

  // Lote contextual: roda N execuções contextuais (vant/desv/floor/crit por d20)
  // e persiste como lote no chat. Cada execução leva sua string HTML formatada
  // (`texto`) pra preservar dado descartado/crit/piso por linha. As fontes (notas)
  // aparecem no resumo do Rolador; o lote no chat mostra a tag do modo efetivo.
  function finalizarLoteContextual(
    dadosUsar: Dado[],
    modUsar: number,
    nomePreset: string | null,
    opc: OpcoesContextuais,
    notas: string[],
    quantidade: number,
  ) {
    const execucoes = Array.from({ length: quantidade }, () =>
      montarDadosContextuais(dadosUsar, modUsar, opc),
    );
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
          `<div class="roll-batch-row"><span class="roll-batch-index">#${i + 1}</span><span class="roll-batch-total">[${e.total}]</span><span class="roll-batch-formula">= ${e.stringDados}</span></div>`,
      )
      .join("");
    setResultado({
      tipo: "rolado",
      total: `${quantidade}x`,
      detalhesHtml: `[${resumo}] ${formulaTexto(dadosUsar, modUsar)}${notasHtml}<div class="roll-batch-list">${linhas}</div>`,
    });

    const prefixo = nomePreset ? `[${nomePreset}] ` : "";
    const ultimaRolagemTexto = personagemId
      ? `${prefixo}[${resumo}] ${formulaTexto(dadosUsar, modUsar)}`
      : null;

    registrarRolagem(
      sessionId,
      userName,
      {
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
          texto: e.stringDados,
        })),
        nomePreset: nomePreset || null,
      },
      personagemId,
      ultimaRolagemTexto,
    )
      .then((msg) => onMensagemCriada(msg))
      .catch((err) => console.error(err));
  }

  // Rerrola o lance pendente (mesmo contexto), consumindo uma rerrolagem.
  function rerrolar() {
    if (!pendente || pendente.rerollsRestantes <= 0) return;
    const r = montarDadosContextuais(pendente.dadosUsar, pendente.modUsar, pendente.opc);
    const usados = pendente.rerollsUsados + 1;
    const notas = [...pendente.notas, `rerrolado ${usados}×`];
    const stringFinal = montarStringFinal(r.stringDados, notas);
    setResultado({ tipo: "rolado", total: String(r.total), detalhesHtml: `[${r.total}] = ${stringFinal}` });
    setPendente({
      ...pendente,
      stringDados: r.stringDados,
      total: r.total,
      rolls: r.rolls,
      rerollsRestantes: pendente.rerollsRestantes - 1,
      rerollsUsados: usados,
    });
  }

  // Aceita o lance pendente e persiste no chat (anota "rerrolado" se houve).
  function manter() {
    if (!pendente) return;
    const notas = [...pendente.notas];
    if (pendente.rerollsUsados > 0) notas.push(`rerrolado ${pendente.rerollsUsados}×`);
    const stringFinal = montarStringFinal(pendente.stringDados, notas);
    finalizar(pendente.total, pendente.rolls, pendente.modUsar, stringFinal, pendente.nomePreset);
    setPendente(null);
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
    setChipsDesativados(new Set());
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

        <button type="button" className="clear-btn" title="Limpar" onClick={limpar}>
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
          <span>{nomeContexto ?? "Rolagem contextual"}</span>
        </div>
      )}

      {chips.length > 0 && (
        <div className="rolador-chips">
          {chips.map((c) => {
            const on = chipLigado(c.tipo);
            return (
              <button
                key={c.tipo}
                type="button"
                className={`rolador-chip${on ? " on" : ""}`}
                title={
                  c.fontes.length ? `${c.rotulo} — ${c.fontes.join(", ")}` : c.rotulo
                }
                onClick={() => alternarChip(c.tipo)}
              >
                <i className={`fas ${ICONE_CHIP[c.tipo]}`} />
                {c.rotulo}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className={"roll-btn" + (modoGravacao ? " recording" : "")}
        onClick={clicarRolar}
        disabled={vazio}
      >
        {modoGravacao ? "SALVAR PRESET" : loteAtivo ? `ROLAR X${quantidadeValida}` : "ROLAR!"}
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
            <button
              type="button"
              className="rolador-pendente-btn rerrolar"
              onClick={rerrolar}
              disabled={pendente.rerollsRestantes <= 0}
            >
              <i className="fas fa-dice" /> Rerrolar
            </button>
            <button
              type="button"
              className="rolador-pendente-btn manter"
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
                className="preset-add-btn"
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
                className="preset-add-btn"
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
                className="preset-name-btn cancel"
                onClick={() => setPedindoNome(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="preset-name-btn ok"
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
