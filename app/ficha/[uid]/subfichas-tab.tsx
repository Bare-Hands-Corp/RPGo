"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { ehTemporario, exigir, idTemporario, type Resultado } from "@/lib/acoes";
import {
  FORTIFICACOES_NAVIO,
  montagemPadrao,
  presetDeNavio,
  statsMadeira,
  type MontagemNavio,
} from "@/lib/navio";
import type { SubfichaCard } from "@/lib/resumo-personagem";
import {
  ABAS_DE_SUBFICHA,
  ENTRADAS_COMBATE,
  INICIATIVAS_SUBFICHA,
  MAX_COPIAS,
  MAX_NOME_SUBFICHA,
  PERFIS_DE_SUBFICHA,
  combateDaSubficha,
  nomesDasCopias,
  perfilDe,
  type AbaFicha,
  type CombateSubficha,
  type PerfilFicha,
} from "@/lib/subficha";
import { CampoPasso, Segmentos } from "./campos-modal";
import { CamposMontagemNavio } from "./montagem-navio";
import {
  apagarSubficha,
  atualizarSubficha,
  criarSubficha,
  dispensarCopias,
  invocarCopias,
  patchPersonagem,
} from "./actions";

function mostrarErro(err: unknown) {
  Swal.fire({
    icon: "error",
    title: "Erro",
    text: err instanceof Error ? err.message : "Operação falhou.",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

// O que o modal devolve ao criar ou editar.
export type DadosSubficha = {
  nome: string;
  perfil: PerfilFicha;
  molde: boolean;
  hpMax: number;
  navio: MontagemNavio | null;
  abas: AbaFicha[];
  combate: CombateSubficha;
};

type Mudanca =
  | { tipo: "criar"; fichas: SubfichaCard[] }
  | { tipo: "mudar"; id: string; patch: Partial<SubfichaCard> }
  | { tipo: "tirar"; ids: string[] };

function reduzir(fichas: SubfichaCard[], m: Mudanca): SubfichaCard[] {
  if (m.tipo === "criar") return [...fichas, ...m.fichas];
  if (m.tipo === "tirar") return fichas.filter((f) => !m.ids.includes(f.id));
  return fichas.map((f) => (f.id === m.id ? { ...f, ...m.patch } : f));
}

// Card provisório, até o servidor devolver a ficha criada.
function fichaProvisoria(d: DadosSubficha, daMesa: boolean): SubfichaCard {
  const preset = d.navio ? presetDeNavio(d.navio) : null;
  const casco = d.navio ? statsMadeira(d.navio.madeira) : null;
  const hpMax = preset?.hpMax ?? d.hpMax;
  return {
    id: idTemporario(),
    nome: d.nome,
    nivel: 1,
    fotoUrl: null,
    hpAtual: hpMax,
    hpTemp: 0,
    hpMax,
    ppAtual: 0,
    ppMax: 0,
    exaustao: 0,
    cr: (casco?.cr ?? 10) + (FORTIFICACOES_NAVIO.find((f) => f.slug === d.navio?.fortificacao)?.cr ?? 0),
    iniciativa: 0,
    percepcaoPassiva: 10,
    destreza: 10,
    reducaoDano: casco?.br ?? 0,
    perfil: d.perfil,
    abas: null,
    molde: d.molde,
    moldeId: null,
    daMesa,
    deslocamento: preset?.deslocamento ?? 0,
    recursos: [],
    combate: d.combate,
    acoes: [],
    municao: [],
    canhoes: d.navio?.canhoes ?? null,
    comandanteId: null,
    emCombate: null,
  };
}

// Lista otimista das subfichas e o que dá pra fazer com elas.
export function useSubfichas(personagemId: string, doServidor: SubfichaCard[], daMesa = false) {
  const [fichas, aplicar] = useOptimistic(doServidor, reduzir);
  const [, startTransition] = useTransition();

  function rodar(mudanca: Mudanca, acao: () => Promise<Resultado<object>>) {
    startTransition(async () => {
      aplicar(mudanca);
      try {
        exigir(await acao());
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  return {
    fichas,
    criar(d: DadosSubficha) {
      rodar({ tipo: "criar", fichas: [fichaProvisoria(d, daMesa)] }, () =>
        criarSubficha(personagemId, {
          nome: d.nome,
          perfil: d.perfil,
          molde: d.molde,
          hpMax: d.hpMax,
          navio: d.navio,
          combate: d.combate,
          daMesa,
        }),
      );
    },
    editar(ficha: SubfichaCard, d: DadosSubficha) {
      const patch = { nome: d.nome, perfil: d.perfil, molde: d.molde, abas: d.abas, combate: d.combate };
      rodar({ tipo: "mudar", id: ficha.id, patch }, () => atualizarSubficha(ficha.id, patch));
    },
    pv(ficha: SubfichaCard, hpAtual: number) {
      rodar({ tipo: "mudar", id: ficha.id, patch: { hpAtual } }, () =>
        patchPersonagem(ficha.id, { hpAtual }),
      );
    },
    async apagar(ficha: SubfichaCard) {
      const copias = fichas.filter((f) => f.moldeId === ficha.id);
      const r = await Swal.fire({
        icon: "warning",
        title: `Apagar ${ficha.nome}?`,
        text: copias.length > 0 ? `As ${copias.length} cópias somem junto.` : undefined,
        showCancelButton: true,
        confirmButtonText: "Apagar",
        cancelButtonText: "Cancelar",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      if (!r.isConfirmed) return;
      rodar({ tipo: "tirar", ids: [ficha.id, ...copias.map((c) => c.id)] }, () =>
        apagarSubficha(ficha.id),
      );
    },
    invocar(molde: SubfichaCard, quantas: number) {
      const copias = fichas.filter((f) => f.moldeId === molde.id);
      const nomes = nomesDasCopias(
        molde.nome,
        copias.map((c) => c.nome),
        quantas,
      );
      const novas = nomes.map((nome) => ({
        ...molde,
        id: idTemporario(),
        nome,
        molde: false,
        moldeId: molde.id,
        hpAtual: molde.hpMax,
        hpTemp: 0,
      }));
      rodar({ tipo: "criar", fichas: novas }, () => invocarCopias(molde.id, quantas));
    },
    dispensar(molde: SubfichaCard, copias: SubfichaCard[]) {
      const ids = copias.map((c) => c.id);
      rodar({ tipo: "tirar", ids }, () => dispensarCopias(molde.id, ids));
    },
  };
}

export function SubfichasTab({
  personagemId,
  subfichas,
}: {
  personagemId: string;
  subfichas: SubfichaCard[];
}) {
  const lista = useSubfichas(personagemId, subfichas);
  const [modal, setModal] = useState<{ ficha: SubfichaCard | null } | null>(null);

  // Cópia cujo molde sumiu fica solta, como subficha comum.
  const moldes = new Set(lista.fichas.filter((f) => f.molde).map((f) => f.id));
  const raizes = lista.fichas.filter((f) => !f.moldeId || !moldes.has(f.moldeId));

  return (
    <div>
      <div className="subfichas-topo">
        <h1>Subfichas</h1>
        <button type="button" className="btn-rect primary" onClick={() => setModal({ ficha: null })}>
          + Nova subficha
        </button>
      </div>

      {raizes.length === 0 ? (
        <div className="placeholder-tab">
          <i className="fas fa-address-card" />
          <p>Lacaios, animais e veículos do personagem ficam aqui.</p>
        </div>
      ) : (
        <div className="subfichas-grade">
          {raizes.map((f) => (
            <CardSubficha
              key={f.id}
              ficha={f}
              onPv={(pv) => lista.pv(f, pv)}
              onEditar={() => setModal({ ficha: f })}
              onApagar={() => lista.apagar(f)}
            >
              {f.molde && (
                <Copias
                  molde={f}
                  copias={lista.fichas.filter((c) => c.moldeId === f.id)}
                  onInvocar={(n) => lista.invocar(f, n)}
                  onDispensar={(copias) => lista.dispensar(f, copias)}
                  onPv={lista.pv}
                />
              )}
            </CardSubficha>
          ))}
        </div>
      )}

      {modal && (
        <ModalSubficha
          inicial={modal.ficha}
          onSalvar={(d) => {
            if (modal.ficha) lista.editar(modal.ficha, d);
            else lista.criar(d);
            setModal(null);
          }}
          onCancelar={() => setModal(null)}
        />
      )}
    </div>
  );
}

function Avatar({ ficha }: { ficha: SubfichaCard }) {
  return ficha.fotoUrl ? (
    <img className="subficha-avatar" src={ficha.fotoUrl} alt="" />
  ) : (
    <span className="subficha-avatar">
      <i className={`fas ${perfilDe(ficha.perfil).icone}`} />
    </span>
  );
}

// Ícone e cor de cada tipo de ação, pros atalhos.
const TIPO_DA_ACAO: Record<string, { icone: string; cor: string }> = {
  padrao: { icone: "fa-gavel", cor: "var(--color-padrao)" },
  bonus: { icone: "fa-bolt", cor: "var(--color-bonus)" },
  power: { icone: "fa-bomb", cor: "var(--color-power)" },
  react: { icone: "fa-shield-alt", cor: "var(--color-react)" },
  livre: { icone: "fa-feather", cor: "var(--color-livre)" },
};

const MAX_ATALHOS = 6;

const comSinal = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

// Como ela entra no combate e de onde vem a iniciativa, em chips.
function SituacaoCombate({ ficha }: { ficha: SubfichaCard }) {
  const { entra, iniciativa } = ficha.combate;
  const textoIniciativa =
    iniciativa === "dono"
      ? "Iniciativa do dono"
      : iniciativa === "capitao"
        ? `Iniciativa: PRE ${ficha.comandante ? `de ${ficha.comandante}` : "do capitão"}`
        : `Iniciativa ${comSinal(ficha.iniciativa)}`;
  return (
    <div className="subficha-chips">
      {ficha.emCombate ? (
        <span className={`subficha-chip combate${ficha.emCombate.vez ? " vez" : ""}`}>
          <i className="fas fa-khanda" /> {ficha.emCombate.vez ? "Na vez" : "Em combate"} ·{" "}
          {ficha.emCombate.iniciativa}
        </span>
      ) : (
        <span className="subficha-chip" title={entra === "junto" ? "Entra quando o narrador põe o dono" : undefined}>
          <i className={`fas ${entra === "junto" ? "fa-link" : "fa-hand"}`} />{" "}
          {entra === "junto" ? "Entra com o dono" : "Entra pelo narrador"}
        </span>
      )}
      <span className="subficha-chip">
        <i className="fas fa-bolt" /> {textoIniciativa}
      </span>
    </div>
  );
}

// Card de uma subficha; `children` entra embaixo (as cópias do molde).
export function CardSubficha({
  ficha,
  onPv,
  onEditar,
  onApagar,
  children,
}: {
  ficha: SubfichaCard;
  onPv: (pv: number) => void;
  onEditar: () => void;
  onApagar: () => void;
  children?: React.ReactNode;
}) {
  const perfil = perfilDe(ficha.perfil);
  const pendente = ehTemporario(ficha.id);
  const veiculo = perfil.slug === "veiculo";
  const pvPct =
    ficha.hpMax > 0 ? Math.max(0, Math.min(100, (ficha.hpAtual / ficha.hpMax) * 100)) : 0;
  const atalhos = ficha.molde ? [] : ficha.acoes.slice(0, MAX_ATALHOS);
  const outras = ficha.molde ? 0 : ficha.acoes.length - atalhos.length;

  return (
    <div
      className={`subficha-card${pendente ? " item-pendente" : ""}${ficha.emCombate?.vez ? " na-vez" : ""}`}
      inert={pendente}
    >
      <div className="subficha-cabecalho">
        <Avatar ficha={ficha} />
        <div className="subficha-titulo">
          <Link href={`/ficha/${ficha.id}`} className="subficha-nome">
            {ficha.nome}
          </Link>
          <span className="subficha-sub">
            {perfil.nome}
            {!veiculo && ` · Nível ${ficha.nivel}`}
            {ficha.molde && <span className="subficha-marca">Molde</span>}
          </span>
        </div>
        <div className="subficha-botoes">
          <Link href={`/ficha/${ficha.id}`} className="subficha-btn" title="Abrir ficha">
            <i className="fas fa-arrow-up-right-from-square" />
          </Link>
          <button type="button" className="subficha-btn" onClick={onEditar} title="Editar">
            <i className="fas fa-pen" />
          </button>
          <button type="button" className="subficha-btn rm" onClick={onApagar} title="Apagar">
            <i className="fas fa-trash" />
          </button>
        </div>
      </div>

      {!ficha.molde && <SituacaoCombate ficha={ficha} />}

      {/* O molde fica guardado: mostra os números, sem controle. */}
      {!ficha.molde && (
        <div className="subficha-pv">
          <div className="subficha-pv-topo">
            <span className="subficha-pv-rotulo">
              <i className="fas fa-heart" /> Vida
            </span>
            <PvRapido
              pvAtual={ficha.hpAtual}
              pvMax={ficha.hpMax}
              passo={veiculo ? 10 : 1}
              min={veiculo ? 0 : -ficha.hpMax}
              onPv={onPv}
            />
          </div>
          <div className="subficha-pv-barra">
            <div className="subficha-pv-fill" style={{ width: `${pvPct}%` }} />
          </div>
        </div>
      )}

      <div className="subficha-stats">
        {ficha.molde && <Stat icone="fa-heart" rotulo="Vida" valor={ficha.hpMax} />}
        <Stat icone="fa-shield-halved" rotulo="CR" valor={ficha.cr} />
        {ficha.reducaoDano > 0 && (
          <Stat icone="fa-shield" rotulo="Redução de dano" valor={ficha.reducaoDano} />
        )}
        {ficha.deslocamento > 0 && (
          <Stat
            icone={perfil.deslocamento.icone}
            rotulo={perfil.deslocamento.rotulo}
            valor={`${ficha.deslocamento.toLocaleString("pt-BR")} ${perfil.deslocamento.unidade}`}
          />
        )}
        {/* Iniciativa do dono ou do capitão já está no chip de cima. */}
        {!veiculo && ficha.combate.iniciativa === "propria" && (
          <Stat icone="fa-bolt" rotulo="Iniciativa" valor={comSinal(ficha.iniciativa)} />
        )}
        {!veiculo && <Stat icone="fa-eye" rotulo="Percepção passiva" valor={ficha.percepcaoPassiva} />}
        {ficha.ppMax > 0 && <Stat icone="fa-fire" rotulo="PP" valor={`${ficha.ppAtual} / ${ficha.ppMax}`} />}
        {veiculo && ficha.canhoes != null && ficha.canhoes > 0 && (
          <Stat icone="fa-bomb" rotulo="Canhões" valor={ficha.canhoes} />
        )}
        {ficha.municao.map((m) => (
          <Stat key={m.nome} icone="fa-circle-dot" rotulo={m.nome} valor={m.quantidade} />
        ))}
        {veiculo && ficha.comandante && <Stat icone="fa-user-tie" rotulo="Comandante" valor={ficha.comandante} />}
        {veiculo &&
          ficha.recursos.map((r) => (
            <Stat
              key={r.id}
              icone="fa-cubes-stacked"
              rotulo={r.nome}
              valor={r.valorMax > 0 ? `${r.valorAtual} / ${r.valorMax}` : r.valorAtual}
            />
          ))}
      </div>

      {atalhos.length > 0 && (
        <div className="subficha-atalhos" aria-label={`Ações de ${ficha.nome}`}>
          {atalhos.map((a) => {
            const tipo = TIPO_DA_ACAO[a.tipo] ?? TIPO_DA_ACAO.padrao;
            return (
              <Link
                key={a.id}
                href={`/ficha/${ficha.id}?aba=combate&acao=${a.id}`}
                className="subficha-atalho"
                style={{ "--atalho-cor": tipo.cor } as React.CSSProperties}
                title={`Abrir ${a.nome} na ficha de ${ficha.nome}`}
              >
                <i className={`fas ${tipo.icone}`} /> {a.nome}
              </Link>
            );
          })}
          {outras > 0 && (
            <Link href={`/ficha/${ficha.id}?aba=combate`} className="subficha-atalho mais" title="Todas as ações">
              +{outras}
            </Link>
          )}
        </div>
      )}

      {children}
    </div>
  );
}

function Stat({ icone, rotulo, valor }: { icone: string; rotulo: string; valor: string | number }) {
  return (
    <div className="subficha-stat">
      <i className={`fas ${icone}`} />
      <div>
        <span className="subficha-stat-rotulo">{rotulo}</span>
        <span className="subficha-stat-valor">{valor}</span>
      </div>
    </div>
  );
}

// − e + andam um passo; o campo aceita valor ou delta ("+5", "-12") e grava ao sair.
function PvRapido({
  pvAtual,
  pvMax,
  passo,
  min,
  onPv,
}: {
  pvAtual: number;
  pvMax: number;
  passo: number;
  min: number;
  onPv: (novo: number) => void;
}) {
  const [buffer, setBuffer] = useState<string | null>(null);

  function mudar(novo: number) {
    const pv = Math.max(min, Math.min(pvMax, Math.trunc(novo) || 0));
    if (pv !== pvAtual) onPv(pv);
  }

  function commit() {
    if (buffer == null) return;
    const t = buffer.trim().replace("−", "-");
    setBuffer(null);
    const n = Number(t);
    if (!t || Number.isNaN(n)) return;
    mudar(t.startsWith("+") || t.startsWith("-") ? pvAtual + n : n);
  }

  return (
    <div className="subficha-pv-ctrl">
      <button type="button" onClick={() => mudar(pvAtual - passo)} aria-label={`Menos ${passo} de vida`}>
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label="Vida"
        value={buffer ?? String(pvAtual)}
        onChange={(e) => setBuffer(e.target.value)}
        onFocus={() => setBuffer(String(pvAtual))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") setBuffer(null);
        }}
      />
      <span className="subficha-pv-max">/ {pvMax}</span>
      <button type="button" onClick={() => mudar(pvAtual + passo)} aria-label={`Mais ${passo} de vida`}>
        +
      </button>
    </div>
  );
}

// Cópias de um molde: invocar mais, mexer na vida de cada uma e dispensar.
function Copias({
  molde,
  copias,
  onInvocar,
  onDispensar,
  onPv,
}: {
  molde: SubfichaCard;
  copias: SubfichaCard[];
  onInvocar: (quantas: number) => void;
  onDispensar: (copias: SubfichaCard[]) => void;
  onPv: (copia: SubfichaCard, pv: number) => void;
}) {
  const [quantas, setQuantas] = useState(1);
  const cabem = MAX_COPIAS - copias.length;
  const pendente = ehTemporario(molde.id);

  return (
    <div className="subficha-copias">
      <div className="subficha-invocar">
        <CampoPasso
          valor={Math.min(quantas, Math.max(1, cabem))}
          onChange={setQuantas}
          rotulo="cópias"
          min={1}
          max={Math.max(1, cabem)}
          disabled={cabem <= 0}
        />
        <button
          type="button"
          className="btn-rect outline sm"
          disabled={cabem <= 0 || pendente}
          onClick={() => onInvocar(Math.min(quantas, cabem))}
        >
          <i className="fas fa-wand-magic-sparkles" /> Invocar
        </button>
        {copias.length > 1 && (
          <button type="button" className="btn-rect neutro danger sm" onClick={() => onDispensar(copias)}>
            Dispensar todas
          </button>
        )}
      </div>

      {copias.map((c) => {
        const provisoria = ehTemporario(c.id);
        return (
          <div
            key={c.id}
            className={`subficha-copia${provisoria ? " item-pendente" : ""}`}
            inert={provisoria}
          >
            <Link href={`/ficha/${c.id}`} className="subficha-copia-nome">
              {c.nome}
            </Link>
            <PvRapido
              pvAtual={c.hpAtual}
              pvMax={c.hpMax}
              passo={1}
              min={-c.hpMax}
              onPv={(pv) => onPv(c, pv)}
            />
            <button
              type="button"
              className="subficha-btn rm"
              onClick={() => onDispensar([c])}
              title="Dispensar"
              aria-label={`Dispensar ${c.nome}`}
            >
              <i className="fas fa-xmark" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Criar (sem `inicial`) ou editar uma subficha.
export function ModalSubficha({
  inicial,
  perfis = PERFIS_DE_SUBFICHA.map((p) => p.slug),
  daMesa = false,
  onSalvar,
  onCancelar,
}: {
  inicial: SubfichaCard | null;
  // Perfis à escolha; um só esconde a pergunta.
  perfis?: PerfilFicha[];
  daMesa?: boolean;
  onSalvar: (dados: DadosSubficha) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [perfil, setPerfil] = useState<PerfilFicha>(
    inicial ? perfilDe(inicial.perfil).slug : perfis[0],
  );
  const [molde, setMolde] = useState(inicial?.molde ?? false);
  const [hpMax, setHpMax] = useState(10);
  // Subficha da mesa já nasce como navio do livro.
  const [doLivro, setDoLivro] = useState(daMesa);
  const [montagem, setMontagem] = useState<MontagemNavio>(() => montagemPadrao("pequeno"));
  const [abas, setAbas] = useState<AbaFicha[]>(inicial?.abas ?? perfilDe(perfil).abas);
  const [combate, setCombate] = useState<CombateSubficha>(
    () => inicial?.combate ?? combateDaSubficha({ perfil }, daMesa),
  );

  const veiculo = perfil === "veiculo";
  // "A do dono" só com dono; "Do capitão", só no navio.
  const iniciativas = INICIATIVAS_SUBFICHA.filter(
    (i) => (i.slug !== "dono" || !daMesa) && (i.slug !== "capitao" || veiculo),
  );
  const navio = !inicial && veiculo && doLivro ? montagem : null;
  // Cópia e subficha da mesa não viram molde.
  const podeSerMolde = !daMesa && !inicial?.moldeId;

  function trocarPerfil(novo: PerfilFicha) {
    setPerfil(novo);
    setAbas(perfilDe(novo).abas);
    setCombate(combateDaSubficha({ perfil: novo }, daMesa));
  }

  function submeter(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    onSalvar({
      nome: nome.trim(),
      perfil,
      molde: podeSerMolde && molde,
      hpMax: Math.max(0, Math.trunc(hpMax) || 0),
      navio,
      abas,
      combate,
    });
  }

  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className={`modal-box${navio ? " modal-box-lg" : ""}`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onCancelar} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
        <h2>{inicial ? "Editar subficha" : veiculo && daMesa ? "Novo navio" : "Nova subficha"}</h2>
        <form onSubmit={submeter}>
          <label>Nome</label>
          <input
            type="text"
            value={nome}
            autoFocus
            maxLength={MAX_NOME_SUBFICHA}
            onChange={(e) => setNome(e.target.value)}
            placeholder={veiculo ? "Ex: Going Merry" : "Ex: Lobo"}
          />

          {perfis.length > 1 && (
            <div className="subficha-campo">
              <label>Perfil</label>
              <div className="opcoes-grade">
                {PERFIS_DE_SUBFICHA.filter((p) => perfis.includes(p.slug)).map((p) => (
                  <button
                    type="button"
                    key={p.slug}
                    className={`opcao-card${perfil === p.slug ? " ativo" : ""}`}
                    aria-pressed={perfil === p.slug}
                    onClick={() => trocarPerfil(p.slug)}
                  >
                    <i className={`fas ${p.icone}`} />
                    <strong>{p.nome}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}

          {podeSerMolde && (
            <div className="subficha-campo">
              <label>Tipo</label>
              <Segmentos
                rotulo="Tipo"
                valor={molde ? "molde" : "unica"}
                opcoes={[
                  { valor: "unica", rotulo: "Única", sub: "entra em jogo" },
                  { valor: "molde", rotulo: "Molde", sub: "invoca cópias" },
                ]}
                onChange={(v) => setMolde(v === "molde")}
              />
            </div>
          )}

          {!inicial && veiculo && !daMesa && (
            <div className="subficha-campo">
              <label>Navio do livro</label>
              <Segmentos
                rotulo="Navio do livro"
                valor={doLivro ? "sim" : "nao"}
                opcoes={[
                  { valor: "nao", rotulo: "Não" },
                  { valor: "sim", rotulo: "Sim" },
                ]}
                onChange={(v) => setDoLivro(v === "sim")}
              />
            </div>
          )}

          {navio && (
            <CamposMontagemNavio montagem={montagem} onChange={setMontagem} aoTrocarTamanho={montagemPadrao} />
          )}

          {!daMesa && (
            <div className="subficha-campo">
              <label>No combate</label>
              <Segmentos
                rotulo="No combate"
                valor={combate.entra}
                opcoes={ENTRADAS_COMBATE.map((e) => ({ valor: e.slug, rotulo: e.nome, sub: e.sub }))}
                onChange={(entra) => setCombate((c) => ({ ...c, entra }))}
              />
            </div>
          )}

          <div className="subficha-campo">
            <label>Iniciativa</label>
            <Segmentos
              rotulo="Iniciativa"
              valor={combate.iniciativa}
              opcoes={iniciativas.map((i) => ({ valor: i.slug, rotulo: i.nome, sub: i.sub }))}
              onChange={(iniciativa) => setCombate((c) => ({ ...c, iniciativa }))}
            />
          </div>

          {!inicial && !navio && (
            <div className="subficha-campo">
              <label>Vida máxima</label>
              <CampoPasso valor={hpMax} onChange={setHpMax} rotulo="Vida máxima" max={99999} />
            </div>
          )}

          {inicial && (
            <div className="subficha-campo">
              <label>Abas</label>
              <div className="sugestoes">
                {ABAS_DE_SUBFICHA.map((a) => {
                  const ativa = abas.includes(a.id);
                  return (
                    <button
                      type="button"
                      key={a.id}
                      className={`sugestao chip-opcao${ativa ? " ativo" : ""}`}
                      aria-pressed={ativa}
                      onClick={() =>
                        setAbas(ativa ? abas.filter((x) => x !== a.id) : [...abas, a.id])
                      }
                    >
                      <i className={`fas ${a.icone}`} /> {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onCancelar}>
              Cancelar
            </button>
            <button type="submit" className="modal-btn-save" disabled={!nome.trim() || abas.length === 0}>
              {inicial ? "Salvar" : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
