"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  EfeitosEditor as EfeitosDaFicha,
  NomesRecursoContext,
  type RecursoMinimo,
} from "@/app/ficha/[uid]/efeitos-editor";
import { ATRIBUTOS as ATRIBUTOS_DO_JOGO, type EfeitoHabilidade } from "@/lib/op-rpg";
import { GATILHOS_REACAO, type GatilhoReacao } from "@/lib/combate";
import { Segmentos, type OpcaoSegmento } from "@/app/ficha/[uid]/campos-modal";
import { CATEGORIAS_COMPONENTE, FORMAS_AREA, META_EFEITO_ACAO, RECARGAS_ACAO, criarEfeitoAcao } from "./types";
import type { AtributoSalvaguarda, ComponentePayload, EfeitoAcao, EfeitoAcaoTipo, FormaArea, RecargaAcao, TemplateSerializado } from "./types";
import { NumeroInput } from "./inputs";
import { EditorRico } from "@/components/descricao-rica/editor-rico";
import { useCatalogoCondicoesCompleto } from "@/components/tipos-dano/condicoes";
import { useCatalogoTiposCompleto } from "@/components/tipos-dano/tipos-dano";
import { TiposDanoChips } from "./tipos-dano-chips";
import { ppDoCusto, textoEfeitoAcao, textoEfeitoExtra, textoTecnica } from "./utils";

// Números da criatura dona da ação, oferecidos como atalho nos efeitos (o
// bônus de ataque dela, a CD dela). Na biblioteca não tem criatura: fica vazio.
export type SugestoesAcao = { ataques: { rotulo: string; valor: string }[]; cd: number | null };
export const SugestoesAcaoContext = createContext<SugestoesAcao>({ ataques: [], cd: null });

const ALCANCES = ["Pessoal", "1,5 metro", "3 metros", "9 metros", "18 metros", "36 metros"];

const TIPOS_EFEITO: EfeitoAcaoTipo[] = [
  "ataque",
  "salvaguarda",
  "dano",
  "area",
  "movimento",
  "bonus_numerico",
  "cura",
  "condicao",
  "livre",
];

type Props = {
  item: ComponentePayload;
  // Traits de categoria "condicao" cadastrados na biblioteca — é de lá que
  // o narrador escolhe o que um efeito do tipo "condição" impõe (não dá pra
  // digitar condição livre, ela precisa existir na biblioteca pra ganhar
  // cor/descrição na ficha).
  condicoesDisponiveis: TemplateSerializado[];
  // Recursos da criatura, pros efeitos que gastam ou devolvem recurso.
  recursos: RecursoMinimo[];
  // Fechado mostra só o nome e o resumo; a lista de ações cabe na tela.
  aberto: boolean;
  onAlternar: () => void;
  // Arrastar pra reordenar: props do item, da alça e a classe da vaga.
  reordenar?: { item: object; alca: object; vaga: string };
  onAtualizar: (patch: Partial<ComponentePayload>) => void;
  onRemover: () => void;
};

