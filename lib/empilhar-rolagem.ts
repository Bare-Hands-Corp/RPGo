// Canal pra empilhar uma rolagem na Bandeja (tab Rolador) de qualquer lugar da
// ficha — cards de ação, chips de perícia/salvaguarda, links de habilidade.
// Em vez de rolar direto, todo caminho *empilha*: preenche dados+modificador no
// Rolador, guarda o contexto da rolagem e (por padrão) abre a Bandeja. O usuário
// ajusta e confirma com "ROLAR!". Mesmo padrão dos eventos `rpgo:patch-*`.

import type { Dado } from "@/lib/dice";
import type { ContextoRolagem } from "@/lib/op-rpg";

export const EVENTO_EMPILHAR = "rpgo:empilhar-rolagem";

export type EmpilharRolagemDetail = {
  dados: Dado[];
  modificador?: number;
  // Prefixo no chat (ex: "Atacar CC FOR", "Atletismo"). Vira [nome] na mensagem.
  nomePreset?: string;
  // Marca o tipo de rolagem pra Bandeja casar efeitos contextuais (etapa 3.3).
  contexto?: ContextoRolagem;
  // Abre + expande a Bandeja na tab Rolador. Default: true.
  abrirAuto?: boolean;
};

// Despacha o evento. Só roda no cliente (chamado em handlers de clique).
export function empilharRolagem(detail: EmpilharRolagemDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_EMPILHAR, { detail }));
}

const D20: Dado = { faces: 20, sinal: 1 };

// Atalho pro caso mais comum: teste de d20 + modificador (perícia, salvaguarda,
// teste de atributo, iniciativa). Quem rola dano usa empilharRolagem direto.
export function empilharD20(
  modificador: number,
  nomePreset: string,
  contexto: ContextoRolagem,
) {
  empilharRolagem({ dados: [D20], modificador, nomePreset, contexto });
}
