"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { resumoRico, serializarBloco } from "@/lib/descricao-rica";
import { DescricaoRica } from "./descricao-rica";
import type { ContextoRico } from "./atomos";
import "./descricao-rica.css";

// Descrição de um card (ação, habilidade, item) com descrição rica.
//  - "linhas": corta em N linhas com esmaecido, como o card de hoje, e "mostrar mais";
//  - "resumo": uma linha só (o primeiro trecho que diz algo, com os chips), e abre
//    tudo ao tocar — pra lista densa;
//  - "aberta": sempre inteira.
// Os chips continuam clicáveis (rolagem, tooltip) mesmo com a descrição recolhida.
export type ModoDescricaoCard = "linhas" | "resumo" | "aberta";

export function DescricaoCard({
  texto,
  contexto,
  modo = "linhas",
  linhas = 5,
}: {
  texto: string;
  contexto?: ContextoRico;
  modo?: ModoDescricaoCard;
  linhas?: number;
}) {
  const [aberta, setAberta] = useState(false);
  const [corta, setCorta] = useState(false);
  const corpo = useRef<HTMLDivElement>(null);
  const resumo = useMemo(() => {
    const b = resumoRico(texto);
    return b ? serializarBloco(b) : "";
  }, [texto]);

  // Corta de verdade? (sem corte, não precisa de "mostrar mais")
  useLayoutEffect(() => {
    const el = corpo.current;
    if (!el || aberta || modo === "aberta") return;
    // No resumo quem corta (com reticências) é a própria linha, não o contêiner.
    const medir = () => {
      const alvo = modo === "resumo" ? (el.querySelector<HTMLElement>(".desc-l") ?? el) : el;
      setCorta(alvo.scrollHeight > alvo.clientHeight + 1 || alvo.scrollWidth > alvo.clientWidth + 1);
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [texto, aberta, modo, linhas]);

  if (!texto.trim()) return null;

  // Em "resumo" há o que abrir se a descrição tem mais de uma linha, ou se a
  // única linha passa da largura do card.
  const temMais =
    modo === "resumo" ? corta || texto.trim().split("\n").filter((l) => l.trim()).length > 1 : corta;
  const recolhida = modo !== "aberta" && !aberta;

  return (
    <div
      className={`card-desc-rica ${recolhida ? `recolhida ${modo}${corta ? " corta" : ""}` : "inteira"}`}
      style={{ ["--linhas" as string]: linhas }}
    >
      <div ref={corpo} className="card-desc-rica-corpo">
        <DescricaoRica texto={recolhida && modo === "resumo" ? resumo : texto} contexto={contexto} />
      </div>
      {modo !== "aberta" && (temMais || aberta) && (
        <button type="button" className="card-desc-alternar" aria-expanded={aberta} onClick={() => setAberta((a) => !a)}>
          {aberta ? "mostrar menos" : "mostrar mais"}
        </button>
      )}
    </div>
  );
}
