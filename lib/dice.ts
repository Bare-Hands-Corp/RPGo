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

// Faz o parse de uma expressão livre tipo "2d6 fogo + 1d4 - 1" em dados +
// modificador numérico. Palavras (tipos de dano, nomes de atributo como "CON")
// são ignoradas — o termo descritivo continua no nome do preset pro usuário
// completar à mão no Rolador. Retorna dados vazios + mod 0 se nada casar.
export function parseFormulaDados(expr: string): { dados: Dado[]; modificador: number } {
  const dados: Dado[] = [];
  let modificador = 0;
  if (!expr) return { dados, modificador };

  // 1) Termos de dado: "NdM" (N opcional = 1), com sinal opcional logo antes.
  const reDado = /([+-]?)\s*(\d*)\s*d\s*(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = reDado.exec(expr))) {
    const sinal: 1 | -1 = m[1] === "-" ? -1 : 1;
    const qtd = m[2] === "" ? 1 : parseInt(m[2], 10);
    const faces = parseInt(m[3], 10);
    if (faces > 0) for (let i = 0; i < qtd; i++) dados.push({ faces, sinal });
  }

  // 2) Constantes numéricas restantes (depois de remover os termos de dado).
  const semDados = expr.replace(reDado, " ");
  const reConst = /([+-]?)\s*(\d+)/g;
  while ((m = reConst.exec(semDados))) {
    modificador += (m[1] === "-" ? -1 : 1) * parseInt(m[2], 10);
  }

  return { dados, modificador };
}

// Opções que alteram o d20 primário de uma rolagem contextual (etapa 3.3).
export type OpcoesD20 = {
  vantagem?: boolean;
  desvantagem?: boolean;
  floorD20?: number; // 0 = sem floor; resultado ≤ floor vira floor.
  critRange?: number; // 20 = padrão; crítico a partir desse valor.
};

export type D20Resultado = {
  resultado: number; // valor final, após manter (vantagem) e aplicar floor.
  mantido: number; // valor mantido CRU (após vant/desv, antes do floor).
  rolados: number[]; // 1 ou 2 d20 rolados (antes do floor).
  descartado: number | null; // o d20 descartado quando há vant/desv.
  critico: "sucesso" | "falha" | null;
  comFloor: boolean; // floor mudou o valor cru.
};

// Rola o d20 primário respeitando vantagem/desvantagem, floor e faixa de crit.
// Vantagem e desvantagem juntas se cancelam (rola um só). Crit/falha são
// avaliados sobre o valor mantido CRU (antes do floor) — natural 1 sempre falha.
export function rolarD20Contextual(opcoes: OpcoesD20 = {}): D20Resultado {
  const { vantagem, desvantagem, floorD20 = 0, critRange = 20 } = opcoes;
  const d = () => Math.floor(Math.random() * 20) + 1;

  let rolados: number[];
  let mantido: number;
  let descartado: number | null = null;
  if (vantagem && !desvantagem) {
    rolados = [d(), d()];
    mantido = Math.max(rolados[0], rolados[1]);
    descartado = Math.min(rolados[0], rolados[1]);
  } else if (desvantagem && !vantagem) {
    rolados = [d(), d()];
    mantido = Math.min(rolados[0], rolados[1]);
    descartado = Math.max(rolados[0], rolados[1]);
  } else {
    rolados = [d()];
    mantido = rolados[0];
  }

  const critico: "sucesso" | "falha" | null =
    mantido === 1 ? "falha" : mantido >= critRange ? "sucesso" : null;

  const comFloor = floorD20 > 0 && mantido < floorD20;
  const resultado = comFloor ? floorD20 : mantido;

  return { resultado, mantido, rolados, descartado, critico, comFloor };
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
