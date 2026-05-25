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
import { createClient } from "@/lib/supabase/client";
import {
  enviarMensagemTexto,
  limparMensagens,
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
  // Mensagens pré-carregadas no SSR. PainelChat usa como estado inicial,
  // evitando o round-trip de listarMensagens ao abrir a aba.
  mensagensIniciais: MensagemSerializada[];
};

export const PainelChat = forwardRef<PainelChatHandle, Props>(function PainelChat(
  { userId, userName, sessionId, mensagensIniciais },
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
          mensagens.map((m) => <MensagemView key={m.id} msg={m} meuUid={userId} />)
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
  meuUid,
}: {
  msg: MensagemSerializada;
  meuUid: string;
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
        }
      | Array<{ faces: number; sinal: 1 | -1; resultado: number }>;
    const arr = Array.isArray(raw) ? raw : raw.rolls || [];
    const presetLabel = !Array.isArray(raw) ? raw.nomePreset || null : null;

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
      <div className="chat-message roll-message">
        <div className="roll-header">
          {hora} <strong>{nome}</strong>
        </div>
        {presetLabel && (
          <div className="roll-preset-tag">
            <i className="fas fa-bookmark" /> {presetLabel}
          </div>
        )}
        <div className="roll-box">
          <div className="roll-total">{msg.total}</div>
          <div
            className="roll-details"
            dangerouslySetInnerHTML={{ __html: `[${msg.total}] = ${stringDados}` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="chat-message">
      {hora} <strong>{nome}</strong>: {msg.mensagem}
    </div>
  );
}
