// Theme manager — presets + temas customizados em localStorage.
// Espelho em sync com app/theme-script.tsx (script anti-flash).

export type TemaPreset = {
  id: string;
  nome: string;
  icone: string;
  dark: boolean;
  vars: Record<string, string>;
};

export const TEMAS_PRESET: TemaPreset[] = [
  {
    id: "light",
    nome: "Claro",
    icone: "☀️",
    dark: false,
    vars: {
      "--primary": "#5a3a22",
      "--bg-page": "#f0f2f5",
      "--bg-card": "#ffffff",
      "--bg-surface": "#f8f9fa",
      "--text-main": "#2c3e50",
      "--text-sec": "#7f8c8d",
      "--border": "#e0e0e0",
      "--bg-button": "#eeeeee",
      "--text-button": "#000000",
      "--bg-sidebar": "#ffffff",
      "--sidebar-text-main": "#2c3e50",
      "--sidebar-text-sec": "#7f8c8d",
    },
  },
  {
    id: "dark",
    nome: "Escuro",
    icone: "🌙",
    dark: true,
    vars: {
      "--primary": "#ec7e22",
      "--bg-page": "#121212",
      "--bg-card": "#1e1e1e",
      "--bg-surface": "#252525",
      "--text-main": "#e0e0e0",
      "--text-sec": "#a0a0a0",
      "--border": "#444444",
      "--bg-button": "#333333",
      "--text-button": "#e0e0e0",
      "--bg-sidebar": "#1e1e1e",
      "--sidebar-text-main": "#e0e0e0",
      "--sidebar-text-sec": "#a0a0a0",
    },
  },
  {
    id: "ocean",
    nome: "Oceano",
    icone: "🌊",
    dark: false,
    vars: {
      "--primary": "#0077b6",
      "--bg-page": "#e0f2fe",
      "--bg-card": "#ffffff",
      "--bg-surface": "#f0f9ff",
      "--text-main": "#03045e",
      "--text-sec": "#4a90a4",
      "--border": "#bae6fd",
      "--bg-button": "#e0f2fe",
      "--text-button": "#03045e",
      "--bg-sidebar": "#ffffff",
      "--sidebar-text-main": "#03045e",
      "--sidebar-text-sec": "#4a90a4",
    },
  },
  {
    id: "noite",
    nome: "Noite",
    icone: "🌌",
    dark: true,
    vars: {
      "--primary": "#7c3aed",
      "--bg-page": "#0d0d1a",
      "--bg-card": "#16162a",
      "--bg-surface": "#1e1e35",
      "--text-main": "#e8e8ff",
      "--text-sec": "#8888bb",
      "--border": "#333355",
      "--bg-button": "#1e1e35",
      "--text-button": "#e8e8ff",
      "--bg-sidebar": "#16162a",
      "--sidebar-text-main": "#e8e8ff",
      "--sidebar-text-sec": "#8888bb",
    },
  },
  {
    id: "pirata",
    nome: "Pirata",
    icone: "🏴‍☠️",
    dark: true,
    vars: {
      "--primary": "#c8973a",
      "--bg-page": "#1a1209",
      "--bg-card": "#231810",
      "--bg-surface": "#2e2015",
      "--text-main": "#e8d5a3",
      "--text-sec": "#a08060",
      "--border": "#4a3020",
      "--bg-button": "#2e2015",
      "--text-button": "#e8d5a3",
      "--bg-sidebar": "#231810",
      "--sidebar-text-main": "#e8d5a3",
      "--sidebar-text-sec": "#a08060",
    },
  },
  {
    id: "floresta",
    nome: "Floresta",
    icone: "🌿",
    dark: false,
    vars: {
      "--primary": "#2d6a4f",
      "--bg-page": "#f0f7f4",
      "--bg-card": "#ffffff",
      "--bg-surface": "#e8f5e9",
      "--text-main": "#1b4332",
      "--text-sec": "#52796f",
      "--border": "#b7e4c7",
      "--bg-button": "#e8f5e9",
      "--text-button": "#1b4332",
      "--bg-sidebar": "#ffffff",
      "--sidebar-text-main": "#1b4332",
      "--sidebar-text-sec": "#52796f",
    },
  },
];

export function aplicarTema(vars: Record<string, string>, isDark: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(key, val);
  }
  if (isDark) {
    document.body.classList.add("dark-mode");
  } else {
    document.body.classList.remove("dark-mode");
  }
}

export function salvarTemaAtivo(temaId: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem("temaId", temaId);
  const tema = TEMAS_PRESET.find((t) => t.id === temaId);
  if (tema) localStorage.setItem("theme", tema.dark ? "dark" : "light");
}

export function getTemaAtivoId(): string {
  if (typeof localStorage === "undefined") return "light";
  return localStorage.getItem("temaId") || "light";
}

export function getTemasCustom(): TemaPreset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("temasCustomList") || "[]");
  } catch {
    return [];
  }
}

export function adicionarTemaCustom(
  nome: string,
  vars: Record<string, string>,
  dark: boolean,
): string {
  const lista = getTemasCustom();
  const id = `custom-${Date.now()}`;
  lista.push({ id, nome: nome || "Meu Tema", icone: "✨", vars, dark });
  localStorage.setItem("temasCustomList", JSON.stringify(lista));
  return id;
}

export function atualizarTemaCustom(
  id: string,
  nome: string,
  vars: Record<string, string>,
  dark: boolean,
) {
  const lista = getTemasCustom().map((t) =>
    t.id === id ? { ...t, nome, vars, dark } : t,
  );
  localStorage.setItem("temasCustomList", JSON.stringify(lista));
}

export function removerTemaCustom(id: string) {
  const lista = getTemasCustom().filter((t) => t.id !== id);
  localStorage.setItem("temasCustomList", JSON.stringify(lista));
  if (localStorage.getItem("temaId") === id) {
    const luz = TEMAS_PRESET.find((t) => t.id === "light");
    if (luz) {
      aplicarTema(luz.vars, luz.dark);
      salvarTemaAtivo("light");
    }
  }
}

export function rgbToHex(color: string | null | undefined): string {
  if (!color) return "#000000";
  const c = color.trim();
  if (c.startsWith("#")) {
    return c.length === 4 ? "#" + [...c.slice(1)].map((x) => x + x).join("") : c;
  }
  const m = c.match(/\d+/g);
  if (!m) return "#000000";
  return (
    "#" +
    m
      .slice(0, 3)
      .map((n) => parseInt(n).toString(16).padStart(2, "0"))
      .join("")
  );
}
