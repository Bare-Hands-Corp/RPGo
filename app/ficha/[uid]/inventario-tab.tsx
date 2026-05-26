"use client";

import { useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { EditableStat } from "./editable-stat";
import { atualizarItem, criarItem, deletarItem } from "./actions";

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
};

type Props = {
  personagemId: string;
  cargaMaxima: number;
  itens: Item[];
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
};

export function InventarioTab({ personagemId, cargaMaxima, itens }: Props) {
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

    const payload = {
      nome: form.nome,
      peso: Number(form.peso) || 0,
      tipo: form.tipo,
      tags: form.tags,
      descricao: form.descricao,
      dano: form.tipo === "arma" ? form.dano : "",
      modificador: form.tipo === "arma" ? Number(form.modificador) || 0 : 0,
      ca: form.tipo === "armadura" ? Number(form.ca) || 0 : 0,
      penalidadeDes: form.tipo === "armadura" ? Number(form.penalidadeDes) || 0 : 0,
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

  const pesoTotal = itensOtimistas.reduce((acc, i) => acc + (Number(i.peso) || 0), 0);
  const maxPeso = cargaMaxima || 20;
  const pesoPct = Math.min(100, (pesoTotal / maxPeso) * 100);

  let corBarra = "var(--color-react)";
  let msgSobrecarga: string | null = null;
  if (pesoPct >= 100) {
    corBarra = "#ff4444";
    msgSobrecarga = "⚠ LIMITE ATINGIDO!";
  } else if (pesoPct >= 90) {
    corBarra = "#ff4444";
    msgSobrecarga = "⚠ SOBRECARGA";
  } else if (pesoPct >= 75) {
    corBarra = "orangered";
    msgSobrecarga = "⚠ SOBRECARGA";
  } else if (pesoPct > 50) {
    corBarra = "var(--color-power)";
    msgSobrecarga = "⚠ SOBRECARGA";
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
          <span>⚖️ Carga</span>
          <div className="stat-values">
            <span>{pesoTotal.toFixed(1)}</span> /{" "}
            <EditableStat personagemId={personagemId} campo="cargaMaxima" valor={cargaMaxima} />
            {" "}PC
          </div>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pesoPct}%`, background: corBarra }} />
        </div>
        {msgSobrecarga && <div className="msg-sobrecarga">{msgSobrecarga}</div>}
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
      />
      <SecaoItens
        titulo="Armaria"
        icone="fa-shield-alt"
        itens={armaria}
        visivel={mostrarEquipados || categoria === "armaria"}
        callbacks={{ toggleFavorito, toggleEquipar, abrirEdit, apagar }}
      />
      <SecaoItens
        titulo="Mochila"
        icone="fa-shopping-bag"
        itens={mochila}
        visivel={mostrarEquipados || categoria === "mochila"}
        callbacks={{ toggleFavorito, toggleEquipar, abrirEdit, apagar }}
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
            <form onSubmit={salvar}>
              <label>Nome do Item</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => set("nome", e.target.value)}
                placeholder="Ex: Espada Longa"
                autoFocus
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <div>
                  <label>Peso (PC)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.peso}
                    onChange={(e) => set("peso", e.target.value)}
                  />
                </div>
                <div>
                  <label>Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => set("tipo", e.target.value)}
                  >
                    <option value="comum">Item Comum</option>
                    <option value="arma">Arma</option>
                    <option value="armadura">Armadura</option>
                  </select>
                </div>
              </div>

              {form.tipo === "arma" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <div>
                    <label>Dano (ex: 1d8)</label>
                    <input
                      type="text"
                      value={form.dano}
                      onChange={(e) => set("dano", e.target.value)}
                      placeholder="1d8"
                    />
                  </div>
                  <div>
                    <label>Modificador (ex: +2)</label>
                    <input
                      type="number"
                      value={form.modificador}
                      onChange={(e) => set("modificador", e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              {form.tipo === "armadura" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                  <div>
                    <label>Classe de Armadura (CA)</label>
                    <input
                      type="number"
                      value={form.ca}
                      onChange={(e) => set("ca", e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label>Penalidade DES</label>
                    <input
                      type="number"
                      value={form.penalidadeDes}
                      onChange={(e) => set("penalidadeDes", e.target.value)}
                      placeholder="-1"
                    />
                  </div>
                </div>
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

function SecaoItens({
  titulo,
  icone,
  itens,
  visivel,
  callbacks,
}: {
  titulo: string;
  icone: string;
  itens: Item[];
  visivel: boolean;
  callbacks: CardCallbacks;
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
  onToggleFavorito,
  onToggleEquipar,
  onEdit,
  onDelete,
}: {
  item: Item;
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

      {item.tipo === "arma" && item.dano && (
        <div style={{ fontSize: "0.85rem", color: "var(--color-power)", fontWeight: "bold", marginTop: 8 }}>
          ⚔️ {item.dano} {item.modificador ? (item.modificador > 0 ? `+${item.modificador}` : item.modificador) : ""}
        </div>
      )}
      {item.tipo === "armadura" && item.ca > 0 && (
        <div style={{ fontSize: "0.85rem", color: "#3498db", fontWeight: "bold", marginTop: 8 }}>
          🛡️ CA {item.ca > 0 ? "+" : ""}{item.ca}{" "}
          {item.penalidadeDes ? `(DES ${item.penalidadeDes})` : ""}
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
