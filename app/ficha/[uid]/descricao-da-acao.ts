import { gerarDescricao, type EntradaGerador } from "@/lib/descricao-gerada";
import type { Duracao } from "@/lib/duracao";
import { ATRIBUTOS, normalizarAlcance, rotuloAlvo, type EfeitoHabilidade } from "@/lib/op-rpg";

const siglaAtributo = (slug: string) => ATRIBUTOS.find((a) => a.slug === slug)?.sigla ?? slug;

// "1d8 cortante" + tipoDano → fórmula e tipo; "2d6+FOR" não é confundido com tipo.
function danoDaAcao(dano: string | null, tipoDano: string | null): EntradaGerador["dano"] {
  const bruto = dano?.trim();
  if (!bruto) return null;
  let formula = bruto;
  let tipo = tipoDano?.trim() || undefined;
  if (tipo) formula = formula.replace(new RegExp(`\\s*${tipo}\\s*$`, "i"), "");
  const m = /^(.*?\d)\s+([A-Za-zÀ-ÿ]+)$/.exec(formula);
  if (m) {
    formula = m[1];
    tipo = tipo ?? m[2][0].toUpperCase() + m[2].slice(1).toLowerCase();
  }
  return { formula, tipo };
}

// O que o formulário (ou a ação salva) sabe e o gerador usa pra escrever a descrição.
export type CamposDaDescricao = {
  tipo: string;
  gatilho?: string | null;
  atributoAtaque?: string | null;
  // Com arma ligada o acerto é o dela: também é ataque.
  comArma?: boolean;
  dano?: string | null;
  tipoDano?: string | null;
  alcance?: string | null;
  atributoSalv?: string | null;
  salvSucesso?: string | null;
};

export function entradaDaAcao(c: CamposDaDescricao, efeitos: EfeitoHabilidade[], duracao: Duracao | null): EntradaGerador {
  return {
    efeitos,
    duracao,
    dano: danoDaAcao(c.dano ?? null, c.tipoDano ?? null),
    ataque: c.atributoAtaque || c.comArma ? { atributo: c.atributoAtaque } : null,
    alcance: c.alcance,
    salvaguarda: c.atributoSalv
      ? { atributo: c.atributoSalv, sucesso: c.salvSucesso === "metade" ? "metade" : "nada" }
      : null,
    // Reação sem gatilho gravado vale pra qualquer ação que pegue o alvo (lib/combate.ts).
    gatilho: c.tipo === "react" ? (c.gatilho ?? "qualquer") : null,
  };
}

export const gerarDaEntrada = (entrada: EntradaGerador) =>
  gerarDescricao(entrada, { rotuloAlvo, siglaAtributo, normalizarAlcance });
