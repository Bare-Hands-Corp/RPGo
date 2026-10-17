"use client";

// Ficha de uma criatura em combate, ao lado da iniciativa. Mostra o estado
// desta cópia (PV, PP, condições, ações do turno) e as ações do statblock com
// um caminho só pra usar: alvo, acerto e dano. A ficha do bestiário é a de
// consulta; esta é a de jogo.

import { useEffect } from "react";
import { EditavelComDelta } from "@/app/bestiario/inputs";
import { ChipCondicao as CondicaoDoTexto, separarCondicoes } from "@/app/bestiario/destacar-condicoes";
import { CATEGORIAS_COMPONENTE } from "@/app/bestiario/types";
import type { CondicaoEfeito, ComponenteCategoria, ComponentePayload } from "@/app/bestiario/types";
import { RecursoBarra } from "@/app/bestiario/recursos-editor";
import {
  CHAVE_LENDARIAS,
  ataquesPorTurno,
  ehAtaqueComum,
  gastosDaAcao,
  margemDeCritico,
  soMultiataque,
  textoEfeitoAcao,
  textoEfeitoExtra,
  textoTecnica,
} from "@/app/bestiario/utils";
import { ACAO_COMBATE, ACAO_DO_BLOCO } from "@/lib/combate";
import { parseFormulaDados, type Dado } from "@/lib/dice";
import { empilharRolagem } from "@/lib/empilhar-rolagem";
import { formatarMod, modificador } from "@/lib/op-rpg";
import type { CriaturaParaCombate, InstanciaCombateSerializada } from "./types";

const D20: Dado = { faces: 20, sinal: 1 };

// Na ordem em que o narrador usa; aspectos por último, só pra ler.
const BLOCOS: ComponenteCategoria[] = ["acao", "acaoBonus", "acaoPoderosa", "reacao", "acaoLendaria", "aspecto"];

const ATRIBUTOS = [
  ["forca", "FOR"],
  ["destreza", "DES"],
  ["constituicao", "CON"],
  ["sabedoria", "SAB"],
  ["presenca", "PRE"],
  ["vontade", "VON"],
] as const;

// Rolagem solta (sem alvo): vai pro Rolador como qualquer outra.
function rolarD20(rotulo: string, bonus: string | number) {
  const f = typeof bonus === "number" ? { dados: [], modificador: bonus } : parseFormulaDados(bonus || "0");
  empilharRolagem({ dados: [D20, ...f.dados], modificador: f.modificador, nomePreset: rotulo });
}

function rolarFormula(rotulo: string, formula: string) {
  const f = parseFormulaDados(formula);
  if (f.dados.length === 0 && f.modificador === 0) return;
  empilharRolagem({ dados: f.dados, modificador: f.modificador, nomePreset: rotulo });
}

