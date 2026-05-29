"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  type Dado,
  formulaTexto,
  formatarResultadoRolagemHtml,
  rolarDados,
  rolarLote,
  type ModoRolagem,
} from "@/lib/dice";
import { addPreset, getPresets, removePreset, type Preset } from "@/lib/presets";
import { registrarRolagem } from "./actions";
import type { MensagemSerializada } from "@/lib/mensagens";

type Props = {
  userId: string;
  userName: string;
  sessionId: string;
  personagemId: string | null;
  onMensagemCriada: (msg: MensagemSerializada) => void;
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

export function PainelRolador({
  userId,
  userName,
  sessionId,
  personagemId,
  onMensagemCriada,
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

  useEffect(() => {
    setPresets(getPresets(userId));
  }, [userId]);

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
    setResultado({ tipo: "preview" });
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

  function clicarRolar() {
    if (vazio) return;
    if (modoGravacao) {
      setPedindoNome(true);
      setNomePresetTmp("");
      return;
    }
    executarRolagem(dados, modificador, null, quantidadeValida, modoRolagem);
    // Mantém modificador, limpa só os dados (igual legacy)
    setDados([]);
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
