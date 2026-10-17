"use client";

// O que a condição faz no jogo: efeitos na ficha de quem está com ela, regras
// do combate, dano com gatilho e as ações dela (Apagar, Tratar).

import { EfeitosEditor } from "@/app/ficha/[uid]/efeitos-editor";
import { CampoPasso, Segmentos } from "@/app/ficha/[uid]/campos-modal";
import {
  GATILHOS_DANO,
  type AcaoDaCondicao,
  type CustoAcaoCondicao,
  type MecanicaCondicao,
} from "@/lib/condicoes-mecanica";
import { PERICIAS } from "@/lib/op-rpg";

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
