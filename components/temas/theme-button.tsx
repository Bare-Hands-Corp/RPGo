"use client";

import { useState } from "react";
import { ModalTemas } from "./modal-temas";
import "./temas.css";

export function ThemeButton({ title = "Trocar tema" }: { title?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn-paleta"
        title={title}
        onClick={() => setAberto(true)}
      >
        <i className="fas fa-palette" />
      </button>
      {aberto && <ModalTemas onFechar={() => setAberto(false)} />}
    </>
  );
}
