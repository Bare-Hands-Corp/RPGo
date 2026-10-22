"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DescricaoRecolhivel } from "@/app/ficha/[uid]/descricao-recolhivel";
import { ThemeButton } from "@/components/temas/theme-button";
import { CardMeta } from "@/components/card-meta";
import { CardNumero, CardNumeros } from "@/components/card-numeros";
import { Tooltip } from "@/components/tooltip";
import { tipoDanoDe } from "@/components/descricao-rica/atomos";
import { resolvedorDaFicha, type ContextoRico } from "@/components/descricao-rica/atomos";
import { DescricaoCard, type ModoDescricaoCard } from "@/components/descricao-rica/descricao-card";
import { EVENTO_EMPILHAR, empilharRolagem } from "@/lib/empilhar-rolagem";
import type { Dado } from "@/lib/dice";
import type { TipoDanoCatalogo } from "@/lib/tipos-dano";
import { META_EFEITOS, type TipoEfeito } from "@/lib/op-rpg";
import "@/app/ficha/[uid]/ficha.css";
import "./card-acao.css";

// Dados de mentira. Na integração vêm da ação, da ficha e da Biblioteca.
const FICHA: Record<string, number> = { FOR: 3, DES: 1, CON: 2, SAB: 0, VON: 1, PRE: 0, PROF: 2, NIVEL: 5, GRAU: 2 };
const CONTEXTO: ContextoRico = {
  refs: {
    "acao:a2": { titulo: "Investida", texto: "Move até o deslocamento e ataca.", selo: "Poderosa" },
    "hab:h1": { titulo: "Pernas de Teste", texto: "Andar +3m. Ação Extra Bônus.", selo: "Passiva" },
  },
  condicoes: [
    { nome: "Atordoado", descricao: "Não age no próximo turno; ataques contra você têm vantagem.", cor: "#e67e22" },
    { nome: "Caído", descricao: "Metade do deslocamento para levantar." },
    { nome: "Envenenado", descricao: "Desvantagem em ataques e testes.", cor: "#8e44ad" },
  ],
  resolverFormula: resolvedorDaFicha({ valor: (s) => FICHA[s] ?? 0, nivel: FICHA.NIVEL }),
};

type Tipo = "padrao" | "bonus" | "power" | "react" | "livre";
export type DadosCard = {
  id: string;
  tipo: Tipo;
  nome: string;
  grau?: number;
  duracao?: string;
  gatilho?: string;
  acerto?: number;
  dano?: string;
  tipoDano?: string;
  cd?: string;
  alcance?: string;
  efeitos?: { slug: TipoEfeito; resumo?: string }[];
  texto: string;
  custos: string[];
  origem?: string;
  // Habilidade: a cor da borda vem do tipo dela (passiva/ativa/reativa), não da ação.
  classeTipo?: string;
  // A descrição já cita a salvaguarda (chip "DES | CD 18"): o número não repete.
  cdNaDescricao?: boolean;
  // Rolagens já resolvidas com a ficha (a fórmula "2d6+FOR" não se rola crua).
  rolagemDano?: { dados: Dado[]; modificador: number };
};

const TEXTO_TECNICA =
  "## Efeito\n" +
  "-:skull: Causa ((2d6+FOR|Fogo)) de dano {{dano:Fogo}} e **{{cor:#e67e22:neon|queima}}** o alvo\n" +
  "-:skull: Alvo fica {{cond:Atordoado}} até o fim do *próximo turno*\n" +
  "  -:skull: Se cair, também {{cond:Caído}}\n" +
  "-:skull: Você ganha {{efeito:vantagem}} e {{efeito:resistencia|Fogo}} neste turno\n" +
  "## Passo a passo\n" +
  "1. Escolha o alvo e use [[acao:a2|Investida]]\n" +
  "1. Gaste o PP da técnica\n" +
  "> Combina com [[hab:h1|Pernas de Teste]]. {{cor:#e74c3c+#f39c12:gradiente|Não acumula}} com outras técnicas.";

