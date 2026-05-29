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
