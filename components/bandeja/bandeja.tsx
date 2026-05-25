"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { PainelRolador } from "./painel-rolador";
import { PainelChat, type PainelChatHandle } from "./painel-chat";
import type { MensagemSerializada } from "./actions";
import "./bandeja.css";

type Props = {
  userId: string;
  userName: string;
  sessionId: string;
  personagemId?: string | null;
  // Pré-carregadas no SSR — passadas direto pro PainelChat como estado inicial.
  mensagensIniciais: MensagemSerializada[];
};

type Aba = "rolador" | "chat";
type Dock = "bottom" | "side-left" | "side-right" | "float";

const SNAP_THRESHOLD = 80;
const DRAG_THRESHOLD = 5;
const MARGIN = 20;
const BANDEJA_W = 320;

export function Bandeja({
  userId,
  userName,
  sessionId,
  personagemId,
  mensagensIniciais,
}: Props) {
  const bandejaRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<PainelChatHandle>(null);

  const [aba, setAba] = useState<Aba>("rolador");
  const [collapsed, setCollapsed] = useState(true);
  const [dock, setDock] = useState<Dock>("bottom");
  // x relevante quando dock === "float" ou "bottom"; y quando "float" ou "side-*".
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Estado de arrasto fica num ref — mousemove não re-renderiza.
  const dragRef = useRef({
    dragging: false,
    hasMoved: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
  });

  useEffect(() => {
    const bandeja = bandejaRef.current;
    const header = headerRef.current;
    if (!bandeja || !header) return;

    function onMouseDown(e: MouseEvent) {
      if ((e.target as HTMLElement).closest(".switch-btn")) return;
      const rect = bandeja!.getBoundingClientRect();
      dragRef.current = {
        dragging: true,
        hasMoved: false,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: rect.left,
        startTop: rect.top,
      };
    }

    function onMouseMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d.dragging) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;

      if (!d.hasMoved) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        d.hasMoved = true;
        // Inline style sobrepõe a posição do dock atual. Sem transição —
        // o movimento segue o mouse direto. O dock só muda no mouseup.
        bandeja!.style.transition = "none";
        bandeja!.style.left = `${d.startLeft}px`;
        bandeja!.style.top = `${d.startTop}px`;
        bandeja!.style.right = "auto";
        bandeja!.style.bottom = "auto";
      }

      const W = window.innerWidth;
      const H = window.innerHeight;
      const newLeft = Math.max(0, Math.min(d.startLeft + dx, W - bandeja!.offsetWidth));
      const newTop = Math.max(0, Math.min(d.startTop + dy, H - bandeja!.offsetHeight));
      bandeja!.style.left = `${newLeft}px`;
      bandeja!.style.top = `${newTop}px`;
    }

    function onMouseUp() {
      const d = dragRef.current;
      if (!d.dragging) return;
      d.dragging = false;
      bandeja!.style.transition = "";

      if (d.hasMoved) {
        snap();
      }
    }

    function snap() {
      const rect = bandeja!.getBoundingClientRect();
      const W = window.innerWidth;
      const H = window.innerHeight;
      const distLeft = rect.left;
      const distRight = W - (rect.left + rect.width);
      const distBottom = H - (rect.top + rect.height);

      // Limpa overrides inline — vão ser substituídos pelo style derivado do state.
      bandeja!.style.left = "";
      bandeja!.style.top = "";
      bandeja!.style.right = "";
      bandeja!.style.bottom = "";

      if (distBottom < SNAP_THRESHOLD) {
        setDock("bottom");
        setCollapsed(true);
        setPos({ x: Math.max(0, Math.min(rect.left, W - BANDEJA_W)), y: 0 });
      } else if (distLeft < SNAP_THRESHOLD) {
        setDock("side-left");
        setCollapsed(true);
        setPos({ x: 0, y: Math.max(MARGIN, Math.min(rect.top, H - 100)) });
      } else if (distRight < SNAP_THRESHOLD) {
        setDock("side-right");
        setCollapsed(true);
        setPos({ x: 0, y: Math.max(MARGIN, Math.min(rect.top, H - 100)) });
      } else {
        let finalLeft = rect.left;
        if (finalLeft + BANDEJA_W > W) finalLeft = W - BANDEJA_W - MARGIN;
        setDock("float");
        setPos({
          x: Math.max(MARGIN, finalLeft),
          y: Math.max(MARGIN, Math.min(rect.top, H - 200)),
        });
      }
    }

    function onHeaderClick(e: MouseEvent) {
      if ((e.target as HTMLElement).closest(".switch-btn")) return;
      if (dragRef.current.hasMoved) return;
      setCollapsed((c) => !c);
    }

    header.addEventListener("mousedown", onMouseDown);
    header.addEventListener("click", onHeaderClick);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      header.removeEventListener("mousedown", onMouseDown);
      header.removeEventListener("click", onHeaderClick);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const className =
    "bandeja " + `dock-${dock}` + (collapsed ? " collapsed" : "");

  const style: CSSProperties = {};
  if (dock === "float") {
    style.left = pos.x;
    style.top = pos.y;
  } else if (dock === "side-left") {
    style.top = pos.y;
  } else if (dock === "side-right") {
    style.top = pos.y;
  } else if (dock === "bottom") {
    if (pos.x > 0) style.left = pos.x;
  }

  function iconeHeader(): string {
    const isSide = dock === "side-left" || dock === "side-right";
    if (isSide && collapsed) {
      return aba === "chat" ? "fas fa-comment" : "fas fa-dice-d20";
    }
    if (!collapsed) {
      return dock === "bottom" ? "fas fa-chevron-down" : "fas fa-times";
    }
    return "fas fa-chevron-up";
  }

  const onMensagemCriada = useCallback((msg: MensagemSerializada) => {
    chatRef.current?.appendLocal(msg);
  }, []);

  return (
    <div ref={bandejaRef} className={className} style={style} id="bandeja">
      <div ref={headerRef} className="bandeja-header">
        <div className="header-left">
          <i className={aba === "rolador" ? "fas fa-dice-d20" : "fas fa-comment"} />
          <span className="bandeja-titulo">{aba === "rolador" ? "Rolador" : "Chat"}</span>
        </div>
        <i className={iconeHeader()} />
      </div>

      <div className="bandeja-body">
        <div className="bandeja-switch">
          <button
            type="button"
            className={"switch-btn" + (aba === "rolador" ? " active" : "")}
            onClick={(e) => {
              e.stopPropagation();
              setAba("rolador");
            }}
          >
            <i className="fas fa-dice-d20" /> Rolador
          </button>
          <button
            type="button"
            className={"switch-btn" + (aba === "chat" ? " active" : "")}
            onClick={(e) => {
              e.stopPropagation();
              setAba("chat");
            }}
          >
            <i className="fas fa-comment" /> Chat
          </button>
        </div>

        <div
          className={"painel-bandeja" + (aba === "rolador" ? " active" : "")}
          style={{ display: aba === "rolador" ? "flex" : "none" }}
        >
          <PainelRolador
            userId={userId}
            userName={userName}
            sessionId={sessionId}
            personagemId={personagemId || null}
            onMensagemCriada={onMensagemCriada}
          />
        </div>

        <div
          className={"painel-bandeja" + (aba === "chat" ? " active" : "")}
          style={{ display: aba === "chat" ? "flex" : "none" }}
        >
          <PainelChat
            ref={chatRef}
            userId={userId}
            userName={userName}
            sessionId={sessionId}
            mensagensIniciais={mensagensIniciais}
          />
        </div>
      </div>
    </div>
  );
}
