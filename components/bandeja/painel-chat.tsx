"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Swal from "sweetalert2";
import { rolarDados } from "@/lib/dice";
import { createClient } from "@/lib/supabase/client";
import {
  enviarMensagemTexto,
  limparMensagens,
  registrarRolagem,
  listarMensagens,
} from "./actions";
import type { MensagemSerializada } from "@/lib/mensagens";

export type PainelChatHandle = {
  // Append local de uma mensagem já persistida (usado pelo rolador pra evitar
  // round-trip duplo: a action retorna a mensagem e a passamos pra cá).
  appendLocal: (msg: MensagemSerializada) => void;
};

type Props = {
  userId: string;
  userName: string;
  sessionId: string;
  personagemId: string | null;
  // Mensagens pré-carregadas no SSR. PainelChat usa como estado inicial,
  // evitando o round-trip de listarMensagens ao abrir a aba.
  mensagensIniciais: MensagemSerializada[];
};

export const PainelChat = forwardRef<PainelChatHandle, Props>(function PainelChat(
  { userId, userName, sessionId, personagemId, mensagensIniciais },
  ref,
) {
  const [mensagens, setMensagens] = useState<MensagemSerializada[]>(mensagensIniciais);
  const [texto, setTexto] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const recarregar = useCallback(async () => {
    try {
      const m = await listarMensagens(sessionId);
      setMensagens(m);
    } catch (e) {
      console.error(e);
    }
  }, [sessionId]);

  const appendLocal = useCallback((msg: MensagemSerializada) => {
    setMensagens((prev) => {
      // Idempotência: se a mensagem já chegou via realtime (race), não duplica.
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  // Realtime fica sempre ativo (não depende da aba estar visível) porque
  // a carga inicial já veio pré-renderizada via SSR. Isso mantém o chat
  // sincronizado mesmo quando o rolador está em foco.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mensagens",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          // Skip eventos do próprio usuário — já tratamos local via appendLocal/setMensagens.
          // Para INSERT o uid vem em payload.new; para DELETE em payload.old.
          const novoUid = (payload.new as { uid?: string } | null)?.uid;
          const antigoUid = (payload.old as { uid?: string } | null)?.uid;
          if (payload.eventType === "INSERT" && novoUid === userId) return;
          if (payload.eventType === "DELETE" && antigoUid === userId) return;
          recarregar();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, userId, recarregar]);

  // Auto-scroll quando chegam mensagens novas.
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensagens]);

  useImperativeHandle(ref, () => ({ appendLocal }), [appendLocal]);

  async function enviar() {
    const t = texto.trim();
    if (!t) return;

    if (t.toLowerCase() === "/limpar") {
      setTexto("");
      const r = await Swal.fire({
        title: "Apagar mensagens",
        text: "Apagar TODAS as mensagens? Esta ação não pode ser desfeita.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Apagar",
        cancelButtonText: "Cancelar",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      if (r.isConfirmed) {
        try {
          await limparMensagens(sessionId);
          setMensagens([]);
        } catch (e) {
          Swal.fire({
            icon: "error",
            title: "Erro",
            text: e instanceof Error ? e.message : "Erro ao apagar.",
            background: "var(--bg-card)",
            color: "var(--text-main)",
          });
        }
      }
      return;
    }

    try {
      const nova = await enviarMensagemTexto(sessionId, userName, t);
      setTexto("");
      appendLocal(nova);
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Erro",
        text: e instanceof Error ? e.message : "Erro ao enviar.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    }
  }

  return (
    <>
      <div className="chat-messages" ref={containerRef}>
        {mensagens.length === 0 ? (
          <p style={{ color: "#999", textAlign: "center", fontSize: "0.9rem" }}>
            Nenhuma mensagem ainda...
          </p>
        ) : (
          mensagens.map((m) => (
            <MensagemView
              key={m.id}
              msg={m}
              mensagens={mensagens}
              meuUid={userId}
              userName={userName}
              sessionId={sessionId}
              personagemId={personagemId}
              onMensagemAtualizada={appendLocal}
            />
          ))
        )}
      </div>
      <div className="chat-input-row">
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Digite uma mensagem..."
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              enviar();
            }
          }}
        />
        <button type="button" title="Enviar" onClick={enviar}>
          <i className="fas fa-paper-plane" />
        </button>
      </div>
    </>
  );
});

