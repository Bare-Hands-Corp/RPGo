"use client";

// Escolha única numa lista longa: botão que abre uma paleta com busca.

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type OpcaoBusca = { slug: string; nome: string; grupo?: string };

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Trecho casado em destaque.
function destacar(nome: string, busca: string) {
  if (!busca) return nome;
  const i = normalizar(nome).indexOf(normalizar(busca));
  if (i < 0) return nome;
  return (
    <>
      {nome.slice(0, i)}
      <mark className="vinculo-marca-busca">{nome.slice(i, i + busca.length)}</mark>
      {nome.slice(i + busca.length)}
    </>
  );
}

// Começa com o texto vem antes de quem só o contém; o grupo também casa.
function filtrar(opcoes: OpcaoBusca[], busca: string, grupo: string | null): OpcaoBusca[] {
  const q = normalizar(busca.trim());
  const doGrupo = grupo ? opcoes.filter((o) => (o.grupo ?? "") === grupo) : opcoes;
  if (!q) return doGrupo;
  const comeca: OpcaoBusca[] = [];
  const contem: OpcaoBusca[] = [];
  for (const o of doGrupo) {
    const nome = normalizar(o.nome);
    if (nome.startsWith(q) || nome.split(/[\s(/-]+/).some((p) => p.startsWith(q))) comeca.push(o);
    else if (nome.includes(q) || normalizar(o.grupo ?? "").includes(q) || normalizar(o.slug).includes(q)) {
      contem.push(o);
    }
  }
  return [...comeca, ...contem];
}

export function SeletorBusca({
  valor,
  opcoes,
  onChange,
  titulo,
  placeholder = "Escolher",
  livre = false,
  gatilho,
}: {
  valor: string;
  opcoes: OpcaoBusca[];
  onChange: (slug: string) => void;
  // Nome do que se escolhe ("Em qual teste?"), lido no topo da paleta.
  titulo: string;
  placeholder?: string;
  // Aceita o texto digitado como valor.
  livre?: boolean;
  // Botão pequeno no lugar do campo (abre a mesma paleta).
  gatilho?: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const atual = opcoes.find((o) => o.slug === valor);

  function fechar() {
    setAberto(false);
    requestAnimationFrame(() => botaoRef.current?.focus());
  }

  return (
    <>
      {gatilho ? (
        <button
          type="button"
          ref={botaoRef}
          className="busca-gatilho"
          aria-haspopup="dialog"
          aria-expanded={aberto}
          onClick={() => setAberto(true)}
        >
          {gatilho}
        </button>
      ) : (
        <button
          type="button"
          ref={botaoRef}
          className={`busca-botao${valor ? "" : " vazio"}`}
          aria-haspopup="dialog"
          aria-expanded={aberto}
          onClick={() => setAberto(true)}
        >
          <span className="busca-botao-texto">
            <span className="busca-botao-nome">{atual ? atual.nome : valor || placeholder}</span>
            {(atual?.grupo || (valor && !atual)) && (
              <span className="busca-botao-grupo">{atual?.grupo ?? "texto livre"}</span>
            )}
          </span>
          <i className="fas fa-magnifying-glass" />
        </button>
      )}
      {aberto && (
        <Paleta
          valor={valor}
          opcoes={opcoes}
          titulo={titulo}
          livre={livre}
          onEscolher={(slug) => {
            onChange(slug);
            fechar();
          }}
          onFechar={fechar}
        />
      )}
    </>
  );
}

function Paleta({
  valor,
  opcoes,
  titulo,
  livre,
  onEscolher,
  onFechar,
}: {
  valor: string;
  opcoes: OpcaoBusca[];
  titulo: string;
  livre: boolean;
  onEscolher: (slug: string) => void;
  onFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const listaId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const grupos = useMemo(
    () => [...new Set(opcoes.map((o) => o.grupo ?? "").filter(Boolean))],
    [opcoes],
  );
  const filtradas = useMemo(() => filtrar(opcoes, busca, grupo), [opcoes, busca, grupo]);
  const texto = busca.trim();
  const oferecerLivre =
    livre && texto !== "" && !opcoes.some((o) => normalizar(o.nome) === normalizar(texto));
  const total = filtradas.length + (oferecerLivre ? 1 : 0);
  const posicao = Math.min(cursor, Math.max(0, total - 1));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function escolherNoCursor() {
    if (posicao < filtradas.length) onEscolher(filtradas[posicao].slug);
    else if (oferecerLivre) onEscolher(texto);
  }

  function teclado(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onFechar();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (total === 0) return;
      const passo = e.key === "ArrowDown" ? 1 : -1;
      setCursor((posicao + passo + total) % total);
    } else if (e.key === "Enter") {
      e.preventDefault();
      escolherNoCursor();
    }
  }

  // Cabeçalho de grupo só quando a lista mistura grupos, na 1ª opção de cada um.
  const mostraGrupo = grupos.length > 1 && !grupo;
  const titulares = new Set(
    mostraGrupo && !texto
      ? filtradas.filter((o, i) => (o.grupo ?? "") !== (filtradas[i - 1]?.grupo ?? "")).map((o) => o.slug)
      : [],
  );

  return createPortal(
    <div className="paleta-overlay" onPointerDown={onFechar}>
      <div
        className="paleta"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={teclado}
      >
        <div className="paleta-topo">
          <i className="fas fa-magnifying-glass" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={listaId}
            aria-autocomplete="list"
            value={busca}
            placeholder={titulo}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setBusca(e.target.value);
              setCursor(0);
            }}
          />
          <button type="button" className="paleta-fechar" onClick={onFechar} aria-label="Fechar">
            <i className="fas fa-xmark" />
          </button>
        </div>

        {grupos.length > 1 && (
          <div className="paleta-grupos" role="group" aria-label="Filtrar por grupo">
            {[null, ...grupos].map((g) => (
              <button
                type="button"
                key={g ?? "todos"}
                className={`sugestao${grupo === g ? " ativo" : ""}`}
                aria-pressed={grupo === g}
                onClick={() => {
                  setGrupo(g);
                  setCursor(0);
                  inputRef.current?.focus();
                }}
              >
                {g ?? "Tudo"}
              </button>
            ))}
          </div>
        )}

        <ul className="paleta-lista" id={listaId} role="listbox">
          {filtradas.map((o, i) => {
            const titular = titulares.has(o.slug);
            const marcado = o.slug === valor;
            return (
              <li key={o.slug}>
                {titular && o.grupo && <div className="paleta-grupo-titulo">{o.grupo}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={marcado}
                  className={`paleta-opcao${i === posicao ? " cursor" : ""}${marcado ? " ativo" : ""}`}
                  ref={i === posicao ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                  onPointerMove={() => setCursor(i)}
                  onClick={() => onEscolher(o.slug)}
                >
                  <span className="paleta-opcao-nome">{destacar(o.nome, texto)}</span>
                  {o.grupo && (texto || !mostraGrupo) && grupos.length > 1 && (
                    <span className="paleta-opcao-grupo">{o.grupo}</span>
                  )}
                  {marcado && <i className="fas fa-check" />}
                </button>
              </li>
            );
          })}
          {oferecerLivre && (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className={`paleta-opcao livre${posicao === filtradas.length ? " cursor" : ""}`}
                onPointerMove={() => setCursor(filtradas.length)}
                onClick={() => onEscolher(texto)}
              >
                <i className="fas fa-pen" />
                <span className="paleta-opcao-nome">Usar “{texto}”</span>
              </button>
            </li>
          )}
          {total === 0 && <li className="paleta-vazio">Nada casa com “{busca}”.</li>}
        </ul>

        <div className="paleta-rodape">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navegar
          </span>
          <span>
            <kbd>Enter</kbd> escolher
          </span>
          <span>
            <kbd>Esc</kbd> fechar
          </span>
          {valor && (
            <button type="button" className="paleta-limpar" onClick={() => onEscolher("")}>
              Limpar
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
