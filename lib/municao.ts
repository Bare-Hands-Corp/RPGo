// Munição: arma com a propriedade Munição gasta 1 do item ligado a cada ataque
// rolado; munição com dano troca o dado da arma.

export const EVENTO_GASTAR_MUNICAO = "rpgo:gastar-municao";

export type GastoMunicao = { id: string; quantidade: number };

// O Rolador avisa a ficha que o ataque saiu.
export function anunciarGastoMunicao(id: string, quantidade = 1) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<GastoMunicao>(EVENTO_GASTAR_MUNICAO, { detail: { id, quantidade } }),
  );
}

type ItemComMunicao = { propriedades: unknown; municaoId?: string | null };
type ItemMunicao = { id: string; nome: string; tipo: string; quantidade: number; dano: string | null };

export type MunicaoDaArma = {
  // A arma tem a propriedade Munição.
  usa: boolean;
  // Item ligado (null = nenhum escolhido, ou apagado).
  item: ItemMunicao | null;
  // O que sobra, já com o gasto que ainda não voltou do servidor.
  restante: number;
};

export function usaMunicao(arma: { propriedades: unknown }): boolean {
  return Array.isArray(arma.propriedades) && arma.propriedades.includes("municao");
}

export function municaoDaArma(
  arma: ItemComMunicao,
  itens: ItemMunicao[],
  gasto: (id: string) => number = () => 0,
): MunicaoDaArma {
  if (!usaMunicao(arma)) return { usa: false, item: null, restante: 0 };
  const item = itens.find((i) => i.id === arma.municaoId && i.tipo === "municao") ?? null;
  return { usa: true, item, restante: item ? Math.max(0, item.quantidade - gasto(item.id)) : 0 };
}

// Dado do dano: o da munição, se ela tiver; senão, o da arma.
export function danoComMunicao(danoArma: string | null, m: MunicaoDaArma): string | null {
  return m.item?.dano?.trim() ? m.item.dano : danoArma;
}

// Rótulo do chip da arma: "Flecha ×18", "Sem munição".
export function textoMunicao(m: MunicaoDaArma): string {
  if (!m.item) return "Sem munição";
  return m.restante > 0 ? `${m.item.nome} ×${m.restante}` : `Sem ${m.item.nome}`;
}
