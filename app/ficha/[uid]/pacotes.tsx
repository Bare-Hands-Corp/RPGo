"use client";

// Pacotes: exportar habilidades, ações e árvores por código e importar o de outro usuário.

import { createContext, useContext, useEffect, useMemo, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { ehTemporario, exigir, idTemporario } from "@/lib/acoes";
import {
  MAX_NOME_PACOTE,
  lerCodigo,
  planejarImportacao,
  resumoDaContagem,
  type Escolha,
  type PacoteDados,
  type PacoteView,
  type PlanoImportacao,
} from "@/lib/pacote";
import { mesmoNome } from "@/lib/pastas";
import { agruparFormas } from "@/lib/formas";
import { apagarPacote, exportarPacote, importarPacote, listarPacotes, verPacote } from "./actions";
import { casaBusca } from "./barra-filtros";
import { Segmentos } from "./campos-modal";
import { resumoDosDados } from "./pastas";

// O que a ficha tem pra exportar e pra casar com o que chega.
export type FichaDoPacote = {
  personagemId: string;
  habilidades: (Record<string, unknown> & { id: string; nome: string; formaDe?: string | null })[];
  acoes: (Record<string, unknown> & { id: string; nome: string; formaDe?: string | null })[];
  arvores: { id: string; nome: string; icone: string; nos: { habilidadeId: string | null }[] }[];
  recursos: { id: string; nome: string }[];
};

export const PacotesContext = createContext<FichaDoPacote | null>(null);

// Habilidades e ações importadas, pra cada aba mostrar na hora.
export const EVENTO_IMPORTADO = "rpgo:pacote-importado";
export type Importado = Pick<PlanoImportacao, "habilidades" | "acoes">;

type PacoteAberto = { codigo: string; nome: string; dados: PacoteDados };

type Linha = { chave: string; nome: string; resumo: string; icone: string; jaTem?: boolean };
type Grupo = { titulo: string; linhas: Linha[] };

const BUSCA_A_PARTIR_DE = 9;

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

async function copiar(codigo: string) {
  try {
    await navigator.clipboard.writeText(codigo);
    aviso("Código copiado");
  } catch {
    erro(new Error("Não deu pra copiar. Selecione o código e copie."));
  }
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

// As chaves marcadas de um tipo ("h:", "a:", "t:"), sem o prefixo.
function marcadosDe(marcados: Set<string>, prefixo: string): string[] {
  return [...marcados].filter((c) => c.startsWith(prefixo)).map((c) => c.slice(prefixo.length));
}

// Botão do topo da aba: abre exportar e importar.
export function BotaoPacotes({
  onArvore,
}: {
  // Árvore que acabou de chegar, pra aba abrir nela.
  onArvore?: (arvoreId: string) => void;
}) {
  const ficha = useContext(PacotesContext);
  const [aberto, setAberto] = useState(false);
  const [, startTransition] = useTransition();
  if (!ficha) return null;

  // Aparece na hora nas abas e o servidor cria de verdade.
  function importar(pacote: PacoteAberto, escolha: Escolha) {
    if (!ficha) return;
    setAberto(false);
    startTransition(async () => {
      const plano = planejarImportacao(pacote.dados, escolha, ficha, idTemporario);
      window.dispatchEvent(
        new CustomEvent<Importado>(EVENTO_IMPORTADO, {
          detail: { habilidades: plano.habilidades, acoes: plano.acoes },
        }),
      );
      try {
        const r = exigir(await importarPacote(ficha.personagemId, pacote.codigo, escolha));
        aviso(`Importado: ${resumoDaContagem({ ...r, arvores: r.arvores.length })}`);
        if (r.arvores[0]) onArvore?.(r.arvores[0]);
      } catch (err) {
        erro(err);
      }
    });
  }

  return (
    <>
      <button type="button" className="btn-rect outline" onClick={() => setAberto(true)}>
        <i className="fas fa-share-nodes" /> Compartilhar
      </button>
      {aberto && <ModalPacotes ficha={ficha} onImportar={importar} onFechar={() => setAberto(false)} />}
    </>
  );
}

type Modo = "exportar" | "importar" | "meus";

// De onde vêm e pra onde vão os códigos.
const ACOES = {
  listar: listarPacotes,
  exportar: exportarPacote,
  ver: verPacote,
  apagar: apagarPacote,
};

const MODOS: { valor: Modo; rotulo: string }[] = [
  { valor: "exportar", rotulo: "Exportar" },
  { valor: "importar", rotulo: "Importar" },
  { valor: "meus", rotulo: "Meus códigos" },
];

export function ModalPacotes({
  ficha,
  onImportar,
  onFechar,
  acoes = ACOES,
}: {
  ficha: FichaDoPacote;
  onImportar: (pacote: PacoteAberto, escolha: Escolha) => void;
  onFechar: () => void;
  acoes?: typeof ACOES;
}) {
  const temOQueExportar = ficha.habilidades.length + ficha.acoes.length + ficha.arvores.length > 0;
  const [modo, setModo] = useState<Modo>(temOQueExportar ? "exportar" : "importar");
  // Códigos do usuário; `null` enquanto não carregou.
  const [pacotes, setPacotes] = useState<PacoteView[] | null>(null);

  useEffect(() => {
    if (modo !== "meus" || pacotes !== null) return;
    let vivo = true;
    acoes
      .listar()
      .then((r) => {
        if (vivo) setPacotes(exigir(r).pacotes);
      })
      .catch((err) => {
        if (vivo) setPacotes([]);
        erro(err);
      });
    return () => {
      vivo = false;
    };
  }, [modo, pacotes, acoes]);

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div
        className="modal-box pastas-box"
        role="dialog"
        aria-label="Compartilhar"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onFechar} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
        <h2>Compartilhar</h2>
        <Segmentos rotulo="O que fazer" opcoes={MODOS} valor={modo} onChange={setModo} />

        {modo === "exportar" && (
          <Exportar
            ficha={ficha}
            exportar={acoes.exportar}
            onGerado={(p) => setPacotes((lista) => (lista ? [p, ...lista] : lista))}
          />
        )}
        {modo === "importar" && <Importar ficha={ficha} ver={acoes.ver} onImportar={onImportar} />}
        {modo === "meus" && (
          <MeusCodigos pacotes={pacotes} setPacotes={setPacotes} apagar={acoes.apagar} />
        )}
      </div>
    </div>
  );
}