function Barra({ tipo, atual, max }: { tipo: "pv" | "pp"; atual: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (atual / max) * 100)) : 0;
  return (
    <span className={`fc-trilho ${tipo}`} aria-hidden>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

type Props = {
  criatura: CriaturaParaCombate;
  instancia: InstanciaCombateSerializada;
  // PV que a tela mostra (o que o narrador acabou de digitar vale antes do servidor).
  pv: number;
  naVez: boolean;
  ocupado: boolean;
  // Bolinhas de ação e condições, com os controles da linha da iniciativa.
  bolinhas: React.ReactNode;
  condicoes: React.ReactNode;
  onPv: (pv: number) => void;
  onPp: (pp: number) => void;
  onDano: () => void;
  // Usa a ação num alvo. `forcar`: o narrador quer usar mesmo sem usos ou PP.
  onUsar: (item: ComponentePayload, forcar: boolean) => void;
  // Usos que restam de uma ação ou quanto resta de um recurso (pelo id).
  onUsos: (componenteId: string, restantes: number) => void;
  onRevelar: (componenteId: string, revelada: boolean) => void;
  onFechar: () => void;
  onAnterior: () => void;
  onProxima: () => void;
};

export function FichaCombate({
  criatura: c,
  instancia,
  pv,
  naVez,
  ocupado,
  bolinhas,
  condicoes,
  onPv,
  onPp,
  onDano,
  onUsar,
  onUsos,
  onRevelar,
  onFechar,
  onAnterior,
  onProxima,
}: Props) {
  const pvMax = instancia.pvMax ?? 0;
  const ppMax = c.pontosPoder;
  const pp = Math.max(0, ppMax - instancia.ppGasto);
  // Ataques comuns que cabem na ação padrão (efeito "Multiataque") e os já feitos.
  const ataques = ataquesPorTurno(c.componentes);
  const ataquesFeitos = instancia.acoesGastas.padrao ?? 0;
  const lendarias = Math.min(c.acoesLendarias, instancia.usosAcoes[CHAVE_LENDARIAS] ?? c.acoesLendarias);

  // Esc fecha; ↑ e ↓ trocam de criatura. Não rouba tecla de campo nem de modal aberto.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector(".modal-overlay")) return;
      if (e.key === "Escape") onFechar();
      else if (e.key === "ArrowUp") {
        e.preventDefault();
        onAnterior();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        onProxima();
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar, onAnterior, onProxima]);

  // Por que a ação não dá pra usar agora; null = dá.
  function motivo(item: ComponentePayload): string | null {
    const usos = item.usos === null ? null : (instancia.usosAcoes[item.id] ?? item.usos);
    if (usos !== null && usos <= 0) return "Sem usos";
    const gastos = gastosDaAcao(item, c.recursos);
    if (gastos.pp > pp) return `Sem PP (precisa de ${gastos.pp})`;
    for (const { recurso, delta } of gastos.recursos) {
      const resta = Math.min(recurso.valorMax, instancia.usosAcoes[recurso.id] ?? recurso.valorMax);
      if (resta + delta < 0) return `Sem ${recurso.nome} (precisa de ${-delta})`;
    }
    if (item.categoria === "acaoLendaria") {
      if (c.acoesLendarias > 0 && lendarias < item.custoLendario) return "Sem ações lendárias nesta rodada";
      if (naVez) return "Ação lendária é no fim do turno de outro";
    }
    const tipo = ACAO_DO_BLOCO[item.categoria];
    const limite = tipo === "padrao" && ehAtaqueComum(item) ? ataques : 1;
    if (tipo && (instancia.acoesGastas[tipo] ?? 0) >= limite) {
      return limite > 1 ? `Já fez os ${limite} ataques do turno` : `${ACAO_COMBATE[tipo].nome} já usada neste turno`;
    }
    if (tipo === "react" && naVez) return "Reação é só fora da vez";
    if (tipo && tipo !== "react" && !naVez) return "Não é a vez dela";
    return null;
  }

  const temFichaCompleta =
    c.caracteristicas.pericias.length > 0 ||
    c.caracteristicas.salvaguardas.length > 0 ||
    c.caracteristicas.percepcaoPassiva !== null ||
    !!c.caracteristicas.sentidosExtras.trim() ||
    c.resistencias.danoResistencia.length > 0 ||
    c.resistencias.danoImunidade.length > 0 ||
    c.resistencias.danoVulneravel.length > 0 ||
    c.resistencias.condicaoImunidade.length > 0 ||
    !!c.anotacoesPrivadas;

  return (
    <aside className={`fc${naVez ? " na-vez" : ""}`} aria-label={`Ficha de ${instancia.nomeExibicao}`}>
      <header className="fc-topo">
        <span className="fc-retrato" aria-hidden>
          {c.imagemUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.imagemUrl} alt="" />
          ) : (
            <i className="fas fa-skull" />
          )}
        </span>
        <div className="fc-identidade">
          <h3>{instancia.nomeExibicao}</h3>
          <span>
            {naVez ? "Na vez" : "Aguardando"} · iniciativa {instancia.iniciativa}
          </span>
        </div>
        <div className="fc-nav">
          <button type="button" className="sessao-icone-btn" onClick={onAnterior} title="Criatura anterior (↑)" aria-label="Criatura anterior">
            <i className="fas fa-chevron-up" />
          </button>
          <button type="button" className="sessao-icone-btn" onClick={onProxima} title="Próxima criatura (↓)" aria-label="Próxima criatura">
            <i className="fas fa-chevron-down" />
          </button>
          <button type="button" className="sessao-icone-btn" onClick={onFechar} title="Fechar (Esc)" aria-label="Fechar a ficha">
            <i className="fas fa-xmark" />
          </button>
        </div>
      </header>

      <div className="fc-vitais">
        <div className="fc-vital">
          <span className="nv-rotulo">PV</span>
          <span className="sessao-vital">
            <EditavelComDelta className="sessao-iniciativa-pv" value={pv} max={pvMax || undefined} onChange={onPv} />
            <span className="sessao-iniciativa-pvmax">/ {pvMax}</span>
          </span>
          <Barra tipo="pv" atual={pv} max={pvMax} />
        </div>
        {ppMax > 0 && (
          <div className="fc-vital">
            <span className="nv-rotulo">PP</span>
            <span className="sessao-vital">
              <EditavelComDelta className="sessao-iniciativa-pv sessao-iniciativa-pp" value={pp} max={ppMax} onChange={onPp} />
              <span className="sessao-iniciativa-pvmax">/ {ppMax}</span>
            </span>
            <Barra tipo="pp" atual={pp} max={ppMax} />
          </div>
        )}
        <button type="button" className="nv-btn" onClick={onDano} title="Dano com tipo (aplica resistências)">
          <i className="fas fa-heart-crack" /> Dano
        </button>
      </div>

      {c.recursos.length > 0 && (
        // O que resta de cada recurso é desta cópia, guardado junto dos usos das ações.
        <div className="fc-recursos">
          {c.recursos.map((r) => {
            const atual = Math.min(r.valorMax, instancia.usosAcoes[r.id] ?? r.valorMax);
            return (
              <RecursoBarra key={r.id} recurso={r} atual={atual}>
                <span className="sessao-vital">
                  <EditavelComDelta
                    className="sessao-iniciativa-pv"
                    value={atual}
                    max={r.valorMax}
                    onChange={(novo) => onUsos(r.id, novo)}
                  />
                  <span className="sessao-iniciativa-pvmax">/ {r.valorMax}</span>
                </span>
              </RecursoBarra>
            );
          })}
        </div>
      )}

      <div className="fc-numeros">
        <span title="Classe de Resistência">
          <i className="fas fa-shield-halved" /> CR <strong>{c.classeResistencia}</strong>
        </span>
        <span title="Classe de Dificuldade">
          <i className="fas fa-bullseye" /> CD <strong>{c.classeDificuldade}</strong>
        </span>
        <span title="Deslocamento">
          <i className="fas fa-person-running" /> <strong>{c.deslocamento}m</strong>
          {c.deslocamentoNado != null ? ` · nado ${c.deslocamentoNado}m` : ""}
          {c.deslocamentoVoo != null ? ` · voo ${c.deslocamentoVoo}m` : ""}
        </span>
      </div>

      <div className="fc-estado">
        <span className="nv-rotulo">Ações do turno</span>
        {bolinhas}
        {ataques > 1 && (
          <span className="fc-selo" title="Ataques comuns feitos neste turno (Ataques Múltiplos)">
            <i className="fas fa-layer-group" /> {Math.min(ataques, ataquesFeitos)}/{ataques} ataques
          </span>
        )}
      </div>
      {c.acoesLendarias > 0 && (
        <div className="fc-estado">
          <span className="nv-rotulo">
            <i className="fas fa-crown" /> Ações lendárias
          </span>
          <span className="sessao-vital" title="Voltam no começo do turno dela">
            <EditavelComDelta
              className="sessao-iniciativa-pv"
              value={lendarias}
              max={c.acoesLendarias}
              onChange={(novo) => onUsos(CHAVE_LENDARIAS, novo)}
            />
            <span className="sessao-iniciativa-pvmax">/ {c.acoesLendarias}</span>
          </span>
        </div>
      )}
      <div className="fc-estado">{condicoes}</div>

      {pv <= 0 && c.loot && (
        <div className="fc-loot">
          <span className="nv-rotulo">
            <i className="fas fa-sack-dollar" /> Loot
          </span>
          <p>{c.loot}</p>
        </div>
      )}

      {BLOCOS.map((bloco) => {
        const itens = c.componentes.filter((item) => item.categoria === bloco);
        if (itens.length === 0) return null;
        const meta = CATEGORIAS_COMPONENTE.find((x) => x.key === bloco);
        const aspecto = bloco === "aspecto";
        return (
          <section key={bloco} className="fc-bloco" style={{ "--acao-cor": meta?.cor } as React.CSSProperties}>
            <h4>
              <i className={`fas ${meta?.icone ?? "fa-bolt"}`} /> {meta?.label ?? bloco}
            </h4>
            {itens.map((item) => {
              const cond = item.efeitos.filter((e): e is CondicaoEfeito => e.tipo === "condicao");
              const { conteudo, faltantes } = separarCondicoes(item.descricao, cond);
              const resumo = [
                ...item.efeitos.map(textoEfeitoAcao).filter((t): t is string => t !== null),
                ...item.efeitosExtras.map((e) => textoEfeitoExtra(e, c.recursos)),
              ];
              const usos = item.usos === null ? null : (instancia.usosAcoes[item.id] ?? item.usos);
              const custo = gastosDaAcao(item, c.recursos).pp;
              // Aspecto e "Ataques Múltiplos" não se usam: valem sozinhos.
              const soLeitura = aspecto || soMultiataque(item);
              const trava = soLeitura ? null : motivo(item);
              const critico = ehAtaqueComum(item) || item.efeitos.some((e) => e.tipo === "ataque") ? margemDeCritico(c.componentes, item) : 20;
              const revelada = instancia.acoesReveladas.includes(item.id);
              const rolaveis = item.efeitos.flatMap((e) => {
                const rotulo = `${instancia.nomeExibicao}: ${item.nome || "Ação"}`;
                if (e.tipo === "ataque" && e.bonus.trim()) {
                  return [{ id: e.id, texto: `Acerto ${e.bonus.trim()}`, rolar: () => rolarD20(rotulo, e.bonus) }];
                }
                if (e.tipo === "dano" && e.formula.trim()) {
                  return [{ id: e.id, texto: `Dano ${e.formula.trim()}`, rolar: () => rolarFormula(`${rotulo} (dano)`, e.formula) }];
                }
                if (e.tipo === "cura" && e.formula.trim()) {
                  return [{ id: e.id, texto: `Cura ${e.formula.trim()}`, rolar: () => rolarFormula(`${rotulo} (cura)`, e.formula) }];
                }
                return [];
              });
              return (
                <article key={item.id} className={`fc-acao${trava ? " indisponivel" : ""}`}>
                  <div className="fc-acao-topo">
                    <strong>{item.nome || "(sem nome)"}</strong>
                    {item.tecnica && (
                      <span className="fc-selo">
                        <i className="fas fa-wand-magic-sparkles" /> {textoTecnica(item)}
                      </span>
                    )}
                    {critico < 20 && <span className="fc-selo">Crítico {critico}-20</span>}
                    {bloco === "acaoLendaria" && item.custoLendario > 1 && (
                      <span className="fc-selo">custa {item.custoLendario}</span>
                    )}
                    {custo > 0 && <span className="fc-selo">{custo} PP</span>}
                    {usos !== null && (
                      <span className="fc-selo" title="Usos restantes">
                        <i className="fas fa-bolt-lightning" /> {usos}/{item.usos}
                        {usos < (item.usos ?? 0) && (
                          <button
                            type="button"
                            className="fc-selo-botao"
                            title="Recarregar os usos"
                            aria-label={`Recarregar os usos de ${item.nome}`}
                            onClick={() => onUsos(item.id, item.usos ?? 0)}
                          >
                            <i className="fas fa-rotate" />
                          </button>
                        )}
                      </span>
                    )}
                    {!aspecto && (
                      <button
                        type="button"
                        className={`fc-olho${revelada ? " ativo" : ""}`}
                        aria-pressed={revelada}
                        title={revelada ? "Os jogadores veem esta ação. Clique pra esconder." : "Mostrar esta ação aos jogadores"}
                        onClick={() => onRevelar(item.id, !revelada)}
                      >
                        <i className={`fas ${revelada ? "fa-eye" : "fa-eye-slash"}`} />
                      </button>
                    )}
                  </div>

                  {(resumo.length > 0 || item.alcance.trim()) && (
                    <div className="fc-resumo">
                      {resumo.map((t, i) => (
                        <span key={i}>{t}</span>
                      ))}
                      {item.alcance.trim() && <span>Alcance: {item.alcance.trim()}</span>}
                    </div>
                  )}
                  {item.descricao && <p className="fc-descricao">{conteudo}</p>}
                  {faltantes.length > 0 && (
                    <div className="fc-resumo">
                      {faltantes.map((x) => (
                        <CondicaoDoTexto key={x.id} cond={x} />
                      ))}
                    </div>
                  )}

                  {!soLeitura && (
                    <div className="fc-acao-rodape">
                      {trava && <span className="fc-trava">{trava}</span>}
                      {rolaveis.length > 0 && (
                        <details className="fc-solto">
                          <summary title="Rolagem livre: não escolhe alvo nem gasta nada">Rolar sem alvo</summary>
                          <div>
                            {rolaveis.map((r) => (
                              <button type="button" key={r.id} className="nv-btn" onClick={r.rolar}>
                                <i className="fas fa-dice-d20" /> {r.texto}
                              </button>
                            ))}
                          </div>
                        </details>
                      )}
                      <button
                        type="button"
                        className={`nv-btn ${trava ? "" : "primario"} fc-usar`}
                        disabled={ocupado}
                        title={trava ? "Usar mesmo assim (decisão do narrador)" : "Escolher o alvo e rolar"}
                        onClick={() => onUsar(item, !!trava)}
                      >
                        <i className="fas fa-play" /> {trava ? "Forçar" : "Usar"}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        );
      })}

      <details className="fc-completa">
        <summary>Ficha completa</summary>
        <div className="fc-atributos">
          {ATRIBUTOS.map(([slug, sigla]) => (
            <button
              type="button"
              key={slug}
              title={`Rolar teste de ${sigla}`}
              onClick={() => rolarD20(`${instancia.nomeExibicao}: teste de ${sigla}`, modificador(c[slug]))}
            >
              <span>{sigla}</span>
              <strong>{formatarMod(modificador(c[slug]))}</strong>
              <small>{c[slug]}</small>
            </button>
          ))}
        </div>
        {temFichaCompleta && (
          <div className="fc-texto">
            {c.caracteristicas.salvaguardas.length > 0 && (
              <p>
                <strong>Salvaguardas.</strong>{" "}
                {c.caracteristicas.salvaguardas.map((sv) => (
                  <button
                    type="button"
                    key={sv.id}
                    className="fc-teste"
                    title="Rolar"
                    onClick={() => rolarD20(`${instancia.nomeExibicao}: salv. ${sv.nome}`, sv.bonus)}
                  >
                    {sv.nome} {formatarMod(sv.bonus)}
                  </button>
                ))}
              </p>
            )}
            {c.caracteristicas.pericias.length > 0 && (
              <p>
                <strong>Perícias.</strong>{" "}
                {c.caracteristicas.pericias.map((pe) => (
                  <button
                    type="button"
                    key={pe.id}
                    className="fc-teste"
                    title="Rolar"
                    onClick={() => rolarD20(`${instancia.nomeExibicao}: ${pe.nome}`, pe.bonus)}
                  >
                    {pe.nome} {formatarMod(pe.bonus)}
                  </button>
                ))}
              </p>
            )}
            {(c.caracteristicas.percepcaoPassiva !== null || c.caracteristicas.sentidosExtras.trim()) && (
              <p>
                <strong>Sentidos.</strong>{" "}
                {[
                  c.caracteristicas.percepcaoPassiva !== null
                    ? `Percepção Passiva ${c.caracteristicas.percepcaoPassiva}`
                    : null,
                  c.caracteristicas.sentidosExtras || null,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
            {c.resistencias.danoResistencia.length > 0 && (
              <p>
                <strong>Resistência.</strong> {c.resistencias.danoResistencia.join(", ")}
              </p>
            )}
            {c.resistencias.danoImunidade.length > 0 && (
              <p>
                <strong>Imunidade.</strong> {c.resistencias.danoImunidade.join(", ")}
              </p>
            )}
            {c.resistencias.danoVulneravel.length > 0 && (
              <p>
                <strong>Vulnerabilidade.</strong> {c.resistencias.danoVulneravel.join(", ")}
              </p>
            )}
            {c.resistencias.condicaoImunidade.length > 0 && (
              <p>
                <strong>Imune a condição.</strong> {c.resistencias.condicaoImunidade.join(", ")}
              </p>
            )}
            {c.anotacoesPrivadas && (
              <p>
                <strong>Anotações.</strong> {c.anotacoesPrivadas}
              </p>
            )}
          </div>
        )}
      </details>
    </aside>
  );
}
