"use client";

// Os campos da criatura, uma seção por assunto. O wizard e o editor completo
// montam a tela com as mesmas seções: não tem campo que só existe num deles.

import { ATRIBUTOS, PERICIAS, formatarMod, modificador, type Atributo } from "@/lib/op-rpg";
import { parseFormulaDados } from "@/lib/dice";
import { Sugestoes } from "@/app/ficha/[uid]/campos-modal";
import { ListaTextoInput, NumeroInput } from "./inputs";
import { RetratoUpload } from "./retrato-upload";
import { CondicoesChips, TiposDanoChips } from "./tipos-dano-chips";
import type { CriaturaPayload, CriaturaSerializada } from "./types";
import { ndParaValor } from "./utils";

export type CampoCriatura = <K extends keyof CriaturaPayload>(chave: K, valor: CriaturaPayload[K]) => void;

type Base = { draft: CriaturaPayload; campo: CampoCriatura };

const TAMANHOS: { valor: string; nome: string }[] = [
  { valor: "minusculo", nome: "Minúsculo" },
  { valor: "pequeno", nome: "Pequeno" },
  { valor: "medio", nome: "Médio" },
  { valor: "grande", nome: "Grande" },
  { valor: "enorme", nome: "Enorme" },
  { valor: "colossal", nome: "Colossal" },
];

export function nomeDoTamanho(valor: string): string {
  return TAMANHOS.find((t) => t.valor === valor)?.nome ?? valor;
}

const PERSONALIDADES = ["tático", "covarde", "kamikaze", "sádico", "protetor", "oportunista"];
const NDS = ["0", "1/8", "1/4", "1/2", ...Array.from({ length: 30 }, (_, i) => String(i + 1))];

const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

// O que as outras criaturas do narrador já usam, pra escolher em vez de lembrar.
export type SugestoesCriatura = { categorias: string[]; tags: string[]; personalidades: string[] };

