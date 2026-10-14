"use client";

// Recursos próprios da criatura (Fúria, Munição...), com a mesma cara dos
// recursos da ficha do jogador.

import { EstiloPicker } from "@/app/ficha/[uid]/estilo-cor-picker";
import { estiloAplicado } from "@/lib/estilos-cor";
import { NumeroInput } from "./inputs";
import type { RecursoCriatura } from "./types";
import { criarRecursoVazio } from "./utils";

// Nome e barra do recurso; `atual` ausente = cheio (a ficha do bestiário).
export function RecursoBarra({
  recurso: r,
  atual = r.valorMax,
  children,
}: {
  recurso: RecursoCriatura;
  atual?: number;
  // Controle do valor, no lugar do "atual / máximo" de leitura.
  children?: React.ReactNode;
}) {
  const estilo = { cor: r.cor || null, cor2: r.cor2 || null, efeito: r.efeito };
  const fxNome = estiloAplicado(estilo, "texto");
  const fxBarra = estiloAplicado(estilo, "barra");
  const pct = r.valorMax > 0 ? Math.min(100, Math.max(0, (atual / r.valorMax) * 100)) : 0;
  return (
    <div className="bestiario-recurso">
      <div className="bestiario-recurso-topo">
        <span className={`bestiario-recurso-nome ${fxNome.className}`.trim()} style={fxNome.style}>
          {r.nome || "Recurso"}
        </span>
        {children ?? (
          <span className="bestiario-recurso-valor">
            <strong>{atual}</strong> / {r.valorMax}
          </span>
        )}
      </div>
      <div className="bestiario-recurso-trilho" aria-hidden>
        <div className={fxBarra.className} style={{ width: `${pct}%`, ...fxBarra.style }} />
      </div>
    </div>
  );
}

type Props = {
  recursos: RecursoCriatura[];
  onChange: (recursos: RecursoCriatura[]) => void;
};

export function RecursosEditor({ recursos, onChange }: Props) {
  function mudar(id: string, patch: Partial<RecursoCriatura>) {
    onChange(recursos.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="bestiario-lista-linhas">
      {recursos.length === 0 && (
        <p className="bestiario-vazio">Nenhum recurso. Crie um pra contar Fúria, Munição, Cargas e afins em combate.</p>
      )}
      {recursos.map((r) => (
        <div key={r.id} className="bestiario-recurso-linha">
          <div className="bestiario-linha-bonus">
            <input
              placeholder="Fúria"
              value={r.nome}
              aria-label="Nome do recurso"
              onChange={(e) => mudar(r.id, { nome: e.target.value })}
            />
            <NumeroInput value={r.valorMax} title="Máximo" onChange={(v) => mudar(r.id, { valorMax: Math.max(0, v ?? 0) })} />
            <button
              type="button"
              title="Remover recurso"
              aria-label={`Remover ${r.nome || "recurso"}`}
              onClick={() => onChange(recursos.filter((x) => x.id !== r.id))}
            >
              <i className="fas fa-xmark" />
            </button>
          </div>
          <RecursoBarra recurso={r} />
          <details className="bestiario-usos-detalhe">
            <summary>
              <i className="fas fa-palette" /> Cor e brilho
            </summary>
            <EstiloPicker
              cor={r.cor}
              cor2={r.cor2}
              efeito={r.efeito}
              amostra={r.nome.trim().slice(0, 14) || "Aa"}
              onChange={(patch) => mudar(r.id, patch)}
            />
          </details>
        </div>
      ))}
      <button type="button" className="bestiario-btn-add" onClick={() => onChange([...recursos, criarRecursoVazio()])}>
        <i className="fas fa-plus" /> Recurso
      </button>
    </div>
  );
}
