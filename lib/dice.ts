// Lógica de rolagem de dados — pura, sem DOM.

export type Dado = { faces: number; sinal: 1 | -1 };
export type ModoRolagem = "normal" | "vantagem" | "desvantagem";

export type DadoRolado = {
  faces: number;
  sinal: 1 | -1;
  resultado: number;
  vantagem?: {
    modo: Exclude<ModoRolagem, "normal">;
    candidatos: [number, number];
    descartado: number;
  };
};

export type ResultadoRolagem = {
  total: number;
  detalhes: DadoRolado[];
  modificador: number;
  modo: ModoRolagem;
};

export type ResultadoLote = {
  modo: ModoRolagem;
  quantidade: number;
  modificador: number;
  execucoes: ResultadoRolagem[];
};

function rolarFace(faces: number): number {
  return Math.floor(Math.random() * faces) + 1;
}

function escolherComModo(
  primeiro: number,
  segundo: number,
  modo: Exclude<ModoRolagem, "normal">,
) {
  if (modo === "vantagem") {
    return primeiro >= segundo
      ? { resultado: primeiro, descartado: segundo }
      : { resultado: segundo, descartado: primeiro };
  }
  return primeiro <= segundo
    ? { resultado: primeiro, descartado: segundo }
    : { resultado: segundo, descartado: primeiro };
}

export function rolarDados(
  dados: Dado[],
  modificador: number,
  modo: ModoRolagem = "normal",
): ResultadoRolagem {
  let total = 0;
  const detalhes: DadoRolado[] = [];
  let vantagemConsumida = false;

  for (const d of dados) {
    if (!vantagemConsumida && modo !== "normal" && d.sinal === 1 && d.faces === 20) {
      const primeiro = rolarFace(d.faces);
      const segundo = rolarFace(d.faces);
      const escolhido = escolherComModo(primeiro, segundo, modo);
      total += escolhido.resultado * d.sinal;
      detalhes.push({
        faces: d.faces,
        sinal: d.sinal,
        resultado: escolhido.resultado,
        vantagem: {
          modo,
          candidatos: [primeiro, segundo],
          descartado: escolhido.descartado,
        },
      });
      vantagemConsumida = true;
      continue;
    }

    const resultado = rolarFace(d.faces);
    total += resultado * d.sinal;
    detalhes.push({ faces: d.faces, sinal: d.sinal, resultado });
  }

  total += modificador;
  return { total, detalhes, modificador, modo };
}

export function rolarLote(
  dados: Dado[],
  modificador: number,
  quantidade: number,
  modo: ModoRolagem = "normal",
): ResultadoLote {
  const execucoes: ResultadoRolagem[] = [];
  const totalExecucoes = Math.max(1, Math.trunc(quantidade || 0));

  for (let indice = 0; indice < totalExecucoes; indice += 1) {
    execucoes.push(rolarDados(dados, modificador, modo));
  }

  return {
    modo,
    quantidade: totalExecucoes,
    modificador,
    execucoes,
  };
}

function destacarNumero(valor: number, faces: number): string {
  if (valor === 1) return `<span class="crit-fail">${valor}</span>`;
  if (valor === faces) return `<span class="crit-success">${valor}</span>`;
  return `${valor}`;
}

function destacarDescartado(valor: number): string {
  return `<span class="dice-discarded">${valor}</span>`;
}

export function formatarDadoRoladoHtml(dado: DadoRolado, incluirSinal = true): string {
  const op = incluirSinal && dado.sinal === -1 ? "- " : "";
  if (dado.vantagem) {
    const usados = destacarNumero(dado.resultado, dado.faces);
    const descartado = destacarDescartado(dado.vantagem.descartado);
    return `${op}(${usados} / ${descartado}) 1d${dado.faces}`;
  }

  return `${op}(${destacarNumero(dado.resultado, dado.faces)}) 1d${dado.faces}`;
}

export function formatarResultadoRolagemHtml(resultado: {
  detalhes: DadoRolado[];
  modificador: number;
}): string {
  let stringFinal = "";
  resultado.detalhes.forEach((d, i) => {
    const op =
      i === 0 ? (d.sinal === -1 ? "- " : "") : d.sinal === 1 ? " + " : " - ";
    stringFinal += `${op}${formatarDadoRoladoHtml(d, false)}`;
  });

  if (resultado.modificador !== 0) {
    stringFinal += ` ${resultado.modificador >= 0 ? "+" : "-"} ${Math.abs(resultado.modificador)}`;
  }

  return stringFinal;
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
