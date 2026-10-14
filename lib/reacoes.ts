// O que uma reação faz quando é usada na janela de reação do combate: sobe a
// CR (o ataque é comparado de novo), dá PV temporário (entra antes do dano) ou
// reduz o dano. Sai dos mesmos efeitos da ficha. Puro (cliente e servidor).

import { parseFormulaDados, rolarDados, type Dado } from "./dice";
import { DURACOES_PV_TEMP, type DuracaoPvTemp } from "./duracao";
import { alvoDaCura, type EfeitoHabilidade } from "./op-rpg";

export type EfeitoDeReacao = {
  // Soma na CR enquanto a ação é resolvida.
  cr: number;
  // CR que passa a valer se for maior que a dele (0 = não tem).
  crFixa: number;
  pvTemp: number;
  duracaoPv: DuracaoPvTemp;
  reducao: number;
};

type Resolver = (formula: string) => { dados: Dado[]; modificador: number };

const ehCr = (alvo: string) => alvo.trim().toLowerCase() === "cr";
const ehPvTemp = (alvo: string) => ["hp-temp", "hptemp"].includes(alvo.trim().toLowerCase());

// Efeitos da reação já rolados. `resolver` troca atributos, nível e grau da
// fórmula por número (na criatura, a fórmula já é só dado e número).
export function efeitosDaReacao(efeitos: EfeitoHabilidade[], resolver: Resolver = parseFormulaDados): EfeitoDeReacao {
  const rolar = (formula: string) => {
    const f = resolver(formula);
    return Math.trunc(f.dados.length > 0 ? rolarDados(f.dados, f.modificador).total : f.modificador);
  };
  const out: EfeitoDeReacao = { cr: 0, crFixa: 0, pvTemp: 0, duracaoPv: "acabar", reducao: 0 };
  const darTemp = (valor: number, duracao?: DuracaoPvTemp) => {
    if (valor <= out.pvTemp) return;
    out.pvTemp = valor;
    out.duracaoPv = duracao ?? "acabar";
  };
  for (const e of efeitos) {
    if (e.tipo === "modificador") {
      const valor = e.formula ? rolar(e.formula) : Math.trunc(e.valor);
      if (ehCr(e.alvo)) out.cr += valor;
      else if (ehPvTemp(e.alvo)) darTemp(valor, e.duracaoPv);
    } else if (e.tipo === "valor_fixo" && ehCr(e.alvo)) {
      out.crFixa = Math.max(out.crFixa, rolar(e.valor));
    } else if (e.tipo === "cura" && alvoDaCura(e) === "hp-temp") {
      darTemp(rolar(e.valor), e.duracaoPv);
    } else if (e.tipo === "reducao_dano") {
      out.reducao += e.formula ? rolar(e.formula) : Math.trunc(e.valor);
    }
  }
  out.cr = Math.max(0, out.cr);
  out.reducao = Math.max(0, out.reducao);
  return out;
}

// CR do alvo com a reação valendo.
export function crComReacao(cr: number, efeito: Pick<EfeitoDeReacao, "cr" | "crFixa">): number {
  return Math.max(cr, efeito.crFixa) + efeito.cr;
}

// "CR +2 · 10 PV temporário (até o fim do combate) · −1d6 de dano": o que a
// reação faz, pro botão da janela. Vazio = nada que o combate aplique sozinho.
export function resumoDaReacao(efeitos: EfeitoHabilidade[]): string {
  const partes: string[] = [];
  const quanto = (e: { valor: number; formula?: string }) => e.formula ?? String(Math.trunc(e.valor));
  const temp = (valor: string, duracao?: DuracaoPvTemp) => {
    const d = DURACOES_PV_TEMP.find((x) => x.slug === (duracao ?? "acabar"))!;
    partes.push(`${valor} PV temporário (${d.texto})`);
  };
  for (const e of efeitos) {
    if (e.tipo === "modificador" && ehCr(e.alvo)) {
      const v = quanto(e);
      partes.push(`CR ${/^[+-]/.test(v) ? v : `+${v}`}`);
    } else if (e.tipo === "modificador" && ehPvTemp(e.alvo)) temp(quanto(e), e.duracaoPv);
    else if (e.tipo === "valor_fixo" && ehCr(e.alvo)) partes.push(`CR ${e.valor}`);
    else if (e.tipo === "cura" && alvoDaCura(e) === "hp-temp") temp(e.valor, e.duracaoPv);
    else if (e.tipo === "reducao_dano") partes.push(`−${quanto(e)} de dano`);
  }
  return partes.join(" · ");
}
