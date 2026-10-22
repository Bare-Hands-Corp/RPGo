"use client";

import { createContext, useContext, useMemo } from "react";
import { CATALOGO_PADRAO, tipoNoCatalogo, type TipoDanoCatalogo } from "@/lib/tipos-dano";
import { estiloAplicado } from "@/lib/estilos-cor";

// Catálogo do narrador da mesa; sem provider valem os tipos do livro.
const CatalogoTiposContext = createContext<TipoDanoCatalogo[]>(CATALOGO_PADRAO);

export function CatalogoTiposProvider({
  tipos,
  children,
}: {
  tipos: TipoDanoCatalogo[];
  children: React.ReactNode;
}) {
  return <CatalogoTiposContext.Provider value={tipos}>{children}</CatalogoTiposContext.Provider>;
}

// Nomes dos tipos, na ordem do catálogo.
export function useCatalogoTipos(): string[] {
  const catalogo = useContext(CatalogoTiposContext);
  return useMemo(() => catalogo.map((t) => t.nome), [catalogo]);
}

// O catálogo inteiro (cor, ícone, efeito), pra quem monta a cara do chip por conta própria.
export function useCatalogoTiposCompleto(): TipoDanoCatalogo[] {
  return useContext(CatalogoTiposContext);
}

// Ícone do tipo na cor que o narrador deu; nada pra tipo fora do catálogo ou sem ícone.
export function IconeTipoDano({ tipo }: { tipo: string }) {
  const entrada = tipoNoCatalogo(useContext(CatalogoTiposContext), tipo);
  if (!entrada?.icone) return null;
  return <i className={`fas ${entrada.icone}`} style={entrada.cor ? { color: entrada.cor } : undefined} aria-hidden />;
}

// Cara do chip de um tipo: a cor, o brilho e o ícone escolhidos na Biblioteca.
// Tipo fora do catálogo, ou sem cor, fica com o chip comum.
export function useEstiloTipoDano() {
  const catalogo = useContext(CatalogoTiposContext);
  return (tipo: string) => {
    const entrada = tipoNoCatalogo(catalogo, tipo);
    if (!entrada) return undefined;
    const { className, style } = estiloAplicado(
      { cor: entrada.cor, cor2: entrada.cor2, efeito: entrada.efeito },
      "chip",
    );
    return { className, style, icone: entrada.icone };
  };
}
