"use client";

import { UNIDADES_DURACAO, type Duracao, type UnidadeDuracao } from "@/lib/duracao";
import type { EfeitoHabilidade } from "@/lib/op-rpg";
import { CampoPasso, Segmentos, TipoDanoCampo } from "./campos-modal";
import { CampoFormula } from "./campo-formula";

export type EfeitoPorTurno = Extract<EfeitoHabilidade, { tipo: "por_turno" }>;

type RecursoMinimo = { id: string; nome: string };

// O "a cada turno" mora nos efeitos; aqui ele é editado junto da duração.
export function porTurnoDe(efeitos: EfeitoHabilidade[]): EfeitoPorTurno[] {
  return efeitos.filter((e): e is EfeitoPorTurno => e.tipo === "por_turno");
}

export function comPorTurno(efeitos: EfeitoHabilidade[], lista: EfeitoPorTurno[]): EfeitoHabilidade[] {
  return [...efeitos.filter((e) => e.tipo !== "por_turno"), ...lista];
}

type Modo = "nenhuma" | "instantanea" | "tempo" | "encontro" | "pv_temp";

const MODOS: { valor: Modo; rotulo: string; titulo?: string }[] = [
  { valor: "nenhuma", rotulo: "Nenhuma" },
  { valor: "instantanea", rotulo: "Instantânea" },
  { valor: "tempo", rotulo: "Tempo" },
  { valor: "encontro", rotulo: "Encontro", titulo: "Até o fim do encontro" },
  { valor: "pv_temp", rotulo: "PV temporário", titulo: "Enquanto tiver PV temporário" },
];

const UNIDADES_TEMPO = UNIDADES_DURACAO.filter((u) => u.comQuantidade);

function modoDe(d: Duracao | null): Modo {
  if (!d) return "nenhuma";
  if (d.unidade === "instantanea" || d.unidade === "encontro" || d.unidade === "pv_temp") return d.unidade;
  return "tempo";
}

// Duração: quanto dura, concentração e o que se repete a cada turno.
export function DuracaoCampo({
  valor,
  onChange,
  porTurno,
  onPorTurno,
  recursos = [],
  aCadaTurno = "sempre",
}: {
  valor: Duracao | null;
  onChange: (d: Duracao | null) => void;
  // Sem os dois, o campo não oferece "a cada turno".
  porTurno?: EfeitoPorTurno[];
  onPorTurno?: (lista: EfeitoPorTurno[]) => void;
  recursos?: RecursoMinimo[];
  // Ação só repete enquanto dura: sem duração, não tem "a cada turno".
  aCadaTurno?: "sempre" | "durando";
}) {
  const modo = modoDe(valor);
  const quantidade = valor?.quantidade ?? 1;
  const concentra = !!valor?.concentracao;

  function mudarModo(m: Modo) {
    if (m === "nenhuma") return onChange(null);
    const unidade: UnidadeDuracao = m === "tempo" ? (modo === "tempo" ? valor!.unidade : "turno") : m;
    onChange({
      unidade,
      ...(m === "tempo" ? { quantidade } : {}),
      ...(concentra && m !== "instantanea" ? { concentracao: true } : {}),
    });
  }

  const repete =
    !!porTurno &&
    !!onPorTurno &&
    modo !== "instantanea" &&
    (aCadaTurno === "sempre" || !!valor || porTurno.length > 0);

  return (
    <>
      <label>Duração</label>
      <div className="duracao-painel">
        <Segmentos rotulo="Duração" valor={modo} onChange={mudarModo} opcoes={MODOS} />
        {valor && modo !== "instantanea" && (
          <div className="duracao-detalhe">
            {modo === "tempo" && (
              <>
                <CampoPasso
                  valor={quantidade}
                  min={1}
                  rotulo="Quantidade"
                  onChange={(n) => onChange({ ...valor, quantidade: n })}
                />
                <Segmentos
                  rotulo="Unidade"
                  valor={valor.unidade}
                  onChange={(unidade) => onChange({ ...valor, unidade, quantidade })}
                  opcoes={UNIDADES_TEMPO.map((u) => ({ valor: u.slug, rotulo: u.nome }))}
                />
              </>
            )}
            <button
              type="button"
              className={`origem-pill duracao-concentracao ${concentra ? "ativo" : ""}`}
              aria-pressed={concentra}
              onClick={() =>
                onChange({
                  unidade: valor.unidade,
                  ...(valor.quantidade ? { quantidade: valor.quantidade } : {}),
                  ...(concentra ? {} : { concentracao: true }),
                })
              }
            >
              <i className="fas fa-brain" /> Concentração
            </button>
          </div>
        )}
        {repete && <ACadaTurnoCampo lista={porTurno} onChange={onPorTurno} recursos={recursos} />}
      </div>
    </>
  );
}

