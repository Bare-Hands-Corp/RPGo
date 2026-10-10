"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { modificador } from "@/lib/op-rpg";
import { rolarDados } from "@/lib/dice";
import {
  iniciarSessao,
  encerrarSessao,
  iniciarCombate,
  adicionarParticipantes,
  removerParticipante,
  atualizarPvInstancia,
  atualizarPvPersonagem,
  avancarTurno,
  encerrarCombate,
} from "./actions";
import { SessaoRealtime } from "./sessao-realtime";
import { EditavelComDelta } from "@/app/bestiario/inputs";
import { FichaCriaturaView } from "@/app/bestiario/ficha-view";
import type {
  CriaturaParaCombate,
  EncontroParaCombate,
  NovoParticipante,
  PersonagemParaCombate,
  SessaoSerializada,
} from "./types";

type Props = {
  mesaId: string;
  sessaoInicial: SessaoSerializada | null;
  criaturas: CriaturaParaCombate[];
  personagensMesa: PersonagemParaCombate[];
  encontros: EncontroParaCombate[];
};

function uuid() {
  return crypto.randomUUID();
}

type LinhaBuilder = NovoParticipante & { id: string; nome: string };

function rolarIniciativa(destreza: number): number {
  return rolarDados([{ faces: 20, sinal: 1 }], modificador(destreza)).total;
}

