"use client";

import { useState, useTransition } from "react";
import Swal from "sweetalert2";
import { descansar, gastarDadoDeVida } from "./actions";
import {
  TIPOS_DESCANSO,
  descreverDescanso,
  facesDadoVida,
  type TipoDescanso,
} from "@/lib/descanso";
import { rolarDados } from "@/lib/dice";
import { empilharRolagem } from "@/lib/empilhar-rolagem";

/**
 * Descanso curto/longo + gasto de Dado de Vida.
 *
 * A rolagem do Dado de Vida acontece AQUI (cliente) e é empilhada no Rolador,
 * pra a mesa ver o resultado — mesmo padrão de perícia, ataque e técnica. O
 * server só debita o dado e aplica a cura clampada.
 */
export function DescansoControle({
  personagemId,
  nivel,
  dadosVidaGastos,
  tipoDadoVida,
  modConstituicao,
  onOtimista,
}: {
  personagemId: string;
  nivel: number;
  dadosVidaGastos: number;
  tipoDadoVida: string;
  modConstituicao: number;
  onOtimista?: (patch: { deltaHpAtual: number }) => void;
}) {
  const [, startTransition] = useTransition();
  const [ocupado, setOcupado] = useState(false);

  const disponiveis = Math.max(0, nivel - dadosVidaGastos);
  const faces = facesDadoVida(tipoDadoVida);

  function erro(err: unknown) {
    Swal.fire({
      icon: "error",
      title: "Erro",
      text: err instanceof Error ? err.message : "Operação falhou.",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
  }

  async function pedirDescanso(tipo: TipoDescanso) {
    const meta = TIPOS_DESCANSO.find((t) => t.slug === tipo)!;
    const confirma = await Swal.fire({
      title: meta.nome,
      text: meta.resumo,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Descansar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#3085d6",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirma.isConfirmed) return;

    setOcupado(true);
    startTransition(async () => {
      try {
        const resumo = await descansar(personagemId, tipo);
        const linhas = descreverDescanso(resumo);
        Swal.fire({
          icon: "success",
          title: meta.nome,
          html:
            linhas.length > 0
              ? `<ul style="text-align:left;margin:0;padding-left:1.2em">${linhas
                  .map((l) => `<li>${l}</li>`)
                  .join("")}</ul>`
              : "Nada a recuperar — já estava tudo cheio.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      } catch (err) {
        erro(err);
      } finally {
        setOcupado(false);
      }
    });
  }

  function usarDadoDeVida() {
    if (disponiveis <= 0) return;
    // Rola aqui pra o resultado aparecer no Rolador da Bandeja.
    const resultado = rolarDados([{ faces, sinal: 1 }], modConstituicao);
    const curado = Math.max(0, resultado.total);

    empilharRolagem({
      dados: [{ faces, sinal: 1 }],
      modificador: modConstituicao,
      nomePreset: `Dado de Vida (d${faces})`,
    });

    setOcupado(true);
    startTransition(async () => {
      // useOptimistic exige que o update aconteça DENTRO da transition —
      // fora dela o React lança "optimistic state update outside a transition".
      onOtimista?.({ deltaHpAtual: curado });
      try {
        await gastarDadoDeVida(personagemId, curado);
      } catch (err) {
        erro(err);
      } finally {
        setOcupado(false);
      }
    });
  }

  return (
    <div className="descanso-bloco">
      <div className="recurso-linha">
        <span className="recurso-icone">
          <i className="fas fa-dice" />
        </span>
        <span className="recurso-nome">Dado de Vida d{faces}</span>
        <span className="stat-values">
          <span>{disponiveis}</span> / <span>{nivel}</span>
        </span>
        <button
          type="button"
          className="descanso-dv-btn"
          onClick={usarDadoDeVida}
          disabled={disponiveis <= 0 || ocupado}
          title={
            disponiveis > 0
              ? `Rolar 1d${faces} ${modConstituicao >= 0 ? "+" : "−"} ${Math.abs(
                  modConstituicao,
                )} e curar`
              : "Sem Dados de Vida — recupere num descanso longo"
          }
        >
          <i className="fas fa-plus" />
        </button>
      </div>

      <div className="descanso-botoes">
        {TIPOS_DESCANSO.map((t) => (
          <button
            type="button"
            key={t.slug}
            className="descanso-btn"
            onClick={() => pedirDescanso(t.slug)}
            disabled={ocupado}
            title={t.resumo}
          >
            <i className={`fas ${t.icone}`} /> {t.slug === "curto" ? "Curto" : "Longo"}
          </button>
        ))}
      </div>
    </div>
  );
}
