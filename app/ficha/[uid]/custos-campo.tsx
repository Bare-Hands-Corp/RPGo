"use client";

import { CampoPasso } from "./campos-modal";

type RecursoCusto = { id: string; nome: string; cor?: string | null };

// O que a ação ou habilidade gasta ao usar. Os números ficam em texto no form ("" = 0).
export function CustosCampo({
  pp,
  onPp,
  recursos,
  recursoId,
  onRecursoId,
  recursoValor,
  onRecursoValor,
}: {
  pp: string;
  onPp: (v: string) => void;
  recursos: RecursoCusto[];
  recursoId: string;
  onRecursoId: (id: string) => void;
  recursoValor: string;
  onRecursoValor: (v: string) => void;
}) {
  const numero = (v: string) => Math.max(0, Math.trunc(Number(v) || 0));
  const texto = (n: number) => (n > 0 ? String(n) : "");
  const recurso = recursos.find((r) => r.id === recursoId);
  return (
    <div className="custos-campo">
      <div className="custo-linha">
        <span className="custo-icone custo-pp">
          <i className="fas fa-bolt" />
        </span>
        <span className="custo-nome">PP</span>
        <CampoPasso valor={numero(pp)} rotulo="PP" onChange={(n) => onPp(texto(n))} />
      </div>
      {recursos.length > 0 && (
        <div className="custo-linha">
          <span
            className="custo-icone"
            style={recurso?.cor ? ({ "--custo-cor": recurso.cor } as React.CSSProperties) : undefined}
          >
            <i className="fas fa-gem" />
          </span>
          <select
            className="custo-recurso"
            aria-label="Recurso"
            value={recursoId}
            onChange={(e) => onRecursoId(e.target.value)}
          >
            <option value="">Nenhum recurso</option>
            {recursos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
          <CampoPasso
            valor={numero(recursoValor)}
            rotulo="Quantidade"
            disabled={!recursoId}
            onChange={(n) => onRecursoValor(texto(n))}
          />
        </div>
      )}
    </div>
  );
}
