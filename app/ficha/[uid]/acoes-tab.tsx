"use client";

import { useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { atualizarAcao, criarAcao, deletarAcao } from "./actions";
import {
  ATRIBUTOS,
  bonusAtaqueTecnica,
  bonusProficiencia,
  cdTecnica,
  custoComDesconto,
  efeitosComArma,
  efeitosDoContexto,
  formatarMod,
  melhorDesconto,
  penalidadeD20Exaustao,
  resolverAtaqueArma,
  resolverDanoArma,
  subirPassosDano,
  type Atributo,
  type EfeitosAgregados,
} from "@/lib/op-rpg";
import { empilharD20, empilharRolagem } from "@/lib/empilhar-rolagem";
import { useExaustaoOtimista } from "./use-exaustao-otimista";
import { MarcaExausto } from "./marca-exausto";
import { TagChip } from "./estilo-cor-picker";
import { normalizarEfeitoCor, type EstiloCor } from "@/lib/estilos-cor";
import { SeletorMultiplo, SeletorUnico, type OpcaoVinculo } from "./seletor-multiplo";

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
  armaIds: unknown;
  itemId: string | null;
  habilidadeIds: unknown;
};

type RecursoMinimo = {
  id: string;
  nome: string;
  cor: string | null;
  cor2: string | null;
  efeito: string;
};

// Subconjunto de Habilidade pra exibir/selecionar o vínculo "deriva de".
type HabilidadeRef = { id: string; nome: string };

// Subconjunto de Item necessário pra resolver o ataque/dano de uma arma.
type ItemArma = {
  id: string;
  nome: string;
  tipo: string;
  equipado: boolean;
  dano: string | null;
  danoBonus: string | null;
  modificador: number;
  alcance: string;
  propriedades: unknown;
  atributoAtaque: string | null;
  proficienteArma: boolean;
  danoSomaProficiencia: boolean;
  efeitos: unknown;
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
  habilidades: HabilidadeRef[];
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
  { tipo: "livre", titulo: "Ações Livres", icone: "fa-feather", cor: "var(--color-livre)" },
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
  armaIds: string[];
  itemId: string;
  habilidadeIds: string[];
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
  armaIds: [],
  itemId: "",
  habilidadeIds: [],
};

// Lê um Json de ids vindo do banco com defesa contra lixo/legado.
function lerIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.length > 0);
}

// Une listas de fontes preservando ordem e removendo duplicatas.
function juntarFontes(...listas: string[][]): string[] {
  const out: string[] = [];
  for (const l of listas) for (const f of l) if (!out.includes(f)) out.push(f);
  return out;
}

