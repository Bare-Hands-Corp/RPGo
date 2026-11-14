"use client";

// Cor das cartas: "papel" (claro, igual em qualquer tema) ou "ficha" (segue o
// tema escolhido). Lembrada neste navegador; vale pra todas as cartas da página
// pelo atributo `data-cartas-tema` no <body> (carta.css).
import { useEffect, useSyncExternalStore } from "react";

export type TemaCartas = "papel" | "ficha";

const CHAVE = "rpgo:cartas-tema";
const ouvintes = new Set<() => void>();

function ler(): TemaCartas {
  try {
    return localStorage.getItem(CHAVE) === "ficha" ? "ficha" : "papel";
  } catch {
    return "papel";
  }
}

export function useTemaCartas(): [TemaCartas, (t: TemaCartas) => void] {
  const tema = useSyncExternalStore(
    (avisar) => {
      ouvintes.add(avisar);
      return () => ouvintes.delete(avisar);
    },
    ler,
    () => "papel" as TemaCartas,
  );
  useEffect(() => {
    document.body.dataset.cartasTema = tema;
  }, [tema]);
  const mudar = (t: TemaCartas) => {
    try {
      localStorage.setItem(CHAVE, t);
    } catch {}
    ouvintes.forEach((f) => f());
  };
  return [tema, mudar];
}

export function AlternarTemaCartas({ className = "visao-alternar" }: { className?: string }) {
  const [tema, setTema] = useTemaCartas();
  return (
    <div className={className} role="group" aria-label="Cor das cartas">
      <button type="button" aria-pressed={tema === "papel"} onClick={() => setTema("papel")} title="Cartas em papel claro">
        <i className="fas fa-scroll" /> Papel
      </button>
      <button type="button" aria-pressed={tema === "ficha"} onClick={() => setTema("ficha")} title="Cartas nas cores do tema">
        <i className="fas fa-palette" /> Tema
      </button>
    </div>
  );
}
