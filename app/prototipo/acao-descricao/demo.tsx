"use client";

import { useMemo, useState } from "react";
import { ChipEfeitoEstatico, CardCompacto, type DadosCard } from "@/app/prototipo/card-acao/demo";
import { ThemeButton } from "@/components/temas/theme-button";
import type { ContextoRico } from "@/components/descricao-rica/atomos";
import { DescricaoCard } from "@/components/descricao-rica/descricao-card";
import { EditorRico } from "@/components/descricao-rica/editor-rico";
import { useDescricaoAuto } from "@/components/descricao-rica/use-descricao-auto";
import { gerarDescricao } from "@/lib/descricao-gerada";
import { citaDuracao, efeitosCitados } from "@/lib/descricao-rica";
import { textoDuracao, type Duracao } from "@/lib/duracao";
import { ATRIBUTOS, resumoEfeito, rotuloAlvo, type ContextoResumo, type EfeitoHabilidade } from "@/lib/op-rpg";
import "@/app/ficha/[uid]/ficha.css";
import "@/app/prototipo/card-acao/card-acao.css";
import "./acao-descricao.css";

// Ficha de mentira: nível 5 (PROF +3), técnica de 2º grau. O resumo recebe a
// PONTUAÇÃO dos atributos (o app converte em modificador): 16 = +3, 14 = +2.
const RESUMO: ContextoResumo = {
  nivel: 5,
  grau: 2,
  atributos: { forca: 16, destreza: 12, constituicao: 14, sabedoria: 10, vontade: 12, presenca: 10 },
};

type Amostra = { id: string; rotulo: string; efeito: EfeitoHabilidade };
const AMOSTRAS: Amostra[] = [
  { id: "dano", rotulo: "Dano extra em técnicas (1d6+PROF)", efeito: { tipo: "dano_extra", formula: "1d6+PROF", em: "dano-tecnica", sempre: true } },
  { id: "vant", rotulo: "Vantagem na próxima jogada de ataque", efeito: { tipo: "vantagem", alvo: "ataque", vale: "proxima" } },
  { id: "cr", rotulo: "+CR (PROF/2+1)", efeito: { tipo: "modificador", alvo: "cr", valor: 0, formula: "PROF/2+1" } },
  { id: "resist", rotulo: "Resistência a Fogo", efeito: { tipo: "resistencia", tipoDano: "Fogo" } },
  { id: "cura", rotulo: "Cura 1d8+CON", efeito: { tipo: "cura", valor: "1d8+CON" } },
  { id: "cond", rotulo: "Aplica Atordoado (CD 14, evita DES)", efeito: { tipo: "condicao_aplicar", condicao: "Atordoado", cd: 14, rodadas: 1, evita: "destreza", quem: "inimigo" } },
  { id: "desv", rotulo: "Desvantagem no inimigo (próxima salvaguarda DES)", efeito: { tipo: "desvantagem", alvo: "salv-destreza", quem: "inimigo", vale: "proxima" } },
  { id: "desl", rotulo: "Andar +3 m", efeito: { tipo: "deslocamento", tipoMov: "caminhar", valor: 3 } },
  { id: "desl6", rotulo: "Andar +6 m", efeito: { tipo: "deslocamento", tipoMov: "caminhar", valor: 6 } },
  { id: "acerto", rotulo: "+2 no acerto (ataque)", efeito: { tipo: "modificador", alvo: "ataque", valor: 2 } },
  { id: "extra", rotulo: "Ação extra de bônus", efeito: { tipo: "acao_extra", acao: "bonus", quantidade: 1 } },
];

type OpcaoDuracao = { id: string; nome: string; duracao: Duracao | null };
const DURACOES: OpcaoDuracao[] = [
  { id: "inst", nome: "Instantânea", duracao: { unidade: "instantanea" } },
  { id: "t1", nome: "1 turno", duracao: { unidade: "turno", quantidade: 1 } },
  { id: "t3", nome: "3 turnos", duracao: { unidade: "turno", quantidade: 3 } },
  { id: "enc", nome: "Até o fim do encontro", duracao: { unidade: "encontro" } },
  { id: "conc", nome: "1 minuto (concentração)", duracao: { unidade: "minuto", quantidade: 1, concentracao: true } },
  { id: "nada", nome: "Sem duração", duracao: null },
];

const CONDICOES = [
  { nome: "Atordoado", descricao: "Não age no próximo turno; ataques contra você têm vantagem.", cor: "#e67e22" },
  { nome: "Caído", descricao: "Metade do deslocamento para levantar." },
];

const siglaAtributo = (slug: string) => ATRIBUTOS.find((a) => a.slug === slug)?.sigla ?? slug;

// Outra ação da ficha, da qual esta pode depender.
const AGIGANTAR = { id: "a1", nome: "Agigantar" };
const OPCOES_GATILHO = [
  { slug: "", nome: "Sem gatilho" },
  { slug: "aliado_ataque", nome: "Um aliado é alvo de ataque" },
  { slug: "ataque", nome: "Você é alvo de ataque" },
  { slug: "dano", nome: "Você vai receber dano" },
  { slug: "outro", nome: "Outra situação (não entra na frase)" },
];

