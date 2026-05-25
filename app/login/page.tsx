import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

// Server Component: checa a sessão antes de renderizar o form.
// Se o usuário já estiver logado, redireciona direto pro dashboard
// (evita o flash da tela de login pra quem já tem sessão).
export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="auth-wrapper">
      <LoginForm />
    </div>
  );
}
