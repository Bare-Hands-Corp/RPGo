"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { type Dado, formulaTexto, rolarDados } from "@/lib/dice";
import { addPreset, getPresets, removePreset, type Preset } from "@/lib/presets";
import { registrarRolagem, type MensagemSerializada } from "./actions";

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
  | { tipo: "rolado"; total: number; detalhesHtml: string };

export function PainelRolador({
  userId,
  userName,
  sessionId,
  personagemId,
  onMensagemCriada,
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

  useEffect(() => {
    setPresets(getPresets(userId));
  }, [userId]);

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
    setResultado({ tipo: "preview" });
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

    setResultado({
      tipo: "rolado",
      total: r.total,
      detalhesHtml: `[${r.total}] = ${stringFinal}`,
    });

    // Uma única chamada: registra a mensagem no chat E salva ultimaRolagem no
    // personagem (em paralelo no servidor). Retorna a mensagem pra append local.
    const textoLimpo = stringFinal.replace(/<[^>]*>?/gm, "");
    const prefixo = nomePreset ? `[${nomePreset}] ` : "";
    const ultimaRolagemTexto = personagemId
      ? `${prefixo}[${r.total}] = ${textoLimpo}`
      : null;

    registrarRolagem(
      sessionId,
      userName,
      {
        total: r.total,
        detalhes: r.detalhes,
        modificador: modUsar,
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
    executarRolagem(dados, modificador, null);
    // Mantém modificador, limpa só os dados (igual legacy)
    setDados([]);
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
