"use client";

import { useMemo, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { curarPv, esquecerTipoDano, receberDano } from "./actions";
import { exigir } from "@/lib/acoes";
import { anunciarMensagem } from "@/lib/empilhar-rolagem";
import {
  cdConcentracao,
  defesaCobre,
  defesasDesligadasDePadrao,
  defesasDoAgregado,
  juntarTipos,
  letrasDoTipo,
  mesmoTipo,
  resolverDano,
  resumirParte,
  tiposDasDefesas,
  type DefesaDano,
  type ResultadoDano,
} from "@/lib/dano";
import type { EfeitosAgregados } from "@/lib/op-rpg";
import { IconeTipoDano, useCatalogoTipos } from "@/components/tipos-dano/tipos-dano";

export type ModoVida = "dano" | "cura";

// O que o servidor devolve além da mensagem.
export type DanoAplicado = {
  resultado: ResultadoDano;
  perdeuConcentracao: boolean;
  acabaram: { id: string; nome: string }[];
};

type Parte = { valor: string; tipo: string };

const MAX_PARTES = 6;

function rotuloDefesa(d: DefesaDano): string {
  if (d.tipo === "imunidade") return "Imune";
  if (d.tipo === "resistencia") return "Metade";
  if (d.tipo === "vulnerabilidade") return "Dobro";
  return `−${d.valor}`;
}

const ICONE_DEFESA: Record<DefesaDano["tipo"], string> = {
  imunidade: "fa-shield",
  resistencia: "fa-shield-halved",
  vulnerabilidade: "fa-heart-crack",
  reducao: "fa-minus",
};

function erro(err: unknown) {
  Swal.fire({
    icon: "error",
    title: "Erro",
    text: err instanceof Error ? err.message : "Operação falhou.",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

// Tipo livre com sugestões filtradas pelas letras digitadas.
function TipoDanoCampo({
  valor,
  sugestoes,
  salvos,
  onChange,
  onEsquecer,
  onEnter,
}: {
  valor: string;
  sugestoes: string[];
  salvos: string[];
  onChange: (t: string) => void;
  onEsquecer: (t: string) => void;
  onEnter: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  // Filtra pelas letras digitadas; some só o que já está escrito igual.
  const digitado = letrasDoTipo(valor);
  const lista = sugestoes
    .filter((s) => {
      const letras = letrasDoTipo(s);
      return !digitado || (letras.includes(digitado) && letras !== digitado);
    })
    .slice(0, 16);

  function escolher(t: string) {
    onChange(t);
    setAberto(false);
    setAtivo(-1);
  }

  return (
    <div className="tipo-dano">
      <input
        type="text"
        value={valor}
        placeholder="Tipo"
        aria-label="Tipo de dano"
        role="combobox"
        aria-expanded={aberto && lista.length > 0}
        aria-autocomplete="list"
        maxLength={40}
        onFocus={() => setAberto(true)}
        onClick={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onChange={(e) => {
          onChange(e.target.value);
          setAberto(true);
          setAtivo(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAberto(true);
            setAtivo((i) => Math.min(lista.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((i) => Math.max(-1, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (aberto && lista[ativo]) escolher(lista[ativo]);
            else onEnter();
          } else if (e.key === "Escape") {
            setAberto(false);
          }
        }}
      />
      {aberto && lista.length > 0 && (
        <ul className="tipo-dano-lista" role="listbox">
          {lista.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === ativo}
              className={i === ativo ? "ativo" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(s);
              }}
            >
              <span>
                <IconeTipoDano tipo={s} /> {s}
              </span>
              {salvos.some((x) => mesmoTipo(x, s)) && (
                <button
                  type="button"
                  className="tipo-dano-esquecer"
                  title="Esquecer"
                  aria-label={`Esquecer ${s}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEsquecer(s);
                  }}
                >
                  <i className="fas fa-xmark" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function VidaModal({
  personagemId,
  modoInicial,
  hpAtual,
  hpTemp,
  pvNegativos,
  hpMax,
  agg,
  tiposAtaques,
  tiposSalvos,
  concentrando,
  onOtimista,
  onAplicado,
  onRolarConcentracao,
  onPerderConcentracao,
  onFechar,
}: {
  personagemId: string;
  modoInicial: ModoVida;
  hpAtual: number;
  hpTemp: number;
  // Dano sofrido a 0 PV.
  pvNegativos: number;
  hpMax: number;
  agg: EfeitosAgregados;
  // Tipos lidos dos ataques e efeitos da ficha.
  tiposAtaques: string[];
  // Tipos já digitados (salvos na ficha).
  tiposSalvos: string[];
  // Nome do que está concentrando, se estiver.
  concentrando: string | null;
  // Chamado dentro da transition, antes da action.
  onOtimista: (patch: { hpAtual: number; hpTemp?: number; pvNegativos?: number }) => void;
  onAplicado?: (d: DanoAplicado) => void;
  onRolarConcentracao: (cd: number) => void;
  onPerderConcentracao: () => void;
  onFechar: () => void;
}) {
  const [modo, setModo] = useState<ModoVida>(modoInicial);
  const [partes, setPartes] = useState<Parte[]>([{ valor: "", tipo: "" }]);
  const [cura, setCura] = useState("");
  const defesas = useMemo(() => defesasDoAgregado(agg), [agg]);
  const [desligadas, setDesligadas] = useState<Set<string>>(
    () => new Set(defesasDesligadasDePadrao(defesas)),
  );
  const [semTemp, setSemTemp] = useState(false);
  const [esquecidos, setEsquecidos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  // Teste de concentração depois do dano aplicado.
  const [teste, setTeste] = useState<{ nome: string; cd: number; dano: number } | null>(null);
  const [, startTransition] = useTransition();

  const salvos = tiposSalvos.filter((s) => !esquecidos.some((e) => mesmoTipo(e, s)));
  const catalogo = useCatalogoTipos();
  // Primeiro os tipos que mudam a conta, depois o catálogo do narrador, os já usados e os dos ataques.
  const sugestoes = juntarTipos(tiposDasDefesas(defesas), catalogo, salvos, tiposAtaques);

  const partesNum = partes
    .map((p) => ({ valor: Math.trunc(Number(p.valor) || 0), tipo: p.tipo.trim() }))
    .filter((p) => p.valor > 0);
  // Só aparecem as defesas que cobrem alguma parte do golpe.
  const valem = defesas.filter((d) => partesNum.some((p) => defesaCobre(d, p.tipo)));
  const r = resolverDano(
    partesNum,
    defesas,
    { hpAtual, hpTemp, hpMax, pvNegativos },
    { desligadas, semTemp },
  );
  const cdPrevia = concentrando && r.hpAtual.depois > 0 ? cdConcentracao(r.final) : null;
  const curaNum = Math.max(0, Math.trunc(Number(cura) || 0));
  const curaDepois = Math.max(hpAtual, Math.min(hpMax, hpAtual + curaNum));
  const pronto = modo === "dano" ? partesNum.length > 0 : curaNum > 0;

  function mudarParte(i: number, patch: Partial<Parte>) {
    setPartes((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  function alternarDefesa(id: string) {
    setDesligadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function esquecer(tipo: string) {
    setEsquecidos((l) => [...l, tipo]);
    startTransition(async () => {
      try {
        exigir(await esquecerTipoDano(personagemId, tipo));
      } catch (err) {
        erro(err);
      }
    });
  }

  function aplicar() {
    if (!pronto || salvando) return;
    setSalvando(true);
    startTransition(async () => {
      try {
        if (modo === "dano") {
          onOtimista({
            hpAtual: r.hpAtual.depois,
            hpTemp: r.hpTemp.depois,
            pvNegativos: r.pvNegativos.depois,
          });
          const res = exigir(
            await receberDano(personagemId, {
              partes: partesNum,
              desligadas: [...desligadas],
              semTemp,
            }),
          );
          anunciarMensagem(res.mensagem);
          onAplicado?.(res);
          if (res.teste) {
            setTeste({ ...res.teste, dano: res.resultado.final });
            return;
          }
        } else {
          onOtimista({ hpAtual: curaDepois });
          const res = exigir(await curarPv(personagemId, curaNum));
          anunciarMensagem(res.mensagem);
        }
        onFechar();
      } catch (err) {
        erro(err);
      } finally {
        setSalvando(false);
      }
    });
  }

  if (teste) {
    return (
      <div className="modal-overlay" onClick={onFechar}>
        <div className="modal-box vida-modal" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="modal-close" onClick={onFechar} aria-label="Fechar">
            <i className="fas fa-times" />
          </button>
          <h2>Concentração</h2>
          <div className="vida-previa vida-teste">
            <div className="vida-previa-total">CD {teste.cd}</div>
            <div className="vida-previa-linhas">
              <div>
                Salvaguarda de CON pra manter <strong>{teste.nome}</strong>
              </div>
              <div>{teste.dano} de dano</div>
            </div>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="modal-btn-cancel"
              onClick={() => {
                onPerderConcentracao();
                onFechar();
              }}
            >
              Perdi a concentração
            </button>
            <button
              type="button"
              className="modal-btn-save"
              onClick={() => {
                onRolarConcentracao(teste.cd);
                onFechar();
              }}
            >
              <i className="fas fa-dice-d20" /> Rolar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-box vida-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onFechar} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
        <h2>Vida</h2>

        <div className="vida-modos" role="tablist">
          {(
            [
              ["dano", "Dano", "fa-heart-crack"],
              ["cura", "Cura", "fa-heart-circle-plus"],
            ] as const
          ).map(([m, rotulo, icone]) => (
            <button
              type="button"
              key={m}
              role="tab"
              aria-selected={modo === m}
              className={`vida-modo ${m} ${modo === m ? "ativo" : ""}`}
              onClick={() => setModo(m)}
            >
              <i className={`fas ${icone}`} /> {rotulo}
            </button>
          ))}
        </div>

        {modo === "dano" ? (
          <>
            <div className="vida-partes">
              {partes.map((p, i) => (
                <div key={i} className="vida-parte">
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className="vida-valor"
                    value={p.valor}
                    placeholder="Dano"
                    aria-label="Dano"
                    autoFocus={i === 0}
                    onChange={(e) => mudarParte(i, { valor: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") aplicar();
                    }}
                  />
                  <TipoDanoCampo
                    valor={p.tipo}
                    sugestoes={sugestoes}
                    salvos={salvos}
                    onChange={(tipo) => mudarParte(i, { tipo })}
                    onEsquecer={esquecer}
                    onEnter={aplicar}
                  />
                  {partes.length > 1 && (
                    <button
                      type="button"
                      className="vida-parte-rm"
                      aria-label="Tirar esta parte"
                      onClick={() => setPartes((ps) => ps.filter((_, j) => j !== i))}
                    >
                      <i className="fas fa-xmark" />
                    </button>
                  )}
                </div>
              ))}
              {partes.length < MAX_PARTES && (
                <button
                  type="button"
                  className="vida-mais"
                  onClick={() => setPartes((ps) => [...ps, { valor: "", tipo: "" }])}
                >
                  <i className="fas fa-plus" /> Outro tipo
                </button>
              )}
            </div>

            {(valem.length > 0 || hpTemp > 0) && (
              <div className="vida-defesas" aria-label="Defesas">
                {valem.map((d) => {
                  const ligada = !desligadas.has(d.id);
                  return (
                    <button
                      type="button"
                      key={d.id}
                      className={`vida-defesa ${ligada ? "on" : ""}`}
                      aria-pressed={ligada}
                      title={[
                        d.fontes.join(", "),
                        d.cobre ? `Tipos: ${d.cobre}` : "Todos os tipos",
                        d.quando ? `Quando: ${d.quando}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      onClick={() => alternarDefesa(d.id)}
                    >
                      <i className={`fas ${ICONE_DEFESA[d.tipo]}`} />
                      <span className="vida-defesa-txt">
                        {rotuloDefesa(d)} · {d.fontes.join(", ")}
                      </span>
                    </button>
                  );
                })}
                {hpTemp > 0 && (
                  <button
                    type="button"
                    className={`vida-defesa ${!semTemp ? "on" : ""}`}
                    aria-pressed={!semTemp}
                    title="PV temporário absorve primeiro"
                    onClick={() => setSemTemp((v) => !v)}
                  >
                    <i className="fas fa-shield-heart" />
                    <span className="vida-defesa-txt">PV temp. {hpTemp}</span>
                  </button>
                )}
              </div>
            )}

            {partesNum.length > 0 && (
              <div className="vida-previa">
                <div className="vida-previa-total">−{r.final}</div>
                <div className="vida-previa-linhas">
                  {r.partes.map((p, i) => (
                    <div key={i}>{resumirParte(p)}</div>
                  ))}
                  <div>
                    {r.absorvido > 0 && (
                      <>
                        PV temp. {r.hpTemp.antes} → {r.hpTemp.depois} ·{" "}
                      </>
                    )}
                    PV {r.hpAtual.antes} → {r.hpAtual.depois}
                  </div>
                  {r.pvNegativos.depois > 0 && (
                    <div>
                      PV negativos {r.pvNegativos.antes} → {r.pvNegativos.depois} / {hpMax}
                    </div>
                  )}
                  {r.morreu ? (
                    <div className="vida-caiu">Morre</div>
                  ) : r.caiu ? (
                    <div className="vida-caiu">Fica incapacitado</div>
                  ) : null}
                  {concentrando && r.hpAtual.depois <= 0 && (
                    <div className="vida-alerta">Perde a concentração</div>
                  )}
                  {cdPrevia && <div className="vida-alerta">Concentração: CD {cdPrevia}</div>}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              className="vida-valor vida-valor-cura"
              value={cura}
              placeholder="Cura"
              aria-label="Cura"
              autoFocus
              onChange={(e) => setCura(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") aplicar();
              }}
            />
            {curaNum > 0 && (
              <div className="vida-previa cura">
                <div className="vida-previa-total">+{curaDepois - hpAtual}</div>
                <div className="vida-previa-linhas">
                  <div>
                    PV {hpAtual} → {curaDepois} / {hpMax}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="modal-btn-cancel" onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="modal-btn-save"
            onClick={aplicar}
            disabled={salvando || !pronto}
          >
            {modo === "dano" ? "Aplicar dano" : "Curar"}
          </button>
        </div>
      </div>
    </div>
  );
}
