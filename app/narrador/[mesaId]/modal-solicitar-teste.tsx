"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import {
  aggregatePericiasForMesa,
  aggregateSalvaguardasForMesa,
  calcularBonusTesteMesa,
  criarSolicitacaoTeste,
} from "./actions";
import type { MensagemSerializada } from "@/lib/mensagens";
import type { Atributo, PericiaSlug } from "@/lib/op-rpg";
import { CampoNumero } from "@/components/campo-numero";
import "./pedir-teste.css";

type ModoTeste = "normal" | "vantagem" | "desvantagem";

type PericiaAgregada = {
  chave: string;
  nome: string;
  atributo: Atributo;
  siglaAtributo: string;
  slugCanonico: PericiaSlug | null;
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

// Perícia e salvaguarda numa lista só: o narrador digita e escolhe.
type Item = {
  chave: string;
  tipo: "pericia" | "salvaguarda";
  nome: string;
  atributo: Atributo;
  sigla: string;
  slugCanonico: PericiaSlug | null;
  busca: string;
};

type Recente = { chave: string; cd: number };

type Dificuldade = { rotulo: string; cd: number };

const DIFICULDADES_PADRAO: Dificuldade[] = [
  { rotulo: "Fácil", cd: 10 },
  { rotulo: "Médio", cd: 15 },
  { rotulo: "Difícil", cd: 20 },
  { rotulo: "Muito difícil", cd: 25 },
];

const chaveDificuldades = (mesaId: string) => `pedir-teste-dificuldades:${mesaId}`;

function lerDificuldades(mesaId: string): Dificuldade[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(chaveDificuldades(mesaId)) ?? "null");
    if (
      Array.isArray(bruto) &&
      bruto.length === DIFICULDADES_PADRAO.length &&
      bruto.every((d) => typeof d?.rotulo === "string" && Number.isFinite(d?.cd))
    ) {
      return bruto.map((d) => ({ rotulo: d.rotulo.slice(0, 20), cd: Math.max(0, Math.round(d.cd)) }));
    }
  } catch {
    /* usa o padrão */
  }
  return DIFICULDADES_PADRAO;
}
const CD_PADRAO = 15;
const MAX_RECENTES = 6;

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const chaveRecentes = (mesaId: string) => `pedir-teste:${mesaId}`;

function lerRecentes(mesaId: string): Recente[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(chaveRecentes(mesaId)) ?? "[]");
    if (!Array.isArray(bruto)) return [];
    return bruto
      .filter((r): r is Recente => typeof r?.chave === "string" && typeof r?.cd === "number")
      .slice(0, MAX_RECENTES);
  } catch {
    return [];
  }
}

