"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  aggregatePericiasForMesa,
  aggregateSalvaguardasForMesa,
  calcularBonusTesteMesa,
  criarSolicitacaoTeste,
} from "./actions";
import type { MensagemSerializada } from "@/lib/mensagens";
import { ATRIBUTOS, type Atributo } from "@/lib/op-rpg";

type AbaTeste = "pericias" | "salvaguardas";
type ModoTeste = "normal" | "vantagem" | "desvantagem";

type PericiaAgregada = {
  chave: string;
  nome: string;
  atributo: Atributo;
  siglaAtributo: string;
  slugCanonico: string | null;
  origem: "canonica" | "custom";
  quantidade: number;
  personagensIds: string[];
  label: string;
};

type SalvaguardaAgregada = {
  chave: string;
  atributo: Atributo;
  nome: string;
  sigla: string;
  quantidade: number;
  label: string;
};

type Props = {
  mesaId: string;
  aberto: boolean;
  onFechar: () => void;
  onCriada: (msg: MensagemSerializada) => void;
  personagens?: { id: string; nome: string; fotoUrl?: string | null }[];
};

export function ModalSolicitarTeste({ mesaId, aberto, onFechar, onCriada, personagens }: Props) {
  const [aba, setAba] = useState<AbaTeste>("pericias");
  const [filtroAtributo, setFiltroAtributo] = useState<Atributo | "">("");
  const [pericias, setPericias] = useState<PericiaAgregada[]>([]);
  const [salvaguardas, setSalvaguardas] = useState<SalvaguardaAgregada[]>([]);
  const [periciaSelecionada, setPericiaSelecionada] = useState("");
  const [salvaguardaSelecionada, setSalvaguardaSelecionada] = useState<Atributo>("forca");
  const [cd, setCd] = useState(10);
  const [ocultarCd, setOcultarCd] = useState(false);
  const [ocultarRolagem, setOcultarRolagem] = useState(false);
  const [ocultarResultado, setOcultarResultado] = useState(false);
  const [privacidadeAberta, setPrivacidadeAberta] = useState(false);
  const [alvos, setAlvos] = useState<string[] | "TODOS">("TODOS");
  const [modosPorAlvo, setModosPorAlvo] = useState<Record<string, ModoTeste>>({});
  const [bonusPorAlvo, setBonusPorAlvo] = useState<Record<string, { bonus: number; detalhe: string }>>({});
  const [carregandoMeta, setCarregandoMeta] = useState(false);
  const [carregandoBonus, setCarregandoBonus] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const personagensLista = personagens ?? [];

  const periciasFiltradas = useMemo(() => {
    return pericias.filter((p) => !filtroAtributo || p.atributo === filtroAtributo);
  }, [pericias, filtroAtributo]);

  const periciaAtual = useMemo(
    () => pericias.find((p) => p.chave === periciaSelecionada) ?? null,
    [pericias, periciaSelecionada],
  );

  const selecaoAtual = useMemo(() => {
    if (aba === "salvaguardas") {
      return {
        tipo: "salvaguarda" as const,
        atributo: salvaguardaSelecionada,
      };
    }
    if (!periciaAtual) return null;
    return {
      tipo: "pericia" as const,
      chave: periciaAtual.chave,
      nome: periciaAtual.nome,
      atributo: periciaAtual.atributo,
      slugCanonico: periciaAtual.slugCanonico,
    };
  }, [aba, periciaAtual, salvaguardaSelecionada]);

  const alvosEfetivos = useMemo(
    () => (alvos === "TODOS" ? personagensLista.map((p) => p.id) : alvos),
    [alvos, personagensLista],
  );

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    setCarregandoMeta(true);
    void Promise.all([aggregatePericiasForMesa(mesaId), aggregateSalvaguardasForMesa(mesaId)])
      .then(([periciasServidor, salvaguardasServidor]) => {
        if (!ativo) return;
        const listagemPericias = periciasServidor as PericiaAgregada[];
        const listagemSalvaguardas = salvaguardasServidor as SalvaguardaAgregada[];
        setPericias(listagemPericias);
        setSalvaguardas(listagemSalvaguardas);

        if (!periciaSelecionada && listagemPericias.length > 0) {
          setPericiaSelecionada(listagemPericias[0].chave);
        }

        if (listagemSalvaguardas.length > 0 && !listagemSalvaguardas.some((s) => s.atributo === salvaguardaSelecionada)) {
          setSalvaguardaSelecionada(listagemSalvaguardas[0].atributo);
        }
      })
      .catch(async (error) => {
        if (!ativo) return;
        await Swal.fire({
          icon: "error",
          title: "Erro",
          text: error instanceof Error ? error.message : "Erro ao carregar opções de teste.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      })
      .finally(() => {
        if (ativo) setCarregandoMeta(false);
      });

    return () => {
      ativo = false;
    };
  }, [aberto, mesaId, periciaSelecionada, salvaguardaSelecionada]);

  useEffect(() => {
    if (!aberto || !selecaoAtual) {
      setBonusPorAlvo({});
      return;
    }

    let ativo = true;
    setCarregandoBonus(true);
    void calcularBonusTesteMesa(mesaId, selecaoAtual, alvos === "TODOS" ? "TODOS" : alvos)
      .then((resultado) => {
        if (!ativo) return;
        const mapa: Record<string, { bonus: number; detalhe: string }> = {};
        for (const item of resultado) {
          mapa[item.personagemId] = { bonus: item.bonus, detalhe: item.detalhe };
        }
        setBonusPorAlvo(mapa);
      })
      .catch((error) => {
        console.error(error);
        if (ativo) setBonusPorAlvo({});
      })
      .finally(() => {
        if (ativo) setCarregandoBonus(false);
      });

    return () => {
      ativo = false;
    };
  }, [aberto, selecaoAtual, mesaId, alvos]);

  if (!aberto) return null;

  function alternarModo(personagemId: string, modo: Exclude<ModoTeste, "normal">) {
    setModosPorAlvo((atual) => {
      const atualModo = atual[personagemId] ?? "normal";
      if (atualModo === modo) {
        return { ...atual, [personagemId]: "normal" };
      }
      return { ...atual, [personagemId]: modo };
    });
  }

  async function enviar() {
    if (!selecaoAtual) return;

    if (alvos !== "TODOS" && alvos.length === 0) {
      await Swal.fire({
        icon: "warning",
        title: "Selecione ao menos um alvo",
        text: "Escolha jogadores específicos ou use a opção Todos.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }

    setEnviando(true);
    try {
      const alvosIds = alvos === "TODOS" ? "TODOS" : alvos;

      const modosSelecionados: Record<string, ModoTeste> = {};
      for (const personagemId of alvosEfetivos) {
        modosSelecionados[personagemId] = modosPorAlvo[personagemId] ?? "normal";
      }

      const msg = await criarSolicitacaoTeste(mesaId, {
        selecao: selecaoAtual,
        cd,
        privacidade: {
          ocultarCd,
          ocultarRolagem,
          ocultarResultado,
        },
        alvos: alvosIds,
        modosPorAlvo: modosSelecionados,
      });
      onCriada({
        id: msg.id,
        sessionId: msg.sessionId,
        uid: msg.uid,
        nome: msg.nome,
        mensagem: msg.mensagem,
        timestamp: msg.timestamp.toISOString(),
        tipo: msg.tipo,
        total: msg.total,
        modificador: msg.modificador,
        detalhes: msg.detalhes,
      });
      onFechar();
      setCd(10);
      setOcultarCd(false);
      setOcultarRolagem(false);
      setOcultarResultado(false);
      setModosPorAlvo({});
      setAlvos("TODOS");
      setPrivacidadeAberta(false);
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Erro",
        text: error instanceof Error ? error.message : "Erro ao criar teste.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="narrador-modal-overlay" onClick={onFechar}>
      <div className="narrador-modal narrador-modal-lg" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="narrador-modal-close" onClick={onFechar} aria-label="Fechar">
          ×
        </button>
        <h3>Solicitar Teste</h3>

        <div className="narrador-subtabs" role="tablist" aria-label="Tipo de teste">
          <button
            type="button"
            className={"narrador-subtab" + (aba === "pericias" ? " active" : "")}
            onClick={() => setAba("pericias")}
          >
            Perícias
          </button>
          <button
            type="button"
            className={"narrador-subtab" + (aba === "salvaguardas" ? " active" : "")}
            onClick={() => setAba("salvaguardas")}
          >
            Salvaguardas
          </button>
        </div>

        {aba === "pericias" ? (
          <>
            <label>
              Filtro de atributo (opcional)
              <select
                value={filtroAtributo}
                onChange={(e) => setFiltroAtributo((e.target.value as Atributo | "") || "")}
              >
                <option value="">Todos</option>
                {ATRIBUTOS.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.sigla} - {a.nome}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Selecione a perícia
              <select
                value={periciaSelecionada}
                onChange={(e) => setPericiaSelecionada(e.target.value)}
                disabled={carregandoMeta}
              >
                {periciasFiltradas.length === 0 && <option value="">Nenhuma perícia encontrada</option>}
                {periciasFiltradas.map((item) => (
                  <option key={item.chave} value={item.chave}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <label>
            Selecione a salvaguarda
            <select
              value={salvaguardaSelecionada}
              onChange={(e) => setSalvaguardaSelecionada(e.target.value as Atributo)}
              disabled={carregandoMeta}
            >
              {salvaguardas.map((item) => (
                <option key={item.chave} value={item.atributo}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          CD
          <input type="number" value={cd} onChange={(e) => setCd(Number(e.target.value) || 0)} min={0} />
        </label>

        <div>
          <div className="modal-secao">Alvos</div>
          <div className="alvos-grid">
            <button
              type="button"
              className={"alvo-card" + (alvos === "TODOS" ? " selected" : "")}
              onClick={() => setAlvos("TODOS")}
              title="Selecionar Todos"
            >
              <div className="alvo-avatar alvo-all">
                <i className="fas fa-users" />
              </div>
              <div className="alvo-nome">Todos</div>
            </button>
            {personagens && personagens.length > 0 && personagens.map((p) => {
              const primeiro = p.nome.split(" ")[0] || p.nome;
              const selected = alvos === "TODOS" ? false : (alvos as string[]).includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={"alvo-card" + (selected ? " selected" : "")}
                  onClick={() => {
                    if (alvos === "TODOS") setAlvos([p.id]);
                    else {
                      const setA = new Set(alvos as string[]);
                      if (setA.has(p.id)) setA.delete(p.id);
                      else setA.add(p.id);
                      setAlvos(Array.from(setA));
                    }
                  }}
                >
                  <div className="alvo-avatar">
                    {p.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.fotoUrl} alt={p.nome} />
                    ) : (
                      <div className="alvo-initial">{(primeiro || "?").charAt(0)}</div>
                    )}
                  </div>
                  <div className="alvo-nome">{primeiro}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="narrador-modos-lista">
          {personagensLista
            .filter((p) => alvos === "TODOS" || alvos.includes(p.id))
            .map((p) => {
              const modo = modosPorAlvo[p.id] ?? "normal";
              const bonus = bonusPorAlvo[p.id];
              return (
                <div key={p.id} className="narrador-modo-item">
                  <div className="narrador-modo-topo">
                    <strong>{p.nome}</strong>
                    <div className="narrador-d20-group">
                      <button
                        type="button"
                        className={"narrador-d20-btn vantagem" + (modo === "vantagem" ? " active" : "")}
                        onClick={() => alternarModo(p.id, "vantagem")}
                        title="Vantagem"
                      >
                        <i className="fas fa-dice-d20" />
                      </button>
                      <button
                        type="button"
                        className={"narrador-d20-btn desvantagem" + (modo === "desvantagem" ? " active" : "")}
                        onClick={() => alternarModo(p.id, "desvantagem")}
                        title="Desvantagem"
                      >
                        <i className="fas fa-dice-d20" />
                      </button>
                    </div>
                  </div>
                  <div className="narrador-bonus-linha" title={bonus?.detalhe ?? "Bônus aguardando cálculo"}>
                    {carregandoBonus
                      ? "Bônus: calculando..."
                      : `Bônus: ${bonus ? (bonus.bonus >= 0 ? `+${bonus.bonus}` : String(bonus.bonus)) : "+0"}`}
                  </div>
                </div>
              );
            })}
        </div>

        <div className="narrador-privacidade-wrap">
          <button
            type="button"
            className={"narrador-privacidade-toggle" + (privacidadeAberta ? " open" : "")}
            onClick={() => setPrivacidadeAberta((v) => !v)}
          >
            <span>Privacidade</span>
            <i className="fas fa-chevron-down" />
          </button>
          <div className={"narrador-privacidade-conteudo" + (privacidadeAberta ? " open" : "") }>
            <label className="narrador-check">
              <input
                type="checkbox"
                checked={ocultarCd}
                onChange={(e) => setOcultarCd(e.target.checked)}
              />
              CD oculta
            </label>
            <label className="narrador-check">
              <input
                type="checkbox"
                checked={ocultarRolagem}
                onChange={(e) => setOcultarRolagem(e.target.checked)}
              />
              Rolagem oculta
            </label>
            <label className="narrador-check">
              <input
                type="checkbox"
                checked={ocultarResultado}
                onChange={(e) => setOcultarResultado(e.target.checked)}
              />
              Resultado oculto
            </label>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-btn-cancel" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="modal-btn-save" onClick={enviar} disabled={enviando}>
            {enviando ? "Enviando..." : "Solicitar"}
          </button>
        </div>
      </div>
    </div>
  );
}
