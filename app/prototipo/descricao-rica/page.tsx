import { notFound } from "next/navigation";
import { DemoRica } from "./demo";

// Protótipo v2 da Fase 5 (descrição rica completa). Só em desenvolvimento.
export default function PrototipoDescricaoRicaPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DemoRica />;
}
