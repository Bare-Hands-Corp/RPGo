import type { CSSProperties } from "react";
import { HEXAGONO, LETRAS_LOGOTIPO } from "./caminhos";

/**
 * Marca Handrolls.
 *
 * - `icone`: sushi colorido detalhado (logo principal).
 * - `simples`: sushi colorido sem o arroz, para tamanhos bem pequenos.
 * - `completo`: logotipo HANDROLLS com o sushi no lugar do "O". As letras
 *   usam `currentColor`, então seguem a cor do texto (claro/escuro).
 * - `mono`: anel + hexágono vazados em `currentColor`, para usar em qualquer
 *   cor e sobre qualquer fundo.
 */
export type VarianteLogo = "icone" | "simples" | "completo" | "mono";

type Props = {
  variante?: VarianteLogo;
  /** Altura (px ou qualquer unidade CSS). A largura segue a proporção. */
  tamanho?: number | string;
  /** Nome acessível. Passe `""` quando o logo for só decorativo. */
  titulo?: string;
  className?: string;
  style?: CSSProperties;
};

const VB_ICONE = "99.915 99.99 800 800";
const VB_LOGO = "0 0 1863.837 272.387";
const PROPORCAO_LOGO = 1863.837 / 272.387;

// Sushi dentro do logotipo: círculo r=136.194 centrado em (1234.975, 136.194).
const SUSHI_NO_LOGO = { x: 1098.781, y: 0, lado: 272.388 };

// Anel vazado (r 400 → 300) em volta do centro da prancheta.
const CX = 499.915;
const CY = 499.99;
const anel = (r: number) =>
  `M${CX - r} ${CY}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const ANEL_MONO = anel(400) + anel(300);

export function Logo({
  variante = "icone",
  tamanho = 32,
  titulo = "Handrolls",
  className,
  style,
}: Props) {
  const altura = typeof tamanho === "number" ? `${tamanho}px` : tamanho;
  const a11y = titulo
    ? { role: "img" as const, "aria-label": titulo }
    : { "aria-hidden": true as const };

  if (variante === "icone" || variante === "simples") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={variante === "icone" ? "/marca/icone.svg" : "/marca/icone-simples.svg"}
        alt={titulo}
        className={className}
        draggable={false}
        style={{ height: altura, width: altura, flexShrink: 0, ...style }}
      />
    );
  }

  if (variante === "mono") {
    return (
      <svg
        viewBox={VB_ICONE}
        className={className}
        style={{ height: altura, width: altura, flexShrink: 0, ...style }}
        {...a11y}
      >
        <path d={ANEL_MONO} fillRule="evenodd" fill="currentColor" />
        <path d={HEXAGONO} fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      viewBox={VB_LOGO}
      className={className}
      style={{
        height: altura,
        width: "auto",
        aspectRatio: PROPORCAO_LOGO,
        flexShrink: 0,
        ...style,
      }}
      {...a11y}
    >
      {LETRAS_LOGOTIPO.map((d, i) => (
        <path key={i} d={d} fill="currentColor" />
      ))}
      <image
        href="/marca/icone.svg"
        x={SUSHI_NO_LOGO.x}
        y={SUSHI_NO_LOGO.y}
        width={SUSHI_NO_LOGO.lado}
        height={SUSHI_NO_LOGO.lado}
      />
    </svg>
  );
}
