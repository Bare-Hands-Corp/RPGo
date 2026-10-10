"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { SeletorCor } from "@/components/cor/seletor-cor";
import {
  CAMPOS_COR,
  GRUPOS_COR,
  TEMAS_PRESET,
  type TemaPreset,
  adicionarTemaCustom,
  aplicarTema,
  aplicarTemaSalvo,
  atualizarTemaCustom,
  buscarTema,
  contraste,
  ehEscuro,
  getTemaAtivoId,
  getTemasCustom,
  lerCoresEfetivas,
  removerTemaCustom,
  salvarTemaAtivo,
  textoSobre,
} from "@/lib/themes";

type Props = { onFechar: () => void };

// Variáveis calculadas a partir das cores escolhidas (não aparecem no editor).
function derivadas(cores: Record<string, string>): Record<string, string> {
  return {
    "--on-primary": textoSobre(cores["--primary"]),
    "--bg-button": cores["--bg-surface"],
    "--text-button": cores["--text-main"],
    "--bg-slot": cores["--bg-surface"],
    "--border-slot": cores["--border"],
  };
}

// Tema sendo editado. `base` = cores de onde o editor partiu (pra "desfazer"
// por campo); `vars` = o que vai ser salvo. Só entram em `vars` as cores que o
// tema de origem já tinha ou que a pessoa mexeu — o resto segue o padrão.
type Rascunho = {
  id: string | null;
  nome: string;
  base: Record<string, string>;
  vars: Record<string, string>;
};

