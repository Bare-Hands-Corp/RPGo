"use client";

import { useTransition } from "react";
import Swal from "sweetalert2";

type Props = {
  onDelete: () => Promise<void>;
  confirmText: string;
};

export function DeleteButton({ onDelete, confirmText }: Props) {
  const [pending, startTransition] = useTransition();

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const confirmacao = await Swal.fire({
      title: "Tem certeza?",
      text: confirmText,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sim, apagar!",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });

    if (!confirmacao.isConfirmed) return;

    startTransition(async () => {
      try {
        await onDelete();
        Swal.fire({
          icon: "success",
          title: "Apagado!",
          timer: 1200,
          showConfirmButton: false,
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      } catch (err) {
        Swal.fire({
          icon: "error",
          title: "Erro",
          text: err instanceof Error ? err.message : "Não foi possível apagar.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      }
    });
  }

  return (
    <button
      type="button"
      className="btn-delete"
      title="Apagar"
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? (
        <i className="fa-solid fa-spinner fa-spin" />
      ) : (
        <i className="fa-solid fa-trash" />
      )}
    </button>
  );
}
