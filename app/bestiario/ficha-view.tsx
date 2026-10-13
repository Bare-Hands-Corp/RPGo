"use client";

import { useMemo } from "react";
import { ChipEfeito, NomesRecursoContext } from "@/app/ficha/[uid]/efeitos-editor";
import { modificador, formatarMod } from "@/lib/op-rpg";
import { nomeDoTamanho } from "./campos-criatura";
import { ChipCondicao, separarCondicoes } from "./destacar-condicoes";
import { RecursoBarra } from "./recursos-editor";
import { ChipTipoDano } from "./tipos-dano-chips";
import { IconeTipoDano } from "@/components/tipos-dano/tipos-dano";
import { CATEGORIAS_COMPONENTE } from "./types";
import { ataquesPorTurno, margemDeCritico, ppDoCusto, textoEfeitoAcao, textoTecnica } from "./utils";
import type { AtributoSalvaguarda, CondicaoEfeito, ComponentePayload, CriaturaSerializada, EfeitoAcao } from "./types";

function Atributo({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="bestiario-ficha-atributo">
      <span className="bestiario-ficha-atributo-label">{label}</span>
      <strong className="bestiario-ficha-atributo-mod">{formatarMod(modificador(valor))}</strong>
      <span className="bestiario-ficha-atributo-valor">{valor}</span>
    </div>
  );
}

// Número de destaque do topo da ficha (PV, CR, CD...).
function Vital({
  icone,
  rotulo,
  valor,
  detalhe,
  tom,
}: {
  icone: string;
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: string;
  tom?: string;
}) {
  return (
    <div className="bestiario-ficha-vital" style={tom ? ({ "--vital-cor": tom } as React.CSSProperties) : undefined}>
      <span className="bestiario-ficha-vital-rotulo">
        <i className={`fas ${icone}`} /> {rotulo}
      </span>
      <strong>{valor}</strong>
      {detalhe && <small>{detalhe}</small>}
    </div>
  );
}

