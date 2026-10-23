"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Reordenar listas arrastando pela alça (mouse, dedo e setas do teclado). O
// card sobe e segue o cursor, o lugar dele vira uma vaga marcada na lista, os
// outros deslizam pro novo lugar na hora e, ao soltar, o card encaixa na vaga.
//
// A lista é sempre `{ id, grupo }[]`: o grupo é a categoria em que o item está
// (uma lista simples usa um grupo só). Com `mudaGrupo`, arrastar pra outra
// categoria troca o grupo do item. Quem usa marca no DOM:
//   - cada item:      {...reordenar.item(id)}      (+ `reordenar.vaga(id)` na classe)
//   - cada categoria: {...reordenar.zona(grupo)}   (recebe o item mesmo vazia)
//   - a alça:         {...reordenar.alca(id)}
// e grava a ordem em `aoSoltar`, com a lista toda na ordem nova.

export type ItemOrdenavel = { id: string; grupo: string };

// Ids de cada grupo, na ordem em que aparecem.
export function idsPorGrupo(lista: ItemOrdenavel[]): Record<string, string[]> {
  const mapa: Record<string, string[]> = {};
  for (const { id, grupo } of lista) (mapa[grupo] ??= []).push(id);
  return mapa;
}

export function useReordenar({
  itens,
  aoSoltar,
  mudaGrupo = true,
}: {
  itens: ItemOrdenavel[];
  aoSoltar: (lista: ItemOrdenavel[]) => void;
  mudaGrupo?: boolean;
}) {
  const [arrasto, setArrasto] = useState<ItemOrdenavel[] | null>(null);
  const arrastoRef = useRef<ItemOrdenavel[] | null>(null);
  const [idArrastado, setIdArrastado] = useState<string | null>(null);

  // O que o arrasto em andamento precisa ler sempre atualizado.
  const atual = useRef({ itens, aoSoltar, mudaGrupo });
  useEffect(() => {
    atual.current = { itens, aoSoltar, mudaGrupo };
  });

  // Deslizar dos cards pro novo lugar: compara onde cada um estava (em
  // coordenadas da página, pra rolar não contar) com onde ficou.
  const posicoesAntes = useRef(new Map<string, { x: number; y: number }>());
  const arrastoAnterior = useRef<ItemOrdenavel[] | null>(null);
  const idAnterior = useRef<string | null>(null);
  useLayoutEffect(() => {
    // Ao começar, as categorias fechadas abrem e empurram a lista: rola o
    // tanto que o card arrastado fique onde estava, debaixo do cursor.
    if (idArrastado && idAnterior.current === null) {
      const antes = posicoesAntes.current.get(idArrastado);
      const el = document.querySelector(`[data-reordenar-id="${idArrastado}"]`);
      if (antes && el) {
        const dy = el.getBoundingClientRect().top + window.scrollY - antes.y;
        if (dy) window.scrollBy(0, dy);
      }
    }
    idAnterior.current = idArrastado;
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const meus = new Set(itens.map((i) => i.id));
    const novas = new Map<string, { x: number; y: number }>();
    document.querySelectorAll<HTMLElement>("[data-reordenar-id]").forEach((el) => {
      const id = el.dataset.reordenarId!;
      if (!meus.has(id)) return;
      const r = el.getBoundingClientRect();
      const pos = { x: r.left + window.scrollX, y: r.top + window.scrollY };
      novas.set(id, pos);
      const antes = posicoesAntes.current.get(id);
      if (!reduz && arrastoAnterior.current !== arrasto && antes && (antes.x !== pos.x || antes.y !== pos.y)) {
        el.animate(
          [{ transform: `translate(${antes.x - pos.x}px, ${antes.y - pos.y}px)` }, { transform: "translate(0, 0)" }],
          { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        );
      }
    });
    posicoesAntes.current = novas;
    arrastoAnterior.current = arrasto;
  });

  function guardar(lista: ItemOrdenavel[], antes: string) {
    if (JSON.stringify(idsPorGrupo(lista)) !== antes) atual.current.aoSoltar(lista);
  }

  function iniciar(e: React.PointerEvent<HTMLElement>, id: string) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const card = e.currentTarget.closest<HTMLElement>("[data-reordenar-id]");
    if (!card) return;
    const r0 = card.getBoundingClientRect();
    const dentro = { x: e.clientX - r0.left, y: e.clientY - r0.top };
    const inicio = { x: e.clientX, y: e.clientY };
    const ponteiro = { x: e.clientX, y: e.clientY };
    const antes = JSON.stringify(idsPorGrupo(atual.current.itens));
    let flutuante: HTMLElement | null = null;
    let quadro = 0;
    let livreEm = 0;

    // Onde o cursor está: sobre outro item (antes ou depois dele, conforme a
    // metade) ou numa categoria de outro grupo (vai pro fim dela).
    function avaliar() {
      const base = arrastoRef.current;
      if (!base) return;
      const troca = atual.current.mudaGrupo;
      const eu = base.find((x) => x.id === id);
      if (!eu) return;
      const sob = document.elementFromPoint(ponteiro.x, ponteiro.y);
      const alvo = sob?.closest<HTMLElement>("[data-reordenar-id]");
      const b = alvo ? base.find((x) => x.id === alvo.dataset.reordenarId) : undefined;
      let nova: ItemOrdenavel[] | null = null;
      if (alvo && b) {
        if (b.id === id || (!troca && b.grupo !== eu.grupo)) return;
        const r = alvo.getBoundingClientRect();
        const lado = r.width < (alvo.parentElement?.clientWidth ?? 0) * 0.75;
        const depois = lado ? ponteiro.x > r.left + r.width / 2 : ponteiro.y > r.top + r.height / 2;
        const sem = base.filter((x) => x.id !== id);
        const j = sem.findIndex((x) => x.id === b.id) + (depois ? 1 : 0);
        nova = [...sem.slice(0, j), { id, grupo: b.grupo }, ...sem.slice(j)];
      } else if (troca) {
        const grupo = sob?.closest<HTMLElement>("[data-reordenar-grupo]")?.dataset.reordenarGrupo;
        if (grupo && eu.grupo !== grupo) nova = [...base.filter((x) => x.id !== id), { id, grupo }];
      }
      if (!nova || nova.every((x, i) => x.id === base[i].id && x.grupo === base[i].grupo)) return;
      arrastoRef.current = nova;
      setArrasto(nova);
      // Dá tempo dos cards deslizarem antes de reavaliar, senão eles dançam.
      livreEm = performance.now() + 120;
    }

    function posicionar() {
      if (flutuante) flutuante.style.transform = `translate3d(${ponteiro.x - dentro.x}px, ${ponteiro.y - dentro.y}px, 0)`;
    }

    // Rola a página quando o cursor chega perto da borda.
    function rolar() {
      const borda = 80;
      const h = window.innerHeight;
      const passo =
        ponteiro.y < borda
          ? -((borda - ponteiro.y) / borda) * 18
          : ponteiro.y > h - borda
            ? ((ponteiro.y - (h - borda)) / borda) * 18
            : 0;
      if (passo) window.scrollBy(0, passo);
      if (passo || performance.now() >= livreEm) avaliar();
      quadro = requestAnimationFrame(rolar);
    }

    function comecar() {
      flutuante = card!.cloneNode(true) as HTMLElement;
      flutuante.removeAttribute("data-reordenar-id");
      flutuante.classList.add("reordenar-flutuante");
      Object.assign(flutuante.style, { width: `${r0.width}px`, height: `${r0.height}px` });
      document.body.appendChild(flutuante);
      posicionar();
      requestAnimationFrame(() => flutuante?.classList.add("levantado"));
      document.body.classList.add("reordenando");
      arrastoRef.current = atual.current.itens;
      setIdArrastado(id);
      quadro = requestAnimationFrame(rolar);
    }

    function mover(ev: PointerEvent) {
      ponteiro.x = ev.clientX;
      ponteiro.y = ev.clientY;
      if (!flutuante) {
        if (Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) < 5) return;
        comecar();
      }
      posicionar();
      if (performance.now() >= livreEm) avaliar();
    }

    function soltar() {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      cancelAnimationFrame(quadro);
      if (!flutuante) return;
      const lista = arrastoRef.current;
      const voando = flutuante;
      // Encaixa: o card desce até a vaga e então vira o card de verdade.
      const vaga = document.querySelector(`[data-reordenar-id="${id}"]`)?.getBoundingClientRect();
      voando.classList.remove("levantado");
      if (vaga) {
        voando.style.transition = "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)";
        voando.style.transform = `translate3d(${vaga.left}px, ${vaga.top}px, 0)`;
      }
      setTimeout(
        () => {
          voando.remove();
          document.body.classList.remove("reordenando");
          arrastoRef.current = null;
          setArrasto(null);
          setIdArrastado(null);
          if (lista) guardar(lista, antes);
        },
        vaga ? 230 : 0,
      );
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }

  // Teclado na alça: setas movem o item um lugar dentro do grupo.
  function teclado(e: React.KeyboardEvent, id: string) {
    const passo =
      e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : 0;
    if (!passo) return;
    e.preventDefault();
    const todos = atual.current.itens;
    const eu = todos.find((x) => x.id === id);
    const irmaos = todos.filter((x) => x.grupo === eu?.grupo);
    const vizinho = irmaos[irmaos.findIndex((x) => x.id === id) + passo];
    if (!eu || !vizinho) return;
    const sem = todos.filter((x) => x.id !== id);
    const j = sem.findIndex((x) => x.id === vizinho.id) + (passo > 0 ? 1 : 0);
    guardar([...sem.slice(0, j), eu, ...sem.slice(j)], JSON.stringify(idsPorGrupo(todos)));
  }

  const noArrasto = arrasto ? new Map(arrasto.map((x, i) => [x.id, { grupo: x.grupo, pos: i }])) : null;

  return {
    arrastando: idArrastado !== null,
    idArrastado,
    // Grupo do item agora (no arrasto, o de onde ele está sendo solto).
    grupoDe: (id: string, padrao: string) => noArrasto?.get(id)?.grupo ?? padrao,
    // A lista na ordem do arrasto (igual à de entrada quando não há arrasto).
    ordenar: <T extends { id: string }>(lista: T[]): T[] =>
      noArrasto ? lista.slice().sort((a, b) => (noArrasto.get(a.id)?.pos ?? 1e9) - (noArrasto.get(b.id)?.pos ?? 1e9)) : lista,
    item: (id: string) => ({ "data-reordenar-id": id }),
    zona: (grupo: string) => ({ "data-reordenar-grupo": grupo }),
    // Classe do item que está sendo arrastado (a vaga marcada).
    vaga: (id: string) => (idArrastado === id ? " reordenar-vaga" : ""),
    // Classe da categoria que está com o item arrastado.
    recebendo: (grupo: string) => (idArrastado && noArrasto?.get(idArrastado)?.grupo === grupo ? " recebendo" : ""),
    alca: (id: string) => ({
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => iniciar(e, id),
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => teclado(e, id),
    }),
  };
}
