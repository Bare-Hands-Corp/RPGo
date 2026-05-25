"use client";

import Swal from "sweetalert2";

export function CopyCodigoBadge({ codigo }: { codigo: string }) {
  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Código copiado!",
        showConfirmButton: false,
        timer: 1800,
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    } catch {
      Swal.fire({
        icon: "error",
        title: "Falha ao copiar",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    }
  }

  return (
    <button
      type="button"
      className="codigo-badge"
      onClick={copiar}
      title="Clique para copiar"
    >
      <i className="fas fa-key" /> <span>{codigo}</span>
    </button>
  );
}