// Formulário de escolha de participantes, reaproveitado tanto pra iniciar um
// combate quanto pra adicionar reforços no meio de um já em andamento (ex:
// Tropas Intermináveis, que spawna soldados quando um morre).
function ParticipanteBuilder({
  criaturas,
  personagensMesa,
  encontros,
  onConfirmar,
  textoBotao,
  personagemIdsNoCombate = [],
}: {
  criaturas: CriaturaParaCombate[];
  personagensMesa: PersonagemParaCombate[];
  encontros: EncontroParaCombate[];
  onConfirmar: (participantes: NovoParticipante[]) => void;
  textoBotao: string;
  // Jogadores já em combate (relevante só ao adicionar reforço no meio de um
  // combate ativo) — não aparecem nos seletores, pra não duplicar a entrada.
  personagemIdsNoCombate?: string[];
}) {
  const [linhas, setLinhas] = useState<LinhaBuilder[]>([]);
  const [criaturaEscolhida, setCriaturaEscolhida] = useState("");
  const [jogadorEscolhido, setJogadorEscolhido] = useState("");

  const jogadoresDisponiveis = personagensMesa.filter(
    (p) => !personagemIdsNoCombate.includes(p.id) && !linhas.some((l) => l.personagemId === p.id),
  );

  function adicionarLinha(linha: LinhaBuilder) {
    setLinhas((atual) => [...atual, linha]);
  }

  function adicionarTodosJogadores() {
    const novas = jogadoresDisponiveis.map((p) => ({
      id: uuid(),
      nome: p.nome,
      personagemId: p.id,
      quantidade: 1,
      iniciativa: rolarIniciativa(p.destreza),
      agrupar: false,
    }));
    setLinhas((atual) => [...atual, ...novas]);
  }

  function adicionarEncontro(encontroId: string) {
    const encontro = encontros.find((e) => e.id === encontroId);
    if (!encontro) return;
    const novas: LinhaBuilder[] = encontro.itens
      .map((item): LinhaBuilder | null => {
        const criatura = criaturas.find((c) => c.id === item.criaturaId);
        if (!criatura) return null;
        return {
          id: uuid(),
          nome: criatura.nome,
          criaturaId: criatura.id,
          personagemId: undefined,
          quantidade: item.quantidade,
          iniciativa: rolarIniciativa(criatura.destreza),
          agrupar: true,
        };
      })
      .filter((x): x is LinhaBuilder => x !== null);
    setLinhas((atual) => [...atual, ...novas]);
  }

  return (
    <div className="sessao-builder">
      <div className="sessao-builder-atalhos">
        {jogadoresDisponiveis.length > 0 && (
          <>
            <select value={jogadorEscolhido} onChange={(e) => setJogadorEscolhido(e.target.value)}>
              <option value="">Escolher jogador...</option>
              {jogadoresDisponiveis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="bestiario-btn-add"
              onClick={() => {
                const personagem = jogadoresDisponiveis.find((p) => p.id === jogadorEscolhido);
                if (!personagem) return;
                adicionarLinha({
                  id: uuid(),
                  nome: personagem.nome,
                  personagemId: personagem.id,
                  quantidade: 1,
                  iniciativa: rolarIniciativa(personagem.destreza),
                  agrupar: false,
                });
                setJogadorEscolhido("");
              }}
            >
              + Adicionar jogador
            </button>
            <button type="button" className="bestiario-btn-add" onClick={adicionarTodosJogadores}>
              + Todos os jogadores
            </button>
          </>
        )}
        {encontros.length > 0 && (
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) adicionarEncontro(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="" disabled>
              Inserir encontro salvo...
            </option>
            {encontros.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        )}
        <select value={criaturaEscolhida} onChange={(e) => setCriaturaEscolhida(e.target.value)}>
          <option value="">Escolher criatura do bestiário...</option>
          {criaturas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} (ND {c.nd})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="bestiario-btn-add"
          onClick={() => {
            const criatura = criaturas.find((c) => c.id === criaturaEscolhida);
            if (!criatura) return;
            adicionarLinha({
              id: uuid(),
              nome: criatura.nome,
              criaturaId: criatura.id,
              quantidade: 1,
              iniciativa: rolarIniciativa(criatura.destreza),
              agrupar: false,
            });
            setCriaturaEscolhida("");
          }}
        >
          + Adicionar criatura
        </button>
      </div>

      <div className="bestiario-lista-linhas">
        {linhas.map((linha) => (
          <div key={linha.id} className="sessao-linha-participante">
            <span className="sessao-linha-nome">{linha.nome}</span>
            {linha.criaturaId && (
              <label className="sessao-linha-campo">
                Qtd
                <input
                  type="number"
                  min={1}
                  value={linha.quantidade}
                  onChange={(e) =>
                    setLinhas((atual) =>
                      atual.map((l) => (l.id === linha.id ? { ...l, quantidade: Number(e.target.value) || 1 } : l)),
                    )
                  }
                />
              </label>
            )}
            {linha.criaturaId && linha.quantidade > 1 && (
              <label className="sessao-linha-campo sessao-linha-checkbox">
                <input
                  type="checkbox"
                  checked={linha.agrupar}
                  onChange={(e) =>
                    setLinhas((atual) => atual.map((l) => (l.id === linha.id ? { ...l, agrupar: e.target.checked } : l)))
                  }
                />
                Agrupar iniciativa
              </label>
            )}
            <label className="sessao-linha-campo">
              Iniciativa
              <input
                type="number"
                value={linha.iniciativa}
                onChange={(e) =>
                  setLinhas((atual) =>
                    atual.map((l) => (l.id === linha.id ? { ...l, iniciativa: Number(e.target.value) || 0 } : l)),
                  )
                }
              />
            </label>
            <button type="button" onClick={() => setLinhas((atual) => atual.filter((l) => l.id !== linha.id))}>
              <i className="fas fa-xmark" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="bestiario-btn-salvar"
        disabled={linhas.length === 0}
        onClick={() =>
          onConfirmar(
            linhas.map((l) => ({
              criaturaId: l.criaturaId,
              personagemId: l.personagemId,
              quantidade: l.quantidade,
              iniciativa: l.iniciativa,
              agrupar: l.agrupar,
            })),
          )
        }
      >
        {textoBotao}
      </button>
    </div>
  );
}

export function SessaoPainel({ mesaId, sessaoInicial, criaturas, personagensMesa, encontros }: Props) {
  const router = useRouter();
  const [sessao, setSessao] = useState(sessaoInicial);
  const [sessaoPropSincronizada, setSessaoPropSincronizada] = useState(sessaoInicial);
  const [pvOverrides, setPvOverrides] = useState<Record<string, number>>({});
  const [mostrarBuilder, setMostrarBuilder] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [criaturaAberta, setCriaturaAberta] = useState<CriaturaParaCombate | null>(null);
  const [criaturaAbertaInstanciaId, setCriaturaAbertaInstanciaId] = useState<string | null>(null);
  // Usos de ação gastos por cópia da criatura em combate (instanciaId ->
  // componenteId -> restantes). Só existe no navegador — não é persistido no
  // servidor (a InstanciaCombate já some quando o combate termina, então uma
  // combate novo já nasce com os usos cheios de novo sem precisar de reset).
  const [usosOverrides, setUsosOverrides] = useState<Record<string, Record<string, number>>>({});

  // `useState(sessaoInicial)` só usa o valor inicial no mount — sem isso, uma
  // atualização vinda de outra aba/realtime (router.refresh() troca a prop)
  // nunca chegaria aqui. Resincroniza durante o render, não em useEffect.
  if (sessaoInicial !== sessaoPropSincronizada) {
    setSessaoPropSincronizada(sessaoInicial);
    setSessao(sessaoInicial);
    setPvOverrides({});
    setUsosOverrides({});
  }

  async function comErro<T>(fn: () => Promise<T>): Promise<T | null> {
    setProcessando(true);
    try {
      return await fn();
    } catch (err) {
      void Swal.fire({
        icon: "error",
        title: "Erro",
        text: err instanceof Error ? err.message : "Tente novamente.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return null;
    } finally {
      setProcessando(false);
    }
  }

  async function handleIniciarSessao() {
    const nova = await comErro(() => iniciarSessao(mesaId));
    if (nova) {
      setSessao(nova);
      router.refresh();
    }
  }

  async function handleEncerrarSessao() {
    if (!sessao) return;
    const confirmacao = await Swal.fire({
      icon: "warning",
      title: "Encerrar sessão?",
      showCancelButton: true,
      confirmButtonText: "Sim, encerrar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirmacao.isConfirmed) return;
    await comErro(() => encerrarSessao(mesaId, sessao.id));
    setSessao(null);
    router.refresh();
  }

  async function handleIniciarCombate(participantes: NovoParticipante[]) {
    if (!sessao) return;
    const expandido = expandirParticipantes(participantes, criaturas);
    const nova = await comErro(() => iniciarCombate(mesaId, sessao.id, expandido));
    if (nova) {
      setSessao(nova);
      setMostrarBuilder(false);
      router.refresh();
    }
  }

  async function handleAdicionarParticipantes(participantes: NovoParticipante[]) {
    if (!sessao?.combateAtivo) return;
    const expandido = expandirParticipantes(participantes, criaturas);
    const nova = await comErro(() => adicionarParticipantes(mesaId, sessao.combateAtivo!.id, expandido));
    if (nova) {
      setSessao(nova);
      setMostrarBuilder(false);
      router.refresh();
    }
  }

  async function handleRemover(instanciaId: string) {
    const nova = await comErro(() => removerParticipante(mesaId, instanciaId));
    if (nova) setSessao(nova);
  }

  async function handleAvancarTurno() {
    const combate = sessao?.combateAtivo;
    if (!sessao || !combate) return;

    // Atualização otimista — mesma conta que o servidor faz (avança 1, vira
    // rodada ao passar do fim). Mostra na hora, sem esperar o roundtrip.
    const total = combate.participantes.length;
    let turno = combate.turnoAtual + 1;
    let rodada = combate.rodadaAtual;
    if (total === 0 || turno >= total) {
      turno = 0;
      rodada += 1;
    }
    setSessao({ ...sessao, combateAtivo: { ...combate, turnoAtual: turno, rodadaAtual: rodada } });

    const nova = await comErro(() => avancarTurno(mesaId, combate.id));
    if (nova) setSessao(nova);
  }

  async function handleEncerrarCombate() {
    if (!sessao?.combateAtivo) return;
    const confirmacao = await Swal.fire({
      icon: "warning",
      title: "Encerrar combate?",
      text: "As instâncias das criaturas serão removidas (um resumo fica salvo no histórico).",
      showCancelButton: true,
      confirmButtonText: "Sim, encerrar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirmacao.isConfirmed) return;
    const nova = await comErro(() => encerrarCombate(mesaId, sessao.combateAtivo!.id));
    if (nova) setSessao(nova);
  }

  const combate = sessao?.combateAtivo ?? null;

  return (
    <div className="sessao-painel">
      <SessaoRealtime mesaId={mesaId} sessaoId={sessao?.id ?? null} combateId={combate?.id ?? null} />

      {!sessao ? (
        <div className="sessao-vazio">
          <p>Nenhuma sessão ativa nesta mesa.</p>
          <button type="button" className="bestiario-btn-salvar" onClick={handleIniciarSessao} disabled={processando}>
            <i className="fas fa-play" /> Iniciar sessão
          </button>
        </div>
      ) : !combate ? (
        <div className="sessao-sem-combate">
          <div className="sessao-topo-acoes">
            <span className="sessao-status">
              <i className="fas fa-circle" style={{ color: "#4caf50" }} /> Sessão ativa
            </span>
            <button type="button" className="bestiario-btn-remover" onClick={handleEncerrarSessao} disabled={processando}>
              Encerrar sessão
            </button>
          </div>

          {!mostrarBuilder ? (
            <button type="button" className="bestiario-btn-salvar" onClick={() => setMostrarBuilder(true)}>
              <i className="fas fa-skull" /> Iniciar combate
            </button>
          ) : (
            <ParticipanteBuilder
              criaturas={criaturas}
              personagensMesa={personagensMesa}
              encontros={encontros}
              onConfirmar={handleIniciarCombate}
              textoBotao="Iniciar combate com esses participantes"
            />
          )}
        </div>
      ) : (
        <div className="sessao-combate">
          <div className="sessao-topo-acoes">
            <span className="sessao-status">
              Rodada {combate.rodadaAtual} · Turno de{" "}
              <strong>{combate.participantes[combate.turnoAtual]?.nomeExibicao ?? "—"}</strong>
            </span>
            <div className="sessao-topo-botoes">
              <button type="button" className="bestiario-btn-add" onClick={handleAvancarTurno} disabled={processando}>
                <i className="fas fa-forward" /> Próximo turno
              </button>
              <button type="button" className="bestiario-btn-remover" onClick={handleEncerrarCombate} disabled={processando}>
                Encerrar combate
              </button>
            </div>
          </div>

          <div className="sessao-iniciativa-lista">
            {combate.participantes.map((p, indice) => {
              const personagem = p.personagemId ? personagensMesa.find((x) => x.id === p.personagemId) : null;
              const pvServidor = p.personagemId ? personagem?.hpAtual ?? 0 : p.pvAtual ?? 0;
              // Override local otimista — o campo mostra o que o mestre acabou
              // de digitar em vez de esperar o roundtrip do servidor/realtime.
              const pvExibido = pvOverrides[p.id] ?? pvServidor;
              const pvMax = p.personagemId ? personagem?.hpMax ?? 0 : p.pvMax ?? 0;
              const ehTurnoAtual = indice === combate.turnoAtual;

              return (
                <div key={p.id} className={"sessao-linha-iniciativa" + (ehTurnoAtual ? " ativo" : "")}>
                  <span className="sessao-iniciativa-valor">{p.iniciativa}</span>
                  <span className="sessao-iniciativa-nome">
                    {p.criaturaId ? (
                      <button
                        type="button"
                        className="sessao-nome-link"
                        onClick={() => {
                          const c = criaturas.find((x) => x.id === p.criaturaId);
                          if (c) {
                            setCriaturaAberta(c);
                            setCriaturaAbertaInstanciaId(p.id);
                          }
                        }}
                        title="Ver ficha"
                      >
                        {p.nomeExibicao}
                      </button>
                    ) : (
                      <>
                        {p.nomeExibicao} {p.personagemId && <em>(jogador)</em>}
                      </>
                    )}
                  </span>
                  <EditavelComDelta
                    className="sessao-iniciativa-pv"
                    value={pvExibido}
                    max={pvMax || undefined}
                    onChange={(novo) => {
                      setPvOverrides((atual) => ({ ...atual, [p.id]: novo }));
                      if (p.personagemId) void atualizarPvPersonagem(mesaId, p.personagemId, novo);
                      else void atualizarPvInstancia(mesaId, p.id, novo);
                    }}
                  />
                  <span className="sessao-iniciativa-pvmax">/ {pvMax} PV</span>
                  <button type="button" onClick={() => handleRemover(p.id)} title="Remover do combate">
                    <i className="fas fa-xmark" />
                  </button>
                </div>
              );
            })}
          </div>

          {!mostrarBuilder ? (
            <button type="button" className="bestiario-btn-add" onClick={() => setMostrarBuilder(true)}>
              + Adicionar participante
            </button>
          ) : (
            <ParticipanteBuilder
              criaturas={criaturas}
              personagensMesa={personagensMesa}
              encontros={encontros}
              onConfirmar={handleAdicionarParticipantes}
              textoBotao="Adicionar ao combate"
              personagemIdsNoCombate={combate.participantes.filter((p) => p.personagemId).map((p) => p.personagemId!)}
            />
          )}
        </div>
      )}

      {criaturaAberta && criaturaAbertaInstanciaId && (
        <div
          className="modal-overlay"
          onClick={() => {
            setCriaturaAberta(null);
            setCriaturaAbertaInstanciaId(null);
          }}
        >
          <div className="modal-box modal-box-grande sessao-modal-ficha" onClick={(e) => e.stopPropagation()}>
            <FichaCriaturaView
              criatura={criaturaAberta}
              onFechar={() => {
                setCriaturaAberta(null);
                setCriaturaAbertaInstanciaId(null);
              }}
              permitirRolagem
              usosContexto={{
                usosAcoes: usosOverrides[criaturaAbertaInstanciaId] ?? {},
                onDefinir: (componenteId, novoValor) => {
                  const instanciaId = criaturaAbertaInstanciaId;
                  setUsosOverrides((atual) => ({
                    ...atual,
                    [instanciaId]: { ...(atual[instanciaId] ?? {}), [componenteId]: novoValor },
                  }));
                },
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// "Agrupar iniciativa" (padrão, 1 rolagem pra todas as cópias — já é o que
// `iniciarCombate`/`adicionarParticipantes` fazem ao repetir `iniciativa` em
// cada cópia) vs. "individual": aqui é onde a segunda opção vira realidade —
// desmembra a linha em N participantes de quantidade 1, cada um com uma
// rolagem própria a partir da Destreza da criatura.
function expandirParticipantes(participantes: NovoParticipante[], criaturas: CriaturaParaCombate[]): NovoParticipante[] {
  const resultado: NovoParticipante[] = [];
  for (const p of participantes) {
    if (p.criaturaId && p.quantidade > 1 && !p.agrupar) {
      const destreza = criaturas.find((c) => c.id === p.criaturaId)?.destreza ?? 10;
      for (let i = 0; i < p.quantidade; i += 1) {
        resultado.push({ ...p, quantidade: 1, iniciativa: rolarIniciativa(destreza) });
      }
    } else {
      resultado.push(p);
    }
  }
  return resultado;
}
