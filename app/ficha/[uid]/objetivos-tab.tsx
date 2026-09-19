"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { IconePicker } from "@/components/icone-picker";
import { atualizarObjetivo, criarObjetivo, deletarObjetivo } from "./actions";
import {
  dataParaDias,
  dataRelativa,
  diasParaData,
  type CalendarioConfig,
} from "@/lib/calendario/engine";

export type Objetivo = {
  id: string;
  titulo: string;
  descricao: string;
  estado: string;
  icone: string;
  prazoDias: number | null;
  ordem: number;
};

type Props = {
  personagemId: string;
  objetivos: Objetivo[];
  /** Config + data atual da mesa. null quando o personagem não tem mesa. */
  calendario: { config: CalendarioConfig; dataAtualDias: number } | null;
};

// Quantos dias antes do prazo o objetivo já conta como "vencendo".
const JANELA_VENCENDO = 3;

type Acao =
  | { kind: "criar"; objetivo: Objetivo }
  | { kind: "patch"; id: string; patch: Partial<Objetivo> }
  | { kind: "apagar"; id: string }
  | { kind: "trocarId"; temporario: string; real: Objetivo };

function reduzir(lista: Objetivo[], acao: Acao): Objetivo[] {
  switch (acao.kind) {
    case "criar":
      return [...lista, acao.objetivo];
    case "patch":
      return lista.map((o) => (o.id === acao.id ? { ...o, ...acao.patch } : o));
    case "apagar":
      return lista.filter((o) => o.id !== acao.id);
    case "trocarId":
      return lista.map((o) => (o.id === acao.temporario ? acao.real : o));
  }
}

