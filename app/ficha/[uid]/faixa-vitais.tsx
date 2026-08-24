"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { EditableStat } from "./editable-stat";

// Patch que a faixa sabe emitir — subconjunto do patch otimista da sidebar.
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
  // Bloco da sidebar observado (o de Pontos de Poder, último dos dois vitais).
  // Enquanto ele estiver em vista os mesmos números já estão na tela, então a
  // faixa fica fora do caminho — sidebar e faixa nunca são lidas juntas.
  ancora: RefObject<HTMLElement | null>;
  onOtimista: (patch: PatchVitais) => void;
};

// Altura da faixa. Entra no rootMargin pra âncora contar como "fora de vista"
// já ao passar por baixo dela, e não só ao cruzar o topo da viewport.
const ALTURA = 46;

// Faixa condensada com PV/PE/CR grudada no topo, visível só depois que a
// sidebar sai de vista. É o que mantém os números da sessão à mão no celular,
// onde a sidebar empilha acima do conteúdo e some na primeira rolagem.
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
        // Só aparece quando a âncora saiu POR CIMA. Se ela está abaixo da
        // viewport, a sidebar ainda vai ser lida e não há o que repetir.
        setVisivel(!entrada.isIntersecting && entrada.boundingClientRect.top < ALTURA);
      },
      { rootMargin: `-${ALTURA}px 0px 0px 0px` },
    );
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [ancora]);

  if (!visivel) return null;

  // Mesmo denominador da barra da sidebar: escala quando atual+temp passa do
  // máximo efetivo, mantendo a proporção visual coerente.
  const totalVisivel = Math.max(hpMax, hpAtual + hpTemp, 1);
  const hpPct = (Math.max(0, hpAtual) / totalVisivel) * 100;

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
      </div>
    </div>,
    document.body,
  );
}
