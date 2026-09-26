// Chaves públicas (JWKS) do Supabase em cache por instância: com elas o
// `getClaims()` valida o JWT sem ir à rede. Sem `next/headers` — o proxy usa.
import type { JWK } from "@supabase/supabase-js";

const TTL_MS = 10 * 60 * 1000;
let jwksPromise: Promise<{ keys: JWK[] } | null> | null = null;
let buscadoEm = 0;

export function carregarJwks(): Promise<{ keys: JWK[] } | null> {
  const agora = Date.now();
  if (!jwksPromise || agora - buscadoEm > TTL_MS) {
    buscadoEm = agora;
    jwksPromise = fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((corpo) => (corpo?.keys?.length ? (corpo as { keys: JWK[] }) : null))
      .catch(() => null);
  }
  return jwksPromise;
}
