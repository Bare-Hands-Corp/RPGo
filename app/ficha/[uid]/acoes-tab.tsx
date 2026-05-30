"use client";

import { useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { atualizarAcao, criarAcao, deletarAcao } from "./actions";
import {
  ATRIBUTOS,
  bonusAtaqueTecnica,
  cdTecnica,
  formatarMod,
  penalidadeD20Exaustao,
  resolverAtaqueArma,
  type Atributo,
  type EfeitosAgregados,
} from "@/lib/op-rpg";
import { parseFormulaDados } from "@/lib/dice";
import { empilharD20, empilharRolagem } from "@/lib/empilhar-rolagem";
import { useExaustaoOtimista } from "./use-exaustao-otimista";
import { MarcaExausto } from "./marca-exausto";

// O modelo de Ação só guarda alcance como texto livre, então inferimos CC vs
// distância por palavra-chave / metragem pra montar o contexto da rolagem.
// Best-effort: o usuário pode trocar o chip de alcance no Rolador (etapa 3.3).
function inferirAlcance(alcance: string | null): "corpo_a_corpo" | "distancia" {
  if (!alcance) return "corpo_a_corpo";
  const t = alcance.toLowerCase();
  if (/corpo a corpo|adjacente|toque|melee/.test(t)) return "corpo_a_corpo";
  if (/dist|arremess|tiro|proj|longo|alcance/.test(t)) return "distancia";
  const num = t.match(/(\d+(?:[.,]\d+)?)\s*m/);
  if (num) return parseFloat(num[1].replace(",", ".")) >= 3 ? "distancia" : "corpo_a_corpo";
  return "corpo_a_corpo";
}

type Acao = {
  id: string;
  nome: string;
  descricao: string;
  tipo: string;
  tag: string | null;
  custoPp: number;
  custoPa: number;
  custoRecursoId: string | null;
  custoRecursoValor: number;
  atributoAtaque: string | null;
  atributoSalv: string | null;
  atributoCd: string | null;
  dano: string | null;
  alcance: string | null;
  armaId: string | null;
};

type RecursoMinimo = { id: string; nome: string; cor: string | null };

// Subconjunto de Item necessário pra resolver o ataque/dano de uma arma.
type ItemArma = {
  id: string;
  nome: string;
  tipo: string;
  equipado: boolean;
  dano: string | null;
  modificador: number;
  alcance: string;
  propriedades: unknown;
  atributoAtaque: string | null;
  proficienteArma: boolean;
};

type Props = {
  personagemId: string;
  acoes: Acao[];
  nivel: number;
  exaustao: number;
  penalidadeDesArmadura: number;
  atributos: Record<Atributo, number>;
  recursos: RecursoMinimo[];
  efeitosAgregados: EfeitosAgregados;
  itens: ItemArma[];
};

const SIGLA: Record<Atributo, string> = {
  forca: "FOR",
  destreza: "DES",
  constituicao: "CON",
  sabedoria: "SAB",
  vontade: "VON",
  presenca: "PRE",
};

const GRUPOS = [
  { tipo: "padrao", titulo: "Ações Padrão", icone: "fa-gavel", cor: "var(--color-padrao)" },
  { tipo: "bonus", titulo: "Ações Bônus", icone: "fa-bolt", cor: "var(--color-bonus)" },
  { tipo: "power", titulo: "Ações Poderosas", icone: "fa-bomb", cor: "var(--color-power)" },
  { tipo: "react", titulo: "Reações", icone: "fa-shield-alt", cor: "var(--color-react)" },
] as const;

type Patch =
  | { kind: "create"; acao: Acao }
  | { kind: "update"; id: string; patch: Partial<Acao> }
  | { kind: "delete"; id: string };

type FormState = {
  id: string | null;
  nome: string;
  descricao: string;
  tipo: string;
  tag: string;
  custoPp: string;
  custoPa: string;
  custoRecursoId: string;
  custoRecursoValor: string;
  atributoAtaque: string;
  atributoSalv: string;
  atributoCd: string;
  dano: string;
  alcance: string;
  armaId: string;
};

const FORM_VAZIO: FormState = {
  id: null,
  nome: "",
  descricao: "",
  tipo: "padrao",
  tag: "",
  custoPp: "",
  custoPa: "",
  custoRecursoId: "",
  custoRecursoValor: "",
  atributoAtaque: "",
  atributoSalv: "",
  atributoCd: "",
  dano: "",
  alcance: "",
  armaId: "",
};

// Une listas de fontes preservando ordem e removendo duplicatas.
function juntarFontes(...listas: string[][]): string[] {
  const out: string[] = [];
  for (const l of listas) for (const f of l) if (!out.includes(f)) out.push(f);
  return out;
}

function mostrarErro(err: unknown) {
  Swal.fire({
    icon: "error",
    title: "Erro",
    text: err instanceof Error ? err.message : "Operação falhou.",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

export function AcoesTab({
  personagemId,
  acoes,
  nivel,
  exaustao: exaustaoServer,
  penalidadeDesArmadura,
  atributos,
  recursos,
  efeitosAgregados,
  itens,
}: Props) {
  // Penalidade de exaustão (−2 × nível) some no acerto (teste de d20). NÃO entra
  // no dano (não é d20) nem na CD da técnica (quem rola é o alvo). Otimista.
  const exaustao = useExaustaoOtimista(exaustaoServer);
  const penD20 = penalidadeD20Exaustao(exaustao);

  // DES reduzida pela armadura: cálculos que usam DES (ataque/CD com DES) leem a
  // pontuação ajustada; FOR e outros leem o valor real.
  const atributosParaTeste: Record<Atributo, number> = {
    ...atributos,
    destreza: atributos.destreza + 2 * penalidadeDesArmadura,
  };
  const desReduz = penalidadeDesArmadura < 0;
  const armas = itens.filter((i) => i.tipo === "arma");
  const [acoesOtimistas, aplicarPatch] = useOptimistic(
    acoes,
    (state: Acao[], p: Patch) => {
      if (p.kind === "create") return [...state, p.acao];
      if (p.kind === "update")
        return state.map((a) => (a.id === p.id ? { ...a, ...p.patch } : a));
      return state.filter((a) => a.id !== p.id);
    },
  );

  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [, startTransition] = useTransition();

  function abrirNova() {
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdit(acao: Acao) {
    setForm({
      id: acao.id,
      nome: acao.nome,
      descricao: acao.descricao,
      tipo: acao.tipo,
      tag: acao.tag || "",
      custoPp: acao.custoPp ? String(acao.custoPp) : "",
      custoPa: acao.custoPa ? String(acao.custoPa) : "",
      custoRecursoId: acao.custoRecursoId || "",
      custoRecursoValor: acao.custoRecursoValor ? String(acao.custoRecursoValor) : "",
      atributoAtaque: acao.atributoAtaque || "",
      atributoSalv: acao.atributoSalv || "",
      atributoCd: acao.atributoCd || "",
      dano: acao.dano || "",
      alcance: acao.alcance || "",
      armaId: acao.armaId || "",
    });
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
  }

  function setF<K extends keyof FormState>(key: K, valor: FormState[K]) {
    setForm((f) => ({ ...f, [key]: valor }));
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const nomeLimpo = form.nome.trim();
    if (!nomeLimpo) {
      Swal.fire({
        icon: "warning",
        title: "Campo obrigatório",
        text: "Dê um nome para sua ação!",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }

    const dados = {
      nome: nomeLimpo,
      descricao: form.descricao,
      tipo: form.tipo,
      tag: form.tag,
      custoPp: Number(form.custoPp) || 0,
      custoPa: Number(form.custoPa) || 0,
      custoRecursoId: form.custoRecursoId || null,
      custoRecursoValor: Number(form.custoRecursoValor) || 0,
      atributoAtaque: form.atributoAtaque || null,
      atributoSalv: form.atributoSalv || null,
      atributoCd: form.atributoCd || null,
      dano: form.dano || null,
      alcance: form.alcance || null,
      armaId: form.armaId || null,
    };

    const editandoId = form.id;
    fecharModal();

    startTransition(async () => {
      if (editandoId) {
        aplicarPatch({ kind: "update", id: editandoId, patch: dados });
        try {
          await atualizarAcao(personagemId, editandoId, dados);
        } catch (err) {
          mostrarErro(err);
        }
      } else {
        const novaAcao: Acao = {
          id: "temp-" + Math.random().toString(36).slice(2),
          ...dados,
          tag: dados.tag || null,
        };
        aplicarPatch({ kind: "create", acao: novaAcao });
        try {
          await criarAcao(personagemId, dados);
        } catch (err) {
          mostrarErro(err);
        }
      }
    });
  }

  async function apagar(acaoId: string) {
    const confirm = await Swal.fire({
      title: "Deletar Ação",
      text: "Tem certeza que quer apagar essa técnica?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Deletar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirm.isConfirmed) return;

    startTransition(async () => {
      aplicarPatch({ kind: "delete", id: acaoId });
      try {
        await deletarAcao(personagemId, acaoId);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Ações de Combate</h1>
        <button
          type="button"
          className="btn-rect primary"
          style={{ background: "var(--color-power)" }}
          onClick={abrirNova}
        >
          + Nova Ação
        </button>
      </div>
      <p style={{ color: "var(--text-sec)", fontSize: "0.9rem", marginBottom: 20 }}>
        Gerencie suas técnicas e ataques aqui.
      </p>

      {GRUPOS.map((grupo) => {
        const lista = acoesOtimistas.filter((a) => a.tipo === grupo.tipo);
        return (
          <section key={grupo.tipo}>
            <div className="section-header">
              <i className={`fas ${grupo.icone}`} style={{ color: grupo.cor }} />
              <h3>{grupo.titulo}</h3>
            </div>
            {lista.length > 0 ? (
              <div className="action-grid">
                {lista.map((acao) => {
                  const recursoCusto = recursos.find(
                    (r) => r.id === acao.custoRecursoId,
                  );
                  const atributoAtq = acao.atributoAtaque as Atributo | null;
                  const atributoCd = acao.atributoCd as Atributo | null;
                  // Arma ligada à ação (ex: Seiken usando a arma marcial
                  // equipada). Só vale se a arma ainda existe E está equipada —
                  // senão cai no cálculo manual (atributo + dano da ação).
                  const arma = acao.armaId
                    ? armas.find((a) => a.id === acao.armaId)
                    : undefined;
                  const armaLigada = arma?.equipado ? arma : undefined;
                  const ataqueArma = armaLigada
                    ? resolverAtaqueArma({
                        alcanceRaw: armaLigada.alcance,
                        propriedadesRaw: armaLigada.propriedades,
                        atributoOverride: armaLigada.atributoAtaque,
                        modificadorArma: armaLigada.modificador || 0,
                        proficiente: armaLigada.proficienteArma,
                        atributos: atributosParaTeste,
                        nivel,
                        efeitosAgregados,
                      })
                    : null;
                  // Ação não distingue CC vs Distância (modelo só tem texto
                  // livre em alcance), então somamos os 3 buckets de ataque
                  // num bônus único; idem pra dano.
                  const extraAtaque =
                    efeitosAgregados.bonusAtaque.valor +
                    efeitosAgregados.bonusAtaqueCC.valor +
                    efeitosAgregados.bonusAtaqueDistancia.valor;
                  const extraCd = efeitosAgregados.bonusCdTecnicas.valor;
                  const fontesCd = efeitosAgregados.bonusCdTecnicas.fontes;
                  const extraDano =
                    efeitosAgregados.bonusDano.valor +
                    efeitosAgregados.bonusDanoCC.valor +
                    efeitosAgregados.bonusDanoDistancia.valor;
                  const fontesDano = juntarFontes(
                    efeitosAgregados.bonusDano.fontes,
                    efeitosAgregados.bonusDanoCC.fontes,
                    efeitosAgregados.bonusDanoDistancia.fontes,
                  );
                  // Acerto: vem da arma (que já embute o bônus de habilidade do
                  // alcance) ou do cálculo manual da técnica.
                  const bonusAtq = ataqueArma
                    ? ataqueArma.bonus
                    : atributoAtq
                      ? bonusAtaqueTecnica({
                          nivel,
                          valorAtributo: atributosParaTeste[atributoAtq],
                        }) + extraAtaque
                      : null;
                  // DES reduzida pela armadura morde o acerto quando ele usa DES.
                  const atributoAcerto = ataqueArma ? ataqueArma.atributo : atributoAtq;
                  const desReduzAtq = atributoAcerto === "destreza" && desReduz;
                  const fontesAtaque = ataqueArma
                    ? ataqueArma.fontes
                    : juntarFontes(
                        efeitosAgregados.bonusAtaque.fontes,
                        efeitosAgregados.bonusAtaqueCC.fontes,
                        efeitosAgregados.bonusAtaqueDistancia.fontes,
                      );
                  const alcanceContexto = ataqueArma
                    ? ataqueArma.alcance
                    : inferirAlcance(acao.alcance);
                  // Dano é texto livre ("2d6 fogo") e é sempre da ação: cada
                  // técnica tem dano próprio, então a arma ligada entra só no
                  // acerto, nunca no dano.
                  const danoParse = acao.dano ? parseFormulaDados(acao.dano) : null;
                  const danoRolavel =
                    !!danoParse &&
                    (danoParse.dados.length > 0 ||
                      danoParse.modificador + extraDano !== 0);
                  const danoInner = acao.dano ? (
                    <>
                      <i className="fas fa-burst" /> {acao.dano}
                      {extraDano !== 0 && (
                        <strong> {extraDano > 0 ? `+${extraDano}` : extraDano}</strong>
                      )}
                      {fontesDano.length > 0 && <i className="fas fa-link prof-fonte" />}
                    </>
                  ) : null;
                  const cd = atributoCd
                    ? cdTecnica({
                        nivel,
                        valorAtributoPrim: atributosParaTeste[atributoCd],
                      }) + extraCd
                    : null;
                  const atributoSalv = acao.atributoSalv as Atributo | null;
                  // Cada custo carrega cor opcional pra colorir o chip.
                  // Recurso customizado usa a cor configurada; PP/PA usam padrão.
                  const custos: { texto: string; cor?: string }[] = [];
                  if (acao.custoPp > 0) custos.push({ texto: `${acao.custoPp} PP` });
                  if (acao.custoPa > 0) custos.push({ texto: `${acao.custoPa} PA` });
                  if (recursoCusto && acao.custoRecursoValor > 0) {
                    custos.push({
                      texto: `${acao.custoRecursoValor} ${recursoCusto.nome}`,
                      cor: recursoCusto.cor ?? undefined,
                    });
                  }
                  return (
                    <div key={acao.id} className={`action-card type-${acao.tipo}`}>
                      <button
                        type="button"
                        className="btn-card-edit"
                        title="Editar"
                        onClick={() => abrirEdit(acao)}
                      >
                        <i className="fas fa-edit" />
                      </button>
                      <button
                        type="button"
                        className="btn-card-trash"
                        title="Apagar"
                        onClick={() => apagar(acao.id)}
                      >
                        <i className="fas fa-trash" />
                      </button>
                      <div>
                        <div className="card-title">{acao.nome}</div>
                        {(bonusAtq != null || cd != null || atributoSalv || acao.dano || acao.alcance || acao.armaId) && (
                          <div className="acao-stats">
                            {bonusAtq != null && (
                              <button
                                type="button"
                                className={`acao-stat acao-rolar ${penD20 > 0 || desReduzAtq ? "valor-exausto" : ""}`}
                                title={`Empilhar ataque no Rolador${
                                  ataqueArma ? ` · usa ${armaLigada?.nome}` : ""
                                }${
                                  fontesAtaque.length
                                    ? ` · inclui bônus de ${fontesAtaque.join(", ")}`
                                    : ""
                                }${desReduzAtq ? ` · −${Math.abs(penalidadeDesArmadura)} de DES (armadura)` : ""}${penD20 ? ` · −${penD20} de exaustão` : ""}`}
                                onClick={() =>
                                  empilharD20(bonusAtq - penD20, `Atacar ${acao.nome}`, {
                                    tipo: "ataque",
                                    alcance: alcanceContexto,
                                  })
                                }
                              >
                                <i className="fas fa-crosshairs" /> Acerto <strong>{formatarMod(bonusAtq - penD20)}</strong>
                                {fontesAtaque.length > 0 && <i className="fas fa-link prof-fonte" />}
                                {penD20 > 0 && <MarcaExausto titulo={`−${penD20} de exaustão`} />}
                              </button>
                            )}
                            {danoParse &&
                              (danoRolavel ? (
                                <button
                                  type="button"
                                  className="acao-stat acao-rolar"
                                  title={`Empilhar dano no Rolador${
                                    fontesDano.length
                                      ? ` · ${formatarMod(extraDano)} de ${fontesDano.join(", ")}`
                                      : ""
                                  }`}
                                  onClick={() =>
                                    empilharRolagem({
                                      dados: danoParse.dados,
                                      modificador: danoParse.modificador + extraDano,
                                      nomePreset: `Dano ${acao.nome}`,
                                    })
                                  }
                                >
                                  {danoInner}
                                </button>
                              ) : (
                                <span
                                  className="acao-stat"
                                  title={
                                    fontesDano.length
                                      ? `${formatarMod(extraDano)} de ${fontesDano.join(", ")}`
                                      : undefined
                                  }
                                >
                                  {danoInner}
                                </span>
                              ))}
                            {cd != null && atributoSalv && (
                              <span
                                className="acao-stat"
                                title={
                                  fontesCd.length
                                    ? `${formatarMod(extraCd)} de ${fontesCd.join(", ")}`
                                    : undefined
                                }
                              >
                                <i className="fas fa-shield-alt" /> Salv {SIGLA[atributoSalv]} CD <strong>{cd}</strong>
                                {fontesCd.length > 0 && <i className="fas fa-link prof-fonte" />}
                              </span>
                            )}
                            {acao.alcance && (
                              <span className="acao-stat"><i className="fas fa-ruler-horizontal" /> {acao.alcance}</span>
                            )}
                            {armaLigada ? (
                              <span className="acao-stat" title="O acerto vem desta arma equipada">
                                <i className="fas fa-khanda" /> {armaLigada.nome}
                              </span>
                            ) : (
                              acao.armaId && (
                                <span className="acao-stat" style={{ color: "var(--text-sec)" }} title="A arma ligada não está equipada — acerto pelo cálculo manual">
                                  <i className="fas fa-link-slash" /> arma não equipada
                                </span>
                              )
                            )}
                          </div>
                        )}
                        <div className="card-desc">{acao.descricao}</div>
                      </div>
                      {(custos.length > 0 || acao.tag) && (
                        <div className="card-tags">
                          {custos.map((c, i) => (
                            <span
                              key={i}
                              className="tag tag-custo"
                              style={
                                c.cor
                                  ? {
                                      background: `color-mix(in oklch, ${c.cor} 15%, transparent)`,
                                      color: c.cor,
                                      borderColor: `color-mix(in oklch, ${c.cor} 30%, transparent)`,
                                    }
                                  : undefined
                              }
                            >
                              {c.texto}
                            </span>
                          ))}
                          {acao.tag && (
                            <span className="tag tag-damage">{acao.tag}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: "var(--text-sec)", fontSize: "0.85rem", fontStyle: "italic" }}>
                Nenhuma ação nessa categoria.
              </p>
            )}
          </section>
        );
      })}

      {modalAberto && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()}>
            <h2>{form.id ? "Editar Ação" : "Nova Ação"}</h2>

            <div className="tipo-cards tipo-cards-4">
              {(
                [
                  ["padrao", "fa-gavel", "Padrão", "var(--color-padrao)"],
                  ["bonus", "fa-bolt", "Bônus", "var(--color-bonus)"],
                  ["power", "fa-bomb", "Poderosa", "var(--color-power)"],
                  ["react", "fa-shield-alt", "Reação", "var(--color-react)"],
                ] as const
              ).map(([slug, icone, titulo, cor]) => (
                <button
                  type="button"
                  key={slug}
                  className={`tipo-card ${form.tipo === slug ? "ativo" : ""}`}
                  style={form.tipo === slug ? { borderColor: cor, backgroundColor: `color-mix(in oklch, ${cor} 10%, var(--bg-card))` } : undefined}
                  onClick={() => setF("tipo", slug)}
                >
                  <i className={`fas ${icone}`} style={{ fontSize: "1.4rem", color: cor }} />
                  <span className="tipo-card-titulo">{titulo}</span>
                </button>
              ))}
            </div>

            <form onSubmit={salvar}>
              <label>Nome</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setF("nome", e.target.value)}
                placeholder="Ex: Soco Meteoro"
                autoFocus
              />

              <label>Descrição</label>
              <textarea
                value={form.descricao}
                onChange={(e) => setF("descricao", e.target.value)}
                placeholder="Descreva o efeito..."
              />

              <details className="modal-secao-detalhe" open={!!(form.dano || form.alcance || form.atributoAtaque || form.atributoSalv || form.atributoCd || form.tag || form.armaId)}>
                <summary><i className="fas fa-gears" /> Mecânica de combate</summary>
                <div className="modal-secao-corpo">
                  <label>Acerto vem da arma</label>
                  <select
                    value={form.armaId}
                    onChange={(e) => setF("armaId", e.target.value)}
                  >
                    <option value="">— cálculo manual —</option>
                    {armas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nome}
                        {a.equipado ? "" : " (desequipada)"}
                      </option>
                    ))}
                  </select>
                  {form.armaId ? (
                    <p className="modal-hint" style={{ marginTop: 8 }}>
                      <i className="fas fa-circle-info" /> Só o acerto vem desta arma (enquanto equipada); o dano é o desta ação. Sem arma equipada, o acerto cai no &quot;Ataque com&quot; abaixo.
                    </p>
                  ) : armas.length === 0 ? (
                    <p className="modal-hint" style={{ marginTop: 8 }}>
                      <i className="fas fa-lightbulb" /> Cadastre uma arma no Inventário pra poder usar o acerto dela nesta ação.
                    </p>
                  ) : null}

                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginTop: 10 }}>
                    <div>
                      <label>Dano</label>
                      <input
                        type="text"
                        value={form.dano}
                        onChange={(e) => setF("dano", e.target.value)}
                        placeholder="Ex: 2d6 fogo"
                      />
                    </div>
                    <div>
                      <label>Alcance</label>
                      <input
                        type="text"
                        value={form.alcance}
                        onChange={(e) => setF("alcance", e.target.value)}
                        placeholder="Ex: 9 m"
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                    <div>
                      <label>Ataque com</label>
                      <select
                        value={form.atributoAtaque}
                        onChange={(e) => setF("atributoAtaque", e.target.value)}
                      >
                        <option value="">—</option>
                        {ATRIBUTOS.map((a) => (
                          <option key={a.slug} value={a.slug}>{a.sigla}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Alvo resiste</label>
                      <select
                        value={form.atributoSalv}
                        onChange={(e) => setF("atributoSalv", e.target.value)}
                      >
                        <option value="">—</option>
                        {ATRIBUTOS.map((a) => (
                          <option key={a.slug} value={a.slug}>{a.sigla}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>CD com</label>
                      <select
                        value={form.atributoCd}
                        onChange={(e) => setF("atributoCd", e.target.value)}
                      >
                        <option value="">—</option>
                        {ATRIBUTOS.map((a) => (
                          <option key={a.slug} value={a.slug}>{a.sigla}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label>Tag livre</label>
                    <input
                      type="text"
                      value={form.tag}
                      onChange={(e) => setF("tag", e.target.value)}
                      placeholder="Ex: Cortante, Empurrão, Ignição"
                    />
                  </div>
                </div>
              </details>

              <details
                className="modal-secao-detalhe"
                open={!!(form.custoPp || form.custoPa || form.custoRecursoId)}
              >
                <summary><i className="fas fa-coins" /> Custos</summary>
                <div className="modal-secao-corpo">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label>PP (Pontos de Poder)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.custoPp}
                        onChange={(e) => setF("custoPp", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label>PA (Pontos de Ambição)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.custoPa}
                        onChange={(e) => setF("custoPa", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {recursos.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginTop: 10 }}>
                      <div>
                        <label>Recurso customizado</label>
                        <select
                          value={form.custoRecursoId}
                          onChange={(e) => setF("custoRecursoId", e.target.value)}
                        >
                          <option value="">—</option>
                          {recursos.map((r) => (
                            <option key={r.id} value={r.id}>{r.nome}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label>Quantidade</label>
                        <input
                          type="number"
                          min={0}
                          value={form.custoRecursoValor}
                          onChange={(e) => setF("custoRecursoValor", e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="modal-hint" style={{ marginTop: 8 }}>
                      <i className="fas fa-lightbulb" /> Crie um Recurso na sidebar (ex: Pontos de Carateca) pra poder atrelar a esta ação.
                    </p>
                  )}
                </div>
              </details>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={fecharModal}
                >
                  Cancelar
                </button>
                <button type="submit" className="modal-btn-save">
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
