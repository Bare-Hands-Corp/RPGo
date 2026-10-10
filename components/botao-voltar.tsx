"use client";

import { useRouter } from "next/navigation";

type Props = {
  // Pra onde ir quando não há histórico de navegação pra voltar (ex: aba
  // aberta direto num link, refresh na página) — mesmo destino fixo de antes.
  fallbackHref: string;
  className?: string;
  title?: string;
  children?: React.ReactNode;
};

// Volta pra página anterior de fato (histórico do navegador) em vez de sempre
// levar pra um destino fixo — evita o "efeito ioiô" de sair do Narrador,
// testar algo no Calendário e cair direto no Dashboard ao voltar.
export function BotaoVoltar({ fallbackHref, className, title, children }: Props) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className}
      title={title}
      style={{ font: "inherit", textDecoration: "none" }}
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
    >
      {children}
    </button>
  );
}
