import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormCriacao } from "./form";
import "./criacao.css";

export default async function CriacaoPersonagemPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="char-creation-container">
      <div className="char-creation-topbar">
        <Link href="/dashboard" className="btn-voltar-criacao">
          <i className="fas fa-arrow-left" /> Voltar
        </Link>
      </div>

      <div className="char-creation-header">
        <h1>
          <i className="fas fa-user-plus" /> Nova Ficha de Personagem
        </h1>
        <p style={{ color: "var(--text-sec)", fontSize: "0.95rem" }}>
          Preencha os detalhes básicos do seu novo personagem.
        </p>
      </div>

      <FormCriacao />
    </div>
  );
}