// Editor completo de uma ação/aspecto: nome + lista de efeitos (a mecânica
// de verdade, um card por efeito) + descrição. Uma ação começa vazia — o
// narrador vai acumulando efeitos (Ataque, Dano, Movimento, Bônus
// Numérico, Recuperar Vida, Condição...) em vez de preencher um bloco fixo
// que assumia "toda ação ataca e causa dano". Mesmo tratamento que a
// criação de habilidades do jogador já usa. Usado tanto no editor de
// criatura quanto no wizard, pra não ter dois formulários fazendo a mesma
// coisa de jeitos diferentes.
export function ComponenteEditor({
  item,
  condicoesDisponiveis,
  recursos,
  aberto,
  onAlternar,
  onAtualizar,
  onRemover,
  reordenar,
}: Props) {
  const cor = CATEGORIAS_COMPONENTE.find((c) => c.key === item.categoria)?.cor;
  // Catálogos da mesa pros chips da descrição (condição, tipo de dano).
  const catalogoCondicoes = useCatalogoCondicoesCompleto();
  const tiposDano = useCatalogoTiposCompleto();
  const contextoRico = useMemo(() => ({ catalogoCondicoes, tiposDano }), [catalogoCondicoes, tiposDano]);
  const nomesCondicoes = useMemo(() => catalogoCondicoes.map((x) => x.nome), [catalogoCondicoes]);
  const resumo = [
    ...(item.tecnica ? [textoTecnica(item)] : []),
    ...item.efeitos.map(textoEfeitoAcao).filter((t): t is string => t !== null),
    ...item.efeitosExtras.map((e) => textoEfeitoExtra(e, recursos)),
  ];
  const pp = ppDoCusto(item.custo);
  // Custo escrito antes do campo ser só PP ("3 por dia"): o combate não cobra.
  const custoAntigo = item.custo.trim() && pp === 0 ? item.custo.trim() : null;
  return (
    <div
      className={`bestiario-componente-card${aberto ? " aberto" : ""}${reordenar?.vaga ?? ""}`}
      style={{ "--acao-cor": cor } as React.CSSProperties}
      {...reordenar?.item}
    >
      <div className="bestiario-componente-topo">
        {reordenar && (
          <button
            type="button"
            className="btn-card-alca"
            title="Arraste pra mudar a ordem ou o bloco (ou use as setas)"
            aria-label={`Mudar ${item.nome || "ação"} de posição`}
            {...reordenar.alca}
          >
            <i className="fas fa-grip-vertical" />
          </button>
        )}
        <button type="button" className="bestiario-componente-abrir" aria-expanded={aberto} onClick={onAlternar}>
          <i className="fas fa-chevron-right bestiario-componente-seta" />
          <strong>{item.nome.trim() || "(sem nome)"}</strong>
          {!aberto && resumo.length > 0 && <span className="bestiario-componente-resumo">{resumo.join(" · ")}</span>}
        </button>
        <button
          type="button"
          className="bestiario-efeito-remover"
          onClick={onRemover}
          title="Remover"
          aria-label={`Remover ${item.nome || "ação"}`}
        >
          <i className="fas fa-trash" />
        </button>
      </div>

      {aberto && (
        <>
          <div className="bestiario-grid">
            <label>
              Nome
              <input value={item.nome} autoFocus={!item.nome} onChange={(e) => onAtualizar({ nome: e.target.value })} />
            </label>
            <label>
              Alcance
              <input
                value={item.alcance}
                list="acao-alcances"
                placeholder="1,5 metro"
                onChange={(e) => onAtualizar({ alcance: e.target.value })}
              />
              <datalist id="acao-alcances">
                {ALCANCES.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </label>
            <label>
              Custo em PP (vazio = de graça)
              <NumeroInput
                allowNull
                value={pp > 0 ? pp : null}
                onChange={(v) => onAtualizar({ custo: v && v > 0 ? String(Math.trunc(v)) : "" })}
              />
            </label>
          </div>
          {custoAntigo && (
            <span className="bestiario-sublabel">
              Custo antigo: “{custoAntigo}”. O combate só cobra PP; pra limite de vezes use “Usos limitados” abaixo.{" "}
              <button type="button" className="sugestao" onClick={() => onAtualizar({ custo: "" })}>
                Limpar
              </button>
            </span>
          )}

          {item.categoria === "acaoLendaria" && (
            <label className="bestiario-campo-curto">
              Custa quantas ações lendárias
              <NumeroInput value={item.custoLendario} onChange={(v) => onAtualizar({ custoLendario: Math.max(1, v ?? 1) })} />
            </label>
          )}

          {item.categoria === "reacao" && (
            <GatilhoCampo valor={item.gatilho} onChange={(gatilho) => onAtualizar({ gatilho })} />
          )}

          {item.categoria !== "aspecto" && item.categoria !== "condicao" && (
            <TecnicaCampos tecnica={item.tecnica} grau={item.grau} onChange={(patch) => onAtualizar(patch)} />
          )}

          <UsosLimitadosEditor usos={item.usos} recarga={item.recarga} onChange={(patch) => onAtualizar(patch)} />

          <EfeitosEditor
            efeitos={item.efeitos}
            condicoesDisponiveis={condicoesDisponiveis}
            onChange={(efeitos) => onAtualizar({ efeitos })}
          />

          <EfeitosExtrasEditor
            efeitos={item.efeitosExtras}
            recursos={recursos}
            onChange={(efeitosExtras) => onAtualizar({ efeitosExtras })}
          />

          <div className="bestiario-descricao-rica">
            <span>Descrição</span>
            <EditorRico
              valor={item.descricao}
              onChange={(t) => onAtualizar({ descricao: t })}
              condicoes={nomesCondicoes}
              contexto={contextoRico}
              placeholder="Descreva a ação… (@ insere, / blocos)"
            />
          </div>
        </>
      )}
    </div>
  );
}

// Gatilho da reação: em que situação o combate a oferece quando a criatura é
// pega por uma ação. Reaproveitado pelo formulário de trait da biblioteca.
export function GatilhoCampo({ valor, onChange }: { valor: GatilhoReacao; onChange: (g: GatilhoReacao) => void }) {
  return (
    <label>
      Gatilho da reação
      <select value={valor} onChange={(e) => onChange(e.target.value as GatilhoReacao)}>
        {GATILHOS_REACAO.map((g) => (
          <option key={g.slug} value={g.slug}>
            {g.texto}
          </option>
        ))}
      </select>
      <span className="bestiario-sublabel">
        Quando ela é alvo e o gatilho bate, o combate oferece esta reação antes de a ação valer. Efeitos que ele aplica
        sozinho: bônus na CR (o ataque é comparado de novo), PV temporário (o dano sai dele primeiro) e redução de
        dano, em “Efeitos de ficha”.
      </span>
    </label>
  );
}

const OPCOES_GRAU: OpcaoSegmento<number>[] = [
  { valor: 0, rotulo: "—", titulo: "Sem grau (Técnica Auxiliar)" },
  ...Array.from({ length: 7 }, (_, i) => ({ valor: i + 1, rotulo: `${i + 1}º` })),
];

// Técnica e grau, com os mesmos controles das ações do jogador.
export function TecnicaCampos({
  tecnica,
  grau,
  onChange,
}: {
  tecnica: boolean;
  grau: number;
  onChange: (patch: { tecnica?: boolean; grau?: number }) => void;
}) {
  return (
    <div className="bestiario-tecnica">
      <span className="bestiario-tipos-dano-rotulo">Técnica</span>
      <div className="origem-pills">
        {(
          [
            [false, "Não", "fa-hand-fist"],
            [true, "Sim", "fa-wand-magic-sparkles"],
          ] as const
        ).map(([valor, rotulo, icone]) => (
          <button
            type="button"
            key={rotulo}
            className={`origem-pill ${tecnica === valor ? "ativo" : ""}`}
            aria-pressed={tecnica === valor}
            onClick={() => onChange(valor ? { tecnica: true } : { tecnica: false, grau: 0 })}
          >
            <i className={`fas ${icone}`} /> {rotulo}
          </button>
        ))}
      </div>
      {tecnica && (
        <>
          <span className="bestiario-tipos-dano-rotulo">Grau (— = sem grau, como a Técnica Auxiliar)</span>
          <Segmentos rotulo="Grau" valor={grau} onChange={(g) => onChange({ grau: g })} opcoes={OPCOES_GRAU} />
        </>
      )}
    </div>
  );
}

// Os efeitos de habilidade da ficha do jogador, com o mesmo editor de lá.
// Reaproveitado pelo formulário de trait da biblioteca.
export function EfeitosExtrasEditor({
  efeitos,
  recursos,
  onChange,
}: {
  efeitos: EfeitoHabilidade[];
  recursos: RecursoMinimo[];
  onChange: (efeitos: EfeitoHabilidade[]) => void;
}) {
  const nomes = useMemo(() => new Map(recursos.map((r) => [r.id, r.nome])), [recursos]);
  return (
    <details className="bestiario-usos-detalhe bestiario-efeitos-extras" open={efeitos.length > 0 || undefined}>
      <summary>
        <i className="fas fa-wand-magic-sparkles" /> Efeitos de ficha {efeitos.length > 0 ? `(${efeitos.length})` : "(opcional)"}
      </summary>
      {/* O gap fica num <div>: o <details> não distribui os filhos como flex. */}
      <div className="bestiario-efeitos-extras-corpo">
        <span className="bestiario-sublabel">
          Os mesmos efeitos das habilidades e técnicas dos jogadores. O combate aplica sozinho: Multiataque, Crítico
          Expandido, Margem de Crítico, Dano Extra (num aspecto vale pra todo ataque dela) e gasto de Recurso. Os outros
          aparecem na ficha pra você aplicar.
        </span>
        <NomesRecursoContext.Provider value={nomes}>
          <EfeitosDaFicha efeitos={efeitos} onChange={onChange} recursos={recursos} pergunta="O que mais essa ação faz?" />
        </NomesRecursoContext.Provider>
      </div>
    </details>
  );
}

type UsosLimitadosProps = {
  usos: number | null;
  recarga: RecargaAcao | null;
  onChange: (patch: { usos?: number | null; recarga?: RecargaAcao | null }) => void;
};

// Usos limitados (ex: "3/dia", "Recarga 5-6") — reaproveitado pelo editor de
// criatura e pelo formulário de trait, mesma mecânica nos dois. O CONTADOR
// de quanto já foi gasto não mora aqui — isso é por cópia da criatura em
// combate (a definição da ação só diz o máximo e como ela recarrega).
export function UsosLimitadosEditor({ usos, recarga, onChange }: UsosLimitadosProps) {
  return (
    <details className="bestiario-usos-detalhe" open={usos !== null}>
      <summary>
        <i className="fas fa-bolt-lightning" /> Usos limitados {usos !== null ? `(${usos})` : "(opcional)"}
      </summary>
      <div className="bestiario-grid">
        <label>
          Máximo (vazio = ilimitado)
          <NumeroInput
            allowNull
            value={usos}
            onChange={(v) => onChange({ usos: v, recarga: v === null ? null : (recarga ?? { tipo: "combate" }) })}
          />
        </label>
        {usos !== null && (
          <>
            <label>
              Recarga
              <select
                value={recarga?.tipo ?? "combate"}
                onChange={(e) => {
                  const tipo = e.target.value as RecargaAcao["tipo"];
                  onChange({ recarga: tipo === "dado" ? { tipo: "dado", minimo: 5 } : { tipo } });
                }}
              >
                {RECARGAS_ACAO.map((r) => (
                  <option key={r.tipo} value={r.tipo}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            {recarga?.tipo === "dado" && (
              <label>
                Mínimo no d6
                <NumeroInput value={recarga.minimo} onChange={(v) => onChange({ recarga: { tipo: "dado", minimo: v ?? 5 } })} />
              </label>
            )}
          </>
        )}
      </div>
    </details>
  );
}

type EfeitosEditorProps = {
  efeitos: EfeitoAcao[];
  condicoesDisponiveis: TemplateSerializado[];
  onChange: (efeitos: EfeitoAcao[]) => void;
};

// Lista de efeitos reaproveitada pelo editor de criatura (ComponenteEditor,
// acima) e pelo formulário de trait da biblioteca — os dois têm exatamente
// a mesma mecânica pra editar agora que "ação" não é mais um bloco fixo.
export function EfeitosEditor({ efeitos, condicoesDisponiveis, onChange }: EfeitosEditorProps) {
  const [pickerAberto, setPickerAberto] = useState(false);

  function atualizarEfeito(id: string, patch: Partial<EfeitoAcao>) {
    onChange(efeitos.map((e) => (e.id === id ? ({ ...e, ...patch } as EfeitoAcao) : e)));
  }

  function removerEfeito(id: string) {
    onChange(efeitos.filter((e) => e.id !== id));
  }

  function adicionarEfeito(tipo: EfeitoAcaoTipo) {
    onChange([...efeitos, criarEfeitoAcao(tipo)]);
    setPickerAberto(false);
  }

  return (
    <div className="bestiario-efeitos-lista">
      <span className="bestiario-sublabel">
        Efeitos — a ação começa vazia. Adicione um efeito por mecânica separada (uma ação que só cura não precisa de
        &quot;Ataque&quot;, uma que só empurra não precisa de &quot;Dano&quot;).
      </span>
      {efeitos.length === 0 && <p className="bestiario-vazio">Nenhum efeito ainda.</p>}
      {efeitos.map((efeito) => (
        <CardEfeito
          key={efeito.id}
          efeito={efeito}
          condicoesDisponiveis={condicoesDisponiveis}
          onAtualizar={(patch) => atualizarEfeito(efeito.id, patch)}
          onRemover={() => removerEfeito(efeito.id)}
        />
      ))}

      {pickerAberto ? (
        <div className="preset-acao-picker">
          <div className="bestiario-efeito-tipos-grid">
            {TIPOS_EFEITO.map((tipo) => {
              const meta = META_EFEITO_ACAO[tipo];
              return (
                <button
                  key={tipo}
                  type="button"
                  className="bestiario-efeito-tipo-btn"
                  style={{ borderLeftColor: meta.cor }}
                  onClick={() => adicionarEfeito(tipo)}
                >
                  <i className={`fas ${meta.icone}`} style={{ color: meta.cor }} />
                  {meta.nome}
                </button>
              );
            })}
          </div>
          <button type="button" className="bestiario-voltar-lista" onClick={() => setPickerAberto(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <button type="button" className="bestiario-btn-add" onClick={() => setPickerAberto(true)}>
          <i className="fas fa-plus" /> Efeito
        </button>
      )}
    </div>
  );
}

function CardEfeito({
  efeito,
  condicoesDisponiveis,
  onAtualizar,
  onRemover,
}: {
  efeito: EfeitoAcao;
  condicoesDisponiveis: TemplateSerializado[];
  onAtualizar: (patch: Partial<EfeitoAcao>) => void;
  onRemover: () => void;
}) {
  const meta = META_EFEITO_ACAO[efeito.tipo];
  const sugestoes = useContext(SugestoesAcaoContext);
  return (
    <div className="bestiario-efeito-card" style={{ borderLeftColor: meta.cor }}>
      <div className="bestiario-efeito-topo" style={{ color: meta.cor }}>
        <i className={`fas ${meta.icone}`} />
        <strong>{meta.nome}</strong>
        <button type="button" className="bestiario-efeito-remover" onClick={onRemover} title="Remover efeito">
          <i className="fas fa-xmark" />
        </button>
      </div>
      <div className="bestiario-efeito-corpo">{renderCampos(efeito, condicoesDisponiveis, onAtualizar, sugestoes)}</div>
    </div>
  );
}

function renderCampos(
  efeito: EfeitoAcao,
  condicoesDisponiveis: TemplateSerializado[],
  onAtualizar: (patch: Partial<EfeitoAcao>) => void,
  sugestoes: SugestoesAcao,
): React.ReactNode {
  switch (efeito.tipo) {
    case "ataque":
      return (
        <>
          <label>
            Bônus para atingir
            <input value={efeito.bonus} placeholder="+5" onChange={(e) => onAtualizar({ bonus: e.target.value })} />
          </label>
          {sugestoes.ataques.length > 0 && (
            <div className="bestiario-atalhos">
              <span>Com proficiência:</span>
              {sugestoes.ataques.map((a) => (
                <button
                  type="button"
                  key={a.rotulo}
                  className={`sugestao chip-opcao${efeito.bonus.trim() === a.valor ? " ativo" : ""}`}
                  onClick={() => onAtualizar({ bonus: a.valor })}
                >
                  {a.rotulo} {a.valor}
                </button>
              ))}
            </div>
          )}
        </>
      );
    case "salvaguarda":
      return (
        <>
          <label>
            Atributo da salvaguarda (do alvo)
            <select value={efeito.atributo} onChange={(e) => onAtualizar({ atributo: e.target.value as AtributoSalvaguarda })}>
              {ATRIBUTOS_DO_JOGO.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            CD
            <NumeroInput value={efeito.cd} onChange={(v) => onAtualizar({ cd: v ?? 10 })} />
          </label>
          {sugestoes.cd !== null && efeito.cd !== sugestoes.cd && (
            <div className="bestiario-atalhos">
              <button type="button" className="sugestao chip-opcao" onClick={() => onAtualizar({ cd: sugestoes.cd ?? 10 })}>
                Usar a CD da criatura ({sugestoes.cd})
              </button>
            </div>
          )}
          <label className="bestiario-check">
            <input
              type="checkbox"
              checked={!!efeito.metade}
              onChange={(e) => onAtualizar({ metade: e.target.checked || undefined })}
            />
            Quem passa leva metade do dano
          </label>
        </>
      );
    case "dano":
      return (
        <>
          <label>
            Fórmula
            <input value={efeito.formula} placeholder="2d10, ou só 2 pra bônus fixo" onChange={(e) => onAtualizar({ formula: e.target.value })} />
          </label>
          <TiposDanoChips
            className="bestiario-efeito-largo"
            rotulo="Tipo de dano (mais de um = escolha entre eles)"
            value={efeito.tipos}
            onChange={(v) => onAtualizar({ tipos: v })}
          />
        </>
      );
    case "area":
      return (
        <>
          <label>
            Forma
            <select value={efeito.forma} onChange={(e) => onAtualizar({ forma: e.target.value as FormaArea })}>
              {FORMAS_AREA.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tamanho
            <input value={efeito.tamanho} placeholder="15 metros" onChange={(e) => onAtualizar({ tamanho: e.target.value })} />
          </label>
        </>
      );
    case "movimento":
      return (
        <>
          <label>
            Tipo
            <select value={efeito.tipoMov} onChange={(e) => onAtualizar({ tipoMov: e.target.value })}>
              <option value="caminhar">Caminhar</option>
              <option value="nadar">Nadar</option>
              <option value="voar">Voar</option>
              <option value="escalar">Escalar</option>
              <option value="cavar">Cavar</option>
            </select>
          </label>
          <label>
            Metros
            <NumeroInput value={efeito.valor} onChange={(v) => onAtualizar({ valor: v ?? 0 })} />
          </label>
          <label>
            Duração
            <input value={efeito.duracao} placeholder="até o fim do turno, permanente..." onChange={(e) => onAtualizar({ duracao: e.target.value })} />
          </label>
        </>
      );
    case "bonus_numerico":
      return (
        <>
          <label>
            Onde (CR, CD, ataque, dano de outra técnica, deslocamento...)
            <input value={efeito.alvo} placeholder="CR" onChange={(e) => onAtualizar({ alvo: e.target.value })} />
          </label>
          <label>
            Quantidade
            <NumeroInput value={efeito.valor} onChange={(v) => onAtualizar({ valor: v ?? 0 })} />
          </label>
          <label>
            Duração
            <input value={efeito.duracao} placeholder="1 minuto, até o fim do combate..." onChange={(e) => onAtualizar({ duracao: e.target.value })} />
          </label>
        </>
      );
    case "cura":
      return (
        <label>
          Quanto recupera
          <input value={efeito.formula} placeholder="2d8, 20, 20 + CON..." onChange={(e) => onAtualizar({ formula: e.target.value })} />
        </label>
      );
    case "condicao": {
      const condicao = condicoesDisponiveis.find((c) => c.id === efeito.condicaoId);
      return (
        <>
          <label>
            Condição
            {condicoesDisponiveis.length > 0 ? (
              <select
                value={efeito.condicaoId}
                onChange={(e) => {
                  const escolhida = condicoesDisponiveis.find((c) => c.id === e.target.value);
                  onAtualizar(
                    escolhida
                      ? {
                          condicaoId: escolhida.id,
                          nome: escolhida.nome,
                          descricao: escolhida.textoTemplate,
                          cor: escolhida.formula.cor,
                          cor2: escolhida.formula.cor2,
                          efeito: escolhida.formula.efeito,
                        }
                      : { condicaoId: "", nome: "", descricao: "", cor: "", cor2: "", efeito: undefined },
                  );
                }}
              >
                <option value="">Escolher...</option>
                {condicoesDisponiveis.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            ) : (
              <span className="bestiario-sublabel">Nenhuma condição cadastrada ainda — crie uma na Biblioteca, pasta Condições.</span>
            )}
          </label>
          {condicao && (
            <label>
              Duração (turnos, vazio = indefinida)
              <NumeroInput allowNull value={efeito.duracaoTurnos} onChange={(v) => onAtualizar({ duracaoTurnos: v })} />
            </label>
          )}
          {condicao && (
            <>
              {/* Quem a ação pega rola pra não receber (além da salvaguarda da própria ação). */}
              <label>
                Evita com salvaguarda de
                <select
                  value={efeito.evita?.atributo ?? ""}
                  onChange={(e) =>
                    onAtualizar({
                      evita: e.target.value
                        ? {
                            atributo: e.target.value as AtributoSalvaguarda,
                            cd: efeito.evita?.cd ?? sugestoes.cd ?? 10,
                          }
                        : null,
                    })
                  }
                >
                  <option value="">Nenhuma</option>
                  {ATRIBUTOS_DO_JOGO.map((a) => (
                    <option key={a.slug} value={a.slug}>
                      {a.nome}
                    </option>
                  ))}
                </select>
              </label>
              {efeito.evita && (
                <label>
                  CD pra evitar
                  <NumeroInput
                    value={efeito.evita.cd}
                    onChange={(v) => onAtualizar({ evita: { ...efeito.evita!, cd: v ?? 10 } })}
                  />
                </label>
              )}
              {efeito.evita && sugestoes.cd !== null && efeito.evita.cd !== sugestoes.cd && (
                <div className="bestiario-atalhos">
                  <button
                    type="button"
                    className="sugestao chip-opcao"
                    onClick={() => onAtualizar({ evita: { ...efeito.evita!, cd: sugestoes.cd ?? 10 } })}
                  >
                    Usar a CD da criatura ({sugestoes.cd})
                  </button>
                </div>
              )}
            </>
          )}
          {condicao && (
            <>
              <label>
                Dano a cada turno (opcional)
                <input
                  value={efeito.danoPorTurno?.formula ?? ""}
                  placeholder="2d8"
                  onChange={(e) =>
                    onAtualizar({
                      danoPorTurno: e.target.value.trim()
                        ? {
                            formula: e.target.value,
                            tipo: efeito.danoPorTurno?.tipo ?? "",
                            quando: efeito.danoPorTurno?.quando ?? "fim",
                          }
                        : null,
                    })
                  }
                />
              </label>
              {efeito.danoPorTurno && (
                <>
                  <label>
                    Quando
                    <select
                      value={efeito.danoPorTurno.quando}
                      onChange={(e) =>
                        onAtualizar({
                          danoPorTurno: { ...efeito.danoPorTurno!, quando: e.target.value === "inicio" ? "inicio" : "fim" },
                        })
                      }
                    >
                      <option value="fim">No fim do turno do afetado</option>
                      <option value="inicio">No início do turno do afetado</option>
                    </select>
                  </label>
                  <TiposDanoChips
                    className="bestiario-efeito-largo"
                    rotulo="Tipo desse dano (o primeiro marcado)"
                    value={efeito.danoPorTurno.tipo ? [efeito.danoPorTurno.tipo] : []}
                    onChange={(v) =>
                      onAtualizar({ danoPorTurno: { ...efeito.danoPorTurno!, tipo: v[v.length - 1] ?? "" } })
                    }
                  />
                </>
              )}
            </>
          )}
        </>
      );
    }
    case "livre":
      return (
        <label>
          O que acontece
          <textarea value={efeito.texto} onChange={(e) => onAtualizar({ texto: e.target.value })} placeholder="mecânica que não cabe nos outros tipos" />
        </label>
      );
  }
}
