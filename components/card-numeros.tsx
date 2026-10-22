import { Children, type HTMLAttributes, type ReactNode } from "react";

// Faixa dos números do card (acerto, dano, CD). Só a casca visual: as abas
// passam os chips que já têm (munição, exaustão, extras, fontes da CD…).
export function CardNumeros({ children }: { children: ReactNode }) {
  if (Children.toArray(children).length === 0) return null;
  return <div className="card2-nums">{children}</div>;
}

// Um número da faixa: com `aoRolar` vira botão (empilha no Rolador); sem, é só
// leitura. Repassa o resto das props porque o `Tooltip` injeta handlers no filho.
export function CardNumero({
  aoRolar,
  className = "",
  children,
  ...resto
}: {
  aoRolar?: () => void;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) {
  if (aoRolar) {
    return (
      <button type="button" {...resto} className={`card2-num card2-rolar ${className}`.trim()} onClick={aoRolar}>
        {children}
      </button>
    );
  }
  return (
    <span {...resto} className={`card2-num ${className}`.trim()}>
      {children}
    </span>
  );
}
