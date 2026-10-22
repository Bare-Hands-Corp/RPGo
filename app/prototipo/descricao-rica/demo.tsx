"use client";

import { useEffect, useMemo, useState } from "react";
import { DescricaoRica } from "@/components/descricao-rica/descricao-rica";
import { EditorRico } from "@/components/descricao-rica/editor-rico";
import { resolvedorDaFicha, type ContextoRico, type OpcaoRef } from "@/components/descricao-rica/atomos";
import { EVENTO_EMPILHAR } from "@/lib/empilhar-rolagem";
import { textoPuroRico, usosDoCatalogo, referenciasDeRica } from "@/lib/descricao-rica";

// Dados de mentira. Na integração vêm da ficha (ações, habilidades, itens), da
// Biblioteca (condições, tipos de dano) e dos atributos do personagem.
const REFS: OpcaoRef[] = [
  { tipo: "acao", id: "a1", nome: "Soco de Teste" },
  { tipo: "acao", id: "a2", nome: "Investida" },
  { tipo: "hab", id: "h1", nome: "Pernas de Teste" },
  { tipo: "item", id: "i1", nome: "Espada Longa" },
];
const CONDICOES = [
  { nome: "Atordoado", descricao: "Não age no próximo turno; ataques contra você têm vantagem.", cor: "#e67e22" },
  { nome: "Caído", descricao: "Metade do deslocamento para levantar." },
  { nome: "Envenenado", descricao: "Desvantagem em ataques e testes de atributo.", cor: "#8e44ad" },
];
const FICHA: Record<string, number> = { FOR: 3, DES: 1, CON: 2, SAB: 0, VON: 1, PRE: 0, PROF: 2, NIVEL: 5, GRAU: 2 };

const INICIAL =
  "## Efeito\n" +
  "-:skull: Causa ((2d6+FOR|Fogo)) de dano {{dano:Fogo}} e **{{cor:#e67e22:neon|queima}}** o alvo\n" +
  "-:skull: Alvo fica {{cond:Atordoado}} até o fim do *próximo turno*\n" +
  "  -:skull: Se cair, também {{cond:Caído}}\n" +
  "-:skull: Você ganha {{efeito:vantagem}} e {{efeito:resistencia|Fogo}} neste turno\n" +
  "## Passo a passo\n" +
  "1. Escolha o alvo e use [[acao:a2|Investida]]\n" +
  "1. Gaste o PP da técnica\n" +
  "> Combina com [[hab:h1|Pernas de Teste]]. {{cor:#e74c3c+#f39c12:gradiente|Não acumula}} com outras técnicas.\n" +
  "---\n" +
  "Referência apagada: [[item:i9|Espada Perdida]]";

export function DemoRica() {
  const [texto, setTexto] = useState(INICIAL);
  const [evento, setEvento] = useState("nenhum ainda — clique numa rolagem");

  const contexto = useMemo<ContextoRico>(
    () => ({
      // "i9" fica de fora de propósito: mostra a referência apagada.
      refs: {
        "acao:a1": { titulo: "Soco de Teste", texto: "Ataque corpo a corpo com FOR.", selo: "Padrão" },
        "acao:a2": { titulo: "Investida", texto: "Move até o deslocamento e ataca.", selo: "Poderosa" },
        "hab:h1": { titulo: "Pernas de Teste", texto: "Andar +3m. Ação Extra Bônus.", selo: "Passiva" },
        "item:i1": { titulo: "Espada Longa", selo: "Item" },
      },
      condicoes: CONDICOES,
      resolverFormula: resolvedorDaFicha({ valor: (s) => FICHA[s] ?? 0, nivel: FICHA.NIVEL }),
      nomeRolagem: "Golpe Meteoro",
    }),
    [],
  );

  useEffect(() => {
    const ouvir = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setEvento(
        `dados=${JSON.stringify(d.dados.map((x: { faces: number }) => `d${x.faces}`))} mod=${d.modificador} preset="${d.nomePreset}"`,
      );
    };
    window.addEventListener(EVENTO_EMPILHAR, ouvir);
    return () => window.removeEventListener(EVENTO_EMPILHAR, ouvir);
  }, []);

  const usos = usosDoCatalogo(texto);
  return (
    <main className="desc-demo2">
      <h1>Protótipo v2 — descrição rica completa</h1>
      <p className="desc-demo2-log">
        Para testar: numa linha nova digite “Se você receber envenenado”, “causa 2d6 fogo” ou “ganha vantagem” e
        aceite a sugestão com Tab (ou toque nela). Toque num chip para editá-lo.
      </p>
      <div className="desc-demo2-colunas">
        <section>
          <h2>Editor</h2>
          <EditorRico
            valor={texto}
            onChange={setTexto}
            refs={REFS}
            condicoes={CONDICOES.map((c) => c.nome)}
            contexto={contexto}
          />
        </section>
        <section>
          <h2>Como aparece na ficha</h2>
          <div className="desc-demo2-cartao">
            <DescricaoRica texto={texto} contexto={contexto} />
            <p className="desc-demo2-log" data-testid="evento">
              Rolador recebeu: {evento}
            </p>
          </div>
        </section>
      </div>
      <section>
        <h2>Texto salvo (coluna descricao)</h2>
        <pre data-testid="salvo">{texto}</pre>
      </section>
      <div className="desc-demo2-colunas">
        <section>
          <h2>Texto puro (busca / resumo do card)</h2>
          <pre>{textoPuroRico(texto)}</pre>
        </section>
        <section>
          <h2>O que a descrição chama do catálogo</h2>
          <pre>{JSON.stringify({ ...usos, referencias: referenciasDeRica(texto) }, null, 1)}</pre>
        </section>
      </div>
    </main>
  );
}
