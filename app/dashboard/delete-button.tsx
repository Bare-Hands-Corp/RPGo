"use client";

import { useState, useTransition } from "react";

type Props = {
  onDelete: () => Promise<void>;
  confirmText: string;
};

export function DeleteButton({ onDelete, confirmText }: Props) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(confirmText)) return;
    setErro(null);
    startTransition(async () => {
      try {
        await onDelete();
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Erro ao apagar.");
      }
    });
  }

  return (
    <>
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
      {erro && (
        <div
          style={{
            position: "absolute",
            top: 50,
            right: 10,
            background: "#e74c3c",
            color: "white",
            padding: "4px 8px",
            borderRadius: 4,
            fontSize: 11,
            zIndex: 20,
          }}
        >
          {erro}
        </div>
      )}
    </>
  );
}