// Linha de defesa: o que a criatura resiste, ignora ou sofre em dobro.
function Defesa({
  icone,
  rotulo,
  itens,
  tom,
  deDano = false,
}: {
  icone: string;
  rotulo: string;
  itens: string[];
  tom: string;
  // Tipo de dano ganha a cor e o ícone do catálogo do narrador.
  deDano?: boolean;
}) {
  if (itens.length === 0) return null;
  return (
    <div className="bestiario-ficha-linha-testes" style={{ "--defesa-cor": tom } as React.CSSProperties}>
      <strong>
        <i className={`fas ${icone}`} /> {rotulo}
      </strong>
      <div className="bestiario-ficha-testes-lista">
        {itens.map((t) =>
          deDano ? (
            <ChipTipoDano key={t} tipo={t} className="bestiario-ficha-defesa" />
          ) : (
            <span key={t} className="bestiario-ficha-defesa">
              {t}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

function textoDano(formula: string, tipos: string[]) {
  const f = formula.trim();
  const t = tipos.filter(Boolean).join(" ou ");
  if (!f) return t;
  return t ? `${f} ${t}` : f;
}

// Custo em PP, como o combate cobra; texto antigo sem PP aparece como veio.
function textoCusto(custo: string) {
  const pp = ppDoCusto(custo);
  return pp > 0 ? `${pp} PP` : custo;
}

const FORMA_LABEL: Record<string, string> = {
  cone: "Cone",
  linha: "Linha",
  esfera: "Esfera",
  emanacao: "Emanação",
  cilindro: "Cilindro",
};

const SIGLA_SALV: Record<AtributoSalvaguarda, string> = {
  forca: "FOR",
  destreza: "DES",
  constituicao: "CON",
  sabedoria: "SAB",
  presenca: "PRE",
  vontade: "VON",
};

// Stat de uma linha do card — mesmo desenho dos `acao-stat` da ficha do
// jogador (ícone + texto, sem caixa). Esta ficha é de consulta: as rolagens
// e o uso das ações ficam na ficha de combate (narrador/sessao/ficha-combate).
function Stat({ icone, children }: { icone: string; children: React.ReactNode }) {
  return (
    <span className="bestiario-acao-stat">
      <i className={`fas ${icone}`} /> {children}
    </span>
  );
}

function StatEfeito({ efeito }: { efeito: EfeitoAcao }) {
  switch (efeito.tipo) {
    case "ataque":
      if (!efeito.bonus.trim()) return null;
      return (
        <Stat icone="fa-crosshairs">
          Acerto <strong>{efeito.bonus.trim()}</strong>
        </Stat>
      );
    case "salvaguarda":
      return (
        <Stat icone="fa-shield-halved">
          Salv {SIGLA_SALV[efeito.atributo] ?? efeito.atributo} CD <strong>{efeito.cd}</strong>
          {efeito.metade ? " (metade se passar)" : ""}
        </Stat>
      );
    case "dano": {
      if (!textoDano(efeito.formula, efeito.tipos)) return null;
      const tipos = efeito.tipos.filter(Boolean);
      return (
        <Stat icone="fa-burst">
          {efeito.formula.trim() && <strong>{efeito.formula.trim()}</strong>}
          {tipos.map((t, i) => (
            <span key={t} className="bestiario-acao-tipo-dano">
              {i > 0 && "ou "}
              <IconeTipoDano tipo={t} /> {t}
            </span>
          ))}
        </Stat>
      );
    }
    case "area":
      if (efeito.forma === "nenhuma") return null;
      return (
        <Stat icone="fa-circle-notch">
          {FORMA_LABEL[efeito.forma]}
          {efeito.tamanho ? ` ${efeito.tamanho}` : ""}
        </Stat>
      );
    case "movimento":
      return (
        <Stat icone="fa-person-running">
          <strong>{efeito.valor}m</strong> {efeito.tipoMov}
          {efeito.duracao ? ` (${efeito.duracao})` : ""}
        </Stat>
      );
    case "bonus_numerico":
      if (!efeito.alvo.trim()) return null;
      return (
        <Stat icone="fa-plus-minus">
          {efeito.alvo} <strong>{formatarMod(efeito.valor)}</strong>
          {efeito.duracao ? ` (${efeito.duracao})` : ""}
        </Stat>
      );
    case "cura": {
      if (!efeito.formula.trim()) return null;
      return (
        <Stat icone="fa-heart">
          Recupera <strong>{efeito.formula.trim()}</strong> PV
        </Stat>
      );
    }
    case "condicao": {
      // A condição aparece destacada na descrição; aqui só o dano que ela traz.
      const texto = textoEfeitoAcao(efeito);
      return texto ? <Stat icone="fa-droplet">{texto}</Stat> : null;
    }
    case "livre":
      if (!efeito.texto.trim()) return null;
      return <Stat icone="fa-feather">{efeito.texto.trim()}</Stat>;
  }
}

// Usos limitados da ação. O contador de cada cópia em combate fica na ficha de combate.
function Usos({ item }: { item: ComponentePayload }) {
  if (item.usos === null) return null;
  const recarga =
    item.recarga?.tipo === "dado"
      ? `recarga ${item.recarga.minimo >= 6 ? "6" : `${item.recarga.minimo}-6`}`
      : item.recarga?.tipo === "combate"
        ? "por combate"
        : item.recarga?.tipo === "turno"
          ? "por turno"
          : null;
  return (
    <span className="bestiario-ficha-usos">
      <i className="fas fa-bolt-lightning" /> {item.usos} uso{item.usos === 1 ? "" : "s"}
      {recarga ? ` · ${recarga}` : ""}
    </span>
  );
}

type Props = {
  criatura: CriaturaSerializada;
  // Ausente = ficha só-leitura sem opção de editar (ex: aberta de dentro de
  // um combate em andamento, onde editar o cadastro não faz sentido).
  onEditar?: () => void;
  // Ausente = prévia (a revisão do wizard), sem barra de botões.
  onFechar?: () => void;
};

export function FichaCriaturaView({ criatura: c, onEditar, onFechar }: Props) {
  const temSentidos = c.caracteristicas.percepcaoPassiva !== null || c.caracteristicas.sentidosExtras.trim() !== "";
  const temPericias = c.caracteristicas.pericias.length > 0;
  const temSalvaguardas = c.caracteristicas.salvaguardas.length > 0;
  const temResistencias =
    c.resistencias.danoResistencia.length > 0 ||
    c.resistencias.danoImunidade.length > 0 ||
    c.resistencias.danoVulneravel.length > 0 ||
    c.resistencias.condicaoImunidade.length > 0;
  const nomesRecurso = useMemo(() => new Map(c.recursos.map((r) => [r.id, r.nome])), [c.recursos]);
  const deslocamentos = [
    c.deslocamentoNado != null ? `nado ${c.deslocamentoNado}m` : null,
    c.deslocamentoVoo != null ? `voo ${c.deslocamentoVoo}m` : null,
  ].filter(Boolean);

  return (
    <div className="bestiario-ficha-view">
      {(onEditar || onFechar) && (
        <div className="bestiario-ficha-toolbar">
          {onEditar && (
            <button type="button" className="bestiario-btn-salvar" onClick={onEditar}>
              <i className="fas fa-pen" /> Editar
            </button>
          )}
          {onFechar && (
            <button type="button" className="bestiario-ficha-fechar" onClick={onFechar} title="Fechar" aria-label="Fechar a ficha">
              <i className="fas fa-xmark" />
            </button>
          )}
        </div>
      )}

      <div className="bestiario-ficha-cabecalho com-retrato">
        <span className="bestiario-ficha-retrato" aria-hidden>
          {c.imagemUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.imagemUrl} alt="" />
          ) : (
            <i className="fas fa-skull" />
          )}
        </span>
        <div className="bestiario-ficha-identidade">
          <h2>{c.nome || "(sem nome)"}</h2>
          <p className="bestiario-ficha-subtitulo">
            {[nomeDoTamanho(c.tamanho), c.categoria, c.linhagem].filter(Boolean).join(" · ") || "Sem categoria"}
          </p>
          {c.personalidade && <p className="bestiario-ficha-personalidade">{c.personalidade}</p>}
          {c.tags.length > 0 && (
            <div className="bestiario-ficha-tags">
              {c.tags.map((t) => (
                <span key={t} className="bestiario-ficha-tag">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="bestiario-ficha-nd">
          <span>ND</span>
          <strong>{c.nd}</strong>
          <small>{c.xp} XP</small>
        </div>
      </div>

      <div className="bestiario-ficha-vitais">
        <Vital
          icone="fa-heart"
          rotulo="Pontos de Vida"
          valor={c.pvMedio}
          detalhe={c.pvFormula || undefined}
          tom="var(--bar-hp)"
        />
        {c.pontosPoder > 0 && (
          <Vital icone="fa-bolt" rotulo="Pontos de Poder" valor={c.pontosPoder} tom="var(--color-padrao)" />
        )}
        <Vital icone="fa-shield-halved" rotulo="Resistência (CR)" valor={c.classeResistencia} />
        <Vital icone="fa-bullseye" rotulo="Dificuldade (CD)" valor={c.classeDificuldade} />
        <Vital icone="fa-medal" rotulo="Proficiência" valor={formatarMod(c.bonusProficiencia)} />
        <Vital
          icone="fa-person-running"
          rotulo="Deslocamento"
          valor={`${c.deslocamento}m`}
          detalhe={deslocamentos.join(" · ") || undefined}
        />
      </div>

      <div className="bestiario-ficha-atributos">
        <Atributo label="FOR" valor={c.forca} />
        <Atributo label="DES" valor={c.destreza} />
        <Atributo label="CON" valor={c.constituicao} />
        <Atributo label="SAB" valor={c.sabedoria} />
        <Atributo label="PRE" valor={c.presenca} />
        <Atributo label="VON" valor={c.vontade} />
      </div>

      {c.recursos.length > 0 && (
        <div className="bestiario-ficha-secao">
          <h3>
            <i className="fas fa-droplet" /> Recursos
          </h3>
          <div className="bestiario-ficha-recursos">
            {c.recursos.map((r) => (
              <RecursoBarra key={r.id} recurso={r} />
            ))}
          </div>
        </div>
      )}

      {(temPericias || temSalvaguardas || temSentidos) && (
        <div className="bestiario-ficha-secao">
          <h3>
            <i className="fas fa-check-double" /> Testes e sentidos
          </h3>
          {temSalvaguardas && (
            <div className="bestiario-ficha-linha-testes">
              <strong>Salvaguardas</strong>
              <div className="bestiario-ficha-testes-lista">
                {c.caracteristicas.salvaguardas.map((s) => (
                  <span key={s.id} className="bestiario-ficha-teste">
                    {s.nome} <b>{formatarMod(s.bonus)}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
          {temPericias && (
            <div className="bestiario-ficha-linha-testes">
              <strong>Perícias</strong>
              <div className="bestiario-ficha-testes-lista">
                {c.caracteristicas.pericias.map((p) => (
                  <span key={p.id} className="bestiario-ficha-teste">
                    {p.nome} <b>{formatarMod(p.bonus)}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
          {temSentidos && (
            <div className="bestiario-ficha-linha-testes">
              <strong>Sentidos</strong>
              <div className="bestiario-ficha-testes-lista">
                {c.caracteristicas.percepcaoPassiva !== null && (
                  <span className="bestiario-ficha-teste">
                    Percepção Passiva <b>{c.caracteristicas.percepcaoPassiva}</b>
                  </span>
                )}
                {c.caracteristicas.sentidosExtras.trim() && (
                  <span className="bestiario-ficha-teste">{c.caracteristicas.sentidosExtras.trim()}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {temResistencias && (
        <div className="bestiario-ficha-secao">
          <h3>
            <i className="fas fa-shield" /> Defesas
          </h3>
          <Defesa icone="fa-shield-halved" rotulo="Resiste" itens={c.resistencias.danoResistencia} tom="var(--info)" deDano />
          <Defesa icone="fa-ban" rotulo="Imune" itens={c.resistencias.danoImunidade} tom="var(--success)" deDano />
          <Defesa icone="fa-heart-crack" rotulo="Vulnerável" itens={c.resistencias.danoVulneravel} tom="var(--danger)" deDano />
          <Defesa
            icone="fa-triangle-exclamation"
            rotulo="Imune a condição"
            itens={c.resistencias.condicaoImunidade}
            tom="var(--warning)"
          />
        </div>
      )}

      <NomesRecursoContext.Provider value={nomesRecurso}>
        {CATEGORIAS_COMPONENTE.map(({ key, label, icone, cor }) => {
          const itens = c.componentes.filter((item) => item.categoria === key);
          if (itens.length === 0) return null;
          return (
            <div key={key} className="bestiario-ficha-secao" style={{ "--acao-cor": cor } as React.CSSProperties}>
              <h3>
                <i className={`fas ${icone}`} /> {label}
                <span className="bestiario-componente-total">{itens.length}</span>
                {key === "acao" && ataquesPorTurno(c.componentes) > 1 && (
                  <span className="bestiario-ficha-nota">{ataquesPorTurno(c.componentes)} ataques por turno</span>
                )}
                {key === "acaoLendaria" && c.acoesLendarias > 0 && (
                  <span className="bestiario-ficha-nota">{c.acoesLendarias} por rodada</span>
                )}
              </h3>
              <div className="bestiario-acao-grid">
                {itens.map((item) => {
                  const condicoes = item.efeitos.filter((e): e is CondicaoEfeito => e.tipo === "condicao");
                  const stats = item.efeitos.map((efeito) => <StatEfeito key={efeito.id} efeito={efeito} />);
                  const alcance = item.alcance.trim();
                  const custo = item.custo.trim();
                  // Condições citadas no texto ficam destacadas nele; as que não
                  // aparecem viram chip no rodapé, junto dos efeitos de ficha.
                  const { conteudo: descricao, faltantes } = separarCondicoes(item.descricao, condicoes);
                  return (
                    <div key={item.id} className="bestiario-acao-card">
                      <div className="bestiario-acao-topo">
                        <div className="bestiario-acao-titulo">{item.nome || "(sem nome)"}</div>
                        <Usos item={item} />
                        {key === "acaoLendaria" && item.custoLendario > 1 && (
                          <span className="bestiario-ficha-usos">custa {item.custoLendario}</span>
                        )}
                        {custo && <span className="bestiario-acao-tag-custo">{textoCusto(custo)}</span>}
                      </div>
                      <div className="bestiario-acao-stats">
                        {item.tecnica && <Stat icone="fa-wand-magic-sparkles">{textoTecnica(item)}</Stat>}
                        {item.efeitos.some((e) => e.tipo === "ataque") && margemDeCritico(c.componentes, item) < 20 && (
                          <Stat icone="fa-burst">
                            Crítico <strong>{margemDeCritico(c.componentes, item)}-20</strong>
                          </Stat>
                        )}
                        {stats}
                        {alcance && <Stat icone="fa-ruler-horizontal">{alcance}</Stat>}
                      </div>
                      {item.descricao && <div className="bestiario-acao-desc">{descricao}</div>}
                      {(item.efeitosExtras.length > 0 || faltantes.length > 0) && (
                        <div className="bestiario-acao-tags">
                          {faltantes.map((cond) => (
                            <ChipCondicao key={cond.id} cond={cond} />
                          ))}
                          {item.efeitosExtras.map((e, i) => (
                            <ChipEfeito key={i} efeito={e} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </NomesRecursoContext.Provider>

      {c.loot && (
        <div className="bestiario-ficha-secao">
          <h3>
            <i className="fas fa-sack-dollar" /> Loot
          </h3>
          <p className="bestiario-ficha-descricao">{c.loot}</p>
        </div>
      )}

      {c.anotacoesPrivadas && (
        <div className="bestiario-ficha-secao bestiario-ficha-privado">
          <h3>
            <i className="fas fa-feather" /> Anotações do narrador
          </h3>
          <p className="bestiario-ficha-descricao">{c.anotacoesPrivadas}</p>
        </div>
      )}
    </div>
  );
}
