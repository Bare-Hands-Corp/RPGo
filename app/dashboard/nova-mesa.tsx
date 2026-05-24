"use client";

import { useState, useTransition } from "react";
import { criarMesa } from "./actions";

export function BotaoNovaMesa() {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function fechar() {
    if (pending) return;
    setAberto(false);
    setNome("");
    setBannerUrl("");
    setErro(null);
  }

  function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!nome.trim()) {
      setErro("Nome da mesa é obrigatório.");
      return;
    }
    startTransition(async () => {
      try {
        await criarMesa({ nome, bannerUrl });
        fechar();
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Erro ao criar mesa.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn-criar-card"
        style={{ gridColumn: "1 / -1" }}
        onClick={() => setAberto(true)}
      >
        <div className="plus-icon">
          <i className="fas fa-plus" />
        </div>
        <div className="label">Criar Nova Mesa</div>
      </button>

      {aberto && (
        <div className="modal-overlay-mesa" onClick={fechar}>
          <div
            className="modal-content-mesa auth-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: "var(--primary)", marginBottom: 20 }}>Criar Nova Mesa</h2>
            <form onSubmit={submeter}>
              <div className="form-group">
                <label htmlFor="novaMesaNome">Nome da Mesa</label>
                <input
                  id="novaMesaNome"
                  type="text"
                  className="form-input"
                  placeholder="Ex: A Caverna do Dragão"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  disabled={pending}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="novaMesaBanner">URL do Banner (opcional)</label>
                <input
                  id="novaMesaBanner"
                  type="url"
                  className="form-input"
                  placeholder="https://imagem.com/banner.jpg"
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  disabled={pending}
                />
              </div>
              {erro && (
                <p style={{ color: "#e74c3c", fontSize: "0.85rem", marginTop: 10 }}>{erro}</p>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={pending}>
                  {pending ? "Criando..." : "Criar"}
                </button>
                <button
                  type="button"
                  className="btn-text"
                  style={{ flex: 1 }}
                  onClick={fechar}
                  disabled={pending}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
