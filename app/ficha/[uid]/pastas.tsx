"use client";

// Pastas: etiqueta na ficha (filtro) e cópia guardada pra trazer em qualquer ficha.

import { useEffect, useMemo, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { exigir } from "@/lib/acoes";
import { agruparPastas, nomeDePasta, MAX_NOME_PASTA, type ModeloView, type TipoModelo } from "@/lib/pastas";
import { apagarModelo, apagarPasta, listarPastas, renomearPasta } from "./actions";
import { casaBusca, normalizarBusca } from "./barra-filtros";

const ROTULO: Record<TipoModelo, { um: string; varios: string }> = {
  habilidade: { um: "habilidade", varios: "habilidades" },
  acao: { um: "ação", varios: "ações" },
};

function contar(n: number, tipo: TipoModelo): string {
  return `${n} ${n === 1 ? ROTULO[tipo].um : ROTULO[tipo].varios}`;
}

function erro(err: unknown) {
  Swal.fire({
    icon: "error",
    title: "Erro",
    text: err instanceof Error ? err.message : "Operação falhou.",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

function aviso(titulo: string) {
  Swal.fire({
    toast: true,
    position: "bottom",
    icon: "success",
    title: titulo,
    showConfirmButton: false,
    timer: 2200,
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

// Linha de apoio do modelo: o que ele é, sem abrir.
function resumoDoModelo(m: ModeloView): string {
  const d = m.dados;
  const efeitos = Array.isArray(d.efeitos) ? d.efeitos.length : 0;
  const partes = [
    m.tipo === "acao" && d.tecnica ? `Técnica${Number(d.grau) > 0 ? ` ${d.grau}º grau` : ""}` : null,
    typeof d.dano === "string" && d.dano ? d.dano : null,
    Number(d.custoPp) > 0 ? `${d.custoPp} PP` : null,
    efeitos > 0 ? `${efeitos} efeito${efeitos === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return partes.join(" · ") || (typeof d.descricao === "string" ? d.descricao : "");
}

// Modelos do usuário; `null` enquanto carrega.
function useModelos(carregar: typeof listarPastas) {
  const [modelos, setModelos] = useState<ModeloView[] | null>(null);
  useEffect(() => {
    let vivo = true;
    carregar()
      .then((r) => {
        if (vivo) setModelos(exigir(r).modelos);
      })
      .catch((err) => {
        if (vivo) setModelos([]);
        erro(err);
      });
    return () => {
      vivo = false;
    };
  }, [carregar]);
  return [modelos, setModelos] as const;
}

// Botão do topo da aba: abre as pastas pra trazer pra ficha.
export function BotaoPastas({
  tipo,
  onAdicionar,
}: {
  tipo: TipoModelo;
  // Cria na ficha (otimista) o que foi escolhido.
  onAdicionar: (modelos: ModeloView[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className="btn-rect outline" onClick={() => setAberto(true)}>
        <i className="fas fa-folder-open" /> Pastas
      </button>
      {aberto && (
        <ModalPastas
          tipo={tipo}
          onAdicionar={onAdicionar}
          onFechar={() => setAberto(false)}
        />
      )}
    </>
  );
}

export type OrigemGuardar = { nome: string; pasta: string | null };

// Botão do card: põe a habilidade ou ação numa pasta.
export function BotaoGuardar({
  origem,
  pastasDaFicha,
  sugestoes,
  onGuardar,
}: {
  origem: OrigemGuardar;
  pastasDaFicha: string[];
  // Nomes prontos pra uma pasta nova (origem, tag…).
  sugestoes: string[];
  // Põe na pasta (ou tira, com null); quem chama grava.
  onGuardar: (pasta: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`btn-card-pasta${origem.pasta ? " ativo" : ""}`}
        title={origem.pasta ? `Pasta: ${origem.pasta}` : "Guardar em pasta"}
        aria-label={`Guardar ${origem.nome} em pasta`}
        onClick={() => setAberto(true)}
      >
        <i className={`fas ${origem.pasta ? "fa-folder" : "fa-folder-plus"}`} />
      </button>
      {aberto && (
        <ModalGuardar
          origem={origem}
          pastasDaFicha={pastasDaFicha}
          sugestoes={sugestoes}
          onGuardar={onGuardar}
          onFechar={() => setAberto(false)}
        />
      )}
    </>
  );
}

// Um campo só: filtra as pastas que existem e cria a que não existe.
export function ModalGuardar({
  origem,
  pastasDaFicha,
  sugestoes,
  onGuardar,
  onFechar,
  carregar = listarPastas,
}: {
  origem: OrigemGuardar;
  pastasDaFicha: string[];
  sugestoes: string[];
  onGuardar: (pasta: string | null) => void;
  onFechar: () => void;
  // De onde vêm as pastas já guardadas.
  carregar?: typeof listarPastas;
}) {
  const [modelos] = useModelos(carregar);
  const [texto, setTexto] = useState("");
  const [cursor, setCursor] = useState(0);

  // As da ficha aparecem na hora; as guardadas, quando chegam.
  const conhecidas = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of pastasDaFicha) mapa.set(p, 0);
    for (const m of modelos ?? []) mapa.set(m.pasta, (mapa.get(m.pasta) ?? 0) + 1);
    return [...mapa]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [pastasDaFicha, modelos]);

  const nova = nomeDePasta(texto);
  const igual = (a: string, b: string) => normalizarBusca(a) === normalizarBusca(b);
  const filtradas = conhecidas.filter((p) => casaBusca(texto, [p.nome]));
  const criar = nova !== "" && !conhecidas.some((p) => igual(p.nome, nova));
  const total = filtradas.length + (criar ? 1 : 0);
  const posicao = Math.min(cursor, Math.max(0, total - 1));
  const sugeridas = [...new Set(sugestoes.map(nomeDePasta).filter(Boolean))]
    .filter((s) => !conhecidas.some((p) => igual(p.nome, s)))
    .slice(0, 4);

  function guardar(pasta: string | null) {
    if (pasta !== origem.pasta) {
      onGuardar(pasta);
      aviso(pasta ? `Guardado em ${pasta}` : "Fora da pasta");
    }
    onFechar();
  }

  function teclado(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (total === 0) return;
      setCursor((posicao + (e.key === "ArrowDown" ? 1 : -1) + total) % total);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (posicao < filtradas.length) guardar(filtradas[posicao].nome);
      else if (criar) guardar(nova);
    }
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div
        className="modal-box guardar-box"
        role="dialog"
        aria-label="Guardar em pasta"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onFechar} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
        <div className="guardar-topo">
          <span className="guardar-icone">
            <i className="fas fa-folder-plus" />
          </span>
          <div className="guardar-titulo">
            <h2>Guardar em pasta</h2>
            <span>{origem.nome}</span>
          </div>
        </div>

        <div className="guardar-campo">
          <i className="fas fa-magnifying-glass" />
          <input
            type="text"
            value={texto}
            maxLength={MAX_NOME_PASTA}
            placeholder="Buscar ou criar pasta"
            aria-label="Buscar ou criar pasta"
            spellCheck={false}
            autoComplete="off"
            autoFocus
            onChange={(e) => {
              setTexto(e.target.value);
              setCursor(0);
            }}
            onKeyDown={teclado}
          />
        </div>

        {!texto && sugeridas.length > 0 && (
          <div className="guardar-sugestoes">
            <span>Criar</span>
            {sugeridas.map((s) => (
              <button type="button" key={s} className="sugestao" onClick={() => guardar(s)}>
                <i className="fas fa-plus" /> {s}
              </button>
            ))}
          </div>
        )}

        <ul className="guardar-lista" role="listbox" aria-label="Pastas">
          {filtradas.map((p, i) => {
            const atual = p.nome === origem.pasta;
            return (
              <li key={p.nome}>
                <button
                  type="button"
                  role="option"
                  aria-selected={atual}
                  className={`guardar-opcao${i === posicao ? " cursor" : ""}${atual ? " ativo" : ""}`}
                  onPointerMove={() => setCursor(i)}
                  onClick={() => guardar(p.nome)}
                >
                  <i className={`fas ${atual ? "fa-folder-open" : "fa-folder"} guardar-opcao-icone`} />
                  <span className="guardar-opcao-nome">{p.nome}</span>
                  {p.total > 0 && <span className="guardar-opcao-total">{p.total}</span>}
                  {atual && <i className="fas fa-check" />}
                </button>
              </li>
            );
          })}
          {criar && (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className={`guardar-opcao criar${posicao === filtradas.length ? " cursor" : ""}`}
                onPointerMove={() => setCursor(filtradas.length)}
                onClick={() => guardar(nova)}
              >
                <i className="fas fa-plus guardar-opcao-icone" />
                <span className="guardar-opcao-nome">
                  Criar pasta <strong>{nova}</strong>
                </span>
                <kbd>Enter</kbd>
              </button>
            </li>
          )}
          {total === 0 && (
            <li className="guardar-vazio">
              {modelos === null ? (
                <>
                  <i className="fas fa-spinner fa-spin" /> Carregando
                </>
              ) : (
                <>
                  <i className="fas fa-folder-open" />
                  Nenhuma pasta ainda
                </>
              )}
            </li>
          )}
        </ul>

        {origem.pasta && (
          <div className="guardar-rodape">
            <button type="button" className="guardar-tirar" onClick={() => guardar(null)}>
              <i className="fas fa-folder-minus" /> Tirar de {origem.pasta}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ModalPastas({
  tipo,
  onAdicionar,
  onFechar,
  carregar = listarPastas,
}: {
  tipo: TipoModelo;
  onAdicionar: (modelos: ModeloView[]) => void;
  onFechar: () => void;
  // De onde vêm os modelos.
  carregar?: typeof listarPastas;
}) {
  const [modelos, setModelos] = useModelos(carregar);
  const [pasta, setPasta] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [ocupado, startTransition] = useTransition();

  const pastas = agruparPastas(modelos ?? [], tipo);
  const aberta = pasta ? pastas.find((p) => p.pasta === pasta) : undefined;

  function abrirPasta(nome: string) {
    setPasta(nome);
    setMarcados(new Set());
    setRenomeando(null);
  }

  function alternar(id: string) {
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function adicionar() {
    const escolhidos = (aberta?.modelos ?? []).filter((m) => marcados.has(m.id));
    if (escolhidos.length === 0) return;
    onAdicionar(escolhidos);
    onFechar();
  }

  function tirar(m: ModeloView) {
    setModelos((lista) => (lista ?? []).filter((x) => x.id !== m.id));
    setMarcados((s) => {
      const n = new Set(s);
      n.delete(m.id);
      return n;
    });
    startTransition(async () => {
      try {
        exigir(await apagarModelo(m.id));
      } catch (err) {
        erro(err);
      }
    });
  }

  async function tirarPasta(nome: string) {
    const c = await Swal.fire({
      title: `Apagar a pasta ${nome}?`,
      text: "O que já está na ficha continua.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Apagar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!c.isConfirmed) return;
    setModelos((lista) => (lista ?? []).filter((x) => x.pasta !== nome));
    setPasta(null);
    startTransition(async () => {
      try {
        exigir(await apagarPasta(nome));
      } catch (err) {
        erro(err);
      }
    });
  }

  function renomear(de: string) {
    const para = nomeDePasta(renomeando);
    setRenomeando(null);
    if (!para || para === de) return;
    setModelos((lista) => (lista ?? []).map((x) => (x.pasta === de ? { ...x, pasta: para } : x)));
    setPasta(para);
    startTransition(async () => {
      try {
        exigir(await renomearPasta(de, para));
      } catch (err) {
        erro(err);
      }
    });
  }

  const todosMarcados = !!aberta && aberta.modelos.length > 0 && aberta.modelos.every((m) => marcados.has(m.id));

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-box pastas-box" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onFechar} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
        <h2>Pastas</h2>

        {modelos === null ? (
          <p className="pastas-vazio">
            <i className="fas fa-spinner fa-spin" /> Carregando
          </p>
        ) : aberta ? (
          <>
            <div className="pasta-topo">
              <button type="button" className="pasta-voltar" onClick={() => setPasta(null)}>
                <i className="fas fa-arrow-left" /> Pastas
              </button>
              {renomeando === null ? (
                <strong className="pasta-nome">
                  <i className="fas fa-folder-open" /> {aberta.pasta}
                </strong>
              ) : (
                <input
                  type="text"
                  className="pasta-renomear"
                  value={renomeando}
                  maxLength={MAX_NOME_PASTA}
                  autoFocus
                  aria-label="Nome da pasta"
                  onChange={(e) => setRenomeando(e.target.value)}
                  onBlur={() => renomear(aberta.pasta)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      renomear(aberta.pasta);
                    } else if (e.key === "Escape") {
                      e.stopPropagation();
                      setRenomeando(null);
                    }
                  }}
                />
              )}
              <button
                type="button"
                className="pasta-acao"
                title="Renomear"
                aria-label="Renomear pasta"
                onClick={() => setRenomeando(aberta.pasta)}
              >
                <i className="fas fa-pen" />
              </button>
              <button
                type="button"
                className="pasta-acao perigo"
                title="Apagar pasta"
                aria-label="Apagar pasta"
                onClick={() => tirarPasta(aberta.pasta)}
              >
                <i className="fas fa-trash" />
              </button>
            </div>

            {aberta.modelos.length === 0 ? (
              <p className="pastas-vazio">Nenhuma {ROTULO[tipo].um} nesta pasta.</p>
            ) : (
              <ul className="pasta-itens">
                {aberta.modelos.map((m) => {
                  const marcado = marcados.has(m.id);
                  const resumo = resumoDoModelo(m);
                  return (
                    <li key={m.id} className={`pasta-item${marcado ? " ativo" : ""}`}>
                      <button
                        type="button"
                        className="pasta-item-marcar"
                        role="checkbox"
                        aria-checked={marcado}
                        onClick={() => alternar(m.id)}
                      >
                        <i className={`fas ${marcado ? "fa-circle-check" : "fa-circle"}`} />
                        <span className="pasta-item-texto">
                          <strong>{m.nome}</strong>
                          {resumo && <span>{resumo}</span>}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="pasta-acao perigo"
                        title="Tirar da pasta"
                        aria-label={`Tirar ${m.nome} da pasta`}
                        onClick={() => tirar(m)}
                      >
                        <i className="fas fa-xmark" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="modal-actions">
              {aberta.modelos.length > 1 && (
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={() =>
                    setMarcados(todosMarcados ? new Set() : new Set(aberta.modelos.map((m) => m.id)))
                  }
                >
                  {todosMarcados ? "Desmarcar tudo" : "Marcar tudo"}
                </button>
              )}
              <button
                type="button"
                className="modal-btn-save"
                disabled={marcados.size === 0 || ocupado}
                onClick={adicionar}
              >
                Adicionar{marcados.size > 0 ? ` ${contar(marcados.size, tipo)}` : ""}
              </button>
            </div>
          </>
        ) : pastas.length === 0 ? (
          <p className="pastas-vazio">
            Nada guardado. Use <i className="fas fa-folder-plus" /> no card.
          </p>
        ) : (
          <div className="pastas-grade">
            {pastas.map((p) => (
              <button type="button" key={p.pasta} className="pasta-card" onClick={() => abrirPasta(p.pasta)}>
                <i className="fas fa-folder pasta-card-icone" />
                <strong>{p.pasta}</strong>
                <span>{contar(p.modelos.length, tipo)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
