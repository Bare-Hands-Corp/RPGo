"use client";

// Turno do navio no combate (cap. 14.5): uma manobra (velocidade, virar,
// âncora) e uma ação de combate (os canhões ficam na aba Combate; a colisão é
// aqui).

import { useState, useTransition } from "react";
import Swal from "sweetalert2";
import { exigir, type Resultado } from "@/lib/acoes";
import type { CombateVisto } from "@/lib/combate";
import { MANOBRA_NOS, NOS_PRA_COLIDIR, metrosPorRodada, textoRumo } from "@/lib/navio";
import { CampoPasso } from "./campos-modal";
import { colidirNavio, manobrarNavio } from "./actions";

type Voce = NonNullable<CombateVisto["voce"]>;

function mostrarErro(err: unknown) {
  void Swal.fire({
    icon: "error",
    title: "Erro",
    text: err instanceof Error ? err.message : "Operação falhou.",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

export function PainelNavio({
  navioId,
  voce,
  participantes,
}: {
  navioId: string;
  voce: Voce;
  participantes: CombateVisto["participantes"];
}) {
  const navio = voce.navio!;
  const [pendente, startTransition] = useTransition();
  const minimo = Math.max(2, navio.velocidade - MANOBRA_NOS);
  const maximo = Math.min(navio.maxima, navio.velocidade + MANOBRA_NOS);
  const [alvoNos, setAlvoNos] = useState(Math.min(maximo, Math.max(minimo, navio.velocidade)));
  const manobrou = (voce.gastas.bonus ?? 0) >= 1;
  const combateu = (voce.gastas.padrao ?? 0) >= 1;
  const travado = pendente || !voce.naVez;

  function rodar(acao: () => Promise<Resultado<object>>) {
    startTransition(async () => {
      try {
        exigir(await acao());
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  async function colidir() {
    const outros = participantes.filter((p) => !p.voce);
    const r = await Swal.fire({
      title: "Colidir com quem?",
      input: "select",
      inputOptions: Object.fromEntries(outros.map((p) => [p.id, p.nome])),
      showCancelButton: true,
      confirmButtonText: "Colidir",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (r.isConfirmed && r.value) rodar(() => colidirNavio(navioId, String(r.value)));
  }

  return (
    <div className="iniciativa-pedido painel-navio">
      <span className="painel-navio-estado">
        <i className="fas fa-ship" /> <strong>{navio.velocidade} nós</strong> de {navio.maxima} ·{" "}
        {metrosPorRodada(navio.velocidade).toLocaleString("pt-BR")} m/rodada · rumo {textoRumo(navio.rumo)}
        {navio.ancora && <span className="painel-navio-ancora"> · âncora baixada</span>}
      </span>
      <span className="iniciativa-pedido-botoes">
        <span className="painel-navio-grupo" title={manobrou ? "Manobra usada neste turno" : "Manobra do turno"}>
          <CampoPasso rotulo="Velocidade" valor={alvoNos} min={minimo} max={maximo} onChange={setAlvoNos} disabled={travado || manobrou} />
          <button
            type="button"
            className="turno-finalizar compacto"
            disabled={travado || manobrou || alvoNos === navio.velocidade}
            onClick={() => rodar(() => manobrarNavio(navioId, { tipo: "velocidade", valor: alvoNos }))}
          >
            Nós
          </button>
          <button
            type="button"
            className="turno-finalizar compacto secundario"
            disabled={travado || manobrou}
            title="Virar 45° a bombordo"
            onClick={() => rodar(() => manobrarNavio(navioId, { tipo: "virar", lado: -1 }))}
          >
            <i className="fas fa-rotate-left" />
          </button>
          <button
            type="button"
            className="turno-finalizar compacto secundario"
            disabled={travado || manobrou}
            title="Virar 45° a estibordo"
            onClick={() => rodar(() => manobrarNavio(navioId, { tipo: "virar", lado: 1 }))}
          >
            <i className="fas fa-rotate-right" />
          </button>
          <button
            type="button"
            className="turno-finalizar compacto secundario"
            disabled={travado || manobrou}
            onClick={() => rodar(() => manobrarNavio(navioId, { tipo: "ancora", baixar: !navio.ancora }))}
          >
            <i className="fas fa-anchor" /> {navio.ancora ? "Subir" : "Baixar"}
          </button>
        </span>
        <button
          type="button"
          className="turno-finalizar compacto"
          disabled={travado || combateu || navio.velocidade <= NOS_PRA_COLIDIR}
          title={navio.velocidade <= NOS_PRA_COLIDIR ? `Só acima de ${NOS_PRA_COLIDIR} nós` : "Ação de combate"}
          onClick={() => void colidir()}
        >
          <i className="fas fa-burst" /> Colidir
        </button>
      </span>
    </div>
  );
}
