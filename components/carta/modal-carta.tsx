"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Carta, type ModeloCarta } from "./carta";
import { cartaComoBlob, cartaComoPng, nomeDoArquivo } from "./exportar";
import { AlternarTemaCartas } from "./tema-cartas";
import "./modal-carta.css";

// Carta grande por cima da página: entra de costas e vira, inclina com o ponteiro,
// baixa ou copia como imagem. `acoes`: botões a mais (ex.: Usar, Editar).
export function ModalCarta({
  carta,
  onFechar,
  onNavegar,
  acoes,
  chips = "carta",
}: {
  carta: ModeloCarta;
  onFechar: () => void;
  onNavegar?: (passo: number) => void;
  acoes?: ReactNode;
  chips?: "carta" | "ficha";
}) {
  const refFrente = useRef<HTMLDivElement>(null);
  // Cada carta entra de costas e vira logo depois (efeito de "revelar").
  // Pelo título: a carta pode ser recriada (re-render da ficha) sem ser outra.
  const [revelada, setRevelada] = useState<string | null>(null);
  const [invertida, setInvertida] = useState(false);
  const virada = revelada !== carta.titulo || invertida;
  const setVirada = (f: (v: boolean) => boolean) => setInvertida((v) => f(v));
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setRevelada(carta.titulo);
      setInvertida(false);
    }, 80);
    return () => clearTimeout(t);
  }, [carta.titulo]);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
      if (e.key === "ArrowRight") onNavegar?.(1);
      if (e.key === "ArrowLeft") onNavegar?.(-1);
      if (e.key === " " && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        setVirada((v) => !v);
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar, onNavegar]);

  function avisar(t: string) {
    setAviso(t);
    setTimeout(() => setAviso(null), 2000);
  }

  async function baixar() {
    if (!refFrente.current) return;
    try {
      const url = await cartaComoPng(refFrente.current);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${nomeDoArquivo(carta.titulo)}.png`;
      a.click();
      avisar("Imagem salva");
    } catch (e) {
      console.error(e);
      avisar("Não deu para gerar a imagem");
    }
  }

  async function copiar() {
    if (!refFrente.current) return;
    try {
      // A imagem vai como promessa, criada ainda no clique: gerar o PNG leva
      // um tempo, e o navegador só libera a área de transferência no gesto.
      const png = cartaComoBlob(refFrente.current).then((b) => {
        if (!b) throw new Error("sem imagem");
        return b;
      });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      avisar("Imagem copiada");
    } catch (e) {
      console.error(e);
      // Navegador sem permissão pra área de transferência (ex.: painel embutido).
      avisar(e instanceof DOMException && e.name === "NotAllowedError" ? "O navegador bloqueou copiar; use Baixar PNG" : "Não deu para copiar");
    }
  }

  return createPortal(
    <div className="cartas-modal" onClick={onFechar} role="dialog" aria-modal="true" aria-label={carta.titulo}>
      <div className="cartas-modal-palco" onClick={(e) => e.stopPropagation()}>
        {onNavegar && (
          <button className="cartas-modal-seta" onClick={() => onNavegar(-1)} aria-label="Anterior">
            ‹
          </button>
        )}
        <Carta
          key={carta.titulo}
          ref={refFrente}
          carta={carta}
          virada={virada}
          interativa
          chips={chips}
          className="cartas-modal-carta"
          style={{ "--escala": 1.25 } as CSSProperties}
        />
        {onNavegar && (
          <button className="cartas-modal-seta" onClick={() => onNavegar(1)} aria-label="Próxima">
            ›
          </button>
        )}
      </div>
      <div className="cartas-modal-acoes" onClick={(e) => e.stopPropagation()}>
        {acoes}
        <button onClick={() => setVirada((v) => !v)}>
          <i className="fas fa-rotate" /> Virar
        </button>
        <button onClick={baixar}>
          <i className="fas fa-download" /> Baixar PNG
        </button>
        <button onClick={copiar}>
          <i className="fas fa-copy" /> Copiar imagem
        </button>
        <AlternarTemaCartas className="cartas-modal-tema" />
        <button onClick={onFechar}>Fechar</button>
      </div>
      {aviso && <div className="cartas-aviso">{aviso}</div>}
    </div>,
    document.body,
  );
}
