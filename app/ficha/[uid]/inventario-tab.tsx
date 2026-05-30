"use client";

import { useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { EditableStat } from "./editable-stat";
import { atualizarItem, criarItem, deletarItem } from "./actions";
import {
  ALCANCES_ARMA,
  ATRIBUTOS,
  CATEGORIAS_ARMA,
  PROPRIEDADES_ARMA,
  penalidadeD20Exaustao,
  resolverAtaqueArma,
  formatarMod,
  type AlcanceArma,
  type Atributo,
  type CategoriaArma,
  type EfeitosAgregados,
  type PropriedadeArma,
} from "@/lib/op-rpg";
import { useExaustaoOtimista } from "./use-exaustao-otimista";
import { MarcaExausto } from "./marca-exausto";

type Item = {
  id: string;
  nome: string;
  peso: number;
  tipo: string;
  tags: string | null;
  descricao: string | null;
  dano: string | null;
  modificador: number;
  ca: number;
  penalidadeDes: number;
  equipado: boolean;
  favorito: boolean;
  categoria: string;
  alcance: string;
  alcanceMetros: string | null;
  propriedades: unknown;
  atributoAtaque: string | null;
  proficienteArma: boolean;
};

const CATEGORIAS_ARMA_VALIDAS = new Set<string>(CATEGORIAS_ARMA.map((c) => c.slug));
const ALCANCES_ARMA_VALIDOS = new Set<string>(ALCANCES_ARMA.map((a) => a.slug));

type Props = {
  personagemId: string;
  cargaMaxima: number;
  berries: number;
  itens: Item[];
  nivel: number;
  exaustao: number;
  atributos: Record<Atributo, number>;
  efeitosAgregados: EfeitosAgregados;
};

function lerPropriedades(raw: unknown): PropriedadeArma[] {
  if (!Array.isArray(raw)) return [];
  const validas = new Set(PROPRIEDADES_ARMA.map((p) => p.slug));
  return raw.filter(
    (p): p is PropriedadeArma => typeof p === "string" && validas.has(p as PropriedadeArma),
  );
}

const SIGLA_ATRIBUTO: Record<Atributo, string> = {
  forca: "FOR",
  destreza: "DES",
  constituicao: "CON",
  sabedoria: "SAB",
  vontade: "VON",
  presenca: "PRE",
};

type Categoria = "arsenal" | "armaria" | "mochila";

function categoriaDoItem(tipo: string): Categoria {
  if (tipo === "arma") return "arsenal";
  if (tipo === "armadura") return "armaria";
  return "mochila";
}

type FormState = {
  id: string | null;
  nome: string;
  peso: string;
  tipo: string;
  tags: string;
  descricao: string;
  dano: string;
  modificador: string;
  ca: string;
  penalidadeDes: string;
  categoria: CategoriaArma;
  alcance: AlcanceArma;
  alcanceMetros: string;
  propriedades: PropriedadeArma[];
  atributoAtaque: string; // "" = auto
  proficienteArma: boolean;
};

const FORM_VAZIO: FormState = {
  id: null,
  nome: "",
  peso: "1.0",
  tipo: "comum",
  tags: "",
  descricao: "",
  dano: "",
  modificador: "",
  ca: "",
  penalidadeDes: "",
  categoria: "cortante",
  alcance: "corpo_a_corpo",
  alcanceMetros: "",
  propriedades: [],
  atributoAtaque: "",
  proficienteArma: true,
};

export function InventarioTab({
  personagemId,
  cargaMaxima,
  berries,
  itens,
  nivel,
  exaustao: exaustaoServer,
  atributos,
  efeitosAgregados,
}: Props) {
  // Penalidade de exaustão (−2 × nível) some no acerto da arma (teste de d20).
  const exaustao = useExaustaoOtimista(exaustaoServer);
  const penD20 = penalidadeD20Exaustao(exaustao);
  const [mostrarEquipados, setMostrarEquipados] = useState(false);
  const [categoria, setCategoria] = useState<Categoria>("arsenal");
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [, startTransition] = useTransition();

  // Optimistic: aplica patch local antes do server responder. Quando o
  // realtime/revalidate trazem dados novos, `itens` muda e o estado otimista
  // é resetado automaticamente pelo React.
  type Patch =
    | { kind: "update"; id: string; patch: Partial<Item> }
    | { kind: "updateMany"; ids: string[]; patch: Partial<Item> }
    | { kind: "create"; item: Item }
    | { kind: "delete"; id: string };
  const [itensOtimistas, aplicarOtimista] = useOptimistic(itens, (state, p: Patch) => {
    if (p.kind === "update") {
      return state.map((i) => (i.id === p.id ? { ...i, ...p.patch } : i));
    }
    if (p.kind === "updateMany") {
      const set = new Set(p.ids);
      return state.map((i) => (set.has(i.id) ? { ...i, ...p.patch } : i));
    }
    if (p.kind === "create") return [...state, p.item];
    return state.filter((i) => i.id !== p.id);
  });

  function abrirNovo() {
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdit(item: Item) {
    setForm({
      id: item.id,
      nome: item.nome,
      peso: String(item.peso),
      tipo: item.tipo,
      tags: item.tags || "",
      descricao: item.descricao || "",
      dano: item.dano || "",
      modificador: String(item.modificador || ""),
      ca: String(item.ca || ""),
      penalidadeDes: String(item.penalidadeDes || ""),
      categoria: CATEGORIAS_ARMA_VALIDAS.has(item.categoria)
        ? (item.categoria as CategoriaArma)
        : "cortante",
      alcance: ALCANCES_ARMA_VALIDOS.has(item.alcance)
        ? (item.alcance as AlcanceArma)
        : "corpo_a_corpo",
      alcanceMetros: item.alcanceMetros || "",
      propriedades: lerPropriedades(item.propriedades),
      atributoAtaque: item.atributoAtaque || "",
      proficienteArma: item.proficienteArma,
    });
    setModalAberto(true);
  }

  function fechar() {
    setModalAberto(false);
  }

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
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

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) {
      Swal.fire({
        icon: "warning",
        title: "Campo obrigatório",
        text: "Nome é obrigatório.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }

    const ehArma = form.tipo === "arma";
    const payload = {
      nome: form.nome,
      peso: Number(form.peso) || 0,
      tipo: form.tipo,
      tags: form.tags,
      descricao: form.descricao,
      dano: ehArma ? form.dano : "",
      modificador: ehArma ? Number(form.modificador) || 0 : 0,
      ca: form.tipo === "armadura" ? Number(form.ca) || 0 : 0,
      penalidadeDes: form.tipo === "armadura" ? Number(form.penalidadeDes) || 0 : 0,
      categoria: ehArma ? form.categoria : "cortante",
      alcance: ehArma ? form.alcance : "corpo_a_corpo",
      alcanceMetros: ehArma ? form.alcanceMetros.trim() || null : null,
      propriedades: ehArma ? form.propriedades : [],
      atributoAtaque: ehArma && form.atributoAtaque ? form.atributoAtaque : null,
      proficienteArma: ehArma ? form.proficienteArma : true,
    };

    const editandoId = form.id;
    setModalAberto(false);

    startTransition(async () => {
      if (editandoId) {
        aplicarOtimista({ kind: "update", id: editandoId, patch: payload });
        try {
          await atualizarItem(personagemId, editandoId, payload);
        } catch (err) {
          mostrarErro(err);
        }
      } else {
        const novoItem: Item = {
          id: "temp-" + Math.random().toString(36).slice(2),
          nome: payload.nome,
          peso: payload.peso,
          tipo: payload.tipo,
          tags: payload.tags || null,
          descricao: payload.descricao || null,
          dano: payload.dano || null,
          modificador: payload.modificador,
          ca: payload.ca,
          penalidadeDes: payload.penalidadeDes,
          equipado: false,
          favorito: false,
          categoria: payload.categoria,
          alcance: payload.alcance,
          alcanceMetros: payload.alcanceMetros,
          propriedades: payload.propriedades,
          atributoAtaque: payload.atributoAtaque,
          proficienteArma: payload.proficienteArma,
        };
        aplicarOtimista({ kind: "create", item: novoItem });
        try {
          await criarItem(personagemId, payload);
        } catch (err) {
          mostrarErro(err);
        }
      }
    });
  }

  function toggleFavorito(item: Item) {
    const novo = !item.favorito;
    startTransition(async () => {
      aplicarOtimista({ kind: "update", id: item.id, patch: { favorito: novo } });
      try {
        await atualizarItem(personagemId, item.id, { favorito: novo });
      } catch (err) {
        console.error(err);
      }
    });
  }

  function toggleEquipar(item: Item) {
    const novo = !item.equipado;
    // Se vai equipar armadura, desequipa outras armaduras primeiro.
    const outras =
      novo && item.tipo === "armadura"
        ? itensOtimistas.filter(
            (i) => i.tipo === "armadura" && i.equipado && i.id !== item.id,
          )
        : [];

    startTransition(async () => {
      if (outras.length > 0) {
        aplicarOtimista({
          kind: "updateMany",
          ids: outras.map((i) => i.id),
          patch: { equipado: false },
        });
      }
      aplicarOtimista({ kind: "update", id: item.id, patch: { equipado: novo } });
      try {
        if (outras.length > 0) {
          await Promise.all(
            outras.map((i) => atualizarItem(personagemId, i.id, { equipado: false })),
          );
        }
        await atualizarItem(personagemId, item.id, { equipado: novo });
      } catch (err) {
        console.error(err);
      }
    });
  }

  async function apagar(itemId: string) {
    const confirm = await Swal.fire({
      title: "Deletar Item",
      text: "Tem certeza que quer apagar este item?",
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
      aplicarOtimista({ kind: "delete", id: itemId });
      try {
        await deletarItem(personagemId, itemId);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function calcAtaque(item: Item): Ataque {
    if (item.tipo !== "arma") return null;
    const r = resolverAtaqueArma({
      alcanceRaw: item.alcance,
      propriedadesRaw: item.propriedades,
      atributoOverride: item.atributoAtaque,
      modificadorArma: item.modificador || 0,
      proficiente: item.proficienteArma,
      atributos,
      nivel,
      efeitosAgregados,
    });
    if (!r) return null;
    return {
      atributo: r.atributo,
      bonus: r.bonus - penD20,
      fontesHab: r.fontes.length ? r.fontes : undefined,
      exausto: penD20 > 0,
    };
  }

  const pesoTotal = itensOtimistas.reduce((acc, i) => acc + (Number(i.peso) || 0), 0);
  // Carga base + bônus aditivos × fator multiplicativo (Espécie Gigante etc).
  const multCarga = efeitosAgregados.multiplicadores.carga;
  const maxPesoBase = (cargaMaxima || 20) + efeitosAgregados.bonusCarga.valor;
  const maxPeso = multCarga ? maxPesoBase * multCarga.fator : maxPesoBase;
  const pesoPct = Math.min(100, (pesoTotal / maxPeso) * 100);

  let corBarra = "var(--color-react)";
  let msgSobrecarga: string | null = null;
  if (pesoPct >= 100) {
    corBarra = "#ff4444";
    msgSobrecarga = "LIMITE ATINGIDO!";
  } else if (pesoPct >= 90) {
    corBarra = "#ff4444";
    msgSobrecarga = "SOBRECARGA";
  } else if (pesoPct >= 75) {
    corBarra = "orangered";
    msgSobrecarga = "SOBRECARGA";
  } else if (pesoPct > 50) {
    corBarra = "var(--color-power)";
    msgSobrecarga = "SOBRECARGA";
  } else if (pesoPct >= 25) {
    corBarra = "var(--color-bonus)";
  }

  // Filtro + agrupamento
  const ordenados = [...itensOtimistas].sort((a, b) => a.nome.localeCompare(b.nome));
  const visiveis = mostrarEquipados ? ordenados.filter((i) => i.equipado) : ordenados;

  const favoritos = !mostrarEquipados ? visiveis.filter((i) => i.favorito) : [];
  const naoFavoritos = mostrarEquipados ? visiveis : visiveis.filter((i) => !i.favorito);
  const arsenal = naoFavoritos.filter((i) => categoriaDoItem(i.tipo) === "arsenal");
  const armaria = naoFavoritos.filter((i) => categoriaDoItem(i.tipo) === "armaria");
  const mochila = naoFavoritos.filter((i) => categoriaDoItem(i.tipo) === "mochila");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h1 style={{ marginRight: "auto" }}>Inventário</h1>
        <div className="berries-display" title="Berries (moeda do One Piece)">
          <span className="berries-simbolo">฿</span>
          <EditableStat
            personagemId={personagemId}
            campo="berries"
            valor={berries}
            formato="milhar"
          />
        </div>
        <button
          type="button"
          className={`btn-rect outline ${mostrarEquipados ? "active" : ""}`}
          onClick={() => setMostrarEquipados((v) => !v)}
        >
          <i className="fas fa-tshirt" /> {mostrarEquipados ? "Ver Todos" : "Ver Equipados"}
        </button>
        <button type="button" className="btn-rect primary" onClick={abrirNovo}>
          + Novo Item
        </button>
      </div>

      <div className="bar-group peso-bar">
        <div className="bar-label">
          <span><i className="fas fa-scale-balanced" /> Carga</span>
          <div className="stat-values">
            <span>{pesoTotal.toFixed(1)}</span> /{" "}
            <EditableStat personagemId={personagemId} campo="cargaMaxima" valor={cargaMaxima} />
            {efeitosAgregados.bonusCarga.fontes.length > 0 && (
              <span
                title={`${formatarMod(efeitosAgregados.bonusCarga.valor)} de ${efeitosAgregados.bonusCarga.fontes.join(", ")}`}
              >
                {" "}
                {efeitosAgregados.bonusCarga.valor > 0 ? "+" : ""}
                {efeitosAgregados.bonusCarga.valor}
                <i className="fas fa-link prof-fonte" />
              </span>
            )}
            {multCarga && (
              <span title={`×${multCarga.fator} de ${multCarga.fontes.join(", ")}`}>
                {" "}×{multCarga.fator}
                <i className="fas fa-link prof-fonte" />
              </span>
            )}
            {" "}PC
          </div>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pesoPct}%`, background: corBarra }} />
        </div>
        {msgSobrecarga && (
          <div className="msg-sobrecarga">
            <i className="fas fa-triangle-exclamation" /> {msgSobrecarga}
          </div>
        )}
      </div>

      {/* Favoritos (só quando "Ver Todos") */}
      {!mostrarEquipados && favoritos.length > 0 && (
        <section style={{ marginBottom: 30 }}>
          <h3 style={{ color: "#d4af37", marginBottom: 20 }}>
            <i className="fas fa-star" /> DESTAQUES
          </h3>
          <div className="action-grid">
            {favoritos.map((item) => (
              <CardItem
                key={item.id}
                item={item}
                ataque={calcAtaque(item)}
                onToggleFavorito={() => toggleFavorito(item)}
                onToggleEquipar={() => toggleEquipar(item)}
                onEdit={() => abrirEdit(item)}
                onDelete={() => apagar(item.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Tabs de categoria (só em "Ver Todos") */}
      {!mostrarEquipados && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {(
            [
              ["arsenal", "fa-fist-raised", "Arsenal"],
              ["armaria", "fa-shield-alt", "Armaria"],
              ["mochila", "fa-shopping-bag", "Mochila"],
            ] as const
          ).map(([key, icone, titulo]) => (
            <button
              key={key}
              type="button"
              className={`btn-rect outline ${categoria === key ? "active" : ""}`}
              onClick={() => setCategoria(key)}
            >
              <i className={`fas ${icone}`} /> {titulo}
            </button>
          ))}
        </div>
      )}

      {/* Listas — modo "Ver Equipados" mostra tudo, modo "Ver Todos" mostra só a categoria escolhida */}
      <SecaoItens
        titulo="Arsenal"
        icone="fa-fist-raised"
        itens={arsenal}
        visivel={mostrarEquipados || categoria === "arsenal"}
        callbacks={{ toggleFavorito, toggleEquipar, abrirEdit, apagar }}
        calcAtaque={calcAtaque}
      />
      <SecaoItens
        titulo="Armaria"
        icone="fa-shield-alt"
        itens={armaria}
        visivel={mostrarEquipados || categoria === "armaria"}
        callbacks={{ toggleFavorito, toggleEquipar, abrirEdit, apagar }}
        calcAtaque={calcAtaque}
      />
      <SecaoItens
        titulo="Mochila"
        icone="fa-shopping-bag"
        itens={mochila}
        visivel={mostrarEquipados || categoria === "mochila"}
        callbacks={{ toggleFavorito, toggleEquipar, abrirEdit, apagar }}
        calcAtaque={calcAtaque}
      />

      {visiveis.length === 0 && (
        <p style={{ color: "var(--text-sec)", fontStyle: "italic", padding: "20px 0" }}>
          {mostrarEquipados ? "Nenhum item equipado." : "Inventário vazio..."}
        </p>
      )}

      {modalAberto && (
        <div className="modal-overlay" onClick={fechar}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>{form.id ? "Editar Item" : "Novo Item"}</h2>

            <div className="tipo-cards">
              {(
                [
                  ["comum", "fa-bag-shopping", "Item Comum", "Mochila, ferramenta, consumível"],
                  ["arma", "fa-khanda", "Arma", "Define ataque, dano, propriedades"],
                  ["armadura", "fa-shield-alt", "Armadura", "Soma CA na sua CR"],
                ] as const
              ).map(([slug, icone, titulo, sub]) => (
                <button
                  type="button"
                  key={slug}
                  className={`tipo-card ${form.tipo === slug ? "ativo" : ""}`}
                  onClick={() => set("tipo", slug)}
                >
                  <span className="tipo-card-icone">
                    <i className={`fas ${icone}`} />
                  </span>
                  <span className="tipo-card-titulo">{titulo}</span>
                  <span className="tipo-card-sub">{sub}</span>
                </button>
              ))}
            </div>

            <form onSubmit={salvar}>
              <label>Nome do Item</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => set("nome", e.target.value)}
                placeholder={
                  form.tipo === "arma"
                    ? "Ex: Espada Longa"
                    : form.tipo === "armadura"
                      ? "Ex: Cota de Malha"
                      : "Ex: Poção de Cura"
                }
                autoFocus
              />

              <div style={{ marginTop: 10 }}>
                <label>Peso (PC)</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.peso}
                  onChange={(e) => set("peso", e.target.value)}
                />
              </div>

              {form.tipo === "arma" && (
                <>
                  <h3 className="modal-secao"><i className="fas fa-khanda" /> Combate</h3>
                  <label>Categoria</label>
                  <div className="categoria-pills">
                    {CATEGORIAS_ARMA.map((c) => (
                      <button
                        type="button"
                        key={c.slug}
                        className={`categoria-pill ${form.categoria === c.slug ? "ativo" : ""}`}
                        onClick={() =>
                          setForm((f) => ({ ...f, categoria: c.slug }))
                        }
                      >
                        <i className={`fas ${c.icone}`} />
                        <span>{c.nome}</span>
                      </button>
                    ))}
                  </div>

                  <label style={{ marginTop: 10 }}>Alcance</label>
                  <div className="categoria-pills">
                    {ALCANCES_ARMA.map((a) => (
                      <button
                        type="button"
                        key={a.slug}
                        className={`categoria-pill ${form.alcance === a.slug ? "ativo" : ""}`}
                        onClick={() =>
                          setForm((f) => ({ ...f, alcance: a.slug }))
                        }
                      >
                        <i className={`fas ${a.icone}`} />
                        <span>{a.nome}</span>
                      </button>
                    ))}
                  </div>

                  <label style={{ marginTop: 10 }}>Alcance em metros</label>
                  <input
                    type="text"
                    value={form.alcanceMetros}
                    onChange={(e) => set("alcanceMetros", e.target.value)}
                    placeholder={
                      form.alcance === "distancia" ? "Ex: 9/15 m" : "Ex: 1,5 m"
                    }
                  />

                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr", gap: 10, marginTop: 12 }}>
                    <div>
                      <label>Dado de Dano</label>
                      <input
                        type="text"
                        value={form.dano}
                        onChange={(e) => set("dano", e.target.value)}
                        placeholder="1d8"
                      />
                    </div>
                    <div>
                      <label>Bônus</label>
                      <input
                        type="number"
                        value={form.modificador}
                        onChange={(e) => set("modificador", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label>Atributo de Ataque</label>
                      <select
                        value={form.atributoAtaque}
                        onChange={(e) => set("atributoAtaque", e.target.value)}
                      >
                        <option value="">Automático</option>
                        {ATRIBUTOS.map((a) => (
                          <option key={a.slug} value={a.slug}>
                            {a.sigla} — {a.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <label
                    className="checkbox-linha"
                    style={{ marginTop: 12, padding: "8px 10px", background: "var(--bg-surface)", borderRadius: 6 }}
                  >
                    <input
                      type="checkbox"
                      checked={form.proficienteArma}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, proficienteArma: e.target.checked }))
                      }
                    />
                    <span>
                      <strong>Proficiente</strong> nesta arma{" "}
                      <span style={{ color: "var(--text-sec)", fontSize: "0.8rem" }}>
                        (soma bônus de proficiência ao ataque)
                      </span>
                    </span>
                  </label>

                  <h3 className="modal-secao"><i className="fas fa-tags" /> Propriedades</h3>
                  <div className="propriedades-pills">
                    {PROPRIEDADES_ARMA.map((p) => {
                      const ativo = form.propriedades.includes(p.slug);
                      return (
                        <button
                          type="button"
                          key={p.slug}
                          className={`propriedade-pill ${ativo ? "ativo" : ""}`}
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              propriedades: ativo
                                ? f.propriedades.filter((s) => s !== p.slug)
                                : [...f.propriedades, p.slug],
                            }))
                          }
                        >
                          <i className={`fas ${p.icone}`} />
                          <span>{p.nome}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {form.tipo === "armadura" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                    <div>
                      <label>Bônus de CA</label>
                      <input
                        type="number"
                        value={form.ca}
                        onChange={(e) => set("ca", e.target.value)}
                        placeholder="2"
                      />
                    </div>
                    <div>
                      <label>Penalidade DES</label>
                      <input
                        type="number"
                        value={form.penalidadeDes}
                        onChange={(e) => set("penalidadeDes", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <p className="modal-hint">
                    <i className="fas fa-lightbulb" /> Quando equipada, o bônus de CA é somado automaticamente na sua CR.
                    A penalidade DES (geralmente negativa) também entra no cálculo.
                  </p>
                </>
              )}

              <label>Tags (separadas por vírgula)</label>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="Ex: Cortante, Duas Mãos, Raro"
              />

              <label>Descrição / Efeitos</label>
              <textarea
                value={form.descricao}
                onChange={(e) => set("descricao", e.target.value)}
                placeholder="Descrição do item..."
              />

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={fechar}
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

// ─── Sub-componentes ────────────────────────────────────────

type CardCallbacks = {
  toggleFavorito: (i: Item) => void;
  toggleEquipar: (i: Item) => void;
  abrirEdit: (i: Item) => void;
  apagar: (id: string) => void;
};

type Ataque = {
  atributo: Atributo;
  bonus: number;
  fontesHab?: string[];
  exausto?: boolean;
} | null;

function SecaoItens({
  titulo,
  icone,
  itens,
  visivel,
  callbacks,
  calcAtaque,
}: {
  titulo: string;
  icone: string;
  itens: Item[];
  visivel: boolean;
  callbacks: CardCallbacks;
  calcAtaque: (item: Item) => Ataque;
}) {
  if (!visivel || itens.length === 0) return null;
  return (
    <section>
      <h3 style={{ marginTop: 30, marginBottom: 20, color: "var(--text-main)" }}>
        <i className={`fas ${icone}`} /> {titulo}
      </h3>
      <div className="action-grid">
        {itens.map((item) => (
          <CardItem
            key={item.id}
            item={item}
            ataque={calcAtaque(item)}
            onToggleFavorito={() => callbacks.toggleFavorito(item)}
            onToggleEquipar={() => callbacks.toggleEquipar(item)}
            onEdit={() => callbacks.abrirEdit(item)}
            onDelete={() => callbacks.apagar(item.id)}
          />
        ))}
      </div>
    </section>
  );
}

function CardItem({
  item,
  ataque,
  onToggleFavorito,
  onToggleEquipar,
  onEdit,
  onDelete,
}: {
  item: Item;
  ataque: Ataque;
  onToggleFavorito: () => void;
  onToggleEquipar: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const equipavel = item.tipo === "arma" || item.tipo === "armadura";
  return (
    <div
      className={`action-card type-comum ${item.equipado ? "item-equipado" : ""} ${item.favorito ? "item-favorito" : ""}`}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div className="card-title">
          <button
            type="button"
            className={`btn-favorito ${item.favorito ? "ativo" : ""}`}
            onClick={onToggleFavorito}
            title={item.favorito ? "Desfavoritar" : "Favoritar"}
          >
            <i className="fas fa-star" />
          </button>
          {item.nome}{" "}
          {item.equipado && (
            <i className="fas fa-check-circle" style={{ color: "var(--primary)", marginLeft: 5 }} />
          )}
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-sec)", fontWeight: "bold", whiteSpace: "nowrap" }}>
          {item.peso} PC
        </div>
      </div>

      {item.tipo === "arma" && (item.dano || ataque) && (
        <div style={{ fontSize: "0.85rem", color: "var(--color-power)", fontWeight: "bold", marginTop: 8 }}>
          <i className="fas fa-khanda" /> {item.dano}
          {item.modificador
            ? item.modificador > 0
              ? ` +${item.modificador}`
              : ` ${item.modificador}`
            : ""}
          {ataque && (
            <span
              style={{ marginLeft: 8, fontWeight: "normal", color: "var(--text-sec)" }}
              title={
                [
                  ataque.fontesHab?.length ? `Inclui bônus de ${ataque.fontesHab.join(", ")}` : null,
                  ataque.exausto ? "Reduzido por exaustão" : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            >
              Ataque: <strong style={{ color: ataque.exausto ? "#e8c24a" : "var(--color-power)" }}>{formatarMod(ataque.bonus)}</strong>{" "}
              <span style={{ fontSize: "0.75rem" }}>({SIGLA_ATRIBUTO[ataque.atributo]})</span>
              {ataque.fontesHab?.length ? <i className="fas fa-link prof-fonte" /> : null}
              {ataque.exausto && <MarcaExausto titulo="Reduzido por exaustão" />}
            </span>
          )}
        </div>
      )}
      {item.tipo === "arma" && item.alcanceMetros && (
        <div style={{ fontSize: "0.78rem", color: "var(--text-sec)", marginTop: 4 }}>
          <i className="fas fa-ruler-horizontal" /> {item.alcanceMetros}
        </div>
      )}
      {item.tipo === "armadura" && (item.ca > 0 || item.penalidadeDes !== 0) && (
        <div style={{ fontSize: "0.85rem", color: "#3498db", fontWeight: "bold", marginTop: 8 }}>
          {item.ca > 0 && (
            <span><i className="fas fa-shield-alt" /> +{item.ca} CA</span>
          )}
          {item.penalidadeDes !== 0 && (
            <span style={{ marginLeft: 8 }}>
              {item.penalidadeDes > 0 ? `+${item.penalidadeDes}` : item.penalidadeDes} DES
            </span>
          )}
          {item.equipado && (
            <span style={{ marginLeft: 8, fontSize: "0.75rem", color: "var(--text-sec)", fontWeight: "normal" }}>
              · ativa na CR
            </span>
          )}
        </div>
      )}

      {item.descricao && <div className="card-desc" style={{ marginTop: 8 }}>{item.descricao}</div>}

      {item.tags && (
        <div className="card-tags">
          {item.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t, i) => (
              <span key={i} className="tag tag-damage">
                {t}
              </span>
            ))}
        </div>
      )}

      <div className="item-card-actions">
        {equipavel && (
          <button
            type="button"
            className={`btn-rect outline ${item.equipado ? "active" : ""}`}
            style={{ fontSize: "0.8rem", padding: "5px 10px" }}
            onClick={onToggleEquipar}
          >
            {item.equipado ? "Desequipar" : "Equipar"}
          </button>
        )}
        <button type="button" className="btn-edit-item" onClick={onEdit} title="Editar">
          <i className="fas fa-edit" />
        </button>
        <button
          type="button"
          className="btn-edit-item"
          onClick={onDelete}
          title="Apagar"
          style={{ color: "#ff6b6b" }}
        >
          <i className="fas fa-trash" />
        </button>
      </div>
    </div>
  );
}
