"use client";

import { useState } from "react";
import Link from "next/link";
import { DeleteButton } from "./delete-button";
import { deletarMesa } from "./actions";

type Mesa = {
  id: string;
  nome: string;
  codigoAcesso: string;
  bannerUrl: string | null;
};

export function CardMesa({ mesa }: { mesa: Mesa }) {
  const [escondido, setEscondido] = useState(false);
  if (escondido) return null;

  return (
    <Link href={`/narrador/${mesa.id}`} className="card-mesa">
      <DeleteButton
        onDelete={deletarMesa.bind(null, mesa.id)}
        confirmText={`Apagar a mesa "${mesa.nome}" permanentemente? Esta ação é irreversível.`}
        onOptimisticHide={() => setEscondido(true)}
        onOptimisticRestore={() => setEscondido(false)}
      />
      <div
        className="card-banner"
        style={mesa.bannerUrl ? { backgroundImage: `url('${mesa.bannerUrl}')` } : undefined}
      >
        {!mesa.bannerUrl && <i className="fa-solid fa-map-location-dot" />}
      </div>
      <div className="card-body">
        <h3 className="card-title">{mesa.nome || "Mesa Sem Nome"}</h3>
        <p className="card-subtitle">
          <i className="fa-solid fa-key" /> Código: <strong>{mesa.codigoAcesso}</strong>
        </p>
      </div>
    </Link>
  );
}
