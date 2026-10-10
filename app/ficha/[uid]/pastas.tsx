"use client";

// Pastas do usuário: guardar habilidade ou ação da ficha e trazer de volta em qualquer ficha.

import { useEffect, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { exigir } from "@/lib/acoes";
import { agruparPastas, nomeDePasta, MAX_NOME_PASTA, type ModeloView, type TipoModelo } from "@/lib/pastas";
import { apagarModelo, apagarPasta, guardarNaPasta, listarPastas, renomearPasta } from "./actions";

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

type Guardar = { id: string; nome: string };

// Botão do topo da aba: abre as pastas pra trazer pra ficha.
export function BotaoPastas({
  personagemId,
  tipo,
  onAdicionar,
}: {
  personagemId: string;
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
          personagemId={personagemId}
          tipo={tipo}
          onAdicionar={onAdicionar}
          onFechar={() => setAberto(false)}
        />
      )}
    </>
  );
}

// Botão do card: guarda a habilidade ou ação numa pasta.
export function BotaoGuardar({
  personagemId,
  tipo,
  origem,
}: {
  personagemId: string;
  tipo: TipoModelo;
  origem: Guardar;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn-card-pasta"
        title="Guardar em pasta"
        aria-label={`Guardar ${origem.nome} em pasta`}
        onClick={() => setAberto(true)}
      >
        <i className="fas fa-folder-plus" />
      </button>
      {aberto && (
        <ModalPastas
          personagemId={personagemId}
          tipo={tipo}
          guardar={origem}
          onFechar={() => setAberto(false)}
        />
      )}
    </>
  );
}

export function ModalPastas({
  personagemId,
  tipo,
  guardar,
  onAdicionar,
  onFechar,
  carregar = listarPastas,
}: {
  personagemId: string;
  tipo: TipoModelo;
  // Com `guardar`, o modal escolhe a pasta de destino.
  guardar?: Guardar;
  onAdicionar?: (modelos: ModeloView[]) => void;
  onFechar: () => void;
  // De onde vêm os modelos.
  carregar?: typeof listarPastas;
}) {
  const [modelos, setModelos] = useState<ModeloView[] | null>(null);
  const [pasta, setPasta] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [nova, setNova] = useState("");
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [ocupado, startTransition] = useTransition();

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

  const pastas = agruparPastas(modelos ?? [], tipo);
  const aberta = pasta ? pastas.find((p) => p.pasta === pasta) : undefined;

  function guardarEm(nome: string) {
    const destino = nomeDePasta(nome);
    if (!guardar || !destino) return;
    startTransition(async () => {
      try {
        exigir(await guardarNaPasta(personagemId, tipo, guardar.id, destino));
        aviso(`Guardado em ${destino}`);
        onFechar();
      } catch (err) {
        erro(err);
      }
    });
  }

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
    if (escolhidos.length === 0 || !onAdicionar) return;
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
        <h2>{guardar ? `Guardar ${guardar.nome}` : "Pastas"}</h2>

        {modelos === null ? (
          <p className="pastas-vazio">
            <i className="fas fa-spinner fa-spin" /> Carregando
          </p>
        ) : aberta && !guardar ? (
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
        ) : (
          <>
            {pastas.length === 0 ? (
              !guardar && (
                <p className="pastas-vazio">
                  Nada guardado. Use <i className="fas fa-folder-plus" /> no card.
                </p>
              )
            ) : (
              <div className="pastas-grade">
                {pastas.map((p) => (
                  <button
                    type="button"
                    key={p.pasta}
                    className="pasta-card"
                    disabled={ocupado}
                    onClick={() => (guardar ? guardarEm(p.pasta) : abrirPasta(p.pasta))}
                  >
                    <i className="fas fa-folder pasta-card-icone" />
                    <strong>{p.pasta}</strong>
                    <span>{contar(p.modelos.length, tipo)}</span>
                  </button>
                ))}
              </div>
            )}
            {guardar && (
              <form
                className="pasta-nova"
                onSubmit={(e) => {
                  e.preventDefault();
                  guardarEm(nova);
                }}
              >
                <input
                  type="text"
                  value={nova}
                  maxLength={MAX_NOME_PASTA}
                  placeholder="Nova pasta"
                  aria-label="Nova pasta"
                  autoFocus={pastas.length === 0}
                  onChange={(e) => setNova(e.target.value)}
                />
                <button type="submit" className="modal-btn-save" disabled={!nomeDePasta(nova) || ocupado}>
                  <i className="fas fa-folder-plus" /> Criar e guardar
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
