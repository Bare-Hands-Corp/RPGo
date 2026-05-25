"use client";

import { useEffect, useState } from "react";
import {
  TEMAS_PRESET,
  type TemaPreset,
  aplicarTema,
  salvarTemaAtivo,
  getTemaAtivoId,
  getTemasCustom,
  adicionarTemaCustom,
  atualizarTemaCustom,
  removerTemaCustom,
  rgbToHex,
} from "@/lib/themes";

type Props = { onFechar: () => void };

const COR_FIELDS: { var: string; label: string; group: "geral" | "sidebar" }[] = [
  { var: "--primary", label: "Destaque", group: "geral" },
  { var: "--bg-page", label: "Fundo da Página", group: "geral" },
  { var: "--bg-card", label: "Fundo dos Cards", group: "geral" },
  { var: "--bg-surface", label: "Fundo de Inputs", group: "geral" },
  { var: "--text-main", label: "Texto Principal", group: "geral" },
  { var: "--text-sec", label: "Texto Secundário", group: "geral" },
  { var: "--border", label: "Bordas", group: "geral" },
  { var: "--bg-sidebar", label: "Fundo", group: "sidebar" },
  { var: "--sidebar-text-main", label: "Texto Principal", group: "sidebar" },
  { var: "--sidebar-text-sec", label: "Texto Secundário", group: "sidebar" },
];

