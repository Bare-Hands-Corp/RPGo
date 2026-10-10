"use client";

import { CampoFormula } from "./campo-formula";

type RecursoCusto = { id: string; nome: string; cor?: string | null };

// O que a ação ou habilidade gasta ao usar. Cada valor é um número ou uma fórmula
// ("NIVEL/2", "PROF"); fica em texto no form ("" = 0).
export function CustosCampo({
  pp,
  onPp,
  recursos,
  recursoId,
  onRecursoId,
  recursoValor,
  onRecursoValor,
  comGrau,
  grau,
}: {
  pp: string;
  onPp: (v: string) => void;
  recursos: RecursoCusto[];
  recursoId: string;
  onRecursoId: (id: string) => void;
  recursoValor: string;
  onRecursoValor: (v: string) => void;
  // Técnica: oferece GRAU e mostra a prévia com o grau dela.
  comGrau?: boolean;
  grau?: number;
}) {
  const recurso = recursos.find((r) => r.id === recursoId);
  return (
    <div className="custos-campo">
      <div className="custo-linha custo-linha-formula">
        <span className="custo-icone custo-pp">
          <i className="fas fa-bolt" />
        </span>
        <CampoFormula
          label="PP"
          valor={pp}
          onChange={onPp}
          placeholder={comGrau ? "2, GRAU, NIVEL/2…" : "2, PROF, NIVEL/2…"}
          comGrau={comGrau}
          grau={grau}
        />
      </div>
      {recursos.length > 0 && (
        <div className="custo-linha custo-linha-formula">
          <span
            className="custo-icone"
            style={recurso?.cor ? ({ "--custo-cor": recurso.cor } as React.CSSProperties) : undefined}
          >
            <i className="fas fa-gem" />
          </span>
          <div className="custo-recurso-campo">
            <label>Recurso</label>
            <select
              className="custo-recurso"
              aria-label="Recurso"
              value={recursoId}
              onChange={(e) => onRecursoId(e.target.value)}
            >
              <option value="">Nenhum</option>
              {recursos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </div>
          {recursoId && (
            <CampoFormula
              label="Quanto"
              valor={recursoValor}
              onChange={onRecursoValor}
              placeholder="1, PROF…"
              comGrau={comGrau}
              grau={grau}
            />
          )}
        </div>
      )}
    </div>
  );
}
