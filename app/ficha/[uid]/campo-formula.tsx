"use client";

// Campo de fórmula: atalhos (siglas, dados, funções), autocompletar e prévia.

import { Tooltip } from "@/components/tooltip";
import { createContext, useContext, useId, useRef, useState } from "react";
import {
  FUNCOES_FORMULA,
  SIGLAS_FORMULA,
  escreverPorNivel,
  formulaUsaGrau,
  formulaVariavel,
  lerPorNivel,
  type FaixaNivel,
} from "@/lib/formula";
import { conferirFormula, valoresDasSiglas, type Atributo } from "@/lib/op-rpg";
import { Sugestoes } from "./campos-modal";

// Nível e atributos pros chips e a prévia mostrarem as fórmulas já resolvidas.
export const FormulaContext = createContext<{
  nivel: number;
  atributos: Record<Atributo, number>;
  // Graus das técnicas do personagem (GRAU fora da técnica).
  graus?: number[];
} | null>(null);

type Sugestao = { texto: string; insere: string; nome: string; valor?: string };

const DADOS = [4, 6, 8, 10, 12, 20];
const MAX_SUGESTOES = 6;

// Palavra sendo digitada antes do cursor; vazio depois de número ("1d" é dado).
function palavraNoCursor(texto: string, cursor: number): string {
  const antes = texto.slice(0, cursor);
  const m = /[A-Za-zÀ-ÖØ-öø-ÿ_]+$/.exec(antes);
  if (!m) return "";
  const anterior = antes.slice(0, m.index).slice(-1);
  if (/[\d)]/.test(anterior) && /^[dD]/.test(m[0])) return "";
  return m[0];
}

function sugestoesPara(
  palavra: string,
  comGrau: boolean,
  valores: Record<string, string>,
  comDesloc = false,
): Sugestao[] {
  if (!palavra) return [];
  const p = palavra.toLowerCase();
  const out: Sugestao[] = [];
  for (const s of SIGLAS_FORMULA) {
    if (s.sigla === "GRAU" && !comGrau) continue;
    if (s.sigla === "DESLOC" && !comDesloc) continue;
    if (s.sigla.toLowerCase().startsWith(p)) {
      out.push({ texto: s.sigla, insere: s.sigla, nome: s.nome, valor: valores[s.sigla] });
    }
  }
  for (const f of FUNCOES_FORMULA) {
    if (f.nome.toLowerCase().startsWith(p) || f.rotulo.startsWith(p)) {
      out.push({ texto: `${f.nome}( )`, insere: f.modelo, nome: f.descricao });
    }
  }
  // A palavra inteira já escrita não precisa de sugestão.
  return out.filter((s) => s.insere !== palavra).slice(0, MAX_SUGESTOES);
}

