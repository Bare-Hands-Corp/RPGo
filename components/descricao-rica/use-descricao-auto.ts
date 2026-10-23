"use client";

import { useState } from "react";

// Descrição que segue o texto gerado dos efeitos e da duração enquanto ninguém
// a edita à mão. Editar assume o controle (o texto fica como está, mesmo que os
// efeitos mudem); `regenerar` volta ao gerado. Sem efeito: o valor é derivado,
// então não há descompasso entre a ação e a descrição.
export function useDescricaoAuto(gerado: string, inicial = "") {
  const [texto, setTexto] = useState(inicial);
  const [auto, setAuto] = useState(inicial.trim() === "");
  const valor = auto ? gerado : texto;

  function aoMudar(t: string) {
    if (auto && t === gerado) return; // eco do editor, nada mudou
    setTexto(t);
    setAuto(false);
  }

  return {
    valor,
    aoMudar,
    automatica: { ativa: auto, regenerar: () => setAuto(true) },
  };
}
