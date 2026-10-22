"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { FormulaContext } from "@/app/ficha/[uid]/campo-formula";
import { DuracaoCampo, comPorTurno, porTurnoDe } from "@/app/ficha/[uid]/duracao-campo";
import {
  DatalistAlvos,
  EfeitoDeAcaoContext,
  EfeitosDuramContext,
  EfeitosEditor,
  NomesRecursoContext,
} from "@/app/ficha/[uid]/efeitos-editor";
import { CardCompacto, type DadosCard } from "@/app/prototipo/card-acao/demo";
import { ThemeButton } from "@/components/temas/theme-button";
import { faceDoTipo, type ContextoRico } from "@/components/descricao-rica/atomos";
import { CatalogoTiposProvider, useEstiloTipoDano } from "@/components/tipos-dano/tipos-dano";
import { DescricaoCard } from "@/components/descricao-rica/descricao-card";
import { DescricaoRica } from "@/components/descricao-rica/descricao-rica";
import { EditorRico } from "@/components/descricao-rica/editor-rico";
import { useDescricaoAuto } from "@/components/descricao-rica/use-descricao-auto";
import { TIPOS_COM_FRASE_PROPRIA, gerarDescricao, type EntradaGerador } from "@/lib/descricao-gerada";
import { citaDuracao } from "@/lib/descricao-rica";
import { lerGatilho, textoGatilho } from "@/lib/combate";
import type { Dado } from "@/lib/dice";
import { textoDuracao, type Duracao } from "@/lib/duracao";
import type { TipoDanoCatalogo } from "@/lib/tipos-dano";
import type { CondicaoCatalogo } from "@/lib/condicoes";
import {
  ATRIBUTOS,
  META_EFEITOS,
  bonusAtaqueTecnica,
  cdTecnica,
  efeitosDuram,
  nomeDoEfeito,
  normalizarAlcance,
  resolverFormula,
  resumoEfeito,
  rotuloAlvo,
  type Atributo,
  type EfeitoHabilidade,
} from "@/lib/op-rpg";
import "@/app/ficha/[uid]/ficha.css";
import "@/app/prototipo/card-acao/card-acao.css";
import "./acao-real.css";

export type AcaoDeTeste = {
  id: string;
  nome: string;
  descricao: string;
  tipo: string;
  gatilho: string | null;
  tecnica: boolean;
  grau: number;
  efeitos: EfeitoHabilidade[];
  duracao: Duracao | null;
  dano: string | null;
  tipoDano: string | null;
  alcance: string | null;
  // O que a ação guarda e o gerador ainda não usa (só aparece na revisão).
  atributoSalv: string | null;
  salvSucesso: string;
  atributoAtaque: string | null;
  custoPp: number;
  custoPa: number;
};

export type HabilidadeDeTeste = {
  id: string;
  nome: string;
  tipo: string;
  descricao: string;
  custoPp: number;
  custoPa: number;
  usos: number | null;
  duracao: Duracao | null;
  efeitos: EfeitoHabilidade[];
};

export type FichaDeTeste = {
  id: string;
  nome: string;
  nivel: number;
  // Atributo da CD das técnicas (sidebar da ficha).
  atributoCd: string | null;
  atributos: Record<Atributo, number>;
  recursos: { id: string; nome: string }[];
  habilidades: HabilidadeDeTeste[];
  acoes: AcaoDeTeste[];
};

const siglaAtributo = (slug: string) => ATRIBUTOS.find((a) => a.slug === slug)?.sigla ?? slug;
const SELO_TIPO: Record<string, string> = { padrao: "Padrão", bonus: "Bônus", power: "Poderosa", react: "Reação", livre: "Livre" };

/* ─── Da ação pro gerador e pro contexto dos chips ───────── */

// "1d8 cortante" + tipoDano → fórmula e tipo; "2d6+FOR" não é confundido com tipo.
function danoDaAcao(a: AcaoDeTeste): EntradaGerador["dano"] {
  const bruto = a.dano?.trim();
  if (!bruto) return null;
  let formula = bruto;
  let tipo = a.tipoDano?.trim() || undefined;
  if (tipo) formula = formula.replace(new RegExp(`\\s*${tipo}\\s*$`, "i"), "");
  const m = /^(.*?\d)\s+([A-Za-zÀ-ÿ]+)$/.exec(formula);
  if (m) {
    formula = m[1];
    tipo = tipo ?? m[2][0].toUpperCase() + m[2].slice(1).toLowerCase();
  }
  return { formula, tipo };
}

