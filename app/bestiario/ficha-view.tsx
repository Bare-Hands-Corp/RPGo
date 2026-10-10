"use client";

import Swal from "sweetalert2";
import { modificador, formatarMod } from "@/lib/op-rpg";
import { parseFormulaDados, rolarDados, type Dado } from "@/lib/dice";
import { empilharRolagem } from "@/lib/empilhar-rolagem";
import { destacarCondicoes } from "./destacar-condicoes";
import { CATEGORIAS_COMPONENTE } from "./types";
import type { CondicaoEfeito, ComponentePayload, CriaturaSerializada, EfeitoAcao } from "./types";

const D6: Dado = { faces: 6, sinal: 1 };

// Contador de usos de UMA cópia específica da criatura em combate
// (InstanciaCombate) — ausente = ficha só-leitura sem contador funcional
// (Bestiário puro, revisão do wizard). `usosAcoes` mapeia id do componente
// pros usos restantes; ausente nesse mapa = ainda não gastou nenhum (cheio).
export type UsosContexto = {
  usosAcoes: Record<string, number>;
  onDefinir: (componenteId: string, novoValor: number) => void;
};

const D20: Dado = { faces: 20, sinal: 1 };

function temDado(formula: string) {
  return parseFormulaDados(formula).dados.length > 0;
}

// Empilha uma rolagem simples de d20 + bônus fixo no Rolador (perícia,
// salvaguarda, teste de atributo…) — mesmo canal usado pelas habilidades
// de jogador, só que aqui o bônus já vem pronto (não passa por efeitos).
function rolarBonus(nomeCriatura: string, nome: string, bonus: number) {
  empilharRolagem({ dados: [D20], modificador: bonus, nomePreset: `${nomeCriatura}: ${nome}` });
}

function rolarAtaque(nomeCriatura: string, item: ComponentePayload, bonus: string) {
  const p = parseFormulaDados(bonus || "0");
  empilharRolagem({
    dados: [D20, ...p.dados],
    modificador: p.modificador,
    nomePreset: `${nomeCriatura}: ${item.nome || "Ataque"}`,
  });
}

function rolarDano(nomeCriatura: string, item: ComponentePayload, formula: string, tipos: string[]) {
  const p = parseFormulaDados(formula);
  if (p.dados.length === 0 && p.modificador === 0) return;
  const tipo = tipos.filter(Boolean).join(" ou ");
  empilharRolagem({
    dados: p.dados,
    modificador: p.modificador,
    nomePreset: `${nomeCriatura}: ${item.nome || "Dano"}${tipo ? ` (${tipo})` : ""}`,
  });
}

function rolarCura(nomeCriatura: string, item: ComponentePayload, formula: string) {
  const p = parseFormulaDados(formula);
  if (p.dados.length === 0) return;
  empilharRolagem({ dados: p.dados, modificador: p.modificador, nomePreset: `${nomeCriatura}: ${item.nome || "Cura"}` });
}

function rolarVida(c: CriaturaSerializada) {
  const p = parseFormulaDados(c.pvFormula);
  if (p.dados.length === 0) return;
  empilharRolagem({ dados: p.dados, modificador: p.modificador, nomePreset: `${c.nome}: Vida` });
}

function Atributo({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="bestiario-ficha-atributo">
      <span className="bestiario-ficha-atributo-label">{label}</span>
      <span className="bestiario-ficha-atributo-valor">
        {valor} <em>({formatarMod(modificador(valor))})</em>
      </span>
    </div>
  );
}

function textoDano(formula: string, tipos: string[]) {
  const f = formula.trim();
  const t = tipos.filter(Boolean).join(" ou ");
  if (!f) return t;
  return t ? `${f} ${t}` : f;
}

const FORMA_LABEL: Record<string, string> = {
  cone: "Cone",
  linha: "Linha",
  esfera: "Esfera",
  emanacao: "Emanação",
  cilindro: "Cilindro",
};

