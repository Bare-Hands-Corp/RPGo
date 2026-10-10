// Theme manager — presets + temas customizados em localStorage.
// O script anti-flash (app/theme-script.tsx) importa TEMAS_PRESET e
// VARS_DO_TEMA daqui, então esta é a única fonte da verdade.
//
// Um tema guarda só as cores que ele muda; o resto vem do padrão em :root
// (app/globals.css). Por isso, antes de aplicar um tema, todas as variáveis
// conhecidas são limpas — senão a cor de um tema anterior "vaza" pro próximo.

export type TemaPreset = {
  id: string;
  nome: string;
  icone: string;
  dark: boolean;
  vars: Record<string, string>;
};

export type GrupoCor = "basico" | "sidebar" | "ficha" | "acoes" | "avisos";

export type CampoCor = {
  var: string;
  label: string;
  dica: string;
  grupo: GrupoCor;
};

export const GRUPOS_COR: { id: GrupoCor; titulo: string; dica: string; icone: string }[] = [
  {
    id: "basico",
    titulo: "Cores básicas",
    dica: "Fundo, texto e as duas cores de destaque do site inteiro.",
    icone: "fa-swatchbook",
  },
  {
    id: "sidebar",
    titulo: "Barra lateral da ficha",
    dica: "A coluna com retrato, vida e atributos.",
    icone: "fa-table-columns",
  },
  {
    id: "ficha",
    titulo: "Vida, energia e defesas",
    dica: "Barras e valores de combate.",
    icone: "fa-heart-pulse",
  },
  {
    id: "acoes",
    titulo: "Tipos de ação",
    dica: "A faixa colorida de cada categoria de ação.",
    icone: "fa-hand-fist",
  },
  {
    id: "avisos",
    titulo: "Avisos e estados",
    dica: "Excluir, alertas, sucesso e marcações douradas.",
    icone: "fa-circle-exclamation",
  },
];

export const CAMPOS_COR: CampoCor[] = [
  { var: "--primary", label: "Cor principal", dica: "Botões, links, títulos e seleção", grupo: "basico" },
  { var: "--accent", label: "Cor de destaque", dica: "Abas ativas, marcações e detalhes", grupo: "basico" },
  { var: "--bg-page", label: "Fundo da página", dica: "Atrás de tudo", grupo: "basico" },
  { var: "--bg-card", label: "Fundo dos cards", dica: "Caixas, janelas e painéis", grupo: "basico" },
  { var: "--bg-surface", label: "Fundo de campos", dica: "Inputs, botões e caixinhas", grupo: "basico" },
  { var: "--text-main", label: "Texto principal", dica: "Títulos e textos", grupo: "basico" },
  { var: "--text-sec", label: "Texto secundário", dica: "Descrições e legendas", grupo: "basico" },
  { var: "--border", label: "Bordas", dica: "Contorno de cards e campos", grupo: "basico" },

  { var: "--bg-sidebar", label: "Fundo", dica: "Fundo da coluna lateral", grupo: "sidebar" },
  { var: "--sidebar-text-main", label: "Texto principal", dica: "Nome e valores", grupo: "sidebar" },
  { var: "--sidebar-text-sec", label: "Texto secundário", dica: "Rótulos e legendas", grupo: "sidebar" },

  { var: "--bar-hp", label: "Vida", dica: "Barra de vida (PV)", grupo: "ficha" },
  { var: "--bar-hp-temp", label: "Vida temporária", dica: "PV temporário", grupo: "ficha" },
  { var: "--bar-pp", label: "Energia", dica: "Barra de Pontos de Poder", grupo: "ficha" },
  { var: "--bar-recurso", label: "Recursos", dica: "Recursos sem cor própria", grupo: "ficha" },
  { var: "--color-defesa", label: "Defesas e estatísticas", dica: "Resistências, imunidades, CR, iniciativa", grupo: "ficha" },

  { var: "--color-padrao", label: "Ação padrão", dica: "Ações comuns", grupo: "acoes" },
  { var: "--color-bonus", label: "Ação bônus", dica: "Ações bônus", grupo: "acoes" },
  { var: "--color-power", label: "Ação poderosa", dica: "Ações poderosas", grupo: "acoes" },
  { var: "--color-react", label: "Reação", dica: "Reações", grupo: "acoes" },
  { var: "--color-livre", label: "Ação livre", dica: "Ações livres e eventos narrativos", grupo: "acoes" },

  { var: "--danger", label: "Perigo", dica: "Excluir, erros, dano, atrasado", grupo: "avisos" },
  { var: "--warning", label: "Atenção", dica: "Alertas, limites, prazos próximos", grupo: "avisos" },
  { var: "--success", label: "Sucesso", dica: "Cura, concluído, disponível", grupo: "avisos" },
  { var: "--info", label: "Informação", dica: "Dicas e clima do calendário", grupo: "avisos" },
  { var: "--highlight", label: "Dourado", dica: "Favoritos, berries, bônus extras", grupo: "avisos" },
];

