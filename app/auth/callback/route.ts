// Handler chamado pelo Supabase após o usuário clicar no link de confirmação
// de email (ou em qualquer fluxo OAuth/magic-link).
// Troca o ?code=... pelos cookies de sessão e redireciona pro destino.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Permite passar ?next=/algumlugar pra redirecionar pós-login.
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Falhou: volta pro login com flag de erro pra UI exibir mensagem.
  return NextResponse.redirect(`${origin}/login?erro=callback`);
}
