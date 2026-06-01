// Presets de rolagem em localStorage. Chave por usuário.

import type { Dado } from "./dice";
import type { ModoRolagem } from "./dice";

const STORAGE_PREFIX = "rpgo-presets-";

export type Preset = {
  id: string;
  nome: string;
  dados: Dado[];
  modificador: number;
  modoRolagem: ModoRolagem;
  quantidade: number;
};

function normalizarPreset(preset: Partial<Preset> & { id: string; nome: string; dados: Dado[]; modificador: number }): Preset {
  return {
    ...preset,
    modoRolagem: preset.modoRolagem || "normal",
    quantidade: Math.max(1, Math.trunc(preset.quantidade || 1)),
  };
}

function key(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function getPresets(userId: string): Preset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const lista = JSON.parse(localStorage.getItem(key(userId)) || "[]") as Array<Partial<Preset> & { id: string; nome: string; dados: Dado[]; modificador: number }>;
    return lista.map(normalizarPreset);
  } catch {
    return [];
  }
}

export function addPreset(
  userId: string,
  { nome, dados, modificador, modoRolagem, quantidade }: Omit<Preset, "id">,
): Preset {
  const presets = getPresets(userId);
  const novo: Preset = {
    id: crypto.randomUUID(),
    nome,
    dados,
    modificador: modificador || 0,
    modoRolagem: modoRolagem || "normal",
    quantidade: Math.max(1, Math.trunc(quantidade || 1)),
  };
  presets.push(novo);
  localStorage.setItem(key(userId), JSON.stringify(presets));
  return novo;
}

export function removePreset(userId: string, presetId: string) {
  const presets = getPresets(userId).filter((p) => p.id !== presetId);
  localStorage.setItem(key(userId), JSON.stringify(presets));
}