export function ModalTemas({ onFechar }: Props) {
  const [ativoId, setAtivoId] = useState<string>("light");
  const [customs, setCustoms] = useState<TemaPreset[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [cores, setCores] = useState<Record<string, string>>({});

  useEffect(() => {
    setAtivoId(getTemaAtivoId());
    setCustoms(getTemasCustom());
    // Lê cores atuais do :root pra inicializar os pickers.
    const root = getComputedStyle(document.documentElement);
    const init: Record<string, string> = {};
    for (const f of COR_FIELDS) {
      init[f.var] = rgbToHex(root.getPropertyValue(f.var).trim()) || "#000000";
    }
    setCores(init);
  }, []);

  function selecionarTema(t: TemaPreset) {
    aplicarTema(t.vars, t.dark);
    salvarTemaAtivo(t.id);
    setAtivoId(t.id);
  }

  function apagarTema(t: TemaPreset) {
    removerTemaCustom(t.id);
    setCustoms(getTemasCustom());
    if (editingId === t.id) resetarForm();
    setAtivoId(getTemaAtivoId());
  }

  function editarTema(t: TemaPreset) {
    setEditingId(t.id);
    setNome(t.nome);
    const cs: Record<string, string> = {};
    for (const f of COR_FIELDS) {
      cs[f.var] = rgbToHex(t.vars[f.var] || "#000000");
    }
    setCores(cs);
  }

  function resetarForm() {
    setEditingId(null);
    setNome("");
  }

  function salvarCustom() {
    // Vars derivadas mantidas em sync com o resto da UI.
    const vars: Record<string, string> = { ...cores };
    vars["--bg-button"] = vars["--bg-surface"];
    vars["--text-button"] = vars["--text-main"];
    vars["--bg-slot"] = vars["--bg-surface"];
    vars["--border-slot"] = vars["--border"];

    // Heurística de "dark": luminância do fundo da página.
    const hex = vars["--bg-page"] || "#ffffff";
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const isDark = 0.299 * r + 0.587 * g + 0.114 * b < 128;

    const nomeTratado = nome.trim() || "Meu Tema";
    let idAtivo: string;
    if (editingId) {
      atualizarTemaCustom(editingId, nomeTratado, vars, isDark);
      idAtivo = editingId;
    } else {
      idAtivo = adicionarTemaCustom(nomeTratado, vars, isDark);
    }
    aplicarTema(vars, isDark);
    salvarTemaAtivo(idAtivo);
    setAtivoId(idAtivo);
    setCustoms(getTemasCustom());
    resetarForm();
  }

  return (
    <div className="modal-overlay" onClick={onFechar} style={{ alignItems: "flex-start", padding: "20px 0" }}>
      <div
        className="modal-box tema-modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{ margin: "auto" }}
      >
        <h2 style={{ marginBottom: 4 }}>🎨 Temas</h2>
        <p style={{ fontSize: "0.82rem", color: "var(--text-sec)", marginBottom: 18 }}>
          Escolha um tema ou crie o seu próprio.
        </p>

        <div className="tema-chips">
          {TEMAS_PRESET.map((t) => (
            <ChipTema
              key={t.id}
              tema={t}
              ativo={t.id === ativoId}
              isCustom={false}
              onSelecionar={() => selecionarTema(t)}
            />
          ))}
          {customs.length > 0 && (
            <>
              <div className="tema-meus-titulo">Meus Temas</div>
              {customs.map((t) => (
                <ChipTema
                  key={t.id}
                  tema={t}
                  ativo={t.id === ativoId}
                  isCustom
                  onSelecionar={() => selecionarTema(t)}
                  onEditar={() => editarTema(t)}
                  onApagar={() => apagarTema(t)}
                />
              ))}
            </>
          )}
        </div>

        <details className="tema-details" open={!!editingId}>
          <summary>
            <i className="fas fa-pen" />{" "}
            {editingId ? "Editando tema personalizado" : "Criar tema personalizado"}
          </summary>

          <PreviewTema cores={cores} />

          <div className="tema-cores-grid">
            {COR_FIELDS.filter((f) => f.group === "geral").map((f) => (
              <div key={f.var} className={f.var === "--border" ? "cores-full" : undefined}>
                <label>{f.label}</label>
                <input
                  type="color"
                  value={cores[f.var] || "#000000"}
                  onChange={(e) => setCores({ ...cores, [f.var]: e.target.value })}
                />
              </div>
            ))}
            <div className="cores-full" style={{ marginTop: 6 }}>
              <div className="tema-sidebar-section">Sidebar — independente do conteúdo</div>
              <div className="tema-sidebar-grid">
                {COR_FIELDS.filter((f) => f.group === "sidebar").map((f) => (
                  <div key={f.var}>
                    <label>{f.label}</label>
                    <input
                      type="color"
                      value={cores[f.var] || "#000000"}
                      onChange={(e) => setCores({ ...cores, [f.var]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="cores-full">
              <label>Nome do tema</label>
              <input
                type="text"
                className="tema-input-nome"
                placeholder="Ex: Meu Tema Roxo"
                maxLength={24}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
          </div>
          <button type="button" className="tema-salvar-btn" onClick={salvarCustom}>
            <i className="fas fa-save" /> {editingId ? "Atualizar Tema" : "Salvar como Tema"}
          </button>
        </details>

        <div style={{ marginTop: 20, textAlign: "right" }}>
          <button type="button" className="modal-btn-cancel" onClick={onFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function ChipTema({
  tema,
  ativo,
  isCustom,
  onSelecionar,
  onEditar,
  onApagar,
}: {
  tema: TemaPreset;
  ativo: boolean;
  isCustom: boolean;
  onSelecionar: () => void;
  onEditar?: () => void;
  onApagar?: () => void;
}) {
  const primary = tema.vars["--primary"];
  const border = tema.vars["--border"];
  return (
    <div className="tema-chip-wrap">
      <button
        type="button"
        className="tema-chip-btn"
        style={{
          background: tema.vars["--bg-card"],
          color: tema.vars["--text-main"],
          borderColor: ativo ? primary : "transparent",
          boxShadow: ativo
            ? `0 0 0 3px ${primary}55, inset 0 0 0 1px ${border}`
            : `inset 0 0 0 1px ${border}`,
        }}
        onClick={onSelecionar}
      >
        <div className="tema-chip-icone">{tema.icone}</div>
        <div style={{ color: primary, marginBottom: 6, wordBreak: "break-word" }}>{tema.nome}</div>
        <div className="tema-chip-pontos">
          {["--primary", "--bg-page", "--border"].map((v) => (
            <div
              key={v}
              className="tema-chip-ponto"
              style={{
                background: tema.vars[v],
                border: `1px solid ${border}`,
              }}
            />
          ))}
        </div>
      </button>
      {isCustom && (
        <>
          <button
            type="button"
            className="tema-chip-acao"
            style={{ right: 4 }}
            title="Excluir tema"
            onClick={(e) => {
              e.stopPropagation();
              onApagar?.();
            }}
          >
            ×
          </button>
          <button
            type="button"
            className="tema-chip-acao"
            style={{ right: 26 }}
            title="Editar tema"
            onClick={(e) => {
              e.stopPropagation();
              onEditar?.();
            }}
          >
            ✎
          </button>
        </>
      )}
    </div>
  );
}

function PreviewTema({ cores }: { cores: Record<string, string> }) {
  const c = (k: string) => cores[k] || "#888888";
  return (
    <div className="tema-preview" style={{ borderColor: c("--border") }}>
      <div className="tema-preview-sidebar" style={{ background: c("--bg-sidebar") }}>
        <div style={{ fontWeight: 700, fontSize: 10, color: c("--sidebar-text-main") }}>
          Personagem
        </div>
        <div style={{ fontSize: 8, marginBottom: 2, color: c("--sidebar-text-sec") }}>
          Nv. 10 • Pirata
        </div>
        <div
          style={{
            height: 4,
            borderRadius: 3,
            overflow: "hidden",
            marginBottom: 3,
            background: c("--border"),
          }}
        >
          <div style={{ background: "#e74c3c", width: "70%", height: "100%" }} />
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {["FOR", "DES"].map((label) => (
            <div
              key={label}
              className="tema-preview-attr"
              style={{ background: c("--bg-surface"), border: `1px solid ${c("--border")}` }}
            >
              <div style={{ fontSize: 6, letterSpacing: ".5px", color: c("--sidebar-text-sec") }}>
                {label}
              </div>
              <div style={{ fontWeight: 700, fontSize: 12, color: c("--primary") }}>18</div>
            </div>
          ))}
        </div>
      </div>
      <div className="tema-preview-main" style={{ background: c("--bg-page") }}>
        <div style={{ display: "flex", gap: 4 }}>
          <div
            style={{
              fontSize: 8,
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: 10,
              background: c("--bg-card"),
              color: c("--primary"),
            }}
          >
            Ações
          </div>
          <div style={{ fontSize: 8, padding: "2px 6px", color: c("--text-sec") }}>Inventário</div>
        </div>
        <div
          style={{
            borderRadius: 5,
            padding: "5px 7px",
            flex: 1,
            background: c("--bg-card"),
            border: `1px solid ${c("--border")}`,
            borderLeft: `3px solid ${c("--primary")}`,
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 9,
              marginBottom: 2,
              color: c("--text-main"),
            }}
          >
            Técnica Especial
          </div>
          <div style={{ fontSize: 7, lineHeight: 1.4, color: c("--text-sec") }}>
            Descrição da ação do personagem...
          </div>
        </div>
      </div>
    </div>
  );
}
