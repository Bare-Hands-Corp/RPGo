"use client";

// Pickers de vínculo da ficha (ação ↔ arma / habilidade, ação·habilidade ↔ item).
//
// Nasce COLAPSADO: só os escolhidos aparecem, como chips removíveis. A lista
// completa só abre no "adicionar", e abre com busca — uma ficha de verdade tem
// dezenas de habilidades e itens, e uma grade com tudo vira parede.

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type OpcaoVinculo = {
  id: string;
  nome: string;
  icone: string;
  /** Linha de apoio: "desequipada", "1d8 cortante", origem da habilidade… */
  detalhe?: string;
  /** Marca visual de indisponível (item/arma fora do corpo). */
  inativo?: boolean;
};

// Busca tolerante: ignora acento e caixa, casa em qualquer parte do texto.
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Quebra o nome no trecho casado pra destacar o que o usuário digitou.
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

function SeletorBase({
  opcoes,
  marcados,
  onChange,
  vazio,
  rotulo,
  unico,
}: {
  opcoes: OpcaoVinculo[];
  marcados: string[];
  onChange: (ids: string[]) => void;
  vazio: string;
  /** Texto do botão/placeholder: "arma", "habilidade", "item". */
  rotulo: string;
  unico?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [cursor, setCursor] = useState(0);
  const raizRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaId = useId();

  const escolhidos = useMemo(
    () => marcados.map((id) => opcoes.find((o) => o.id === id)).filter((o): o is OpcaoVinculo => !!o),
    [marcados, opcoes],
  );

  const filtradas = useMemo(() => {
    const q = normalizar(busca.trim());
    if (!q) return opcoes;
    return opcoes.filter(
      (o) => normalizar(o.nome).includes(q) || normalizar(o.detalhe ?? "").includes(q),
    );
  }, [opcoes, busca]);

  // Fecha ao clicar fora ou ao sair com Tab.
  useEffect(() => {
    if (!aberto) return;
    function fora(e: PointerEvent) {
      if (!raizRef.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);

  function abrir() {
    setAberto(true);
    setBusca("");
    setCursor(0);
    // Foca no campo depois que ele existe no DOM.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function alternar(id: string) {
    if (unico) {
      onChange(marcados.includes(id) ? [] : [id]);
      setAberto(false);
      return;
    }
    onChange(
      marcados.includes(id) ? marcados.filter((x) => x !== id) : [...marcados, id],
    );
  }

  function teclado(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setAberto(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (filtradas.length === 0) return;
      const passo = e.key === "ArrowDown" ? 1 : -1;
      setCursor((c) => (c + passo + filtradas.length) % filtradas.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const alvo = filtradas[cursor];
      if (alvo) alternar(alvo.id);
    }
  }

  if (opcoes.length === 0) {
    return <p className="vinculo-vazio">{vazio}</p>;
  }

  return (
    <div className="vinculo" ref={raizRef}>
      {escolhidos.length > 0 && (
        <div className="vinculo-escolhidos">
          {escolhidos.map((o) => (
            <span
              key={o.id}
              className={`vinculo-chip ${o.inativo ? "inativo" : ""}`}
              title={o.detalhe}
            >
              <i className={`fas ${o.icone}`} />
              {o.nome}
              <button
                type="button"
                className="vinculo-chip-x"
                onClick={() => alternar(o.id)}
                aria-label={`Remover ${o.nome}`}
              >
                <i className="fas fa-xmark" />
              </button>
            </span>
          ))}
        </div>
      )}

      {!aberto ? (
        <button type="button" className="vinculo-abrir" onClick={abrir}>
          <i className="fas fa-plus" />
          {/* Mesmo verbo em todo estado: os seletores lado a lado ficam iguais. */}
          Escolher {rotulo}
          <span className="vinculo-abrir-qtd">{opcoes.length}</span>
        </button>
      ) : (
        <div className="vinculo-painel">
          <div className="vinculo-busca">
            <i className="fas fa-magnifying-glass" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded
              aria-controls={listaId}
              aria-autocomplete="list"
              value={busca}
              placeholder={`Buscar ${rotulo}…`}
              onChange={(e) => {
                setBusca(e.target.value);
                setCursor(0);
              }}
              onKeyDown={teclado}
            />
            <button
              type="button"
              className="vinculo-fechar"
              onClick={() => setAberto(false)}
              aria-label="Fechar lista"
            >
              <i className="fas fa-xmark" />
            </button>
          </div>

          <ul className="vinculo-lista" id={listaId} role="listbox">
            {filtradas.map((o, i) => {
              const ativo = marcados.includes(o.id);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={ativo}
                    className={`vinculo-opcao ${ativo ? "ativo" : ""} ${
                      i === cursor ? "cursor" : ""
                    } ${o.inativo ? "inativo" : ""}`}
                    onPointerEnter={() => setCursor(i)}
                    onClick={() => alternar(o.id)}
                  >
                    <i className={`fas ${o.icone} vinculo-opcao-icone`} />
                    <span className="vinculo-opcao-texto">
                      <strong>{destacar(o.nome, busca.trim())}</strong>
                      {o.detalhe && <span>{o.detalhe}</span>}
                    </span>
                    <i
                      className={`fas ${ativo ? "fa-circle-check" : "fa-circle"} vinculo-opcao-marca`}
                    />
                  </button>
                </li>
              );
            })}
            {filtradas.length === 0 && (
              <li className="vinculo-sem-resultado">Nada casa com “{busca}”.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Escolha múltipla — zero ou N marcados. */
export function SeletorMultiplo(props: {
  opcoes: OpcaoVinculo[];
  marcados: string[];
  onChange: (ids: string[]) => void;
  vazio: string;
  rotulo: string;
}) {
  return <SeletorBase {...props} />;
}

/** Escolha única (ou nenhuma) — clicar no marcado desmarca. */
export function SeletorUnico({
  marcado,
  onChange,
  ...resto
}: {
  opcoes: OpcaoVinculo[];
  marcado: string;
  onChange: (id: string) => void;
  vazio: string;
  rotulo: string;
}) {
  return (
    <SeletorBase
      {...resto}
      unico
      marcados={marcado ? [marcado] : []}
      onChange={(ids) => onChange(ids[0] ?? "")}
    />
  );
}
