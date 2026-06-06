"use client";

import { useState, useTransition } from "react";
import Swal from "sweetalert2";
import { patchPersonagem } from "./actions";
import { tetoAtributo, type Atributo, type EfeitosAgregados } from "@/lib/op-rpg";

type Atributos = {
  hpMax: number;
  ppMax: number;
  tipoDadoVida: string;
  deslocamento: number;
  nado: number;
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
  // Só o mapa de tetos importa aqui — o efeito `teto-<atributo>` de habilidade
  // eleva o limite de 20 do Aprimoramento de Atributo.
  bonusTetoAtributo: EfeitosAgregados["bonusTetoAtributo"];
  onOtimista?: (patch: Atributos) => void;
};

export function EditFichaModal({
  personagemId,
  inicial,
  bonusTetoAtributo,
  onOtimista,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [valores, setValores] = useState<Atributos>(inicial);
  const [pending, startTransition] = useTransition();

  function abrir() {
    setValores(inicial);
    setAberto(true);
  }

  function set<K extends keyof Atributos>(key: K, raw: string) {
    if (key === "tipoDadoVida") {
      setValores((v) => ({ ...v, [key]: raw as Atributos[K] }));
      return;
    }
    setValores((v) => ({ ...v, [key]: (Number(raw) || 0) as Atributos[K] }));
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const patch = valores;
    setAberto(false); // fecha imediatamente — patch otimista cuida da UI
    startTransition(async () => {
      onOtimista?.(patch);
      try {
        await patchPersonagem(personagemId, patch);
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
                <div style={{ flex: 1 }}>
                  <label>Dado de Vida</label>
                  <select
                    value={valores.tipoDadoVida}
                    onChange={(e) => set("tipoDadoVida", e.target.value)}
                  >
                    <option value="d6">d6</option>
                    <option value="d8">d8</option>
                    <option value="d10">d10</option>
                    <option value="d12">d12</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label>Desloc. (m)</label>
                  <input
                    type="number"
                    value={valores.deslocamento}
                    onChange={(e) => set("deslocamento", e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Nado (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={valores.nado}
                    onChange={(e) => set("nado", e.target.value)}
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
                    ["SAB", "sabedoria"],
                    ["VON", "vontade"],
                    ["PRE", "presenca"],
                  ] as const
                ).map(([label, key]) => {
                  const teto = tetoAtributo(bonusTetoAtributo, key as Atributo);
                  // Passar do teto é legal (lendários vão até 30) — só avisa.
                  const acima = valores[key] > teto.valor;
                  return (
                    <div key={key}>
                      <label style={{ fontSize: "0.7rem" }}>
                        {label}{" "}
                        <span className="attr-teto-nota">máx {teto.valor}</span>
                      </label>
                      <input
                        type="number"
                        className={acima ? "input-acima-teto" : undefined}
                        value={valores[key]}
                        onChange={(e) => set(key, e.target.value)}
                      />
                      {acima && (
                        <div className="attr-teto-aviso">
                          acima do teto de Aprimoramento
                        </div>
                      )}
                    </div>
                  );
                })}
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
