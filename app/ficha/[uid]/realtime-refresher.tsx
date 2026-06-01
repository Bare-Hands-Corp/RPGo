"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";

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
  const router = useRouter();
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
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "acoes",
          filter: `personagem_id=eq.${personagemId}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "itens",
          filter: `personagem_id=eq.${personagemId}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recursos",
          filter: `personagem_id=eq.${personagemId}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "habilidades",
          filter: `personagem_id=eq.${personagemId}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pericias_custom",
          filter: `personagem_id=eq.${personagemId}`,
        },
        () => router.refresh(),
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
          () => router.refresh(),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "personagens",
            filter: `mesa_id=eq.${mesaId}`,
          },
          () => router.refresh(),
        );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [personagemId, mesaId, router]);

  return null;
}