export function DemoAcaoDescricao() {
  // Na ordem em que foram escolhidos (a ordem da lista de efeitos da ação).
  const [marcados, setMarcados] = useState<string[]>(["dano", "vant"]);
  const [duracaoId, setDuracaoId] = useState("inst");
  const [comDano, setComDano] = useState(false);
  const [requer, setRequer] = useState(false);
  const [gatilho, setGatilho] = useState("");

  const efeitos = useMemo(
    () => marcados.flatMap((id) => AMOSTRAS.filter((a) => a.id === id).map((a) => a.efeito)),
    [marcados],
  );
  const duracao = DURACOES.find((d) => d.id === duracaoId)?.duracao ?? null;

  // A descrição gerada acompanha os efeitos e a duração escolhidos.
  const gerado = useMemo(
    () =>
      gerarDescricao(
        {
          efeitos,
          duracao,
          dano: comDano ? { formula: "2d6+FOR", tipo: "Fogo" } : null,
          gatilho: gatilho || null,
          requerAcao: requer ? AGIGANTAR : null,
        },
        { rotuloAlvo, siglaAtributo },
      ),
    [efeitos, duracao, comDano, gatilho, requer],
  );
  const { valor, aoMudar, automatica } = useDescricaoAuto(gerado);

  const contexto = useMemo<ContextoRico>(
    () => ({
      refs: { "acao:a1": { titulo: "Agigantar", texto: "Cresce: alcance e dano maiores.", selo: "Poderosa" } },
      condicoes: CONDICOES,
      efeitos,
      duracao,
      // Valor calculado com a ficha; `resolvido: false` é a fórmula crua (dica do chip).
      resumoEfeito: (e, resolvido) => (resolvido ? resumoEfeito(e, undefined, RESUMO) : resumoEfeito(e)),
      nomeRolagem: "Golpe Meteoro",
    }),
    [efeitos, duracao],
  );

  const card: DadosCard = {
    id: "gm",
    tipo: "power",
    nome: "Golpe Meteoro",
    grau: 2,
    // Se a descrição já cita a duração (chip), a linha descritiva do card não repete.
    duracao: citaDuracao(valor) ? undefined : (textoDuracao(duracao) ?? undefined),
    acerto: 5,
    dano: comDano ? "2d6+3" : undefined,
    tipoDano: comDano ? "fogo" : undefined,
    cd: comDano ? "Salv DES CD 14" : undefined,
    alcance: "6 m",
    texto: "",
    custos: ["3 PP", "1 ação poderosa"],
  };

  const alternar = (id: string) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const citados = efeitosCitados(valor);

  return (
    <main className="demo-ad">
      <header className="demo-ad-topo">
        <h1>Protótipo — descrição automática da ação</h1>
        <ThemeButton />
      </header>
      <p className="demo-ad-dica">
        Marque efeitos e escolha a duração: a descrição se escreve sozinha, com chips ligados a cada efeito (o valor é
        calculado com a ficha de teste: FOR +3, CON +2, nível 5 = PROF +3, 2º grau). Edite o texto para assumir o controle;
        “Regenerar” volta ao automático.
      </p>

      <div className="demo-ad-colunas">
        <section className="demo-ad-cartao">
          <h2>Ação de teste</h2>
          <fieldset>
            <legend>Duração</legend>
            {DURACOES.map((d) => (
              <label key={d.id}>
                <input type="radio" name="duracao" checked={duracaoId === d.id} onChange={() => setDuracaoId(d.id)} />
                {d.nome}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Efeitos</legend>
            {AMOSTRAS.map((a) => {
              const ordem = marcados.indexOf(a.id);
              return (
                <label key={a.id}>
                  <input type="checkbox" checked={ordem >= 0} onChange={() => alternar(a.id)} />
                  {a.rotulo}
                  {ordem >= 0 && (
                    <span className="demo-ad-ordem" title="Ordem em que foi escolhido">
                      {ordem + 1}
                    </span>
                  )}
                </label>
              );
            })}
          </fieldset>
          <fieldset>
            <legend>Quando pode ser usada</legend>
            <label>
              <input type="checkbox" checked={requer} onChange={(e) => setRequer(e.target.checked)} />
              Só com a ação Agigantar ativa
            </label>
            <label>
              Gatilho (reação)
              <select value={gatilho} onChange={(e) => setGatilho(e.target.value)}>
                {OPCOES_GATILHO.map((g) => (
                  <option key={g.slug} value={g.slug}>
                    {g.nome}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <label className="demo-ad-linha">
            <input type="checkbox" checked={comDano} onChange={(e) => setComDano(e.target.checked)} />
            Causa dano (2d6+FOR fogo) e tem salvaguarda
          </label>
        </section>

        <section>
          <h2>Descrição</h2>
          <EditorRico
            valor={valor}
            onChange={aoMudar}
            refs={[{ tipo: "acao", id: AGIGANTAR.id, nome: AGIGANTAR.nome }]}
            condicoes={CONDICOES.map((c) => c.nome)}
            contexto={contexto}
            automatica={automatica}
          />
        </section>
      </div>

      <div className="demo-ad-colunas">
        <section>
          <h2>Card</h2>
          <CardCompacto
            d={card}
            aoUsar={() => {}}
            descricao={<DescricaoCard texto={valor} contexto={contexto} modo="aberta" />}
          />
        </section>
        <section className="demo-ad-cartao">
          <h2>Para comparar: os chips de efeito do card de hoje</h2>
          <div className="efeito-chips">
            {efeitos.length === 0 && <span className="demo-ad-dica">Nenhum efeito marcado.</span>}
            {efeitos.map((e, i) => (
              <ChipEfeitoEstatico key={i} slug={e.tipo} resumo={resumoEfeito(e, undefined, RESUMO)} />
            ))}
          </div>
          <p className="demo-ad-dica">
            O chip dentro da descrição mostra o mesmo valor. Efeitos citados no texto agora: {citados.length}/
            {efeitos.length}.
          </p>
          <h2>Texto salvo</h2>
          <pre data-testid="salvo">{valor || "(vazio)"}</pre>
        </section>
      </div>
    </main>
  );
}
