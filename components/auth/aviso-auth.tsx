"use client";

export type Aviso = { msg: string; tipo: "erro" | "sucesso" };

// Toast do topo das telas de conta (login, código, recuperar senha).
export function AvisoAuth({ aviso, onFechar }: { aviso: Aviso | null; onFechar: () => void }) {
  if (!aviso) return null;
  return (
    <div className={`auth-toast show ${aviso.tipo}`} role={aviso.tipo === "erro" ? "alert" : "status"}>
      <span>{aviso.msg}</span>
      <button type="button" className="close-toast" onClick={onFechar} aria-label="Fechar">
        ×
      </button>
    </div>
  );
}
