"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Seletor de cor próprio no lugar do <input type="color">, que no Windows abre
// o diálogo nativo (cara de Paint 98). Quadrado de saturação/brilho + barra de
// matiz + campo hex, num popover que segue o tema (--bg-card, --border...).
// O popover vai num portal com posição fixa: dentro de modal com scroll ele
// seria cortado. Abre embaixo do botão e vira pra cima se não couber.

const LARGURA_POPOVER = 224;
const MARGEM_TELA = 8;

type Hsv = { h: number; s: number; v: number };

function hexParaHsv(hex: string): Hsv | null {
  const v = hex.trim().replace("#", "");
  const full = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvParaHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

const limitar = (n: number) => Math.max(0, Math.min(1, n));

// Arrasto com pointer capture: chama `mover` com a posição relativa (0..1).
function arrastar(mover: (x: number, y: number) => void) {
  function aplicar(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    mover(limitar((e.clientX - r.left) / r.width), limitar((e.clientY - r.top) / r.height));
  }

  return {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      aplicar(e);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) aplicar(e);
    },
  };
}

export function SeletorCor({
  valor,
  onChange,
  rotulo = "Escolher cor",
  amostras,
}: {
  /** Hex (#rrggbb). */
  valor: string;
  onChange: (hex: string) => void;
  rotulo?: string;
  /** Atalhos de cor mostrados no popover (ex.: as outras cores do tema). */
  amostras?: string[];
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null);

  // HSV local: guarda matiz/saturação mesmo quando a cor fica preta/cinza
  // (hex sozinho perde a matiz e a bolinha pularia pro vermelho).
  const [hsv, setHsv] = useState<Hsv>(() => hexParaHsv(valor) ?? { h: 0, s: 0, v: 0 });
  const [hexTexto, setHexTexto] = useState(valor);
  const [valorVisto, setValorVisto] = useState(valor);

  // Sincroniza quando a cor muda por fora (swatch, outro campo...) — ajuste
  // durante o render; ignora o eco da própria cor que acabamos de emitir.
  if (valor !== valorVisto) {
    setValorVisto(valor);
    if (valor.toLowerCase() !== hsvParaHex(hsv)) {
      const novo = hexParaHsv(valor);
      if (novo) setHsv(novo);
      setHexTexto(valor);
    }
  }

  // Posiciona o popover (e reposiciona em scroll/resize, ex.: modal rolando).
  // Roda antes do paint, então reabrir não mostra a posição antiga.
  useLayoutEffect(() => {
    if (!aberto) return;
    function posicionar() {
      const botao = raiz.current?.getBoundingClientRect();
      if (!botao) return;
      const altura = popover.current?.offsetHeight ?? 260;
      let top = botao.bottom + 6;
      if (top + altura > window.innerHeight - MARGEM_TELA && botao.top - altura - 6 > MARGEM_TELA) {
        top = botao.top - altura - 6;
      }
      const left = Math.min(
        Math.max(MARGEM_TELA, botao.left),
        window.innerWidth - LARGURA_POPOVER - MARGEM_TELA,
      );
      setPosicao({ top, left });
    }
    posicionar();
    // 2ª passada: agora o popover existe e tem altura real.
    const quadro = requestAnimationFrame(posicionar);
    window.addEventListener("resize", posicionar);
    window.addEventListener("scroll", posicionar, true);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("resize", posicionar);
      window.removeEventListener("scroll", posicionar, true);
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: PointerEvent) {
      const alvo = e.target as Node;
      if (!raiz.current?.contains(alvo) && !popover.current?.contains(alvo)) setAberto(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAberto(false);
      }
    }
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc, true);
    };
  }, [aberto]);

  function emitir(proximo: Hsv) {
    setHsv(proximo);
    const hex = hsvParaHex(proximo);
    setHexTexto(hex);
    onChange(hex);
  }

  const quadrado = arrastar((x, y) => emitir({ ...hsv, s: x, v: 1 - y }));
  const matiz = arrastar((x) => emitir({ ...hsv, h: x * 360 }));

  function digitarHex(texto: string) {
    setHexTexto(texto);
    const limpo = texto.trim().startsWith("#") ? texto.trim() : `#${texto.trim()}`;
    const novo = hexParaHsv(limpo);
    if (!novo || !/^#[0-9a-f]{6}$/i.test(limpo)) return;
    setHsv(novo);
    onChange(limpo.toLowerCase());
  }

  const corAtual = hsvParaHex(hsv);
  const corMatiz = hsvParaHex({ h: hsv.h, s: 1, v: 1 });
  const atalhos = [...new Set((amostras ?? []).map((c) => c.toLowerCase()))].filter((c) =>
    /^#[0-9a-f]{6}$/.test(c),
  );

  function escolherAmostra(hex: string) {
    const novo = hexParaHsv(hex);
    if (!novo) return;
    setHsv(novo);
    setHexTexto(hex);
    onChange(hex);
  }

  return (
    <div className="seletor-cor" ref={raiz}>
      <button
        type="button"
        className={`seletor-cor-botao ${aberto ? "aberto" : ""}`}
        style={{ background: valor }}
        onClick={() => setAberto((a) => !a)}
        aria-label={rotulo}
        aria-expanded={aberto}
        title={rotulo}
      >
        <i className="fas fa-eye-dropper" />
      </button>

      {aberto &&
        createPortal(
        <div
          ref={popover}
          className="seletor-cor-popover"
          role="dialog"
          aria-label={rotulo}
          style={{
            top: posicao?.top ?? 0,
            left: posicao?.left ?? 0,
            visibility: posicao ? "visible" : "hidden",
          }}
        >
          <div
            className="seletor-cor-sv"
            style={{ backgroundColor: corMatiz }}
            {...quadrado}
          >
            <span
              className="seletor-cor-cursor"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: corAtual }}
            />
          </div>

          <div className="seletor-cor-matiz" {...matiz}>
            <span
              className="seletor-cor-cursor seletor-cor-cursor-barra"
              style={{ left: `${(hsv.h / 360) * 100}%`, background: corMatiz }}
            />
          </div>

          <div className="seletor-cor-rodape">
            <span className="seletor-cor-previa" style={{ background: corAtual }} />
            <input
              type="text"
              className="seletor-cor-hex"
              value={hexTexto}
              onChange={(e) => digitarHex(e.target.value)}
              onBlur={() => setHexTexto(corAtual)}
              maxLength={7}
              spellCheck={false}
              aria-label="Código hex"
            />
            <button type="button" className="seletor-cor-ok" onClick={() => setAberto(false)}>
              OK
            </button>
          </div>

          {atalhos.length > 0 && (
            <div className="seletor-cor-amostras" aria-label="Cores do tema">
              {atalhos.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`seletor-cor-amostra ${c === corAtual ? "ativo" : ""}`}
                  style={{ background: c }}
                  title={c}
                  aria-label={`Usar ${c}`}
                  onClick={() => escolherAmostra(c)}
                />
              ))}
            </div>
          )}
        </div>,
          document.body,
        )}
    </div>
  );
}
