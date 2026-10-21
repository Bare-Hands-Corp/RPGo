"use client";

import { useState } from "react";

// Topo de uma aba: campo de busca, filtros fixos e as pastas da ficha.

export function normalizarBusca(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Cada palavra da busca aparece em algum dos textos.
export function casaBusca(busca: string, textos: (string | null | undefined)[]): boolean {
  const palavras = normalizarBusca(busca).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return true;
  const alvo = normalizarBusca(textos.filter(Boolean).join(" "));
  return palavras.every((p) => alvo.includes(p));
}

export type PastaDaFicha = { nome: string; total: number };

// Pastas que aparecem numa lista, em ordem, com quantos itens cada uma tem.
export function pastasDe(itens: { pasta?: string | null }[]): PastaDaFicha[] {
  const mapa = new Map<string, number>();
  for (const i of itens) {
    if (i.pasta) mapa.set(i.pasta, (mapa.get(i.pasta) ?? 0) + 1);
  }
  return [...mapa]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// Linha de filtros a mais (tipo, origem…): um botão por opção, e clicar no
// ativo de novo tira o filtro.
export type GrupoFiltro = {
  rotulo: string;
  opcoes: readonly (readonly [string, string])[];
  valor: string | null;
  onValor: (v: string | null) => void;
};

export function BarraFiltros<F extends string>({
  busca,
  onBusca,
  rotulo,
  filtros,
  filtro,
  onFiltro,
  pastas,
  pasta,
  onPasta,
  grupos,
  children,
}: {
  busca: string;
  onBusca: (v: string) => void;
  // O que se busca: "habilidade", "ação".
  rotulo: string;
  filtros: readonly (readonly [F, string])[];
  filtro: F;
  onFiltro: (f: F) => void;
  pastas: PastaDaFicha[];
  pasta: string | null;
  onPasta: (p: string | null) => void;
  grupos?: GrupoFiltro[];
  // O que dá pra fazer com a pasta aberta (ativar tudo).
  children?: React.ReactNode;
}) {
  // Os filtros ficam recolhidos atrás do ícone; o número diz quantos estão valendo.
  const [aberto, setAberto] = useState(false);
  const padrao = filtros[0]?.[0];
  const ativos =
    (filtro !== padrao ? 1 : 0) + (pasta ? 1 : 0) + (grupos?.filter((g) => g.valor).length ?? 0);
  function limparFiltros() {
    if (padrao) onFiltro(padrao);
    onPasta(null);
    grupos?.forEach((g) => g.onValor(null));
  }
  return (
    <div className="filtros-barra">
      <div className="filtros-busca">
        <i className="fas fa-magnifying-glass" />
        <input
          type="text"
          value={busca}
          placeholder={`Buscar ${rotulo}`}
          aria-label={`Buscar ${rotulo}`}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && busca) {
              e.preventDefault();
              onBusca("");
            }
          }}
        />
        {busca && (
          <button
            type="button"
            className="filtros-limpar"
            aria-label="Limpar busca"
            onClick={() => onBusca("")}
          >
            <i className="fas fa-xmark" />
          </button>
        )}
        <button
          type="button"
          className={`filtros-toggle ${aberto || ativos > 0 ? "ativo" : ""}`}
          aria-label="Filtros"
          aria-expanded={aberto}
          title="Filtros"
          onClick={() => setAberto((v) => !v)}
        >
          <i className="fas fa-filter" />
          {ativos > 0 && <span className="filtros-toggle-total">{ativos}</span>}
        </button>
      </div>
      {aberto && (
      <div className="filtros-painel">
      <div className="hab-filtros" role="group" aria-label="Filtros">
        {filtros.map(([slug, nome]) => (
          <button
            key={slug}
            type="button"
            className={`hab-filtro ${filtro === slug ? "ativo" : ""}`}
            aria-pressed={filtro === slug}
            onClick={() => onFiltro(slug)}
          >
            {nome}
          </button>
        ))}
        {pastas.length > 0 && <span className="filtros-divisor" aria-hidden />}
        {pastas.map((p) => (
          <button
            key={p.nome}
            type="button"
            className={`hab-filtro filtro-pasta ${pasta === p.nome ? "ativo" : ""}`}
            aria-pressed={pasta === p.nome}
            onClick={() => onPasta(pasta === p.nome ? null : p.nome)}
          >
            <i className={`fas ${pasta === p.nome ? "fa-folder-open" : "fa-folder"}`} /> {p.nome}
            <span className="filtro-pasta-total">{p.total}</span>
          </button>
        ))}
      </div>
      {grupos?.map((g) => (
        <div key={g.rotulo} className="hab-filtros filtros-grupo" role="group" aria-label={g.rotulo}>
          <span className="filtros-grupo-rotulo">{g.rotulo}</span>
          {g.opcoes.map(([slug, nome]) => (
            <button
              key={slug}
              type="button"
              className={`hab-filtro ${g.valor === slug ? "ativo" : ""}`}
              aria-pressed={g.valor === slug}
              onClick={() => g.onValor(g.valor === slug ? null : slug)}
            >
              {nome}
            </button>
          ))}
        </div>
      ))}
      {ativos > 0 && (
        <button type="button" className="filtros-limpar-tudo" onClick={limparFiltros}>
          <i className="fas fa-xmark" /> Limpar filtros
        </button>
      )}
      </div>
      )}
      {pasta && children && (
        <div className="filtros-pasta">
          <span className="filtros-pasta-nome">
            <i className="fas fa-folder-open" /> {pasta}
          </span>
          {children}
        </div>
      )}
    </div>
  );
}
