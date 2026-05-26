"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { entrarEmMesa } from "./actions";

type PersonagemOption = {
  id: string;
  nome: string;
  mesa: { nome: string } | null;
};

type Props = {
  personagens: PersonagemOption[];
};

export function BotaoEntrarMesa({ personagens }: Props) {
  const [aberto, setAberto] = useState(false);
  const [codigoAcesso, setCodigoAcesso] = useState("");
  const [personagemId, setPersonagemId] = useState(personagens[0]?.id || "");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const semPersonagens = personagens.length === 0;

  const personagemSelecionado = useMemo(
    () => personagens.find((p) => p.id === personagemId) || null,
    [personagemId, personagens],
  );

  function abrir() {
    if (pending) return;
    setErro(null);
    setCodigoAcesso("");
    setPersonagemId(personagens[0]?.id || "");
    setAberto(true);
  }

  function fechar() {
    if (pending) return;
    setAberto(false);
    setErro(null);
  }

  function submeter(e: FormEvent) {
    e.preventDefault();
    if (semPersonagens) {
      setErro("Crie um personagem antes de entrar em uma mesa.");
      return;
    }
    if (!codigoAcesso.trim()) {
      setErro("Código da mesa é obrigatório.");
      return;
    }
    if (!personagemId) {
      setErro("Selecione um personagem.");
      return;
    }

    setErro(null);
    startTransition(async () => {
      try {
        await entrarEmMesa({ codigoAcesso, personagemId });
        setAberto(false);
        setCodigoAcesso("");
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Erro ao entrar na mesa.");
      }
    });
  }

  return (
    <>
      <button type="button" className="btn-entrar-mesa" onClick={abrir} disabled={pending}>
        <i className="fas fa-door-open" />
        <span>Entrar em mesa</span>
      </button>

      {aberto && (
        <div className="modal-overlay-mesa" onClick={fechar}>
          <div
            className="modal-content-mesa auth-card modal-entrar-mesa"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-entrar-header">
              <div>
                <h2>Entrar em Mesa</h2>
                <p>Informe o código da mesa e escolha qual personagem irá participar.</p>
              </div>
              <button type="button" className="modal-close-btn" onClick={fechar} aria-label="Fechar modal">
                <i className="fas fa-xmark" />
              </button>
            </div>

            <form onSubmit={submeter}>
              <div className="form-group">
                <label htmlFor="codigoMesaEntrada">Código da mesa</label>
                <input
                  id="codigoMesaEntrada"
                  type="text"
                  className="form-input"
                  placeholder="Ex: A1B2C3"
                  value={codigoAcesso}
                  onChange={(e) => setCodigoAcesso(e.target.value)}
                  disabled={pending}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="personagemEntrada">Personagem</label>
                <select
                  id="personagemEntrada"
                  className="form-input"
                  value={personagemId}
                  onChange={(e) => setPersonagemId(e.target.value)}
                  disabled={pending || semPersonagens}
                >
                  {personagens.map((personagem) => (
                    <option key={personagem.id} value={personagem.id}>
                      {personagem.nome}
                      {personagem.mesa ? ` · ${personagem.mesa.nome}` : " · Sem mesa"}
                    </option>
                  ))}
                </select>
              </div>

              {personagemSelecionado && (
                <p className="modal-entrar-info">
                  {personagemSelecionado.mesa
                    ? `O personagem ${personagemSelecionado.nome} já está em ${personagemSelecionado.mesa.nome}. Ele será movido para a nova mesa.`
                    : `O personagem ${personagemSelecionado.nome} está disponível para entrar.`}
                </p>
              )}

              {erro && <p className="modal-entrar-erro">{erro}</p>}

              <div className="modal-entrar-acoes">
                <button type="button" className="btn-text" onClick={fechar} disabled={pending}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={pending || semPersonagens}>
                  {pending ? "Entrando..." : "Confirmar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}