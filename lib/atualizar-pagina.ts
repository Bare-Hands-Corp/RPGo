"use server";

import { refresh } from "next/cache";

// Re-renderiza a página de quem chamou; falha de rede vira erro da promise, não reload.
export async function atualizarPagina() {
  refresh();
}
