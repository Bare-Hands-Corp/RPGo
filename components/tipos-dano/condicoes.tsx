"use client";

import { createContext, useContext, useMemo } from "react";
import {
  CATALOGO_CONDICOES_PADRAO,
  condicaoNoCatalogo,
  corDaCondicao,
  RODADAS_MAX,
  textoRodadas,
  type CondicaoCatalogo,
} from "@/lib/condicoes";
import { EFEITO_COR_PADRAO, estiloAplicado } from "@/lib/estilos-cor";
import { lerMecanica } from "@/lib/condicoes-mecanica";
import { nomeDoEfeito, resumoEfeito } from "@/lib/op-rpg";
import { Tooltip } from "@/components/tooltip";

// Condições do narrador da mesa (Biblioteca); sem provider valem as do livro.
const CatalogoCondicoesContext = createContext<CondicaoCatalogo[]>(CATALOGO_CONDICOES_PADRAO);

export function CatalogoCondicoesProvider({
  condicoes,
  children,
}: {
  condicoes: CondicaoCatalogo[];
  children: React.ReactNode;
}) {
  return <CatalogoCondicoesContext.Provider value={condicoes}>{children}</CatalogoCondicoesContext.Provider>;
}

// Nomes das condições, na ordem do catálogo.
export function useCatalogoCondicoes(): string[] {
  const catalogo = useContext(CatalogoCondicoesContext);
  return useMemo(() => catalogo.map((c) => c.nome), [catalogo]);
}

// Cara do chip de uma condição: o estilo da Biblioteca ou, fora dela, a cor fixa do nome.
export function useEstiloCondicao() {
  const catalogo = useContext(CatalogoCondicoesContext);
  return (nome: string) => {
    const entrada = condicaoNoCatalogo(catalogo, nome);
    const cor = entrada?.cor ?? corDaCondicao(nome);
    const { className, style } = estiloAplicado(
      {
        cor,
        cor2: entrada?.cor2 ?? null,
        efeito: entrada?.efeito ?? EFEITO_COR_PADRAO,
      },
      "chip",
    );
    return { className, style, cor, descricao: entrada?.descricao ?? "" };
  };
}

// Condição valendo em alguém: o nome com a cara dela e as rodadas que faltam.
// `children` são os botões de quem pode mexer nela (tirar, repetir a salvaguarda).
// Sem descrição na Biblioteca (a que uma técnica põe), o tooltip lista os
// efeitos dela (`mecanica`) e quanto ela vale (`uso`, `fimDoTurno`).
export function ChipCondicao({
  nome,
  rodadas,
  origem,
  mecanica,
  uso,
  fimDoTurno,
  children,
}: {
  nome: string;
  rodadas?: number;
  origem?: string;
  mecanica?: unknown;
  uso?: "proxima";
  fimDoTurno?: boolean;
  children?: React.ReactNode;
}) {
  const cara = useEstiloCondicao()(nome);
  const falta = uso
    ? "Próxima rolagem"
    : fimDoTurno
      ? "Até o fim do turno dele"
      : rodadas
        ? rodadas >= RODADAS_MAX
          ? "Até tirar"
          : `Falta ${textoRodadas(rodadas)}`
        : "";
  const efeitos = cara.descricao ? [] : (lerMecanica(mecanica)?.efeitos ?? []);
  return (
    <Tooltip
      cor={cara.cor}
      icone="fa-triangle-exclamation"
      titulo={nome}
      selo={falta || undefined}
      texto={[
        cara.descricao,
        ...efeitos.map((e) => `${nomeDoEfeito(e)}: ${resumoEfeito(e)}`),
        uso && "Some na primeira rolagem em que vale.",
        fimDoTurno && "Acaba no fim do próximo turno de quem está com ela.",
        origem && `De ${origem}`,
      ]}
    >
      <span className={`condicao-chip ${cara.className}`} style={cara.style} tabIndex={0}>
        <span className="fx-texto">{nome}</span>
        {rodadas != null && (
          <span className="condicao-chip-rodadas">{rodadas >= RODADAS_MAX ? "∞" : rodadas}</span>
        )}
        {children}
      </span>
    </Tooltip>
  );
}
