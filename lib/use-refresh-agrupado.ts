"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Junta eventos de realtime próximos num router.refresh() só.
export function useRefreshAgrupado(esperaMs = 300) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      router.refresh();
    }, esperaMs);
  }, [router, esperaMs]);
}
