"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Força router.refresh() quando a aba volta a ficar visível.
// Cobre o caso: usuário navegou enquanto uma action ainda rodava,
// e ao voltar precisa ver o estado atualizado do SSR.
export function useRefreshOnFocus() {
  const router = useRouter();
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);
}
