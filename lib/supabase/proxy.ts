// Proxy: refresca a sessão Supabase e redireciona conforme o login.
// Nada entre `createServerClient` e `getClaims()`: pode deslogar (refresh token é de uso único).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { carregarJwks } from "./jwks";

// Rotas acessíveis sem login. Tudo mais exige sessão válida.
const ROTAS_PUBLICAS = ["/login", "/auth/callback"];

function isRotaPublica(pathname: string): boolean {
  return ROTAS_PUBLICAS.some((rota) => pathname.startsWith(rota));
}

export async function updateSession(request: NextRequest) {
  const jwks = await carregarJwks();
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims(undefined, jwks ? { jwks } : undefined);
  const user = data?.claims?.sub ?? null;

  const { pathname } = request.nextUrl;

  // Anônimo tentando rota protegida → manda pro login com ?next= pra voltar depois.
  // A home "/" decide o destino por conta própria (redirect server-side).
  if (!user && !isRotaPublica(pathname) && pathname !== "/") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Logado tentando acessar /login → manda pro dashboard.
  if (user && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}
