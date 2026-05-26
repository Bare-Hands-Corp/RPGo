"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";

// Reage a UPDATE e INSERT em personagens filtrados por esta mesa
// (UPDATE cobre HP/PP/nivel/etc; também cobre o caso de um jogador
// que acabou de se associar à mesa via UPDATE mesa_id).
// Cada evento dispara router.refresh().
export function NarradorRealtime({ mesaId }: { mesaId: string }) {
  const router = useRouter();
  useRefreshOnFocus();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`narrador-${mesaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "personagens",
          filter: `mesa_id=eq.${mesaId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mesaId, router]);

  return null;
}
