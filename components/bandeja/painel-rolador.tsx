"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  type Dado,
  type DadoRolado,
  formulaTexto,
  rolarDados,
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
};

const FACES = [4, 6, 8, 10, 12, 20, 100] as const;

// Estado de exibição: ou um preview derivado de dados+mod, ou o resultado da
// última rolagem (mantido até o usuário mexer em qualquer input).
type Resultado =
  | { tipo: "preview" }
  | { tipo: "rolado"; total: number; detalhesHtml: string };

// Opções que o contexto da rolagem injeta no d20 primário (vant/desv/floor/crit).
// Separadas dos chips (estado da UI) pra `montarDadosContextuais` ser pura e
// poder ser re-executada num reroll sem reler estado.
type OpcoesContextuais = {
  vantagem: boolean;
  desvantagem: boolean;
  floorD20: number;
  critRange: number;
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
  const [modificador, setModificador] = useState(0);
  const [negativo, setNegativo] = useState(false);
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
      setModificador(det.modificador ?? 0);
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

  const vazio = dados.length === 0 && modificador === 0;

  const preview = useMemo(() => {
    if (vazio) {
      return {
        total: "--",
        detalhes: modoGravacao
          ? "Monte a rolagem do preset..."
          : "Selecione dados...",
      };
    }
    return { total: "??", detalhes: formulaTexto(dados, modificador) };
  }, [vazio, dados, modificador, modoGravacao]);

  const display =
    resultado.tipo === "rolado"
      ? { total: String(resultado.total), detalhes: resultado.detalhesHtml }
      : preview;

  function adicionarDado(faces: number) {
    setDados((d) => [...d, { faces, sinal: negativo ? -1 : 1 }]);
    setResultado({ tipo: "preview" });
  }

  function mudarMod(v: number) {
    setModificador(v);
    setResultado({ tipo: "preview" });
  }

  function limpar() {
    setDados([]);
    setModificador(0);
    setNegativo(false);
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
    setResultado({ tipo: "rolado", total, detalhesHtml });

    const textoLimpo = stringFinal.replace(/<[^>]*>?/gm, "");
    const prefixo = nomePreset ? `[${nomePreset}] ` : "";
    const ultimaRolagemTexto = personagemId
      ? `${prefixo}[${total}] = ${textoLimpo}`
      : null;

    registrarRolagem(
      sessionId,
      userName,
      {
        total,
        detalhes: rolls,
        modificador: modUsar,
        nomePreset: nomePreset || null,
        texto: detalhesHtml,
      },
      personagemId,
      ultimaRolagemTexto,
    )
      .then((msg) => onMensagemCriada(msg))
      .catch((err) => console.error(err));
  }

  function executarRolagem(dadosUsar: Dado[], modUsar: number, nomePreset: string | null) {
    if (dadosUsar.length === 0 && modUsar === 0) return;
    const r = rolarDados(dadosUsar, modUsar);

    // Formata detalhes (com crit-success/fail)
    let stringFinal = "";
    r.detalhes.forEach((d, i) => {
      const op =
        i === 0 ? (d.sinal === -1 ? "- " : "") : d.sinal === 1 ? " + " : " - ";
      let res = `${d.resultado}`;
      if (d.resultado === 1) res = `<span class="crit-fail">${d.resultado}</span>`;
      else if (d.resultado === d.faces)
        res = `<span class="crit-success">${d.resultado}</span>`;
      stringFinal += `${op}(${res}) 1d${d.faces}`;
    });
    if (modUsar !== 0) {
      stringFinal += ` ${modUsar >= 0 ? "+" : "-"} ${Math.abs(modUsar)}`;
    }

    finalizar(r.total, r.detalhes, modUsar, stringFinal, nomePreset);
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

    const opc: OpcoesContextuais = {
      vantagem: ligado("vantagem"),
      desvantagem: ligado("desvantagem"),
      floorD20: ligado("floor_d20") ? valorChip("floor_d20") ?? 0 : 0,
      critRange: ligado("crit_range") ? valorChip("crit_range") ?? 20 : 20,
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

    const r = montarDadosContextuais(dadosUsar, modUsar, opc);
    const rerolls = ligado("reroll") ? valorChip("reroll") ?? 0 : 0;

    if (rerolls > 0) {
      // Segura no preview "rolado" e espera a decisão; nada vai pro chat ainda.
      const stringFinal = montarStringFinal(r.stringDados, notas);
      setResultado({ tipo: "rolado", total: r.total, detalhesHtml: `[${r.total}] = ${stringFinal}` });
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

  // Rerrola o lance pendente (mesmo contexto), consumindo uma rerrolagem.
  function rerrolar() {
    if (!pendente || pendente.rerollsRestantes <= 0) return;
    const r = montarDadosContextuais(pendente.dadosUsar, pendente.modUsar, pendente.opc);
    const usados = pendente.rerollsUsados + 1;
    const notas = [...pendente.notas, `rerrolado ${usados}×`];
    const stringFinal = montarStringFinal(r.stringDados, notas);
    setResultado({ tipo: "rolado", total: r.total, detalhesHtml: `[${r.total}] = ${stringFinal}` });
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
    if (contexto) rolarContextual(dados, modificador, nomeContexto);
    else executarRolagem(dados, modificador, nomeContexto);
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
    addPreset(userId, { nome: nv, dados, modificador });
    setPresets(getPresets(userId));
    setPedindoNome(false);
    setNomePresetTmp("");
    setModoGravacao(false);
    setDados([]);
    setModificador(0);
    setResultado({ tipo: "preview" });
    setPresetsAbertos(true);
  }

  function entrarGravacao() {
    setModoGravacao(true);
    setDados([]);
    setModificador(0);
    setNegativo(false);
    setPendente(null);
    setResultado({ tipo: "preview" });
  }

  function cancelarGravacao() {
    setModoGravacao(false);
    setDados([]);
    setModificador(0);
    setResultado({ tipo: "preview" });
  }

  async function executarPreset(p: Preset) {
    if (modoGravacao) cancelarGravacao();
    executarRolagem(p.dados, p.modificador, p.nome);
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

      <div className="tray-footer">
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: "0.7rem", color: "var(--text-sec)" }}>Modificador</label>
          <input
            type="number"
            value={modificador}
            onChange={(e) => mudarMod(Number(e.target.value) || 0)}
            placeholder="+0"
          />
        </div>
        <button type="button" className="clear-btn" title="Limpar" onClick={limpar}>
          <i className="fas fa-trash" />
        </button>
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
        {modoGravacao ? "SALVAR PRESET" : "ROLAR!"}
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
                    <span className="preset-card-formula">{formulaTexto(p.dados, p.modificador)}</span>
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