export function ModalTemas({ onFechar }: Props) {
  // O modal só monta no cliente (depois de um clique), então dá pra ler o
  // localStorage direto no estado inicial.
  const [ativoId, setAtivoId] = useState<string>(getTemaAtivoId);
  const [customs, setCustoms] = useState<TemaPreset[]>(getTemasCustom);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [efetivas, setEfetivas] = useState<Record<string, string>>({});
  const [importando, setImportando] = useState(false);
  const editando = useRef(false);
  useEffect(() => {
    editando.current = !!rascunho;
  }, [rascunho]);

  useEffect(() => {
    // Saiu da tela no meio da edição: volta pro tema salvo.
    return () => {
      if (editando.current) aplicarTemaSalvo();
    };
  }, []);

  const alterado =
    !!rascunho && JSON.stringify(rascunho.vars) !== JSON.stringify(rascunho.base);

  // ── Lista ────────────────────────────────────────────────

  function selecionarTema(t: TemaPreset) {
    aplicarTema(t.vars, t.dark);
    salvarTemaAtivo(t.id);
    setAtivoId(t.id);
  }

  async function apagarTema(t: TemaPreset) {
    const { isConfirmed } = await Swal.fire({
      title: `Excluir "${t.nome}"?`,
      text: "Essa ação não pode ser desfeita.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "var(--danger)",
      cancelButtonColor: "var(--text-sec)",
      confirmButtonText: "Excluir",
      cancelButtonText: "Cancelar",
    });
    if (!isConfirmed) return;
    removerTemaCustom(t.id);
    setCustoms(getTemasCustom());
    setAtivoId(getTemaAtivoId());
  }

  // ── Editor ───────────────────────────────────────────────

  // Aplica o rascunho no site inteiro (prévia ao vivo) e relê as cores finais.
  function previsualizar(vars: Record<string, string>) {
    aplicarTema(vars, false);
    const cores = lerCoresEfetivas();
    aplicarTema({ ...vars, ...derivadas(cores) }, ehEscuro(cores["--bg-page"]));
    setEfetivas(lerCoresEfetivas());
  }

  function abrirEditor(origem: TemaPreset | undefined, id: string | null, nome: string) {
    const vars = { ...(origem?.vars ?? {}) };
    setRascunho({ id, nome, base: vars, vars });
    setImportando(false);
    previsualizar(vars);
  }

  function criarAPartirDoAtual() {
    const atual = buscarTema(getTemaAtivoId());
    abrirEditor(atual, null, atual ? `${atual.nome.replace(/ \(cópia\)$/, "")} (cópia)`.slice(0, 24) : "Meu Tema");
  }

  function editarTema(t: TemaPreset) {
    abrirEditor(t, t.id, t.nome);
  }

  function mudarCor(v: string, hex: string) {
    if (!rascunho) return;
    const vars = { ...rascunho.vars, [v]: hex };
    setRascunho({ ...rascunho, vars });
    previsualizar(vars);
  }

  function desfazerCor(v: string) {
    if (!rascunho) return;
    const vars = { ...rascunho.vars };
    if (v in rascunho.base) vars[v] = rascunho.base[v];
    else delete vars[v];
    setRascunho({ ...rascunho, vars });
    previsualizar(vars);
  }

  function desfazerTudo() {
    if (!rascunho) return;
    setRascunho({ ...rascunho, vars: rascunho.base });
    previsualizar(rascunho.base);
  }

  function fecharEditor() {
    setRascunho(null);
    aplicarTemaSalvo();
  }

  async function sairDoEditor(depois: () => void) {
    if (alterado) {
      const { isConfirmed } = await Swal.fire({
        title: "Descartar alterações?",
        text: "As cores que você mudou não foram salvas.",
        icon: "question",
        showCancelButton: true,
        confirmButtonColor: "var(--danger)",
        cancelButtonColor: "var(--text-sec)",
        confirmButtonText: "Descartar",
        cancelButtonText: "Continuar editando",
      });
      if (!isConfirmed) return;
    }
    fecharEditor();
    depois();
  }

  function salvar() {
    if (!rascunho) return;
    const cores = lerCoresEfetivas();
    const vars = { ...rascunho.vars, ...derivadas(cores) };
    const escuro = ehEscuro(cores["--bg-page"]);

    const nome = rascunho.nome.trim() || "Meu Tema";
    let id = rascunho.id;
    if (id) atualizarTemaCustom(id, nome, vars, escuro);
    else id = adicionarTemaCustom(nome, vars, escuro);

    aplicarTema(vars, escuro);
    salvarTemaAtivo(id);
    setAtivoId(id);
    setCustoms(getTemasCustom());
    setRascunho(null);
  }

  async function exportar() {
    if (!rascunho) return;
    const codigo = JSON.stringify({ nome: rascunho.nome.trim() || "Meu Tema", vars: rascunho.vars });
    try {
      await navigator.clipboard.writeText(codigo);
      Swal.fire({ toast: true, position: "top", icon: "success", title: "Código do tema copiado!", timer: 1800, showConfirmButton: false });
    } catch {
      Swal.fire({ title: "Copie o código do tema", input: "textarea", inputValue: codigo });
    }
  }

  function importar(texto: string): string | null {
    try {
      const dado = JSON.parse(texto);
      const vars: Record<string, string> = {};
      const conhecidas = new Set(CAMPOS_COR.map((c) => c.var));
      for (const [k, v] of Object.entries(dado?.vars ?? {})) {
        if (conhecidas.has(k) && typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) vars[k] = v;
      }
      if (!Object.keys(vars).length) return "Não achei nenhuma cor nesse código.";
      const nome = typeof dado?.nome === "string" ? dado.nome.slice(0, 24) : "Tema importado";
      setRascunho({ id: null, nome, base: {}, vars });
      setImportando(false);
      previsualizar(vars);
      return null;
    } catch {
      return "Código inválido. Cole exatamente o texto copiado em \"Copiar código\".";
    }
  }

  function tentarFechar() {
    if (rascunho) sairDoEditor(onFechar);
    else onFechar();
  }

  // Esc fecha (pedindo confirmação se houver alteração).
  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape" && !Swal.isVisible()) tentarFechar();
    }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  });

  return (
    <div
      className="modal-overlay tema-overlay"
      onClick={() => {
        // Clique fora com edição pendente não fecha — evita perder tudo sem querer.
        if (!alterado) tentarFechar();
      }}
    >
      <div
        className={`modal-box tema-modal-box ${rascunho ? "editando" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Temas"
      >
        {rascunho ? (
          <Editor
            rascunho={rascunho}
            efetivas={efetivas}
            alterado={alterado}
            onNome={(nome) => setRascunho({ ...rascunho, nome })}
            onCor={mudarCor}
            onDesfazerCor={desfazerCor}
            onDesfazerTudo={desfazerTudo}
            onVoltar={() => sairDoEditor(() => {})}
            onFechar={tentarFechar}
            onSalvar={salvar}
            onExportar={exportar}
          />
        ) : (
          <>
            <div className="tema-modal-header">
              <div>
                <h2>🎨 Temas</h2>
                <p className="tema-subtitulo">Escolha um tema pronto ou crie o seu.</p>
              </div>
              <button type="button" className="modal-close-btn" onClick={onFechar} aria-label="Fechar">
                <i className="fas fa-xmark" />
              </button>
            </div>

            <div className="tema-secao-titulo">Temas prontos</div>
            <div className="tema-chips">
              {TEMAS_PRESET.map((t) => (
                <ChipTema key={t.id} tema={t} ativo={t.id === ativoId} onSelecionar={() => selecionarTema(t)} />
              ))}
            </div>

            <div className="tema-secao-titulo">Meus temas</div>
            {customs.length > 0 ? (
              <div className="tema-chips">
                {customs.map((t) => (
                  <ChipTema
                    key={t.id}
                    tema={t}
                    ativo={t.id === ativoId}
                    onSelecionar={() => selecionarTema(t)}
                    onEditar={() => editarTema(t)}
                    onApagar={() => apagarTema(t)}
                  />
                ))}
              </div>
            ) : (
              <p className="tema-vazio">Você ainda não criou nenhum tema.</p>
            )}

            <div className="tema-lista-acoes">
              <button type="button" className="tema-btn-principal" onClick={criarAPartirDoAtual}>
                <i className="fas fa-plus" /> Criar tema
              </button>
              <button type="button" className="tema-btn-secundario" onClick={() => setImportando((v) => !v)}>
                <i className="fas fa-file-import" /> Importar
              </button>
            </div>
            <p className="tema-dica">
              <i className="fas fa-circle-info" /> O tema novo começa com as cores do tema selecionado.
            </p>

            {importando && <Importar onImportar={importar} />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Editor ─────────────────────────────────────────────────

function Editor({
  rascunho,
  efetivas,
  alterado,
  onNome,
  onCor,
  onDesfazerCor,
  onDesfazerTudo,
  onVoltar,
  onFechar,
  onSalvar,
  onExportar,
}: {
  rascunho: Rascunho;
  efetivas: Record<string, string>;
  alterado: boolean;
  onNome: (nome: string) => void;
  onCor: (v: string, hex: string) => void;
  onDesfazerCor: (v: string) => void;
  onDesfazerTudo: () => void;
  onVoltar: () => void;
  onFechar: () => void;
  onSalvar: () => void;
  onExportar: () => void;
}) {
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(["basico"]));
  const avisos = avisosDeContraste(efetivas);
  // Amostras do popover: as cores do próprio tema, pra reaproveitar fácil.
  const amostras = CAMPOS_COR.filter((c) => c.grupo === "basico").map((c) => efetivas[c.var]);

  function alternar(id: string) {
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <>
      <div className="tema-modal-header">
        <div className="tema-editor-titulo">
          <button type="button" className="modal-close-btn" onClick={onVoltar} aria-label="Voltar para a lista de temas" title="Voltar">
            <i className="fas fa-arrow-left" />
          </button>
          <div>
            <h2>{rascunho.id ? "Editar tema" : "Novo tema"}</h2>
            <p className="tema-subtitulo">O site inteiro já mostra as cores enquanto você edita.</p>
          </div>
        </div>
        <button type="button" className="modal-close-btn" onClick={onFechar} aria-label="Fechar">
          <i className="fas fa-xmark" />
        </button>
      </div>

      <div className="tema-editor">
        <div className="tema-editor-campos">
          <label className="tema-campo-nome">
            <span>Nome do tema</span>
            <input
              type="text"
              className="tema-input-nome"
              placeholder="Ex: Meu Tema Roxo"
              maxLength={24}
              value={rascunho.nome}
              onChange={(e) => onNome(e.target.value)}
            />
          </label>

          {GRUPOS_COR.map((g) => {
            const aberto = abertos.has(g.id);
            const campos = CAMPOS_COR.filter((c) => c.grupo === g.id);
            const avisosGrupo = avisos.filter((a) => a.grupo === g.id);
            return (
              <section key={g.id} className={`tema-grupo ${aberto ? "aberto" : ""}`}>
                <button type="button" className="tema-grupo-cabeca" onClick={() => alternar(g.id)} aria-expanded={aberto}>
                  <i className={`fas ${g.icone} tema-grupo-icone`} />
                  <span className="tema-grupo-textos">
                    <strong>{g.titulo}</strong>
                    <small>{g.dica}</small>
                  </span>
                  <span className="tema-grupo-bolinhas" aria-hidden>
                    {campos.slice(0, 5).map((c) => (
                      <span key={c.var} style={{ background: efetivas[c.var] }} />
                    ))}
                  </span>
                  {avisosGrupo.length > 0 && <i className="fas fa-triangle-exclamation tema-grupo-alerta" title="Tem texto difícil de ler" />}
                  <i className={`fas fa-chevron-${aberto ? "up" : "down"} tema-grupo-seta`} />
                </button>

                {aberto && (
                  <div className="tema-grupo-corpo">
                    {avisosGrupo.map((a) => (
                      <p key={a.texto} className="tema-aviso">
                        <i className="fas fa-triangle-exclamation" /> {a.texto}
                      </p>
                    ))}
                    {campos.map((c) => {
                      const mudou = rascunho.vars[c.var] !== rascunho.base[c.var];
                      return (
                        <div key={c.var} className="tema-campo">
                          <SeletorCor
                            valor={efetivas[c.var] || "#000000"}
                            onChange={(hex) => onCor(c.var, hex)}
                            rotulo={`Escolher: ${c.label}`}
                            amostras={amostras}
                          />
                          <div className="tema-campo-textos">
                            <strong>{c.label}</strong>
                            <small>{c.dica}</small>
                          </div>
                          {mudou && (
                            <button
                              type="button"
                              className="tema-campo-desfazer"
                              onClick={() => onDesfazerCor(c.var)}
                              title="Desfazer esta cor"
                              aria-label={`Desfazer ${c.label}`}
                            >
                              <i className="fas fa-rotate-left" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <div className="tema-editor-previa">
          <div className="tema-secao-titulo">Prévia</div>
          <PreviaTema />
        </div>
      </div>

      <div className="tema-editor-rodape">
        <button type="button" className="tema-btn-secundario" onClick={onExportar} title="Copia um código pra compartilhar este tema">
          <i className="fas fa-copy" /> Copiar código
        </button>
        {alterado && (
          <button type="button" className="tema-btn-secundario" onClick={onDesfazerTudo}>
            <i className="fas fa-rotate-left" /> Desfazer tudo
          </button>
        )}
        <span className="tema-rodape-espaco" />
        <button type="button" className="tema-btn-secundario" onClick={onVoltar}>
          Cancelar
        </button>
        <button type="button" className="tema-btn-principal" onClick={onSalvar}>
          <i className="fas fa-check" /> {rascunho.id ? "Salvar alterações" : "Salvar tema"}
        </button>
      </div>
    </>
  );
}

function avisosDeContraste(c: Record<string, string>) {
  const lista: { grupo: string; texto: string }[] = [];
  if (!c["--text-main"]) return lista;
  const pares: [string, string, number, string, string][] = [
    ["--text-main", "--bg-card", 4.5, "basico", "O texto principal está difícil de ler nos cards."],
    ["--text-main", "--bg-page", 4.5, "basico", "O texto principal está difícil de ler no fundo da página."],
    ["--text-sec", "--bg-card", 2.5, "basico", "O texto secundário está quase sumindo nos cards."],
    ["--text-main", "--bg-surface", 4.5, "basico", "O texto está difícil de ler dentro dos campos."],
    ["--sidebar-text-main", "--bg-sidebar", 4.5, "sidebar", "O texto da barra lateral está difícil de ler."],
    ["--sidebar-text-sec", "--bg-sidebar", 2.5, "sidebar", "O texto secundário da barra lateral está quase sumindo."],
  ];
  for (const [txt, fundo, minimo, grupo, texto] of pares) {
    if (c[txt] && c[fundo] && contraste(c[txt], c[fundo]) < minimo) lista.push({ grupo, texto });
  }
  return lista;
}

// Usa as variáveis CSS direto: como o rascunho está aplicado em :root, a
// prévia é sempre fiel ao que o site vai mostrar.
function PreviaTema() {
  return (
    <div className="tema-previa">
      <div className="tema-previa-sidebar">
        <div className="tp-nome">Personagem</div>
        <div className="tp-sub">Nv. 10 • Pirata</div>

        <div className="tp-rotulo">
          <span>
            <i className="fas fa-heart" /> Vida
          </span>
          <span>60 / 100</span>
        </div>
        <div className="tp-barra">
          <span style={{ width: "60%", background: "var(--bar-hp)" }} />
          <span style={{ width: "15%", background: "var(--bar-hp-temp)" }} />
        </div>

        <div className="tp-rotulo">
          <span>
            <i className="fas fa-bolt" /> Energia
          </span>
          <span>30 / 30</span>
        </div>
        <div className="tp-barra">
          <span style={{ width: "100%", background: "var(--bar-pp)" }} />
        </div>

        <div className="tp-rotulo">
          <span>Recurso</span>
          <span>2 / 3</span>
        </div>
        <div className="tp-barra">
          <span style={{ width: "66%", background: "var(--bar-recurso)" }} />
        </div>

        <div className="tp-stats">
          <div>
            <small>CR</small>
            <b>19</b>
          </div>
          <div>
            <small>INIC.</small>
            <b>+4</b>
          </div>
        </div>
        <div className="tp-defesa">
          <i className="fas fa-shield-halved" /> Resistência
        </div>
      </div>

      <div className="tema-previa-main">
        <div className="tp-abas">
          <span className="ativa">Ações</span>
          <span>Inventário</span>
        </div>

        <div className="tp-acoes">
          {[
            ["--color-padrao", "Ação padrão"],
            ["--color-bonus", "Ação bônus"],
            ["--color-power", "Ação poderosa"],
            ["--color-react", "Reação"],
            ["--color-livre", "Ação livre"],
          ].map(([v, nome]) => (
            <div key={v} className="tp-acao" style={{ borderLeftColor: `var(${v})` }}>
              <b style={{ color: `var(${v})` }}>{nome}</b>
              <small>Descrição da ação...</small>
            </div>
          ))}
        </div>

        <div className="tp-botoes">
          <span className="tp-btn-principal">Salvar</span>
          <span className="tp-btn">Cancelar</span>
        </div>

        <div className="tp-estados">
          <span style={{ color: "var(--danger)" }}>
            <i className="fas fa-trash" /> Perigo
          </span>
          <span style={{ color: "var(--warning)" }}>
            <i className="fas fa-triangle-exclamation" /> Atenção
          </span>
          <span style={{ color: "var(--success)" }}>
            <i className="fas fa-check" /> Sucesso
          </span>
          <span style={{ color: "var(--info)" }}>
            <i className="fas fa-circle-info" /> Info
          </span>
          <span style={{ color: "var(--highlight)" }}>
            <i className="fas fa-star" /> Dourado
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Lista ──────────────────────────────────────────────────

function Importar({ onImportar }: { onImportar: (texto: string) => string | null }) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="tema-importar">
      <label htmlFor="tema-importar-texto">Cole o código do tema:</label>
      <textarea
        id="tema-importar-texto"
        rows={3}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setErro(null);
        }}
        placeholder='{"nome":"...","vars":{...}}'
      />
      {erro && <p className="tema-aviso">{erro}</p>}
      <button type="button" className="tema-btn-principal" disabled={!texto.trim()} onClick={() => setErro(onImportar(texto))}>
        Abrir no editor
      </button>
    </div>
  );
}

function ChipTema({
  tema,
  ativo,
  onSelecionar,
  onEditar,
  onApagar,
}: {
  tema: TemaPreset;
  ativo: boolean;
  onSelecionar: () => void;
  onEditar?: () => void;
  onApagar?: () => void;
}) {
  const v = tema.vars;
  const primary = v["--primary"] ?? "#5a3a22";
  const border = v["--border"] ?? "#e0e0e0";
  return (
    <div className="tema-chip-wrap">
      <button
        type="button"
        className={`tema-chip-btn ${ativo ? "ativo" : ""}`}
        style={{
          background: v["--bg-card"] ?? "#ffffff",
          color: v["--text-main"] ?? "#2c3e50",
          borderColor: ativo ? primary : "transparent",
          boxShadow: ativo ? `0 0 0 3px ${primary}55, inset 0 0 0 1px ${border}` : `inset 0 0 0 1px ${border}`,
        }}
        onClick={onSelecionar}
        aria-pressed={ativo}
      >
        {ativo && (
          <span className="tema-chip-check" style={{ background: primary, color: textoSobre(primary) }}>
            <i className="fas fa-check" />
          </span>
        )}
        <div className="tema-chip-icone">{tema.icone}</div>
        <div className="tema-chip-nome" style={{ color: primary }}>
          {tema.nome}
        </div>
        <div className="tema-chip-pontos">
          {[v["--primary"], v["--accent"] ?? v["--primary"], v["--bg-page"], v["--text-main"]].map((cor, i) => (
            <div key={i} className="tema-chip-ponto" style={{ background: cor, border: `1px solid ${border}` }} />
          ))}
        </div>
      </button>
      {onEditar && (
        <div className="tema-chip-acoes">
          <button type="button" onClick={onEditar} title="Editar tema" aria-label={`Editar ${tema.nome}`}>
            <i className="fas fa-pen" />
          </button>
          <button type="button" className="perigo" onClick={onApagar} title="Excluir tema" aria-label={`Excluir ${tema.nome}`}>
            <i className="fas fa-trash" />
          </button>
        </div>
      )}
    </div>
  );
}
