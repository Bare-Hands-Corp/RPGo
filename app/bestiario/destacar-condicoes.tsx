"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { estiloAplicado, normalizarEfeitoCor } from "@/lib/estilos-cor";
import { corDaCondicao } from "./cor-condicao";
import type { CondicaoEfeito } from "./types";

// Em vez de listar as condições impostas como tags separadas, destaca o
// próprio nome delas dentro do texto da ação (cor + borda da condição,
// tooltip com a descrição no hover) — o texto continua sendo a fonte da
// verdade, só ganha destaque visual onde a condição é mencionada. Se o mestre
// escolheu a condição mas não chegou a escrever o nome dela no texto, ela
// vira um chip à parte (`faltantes`), pra não sumir informação.
export function separarCondicoes(
  texto: string,
  condicoes: CondicaoEfeito[],
): { conteudo: ReactNode; faltantes: CondicaoEfeito[] } {
  if (condicoes.length === 0) return { conteudo: texto, faltantes: [] };

  let partes: ReactNode[] = [texto];
  const faltantes: CondicaoEfeito[] = [];

  for (const cond of condicoes) {
    if (!cond.nome.trim()) continue;
    let achou = false;
    const novasPartes: ReactNode[] = [];
    for (const parte of partes) {
      if (typeof parte !== "string" || achou) {
        novasPartes.push(parte);
        continue;
      }
      const indice = parte.toLowerCase().indexOf(cond.nome.toLowerCase());
      if (indice === -1) {
        novasPartes.push(parte);
        continue;
      }
      achou = true;
      const antes = parte.slice(0, indice);
      const trecho = parte.slice(indice, indice + cond.nome.length);
      const depois = parte.slice(indice + cond.nome.length);
      if (antes) novasPartes.push(antes);
      novasPartes.push(<SpanCondicao key={cond.id} cond={cond} texto={trecho} />);
      if (depois) novasPartes.push(depois);
    }
    partes = novasPartes;
    if (!achou) faltantes.push(cond);
  }

  return { conteudo: partes, faltantes };
}

// Versão "tudo junto": as condições que não aparecem no texto entram como
// chips logo depois dele.
export function destacarCondicoes(texto: string, condicoes: CondicaoEfeito[]): ReactNode {
  const { conteudo, faltantes } = separarCondicoes(texto, condicoes);
  if (faltantes.length === 0) return conteudo;
  return (
    <>
      {conteudo}
      <span className="bestiario-condicoes-extras">
        {faltantes.map((cond) => (
          <ChipCondicao key={cond.id} cond={cond} />
        ))}
      </span>
    </>
  );
}

/** Condição como chip solto (mesmas medidas dos outros chips do card). */
export function ChipCondicao({ cond }: { cond: CondicaoEfeito }) {
  return (
    <SpanCondicao
      cond={cond}
      texto={cond.nome + (cond.duracaoTurnos ? ` (${cond.duracaoTurnos}t)` : "")}
      chip
    />
  );
}

// Mesmo sistema de estilo das tags/árvores do jogador (fx-chip + efeito);
// sem cor escolhida cai na cor automática pelo nome.
function SpanCondicao({ cond, texto, chip = false }: { cond: CondicaoEfeito; texto: string; chip?: boolean }) {
  const cor = cond.cor || corDaCondicao(cond.nome);
  const { className, style } = estiloAplicado(
    { cor, cor2: cond.cor2 || null, efeito: normalizarEfeitoCor(cond.efeito) },
    "chip",
  );
  const ref = useRef<HTMLSpanElement>(null);
  const idDica = useId();
  const [dica, setDica] = useState<{ x: number; y: number; acima: boolean } | null>(null);

  function abrir() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    // Abre embaixo; se não couber, em cima. Centraliza no chip sem sair da tela.
    const acima = r.bottom + 200 > window.innerHeight && r.top > 200;
    const meia = Math.min(170, window.innerWidth / 2 - 8);
    const x = Math.min(Math.max(r.left + r.width / 2, meia + 8), window.innerWidth - meia - 8);
    setDica({ x, y: acima ? r.top - 8 : r.bottom + 8, acima });
  }

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

  return (
    <>
      <span
        ref={ref}
        className={`${chip ? "bestiario-condicao-chip" : "bestiario-condicao-inline"} ${className}`}
        style={style}
        tabIndex={0}
        aria-describedby={dica ? idDica : undefined}
        onMouseEnter={abrir}
        onMouseLeave={() => setDica(null)}
        onFocus={abrir}
        onBlur={() => setDica(null)}
      >
        <span className="fx-texto">{texto}</span>
      </span>
      {dica &&
        createPortal(
          <div
            id={idDica}
            role="tooltip"
            className={`bestiario-condicao-dica ${dica.acima ? "acima" : ""}`}
            style={{ left: dica.x, top: dica.y, "--dica-cor": cor } as React.CSSProperties}
          >
            <div className="bestiario-condicao-dica-topo">
              <i className="fas fa-triangle-exclamation" />
              <strong>{cond.nome}</strong>
              {cond.duracaoTurnos ? (
                <span className="bestiario-condicao-dica-duracao">
                  {cond.duracaoTurnos} turno{cond.duracaoTurnos === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            {cond.descricao.trim() && <p>{cond.descricao.trim()}</p>}
          </div>,
          document.body,
        )}
    </>
  );
}
