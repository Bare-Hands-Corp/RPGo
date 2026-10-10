"use client";

import { UNIDADES_DURACAO, type Duracao, type UnidadeDuracao } from "@/lib/duracao";
import { CampoPasso } from "./campos-modal";

// Duração: unidade em botões, quantidade quando cabe e a marca de concentração.
export function DuracaoCampo({
  valor,
  onChange,
}: {
  valor: Duracao | null;
  onChange: (d: Duracao | null) => void;
}) {
  const meta = UNIDADES_DURACAO.find((u) => u.slug === valor?.unidade);

  function escolher(slug: UnidadeDuracao | null) {
    const u = UNIDADES_DURACAO.find((x) => x.slug === slug);
    if (!u) {
      onChange(null);
      return;
    }
    onChange({
      unidade: u.slug,
      ...(u.comQuantidade ? { quantidade: valor?.quantidade ?? 1 } : {}),
      ...(valor?.concentracao && u.slug !== "instantanea" ? { concentracao: true } : {}),
    });
  }

  const quantidade = valor?.quantidade ?? 1;
  return (
    <>
      <label>Duração</label>
      <div className="duracao-opcoes" role="group" aria-label="Duração">
        <button
          type="button"
          className={`origem-pill ${!valor ? "ativo" : ""}`}
          aria-pressed={!valor}
          title="Sem duração"
          onClick={() => escolher(null)}
        >
          —
        </button>
        {UNIDADES_DURACAO.map((u) => (
          <button
            type="button"
            key={u.slug}
            className={`origem-pill ${valor?.unidade === u.slug ? "ativo" : ""}`}
            aria-pressed={valor?.unidade === u.slug}
            title={!u.comQuantidade && u.texto !== u.nome ? u.texto : undefined}
            onClick={() => escolher(u.slug)}
          >
            {u.nome}
          </button>
        ))}
      </div>
      {valor && valor.unidade !== "instantanea" && (
        <div className="duracao-detalhe">
          {meta?.comQuantidade && (
            <div className="duracao-qtd">
              <CampoPasso
                valor={quantidade}
                min={1}
                rotulo="Quantidade"
                onChange={(n) => onChange({ ...valor, quantidade: n })}
              />
              <span className="duracao-qtd-unidade">
                {meta.texto}
                {quantidade === 1 ? "" : "s"}
              </span>
            </div>
          )}
          <button
            type="button"
            className={`origem-pill duracao-concentracao ${valor.concentracao ? "ativo" : ""}`}
            aria-pressed={!!valor.concentracao}
            onClick={() =>
              onChange({
                unidade: valor.unidade,
                ...(valor.quantidade ? { quantidade: valor.quantidade } : {}),
                ...(valor.concentracao ? {} : { concentracao: true }),
              })
            }
          >
            <i className="fas fa-brain" /> Concentração
          </button>
        </div>
      )}
    </>
  );
}
