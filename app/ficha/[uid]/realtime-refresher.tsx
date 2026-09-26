"use client";

import { useEffect } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
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
// Quando o personagem está numa mesa, também escuta o navio da mesa e os demais
// personagens dela (pro painel de Tripulação refletir colegas e o navio ao vivo).
export function FichaRealtime({
  personagemId,
  mesaId,
}: {
  personagemId: string;
  mesaId?: string | null;
}) {
  const refresh = useRefreshAgrupado();
  useRefreshOnFocus();

  useEffect(() => {
    const supabase = createClient();
    let channel = supabase
      .channel(`ficha-${personagemId}`)
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
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "itens",
          filter: `personagem_id=eq.${personagemId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recursos",
          filter: `personagem_id=eq.${personagemId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "habilidades",
          filter: `personagem_id=eq.${personagemId}`,
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
        refresh,
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
        refresh,
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

    // Tripulação: navio da mesa + demais personagens dela (roster ao vivo).
    if (mesaId) {
      channel = channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "navios",
            filter: `mesa_id=eq.${mesaId}`,
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
  }, [personagemId, mesaId, refresh]);

  return null;
}
