"use client";

import { forwardRef, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Logo } from "@/components/marca/logo";
import "./carta.css";

// Carta no formato de jogo de cartas (proporção 5:7) para técnicas, ações,
// habilidades e itens. Cada tipo é convertido para este modelo comum.
export type Raridade = "comum" | "raro" | "lendario";

export type ModeloCarta = {
  titulo: string;
  subtitulo?: string;
  faixa: string; // rótulo da faixa central: "TÉCNICA", "REAÇÃO", "ARMA"...
  cor: string; // cor do banner e da faixa
  icone: ReactNode; // símbolo do banner e, sem arte, o ícone grande
  corIcone?: string; // cor do ícone grande (ex.: a do tipo de dano); sem ela, a da carta
  nivel?: number | string; // número grande do banner
  custo?: { valor: number | string; simbolo: string; titulo?: string };
  arte?: string; // URL de imagem; sem ela, a arte vira um padrão com o ícone
  linhaInfo?: { rotulo: string; valor: string }[]; // "ALCANCE: 9 m"
  corpo: ReactNode;
  rodape?: string;
  raridade?: Raridade;
  gasta?: { motivo: string }; // uso por descanso já consumido
};

type Props = {
  carta: ModeloCarta;
  virada?: boolean;
  interativa?: boolean; // tilt + brilho holográfico seguindo o ponteiro
  className?: string;
  style?: CSSProperties;
  // Chips da descrição: "carta" (palavra-chave impressa, padrão) ou "ficha" (as cápsulas da ficha).
  chips?: "carta" | "ficha";
};

export const Carta = forwardRef<HTMLDivElement, Props>(function Carta(
  { carta, virada = false, interativa = false, className = "", style, chips = "carta" },
  refFrente,
) {
  const refCena = useRef<HTMLDivElement>(null);
  const refConteudo = useRef<HTMLDivElement>(null);
  const raridade = carta.raridade ?? "comum";

  // Texto longo: diminui a letra do corpo até caber (mínimo 60%); se ainda
  // não couber, o fim esmaece (.carta-transborda).
  useLayoutEffect(() => {
    const el = refConteudo.current;
    if (!el) return;
    const frente = el.parentElement;
    let escala = 1;
    el.style.setProperty("--corpo-escala", "1");
    frente?.classList.remove("carta-compacta");
    const transborda = () => el.scrollHeight > el.clientHeight + 1;
    // Primeiro a arte encolhe; depois a letra.
    if (transborda()) frente?.classList.add("carta-compacta");
    while (el.scrollHeight > el.clientHeight + 1 && escala > 0.62) {
      escala -= 0.04;
      el.style.setProperty("--corpo-escala", String(escala));
    }
    el.classList.toggle("carta-transborda", el.scrollHeight > el.clientHeight + 1);
    // `chips` muda o tamanho do texto e a classe da frente (o React reescreve ela).
  }, [carta, chips]);

  function mover(e: React.PointerEvent) {
    const el = refCena.current;
    if (!el || !interativa) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width; // 0..1
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - y) * 18}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 22}deg`);
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
    el.style.setProperty("--brilho", "1");
  }
  function sair() {
    const el = refCena.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--brilho", "0");
  }

  return (
    <div
      ref={refCena}
      className={`carta-cena ${interativa ? "carta-interativa" : ""} ${className}`}
      style={
        { ...style, "--cor-carta": carta.cor, "--cor-icone": carta.corIcone ?? carta.cor } as CSSProperties
      }
      onPointerMove={mover}
      onPointerLeave={sair}
    >
      <div className={`carta-3d ${virada ? "carta-virada" : ""}`}>
        <div ref={refFrente} className={`carta-face carta-frente carta-${raridade} ${carta.gasta ? "carta-gasta" : ""} ${
            chips === "carta" ? "carta-chips-carta" : ""
          }`}>
          <div className="carta-arte">
            {carta.arte ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={carta.arte} alt="" crossOrigin="anonymous" />
            ) : (
              <div className="carta-arte-padrao">
                <div className="carta-arte-icone">{carta.icone}</div>
              </div>
            )}
          </div>

          <div className="carta-banner">
            {carta.nivel != null && <span className="carta-banner-nivel">{carta.nivel}</span>}
            <span className="carta-banner-icone">{carta.icone}</span>
          </div>

          {carta.custo && (
            <div className="carta-custo" title={carta.custo.titulo}>
              <span>{carta.custo.valor}</span>
              <small>{carta.custo.simbolo}</small>
            </div>
          )}

          <div className="carta-faixa">
            <span>{carta.faixa}</span>
          </div>

          <div ref={refConteudo} className="carta-conteudo">
            <h3 className="carta-titulo">{carta.titulo}</h3>
            {carta.subtitulo && <p className="carta-subtitulo">{carta.subtitulo}</p>}
            {carta.linhaInfo && carta.linhaInfo.length > 0 && (
              <div className="carta-info">
                {carta.linhaInfo.map((i) => (
                  <span key={i.rotulo}>
                    <b>{i.rotulo}</b> {i.valor}
                  </span>
                ))}
              </div>
            )}
            <div className="carta-corpo">{carta.corpo}</div>
          </div>

          {carta.rodape && <div className="carta-rodape">{carta.rodape}</div>}

          {carta.gasta && (
            <div className="carta-selo-gasta">
              <strong>GASTA</strong>
              <span>{carta.gasta.motivo}</span>
            </div>
          )}

          <div className="carta-foil" aria-hidden />
          <div className="carta-reflexo" aria-hidden />
        </div>

        {/* Verso: a marca Handrolls (components/marca). */}
        <div className="carta-face carta-verso" aria-hidden>
          <div className="carta-verso-moldura">
            {(["se", "sd", "ie", "id"] as const).map((canto) => (
              <Logo key={canto} variante="mono" titulo="" tamanho="1.3em" className={`carta-verso-canto carta-verso-${canto}`} />
            ))}
            <div className="carta-verso-selo">
              <Logo variante="icone" titulo="" tamanho="100%" />
            </div>
            <Logo variante="completo" titulo="" tamanho="1.45em" className="carta-verso-nome" />
          </div>
        </div>
      </div>
    </div>
  );
});
