// Proxy: refresca a sessão Supabase e redireciona conforme o login.
// Nada entre `createServerClient` e `getClaims()`: pode deslogar (refresh token é de uso único).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { carregarJwks } from "./jwks";

// Rotas acessíveis sem login. Tudo mais exige sessão válida.
const ROTAS_PUBLICAS = ["/login", "/auth/callback", "/recuperar-senha"];
// Única rota liberada pra conta logada que ainda não confirmou o e-mail.
const ROTA_VERIFICAR = "/verificar-codigo";

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
  // Conta criada pelo cadastro nasce com email_pendente; o código tira (app_metadata só a service role escreve).
  const pendente = data?.claims?.app_metadata?.email_pendente === true;

  const { pathname } = request.nextUrl;

  // Anônimo tentando rota protegida → manda pro login com ?next= pra voltar depois.
  // A home "/" decide o destino por conta própria (redirect server-side).
  if (!user && !isRotaPublica(pathname) && pathname !== "/") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect de quem está logado leva junto os cookies renovados nesta request.
  function redirecionarLogado(destino: string, next?: string) {
    const url = request.nextUrl.clone();
    url.pathname = destino;
    url.search = "";
    if (next) url.searchParams.set("next", next);
    const resposta = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => resposta.cookies.set(c));
    return resposta;
  }

  // Logado tentando acessar /login → manda pro dashboard (ou pro código, se falta confirmar).
  if (user && pathname === "/login") {
    return redirecionarLogado(pendente ? ROTA_VERIFICAR : "/dashboard");
  }

  // Logado sem e-mail confirmado → tela do código, guardando o destino.
  if (user && pendente && !isRotaPublica(pathname) && !pathname.startsWith(ROTA_VERIFICAR)) {
    return redirecionarLogado(ROTA_VERIFICAR, pathname !== "/" ? pathname : undefined);
  }

  return supabaseResponse;
}
