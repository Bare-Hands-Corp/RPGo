import { Tooltip } from "@/components/tooltip";

// Marca visual de "afetado por exaustão" — ícone 🛏 amarelo ao lado de um valor
// que a exaustão reduziu (acerto, perícia, atributo, deslocamento…). Some quando
// não há exaustão (o pai só renderiza com penalidade ativa). Sem `titulo`, é só
// o ícone (quando a dica do valor já conta a exaustão).
export function MarcaExausto({ titulo }: { titulo?: string }) {
  const icone = <i className="fas fa-bed exausto-marca" />;
  if (!titulo) return icone;
  return (
    <Tooltip titulo="Exaustão" icone="fa-bed" cor="var(--warning)" texto={titulo}>
      {icone}
    </Tooltip>
  );
}