function mostrarErro(err: unknown) {
  Swal.fire({
    icon: "error",
    title: "Não deu",
    text: err instanceof Error ? err.message : "Erro inesperado.",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

type Prazo = {
  texto: string;
  data: string;
  atrasado: boolean;
  vencendo: boolean;
};

function lerPrazo(
  prazoDias: number | null,
  calendario: Props["calendario"],
): Prazo | null {
  if (prazoDias === null || !calendario) return null;
  const delta = prazoDias - calendario.dataAtualDias;
  const d = dataParaDias(prazoDias, calendario.config);
  return {
    texto: dataRelativa(prazoDias, calendario.dataAtualDias),
    data: `${d.dia} de ${d.nomeMes}, ${d.ano}`,
    atrasado: delta < 0,
    vencendo: delta >= 0 && delta <= JANELA_VENCENDO,
  };
}

export function ObjetivosTab({ personagemId, objetivos, calendario }: Props) {
  const [lista, aplicar] = useOptimistic(objetivos, reduzir);
  const [, startTransition] = useTransition();
  const [modal, setModal] = useState<Objetivo | "novo" | null>(null);
  const [verFechados, setVerFechados] = useState(false);

  // Abertos por prazo mais próximo; sem prazo vai pro fim.
  const { abertos, fechados } = useMemo(() => {
    const abertos = lista
      .filter((o) => o.estado === "aberto")
      .sort((a, b) => {
        if (a.prazoDias === null && b.prazoDias === null) return a.ordem - b.ordem;
        if (a.prazoDias === null) return 1;
        if (b.prazoDias === null) return -1;
        return a.prazoDias - b.prazoDias;
      });
    const fechados = lista
      .filter((o) => o.estado !== "aberto")
      .sort((a, b) => a.ordem - b.ordem);
    return { abertos, fechados };
  }, [lista]);

  const vencendo = useMemo(
    () =>
      abertos.filter((o) => {
        const p = lerPrazo(o.prazoDias, calendario);
        return p ? p.atrasado || p.vencendo : false;
      }).length,
    [abertos, calendario],
  );

  function salvar(
    dados: Omit<Objetivo, "id" | "ordem" | "estado">,
    id: string | null,
  ) {
    startTransition(async () => {
      if (id) {
        aplicar({ kind: "patch", id, patch: dados });
        try {
          await atualizarObjetivo(personagemId, id, dados);
        } catch (err) {
          mostrarErro(err);
        }
        return;
      }
      const temporario = `tmp-${Date.now()}`;
      const ordem = lista.length;
      aplicar({
        kind: "criar",
        objetivo: { ...dados, id: temporario, ordem, estado: "aberto" },
      });
      try {
        const real = await criarObjetivo(personagemId, { ...dados, ordem });
        aplicar({ kind: "trocarId", temporario, real });
      } catch (err) {
        aplicar({ kind: "apagar", id: temporario });
        mostrarErro(err);
      }
    });
  }

  function mudarEstado(o: Objetivo, estado: string) {
    startTransition(async () => {
      aplicar({ kind: "patch", id: o.id, patch: { estado } });
      try {
        await atualizarObjetivo(personagemId, o.id, { estado });
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  async function apagar(o: Objetivo) {
    const r = await Swal.fire({
      icon: "warning",
      title: "Apagar objetivo?",
      text: o.titulo,
      showCancelButton: true,
      confirmButtonText: "Apagar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!r.isConfirmed) return;
    startTransition(async () => {
      aplicar({ kind: "apagar", id: o.id });
      try {
        await deletarObjetivo(personagemId, o.id);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  return (
    <div className="obj-tab">
      <div className="obj-barra">
        <div className="obj-barra-info">
          <span className="obj-metrica">
            <strong>{abertos.length}</strong> aberto(s)
          </span>
          {vencendo > 0 && (
            <span className="obj-metrica obj-alerta">
              <i className="fas fa-triangle-exclamation" /> <strong>{vencendo}</strong>{" "}
              vencendo
            </span>
          )}
          {fechados.length > 0 && (
            <span className="obj-metrica">
              <strong>{fechados.length}</strong> encerrado(s)
            </span>
          )}
          {!calendario && (
            <span className="obj-metrica obj-sem-mesa">
              <i className="fas fa-calendar-xmark" /> sem mesa — objetivos ficam sem
              prazo
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn-rect outline"
          onClick={() => setModal("novo")}
        >
          + Objetivo
        </button>
      </div>

      {lista.length === 0 ? (
        <button
          type="button"
          className="btn-rect tracejado obj-vazio"
          onClick={() => setModal("novo")}
        >
          <i className="fas fa-scroll" />
          <span>
            Nenhum objetivo ainda — clique pra anotar a primeira meta do personagem.
          </span>
        </button>
      ) : (
        <ul className="obj-lista">
          {abertos.map((o) => (
            <ObjetivoLinha
              key={o.id}
              objetivo={o}
              prazo={lerPrazo(o.prazoDias, calendario)}
              onAlternar={() => mudarEstado(o, "feito")}
              onAbandonar={() => mudarEstado(o, "abandonado")}
              onEditar={() => setModal(o)}
              onApagar={() => apagar(o)}
            />
          ))}
        </ul>
      )}

      {fechados.length > 0 && (
        <>
          <button
            type="button"
            className="obj-fechados-toggle"
            onClick={() => setVerFechados((v) => !v)}
            aria-expanded={verFechados}
          >
            <i className={`fas fa-chevron-${verFechados ? "down" : "right"}`} />{" "}
            Encerrados ({fechados.length})
          </button>
          {verFechados && (
            <ul className="obj-lista">
              {fechados.map((o) => (
                <ObjetivoLinha
                  key={o.id}
                  objetivo={o}
                  prazo={lerPrazo(o.prazoDias, calendario)}
                  onAlternar={() => mudarEstado(o, "aberto")}
                  onEditar={() => setModal(o)}
                  onApagar={() => apagar(o)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {modal && (
        <ObjetivoModal
          inicial={modal === "novo" ? null : modal}
          calendario={calendario}
          onCancelar={() => setModal(null)}
          onSalvar={(dados) => {
            const id = modal === "novo" ? null : modal.id;
            setModal(null);
            salvar(dados, id);
          }}
        />
      )}
    </div>
  );
}

function ObjetivoLinha({
  objetivo,
  prazo,
  onAlternar,
  onAbandonar,
  onEditar,
  onApagar,
}: {
  objetivo: Objetivo;
  prazo: Prazo | null;
  onAlternar: () => void;
  onAbandonar?: () => void;
  onEditar: () => void;
  onApagar: () => void;
}) {
  const feito = objetivo.estado === "feito";
  const abandonado = objetivo.estado === "abandonado";
  const aberto = objetivo.estado === "aberto";

  return (
    <li
      className={`obj-linha ${feito ? "feito" : ""} ${abandonado ? "abandonado" : ""}`}
    >
      <button
        type="button"
        className="obj-marcar"
        onClick={onAlternar}
        title={aberto ? "Marcar como feito" : "Reabrir objetivo"}
        aria-label={aberto ? "Marcar como feito" : "Reabrir objetivo"}
      >
        <i className={`fas fa-${feito ? "square-check" : "square"}`} />
      </button>

      <div className="obj-corpo">
        <div className="obj-titulo-linha">
          <i className={`fas ${objetivo.icone} obj-icone`} />
          <span className="obj-titulo">{objetivo.titulo}</span>
          {abandonado && <span className="obj-selo">abandonado</span>}
        </div>

        {prazo && (
          <span
            className={`obj-prazo ${prazo.atrasado ? "atrasado" : ""} ${
              prazo.vencendo ? "vencendo" : ""
            }`}
          >
            <i className="fas fa-hourglass-half" /> {prazo.texto}
            <em className="obj-prazo-data">{prazo.data}</em>
          </span>
        )}

        {objetivo.descricao && <p className="obj-descricao">{objetivo.descricao}</p>}
      </div>

      <div className="obj-acoes">
        {onAbandonar && (
          <button
            type="button"
            className="recurso-icon-btn"
            onClick={onAbandonar}
            title="Abandonar objetivo"
          >
            <i className="fas fa-ban" />
          </button>
        )}
        <button
          type="button"
          className="recurso-icon-btn"
          onClick={onEditar}
          title="Editar objetivo"
        >
          <i className="fas fa-edit" />
        </button>
        <button
          type="button"
          className="recurso-icon-btn"
          onClick={onApagar}
          title="Apagar objetivo"
        >
          <i className="fas fa-trash" />
        </button>
      </div>
    </li>
  );
}

function ObjetivoModal({
  inicial,
  calendario,
  onCancelar,
  onSalvar,
}: {
  inicial: Objetivo | null;
  calendario: Props["calendario"];
  onCancelar: () => void;
  onSalvar: (dados: Omit<Objetivo, "id" | "ordem" | "estado">) => void;
}) {
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [icone, setIcone] = useState(inicial?.icone ?? "fa-scroll");
  const [temPrazo, setTemPrazo] = useState(inicial?.prazoDias != null);

  // Prazo por data ou "daqui a N dias"; o banco guarda sempre o dia absoluto.
  const [modoPrazo, setModoPrazo] = useState<"data" | "relativo">("data");

  const base = calendario
    ? dataParaDias(inicial?.prazoDias ?? calendario.dataAtualDias, calendario.config)
    : null;
  const [ano, setAno] = useState(base?.ano ?? 1);
  const [mes, setMes] = useState(base?.mes ?? 1);
  const [dia, setDia] = useState(base?.dia ?? 1);
  const [emDias, setEmDias] = useState(() => {
    if (!calendario || inicial?.prazoDias == null) return 7;
    return Math.max(0, inicial.prazoDias - calendario.dataAtualDias);
  });

  const prazoCalculado = !calendario
    ? null
    : modoPrazo === "relativo"
      ? calendario.dataAtualDias + Math.max(0, emDias || 0)
      : diasParaData({ ano, mes, dia }, calendario.config);

  function salvar() {
    const t = titulo.trim();
    if (!t) {
      Swal.fire({
        icon: "warning",
        title: "Campo obrigatório",
        text: "Título é obrigatório.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }
    onSalvar({
      titulo: t,
      descricao: descricao.trim(),
      icone,
      prazoDias: temPrazo && prazoCalculado !== null ? prazoCalculado : null,
    });
  }

  const maxDia = calendario ? calendario.config.meses[mes - 1]?.dias ?? 31 : 31;
  const hoje = calendario
    ? dataParaDias(calendario.dataAtualDias, calendario.config)
    : null;

  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onCancelar}>
          <i className="fas fa-times" />
        </button>
        <h2>{inicial ? "Editar objetivo" : "Novo objetivo"}</h2>

        <div className="modal-bloco">
          <label>
            Título
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Achar um cozinheiro pro bando"
              autoFocus
            />
          </label>

          <label>
            Descrição
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes, condições, quem pediu…"
              rows={3}
            />
          </label>

          <label>Ícone</label>
          <IconePicker valor={icone} onChange={setIcone} />
        </div>

        <h3 className="modal-secao">Prazo</h3>
        <div className="modal-bloco">
          {calendario && hoje ? (
            <>
              <label className="checkbox-linha">
                <input
                  type="checkbox"
                  checked={temPrazo}
                  onChange={(e) => setTemPrazo(e.target.checked)}
                />
                Tem prazo no calendário da mesa
              </label>

              {temPrazo && (
                <>
                  <div className="origem-pills obj-prazo-modo">
                    <button
                      type="button"
                      className={`origem-pill ${modoPrazo === "data" ? "ativo" : ""}`}
                      onClick={() => setModoPrazo("data")}
                      aria-pressed={modoPrazo === "data"}
                    >
                      <i className="fas fa-calendar-day" /> Data exata
                    </button>
                    <button
                      type="button"
                      className={`origem-pill ${modoPrazo === "relativo" ? "ativo" : ""}`}
                      onClick={() => setModoPrazo("relativo")}
                      aria-pressed={modoPrazo === "relativo"}
                    >
                      <i className="fas fa-hourglass-half" /> Daqui a X dias
                    </button>
                  </div>

                  {modoPrazo === "data" ? (
                    <div className="campo-trio">
                      <label>
                        Ano
                        <input
                          type="number"
                          value={ano}
                          onChange={(e) => setAno(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Mês
                        <input
                          type="number"
                          min={1}
                          max={calendario.config.meses.length}
                          value={mes}
                          onChange={(e) => setMes(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Dia
                        <input
                          type="number"
                          min={1}
                          max={maxDia}
                          value={dia}
                          onChange={(e) => setDia(Number(e.target.value))}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="obj-prazo-dias">
                      Daqui a quantos dias
                      <input
                        type="number"
                        min={0}
                        value={emDias}
                        onChange={(e) => setEmDias(Number(e.target.value))}
                      />
                    </label>
                  )}

                  {prazoCalculado !== null && (
                    <p className="campo-dica">
                      Hoje na mesa é {hoje.dia} de {hoje.nomeMes}, {hoje.ano}. Prazo{" "}
                      <strong>{dataRelativa(prazoCalculado, calendario.dataAtualDias)}</strong>
                      {" — "}
                      {(() => {
                        const d = dataParaDias(prazoCalculado, calendario.config);
                        return `${d.dia} de ${d.nomeMes}, ano ${d.ano}`;
                      })()}
                      . Aparece no calendário da mesa como prazo de objetivo (só
                      você e o narrador veem) — não vira evento.
                    </p>
                  )}
                </>
              )}
            </>
          ) : (
            <p className="campo-dica">
              Prazo precisa de uma mesa com calendário. Sem mesa, o objetivo fica só
              como anotação.
            </p>
          )}
        </div>

        <div className="modal-actions separada">
          <button type="button" className="btn-rect neutro sm" onClick={onCancelar}>
            Cancelar
          </button>
          <button type="button" className="btn-rect outline sm" onClick={salvar}>
            <i className="fas fa-check" /> Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
