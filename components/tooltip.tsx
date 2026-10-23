"use client";

import {
  cloneElement,
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type PropsDoAlvo = {
  onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
  "aria-describedby"?: string;
};

// Dica padrão da aplicação (o visual nasceu nas condições do bestiário): caixa
// no tema, borda de cima na `cor`, cabeçalho com ícone + título + selo e o
// texto embaixo. Vai no próprio elemento filho (sem wrapper), então serve em
// lista, grade e botão. Fica fixed num portal (não corta em card com
// overflow), abre embaixo ou, sem espaço, em cima, e fecha ao rolar.
// Sem título, texto nem conteúdo, devolve o filho como está.
export function Tooltip({
  titulo,
  icone,
  selo,
  texto,
  conteudo,
  cor,
  children,
}: {
  titulo?: ReactNode;
  icone?: string;
  selo?: ReactNode;
  // Uma linha por item; string com "\n" também quebra.
  texto?: string | (string | false | null | undefined)[];
  // Conteúdo livre, abaixo do texto.
  conteudo?: ReactNode;
  cor?: string;
  children: ReactElement<PropsDoAlvo>;
}) {
  const idDica = useId();
  const [dica, setDica] = useState<{ x: number; y: number; acima: boolean } | null>(null);

  // Fecha ao rolar/redimensionar — a dica é fixed e ficaria "solta" na tela.
  useEffect(() => {
    if (!dica) return;
    const fechar = () => setDica(null);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [dica]);

  const linhas = (Array.isArray(texto) ? texto : [texto]).filter((l): l is string => !!l && !!l.trim());
  if (!titulo && linhas.length === 0 && !conteudo) return children;

  function abrir(alvo: HTMLElement) {
    const r = alvo.getBoundingClientRect();
    // Abre embaixo; se não couber, em cima. Centraliza no alvo sem sair da tela.
    const acima = r.bottom + 200 > window.innerHeight && r.top > 200;
    const meia = Math.min(170, window.innerWidth / 2 - 8);
    const x = Math.min(Math.max(r.left + r.width / 2, meia + 8), window.innerWidth - meia - 8);
    setDica({ x, y: acima ? r.top - 8 : r.bottom + 8, acima });
  }
  const fechar = () => setDica(null);

  const p = children.props;
  const alvo = cloneElement(children, {
    onMouseEnter: (e: MouseEvent<HTMLElement>) => {
      p.onMouseEnter?.(e);
      abrir(e.currentTarget);
    },
    onMouseLeave: (e: MouseEvent<HTMLElement>) => {
      p.onMouseLeave?.(e);
      fechar();
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      p.onFocus?.(e);
      abrir(e.currentTarget);
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      p.onBlur?.(e);
      fechar();
    },
    "aria-describedby": dica ? idDica : p["aria-describedby"],
  });

  return (
    <>
      {alvo}
      {dica &&
        createPortal(
          <div
            id={idDica}
            role="tooltip"
            className={`dica ${dica.acima ? "acima" : ""}`}
            style={{ left: dica.x, top: dica.y, ...(cor ? { "--dica-cor": cor } : {}) } as CSSProperties}
          >
            {(titulo || icone || selo) && (
              <div className="dica-topo">
                {icone && <i className={`fas ${icone}`} />}
                {titulo && <strong>{titulo}</strong>}
                {selo && <span className="dica-selo">{selo}</span>}
              </div>
            )}
            {linhas.length > 0 && <p className="dica-texto">{linhas.join("\n")}</p>}
            {conteudo}
          </div>,
          document.body,
        )}
    </>
  );
}
