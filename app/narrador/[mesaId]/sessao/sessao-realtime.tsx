"use client";

import { useRefreshAgrupado } from "@/lib/use-refresh-agrupado";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { canal } from "@/lib/supabase/canal";

// Sessao/Combate/InstanciaCombate são realtime — jogadores acompanham
// iniciativa e PV ao vivo. combateId é null até um combate existir; o efeito
// reassina o canal quando ele aparece (a própria sessão vira prop nova após
// o router.refresh() disparado pelas actions).
export function SessaoRealtime({ mesaId, sessaoId, combateId }: { mesaId: string; sessaoId: string | null; combateId: string | null }) {
  // Uma ação de combate mexe em várias tabelas: os eventos viram um refresh só.
  const refresh = useRefreshAgrupado();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(canal(`sessao-${mesaId}`)).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sessoes", filter: `mesa_id=eq.${mesaId}` },
      () => refresh(),
    );

    if (sessaoId) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "combates", filter: `sessao_id=eq.${sessaoId}` },
        () => refresh(),
      );
    }

    if (combateId) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "instancias_combate", filter: `combate_id=eq.${combateId}` },
        () => refresh(),
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mesaId, sessaoId, combateId, refresh]);

  return null;
}