// Variáveis que o tema pode escrever mas que não aparecem no editor: são
// derivadas automaticamente (ou herdadas de temas antigos).
const VARS_DERIVADAS = ["--on-primary", "--bg-button", "--text-button", "--bg-slot", "--border-slot"];

/** Tudo o que `aplicarTema` limpa antes de aplicar um tema novo. */
export const VARS_DO_TEMA: string[] = [...CAMPOS_COR.map((c) => c.var), ...VARS_DERIVADAS];

export const TEMAS_PRESET: TemaPreset[] = [
  {
    id: "light",
    nome: "Claro",
    icone: "☀️",
    dark: false,
    vars: {
      "--primary": "#5a3a22",
      "--accent": "#e67e22",
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
      "--accent": "#e67e22",
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
      "--accent": "#e67e22",
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
      "--accent": "#c084fc",
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
      "--accent": "#e67e22",
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
      "--accent": "#e67e22",
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
  for (const key of VARS_DO_TEMA) root.style.removeProperty(key);
  for (const [key, val] of Object.entries(vars)) {
    if (val) root.style.setProperty(key, val);
  }
  // Tema customizado criado antes do --accent existir: destaque = cor principal.
  if (!vars["--accent"] && vars["--primary"]) root.style.setProperty("--accent", vars["--primary"]);
  root.classList.toggle("dark-mode", isDark);
}

export function buscarTema(temaId: string | null): TemaPreset | undefined {
  if (!temaId) return undefined;
  const lista = temaId.startsWith("custom-") ? getTemasCustom() : TEMAS_PRESET;
  return lista.find((t) => t.id === temaId);
}

// Reaplica o tema salvo, com a mesma regra do script anti-flash.
export function aplicarTemaSalvo() {
  try {
    const tema =
      buscarTema(localStorage.getItem("temaId")) ??
      (localStorage.getItem("theme") === "dark"
        ? TEMAS_PRESET.find((t) => t.id === "dark")
        : undefined);
    if (tema) aplicarTema(tema.vars, tema.dark);
    else aplicarTema({}, false);
  } catch {}
}

export function salvarTemaAtivo(temaId: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem("temaId", temaId);
  const tema = buscarTema(temaId);
  if (tema) localStorage.setItem("theme", tema.dark ? "dark" : "light");
}

export function getTemaAtivoId(): string {
  if (typeof localStorage === "undefined") return "light";
  return localStorage.getItem("temaId") || "light";
}

export function getTemasCustom(): TemaPreset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const lista = JSON.parse(localStorage.getItem("temasCustomList") || "[]");
    return Array.isArray(lista) ? lista : [];
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

/** Lê o valor efetivo (já resolvido) de todas as cores editáveis em :root. */
export function lerCoresEfetivas(): Record<string, string> {
  const estilo = getComputedStyle(document.documentElement);
  const cores: Record<string, string> = {};
  for (const c of CAMPOS_COR) cores[c.var] = rgbToHex(estilo.getPropertyValue(c.var));
  return cores;
}

/** Cor atual de uma variável do tema — pra libs que pedem cor em JS (SweetAlert). */
export function corDoTema(nome: string, reserva = "#888888"): string {
  if (typeof document === "undefined") return reserva;
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return v || reserva;
}

// ─── Contraste (WCAG) ────────────────────────────────────────

function luminancia(hex: string): number {
  const h = rgbToHex(hex).slice(1);
  const canal = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}

export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function ehEscuro(hex: string): boolean {
  return luminancia(hex) < 0.18;
}

/** Texto legível por cima da cor: branco, a não ser que fique ilegível. */
export function textoSobre(hex: string): string {
  return contraste(hex, "#ffffff") >= 3 ? "#ffffff" : "#111111";
}

export function rgbToHex(color: string | null | undefined): string {
  if (!color) return "#000000";
  const c = color.trim();
  if (c.startsWith("#")) {
    return c.length === 4 ? "#" + [...c.slice(1)].map((x) => x + x).join("") : c.slice(0, 7);
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
