// Formas alternativas: ação ou habilidade que fica dentro do card de outra (a origem).
// Puro (cliente e servidor).

type ComForma = { id: string; formaDe?: string | null };

// Origem de cada forma e as formas de cada origem; origem apagada solta a forma.
export function agruparFormas<T extends ComForma>(itens: T[]) {
  const porId = new Map(itens.map((x) => [x.id, x]));
  function origemDe(item: T): T | undefined {
    let origem = item.formaDe && item.formaDe !== item.id ? porId.get(item.formaDe) : undefined;
    for (let i = 0; i < 5 && origem?.formaDe && porId.has(origem.formaDe); i++) {
      origem = porId.get(origem.formaDe);
    }
    return origem?.id === item.id ? undefined : origem;
  }
  const formasDe = new Map<string, T[]>();
  for (const item of itens) {
    const origem = origemDe(item);
    if (origem) formasDe.set(origem.id, [...(formasDe.get(origem.id) ?? []), item]);
  }
  // A origem seguida das formas dela.
  const grupoDe = (origem: T): T[] => [origem, ...(formasDe.get(origem.id) ?? [])];
  return { origemDe, formasDe, grupoDe };
}
