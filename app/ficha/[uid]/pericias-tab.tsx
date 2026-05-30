"use client";

import { useOptimistic, useState, useTransition } from "react";
import Swal from "sweetalert2";
import {
  ATRIBUTOS,
  PERICIAS,
  bonusPericia,
  bonusSalvaguarda,
  formatarMod,
  lerProficiencias,
  modificador,
  penalidadeD20Exaustao,
  type Atributo,
  type EfeitosAgregados,
  type PericiaSlug,
  type Proficiencias,
} from "@/lib/op-rpg";
import {
  setPericiaOutros,
  setSalvaguardaOutros,
  togglePericia,
  togglePericiaDobrada,
  toggleSalvaguarda,
} from "./actions";
import { empilharD20 } from "@/lib/empilhar-rolagem";

type Props = {
  personagemId: string;
  nivel: number;
  exaustao: number;
  atributos: Record<Atributo, number>;
  proficienciasRaw: unknown;
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
  exaustao,
  atributos,
  proficienciasRaw,
  efeitosAgregados,
}: Props) {
  // Penalidade de exaustão (−2 × nível) some em todo teste de d20 — perícia e
  // salvaguarda. Reflete já no número exibido (amarelo) e no que vai pro Rolador.
  const penD20 = penalidadeD20Exaustao(exaustao);
  const inicial = lerProficiencias(proficienciasRaw);
  const [prof, aplicarPatch] = useOptimistic(inicial, aplicar);
  const [, startTransition] = useTransition();

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
            const bonus =
              bonusSalvaguarda({
                valorAtributo: atributos[a.slug],
                nivel,
                proficiente,
                outros: outrosTotal,
              }) - penD20;
            const tituloFontes = [
              profPorHab && `Proficiência: ${profPorHab.fontes.join(", ")}`,
              bonusHab && `${formatarMod(bonusHab.valor)} de ${bonusHab.fontes.join(", ")}`,
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
                  className={`prof-bonus prof-rolar ${penD20 > 0 ? "valor-exausto" : ""}`}
                  title={`Empilhar Salv. ${a.nome} no Rolador${penD20 ? ` · −${penD20} de exaustão` : ""}`}
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
                  const bonus =
                    bonusPericia({
                      pericia: p,
                      valorAtributo: atributos[a.slug],
                      nivel,
                      proficiente,
                      dobrado,
                      outros: outrosTotal,
                    }) - penD20;
                  const tituloFontes = [
                    profPorHab && `Proficiência: ${profPorHab.fontes.join(", ")}`,
                    bonusHab &&
                      `${formatarMod(bonusHab.valor)} de ${bonusHab.fontes.join(", ")}`,
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
                        className={`prof-bonus prof-rolar ${penD20 > 0 ? "valor-exausto" : ""}`}
                        title={`Empilhar ${p.nome} no Rolador${penD20 ? ` · −${penD20} de exaustão` : ""}`}
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