function gravarRecente(mesaId: string, atual: Recente) {
  try {
    const lista = [atual, ...lerRecentes(mesaId).filter((r) => r.chave !== atual.chave)].slice(0, MAX_RECENTES);
    localStorage.setItem(chaveRecentes(mesaId), JSON.stringify(lista));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

type Props = {
  mesaId: string;
  aberto: boolean;
  onFechar: () => void;
  onCriada: (msg: MensagemSerializada) => void;
  personagens?: { id: string; nome: string; fotoUrl?: string | null }[];
  /** Jogador já marcado ao abrir (teste pedido pela linha dele). */
  alvoInicial?: string | null;
};

// Monta só com o modal aberto: cada abertura começa do zero.
export function ModalSolicitarTeste(props: Props) {
  if (!props.aberto) return null;
  return <CorpoDoModal {...props} />;
}

function CorpoDoModal({ mesaId, aberto, onFechar, onCriada, personagens, alvoInicial }: Props) {
  const [itens, setItens] = useState<Item[]>([]);
  const [busca, setBusca] = useState("");
  const [destaque, setDestaque] = useState(0);
  const [chaveEscolhida, setChaveEscolhida] = useState<string | null>(null);
  const [recentes] = useState<Recente[]>(() => lerRecentes(mesaId));
  const [cd, setCd] = useState(() => recentes[0]?.cd ?? CD_PADRAO);
  const [dificuldades, setDificuldades] = useState<Dificuldade[]>(() => lerDificuldades(mesaId));
  const [editandoDif, setEditandoDif] = useState(false);
  const [automatica, setAutomatica] = useState(false);

  function salvarDificuldades(lista: Dificuldade[]) {
    setDificuldades(lista);
    try {
      localStorage.setItem(chaveDificuldades(mesaId), JSON.stringify(lista));
    } catch {
      /* sem armazenamento: vale só nesta abertura */
    }
  }
  const [ocultarCd, setOcultarCd] = useState(false);
  const [ocultarRolagem, setOcultarRolagem] = useState(false);
  const [ocultarResultado, setOcultarResultado] = useState(false);
  const [privacidadeAberta, setPrivacidadeAberta] = useState(false);
  const [alvos, setAlvos] = useState<string[] | "TODOS">(alvoInicial ? [alvoInicial] : "TODOS");
  const [modosPorAlvo, setModosPorAlvo] = useState<Record<string, ModoTeste>>({});
  const [bonusPorAlvo, setBonusPorAlvo] = useState<Record<string, { bonus: number; detalhe: string }>>({});
  const [carregandoMeta, setCarregandoMeta] = useState(true);
  // Bônus guardado com a escolha a que pertence: escolha diferente = ainda calculando.
  const [bonusDe, setBonusDe] = useState("");
  const [enviando, setEnviando] = useState(false);
  const campoBusca = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  const personagensLista = useMemo(() => personagens ?? [], [personagens]);

  const resultados = useMemo(() => {
    const termos = normalizar(busca).split(/\s+/).filter(Boolean);
    if (termos.length === 0) return itens;
    return itens
      .filter((i) => termos.every((t) => i.busca.includes(t)))
      .sort((a, b) => {
        // Quem começa com o que foi digitado vem primeiro.
        const pa = normalizar(a.nome).startsWith(termos[0]) ? 0 : 1;
        const pb = normalizar(b.nome).startsWith(termos[0]) ? 0 : 1;
        return pa - pb;
      });
  }, [itens, busca]);

  const escolhida = useMemo(() => itens.find((i) => i.chave === chaveEscolhida) ?? null, [itens, chaveEscolhida]);

  const selecaoAtual = useMemo(() => {
    if (!escolhida) return null;
    if (escolhida.tipo === "salvaguarda") {
      return { tipo: "salvaguarda" as const, atributo: escolhida.atributo };
    }
    return {
      tipo: "pericia" as const,
      chave: escolhida.chave,
      nome: escolhida.nome,
      atributo: escolhida.atributo,
      slugCanonico: escolhida.slugCanonico,
    };
  }, [escolhida]);

  const alvosEfetivos = useMemo(
    () => (alvos === "TODOS" ? personagensLista.map((p) => p.id) : alvos),
    [alvos, personagensLista],
  );

  // Cursor na busca assim que abre.
  useEffect(() => {
    const t = setTimeout(() => campoBusca.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    void Promise.all([aggregatePericiasForMesa(mesaId), aggregateSalvaguardasForMesa(mesaId)])
      .then(([periciasServidor, salvaguardasServidor]) => {
        if (!ativo) return;
        const pericias = periciasServidor as PericiaAgregada[];
        const salvaguardas = salvaguardasServidor as SalvaguardaAgregada[];
        setItens([
          ...pericias.map<Item>((p) => ({
            chave: p.chave,
            tipo: "pericia",
            nome: p.nome,
            atributo: p.atributo,
            sigla: p.siglaAtributo,
            slugCanonico: p.slugCanonico,
            busca: normalizar(`${p.nome} ${p.siglaAtributo} ${p.atributo}`),
          })),
          ...salvaguardas.map<Item>((s) => ({
            chave: s.chave,
            tipo: "salvaguarda",
            nome: `Salvaguarda de ${s.nome}`,
            atributo: s.atributo,
            sigla: s.sigla,
            slugCanonico: null,
            busca: normalizar(`salvaguarda save resistencia ${s.nome} ${s.sigla}`),
          })),
        ]);
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
  }, [aberto, mesaId]);

  const chaveBonus = selecaoAtual ? JSON.stringify([selecaoAtual, alvos]) : "";
  const carregandoBonus = !!selecaoAtual && bonusDe !== chaveBonus;
  useEffect(() => {
    if (!selecaoAtual) return;
    let ativo = true;
    void calcularBonusTesteMesa(mesaId, selecaoAtual, alvos === "TODOS" ? "TODOS" : alvos)
      .then((resultado) => {
        if (!ativo) return;
        const mapa: Record<string, { bonus: number; detalhe: string }> = {};
        for (const item of resultado) {
          mapa[item.personagemId] = { bonus: item.bonus, detalhe: item.detalhe };
        }
        setBonusPorAlvo(mapa);
        setBonusDe(chaveBonus);
      })
      .catch((error) => {
        console.error(error);
        if (!ativo) return;
        setBonusPorAlvo({});
        setBonusDe(chaveBonus);
      });

    return () => {
      ativo = false;
    };
  }, [selecaoAtual, mesaId, alvos, chaveBonus]);

  // Mantém o item destacado à vista ao navegar com as setas.
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>('[data-destaque="true"]')?.scrollIntoView({ block: "nearest" });
  }, [destaque, resultados]);

  const escolher = useCallback((item: Item) => {
    setChaveEscolhida(item.chave);
    setBusca("");
    setDestaque(0);
  }, []);

  function alternarAlvo(id: string) {
    if (alvos === "TODOS") {
      setAlvos([id]);
      return;
    }
    const conjunto = new Set(alvos);
    if (conjunto.has(id)) conjunto.delete(id);
    else conjunto.add(id);
    setAlvos(conjunto.size === 0 ? "TODOS" : Array.from(conjunto));
  }

  function alternarModo(personagemId: string, modo: Exclude<ModoTeste, "normal">) {
    setModosPorAlvo((atual) => ({
      ...atual,
      [personagemId]: (atual[personagemId] ?? "normal") === modo ? "normal" : modo,
    }));
  }

  const enviar = useCallback(async () => {
    if (!selecaoAtual || !escolhida || enviando) return;
    setEnviando(true);
    try {
      const modosSelecionados: Record<string, ModoTeste> = {};
      for (const personagemId of alvosEfetivos) {
        modosSelecionados[personagemId] = modosPorAlvo[personagemId] ?? "normal";
      }

      const msg = await criarSolicitacaoTeste(mesaId, {
        selecao: selecaoAtual,
        cd,
        privacidade: { ocultarCd, ocultarRolagem, ocultarResultado },
        alvos: alvos === "TODOS" ? "TODOS" : alvos,
        modosPorAlvo: modosSelecionados,
        rolagemAutomatica: automatica,
      });
      gravarRecente(mesaId, { chave: escolhida.chave, cd });
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
      setOcultarCd(false);
      setOcultarRolagem(false);
      setOcultarResultado(false);
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
  }, [
    selecaoAtual,
    escolhida,
    enviando,
    alvosEfetivos,
    modosPorAlvo,
    mesaId,
    cd,
    ocultarCd,
    ocultarRolagem,
    ocultarResultado,
    alvos,
    automatica,
    onCriada,
    onFechar,
  ]);

  function aoTeclarNaBusca(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestaque((d) => Math.min(d + 1, Math.max(resultados.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestaque((d) => Math.max(d - 1, 0));
    } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (busca.trim() && resultados[destaque]) escolher(resultados[destaque]);
      else if (!busca.trim() && escolhida) void enviar();
    }
  }

  function aoTeclarNoModal(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onFechar();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void enviar();
    }
  }

  const resumoAlvos =
    alvos === "TODOS"
      ? "Todos"
      : alvos.length === 1
        ? (personagensLista.find((p) => p.id === alvos[0])?.nome.split(" ")[0] ?? "1 jogador")
        : `${alvos.length} jogadores`;
  const recentesVisiveis = recentes
    .map((r) => ({ ...r, item: itens.find((i) => i.chave === r.chave) }))
    .filter((r): r is Recente & { item: Item } => !!r.item);
  const mostrandoLista = !escolhida || busca.trim().length > 0;

  return (
    <div className="narrador-modal-overlay" onClick={onFechar}>
      <div
        className="narrador-modal narrador-modal-lg pt-modal"
        role="dialog"
        aria-label="Pedir teste"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={aoTeclarNoModal}
      >
        <button type="button" className="narrador-modal-close" onClick={onFechar} aria-label="Fechar">
          ×
        </button>
        <h3>Pedir teste</h3>

        {/* 1 · O quê */}
        <section className="pt-secao">
          <div className="pt-busca">
            <i className="fas fa-magnifying-glass" aria-hidden />
            <input
              ref={campoBusca}
              type="text"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setDestaque(0);
              }}
              onKeyDown={aoTeclarNaBusca}
              placeholder={escolhida ? "Trocar perícia…" : "Buscar perícia ou salvaguarda (ex.: perc, for, salv)"}
              aria-label="Buscar perícia ou salvaguarda"
              autoComplete="off"
              role="combobox"
              aria-expanded={mostrandoLista}
              aria-controls="pt-resultados"
            />
          </div>

          {escolhida && (
            <div className="pt-escolhida">
              <span className="pt-tag">{escolhida.sigla}</span>
              <strong>{escolhida.nome}</strong>
              <button type="button" onClick={() => setChaveEscolhida(null)} aria-label="Remover escolha" title="Trocar">
                <i className="fas fa-xmark" />
              </button>
            </div>
          )}

          {!escolhida && !busca.trim() && recentesVisiveis.length > 0 && (
            <div className="pt-recentes" aria-label="Pedidos recentes">
              <span className="pt-rotulo">Recentes</span>
              {recentesVisiveis.map((r) => (
                <button
                  key={r.chave}
                  type="button"
                  className="pt-recente"
                  onClick={() => {
                    escolher(r.item);
                    setCd(r.cd);
                  }}
                >
                  {r.item.nome.replace("Salvaguarda de ", "Salv. ")} <span>CD {r.cd}</span>
                </button>
              ))}
            </div>
          )}

          {mostrandoLista && (
            <ul id="pt-resultados" className="pt-resultados" role="listbox" ref={listaRef}>
              {carregandoMeta && itens.length === 0 && <li className="pt-vazio">Carregando…</li>}
              {!carregandoMeta && resultados.length === 0 && <li className="pt-vazio">Nada encontrado para “{busca}”.</li>}
              {resultados.map((item, i) => (
                <li
                  key={item.chave}
                  role="option"
                  aria-selected={i === destaque}
                  data-destaque={i === destaque}
                  className={"pt-opcao" + (i === destaque ? " ativa" : "")}
                  onMouseEnter={() => setDestaque(i)}
                  onClick={() => escolher(item)}
                >
                  <span className="pt-tag">{item.sigla}</span>
                  <span className="pt-opcao-nome">{item.nome}</span>
                  {item.tipo === "salvaguarda" && <span className="pt-opcao-tipo">salvaguarda</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 2 · Dificuldade */}
        <section className="pt-secao">
          <div className="pt-secao-topo">
            <span className="pt-rotulo">Dificuldade (CD)</span>
            <button type="button" className="pt-link" onClick={() => setEditandoDif((v) => !v)}>
              <i className={"fas " + (editandoDif ? "fa-check" : "fa-sliders")} />{" "}
              {editandoDif ? "Concluir" : "Ajustar níveis"}
            </button>
          </div>
          {editandoDif ? (
            <div className="pt-dif-edicao">
              {dificuldades.map((d, i) => (
                <div key={i} className="pt-dif-linha">
                  <input
                    type="text"
                    value={d.rotulo}
                    maxLength={20}
                    aria-label={`Nome do nível ${i + 1}`}
                    onChange={(e) =>
                      salvarDificuldades(dificuldades.map((x, j) => (j === i ? { ...x, rotulo: e.target.value } : x)))
                    }
                  />
                  <CampoNumero
                    valor={d.cd}
                    min={0}
                    onChange={(v) => salvarDificuldades(dificuldades.map((x, j) => (j === i ? { ...x, cd: v } : x)))}
                  />
                </div>
              ))}
              <button type="button" className="pt-link" onClick={() => salvarDificuldades(DIFICULDADES_PADRAO)}>
                Restaurar padrão
              </button>
            </div>
          ) : (
            <div className="pt-cd">
              <div className="pt-dificuldades">
                {dificuldades.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    className={"pt-dif" + (cd === d.cd ? " ativa" : "")}
                    onClick={() => setCd(d.cd)}
                  >
                    <strong>{d.cd}</strong>
                    <span>{d.rotulo || "—"}</span>
                  </button>
                ))}
              </div>
              <div className="pt-cd-livre">
                <CampoNumero valor={cd} onChange={setCd} min={0} />
              </div>
            </div>
          )}
        </section>

        {/* 3 · Quem */}
        <section className="pt-secao">
          <span className="pt-rotulo">Quem rola</span>
          <div className="pt-alvos">
            <button
              type="button"
              className={"pt-alvo" + (alvos === "TODOS" ? " selecionado" : "")}
              onClick={() => setAlvos("TODOS")}
              aria-pressed={alvos === "TODOS"}
            >
              <span className="pt-avatar pt-avatar-todos">
                <i className="fas fa-users" />
              </span>
              Todos
            </button>
            {personagensLista.map((p) => {
              const primeiro = p.nome.split(" ")[0] || p.nome;
              const selecionado = alvos !== "TODOS" && alvos.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={"pt-alvo" + (selecionado ? " selecionado" : "")}
                  onClick={() => alternarAlvo(p.id)}
                  aria-pressed={selecionado}
                  title={p.nome}
                >
                  <span className="pt-avatar">
                    {p.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.fotoUrl} alt="" />
                    ) : (
                      (primeiro || "?").charAt(0)
                    )}
                  </span>
                  {primeiro}
                </button>
              );
            })}
          </div>

          {selecaoAtual && alvosEfetivos.length > 0 && (
            <div className="pt-modos">
              {personagensLista
                .filter((p) => alvosEfetivos.includes(p.id))
                .map((p) => {
                  const modo = modosPorAlvo[p.id] ?? "normal";
                  const bonus = bonusPorAlvo[p.id];
                  return (
                    <div key={p.id} className="pt-modo" title={bonus?.detalhe}>
                      <span className="pt-modo-nome">{p.nome.split(" ")[0]}</span>
                      <span className="pt-modo-bonus">
                        {carregandoBonus && !bonus
                          ? "…"
                          : `${(bonus?.bonus ?? 0) >= 0 ? "+" : ""}${bonus?.bonus ?? 0}`}
                      </span>
                      <button
                        type="button"
                        className={"pt-d20 vantagem" + (modo === "vantagem" ? " ativa" : "")}
                        onClick={() => alternarModo(p.id, "vantagem")}
                        title="Vantagem"
                        aria-label={`Vantagem para ${p.nome}`}
                        aria-pressed={modo === "vantagem"}
                      >
                        <i className="fas fa-arrow-up" />
                      </button>
                      <button
                        type="button"
                        className={"pt-d20 desvantagem" + (modo === "desvantagem" ? " ativa" : "")}
                        onClick={() => alternarModo(p.id, "desvantagem")}
                        title="Desvantagem"
                        aria-label={`Desvantagem para ${p.nome}`}
                        aria-pressed={modo === "desvantagem"}
                      >
                        <i className="fas fa-arrow-down" />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </section>

        <label className={"pt-automatica" + (automatica ? " ativa" : "")}>
          <input type="checkbox" checked={automatica} onChange={(e) => setAutomatica(e.target.checked)} />
          <span>
            <strong>
              <i className="fas fa-bolt" /> Rolar automaticamente
            </strong>
            <small>O jogador não precisa clicar: o teste é rolado assim que o pedido chega.</small>
          </span>
        </label>

        <div className="narrador-privacidade-wrap">
          <button
            type="button"
            className={"narrador-privacidade-toggle" + (privacidadeAberta ? " open" : "")}
            onClick={() => setPrivacidadeAberta((v) => !v)}
          >
            <span>
              Privacidade
              {(ocultarCd || ocultarRolagem || ocultarResultado) && <em className="pt-aviso"> · com ocultações</em>}
            </span>
            <i className="fas fa-chevron-down" />
          </button>
          <div className={"narrador-privacidade-conteudo" + (privacidadeAberta ? " open" : "")}>
            <label className="narrador-check">
              <input type="checkbox" checked={ocultarCd} onChange={(e) => setOcultarCd(e.target.checked)} />
              CD oculta
            </label>
            <label className="narrador-check">
              <input type="checkbox" checked={ocultarRolagem} onChange={(e) => setOcultarRolagem(e.target.checked)} />
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

        <div className="pt-rodape">
          <span className="pt-resumo">
            {escolhida ? (
              <>
                <strong>{escolhida.nome}</strong> · CD {cd} · {resumoAlvos}
              </>
            ) : (
              "Escolha uma perícia para pedir"
            )}
          </span>
          <button type="button" className="modal-btn-cancel" onClick={onFechar}>
            Cancelar
          </button>
          <button type="button" className="modal-btn-save" onClick={() => void enviar()} disabled={enviando || !escolhida}>
            {enviando ? "Enviando..." : "Pedir teste"}
            <kbd>Ctrl ↵</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
