// Cliente Supabase para Server Components, Server Actions e Route Handlers.
// Lê cookies via next/headers — sempre criar um novo cliente por request
// (não compartilhar entre requests).
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { carregarJwks } from "./jwks";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll falha em Server Components — o middleware cuida do refresh.
          }
        },
      },
    },
  );
}

// Usuário logado, com JWT validado localmente (revogação só vale quando o token expira).
export const usuarioDaRequest = cache(async (): Promise<{ id: string } | null> => {
  const [supabase, jwks] = await Promise.all([createClient(), carregarJwks()]);
  const { data, error } = await supabase.auth.getClaims(
    undefined,
    jwks ? { jwks } : undefined,
  );
  const id = data?.claims?.sub;
  if (error || !id) return null;
  return { id };
});
