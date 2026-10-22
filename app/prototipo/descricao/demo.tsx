"use client";

import { useEffect, useState } from "react";
import { Descricao, type ContextoDescricao } from "@/components/descricao/descricao";
import { EditorDescricao, type OpcaoRef } from "@/components/descricao/editor-descricao";
import { EVENTO_EMPILHAR } from "@/lib/empilhar-rolagem";
import { textoPuro } from "@/lib/descricao";

// Dados de mentira: na integração vêm das ações/habilidades/itens da ficha e
// das condições da Biblioteca.
const REFS: OpcaoRef[] = [
  { tipo: "acao", id: "a1", nome: "Soco de Teste" },
  { tipo: "acao", id: "a2", nome: "Investida" },
  { tipo: "hab", id: "h1", nome: "Pernas de Teste" },
  { tipo: "item", id: "i1", nome: "Espada Longa" },
];
const CONDICOES = [
  { nome: "Atordoado", descricao: "Não age no próximo turno; ataques contra você têm vantagem.", cor: "#e67e22" },
  { nome: "Caído", descricao: "Metade do deslocamento para levantar." },
];
const CONTEXTO: ContextoDescricao = {
  // "i1" fica de fora de propósito: mostra a referência apagada.
  refs: {
    "acao:a1": { titulo: "Soco de Teste", texto: "Ataque corpo a corpo com FOR.", selo: "Padrão" },
    "acao:a2": { titulo: "Investida", texto: "Move até o deslocamento e ataca.", selo: "Poderosa" },
    "hab:h1": { titulo: "Pernas de Teste", texto: "Andar +3m. Ação Extra Bônus.", selo: "Passiva" },
  },
  condicoes: CONDICOES,
  nomeRolagem: "Golpe Meteoro",
};

const INICIAL =
  "O golpe causa ((2d6+FOR)) de dano :fire: e deixa o alvo {{cond:Atordoado}}.\n" +
  "**Combina com** [[acao:a2|Investida]] e [[hab:h1|Pernas de Teste]]. Se cair, {{cond:Caído}}.\n" +
  "Referência apagada: [[item:i1|Espada Longa]].";

const LEGADA = "Texto antigo, sem nenhum token: causa 2d6 de dano fogo e deixa o alvo Atordoado (CD 12).";

export function DemoDescricao() {
  const [texto, setTexto] = useState(INICIAL);
  const [evento, setEvento] = useState<string>("nenhum ainda — clique numa rolagem");

  // Escuta o mesmo evento que a Bandeja escuta, pra provar o caminho.
  useEffect(() => {
    const ouvir = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setEvento(
        `dados=${JSON.stringify(d.dados.map((x: { faces: number }) => `d${x.faces}`))} mod=${d.modificador} nomePreset="${d.nomePreset}"`,
      );
    };
    window.addEventListener(EVENTO_EMPILHAR, ouvir);
    return () => window.removeEventListener(EVENTO_EMPILHAR, ouvir);
  }, []);

  return (
    <main className="desc-demo">
      <h1>Protótipo — descrição rica (Fase 5)</h1>

      <section>
        <h2>Editor</h2>
        <EditorDescricao
          valor={texto}
          onChange={setTexto}
          refs={REFS}
          condicoes={CONDICOES.map((c) => c.nome)}
        />
      </section>

      <section className="desc-demo-cartao">
        <h2>Como aparece na ficha (passe o mouse; clique na rolagem)</h2>
        <Descricao texto={texto} contexto={CONTEXTO} />
        <p className="desc-demo-log">Rolador recebeu: {evento}</p>
      </section>

      <section className="desc-demo-cartao">
        <h2>Descrição antiga (texto puro) continua válida</h2>
        <Descricao texto={LEGADA} contexto={CONTEXTO} />
      </section>

      <section>
        <h2>Texto salvo (o que iria para a coluna descricao)</h2>
        <pre data-testid="salvo">{texto}</pre>
        <h2>Texto puro (busca / resumo)</h2>
        <pre>{textoPuro(texto)}</pre>
      </section>
    </main>
  );
}
