"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseFormulaDados } from "@/lib/dice";
import { CATALOGO_PADRAO, type TipoDanoCatalogo } from "@/lib/tipos-dano";
import {
  ATRIBUTOS_RICOS,
  NIVEL_MAXIMO,
  acharAtomos,
  chipsDeEfeitoDaAcao,
  parseDescricaoRica,
  usosDoCatalogo,
  type Bloco,
} from "@/lib/descricao-rica";
import { rotuloDuracao } from "@/lib/descricao-gerada";
import {
  EFEITOS_CATALOGO,
  ICONE_COND,
  ICONE_REF,
  MARCADOR_PADRAO,
  efeitoDaAcao,
  efeitosDaAcao,
  type Atomo,
  type ContextoRico,
  type OpcaoRef,
} from "./atomos";
import { PainelEditarAtomo } from "./paineis-edicao";
import {
  PainelComandos,
  PainelCor,
  PainelIcone,
  PainelInserir,
  PainelRolagem,
  type ComandoBloco,
  type EscolhaCor,
} from "./paineis";
import { norm, sugerir, sugerirCodigo, type Candidato, type Sugestao } from "./sugestoes";
import {
  atualizarChips,
  criarLinha,
  cursorNoFim,
  cursorNoInicio,
  ehLinha,
  elementoAtomo,
  inlineParaDom,
  lerEditor,
  linhaDoNo,
  linhasDe,
  linhaVazia,
  medirCursor,
  montar,
  noInicioDaLinha,
  posicionarCursor,
  serializarFragmento,
  sincronizar,
} from "./dom-rico";
import "../descricao/descricao.css";
import "./descricao-rica.css";

type Painel = "inserir" | "cor" | "rolagem" | "icone" | "marcador" | "comandos" | "editar" | null;
type Estado = { texto: string; cursor: number | null };

// Sugestão aberta: o trecho (no nó de texto `no`, [inicio, fim)) que o chip
// substitui, e onde desenhar a caixinha (coordenadas da janela).
type SugestaoAberta = {
  itens: Sugestao[];
  ativo: number;
  no: Text;
  fim: number;
  x: number;
  y: number;
  acima: boolean;
};

const CHAVE_SUGESTOES = "rpgo:descricao:sugestoes";

// Recusar uma sugestão vale pra palavra que começa igual (3 letras): senão ela
// voltaria a cada tecla seguinte, já que a frase digitada muda.
const chaveDispensa = (s: Sugestao, antes: string) => `${s.chave}|${norm(antes.slice(s.inicio, s.inicio + 3))}`;

const MODELO_TECNICA =
  "## Efeito\n" +
  "-:skull: Causa ((2d6+FOR|Fogo)) de dano {{dano:Fogo}}\n" +
  "-:skull: Aplica {{cond:Atordoado}} até o fim do próximo turno\n" +
  "## Observações\n" +
  "> Custa **1 ação padrão**. Não acumula com outras técnicas.";

