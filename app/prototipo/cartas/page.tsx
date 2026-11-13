import { notFound } from "next/navigation";
import { DemoCartas } from "./demo";

// Protótipo das cartas (técnicas, ações, habilidades e itens). Só em desenvolvimento.
export default function PrototipoCartasPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DemoCartas />;
}
