"use client";

import Swal from "sweetalert2";

type Props = {
  onDelete: () => Promise<void>;
  confirmText: string;
  iconClassName?: string;
  title?: string;
  confirmButtonText?: string;
  successTitle?: string;
  successText?: string;
  // Otimista: parent esconde o card imediatamente; em caso de erro, restauramos.
  onOptimisticHide?: () => void;
  onOptimisticRestore?: () => void;
};

export function DeleteButton({
  onDelete,
  confirmText,
  iconClassName = "fa-solid fa-trash",
  title = "Apagar",
  confirmButtonText = "Sim, apagar!",
  successTitle = "Apagado!",
  successText,
  onOptimisticHide,
  onOptimisticRestore,
}: Props) {
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
      confirmButtonText,
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });

    if (!confirmacao.isConfirmed) return;

    onOptimisticHide?.();
    try {
      await onDelete();
      Swal.fire({
        icon: "success",
        title: successTitle,
        text: successText,
        timer: 1200,
        showConfirmButton: false,
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    } catch (err) {
      onOptimisticRestore?.();
      Swal.fire({
        icon: "error",
        title: "Erro",
        text: err instanceof Error ? err.message : "Não foi possível apagar.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    }
  }

  return (
    <button
      type="button"
      className="btn-delete"
      title={title}
      onClick={handleClick}
    >
        <i className={iconClassName} />
    </button>
  );
}
