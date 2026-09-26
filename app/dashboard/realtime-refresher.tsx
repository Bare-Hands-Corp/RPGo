"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRefreshAgrupado } from "@/lib/use-refresh-agrupado";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";

// Escuta os personagens e as mesas do usuário via Realtime do Supabase e
// dispara router.refresh() — o Server Component re-renderiza com os dados
// novos sem reload de página. Não precisa de polling REST.
export function RealtimeRefresher({ userId }: { userId: string }) {
  const refresh = useRefreshAgrupado();
  useRefreshOnFocus();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`dashboard-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "personagens",
          filter: `user_id=eq.${userId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mesas",
          filter: `user_id=eq.${userId}`,
        },
        refresh,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  return null;
}
