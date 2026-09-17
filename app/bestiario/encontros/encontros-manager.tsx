"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import {
  criarEsquadrao,
  atualizarEsquadrao,
  deletarEsquadrao,
  criarEncontro,
  atualizarEncontro,
  deletarEncontro,
} from "../composicoes-actions";
import { criarEsquadraoVazio, criarEncontroVazio } from "../utils";
import type { EncontroPayload, EncontroSerializado, EsquadraoPayload, EsquadraoSerializado, ItemComposicao } from "../types";
import { ListaTextoInput, NumeroInput } from "../inputs";

type CriaturaResumo = { id: string; nome: string; nd: string };

type Props = {
  criaturas: CriaturaResumo[];
  esquadroesIniciais: EsquadraoSerializado[];
  encontrosIniciais: EncontroSerializado[];
};

function draftDeItens<T extends { id: string; itens: ItemComposicao[] }>(x: T): ItemComposicao[] {
  return x.itens.map((i) => ({ ...i }));
}

function nomeCriatura(criaturas: CriaturaResumo[], criaturaId: string) {
  return criaturas.find((c) => c.id === criaturaId)?.nome ?? "(criatura removida)";
}

function mesclarItens(base: ItemComposicao[], novos: ItemComposicao[]): ItemComposicao[] {
  const resultado = base.map((i) => ({ ...i }));
  for (const item of novos) {
    const existente = resultado.find((i) => i.criaturaId === item.criaturaId);
    if (existente) existente.quantidade += item.quantidade;
    else resultado.push({ ...item });
  }
  return resultado;
}

// Editor de composição (lista de criatura + quantidade) reaproveitado tanto
// por Esquadrão quanto por Encontro — os dois têm exatamente o mesmo formato.
function EditorItens({
  criaturas,
  itens,
  onChange,
}: {
  criaturas: CriaturaResumo[];
  itens: ItemComposicao[];
  onChange: (itens: ItemComposicao[]) => void;
}) {
  const [criaturaEscolhida, setCriaturaEscolhida] = useState("");

  return (
    <div className="bestiario-lista-linhas">
      <span className="bestiario-sublabel">Criaturas nesta composição</span>
      {itens.length === 0 && <p className="bestiario-vazio">Nenhuma criatura adicionada ainda.</p>}
      {itens.map((item) => (
        <div key={item.criaturaId} className="bestiario-linha-bonus">
          <span>
            {nomeCriatura(criaturas, item.criaturaId)} (ND {criaturas.find((c) => c.id === item.criaturaId)?.nd ?? "?"})
          </span>
          <NumeroInput
            value={item.quantidade}
            onChange={(v) =>
              onChange(itens.map((i) => (i.criaturaId === item.criaturaId ? { ...i, quantidade: v ?? 1 } : i)))
            }
          />
          <button type="button" onClick={() => onChange(itens.filter((i) => i.criaturaId !== item.criaturaId))}>
            <i className="fas fa-xmark" />
          </button>
        </div>
      ))}
      <div className="bestiario-linha-bonus">
        <select value={criaturaEscolhida} onChange={(e) => setCriaturaEscolhida(e.target.value)}>
          <option value="">Escolher criatura...</option>
          {criaturas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} (ND {c.nd})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="bestiario-btn-add"
          onClick={() => {
            if (!criaturaEscolhida) return;
            onChange(mesclarItens(itens, [{ criaturaId: criaturaEscolhida, quantidade: 1 }]));
            setCriaturaEscolhida("");
          }}
        >
          + Adicionar
        </button>
      </div>
    </div>
  );
}

