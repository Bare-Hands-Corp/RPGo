"use client";

import { useState, useTransition } from "react";
import Swal from "sweetalert2";
import { patchPersonagem } from "./actions";

type Atributos = {
  hpMax: number;
  ppMax: number;
  forca: number;
  destreza: number;
  constituicao: number;
  sabedoria: number;
  vontade: number;
  presenca: number;
};

type Props = {
  personagemId: string;
  inicial: Atributos;
};

export function EditFichaModal({ personagemId, inicial }: Props) {
  const [aberto, setAberto] = useState(false);
  const [valores, setValores] = useState<Atributos>(inicial);
  const [pending, startTransition] = useTransition();

  function abrir() {
    setValores(inicial);
    setAberto(true);
  }

  function set<K extends keyof Atributos>(key: K, raw: string) {
    setValores((v) => ({ ...v, [key]: Number(raw) || 0 }));
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await patchPersonagem(personagemId, valores);
        setAberto(false);
        Swal.fire({
          icon: "success",
          title: "Ficha atualizada!",
          timer: 1200,
          showConfirmButton: false,
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      } catch (err) {
        Swal.fire({
          icon: "error",
          title: "Erro",
          text: err instanceof Error ? err.message : "Falha ao salvar.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="sidebar-icon-btn gear"
        title="Editar Ficha"
        onClick={abrir}
      >
        <i className="fas fa-cog" />
      </button>

      {aberto && (
        <div className="modal-overlay" onClick={() => !pending && setAberto(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>Editar Atributos</h2>
            <p style={{ fontSize: "0.8rem", color: "var(--text-sec)", marginBottom: 15 }}>
              Ajuste seus limites e atributos base.
            </p>

            <form onSubmit={salvar}>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label>Vida Máxima</label>
                  <input
                    type="number"
                    value={valores.hpMax}
                    onChange={(e) => set("hpMax", e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label>PP Máximo</label>
                  <input
                    type="number"
                    value={valores.ppMax}
                    onChange={(e) => set("ppMax", e.target.value)}
                  />
                </div>
              </div>

              <label style={{ marginTop: 15, borderBottom: "1px solid var(--border)", paddingBottom: 5 }}>
                Atributos
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 10,
                  marginTop: 10,
                }}
              >
                {(
                  [
                    ["FOR", "forca"],
                    ["DES", "destreza"],
                    ["CON", "constituicao"],
                    ["INT", "sabedoria"],
                    ["VON", "vontade"],
                    ["PRE", "presenca"],
                  ] as const
                ).map(([label, key]) => (
                  <div key={key}>
                    <label style={{ fontSize: "0.7rem" }}>{label}</label>
                    <input
                      type="number"
                      value={valores[key]}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={() => setAberto(false)}
                  disabled={pending}
                >
                  Cancelar
                </button>
                <button type="submit" className="modal-btn-save" disabled={pending}>
                  {pending ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
