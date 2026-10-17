"use client";

import { useState } from "react";
import Link from "next/link";
import type { SubfichaCard } from "@/lib/resumo-personagem";
import { MAX_SUBFICHAS_DA_MESA } from "@/lib/subficha";
import { CardSubficha, ModalSubficha, useSubfichas } from "./subfichas-tab";

export type Tripulante = {
  id: string;
  nome: string;
  fotoUrl: string | null;
  nivel: number;
  hpAtual: number;
  hpMax: number;
  // De quem é, quando é subficha (alvo de aliado).
  de?: string | null;
};

type Props = {
  personagemId: string;
  mesaId: string | null;
  isNarradorDaMesa: boolean;
  tripulantes: Tripulante[];
  // Subfichas da mesa: os navios da tripulação. Qualquer membro edita.
  embarcacoes: SubfichaCard[];
};

const avatarDe = (t: { fotoUrl: string | null; id: string }) =>
  t.fotoUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${t.id}`;

export function TripulacaoTab({
  personagemId,
  mesaId,
  isNarradorDaMesa,
  tripulantes,
  embarcacoes,
}: Props) {
  const navios = useSubfichas(personagemId, embarcacoes, true);
  const [modal, setModal] = useState<{ ficha: SubfichaCard | null } | null>(null);

  if (!mesaId) {
    return (
      <div className="placeholder-tab">
        <i className="fas fa-users" />
        <p>Entre em uma mesa para ver a tripulação e o navio.</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Tripulação</h1>

      {/* ─── Roster ─────────────────────────────────────────── */}
      <section>
        <div className="section-header">
          <i className="fas fa-users" style={{ color: "var(--primary)" }} />
          <h3>Membros ({tripulantes.length})</h3>
        </div>

        {tripulantes.length === 0 ? (
          <p style={{ color: "var(--text-sec)", fontSize: "0.9rem" }}>
            Nenhum tripulante nesta mesa ainda.
          </p>
        ) : (
          <div className="tripulantes-grid">
            {tripulantes.map((t) => {
              const ehVoce = t.id === personagemId;
              const podeAbrir = ehVoce || isNarradorDaMesa;
              const pvPct =
                t.hpMax > 0 ? Math.max(0, Math.min(100, (t.hpAtual / t.hpMax) * 100)) : 0;
              // Verde (cheio) → amarelo → vermelho (vazio) pela fração de PV.
              const pvCor = `hsl(${(pvPct / 100) * 120} 65% 45%)`;
              const corpo = (
                <>
                  <img className="tripulante-avatar" src={avatarDe(t)} alt="" />
                  <div className="tripulante-info">
                    <span className="tripulante-nome">
                      {t.nome}
                      {ehVoce && <span className="tripulante-voce"> (você)</span>}
                    </span>
                    <span className="tripulante-nivel">Nível {t.nivel}</span>
                    {/* PV só do dono da ficha; dos outros mostra só nome e nível. */}
                    {ehVoce && (
                      <>
                        <div className="tripulante-pv-barra" title={`${t.hpAtual} / ${t.hpMax} PV`}>
                          <div
                            className="tripulante-pv-fill"
                            style={{ width: `${pvPct}%`, background: pvCor }}
                          />
                        </div>
                        <span className="tripulante-pv-txt">
                          {t.hpAtual} / {t.hpMax} PV
                        </span>
                      </>
                    )}
                  </div>
                </>
              );
              return podeAbrir ? (
                <Link
                  key={t.id}
                  href={`/ficha/${t.id}`}
                  className={`tripulante-card ${ehVoce ? "voce" : ""} link`}
                >
                  {corpo}
                </Link>
              ) : (
                <div key={t.id} className="tripulante-card">
                  {corpo}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Navios ─────────────────────────────────────────── */}
      <section style={{ marginTop: 28 }}>
        <div className="section-header">
          <i className="fas fa-ship" style={{ color: "var(--accent)" }} />
          <h3>{navios.fichas.length > 1 ? `Navios (${navios.fichas.length})` : "Navio"}</h3>
          {navios.fichas.length > 0 && navios.fichas.length < MAX_SUBFICHAS_DA_MESA && (
            <button
              type="button"
              className="btn-rect outline sm section-header-acao"
              onClick={() => setModal({ ficha: null })}
            >
              <i className="fas fa-plus" /> Novo navio
            </button>
          )}
        </div>

        {navios.fichas.length === 0 ? (
          <div className="subficha-vazio">
            <p>A tripulação ainda não tem um navio.</p>
            <button
              type="button"
              className="btn-rect outline"
              onClick={() => setModal({ ficha: null })}
            >
              <i className="fas fa-plus" /> Criar navio
            </button>
          </div>
        ) : (
          <div className="subfichas-grade">
            {navios.fichas.map((n) => (
              <CardSubficha
                key={n.id}
                ficha={n}
                onPv={(pv) => navios.pv(n, pv)}
                onEditar={() => setModal({ ficha: n })}
                onApagar={() => navios.apagar(n)}
              />
            ))}
          </div>
        )}
      </section>

      {modal && (
        <ModalSubficha
          inicial={modal.ficha}
          perfis={["veiculo"]}
          daMesa
          onSalvar={(d) => {
            if (modal.ficha) navios.editar(modal.ficha, d);
            else navios.criar(d);
            setModal(null);
          }}
          onCancelar={() => setModal(null)}
        />
      )}
    </div>
  );
}
