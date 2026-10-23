"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Descrição do card cortada em poucas linhas, pra os cards terem tamanho
// parecido. O "mostrar mais" só aparece quando o texto passa do corte.
export function DescricaoRecolhivel({ texto }: { texto: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [aberta, setAberta] = useState(false);
  const [corta, setCorta] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || aberta) return;
    const medir = () => setCorta(el.scrollHeight > el.clientHeight + 1);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [texto, aberta]);

  if (!texto.trim()) return null;
  return (
    <>
      <div ref={ref} className={`card-desc ${aberta ? "" : "recolhida"}`}>
        {texto}
      </div>
      {(corta || aberta) && (
        <button type="button" className="card-desc-alternar" onClick={() => setAberta((a) => !a)}>
          {aberta ? "mostrar menos" : "mostrar mais"}
        </button>
      )}
    </>
  );
}
