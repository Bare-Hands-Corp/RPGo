import { redirect } from "next/navigation";
import { usuarioDaRequest } from "@/lib/supabase/server";

// Home decide o destino: logado → dashboard, anônimo → login.
// O proxy também faz esse redirect, mas mantemos aqui como defesa em
// profundidade pra rotas que pulem o matcher.
export default async function Home() {
  const user = await usuarioDaRequest();

  redirect(user ? "/dashboard" : "/login");
}
