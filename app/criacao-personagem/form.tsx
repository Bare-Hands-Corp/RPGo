"use client";

import { useState, useTransition } from "react";
import Swal from "sweetalert2";
import { criarPersonagem } from "./actions";

const ATRIBUTOS = [
  { id: "forca", label: "FOR" },
  { id: "destreza", label: "DES" },
  { id: "constituicao", label: "CON" },
  { id: "sabedoria", label: "INT" },
  { id: "vontade", label: "VON" },
  { id: "presenca", label: "PRE" },
] as const;

export function FormCriacao() {
  const [nome, setNome] = useState("");
  const [nivel, setNivel] = useState(1);
  const [cargaMaxima, setCargaMaxima] = useState(20);
  const [hpMax, setHpMax] = useState(0);
  const [ppMax, setPpMax] = useState(0);
  const [atributos, setAtributos] = useState<Record<string, number>>({
    forca: 0,
    destreza: 0,
    constituicao: 0,
    sabedoria: 0,
    vontade: 0,
    presenca: 0,
  });
  const [pending, startTransition] = useTransition();

  function salvar() {
    if (!nome.trim()) {
      Swal.fire({
        icon: "warning",
        title: "Nome obrigatório",
        text: "Dê um nome ao seu personagem!",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }

    startTransition(async () => {
      try {
        await criarPersonagem({
          nome,
          nivel,
          hpMax,
          ppMax,
          cargaMaxima,
          forca: atributos.forca,
          destreza: atributos.destreza,
          constituicao: atributos.constituicao,
          sabedoria: atributos.sabedoria,
          vontade: atributos.vontade,
          presenca: atributos.presenca,
        });
        // criarPersonagem redireciona pra /ficha/[id], então a linha abaixo não executa.
      } catch (e) {
        // NEXT_REDIRECT é lançado pelo redirect() — não é erro real.
        if (e instanceof Error && e.message === "NEXT_REDIRECT") return;
        Swal.fire({
          icon: "error",
          title: "Erro",
          text: e instanceof Error ? e.message : "Erro ao salvar personagem.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      }
    });
  }

  return (
    <>
      <div className="form-section">
        <h3>
          <i className="fas fa-address-card" /> Identidade
        </h3>
        <div className="form-group">
          <label>Nome do Personagem</label>
          <input
            type="text"
            className="form-input"
            placeholder="João da Silva"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoFocus
          />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Nível Inicial</label>
            <input
              type="number"
              className="form-input"
              min={1}
              value={nivel}
              onChange={(e) => setNivel(Number(e.target.value) || 1)}
            />
          </div>
          <div className="form-group">
            <label>Carga Máxima</label>
            <input
              type="number"
              className="form-input"
              min={0}
              step={0.1}
              value={cargaMaxima}
              onChange={(e) => setCargaMaxima(Number(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>
          <i className="fas fa-heart" /> Barras de vitalidade
        </h3>
        <div className="grid-2">
          <div className="form-group">
            <label>Pontos de Vida Máximos (HP)</label>
            <input
              type="number"
              className="form-input"
              placeholder="Ex: 20"
              min={0}
              value={hpMax || ""}
              onChange={(e) => setHpMax(Number(e.target.value) || 0)}
            />
          </div>
          <div className="form-group">
            <label>Pontos de Poder Máximos (PP)</label>
            <input
              type="number"
              className="form-input"
              placeholder="Ex: 10"
              min={0}
              value={ppMax || ""}
              onChange={(e) => setPpMax(Number(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>
          <i className="fas fa-dumbbell" /> Atributos
        </h3>
        <div className="grid-3" style={{ marginTop: 15 }}>
          {ATRIBUTOS.map((a) => (
            <div className="form-group" key={a.id}>
              <label>{a.label}</label>
              <input
                type="number"
                className="form-input"
                placeholder="0"
                value={atributos[a.id] || ""}
                onChange={(e) =>
                  setAtributos({ ...atributos, [a.id]: Number(e.target.value) || 0 })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 30, textAlign: "center" }}>
        <button
          type="button"
          className="btn-primary"
          style={{ maxWidth: 300 }}
          onClick={salvar}
          disabled={pending}
        >
          {pending ? (
            <>
              <i className="fas fa-spinner fa-spin" /> Criando...
            </>
          ) : (
            <>
              <i className="fas fa-check" /> Criar Personagem
            </>
          )}
        </button>
      </div>
    </>
  );
}
