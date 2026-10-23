import { notFound } from "next/navigation";
import { DemoCardAcao } from "./demo";

// Protótipo do card de ação com descrição rica. Só em desenvolvimento.
export default function PrototipoCardAcaoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DemoCardAcao />;
}
