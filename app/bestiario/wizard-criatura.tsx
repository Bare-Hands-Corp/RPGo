"use client";

import { useState } from "react";
import Swal from "sweetalert2";
import { criarCriatura } from "./actions";
import { criarCriaturaVazia, draftDeCriatura } from "./utils";
import type { CriaturaPayload, CriaturaSerializada, TemplateSerializado } from "./types";
import {
  CamposAtributos,
  CamposDefesas,
  CamposDeslocamento,
  CamposIdentidade,
  CamposNivel,
  CamposNotas,
  CamposTestes,
  sugestoesDe,
  sugestoesDeAcao,
} from "./campos-criatura";
import { ComponentesEditor } from "./componentes-editor";
import { RecursosEditor } from "./recursos-editor";
import { FichaCriaturaView } from "./ficha-view";

function uuid() {
  return crypto.randomUUID();
}

// As mesmas seções do editor completo (campos-criatura), uma tela por vez.
const PASSOS = [
  { key: "origem", label: "Origem" },
  { key: "identidade", label: "Identidade" },
  { key: "nivel", label: "Nível e defesas" },
  { key: "atributos", label: "Atributos e testes" },
  { key: "recursos", label: "Recursos" },
  { key: "acoes", label: "Ações" },
  { key: "revisao", label: "Revisão" },
] as const;

const PASSO_IDENTIDADE = PASSOS.findIndex((p) => p.key === "identidade");

type Props = {
  criaturas: CriaturaSerializada[];
  templates: TemplateSerializado[];
  linhagens: string[];
  onCriada: (nova: CriaturaSerializada) => void;
  onCancelar: () => void;
};