export function sugestoesDe(criaturas: CriaturaSerializada[]): SugestoesCriatura {
  const unicos = (lista: string[]) =>
    Array.from(new Set(lista.map((x) => x.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  return {
    categorias: unicos(criaturas.map((c) => c.categoria)),
    tags: unicos(criaturas.flatMap((c) => c.tags)),
    personalidades: unicos([...PERSONALIDADES, ...criaturas.map((c) => c.personalidade ?? "")]),
  };
}

// Média de uma fórmula de dados ("7d12+7" → 53); null sem dado nenhum.
function mediaFormula(formula: string): number | null {
  const { dados, modificador: fixo } = parseFormulaDados(formula);
  if (dados.length === 0) return null;
  return Math.round(dados.reduce((acc, d) => acc + ((d.faces + 1) / 2) * d.sinal, 0) + fixo);
}

export function CamposIdentidade({
  draft,
  campo,
  sugestoes,
  linhagens,
  autoFocus,
}: Base & { sugestoes: SugestoesCriatura; linhagens: string[]; autoFocus?: boolean }) {
  const tagsLivres = sugestoes.tags.filter((t) => !draft.tags.some((x) => semAcento(x) === semAcento(t)));
  return (
    <div className="bestiario-secao">
      <h3>
        <i className="fas fa-id-card" /> Identidade
      </h3>
      <div className="bestiario-grid">
        <label>
          Nome *
          <input value={draft.nome} onChange={(e) => campo("nome", e.target.value)} autoFocus={autoFocus} />
        </label>
        <label>
          Categoria *
          <input
            value={draft.categoria}
            placeholder="Marinha, Pirata, Animal..."
            list="criatura-categorias"
            onChange={(e) => campo("categoria", e.target.value)}
          />
          <datalist id="criatura-categorias">
            {sugestoes.categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label>
          Tamanho
          <select value={draft.tamanho} onChange={(e) => campo("tamanho", e.target.value)}>
            {TAMANHOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Personalidade em combate
          <input
            value={draft.personalidade ?? ""}
            placeholder="Como ela luta"
            list="criatura-personalidades"
            onChange={(e) => campo("personalidade", e.target.value || null)}
          />
          <datalist id="criatura-personalidades">
            {sugestoes.personalidades.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label>
          Linhagem (opcional)
          <input
            value={draft.linhagem}
            placeholder="Grupo com vários níveis: Marinha, Cipher Pol..."
            list="criatura-linhagens"
            onChange={(e) => campo("linhagem", e.target.value)}
          />
          <datalist id="criatura-linhagens">
            {linhagens.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
        {draft.linhagem.trim() && (
          <label>
            Posição na linhagem (1 = a mais fraca)
            <NumeroInput allowNull value={draft.ordemTier} onChange={(v) => campo("ordemTier", v)} />
          </label>
        )}
        <div className="bestiario-span-2">
          <RetratoUpload valor={draft.imagemUrl} onChange={(url) => campo("imagemUrl", url)} />
        </div>
        <div className="bestiario-span-2 bestiario-campo-tags">
          <label>
            Tags (separadas por vírgula)
            <ListaTextoInput value={draft.tags} onChange={(v) => campo("tags", v)} />
          </label>
          {tagsLivres.length > 0 && (
            <Sugestoes limite={8}>
              {tagsLivres.map((t) => (
                <button type="button" key={t} className="sugestao" onClick={() => campo("tags", [...draft.tags, t])}>
                  <i className="fas fa-plus" /> {t}
                </button>
              ))}
            </Sugestoes>
          )}
        </div>
      </div>
    </div>
  );
}

export function CamposNivel({ draft, campo }: Base) {
  const media = mediaFormula(draft.pvFormula);
  return (
    <div className="bestiario-secao">
      <h3>
        <i className="fas fa-shield-halved" /> Nível e defesas
      </h3>
      <div className="bestiario-grid">
        <label>
          Nível de Desafio (ND)
          <input
            value={draft.nd}
            list="criatura-nds"
            onChange={(e) => {
              campo("nd", e.target.value);
              campo("ndValor", ndParaValor(e.target.value));
            }}
          />
          <datalist id="criatura-nds">
            {NDS.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <label>
          XP
          <NumeroInput value={draft.xp} onChange={(v) => campo("xp", v ?? 0)} />
        </label>
        <label>
          Bônus de Proficiência
          <NumeroInput value={draft.bonusProficiencia} onChange={(v) => campo("bonusProficiencia", v ?? 0)} />
        </label>
        <label>
          Pontos de Poder (PP)
          <NumeroInput value={draft.pontosPoder} onChange={(v) => campo("pontosPoder", v ?? 0)} />
        </label>
        <label>
          Ações lendárias por rodada (0 = não tem)
          <NumeroInput
            value={draft.acoesLendarias}
            onChange={(v) => campo("acoesLendarias", Math.min(9, Math.max(0, v ?? 0)))}
          />
        </label>
        <label>
          Classe de Resistência (CR)
          <NumeroInput value={draft.classeResistencia} onChange={(v) => campo("classeResistencia", v ?? 0)} />
        </label>
        <label>
          Classe de Dificuldade (CD)
          <NumeroInput value={draft.classeDificuldade} onChange={(v) => campo("classeDificuldade", v ?? 0)} />
        </label>
        <label>
          PV em dados (opcional)
          <input
            value={draft.pvFormula}
            placeholder="7d12+7"
            onChange={(e) => {
              const nova = e.target.value;
              // O PV acompanha a fórmula enquanto ninguém o ajustou à mão.
              const anterior = mediaFormula(draft.pvFormula);
              const novaMedia = mediaFormula(nova);
              campo("pvFormula", nova);
              if (novaMedia !== null && (draft.pvMedio === 0 || draft.pvMedio === anterior)) campo("pvMedio", novaMedia);
            }}
          />
        </label>
        <label>
          Pontos de Vida (PV)
          <div className="wizard-campo-com-botao">
            <NumeroInput value={draft.pvMedio} onChange={(v) => campo("pvMedio", v ?? 0)} />
            {media !== null && media !== draft.pvMedio && (
              <button
                type="button"
                className="bestiario-btn-add"
                title="Usar a média dos dados"
                onClick={() => campo("pvMedio", media)}
              >
                <i className="fas fa-calculator" /> {media}
              </button>
            )}
          </div>
        </label>
      </div>
    </div>
  );
}

export function CamposDeslocamento({ draft, campo }: Base) {
  return (
    <div className="bestiario-secao">
      <h3>
        <i className="fas fa-person-running" /> Deslocamento
      </h3>
      <div className="bestiario-grid">
        <label>
          Terrestre (m)
          <NumeroInput value={draft.deslocamento} onChange={(v) => campo("deslocamento", v ?? 0)} />
        </label>
        <label>
          Nado (m, vazio = não nada)
          <NumeroInput allowNull value={draft.deslocamentoNado} onChange={(v) => campo("deslocamentoNado", v)} />
        </label>
        <label>
          Voo (m, vazio = não voa)
          <NumeroInput allowNull value={draft.deslocamentoVoo} onChange={(v) => campo("deslocamentoVoo", v)} />
        </label>
      </div>
    </div>
  );
}

export function CamposAtributos({ draft, campo }: Base) {
  return (
    <div className="bestiario-secao">
      <h3>
        <i className="fas fa-dumbbell" /> Atributos
      </h3>
      <div className="bestiario-grid bestiario-grid--atributos">
        {ATRIBUTOS.map((a) => (
          <label key={a.slug}>
            <span>
              {a.nome} <b className="bestiario-mod">{formatarMod(modificador(draft[a.slug]))}</b>
            </span>
            <NumeroInput value={draft[a.slug]} onChange={(v) => campo(a.slug, v ?? 0)} />
          </label>
        ))}
      </div>
    </div>
  );
}

// A salvaguarda cadastrada pra um atributo; o combate acha pelo começo do nome.
function indiceDaSalvaguarda(draft: CriaturaPayload, atributo: Atributo): number {
  const inicio = semAcento(atributo).slice(0, 3);
  return draft.caracteristicas.salvaguardas.findIndex((s) => semAcento(s.nome).startsWith(inicio));
}

export function CamposTestes({ draft, campo }: Base) {
  const car = draft.caracteristicas;
  const prof = draft.bonusProficiencia;

  function salvaguarda(a: (typeof ATRIBUTOS)[number], bonus: number | null) {
    const i = indiceDaSalvaguarda(draft, a.slug);
    const lista = car.salvaguardas.filter((_, idx) => idx !== i);
    campo("caracteristicas", {
      ...car,
      salvaguardas:
        bonus === null ? lista : [...lista, { id: car.salvaguardas[i]?.id ?? crypto.randomUUID(), nome: a.nome, bonus }],
    });
  }

  function pericia(i: number, patch: Partial<{ nome: string; bonus: number }>) {
    campo("caracteristicas", { ...car, pericias: car.pericias.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });
  }

  const periciasLivres = PERICIAS.filter((p) => !car.pericias.some((x) => semAcento(x.nome) === semAcento(p.nome)));

  return (
    <div className="bestiario-secao">
      <h3>
        <i className="fas fa-check-double" /> Salvaguardas, perícias e sentidos
      </h3>

      <span className="bestiario-sublabel">
        Salvaguardas: vazio usa só o modificador do atributo. “Prof.” soma o bônus de proficiência ({formatarMod(prof)}).
      </span>
      <div className="bestiario-salvaguardas">
        {ATRIBUTOS.map((a) => {
          const mod = modificador(draft[a.slug]);
          const atual = car.salvaguardas[indiceDaSalvaguarda(draft, a.slug)]?.bonus ?? null;
          const proficiente = atual === mod + prof;
          return (
            <div key={a.slug} className="bestiario-salvaguarda">
              <span>{a.nome}</span>
              <NumeroInput
                allowNull
                value={atual}
                placeholder={formatarMod(mod)}
                title={`Bônus na salvaguarda de ${a.nome}`}
                onChange={(v) => salvaguarda(a, v)}
              />
              <button
                type="button"
                className={`sugestao chip-opcao${proficiente ? " ativo" : ""}`}
                aria-pressed={proficiente}
                title={`Proficiente: ${formatarMod(mod + prof)}`}
                onClick={() => salvaguarda(a, proficiente ? null : mod + prof)}
              >
                Prof.
              </button>
            </div>
          );
        })}
      </div>

      <span className="bestiario-sublabel">Perícias em que ela se destaca. Clique numa pra adicionar com o bônus de proficiente.</span>
      {periciasLivres.length > 0 && (
        <Sugestoes limite={9}>
          {periciasLivres.map((p) => (
            <button
              type="button"
              key={p.slug}
              className="sugestao"
              onClick={() =>
                campo("caracteristicas", {
                  ...car,
                  pericias: [
                    ...car.pericias,
                    { id: crypto.randomUUID(), nome: p.nome, bonus: modificador(draft[p.atributo]) + prof },
                  ],
                })
              }
            >
              <i className="fas fa-plus" /> {p.nome}
            </button>
          ))}
        </Sugestoes>
      )}
      <div className="bestiario-lista-linhas">
        {car.pericias.map((p, i) => (
          <div key={p.id} className="bestiario-linha-bonus">
            <input placeholder="Nome da perícia" aria-label="Perícia" value={p.nome} onChange={(e) => pericia(i, { nome: e.target.value })} />
            <NumeroInput value={p.bonus} title="Bônus" onChange={(v) => pericia(i, { bonus: v ?? 0 })} />
            <button
              type="button"
              title="Remover perícia"
              aria-label={`Remover ${p.nome || "perícia"}`}
              onClick={() => campo("caracteristicas", { ...car, pericias: car.pericias.filter((_, idx) => idx !== i) })}
            >
              <i className="fas fa-xmark" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="bestiario-btn-add"
          onClick={() =>
            campo("caracteristicas", { ...car, pericias: [...car.pericias, { id: crypto.randomUUID(), nome: "", bonus: 0 }] })
          }
        >
          <i className="fas fa-plus" /> Outra perícia
        </button>
      </div>

      <div className="bestiario-grid">
        <label>
          Percepção Passiva
          <NumeroInput allowNull value={car.percepcaoPassiva} onChange={(v) => campo("caracteristicas", { ...car, percepcaoPassiva: v })} />
        </label>
        <label className="bestiario-span-2">
          Outros sentidos
          <input
            value={car.sentidosExtras}
            placeholder="Visão no escuro 18m, faro..."
            onChange={(e) => campo("caracteristicas", { ...car, sentidosExtras: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}

export function CamposDefesas({ draft, campo }: Base) {
  const r = draft.resistencias;
  return (
    <div className="bestiario-secao">
      <h3>
        <i className="fas fa-shield" /> Resistências, imunidades e vulnerabilidades
      </h3>
      <span className="bestiario-sublabel">
        O combate aplica sozinho: metade do dano no que ela resiste, nada no que é imune, o dobro no que é vulnerável.
      </span>
      <TiposDanoChips rotulo="Resiste a" value={r.danoResistencia} onChange={(v) => campo("resistencias", { ...r, danoResistencia: v })} />
      <TiposDanoChips rotulo="É imune a" value={r.danoImunidade} onChange={(v) => campo("resistencias", { ...r, danoImunidade: v })} />
      <TiposDanoChips rotulo="É vulnerável a" value={r.danoVulneravel} onChange={(v) => campo("resistencias", { ...r, danoVulneravel: v })} />
      <CondicoesChips
        rotulo="É imune às condições"
        value={r.condicaoImunidade}
        onChange={(v) => campo("resistencias", { ...r, condicaoImunidade: v })}
      />
    </div>
  );
}

export function CamposNotas({ draft, campo }: Base) {
  return (
    <div className="bestiario-secao">
      <h3>
        <i className="fas fa-feather" /> Notas do narrador
      </h3>
      <div className="bestiario-grid">
        <label className="bestiario-span-2">
          Anotações privadas (só você vê)
          <textarea value={draft.anotacoesPrivadas} onChange={(e) => campo("anotacoesPrivadas", e.target.value)} />
        </label>
        <label className="bestiario-span-2">
          Loot (aparece na ficha de combate quando ela cai)
          <textarea value={draft.loot} onChange={(e) => campo("loot", e.target.value)} />
        </label>
      </div>
    </div>
  );
}

// Números da criatura que as ações costumam usar: viram atalhos nos efeitos.
export function sugestoesDeAcao(draft: CriaturaPayload) {
  const bonus = (a: Atributo) => formatarMod(modificador(draft[a]) + draft.bonusProficiencia);
  return {
    ataques: [
      { rotulo: "Força", valor: bonus("forca") },
      { rotulo: "Destreza", valor: bonus("destreza") },
    ],
    cd: draft.classeDificuldade,
  };
}