// Grupos com caixas de marcar; a busca filtra as linhas.
function ListaMarcavel({
  grupos,
  marcados,
  onAlternar,
  onMarcarGrupo,
  busca = "",
}: {
  grupos: Grupo[];
  marcados: Set<string>;
  onAlternar: (linha: Linha) => void;
  // Marca ou desmarca as linhas dadas de uma vez.
  onMarcarGrupo: (linhas: Linha[], marcar: boolean) => void;
  busca?: string;
}) {
  const visiveis = grupos
    .map((g) => ({ ...g, linhas: g.linhas.filter((l) => casaBusca(busca, [l.nome, l.resumo])) }))
    .filter((g) => g.linhas.length > 0);
  if (visiveis.length === 0) return <p className="pastas-vazio">Nada encontrado.</p>;
  return (
    <div className="pacote-lista">
      {visiveis.map((g) => {
        const todos = g.linhas.every((l) => marcados.has(l.chave));
        return (
          <section key={g.titulo} className="pacote-grupo">
            <header>
              <strong>{g.titulo}</strong>
              <span>{g.linhas.length}</span>
              {g.linhas.length > 1 && (
                <button type="button" onClick={() => onMarcarGrupo(g.linhas, !todos)}>
                  {todos ? "Desmarcar tudo" : "Marcar tudo"}
                </button>
              )}
            </header>
            <ul className="pasta-itens">
              {g.linhas.map((l) => {
                const marcado = marcados.has(l.chave);
                return (
                  <li key={l.chave} className={`pasta-item${marcado ? " ativo" : ""}`}>
                    <button
                      type="button"
                      className="pasta-item-marcar"
                      role="checkbox"
                      aria-checked={marcado}
                      onClick={() => onAlternar(l)}
                    >
                      <i className={`fas ${marcado ? "fa-circle-check" : "fa-circle"}`} />
                      <span className="pasta-item-texto">
                        <strong>
                          <i className={`fas ${l.icone} pacote-tipo`} /> {l.nome}
                        </strong>
                        {l.resumo && <span>{l.resumo}</span>}
                      </span>
                      {l.jaTem && <span className="pacote-ja-tem">Já na ficha</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function CampoBusca({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <div className="guardar-campo pacote-busca">
      <i className="fas fa-magnifying-glass" />
      <input
        type="text"
        value={valor}
        placeholder="Buscar"
        aria-label="Buscar"
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Exportar({
  ficha,
  exportar,
  onGerado,
}: {
  ficha: FichaDoPacote;
  exportar: typeof exportarPacote;
  onGerado: (pacote: PacoteView) => void;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [nome, setNome] = useState("");
  const [gerado, setGerado] = useState<PacoteView | null>(null);
  const [ocupado, startTransition] = useTransition();

  const grupos = useMemo<Grupo[]>(() => {
    // Uma linha por origem; as formas dela vão junto.
    const linhasDe = (
      tipo: "habilidade" | "acao",
      itens: (Record<string, unknown> & { id: string; nome: string; formaDe?: string | null })[],
    ): Linha[] => {
      const salvos = itens.filter((i) => !ehTemporario(i.id));
      const { origemDe, formasDe } = agruparFormas(salvos);
      return salvos
        .filter((i) => !origemDe(i))
        .map((i) => {
          const formas = formasDe.get(i.id)?.length ?? 0;
          return {
            chave: `${tipo === "habilidade" ? "h" : "a"}:${i.id}`,
            nome: i.nome,
            resumo: [resumoDosDados(tipo, i), formas > 0 ? plural(formas, "forma", "formas") : null]
              .filter(Boolean)
              .join(" · "),
            icone: tipo === "habilidade" ? "fa-star" : "fa-fist-raised",
          };
        });
    };
    return [
      { titulo: "Habilidades", linhas: linhasDe("habilidade", ficha.habilidades) },
      { titulo: "Ações", linhas: linhasDe("acao", ficha.acoes) },
      {
        titulo: "Árvores",
        linhas: ficha.arvores.map((a) => {
          const ligadas = new Set(a.nos.flatMap((n) => (n.habilidadeId ? [n.habilidadeId] : []))).size;
          return {
            chave: `t:${a.id}`,
            nome: a.nome,
            resumo: [
              plural(a.nos.length, "talento", "talentos"),
              ligadas > 0 ? plural(ligadas, "habilidade", "habilidades") : null,
            ]
              .filter(Boolean)
              .join(" · "),
            icone: a.icone,
          };
        }),
      },
    ];
  }, [ficha]);
  const total = grupos.reduce((n, g) => n + g.linhas.length, 0);

  // Habilidades ligadas aos talentos da árvore, que vão junto com ela.
  function habilidadesDaArvore(chave: string): string[] {
    const arvore = ficha.arvores.find((a) => `t:${a.id}` === chave);
    const { origemDe } = agruparFormas(ficha.habilidades);
    return (arvore?.nos ?? []).flatMap((n) => {
      const h = ficha.habilidades.find((x) => x.id === n.habilidadeId);
      // Talento ligado a uma forma leva a habilidade de origem.
      return h ? [`h:${(origemDe(h) ?? h).id}`] : [];
    });
  }

  function marcar(linhas: Linha[], ligar: boolean) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      for (const l of linhas) {
        if (!ligar) novo.delete(l.chave);
        else for (const c of [l.chave, ...habilidadesDaArvore(l.chave)]) novo.add(c);
      }
      return novo;
    });
  }

  function gerar() {
    startTransition(async () => {
      try {
        const r = exigir(
          await exportar(ficha.personagemId, {
            nome,
            habilidadeIds: marcadosDe(marcados, "h:"),
            acaoIds: marcadosDe(marcados, "a:"),
            arvoreIds: marcadosDe(marcados, "t:"),
          }),
        );
        setGerado(r.pacote);
        onGerado(r.pacote);
      } catch (err) {
        erro(err);
      }
    });
  }

  if (gerado) {
    return (
      <>
        <div className="pacote-pronto">
          <span>{gerado.nome}</span>
          <button
            type="button"
            className="pacote-codigo"
            title="Copiar"
            onClick={() => copiar(gerado.codigo)}
          >
            {gerado.codigo}
          </button>
          <span>{resumoDaContagem(gerado)}</span>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn-cancel"
            onClick={() => {
              setGerado(null);
              setMarcados(new Set());
              setNome("");
            }}
          >
            Outro código
          </button>
          <button type="button" className="modal-btn-save" onClick={() => copiar(gerado.codigo)}>
            <i className="fas fa-copy" /> Copiar
          </button>
        </div>
      </>
    );
  }

  if (total === 0) return <p className="pastas-vazio">Nada pra exportar nesta ficha.</p>;

  return (
    <>
      {total >= BUSCA_A_PARTIR_DE && <CampoBusca valor={busca} onChange={setBusca} />}
      <ListaMarcavel
        grupos={grupos}
        marcados={marcados}
        busca={busca}
        onAlternar={(l) => marcar([l], !marcados.has(l.chave))}
        onMarcarGrupo={marcar}
      />
      <label htmlFor="pacote-nome">Nome</label>
      <input
        id="pacote-nome"
        type="text"
        value={nome}
        maxLength={MAX_NOME_PACOTE}
        placeholder="Ex: Estilo Santoryu"
        autoComplete="off"
        onChange={(e) => setNome(e.target.value)}
      />
      <div className="modal-actions">
        <button
          type="button"
          className="modal-btn-save"
          disabled={marcados.size === 0 || ocupado}
          onClick={gerar}
        >
          {ocupado ? "Gerando" : "Gerar código"}
        </button>
      </div>
    </>
  );
}

// O conteúdo de um código em grupos, marcando o que a ficha já tem com o mesmo nome.
function gruposDoPacote(dados: PacoteDados, ficha: FichaDoPacote): Grupo[] {
  const nomeDe = (d: Record<string, unknown>) => String(d.nome ?? "");
  const jaTem = (lista: { nome: string }[], nome: string) => lista.some((x) => mesmoNome(x.nome, nome));
  return [
    {
      titulo: "Habilidades",
      linhas: dados.habilidades.map((h) => ({
        chave: `h:${h.ref}`,
        nome: nomeDe(h.dados),
        resumo: resumoDosDados("habilidade", h.dados),
        icone: "fa-star",
        jaTem: jaTem(ficha.habilidades, nomeDe(h.dados)),
      })),
    },
    {
      titulo: "Ações",
      linhas: dados.acoes.map((a) => ({
        chave: `a:${a.ref}`,
        nome: nomeDe(a.dados),
        resumo: resumoDosDados("acao", a.dados),
        icone: "fa-fist-raised",
        jaTem: jaTem(ficha.acoes, nomeDe(a.dados)),
      })),
    },
    {
      titulo: "Árvores",
      linhas: dados.arvores.map((a) => ({
        chave: `t:${a.ref}`,
        nome: a.nome,
        resumo: plural(a.nos.length, "talento", "talentos"),
        icone: a.icone || "fa-sitemap",
        jaTem: jaTem(ficha.arvores, a.nome),
      })),
    },
  ];
}

function Importar({
  ficha,
  ver,
  onImportar,
}: {
  ficha: FichaDoPacote;
  ver: typeof verPacote;
  onImportar: (pacote: PacoteAberto, escolha: Escolha) => void;
}) {
  const [texto, setTexto] = useState("");
  const [falha, setFalha] = useState<string | null>(null);
  const [pacote, setPacote] = useState<PacoteAberto | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [buscando, startTransition] = useTransition();

  const grupos = useMemo(() => (pacote ? gruposDoPacote(pacote.dados, ficha) : []), [pacote, ficha]);
  const total = grupos.reduce((n, g) => n + g.linhas.length, 0);

  const escolha: Escolha = {
    habilidades: marcadosDe(marcados, "h:"),
    acoes: marcadosDe(marcados, "a:"),
    arvores: marcadosDe(marcados, "t:"),
  };
  // Recursos que a ficha não tem e chegam junto.
  const recursosNovos = pacote
    ? planejarImportacao(pacote.dados, escolha, ficha, () => "").recursos.map((r) => r.nome)
    : [];

  function abrir() {
    const codigo = lerCodigo(texto);
    if (!codigo) {
      setPacote(null);
      setFalha("Código inválido.");
      return;
    }
    setFalha(null);
    startTransition(async () => {
      try {
        const r = exigir(await ver(codigo));
        setPacote(r.pacote);
        setBusca("");
        // O que a ficha ainda não tem já nasce marcado.
        setMarcados(
          new Set(
            gruposDoPacote(r.pacote.dados, ficha).flatMap((g) =>
              g.linhas.filter((l) => !l.jaTem).map((l) => l.chave),
            ),
          ),
        );
      } catch (err) {
        setPacote(null);
        setFalha(err instanceof Error ? err.message : "Operação falhou.");
      }
    });
  }

  function marcar(linhas: Linha[], ligar: boolean) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      for (const l of linhas) {
        if (ligar) novo.add(l.chave);
        else novo.delete(l.chave);
      }
      return novo;
    });
  }

  return (
    <>
      <div className="pacote-abrir">
        <div className={`guardar-campo${falha ? " com-erro" : ""}`}>
          <i className="fas fa-key" />
          <input
            type="text"
            className="pacote-codigo-campo"
            value={texto}
            maxLength={16}
            placeholder="HR-XXXXXX"
            aria-label="Código"
            aria-invalid={!!falha}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="characters"
            autoFocus
            onChange={(e) => {
              setTexto(e.target.value.toUpperCase());
              setFalha(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                abrir();
              }
            }}
          />
        </div>
        <button
          type="button"
          className="btn-rect primary"
          disabled={texto.trim() === "" || buscando}
          onClick={abrir}
        >
          {buscando ? "Abrindo" : "Abrir"}
        </button>
      </div>
      {falha && (
        <p className="pacote-falha" role="alert">
          {falha}
        </p>
      )}

      {pacote && (
        <>
          <div className="pacote-cabecalho">
            <strong>{pacote.nome}</strong>
            {pacote.dados.de && <span>de {pacote.dados.de}</span>}
          </div>
          {total === 0 ? (
            <p className="pastas-vazio">Este código está vazio.</p>
          ) : (
            <>
              {total >= BUSCA_A_PARTIR_DE && <CampoBusca valor={busca} onChange={setBusca} />}
              <ListaMarcavel
                grupos={grupos}
                marcados={marcados}
                busca={busca}
                onAlternar={(l) => marcar([l], !marcados.has(l.chave))}
                onMarcarGrupo={marcar}
              />
              {recursosNovos.length > 0 && (
                <p className="pacote-nota">
                  <i className="fas fa-plus" />{" "}
                  {recursosNovos.length === 1 ? "Cria o recurso" : "Cria os recursos"}{" "}
                  {recursosNovos.join(", ")}
                </p>
              )}
            </>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="modal-btn-save"
              disabled={marcados.size === 0}
              onClick={() => onImportar(pacote, escolha)}
            >
              Importar{marcados.size > 0 ? ` ${marcados.size}` : ""}
            </button>
          </div>
        </>
      )}
    </>
  );
}

function MeusCodigos({
  pacotes,
  setPacotes,
  apagar: apagarNoServidor,
}: {
  pacotes: PacoteView[] | null;
  setPacotes: React.Dispatch<React.SetStateAction<PacoteView[] | null>>;
  apagar: typeof apagarPacote;
}) {
  const [, startTransition] = useTransition();

  async function apagar(p: PacoteView) {
    const c = await Swal.fire({
      title: `Apagar o código ${p.codigo}?`,
      text: "O que já foi importado continua nas fichas.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "var(--danger)",
      cancelButtonColor: "var(--text-sec)",
      confirmButtonText: "Apagar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!c.isConfirmed) return;
    setPacotes((lista) => (lista ?? []).filter((x) => x.id !== p.id));
    startTransition(async () => {
      try {
        exigir(await apagarNoServidor(p.id));
      } catch (err) {
        erro(err);
      }
    });
  }

  if (pacotes === null) {
    return (
      <p className="pastas-vazio">
        <i className="fas fa-spinner fa-spin" /> Carregando
      </p>
    );
  }
  if (pacotes.length === 0) return <p className="pastas-vazio">Nenhum código gerado.</p>;
  return (
    <ul className="pasta-itens pacote-meus">
      {pacotes.map((p) => (
        <li key={p.id} className="pasta-item">
          <button
            type="button"
            className="pasta-item-marcar"
            title="Copiar"
            onClick={() => copiar(p.codigo)}
          >
            <i className="fas fa-copy" />
            <span className="pasta-item-texto">
              <strong>{p.nome}</strong>
              <span>
                <code>{p.codigo}</code> · {resumoDaContagem(p)}
              </span>
            </span>
          </button>
          <button
            type="button"
            className="pasta-acao perigo"
            title="Apagar"
            aria-label={`Apagar o código ${p.codigo}`}
            onClick={() => apagar(p)}
          >
            <i className="fas fa-trash" />
          </button>
        </li>
      ))}
    </ul>
  );
}