// Como a mesma descrição é escrita hoje: texto puro.
const TEXTO_ATUAL =
  "Causa 2d6+FOR de dano de Fogo e queima o alvo.\n" +
  "- Alvo fica Atordoado até o fim do próximo turno (se cair, também Caído)\n" +
  "- Você ganha vantagem e resistência a Fogo neste turno\n" +
  "Passo a passo: escolha o alvo e use Investida; gaste o PP da técnica.\n" +
  "Combina com Pernas de Teste. Não acumula com outras técnicas.";

const METEORO: DadosCard = {
  id: "meteoro",
  tipo: "power",
  nome: "Golpe Meteoro",
  grau: 2,
  duracao: "1 turno",
  acerto: 5,
  dano: "2d6+3",
  tipoDano: "fogo",
  cd: "Salv DES CD 14",
  alcance: "6 m",
  efeitos: [
    { slug: "vantagem", resumo: "em ataques" },
    { slug: "resistencia", resumo: "Fogo" },
  ],
  texto: TEXTO_TECNICA,
  custos: ["3 PP", "1 ação poderosa"],
};

const CARDS: DadosCard[] = [
  {
    id: "reacao",
    tipo: "react",
    nome: "Esquiva Reflexa",
    gatilho: "Aliado alvo de ataque",
    efeitos: [{ slug: "reducao_dano", resumo: "1d8+CON" }],
    texto:
      "Reduz o dano em ((1d8+CON|Cortante)) e {{efeito:interceptar}} o golpe.\n" +
      "-:shield-halved: Só vale contra ataques **corpo a corpo**\n" +
      "-:shield-halved: Se o dano chegar a zero, o alvo não fica {{cond:Atordoado}}",
    custos: ["1 PP", "1 reação"],
  },
  {
    id: "passiva",
    tipo: "livre",
    nome: "Pernas de Teste",
    texto: "Andar **+3m** e nadar vira 6m. Dá {{efeito:acao_extra}} de bônus.",
    custos: [],
  },
  {
    id: "legada",
    tipo: "padrao",
    nome: "Soco de Teste",
    acerto: 5,
    dano: "1d4+3",
    tipoDano: "contundente",
    alcance: "1,5 m",
    texto: "Ataque corpo a corpo com FOR. Causa 1d4+FOR de dano contundente. Descrição antiga, escrita só com texto.",
    custos: ["1 ação padrão"],
  },
  {
    id: "longa",
    tipo: "bonus",
    nome: "Haki do Armamento: Endurecer",
    grau: 3,
    duracao: "até o fim da cena",
    efeitos: [
      { slug: "resistencia", resumo: "Cortante" },
      { slug: "modificador", resumo: "+2 CA" },
    ],
    texto:
      "## Efeito\n" +
      "-:skull: Reveste o corpo e ganha {{efeito:resistencia|Cortante}} e {{efeito:resistencia|Perfurante}}\n" +
      "-:skull: **+2** na CA enquanto o Haki durar\n" +
      "-:skull: Seus socos causam +((1d4|Contundente)) de dano {{dano:Contundente}}\n" +
      "-:skull: Alvo que errar o ataque fica {{cond:Envenenado}} por *1 turno*\n" +
      "## Manutenção\n" +
      "1. Gasta 1 PP no começo de cada turno\n" +
      "1. Sem PP, o Haki acaba e você fica {{cond:Atordoado}}\n" +
      "> Não funciona em conjunto com {{cor:#9b59b6|Haki da Observação}} no mesmo turno.\n" +
      "## Aprimoramento\n" +
      "-:fire: No 5º grau, o dano extra vira ((2d4|Contundente))",
    custos: ["2 PP", "1 ação bônus"],
    origem: "Haki do Armamento",
  },
];

export function ChipEfeitoEstatico({ slug, resumo }: { slug: TipoEfeito; resumo?: string }) {
  const meta = META_EFEITOS[slug];
  return (
    <span
      className="efeito-chip"
      style={{
        background: `color-mix(in oklch, ${meta.cor} 15%, transparent)`,
        color: meta.cor,
        borderColor: `color-mix(in oklch, ${meta.cor} 35%, transparent)`,
      }}
    >
      <i className={`fas ${meta.icone}`} />
      <span className="efeito-chip-label">{meta.nome}</span>
      {resumo && <span className="efeito-chip-resumo">{resumo}</span>}
    </span>
  );
}

