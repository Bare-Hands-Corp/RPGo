// Marca visual de "afetado por exaustão" — ícone 🛏 amarelo ao lado de um valor
// que a exaustão reduziu (acerto, perícia, atributo, deslocamento…). Some quando
// não há exaustão (o pai só renderiza com penalidade ativa).
export function MarcaExausto({ titulo }: { titulo?: string }) {
  return (
    <i
      className="fas fa-bed exausto-marca"
      title={titulo ?? "Reduzido por exaustão"}
    />
  );
}
