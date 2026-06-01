"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { criarAmeaca, atualizarAmeaca, deletarAmeaca } from "./actions";
import type {
  AmeacaAcao,
  AmeacaAcoes,
  AmeacaAspecto,
  AmeacaCaracteristicas,
  AmeacaPayload,
  AmeacaPericia,
  AmeacaSalvaguarda,
  AmeacaSerializada,
} from "./types";

function uuid() {
  return crypto.randomUUID();
}

function novoItemAcao(): AmeacaAcao {
  return {
    id: uuid(),
    nome: "",
    descricao: "",
    acerto: "",
    dano: "",
    custo: "",
  };
}

function novaPericia(): AmeacaPericia {
  return { id: uuid(), nome: "", bonus: 0 };
}

function novaSalvaguarda(): AmeacaSalvaguarda {
  return { id: uuid(), nome: "", bonus: 0 };
}

function novoAspecto(): AmeacaAspecto {
  return { id: uuid(), nome: "", descricao: "" };
}

function caracteristicasVazias(): AmeacaCaracteristicas {
  return {
    pericias: [],
    sentidos: {
      percepcaoPassiva: null,
      extras: "",
    },
    salvaguardas: [],
  };
}

function acoesVazias(): AmeacaAcoes {
  return {
    padrao: [],
    bonus: [],
    reacoes: [],
    poderosas: [],
  };
}

function criarDraftVazio(): AmeacaPayload {
  return {
    nome: "",
    classeResistencia: 0,
    pontosVida: 0,
    classeDificuldade: 0,
    nivelDesafio: 0,
    deslocamento: 0,
    deslocamentoNado: null,
    pontosPoder: 0,
    bonusProficiencia: 0,
    forca: 0,
    destreza: 0,
    constituicao: 0,
    sabedoria: 0,
    presenca: 0,
    vontade: 0,
    caracteristicas: caracteristicasVazias(),
    aspectos: [],
    acoes: acoesVazias(),
  };
}

function draftDeAmeaca(ameaca: AmeacaSerializada): AmeacaPayload {
  return {
    nome: ameaca.nome,
    classeResistencia: ameaca.classeResistencia,
    pontosVida: ameaca.pontosVida,
    classeDificuldade: ameaca.classeDificuldade,
    nivelDesafio: ameaca.nivelDesafio,
    deslocamento: ameaca.deslocamento,
    deslocamentoNado: ameaca.deslocamentoNado,
    pontosPoder: ameaca.pontosPoder,
    bonusProficiencia: ameaca.bonusProficiencia,
    forca: ameaca.forca,
    destreza: ameaca.destreza,
    constituicao: ameaca.constituicao,
    sabedoria: ameaca.sabedoria,
    presenca: ameaca.presenca,
    vontade: ameaca.vontade,
    caracteristicas: ameaca.caracteristicas,
    aspectos: ameaca.aspectos,
    acoes: ameaca.acoes,
  };
}

type Props = {
  mesaId: string;
  ameacasIniciais: AmeacaSerializada[];
};

const ACTION_CATEGORIES: Array<{ key: keyof AmeacaAcoes; label: string; descricao: string }> = [
  { key: "padrao", label: "Padrão", descricao: "Ações principais da ameaça." },
  { key: "bonus", label: "Bônus", descricao: "Ações de ação bônus / pequenas interações." },
  { key: "reacoes", label: "Reações", descricao: "Respostas fora do turno." },
  { key: "poderosas", label: "Poderosas", descricao: "Ataques, técnicas ou poderes mais fortes." },
];

function copiarLista<T extends { id: string }>(lista: T[]): T[] {
  return lista.map((item) => ({ ...item, id: item.id || uuid() }));
}

function temTexto(valor: string | null | undefined) {
  return Boolean(valor && valor.trim());
}

function formatarNumero(valor: number) {
  return new Intl.NumberFormat("pt-BR").format(valor);
}

type NumeroInputProps = {
  className?: string;
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
};

