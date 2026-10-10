"use client";

// Confirmação de uso: uma habilidade ou ação, ou várias de uma pasta, com custo e efeito à vista.

import { useState } from "react";

export type CustoDeUso = {
  valor: number;
  nome: string;
  // Custo que é só deste item (usos): fica fora do total.
  proprio?: boolean;
};

export type ItemDeUso = {
  id: string;
  nome: string;
  custos: CustoDeUso[];
  // O que acontece: "Cura 2d8+3", "Concentração", "3 turnos".
  faz: string[];
  // Não entra, com o motivo ("já ligada", "sem usos").
  fora?: string;
};

export type PedidoDeUso = {
  // "Usar", "Ligar", "Ativar pasta".
  titulo: string;
  // Habilidade, ação ou pasta.
  nome: string;
  icone: string;
  botao: string;
  itens: ItemDeUso[];
  // Mostra a lista com marcação mesmo com um item só (pasta).
  lista?: boolean;
  // Consequência que pede atenção (Sobrecarga).
  aviso?: string;
};

function textoCusto(c: CustoDeUso): string {
  return `${c.valor} ${c.nome}${c.proprio && c.valor !== 1 ? "s" : ""}`;
}

// Soma dos custos compartilhados (PP, recursos) dos itens marcados.
function totais(itens: ItemDeUso[]): CustoDeUso[] {
  const mapa = new Map<string, number>();
  for (const i of itens) {
    for (const c of i.custos) {
      if (!c.proprio) mapa.set(c.nome, (mapa.get(c.nome) ?? 0) + c.valor);
    }
  }
  return [...mapa].map(([nome, valor]) => ({ nome, valor }));
}

// `confirmar` devolve os ids aceitos, ou null se cancelou; `modal` vai no JSX.
export function useConfirmarUso() {
  const [aberto, setAberto] = useState<{
    pedido: PedidoDeUso;
    resolver: (ids: string[] | null) => void;
  } | null>(null);

  function confirmar(pedido: PedidoDeUso): Promise<string[] | null> {
    return new Promise((resolver) => setAberto({ pedido, resolver }));
  }

  function fechar(ids: string[] | null) {
    aberto?.resolver(ids);
    setAberto(null);
  }

  const modal = aberto ? <ModalUsar pedido={aberto.pedido} onFechar={fechar} /> : null;
  return { confirmar, modal };
}

export function ModalUsar({
  pedido,
  onFechar,
}: {
  pedido: PedidoDeUso;
  onFechar: (ids: string[] | null) => void;
}) {
  const varios = pedido.lista ?? pedido.itens.length > 1;
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(pedido.itens.filter((i) => !i.fora).map((i) => i.id)),
  );
  const escolhidos = pedido.itens.filter((i) => marcados.has(i.id));
  const total = totais(escolhidos);
  const unico = pedido.itens[0];

  function alternar(id: string) {
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const confirmar = () => onFechar(escolhidos.map((i) => i.id));

  return (
    <div className="modal-overlay" onClick={() => onFechar(null)}>
      <div
        className="modal-box usar-box"
        role="dialog"
        aria-label={`${pedido.titulo} ${pedido.nome}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onFechar(null);
        }}
      >
        <div className="guardar-topo">
          <span className="guardar-icone">
            <i className={`fas ${pedido.icone}`} />
          </span>
          <div className="guardar-titulo">
            <h2>{pedido.titulo}</h2>
            <span>{pedido.nome}</span>
          </div>
        </div>

        {pedido.aviso && (
          <p className="usar-aviso">
            <i className="fas fa-triangle-exclamation" /> {pedido.aviso}
          </p>
        )}

        {varios ? (
          <ul className="usar-lista">
            {pedido.itens.map((i) => {
              const marcado = marcados.has(i.id);
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={marcado}
                    disabled={!!i.fora}
                    className={`usar-item${marcado ? " ativo" : ""}`}
                    onClick={() => alternar(i.id)}
                  >
                    <i className={`fas ${marcado ? "fa-circle-check" : "fa-circle"} usar-item-marca`} />
                    <span className="usar-item-texto">
                      <strong>{i.nome}</strong>
                      {(i.fora || i.faz.length > 0) && <span>{i.fora ?? i.faz.join(" · ")}</span>}
                    </span>
                    {!i.fora && i.custos.length > 0 && (
                      <span className="usar-item-custos">
                        {i.custos.map((c) => (
                          <span key={c.nome} className="tag tag-custo">
                            {textoCusto(c)}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          (unico.custos.length > 0 || unico.faz.length > 0) && (
            <dl className="usar-resumo">
              {unico.custos.length > 0 && (
                <>
                  <dt>Custo</dt>
                  <dd>
                    {unico.custos.map((c) => (
                      <span key={c.nome} className="tag tag-custo">
                        {textoCusto(c)}
                      </span>
                    ))}
                  </dd>
                </>
              )}
              {unico.faz.length > 0 && (
                <>
                  <dt>Faz</dt>
                  <dd>
                    {unico.faz.map((f) => (
                      <span key={f} className="usar-faz">
                        {f}
                      </span>
                    ))}
                  </dd>
                </>
              )}
            </dl>
          )
        )}

        {varios && total.length > 0 && (
          <div className="usar-total">
            <span>Total</span>
            {total.map((c) => (
              <span key={c.nome} className="tag tag-custo">
                {textoCusto(c)}
              </span>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="modal-btn-cancel" onClick={() => onFechar(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className="modal-btn-save"
            autoFocus
            disabled={escolhidos.length === 0}
            onClick={confirmar}
          >
            <i className={`fas ${pedido.icone}`} /> {pedido.botao}
            {varios ? ` ${escolhidos.length}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
