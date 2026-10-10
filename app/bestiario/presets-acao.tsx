"use client";

import type { ComponentePayload, EfeitoAcao } from "./types";

function uuid() {
  return crypto.randomUUID();
}

// Presets em linguagem natural — mesmo espírito do picker de efeitos da ficha
// de jogador ("O que essa habilidade faz?"): em vez de montar a mecânica
// campo por campo, escolhe o padrão mais próximo (que já vem com os efeitos
// certos) e ajusta o que sobrar. "Passivo" não tem efeito nenhum de
// propósito — várias ações do Manual dos Inimigos não atacam, não causam
// dano nem afetam mais ninguém além de quem usa.
export type PresetAcao = {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  criar: () => Partial<ComponentePayload>;
};

export const PRESETS_ACAO: PresetAcao[] = [
  {
    id: "ataque-cc",
    nome: "Ataque corpo a corpo",
    descricao: "Jogada de ataque contra a CR do alvo, com dano.",
    icone: "fa-hand-fist",
    criar: () => ({
      alcance: "1,5 metro",
      efeitos: [
        { id: uuid(), tipo: "ataque", bonus: "+0" } satisfies EfeitoAcao,
        { id: uuid(), tipo: "dano", formula: "1d6", tipos: [] } satisfies EfeitoAcao,
      ],
    }),
  },
  {
    id: "ataque-distancia",
    nome: "Ataque à distância",
    descricao: "Jogada de ataque à distância, com dano.",
    icone: "fa-bullseye",
    criar: () => ({
      alcance: "9/18 metros",
      efeitos: [
        { id: uuid(), tipo: "ataque", bonus: "+0" } satisfies EfeitoAcao,
        { id: uuid(), tipo: "dano", formula: "1d6", tipos: [] } satisfies EfeitoAcao,
      ],
    }),
  },
  {
    id: "salvaguarda-dano",
    nome: "Salvaguarda com dano",
    descricao: "O alvo faz uma salvaguarda ou sofre dano.",
    icone: "fa-burst",
    criar: () => ({
      efeitos: [
        { id: uuid(), tipo: "salvaguarda", atributo: "destreza", cd: 10 } satisfies EfeitoAcao,
        { id: uuid(), tipo: "dano", formula: "2d6", tipos: [] } satisfies EfeitoAcao,
      ],
    }),
  },
  {
    id: "salvaguarda-condicao",
    nome: "Impõe condição",
    descricao: "O alvo faz uma salvaguarda ou fica com uma condição (sem dano) — escolha a condição depois, nos efeitos.",
    icone: "fa-triangle-exclamation",
    criar: () => ({ efeitos: [{ id: uuid(), tipo: "salvaguarda", atributo: "destreza", cd: 10 } satisfies EfeitoAcao] }),
  },
  {
    id: "area",
    nome: "Efeito em área",
    descricao: "Afeta uma área (esfera, cone, linha...) em vez de um alvo só.",
    icone: "fa-circle-notch",
    criar: () => ({ efeitos: [{ id: uuid(), tipo: "area", forma: "esfera", tamanho: "6 metros" } satisfies EfeitoAcao] }),
  },
  {
    id: "cura",
    nome: "Recuperar vida",
    descricao: "Recupera Pontos de Vida — de si mesmo ou de um aliado.",
    icone: "fa-heart",
    criar: () => ({ efeitos: [{ id: uuid(), tipo: "cura", formula: "2d8" } satisfies EfeitoAcao] }),
  },
  {
    id: "passivo",
    nome: "Passivo",
    descricao: "Sem rolagem, sem efeito estruturado — só descreve um traço permanente no texto.",
    icone: "fa-star",
    criar: () => ({}),
  },
];

type Props = {
  onEscolher: (preset: PresetAcao) => void;
  onPular: () => void;
};

// Grade de cartões — mesmo padrão visual do PickerPreset da ficha de
// jogador (ícone + nome + descrição). "Pular" deixa em branco pra montar
// tudo na mão, igual antes.
export function PickerAcaoPreset({ onEscolher, onPular }: Props) {
  return (
    <div className="preset-acao-picker">
      <div className="wizard-origem-opcoes">
        {PRESETS_ACAO.map((p) => (
          <button key={p.id} type="button" className="wizard-origem-opcao" onClick={() => onEscolher(p)}>
            <i className={`fas ${p.icone}`} />
            <strong>{p.nome}</strong>
            <span>{p.descricao}</span>
          </button>
        ))}
      </div>
      <button type="button" className="bestiario-voltar-lista" onClick={onPular}>
        <i className="fas fa-pen" /> Começar em branco
      </button>
    </div>
  );
}
