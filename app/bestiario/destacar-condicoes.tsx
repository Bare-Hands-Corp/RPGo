import type { ReactNode } from "react";
import { corDaCondicao } from "./cor-condicao";
import type { CondicaoEfeito } from "./types";

// Em vez de listar as condições impostas como tags separadas, destaca o
// próprio nome delas dentro do texto da ação (cor + borda da condição,
// tooltip com a descrição no hover) — o texto continua sendo a fonte da
// verdade, só ganha destaque visual onde a condição é mencionada. Se o mestre
// escolheu a condição mas não chegou a escrever o nome dela no texto, ela
// aparece destacada no fim da frase, pra não sumir informação.
export function destacarCondicoes(texto: string, condicoes: CondicaoEfeito[]): ReactNode {
  if (condicoes.length === 0) return texto;

  let partes: ReactNode[] = [texto];
  const naoEncontradas: CondicaoEfeito[] = [];

  for (const cond of condicoes) {
    if (!cond.nome.trim()) continue;
    let achou = false;
    const novasPartes: ReactNode[] = [];
    for (const parte of partes) {
      if (typeof parte !== "string" || achou) {
        novasPartes.push(parte);
        continue;
      }
      const indice = parte.toLowerCase().indexOf(cond.nome.toLowerCase());
      if (indice === -1) {
        novasPartes.push(parte);
        continue;
      }
      achou = true;
      const antes = parte.slice(0, indice);
      const trecho = parte.slice(indice, indice + cond.nome.length);
      const depois = parte.slice(indice + cond.nome.length);
      if (antes) novasPartes.push(antes);
      novasPartes.push(<SpanCondicao key={cond.id} cond={cond} texto={trecho} />);
      if (depois) novasPartes.push(depois);
    }
    partes = novasPartes;
    if (!achou) naoEncontradas.push(cond);
  }

  if (naoEncontradas.length > 0) {
    partes.push(" ");
    naoEncontradas.forEach((cond, i) => {
      partes.push(
        <SpanCondicao
          key={cond.id}
          cond={cond}
          texto={cond.nome + (cond.duracaoTurnos ? ` (${cond.duracaoTurnos}t)` : "")}
        />,
      );
      if (i < naoEncontradas.length - 1) partes.push(" ");
    });
  }

  return partes;
}

function SpanCondicao({ cond, texto }: { cond: CondicaoEfeito; texto: string }) {
  const cor = cond.cor || corDaCondicao(cond.nome);
  return (
    <span
      className="bestiario-condicao-inline"
      style={{ borderColor: cor, color: cor, background: `color-mix(in oklch, ${cor} 14%, transparent)` }}
      title={cond.descricao || cond.nome}
    >
      {texto}
    </span>
  );
}
