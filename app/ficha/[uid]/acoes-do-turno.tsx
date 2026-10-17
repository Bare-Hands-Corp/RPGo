"use client";

// Ações do turno em combate: uma bolinha por ação que ainda dá pra usar, na
// cor do tipo; cinza depois de gasta. E o botão de finalizar o turno.

import { useTransition } from "react";
import Swal from "sweetalert2";
import { exigir } from "@/lib/acoes";
import { ACAO_COMBATE, TIPOS_ACAO_COMBATE, type AcoesGastas, type TipoAcaoCombate } from "@/lib/combate";
import { empilharD20 } from "@/lib/empilhar-rolagem";
import type { Atributo } from "@/lib/op-rpg";
import { finalizarTurno } from "./actions";

// A sidebar ouve e roda o "a cada turno" (efeitos e durações) antes de a vez passar.
export const EVENTO_FINALIZAR_TURNO = "rpgo:finalizar-turno";

// A faixa da iniciativa pede à ficha lateral a rolagem de concentração
// (é ela que sabe o bônus). `detail`: { cd, resolucaoId }.
export const EVENTO_ROLAR_CONCENTRACAO = "rpgo:rolar-concentracao";
export type RolarConcentracaoDetail = { cd: number; resolucaoId: string };

// Pede à aba Perícias uma salvaguarda com o bônus da ficha; quem pede clica
// em seguida no chip do atributo (`[data-salvaguarda]`), que a atende.
export const EVENTO_SALVAGUARDA_AVULSA = "rpgo:salvaguarda-avulsa";
// `pericia`: o pedido é de teste de perícia (o chip `[data-pericia]` atende).
export type SalvaguardaAvulsa = {
  atributo: string;
  pericia?: string;
  rotulo: string;
  aoConcluir: (lance: { total: number; natural: number | null }) => void;
};

// Ficha sem a aba Perícias (navio) rola o d20 puro.
export function rolarSalvaguardaAvulsa(pedido: SalvaguardaAvulsa) {
  const chip = document.querySelector<HTMLButtonElement>(`[data-salvaguarda="${pedido.atributo}"]`);
  if (!chip) {
    empilharD20(0, pedido.rotulo, { tipo: "salvaguarda", atributo: pedido.atributo as Atributo }, undefined, {
      aoConcluir: (lances) => lances[0] && pedido.aoConcluir(lances[0]),
    });
    return;
  }
  window.dispatchEvent(new CustomEvent<SalvaguardaAvulsa>(EVENTO_SALVAGUARDA_AVULSA, { detail: pedido }));
  chip.click();
}

// Teste de perícia pedido de fora da aba (Tratar uma condição). Ficha sem a
// aba Perícias rola o d20 puro.
export function rolarPericiaAvulsa(pedido: Omit<SalvaguardaAvulsa, "atributo"> & { pericia: string }) {
  const chip = document.querySelector<HTMLButtonElement>(`[data-pericia="${pedido.pericia}"]`);
  if (!chip) {
    empilharD20(0, pedido.rotulo, { tipo: "pericia", pericia: pedido.pericia }, undefined, {
      aoConcluir: (lances) => lances[0] && pedido.aoConcluir(lances[0]),
    });
    return;
  }
  window.dispatchEvent(
    new CustomEvent<SalvaguardaAvulsa>(EVENTO_SALVAGUARDA_AVULSA, { detail: { ...pedido, atributo: "" } }),
  );
  chip.click();
}

// A ficha lateral avisa a aba de ações do atributo novo da CD das técnicas.
export const EVENTO_CD_TECNICAS = "rpgo:cd-tecnicas";

export function BotaoFinalizarTurno({
  personagemId,
  compacto = false,
  rolagensPendentes = 0,
}: {
  personagemId: string;
  compacto?: boolean;
  // Ações com alvo que ainda esperam o acerto ou o dano deste personagem.
  rolagensPendentes?: number;
}) {
  const [pendente, startTransition] = useTransition();

  async function finalizar() {
    if (rolagensPendentes > 0) {
      const ok = await Swal.fire({
        icon: "warning",
        title: "Tem rolagem pendente",
        text: "Você usou uma ação num alvo e ainda não rolou o acerto ou o dano. Finalizar o turno mesmo assim?",
        showCancelButton: true,
        confirmButtonText: "Finalizar",
        cancelButtonText: "Voltar",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      if (!ok.isConfirmed) return;
    }
    window.dispatchEvent(new CustomEvent(EVENTO_FINALIZAR_TURNO));
    startTransition(async () => {
      try {
        exigir(await finalizarTurno(personagemId));
      } catch (err) {
        void Swal.fire({
          icon: "error",
          title: "Erro",
          text: err instanceof Error ? err.message : "Não deu pra finalizar o turno.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      }
    });
  }

  return (
    <button
      type="button"
      className={`turno-finalizar${compacto ? " compacto" : ""}`}
      onClick={finalizar}
      disabled={pendente}
      title="Passa a vez pro próximo, mesmo com ações sobrando"
    >
      <i className="fas fa-flag-checkered" /> {pendente ? "Passando…" : "Finalizar turno"}
    </button>
  );
}

export function AcoesDoTurno({
  personagemId,
  naVez,
  gastas,
  maximo,
  fontesExtras,
  rolagensPendentes,
}: {
  personagemId: string;
  rolagensPendentes: number;
  naVez: boolean;
  gastas: AcoesGastas;
  maximo: Record<TipoAcaoCombate, number>;
  // De onde vêm as ações a mais de cada tipo.
  fontesExtras: Partial<Record<TipoAcaoCombate, string[]>>;
}) {
  return (
    <div className={`turno-acoes${naVez ? " na-vez" : ""}`}>
      <div className="turno-acoes-lista">
        {TIPOS_ACAO_COMBATE.map((tipo) => {
          const total = maximo[tipo];
          const usadas = Math.min(total, gastas[tipo] ?? 0);
          const restam = total - usadas;
          const fontes = fontesExtras[tipo] ?? [];
          return (
            <div
              key={tipo}
              className="turno-acao"
              style={{ "--acao-cor": ACAO_COMBATE[tipo].cor } as React.CSSProperties}
              title={
                `${ACAO_COMBATE[tipo].nome}: ${restam} de ${total}` +
                (fontes.length > 0 ? ` (a mais: ${fontes.join(", ")})` : "")
              }
            >
              <span className="turno-bolinhas" aria-hidden>
                {Array.from({ length: total }, (_, i) => (
                  <span key={i} className={`turno-bolinha${i < restam ? "" : " gasta"}`} />
                ))}
              </span>
              <span className="turno-acao-nome">{ACAO_COMBATE[tipo].nome}</span>
              <span className="sr-only">
                {restam} de {total}
              </span>
            </div>
          );
        })}
      </div>
      {naVez ? (
        <BotaoFinalizarTurno personagemId={personagemId} rolagensPendentes={rolagensPendentes} />
      ) : (
        <span className="turno-espera">
          <i className="fas fa-hourglass-half" /> Aguardando a sua vez
        </span>
      )}
    </div>
  );
}
