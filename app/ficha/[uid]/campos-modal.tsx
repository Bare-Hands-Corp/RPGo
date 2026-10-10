"use client";

import { Children, useState } from "react";
import { TIPOS_DANO, lerCobertura, mesmoTipo, tiposDaCobertura } from "@/lib/dano";

export type OpcaoSegmento<T extends string | number> = {
  valor: T;
  rotulo: string;
  // Linha menor embaixo do rótulo.
  sub?: string;
  titulo?: string;
  // Fica apagada, mas ainda clica (ex.: grau acima do nível).
  apagada?: boolean;
};

// Escolha única em segmentos colados.
export function Segmentos<T extends string | number>({
  opcoes,
  valor,
  onChange,
  rotulo,
}: {
  opcoes: OpcaoSegmento<T>[];
  valor: T;
  onChange: (v: T) => void;
  rotulo: string;
}) {
  const indice = opcoes.findIndex((o) => o.valor === valor);
  return (
    <div
      className="seg"
      role="group"
      aria-label={rotulo}
      style={{ "--seg-n": opcoes.length, "--seg-i": Math.max(0, indice) } as React.CSSProperties}
    >
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            type="button"
            key={String(o.valor)}
            className={`seg-opcao${ativo ? " ativo" : ""}${o.apagada ? " apagada" : ""}`}
            aria-pressed={ativo}
            title={o.titulo}
            onClick={() => onChange(o.valor)}
          >
            <span className="seg-rotulo">{o.rotulo}</span>
            {o.sub && <span className="seg-sub">{o.sub}</span>}
          </button>
        );
      })}
      {/* Marca que desliza até a opção ativa. */}
      {indice >= 0 && <span className="seg-pilula" aria-hidden />}
    </div>
  );
}

// Número com − e +; o rascunho deixa apagar e redigitar.
export function CampoPasso({
  valor,
  onChange,
  rotulo,
  min = 0,
  max = 9999,
  disabled = false,
}: {
  valor: number;
  onChange: (n: number) => void;
  rotulo: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const limitar = (n: number) => Math.min(max, Math.max(min, Math.trunc(n) || 0));
  return (
    <div className={`passo${disabled ? " desligado" : ""}`}>
      <button
        type="button"
        onClick={() => onChange(limitar(valor - 1))}
        disabled={disabled || valor <= min}
        aria-label={`Menos ${rotulo}`}
      >
        <i className="fas fa-minus" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={rascunho ?? String(valor)}
        disabled={disabled}
        aria-label={rotulo}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setRascunho(e.target.value);
          if (e.target.value.trim() !== "") onChange(limitar(Number(e.target.value)));
        }}
        onBlur={() => setRascunho(null)}
      />
      <button
        type="button"
        onClick={() => onChange(limitar(valor + 1))}
        disabled={disabled || valor >= max}
        aria-label={`Mais ${rotulo}`}
      >
        <i className="fas fa-plus" />
      </button>
    </div>
  );
}

// Atalhos em chips; passou do limite, o resto fica atrás de "ver mais".
export function Sugestoes({
  children,
  limite = 7,
  aberto,
  onAberto,
  className,
}: {
  children: React.ReactNode;
  limite?: number;
  // Controlado por quem desmonta os atalhos (campo de fórmula).
  aberto?: boolean;
  onAberto?: (aberto: boolean) => void;
  className?: string;
}) {
  const [local, setLocal] = useState(false);
  const expandido = aberto ?? local;
  const itens = Children.toArray(children);
  // Um chip só a mais não compensa esconder.
  const corta = itens.length > limite + 1;
  return (
    <div className={`sugestoes${className ? ` ${className}` : ""}`}>
      {corta && !expandido ? itens.slice(0, limite) : itens}
      {corta && (
        <button
          type="button"
          className="sugestao sugestao-mais"
          aria-expanded={expandido}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (onAberto ? onAberto(!expandido) : setLocal(!expandido))}
        >
          {expandido ? "ver menos" : `ver mais (${itens.length - limite})`}
        </button>
      )}
    </div>
  );
}

const CHIPS_A_VISTA = 6;

const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

