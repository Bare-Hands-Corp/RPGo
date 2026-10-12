"use client";

import { useRef, useState } from "react";

// Posição nova de `de` na lista: o lugar onde `para` está.
export function moverNaLista<T>(lista: T[], de: T, para: T): T[] {
  const i = lista.indexOf(de);
  const j = lista.indexOf(para);
  if (i < 0 || j < 0 || i === j) return lista;
  const nova = lista.slice();
  nova.splice(i, 1);
  nova.splice(j, 0, de);
  return nova;
}

// Reordenar linhas arrastando pela alça: mouse (drag and drop nativo), dedo
// (a linha segue o toque) e teclado (setas na alça). `onMover` roda durante o
// arrasto, pra lista se rearrumar na hora; `onSoltar`, quando ele termina.
export function useArrastar(onMover: (de: string, para: string) => void, onSoltar?: () => void) {
  // Linha liberada pra arrastar: só enquanto a alça está apertada, pra não
  // roubar o clique dos campos e botões da linha.
  const [pega, setPega] = useState<string | null>(null);
  const arrastando = useRef<string | null>(null);

  function soltar() {
    const estava = arrastando.current;
    arrastando.current = null;
    setPega(null);
    if (estava) onSoltar?.();
  }

  function linha(id: string) {
    return {
      "data-arrastar-id": id,
      draggable: pega === id,
      onDragStart: (e: React.DragEvent) => {
        arrastando.current = id;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
      },
      onDragOver: (e: React.DragEvent) => {
        if (!arrastando.current) return;
        e.preventDefault();
        if (arrastando.current !== id) onMover(arrastando.current, id);
      },
      onDrop: (e: React.DragEvent) => e.preventDefault(),
      onDragEnd: soltar,
    };
  }

  function alca(id: string) {
    return {
      onPointerDown: () => setPega(id),
      onPointerUp: () => {
        if (!arrastando.current) setPega(null);
      },
      onTouchStart: () => {
        arrastando.current = id;
      },
      onTouchMove: (e: React.TouchEvent) => {
        const toque = e.touches[0];
        const alvo = document
          .elementFromPoint(toque.clientX, toque.clientY)
          ?.closest("[data-arrastar-id]")
          ?.getAttribute("data-arrastar-id");
        if (alvo && alvo !== id) onMover(id, alvo);
      },
      onTouchEnd: soltar,
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const linhas = [
          ...(e.currentTarget.closest("[data-arrastar-id]")?.parentElement?.querySelectorAll(":scope > [data-arrastar-id]") ?? []),
        ].map((el) => el.getAttribute("data-arrastar-id"));
        const vizinho = linhas[linhas.indexOf(id) + (e.key === "ArrowUp" ? -1 : 1)];
        if (!vizinho) return;
        arrastando.current = id;
        onMover(id, vizinho);
        soltar();
      },
    };
  }

  return { linha, alca, pega };
}
