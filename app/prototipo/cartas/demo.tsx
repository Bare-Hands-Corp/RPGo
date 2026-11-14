"use client";

import { useState, type CSSProperties } from "react";
import { ModalCarta } from "@/components/carta/modal-carta";
import { Carta, type ModeloCarta } from "@/components/carta/carta";
import { IconeAncora, IconeChama, IconeEscudo, IconeEspada, IconeFrasco, IconeOlho, IconePunho } from "@/components/carta/icones";
import "./cartas-demo.css";

// Dados de mentira. Na integração, cada tipo teria seu conversor:
// cartaDeAcao(acao), cartaDeHabilidade(hab), cartaDeItem(item)...
const CARTAS: ModeloCarta[] = [
  {
    titulo: "Corte Relâmpago",
    subtitulo: "Técnica de Espada · Grau 2",
    faixa: "TÉCNICA · PODEROSA",
    cor: "#c0571b",
    icone: <IconeEspada />,
    nivel: 2,
    custo: { valor: 3, simbolo: "PP", titulo: "Custa 3 Pontos de Poder" },
    linhaInfo: [
      { rotulo: "Alcance", valor: "1,5 m" },
      { rotulo: "Dano", valor: "2d8 + FOR cortante" },
    ],
    corpo: (
      <>
        <p>Você avança num único movimento e desfere um corte antes que o alvo reaja.</p>
        <ul>
          <li>Move até 6 m sem provocar ataques de oportunidade antes do golpe.</li>
          <li>
            Em um <em>acerto crítico</em>, o alvo fica <em>Atordoado</em> até o fim do próximo turno.
          </li>
        </ul>
      </>
    ),
    rodape: "Técnica · Kenjutsu",
    raridade: "raro",
  },
  {
    titulo: "Investida",
    subtitulo: "Ação Padrão",
    faixa: "AÇÃO",
    cor: "#2f7fc1",
    icone: <IconePunho />,
    linhaInfo: [{ rotulo: "Movimento", valor: "deslocamento" }],
    corpo: (
      <p>
        Move até o seu deslocamento em linha reta e faz um ataque corpo a corpo no fim do movimento com <em>+2</em> no
        acerto. Até o seu próximo turno, ataques contra você têm <em>+2</em>.
      </p>
    ),
    rodape: "Ação básica",
  },
  {
    titulo: "Esquiva Instintiva",
    subtitulo: "Reação",
    faixa: "REAÇÃO",
    cor: "#239b56",
    icone: <IconeEscudo />,
    custo: { valor: 1, simbolo: "PP" },
    corpo: (
      <p>
        Quando um ataque que você pode ver te acertaria, some <em>+DES</em> à sua Defesa contra ele. Se o ataque errar,
        você pode se mover 1,5 m.
      </p>
    ),
    rodape: "Reação · 1×/rodada",
  },
  {
    titulo: "Olhos da Tempestade",
    subtitulo: "Habilidade · Passiva",
    faixa: "HABILIDADE",
    cor: "#1e8a7a",
    icone: <IconeOlho />,
    nivel: 7,
    corpo: (
      <>
        <p>Quando 4 ou mais das suas técnicas forem da mesma escola, ganhe:</p>
        <ul>
          <li>
            Em mar aberto, <em>+2</em> em testes de Percepção e Navegação.
          </li>
          <li>
            Uma vez por descanso, dobre o seu modificador de <em>SAB</em> em um teste. Declare antes de rolar.
          </li>
        </ul>
      </>
    ),
    rodape: "Árvore do Navegador · Nível 7",
    raridade: "lendario",
  },
  {
    titulo: "Lâmina do Corsário",
    subtitulo: "Arma Marcial · Lendária",
    faixa: "ARMA",
    cor: "#8a6d1f",
    icone: <IconeAncora />,
    linhaInfo: [
      { rotulo: "Dano", valor: "1d10 + 1d6 fogo" },
      { rotulo: "Peso", valor: "3" },
    ],
    corpo: (
      <>
        <p>
          <em>Acuidade, Versátil.</em>
        </p>
        <p>
          Enquanto equipada, seus ataques críticos deixam o alvo <em>Queimando</em> (1d4 fogo por turno, 2 rodadas).
        </p>
      </>
    ),
    rodape: "Item · Equipado",
    raridade: "lendario",
  },
  {
    titulo: "Grito de Guerra",
    subtitulo: "Ação Bônus · 1× por descanso longo",
    faixa: "AÇÃO BÔNUS",
    cor: "#b8860b",
    icone: <IconeChama />,
    corpo: (
      <p>
        Você e aliados a até 9 m ganham <em>1d6 PV temporários</em> e vantagem no próximo ataque.
      </p>
    ),
    rodape: "Ação bônus",
    gasta: { motivo: "recupera no descanso longo" },
  },
  {
    titulo: "Tônico do Médico",
    subtitulo: "Consumível",
    faixa: "ITEM",
    cor: "#7b4fa0",
    icone: <IconeFrasco />,
    custo: { valor: "×3", simbolo: "" },
    corpo: (
      <p>
        Com uma ação bônus, beba ou dê a um aliado adjacente: recupera <em>2d4 + 2 PV</em> e remove <em>Envenenado</em>.
      </p>
    ),
    rodape: "Item · Peso 0,5",
  },
];

export function DemoCartas() {
  const [aberta, setAberta] = useState<number | null>(null);

  return (
    <div className="cartas-demo">
      <header className="cartas-demo-topo">
        <h1>Protótipo · Cartas</h1>
        <p>Passe o mouse para inclinar. Clique para abrir, virar e salvar como imagem.</p>
      </header>

      <section>
        <h2>Mão (loadout)</h2>
        <div className="cartas-mao">
          {CARTAS.map((c, i) => {
            const meio = (CARTAS.length - 1) / 2;
            const d = i - meio;
            return (
              <button
                key={c.titulo}
                className="cartas-mao-item"
                style={
                  {
                    "--ang": `${d * 6}deg`,
                    "--desce": `${Math.abs(d) * Math.abs(d) * 6}px`,
                    zIndex: i,
                  } as CSSProperties
                }
                onClick={() => setAberta(i)}
              >
                <Carta carta={c} style={{ "--escala": 0.55 } as CSSProperties} />
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2>Galeria</h2>
        <div className="cartas-grade">
          {CARTAS.map((c, i) => (
            <button key={c.titulo} className="cartas-grade-item" onClick={() => setAberta(i)}>
              <Carta carta={c} interativa style={{ "--escala": 0.75 } as CSSProperties} />
            </button>
          ))}
        </div>
      </section>

      {aberta != null && (
        <ModalCarta
          carta={CARTAS[aberta]}
          onFechar={() => setAberta(null)}
          onNavegar={(passo) => setAberta((aberta + passo + CARTAS.length) % CARTAS.length)}
        />
      )}
    </div>
  );
}

export { ModalCarta };
