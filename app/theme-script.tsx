// Script anti-flash de tema: <script> inline no <head>, roda antes do primeiro paint.
// Não trocar por next/script: o beforeInteractive só roda depois do JS do Next.
// Lê localStorage.temaId e aplica as variáveis CSS em :root.
//
// O corpo do script é uma string injetada via dangerouslySetInnerHTML — não pode
// chamar funções importadas. Os DADOS (presets e lista de variáveis) vêm de
// lib/themes.ts e são serializados aqui no servidor, então não há cópia manual.

import { TEMAS_PRESET, VARS_DO_TEMA } from "@/lib/themes";

const PRESETS = Object.fromEntries(
  TEMAS_PRESET.map((t) => [t.id, { vars: t.vars, dark: t.dark }]),
);

const script = `
(function () {
  var PRESETS = ${JSON.stringify(PRESETS)};
  var LIMPAR = ${JSON.stringify(VARS_DO_TEMA)};
  function aplicar(vars, isDark) {
    var root = document.documentElement;
    for (var i = 0; i < LIMPAR.length; i++) root.style.removeProperty(LIMPAR[i]);
    for (var k in vars) {
      if (vars[k]) root.style.setProperty(k, vars[k]);
    }
    if (!vars['--accent'] && vars['--primary']) root.style.setProperty('--accent', vars['--primary']);
    if (isDark) root.classList.add('dark-mode');
    else root.classList.remove('dark-mode');
  }
  try {
    var temaId = localStorage.getItem('temaId');
    if (temaId && temaId.indexOf('custom-') === 0) {
      var lista = JSON.parse(localStorage.getItem('temasCustomList') || '[]');
      var tema = lista.find(function(t){ return t.id === temaId; });
      if (tema) { aplicar(tema.vars, tema.dark); return; }
    }
    if (temaId && PRESETS[temaId]) {
      aplicar(PRESETS[temaId].vars, PRESETS[temaId].dark);
      return;
    }
    if (localStorage.getItem('theme') === 'dark') {
      aplicar(PRESETS.dark.vars, true);
    }
  } catch (_) {}
})();
`;

export function ThemeScript() {
  return <script id="theme-script" dangerouslySetInnerHTML={{ __html: script }} />;
}
