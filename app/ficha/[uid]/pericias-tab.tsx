"use client";

import { useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import {
  ATRIBUTOS,
  PERICIAS,
  atributoDeCalculo,
  bonusPericia,
  bonusSalvaguarda,
  formatarMod,
  lerProficiencias,
  modificador,
  penalidadeD20Exaustao,
  slugPericiaCustom,
  type Atributo,
  type EfeitosAgregados,
  type PericiaSlug,
  type Proficiencias,
} from "@/lib/op-rpg";
import {
  criarPericiaCustom,
  deletarPericiaCustom,
  patchPericiaCustom,
  setPericiaOutros,
  setSalvaguardaOutros,
  togglePericia,
  togglePericiaDobrada,
  toggleSalvaguarda,
} from "./actions";
import { empilharD20 } from "@/lib/empilhar-rolagem";
import { useExaustaoOtimista } from "./use-exaustao-otimista";
import { MarcaExausto } from "./marca-exausto";

export type PericiaCustomRow = {
  id: string;
  nome: string;
  slug: string;
  atributo: string;
  origem: string;
  proficiente: boolean;
  dobrada: boolean;
  bonusOutros: number;
  ordem: number;
};

type Props = {
  personagemId: string;
  nivel: number;
  exaustao: number;
  penalidadeDesArmadura: number;
  atributos: Record<Atributo, number>;
  proficienciasRaw: unknown;
  periciasCustom: PericiaCustomRow[];
  efeitosAgregados: EfeitosAgregados;
};

type Patch =
  | { kind: "pericia"; slug: PericiaSlug; ligado: boolean }
  | { kind: "pericia-dobrada"; slug: PericiaSlug; ligado: boolean }
  | { kind: "pericia-outros"; slug: PericiaSlug; valor: number }
  | { kind: "salvaguarda"; atributo: Atributo; ligado: boolean }
  | { kind: "salvaguarda-outros"; atributo: Atributo; valor: number };

function aplicar(state: Proficiencias, p: Patch): Proficiencias {
  if (p.kind === "pericia") {
    const pericias = p.ligado
      ? Array.from(new Set([...state.pericias, p.slug]))
      : state.pericias.filter((s) => s !== p.slug);
    // Desligar proficiência também tira o "dobrado".
    const periciasDobradas = p.ligado
      ? state.periciasDobradas
      : state.periciasDobradas.filter((s) => s !== p.slug);
    return { ...state, pericias, periciasDobradas };
  }
  if (p.kind === "pericia-dobrada") {
    const periciasDobradas = p.ligado
      ? Array.from(new Set([...state.periciasDobradas, p.slug]))
      : state.periciasDobradas.filter((s) => s !== p.slug);
    return { ...state, periciasDobradas };
  }
  if (p.kind === "pericia-outros") {
    const outrosPericias = { ...state.outrosPericias };
    if (p.valor === 0) delete outrosPericias[p.slug];
    else outrosPericias[p.slug] = p.valor;
    return { ...state, outrosPericias };
  }
  if (p.kind === "salvaguarda-outros") {
    const outrosSalvaguardas = { ...state.outrosSalvaguardas };
    if (p.valor === 0) delete outrosSalvaguardas[p.atributo];
    else outrosSalvaguardas[p.atributo] = p.valor;
    return { ...state, outrosSalvaguardas };
  }
  const salvaguardas = p.ligado
    ? Array.from(new Set([...state.salvaguardas, p.atributo]))
    : state.salvaguardas.filter((a) => a !== p.atributo);
  return { ...state, salvaguardas };
}

type PatchCustom =
  | { kind: "create"; pericia: PericiaCustomRow }
  | { kind: "update"; id: string; patch: Partial<PericiaCustomRow> }
  | { kind: "delete"; id: string };

function aplicarCustom(
  state: PericiaCustomRow[],
  p: PatchCustom,
): PericiaCustomRow[] {
  if (p.kind === "create") return [...state, p.pericia];
  if (p.kind === "delete") return state.filter((c) => c.id !== p.id);
  return state.map((c) => (c.id === p.id ? { ...c, ...p.patch } : c));
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

export function PericiasTab({
  personagemId,
  nivel,
  exaustao: exaustaoServer,
  penalidadeDesArmadura,
  atributos,
  proficienciasRaw,
  periciasCustom,
  efeitosAgregados,
}: Props) {
  // Penalidade de exaustão (−2 × nível) some em todo teste de d20 — perícia e
  // salvaguarda. Reflete já no número exibido (amarelo) e no que vai pro Rolador.
  // Otimista: atualiza na hora quando o ExaustaoControle muda o nível.
  const exaustao = useExaustaoOtimista(exaustaoServer);
  const penD20 = penalidadeD20Exaustao(exaustao);

  // DES reduzida pela armadura (só pra testes/CR): reduzir a pontuação em 2× a
  // penalidade do modificador reduz o modificador em exatamente a penalidade.
  // Perícias/salvaguardas que substituem o atributo leem outro valor e escapam.
  const atributosParaTeste: Record<Atributo, number> = {
    ...atributos,
    destreza: atributos.destreza + 2 * penalidadeDesArmadura,
  };
  const subs = efeitosAgregados.substituicoesAtributo;
  const desReduz = penalidadeDesArmadura < 0;
  const inicial = lerProficiencias(proficienciasRaw);
  const [prof, aplicarPatch] = useOptimistic(inicial, aplicar);
  const [custom, aplicarCustomPatch] = useOptimistic(periciasCustom, aplicarCustom);
  const [, startTransition] = useTransition();

  // Modal de criar/editar perícia custom. `editAlvo` null = criando.
  const [modalAberto, setModalAberto] = useState(false);
  const [editAlvo, setEditAlvo] = useState<PericiaCustomRow | null>(null);

  function setPericia(slug: PericiaSlug, ligado: boolean) {
    startTransition(async () => {
      aplicarPatch({ kind: "pericia", slug, ligado });
      try {
        await togglePericia(personagemId, slug, ligado);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function setOutros(slug: PericiaSlug, valor: number) {
    startTransition(async () => {
      aplicarPatch({ kind: "pericia-outros", slug, valor });
      try {
        await setPericiaOutros(personagemId, slug, valor);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function setDobrada(slug: PericiaSlug, ligado: boolean) {
    startTransition(async () => {
      aplicarPatch({ kind: "pericia-dobrada", slug, ligado });
      try {
        await togglePericiaDobrada(personagemId, slug, ligado);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function setSalvaguarda(atributo: Atributo, ligado: boolean) {
    startTransition(async () => {
      aplicarPatch({ kind: "salvaguarda", atributo, ligado });
      try {
        await toggleSalvaguarda(personagemId, atributo, ligado);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function setSalvOutros(atributo: Atributo, valor: number) {
    startTransition(async () => {
      aplicarPatch({ kind: "salvaguarda-outros", atributo, valor });
      try {
        await setSalvaguardaOutros(personagemId, atributo, valor);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  // ─── Perícias customizadas ───────────────────────────────
  function setProfCustom(c: PericiaCustomRow, proficiente: boolean) {
    startTransition(async () => {
      // Tirar a proficiência também tira o dobro (espelha o servidor).
      aplicarCustomPatch({
        kind: "update",
        id: c.id,
        patch: { proficiente, dobrada: proficiente ? c.dobrada : false },
      });
      try {
        await patchPericiaCustom(personagemId, c.id, { proficiente });
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function setDobroCustom(c: PericiaCustomRow, dobrada: boolean) {
    startTransition(async () => {
      aplicarCustomPatch({ kind: "update", id: c.id, patch: { dobrada } });
      try {
        await patchPericiaCustom(personagemId, c.id, { dobrada });
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function setOutrosCustom(c: PericiaCustomRow, valor: number) {
    startTransition(async () => {
      aplicarCustomPatch({ kind: "update", id: c.id, patch: { bonusOutros: valor } });
      try {
        await patchPericiaCustom(personagemId, c.id, { bonusOutros: valor });
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  async function apagarCustom(c: PericiaCustomRow) {
    const r = await Swal.fire({
      title: "Apagar perícia",
      text: `Remover "${c.nome}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Apagar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!r.isConfirmed) return;
    startTransition(async () => {
      aplicarCustomPatch({ kind: "delete", id: c.id });
      try {
        await deletarPericiaCustom(personagemId, c.id);
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function salvarCustom(dados: { nome: string; atributo: Atributo; origem: string }) {
    const alvo = editAlvo;
    setModalAberto(false);
    setEditAlvo(null);
    startTransition(async () => {
      if (alvo) {
        aplicarCustomPatch({ kind: "update", id: alvo.id, patch: dados });
        try {
          await patchPericiaCustom(personagemId, alvo.id, dados);
        } catch (err) {
          mostrarErro(err);
        }
      } else {
        const slugsUsados = new Set(custom.map((c) => c.slug));
        const nova: PericiaCustomRow = {
          id: "temp-" + Math.random().toString(36).slice(2),
          slug: slugPericiaCustom(dados.nome, slugsUsados),
          proficiente: false,
          dobrada: false,
          bonusOutros: 0,
          ordem: custom.length,
          ...dados,
        };
        aplicarCustomPatch({ kind: "create", pericia: nova });
        try {
          await criarPericiaCustom(personagemId, dados);
        } catch (err) {
          mostrarErro(err);
        }
      }
    });
  }

  return (
    <div>
      <h1>Perícias & Salvaguardas</h1>
      <p style={{ color: "var(--text-sec)", fontSize: "0.9rem", marginBottom: 20 }}>
        Marque as proficiências. O modificador final já inclui o bônus de proficiência.
      </p>

      <section>
        <div className="section-header">
          <i className="fas fa-shield-alt" style={{ color: "var(--color-react)" }} />
          <h3>Salvaguardas</h3>
        </div>
        <div className="prof-grid">
          {ATRIBUTOS.map((a) => {
            const profPorHab = efeitosAgregados.proficienciasSalvaguarda[a.slug];
            const proficienteManual = prof.salvaguardas.includes(a.slug);
            const proficiente = proficienteManual || !!profPorHab;
            const outros = prof.outrosSalvaguardas[a.slug] ?? 0;
            const bonusHab = efeitosAgregados.bonusSalvaguarda[a.slug];
            const outrosTotal = outros + (bonusHab?.valor ?? 0);
            const sub = atributoDeCalculo(`salv-${a.slug}`, a.slug, subs);
            const desReduzEste = sub.atributo === "destreza" && desReduz;
            const bonus =
              bonusSalvaguarda({
                valorAtributo: atributosParaTeste[sub.atributo],
                nivel,
                proficiente,
                outros: outrosTotal,
              }) - penD20;
            const exausto = penD20 > 0 || desReduzEste;
            const tituloFontes = [
              sub.substituido && `Usa ${sub.atributo.toUpperCase().slice(0, 3)} por ${sub.fontes.join(", ")}`,
              profPorHab && `Proficiência: ${profPorHab.fontes.join(", ")}`,
              bonusHab && `${formatarMod(bonusHab.valor)} de ${bonusHab.fontes.join(", ")}`,
              desReduzEste && `−${Math.abs(penalidadeDesArmadura)} de DES (armadura)`,
              penD20 > 0 && `−${penD20} de exaustão`,
            ]
              .filter(Boolean)
              .join("\n");
            return (
              <label
                key={a.slug}
                className={`prof-row ${proficiente ? "prof-on" : ""}`}
                title={tituloFontes || undefined}
              >
                <input
                  type="checkbox"
                  checked={proficienteManual}
                  disabled={!!profPorHab}
                  onChange={(e) => setSalvaguarda(a.slug, e.target.checked)}
                />
                <button
                  type="button"
                  className={`prof-bonus prof-rolar ${exausto ? "valor-exausto" : ""}`}
                  title={`Empilhar Salv. ${a.nome} no Rolador`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    empilharD20(bonus, `Salv. ${a.nome}`, {
                      tipo: "salvaguarda",
                      atributo: a.slug,
                    });
                  }}
                >
                  {formatarMod(bonus)}
                  {penD20 > 0 && <MarcaExausto titulo={`−${penD20} de exaustão`} />}
                </button>
                <span className="prof-nome">
                  {a.nome}
                  {(profPorHab || bonusHab) && (
                    <i className="fas fa-link prof-fonte" title={tituloFontes} />
                  )}
                </span>
                <OutrosInput
                  valor={outros}
                  onSalvar={(v) => setSalvOutros(a.slug, v)}
                />
              </label>
            );
          })}
        </div>
      </section>

      {ATRIBUTOS.filter((a) => PERICIAS.some((p) => p.atributo === a.slug)).map(
        (a) => {
          const lista = PERICIAS.filter((p) => p.atributo === a.slug);
          return (
            <section key={a.slug}>
              <div className="section-header">
                <i className="fas fa-dice-d20" style={{ color: "var(--primary)" }} />
                <h3>
                  {a.nome}{" "}
                  <span style={{ fontSize: "0.85rem", color: "var(--text-sec)" }}>
                    ({formatarMod(modificador(atributos[a.slug]))})
                  </span>
                </h3>
              </div>
              <div className="prof-grid">
                {lista.map((p) => {
                  const profPorHab = efeitosAgregados.proficienciasPericia[p.slug];
                  const proficienteManual = prof.pericias.includes(p.slug);
                  const proficiente = proficienteManual || !!profPorHab;
                  const dobrado = prof.periciasDobradas.includes(p.slug);
                  const outros = prof.outrosPericias[p.slug] ?? 0;
                  const bonusHab = efeitosAgregados.bonusPericia[p.slug];
                  const outrosTotal = outros + (bonusHab?.valor ?? 0);
                  const sub = atributoDeCalculo(p.slug, a.slug, subs);
                  const desReduzEste = sub.atributo === "destreza" && desReduz;
                  const exausto = penD20 > 0 || desReduzEste;
                  const bonus =
                    bonusPericia({
                      valorAtributo: atributosParaTeste[sub.atributo],
                      nivel,
                      proficiente,
                      dobrado,
                      outros: outrosTotal,
                    }) - penD20;
                  const tituloFontes = [
                    sub.substituido &&
                      `Usa ${sub.atributo.toUpperCase().slice(0, 3)} por ${sub.fontes.join(", ")}`,
                    profPorHab && `Proficiência: ${profPorHab.fontes.join(", ")}`,
                    bonusHab &&
                      `${formatarMod(bonusHab.valor)} de ${bonusHab.fontes.join(", ")}`,
                    desReduzEste && `−${Math.abs(penalidadeDesArmadura)} de DES (armadura)`,
                    penD20 > 0 && `−${penD20} de exaustão`,
                  ]
                    .filter(Boolean)
                    .join("\n");
                  return (
                    <label
                      key={p.slug}
                      className={`prof-row ${proficiente ? "prof-on" : ""}`}
                      title={tituloFontes || undefined}
                    >
                      <input
                        type="checkbox"
                        checked={proficienteManual}
                        disabled={!!profPorHab}
                        onChange={(e) => setPericia(p.slug, e.target.checked)}
                      />
                      <button
                        type="button"
                        className={`prof-bonus prof-rolar ${exausto ? "valor-exausto" : ""}`}
                        title={`Empilhar ${p.nome} no Rolador`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          empilharD20(bonus, p.nome, {
                            tipo: "pericia",
                            pericia: p.slug,
                          });
                        }}
                      >
                        {formatarMod(bonus)}
                        {penD20 > 0 && <MarcaExausto titulo={`−${penD20} de exaustão`} />}
                      </button>
                      <span className="prof-nome">
                        {p.nome}
                        {(profPorHab || bonusHab) && (
                          <i className="fas fa-link prof-fonte" title={tituloFontes} />
                        )}
                      </span>
                      {proficiente && (
                        <button
                          type="button"
                          className={`prof-dobro ${dobrado ? "ativo" : ""}`}
                          onClick={(e) => {
                            e.preventDefault();
                            setDobrada(p.slug, !dobrado);
                          }}
                        >
                          2×
                        </button>
                      )}
                      <OutrosInput
                        valor={outros}
                        onSalvar={(v) => setOutros(p.slug, v)}
                      />
                    </label>
                  );
                })}
              </div>
            </section>
          );
        },
      )}

      <section>
        <div className="section-header">
          <i className="fas fa-pen-ruler" style={{ color: "var(--color-power)" }} />
          <h3>Perícias Customizadas</h3>
          <button
            type="button"
            className="btn-rect outline pericia-custom-add"
            onClick={() => {
              setEditAlvo(null);
              setModalAberto(true);
            }}
          >
            + Nova perícia
          </button>
        </div>
        {custom.length === 0 ? (
          <p style={{ color: "var(--text-sec)", fontSize: "0.85rem" }}>
            Perícias fora do set padrão — vindas de Profissão, treinamento ou homebrew.
          </p>
        ) : (
          <div className="prof-grid prof-grid-custom">
            {custom.map((c) => {
              const at = (c.atributo as Atributo) ?? "forca";
              const profPorHab = efeitosAgregados.proficienciasPericia[c.slug];
              const proficiente = c.proficiente || !!profPorHab;
              const bonusHab = efeitosAgregados.bonusPericia[c.slug];
              const outrosTotal = c.bonusOutros + (bonusHab?.valor ?? 0);
              const sub = atributoDeCalculo(c.slug, at, subs);
              const desReduzEste = sub.atributo === "destreza" && desReduz;
              const exausto = penD20 > 0 || desReduzEste;
              const bonus =
                bonusPericia({
                  valorAtributo: atributosParaTeste[sub.atributo],
                  nivel,
                  proficiente,
                  dobrado: c.dobrada,
                  outros: outrosTotal,
                }) - penD20;
              const tituloFontes = [
                sub.substituido &&
                  `Usa ${sub.atributo.toUpperCase().slice(0, 3)} por ${sub.fontes.join(", ")}`,
                profPorHab && `Proficiência: ${profPorHab.fontes.join(", ")}`,
                bonusHab && `${formatarMod(bonusHab.valor)} de ${bonusHab.fontes.join(", ")}`,
                desReduzEste && `−${Math.abs(penalidadeDesArmadura)} de DES (armadura)`,
                penD20 > 0 && `−${penD20} de exaustão`,
              ]
                .filter(Boolean)
                .join("\n");
              return (
                <div
                  key={c.id}
                  className={`prof-row ${proficiente ? "prof-on" : ""}`}
                  title={tituloFontes || undefined}
                >
                  <input
                    type="checkbox"
                    checked={c.proficiente}
                    disabled={!!profPorHab}
                    onChange={(e) => setProfCustom(c, e.target.checked)}
                  />
                  <button
                    type="button"
                    className={`prof-bonus prof-rolar ${exausto ? "valor-exausto" : ""}`}
                    title={`Empilhar ${c.nome} no Rolador`}
                    onClick={() =>
                      empilharD20(bonus, c.nome, { tipo: "pericia", pericia: c.slug })
                    }
                  >
                    {formatarMod(bonus)}
                    {penD20 > 0 && <MarcaExausto titulo={`−${penD20} de exaustão`} />}
                  </button>
                  <span className="prof-nome">
                    {c.nome}{" "}
                    <span className="pericia-custom-meta">
                      ({at.toUpperCase().slice(0, 3)}
                      {c.origem ? ` · ${c.origem}` : ""})
                    </span>
                    {(profPorHab || bonusHab) && (
                      <i className="fas fa-link prof-fonte" title={tituloFontes} />
                    )}
                  </span>
                  {proficiente && (
                    <button
                      type="button"
                      className={`prof-dobro ${c.dobrada ? "ativo" : ""}`}
                      onClick={() => setDobroCustom(c, !c.dobrada)}
                    >
                      2×
                    </button>
                  )}
                  <OutrosInput
                    valor={c.bonusOutros}
                    onSalvar={(v) => setOutrosCustom(c, v)}
                  />
                  <button
                    type="button"
                    className="pericia-custom-acao"
                    title="Editar"
                    onClick={() => {
                      setEditAlvo(c);
                      setModalAberto(true);
                    }}
                  >
                    <i className="fas fa-pen" />
                  </button>
                  <button
                    type="button"
                    className="pericia-custom-acao perigo"
                    title="Apagar"
                    onClick={() => apagarCustom(c)}
                  >
                    <i className="fas fa-trash" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {modalAberto && (
        <ModalPericiaCustom
          inicial={editAlvo}
          onSalvar={salvarCustom}
          onCancelar={() => {
            setModalAberto(false);
            setEditAlvo(null);
          }}
        />
      )}
    </div>
  );
}

// Input inline pro bônus "outros" da perícia. Click → edita; Enter/blur → salva.
// Aceita formato delta (+1, -2) ou absoluto (3, -1, 0).
function OutrosInput({
  valor,
  onSalvar,
}: {
  valor: number;
  onSalvar: (n: number) => void;
}) {
  const [editando, setEditando] = useState(false);

  function commit(raw: string) {
    setEditando(false);
    const trim = raw.trim();
    if (!trim) return;
    let novo: number;
    if (trim.startsWith("+") || trim.startsWith("-")) {
      const n = Number(trim);
      if (Number.isNaN(n)) return;
      // Se for delta puro de 1 char (ex: "+"), ignora.
      novo = trim.length === 1 ? valor : valor + n;
    } else {
      novo = Number(trim);
      if (Number.isNaN(novo)) return;
    }
    novo = Math.trunc(novo);
    if (novo !== valor) onSalvar(novo);
  }

  if (editando) {
    return (
      <input
        type="text"
        autoFocus
        defaultValue=""
        placeholder={formatarMod(valor)}
        className="prof-outros-input"
        onClick={(e) => e.preventDefault()}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") setEditando(false);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className={`prof-outros ${valor !== 0 ? "ativo" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        setEditando(true);
      }}
    >
      {formatarMod(valor)}
    </button>
  );
}

// Modal de criar/editar perícia custom. Otimismo fica no pai (PericiasTab);
// aqui é só o formulário. `inicial` null = criando.
function ModalPericiaCustom({
  inicial,
  onSalvar,
  onCancelar,
}: {
  inicial: PericiaCustomRow | null;
  onSalvar: (dados: { nome: string; atributo: Atributo; origem: string }) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [atributo, setAtributo] = useState<Atributo>(
    (inicial?.atributo as Atributo) ?? "vontade",
  );
  const [origem, setOrigem] = useState(inicial?.origem ?? "");

  function submeter(e: React.FormEvent) {
    e.preventDefault();
    const limpo = nome.trim();
    if (!limpo) return;
    onSalvar({ nome: limpo, atributo, origem: origem.trim() });
  }

  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2>{inicial ? "Editar perícia" : "Nova perícia"}</h2>
        <p style={{ fontSize: "0.8rem", color: "var(--text-sec)", marginBottom: 15 }}>
          Perícias fora do set padrão (Profissão, treinamento, homebrew).
        </p>
        <form onSubmit={submeter}>
          <label>Nome</label>
          <input
            type="text"
            value={nome}
            autoFocus
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex: Pilotagem, Culinária…"
          />

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Atributo</label>
              <select
                value={atributo}
                onChange={(e) => setAtributo(e.target.value as Atributo)}
              >
                {ATRIBUTOS.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label>Origem (opcional)</label>
              <input
                type="text"
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                placeholder="ex: Profissão Capitão"
              />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onCancelar}>
              Cancelar
            </button>
            <button type="submit" className="modal-btn-save">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
