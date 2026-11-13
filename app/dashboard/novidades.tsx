"use client";

import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { NOVIDADES, ULTIMA_NOVIDADE, rotuloDaData, urlDaMidia, type ZonaNovidade } from "@/lib/novidades";
import "./novidades.css";

const CHAVE_VISTA = "rpgo:novidades:vista";
// O evento `storage` só vem de outras abas.
const EVENTO = "rpgo:novidades-vista";

function assinar(avisar: () => void) {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

// Sem localStorage, conta como vista: não abre sozinho a cada visita.
function lerVista(): string {
  try {
    return localStorage.getItem(CHAVE_VISTA) ?? "";
  } catch {
    return ULTIMA_NOVIDADE;
  }
}

// Botão do topo do dashboard; abre sozinho quando há atualização que este aparelho não viu.
export function BotaoNovidades() {
  const vista = useSyncExternalStore(assinar, lerVista, () => ULTIMA_NOVIDADE);
  const temNova = vista < ULTIMA_NOVIDADE;
  // null segue o automático.
  const [aberto, setAberto] = useState<boolean | null>(null);
  const mostrando = aberto ?? temNova;

  function fechar() {
    try {
      localStorage.setItem(CHAVE_VISTA, ULTIMA_NOVIDADE);
    } catch {}
    window.dispatchEvent(new Event(EVENTO));
    setAberto(false);
  }

  if (NOVIDADES.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className="btn-novidades"
        title="Novidades"
        aria-label="Novidades"
        onClick={() => setAberto(true)}
      >
        <i className="fas fa-wand-magic-sparkles" />
        {temNova && <span className="btn-novidades-ponto" />}
      </button>
      {mostrando && <ModalNovidades vista={vista} onFechar={fechar} />}
    </>
  );
}

function MiniMapa({ zona, grande }: { zona?: ZonaNovidade; grande?: boolean }) {
  if (!zona) return null;
  return (
    <span className={`novidades-mapa${grande ? " grande" : ""}`} data-zona={zona} aria-hidden>
      <span className="z-lateral" />
      <span className="novidades-mapa-direita">
        <span className="z-topo" />
        <span className="z-conteudo" />
      </span>
      <span className="z-bandeja" />
    </span>
  );
}

function ModalNovidades({ vista, onFechar }: { vista: string; onFechar: () => void }) {
  const [data, setData] = useState(NOVIDADES[0].data);
  const [sel, setSel] = useState(0);
  const [mid, setMid] = useState(0);
  const [menuDatas, setMenuDatas] = useState(false);

  const novidade = NOVIDADES.find((n) => n.data === data) ?? NOVIDADES[0];
  const total = novidade.mudancas.length;
  const mudanca = novidade.mudancas[Math.min(sel, total - 1)];
  const midia = mudanca.midias[mid] ?? mudanca.midias[0];

  function escolher(i: number) {
    setSel((i + total) % total);
    setMid(0);
  }

  function trocarData(d: string) {
    setData(d);
    setSel(0);
    setMid(0);
    setMenuDatas(false);
  }

  useEffect(() => {
    function tecla(ev: KeyboardEvent) {
      if (ev.key === "Escape") onFechar();
      else if (ev.key === "ArrowDown" || ev.key === "ArrowRight") {
        setSel((s) => (s + 1) % total);
        setMid(0);
      } else if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") {
        setSel((s) => (s - 1 + total) % total);
        setMid(0);
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar, total]);

  // Vai pro body, fora do cabeçalho do dashboard.
  return createPortal(
    <div className="modal-overlay-mesa modal-overlay-novidades" onClick={onFechar}>
      <div
        className="novidades-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Novidades"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="novidades-topo">
          <i className="fas fa-wand-magic-sparkles novidades-icone" />
          <h2>Novidades</h2>
          <div className="novidades-datas">
            <button
              type="button"
              className="novidades-data"
              aria-expanded={menuDatas}
              onClick={() => setMenuDatas((v) => !v)}
            >
              {rotuloDaData(data)}
              <i className="fas fa-chevron-down" />
            </button>
            {menuDatas && (
              <div className="novidades-datas-menu">
                {NOVIDADES.map((n) => (
                  <button
                    key={n.data}
                    type="button"
                    className={n.data === data ? "ativo" : undefined}
                    onClick={() => trocarData(n.data)}
                  >
                    <span>{rotuloDaData(n.data, true)}</span>
                    <small>{n.mudancas.length}</small>
                    {n.data > vista && <span className="novidades-nova" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="modal-close-btn" onClick={onFechar} aria-label="Fechar">
            <i className="fas fa-xmark" />
          </button>
        </div>

        <div className="novidades-corpo">
          <div className="novidades-lista">
            {novidade.mudancas.map((m, i) => (
              <Fragment key={`${novidade.data}-${i}`}>
                {m.topico !== novidade.mudancas[i - 1]?.topico && (
                  <span className="novidades-topico">{m.topico}</span>
                )}
                <button
                  type="button"
                  className={`novidades-item${m === mudanca ? " ativo" : ""}`}
                  data-tela={m.tela}
                  title={m.titulo}
                  onClick={() => escolher(i)}
                >
                  <span className="novidades-miniatura">
                    {m.midias[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urlDaMidia(novidade.data, m.midias[0])} alt="" loading="lazy" />
                    ) : (
                      <i className="fas fa-wand-magic-sparkles" />
                    )}
                  </span>
                  <span className="novidades-item-texto">
                    <strong>{m.titulo}</strong>
                    <small>{m.trilha.join(" › ")}</small>
                  </span>
                </button>
              </Fragment>
            ))}
          </div>

          <div className="novidades-palco">
            <div className="novidades-onde">
              <MiniMapa zona={mudanca.zona} />
              <div className="novidades-trilha">
                {mudanca.trilha.map((parte, i) => (
                  <Fragment key={i}>
                    {i > 0 && <i className="fas fa-chevron-right" aria-hidden />}
                    <span className={i === mudanca.trilha.length - 1 ? "atual" : undefined}>{parte}</span>
                  </Fragment>
                ))}
              </div>
            </div>

            <div className="novidades-texto">
              <h3>{mudanca.titulo}</h3>
              {mudanca.texto && <p>{mudanca.texto}</p>}
            </div>

            <div className={`novidades-midia${midia ? "" : " vazia"}`}>
              {midia ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={midia} src={urlDaMidia(novidade.data, midia)} alt={mudanca.titulo} />
              ) : (
                <MiniMapa zona={mudanca.zona} grande />
              )}
            </div>

            <div className="novidades-rodape">
              <div className="novidades-pontos">
                {mudanca.midias.length > 1 &&
                  mudanca.midias.map((arquivo, j) => (
                    <button
                      key={arquivo}
                      type="button"
                      className={j === mid ? "ativo" : undefined}
                      aria-label={`Imagem ${j + 1}`}
                      onClick={() => setMid(j)}
                    >
                      <span />
                    </button>
                  ))}
              </div>
              <div className="novidades-setas">
                <button type="button" aria-label="Anterior" onClick={() => escolher(sel - 1)}>
                  <i className="fas fa-chevron-left" />
                </button>
                <span>
                  {Math.min(sel, total - 1) + 1} / {total}
                </span>
                <button type="button" aria-label="Próxima" onClick={() => escolher(sel + 1)}>
                  <i className="fas fa-chevron-right" />
                </button>
              </div>
              <div />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