// Editor de descrição rica: contentEditable em linhas (um bloco por linha),
// chips não editáveis para o que vem do catálogo, histórico próprio. O valor
// é sempre a string de tokens de lib/descricao-rica.ts.
export function EditorRico({
  valor,
  onChange,
  refs = [],
  condicoes = [],
  contexto = {},
  automatica,
  placeholder = "Descreva o efeito… (@ insere, / blocos)",
}: {
  valor: string;
  onChange: (texto: string) => void;
  refs?: OpcaoRef[];
  condicoes?: string[];
  contexto?: ContextoRico;
  // A descrição é gerada dos efeitos e da duração da ação: `ativa` enquanto o
  // texto segue o gerado; `regenerar` volta a ele (desfazível).
  automatica?: { ativa: boolean; regenerar: () => void };
  placeholder?: string;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLDivElement>(null);
  const ultimo = useRef<string | null>(null);
  const rangeSalvo = useRef<Range | null>(null);
  const hist = useRef<{ pilha: Estado[]; i: number; agrupaAte: number }>({ pilha: [], i: -1, agrupaAte: 0 });
  const [painel, setPainel] = useState<Painel>(null);
  const [marcador, setMarcador] = useState(MARCADOR_PADRAO);
  const [estado, setEstado] = useState({ negrito: false, italico: false, sublinhado: false, bloco: "p" });
  const [podeDesfazer, setPodeDesfazer] = useState({ desfazer: false, refazer: false });
  const [edicao, setEdicao] = useState<{ el: HTMLElement; no: Atomo } | null>(null);
  const [sug, setSug] = useState<SugestaoAberta | null>(null);
  const [sugestoesLigadas, setSugestoesLigadas] = useState(true);
  // Palavras que a pessoa já recusou: não voltam a ser sugeridas neste editor.
  const dispensadas = useRef<Set<string>>(new Set());
  const tiposDano: TipoDanoCatalogo[] = contexto.tiposDano ?? CATALOGO_PADRAO;
  const ctx: ContextoRico = { ...contexto, tiposDano };

  // Preferência de sugestões lembrada no aparelho (nunca quebra sem storage).
  // Lida depois da hidratação (no servidor começa ligado), fora do corpo do efeito.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(CHAVE_SUGESTOES) === "off") setSugestoesLigadas(false);
      } catch {
        /* sem storage: fica ligado */
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  // Tudo que o texto pode virar chip: ações, condições, efeitos e tipos de dano.
  const candidatos = useMemo<Candidato[]>(() => {
    const rotuloRef = { acao: "Ação", hab: "Habilidade", item: "Item" } as const;
    return [
      // Os efeitos reais da ação vêm antes dos do catálogo (prioridade menor).
      ...efeitosDaAcao({ efeitos: contexto.efeitos, resumoEfeito: contexto.resumoEfeito }).map((e): Candidato => ({
        chave: `daacao:${e.i}`,
        // O identificador também acha o efeito ao escrever o código (`dano_extra`).
        nomes: [e.nome, e.slug],
        no: { t: "efeito", slug: e.slug, idx: e.i },
        rotulo: e.resumo ? `${e.nome} · ${e.resumo}` : e.nome,
        categoria: "Efeito desta ação",
        icone: e.icone,
        cor: e.cor,
        prioridade: -1,
      })),
      ...(contexto.duracao
        ? [
            {
              chave: "daacao:duracao",
              nomes: [rotuloDuracao(contexto.duracao), "Duração"],
              no: { t: "duracao" } as Atomo,
              rotulo: rotuloDuracao(contexto.duracao),
              categoria: "Duração da ação",
              icone: "fa-hourglass-half",
              prioridade: -1,
            } satisfies Candidato,
          ]
        : []),
      ...refs.map((r): Candidato => ({
        chave: `${r.tipo}:${r.id}`,
        nomes: [r.nome],
        no: { t: "ref", tipo: r.tipo, id: r.id, nome: r.nome },
        rotulo: r.nome,
        categoria: rotuloRef[r.tipo],
        icone: ICONE_REF[r.tipo],
        prioridade: 0,
      })),
      ...condicoes.map((n): Candidato => ({
        chave: `cond:${n}`,
        nomes: [n],
        no: { t: "cond", nome: n },
        rotulo: n,
        categoria: "Condição",
        icone: ICONE_COND,
        prioridade: 1,
      })),
      ...tiposDano.map((t): Candidato => ({
        chave: `dano:${t.nome}`,
        nomes: [t.nome],
        no: { t: "dano", tipo: t.nome },
        rotulo: t.nome,
        categoria: "Tipo de dano",
        icone: t.icone ?? "fa-burst",
        cor: t.cor ?? undefined,
        prioridade: 2,
      })),
      // Atributo pelo nome ("Força"); a sigla sozinha ("for") é palavra comum.
      ...ATRIBUTOS_RICOS.map((a): Candidato => ({
        chave: `attr:${a.slug}`,
        nomes: [a.nome, a.slug],
        no: { t: "attr", atributo: a.slug },
        rotulo: a.sigla,
        categoria: "Atributo",
        icone: "fa-dumbbell",
        prioridade: 4,
      })),
      ...ATRIBUTOS_RICOS.map((a): Candidato => ({
        chave: `salv:${a.slug}`,
        nomes: [`Salvaguarda de ${a.nome}`, `salv ${a.slug}`],
        no: { t: "salv", atributo: a.slug },
        rotulo: `Salvaguarda ${a.sigla}`,
        categoria: "Salvaguarda",
        icone: "fa-shield-halved",
        prioridade: 4,
      })),
      ...EFEITOS_CATALOGO.map((e): Candidato => ({
        chave: `efeito:${e.slug}`,
        nomes: [e.nome, e.slug],
        no: { t: "efeito", slug: e.slug },
        rotulo: e.nome,
        categoria: "Efeito",
        icone: e.icone,
        cor: e.cor,
        prioridade: 3,
      })),
    ];
  }, [refs, condicoes, tiposDano, contexto.efeitos, contexto.resumoEfeito, contexto.duracao]);

  // Efeitos da ação que a descrição ainda não cita (só avisa com o texto à mão:
  // o automático cita todos).
  const efeitosAcao = useMemo(
    () => efeitosDaAcao({ efeitos: contexto.efeitos, resumoEfeito: contexto.resumoEfeito }),
    [contexto.efeitos, contexto.resumoEfeito],
  );
  const naoCitados = useMemo(() => {
    if (automatica?.ativa) return [];
    // Cada chip resolve pro efeito atual (o índice gravado pode ter envelhecido
    // se a ordem dos efeitos mudou), igual ao que o chip mostra.
    const citados = new Set<number>();
    for (const c of chipsDeEfeitoDaAcao(valor)) {
      const r = efeitoDaAcao(c, { efeitos: contexto.efeitos });
      if (r) citados.add(r.i);
    }
    // Efeito de condição vale como citado quando o texto traz o chip da condição.
    const condicoesNoTexto = new Set(usosDoCatalogo(valor).condicoes.map((c) => c.toLowerCase()));
    (contexto.efeitos ?? []).forEach((e, i) => {
      if (
        (e.tipo === "condicao_aplicar" || e.tipo === "condicao_remover" || e.tipo === "condicao_imune") &&
        condicoesNoTexto.has(e.condicao.toLowerCase())
      ) {
        citados.add(i);
      }
    });
    return efeitosAcao.filter((e) => !citados.has(e.i));
  }, [valor, efeitosAcao, contexto.efeitos, automatica?.ativa]);

  const atualizarHist = () =>
    setPodeDesfazer({ desfazer: hist.current.i > 0, refazer: hist.current.i < hist.current.pilha.length - 1 });

  // Valor que veio de fora (carregar, rascunho): refaz o DOM. Valor que o
  // próprio editor acabou de emitir: não mexe, senão o cursor pula.
  useEffect(() => {
    const el = campo.current;
    if (!el || ultimo.current === valor) return;
    montar(el, valor, ctx);
    ultimo.current = valor;
    const h = hist.current;
    // Primeira carga começa o histórico; depois (texto regenerado, rascunho) o
    // novo texto entra como mais um passo, então o desfazer volta ao de antes.
    if (h.i < 0) hist.current = { pilha: [{ texto: valor, cursor: null }], i: 0, agrupaAte: 0 };
    else {
      h.pilha = [...h.pilha.slice(0, h.i + 1), { texto: valor, cursor: null }].slice(-100);
      h.i = h.pilha.length - 1;
      h.agrupaAte = 0;
    }
    atualizarHist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  // O valor calculado de um efeito (ou a duração) mudou na ação: os chips que já
  // estão no campo se redesenham.
  useEffect(() => {
    if (campo.current) atualizarChips(campo.current, ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contexto.efeitos, contexto.duracao, contexto.resumoEfeito, contexto.refs, contexto.condicoes]);

  /* ─── Histórico ─────────────────────────────────────────── */

  // `agrupar`: digitação seguida vira um passo só do desfazer.
  const confirmar = useCallback(
    (agrupar = false) => {
      const el = campo.current;
      if (!el) return;
      sincronizar(el);
      const texto = lerEditor(el);
      const h = hist.current;
      if (h.pilha[h.i]?.texto === texto) return;
      const novo: Estado = { texto, cursor: medirCursor(el) };
      const agora = Date.now();
      if (agrupar && agora < h.agrupaAte && h.i > 0) h.pilha[h.i] = novo;
      else {
        h.pilha = [...h.pilha.slice(0, h.i + 1), novo].slice(-100);
        h.i = h.pilha.length - 1;
      }
      h.agrupaAte = agrupar ? agora + 700 : 0;
      ultimo.current = texto;
      onChange(texto);
      atualizarHist();
    },
    [onChange],
  );

  function ir(delta: -1 | 1) {
    const el = campo.current;
    const h = hist.current;
    const alvo = h.i + delta;
    if (!el || alvo < 0 || alvo >= h.pilha.length) return;
    h.i = alvo;
    h.agrupaAte = 0;
    const e = h.pilha[alvo];
    montar(el, e.texto, ctx);
    el.focus();
    if (e.cursor !== null) posicionarCursor(el, e.cursor);
    ultimo.current = e.texto;
    onChange(e.texto);
    atualizarHist();
  }

  /* ─── Seleção ───────────────────────────────────────────── */

  function rangeAtual(): Range {
    const el = campo.current!;
    const sel = window.getSelection();
    if (sel && sel.rangeCount && el.contains(sel.anchorNode)) return sel.getRangeAt(0);
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    return r;
  }

  function restaurarRange() {
    const el = campo.current!;
    el.focus();
    if (rangeSalvo.current) {
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(rangeSalvo.current);
    }
    rangeSalvo.current = null;
  }

  function abrir(p: Exclude<Painel, null>) {
    rangeSalvo.current = rangeAtual().cloneRange();
    setPainel((a) => (a === p ? null : p));
  }

  function linhasDaSelecao(): HTMLElement[] {
    const el = campo.current!;
    const r = rangeAtual();
    const a = linhaDoNo(el, r.startContainer);
    const b = linhaDoNo(el, r.endContainer);
    const todas = linhasDe(el);
    if (!a || !b) return [];
    return todas.slice(todas.indexOf(a), todas.indexOf(b) + 1);
  }

  // O que está ativo no cursor, pra barra mostrar (negrito, bloco…).
  useEffect(() => {
    const ler = () => {
      const el = campo.current;
      const sel = window.getSelection();
      // O cursor saiu da palavra que tinha sugestão: a caixa some.
      setSug((s) => (s && sel && sel.anchorNode === s.no && sel.anchorOffset === s.fim ? s : null));
      if (!el || !sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return;
      const linha = linhaDoNo(el, sel.anchorNode);
      setEstado({
        negrito: document.queryCommandState("bold"),
        italico: document.queryCommandState("italic"),
        sublinhado: document.queryCommandState("underline"),
        bloco: linha?.dataset.b ?? "p",
      });
    };
    document.addEventListener("selectionchange", ler);
    return () => document.removeEventListener("selectionchange", ler);
  }, []);

  /* ─── Sugestões: palavra → chip ─────────────────────────── */

  // Olha o texto antes do cursor (só em texto comum, nunca dentro de chip).
  function avaliarSugestoes() {
    const el = campo.current;
    const sel = window.getSelection();
    if (!sugestoesLigadas || !el || !sel || !sel.rangeCount || !sel.isCollapsed) return setSug(null);
    const no = sel.anchorNode;
    if (!no || no.nodeType !== Node.TEXT_NODE || !el.contains(no)) return setSug(null);
    if ((no.parentElement as HTMLElement | null)?.closest("[data-no],.desc-marcador")) return setSug(null);
    const antes = (no.textContent ?? "").slice(0, sel.anchorOffset);
    const ehFormula = (f: string) => (ctx.resolverFormula ?? parseFormulaDados)(f).dados.length > 0;
    // Escrevendo o próprio código (`{{efeito:…`): lista o que existe e dispensa as
    // sugestões por palavra. Aqui a intenção é clara, então não há "ignorar".
    const doCodigo = sugerirCodigo(antes, candidatos);
    const itens =
      doCodigo.length > 0
        ? doCodigo
        : sugerir(antes, candidatos, { ehFormula, tiposDano: tiposDano.map((t) => t.nome) }).filter(
            (s) => !dispensadas.current.has(chaveDispensa(s, antes)),
          );
    if (itens.length === 0) return setSug(null);
    // Onde fica o cursor na tela. Sem altura (fim de linha), cai pra linha.
    const r = sel.getRangeAt(0).cloneRange();
    let rect: DOMRect | undefined = r.getClientRects()[0];
    if (!rect || rect.height === 0) rect = (no.parentElement as HTMLElement).getBoundingClientRect();
    const alturaVisivel = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const acima = rect.bottom + 190 > alturaVisivel && rect.top > 190;
    setSug({
      itens,
      ativo: 0,
      no: no as Text,
      fim: sel.anchorOffset,
      x: Math.min(Math.max(rect.left, 8), window.innerWidth - 300),
      y: acima ? rect.top - 6 : rect.bottom + 6,
      acima,
    });
  }

  function aceitarSugestao(s: Sugestao) {
    const el = campo.current;
    const aberta = sug;
    if (!el || !aberta) return;
    const no = aberta.no;
    // O texto pode ter mudado desde que a caixa abriu: confere antes de trocar.
    const trailing = aberta.fim - s.fim;
    if (!no.isConnected || no.data.length < aberta.fim || trailing < 0 || trailing > 1) return setSug(null);
    trocarPorChip(no, s.inicio, s.fim, s.no, trailing);
  }

  // Troca o trecho [inicio, fim) de um nó de texto por um chip e devolve o nó com
  // o que vem depois. `depois`: quantos caracteres de pontuação/espaço já havia
  // logo depois do trecho (0 ou 1).
  function substituirPorChip(
    no: Text,
    inicio: number,
    fim: number,
    atomo: Atomo,
    depois: number,
  ): { resto: Text; poseEspaco: boolean } {
    const resto = no.splitText(inicio);
    resto.deleteData(0, fim - inicio);
    no.after(elementoAtomo(atomo, ctx));
    // Sem pontuação/espaço depois, o cursor precisa de um espaço pra ficar após o chip.
    const poseEspaco = depois === 0 && !/^\s/.test(resto.data);
    if (poseEspaco) resto.insertData(0, " ");
    return { resto, poseEspaco };
  }

  function cursorEm(no: Text, offset: number) {
    const r = document.createRange();
    r.setStart(no, Math.max(0, Math.min(offset, no.data.length)));
    r.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
    campo.current?.focus();
  }

  function trocarPorChip(no: Text, inicio: number, fim: number, atomo: Atomo, depois: number) {
    const { resto, poseEspaco } = substituirPorChip(no, inicio, fim, atomo, depois);
    // Depois do espaço que pus ou da pontuação que já havia; senão, colado ao chip.
    cursorEm(resto, depois === 1 || poseEspaco ? 1 : 0);
    setSug(null);
    confirmar();
  }

  // Digitou ou colou um código completo (`{{efeito:cura#0}}`, `[[acao:id|Nome]]`,
  // `((2d6|Fogo))`, `:fogo:`)? Vira chip na hora. Olha tudo que acabou de entrar,
  // não só o último caractere (colar, autocorretor e voz trazem a frase de uma vez).
  // Só chip: `**` e cor ficam como texto até a pessoa usar a barra.
  function converterTokensDigitados(ie: InputEvent): boolean {
    const el = campo.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount || !sel.isCollapsed) return false;
    const entrou = ie.data ?? "";
    if (!/[}\])\:]/.test(entrou)) return false;
    const no = sel.anchorNode;
    if (!no || no.nodeType !== Node.TEXT_NODE || !el.contains(no)) return false;
    if ((no.parentElement as HTMLElement | null)?.closest("[data-no],.desc-marcador")) return false;
    const texto = no as Text;
    const fimDoQueEntrou = sel.anchorOffset;
    const comecoDoQueEntrou = fimDoQueEntrou - entrou.length;
    const achados = acharAtomos(texto.data).filter(
      (a) =>
        a.fim > comecoDoQueEntrou &&
        a.fim <= fimDoQueEntrou &&
        a.no.t !== "texto" &&
        a.no.t !== "marca" &&
        a.no.t !== "cor" &&
        // `((texto))` sem dados não é rolagem: fica como está.
        !(a.no.t === "rolagem" && (ctx.resolverFormula ?? parseFormulaDados)(a.no.formula).dados.length === 0),
    );
    if (achados.length === 0) return false;
    // Do último pro primeiro: os de trás não mudam de posição.
    const depoisDoCursor = texto.data.length - fimDoQueEntrou;
    for (const a of [...achados].reverse()) {
      // `texto` fica só com o começo; o que veio depois está em `resto`.
      const { resto } = substituirPorChip(texto, a.inicio, a.fim, a.no as Atomo, 0);
      if (a === achados.at(-1)) cursorEm(resto, resto.data.length - depoisDoCursor);
    }
    setSug(null);
    confirmar();
    return true;
  }

  function dispensarSugestao() {
    if (!sug) return;
    const antes = (sug.no.textContent ?? "").slice(0, sug.fim);
    dispensadas.current.add(chaveDispensa(sug.itens[sug.ativo], antes));
    setSug(null);
  }

  function alternarSugestoes() {
    const novo = !sugestoesLigadas;
    setSugestoesLigadas(novo);
    if (!novo) setSug(null);
    try {
      window.localStorage.setItem(CHAVE_SUGESTOES, novo ? "on" : "off");
    } catch {
      /* sem storage: vale só nesta sessão */
    }
  }

  // A caixa é fixa na janela: rolar a página a deixaria solta.
  useEffect(() => {
    if (!sug) return;
    const fechar = () => setSug(null);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [sug]);

  /* ─── Editar um chip já inserido ────────────────────────── */

  function abrirEdicao(chip: HTMLElement) {
    let no: Atomo;
    try {
      no = JSON.parse(chip.dataset.no ?? "") as Atomo;
    } catch {
      return;
    }
    setSug(null);
    // Posição do cursor logo depois do chip, pra voltar a digitar dali.
    const r = document.createRange();
    r.setStartAfter(chip);
    r.collapse(true);
    rangeSalvo.current = r;
    setEdicao({ el: chip, no });
    setPainel("editar");
  }

  function fecharEdicao() {
    setPainel(null);
    setEdicao(null);
  }

  function salvarEdicao(novo: Atomo) {
    if (!edicao) return;
    const chip = elementoAtomo(novo, ctx);
    edicao.el.replaceWith(chip);
    const r = document.createRange();
    r.setStartAfter(chip);
    r.collapse(true);
    rangeSalvo.current = r;
    restaurarRange();
    fecharEdicao();
    confirmar();
  }

  function removerChip() {
    if (!edicao) return;
    const pai = edicao.el.parentNode;
    const r = document.createRange();
    r.setStartBefore(edicao.el);
    r.collapse(true);
    // Chip entre dois espaços: some um deles, senão sobra espaço duplo.
    const ant = edicao.el.previousSibling;
    const prox = edicao.el.nextSibling;
    if (ant?.nodeType === Node.TEXT_NODE && prox?.nodeType === Node.TEXT_NODE) {
      if ((ant as Text).data.endsWith(" ") && (prox as Text).data.startsWith(" ")) (prox as Text).deleteData(0, 1);
    }
    edicao.el.remove();
    pai?.normalize();
    rangeSalvo.current = r;
    restaurarRange();
    fecharEdicao();
    confirmar();
  }

  // O painel nasce no topo do editor: com o editor longo e a página rolada ele
  // ficaria fora da tela. (No celular é folha fixa, e isso não faz nada.)
  useEffect(() => {
    if (!painel) return;
    const id = requestAnimationFrame(() =>
      raiz.current?.querySelector(".desc-painel-rico")?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
    return () => cancelAnimationFrame(id);
  }, [painel]);

  // Marca o chip que está sendo editado.
  useEffect(() => {
    const el = edicao?.el;
    el?.classList.add("desc-chip--editando");
    return () => el?.classList.remove("desc-chip--editando");
  }, [edicao]);

  /* ─── Marcas e cor ──────────────────────────────────────── */

  function marca(cmd: "bold" | "italic" | "underline") {
    campo.current?.focus();
    document.execCommand(cmd);
    confirmar();
  }

  function aplicarCor(c: EscolhaCor) {
    const el = campo.current!;
    restaurarRange();
    const r = rangeAtual();
    const a = linhaDoNo(el, r.startContainer);
    const b = linhaDoNo(el, r.endContainer);
    if (r.collapsed || !a || a !== b) {
      setPainel(null);
      return;
    }
    const frag = r.extractContents();
    // Cor por cima de cor: tira a de dentro, vale a nova.
    frag.querySelectorAll("[data-cor]").forEach((s) => s.replaceWith(...s.childNodes));
    const span = inlineParaDom([{ t: "cor", ...c, filhos: [] }], ctx)[0] as HTMLElement;
    span.append(frag);
    r.insertNode(span);
    const sel = window.getSelection()!;
    r.setStartAfter(span);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    setPainel(null);
    confirmar();
  }

  function removerCor() {
    const el = campo.current!;
    restaurarRange();
    const r = rangeAtual();
    const a = linhaDoNo(el, r.startContainer);
    if (!a) return;
    // Desfaz toda cor que toque a seleção (ou o ponto, se não há seleção).
    a.querySelectorAll("[data-cor]").forEach((s) => {
      if (r.intersectsNode(s) || s.contains(r.startContainer)) s.replaceWith(...s.childNodes);
    });
    a.normalize();
    setPainel(null);
    confirmar();
  }

  /* ─── Blocos ────────────────────────────────────────────── */

  function definirBloco(tipo: Exclude<ComandoBloco, "hr" | "modelo">) {
    const linhas = linhasDaSelecao().filter((l) => l.dataset.b !== "hr");
    if (linhas.length === 0) return;
    const jaSao = linhas.every((l) => l.dataset.b === tipo && (tipo !== "lista" || (l.dataset.i || "") === marcador));
    const alvo = jaSao ? "p" : tipo;
    for (const l of linhas) {
      l.dataset.b = alvo;
      if (alvo === "lista") l.dataset.i = marcador;
      else delete l.dataset.i;
      if (alvo !== "lista" && alvo !== "num") delete l.dataset.n;
      else l.dataset.n = l.dataset.n ?? "0";
    }
    campo.current?.focus();
    confirmar();
  }

  function inserirLinhas(blocos: Bloco[]) {
    const el = campo.current!;
    restaurarRange();
    const atual = linhaDoNo(el, rangeAtual().startContainer) ?? linhasDe(el).at(-1)!;
    const novas = blocos.map((b) => criarLinha(b, ctx));
    // Linha vazia onde o cursor está: é substituída em vez de empurrada.
    const substitui = atual.dataset.b === "p" && linhaVazia(atual);
    let ancora = atual;
    for (const n of novas) {
      ancora.after(n);
      ancora = n;
    }
    if (substitui) atual.remove();
    const ultima = novas.at(-1);
    if (ultima?.dataset.b === "hr") {
      const p = criarLinha({ b: "p", filhos: [] }, ctx);
      ultima.after(p);
      cursorNoInicio(p);
    } else if (ultima) cursorNoFim(ultima);
    setPainel(null);
    confirmar();
  }

  function comando(c: ComandoBloco) {
    if (c === "hr") inserirLinhas([{ b: "hr" }]);
    else if (c === "modelo") inserirLinhas(parseDescricaoRica(MODELO_TECNICA));
    else {
      restaurarRange();
      definirBloco(c);
      setPainel(null);
    }
  }

  function escolherMarcador(slug: string) {
    setMarcador(slug);
    restaurarRange();
    // Troca o ícone dos tópicos onde o cursor está: a seleção, ou a lista inteira.
    const el = campo.current!;
    let alvo = linhasDaSelecao().filter((l) => l.dataset.b === "lista");
    if (alvo.length === 1) {
      const todas = linhasDe(el);
      const i = todas.indexOf(alvo[0]);
      const corrida = [alvo[0]];
      for (let j = i - 1; j >= 0 && todas[j].dataset.b === "lista"; j--) corrida.unshift(todas[j]);
      for (let j = i + 1; j < todas.length && todas[j].dataset.b === "lista"; j++) corrida.push(todas[j]);
      alvo = corrida;
    }
    alvo.forEach((l) => (l.dataset.i = slug));
    setPainel(null);
    confirmar();
  }

  /* ─── Inserir inline ────────────────────────────────────── */

  function inserirNos(nos: Node[], espacoDepois = false) {
    const el = campo.current;
    if (!el) return;
    restaurarRange();
    const sel = window.getSelection()!;
    const r = rangeAtual();
    r.deleteContents();
    const frag = document.createDocumentFragment();
    frag.append(...nos);
    if (espacoDepois) frag.append(" ");
    const ult = frag.lastChild;
    r.insertNode(frag);
    if (ult) r.setStartAfter(ult);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    setPainel(null);
    confirmar();
  }

  const inserirAtomo = (no: Atomo) => inserirNos([elementoAtomo(no, ctx)], true);

  /* ─── Linhas: Enter, Backspace, Tab ─────────────────────── */

  function partirLinha(): { atual: HTMLElement; nova: HTMLElement } | null {
    const el = campo.current!;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    r.deleteContents();
    const atual = linhaDoNo(el, r.startContainer);
    if (!atual || atual.dataset.b === "hr") return null;
    const resto = document.createRange();
    resto.selectNodeContents(atual);
    resto.setStart(r.startContainer, r.startOffset);
    const frag = resto.extractContents();
    const b = atual.dataset.b;
    const tipoNova = b === "titulo" ? "p" : b;
    const nova = criarLinha(
      tipoNova === "lista"
        ? { b: "lista", nivel: Number(atual.dataset.n ?? 0), ...(atual.dataset.i ? { icone: atual.dataset.i } : {}), filhos: [] }
        : tipoNova === "num"
          ? { b: "num", nivel: Number(atual.dataset.n ?? 0), filhos: [] }
          : tipoNova === "citacao"
            ? { b: "citacao", filhos: [] }
            : { b: "p", filhos: [] },
      ctx,
    );
    nova.querySelector(":scope > br")?.remove();
    frag.querySelectorAll(".desc-marcador").forEach((m) => m.remove());
    nova.append(frag);
    atual.after(nova);
    sincronizar(el);
    return { atual, nova };
  }

  function enter() {
    // Teclado virtual: o Enter chega aqui, e com o código em escrita escolhe a sugestão.
    if (sug?.itens[sug.ativo]?.codigo) return aceitarSugestao(sug.itens[sug.ativo]);
    const el = campo.current!;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const linha = linhaDoNo(el, sel.getRangeAt(0).startContainer);
    if (!linha) return;
    // Enter em tópico/nota vazio sai da lista (ou sobe um nível).
    if (linha.dataset.b !== "p" && linha.dataset.b !== "titulo" && sel.isCollapsed && linhaVazia(linha)) {
      const n = Number(linha.dataset.n ?? 0);
      if ((linha.dataset.b === "lista" || linha.dataset.b === "num") && n > 0) linha.dataset.n = String(n - 1);
      else {
        linha.dataset.b = "p";
        delete linha.dataset.i;
        delete linha.dataset.n;
      }
      sincronizar(el);
      cursorNoInicio(linha);
      confirmar();
      return;
    }
    const r = partirLinha();
    if (!r) return;
    cursorNoInicio(r.nova);
    confirmar();
  }

  function backspaceNoInicio(): boolean {
    const el = campo.current!;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
    const r = sel.getRangeAt(0);
    const linha = linhaDoNo(el, r.startContainer);
    if (!linha || !noInicioDaLinha(linha, r)) return false;
    if (linha.dataset.b !== "p") {
      const n = Number(linha.dataset.n ?? 0);
      if ((linha.dataset.b === "lista" || linha.dataset.b === "num") && n > 0) linha.dataset.n = String(n - 1);
      else {
        linha.dataset.b = "p";
        delete linha.dataset.i;
        delete linha.dataset.n;
      }
      sincronizar(el);
      cursorNoInicio(linha);
      confirmar();
      return true;
    }
    const ant = linha.previousElementSibling;
    if (!ehLinha(ant)) return true;
    if (ant.dataset.b === "hr") {
      ant.remove();
      confirmar();
      return true;
    }
    // Junta com a linha de cima, cursor na emenda.
    ant.querySelector(":scope > br")?.remove();
    const marcaPos = document.createTextNode("");
    ant.append(marcaPos);
    [...linha.childNodes].forEach((c) => {
      if (!(c instanceof HTMLBRElement) && !(c instanceof HTMLElement && c.classList.contains("desc-marcador"))) ant.append(c);
    });
    linha.remove();
    const rr = document.createRange();
    rr.setStart(marcaPos, 0);
    rr.collapse(true);
    sel.removeAllRanges();
    sel.addRange(rr);
    confirmar();
    return true;
  }

  function tab(voltar: boolean): boolean {
    const linhas = linhasDaSelecao().filter((l) => l.dataset.b === "lista" || l.dataset.b === "num");
    if (linhas.length === 0) return false;
    for (const l of linhas) {
      const n = Number(l.dataset.n ?? 0) + (voltar ? -1 : 1);
      l.dataset.n = String(Math.max(0, Math.min(NIVEL_MAXIMO, n)));
    }
    confirmar();
    return true;
  }

  /* ─── Eventos ───────────────────────────────────────────── */

  function teclas(e: React.KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    // Com sugestão aberta: setas escolhem, Tab aplica, Esc ignora a palavra.
    if (sug) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = sug.itens.length;
        return setSug({ ...sug, ativo: (sug.ativo + (e.key === "ArrowDown" ? 1 : n - 1)) % n });
      }
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        return aceitarSugestao(sug.itens[sug.ativo]);
      }
      // Escrevendo o código, Enter também escolhe (nas sugestões por palavra ele continua sendo quebra de linha).
      if (e.key === "Enter" && !e.shiftKey && sug.itens[sug.ativo]?.codigo) {
        e.preventDefault();
        return aceitarSugestao(sug.itens[sug.ativo]);
      }
      if (e.key === "Escape") return dispensarSugestao();
    }
    if (e.key === "Escape") return painel === "editar" ? fecharEdicao() : setPainel(null);
    if (mod && k === "z") {
      e.preventDefault();
      return ir(e.shiftKey ? 1 : -1);
    }
    if (mod && k === "y") {
      e.preventDefault();
      return ir(1);
    }
    if (mod && (k === "b" || k === "i" || k === "u")) {
      e.preventDefault();
      return marca(k === "b" ? "bold" : k === "i" ? "italic" : "underline");
    }
    if (e.key === "Enter" && !e.shiftKey && !mod) {
      e.preventDefault();
      return enter();
    }
    if (e.key === "Enter" && e.shiftKey) {
      // Quebra de linha dentro do bloco não existe no formato: Shift+Enter = Enter.
      e.preventDefault();
      return enter();
    }
    if (e.key === "Backspace" && backspaceNoInicio()) return e.preventDefault();
    if (e.key === "Tab" && tab(e.shiftKey)) return e.preventDefault();
    if (e.key === "@") {
      e.preventDefault();
      return abrir("inserir");
    }
    if (e.key === "/" && acoesAtuais().abrirComandos()) e.preventDefault();
  }

  // `beforeinput` nativo (o onBeforeInput do React não recebe historyUndo/Redo).
  // Faz duas coisas:
  //  1) o desfazer do navegador não vê o que o código mexeu no DOM: usamos o nosso;
  //  2) teclado virtual (Android/iOS) manda `key: "Unidentified"` no keydown, então
  //     `@`, `/`, Enter e Backspace só chegam aqui, como inputType. No desktop o
  //     keydown já tratou e cancelou, e este caminho nem dispara.
  // O handler lê as versões mais novas das funções pela ref.
  function acoesAtuais() {
    return {
      ir,
      enter,
      backspaceNoInicio,
      abrirInserir: () => abrir("inserir"),
      // `/` só abre o menu numa linha vazia; em outro lugar é uma barra comum.
      abrirComandos: () => {
        const sel = window.getSelection();
        const linha = sel?.rangeCount ? linhaDoNo(campo.current!, sel.getRangeAt(0).startContainer) : null;
        if (!linha || !linhaVazia(linha) || linha.dataset.b !== "p") return false;
        abrir("comandos");
        return true;
      },
    };
  }
  const acoes = useRef(acoesAtuais());
  useEffect(() => {
    acoes.current = acoesAtuais();
  });
  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    const antes = (e: Event) => {
      const ie = e as InputEvent;
      const t = ie.inputType;
      const a = acoes.current;
      if (t === "historyUndo" || t === "historyRedo") {
        e.preventDefault();
        a.ir(t === "historyUndo" ? -1 : 1);
        return;
      }
      // Em composição (IME) o texto ainda não é definitivo: deixa passar.
      if (ie.isComposing) return;
      if (t === "insertText" && ie.data === "@") {
        e.preventDefault();
        a.abrirInserir();
      } else if (t === "insertText" && ie.data === "/") {
        if (a.abrirComandos()) e.preventDefault();
      } else if (t === "insertParagraph" || t === "insertLineBreak") {
        e.preventDefault();
        a.enter();
      } else if (t === "deleteContentBackward") {
        if (a.backspaceNoInicio()) e.preventDefault();
      }
    };
    el.addEventListener("beforeinput", antes);
    return () => el.removeEventListener("beforeinput", antes);
  }, []);

  // Copiar/recortar leva os códigos (`{{efeito:cura#2}}`), não o texto dos chips:
  // colado de volta (aqui ou em outra descrição), eles viram chips de novo.
  function copiar(e: React.ClipboardEvent, recortar: boolean) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (!campo.current?.contains(r.commonAncestorContainer)) return;
    e.clipboardData.setData("text/plain", serializarFragmento(r.cloneContents()));
    e.preventDefault();
    if (recortar) document.execCommand("delete");
  }

  function colar(e: React.ClipboardEvent) {
    e.preventDefault();
    const el = campo.current!;
    const texto = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    if (!texto) return;
    const blocos = parseDescricaoRica(texto);
    if (blocos.length <= 1) {
      const filhos = blocos[0] && blocos[0].b !== "hr" ? blocos[0].filhos : [];
      return inserirNos(inlineParaDom(filhos, ctx));
    }
    // Várias linhas: parte a atual no cursor e encaixa as coladas no meio.
    const parte = partirLinha();
    if (!parte) return;
    const { atual, nova } = parte;
    const [primeiro, ...resto] = blocos;
    if (primeiro.b !== "hr") {
      atual.querySelector(":scope > br")?.remove();
      atual.append(...inlineParaDom(primeiro.filhos, ctx));
    }
    let ancora = atual;
    for (const b of resto) {
      const l = criarLinha(b, ctx);
      ancora.after(l);
      ancora = l;
    }
    // O resto da linha original continua grudado no fim do que foi colado.
    if (ancora !== atual && ancora.dataset.b !== "hr") {
      ancora.querySelector(":scope > br")?.remove();
      [...nova.childNodes].forEach((c) => !(c instanceof HTMLBRElement) && ancora.append(c));
      nova.remove();
    }
    sincronizar(el);
    cursorNoFim(ancora);
    confirmar();
  }

  /* ─── Render ────────────────────────────────────────────── */

  return (
    <div className="desc-editor-rico" ref={raiz}>
      <div className="desc-barra-rica" role="toolbar" aria-label="Formatação da descrição" onMouseDown={(e) => {
        // Clicar na barra não tira a seleção do texto (inputs dos painéis ficam de fora).
        if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) e.preventDefault();
      }}>
        <div className="desc-grupo">
          <button type="button" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled={!podeDesfazer.desfazer} onClick={() => ir(-1)}>
            <i className="fas fa-rotate-left" />
          </button>
          <button type="button" title="Refazer (Ctrl+Y)" aria-label="Refazer" disabled={!podeDesfazer.refazer} onClick={() => ir(1)}>
            <i className="fas fa-rotate-right" />
          </button>
        </div>
        {automatica && (
          <div className="desc-grupo">
            {automatica.ativa ? (
              <span
                className="desc-auto-selo"
                title="Descrição gerada dos efeitos e da duração da ação. Edite o texto para assumir o controle."
              >
                <i className="fas fa-wand-magic-sparkles" /> Automática
              </span>
            ) : (
              <button
                type="button"
                className="desc-auto"
                title="Refaz o texto a partir dos efeitos e da duração (dá para desfazer)"
                onClick={automatica.regenerar}
              >
                <i className="fas fa-wand-magic-sparkles" /> Regenerar
              </button>
            )}
          </div>
        )}
        <div className="desc-grupo">
          <button type="button" title="Negrito (Ctrl+B)" aria-label="Negrito" aria-pressed={estado.negrito} onClick={() => marca("bold")}>
            <i className="fas fa-bold" />
          </button>
          <button type="button" title="Itálico (Ctrl+I)" aria-label="Itálico" aria-pressed={estado.italico} onClick={() => marca("italic")}>
            <i className="fas fa-italic" />
          </button>
          <button type="button" title="Sublinhado (Ctrl+U)" aria-label="Sublinhado" aria-pressed={estado.sublinhado} onClick={() => marca("underline")}>
            <i className="fas fa-underline" />
          </button>
          <button type="button" title="Cor do texto" aria-label="Cor do texto" aria-pressed={painel === "cor"} onClick={() => abrir("cor")}>
            <span className="desc-amostra" style={{ background: "#e74c3c" }} /> <i className="fas fa-caret-down" />
          </button>
        </div>
        <div className="desc-grupo">
          <button type="button" title="Título" aria-label="Título" aria-pressed={estado.bloco === "titulo"} onClick={() => definirBloco("titulo")}>
            <i className="fas fa-heading" />
          </button>
          <button type="button" title="Tópicos" aria-label="Tópicos" aria-pressed={estado.bloco === "lista"} onClick={() => definirBloco("lista")}>
            <i className={`fas fa-${marcador}`} />
            <i className="fas fa-list-ul" />
          </button>
          <button type="button" title="Trocar o ícone dos tópicos" aria-label="Ícone dos tópicos" aria-pressed={painel === "marcador"} onClick={() => abrir("marcador")}>
            <i className="fas fa-caret-down" />
          </button>
          <button type="button" title="Lista numerada" aria-label="Lista numerada" aria-pressed={estado.bloco === "num"} onClick={() => definirBloco("num")}>
            <i className="fas fa-list-ol" />
          </button>
          <button type="button" title="Nota" aria-label="Nota" aria-pressed={estado.bloco === "citacao"} onClick={() => definirBloco("citacao")}>
            <i className="fas fa-quote-left" />
          </button>
          <button type="button" title="Mais blocos ( / numa linha vazia)" aria-label="Mais blocos" aria-pressed={painel === "comandos"} onClick={() => abrir("comandos")}>
            <i className="fas fa-plus" />
          </button>
        </div>
        <div className="desc-grupo">
          <button type="button" title="Ícone solto" aria-label="Ícone" aria-pressed={painel === "icone"} onClick={() => abrir("icone")}>
            <i className="fas fa-icons" />
          </button>
          <button type="button" title="Inserir ação, condição, efeito, dano (@)" aria-pressed={painel === "inserir"} onClick={() => abrir("inserir")}>
            <i className="fas fa-at" /> Inserir
          </button>
          <button type="button" title="Rolagem com tipo de dano" aria-pressed={painel === "rolagem"} onClick={() => abrir("rolagem")}>
            <i className="fas fa-dice-d20" /> Rolagem
          </button>
        </div>
      </div>

      {painel === "inserir" && (
        <PainelInserir
          refs={refs}
          condicoes={condicoes}
          tiposDano={tiposDano}
          efeitosAcao={efeitosAcao}
          duracaoAcao={contexto.duracao ? rotuloDuracao(contexto.duracao) : undefined}
          aoEscolher={inserirAtomo}
          aoFechar={() => setPainel(null)}
        />
      )}
      {painel === "rolagem" && (
        <PainelRolagem
          tiposDano={tiposDano}
          ctx={ctx}
          aoInserir={(formula, dano) => inserirAtomo({ t: "rolagem", formula, ...(dano ? { dano } : {}) })}
          aoFechar={() => setPainel(null)}
        />
      )}
      {painel === "cor" && <PainelCor aoAplicar={aplicarCor} aoRemover={removerCor} aoFechar={() => setPainel(null)} />}
      {painel === "icone" && (
        <PainelIcone titulo="Ícone no meio do texto" aoEscolher={(slug) => inserirAtomo({ t: "icone", slug })} aoFechar={() => setPainel(null)} />
      )}
      {painel === "marcador" && (
        <PainelIcone titulo="Ícone dos tópicos (troca a lista onde o cursor está)" sugestoes aoEscolher={escolherMarcador} aoFechar={() => setPainel(null)} />
      )}
      {painel === "comandos" && <PainelComandos aoEscolher={comando} aoFechar={() => setPainel(null)} />}
      {painel === "editar" && edicao && (
        <PainelEditarAtomo
          no={edicao.no}
          refs={refs}
          condicoes={condicoes}
          tiposDano={tiposDano}
          efeitosAcao={efeitosAcao}
          ctx={ctx}
          aoSalvar={salvarEdicao}
          aoRemover={removerChip}
          aoFechar={fecharEdicao}
        />
      )}
      {naoCitados.length > 0 && (
        <div className="desc-aviso" role="status">
          <span>
            <i className="fas fa-circle-info" /> A descrição não cita:
          </span>
          {naoCitados.map((e) => (
            <button
              key={e.i}
              type="button"
              className="desc-aviso-chip"
              title="Inserir no texto, no cursor"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => inserirAtomo({ t: "efeito", slug: e.slug, idx: e.i })}
            >
              <i className={`fas ${e.icone}`} style={e.cor ? { color: e.cor } : undefined} /> {e.nome}
              {e.resumo ? ` ${e.resumo}` : ""} <i className="fas fa-plus" />
            </button>
          ))}
        </div>
      )}
      {/* No celular os painéis viram folha por baixo; tocar fora fecha. */}
      {painel && <div className="desc-folha-fundo" onClick={() => (painel === "editar" ? fecharEdicao() : setPainel(null))} />}

      <div
        ref={campo}
        className="desc-campo-rico"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Descrição"
        data-placeholder={placeholder}
        spellCheck
        onInput={(e) => {
          // Em composição (IME) o texto ainda não é definitivo.
          const ie = e.nativeEvent as InputEvent;
          if (!ie.isComposing && converterTokensDigitados(ie)) return;
          confirmar(true);
          avaliarSugestoes();
        }}
        onPaste={colar}
        onCopy={(e) => copiar(e, false)}
        onCut={(e) => copiar(e, true)}
        onKeyDown={teclas}
        onClick={(e) => {
          // Toque num chip abre a edição dele; fora, fecha o painel de edição.
          const chip = (e.target as HTMLElement).closest<HTMLElement>("[data-no]");
          if (chip && campo.current?.contains(chip)) abrirEdicao(chip);
          else if (painel === "editar") fecharEdicao();
        }}
      />

      {sug && (
        <div
          className={`desc-sugestao${sug.acima ? " acima" : ""}`}
          style={{ left: sug.x, top: sug.y }}
          role="listbox"
          aria-label="Sugestões de chip"
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="desc-sugestao-topo">
            Trocar por chip <kbd>Tab</kbd>
            {sug.itens[0]?.codigo && (
              <>
                {" "}
                ou <kbd>Enter</kbd>
              </>
            )}
          </span>
          {sug.itens.map((s, i) => (
            <button
              key={s.chave}
              type="button"
              role="option"
              aria-selected={i === sug.ativo}
              className="desc-opcao"
              onClick={() => aceitarSugestao(s)}
            >
              <i className={`fas ${s.icone}`} style={s.cor ? { color: s.cor } : undefined} /> {s.rotulo}
              <small>{s.categoria}</small>
            </button>
          ))}
        </div>
      )}

      <div className="desc-rodape">
        <span>@ insere · / blocos · Tab recua tópico · toque num chip para editar</span>
        <span>
          <button
            type="button"
            className="desc-rodape-botao"
            aria-pressed={sugestoesLigadas}
            title="Sugerir chips enquanto você digita"
            onClick={alternarSugestoes}
          >
            <i className="fas fa-wand-magic-sparkles" /> Sugestões {sugestoesLigadas ? "ligadas" : "desligadas"}
          </button>{" "}
          · {valor.length} caracteres
        </span>
      </div>
    </div>
  );
}
