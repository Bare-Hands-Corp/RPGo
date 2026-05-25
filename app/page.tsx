import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Home decide o destino: logado → dashboard, anônimo → login.
// O proxy também faz esse redirect, mas mantemos aqui como defesa em
// profundidade pra rotas que pulem o matcher.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