function NumeroInput({ className, value, onChange, placeholder }: NumeroInputProps) {
  const [texto, setTexto] = useState(String(value));

  useEffect(() => {
    setTexto(String(value));
  }, [value]);

  return (
    <input
      className={className}
      type="number"
      value={texto}
      placeholder={placeholder}
      onFocus={() => {
        if (texto === "0") setTexto("");
      }}
      onChange={(event) => setTexto(event.target.value)}
      onBlur={() => {
        const normalizado = texto.trim() === "" ? 0 : Number(texto);
        const valorFinal = Number.isFinite(normalizado) ? normalizado : 0;
        setTexto(String(valorFinal));
        onChange(valorFinal);
      }}
    />
  );
}

export function AmeacasManager({ mesaId, ameacasIniciais }: Props) {
  const router = useRouter();
  const [ameacas, setAmeacas] = useState(ameacasIniciais);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(ameacasIniciais[0]?.id ?? null);
  const [editorAberto, setEditorAberto] = useState(false);
  const [modoPainel, setModoPainel] = useState<"visualizar" | "editar">("visualizar");
  const [draft, setDraft] = useState<AmeacaPayload>(() =>
    ameacasIniciais[0] ? draftDeAmeaca(ameacasIniciais[0]) : criarDraftVazio(),
  );
  const [salvando, setSalvando] = useState(false);

  const selecionada = ameacas.find((a) => a.id === selecionadaId) ?? null;

  function abrirNovaAmeaca() {
    setSelecionadaId(null);
    setDraft(criarDraftVazio());
    setEditorAberto(true);
    setModoPainel("editar");
  }

  function abrirVisualizacao(ameaca: AmeacaSerializada) {
    setSelecionadaId(ameaca.id);
    setDraft(draftDeAmeaca(ameaca));
    setEditorAberto(true);
    setModoPainel("visualizar");
  }

  function abrirEdicao(ameaca: AmeacaSerializada) {
    setSelecionadaId(ameaca.id);
    setDraft(draftDeAmeaca(ameaca));
    setEditorAberto(true);
    setModoPainel("editar");
  }

  function fecharPainel() {
    setEditorAberto(false);
  }

  function cancelarEdicao() {
    if (!selecionada) {
      setEditorAberto(false);
      setSelecionadaId(null);
      return;
    }

    setDraft(draftDeAmeaca(selecionada));
    setModoPainel("visualizar");
  }

  function alterarListaAtualizada(atualizada: AmeacaSerializada) {
    setAmeacas((prev) => {
      const existe = prev.some((a) => a.id === atualizada.id);
      const novaLista = existe ? prev.map((a) => (a.id === atualizada.id ? atualizada : a)) : [...prev, atualizada];
      return novaLista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    });
    setSelecionadaId(atualizada.id);
    setDraft(draftDeAmeaca(atualizada));
  }

  function atualizarCampo<K extends keyof AmeacaPayload>(campo: K, valor: AmeacaPayload[K]) {
    setDraft((atual) => ({ ...atual, [campo]: valor }));
  }

  function atualizarCaracteristicas(patch: Partial<AmeacaCaracteristicas>) {
    setDraft((atual) => ({
      ...atual,
      caracteristicas: {
        ...atual.caracteristicas,
        ...patch,
      },
    }));
  }

  function atualizarPericia(indice: number, patch: Partial<AmeacaPericia>) {
    setDraft((atual) => ({
      ...atual,
      caracteristicas: {
        ...atual.caracteristicas,
        pericias: atual.caracteristicas.pericias.map((item, i) => (i === indice ? { ...item, ...patch } : item)),
      },
    }));
  }

  function atualizarSalvaguarda(indice: number, patch: Partial<AmeacaSalvaguarda>) {
    setDraft((atual) => ({
      ...atual,
      caracteristicas: {
        ...atual.caracteristicas,
        salvaguardas: atual.caracteristicas.salvaguardas.map((item, i) => (i === indice ? { ...item, ...patch } : item)),
      },
    }));
  }

  function adicionarItemLista(lista: keyof Pick<AmeacaPayload, "aspectos"> | keyof AmeacaAcoes) {
    if (lista === "aspectos") {
      setDraft((atual) => ({ ...atual, aspectos: [...atual.aspectos, novoAspecto()] }));
      return;
    }
    setDraft((atual) => ({
      ...atual,
      acoes: {
        ...atual.acoes,
        [lista]: [...atual.acoes[lista], novoItemAcao()],
      },
    }));
  }

  function atualizarAspecto(indice: number, patch: Partial<AmeacaAspecto>) {
    setDraft((atual) => ({
      ...atual,
      aspectos: atual.aspectos.map((item, i) => (i === indice ? { ...item, ...patch } : item)),
    }));
  }

  function atualizarAcao(categoria: keyof AmeacaAcoes, indice: number, patch: Partial<AmeacaAcao>) {
    setDraft((atual) => ({
      ...atual,
      acoes: {
        ...atual.acoes,
        [categoria]: atual.acoes[categoria].map((item, i) => (i === indice ? { ...item, ...patch } : item)),
      },
    }));
  }

  function removerItemLista(lista: keyof Pick<AmeacaPayload, "aspectos"> | keyof AmeacaAcoes, indice: number) {
    if (lista === "aspectos") {
      setDraft((atual) => ({
        ...atual,
        aspectos: atual.aspectos.filter((_, i) => i !== indice),
      }));
      return;
    }
    setDraft((atual) => ({
      ...atual,
      acoes: {
        ...atual.acoes,
        [lista]: atual.acoes[lista].filter((_, i) => i !== indice),
      },
    }));
  }

  function adicionarPericia() {
    setDraft((atual) => ({
      ...atual,
      caracteristicas: {
        ...atual.caracteristicas,
        pericias: [...atual.caracteristicas.pericias, novaPericia()],
      },
    }));
  }

  function adicionarSalvaguarda() {
    setDraft((atual) => ({
      ...atual,
      caracteristicas: {
        ...atual.caracteristicas,
        salvaguardas: [...atual.caracteristicas.salvaguardas, novaSalvaguarda()],
      },
    }));
  }

  async function salvar() {
    if (salvando) return;
    const nome = draft.nome.trim();
    if (!nome) {
      Swal.fire({
        icon: "warning",
        title: "Nome obrigatório",
        text: "Informe o nome da ameaça.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }

    setSalvando(true);
    try {
      const payload: AmeacaPayload = {
        ...draft,
        nome,
        caracteristicas: {
          pericias: copiarLista(draft.caracteristicas.pericias),
          sentidos: { ...draft.caracteristicas.sentidos },
          salvaguardas: copiarLista(draft.caracteristicas.salvaguardas),
        },
        aspectos: copiarLista(draft.aspectos),
        acoes: {
          padrao: copiarLista(draft.acoes.padrao),
          bonus: copiarLista(draft.acoes.bonus),
          reacoes: copiarLista(draft.acoes.reacoes),
          poderosas: copiarLista(draft.acoes.poderosas),
        },
      };

      const resultado = selecionadaId
        ? await atualizarAmeaca(mesaId, selecionadaId, payload)
        : await criarAmeaca(mesaId, payload);

      alterarListaAtualizada(resultado);
      setModoPainel("visualizar");
      await Swal.fire({
        icon: "success",
        title: "Salvo",
        text: `A ameaça "${resultado.nome}" foi salva.`,
        timer: 1000,
        showConfirmButton: false,
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      router.refresh();
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Erro",
        text: error instanceof Error ? error.message : "Erro ao salvar ameaça.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    } finally {
      setSalvando(false);
    }
  }

  async function remover(ameaca: AmeacaSerializada) {
    const confirmacao = await Swal.fire({
      icon: "warning",
      title: "Remover ameaça",
      text: `Remover "${ameaca.nome}"?`,
      showCancelButton: true,
      confirmButtonText: "Remover",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirmacao.isConfirmed) return;

    try {
      await deletarAmeaca(mesaId, ameaca.id);
      setAmeacas((prev) => prev.filter((item) => item.id !== ameaca.id));
      const restantes = ameacas.filter((item) => item.id !== ameaca.id);
      const proxima = restantes[0] ?? null;
      if (proxima) {
        setSelecionadaId(proxima.id);
        setDraft(draftDeAmeaca(proxima));
      } else {
        setSelecionadaId(null);
        setDraft(criarDraftVazio());
        setEditorAberto(false);
      }
      router.refresh();
    } catch (error) {
      await Swal.fire({
        icon: "error",
        title: "Erro",
        text: error instanceof Error ? error.message : "Erro ao remover ameaça.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    }
  }

  return (
    <div className="ameacas-shell">
      <section className="ameacas-lista ameacas-lista--catalogo">
        <div className="ameacas-lista-topo">
          <div>
            <span className="ameacas-kicker">CATÁLOGO DA MESA</span>
            <h2>Ameaças {ameacas.length > 0 ? `(${ameacas.length})` : ""}</h2>
          </div>
          <button type="button" className="ameacas-btn-sec" onClick={abrirNovaAmeaca} aria-expanded={editorAberto}>
            <i className="fas fa-plus" /> Nova
          </button>
        </div>

        <div className="ameacas-lista-grid">
          {ameacas.length === 0 ? (
            <div className="ameacas-empty">
              <i className="fas fa-skull" />
              <p>Nenhuma ameaça criada ainda.</p>
            </div>
          ) : (
            ameacas.map((ameaca) => (
              <div
                key={ameaca.id}
                role="button"
                tabIndex={0}
                className={"ameaca-card" + (selecionadaId === ameaca.id ? " active" : "")}
                onClick={() => abrirVisualizacao(ameaca)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    abrirVisualizacao(ameaca);
                  }
                }}
              >
                <div className="ameaca-card-head">
                  <div>
                    <h3>{ameaca.nome}</h3>
                    <p>
                      CR {ameaca.classeResistencia} · PV {ameaca.pontosVida} · CD {ameaca.classeDificuldade}
                    </p>
                  </div>
                    <span className="ameaca-card-chip">ND {ameaca.nivelDesafio}</span>
                </div>
                <div className="ameaca-card-sub">
                    <span>FOR {ameaca.forca} | DES {ameaca.destreza} | CON {ameaca.constituicao} | SAB {ameaca.sabedoria} | PRE {ameaca.presenca} | VON {ameaca.vontade}</span>

                </div>
                <div className="ameaca-card-acoes">
                  <button
                    type="button"
                    className="ameaca-card-acao"
                    onClick={(e) => {
                      e.stopPropagation();
                      remover(ameaca);
                    }}
                  >
                    <i className="fas fa-trash" /> Remover
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <div className={"ameacas-editor-drawer" + (editorAberto ? " open" : "")}>
        <div className="ameacas-editor">
          <div className="ameacas-editor-topo">
            <div>
              <span className="ameacas-kicker">FICHA</span>
              <h2>
                {selecionada
                  ? modoPainel === "editar"
                    ? `Editando ${selecionada.nome}`
                    : `Visualizando ${selecionada.nome}`
                  : "Nova ameaça"}
              </h2>
            </div>
            <div className="ameacas-editor-acoes">
              {modoPainel === "editar" ? (
                <>
                  <button type="button" className="ameacas-btn-sec" onClick={cancelarEdicao}>
                    Cancelar
                  </button>
                  <button type="button" className="ameacas-btn-primary" onClick={salvar} disabled={salvando}>
                    <i className="fas fa-check" /> {salvando ? "Salvando..." : "Salvar"}
                  </button>
                </>
              ) : (
                <>
                  {selecionada ? (
                    <button type="button" className="ameacas-btn-sec" onClick={() => abrirEdicao(selecionada)}>
                      <i className="fas fa-pen" /> Editar
                    </button>
                  ) : null}
                  <button type="button" className="ameacas-btn-sec" onClick={fecharPainel}>
                    Fechar
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="ameacas-editor-scroll">
            {modoPainel === "visualizar" && selecionada ? (
              <div className="ameacas-visualizacao">
                <section className="ameacas-ficha-resumo">
                  <div className="ameacas-ficha-resumo-topo">
                    <div>
                      <span className="ameacas-kicker">RESUMO</span>
                      <h3>{selecionada.nome}</h3>
                    </div>
                    <span className="ameaca-card-chip">ND {selecionada.nivelDesafio}</span>
                  </div>

                  <div className="ameacas-ficha-metricas">
                    <div>
                      <span>Classe de Resistência</span>
                      <strong>{formatarNumero(selecionada.classeResistencia)}</strong>
                    </div>
                    <div>
                      <span>Pontos de Vida</span>
                      <strong>{formatarNumero(selecionada.pontosVida)}</strong>
                    </div>
                    <div>
                      <span>Classe de Dificuldade</span>
                      <strong>{formatarNumero(selecionada.classeDificuldade)}</strong>
                    </div>
                    <div>
                      <span>Deslocamento</span>
                      <strong>{formatarNumero(selecionada.deslocamento)} m</strong>
                    </div>
                    <div>
                      <span>Deslocamento de nado</span>
                      <strong>{selecionada.deslocamentoNado === null ? "-" : `${formatarNumero(selecionada.deslocamentoNado)} m`}</strong>
                    </div>
                    <div>
                      <span>Pontos de Poder</span>
                      <strong>{formatarNumero(selecionada.pontosPoder)}</strong>
                    </div>
                    <div>
                      <span>Bônus de Proficiência</span>
                      <strong>{formatarNumero(selecionada.bonusProficiencia)}</strong>
                    </div>
                  </div>
                </section>

                <section className="ameacas-view-section">
                  <h3>Atributos básicos</h3>
                  <div className="ameacas-atributos-view">
                    <div className="ameacas-atributo-card">
                      <span className="ameacas-atributo-label">FOR</span>
                      <strong>{selecionada.forca}</strong>
                    </div>
                    <div className="ameacas-atributo-card">
                      <span className="ameacas-atributo-label">DES</span>
                      <strong>{selecionada.destreza}</strong>
                    </div>
                    <div className="ameacas-atributo-card">
                      <span className="ameacas-atributo-label">CON</span>
                      <strong>{selecionada.constituicao}</strong>
                    </div>
                    <div className="ameacas-atributo-card">
                      <span className="ameacas-atributo-label">SAB</span>
                      <strong>{selecionada.sabedoria}</strong>
                    </div>
                    <div className="ameacas-atributo-card">
                      <span className="ameacas-atributo-label">PRE</span>
                      <strong>{selecionada.presenca}</strong>
                    </div>
                    <div className="ameacas-atributo-card">
                      <span className="ameacas-atributo-label">VON</span>
                      <strong>{selecionada.vontade}</strong>
                    </div>
                  </div>
                </section>

                {(selecionada.caracteristicas.pericias.some((item) => temTexto(item.nome) || item.bonus !== 0) ||
                  temTexto(selecionada.caracteristicas.sentidos.extras) ||
                  selecionada.caracteristicas.sentidos.percepcaoPassiva !== null ||
                  selecionada.caracteristicas.salvaguardas.some((item) => temTexto(item.nome) || item.bonus !== 0)) ? (
                  <section className="ameacas-view-section">
                    <h3>Características</h3>
                    <div className="ameacas-view-blocos">
                      {(selecionada.caracteristicas.sentidos.percepcaoPassiva !== null || temTexto(selecionada.caracteristicas.sentidos.extras)) ? (
                        <div className="ameacas-view-subbloco">
                          <strong>Sentidos</strong>
                          <p>
                            {selecionada.caracteristicas.sentidos.percepcaoPassiva !== null ? `Percepção passiva ${selecionada.caracteristicas.sentidos.percepcaoPassiva}` : null}
                            {selecionada.caracteristicas.sentidos.percepcaoPassiva !== null && temTexto(selecionada.caracteristicas.sentidos.extras) ? " · " : null}
                            {temTexto(selecionada.caracteristicas.sentidos.extras) ? selecionada.caracteristicas.sentidos.extras : null}
                          </p>
                        </div>
                      ) : null}

                      {selecionada.caracteristicas.pericias.some((item) => temTexto(item.nome) || item.bonus !== 0) ? (
                        <div className="ameacas-view-subbloco">
                          <strong>Perícias</strong>
                          <div className="ameacas-tags">
                            {selecionada.caracteristicas.pericias
                              .filter((item) => temTexto(item.nome) || item.bonus !== 0)
                              .map((item) => (
                                <span key={item.id} className="ameacas-tag">
                                  {item.nome || "Perícia"} {item.bonus >= 0 ? `+${item.bonus}` : item.bonus}
                                </span>
                              ))}
                          </div>
                        </div>
                      ) : null}

                      {selecionada.caracteristicas.salvaguardas.some((item) => temTexto(item.nome) || item.bonus !== 0) ? (
                        <div className="ameacas-view-subbloco">
                          <strong>Salvaguardas</strong>
                          <div className="ameacas-tags">
                            {selecionada.caracteristicas.salvaguardas
                              .filter((item) => temTexto(item.nome) || item.bonus !== 0)
                              .map((item) => (
                                <span key={item.id} className="ameacas-tag">
                                  {item.nome || "Salvaguarda"} {item.bonus >= 0 ? `+${item.bonus}` : item.bonus}
                                </span>
                              ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {selecionada.aspectos.some((item) => temTexto(item.nome) || temTexto(item.descricao)) ? (
                  <section className="ameacas-view-section">
                    <h3>Aspectos</h3>
                    <div className="ameacas-view-lista">
                      {selecionada.aspectos
                        .filter((item) => temTexto(item.nome) || temTexto(item.descricao))
                        .map((item) => (
                          <article key={item.id} className="ameacas-view-item">
                            <strong>{item.nome}</strong>
                            {temTexto(item.descricao) ? <p>{item.descricao}</p> : null}
                          </article>
                        ))}
                    </div>
                  </section>
                ) : null}

                {ACTION_CATEGORIES.map((categoria) => {
                  const acoesCategoria = selecionada.acoes[categoria.key].filter(
                    (item) => temTexto(item.nome) || temTexto(item.descricao) || temTexto(item.acerto) || temTexto(item.dano) || temTexto(item.custo),
                  );

                  if (acoesCategoria.length === 0) {
                    return null;
                  }

                  return (
                    <section className="ameacas-view-section" key={categoria.key}>
                      <h3>Ações {categoria.label}</h3>
                      <div className="ameacas-view-lista">
                        {acoesCategoria.map((item) => (
                          <article key={item.id} className="ameacas-view-item">
                            <div className="ameacas-view-item-topo">
                              <strong>{item.nome}</strong>
                              <div className="ameacas-tags">
                                {temTexto(item.acerto) ? <span className="ameacas-tag">Acerto: {item.acerto}</span> : null}
                                {temTexto(item.dano) ? <span className="ameacas-tag">Dano: {item.dano}</span> : null}
                                {temTexto(item.custo) ? <span className="ameacas-tag">Custo: {item.custo}</span> : null}
                              </div>
                            </div>
                            {temTexto(item.descricao) ? <p>{item.descricao}</p> : null}
                          </article>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : null}

            {(modoPainel === "editar" || !selecionada) ? (
              <>
                <div className="ameacas-bloco">
                  <h3>Nome</h3>
                  <input
                    className="ameacas-input"
                    type="text"
                    value={draft.nome}
                    onChange={(e) => atualizarCampo("nome", e.target.value)}
                    placeholder="Ex: Pirata Infame - Espadachim"
                  />
                </div>

                <div className="ameacas-bloco">
                  <h3>Informações vitais</h3>
                  <div className="ameacas-grid vitais">
                    <label>
                      <span>Classe de Resistência</span>
                      <NumeroInput className="ameacas-input" value={draft.classeResistencia} onChange={(valor) => atualizarCampo("classeResistencia", valor)} />
                    </label>
                    <label>
                      <span>Pontos de Vida</span>
                      <NumeroInput className="ameacas-input" value={draft.pontosVida} onChange={(valor) => atualizarCampo("pontosVida", valor)} />
                    </label>
                    <label>
                      <span>Classe de Dificuldade</span>
                      <NumeroInput className="ameacas-input" value={draft.classeDificuldade} onChange={(valor) => atualizarCampo("classeDificuldade", valor)} />
                    </label>
                    <label>
                      <span>Nível de desafio</span>
                      <NumeroInput className="ameacas-input" value={draft.nivelDesafio} onChange={(valor) => atualizarCampo("nivelDesafio", valor)} />
                    </label>
                    <label>
                      <span>Bônus de Proficiência</span>
                      <NumeroInput className="ameacas-input" value={draft.bonusProficiencia} onChange={(valor) => atualizarCampo("bonusProficiencia", valor)} />
                    </label>
                    <label>
                      <span>Deslocamento</span>
                      <NumeroInput className="ameacas-input" value={draft.deslocamento} onChange={(valor) => atualizarCampo("deslocamento", valor)} />
                    </label>
                    <label>
                      <span>Deslocamento de Nado</span>
                      <NumeroInput className="ameacas-input" value={draft.deslocamentoNado ?? 0} onChange={(valor) => atualizarCampo("deslocamentoNado", valor)} />
                    </label>
                    <label>
                      <span>Pontos de Poder</span>
                      <NumeroInput className="ameacas-input" value={draft.pontosPoder} onChange={(valor) => atualizarCampo("pontosPoder", valor)} />
                    </label>
                  </div>
                </div>

                <div className="ameacas-bloco">
                  <h3>Atributos</h3>
                  <div className="ameacas-grid atributos">
                    {[
                      ["forca", "Força"],
                      ["destreza", "Destreza"],
                      ["constituicao", "Constituição"],
                      ["sabedoria", "Sabedoria"],
                      ["presenca", "Presença"],
                      ["vontade", "Vontade"],
                    ].map(([campo, label]) => (
                      <label key={campo}>
                        <span>{label}</span>
                        <NumeroInput
                          className="ameacas-input"
                          value={draft[campo as keyof Pick<AmeacaPayload, "forca" | "destreza" | "constituicao" | "sabedoria" | "presenca" | "vontade">] as number}
                          onChange={(valor) => atualizarCampo(campo as keyof AmeacaPayload, valor)}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="ameacas-bloco">
                  <h3>Características</h3>
                  <label>
                    <span>Percepção Passiva</span>
                    <NumeroInput
                      className="ameacas-input"
                      value={draft.caracteristicas.sentidos.percepcaoPassiva ?? 0}
                      onChange={(valor) => atualizarCaracteristicas({ sentidos: { ...draft.caracteristicas.sentidos, percepcaoPassiva: valor } })}
                    />
                  </label>
                  <label>
                    <span>Sentidos extras</span>
                    <input
                      className="ameacas-input"
                      type="text"
                      value={draft.caracteristicas.sentidos.extras}
                      onChange={(e) => atualizarCaracteristicas({ sentidos: { ...draft.caracteristicas.sentidos, extras: e.target.value } })}
                      placeholder="Ex: visão no escuro, faro aguçado"
                    />
                  </label>

                  <div className="ameacas-subbloco">
                    <div className="ameacas-subcabecalho">
                      <h4>Perícias</h4>
                      <button type="button" className="ameacas-mini-btn" onClick={adicionarPericia}>
                        <i className="fas fa-plus" /> Adicionar
                      </button>
                    </div>
                    <div className="ameacas-lista-compacta">
                      {draft.caracteristicas.pericias.length === 0 ? (
                        <p className="ameacas-vazio">Nenhuma perícia cadastrada.</p>
                      ) : (
                        draft.caracteristicas.pericias.map((item, indice) => (
                          <div className="ameacas-linha-flex" key={item.id}>
                            <input className="ameacas-input" type="text" value={item.nome} onChange={(e) => atualizarPericia(indice, { nome: e.target.value })} placeholder="Nome" />
                            <NumeroInput className="ameacas-input ameacas-input-curto" value={item.bonus} onChange={(valor) => atualizarPericia(indice, { bonus: valor })} placeholder="Bônus" />
                            <button type="button" className="ameacas-mini-btn danger" onClick={() => setDraft((atual) => ({ ...atual, caracteristicas: { ...atual.caracteristicas, pericias: atual.caracteristicas.pericias.filter((_, i) => i !== indice) } }))}>
                              <i className="fas fa-times" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="ameacas-subbloco">
                    <div className="ameacas-subcabecalho">
                      <h4>Salvaguardas</h4>
                      <button type="button" className="ameacas-mini-btn" onClick={adicionarSalvaguarda}>
                        <i className="fas fa-plus" /> Adicionar
                      </button>
                    </div>
                    <div className="ameacas-lista-compacta">
                      {draft.caracteristicas.salvaguardas.length === 0 ? (
                        <p className="ameacas-vazio">Nenhuma salvaguarda cadastrada.</p>
                      ) : (
                        draft.caracteristicas.salvaguardas.map((item, indice) => (
                          <div className="ameacas-linha-flex" key={item.id}>
                            <input className="ameacas-input" type="text" value={item.nome} onChange={(e) => atualizarSalvaguarda(indice, { nome: e.target.value })} placeholder="Nome" />
                            <NumeroInput className="ameacas-input ameacas-input-curto" value={item.bonus} onChange={(valor) => atualizarSalvaguarda(indice, { bonus: valor })} placeholder="Bônus" />
                            <button type="button" className="ameacas-mini-btn danger" onClick={() => setDraft((atual) => ({ ...atual, caracteristicas: { ...atual.caracteristicas, salvaguardas: atual.caracteristicas.salvaguardas.filter((_, i) => i !== indice) } }))}>
                              <i className="fas fa-times" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="ameacas-bloco">
                  <div className="ameacas-subcabecalho">
                    <h3>Aspectos</h3>
                    <button type="button" className="ameacas-mini-btn" onClick={() => adicionarItemLista("aspectos") }>
                      <i className="fas fa-plus" /> Adicionar
                    </button>
                  </div>
                  <div className="ameacas-lista-completa">
                    {draft.aspectos.length === 0 ? (
                      <p className="ameacas-vazio">Sem aspectos cadastrados.</p>
                    ) : (
                      draft.aspectos.map((item, indice) => (
                        <div key={item.id} className="ameacas-card-vertical">
                          <div className="ameacas-linha-flex">
                            <input className="ameacas-input" type="text" value={item.nome} onChange={(e) => atualizarAspecto(indice, { nome: e.target.value })} placeholder="Nome do aspecto" />
                            <button type="button" className="ameacas-mini-btn danger" onClick={() => removerItemLista("aspectos", indice)}>
                              <i className="fas fa-times" />
                            </button>
                          </div>
                          <textarea className="ameacas-input" rows={2} value={item.descricao} onChange={(e) => atualizarAspecto(indice, { descricao: e.target.value })} placeholder="Descrição do aspecto" />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {ACTION_CATEGORIES.map((categoria) => (
                  <div className="ameacas-bloco" key={categoria.key}>
                    <div className="ameacas-subcabecalho">
                      <div>
                        <h3>Ações {categoria.label}</h3>
                        <p className="ameacas-subtexto">{categoria.descricao}</p>
                      </div>
                      <button type="button" className="ameacas-mini-btn" onClick={() => adicionarItemLista(categoria.key)}>
                        <i className="fas fa-plus" /> Adicionar
                      </button>
                    </div>
                    <div className="ameacas-lista-completa">
                      {draft.acoes[categoria.key].length === 0 ? (
                        <p className="ameacas-vazio">Nenhuma ação nesta categoria.</p>
                      ) : (
                        draft.acoes[categoria.key].map((item, indice) => (
                          <div key={item.id} className="ameacas-card-vertical">
                            <div className="ameacas-linha-flex">
                              <input className="ameacas-input" type="text" value={item.nome} onChange={(e) => atualizarAcao(categoria.key, indice, { nome: e.target.value })} placeholder="Nome da ação" />
                              <button type="button" className="ameacas-mini-btn danger" onClick={() => removerItemLista(categoria.key, indice)}>
                                <i className="fas fa-times" />
                              </button>
                            </div>
                            <textarea className="ameacas-input" rows={2} value={item.descricao} onChange={(e) => atualizarAcao(categoria.key, indice, { descricao: e.target.value })} placeholder="Descrição" />
                            <div className="ameacas-grid acao-extra">
                              <label>
                                <span>Acerto</span>
                                <input className="ameacas-input" type="text" value={item.acerto} onChange={(e) => atualizarAcao(categoria.key, indice, { acerto: e.target.value })} placeholder="Ex: +10 para atingir" />
                              </label>
                              <label>
                                <span>Dano</span>
                                <input className="ameacas-input" type="text" value={item.dano} onChange={(e) => atualizarAcao(categoria.key, indice, { dano: e.target.value })} placeholder="Ex: 4d6+3" />
                              </label>
                              <label>
                                <span>Custo</span>
                                <input className="ameacas-input" type="text" value={item.custo} onChange={(e) => atualizarAcao(categoria.key, indice, { custo: e.target.value })} placeholder="Ex: 12 PP" />
                              </label>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
