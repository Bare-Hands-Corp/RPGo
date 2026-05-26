"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";

// Escuta mudanças nas tabelas personagens/mesas via Realtime do Supabase
// e dispara router.refresh() — o Server Component re-renderiza com os dados
// novos sem reload de página. Não precisa de polling REST.
export function RealtimeRefresher() {
  const router = useRouter();
  useRefreshOnFocus();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "personagens" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mesas" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
