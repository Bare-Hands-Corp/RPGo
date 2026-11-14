"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Carta, type ModeloCarta } from "@/components/carta/carta";
import {
  cartaDeAcao,
  cartaDeHabilidade,
  cartaDeItem,
  type AcaoCarta,
  type ContextoCartas,
  type HabilidadeCarta,
  type ItemCarta,
} from "@/components/carta/conversores";
import { CatalogoTiposProvider } from "@/components/tipos-dano/tipos-dano";
import { CatalogoCondicoesProvider } from "@/components/tipos-dano/condicoes";
import { contextoDaAcao, useContextoRico } from "@/app/ficha/[uid]/contexto-rico";
import { lerDuracao } from "@/lib/duracao";
import { lerEfeitos, type Atributo } from "@/lib/op-rpg";
import type { CondicaoCatalogo } from "@/lib/condicoes";
import { ModalCarta } from "@/components/carta/modal-carta";
import { AlternarTemaCartas } from "@/components/carta/tema-cartas";

// A carta tem botões dentro (rolagens da descrição): o invólucro não pode ser
// <button>. Clique num chip rola o dado e não abre a carta.
function clicavel(abrir: () => void) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: (e: React.MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".desc-chip")) abrir();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        abrir();
      }
    },
  } as const;
}

type Aba = "tecnicas" | "acoes" | "habilidades" | "itens";
type EstiloChips = "carta" | "atual";

type FichaDados = {
  nivel: number;
  atributoCd: string | null;
  atributos: Record<Atributo, number>;
  recursos: { id: string; nome: string }[];
};

type Props = {
  fichaId: string;
  condicoes: CondicaoCatalogo[];
  ficha: FichaDados;
  contexto: ContextoCartas;
  acoes: AcaoCarta[];
  habilidades: HabilidadeCarta[];
  itens: ItemCarta[];
};

// Os chips da descrição leem os catálogos da mesa pelos providers, como na ficha.
export function DemoFichaCartas(props: Props) {
  return (
    <CatalogoTiposProvider tipos={props.contexto.tiposDano}>
      <CatalogoCondicoesProvider condicoes={props.condicoes}>
        <Conteudo {...props} />
      </CatalogoCondicoesProvider>
    </CatalogoTiposProvider>
  );
}

function Conteudo({ fichaId, ficha, contexto, acoes, habilidades, itens }: Props) {
  const { ficha: fichaRica, base } = useContextoRico({
    nivel: ficha.nivel,
    atributos: ficha.atributos,
    atributoCd: ficha.atributoCd,
    acoes,
    habilidades,
    itens,
    recursos: ficha.recursos,
  });

  const grupos = useMemo<Record<Aba, ModeloCarta[]>>(() => {
    const deAcao = (a: AcaoCarta) =>
      cartaDeAcao(a, contexto, contextoDaAcao(base, fichaRica, a, lerEfeitos(a.efeitos), lerDuracao(a.duracao)));
    // Com descrição rica primeiro, pra comparar os chips.
    const ricaPrimeiro = (a: AcaoCarta, b: AcaoCarta) =>
      Number(/\{\{|\(\(/.test(b.descricao)) - Number(/\{\{|\(\(/.test(a.descricao));
    return {
      tecnicas: acoes.filter((a) => a.tecnica).sort(ricaPrimeiro).map(deAcao),
      acoes: acoes.filter((a) => !a.tecnica).sort(ricaPrimeiro).map(deAcao),
      habilidades: habilidades.map((h) => cartaDeHabilidade(h, contexto, base)),
      itens: itens.map((i) => cartaDeItem(i, contexto)),
    };
  }, [acoes, habilidades, itens, contexto, base, fichaRica]);

  const [aba, setAba] = useState<Aba>(grupos.tecnicas.length ? "tecnicas" : "acoes");
  const [aberta, setAberta] = useState<number | null>(null);
  const [chips, setChips] = useState<EstiloChips>("carta");
  const cartas = grupos[aba];
  const mao = grupos.tecnicas.length ? grupos.tecnicas : grupos.acoes;

  const ABAS: { slug: Aba; nome: string }[] = [
    { slug: "tecnicas", nome: "Técnicas" },
    { slug: "acoes", nome: "Ações" },
    { slug: "habilidades", nome: "Habilidades" },
    { slug: "itens", nome: "Itens" },
  ];

  return (
    <div className="cartas-demo">
      <header className="cartas-demo-topo">
        <h1>{contexto.personagem}</h1>
        <p>
          Clone da ficha para o protótipo. <Link href={`/ficha/${fichaId}`}>Abrir a ficha</Link> ·{" "}
          <Link href="/prototipo/cartas/ficha">Trocar</Link>
        </p>
      </header>

      {mao.length > 0 && (
        <section>
          <h2>Mão · {grupos.tecnicas.length ? "técnicas" : "ações"}</h2>
          <div className="cartas-mao" key={chips}>
            {mao.slice(0, 7).map((c, i, l) => {
              const d = i - (l.length - 1) / 2;
              return (
                <div
                  key={i}
                  {...clicavel(() => {
                    setAba(grupos.tecnicas.length ? "tecnicas" : "acoes");
                    setAberta(i);
                  })}
                  className="cartas-mao-item"
                  style={{ "--ang": `${d * 5}deg`, "--desce": `${d * d * 5}px`, zIndex: i } as CSSProperties}
                >
                  <Carta carta={c} chips={chips === "carta" ? "carta" : "ficha"} style={{ "--escala": 0.55 } as CSSProperties} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="cartas-barra">
        <nav className="cartas-abas">
          {ABAS.map((a) => (
            <button key={a.slug} className={aba === a.slug ? "ativa" : ""} onClick={() => setAba(a.slug)}>
              {a.nome} <small>{grupos[a.slug].length}</small>
            </button>
          ))}
        </nav>
        <AlternarTemaCartas className="cartas-abas" />
        <div className="cartas-abas" role="group" aria-label="Chips da descrição">
          <span className="cartas-rotulo">Chips:</span>
          <button className={chips === "carta" ? "ativa" : ""} onClick={() => setChips("carta")}>
            Estilo carta
          </button>
          <button className={chips === "atual" ? "ativa" : ""} onClick={() => setChips("atual")}>
            Como na ficha
          </button>
        </div>
      </div>

      {/* key: trocar o estilo dos chips muda o tamanho do texto; remonta pra refazer o encaixe. */}
      <div className="cartas-grade" key={`${aba}-${chips}`}>
        {cartas.map((c, i) => (
          <div key={i} className="cartas-grade-item" {...clicavel(() => setAberta(i))}>
            <Carta carta={c} interativa chips={chips === "carta" ? "carta" : "ficha"} style={{ "--escala": 0.75 } as CSSProperties} />
          </div>
        ))}
        {cartas.length === 0 && <p>Nada aqui.</p>}
      </div>

      {aberta != null && cartas[aberta] && (
        <ModalCarta
          carta={cartas[aberta]}
          chips={chips === "carta" ? "carta" : "ficha"}
          onFechar={() => setAberta(null)}
          onNavegar={(passo) => setAberta((aberta + passo + cartas.length) % cartas.length)}
        />
      )}
    </div>
  );
}
