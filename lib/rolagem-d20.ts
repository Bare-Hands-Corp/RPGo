// O Rolador avisa a ficha de cada d20 com contexto, pros efeitos Gatilho
// (crítico, d20 até N…) mexerem no recurso deles.

import type { ContextoRolagem } from "./op-rpg";

export const EVENTO_ROLAGEM_D20 = "rpgo:rolagem-d20";

export type RolagemD20 = {
  contexto: ContextoRolagem;
  lances: { natural: number | null; critico: boolean }[];
};

export function anunciarRolagemD20(r: RolagemD20) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RolagemD20>(EVENTO_ROLAGEM_D20, { detail: r }));
}
