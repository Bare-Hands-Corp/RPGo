// Helper de ícone do calendário. Aceita classes FontAwesome ("fa-cloud-rain")
// ou emoji legado ("🌧️") — emojis ficam suportados pra não quebrar dados
// antigos no banco, mas a UI agora propõe sempre FA.

import type React from "react";

export function ehClasseFA(icone: string | null | undefined): boolean {
  if (!icone) return false;
  const s = icone.trim();
  return /^(fa-|fas |far |fab )/.test(s);
}

// Renderiza qualquer ícone armazenado — FA, emoji ou texto puro.
// Se o conteúdo bate com uma classe FA, vira <i className="fas fa-..." />.
// Caso contrário, sai como span (preserva emoji existente).
export function IconeCal({
  icone,
  fallback,
  className,
  style,
}: {
  icone: string | null | undefined;
  fallback?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const valor = icone?.trim() || fallback || "";
  if (!valor) return null;
  if (ehClasseFA(valor)) {
    const classes = valor.startsWith("fa-") ? `fas ${valor}` : valor;
    return <i className={`${classes}${className ? ` ${className}` : ""}`} style={style} />;
  }
  return (
    <span className={className} style={style}>
      {valor}
    </span>
  );
}

// Paleta de ícones FA comuns pra picker de tipo de clima. Cada entrada
// é um slug FA (sem prefixo "fas"); o IconeCal cuida do prefixo.
export const ICONES_CLIMA_FA: { slug: string; nome: string }[] = [
  { slug: "fa-sun", nome: "Sol forte" },
  { slug: "fa-cloud-sun", nome: "Parcialmente nublado" },
  { slug: "fa-cloud", nome: "Nublado" },
  { slug: "fa-cloud-rain", nome: "Chuva" },
  { slug: "fa-cloud-showers-heavy", nome: "Chuva intensa" },
  { slug: "fa-cloud-bolt", nome: "Tempestade" },
  { slug: "fa-snowflake", nome: "Neve" },
  { slug: "fa-wind", nome: "Vento" },
  { slug: "fa-smog", nome: "Neblina" },
  { slug: "fa-temperature-high", nome: "Calor" },
  { slug: "fa-temperature-low", nome: "Frio" },
  { slug: "fa-water", nome: "Maré / Mar" },
  { slug: "fa-tornado", nome: "Tornado" },
  { slug: "fa-meteor", nome: "Meteoro / Estranho" },
  { slug: "fa-rainbow", nome: "Arco-íris" },
  { slug: "fa-moon", nome: "Noite" },
];
