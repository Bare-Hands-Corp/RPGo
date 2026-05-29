"use client";

import { useState } from "react";
import Link from "next/link";
import { DeleteButton } from "./delete-button";
import { deletarPersonagem } from "./actions";

type Personagem = {
  id: string;
  nome: string;
  nivel: number;
  fotoUrl: string | null;
  hpAtual: number;
  hpMax: number;
  ppAtual: number;
  ppMax: number;
  mesa?: { nome: string } | null;
};

type DeleteAction = {
  onDelete: () => Promise<void>;
  confirmText: string;
  iconClassName?: string;
  title?: string;
  confirmButtonText?: string;
  successTitle?: string;
  successText?: string;
};

type CardPersonagemProps = {
  personagem: Personagem;
  mostrarMesa?: boolean;
  deleteAction?: DeleteAction;
};

function iniciais(nome: string): string {
  return (nome || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Barra({ label, atual, max, tipo }: { label: string; atual: number; max: number; tipo: "hp" | "pp" }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (atual / max) * 100)) : 0;
  return (
    <div className="bar">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className={`bar-fill bar-${tipo}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="bar-text">
        {atual}
        <span className="max">/{max}</span>
      </span>
    </div>
  );
}

export function CardPersonagem({
  personagem: p,
  mostrarMesa = true,
  deleteAction,
}: CardPersonagemProps) {
  const [escondido, setEscondido] = useState(false);
  if (escondido) return null;

  const temPp = p.ppMax > 0;
  const acaoExclusao = deleteAction ?? {
    onDelete: deletarPersonagem.bind(null, p.id),
    confirmText: `Apagar "${p.nome}" permanentemente? Esta ação é irreversível.`,
    iconClassName: "fa-solid fa-trash",
    title: "Apagar",
    confirmButtonText: "Sim, apagar!",
    successTitle: "Apagado!",
  };

  return (
    <Link href={`/ficha/${p.id}`} className="card-personagem">
      <DeleteButton
        onDelete={acaoExclusao.onDelete}
        confirmText={acaoExclusao.confirmText}
        iconClassName={acaoExclusao.iconClassName}
        title={acaoExclusao.title}
        confirmButtonText={acaoExclusao.confirmButtonText}
        successTitle={acaoExclusao.successTitle}
        successText={acaoExclusao.successText}
        onOptimisticHide={() => setEscondido(true)}
        onOptimisticRestore={() => setEscondido(false)}
      />
      <div className="avatar-wrap">
        <div
          className="avatar"
          style={p.fotoUrl ? { backgroundImage: `url('${p.fotoUrl}')` } : undefined}
        >
          {p.fotoUrl ? "" : iniciais(p.nome)}
        </div>
        <div className="level-pip">{p.nivel}</div>
      </div>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <h3 className="nome">{p.nome || "Sem Nome"}</h3>
        <div className="bars">
          <Barra label="PV" atual={p.hpAtual} max={p.hpMax} tipo="hp" />
          {temPp && <Barra label="PP" atual={p.ppAtual} max={p.ppMax} tipo="pp" />}
        </div>
        {mostrarMesa && (
          <div className={`mesa-footer ${p.mesa ? "com-mesa" : "sem-mesa"}`}>
            <i className="fa-solid fa-anchor" />
            <span className="mesa-text">{p.mesa?.nome || "Sem tripulação"}</span>
            {p.mesa && <span className="mesa-badge">A BORDO</span>}
          </div>
        )}
      </div>
    </Link>
  );
}
