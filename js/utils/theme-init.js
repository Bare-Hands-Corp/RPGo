(function () {
    const temaId = localStorage.getItem('temaId');
    const PRESETS = {
        dark:     { '--bg-page':'#121212','--bg-card':'#1e1e1e','--bg-surface':'#252525','--text-main':'#e0e0e0','--text-sec':'#a0a0a0','--primary':'#ec7e22','--border':'#444444','--bg-button':'#333333','--text-button':'#e0e0e0', dark: true },
        ocean:    { '--bg-page':'#e0f2fe','--bg-card':'#ffffff','--bg-surface':'#f0f9ff','--text-main':'#03045e','--text-sec':'#4a90a4','--primary':'#0077b6','--border':'#bae6fd','--bg-button':'#e0f2fe','--text-button':'#03045e', dark: false },
        noite:    { '--bg-page':'#0d0d1a','--bg-card':'#16162a','--bg-surface':'#1e1e35','--text-main':'#e8e8ff','--text-sec':'#8888bb','--primary':'#7c3aed','--border':'#333355','--bg-button':'#1e1e35','--text-button':'#e8e8ff', dark: true },
        pirata:   { '--bg-page':'#1a1209','--bg-card':'#231810','--bg-surface':'#2e2015','--text-main':'#e8d5a3','--text-sec':'#a08060','--primary':'#c8973a','--border':'#4a3020','--bg-button':'#2e2015','--text-button':'#e8d5a3', dark: true },
        floresta: { '--bg-page':'#f0f7f4','--bg-card':'#ffffff','--bg-surface':'#e8f5e9','--text-main':'#1b4332','--text-sec':'#52796f','--primary':'#2d6a4f','--border':'#b7e4c7','--bg-button':'#e8f5e9','--text-button':'#1b4332', dark: false },
    };
    function aplicar(vars, isDark) {
        const root = document.documentElement;
        for (const [k, v] of Object.entries(vars)) {
            if (k !== 'dark') root.style.setProperty(k, v);
        }
        if (isDark) document.body.classList.add('dark-mode');
    }
    if (temaId && temaId.startsWith('custom-')) {
        try {
            const lista = JSON.parse(localStorage.getItem('temasCustomList') || '[]');
            const tema  = lista.find(t => t.id === temaId);
            if (tema) { aplicar(tema.vars, tema.dark); return; }
        } catch (_) {}
    }
    if (temaId && PRESETS[temaId]) {
        const p = PRESETS[temaId];
        aplicar(p, p.dark);
        return;
    }
    if (localStorage.getItem('theme') === 'dark') {
        aplicar(PRESETS.dark, true);
    }
})();