export function WizardCriatura({ criaturas, templates, linhagens, onCriada, onCancelar }: Props) {
  const [passo, setPasso] = useState(0);
  const [maiorPassoVisitado, setMaiorPassoVisitado] = useState(0);
  const [origem, setOrigem] = useState<"zero" | "clone">("zero");
  const [cloneId, setCloneId] = useState("");
  const [draft, setDraft] = useState<CriaturaPayload>(() => criarCriaturaVazia());
  const [salvando, setSalvando] = useState(false);
  const sugestoes = sugestoesDe(criaturas);

  function campo<K extends keyof CriaturaPayload>(chave: K, valor: CriaturaPayload[K]) {
    setDraft((atual) => ({ ...atual, [chave]: valor }));
  }

  function faltaIdentidade() {
    if (draft.nome.trim() && draft.categoria.trim()) return false;
    void Swal.fire({
      icon: "warning",
      title: "Nome e categoria são obrigatórios",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    setPasso(PASSO_IDENTIDADE);
    return true;
  }

  function irPara(novoPasso: number) {
    if (novoPasso > maiorPassoVisitado) return; // não pula pra frente sem passar pelos passos
    if (novoPasso > PASSO_IDENTIDADE && faltaIdentidade()) return;
    setPasso(novoPasso);
  }

  function avancar() {
    if (passo === PASSO_IDENTIDADE && faltaIdentidade()) return;
    const proximo = Math.min(passo + 1, PASSOS.length - 1);
    setPasso(proximo);
    setMaiorPassoVisitado((atual) => Math.max(atual, proximo));
  }

  // Sair joga fora o que foi preenchido: pergunta antes, se já tem algo.
  async function cancelar() {
    if (maiorPassoVisitado > 0 && (draft.nome.trim() || draft.componentes.length > 0)) {
      const resposta = await Swal.fire({
        icon: "warning",
        title: "Descartar esta criatura?",
        text: "O que você preencheu até aqui será perdido.",
        showCancelButton: true,
        confirmButtonText: "Descartar",
        cancelButtonText: "Continuar criando",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      if (!resposta.isConfirmed) return;
    }
    onCancelar();
  }

  function voltar() {
    if (passo === 0) void cancelar();
    else setPasso((atual) => atual - 1);
  }

  function escolherClone(id: string) {
    setCloneId(id);
    const base = criaturas.find((c) => c.id === id);
    if (!base) {
      setDraft(criarCriaturaVazia());
      return;
    }
    const clonado = draftDeCriatura(base);
    setDraft({
      ...clonado,
      nome: "",
      ordemTier: clonado.ordemTier != null ? clonado.ordemTier + 1 : null,
      // As ações continuam ligadas à entrada da biblioteca da criatura original.
      componentes: clonado.componentes.map((c) => ({ ...c, id: uuid() })),
    });
  }

  async function finalizar() {
    if (faltaIdentidade()) return;
    setSalvando(true);
    try {
      const nova = await criarCriatura(draft);
      onCriada(nova);
    } catch (err) {
      void Swal.fire({
        icon: "error",
        title: "Erro ao criar criatura",
        text: err instanceof Error ? err.message : "Tente novamente.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    } finally {
      setSalvando(false);
    }
  }

  const passoAtual = PASSOS[passo].key;
  const previa: CriaturaSerializada = { ...draft, id: "previa", criadoEm: "", atualizadoEm: "" };

  return (
    <div className="wizard-criatura">
      <div className="wizard-passos">
        {PASSOS.map((p, indice) => (
          <button
            key={p.key}
            type="button"
            className={"wizard-passo" + (indice === passo ? " ativo" : "") + (indice > maiorPassoVisitado ? " bloqueado" : "")}
            aria-current={indice === passo ? "step" : undefined}
            onClick={() => irPara(indice)}
            disabled={indice > maiorPassoVisitado}
          >
            <span className="wizard-passo-numero">{indice + 1}</span>
            {p.label}
          </button>
        ))}
      </div>

      <div className="wizard-corpo">
        {passoAtual === "origem" && (
          <div className="bestiario-secao">
            <h3>
              <i className="fas fa-wand-magic-sparkles" /> Como você quer começar?
            </h3>
            <div className="wizard-origem-opcoes">
              <button
                type="button"
                className={"wizard-origem-opcao" + (origem === "zero" ? " ativo" : "")}
                aria-pressed={origem === "zero"}
                onClick={() => {
                  // Só limpa se estava copiando: voltar aqui não apaga a ficha em branco já preenchida.
                  if (origem === "clone") setDraft(criarCriaturaVazia());
                  setOrigem("zero");
                  setCloneId("");
                }}
              >
                <i className="fas fa-file" />
                <strong>Do zero</strong>
                <span>Começa com uma ficha em branco.</span>
              </button>
              <button
                type="button"
                className={"wizard-origem-opcao" + (origem === "clone" ? " ativo" : "")}
                aria-pressed={origem === "clone"}
                onClick={() => setOrigem("clone")}
                disabled={criaturas.length === 0}
              >
                <i className="fas fa-copy" />
                <strong>A partir de uma criatura existente</strong>
                <span>
                  {criaturas.length === 0
                    ? "Nenhuma criatura cadastrada ainda pra copiar."
                    : "Copia tudo (atributos, ações...) — você só ajusta o que muda."}
                </span>
              </button>
            </div>
            {origem === "clone" && criaturas.length > 0 && (
              <label>
                Criatura-base
                <select value={cloneId} onChange={(e) => escolherClone(e.target.value)}>
                  <option value="">Escolher...</option>
                  {criaturas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} (ND {c.nd}
                      {c.linhagem ? ` · ${c.linhagem}` : ""})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {passoAtual === "identidade" && (
          <CamposIdentidade draft={draft} campo={campo} sugestoes={sugestoes} linhagens={linhagens} autoFocus />
        )}

        {passoAtual === "nivel" && (
          <>
            <CamposNivel draft={draft} campo={campo} />
            <CamposDeslocamento draft={draft} campo={campo} />
            <CamposDefesas draft={draft} campo={campo} />
          </>
        )}

        {passoAtual === "atributos" && (
          <>
            <CamposAtributos draft={draft} campo={campo} />
            <CamposTestes draft={draft} campo={campo} />
          </>
        )}

        {passoAtual === "recursos" && (
          <div className="bestiario-secao">
            <h3>
              <i className="fas fa-droplet" /> Recursos
            </h3>
            <p className="bestiario-sublabel">
              Opcional. Contadores próprios da criatura, como os recursos da ficha de um jogador; em combate cada cópia
              tem o seu. Uma ação gasta um recurso com o efeito de ficha “Recurso”.
            </p>
            <RecursosEditor recursos={draft.recursos} onChange={(v) => campo("recursos", v)} />
          </div>
        )}

        {passoAtual === "acoes" && (
          <div className="bestiario-secao">
            <h3>
              <i className="fas fa-bolt" /> Ações
            </h3>
            <p className="bestiario-sublabel">
              Aplique o que já está na biblioteca (as ações das outras criaturas ficam lá, na pasta de cada uma) ou
              crie uma nova. O que você criar aqui também vai pra biblioteca ao salvar.
            </p>
            <ComponentesEditor
              componentes={draft.componentes}
              onChange={(atualizar) => setDraft((atual) => ({ ...atual, componentes: atualizar(atual.componentes) }))}
              templates={templates}
              recursos={draft.recursos}
              sugestoes={sugestoesDeAcao(draft)}
            />
          </div>
        )}

        {passoAtual === "revisao" && (
          <div className="wizard-revisao">
            <CamposNotas draft={draft} campo={campo} />
            <p className="bestiario-sublabel">É assim que a ficha fica. Volte a qualquer passo pra ajustar.</p>
            <div className="wizard-preview">
              <FichaCriaturaView criatura={previa} />
            </div>
          </div>
        )}
      </div>

      <div className="wizard-rodape">
        <button type="button" className="bestiario-voltar-lista" onClick={voltar}>
          <i className="fas fa-arrow-left" /> {passo === 0 ? "Cancelar" : "Voltar"}
        </button>
        <span className="wizard-rodape-passo">
          Passo {passo + 1} de {PASSOS.length}
        </span>
        {passoAtual === "revisao" ? (
          <button type="button" className="bestiario-btn-salvar" onClick={finalizar} disabled={salvando}>
            <i className={`fas ${salvando ? "fa-spinner fa-spin" : "fa-check"}`} />
            {salvando ? "Criando..." : "Criar criatura"}
          </button>
        ) : (
          <button
            type="button"
            className="bestiario-btn-salvar"
            onClick={avancar}
            disabled={passoAtual === "origem" && origem === "clone" && !cloneId}
          >
            Continuar <i className="fas fa-arrow-right" />
          </button>
        )}
      </div>
    </div>
  );
}
