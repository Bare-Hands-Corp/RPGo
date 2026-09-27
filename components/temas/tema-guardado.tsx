"use client";

import { useLayoutEffect } from "react";
import { aplicarTemaSalvo } from "@/lib/themes";

// Reaplica o tema quando o React recria o <html> (hidratação que falhou, erro global).
export function TemaGuardado() {
  useLayoutEffect(aplicarTemaSalvo, []);
  return null;
}