function entradaDaAcao(a: AcaoDeTeste, efeitos: EfeitoHabilidade[], duracao: Duracao | null): EntradaGerador {
  return {
    efeitos,
    duracao,
    dano: danoDaAcao(a),
    // O que a própria ação guarda: acerto, alcance e salvaguarda (e quem passa).
    ataque: a.atributoAtaque ? { atributo: a.atributoAtaque } : null,
    alcance: a.alcance,
    salvaguarda: a.atributoSalv
      ? { atributo: a.atributoSalv, sucesso: a.salvSucesso === "metade" ? "metade" : "nada" }
      : null,
    // Reação sem gatilho gravado vale pra qualquer ação que pegue o alvo (lib/combate.ts).
    gatilho: a.tipo === "react" ? (a.gatilho ?? "qualquer") : null,
  };
}

const gerar = (entrada: EntradaGerador) =>
  gerarDescricao(entrada, { rotuloAlvo, siglaAtributo, normalizarAlcance });

function contextoDaAcao(
  ficha: FichaDeTeste,
  a: AcaoDeTeste,
  efeitos: EfeitoHabilidade[],
  duracao: Duracao | null,
  condicoes: string[],
  tiposDano: TipoDanoCatalogo[],
  catalogoCondicoes?: CondicaoCatalogo[],
): ContextoRico {
  const graus = ficha.acoes.filter((x) => x.tecnica && x.grau > 0).map((x) => x.grau);
  const grau = a.tecnica && a.grau > 0 ? a.grau : undefined;
  const nomeRecurso = (id: string) => ficha.recursos.find((r) => r.id === id)?.nome;
  const refs: NonNullable<ContextoRico["refs"]> = {};
  for (const x of ficha.acoes) refs[`acao:${x.id}`] = { titulo: x.nome, selo: SELO_TIPO[x.tipo] ?? x.tipo };
  for (const h of ficha.habilidades) refs[`hab:${h.id}`] = { titulo: h.nome, selo: "Habilidade" };
  return {
    refs,
    condicoes: condicoes.map((nome) => ({ nome })),
    efeitos,
    duracao,
    // O mesmo resumo do chip de efeito do card de hoje, com a ficha real.
    resumoEfeito: (e, resolvido) =>
      resumoEfeito(e, nomeRecurso, resolvido ? { nivel: ficha.nivel, atributos: ficha.atributos, grau, graus } : undefined),
    resolverFormula: (f) => resolverFormula(f, ficha.atributos, ficha.nivel, { grau }),
    nomeRolagem: a.nome,
    tiposDano,
    catalogoCondicoes,
    atributos: ficha.atributos,
    cdPadrao: ficha.atributoCd ? cdTecnica({ nivel: ficha.nivel, valorAtributoPrim: ficha.atributos[ficha.atributoCd as Atributo] ?? 10 }) : undefined,
  };
}

// "7d10 + 3": dados do mesmo tipo juntos (formulaTexto escreveria 1d10 + 1d10…).
function textoDano(dados: Dado[], mod: number): string {
  const grupos = new Map<string, number>();
  for (const d of dados) grupos.set(`${d.sinal}:${d.faces}`, (grupos.get(`${d.sinal}:${d.faces}`) ?? 0) + 1);
  let t = "";
  for (const [k, n] of grupos) {
    const [sinal, faces] = k.split(":");
    t += `${t ? (sinal === "1" ? " + " : " - ") : sinal === "1" ? "" : "-"}${n}d${faces}`;
  }
  return mod ? `${t} ${mod > 0 ? "+" : "-"} ${Math.abs(mod)}` : t;
}