export function CampoFormula({
  label,
  valor,
  onChange,
  placeholder,
  dados = false,
  comGrau = false,
  grau,
  comDesloc = false,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  // Oferece os dados (d4…d20) nos atalhos.
  dados?: boolean;
  // Oferece GRAU (técnica ou efeito que vale por grau).
  comGrau?: boolean;
  // Grau da técnica, pra prévia.
  grau?: number;
  // Oferece DESLOC, o deslocamento atual (efeito Deslocamento).
  comDesloc?: boolean;
}) {
  const ctx = useContext(FormulaContext);
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focado, setFocado] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [escolha, setEscolha] = useState(0);
  const [fechouSugestoes, setFechouSugestoes] = useState(false);
  const [faixas, setFaixas] = useState<FaixaNivel[] | null>(null);
  const [atalhosAbertos, setAtalhosAbertos] = useState(false);
  const usaGrau = comGrau || grau !== undefined;

  const valores = ctx ? valoresDasSiglas(ctx.atributos, ctx.nivel, usaGrau ? (grau ?? 0) : undefined) : {};
  const palavra = focado ? palavraNoCursor(valor, cursor) : "";
  const sugestoes = fechouSugestoes ? [] : sugestoesPara(palavra, usaGrau, valores, comDesloc);

  // Erro aparece sempre; o valor, só quando a fórmula depende do personagem.
  let previa: { texto: string; erro?: boolean } | null = null;
  if (ctx && valor.trim()) {
    const r = conferirFormula(valor, ctx.atributos, ctx.nivel, { grau, desloc: 0 });
    if (!r.ok) previa = { texto: r.erro, erro: true };
    else if (formulaVariavel(valor)) {
      previa =
        formulaUsaGrau(valor) && grau === undefined
          ? { texto: "GRAU conforme a técnica" }
          : comDesloc && /DESLOC/i.test(valor)
            ? { texto: "Conforme o deslocamento atual" }
            : { texto: `= ${r.texto}` };
    }
  }

  function lerCursor() {
    setCursor(inputRef.current?.selectionStart ?? valor.length);
  }

  // Põe `texto` no cursor (trocando `trocar` letras antes dele) e devolve o foco.
  function inserir(texto: string, trocar = 0) {
    const el = inputRef.current;
    const ini = el?.selectionStart ?? valor.length;
    const fim = el?.selectionEnd ?? valor.length;
    const novo = valor.slice(0, ini - trocar) + texto + valor.slice(fim);
    const pos = ini - trocar + texto.length;
    onChange(novo);
    setCursor(pos);
    setEscolha(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }

  // Sigla/dado num atalho: soma no que já tem ("1d8" + CON → "1d8+CON").
  function atalho(texto: string) {
    const antes = valor.slice(0, inputRef.current?.selectionStart ?? valor.length).trimEnd();
    const ligar = /[\w)]$/.test(antes) ? "+" : "";
    inserir(ligar + texto);
  }

  function atalhoDado(faces: number) {
    const antes = valor.slice(0, inputRef.current?.selectionStart ?? valor.length);
    if (/\d$/.test(antes)) inserir(`d${faces}`);
    else atalho(`1d${faces}`);
  }

  function abrirPorNivel() {
    setFaixas(lerPorNivel(valor) ?? [{ nivel: 1, valor: valor.trim() }, { nivel: 5, valor: "" }]);
  }

  function aplicarPorNivel() {
    if (!faixas) return;
    onChange(escreverPorNivel(faixas));
    setFaixas(null);
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (sugestoes.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const passo = e.key === "ArrowDown" ? 1 : -1;
      setEscolha((c) => (c + passo + sugestoes.length) % sugestoes.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const s = sugestoes[Math.min(escolha, sugestoes.length - 1)];
      inserir(s.insere, palavra.length);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setFechouSugestoes(true);
    }
  }

  const siglas = SIGLAS_FORMULA.filter((s) => (s.sigla !== "GRAU" || usaGrau) && (s.sigla !== "DESLOC" || comDesloc));

  // Clique num atalho não tira o foco do campo.
  const manterFoco = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div
      className="formula-campo"
      onFocus={() => setFocado(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocado(false);
          setFaixas(null);
        }
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="formula-entrada">
        <input
          id={id}
          ref={inputRef}
          type="text"
          value={valor}
          onChange={(ev) => {
            onChange(ev.target.value);
            setCursor(ev.target.selectionStart ?? ev.target.value.length);
            setFechouSugestoes(false);
            setEscolha(0);
          }}
          onKeyDown={teclado}
          onKeyUp={lerCursor}
          onClick={lerCursor}
          placeholder={placeholder ?? "2, PROF, PROF/2+1, 3*NIVEL…"}
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-expanded={sugestoes.length > 0}
          aria-controls={`${id}-sugestoes`}
          aria-autocomplete="list"
        />
        {sugestoes.length > 0 && (
          <ul className="formula-sugestoes" id={`${id}-sugestoes`} role="listbox">
            {sugestoes.map((s, i) => (
              <li key={s.texto}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === escolha}
                  className={i === escolha ? "ativo" : undefined}
                  onMouseDown={manterFoco}
                  onPointerEnter={() => setEscolha(i)}
                  onClick={() => inserir(s.insere, palavra.length)}
                >
                  <strong>{s.texto}</strong>
                  <span>{s.nome}</span>
                  {s.valor && <em>{s.valor}</em>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {previa && <div className={`formula-previa${previa.erro ? " erro" : ""}`}>{previa.texto}</div>}
      {focado && !faixas && (
        // À vista ficam os dados (ou as siglas); o resto abre no "ver mais".
        <Sugestoes
          className="formula-atalhos"
          limite={dados ? DADOS.length : siglas.length}
          aberto={atalhosAbertos}
          onAberto={setAtalhosAbertos}
        >
          {dados &&
            DADOS.map((f) => (
              <button
                type="button"
                key={f}
                className="sugestao"
                onMouseDown={manterFoco}
                onClick={() => atalhoDado(f)}
              >
                d{f}
              </button>
            ))}
          {siglas.map((s) => (
            <Tooltip key={s.sigla} titulo={s.nome} selo={valores[s.sigla] || undefined}>
              <button
                type="button"
                className="sugestao"
                onMouseDown={manterFoco}
                onClick={() => atalho(s.sigla)}
              >
                {s.sigla}
              </button>
            </Tooltip>
          ))}
          {FUNCOES_FORMULA.map((f) => (
            <Tooltip key={f.nome} titulo={f.rotulo} icone="fa-square-root-variable" texto={f.descricao}>
              <button
                type="button"
                className="sugestao formula-funcao"
                onMouseDown={manterFoco}
                onClick={() => (f.nome === "POR_NIVEL" ? abrirPorNivel() : atalho(f.modelo))}
              >
                {f.rotulo}
              </button>
            </Tooltip>
          ))}
        </Sugestoes>
      )}
      {faixas && (
        <div className="formula-por-nivel">
          {faixas.map((f, i) => (
            <div key={i} className="formula-faixa">
              <span>{i === 0 ? "Do nível" : "A partir do"}</span>
              <input
                type="number"
                min={1}
                max={30}
                value={f.nivel}
                disabled={i === 0}
                aria-label="Nível"
                onChange={(ev) =>
                  setFaixas(faixas.map((x, j) => (j === i ? { ...x, nivel: Number(ev.target.value) || 1 } : x)))
                }
              />
              <input
                type="text"
                value={f.valor}
                aria-label={`Valor a partir do nível ${f.nivel}`}
                placeholder={dados ? "1d6" : "2"}
                spellCheck={false}
                autoFocus={i === faixas.length - 1 && !f.valor}
                onChange={(ev) =>
                  setFaixas(faixas.map((x, j) => (j === i ? { ...x, valor: ev.target.value } : x)))
                }
              />
              {i > 0 && (
                <button
                  type="button"
                  className="formula-faixa-rm"
                  aria-label="Tirar nível"
                  onClick={() => setFaixas(faixas.filter((_, j) => j !== i))}
                >
                  <i className="fas fa-xmark" />
                </button>
              )}
            </div>
          ))}
          <div className="formula-por-nivel-botoes">
            <button
              type="button"
              className="sugestao"
              onClick={() =>
                setFaixas([
                  ...faixas,
                  { nivel: Math.min(30, (faixas[faixas.length - 1]?.nivel ?? 1) + 4), valor: "" },
                ])
              }
            >
              + nível
            </button>
            <button type="button" className="sugestao" onClick={() => setFaixas(null)}>
              Cancelar
            </button>
            <button type="button" className="sugestao ativo" onClick={aplicarPorNivel}>
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
