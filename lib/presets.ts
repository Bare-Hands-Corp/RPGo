// Presets de rolagem em localStorage. Chave por usuário.

import type { Dado } from "./dice";

const STORAGE_PREFIX = "rpgo-presets-";

export type Preset = {
  id: string;
  nome: string;
  dados: Dado[];
  modificador: number;
};

function key(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function getPresets(userId: string): Preset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key(userId)) || "[]");
  } catch {
    return [];
  }
}

export function addPreset(
  userId: string,
  { nome, dados, modificador }: Omit<Preset, "id">,
): Preset {
  const presets = getPresets(userId);
  const novo: Preset = {
    id: crypto.randomUUID(),
    nome,
    dados,
    modificador: modificador || 0,
  };
  presets.push(novo);
  localStorage.setItem(key(userId), JSON.stringify(presets));
  return novo;
}

export function removePreset(userId: string, presetId: string) {
  const presets = getPresets(userId).filter((p) => p.id !== presetId);
  localStorage.setItem(key(userId), JSON.stringify(presets));
}