// Dano bônus com um sinal só: "+2" fica "+2", "1d6 fogo" vira "+1d6 fogo".
function comSinal(bonus: string): string {
  return /^[+-]/.test(bonus.trim()) ? bonus.trim() : `+${bonus.trim()}`;
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
  habilidades,
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
  // Efeitos de cada arma somados aos da ficha — valem nos golpes com ela.
  const efeitosPorArma = new Map(armas.map((a) => [a.id, efeitosComArma(efeitosAgregados, a)]));
  const efeitosDa = (a: ItemArma) => efeitosPorArma.get(a.id) ?? efeitosAgregados;

  // Opções dos pickers visuais do modal.
  const opcoesArma: OpcaoVinculo[] = armas.map((a) => ({
    id: a.id,
    nome: a.nome,
    icone: "fa-khanda",
    detalhe: [
      a.dano ? subirPassosDano(a.dano, efeitosDa(a).passosDanoArma.valor) : null,
      a.danoBonus ? comSinal(a.danoBonus) : null,
      a.equipado ? null : "desequipada",
    ]
      .filter(Boolean)
      .join(" · "),
    inativo: !a.equipado,
  }));
  const opcoesItem: OpcaoVinculo[] = itens.map((i) => ({
    id: i.id,
    nome: i.nome,
    icone: "fa-sack-dollar",
    detalhe: i.equipado ? undefined : "desequipado",
    inativo: !i.equipado,
  }));
  const opcoesHabilidade: OpcaoVinculo[] = habilidades.map((h) => ({
    id: h.id,
    nome: h.nome,
    icone: "fa-star",
  }));
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
      armaIds: lerIds(acao.armaIds),
      itemId: acao.itemId || "",
      habilidadeIds: lerIds(acao.habilidadeIds),
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
      armaIds: form.armaIds,
      itemId: form.itemId || null,
      habilidadeIds: form.habilidadeIds,
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
      <div className="tab-topo">
        <h1>Ações de Combate</h1>
        <button
          type="button"
          className="btn-rect primary"
          onClick={abrirNova}
        >
          + Nova Ação
        </button>
      </div>
      <p className="modal-intro">
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
                  // Armas ligadas à ação (ex: Seiken servindo a qualquer marcial).
                  // Só as EQUIPADAS desferem; as demais só aparecem esmaecidas.
                  const armasDaAcao = lerIds(acao.armaIds)
                    .map((id) => armas.find((a) => a.id === id))
                    .filter((a): a is ItemArma => !!a);
                  const armasEquipadas = armasDaAcao.filter((a) => a.equipado);
                  // Habilidades das quais a ação deriva (refs soltas). Somem do
                  // card se forem apagadas.
                  const habsDerivadas = lerIds(acao.habilidadeIds)
                    .map((id) => habilidades.find((h) => h.id === id))
                    .filter((h): h is HabilidadeRef => !!h);
                  // Um acerto (e um dano) por arma equipada, cada um com os
                  // efeitos da própria arma somados aos da ficha.
                  const golpes = armasEquipadas.map((arma) => {
                    const atq = resolverAtaqueArma({
                      alcanceRaw: arma.alcance,
                      propriedadesRaw: arma.propriedades,
                      atributoOverride: arma.atributoAtaque,
                      modificadorArma: arma.modificador || 0,
                      proficiente: arma.proficienteArma,
                      atributos: atributosParaTeste,
                      nivel,
                      efeitosAgregados: efeitosDa(arma),
                    });
                    return { arma, atq };
                  });
                  // A 1ª arma equipada define o alcance de contexto quando a
                  // ação não tem atributo de ataque próprio.
                  const ataqueArma = golpes[0]?.atq ?? null;
                  // Ação não distingue CC vs Distância (modelo só tem texto
                  // livre em alcance), então somamos os 3 buckets de ataque
                  // num bônus único; idem pra dano.
                  const extraAtaque =
                    efeitosAgregados.bonusAtaque.valor +
                    efeitosAgregados.bonusAtaqueCC.valor +
                    efeitosAgregados.bonusAtaqueDistancia.valor;
                  const extraCd = efeitosAgregados.bonusCdTecnicas.valor;
                  const fontesCd = efeitosAgregados.bonusCdTecnicas.fontes;
                  // Item que concede a ação. Sem ele equipado, a ação fica
                  // travada (card apagado, sem rolar) — igual às travadas por
                  // árvore de talento.
                  const itemOrigem = acao.itemId
                    ? itens.find((i) => i.id === acao.itemId)
                    : undefined;
                  const travadaPorItem = !!acao.itemId && !itemOrigem?.equipado;
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
                  // O dado de dano é da própria técnica — sobe só com passo "nas
                  // técnicas" —, mas o `danoBonus` e a proficiência da arma
                  // ligada entram junto: é dano da arma, vale em todo golpe
                  // desferido com ela. Bônus de habilidade (dano/dano-cc/
                  // dano-distancia) também são compostos aqui.
                  const comporDano = (arma: ItemArma | null) => {
                    const agg = arma ? efeitosDa(arma) : efeitosAgregados;
                    const d = acao.dano
                      ? resolverDanoArma({
                          danoBase: acao.dano,
                          danoBonus: arma?.danoBonus ?? null,
                          passos: agg.passosDanoTecnica.valor,
                          somaAtributo: false,
                          atributoDano: null,
                          atributos: atributosParaTeste,
                          proficiencia: arma?.danoSomaProficiencia
                            ? bonusProficiencia(nivel)
                            : 0,
                          alcance: alcanceContexto,
                          efeitosAgregados: agg,
                        })
                      : null;
                    return { d, efeitos: efeitosDoContexto(agg) };
                  };
                  // Um dano por arma equipada (cada uma soma o próprio bônus);
                  // sem arma, um dano único da técnica.
                  const danos =
                    armasEquipadas.length > 0
                      ? armasEquipadas.map((a) => ({
                          rotulo: armasEquipadas.length > 1 ? a.nome : null,
                          ...comporDano(a),
                        }))
                      : [{ rotulo: null, ...comporDano(null) }];
                  const cd = atributoCd
                    ? cdTecnica({
                        nivel,
                        valorAtributoPrim: atributosParaTeste[atributoCd],
                      }) + extraCd
                    : null;
                  const atributoSalv = acao.atributoSalv as Atributo | null;
                  // Cada custo carrega cor opcional pra colorir o chip.
                  // Recurso customizado usa a cor configurada; PP/PA usam padrão.
                  const custos: { texto: string; estilo?: EstiloCor; titulo?: string }[] = [];
                  // Desconto em técnica: o da ficha somado ao da arma que desfere
                  // (ou que concede) a ação. Com várias armas, vale a melhor.
                  const armasDoCusto = [
                    ...armasEquipadas,
                    ...(itemOrigem?.tipo === "arma" && itemOrigem.equipado ? [itemOrigem] : []),
                  ];
                  const aggsDoCusto = armasDoCusto.length
                    ? armasDoCusto.map(efeitosDa)
                    : [efeitosAgregados];
                  for (const [custo, valor, sigla] of [
                    ["pp", acao.custoPp, "PP"],
                    ["pa", acao.custoPa, "PA"],
                  ] as const) {
                    if (valor <= 0) continue;
                    const desconto = melhorDesconto(aggsDoCusto, custo);
                    const final = custoComDesconto(valor, desconto.valor);
                    custos.push(
                      final < valor
                        ? {
                            texto: `${valor}→${final} ${sigla}`,
                            titulo: `−${valor - final} ${sigla} de ${desconto.fontes.join(", ")} (nunca abaixo da metade)`,
                          }
                        : { texto: `${valor} ${sigla}` },
                    );
                  }
                  if (recursoCusto && acao.custoRecursoValor > 0) {
                    custos.push({
                      texto: `${acao.custoRecursoValor} ${recursoCusto.nome}`,
                      estilo: {
                        cor: recursoCusto.cor,
                        cor2: recursoCusto.cor2,
                        efeito: normalizarEfeitoCor(recursoCusto.efeito),
                      },
                    });
                  }
                  return (
                    <div
                      key={acao.id}
                      className={`action-card type-${acao.tipo}${travadaPorItem ? " hab-travada" : ""}`}
                    >
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
                        {(bonusAtq != null || cd != null || atributoSalv || acao.dano || acao.alcance || armasDaAcao.length > 0 || acao.itemId) && (
                          <div className="acao-stats">
                            {/* Com armas ligadas, um chip de acerto POR arma
                                equipada (cada uma tem bônus e alcance próprios).
                                Sem arma, o acerto é o cálculo manual da técnica. */}
                            {golpes.length > 0
                              ? golpes.map(({ arma, atq }) =>
                                  atq ? (
                                    <button
                                      key={arma.id}
                                      type="button"
                                      disabled={travadaPorItem}
                                      className={`acao-stat acao-rolar ${penD20 > 0 || (atq.atributo === "destreza" && desReduz) ? "valor-exausto" : ""}`}
                                      title={`Empilhar ataque com ${arma.nome}${
                                        atq.fontes.length
                                          ? ` · inclui bônus de ${atq.fontes.join(", ")}`
                                          : ""
                                      }${penD20 ? ` · −${penD20} de exaustão` : ""}`}
                                      onClick={() =>
                                        empilharD20(
                                          atq.bonus - penD20,
                                          `Atacar ${acao.nome} (${arma.nome})`,
                                          { tipo: "ataque", alcance: atq.alcance },
                                          efeitosDoContexto(efeitosDa(arma)),
                                        )
                                      }
                                    >
                                      <i className="fas fa-crosshairs" /> {arma.nome}{" "}
                                      <strong>{formatarMod(atq.bonus - penD20)}</strong>
                                      {atq.fontes.length > 0 && <i className="fas fa-link prof-fonte" />}
                                      {penD20 > 0 && <MarcaExausto titulo={`−${penD20} de exaustão`} />}
                                    </button>
                                  ) : null,
                                )
                              : bonusAtq != null && (
                                  <button
                                    type="button"
                                    disabled={travadaPorItem}
                                    className={`acao-stat acao-rolar ${penD20 > 0 || desReduzAtq ? "valor-exausto" : ""}`}
                                    title={`Empilhar ataque no Rolador${
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
                                    <i className="fas fa-crosshairs" /> Acerto{" "}
                                    <strong>{formatarMod(bonusAtq - penD20)}</strong>
                                    {fontesAtaque.length > 0 && <i className="fas fa-link prof-fonte" />}
                                    {penD20 > 0 && <MarcaExausto titulo={`−${penD20} de exaustão`} />}
                                  </button>
                                )}
                            {danos.map(({ rotulo, d, efeitos }, i) => {
                              if (!d) return null;
                              const titulo = d.partes
                                .map((x) => `${x.rotulo}: ${x.texto}`)
                                .join(" · ");
                              const miolo = (
                                <>
                                  <i className="fas fa-burst" />{" "}
                                  {rotulo ? `${rotulo}: ` : ""}
                                  {d.formula}
                                  {d.partes.length > 1 && <i className="fas fa-link prof-fonte" />}
                                </>
                              );
                              return d.rolavel && !travadaPorItem ? (
                                <button
                                  key={`d${i}`}
                                  type="button"
                                  className="acao-stat acao-rolar"
                                  title={`Empilhar dano no Rolador · ${titulo}`}
                                  onClick={() =>
                                    empilharRolagem({
                                      dados: d.dados,
                                      modificador: d.modificador,
                                      nomePreset: `Dano ${acao.nome}${rotulo ? ` (${rotulo})` : ""}`,
                                      // Contexto de dano casa dano_min/trocar_dano/
                                      // ignora/melhor de N no Rolador (etapa 3.5).
                                      contexto: { tipo: "dano", alcance: alcanceContexto },
                                      efeitos,
                                    })
                                  }
                                >
                                  {miolo}
                                </button>
                              ) : (
                                <span key={`d${i}`} className="acao-stat" title={titulo || undefined}>
                                  {miolo}
                                </span>
                              );
                            })}
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
                            {itemOrigem && (
                              <span
                                className="acao-stat"
                                style={travadaPorItem ? { color: "var(--text-sec)" } : undefined}
                                title={
                                  travadaPorItem
                                    ? "Esta ação vem de um item que não está equipado"
                                    : "Ação concedida por este item"
                                }
                              >
                                <i className={`fas ${travadaPorItem ? "fa-lock" : "fa-sack-dollar"}`} />{" "}
                                {itemOrigem.nome}
                              </span>
                            )}
                            {armasDaAcao.map((a) => (
                              <span
                                key={a.id}
                                className="acao-stat"
                                style={a.equipado ? undefined : { color: "var(--text-sec)" }}
                                title={
                                  a.equipado
                                    ? "Desfere esta ação; o acerto acima é o dela"
                                    : "Arma ligada, mas não equipada"
                                }
                              >
                                <i className={`fas ${a.equipado ? "fa-khanda" : "fa-link-slash"}`} />{" "}
                                {a.nome}
                                {a.danoBonus && a.equipado ? ` ${comSinal(a.danoBonus)}` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                        {travadaPorItem && (
                          <div className="hab-travada-nota">
                            <i className="fas fa-lock" /> vem de{" "}
                            {itemOrigem?.nome ?? "um item"} — equipe o item pra usar
                          </div>
                        )}
                        <div className="card-desc">{acao.descricao}</div>
                      </div>
                      {(custos.length > 0 || acao.tag || habsDerivadas.length > 0) && (
                        <div className="card-tags">
                          {custos.map((c, i) => (
                            <TagChip
                              key={i}
                              nome={c.texto}
                              estilo={c.estilo}
                              classePadrao="tag tag-custo"
                              title={c.titulo}
                            />
                          ))}
                          {acao.tag && (
                            <span className="tag tag-damage">{acao.tag}</span>
                          )}
                          {habsDerivadas.length > 0 && (
                            <span className="acao-deriva" title="Esta ação deriva destas habilidades">
                              Deriva de{" "}
                              {habsDerivadas.map((h, i) => (
                                <span key={h.id}>
                                  {i > 0 && ", "}
                                  <span className="acao-deriva-nome">{h.nome}</span>
                                </span>
                              ))}
                            </span>
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
            <button type="button" className="modal-close" onClick={fecharModal} aria-label="Fechar">
              <i className="fas fa-times" />
            </button>
            <h2>{form.id ? "Editar Ação" : "Nova Ação"}</h2>

            <div className="tipo-cards tipo-cards-5">
              {(
                [
                  ["padrao", "fa-gavel", "Padrão", "var(--color-padrao)"],
                  ["bonus", "fa-bolt", "Bônus", "var(--color-bonus)"],
                  ["power", "fa-bomb", "Poderosa", "var(--color-power)"],
                  ["react", "fa-shield-alt", "Reação", "var(--color-react)"],
                  ["livre", "fa-feather", "Livre", "var(--color-livre)"],
                ] as const
              ).map(([slug, icone, titulo, cor]) => (
                <button
                  type="button"
                  key={slug}
                  className={`tipo-card ${form.tipo === slug ? "ativo" : ""}`}
                  style={{ "--tipo-cor": cor } as React.CSSProperties}
                  aria-pressed={form.tipo === slug}
                  onClick={() => setF("tipo", slug)}
                >
                  <i className={`fas ${icone} tipo-card-icone`} />
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

              <h3 className="modal-secao">
                <i className="fas fa-link" /> De onde vem
              </h3>

              <label>Deriva das habilidades</label>
              <SeletorMultiplo
                opcoes={opcoesHabilidade}
                marcados={form.habilidadeIds}
                onChange={(ids) => setF("habilidadeIds", ids)}
                rotulo="habilidade"
                vazio="Nenhuma habilidade cadastrada ainda — veja a aba Habilidades."
              />

              <label style={{ marginTop: 14 }}>Concedida por um item</label>
              <SeletorUnico
                opcoes={opcoesItem}
                marcado={form.itemId}
                onChange={(id) => setF("itemId", id)}
                rotulo="item"
                vazio="Nenhum item no inventário."
              />

              <h3 className="modal-secao">
                <i className="fas fa-khanda" /> Armas que desferem
              </h3>
              <SeletorMultiplo
                opcoes={opcoesArma}
                marcados={form.armaIds}
                onChange={(ids) => setF("armaIds", ids)}
                rotulo="arma"
                vazio="Nenhuma arma no inventário."
              />
              {form.armaIds.length > 0 && (
                <p className="modal-hint" style={{ marginTop: 8 }}>
                  <i className="fas fa-circle-info" /> Cada arma equipada vira um chip de
                  acerto próprio no card, somando o dano bônus dela.
                </p>
              )}

              <h3 className="modal-secao">
                <i className="fas fa-gears" /> Números
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
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
