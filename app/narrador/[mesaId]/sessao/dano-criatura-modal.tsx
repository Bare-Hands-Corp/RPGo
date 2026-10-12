"use client";

import { useMemo, useState } from "react";
import {
  defesaCobre,
  defesasDaCriatura,
  resolverDano,
  resumirParte,
  type DefesaDano,
  type ParteDano,
} from "@/lib/dano";
import type { ResistenciasPayload } from "@/app/bestiario/types";

type Parte = { valor: string; tipo: string };

const MAX_PARTES = 6;

const ROTULO_DEFESA: Record<DefesaDano["tipo"], string> = {
  imunidade: "Imune",
  resistencia: "Metade",
  vulnerabilidade: "Dobro",
  reducao: "Redução",
};

// Dano com tipo numa criatura em combate: imunidade, resistência e
// vulnerabilidade do bestiário entram na conta (lib/dano.ts).
export function DanoCriaturaModal({
  nome,
  pvAtual,
  pvMax,
  resistencias,
  tiposDano,
  onAplicar,
  onFechar,
}: {
  nome: string;
  pvAtual: number;
  pvMax: number;
  resistencias: ResistenciasPayload;
  // Catálogo de tipos de dano do narrador.
  tiposDano: string[];
  onAplicar: (partes: ParteDano[], desligadas: string[], pvDepois: number) => void;
  onFechar: () => void;
}) {
  const [partes, setPartes] = useState<Parte[]>([{ valor: "", tipo: "" }]);
  const [desligadas, setDesligadas] = useState<Set<string>>(new Set());
  const defesas = useMemo(() => defesasDaCriatura(resistencias), [resistencias]);

  const partesNum = partes
    .map((p) => ({ valor: Math.trunc(Number(p.valor) || 0), tipo: p.tipo }))
    .filter((p) => p.valor > 0);
  // Só aparecem as defesas que cobrem alguma parte do golpe.
  const valem = defesas.filter((d) => partesNum.some((p) => defesaCobre(d, p.tipo)));
  const r = resolverDano(partesNum, defesas, { hpAtual: pvAtual, hpTemp: 0, hpMax: pvMax }, { desligadas });
  const pronto = partesNum.length > 0;

  function mudarParte(i: number, patch: Partial<Parte>) {
    setPartes((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  function alternarDefesa(id: string) {
    setDesligadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function aplicar() {
    if (!pronto) return;
    onAplicar(partesNum, [...desligadas], r.hpAtual.depois);
    onFechar();
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-box dano-criatura-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onFechar} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
        <h2>Dano em {nome}</h2>

        <div className="dano-criatura-partes">
          {partes.map((p, i) => (
            <div key={i} className="dano-criatura-parte">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={p.valor}
                placeholder="Dano"
                aria-label="Dano"
                autoFocus={i === 0}
                onChange={(e) => mudarParte(i, { valor: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") aplicar();
                }}
              />
              <select value={p.tipo} aria-label="Tipo de dano" onChange={(e) => mudarParte(i, { tipo: e.target.value })}>
                <option value="">Sem tipo</option>
                {tiposDano.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {partes.length > 1 && (
                <button
                  type="button"
                  className="nv-btn"
                  aria-label="Tirar esta parte"
                  onClick={() => setPartes((ps) => ps.filter((_, j) => j !== i))}
                >
                  <i className="fas fa-xmark" />
                </button>
              )}
            </div>
          ))}
          {partes.length < MAX_PARTES && (
            <button
              type="button"
              className="nv-btn"
              onClick={() => setPartes((ps) => [...ps, { valor: "", tipo: "" }])}
            >
              <i className="fas fa-plus" /> Outro tipo
            </button>
          )}
        </div>

        {valem.length > 0 && (
          <div className="dano-criatura-defesas">
            {valem.map((d) => {
              const ligada = !desligadas.has(d.id);
              return (
                <button
                  type="button"
                  key={d.id}
                  className={`dano-criatura-defesa${ligada ? " ativo" : ""}`}
                  aria-pressed={ligada}
                  title={ligada ? "Vale neste golpe. Clique pra ignorar." : "Ignorada neste golpe."}
                  onClick={() => alternarDefesa(d.id)}
                >
                  {ROTULO_DEFESA[d.tipo]}: {d.cobre}
                </button>
              );
            })}
          </div>
        )}

        {pronto && (
          <div className="dano-criatura-previa">
            <strong>{r.final} de dano</strong>
            {r.partes.map((p, i) => (
              <span key={i}>{resumirParte(p)}</span>
            ))}
            <span>
              PV {r.hpAtual.antes} → <strong>{r.hpAtual.depois}</strong>
              {pvMax > 0 ? ` / ${pvMax}` : ""}
            </span>
          </div>
        )}

        <div className="dano-criatura-rodape">
          <button type="button" className="nv-btn" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="bestiario-btn-salvar" onClick={aplicar} disabled={!pronto}>
            Aplicar dano
          </button>
        </div>
      </div>
    </div>
  );
}
