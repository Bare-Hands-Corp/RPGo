// Canal pra empilhar uma rolagem na Bandeja (tab Rolador) de qualquer lugar da
// ficha — cards de ação, chips de perícia/salvaguarda, links de habilidade.
// Em vez de rolar direto, todo caminho *empilha*: preenche dados+modificador no
// Rolador, guarda o contexto da rolagem e (por padrão) abre a Bandeja. O usuário
// ajusta e confirma com "ROLAR!". Mesmo padrão dos eventos `rpgo:patch-*`.

import { rolarDados, type Dado, type ResultadoRolagem } from "@/lib/dice";
import type { ContextoRolagem, EfeitosContexto } from "@/lib/op-rpg";
import type { MensagemSerializada } from "@/lib/mensagens";

export const EVENTO_EMPILHAR = "rpgo:empilhar-rolagem";
export const EVENTO_PUBLICAR = "rpgo:publicar-rolagem";
export const EVENTO_MENSAGEM = "rpgo:mensagem-criada";

// Mensagem que uma action da ficha já gravou (dano, cura): o chat põe na hora,
// porque o realtime ignora as do próprio usuário.
export function anunciarMensagem(msg: MensagemSerializada) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<MensagemSerializada>(EVENTO_MENSAGEM, { detail: msg }));
}

export type PublicarRolagemDetail = {
  resultado: ResultadoRolagem;
  nomePreset: string;
};

// Manda pro chat, pela Bandeja, uma rolagem feita na ficha (cura, Dado de Vida).
export function publicarRolagem(resultado: ResultadoRolagem, nomePreset: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PublicarRolagemDetail>(EVENTO_PUBLICAR, {
      detail: { resultado, nomePreset },
    }),
  );
}

// Rola as curas com fórmula de uma lista de efeitos; publica depois, se a ação
// passar. `extra` soma dados a mais nas curas de PV.
export function rolarCuras(
  curas: { idx: number; valor: string; alvo?: string }[],
  resolver: (valor: string) => { dados: Dado[]; modificador: number },
  nome: string,
  extra?: { dados: Dado[]; modificador: number; texto: string },
): { rolagens: Record<number, number>; publicar: () => void } {
  const rolagens: Record<number, number> = {};
  const feitas: { resultado: ResultadoRolagem; nomePreset: string }[] = [];
  for (const c of curas) {
    const base = resolver(c.valor);
    const soma = extra?.texto && c.alvo === "hp" ? extra : null;
    const f = soma
      ? { dados: [...base.dados, ...soma.dados], modificador: base.modificador + soma.modificador }
      : base;
    if (f.dados.length === 0) {
      rolagens[c.idx] = f.modificador;
      continue;
    }
    const resultado = rolarDados(f.dados, f.modificador);
    rolagens[c.idx] = resultado.total;
    feitas.push({ resultado, nomePreset: `${nome}: ${c.valor}${soma ? ` + ${soma.texto}` : ""}` });
  }
  return {
    rolagens,
    publicar: () => feitas.forEach((f) => publicarRolagem(f.resultado, f.nomePreset)),
  };
}

export type EmpilharRolagemDetail = {
  dados: Dado[];
  modificador?: number;
  // Prefixo no chat (ex: "Atacar CC FOR", "Atletismo"). Vira [nome] na mensagem.
  nomePreset?: string;
  // Marca o tipo de rolagem pra Bandeja casar efeitos contextuais (etapa 3.3).
  contexto?: ContextoRolagem;
  // Efeitos da rolagem (ficha + arma); ausente = só os da ficha.
  efeitos?: EfeitosContexto;
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
  efeitos?: EfeitosContexto,
) {
  empilharRolagem({ dados: [D20], modificador, nomePreset, contexto, efeitos });
}