// Os números do card como a ficha mostra: acerto e CD com a ficha real, dano
// resolvido ("2d6+FOR" vira "2d6+3") e rolável.
function dadosDoCard(a: AcaoDeTeste, duracao: Duracao | null, ficha: FichaDeTeste): DadosCard {
  const custos = [a.custoPp > 0 ? `${a.custoPp} PP` : "", a.custoPa > 0 ? `${a.custoPa} PA` : ""].filter(Boolean);
  const d = danoDaAcao(a);
  const grau = a.tecnica && a.grau > 0 ? a.grau : undefined;
  const rol = d ? resolverFormula(d.formula, ficha.atributos, ficha.nivel, { grau }) : null;
  const atqAttr = a.atributoAtaque as Atributo | null;
  const cd = ficha.atributoCd
    ? cdTecnica({ nivel: ficha.nivel, valorAtributoPrim: ficha.atributos[ficha.atributoCd as Atributo] ?? 10 })
    : null;
  return {
    id: a.id,
    tipo: (SELO_TIPO[a.tipo] ? a.tipo : "livre") as DadosCard["tipo"],
    nome: a.nome,
    grau,
    duracao: textoDuracao(duracao) ?? undefined,
    gatilho: a.tipo === "react" ? textoGatilho(lerGatilho(a.gatilho)) : undefined,
    acerto: atqAttr ? bonusAtaqueTecnica({ nivel: ficha.nivel, valorAtributo: ficha.atributos[atqAttr] ?? 10 }) : undefined,
    dano: rol && rol.dados.length > 0 ? textoDano(rol.dados, rol.modificador) : d?.formula,
    rolagemDano: rol && rol.dados.length > 0 ? rol : undefined,
    tipoDano: d?.tipo?.toLowerCase(),
    cd: a.atributoSalv && cd != null ? `Salv ${siglaAtributo(a.atributoSalv)} CD ${cd}` : undefined,
    alcance: a.alcance ?? undefined,
    texto: "",
    custos,
  };
}

