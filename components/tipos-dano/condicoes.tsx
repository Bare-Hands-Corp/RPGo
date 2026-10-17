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
export function ChipCondicao({
  nome,
  rodadas,
  origem,
  children,
}: {
  nome: string;
  rodadas?: number;
  origem?: string;
  children?: React.ReactNode;
}) {
  const cara = useEstiloCondicao()(nome);
  const falta = rodadas ? (rodadas >= RODADAS_MAX ? "Até tirar" : `Falta ${textoRodadas(rodadas)}`) : "";
  return (
    <Tooltip
      cor={cara.cor}
      icone="fa-triangle-exclamation"
      titulo={nome}
      selo={falta || undefined}
      texto={[cara.descricao, origem && `De ${origem}`]}
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
