/**
 * Lógica do Rolador de Dados — componente interno da Bandeja Unificada.
 * Inclui sistema de Presets (gravação, execução e gerenciamento).
 *
 * @param {Object} user      - Objeto do usuário autenticado ({ id })
 * @param {Object} callbacks - { onRolar(dadosRolagem) } — chamado após cada rolagem
 * @returns {{ executarPreset(preset): void }}
 */
import { apiPatch } from '../../utils/api.js';
import { getPresets, addPreset, removePreset } from './presets-logic.js';

export function iniciarRolador(user, callbacks = {}) {
    const { onRolar } = callbacks;

    let dadosSelecionados = [];
    let modoNegativo      = false;
    let modoGravacao       = false;

    // Elementos do rolador
    const diceContainer = document.getElementById('diceContainer');
    const btnToggleSign = document.getElementById('btnToggleSign');
    const txtTotal      = document.getElementById('txtTotal');
    const txtDetalhes   = document.getElementById('txtDetalhes');
    const inputMod      = document.getElementById('inputModificador');
    const btnLimpar     = document.getElementById('btnLimparTray');
    const btnRolar      = document.getElementById('btnRolarTray');

    // Elementos de presets
    const recBanner       = document.getElementById('presetRecBanner');
    const btnCancelRec    = document.getElementById('btnCancelRec');
    const presetsEmpty    = document.getElementById('presetsEmpty');
    const presetsGrid     = document.getElementById('presetsGrid');
    const btnCriarPreset  = document.getElementById('btnCriarPreset');
    const btnCriarEmpty   = document.getElementById('btnCriarPresetEmpty');

    // Toggle de presets
    const btnTogglePresets = document.getElementById('btnTogglePresets');
    const presetToggleIcon = document.getElementById('presetToggleIcon');
    const presetsWrapper   = document.getElementById('presetsWrapper');

    // Modal de nome do preset
    const modalPresetNome     = document.getElementById('modalPresetNome');
    const inputPresetNome     = document.getElementById('inputPresetNome');
    const btnPresetNomeCancel = document.getElementById('btnPresetNomeCancel');
    const btnPresetNomeOk     = document.getElementById('btnPresetNomeOk');
    let _resolveNomeModal = null; // callback da Promise

    // =========================================================
    // TOGGLE PRESETS (mostrar/esconder)
    // =========================================================
    btnTogglePresets.addEventListener('click', () => {
        const abrindo = presetsWrapper.classList.contains('collapsed');
        presetsWrapper.classList.toggle('collapsed', !abrindo);
        btnTogglePresets.classList.toggle('open', abrindo);
    });

    // =========================================================
    // MODAL DE NOME DO PRESET  (substitui prompt nativo)
    // =========================================================
    function pedirNomePreset() {
        return new Promise((resolve) => {
            _resolveNomeModal = resolve;
            inputPresetNome.value = '';
            modalPresetNome.style.display = 'flex';
            setTimeout(() => inputPresetNome.focus(), 50);
        });
    }
    function _fecharModalNome(valor) {
        modalPresetNome.style.display = 'none';
        if (_resolveNomeModal) { _resolveNomeModal(valor); _resolveNomeModal = null; }
    }
    btnPresetNomeOk.addEventListener('click', () => {
        const v = inputPresetNome.value.trim();
        if (v) _fecharModalNome(v);
    });
    btnPresetNomeCancel.addEventListener('click', () => _fecharModalNome(null));
    inputPresetNome.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); btnPresetNomeOk.click(); }
        if (e.key === 'Escape') { e.preventDefault(); _fecharModalNome(null); }
    });

    // =========================================================
    // PREVIEW DA FÓRMULA
    // =========================================================
    function atualizarPreview() {
        if (dadosSelecionados.length === 0 && Number(inputMod.value) === 0) {
            txtDetalhes.innerText = 'Selecione dados...';
            txtTotal.innerText    = '--';
            return;
        }
        let formula = '';
        dadosSelecionados.forEach((d, i) => {
            const op = i === 0
                ? (d.sinal === -1 ? '- ' : '')
                : (d.sinal === 1 ? ' + ' : ' - ');
            formula += `${op}1d${d.faces}`;
        });
        const mod = Number(inputMod.value);
        if (mod !== 0) {
            formula += dadosSelecionados.length > 0
                ? (mod > 0 ? ` + ${mod}` : ` - ${Math.abs(mod)}`)
                : `${mod}`;
        }
        txtDetalhes.innerText = formula;
        txtTotal.innerText    = '??';
    }

    // =========================================================
    // GERAR STRING DE FÓRMULA (para exibir nos cards de preset)
    // =========================================================
    function formulaTexto(dados, mod) {
        let f = '';
        dados.forEach((d, i) => {
            const op = i === 0
                ? (d.sinal === -1 ? '- ' : '')
                : (d.sinal === 1 ? ' + ' : ' - ');
            f += `${op}1d${d.faces}`;
        });
        if (mod && mod !== 0) {
            f += dados.length > 0
                ? (mod > 0 ? ` + ${mod}` : ` - ${Math.abs(mod)}`)
                : `${mod}`;
        }
        return f || '—';
    }

    // =========================================================
    // ALTERNAR SINAL
    // =========================================================
    btnToggleSign.addEventListener('click', () => {
        modoNegativo = !modoNegativo;
        diceContainer.classList.toggle('negative-mode', modoNegativo);
        btnToggleSign.innerText = modoNegativo ? '-' : '+';
    });

    // =========================================================
    // SELEÇÃO DE DADOS
    // =========================================================
    document.querySelectorAll('.dice-btn[data-faces]').forEach(btn => {
        btn.addEventListener('click', () => {
            dadosSelecionados.push({ faces: Number(btn.dataset.faces), sinal: modoNegativo ? -1 : 1 });
            atualizarPreview();
        });
    });

    inputMod.addEventListener('input', atualizarPreview);

    // =========================================================
    // LIMPAR BANDEJA
    // =========================================================
    btnLimpar.addEventListener('click', () => {
        dadosSelecionados     = [];
        inputMod.value        = 0;
        txtTotal.innerText    = '--';
        txtDetalhes.innerText = 'Bandeja limpa';
        modoNegativo          = false;
        diceContainer.classList.remove('negative-mode');
        btnToggleSign.innerText = '+';
    });

    // =========================================================
    // ROLAR / SALVAR PRESET  (botão muda conforme modo)
    // =========================================================
    btnRolar.addEventListener('click', () => {
        if (modoGravacao) {
            salvarPreset();
            return;
        }
        rolarDados();
    });

    // =========================================================
    // ROLAR DADOS (lógica extraída)
    // =========================================================
    function rolarDados(overrideDados, overrideMod, nomePreset) {
        const dados = overrideDados || dadosSelecionados;
        const mod   = overrideMod   != null ? overrideMod : Number(inputMod.value);

        if (dados.length === 0 && mod === 0) return;

        let total = 0;
        const resultadosHtml   = [];
        const detalhesFirebase = [];

        dados.forEach(d => {
            const resultado = Math.floor(Math.random() * d.faces) + 1;
            total += resultado * d.sinal;

            let resFormatado = `${resultado}`;
            if (resultado === 1)            resFormatado = `<span class="crit-fail">${resultado}</span>`;
            else if (resultado === d.faces)  resFormatado = `<span class="crit-success">${resultado}</span>`;

            resultadosHtml.push({ texto: `(${resFormatado}) 1d${d.faces}`, sinal: d.sinal });
            detalhesFirebase.push({ faces: d.faces, sinal: d.sinal, resultado });
        });

        total += mod;

        let stringFinal = '';
        resultadosHtml.forEach((parte, i) => {
            const op = i === 0
                ? (parte.sinal === -1 ? '- ' : '')
                : (parte.sinal === 1 ? ' + ' : ' - ');
            stringFinal += `${op}${parte.texto}`;
        });
        if (mod !== 0) stringFinal += ` ${mod >= 0 ? '+' : '-'} ${Math.abs(mod)}`;

        // Exibe resultado local
        txtTotal.innerText    = total;
        txtDetalhes.innerHTML = `[${total}] = ${stringFinal}`;

        // Salva última rolagem no perfil do usuário
        const textoLimpo = stringFinal.replace(/<[^>]*>?/gm, '');
        const prefixo = nomePreset ? `[${nomePreset}] ` : '';
        apiPatch(`/users/${user.id}`, {
            ultimaRolagem: `${prefixo}[${total}] = ${textoLimpo}`
        });

        // Notifica orquestrador para enviar ao chat
        if (typeof onRolar === 'function') {
            onRolar({ total, detalhes: detalhesFirebase, modificador: mod, nomePreset: nomePreset || null });
        }

        // Limpa seleção apenas se foi rolagem manual (não preset)
        if (!overrideDados) dadosSelecionados = [];
    }

    // =========================================================
    // MODO GRAVAÇÃO DE PRESET
    // =========================================================
    function entrarModoGravacao() {
        modoGravacao = true;
        // Limpa bandeja para começar do zero
        dadosSelecionados     = [];
        inputMod.value        = 0;
        modoNegativo          = false;
        diceContainer.classList.remove('negative-mode');
        btnToggleSign.innerText = '+';
        txtTotal.innerText    = '--';
        txtDetalhes.innerText = 'Monte a rolagem do preset...';

        recBanner.style.display = 'flex';
        btnRolar.textContent    = 'SALVAR PRESET';
        btnRolar.classList.add('recording');
    }

    function sairModoGravacao() {
        modoGravacao = false;
        recBanner.style.display = 'none';
        btnRolar.textContent    = 'ROLAR!';
        btnRolar.classList.remove('recording');
        txtDetalhes.innerText   = 'Selecione dados...';
        txtTotal.innerText      = '--';
    }

    function salvarPreset() {
        if (dadosSelecionados.length === 0 && Number(inputMod.value) === 0) {
            txtDetalhes.innerText = 'Adicione ao menos um dado ou modificador!';
            return;
        }
        pedirNomePreset().then(nome => {
            if (!nome) return;   // cancelou

            addPreset(user.id, {
                nome,
                dados: [...dadosSelecionados],
                modificador: Number(inputMod.value)
            });

            sairModoGravacao();
            dadosSelecionados = [];
            inputMod.value    = 0;
            renderPresets();

            // Abre os presets para mostrar o novo card
            presetsWrapper.classList.remove('collapsed');
            btnTogglePresets.classList.add('open');
        });
    }

    // Botões de criar preset
    btnCriarEmpty.addEventListener('click', entrarModoGravacao);
    btnCriarPreset.addEventListener('click', entrarModoGravacao);
    btnCancelRec.addEventListener('click', () => {
        sairModoGravacao();
        dadosSelecionados = [];
        inputMod.value    = 0;
    });

    // =========================================================
    // EXECUTAR PRESET
    // =========================================================
    function executarPreset(preset) {
        // Garante que não está em modo gravação
        if (modoGravacao) sairModoGravacao();
        rolarDados([...preset.dados], preset.modificador, preset.nome);
    }

    // =========================================================
    // RENDERIZAR CARDS DE PRESETS
    // =========================================================
    function renderPresets() {
        const presets = getPresets(user.id);

        if (presets.length === 0) {
            presetsEmpty.style.display   = 'flex';
            presetsGrid.style.display    = 'none';
            btnCriarPreset.style.display = 'none';
            return;
        }

        presetsEmpty.style.display   = 'none';
        presetsGrid.style.display    = 'grid';
        btnCriarPreset.style.display = 'flex';

        presetsGrid.innerHTML = '';
        presets.forEach(p => {
            const card = document.createElement('div');
            card.className = 'preset-card';
            card.title = `Rolar: ${p.nome}`;
            card.innerHTML = `
                <span class="preset-card-name">${p.nome}</span>
                <span class="preset-card-formula">${formulaTexto(p.dados, p.modificador)}</span>
                <button class="preset-card-del" title="Remover preset"><i class="fas fa-times"></i></button>
            `;

            // Clicar no card → executar preset
            card.addEventListener('click', (e) => {
                if (e.target.closest('.preset-card-del')) return;
                executarPreset(p);
            });

            // Botão deletar
            card.querySelector('.preset-card-del').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Remover o preset "${p.nome}"?`)) {
                    removePreset(user.id, p.id);
                    renderPresets();
                }
            });

            presetsGrid.appendChild(card);
        });
    }

    // =========================================================
    // INIT
    // =========================================================
    renderPresets();

    // API pública para uso externo (se necessário)
    return { executarPreset, renderPresets };
}
