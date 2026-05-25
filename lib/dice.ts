// Lógica de rolagem de dados — pura, sem DOM.

export type Dado = { faces: number; sinal: 1 | -1 };
export type DadoRolado = { faces: number; sinal: 1 | -1; resultado: number };

export type ResultadoRolagem = {
  total: number;
  detalhes: DadoRolado[];
  modificador: number;
};

export function rolarDados(dados: Dado[], modificador: number): ResultadoRolagem {
  let total = 0;
  const detalhes: DadoRolado[] = [];
  for (const d of dados) {
    const resultado = Math.floor(Math.random() * d.faces) + 1;
    total += resultado * d.sinal;
    detalhes.push({ faces: d.faces, sinal: d.sinal, resultado });
  }
  total += modificador;
  return { total, detalhes, modificador };
}

export function formulaTexto(dados: Dado[], modificador: number): string {
  let f = "";
  dados.forEach((d, i) => {
    const op =
      i === 0
        ? d.sinal === -1
          ? "- "
          : ""
        : d.sinal === 1
          ? " + "
          : " - ";
    f += `${op}1d${d.faces}`;
  });
  if (modificador && modificador !== 0) {
    f += dados.length > 0
      ? modificador > 0
        ? ` + ${modificador}`
        : ` - ${Math.abs(modificador)}`
      : `${modificador}`;
  }
  return f || "—";
}
