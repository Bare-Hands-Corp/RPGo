"use client";

// O que a condição faz no jogo: efeitos na ficha de quem está com ela, regras
// do combate, dano com gatilho e as ações dela (Apagar, Tratar).

import { EfeitosEditor } from "@/app/ficha/[uid]/efeitos-editor";
import { CampoPasso, Segmentos } from "@/app/ficha/[uid]/campos-modal";
import {
  GATILHOS_DANO,
  MECANICA_VAZIA,
  linhasDaMecanica,
  mecanicaDa,
  mecanicaDoLivro,
  origemDaMecanica,
  textoDaSaida,
  type AcaoDaCondicao,
  type CustoAcaoCondicao,
  type MecanicaCondicao,
  type MecanicaSalva,
  type OrigemMecanica,
  type PadroesCondicao,
} from "@/lib/condicoes-mecanica";
import { DURACOES_CONDICAO, textoRodadas } from "@/lib/condicoes";
import { ATRIBUTOS, PERICIAS, type Atributo } from "@/lib/op-rpg";

const REGRAS: { campo: "incapacita" | "semReacao" | "semConcentracao" | "umaAcao" | "criticoPerto" | "ppDeErroVolta"; rotulo: string }[] = [
  { campo: "incapacita", rotulo: "Sem ações" },
  { campo: "semReacao", rotulo: "Sem reação" },
  { campo: "semConcentracao", rotulo: "Sem concentração" },
  { campo: "umaAcao", rotulo: "Uma ação por turno" },
  { campo: "criticoPerto", rotulo: "Acerto a 1,5 m é crítico" },
  { campo: "ppDeErroVolta", rotulo: "PP de técnica que erra volta" },
];

const CUSTOS: { valor: CustoAcaoCondicao; rotulo: string }[] = [
  { valor: "padrao", rotulo: "Padrão" },
  { valor: "bonus", rotulo: "Bônus" },
  { valor: "power", rotulo: "Poderosa" },
  { valor: "livre", rotulo: "Livre" },
];

const MAX_ACOES = 4;

