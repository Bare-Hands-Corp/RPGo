import { redirect } from "next/navigation";
import { destinoSeguro } from "@/lib/auth";
import { contaPorId, esperaParaReenviar, temCodigoValido } from "@/lib/codigo-email";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { VerificarForm } from "./verificar-form";

// Conta nova cai aqui pelo proxy até confirmar o e-mail com o código.
export default async function VerificarCodigoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [usuario, { next }] = await Promise.all([usuarioDaRequest(), searchParams]);
  if (!usuario) redirect("/login");

  const conta = await contaPorId(usuario.id);
  if (!conta) redirect("/login");

  const [temCodigo, espera] = conta.pendente
    ? await Promise.all([temCodigoValido(conta.id, "verificacao"), esperaParaReenviar(conta.id)])
    : [false, 0];

  return (
    <div className="auth-wrapper">
      <VerificarForm
        email={conta.email}
        destino={destinoSeguro(next)}
        jaConfirmado={!conta.pendente}
        temCodigo={temCodigo}
        espera={espera}
      />
    </div>
  );
}
