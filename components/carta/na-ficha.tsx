"use client";

// Protótipo das cartas dentro da ficha real. Só em desenvolvimento, pela URL:
//   ?cartas=a  → a ficha fica igual; o nome de cada ação/habilidade/item abre a carta.
//   ?cartas=b  → além disso, cada aba ganha o botão Lista/Cartas.
import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Carta, type ModeloCarta } from "./carta";
import { ModalCarta } from "./modal-carta";
import { AlternarTemaCartas } from "./tema-cartas";
import "./na-ficha.css";

export type ModoCartas = "a" | "b" | null;

export function useModoCartas(): ModoCartas {
  const sp = useSearchParams();
  if (process.env.NODE_ENV === "production") return null;
  const v = sp.get("cartas");
  return v === "a" || v === "b" ? v : null;
}

export type Visao = "lista" | "cartas";

// Lista ou cartas, por aba; lembrada neste navegador (no servidor, sempre lista).
const ouvintesVisao = new Set<() => void>();

function lerVisao(chave: string): Visao {
  try {
    return localStorage.getItem(chave) === "cartas" ? "cartas" : "lista";
  } catch {
    return "lista";
  }
}

export function useVisao(aba: string, modo: ModoCartas): [Visao, (v: Visao) => void] {
  const chave = `rpgo:visao:${aba}`;
  const visao = useSyncExternalStore(
    (avisar) => {
      ouvintesVisao.add(avisar);
      return () => ouvintesVisao.delete(avisar);
    },
    () => lerVisao(chave),
    () => "lista" as Visao,
  );
  const mudar = (v: Visao) => {
    try {
      localStorage.setItem(chave, v);
    } catch {}
    ouvintesVisao.forEach((f) => f());
  };
  return [modo === "b" ? visao : "lista", mudar];
}

export function AlternarVisao({ visao, onVisao }: { visao: Visao; onVisao: (v: Visao) => void }) {
  return (
    <>
    {visao === "cartas" && <AlternarTemaCartas />}
    <div className="visao-alternar" role="group" aria-label="Visualização">
      <button type="button" aria-pressed={visao === "lista"} onClick={() => onVisao("lista")} title="Lista">
        <i className="fas fa-list" /> Lista
      </button>
      <button type="button" aria-pressed={visao === "cartas"} onClick={() => onVisao("cartas")} title="Cartas">
        <i className="fas fa-clone" /> Cartas
      </button>
    </div>
    </>
  );
}

// O que a aba guarda pra abrir o modal: a carta e o botão de usar dela.
export type CartaAberta = {
  carta: ModeloCarta;
  usar?: { onUsar: () => void; desabilitado?: boolean; titulo?: string; rotulo?: string; icone?: string };
  onEditar?: () => void;
};

export function ModalCartaFicha({ aberta, onFechar }: { aberta: CartaAberta | null; onFechar: () => void }) {
  if (!aberta) return null;
  const { carta, usar, onEditar } = aberta;
  return (
    <ModalCarta
      carta={carta}
      onFechar={onFechar}
      acoes={
        <>
          {usar && (
            <button
              className="primario"
              disabled={usar.desabilitado}
              title={usar.titulo}
              onClick={() => {
                onFechar();
                usar.onUsar();
              }}
            >
              <i className={`fas ${usar.icone ?? "fa-play"}`} /> {usar.rotulo ?? "Usar"}
            </button>
          )}
          {onEditar && (
            <button
              onClick={() => {
                onFechar();
                onEditar();
              }}
            >
              <i className="fas fa-edit" /> Editar
            </button>
          )}
        </>
      }
    />
  );
}

// Nome do card que abre a carta (opção A). Fora do protótipo, só o texto.
export function NomeQueAbreCarta({
  modo,
  children,
  onAbrir,
  className,
  style,
}: {
  modo: ModoCartas;
  children: ReactNode;
  onAbrir?: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  if (!modo || !onAbrir) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <button type="button" className={`${className ?? ""} nome-abre-carta`} style={style} onClick={onAbrir} title="Ver como carta">
      {children} <i className="fas fa-clone nome-abre-carta-icone" aria-hidden />
    </button>
  );
}

// Uma carta na grade (opção B): clicar abre o modal; embaixo, os botões da ficha.
export function CartaNaGrade({
  carta,
  onAbrir,
  rodape,
  travada,
}: {
  carta: ModeloCarta;
  onAbrir: () => void;
  rodape?: ReactNode;
  travada?: boolean;
}) {
  return (
    <div className={`ficha-carta${travada ? " ficha-carta-travada" : ""}`}>
      <div
        role="button"
        tabIndex={0}
        className="ficha-carta-clique"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest(".desc-chip")) onAbrir();
        }}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onAbrir();
          }
        }}
      >
        <Carta carta={carta} interativa style={{ "--escala": 0.68 } as CSSProperties} />
      </div>
      {rodape && <div className="ficha-carta-rodape">{rodape}</div>}
    </div>
  );
}
