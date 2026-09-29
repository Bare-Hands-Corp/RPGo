"use client";

// Erro de página fica dentro do layout raiz: sem ele o Next troca o <html> e o tema some.
export default function Erro({ unstable_retry }: { error: Error; unstable_retry: () => void }) {
  return (
    <div className="auth-wrapper">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <p style={{ marginBottom: 20, color: "var(--text-main)" }}>
          Não deu pra carregar a página.
        </p>
        <button type="button" className="btn-primary" onClick={() => unstable_retry()}>
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
