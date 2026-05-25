// Script anti-flash de tema: roda ANTES do primeiro render, sincronamente.
// Lê localStorage.temaId e aplica as variáveis CSS em :root, evitando que
// o usuário veja o tema padrão piscando antes do tema dele carregar.
//
// IMPORTANTE: o conteúdo da função aplicar() é stringificado e injetado via
// dangerouslySetInnerHTML — não pode importar nada nem usar closures externos.
// Os PRESETS aqui são espelho de [lib/themes.ts]. Se mudar um, mude o outro.

const PRESETS = {
  light: {
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
    dark: false,
  },
  dark: {
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
    dark: true,
  },
  ocean: {
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
    dark: false,
  },
  noite: {
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
    dark: true,
  },
  pirata: {
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
    dark: true,
  },
  floresta: {
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
    dark: false,
  },
} as const;

const script = `
(function () {
  var PRESETS = ${JSON.stringify(PRESETS)};
  function aplicar(vars, isDark) {
    var root = document.documentElement;
    for (var k in vars) {
      if (k !== 'dark') root.style.setProperty(k, vars[k]);
    }
    if (isDark) document.body.classList.add('dark-mode');
    else document.body.classList.remove('dark-mode');
  }
  try {
    var temaId = localStorage.getItem('temaId');
    if (temaId && temaId.indexOf('custom-') === 0) {
      var lista = JSON.parse(localStorage.getItem('temasCustomList') || '[]');
      var tema = lista.find(function(t){ return t.id === temaId; });
      if (tema) { aplicar(tema.vars, tema.dark); return; }
    }
    if (temaId && PRESETS[temaId]) {
      var p = PRESETS[temaId];
      aplicar(p, p.dark);
      return;
    }
    if (localStorage.getItem('theme') === 'dark') {
      aplicar(PRESETS.dark, true);
    }
  } catch (_) {}
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