function BadgeEfeito({
  efeito,
  item,
  nomeCriatura,
  permitirRolagem,
}: {
  efeito: EfeitoAcao;
  item: ComponentePayload;
  nomeCriatura: string;
  permitirRolagem: boolean;
}) {
  switch (efeito.tipo) {
    case "ataque":
      if (!efeito.bonus.trim()) return null;
      return permitirRolagem ? (
        <button
          type="button"
          className="bestiario-ficha-badge bestiario-ficha-badge-rolavel"
          onClick={() => rolarAtaque(nomeCriatura, item, efeito.bonus)}
          title="Rolar ataque"
        >
          <i className="fas fa-dice" /> Ataque {efeito.bonus.trim()}
        </button>
      ) : (
        <span className="bestiario-ficha-badge">Ataque {efeito.bonus.trim()}</span>
      );
    case "salvaguarda":
      return (
        <span className="bestiario-ficha-badge">
          CD {efeito.cd} ({efeito.atributo})
        </span>
      );
    case "dano": {
      const texto = textoDano(efeito.formula, efeito.tipos);
      if (!texto) return null;
      return permitirRolagem ? (
        <button
          type="button"
          className="bestiario-ficha-badge bestiario-ficha-badge-rolavel"
          onClick={() => rolarDano(nomeCriatura, item, efeito.formula, efeito.tipos)}
          title="Rolar dano"
        >
          <i className="fas fa-dice" /> Dano: {texto}
        </button>
      ) : (
        <span className="bestiario-ficha-badge">Dano: {texto}</span>
      );
    }
    case "area":
      if (efeito.forma === "nenhuma") return null;
      return (
        <span className="bestiario-ficha-badge">
          Área: {FORMA_LABEL[efeito.forma]}
          {efeito.tamanho ? ` (${efeito.tamanho})` : ""}
        </span>
      );
    case "movimento":
      return (
        <span className="bestiario-ficha-badge">
          Movimento: {efeito.valor}m {efeito.tipoMov}
          {efeito.duracao ? ` (${efeito.duracao})` : ""}
        </span>
      );
    case "bonus_numerico":
      if (!efeito.alvo.trim()) return null;
      return (
        <span className="bestiario-ficha-badge">
          {efeito.alvo}: {formatarMod(efeito.valor)}
          {efeito.duracao ? ` (${efeito.duracao})` : ""}
        </span>
      );
    case "cura":
      if (!efeito.formula.trim()) return null;
      return permitirRolagem && temDado(efeito.formula) ? (
        <button
          type="button"
          className="bestiario-ficha-badge bestiario-ficha-badge-rolavel"
          onClick={() => rolarCura(nomeCriatura, item, efeito.formula)}
          title="Rolar cura"
        >
          <i className="fas fa-dice" /> Recupera {efeito.formula.trim()} PV
        </button>
      ) : (
        <span className="bestiario-ficha-badge">Recupera {efeito.formula.trim()} PV</span>
      );
    case "condicao":
      // Condições aparecem destacadas no texto da descrição, não como badge.
      return null;
    case "livre":
      if (!efeito.texto.trim()) return null;
      return <span className="bestiario-ficha-badge">{efeito.texto.trim()}</span>;
  }
}

function rolarRecarga(item: ComponentePayload, usosContexto: UsosContexto) {
  if (item.usos === null || item.recarga?.tipo !== "dado") return;
  const resultado = rolarDados([D6], 0).total;
  const recarregou = resultado >= item.recarga.minimo;
  void Swal.fire({
    icon: recarregou ? "success" : "info",
    title: `Rolou ${resultado} no d6`,
    text: recarregou ? `${item.nome || "Ação"} recarregou!` : `Precisa de ${item.recarga.minimo}+ — não recarregou.`,
    background: "var(--bg-card)",
    color: "var(--text-main)",
    timer: 2200,
  });
  if (recarregou) usosContexto.onDefinir(item.id, item.usos);
}

// Contador de usos — só interativo (botões de usar/recarregar) quando a
// ficha abre de dentro de um combate (usosContexto presente); fora disso
// mostra só o máximo cadastrado, sem contar nada (não faz sentido gastar
// uso de uma ficha "modelo" que não está numa mesa específica).
function ControleUsos({ item, usosContexto }: { item: ComponentePayload; usosContexto?: UsosContexto }) {
  if (item.usos === null) return null;
  if (!usosContexto) {
    return (
      <span className="bestiario-ficha-usos">
        <i className="fas fa-bolt-lightning" /> {item.usos} uso{item.usos === 1 ? "" : "s"}
      </span>
    );
  }

  const maximo = item.usos;
  const restantes = usosContexto.usosAcoes[item.id] ?? maximo;
  const esgotado = restantes <= 0;

  return (
    <span className="bestiario-ficha-usos">
      <button
        type="button"
        className={"bestiario-ficha-usos-btn" + (esgotado ? " esgotado" : "")}
        onClick={() => usosContexto.onDefinir(item.id, Math.max(0, restantes - 1))}
        disabled={esgotado}
        title="Usar"
      >
        <i className="fas fa-bolt-lightning" /> {restantes}/{maximo}
      </button>
      {item.recarga?.tipo === "dado" && (
        <button
          type="button"
          className="bestiario-ficha-dado-inline"
          onClick={() => rolarRecarga(item, usosContexto)}
          title={`Rolar recarga (${item.recarga.minimo}-6 no d6)`}
        >
          <i className="fas fa-dice" />
        </button>
      )}
      {item.recarga?.tipo === "manual" && restantes < maximo && (
        <button
          type="button"
          className="bestiario-ficha-dado-inline"
          onClick={() => usosContexto.onDefinir(item.id, maximo)}
          title="Restaurar usos (manual)"
        >
          <i className="fas fa-rotate" />
        </button>
      )}
    </span>
  );
}

