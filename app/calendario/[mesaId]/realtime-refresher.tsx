"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRefreshAgrupado } from "@/lib/use-refresh-agrupado";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";

// Realtime do calendário: ouve mudanças em calendarios (dataAtualDias, config),
// eventos_calendario e tipos_clima — todos do calendarioId desta mesa.
// Cada evento dispara router.refresh().
export function CalendarioRealtime({
  mesaId,
  calendarioId,
}: {
  mesaId: string;
  calendarioId: string;
}) {
  const refresh = useRefreshAgrupado();
  useRefreshOnFocus();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`calendario-${mesaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calendarios",
          filter: `mesa_id=eq.${mesaId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "eventos_calendario",
          filter: `calendario_id=eq.${calendarioId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tipos_clima",
          filter: `calendario_id=eq.${calendarioId}`,
        },
        refresh,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mesaId, calendarioId, refresh]);

  return null;
}
