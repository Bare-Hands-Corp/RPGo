"use client";

import { useEffect } from "react";
import { useRefreshAgrupado } from "./use-refresh-agrupado";

// Refresh quando a aba volta a ficar visível (o realtime pode ter perdido eventos).
export function useRefreshOnFocus() {
  const refresh = useRefreshAgrupado();
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);
}
