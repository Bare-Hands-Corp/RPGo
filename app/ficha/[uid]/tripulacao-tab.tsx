"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import {
  TAMANHOS_NAVIO,
  MADEIRAS_NAVIO,
  statsTamanho,
  statsMadeira,
  type MadeiraNavio,
  type TamanhoNavio,
} from "@/lib/navio";
import { criarNavio, deletarNavio, patchNavio } from "./actions";

export type Tripulante = {
  id: string;
  nome: string;
  fotoUrl: string | null;
  nivel: number;
  hpAtual: number;
  hpMax: number;
};

export type NavioRow = {
  id: string;
  nome: string;
  tamanho: string;
  madeira: string;
  pvAtual: number;
  velocidadeNos: number;
  canhoes: number;
  descricao: string;
};

type Props = {
  personagemId: string;
  mesaId: string | null;
  isNarradorDaMesa: boolean;
  tripulantes: Tripulante[];
  navio: NavioRow | null;
};

function mostrarErro(err: unknown) {
  Swal.fire({
    icon: "error",
    title: "Erro",
    text: err instanceof Error ? err.message : "Operação falhou.",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

// Reducer do otimismo do navio: cria/atualiza/remove em um só estado.
type NavioAcao =
  | { kind: "set"; navio: NavioRow }
  | { kind: "patch"; patch: Partial<NavioRow> }
  | { kind: "clear" };

function reduzNavio(state: NavioRow | null, acao: NavioAcao): NavioRow | null {
  if (acao.kind === "set") return acao.navio;
  if (acao.kind === "clear") return null;
  return state ? { ...state, ...acao.patch } : state;
}

const avatarDe = (t: { fotoUrl: string | null; id: string }) =>
  t.fotoUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${t.id}`;

export function TripulacaoTab({
  personagemId,
  mesaId,
  isNarradorDaMesa,
  tripulantes,
  navio: navioServer,
}: Props) {
  const [navio, aplicarNavio] = useOptimistic(navioServer, reduzNavio);
  const [, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);

  if (!mesaId) {
    return (
      <div className="placeholder-tab">
        <i className="fas fa-users" />
        <p>Entre em uma mesa para ver a tripulação e o navio.</p>
      </div>
    );
  }

  function criar() {
    startTransition(async () => {
      const base = statsTamanho("pequeno");
      aplicarNavio({
        kind: "set",
        navio: {
          id: "temp",
          nome: "Novo Navio",
          tamanho: "pequeno",
          madeira: "cedro",
          pvAtual: base.pvMax,
          velocidadeNos: 0,
          canhoes: 0,
          descricao: "",
        },
      });
      try {
        await criarNavio(personagemId);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function salvarEdicao(dados: Partial<NavioRow>) {
    setEditando(false);
    startTransition(async () => {
      aplicarNavio({ kind: "patch", patch: dados });
      try {
        await patchNavio(personagemId, dados);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function ajustarPv(novo: number) {
    const pvAtual = Math.max(0, Math.trunc(novo) || 0);
    startTransition(async () => {
      aplicarNavio({ kind: "patch", patch: { pvAtual } });
      try {
        await patchNavio(personagemId, { pvAtual });
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  async function apagar() {
    const r = await Swal.fire({
      icon: "warning",
      title: "Apagar o navio?",
      text: "A ficha do navio da tripulação será removida.",
      showCancelButton: true,
      confirmButtonText: "Apagar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!r.isConfirmed) return;
    startTransition(async () => {
      aplicarNavio({ kind: "clear" });
      try {
        await deletarNavio(personagemId);
      } catch (err) {
        mostrarErro(err);
      }
    });
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

      {/* ─── Navio ──────────────────────────────────────────── */}
      <section style={{ marginTop: 28 }}>
        <div className="section-header">
          <i className="fas fa-ship" style={{ color: "var(--color-power)" }} />
          <h3>Navio</h3>
        </div>

        {!navio ? (
          <div className="navio-vazio">
            <p style={{ color: "var(--text-sec)", marginBottom: 12 }}>
              A tripulação ainda não tem um navio.
            </p>
            <button type="button" className="btn-rect outline" onClick={criar}>
              <i className="fas fa-plus" /> Criar navio
            </button>
          </div>
        ) : (
          <NavioFicha
            navio={navio}
            onEditar={() => setEditando(true)}
            onApagar={apagar}
            onPv={ajustarPv}
          />
        )}
      </section>

      {editando && navio && (
        <ModalNavio
          inicial={navio}
          onSalvar={salvarEdicao}
          onCancelar={() => setEditando(false)}
        />
      )}
    </div>
  );
}

// Card de exibição do navio (read da derivação + controles).
function NavioFicha({
  navio,
  onEditar,
  onApagar,
  onPv,
}: {
  navio: NavioRow;
  onEditar: () => void;
  onApagar: () => void;
  onPv: (novo: number) => void;
}) {
  const t = statsTamanho(navio.tamanho);
  const m = statsMadeira(navio.madeira);
  const pvPct = t.pvMax > 0 ? Math.max(0, Math.min(100, (navio.pvAtual / t.pvMax) * 100)) : 0;
  const canhoesAlem = navio.canhoes > t.canhoesMax;

  return (
    <div className="navio-card">
      <div className="navio-cabecalho">
        <div>
          <span className="navio-nome">{navio.nome || "Navio sem nome"}</span>
          <span className="navio-sub">
            {t.nome} · {m.nome} · {t.dimensao}
          </span>
        </div>
        <div className="navio-acoes">
          <button type="button" className="navio-btn" onClick={onEditar} title="Editar navio">
            <i className="fas fa-pen" />
          </button>
          <button type="button" className="navio-btn rm" onClick={onApagar} title="Apagar navio">
            <i className="fas fa-trash" />
          </button>
        </div>
      </div>

      {/* PV — controle rápido (muda em combate) */}
      <div className="navio-pv">
        <div className="navio-pv-topo">
          <span className="navio-pv-rotulo">
            <i className="fas fa-heart" /> Pontos de Vida
          </span>
          <NavioPv pvAtual={navio.pvAtual} pvMax={t.pvMax} onPv={onPv} />
        </div>
        <div className="navio-pv-barra">
          <div className="navio-pv-fill" style={{ width: `${pvPct}%` }} />
        </div>
      </div>

      {/* Stats derivados + valores */}
      <div className="navio-stats">
        <NavioStat icone="fa-shield-halved" rotulo="CR" valor={m.cr} dica="Classe de Resistência (madeira)" />
        <NavioStat icone="fa-shield" rotulo="BR" valor={m.br} dica="Bônus de Resistência: reduz todo dano recebido" />
        <NavioStat
          icone="fa-bomb"
          rotulo="Canhões"
          valor={`${navio.canhoes} / ${t.canhoesMax}`}
          alerta={canhoesAlem ? "Acima do máximo do tamanho" : undefined}
        />
        <NavioStat icone="fa-gauge-high" rotulo="Velocidade" valor={`${navio.velocidadeNos} nós`} />
        <NavioStat icone="fa-users" rotulo="Tripulantes" valor={`até ${t.tripulantes}`} />
        <NavioStat icone="fa-layer-group" rotulo="Deques" valor={t.deques} />
        <NavioStat icone="fa-door-open" rotulo="Cômodos" valor={`até ${t.comodos}`} />
        <NavioStat
          icone="fa-weight-hanging"
          rotulo="Desac. por peso"
          valor={`${t.desaceleracaoNos} nós`}
        />
      </div>

      {navio.descricao.trim() && <p className="navio-descricao">{navio.descricao}</p>}
    </div>
  );
}

// Controle de PV do navio. −/+ ajustam 10 na hora; o input só comita no
// blur/Enter (buffer local), evitando um patch por tecla. Aceita delta (+N/−N)
// ou valor absoluto, como o EditableStat da sidebar.
function NavioPv({
  pvAtual,
  pvMax,
  onPv,
}: {
  pvAtual: number;
  pvMax: number;
  onPv: (novo: number) => void;
}) {
  const [buffer, setBuffer] = useState<string | null>(null);
  const mostrado = buffer ?? String(pvAtual);

  function commit() {
    if (buffer == null) return;
    const t = buffer.trim();
    setBuffer(null);
    if (!t) return;
    let novo: number;
    if (t.startsWith("+") || t.startsWith("-")) {
      const d = Number(t);
      if (Number.isNaN(d)) return;
      novo = pvAtual + d;
    } else {
      novo = Number(t);
      if (Number.isNaN(novo)) return;
    }
    if (novo !== pvAtual) onPv(novo);
  }

  return (
    <div className="navio-pv-ctrl">
      <button type="button" onClick={() => onPv(pvAtual - 10)} title="−10">
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={mostrado}
        onChange={(e) => setBuffer(e.target.value)}
        onFocus={() => setBuffer(String(pvAtual))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") setBuffer(null);
        }}
      />
      <span className="navio-pv-max">/ {pvMax}</span>
      <button type="button" onClick={() => onPv(pvAtual + 10)} title="+10">
        +
      </button>
    </div>
  );
}

function NavioStat({
  icone,
  rotulo,
  valor,
  dica,
  alerta,
}: {
  icone: string;
  rotulo: string;
  valor: string | number;
  dica?: string;
  alerta?: string;
}) {
  return (
    <div className="navio-stat" title={alerta || dica}>
      <i className={`fas ${icone}`} />
      <div>
        <span className="navio-stat-rotulo">{rotulo}</span>
        <span className={`navio-stat-valor ${alerta ? "alerta" : ""}`}>
          {valor}
          {alerta && <i className="fas fa-triangle-exclamation" style={{ marginLeft: 4 }} />}
        </span>
      </div>
    </div>
  );
}

// Modal de edição do navio. Otimismo fica no pai; aqui só o formulário.
function ModalNavio({
  inicial,
  onSalvar,
  onCancelar,
}: {
  inicial: NavioRow;
  onSalvar: (dados: Partial<NavioRow>) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial.nome);
  const [tamanho, setTamanho] = useState<TamanhoNavio>(inicial.tamanho as TamanhoNavio);
  const [madeira, setMadeira] = useState<MadeiraNavio>(inicial.madeira as MadeiraNavio);
  const [velocidadeNos, setVelocidade] = useState(String(inicial.velocidadeNos));
  const [canhoes, setCanhoes] = useState(String(inicial.canhoes));
  const [descricao, setDescricao] = useState(inicial.descricao);

  function submeter(e: React.FormEvent) {
    e.preventDefault();
    onSalvar({
      nome: nome.trim(),
      tamanho,
      madeira,
      velocidadeNos: Math.max(0, Math.trunc(Number(velocidadeNos) || 0)),
      canhoes: Math.max(0, Math.trunc(Number(canhoes) || 0)),
      descricao: descricao.trim(),
    });
  }

  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2>Editar navio</h2>
        <form onSubmit={submeter}>
          <label>Nome</label>
          <input
            type="text"
            value={nome}
            autoFocus
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex: Going Merry"
          />

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Tamanho</label>
              <select value={tamanho} onChange={(e) => setTamanho(e.target.value as TamanhoNavio)}>
                {TAMANHOS_NAVIO.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.nome} — {t.pvMax} PV
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label>Madeira</label>
              <select value={madeira} onChange={(e) => setMadeira(e.target.value as MadeiraNavio)}>
                {MADEIRAS_NAVIO.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.nome} — CR {m.cr} / BR {m.br}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Velocidade (nós)</label>
              <input
                type="number"
                value={velocidadeNos}
                min={0}
                onChange={(e) => setVelocidade(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Canhões (máx {statsTamanho(tamanho).canhoesMax})</label>
              <input
                type="number"
                value={canhoes}
                min={0}
                onChange={(e) => setCanhoes(e.target.value)}
              />
            </div>
          </div>

          <label style={{ marginTop: 12, display: "block" }}>Descrição</label>
          <textarea
            value={descricao}
            rows={3}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Notas, aparência, modificações…"
          />

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onCancelar}>
              Cancelar
            </button>
            <button type="submit" className="modal-btn-save">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
