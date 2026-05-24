"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PainelRolador } from "./painel-rolador";
import { PainelChat, type PainelChatHandle } from "./painel-chat";
import type { MensagemSerializada } from "./actions";
import "./bandeja.css";

type Props = {
  userId: string;
  userName: string;
  sessionId: string;
  personagemId?: string | null;
};

type Aba = "rolador" | "chat";
type Dock = "bottom" | "side" | "float";

export function Bandeja({ userId, userName, sessionId, personagemId }: Props) {
  const bandejaRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<PainelChatHandle>(null);

  const [aba, setAba] = useState<Aba>("rolador");
  const [collapsed, setCollapsed] = useState(true);
  const [dock, setDock] = useState<Dock>("bottom");

  // ─── Drag & snap ────────────────────────────────────────────
  useEffect(() => {
    const bandeja = bandejaRef.current;
    const header = headerRef.current;
    if (!bandeja || !header) return;

    let dragging = false;
    let hasMoved = false;
    let dragStart = 0;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    function onMouseDown(e: MouseEvent) {
      if ((e.target as HTMLElement).closest(".switch-btn")) return;
      dragging = true;
      hasMoved = false;
      dragStart = Date.now();
      startX = e.clientX;
      startY = e.clientY;
      const rect = bandeja!.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      header!.style.cursor = "grabbing";
    }

    function onMouseMove(e: MouseEvent) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!hasMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        hasMoved = true;
        const isCollapsed = bandeja!.classList.contains("collapsed");
        bandeja!.classList.remove("dock-bottom", "dock-side");
        bandeja!.style.transition = isCollapsed
          ? "width 0.3s ease, height 0.3s ease, border-radius 0.3s ease"
          : "none";
        bandeja!.style.left = `${initialLeft}px`;
        bandeja!.style.top = `${initialTop}px`;
        bandeja!.style.bottom = "auto";
        bandeja!.style.right = "auto";
      }

      if (hasMoved) {
        const W = window.innerWidth;
        const H = window.innerHeight;
        const newLeft = Math.max(0, Math.min(initialLeft + dx, W - bandeja!.offsetWidth));
        const newTop = Math.max(0, Math.min(initialTop + dy, H - bandeja!.offsetHeight));
        bandeja!.style.left = `${newLeft}px`;
        bandeja!.style.top = `${newTop}px`;
        bandeja!.style.bottom = "auto";
        bandeja!.style.right = "auto";
      }
    }

    function onMouseUp() {
      if (!dragging) return;
      dragging = false;
      header!.style.cursor = "grab";
      bandeja!.style.transition = "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)";
      if (hasMoved) {
        snap();
        setTimeout(() => {
          hasMoved = false;
        }, 50);
      }
    }

    function onHeaderClick(e: MouseEvent) {
      if ((e.target as HTMLElement).closest(".switch-btn")) return;
      const dur = Date.now() - dragStart;
      if (hasMoved || dur >= 200) return;
      toggleOpen();
    }

    function toggleOpen() {
      const willOpen = bandeja!.classList.contains("collapsed");
      const isFloating =
        !bandeja!.classList.contains("dock-bottom") &&
        !bandeja!.classList.contains("dock-side");
      const body = bandeja!.querySelector(".bandeja-body") as HTMLElement | null;

      if (willOpen) {
        const rect = bandeja!.getBoundingClientRect();
        const startH = bandeja!.offsetHeight;
        const startW = bandeja!.offsetWidth;

        bandeja!.style.transition = "none";
        bandeja!.classList.remove("collapsed");
        bandeja!.style.height = "auto";
        bandeja!.style.width = "320px";
        bandeja!.style.overflow = "hidden";
        if (body) body.style.overflow = "hidden";

        const targetHeight = bandeja!.scrollHeight;
        const W = window.innerWidth;
        const H = window.innerHeight;

        if (H - rect.top < 350 && rect.bottom > H - rect.top) {
          bandeja!.style.bottom = `${H - rect.bottom}px`;
          bandeja!.style.top = "auto";
        } else {
          bandeja!.style.top = `${rect.top}px`;
          bandeja!.style.bottom = "auto";
        }
        if (isFloating && rect.left + 320 > W) {
          bandeja!.style.left = `${Math.max(0, W - 320 - 10)}px`;
        }

        bandeja!.style.height = `${startH}px`;
        bandeja!.style.width = `${startW}px`;
        void bandeja!.offsetHeight;
        bandeja!.style.transition = "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)";
        bandeja!.style.height = `${targetHeight}px`;
        bandeja!.style.width = "320px";

        setTimeout(() => {
          if (!bandeja!.classList.contains("collapsed")) {
            bandeja!.style.height = "auto";
            bandeja!.style.width = "";
            bandeja!.style.overflow = "";
            if (body) body.style.overflow = "";
          }
        }, 300);

        setCollapsed(false);
      } else {
        bandeja!.style.height = `${bandeja!.offsetHeight}px`;
        bandeja!.style.width = `${bandeja!.offsetWidth}px`;
        bandeja!.style.overflow = "hidden";
        if (body) body.style.overflow = "hidden";

        void bandeja!.offsetHeight;
        bandeja!.classList.add("collapsed");
        bandeja!.style.transition = "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)";

        if (bandeja!.classList.contains("dock-side")) {
          bandeja!.style.height = "50px";
          bandeja!.style.width = "50px";
        } else {
          bandeja!.style.height = "45px";
          bandeja!.style.width = "320px";
        }

        setTimeout(() => {
          if (bandeja!.classList.contains("collapsed")) {
            bandeja!.style.height = "";
            bandeja!.style.width = "";
            bandeja!.style.overflow = "";
            if (body) body.style.overflow = "";
          }
        }, 300);

        setCollapsed(true);
      }
    }

    function snap() {
      const rect = bandeja!.getBoundingClientRect();
      const W = window.innerWidth;
      const H = window.innerHeight;
      const distLeft = rect.left;
      const distRight = W - (rect.left + rect.width);
      const distBottom = H - (rect.top + rect.height);
      const threshold = 80;
      const margin = 20;

      bandeja!.classList.remove("dock-bottom", "dock-side");

      if (distBottom < threshold) {
        bandeja!.classList.add("dock-bottom", "collapsed");
        bandeja!.style.top = `${H - 45}px`;
        bandeja!.style.left = `${Math.max(0, Math.min(rect.left, W - 320))}px`;
        bandeja!.style.bottom = "auto";
        bandeja!.style.right = "auto";
        setTimeout(() => {
          if (bandeja!.classList.contains("dock-bottom") && !dragging) {
            bandeja!.style.top = "auto";
            bandeja!.style.bottom = "0";
          }
        }, 300);
        setDock("bottom");
        setCollapsed(true);
      } else if (distLeft < threshold) {
        bandeja!.classList.add("dock-side", "collapsed");
        bandeja!.style.left = "0";
        bandeja!.style.right = "auto";
        bandeja!.style.bottom = "auto";
        bandeja!.style.top = `${Math.max(margin, Math.min(rect.top, H - 100))}px`;
        setDock("side");
        setCollapsed(true);
      } else if (distRight < threshold) {
        bandeja!.classList.add("dock-side", "collapsed");
        bandeja!.style.right = "0";
        bandeja!.style.left = "auto";
        bandeja!.style.bottom = "auto";
        bandeja!.style.top = `${Math.max(margin, Math.min(rect.top, H - 100))}px`;
        setDock("side");
        setCollapsed(true);
      } else {
        let finalLeft = rect.left;
        if (finalLeft + 320 > W) finalLeft = W - 320 - margin;
        bandeja!.style.left = `${Math.max(margin, finalLeft)}px`;
        bandeja!.style.right = "auto";
        if (rect.top + 400 > H) {
          bandeja!.style.bottom = `${Math.max(margin, H - rect.bottom)}px`;
          bandeja!.style.top = "auto";
        } else {
          bandeja!.style.top = `${rect.top}px`;
          bandeja!.style.bottom = "auto";
        }
        setDock("float");
      }
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

  // Ícone do header — varia com dock + collapsed + aba
  function iconeHeader(): string {
    if (dock === "side" && collapsed) {
      return aba === "chat" ? "fas fa-comment" : "fas fa-dice-d20";
    }
    if (!collapsed) {
      return dock === "bottom" ? "fas fa-chevron-down" : "fas fa-times";
    }
    return "fas fa-chevron-up";
  }

  // Rolador → Chat: o rolador grava a rolagem no servidor (registrarRolagem) e
  // a mensagem retornada chega aqui pra append local no chat (sem refetch).
  const onMensagemCriada = useCallback((msg: MensagemSerializada) => {
    chatRef.current?.appendLocal(msg);
  }, []);

  return (
    <div ref={bandejaRef} className="bandeja dock-bottom collapsed" id="bandeja">
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
            ativo={aba === "chat"}
          />
        </div>
      </div>
    </div>
  );
}
