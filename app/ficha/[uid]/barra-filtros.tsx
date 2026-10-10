"use client";

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
  // O que dá pra fazer com a pasta aberta (ativar tudo).
  children?: React.ReactNode;
}) {
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
      </div>
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