export function MecanicaCondicaoEditor({
  mecanica,
  condicoes,
  onChange,
}: {
  mecanica: MecanicaCondicao;
  // Nomes que a ação "Troca" pode pôr no lugar.
  condicoes: string[];
  onChange: (m: MecanicaCondicao) => void;
}) {
  const mudar = (patch: Partial<MecanicaCondicao>) => onChange({ ...mecanica, ...patch });
  const acoes = mecanica.acoes ?? [];
  const mudarAcao = (i: number, patch: Partial<AcaoDaCondicao>) =>
    mudar({ acoes: acoes.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  return (
    <div className="mecanica-condicao">
      <div className="trait-condicao-estilo">
        <span className="trait-condicao-estilo-titulo">Na ficha de quem está com ela</span>
        <EfeitosEditor
          efeitos={mecanica.efeitos}
          onChange={(efeitos) => mudar({ efeitos })}
          recursos={[]}
          pergunta="O que essa condição faz?"
        />
      </div>

      <div className="trait-condicao-estilo">
        <span className="trait-condicao-estilo-titulo">No combate</span>
        <label>Ataques contra</label>
        <Segmentos
          rotulo="Ataques contra"
          valor={mecanica.contra ?? "normal"}
          opcoes={[
            { valor: "normal", rotulo: "Normal" },
            { valor: "vantagem", rotulo: "Vantagem" },
            { valor: "desvantagem", rotulo: "Desvantagem" },
            { valor: "perto", rotulo: "Vantagem perto", titulo: "Vantagem a 1,5 m, desvantagem de mais longe" },
          ]}
          onChange={(v) => mudar({ contra: v === "normal" ? undefined : v })}
        />
        <div className="sugestoes">
          {REGRAS.map((r) => {
            const ativo = !!mecanica[r.campo];
            return (
              <button
                type="button"
                key={r.campo}
                className={`sugestao chip-opcao${ativo ? " ativo" : ""}`}
                aria-pressed={ativo}
                onClick={() => mudar({ [r.campo]: ativo ? undefined : true })}
              >
                {r.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      <div className="trait-condicao-estilo">
        <span className="trait-condicao-estilo-titulo">Dano</span>
        <div className="bestiario-grid">
          <label>
            Fórmula
            <input
              value={mecanica.dano?.formula ?? ""}
              placeholder="1d6"
              maxLength={40}
              onChange={(e) =>
                mudar({
                  dano: e.target.value.trim()
                    ? { formula: e.target.value, tipo: mecanica.dano?.tipo ?? "", quando: mecanica.dano?.quando ?? "inicio" }
                    : null,
                })
              }
            />
          </label>
          <label>
            Tipo
            <input
              value={mecanica.dano?.tipo ?? ""}
              placeholder="Fogo"
              maxLength={40}
              disabled={!mecanica.dano}
              onChange={(e) => mecanica.dano && mudar({ dano: { ...mecanica.dano, tipo: e.target.value } })}
            />
          </label>
        </div>
        {mecanica.dano && (
          <Segmentos
            rotulo="Quando"
            valor={mecanica.dano.quando}
            opcoes={GATILHOS_DANO.map((g) => ({ valor: g.slug, rotulo: g.nome }))}
            onChange={(quando) => mecanica.dano && mudar({ dano: { ...mecanica.dano, quando } })}
          />
        )}
      </div>

      <div className="trait-condicao-estilo">
        <span className="trait-condicao-estilo-titulo">Ações</span>
        {acoes.map((a, i) => (
          <div key={i} className="mecanica-acao">
            <div className="mecanica-acao-topo">
              <input
                value={a.nome}
                placeholder="Apagar"
                maxLength={30}
                aria-label="Nome da ação"
                onChange={(e) => mudarAcao(i, { nome: e.target.value })}
              />
              <button
                type="button"
                className="bestiario-btn-remover"
                aria-label={`Tirar ${a.nome || "ação"}`}
                onClick={() => mudar({ acoes: acoes.filter((_, j) => j !== i) })}
              >
                <i className="fas fa-xmark" />
              </button>
            </div>
            <Segmentos rotulo="Custo" valor={a.custo} opcoes={CUSTOS} onChange={(custo) => mudarAcao(i, { custo })} />
            <Segmentos
              rotulo="Faz"
              valor={a.faz}
              opcoes={[
                { valor: "remover", rotulo: "Tira" },
                { valor: "trocar", rotulo: "Troca" },
                { valor: "teste", rotulo: "Teste" },
              ]}
              onChange={(faz) =>
                mudarAcao(i, {
                  faz,
                  ...(faz === "trocar" && !a.condicao ? { condicao: condicoes[0] ?? "" } : {}),
                  ...(faz === "teste" && !a.teste ? { teste: { pericia: "sobrevivencia", cd: 10 } } : {}),
                })
              }
            />
            {a.faz === "trocar" && (
              <label>
                Vira
                <select value={a.condicao ?? ""} onChange={(e) => mudarAcao(i, { condicao: e.target.value })}>
                  {condicoes.map((nome) => (
                    <option key={nome} value={nome}>
                      {nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {a.faz === "teste" && (
              <div className="mecanica-acao-teste">
                <select
                  aria-label="Perícia"
                  value={a.teste?.pericia ?? "sobrevivencia"}
                  onChange={(e) => mudarAcao(i, { teste: { pericia: e.target.value, cd: a.teste?.cd ?? 10 } })}
                >
                  {PERICIAS.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                <span>CD</span>
                <CampoPasso
                  rotulo="CD"
                  valor={a.teste?.cd ?? 10}
                  min={1}
                  max={40}
                  onChange={(cd) => mudarAcao(i, { teste: { pericia: a.teste?.pericia ?? "sobrevivencia", cd } })}
                />
              </div>
            )}
          </div>
        ))}
        {acoes.length < MAX_ACOES && (
          <button
            type="button"
            className="bestiario-voltar-lista"
            onClick={() => mudar({ acoes: [...acoes, { nome: "", custo: "padrao", faz: "remover" }] })}
          >
            <i className="fas fa-plus" /> Ação
          </button>
        )}
      </div>
    </div>
  );
}

// O que quem estiver com a condição sofre, em linhas: os efeitos, as regras do
// combate, o dano e os padrões. Lista, ficha da Biblioteca, prévia e tooltip.
export function linhasDaCondicao(nome: string, salva: MecanicaSalva, padroes: PadroesCondicao | null): string[] {
  const m = mecanicaDa({ nome, mecanica: salva });
  return [
    ...(m ? linhasDaMecanica(m) : []),
    ...(padroes?.rodadas ? [`Dura ${textoRodadas(padroes.rodadas)}`] : []),
    ...(padroes?.saida ? [textoDaSaida(padroes.saida)] : []),
  ];
}

const ORIGENS: { valor: OrigemMecanica; rotulo: string; titulo: string }[] = [
  { valor: "livro", rotulo: "Do livro", titulo: "A regra do livro, como está" },
  { valor: "personalizada", rotulo: "Personalizada", titulo: "Você escolhe o que ela faz" },
  { valor: "texto", rotulo: "Só texto", titulo: "Não faz nada no jogo; vale a descrição" },
];

// Formulário da condição na Biblioteca: de onde vem a mecânica, os efeitos,
// os padrões (duração e salvaguarda pra sair), a prévia e a nota.
export function CondicaoDaBiblioteca({
  nome,
  mecanica,
  padroes,
  descricao,
  condicoes,
  onMecanica,
  onPadroes,
  onDescricao,
}: {
  nome: string;
  mecanica: MecanicaSalva;
  padroes: PadroesCondicao | null;
  descricao: string;
  condicoes: string[];
  onMecanica: (m: MecanicaSalva) => void;
  onPadroes: (p: PadroesCondicao | null) => void;
  onDescricao: (texto: string) => void;
}) {
  const doLivro = mecanicaDoLivro(nome);
  const origem = origemDaMecanica(nome, mecanica);
  const linhas = linhasDaCondicao(nome, mecanica, padroes);
  const mudarPadroes = (patch: Partial<PadroesCondicao>) => {
    const novo = { ...padroes, ...patch };
    if (!novo.rodadas) delete novo.rodadas;
    if (!novo.saida) delete novo.saida;
    onPadroes(novo.rodadas || novo.saida ? novo : null);
  };
  const saida = padroes?.saida;

  return (
    <>
      <div className="trait-condicao-estilo">
        <span className="trait-condicao-estilo-titulo">Mecânica</span>
        <Segmentos
          rotulo="Mecânica"
          valor={origem}
          opcoes={doLivro ? ORIGENS : ORIGENS.filter((o) => o.valor !== "livro")}
          onChange={(v) => {
            if (v === origem) return;
            // Personalizada começa da regra do livro (ou vazia).
            if (v === "personalizada") onMecanica(structuredClone(doLivro ?? MECANICA_VAZIA));
            else onMecanica(v === "texto" ? "nenhuma" : null);
          }}
        />
        <p className="campo-dica">
          {origem === "livro"
            ? "Usando a regra do livro. Pra ajustar, escolha Personalizada: ela começa com a do livro."
            : origem === "texto"
              ? "Não faz nada no jogo: vale só a descrição."
              : "Só vale o que estiver aqui."}
        </p>
      </div>

      {origem === "personalizada" && (
        <MecanicaCondicaoEditor
          mecanica={typeof mecanica === "object" && mecanica ? mecanica : MECANICA_VAZIA}
          condicoes={condicoes}
          onChange={onMecanica}
        />
      )}

      <div className="trait-condicao-estilo">
        <span className="trait-condicao-estilo-titulo">Padrões</span>
        <label>Duração padrão</label>
        <Segmentos
          rotulo="Duração padrão"
          valor={padroes?.rodadas ?? 0}
          opcoes={[
            { valor: 0, rotulo: "Sem padrão", titulo: "Quem aplica escolhe (1 rodada, se não escolher)" },
            ...DURACOES_CONDICAO.map((d) => ({ valor: d.rodadas, rotulo: d.nome })),
          ]}
          onChange={(rodadas) => mudarPadroes({ rodadas: rodadas || undefined })}
        />
        <label>Salvaguarda pra sair</label>
        <Segmentos
          rotulo="Salvaguarda pra sair"
          valor={saida?.atributo ?? ""}
          opcoes={[
            { valor: "", rotulo: "Nenhuma" },
            ...ATRIBUTOS.map((a) => ({ valor: a.slug as string, rotulo: a.sigla, titulo: a.nome })),
          ]}
          onChange={(atributo) =>
            mudarPadroes({ saida: atributo ? { atributo: atributo as Atributo, cd: saida?.cd ?? "fonte" } : undefined })
          }
        />
        {saida && (
          <div className="mecanica-acao-teste">
            <Segmentos
              rotulo="CD"
              valor={saida.cd === "fonte" ? "fonte" : "fixa"}
              opcoes={[
                { valor: "fonte", rotulo: "CD de quem aplicou" },
                { valor: "fixa", rotulo: "CD fixa" },
              ]}
              onChange={(v) => mudarPadroes({ saida: { ...saida, cd: v === "fonte" ? "fonte" : 10 } })}
            />
            {saida.cd !== "fonte" && (
              <CampoPasso
                rotulo="CD"
                valor={saida.cd}
                min={1}
                max={40}
                onChange={(cd) => mudarPadroes({ saida: { ...saida, cd } })}
              />
            )}
          </div>
        )}
        <p className="campo-dica">
          O &quot;+ condição&quot; do narrador e o Aplica Condição em &quot;Padrão&quot; usam esses. A salvaguarda
          repete no fim de cada turno de quem está com ela.
        </p>
      </div>

      {/* Prévia: o que vale pra quem estiver com ela, enquanto edita. */}
      <div className="trait-condicao-estilo condicao-previa">
        <span className="trait-condicao-estilo-titulo">Quem estiver com ela:</span>
        {linhas.length > 0 ? (
          <ul>
            {linhas.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="campo-dica">Nada no jogo.</p>
        )}
      </div>

      <label>
        Nota (opcional)
        <textarea
          className="bestiario-textarea-descricao"
          value={descricao}
          onChange={(e) => onDescricao(e.target.value)}
          placeholder="Ex: de onde vem, como os personagens percebem."
        />
      </label>
    </>
  );
}