export function EncontrosManager({ criaturas, esquadroesIniciais, encontrosIniciais }: Props) {
  const router = useRouter();
  const [aba, setAba] = useState<"esquadroes" | "encontros">("esquadroes");

  const [esquadroes, setEsquadroes] = useState(esquadroesIniciais);
  const [esquadraoId, setEsquadraoId] = useState<string | null>(null);
  const [draftEsquadrao, setDraftEsquadrao] = useState<EsquadraoPayload>(() => criarEsquadraoVazio());

  const [encontros, setEncontros] = useState(encontrosIniciais);
  const [encontroId, setEncontroId] = useState<string | null>(null);
  const [draftEncontro, setDraftEncontro] = useState<EncontroPayload>(() => criarEncontroVazio());

  const [salvando, setSalvando] = useState(false);

  function novoEsquadrao() {
    setEsquadraoId(null);
    setDraftEsquadrao(criarEsquadraoVazio());
  }

  function editarEsquadrao(e: EsquadraoSerializado) {
    setEsquadraoId(e.id);
    setDraftEsquadrao({ nome: e.nome, itens: draftDeItens(e) });
  }

  async function salvarEsquadrao() {
    if (!draftEsquadrao.nome.trim()) {
      void Swal.fire({ icon: "warning", title: "Nome é obrigatório", background: "var(--bg-card)", color: "var(--text-main)" });
      return;
    }
    setSalvando(true);
    try {
      const salvo = esquadraoId
        ? await atualizarEsquadrao(esquadraoId, draftEsquadrao)
        : await criarEsquadrao(draftEsquadrao);
      setEsquadroes((prev) => {
        const existe = prev.some((x) => x.id === salvo.id);
        const nova = existe ? prev.map((x) => (x.id === salvo.id ? salvo : x)) : [...prev, salvo];
        return nova.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      });
      setEsquadraoId(salvo.id);
      setDraftEsquadrao({ nome: salvo.nome, itens: draftDeItens(salvo) });
      router.refresh();
    } catch (err) {
      void Swal.fire({
        icon: "error",
        title: "Erro ao salvar",
        text: err instanceof Error ? err.message : "Tente novamente.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    } finally {
      setSalvando(false);
    }
  }

  async function removerEsquadrao() {
    if (!esquadraoId) return;
    const confirmacao = await Swal.fire({
      icon: "warning",
      title: `Remover "${draftEsquadrao.nome}"?`,
      showCancelButton: true,
      confirmButtonText: "Sim, remover",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirmacao.isConfirmed) return;
    try {
      await deletarEsquadrao(esquadraoId);
      setEsquadroes((prev) => prev.filter((x) => x.id !== esquadraoId));
      novoEsquadrao();
      router.refresh();
    } catch (err) {
      void Swal.fire({
        icon: "error",
        title: "Erro ao remover",
        text: err instanceof Error ? err.message : "Tente novamente.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    }
  }

  function novoEncontro() {
    setEncontroId(null);
    setDraftEncontro(criarEncontroVazio());
  }

  function editarEncontro(e: EncontroSerializado) {
    setEncontroId(e.id);
    setDraftEncontro({ nome: e.nome, tags: e.tags, itens: draftDeItens(e) });
  }

  async function salvarEncontro() {
    if (!draftEncontro.nome.trim()) {
      void Swal.fire({ icon: "warning", title: "Nome é obrigatório", background: "var(--bg-card)", color: "var(--text-main)" });
      return;
    }
    setSalvando(true);
    try {
      const salvo = encontroId ? await atualizarEncontro(encontroId, draftEncontro) : await criarEncontro(draftEncontro);
      setEncontros((prev) => {
        const existe = prev.some((x) => x.id === salvo.id);
        const nova = existe ? prev.map((x) => (x.id === salvo.id ? salvo : x)) : [...prev, salvo];
        return nova.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      });
      setEncontroId(salvo.id);
      setDraftEncontro({ nome: salvo.nome, tags: salvo.tags, itens: draftDeItens(salvo) });
      router.refresh();
    } catch (err) {
      void Swal.fire({
        icon: "error",
        title: "Erro ao salvar",
        text: err instanceof Error ? err.message : "Tente novamente.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    } finally {
      setSalvando(false);
    }
  }

  async function removerEncontro() {
    if (!encontroId) return;
    const confirmacao = await Swal.fire({
      icon: "warning",
      title: `Remover "${draftEncontro.nome}"?`,
      showCancelButton: true,
      confirmButtonText: "Sim, remover",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirmacao.isConfirmed) return;
    try {
      await deletarEncontro(encontroId);
      setEncontros((prev) => prev.filter((x) => x.id !== encontroId));
      novoEncontro();
      router.refresh();
    } catch (err) {
      void Swal.fire({
        icon: "error",
        title: "Erro ao remover",
        text: err instanceof Error ? err.message : "Tente novamente.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    }
  }

  return (
    <div>
      <nav className="bestiario-tabs" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={"bestiario-tab" + (aba === "esquadroes" ? " active" : "")}
          onClick={() => setAba("esquadroes")}
        >
          <i className="fas fa-people-group" /> Esquadrões
        </button>
        <button
          type="button"
          className={"bestiario-tab" + (aba === "encontros" ? " active" : "")}
          onClick={() => setAba("encontros")}
        >
          <i className="fas fa-skull" /> Encontros
        </button>
      </nav>

      {aba === "esquadroes" ? (
        <div className="biblioteca-shell">
          <aside className="biblioteca-lista">
            <button type="button" className="bestiario-btn-nova" onClick={novoEsquadrao}>
              <i className="fas fa-plus" /> Novo esquadrão
            </button>
            {esquadroes.length === 0 ? (
              <p className="bestiario-vazio">Nenhum esquadrão salvo ainda.</p>
            ) : (
              esquadroes.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={"bestiario-card-item" + (e.id === esquadraoId ? " active" : "")}
                  onClick={() => editarEsquadrao(e)}
                >
                  <span className="bestiario-card-nome">{e.nome}</span>
                  <span className="bestiario-card-meta">{e.itens.length} tipo(s) de criatura</span>
                </button>
              ))
            )}
          </aside>

          <section className="bestiario-editor">
            <div className="bestiario-editor-header">
              <h2>{esquadraoId ? "Editar esquadrão" : "Novo esquadrão"}</h2>
              <div className="bestiario-editor-acoes">
                {esquadraoId && (
                  <button type="button" className="bestiario-btn-remover" onClick={removerEsquadrao}>
                    <i className="fas fa-trash" /> Remover
                  </button>
                )}
                <button type="button" className="bestiario-btn-salvar" onClick={salvarEsquadrao} disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>

            <div className="bestiario-secao">
              <label>
                Nome
                <input
                  value={draftEsquadrao.nome}
                  placeholder="1 Sargento + 4 Soldados de 1ª Classe"
                  onChange={(e) => setDraftEsquadrao((atual) => ({ ...atual, nome: e.target.value }))}
                />
              </label>
              <EditorItens
                criaturas={criaturas}
                itens={draftEsquadrao.itens}
                onChange={(itens) => setDraftEsquadrao((atual) => ({ ...atual, itens }))}
              />
            </div>
          </section>
        </div>
      ) : (
        <div className="biblioteca-shell">
          <aside className="biblioteca-lista">
            <button type="button" className="bestiario-btn-nova" onClick={novoEncontro}>
              <i className="fas fa-plus" /> Novo encontro
            </button>
            {encontros.length === 0 ? (
              <p className="bestiario-vazio">Nenhum encontro salvo ainda.</p>
            ) : (
              encontros.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={"bestiario-card-item" + (e.id === encontroId ? " active" : "")}
                  onClick={() => editarEncontro(e)}
                >
                  <span className="bestiario-card-nome">{e.nome}</span>
                  <span className="bestiario-card-meta">{e.itens.length} tipo(s) de criatura</span>
                </button>
              ))
            )}
          </aside>

          <section className="bestiario-editor">
            <div className="bestiario-editor-header">
              <h2>{encontroId ? "Editar encontro" : "Novo encontro"}</h2>
              <div className="bestiario-editor-acoes">
                {encontroId && (
                  <button type="button" className="bestiario-btn-remover" onClick={removerEncontro}>
                    <i className="fas fa-trash" /> Remover
                  </button>
                )}
                <button type="button" className="bestiario-btn-salvar" onClick={salvarEncontro} disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>

            <div className="bestiario-secao">
              <div className="bestiario-grid">
                <label>
                  Nome
                  <input
                    value={draftEncontro.nome}
                    onChange={(e) => setDraftEncontro((atual) => ({ ...atual, nome: e.target.value }))}
                  />
                </label>
                <label className="bestiario-span-2">
                  Tags (vírgula)
                  <ListaTextoInput
                    value={draftEncontro.tags}
                    onChange={(tags) => setDraftEncontro((atual) => ({ ...atual, tags }))}
                  />
                </label>
              </div>

              {esquadroes.length > 0 && (
                <label>
                  Inserir esquadrão (copia as criaturas pra cá)
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const esquadrao = esquadroes.find((x) => x.id === e.target.value);
                      if (esquadrao) {
                        setDraftEncontro((atual) => ({ ...atual, itens: mesclarItens(atual.itens, esquadrao.itens) }));
                      }
                      e.target.value = "";
                    }}
                  >
                    <option value="" disabled>
                      Escolher esquadrão...
                    </option>
                    {esquadroes.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <EditorItens
                criaturas={criaturas}
                itens={draftEncontro.itens}
                onChange={(itens) => setDraftEncontro((atual) => ({ ...atual, itens }))}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