const OPCOES_O_QUE: { valor: EfeitoPorTurno["o"]; rotulo: string }[] = [
  { valor: "cura", rotulo: "Cura" },
  { valor: "pv_temp", rotulo: "PV temporário" },
  { valor: "dano", rotulo: "Dano" },
  { valor: "recurso", rotulo: "Recurso" },
];

// O que se repete todo turno: cura, PV temporário, dano em si ou recurso.
export function ACadaTurnoCampo({
  lista,
  onChange,
  recursos,
}: {
  lista: EfeitoPorTurno[];
  onChange: (lista: EfeitoPorTurno[]) => void;
  recursos: RecursoMinimo[];
}) {
  const mudar = (i: number, patch: Partial<EfeitoPorTurno>) =>
    onChange(lista.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  return (
    <div className="turno-campo">
      {lista.map((e, i) => {
        const orfao =
          e.o === "recurso" &&
          !!e.recurso &&
          e.recurso !== "pp" &&
          e.recurso !== "exaustao" &&
          !recursos.some((r) => r.id === e.recurso);
        return (
          <div key={i} className="turno-item">
            <div className="turno-item-topo">
              <span className="turno-item-titulo">
                <i className="fas fa-clock-rotate-left" /> A cada turno
              </span>
              <button
                type="button"
                className="efeito-editor-rm"
                title="Tirar"
                aria-label="Tirar o que acontece a cada turno"
                onClick={() => onChange(lista.filter((_, j) => j !== i))}
              >
                <i className="fas fa-xmark" />
              </button>
            </div>
            <Segmentos
              rotulo="O que acontece a cada turno"
              valor={e.o}
              opcoes={OPCOES_O_QUE}
              onChange={(o) =>
                mudar(i, {
                  o,
                  recurso: o === "recurso" ? e.recurso || "pp" : undefined,
                  gasta: o === "recurso" ? e.gasta : undefined,
                  tipoDano: o === "dano" ? e.tipoDano : undefined,
                })
              }
            />
            {e.o === "recurso" && (
              <div className="turno-item-linha">
                <select
                  value={e.recurso ?? "pp"}
                  aria-label="Recurso"
                  onChange={(ev) => mudar(i, { recurso: ev.target.value })}
                >
                  <option value="pp">PP</option>
                  <option value="exaustao">Exaustão</option>
                  {recursos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                  {orfao && <option value={e.recurso}>(recurso apagado)</option>}
                </select>
                <Segmentos
                  rotulo="Ganha ou gasta"
                  valor={e.gasta ? "gasta" : "ganha"}
                  opcoes={[
                    { valor: "ganha", rotulo: "Ganha" },
                    { valor: "gasta", rotulo: "Gasta" },
                  ]}
                  onChange={(v) => mudar(i, { gasta: v === "gasta" || undefined })}
                />
              </div>
            )}
            <CampoFormula
              label="Quanto"
              valor={e.valor}
              onChange={(valor) => mudar(i, { valor })}
              placeholder={e.o === "recurso" ? "1, 2…" : "1d6+CON, 5, NIVEL…"}
              dados={e.o !== "recurso"}
            />
            {e.o === "dano" && (
              <TipoDanoCampo
                valor={e.tipoDano ?? ""}
                onChange={(tipoDano) => mudar(i, { tipoDano: tipoDano || undefined })}
              />
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="turno-mais"
        onClick={() => onChange([...lista, { tipo: "por_turno", o: "cura", valor: "" }])}
      >
        <i className="fas fa-plus" /> A cada turno
      </button>
    </div>
  );
}
