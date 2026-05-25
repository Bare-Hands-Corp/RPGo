"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

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
  const router = useRouter();

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
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "eventos_calendario",
          filter: `calendario_id=eq.${calendarioId}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tipos_clima",
          filter: `calendario_id=eq.${calendarioId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mesaId, calendarioId, router]);

  return null;
}