// A habilidade no mesmo card: sem dano, acerto, alcance nem gatilho (não existem
// nela); só custos, usos, duração e efeitos.
function dadosDaHabilidade(h: HabilidadeDeTeste, duracao: Duracao | null): DadosCard {
  const custos = [
    h.custoPp > 0 ? `${h.custoPp} PP` : "",
    h.custoPa > 0 ? `${h.custoPa} PA` : "",
    h.usos ? `${h.usos} uso${h.usos === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return {
    id: h.id,
    tipo: "livre",
    classeTipo: h.tipo === "ativa" ? "type-power" : h.tipo === "reativa" ? "type-react" : h.tipo === "passiva" ? "type-padrao" : "type-comum",
    nome: h.nome,
    duracao: textoDuracao(duracao) ?? undefined,
    texto: "",
    custos,
  };
}

/* ─── Página ─────────────────────────────────────────────── */

// As condições da Biblioteca chegam por contexto pra não passar por todos os níveis.
const CondicoesCtx = createContext<CondicaoCatalogo[] | undefined>(undefined);

export function DemoAcaoReal({
  fichas,
  tiposDano,
  catalogoCondicoes,
}: {
  fichas: FichaDeTeste[];
  tiposDano: TipoDanoCatalogo[];
  catalogoCondicoes: CondicaoCatalogo[];
}) {
  const [fichaId, setFichaId] = useState(fichas[0]?.id ?? "");
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [soComEfeitos, setSoComEfeitos] = useState(true);
  // Qual descrição o card mostra: a gerada (ação nova) ou a que a ficha já tem (migração).
  const [fonte, setFonte] = useState<"gerada" | "ficha">("gerada");
  const ficha = fichas.find((f) => f.id === fichaId) ?? fichas[0];

  // Condições que as ações citam: viram chips com nome (e dica, quando a Biblioteca tiver).
  const condicoes = useMemo(() => {
    const nomes = new Set<string>();
    for (const f of fichas) for (const a of f.acoes) for (const e of a.efeitos) if ("condicao" in e && e.condicao) nomes.add(e.condicao);
    return [...nomes].sort();
  }, [fichas]);

  if (!ficha) {
    return (
      <main className="demo-ar">
        <h1>Nenhum dos personagens de teste (Rugo, Kajiki, Kanoa) foi achado nesta conta.</h1>
      </main>
    );
  }
  const acoes = ficha.acoes.filter((a) => !soComEfeitos || a.efeitos.some((e) => e.tipo !== "por_turno") || !!danoDaAcao(a));
  const aberta = ficha.acoes.find((a) => a.id === abertaId) ?? null;

  return (
    <CondicoesCtx.Provider value={catalogoCondicoes}>
    <main className="demo-ar">
      <header className="demo-ar-topo">
        <h1>Protótipo — descrição gerada com o formulário real e ações reais</h1>
        <ThemeButton />
      </header>

      <div className="demo-ar-abas" role="tablist" aria-label="Personagem">
        {fichas.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={f.id === ficha.id}
            onClick={() => {
              setFichaId(f.id);
              setAbertaId(null);
            }}
          >
            {f.nome} <small>{f.acoes.length} ações</small>
          </button>
        ))}
        <label className="demo-ar-filtro">
          descrição do card
          <select value={fonte} onChange={(e) => setFonte(e.target.value as "gerada" | "ficha")}>
            <option value="gerada">gerada (ação nova)</option>
            <option value="ficha">a que está na ficha</option>
          </select>
        </label>
        <label className="demo-ar-filtro">
          <input type="checkbox" checked={soComEfeitos} onChange={(e) => setSoComEfeitos(e.target.checked)} />
          só ações com efeitos ou dano
        </label>
      </div>

      {aberta && (
        <Formulario key={aberta.id} ficha={ficha} acao={aberta} condicoes={condicoes} tiposDano={tiposDano} aoFechar={() => setAbertaId(null)} />
      )}

      <Cobertura fichas={fichas} />

      <CatalogoTiposProvider tipos={tiposDano}>
        <ConferenciaTipos tiposDano={tiposDano} />
      </CatalogoTiposProvider>

      <section>
        <h2>
          {ficha.nome}: {acoes.length} ações
        </h2>
        <div className="action-grid">
          {acoes.map((a) => (
            <Revisao key={a.id} ficha={ficha} acao={a} condicoes={condicoes} tiposDano={tiposDano} fonte={fonte} aoAbrir={() => setAbertaId(a.id)} />
          ))}
        </div>
      </section>

      <section>
        <h2>
          {ficha.nome}: {ficha.habilidades.length} habilidades
        </h2>
        <div className="action-grid">
          {ficha.habilidades.map((h) => (
            <RevisaoHabilidade key={h.id} ficha={ficha} hab={h} condicoes={condicoes} tiposDano={tiposDano} fonte={fonte} />
          ))}
        </div>
      </section>
    </main>
    </CondicoesCtx.Provider>
  );
}

/* ─── Revisão de uma ação ────────────────────────────────── */

// O card é exatamente o da grade da ficha (`CardCompacto` em `.action-grid`,
// descrição em 5 linhas); o que é só da revisão fica numa faixa abaixo dele.
function Revisao({
  ficha,
  acao,
  condicoes,
  tiposDano,
  fonte,
  aoAbrir,
}: {
  ficha: FichaDeTeste;
  acao: AcaoDeTeste;
  condicoes: string[];
  tiposDano: TipoDanoCatalogo[];
  fonte: "gerada" | "ficha";
  aoAbrir: () => void;
}) {
  const catalogoCond = useContext(CondicoesCtx);
  const gerado = useMemo(() => gerar(entradaDaAcao(acao, acao.efeitos, acao.duracao)), [acao]);
  const contexto = useMemo(
    () => contextoDaAcao(ficha, acao, acao.efeitos, acao.duracao, condicoes, tiposDano, catalogoCond),
    [ficha, acao, condicoes, tiposDano, catalogoCond],
  );
  const sem = acao.efeitos.filter((e) => !TIPOS_COM_FRASE_PROPRIA.has(e.tipo));
  // Sem texto gerado, mostra a descrição que a ficha já tem (como ficaria na migração).
  const texto = fonte === "ficha" ? acao.descricao.trim() || gerado : gerado || acao.descricao;
  const card = dadosDoCard(acao, acao.duracao, ficha);
  if (citaDuracao(texto)) card.duracao = undefined;
  card.cdNaDescricao = texto.includes("{{salv:");
  return (
    <div className="demo-ar-celula">
      <CardCompacto
        d={card}
        tiposDano={tiposDano}
        aoUsar={() => {}}
        descricao={<DescricaoCard texto={texto} contexto={contexto} modo="linhas" />}
      />
      <div className="demo-ar-revisao">
        {!gerado && <span className="demo-ar-nao-usado">nada a gerar: mostra a descrição da ficha</span>}
        {sem.length > 0 && (
          <span className="demo-ar-aviso" title="Efeitos sem frase própria no gerador (saem como “ganha …”)">
            genérico: {sem.map((e) => nomeDoEfeito(e)).join(", ")}
          </span>
        )}
        <button type="button" onClick={aoAbrir}>
          Abrir no formulário
        </button>
        <details>
          <summary>Código gerado e descrição da ficha</summary>
          <pre>{gerado || "(vazio)"}</pre>
          <p className="demo-ar-atual">Na ficha: {acao.descricao.trim() ? acao.descricao : "(sem descrição)"}</p>
        </details>
      </div>
    </div>
  );
}

// A habilidade no mesmo card e na mesma grade; a descrição sai dos efeitos e da duração.
function RevisaoHabilidade({
  ficha,
  hab,
  condicoes,
  tiposDano,
  fonte,
}: {
  ficha: FichaDeTeste;
  hab: HabilidadeDeTeste;
  condicoes: string[];
  tiposDano: TipoDanoCatalogo[];
  fonte: "gerada" | "ficha";
}) {
  const catalogoCond = useContext(CondicoesCtx);
  const gerado = useMemo(() => gerar({ efeitos: hab.efeitos, duracao: hab.duracao, passiva: hab.tipo === "passiva" }), [hab]);
  const contexto = useMemo(() => {
    const base = contextoDaAcao(ficha, { id: hab.id, nome: hab.nome } as AcaoDeTeste, hab.efeitos, hab.duracao, condicoes, tiposDano, catalogoCond);
    return base;
  }, [ficha, hab, condicoes, tiposDano, catalogoCond]);
  const texto = fonte === "ficha" ? hab.descricao.trim() || gerado : gerado || hab.descricao;
  const card = dadosDaHabilidade(hab, hab.duracao);
  if (citaDuracao(texto)) card.duracao = undefined;
  return (
    <div className="demo-ar-celula">
      <CardCompacto
        d={card}
        tiposDano={tiposDano}
        aoUsar={() => {}}
        descricao={<DescricaoCard texto={texto} contexto={contexto} modo="linhas" />}
      />
      <div className="demo-ar-revisao">
        <span className="demo-ar-nao-usado">
          {hab.tipo} · {hab.efeitos.length} efeito{hab.efeitos.length === 1 ? "" : "s"}
          {!gerado ? " · nada a gerar" : ""}
        </span>
        <details>
          <summary>Código gerado e descrição da ficha</summary>
          <pre>{gerado || "(vazio)"}</pre>
          <p className="demo-ar-atual">Na ficha: {hab.descricao.trim() ? hab.descricao : "(sem descrição)"}</p>
        </details>
      </div>
    </div>
  );
}

/* ─── Tipos de dano: a cara vem da Biblioteca ───────────── */

// Cada tipo da Biblioteca como chip da descrição ao lado do que a ficha usa
// (`useEstiloTipoDano`): mesma classe, mesmas variáveis e mesmo ícone.
function ConferenciaTipos({ tiposDano }: { tiposDano: TipoDanoCatalogo[] }) {
  const estiloDaFicha = useEstiloTipoDano();
  const contexto: ContextoRico = { tiposDano };
  return (
    <section>
      <h2>Tipos de dano da Biblioteca ({tiposDano.length})</h2>
      <div className="demo-ar-lista">
        {tiposDano.map((t) => {
          const ficha = estiloDaFicha(t.nome);
          const rica = faceDoTipo(t);
          const igual =
            !!ficha === !!rica &&
            (!ficha || (ficha.className === rica!.className && JSON.stringify(ficha.style) === JSON.stringify(rica!.style)));
          return (
            <article key={t.nome} className="demo-ar-item">
              <header>
                <strong>{t.nome}</strong>
                <span className="demo-ar-meta">
                  {t.icone ?? "sem ícone"} · {t.cor ?? "sem cor"}
                  {t.cor2 ? ` + ${t.cor2}` : ""} · {t.efeito ?? "sólido"}
                </span>
                <span className={igual ? "demo-ar-meta" : "demo-ar-aviso"}>{igual ? "igual à ficha" : "DIFERENTE da ficha"}</span>
              </header>
              <DescricaoRica texto={`{{dano:${t.nome}}} ((1d6+3|${t.nome}))`} contexto={contexto} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ─── Cobertura: que tipos de efeito as fichas usam ──────── */

function Cobertura({ fichas }: { fichas: FichaDeTeste[] }) {
  const linhas = useMemo(() => {
    const mapa = new Map<string, { n: number; exemplos: Set<string> }>();
    for (const f of fichas) {
      for (const a of f.acoes) {
        for (const e of a.efeitos) {
          const l = mapa.get(e.tipo) ?? { n: 0, exemplos: new Set<string>() };
          l.n++;
          if (l.exemplos.size < 3) l.exemplos.add(a.nome);
          mapa.set(e.tipo, l);
        }
      }
    }
    return [...mapa.entries()].sort((x, y) => y[1].n - x[1].n);
  }, [fichas]);
  return (
    <section className="demo-ar-cartao">
      <h2>Efeitos usados nas ações dos três personagens</h2>
      <p className="demo-ar-dica">
        Em destaque os que ainda não têm frase própria no gerador (saem como “ganha …”). Use para decidir quais merecem frase.
      </p>
      <div className="demo-ar-chips">
        {linhas.map(([tipo, l]) => {
          const meta = META_EFEITOS[tipo as keyof typeof META_EFEITOS];
          const propria = TIPOS_COM_FRASE_PROPRIA.has(tipo);
          return (
            <span
              key={tipo}
              className={`demo-ar-tipo${propria ? "" : " generico"}`}
              title={[...l.exemplos].join(", ")}
            >
              <i className={`fas ${meta?.icone ?? "fa-wand-magic-sparkles"}`} /> {meta?.nome ?? tipo} <b>{l.n}</b>
            </span>
          );
        })}
      </div>
    </section>
  );
}

/* ─── Formulário real + descrição + card ─────────────────── */

function Formulario({
  ficha,
  acao,
  condicoes,
  tiposDano,
  aoFechar,
}: {
  ficha: FichaDeTeste;
  acao: AcaoDeTeste;
  condicoes: string[];
  tiposDano: TipoDanoCatalogo[];
  aoFechar: () => void;
}) {
  const catalogoCond = useContext(CondicoesCtx);
  const [efeitos, setEfeitos] = useState(acao.efeitos);
  const [duracao, setDuracao] = useState<Duracao | null>(acao.duracao);
  const gerado = useMemo(() => gerar(entradaDaAcao(acao, efeitos, duracao)), [acao, efeitos, duracao]);
  const { valor, aoMudar, automatica } = useDescricaoAuto(gerado);
  const contexto = useMemo(() => contextoDaAcao(ficha, acao, efeitos, duracao, condicoes, tiposDano, catalogoCond), [ficha, acao, efeitos, duracao, condicoes, tiposDano, catalogoCond]);
  const graus = useMemo(() => ficha.acoes.filter((x) => x.tecnica && x.grau > 0).map((x) => x.grau), [ficha]);
  const nomesRecurso = useMemo(() => new Map(ficha.recursos.map((r) => [r.id, r.nome])), [ficha]);

  const card = dadosDoCard(acao, duracao, ficha);
  if (citaDuracao(valor)) card.duracao = undefined;

  return (
    <section className="demo-ar-form">
      <header>
        <h2>Formulário: {acao.nome}</h2>
        <button type="button" onClick={aoFechar}>
          Fechar
        </button>
      </header>
      <p className="demo-ar-dica">
        Os campos de duração e de efeitos são os componentes reais da ficha. Mude qualquer coisa e a descrição se reescreve
        (enquanto estiver “Automática”).
      </p>
      <div className="demo-ar-colunas">
        <div className="demo-ar-cartao">
          <NomesRecursoContext.Provider value={nomesRecurso}>
            <FormulaContext.Provider value={{ nivel: ficha.nivel, atributos: ficha.atributos, graus }}>
              <EfeitoDeAcaoContext.Provider value>
                <EfeitosDuramContext.Provider value={efeitosDuram({ duracao })}>
                  <DuracaoCampo
                    valor={duracao}
                    onChange={setDuracao}
                    porTurno={porTurnoDe(efeitos)}
                    onPorTurno={(lista) => setEfeitos(comPorTurno(efeitos, lista))}
                    recursos={ficha.recursos}
                    aCadaTurno="durando"
                  />
                  <EfeitosEditor
                    efeitos={efeitos}
                    onChange={setEfeitos}
                    recursos={ficha.recursos}
                    pergunta="O que essa ação faz?"
                  />
                  <DatalistAlvos />
                </EfeitosDuramContext.Provider>
              </EfeitoDeAcaoContext.Provider>
            </FormulaContext.Provider>
          </NomesRecursoContext.Provider>
        </div>
        <div>
          <h3>Descrição</h3>
          <EditorRico
            valor={valor}
            onChange={aoMudar}
            refs={[
              ...ficha.acoes.filter((x) => x.id !== acao.id).map((x) => ({ tipo: "acao" as const, id: x.id, nome: x.nome })),
              ...ficha.habilidades.map((h) => ({ tipo: "hab" as const, id: h.id, nome: h.nome })),
            ]}
            condicoes={condicoes}
            contexto={contexto}
            automatica={automatica}
          />
          <h3>Card</h3>
          <CardCompacto d={card} aoUsar={() => {}} descricao={<DescricaoCard texto={valor} contexto={contexto} modo="aberta" />} />
          <h3>Na ficha hoje</h3>
          <p className="demo-ar-atual">{acao.descricao.trim() ? acao.descricao : "(sem descrição)"}</p>
        </div>
      </div>
    </section>
  );
}
