"use client";

import type { ReactNode } from "react";
import { DescricaoRica } from "@/components/descricao-rica/descricao-rica";
import type { ContextoRico } from "@/components/descricao-rica/atomos";
import { temMarcacaoRica, usosDoCatalogo } from "@/lib/descricao-rica";
import { Tooltip } from "@/components/tooltip";
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

// A descrição de uma ação de criatura: texto com marcação rica vira a visualização
// rica (as condições citadas por chip já aparecem nela); texto antigo, puro, segue
// com o destaque pelo nome. `faltantes` são as condições escolhidas que o texto não cita.
export function descricaoDeCriatura(
  texto: string,
  condicoes: CondicaoEfeito[],
  contexto?: ContextoRico,
): { conteudo: ReactNode; faltantes: CondicaoEfeito[] } {
  if (!temMarcacaoRica(texto)) return separarCondicoes(texto, condicoes);
  const citadas = usosDoCatalogo(texto).condicoes.map((n) => n.toLowerCase());
  const doTexto = texto.toLowerCase();
  const faltantes = condicoes.filter(
    (c) => c.nome.trim() && !citadas.includes(c.nome.toLowerCase()) && !doTexto.includes(c.nome.toLowerCase()),
  );
  return { conteudo: <DescricaoRica texto={texto} contexto={contexto} />, faltantes };
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
  return (
    <Tooltip
      cor={cor}
      icone="fa-triangle-exclamation"
      titulo={cond.nome}
      selo={cond.duracaoTurnos ? `${cond.duracaoTurnos} turno${cond.duracaoTurnos === 1 ? "" : "s"}` : undefined}
      texto={cond.descricao}
    >
      <span
        className={`${chip ? "bestiario-condicao-chip" : "bestiario-condicao-inline"} ${className}`}
        style={style}
        tabIndex={0}
      >
        <span className="fx-texto">{texto}</span>
      </span>
    </Tooltip>
  );
}
