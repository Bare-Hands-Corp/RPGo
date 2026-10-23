import { notFound } from "next/navigation";
import { DemoAcaoDescricao } from "./demo";

// Protótipo: descrição gerada dos efeitos da ação, com chips de valor calculado.
// Só em desenvolvimento.
export default function PrototipoAcaoDescricaoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DemoAcaoDescricao />;
}
