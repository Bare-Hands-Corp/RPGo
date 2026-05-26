"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";

// Escuta mudanças em personagens (este uid), acoes (deste uid) e itens (deste uid).
// Cada evento dispara router.refresh() — a página re-renderiza no servidor com
// dados frescos. Sem polling, sem race entre tabs.
export function FichaRealtime({ personagemId }: { personagemId: string }) {
  const router = useRouter();
  useRefreshOnFocus();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [personagemId, router]);

  return null;
}
