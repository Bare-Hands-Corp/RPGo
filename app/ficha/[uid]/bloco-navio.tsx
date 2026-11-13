"use client";

// Ficha do navio: o estado pelo dano (Avariado tira 6 nós…), a velocidade que
// sobra, quem comanda (a salvaguarda de estrutura sai da VON dele) e os atalhos
// de estaleiro: reformar as peças, consertar e repor a munição.

import { useState, useTransition } from "react";
import Swal from "sweetalert2";
import { exigir } from "@/lib/acoes";
import {
  estadoDoNavio,
  lerMontagem,
  metrosPorRodada,
  statsTamanho,
  velocidadeComDano,
  type MontagemNavio,
} from "@/lib/navio";
import { consertarNavio, definirComandante, reformarNavio, reporMunicaoDoNavio } from "./actions";
import { CamposMontagemNavio } from "./montagem-navio";

export type NavioDaFicha = {
  comandanteId: string | null;
  montagem: MontagemNavio | null;
  // Navio inimigo do narrador: sem comandante da tripulação.
  doNarrador: boolean;
  tripulantes: { id: string; nome: string }[];
};

function mostrarErro(err: unknown) {
  void Swal.fire({
    icon: "error",
    title: "Erro",
    text: err instanceof Error ? err.message : "Operação falhou.",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

export function BlocoNavio({
  navioId,
  navio,
  pvAtual,
  pvMax,
  velocidade,
}: {
  navioId: string;
  navio: NavioDaFicha;
  pvAtual: number;
  pvMax: number;
  // A da ficha (velas − peso, com efeitos).
  velocidade: number;
}) {
  const estado = estadoDoNavio(pvAtual, pvMax);
  const agora = velocidadeComDano(velocidade, pvAtual, pvMax);
  const [comandante, setComandante] = useState(navio.comandanteId);
  const [doServidor, setDoServidor] = useState(navio.comandanteId);
  if (navio.comandanteId !== doServidor) {
    setDoServidor(navio.comandanteId);
    setComandante(navio.comandanteId);
  }
  const [reforma, setReforma] = useState<MontagemNavio | null>(null);
  const [, startTransition] = useTransition();

  function escolher(id: string | null) {
    setComandante(id);
    startTransition(async () => {
      try {
        exigir(await definirComandante(navioId, id));
      } catch (err) {
        setComandante(navio.comandanteId);
        mostrarErro(err);
      }
    });
  }

  async function consertar() {
    const { isConfirmed } = await Swal.fire({
      title: "Consertar o navio",
      text: estado.reparo
        ? `${estado.nome}: fora da tripulação, o conserto leva ${estado.reparo}. O navio volta a ${pvMax} PV.`
        : `O navio volta a ${pvMax} PV.`,
      showCancelButton: true,
      confirmButtonText: "Consertar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!isConfirmed) return;
    startTransition(async () => {
      try {
        exigir(await consertarNavio(navioId));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function reporMunicao() {
    startTransition(async () => {
      try {
        exigir(await reporMunicaoDoNavio(navioId));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function salvarReforma() {
    if (!reforma) return;
    const m = reforma;
    setReforma(null);
    startTransition(async () => {
      try {
        exigir(await reformarNavio(navioId, m));
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  const montagem = navio.montagem ? lerMontagem(navio.montagem) : null;

  return (
    <div className="bloco-navio">
      <div className="bloco-navio-estado" title={estado.reparo ? `Reparo: ${estado.reparo}` : undefined}>
        <span className={`bloco-navio-selo${estado.reducao > 0 ? " danificado" : ""}`}>{estado.nome}</span>
        {estado.reducao > 0 && <span>−{estado.reducao} nós</span>}
        <span>
          <i className="fas fa-wind" /> {agora} nós · {metrosPorRodada(agora).toLocaleString("pt-BR")} m/rodada
        </span>
      </div>
      {montagem && (
        <div className="bloco-navio-pecas">
          {statsTamanho(montagem.tamanho).nome} · {montagem.canhoes} {montagem.canhoes === 1 ? "canhão" : "canhões"} ·{" "}
          {montagem.comodos.length} {montagem.comodos.length === 1 ? "cômodo" : "cômodos"}
        </div>
      )}
      <div className="bloco-navio-atalhos">
        {montagem && (
          <button type="button" className="hab-usar" onClick={() => setReforma(montagem)}>
            <i className="fas fa-hammer" /> Reformar
          </button>
        )}
        <button type="button" className="hab-usar" disabled={pvAtual >= pvMax} onClick={() => void consertar()}>
          <i className="fas fa-screwdriver-wrench" /> Consertar
        </button>
        {montagem && montagem.canhoes > 0 && (
          <button type="button" className="hab-usar" onClick={reporMunicao}>
            <i className="fas fa-box" /> Repor munição
          </button>
        )}
      </div>
      {!navio.doNarrador && (
        <div className="bloco-navio-comandante">
          <span>Comandante</span>
          <div className="sugestoes">
            {navio.tripulantes.map((t) => (
              <button
                type="button"
                key={t.id}
                className={`sugestao chip-opcao${comandante === t.id ? " ativo" : ""}`}
                aria-pressed={comandante === t.id}
                onClick={() => escolher(comandante === t.id ? null : t.id)}
              >
                {t.nome}
              </button>
            ))}
            {navio.tripulantes.length === 0 && <small>Ninguém na mesa ainda.</small>}
          </div>
        </div>
      )}

      {reforma && (
        <div className="modal-overlay" onClick={() => setReforma(null)}>
          <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setReforma(null)} aria-label="Fechar">
              <i className="fas fa-times" />
            </button>
            <h2>Reformar o navio</h2>
            <CamposMontagemNavio montagem={reforma} onChange={setReforma} />
            <div className="modal-actions">
              <button type="button" className="modal-btn-cancel" onClick={() => setReforma(null)}>
                Cancelar
              </button>
              <button type="button" className="modal-btn-save" onClick={salvarReforma}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