// O card igual ao de hoje (mesmas classes); só a descrição muda.
function Card({ d, descricao, aoUsar }: { d: DadosCard; descricao: ReactNode; aoUsar: (n: string) => void }) {
  const dados = (formula: string) => ({
    dados: formula.includes("d") ? [{ faces: Number(formula.split("d")[1].split("+")[0]), sinal: 1 as const }] : [],
    mod: Number(formula.split("+")[1] ?? 0),
  });
  return (
    <div className={`action-card type-${d.tipo}`}>
      <div>
        <div className="card-title">{d.nome}</div>
        <div className="acao-stats">
          {d.grau != null && (
            <span className="acao-stat acao-tecnica">
              <i className="fas fa-wand-magic-sparkles" /> Técnica {d.grau}º grau
            </span>
          )}
          {d.duracao && (
            <span className="acao-stat">
              <i className="fas fa-hourglass-half" /> {d.duracao}
            </span>
          )}
          {d.gatilho && (
            <span className="acao-stat">
              <i className="fas fa-bell" /> {d.gatilho}
            </span>
          )}
          {d.acerto != null && (
            <button
              type="button"
              className="acao-stat acao-rolar"
              onClick={() => empilharRolagem({ dados: [{ faces: 20, sinal: 1 }], modificador: d.acerto, nomePreset: `${d.nome}: acerto` })}
            >
              <i className="fas fa-crosshairs" /> Acerto <strong>+{d.acerto}</strong>
            </button>
          )}
          {d.dano && (
            <button
              type="button"
              className="acao-stat acao-rolar"
              onClick={() => {
                const x = dados(d.dano!);
                empilharRolagem({
                  dados: Array.from({ length: Number(d.dano!.split("d")[0]) || 1 }, () => x.dados[0]),
                  modificador: x.mod,
                  nomePreset: `${d.nome}: dano`,
                });
              }}
            >
              <i className="fas fa-burst" /> {d.dano} {d.tipoDano}
            </button>
          )}
          {d.cd && (
            <span className="acao-stat">
              <i className="fas fa-shield-alt" /> {d.cd}
            </span>
          )}
          {d.alcance && (
            <span className="acao-stat">
              <i className="fas fa-ruler-horizontal" /> {d.alcance}
            </span>
          )}
        </div>
        {d.efeitos && (
          <div className="efeito-chips">
            {d.efeitos.map((e) => (
              <ChipEfeitoEstatico key={e.slug + (e.resumo ?? "")} {...e} />
            ))}
          </div>
        )}
        {descricao}
      </div>
      <div className="card-tags">
        {d.custos.map((c) => (
          <span key={c} className="tag tag-custo">
            {c}
          </span>
        ))}
        <button type="button" className="hab-usar" onClick={() => aoUsar(d.nome)}>
          <i className="fas fa-play" /> Usar
        </button>
        {d.origem && (
          <span className="acao-deriva">
            Vem de <span className="acao-deriva-nome">{d.origem}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// Proposta: sem a linha de chips de efeito (a descrição rica já cita os efeitos)
// e com o cabeçalho reorganizado em três faixas:
//   título + Usar · linha descritiva (custo, técnica, duração, alcance) · números
//   rolláveis (acerto, dano, CD). Sem rodapé quando não há origem.
export function CardCompacto({
  d,
  descricao,
  aoUsar,
  tiposDano,
}: {
  d: DadosCard;
  descricao: ReactNode;
  aoUsar: (n: string) => void;
  // Catálogo da Biblioteca (o ícone e a cor do tipo vêm de lá).
  tiposDano?: TipoDanoCatalogo[];
}) {
  const tipoDano = d.tipoDano ? tipoDanoDe(d.tipoDano, tiposDano) : null;
  const rolarAcerto = () =>
    empilharRolagem({ dados: [{ faces: 20, sinal: 1 }], modificador: d.acerto ?? 0, nomePreset: `${d.nome}: acerto` });
  const rolarDano = () => {
    if (d.rolagemDano) {
      empilharRolagem({ ...d.rolagemDano, nomePreset: `${d.nome}: dano` });
      return;
    }
    const [qtd, resto] = d.dano!.split("d");
    const faces = Number(resto.split("+")[0]);
    empilharRolagem({
      dados: Array.from({ length: Number(qtd) || 1 }, () => ({ faces, sinal: 1 as const })),
      modificador: Number(resto.split("+")[1] ?? 0),
      nomePreset: `${d.nome}: dano`,
    });
  };
  // Micro-especificações numa linha só, em texto discreto separado por pontos:
  // só o custo (dourado) e o grau (selo laranja) têm destaque. Duração
  // instantânea não aparece (a descrição já diz "Imediatamente").
  const meta: ReactNode[] = [
    ...d.custos.map((c) => (
      <span key={c} className="card2-custo">
        {c}
      </span>
    )),
    d.grau != null && (
      <span key="tec" className="card2-grau" title={`Técnica de ${d.grau}º grau`}>
        {d.grau}º
      </span>
    ),
    d.gatilho && (
      <span key="gat">
        <i className="fas fa-bell" /> {d.gatilho}
      </span>
    ),
    d.duracao && !/^instant/i.test(d.duracao) && (
      <span key="dur">
        <i className="fas fa-hourglass-half" /> {d.duracao}
      </span>
    ),
    d.alcance && (
      <span key="alc">
        <i className="fas fa-ruler-horizontal" /> {d.alcance}
      </span>
    ),
  ];
  const cd = d.cd && !d.cdNaDescricao ? d.cd : null;
  return (
    <div className={`action-card card2 com-copia com-alca ${d.classeTipo ?? `type-${d.tipo}`}`}>
      {/* Os botões do canto e a alça de arrastar são os da ficha (aqui sem ação):
          o título tem o recuo que o `com-copia` e o `com-alca` já dão. */}
      <button type="button" className="btn-card-alca" aria-label="Mudar de posição" tabIndex={-1}>
        <i className="fas fa-grip-vertical" />
      </button>
      <button type="button" className="btn-card-copia" aria-label="Duplicar" tabIndex={-1}>
        <i className="fas fa-copy" />
      </button>
      <button type="button" className="btn-card-edit" aria-label="Editar" tabIndex={-1}>
        <i className="fas fa-edit" />
      </button>
      <button type="button" className="btn-card-trash" aria-label="Apagar" tabIndex={-1}>
        <i className="fas fa-trash" />
      </button>
      <div className="card2-topo">
        <div className="card-title">{d.nome}</div>
      </div>
      <CardMeta itens={meta} />
      <CardNumeros>
        {d.acerto != null && (
          <Tooltip titulo="Acerto" icone="fa-crosshairs" texto="Clique para empilhar no Rolador">
            <CardNumero aoRolar={rolarAcerto}>
              <i className="fas fa-crosshairs" /> <strong>+{d.acerto}</strong>
            </CardNumero>
          </Tooltip>
        )}
        {d.dano && (
          <Tooltip
            titulo={`Dano${tipoDano ? ` ${tipoDano.nome}` : ""}`}
            icone={tipoDano?.icone ?? "fa-burst"}
            texto="Clique para empilhar no Rolador"
          >
            <CardNumero aoRolar={rolarDano}>
              <i className={`fas ${tipoDano?.icone ?? "fa-burst"}`} style={tipoDano?.cor ? { color: tipoDano.cor } : undefined} />{" "}
              <strong>{d.dano}</strong> <small>{d.tipoDano}</small>
            </CardNumero>
          </Tooltip>
        )}
        {cd && (
          <Tooltip titulo="Salvaguarda" icone="fa-shield-alt" texto={cd}>
            <CardNumero>
              <i className="fas fa-shield-alt" /> <strong>{cd.replace("Salv ", "").replace(" CD ", " ")}</strong>
            </CardNumero>
          </Tooltip>
        )}
      </CardNumeros>
      {descricao}
      {/* Rodapé como o de hoje: o Usar fica embaixo, longe dos botões do canto. */}
      <div className="card2-pe">
        {d.origem && (
          <span className="card2-origem">
            Vem de <span className="acao-deriva-nome">{d.origem}</span>
          </span>
        )}
        <button type="button" className="hab-usar" onClick={() => aoUsar(d.nome)}>
          <i className="fas fa-play" /> Usar
        </button>
      </div>
    </div>
  );
}

const MODOS: { id: ModoDescricaoCard; nome: string }[] = [
  { id: "linhas", nome: "5 linhas" },
  { id: "resumo", nome: "1 linha (resumo)" },
  { id: "aberta", nome: "Sempre aberta" },
];
const LARGURAS = [
  { id: 0, nome: "Grade da ficha" },
  { id: 300, nome: "300 px" },
  { id: 360, nome: "360 px" },
  { id: 520, nome: "520 px" },
];

export function DemoCardAcao() {
  const [modo, setModo] = useState<ModoDescricaoCard>("linhas");
  const [largura, setLargura] = useState(0);
  const [log, setLog] = useState("nenhum ainda — clique numa rolagem ou em Usar");

  useEffect(() => {
    const ouvir = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setLog(
        `Rolador recebeu: dados=${JSON.stringify(d.dados.map((x: { faces: number }) => `d${x.faces}`))} mod=${d.modificador} "${d.nomePreset}"`,
      );
    };
    window.addEventListener(EVENTO_EMPILHAR, ouvir);
    return () => window.removeEventListener(EVENTO_EMPILHAR, ouvir);
  }, []);

  const contexto = useMemo<ContextoRico>(() => ({ ...CONTEXTO, nomeRolagem: undefined }), []);
  const desc = (d: DadosCard) => (
    <DescricaoCard texto={d.texto} contexto={{ ...contexto, nomeRolagem: d.nome }} modo={modo} />
  );
  const usar = (nome: string) => setLog(`Usar “${nome}” (a ação real gastaria PP e abriria o modal de alvo)`);
  const caixa = largura ? { width: largura, maxWidth: "100%" } : undefined;

  return (
    <main className="demo-card">
      <header className="demo-card-topo">
        <h1>Protótipo — card de ação com descrição rica</h1>
        <ThemeButton />
      </header>

      <div className="demo-card-controles">
        <div role="group" aria-label="Modo da descrição">
          <strong>Descrição:</strong>
          {MODOS.map((m) => (
            <button key={m.id} type="button" aria-pressed={modo === m.id} onClick={() => setModo(m.id)}>
              {m.nome}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Largura do card">
          <strong>Largura:</strong>
          {LARGURAS.map((l) => (
            <button key={l.id} type="button" aria-pressed={largura === l.id} onClick={() => setLargura(l.id)}>
              {l.nome}
            </button>
          ))}
        </div>
      </div>
      <p className="demo-card-log" data-testid="log">
        {log}
      </p>

      <section>
        <h2>Hoje × proposta (a mesma técnica)</h2>
        <div className="demo-card-comparacao" style={caixa}>
          <div>
            <h3>Hoje: texto puro</h3>
            <Card d={METEORO} aoUsar={usar} descricao={<DescricaoRecolhivel texto={TEXTO_ATUAL} />} />
          </div>
          <div>
            <h3>Proposta: sem chips de efeito, cabeçalho compacto</h3>
            <CardCompacto d={METEORO} aoUsar={usar} descricao={desc(METEORO)} />
          </div>
        </div>
      </section>

      <section>
        <h2>Na grade da ficha</h2>
        <div className="action-grid" style={caixa}>
          {CARDS.map((d) => (
            <CardCompacto key={d.id} d={d} aoUsar={usar} descricao={desc(d)} />
          ))}
        </div>
      </section>
    </main>
  );
}