type Props = {
  criatura: CriaturaSerializada;
  // Ausente = ficha só-leitura sem opção de editar (ex: aberta de dentro de
  // um combate em andamento, onde editar o cadastro não faz sentido).
  onEditar?: () => void;
  onFechar: () => void;
  // true só faz sentido em contexto de mesa (a Bandeja precisa estar montada
  // pra "pegar" a rolagem empilhada) — no Bestiário puro fica desligado.
  permitirRolagem?: boolean;
  // Presente só quando a ficha abre de dentro de um combate — é isso que
  // torna o contador de "usos limitados" funcional pra ESSA cópia específica
  // da criatura, em vez de só mostrar o máximo cadastrado.
  usosContexto?: UsosContexto;
};

export function FichaCriaturaView({ criatura: c, onEditar, onFechar, permitirRolagem = false, usosContexto }: Props) {
  const temSentidos = c.caracteristicas.percepcaoPassiva !== null || c.caracteristicas.sentidosExtras.trim() !== "";
  const temPericias = c.caracteristicas.pericias.length > 0;
  const temSalvaguardas = c.caracteristicas.salvaguardas.length > 0;
  const temResistencias =
    c.resistencias.danoResistencia.length > 0 ||
    c.resistencias.danoImunidade.length > 0 ||
    c.resistencias.danoVulneravel.length > 0 ||
    c.resistencias.condicaoImunidade.length > 0;
  const vidaRolavel = permitirRolagem && temDado(c.pvFormula);

  return (
    <div className="bestiario-ficha-view">
      <div className="bestiario-ficha-toolbar">
        {onEditar && (
          <button type="button" className="bestiario-btn-salvar" onClick={onEditar}>
            <i className="fas fa-pen" /> Editar
          </button>
        )}
        <button type="button" className="bestiario-ficha-fechar" onClick={onFechar} title="Fechar">
          <i className="fas fa-xmark" />
        </button>
      </div>

      <div className="bestiario-ficha-cabecalho">
        <h2>{c.nome}</h2>
        <p className="bestiario-ficha-subtitulo">
          {[c.tamanho, c.categoria].filter(Boolean).join(" · ") || "Sem categoria"}
        </p>
        {c.tags.length > 0 && (
          <div className="bestiario-ficha-tags">
            {c.tags.map((t) => (
              <span key={t} className="bestiario-ficha-tag">
                {t}
              </span>
            ))}
          </div>
        )}
        {c.personalidade && <p className="bestiario-ficha-personalidade">{c.personalidade}</p>}
      </div>

      <div className="bestiario-ficha-stats">
        <div className="bestiario-ficha-stat">
          <span>ND</span>
          <strong>
            {c.nd} ({c.xp} XP)
          </strong>
        </div>
        <div className="bestiario-ficha-stat">
          <span>Pontos de Poder</span>
          <strong>{c.pontosPoder}</strong>
        </div>
        <div className="bestiario-ficha-stat">
          <span>Classe de Resistência</span>
          <strong>{c.classeResistencia}</strong>
        </div>
        <div className="bestiario-ficha-stat">
          <span>Classe de Dificuldade</span>
          <strong>{c.classeDificuldade}</strong>
        </div>
        <div className="bestiario-ficha-stat">
          <span>Pontos de Vida</span>
          <strong>
            {c.pvMedio}
            {c.pvFormula ? ` (${c.pvFormula})` : ""}
            {vidaRolavel && (
              <button
                type="button"
                className="bestiario-ficha-dado-inline"
                onClick={() => rolarVida(c)}
                title={`Rolar vida (${c.pvFormula})`}
              >
                <i className="fas fa-dice" />
              </button>
            )}
          </strong>
        </div>
        <div className="bestiario-ficha-stat">
          <span>Bônus de Proficiência</span>
          <strong>{formatarMod(c.bonusProficiencia)}</strong>
        </div>
        <div className="bestiario-ficha-stat">
          <span>Deslocamento</span>
          <strong>
            {c.deslocamento}m
            {c.deslocamentoNado != null ? `, nado ${c.deslocamentoNado}m` : ""}
            {c.deslocamentoVoo != null ? `, voo ${c.deslocamentoVoo}m` : ""}
          </strong>
        </div>
      </div>

      <div className="bestiario-ficha-atributos">
        <Atributo label="Força" valor={c.forca} />
        <Atributo label="Destreza" valor={c.destreza} />
        <Atributo label="Constituição" valor={c.constituicao} />
        <Atributo label="Sabedoria" valor={c.sabedoria} />
        <Atributo label="Presença" valor={c.presenca} />
        <Atributo label="Vontade" valor={c.vontade} />
      </div>

      {(temPericias || temSalvaguardas || temSentidos) && (
        <div className="bestiario-ficha-secao">
          {temPericias && (
            <div className="bestiario-ficha-linha-testes">
              <strong>Perícias.</strong>
              <div className="bestiario-ficha-testes-lista">
                {c.caracteristicas.pericias.map((p) => (
                  <span key={p.id} className="bestiario-ficha-teste">
                    {p.nome} {formatarMod(p.bonus)}
                    {permitirRolagem && (
                      <button
                        type="button"
                        className="bestiario-ficha-dado-inline"
                        onClick={() => rolarBonus(c.nome, p.nome, p.bonus)}
                        title="Rolar"
                      >
                        <i className="fas fa-dice" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {temSalvaguardas && (
            <div className="bestiario-ficha-linha-testes">
              <strong>Salvaguardas.</strong>
              <div className="bestiario-ficha-testes-lista">
                {c.caracteristicas.salvaguardas.map((s) => (
                  <span key={s.id} className="bestiario-ficha-teste">
                    {s.nome} {formatarMod(s.bonus)}
                    {permitirRolagem && (
                      <button
                        type="button"
                        className="bestiario-ficha-dado-inline"
                        onClick={() => rolarBonus(c.nome, s.nome, s.bonus)}
                        title="Rolar"
                      >
                        <i className="fas fa-dice" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {temSentidos && (
            <p>
              <strong>Sentidos.</strong>{" "}
              {[
                c.caracteristicas.percepcaoPassiva !== null ? `Percepção Passiva ${c.caracteristicas.percepcaoPassiva}` : null,
                c.caracteristicas.sentidosExtras || null,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
        </div>
      )}

      {temResistencias && (
        <div className="bestiario-ficha-secao">
          {c.resistencias.danoResistencia.length > 0 && (
            <p>
              <strong>Resistência a dano.</strong> {c.resistencias.danoResistencia.join(", ")}
            </p>
          )}
          {c.resistencias.danoImunidade.length > 0 && (
            <p>
              <strong>Imunidade a dano.</strong> {c.resistencias.danoImunidade.join(", ")}
            </p>
          )}
          {c.resistencias.danoVulneravel.length > 0 && (
            <p>
              <strong>Vulnerabilidade a dano.</strong> {c.resistencias.danoVulneravel.join(", ")}
            </p>
          )}
          {c.resistencias.condicaoImunidade.length > 0 && (
            <p>
              <strong>Imunidade a condição.</strong> {c.resistencias.condicaoImunidade.join(", ")}
            </p>
          )}
        </div>
      )}

      {CATEGORIAS_COMPONENTE.map(({ key, label, icone }) => {
        const itens = c.componentes.filter((item) => item.categoria === key);
        if (itens.length === 0) return null;
        return (
          <div key={key} className="bestiario-ficha-secao">
            <h3>
              <i className={`fas ${icone}`} /> {label}
            </h3>
            {itens.map((item) => {
              const condicoes = item.efeitos.filter((e): e is CondicaoEfeito => e.tipo === "condicao");
              return (
                <div key={item.id} className="bestiario-ficha-componente">
                  <div className="bestiario-ficha-componente-topo">
                    <p className="bestiario-ficha-componente-nome">{item.nome || "(sem nome)"}</p>
                    {item.usos !== null && <ControleUsos item={item} usosContexto={usosContexto} />}
                  </div>
                  <div className="bestiario-ficha-badges">
                    {item.efeitos.map((efeito) => (
                      <BadgeEfeito
                        key={efeito.id}
                        efeito={efeito}
                        item={item}
                        nomeCriatura={c.nome}
                        permitirRolagem={permitirRolagem}
                      />
                    ))}
                    {item.alcance.trim() && <span className="bestiario-ficha-badge">Alcance: {item.alcance.trim()}</span>}
                    {item.custo.trim() && <span className="bestiario-ficha-badge">Custo: {item.custo.trim()}</span>}
                  </div>
                  {(item.descricao || condicoes.length > 0) && (
                    <p className="bestiario-ficha-descricao">{destacarCondicoes(item.descricao, condicoes)}</p>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {c.loot && (
        <div className="bestiario-ficha-secao">
          <h3>
            <i className="fas fa-sack-dollar" /> Loot
          </h3>
          <p className="bestiario-ficha-descricao">{c.loot}</p>
        </div>
      )}

      {c.anotacoesPrivadas && (
        <div className="bestiario-ficha-secao">
          <h3>
            <i className="fas fa-feather" /> Anotações do narrador
          </h3>
          <p className="bestiario-ficha-descricao">{c.anotacoesPrivadas}</p>
        </div>
      )}
    </div>
  );
}
