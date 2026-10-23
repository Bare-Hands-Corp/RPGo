import { notFound } from "next/navigation";
import { DemoDescricao } from "./demo";

// Protótipo da Fase 5 (descrições ricas). Só em desenvolvimento; não entra em
// produção nem em links da aplicação.
export default function PrototipoDescricaoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DemoDescricao />;
}
