"use client";

import { useEffect } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { canal } from "@/lib/supabase/canal";
import { useRefreshAgrupado } from "@/lib/use-refresh-agrupado";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";

// O que a aba Tripulação mostra de um colega.
const CAMPOS_TRIPULANTE = ["nome", "foto_url", "nivel", "mesa_id"];

function mudouTripulante(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): boolean {
  if (payload.eventType !== "UPDATE") return true;
  const { new: novo, old: velho } = payload;
  return CAMPOS_TRIPULANTE.some((c) => novo[c] !== velho[c]);
}

// Escuta mudanças em personagens (este uid), acoes (deste uid) e itens (deste uid).
// Cada evento dispara router.refresh() — a página re-renderiza no servidor com
// dados frescos. Sem polling, sem race entre tabs.
// Quando o personagem está numa mesa, também escuta as subfichas da mesa (o
// navio) e os demais personagens dela, pro painel de Tripulação. `temSubfichas`
// liga a escuta das subfichas do próprio personagem (os cards dele).
export function FichaRealtime({
  personagemId,
  mesaId,
  temSubfichas = false,
}: {
  personagemId: string;
  mesaId?: string | null;
  temSubfichas?: boolean;
}) {
  const refresh = useRefreshAgrupado();
  // Tabelas da própria ficha: o eco de quem acabou de mexer aqui não refaz a página.
  const refreshDaFicha = useRefreshAgrupado(300, true);
  useRefreshOnFocus();

  useEffect(() => {
    const supabase = createClient();
    let channel = supabase
      .channel(canal(`ficha-${personagemId}`))
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "personagens",
          filter: `id=eq.${personagemId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "acoes",
          filter: `personagem_id=eq.${personagemId}`,
        },
        refreshDaFicha,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "itens",
          filter: `personagem_id=eq.${personagemId}`,
        },
        refreshDaFicha,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recursos",
          filter: `personagem_id=eq.${personagemId}`,
        },
        refreshDaFicha,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "habilidades",
          filter: `personagem_id=eq.${personagemId}`,
        },
        refreshDaFicha,
      )
      // Habilidade de aliado ligada (ou desligada) neste personagem.
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "habilidades",
          filter: `alvo_personagem_id=eq.${personagemId}`,
        },
        refresh,
      )
      // Ação de aliado que deixou efeitos valendo neste personagem (começou ou acabou).
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "acoes",
          filter: `aliado_em_curso_id=eq.${personagemId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pericias_custom",
          filter: `personagem_id=eq.${personagemId}`,
        },
        refreshDaFicha,
      )
      // Só `arvores` é assinada: camadas e nós não têm personagem_id pra filtrar.
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "arvores",
          filter: `personagem_id=eq.${personagemId}`,
        },
        refreshDaFicha,
      )
      // Narrador também edita objetivos.
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "objetivos",
          filter: `personagem_id=eq.${personagemId}`,
        },
        refresh,
      );

    if (temSubfichas) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "personagens",
          filter: `dono_personagem_id=eq.${personagemId}`,
        },
        refresh,
      );
    }

    // Tripulação: subfichas da mesa (navio) + demais personagens dela (roster ao vivo).
    if (mesaId) {
      channel = channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "personagens",
            filter: `dono_mesa_id=eq.${mesaId}`,
          },
          refresh,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "personagens",
            filter: `mesa_id=eq.${mesaId}`,
          },
          // O próprio personagem já vem pela assinatura por id.
          (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            const linha = payload.eventType === "DELETE" ? payload.old : payload.new;
            if (linha.id !== personagemId && mudouTripulante(payload)) refresh();
          },
        );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [personagemId, mesaId, temSubfichas, refresh, refreshDaFicha]);

  return null;
}
