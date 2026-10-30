import { RecuperarForm } from "./recuperar-form";

// Pública: e-mail → código → senha nova (já entra no fim).
export default async function RecuperarSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <div className="auth-wrapper">
      <RecuperarForm emailInicial={email ?? ""} />
    </div>
  );
}
