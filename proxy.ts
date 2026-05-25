// Proxy do Next 16 (substitui o antigo middleware.ts).
// Roda antes de toda request: refresca sessão Supabase + propaga cookies.
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Roda em tudo exceto assets estáticos.
  // Lógica de redirect (login obrigatório) será adicionada na Fase 1.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
