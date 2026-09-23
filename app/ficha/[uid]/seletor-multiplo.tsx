"use client";

// Pickers visuais pros vínculos entre ficha (ação ↔ arma, ação ↔ habilidade,
// ação/habilidade ↔ item). Substituem `<select>` cru: o jogador reconhece o que
// está escolhendo pelo ícone e pelo estado (equipado/desequipado) sem abrir uma
// lista e ler texto.

export type OpcaoVinculo = {
  id: string;
  nome: string;
  icone: string;
  /** Linha de apoio: "desequipada", "1d8 cortante", origem da habilidade… */
  detalhe?: string;
  /** Marca visual de indisponível (item/arma fora do corpo). */
  inativo?: boolean;
};

/** Grade de escolha múltipla — zero ou N marcados. */
export function SeletorMultiplo({
  opcoes,
  marcados,
  onChange,
  vazio,
}: {
  opcoes: OpcaoVinculo[];
  marcados: string[];
  onChange: (ids: string[]) => void;
  /** Texto quando não há nada pra escolher. */
  vazio: string;
}) {
  if (opcoes.length === 0) {
    return <p className="vinculo-vazio">{vazio}</p>;
  }
  return (
    <div className="vinculo-grade">
      {opcoes.map((o) => {
        const ativo = marcados.includes(o.id);
        return (
          <button
            type="button"
            key={o.id}
            className={`vinculo-card ${ativo ? "ativo" : ""} ${o.inativo ? "inativo" : ""}`}
            aria-pressed={ativo}
            onClick={() =>
              onChange(
                ativo ? marcados.filter((x) => x !== o.id) : [...marcados, o.id],
              )
            }
          >
            <i className={`fas ${o.icone} vinculo-card-icone`} />
            <span className="vinculo-card-texto">
              <strong>{o.nome}</strong>
              {o.detalhe && <span>{o.detalhe}</span>}
            </span>
            <i className={`fas ${ativo ? "fa-circle-check" : "fa-circle"} vinculo-card-marca`} />
          </button>
        );
      })}
    </div>
  );
}

/** Mesma grade, mas escolha única (ou nenhuma) — clicar no marcado desmarca. */
export function SeletorUnico({
  opcoes,
  marcado,
  onChange,
  vazio,
}: {
  opcoes: OpcaoVinculo[];
  marcado: string;
  onChange: (id: string) => void;
  vazio: string;
}) {
  return (
    <SeletorMultiplo
      opcoes={opcoes}
      marcados={marcado ? [marcado] : []}
      onChange={(ids) => onChange(ids.find((x) => x !== marcado) ?? "")}
      vazio={vazio}
    />
  );
}
