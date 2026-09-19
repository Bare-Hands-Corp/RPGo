"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { EditableStat } from "./editable-stat";

type PatchVitais = {
  hpAtual?: number;
  hpTemp?: number;
  ppAtual?: number;
};

type Props = {
  personagemId: string;
  hpAtual: number;
  hpTemp: number;
  hpMax: number;
  ppAtual: number;
  ppMax: number;
  cr: number;
  exaustao: number;
  // Bloco da sidebar observado; a faixa só aparece quando ele sai por cima.
  ancora: RefObject<HTMLElement | null>;
  onOtimista: (patch: PatchVitais) => void;
};

const ALTURA = 46;

export function FaixaVitais({
  personagemId,
  hpAtual,
  hpTemp,
  hpMax,
  ppAtual,
  ppMax,
  cr,
  exaustao,
  ancora,
  onOtimista,
}: Props) {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const alvo = ancora.current;
    if (!alvo) return;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        setVisivel(!entrada.isIntersecting && entrada.boundingClientRect.top < ALTURA);
      },
      { rootMargin: `-${ALTURA}px 0px 0px 0px` },
    );
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [ancora]);

  if (!visivel) return null;

  // Mesmo denominador da barra da sidebar.
  const totalVisivel = Math.max(hpMax, hpAtual + hpTemp, 1);
  const hpPct = (Math.max(0, hpAtual) / totalVisivel) * 100;
  const tempPct = (Math.max(0, hpTemp) / totalVisivel) * 100;

  function voltarAoTopo() {
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: suave ? "smooth" : "auto" });
  }

  return createPortal(
    <div className="faixa-vitais">
      <div className="faixa-vitais-conteudo">
        <span className="faixa-vital faixa-vital-hp">
          <i className="fas fa-heart" title="Vida" />
          <EditableStat
            personagemId={personagemId}
            campo="hpAtual"
            valor={hpAtual}
            max={hpMax}
            onOtimista={(novo) => onOtimista({ hpAtual: novo })}
          />
          <span className="faixa-vital-max">/{hpMax}</span>
          {hpTemp > 0 && (
            <span className="faixa-vital-temp" title="Vida temporária">
              +
              <EditableStat
                personagemId={personagemId}
                campo="hpTemp"
                valor={hpTemp}
                onOtimista={(novo) => onOtimista({ hpTemp: novo })}
              />
            </span>
          )}
        </span>

        <span className="faixa-vital faixa-vital-pp">
          <i className="fas fa-bolt" title="Pontos de Poder" />
          <EditableStat
            personagemId={personagemId}
            campo="ppAtual"
            valor={ppAtual}
            max={ppMax}
            onOtimista={(novo) => onOtimista({ ppAtual: novo })}
          />
          <span className="faixa-vital-max">/{ppMax}</span>
        </span>

        <span className="faixa-vital faixa-vital-cr" title="Classe de Resistência">
          <i className="fas fa-shield-alt" />
          {cr}
        </span>

        {exaustao > 0 && (
          <span className="faixa-vital faixa-vital-exausto" title="Exaustão">
            <i className="fas fa-bed" />
            {exaustao}
          </span>
        )}

        <button
          type="button"
          className="faixa-vitais-topo"
          onClick={voltarAoTopo}
          title="Voltar ao topo da ficha"
          aria-label="Voltar ao topo da ficha"
        >
          <i className="fas fa-chevron-up" />
        </button>
      </div>
      <div className="faixa-vitais-trilho">
        <div className="faixa-vitais-fio" style={{ width: `${hpPct}%` }} />
        <div className="faixa-vitais-fio-temp" style={{ width: `${tempPct}%` }} />
      </div>
    </div>,
    document.body,
  );
}
