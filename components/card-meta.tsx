import { Fragment, type ReactNode } from "react";

// Linha de micro-especificações do card (custo, grau, gatilho, duração, alcance…).
// Só a casca: quem monta o card entrega cada item pronto; valores vazios somem
// e os pontos de separação só aparecem entre itens que existem.
export function CardMeta({ itens }: { itens: ReactNode[] }) {
  const visiveis = itens.filter((i) => i !== null && i !== undefined && i !== false && i !== "");
  if (visiveis.length === 0) return null;
  return (
    <div className="card2-meta">
      {visiveis.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="card2-sep" aria-hidden>
              ·
            </span>
          )}
          {item}
        </Fragment>
      ))}
    </div>
  );
}
