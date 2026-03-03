/**
 * Lógica do Chat — componente interno da Bandeja Unificada.
 * Migrado de Firebase para Supabase + API REST.
 *
 * @param {Object} user       - Objeto do usuário autenticado ({ id, email })
 * @param {string} SESSION_ID - ID da sessão compartilhada
 */
import { supabase, apiGet, apiPost, apiDelete } from '../../utils/api.js';

export function iniciarChat(user, SESSION_ID) {
    // Nome do personagem buscado do backend (fallback para e-mail)
    let nomePersonagem = user.email || 'Anônimo';
    apiGet(`/users/${user.id}`).then(p => { if (p?.nome) nomePersonagem = p.nome; }).catch(() => {});

    let unsubscribeMensagens = null;

    // --- ELEMENTOS ---
    const chatInput = document.getElementById('chatInput');
    const sendBtn   = document.getElementById('sendChatBtn');

    sendBtn.addEventListener('click', enviarMensagem);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); enviarMensagem(); }
    });

    // --- ENVIAR MENSAGEM DE TEXTO ---
    async function enviarMensagem() {
        const mensagem = chatInput.value.trim();
        if (!mensagem) return;

        if (mensagem.toLowerCase() === '/limpar') {
            chatInput.value = '';
            if (confirm('Apagar TODAS as mensagens? Esta ação não pode ser desfeita.')) {
                await apiDelete(`/mensagens/${SESSION_ID}`).catch(console.error);
            }
            return;
        }

        await apiPost(`/mensagens/${SESSION_ID}`, {
            nome: nomePersonagem,
            mensagem,
            tipo: 'texto'
        }).then(() => { chatInput.value = ''; chatInput.focus(); })
          .catch((err) => alert('Erro ao enviar: ' + err.message));
    }

    // --- ENVIAR ROLAGEM DE DADOS (chamado externamente pelo bandeja.js) ---
    function enviarRolagem({ total, detalhes, modificador, nomePreset }) {
        apiPost(`/mensagens/${SESSION_ID}`, {
            nome: nomePersonagem,
            tipo: 'rolagem',
            total,
            modificador,
            detalhes: { rolls: detalhes, nomePreset: nomePreset || null }
        }).catch((err) => console.error('Erro ao enviar rolagem:', err));
    }

    // --- RENDERIZAR LISTA DE MENSAGENS ---
    function renderizar(mensagens) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        if (!mensagens || mensagens.length === 0) {
            container.innerHTML = '<p style="color:#999;text-align:center;font-size:0.9rem;">Nenhuma mensagem ainda...</p>';
            return;
        }

        let html = '';
        mensagens.forEach(msg => {
            const hora = new Date(msg.timestamp || msg.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const nome = msg.uid === user.id ? 'Você' : msg.nome;

            if (msg.tipo === 'rolagem' && msg.detalhes) {
                const raw = msg.detalhes;
                const arr = Array.isArray(raw) ? raw : (Array.isArray(raw.rolls) ? raw.rolls : Object.values(raw.rolls || raw));
                const presetLabel = raw.nomePreset || null;
                let stringDados = '';
                arr.forEach((dado, i) => {
                    const op = i === 0
                        ? (dado.sinal === -1 ? '- ' : '')
                        : (dado.sinal === 1 ? ' + ' : ' - ');
                    let res = `${dado.resultado}`;
                    if (dado.resultado === 1)               res = `<span class="crit-fail">${dado.resultado}</span>`;
                    else if (dado.resultado === dado.faces)  res = `<span class="crit-success">${dado.resultado}</span>`;
                    stringDados += `${op}(${res}) 1d${dado.faces}`;
                });
                if (msg.modificador && msg.modificador !== 0) {
                    stringDados += ` ${msg.modificador >= 0 ? '+' : '-'} ${Math.abs(msg.modificador)}`;
                }
                const presetTag = presetLabel ? `<div class="roll-preset-tag"><i class="fas fa-bookmark"></i> ${presetLabel}</div>` : '';
                html += `
                    <div class="chat-message roll-message">
                        <div class="roll-header">${hora} <strong>${nome}</strong></div>
                        ${presetTag}
                        <div class="roll-box">
                            <div class="roll-total">${msg.total}</div>
                            <div class="roll-details">[${msg.total}] = ${stringDados}</div>
                        </div>
                    </div>`;
            } else {
                html += `<div class="chat-message">${hora} <strong>${nome}</strong>: ${msg.mensagem}</div>`;
            }
        });

        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    }

    // --- CARREGAR / ESCUTAR MENSAGENS ---
    function ativar() {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        // Carga inicial
        apiGet(`/mensagens/${SESSION_ID}`).then(renderizar).catch(console.error);

        // Realtime
        if (unsubscribeMensagens) { unsubscribeMensagens(); unsubscribeMensagens = null; }
        const channel = supabase.channel(`chat-${SESSION_ID}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'mensagens',
                filter: `session_id=eq.${SESSION_ID}`
            }, () => {
                apiGet(`/mensagens/${SESSION_ID}`).then(renderizar).catch(console.error);
            })
            .subscribe();

        unsubscribeMensagens = () => supabase.removeChannel(channel);
    }

    // --- DESATIVAR LISTENER ---
    function desativar() {
        if (unsubscribeMensagens) { unsubscribeMensagens(); unsubscribeMensagens = null; }
    }

    // Retorna API pública para o orquestrador
    return { ativar, desativar, enviarRolagem };
}
