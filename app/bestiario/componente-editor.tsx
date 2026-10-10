"use client";

import { useState } from "react";
import { FORMAS_AREA, META_EFEITO_ACAO, RECARGAS_ACAO, criarEfeitoAcao } from "./types";
import type { AtributoSalvaguarda, ComponentePayload, EfeitoAcao, EfeitoAcaoTipo, FormaArea, RecargaAcao, TemplateSerializado } from "./types";
import { ListaTextoInput, NumeroInput } from "./inputs";

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
export function ComponenteEditor({ item, condicoesDisponiveis, onAtualizar, onRemover }: Props) {
  return (
    <div className="bestiario-componente-card">
      <div className="bestiario-grid">
        <label>
          Nome
          <input value={item.nome} onChange={(e) => onAtualizar({ nome: e.target.value })} />
        </label>
        <label>
          Alcance
          <input
            value={item.alcance}
            placeholder="1,5 metro / 9-15 metros"
            onChange={(e) => onAtualizar({ alcance: e.target.value })}
          />
        </label>
        <label>
          Custo
          <input
            value={item.custo}
            placeholder="1 PP / 5-6 / 3 por dia"
            onChange={(e) => onAtualizar({ custo: e.target.value })}
          />
        </label>
      </div>

      <UsosLimitadosEditor
        usos={item.usos}
        recarga={item.recarga}
        onChange={(patch) => onAtualizar(patch)}
      />

      <EfeitosEditor
        efeitos={item.efeitos}
        condicoesDisponiveis={condicoesDisponiveis}
        onChange={(efeitos) => onAtualizar({ efeitos })}
      />

      <label>
        Descrição
        <textarea
          className="bestiario-textarea-descricao"
          value={item.descricao}
          onChange={(e) => onAtualizar({ descricao: e.target.value })}
        />
      </label>
      <button type="button" className="bestiario-btn-remover-item" onClick={onRemover}>
        <i className="fas fa-trash" /> Remover
      </button>
    </div>
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

const ATRIBUTOS = ["forca", "destreza", "constituicao", "sabedoria", "presenca", "vontade"] as const;

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
  return (
    <div className="bestiario-efeito-card" style={{ borderLeftColor: meta.cor }}>
      <div className="bestiario-efeito-topo" style={{ color: meta.cor }}>
        <i className={`fas ${meta.icone}`} />
        <strong>{meta.nome}</strong>
        <button type="button" className="bestiario-efeito-remover" onClick={onRemover} title="Remover efeito">
          <i className="fas fa-xmark" />
        </button>
      </div>
      <div className="bestiario-efeito-corpo">{renderCampos(efeito, condicoesDisponiveis, onAtualizar)}</div>
    </div>
  );
}

function renderCampos(
  efeito: EfeitoAcao,
  condicoesDisponiveis: TemplateSerializado[],
  onAtualizar: (patch: Partial<EfeitoAcao>) => void,
): React.ReactNode {
  switch (efeito.tipo) {
    case "ataque":
      return (
        <label>
          Bônus para atingir
          <input value={efeito.bonus} placeholder="+5" onChange={(e) => onAtualizar({ bonus: e.target.value })} />
        </label>
      );
    case "salvaguarda":
      return (
        <>
          <label>
            Atributo da salvaguarda (do alvo)
            <select value={efeito.atributo} onChange={(e) => onAtualizar({ atributo: e.target.value as AtributoSalvaguarda })}>
              {ATRIBUTOS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label>
            CD
            <NumeroInput value={efeito.cd} onChange={(v) => onAtualizar({ cd: v ?? 10 })} />
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
          <label>
            Tipo(s) — vírgula = escolha entre eles
            <ListaTextoInput list="tipos-dano-sugeridos" placeholder="Cortante" value={efeito.tipos} onChange={(v) => onAtualizar({ tipos: v })} />
          </label>
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
                      ? { condicaoId: escolhida.id, nome: escolhida.nome, descricao: escolhida.textoTemplate, cor: escolhida.formula.cor }
                      : { condicaoId: "", nome: "", descricao: "", cor: "" },
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