function MensagemView({
  msg,
  mensagens,
  meuUid,
  userName,
  sessionId,
  personagemId,
  onMensagemAtualizada,
}: {
  msg: MensagemSerializada;
  mensagens: MensagemSerializada[];
  meuUid: string;
  userName: string;
  sessionId: string;
  personagemId: string | null;
  onMensagemAtualizada: (msg: MensagemSerializada) => void;
}) {
  const hora = new Date(msg.timestamp).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const nome = msg.uid === meuUid ? "Você" : msg.nome;

  if (msg.tipo === "rolagem" && msg.detalhes) {
    const raw = msg.detalhes as
      | {
          rolls?: Array<{ faces: number; sinal: 1 | -1; resultado: number }>;
          nomePreset?: string | null;
          tipoTeste?: boolean | null;
          pericia?: string | null;
          cd?: number | null;
          sucesso?: boolean | null;
          privacidadeResultado?: boolean | null;
        }
      | Array<{ faces: number; sinal: 1 | -1; resultado: number }>;
    const arr = Array.isArray(raw) ? raw : raw.rolls || [];
    const presetLabel = !Array.isArray(raw) ? raw.nomePreset || null : null;
    const testeLabel = !Array.isArray(raw) ? raw.pericia || null : null;
    const sucesso = !Array.isArray(raw) ? raw.sucesso ?? null : null;
    const privacidadeResultado = !Array.isArray(raw) ? raw.privacidadeResultado ?? true : true;

    let stringDados = "";
    arr.forEach((d, i) => {
      const op =
        i === 0 ? (d.sinal === -1 ? "- " : "") : d.sinal === 1 ? " + " : " - ";
      let res = `${d.resultado}`;
      if (d.resultado === 1) res = `<span class="crit-fail">${d.resultado}</span>`;
      else if (d.resultado === d.faces)
        res = `<span class="crit-success">${d.resultado}</span>`;
      stringDados += `${op}(${res}) 1d${d.faces}`;
    });
    if (msg.modificador && msg.modificador !== 0) {
      stringDados += ` ${msg.modificador >= 0 ? "+" : "-"} ${Math.abs(msg.modificador)}`;
    }

    return (
      <div className={"chat-message roll-message" + (sucesso === true ? " success" : sucesso === false ? " fail" : "") }>
        <div className="roll-header">
          {hora} <strong>{nome}</strong>
        </div>
        {(testeLabel || presetLabel) && (
          <div className="roll-tags">
            {testeLabel && (
              <div className="teste-pericia-tag">
                <i className="fas fa-dice-d20" /> <span>{testeLabel}</span>
              </div>
            )}
            {presetLabel && (
              <div className="teste-pericia-tag">
                <i className="fas fa-bookmark" /> <span>{presetLabel}</span>
              </div>
            )}
          </div>
        )}
        <div className="roll-box">
          <div className="roll-total">{privacidadeResultado ? msg.total : "?"}</div>
          <div
            className="roll-details"
            dangerouslySetInnerHTML={{ __html: privacidadeResultado ? `[${msg.total}] = ${stringDados}` : "Resultado oculto" }}
          />
        </div>
      </div>
    );
  }

  if (msg.tipo === "teste" && msg.detalhes) {
    return (
      <TesteMensagemView
        msg={msg}
        mensagens={mensagens}
        meuUid={meuUid}
        userName={userName}
        sessionId={sessionId}
        personagemId={personagemId}
        onMensagemAtualizada={onMensagemAtualizada}
      />
    );
  }

  return (
    <div className="chat-message">
      {hora} <strong>{nome}</strong>: {msg.mensagem}
    </div>
  );
}

