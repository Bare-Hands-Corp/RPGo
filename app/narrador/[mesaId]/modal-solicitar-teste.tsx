"use client";

import { useState } from "react";
import Swal from "sweetalert2";
import { criarSolicitacaoTeste } from "./actions";
import type { MensagemSerializada } from "@/lib/mensagens";

type Props = {
  mesaId: string;
  aberto: boolean;
  onFechar: () => void;
  onCriada: (msg: MensagemSerializada) => void;
  personagens?: { id: string; nome: string; fotoUrl?: string | null }[];
};

export function ModalSolicitarTeste({ mesaId, aberto, onFechar, onCriada, personagens }: Props) {
  const [pericia, setPericia] = useState("");
  const [cd, setCd] = useState(10);
  const [privacidadeCd, setPrivacidadeCd] = useState(true);
  const [privacidadeResultado, setPrivacidadeResultado] = useState(true);
  const [alvos, setAlvos] = useState<string[] | "TODOS">("TODOS");
  const [enviando, setEnviando] = useState(false);

  if (!aberto) return null;

  async function enviar() {
    const nomePericia = pericia.trim();
    if (!nomePericia) return;
    setEnviando(true);
    try {
      const alvosIds = alvos === "TODOS" ? "TODOS" : alvos;
      const alvosNomes = alvos === "TODOS"
        ? personagens?.map((p) => p.nome) ?? []
        : (personagens ?? [])
            .filter((p) => alvos.includes(p.id))
            .map((p) => p.nome);
      const msg = await criarSolicitacaoTeste(mesaId, {
        pericia: nomePericia,
        cd,
        privacidadeCd,
        privacidadeResultado,
        alvos: alvosIds,
        alvosNomes,
      });
      onCriada({
        id: msg.id,
        sessionId: msg.sessionId,
        uid: msg.uid,
        nome: msg.nome,
        mensagem: msg.mensagem,
        timestamp: msg.timestamp.toISOString(),
        tipo: msg.tipo,
        total: msg.total,
        modificador: msg.modificador,
        detalhes: msg.detalhes,
      });
      onFechar();
      setPericia("");
      setCd(10);
      setPrivacidadeCd(true);
      setPrivacidadeResultado(true);
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Erro",
        text: error instanceof Error ? error.message : "Erro ao criar teste.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="narrador-modal-overlay" onClick={onFechar}>
      <div className="narrador-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="narrador-modal-close" onClick={onFechar} aria-label="Fechar">
          ×
        </button>
        <h3>Pedir Teste</h3>
        <label>
          Perícia
          <input type="text" value={pericia} onChange={(e) => setPericia(e.target.value)} placeholder="Ex: Atletismo" />
        </label>
        <label>
          CD
          <input type="number" value={cd} onChange={(e) => setCd(Number(e.target.value) || 0)} min={0} />
        </label>
        <div>
          <div style={{ fontWeight: 800, marginBottom: 8, color: "var(--text-sec)" }}>Alvos</div>
          <div className="alvos-grid">
            <button
              type="button"
              className={"alvo-card" + (alvos === "TODOS" ? " selected" : "")}
              onClick={() => setAlvos("TODOS")}
              title="Selecionar Todos"
            >
              <div className="alvo-avatar alvo-all">
                <i className="fas fa-users" />
              </div>
              <div className="alvo-nome">Todos</div>
            </button>
            {personagens && personagens.length > 0 && personagens.map((p) => {
              const primeiro = p.nome.split(" ")[0] || p.nome;
              const selected = alvos === "TODOS" ? false : (alvos as string[]).includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={"alvo-card" + (selected ? " selected" : "")}
                  onClick={() => {
                    if (alvos === "TODOS") setAlvos([p.id]);
                    else {
                      const setA = new Set(alvos as string[]);
                      if (setA.has(p.id)) setA.delete(p.id);
                      else setA.add(p.id);
                      setAlvos(Array.from(setA));
                    }
                  }}
                >
                  <div className="alvo-avatar">
                    {p.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.fotoUrl} alt={p.nome} />
                    ) : (
                      <div className="alvo-initial">{(primeiro || "?").charAt(0)}</div>
                    )}
                  </div>
                  <div className="alvo-nome">{primeiro}</div>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <label className="narrador-check">
            <input
              type="checkbox"
              checked={privacidadeCd}
              onChange={(e) => setPrivacidadeCd(e.target.checked)}
            />
            Mostrar CD aos jogadores
          </label>
          <label className="narrador-check">
            <input
              type="checkbox"
              checked={privacidadeResultado}
              onChange={(e) => setPrivacidadeResultado(e.target.checked)}
            />
            Mostrar resultado aos jogadores
          </label>
        </div>

        <div className="narrador-modal-actions">
          <button type="button" className="narrador-btn-sec" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="narrador-btn-pri" onClick={enviar} disabled={enviando}>
            {enviando ? "Enviando..." : "Solicitar"}
          </button>
        </div>
      </div>
    </div>
  );
}