// Escolha única em chips: as opções conhecidas e "Outro" pra escrever.
export function ChipsCampo({
  rotulo,
  opcoes,
  valor,
  onChange,
  igual = (a, b) => semAcento(a) === semAcento(b),
  exemplo,
}: {
  rotulo: string;
  opcoes: string[];
  valor: string;
  onChange: (v: string) => void;
  igual?: (a: string, b: string) => boolean;
  exemplo?: string;
}) {
  const indice = opcoes.findIndex((o) => igual(o, valor));
  const proprio = valor.trim() !== "" && indice < 0;
  const [escrevendo, setEscrevendo] = useState(proprio);
  const [aberto, setAberto] = useState(indice >= CHIPS_A_VISTA);
  return (
    <div className="chips-campo">
      <label>{rotulo}</label>
      <Sugestoes limite={CHIPS_A_VISTA} aberto={aberto} onAberto={setAberto}>
        {opcoes.map((o, i) => (
          <button
            type="button"
            key={o}
            className={`sugestao chip-opcao${i === indice ? " ativo" : ""}`}
            aria-pressed={i === indice}
            onClick={() => {
              setEscrevendo(false);
              onChange(i === indice ? "" : o);
            }}
          >
            {o}
          </button>
        ))}
        <button
          type="button"
          className={`sugestao chip-opcao${escrevendo ? " ativo" : ""}`}
          aria-pressed={escrevendo}
          onClick={() => {
            if (escrevendo || indice >= 0) onChange("");
            setEscrevendo(!escrevendo);
          }}
        >
          Outro
        </button>
      </Sugestoes>
      {escrevendo && (
        <input
          type="text"
          value={proprio ? valor : ""}
          maxLength={40}
          autoFocus={!proprio}
          aria-label={rotulo}
          placeholder={exemplo}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

const NOMES_DOS_TIPOS = TIPOS_DANO.map((t) => t.nome);

// Um tipo de dano: os do livro ou outro.
export function TipoDanoCampo({
  valor,
  onChange,
  rotulo = "Tipo de dano",
}: {
  valor: string;
  onChange: (tipo: string) => void;
  rotulo?: string;
}) {
  return (
    <ChipsCampo
      rotulo={rotulo}
      opcoes={NOMES_DOS_TIPOS}
      valor={valor}
      onChange={onChange}
      igual={mesmoTipo}
      exemplo="Ex: sônico"
    />
  );
}

// Condições do livro (cap. 10.3).
export const CONDICOES = [
  "Agarrado",
  "Amedrontado",
  "Atordoado",
  "Caído",
  "Cego",
  "Envenenado",
  "Bêbado",
  "Doente",
  "Empoderado",
  "Enfeitiçado",
  "Enfraquecido",
  "Enfurecido",
  "Estremecido",
  "Impedido",
  "Incapacitado",
  "Inconsciente",
  "Invisível",
  "Letárgico",
  "Paralisado",
  "Queimado",
  "Sangramento",
  "Sonolento",
  "Sufocado",
  "Surdo",
];

export function CondicaoCampo({
  valor,
  onChange,
  rotulo = "Condição",
}: {
  valor: string;
  onChange: (condicao: string) => void;
  rotulo?: string;
}) {
  return <ChipsCampo rotulo={rotulo} opcoes={CONDICOES} valor={valor} onChange={onChange} exemplo="Ex: marcado" />;
}

const lista = (texto: string) =>
  texto
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);

// Tipos de dano que uma defesa ou filtro cobre: alguns, ou todos menos alguns.
// O valor é o mesmo texto de antes ("Fogo, Frio", "Todos, exceto Psíquico").
export function TiposDanoCampo({
  valor,
  onChange,
  rotulo = "Tipos de dano",
  vazioETodos = false,
}: {
  valor: string;
  onChange: (tipos: string) => void;
  rotulo?: string;
  // Vazio já quer dizer todos (redução de dano, filtro de efeito).
  vazioETodos?: boolean;
}) {
  const cob = lerCobertura(valor);
  const [modo, setModo] = useState<"alguns" | "todos">(
    cob.todos || (vazioETodos && valor.trim() === "") ? "todos" : "alguns",
  );
  const chaves = modo === "todos" ? cob.exceto : cob.tipos;
  const marcados = NOMES_DOS_TIPOS.filter((n) => chaves.some((k) => mesmoTipo(k, n)));
  // Tipos escritos que não são do livro.
  const [outros, setOutros] = useState(() =>
    tiposDaCobertura(valor)
      .filter((t) => !NOMES_DOS_TIPOS.some((n) => mesmoTipo(n, t)))
      .join(", "),
  );
  const [aberto, setAberto] = useState(marcados.some((n) => NOMES_DOS_TIPOS.indexOf(n) >= CHIPS_A_VISTA));

  function montar(novoModo: "alguns" | "todos", nomes: string[], extras: string) {
    const tudo = [...nomes, ...lista(extras)];
    if (novoModo === "alguns") return tudo.join(", ");
    if (tudo.length > 0) return `Todos, exceto ${tudo.join(", ")}`;
    return vazioETodos ? "" : "Todos";
  }

  return (
    <div className="chips-campo">
      <label>{rotulo}</label>
      <Segmentos
        rotulo={rotulo}
        valor={modo}
        opcoes={[
          { valor: "alguns", rotulo: "Alguns" },
          { valor: "todos", rotulo: "Todos" },
        ]}
        onChange={(m) => {
          setModo(m);
          setOutros("");
          onChange(montar(m, [], ""));
        }}
      />
      {modo === "todos" && <span className="chips-campo-sub">Exceto</span>}
      <Sugestoes limite={CHIPS_A_VISTA} aberto={aberto} onAberto={setAberto}>
        {NOMES_DOS_TIPOS.map((n) => {
          const ativo = marcados.includes(n);
          return (
            <button
              type="button"
              key={n}
              className={`sugestao chip-opcao${ativo ? " ativo" : ""}`}
              aria-pressed={ativo}
              onClick={() =>
                onChange(montar(modo, ativo ? marcados.filter((x) => x !== n) : [...marcados, n], outros))
              }
            >
              {n}
            </button>
          );
        })}
      </Sugestoes>
      <input
        type="text"
        value={outros}
        maxLength={80}
        aria-label="Outros tipos"
        placeholder="Outros tipos"
        onChange={(e) => {
          setOutros(e.target.value);
          onChange(montar(modo, marcados, e.target.value));
        }}
      />
    </div>
  );
}