function TesteMensagemView({
  msg,
  mensagens,
  meuUid,
  userName,
  sessionId,
  personagemId,
  onMensagemAtualizada,
}: {
  msg: MensagemSerializada;
  mensagens: MensagemSerializada[];
  meuUid: string;
  userName: string;
  sessionId: string;
  personagemId: string | null;
  onMensagemAtualizada: (msg: MensagemSerializada) => void;
}) {
  const hora = new Date(msg.timestamp).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const nome = msg.uid === meuUid ? "Você" : msg.nome;
  const detalhes = msg.detalhes as {
    pericia?: string | null;
    cd?: number | null;
    privacidadeCd?: boolean;
    privacidadeResultado?: boolean;
    alvos?: string[] | "TODOS";
    alvosNomes?: string[];
    statusPorNome?: Record<string, string>;
  };
  const [modificador, setModificador] = useState(0);
  const [rolando, setRolando] = useState(false);
  const [acompanhamentoAberto, setAcompanhamentoAberto] = useState(false);

  const isNarrador = !personagemId;
  const isAlvo =
    !isNarrador &&
    (detalhes.alvos === "TODOS" ||
      (Array.isArray(detalhes.alvos) && personagemId && detalhes.alvos.includes(personagemId)));
  const jaRolou = mensagens.some(
    (m) =>
      m.tipo === "rolagem" &&
      m.uid === meuUid &&
      Boolean(
        (m.detalhes as { solicitacaoTesteId?: string | null } | null)?.solicitacaoTesteId === msg.id,
      ),
  );
  const envolvidos =
    detalhes.alvos === "TODOS"
      ? detalhes.alvosNomes || []
      : detalhes.alvosNomes || [];

  if (!isNarrador && !isAlvo) {
    return null;
  }

  function statusPorNome(nome: string): string {
    return detalhes.statusPorNome?.[nome] || "Aguardando resultado";
  }

  async function resolverTeste() {
    if (rolando || !isAlvo || jaRolou) return;
    setRolando(true);
    try {
      const resultado = rolarDados([{ faces: 20, sinal: 1 }], modificador);
      const sucesso = typeof detalhes.cd === "number" ? resultado.total >= detalhes.cd : null;
      const mensagem = await registrarRolagem(
        sessionId,
        userName,
        {
          total: resultado.total,
          detalhes: resultado.detalhes,
          modificador,
          nomePreset: null,
          tipoTeste: true,
          pericia: detalhes.pericia || null,
          cd: detalhes.cd ?? null,
          sucesso,
          privacidadeResultado: detalhes.privacidadeResultado ?? true,
          solicitacaoTesteId: msg.id,
          alvoNome: userName,
        },
        personagemId,
        personagemId ? `[${resultado.total}] = 1d20 ${modificador >= 0 ? "+" : "-"} ${Math.abs(modificador)}` : null,
      );
      onMensagemAtualizada(mensagem);
    } catch (error) {
      console.error(error);
    } finally {
      setRolando(false);
    }
  }

  return (
    <div className="chat-message teste-message">
      <div className="roll-header">
        {hora} <strong>{nome}</strong>
      </div>
      <div className="teste-box">
        <div className="teste-pericia-tag">
          <i className="fas fa-dice-d20" />
          <span>{detalhes.pericia || "Teste"}</span>
        </div>
        {isNarrador ? (
          <>
            <div className="teste-notificacao teste-notificacao-narrador">
              <div className="teste-notificacao-topo">
                <i className="fas fa-bell" />
                <span>Solicitação enviada a jogadores envolvidos.</span>
              </div>
              <div className="teste-notificacao-subtexto">
                Acompanhe abaixo a situação de cada personagem.
              </div>
            </div>
            <button
              type="button"
              className={"teste-acompanhamento-toggle" + (acompanhamentoAberto ? " open" : "")}
              onClick={() => setAcompanhamentoAberto((aberto) => !aberto)}
            >
              <span>Acompanhamento</span>
              <i className="fas fa-chevron-down teste-dropdown-icone" />
            </button>
            <div className={"teste-acompanhamento" + (acompanhamentoAberto ? " open" : "") }>
              <div className="teste-acompanhamento-lista">
                {envolvidos.length === 0 ? (
                  <div className="teste-acompanhamento-item vazia">Sem envolvidos</div>
                ) : (
                  envolvidos.map((nome) => (
                    <div key={nome} className="teste-acompanhamento-item">
                      <span className="nome">{nome}</span>
                      <span className="status">{statusPorNome(nome)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : isAlvo ? (
          <>
            {typeof detalhes.cd === "number" && detalhes.privacidadeCd !== false && (
              <div className="teste-meta-linha">
                <div className="teste-cd">CD {detalhes.cd}</div>
              </div>
            )}
            {!jaRolou && (
              <label className="teste-status-label">
                Modificador manual
                <input
                  type="number"
                  value={modificador}
                  onChange={(e) => setModificador(Number(e.target.value) || 0)}
                />
              </label>
            )}
            <button
              type="button"
              className={"teste-btn" + (jaRolou ? " teste-btn-done" : "")}
              onClick={resolverTeste}
              disabled={rolando || jaRolou}
            >
              {rolando ? "Rolando..." : jaRolou ? "Teste realizado" : "Rolar teste"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
