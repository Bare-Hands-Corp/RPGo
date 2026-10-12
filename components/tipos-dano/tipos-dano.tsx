"use client";

import { createContext, useContext, useMemo } from "react";
import { CATALOGO_PADRAO, tipoNoCatalogo, type TipoDanoCatalogo } from "@/lib/tipos-dano";

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

// Ícone do tipo na cor que o narrador deu; nada pra tipo fora do catálogo ou sem ícone.
export function IconeTipoDano({ tipo }: { tipo: string }) {
  const entrada = tipoNoCatalogo(useContext(CatalogoTiposContext), tipo);
  if (!entrada?.icone) return null;
  return <i className={`fas ${entrada.icone}`} style={entrada.cor ? { color: entrada.cor } : undefined} aria-hidden />;
}
