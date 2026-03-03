/**
 * Presets de Rolagem — CRUD em localStorage.
 *
 * Cada preset:
 *   { id: string, nome: string, dados: [{faces, sinal}], modificador: number }
 *
 * Chave no storage: `rpgo-presets-${userId}`
 */

const STORAGE_PREFIX = 'rpgo-presets-';

function _key(userId) { return `${STORAGE_PREFIX}${userId}`; }

/** Retorna todos os presets do usuário. */
export function getPresets(userId) {
    try {
        return JSON.parse(localStorage.getItem(_key(userId))) || [];
    } catch { return []; }
}

/** Adiciona um novo preset e retorna-o (com id gerado). */
export function addPreset(userId, { nome, dados, modificador }) {
    const presets = getPresets(userId);
    const novo = {
        id: crypto.randomUUID(),
        nome,
        dados,           // [{ faces: 20, sinal: 1 }, …]
        modificador: modificador || 0
    };
    presets.push(novo);
    localStorage.setItem(_key(userId), JSON.stringify(presets));
    return novo;
}

/** Remove um preset pelo id. */
export function removePreset(userId, presetId) {
    const presets = getPresets(userId).filter(p => p.id !== presetId);
    localStorage.setItem(_key(userId), JSON.stringify(presets));
}

/** Atualiza um preset existente (merge parcial). */
export function updatePreset(userId, presetId, changes) {
    const presets = getPresets(userId);
    const idx = presets.findIndex(p => p.id === presetId);
    if (idx === -1) return null;
    Object.assign(presets[idx], changes);
    localStorage.setItem(_key(userId), JSON.stringify(presets));
    return presets[idx];
}
