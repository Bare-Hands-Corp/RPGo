// ─────────────────────────────────────────────────────────────────────────────
// Embarcações (OP RPG, cap. 14)
//
// O navio é uma subficha de perfil "veiculo" (lib/subficha.ts). A montagem
// (tamanho, madeira, mastros, velas, canhões, fortificação, motor, leme) fica
// em `Personagem.navio` junto do comandante; as tabelas do livro entram como
// ficha de partida (`presetDeNavio`) e daí pra frente quem manda é a ficha.
// No combate, velocidade, rumo e âncora ficam em `InstanciaCombate.estadoNavio`.
// ─────────────────────────────────────────────────────────────────────────────

export type TamanhoNavio = "pequeno" | "medio" | "grande" | "enorme" | "colossal";
export type MadeiraNavio = "cedro" | "carvalho" | "cerejeira" | "adam";
export type TipoMastro = "simples" | "composto" | "multiplo";
export type MaterialVela = "lona" | "linho" | "seda";
export type TipoCanhao = "canhao" | "aprimorado" | "superior" | "longo";
export type Fortificacao = "nenhuma" | "aco" | "temperado";
export type Motor = "nenhum" | "manual" | "carvao" | "combustao";
export type Leme = "tora" | "circular";

// Características gerais por tamanho (cap. 14.1). "comodos"/"tripulantes"/
// "canhoesMax" são tetos ("até N"); desaceleracaoNos é negativo; `colisao`:
// dado do dano de colisão.
export type StatsTamanho = {
  slug: TamanhoNavio;
  nome: string;
  dimensao: string; // L×C×A em metros
  deques: number;
  comodos: number;
  tripulantes: number;
  canhoesMax: number;
  pvMax: number;
  desaceleracaoNos: number;
  mastrosMax: number;
  colisao: string;
};

export const TAMANHOS_NAVIO: StatsTamanho[] = [
  { slug: "pequeno", nome: "Pequeno", dimensao: "6×15×18 m", deques: 1, comodos: 4, tripulantes: 20, canhoesMax: 3, pvMax: 150, desaceleracaoNos: -2, mastrosMax: 1, colisao: "5d10" },
  { slug: "medio", nome: "Médio", dimensao: "15×36×39 m", deques: 2, comodos: 10, tripulantes: 50, canhoesMax: 10, pvMax: 300, desaceleracaoNos: -10, mastrosMax: 2, colisao: "10d10" },
  { slug: "grande", nome: "Grande", dimensao: "24×51×54 m", deques: 3, comodos: 26, tripulantes: 130, canhoesMax: 15, pvMax: 500, desaceleracaoNos: -20, mastrosMax: 2, colisao: "15d10" },
  { slug: "enorme", nome: "Enorme", dimensao: "36×72×75 m", deques: 4, comodos: 48, tripulantes: 240, canhoesMax: 25, pvMax: 750, desaceleracaoNos: -30, mastrosMax: 3, colisao: "20d10" },
  { slug: "colossal", nome: "Colossal", dimensao: "48×120×90 m", deques: 5, comodos: 90, tripulantes: 450, canhoesMax: 45, pvMax: 1000, desaceleracaoNos: -40, mastrosMax: 3, colisao: "30d10" },
];

// Madeiras (cap. 14.4) — a predominante (80%+) define CR e Bônus de Resistência.
export type StatsMadeira = {
  slug: MadeiraNavio;
  nome: string;
  cr: number;
  br: number; // reduz todo dano recebido
  precoPeca: number; // ฿
};

export const MADEIRAS_NAVIO: StatsMadeira[] = [
  { slug: "cedro", nome: "Cedro", cr: 10, br: 5, precoPeca: 30000 },
  { slug: "carvalho", nome: "Carvalho", cr: 12, br: 10, precoPeca: 80000 },
  { slug: "cerejeira", nome: "Cerejeira", cr: 15, br: 15, precoPeca: 150000 },
  { slug: "adam", nome: "Adam", cr: 18, br: 30, precoPeca: 400000 },
];

export const MASTROS_NAVIO: { slug: TipoMastro; nome: string; plural: string }[] = [
  { slug: "simples", nome: "Simples", plural: "simples" },
  { slug: "composto", nome: "Composto", plural: "compostos" },
  { slug: "multiplo", nome: "Múltiplo", plural: "múltiplos" },
];

// Velas (cap. 14.4): uma por mastro; os nós dependem do tipo de mastro.
export const VELAS_NAVIO: { slug: MaterialVela; nome: string; nos: Record<TipoMastro, number> }[] = [
  { slug: "lona", nome: "Lona", nos: { simples: 2, composto: 8, multiplo: 16 } },
  { slug: "linho", nome: "Linho", nos: { simples: 4, composto: 10, multiplo: 18 } },
  { slug: "seda", nome: "Seda", nos: { simples: 6, composto: 12, multiplo: 20 } },
];

// Armas de navio (cap. 14.5). `dano`: quanto da munição o tiro causa.
export const CANHOES_NAVIO: { slug: TipoCanhao; nome: string; alcance: string; bonus: number; cr: number; pv: number; dano: number }[] = [
  { slug: "canhao", nome: "Canhão", alcance: "90/120", bonus: 2, cr: 1, pv: 50, dano: 1 },
  { slug: "aprimorado", nome: "Canhão Aprimorado", alcance: "120/240", bonus: 4, cr: 1, pv: 70, dano: 1 },
  { slug: "superior", nome: "Canhão Superior", alcance: "45/90", bonus: 6, cr: 2, pv: 90, dano: 2 },
  { slug: "longo", nome: "Canhão de Longo Alcance", alcance: "500/750", bonus: 5, cr: 3, pv: 120, dano: 0.5 },
];

// Fortificações (só engenheiro faz). Aço temperado dá a Resistência Titânica.
export const FORTIFICACOES_NAVIO: { slug: Fortificacao; nome: string; cr: number }[] = [
  { slug: "nenhuma", nome: "Nenhuma", cr: 0 },
  { slug: "aco", nome: "Aço", cr: 1 },
  { slug: "temperado", nome: "Aço Temperado", cr: 2 },
];

// Motor: move o navio sem vento nem corrente; vale o mais potente.
export const MOTORES_NAVIO: { slug: Motor; nome: string; nos: number }[] = [
  { slug: "nenhum", nome: "Nenhum", nos: 0 },
  { slug: "manual", nome: "Manual", nos: 4 },
  { slug: "carvao", nome: "A carvão", nos: 10 },
  { slug: "combustao", nome: "De combustão", nos: 10 },
];

export const LEMES_NAVIO: { slug: Leme; nome: string }[] = [
  { slug: "tora", nome: "Tora" },
  { slug: "circular", nome: "Circular" },
];

// Navio danificado (cap. 14.5): pela fração de PV, quanto perde de velocidade
// e quanto custa o reparo.
export const ESTADOS_NAVIO: { nome: string; ate: number; reducao: number; reparo: string }[] = [
  { nome: "Irreparável", ate: 0.05, reducao: 30, reparo: "" },
  { nome: "Muito Danificado", ate: 0.24, reducao: 16, reparo: "50 dias, até 100% do valor do navio" },
  { nome: "Danificado", ate: 0.5, reducao: 10, reparo: "25 dias, até 75% do valor do navio" },
  { nome: "Avariado", ate: 0.8, reducao: 6, reparo: "12 dias, até 45% do valor do navio" },
  { nome: "Normal", ate: 1, reducao: 0, reparo: "5 dias, até 20% do valor do navio" },
];

// Cômodos (cap. 14.4). `ocupa`: espaço em cômodos (Vigilância não conta);
// `varios`: dá pra ter mais de um. Sem pagar a despesa semanal, não dá benefício.
export type ComodoNavio = {
  slug: string;
  nome: string;
  preco: number;
  dias: number;
  semanal: number;
  ocupa: number;
  varios?: boolean;
  soMultiplo?: boolean;
  beneficio: string;
};

export const COMODOS_NAVIO: ComodoNavio[] = [
  { slug: "aposento_capitao", nome: "Aposento do Capitão", preco: 150000, dias: 1, semanal: 10000, ocupa: 1, beneficio: "Aqui dentro, o capitão tem vantagem em Testes e Salvaguardas de PRE. Descanso longo aqui: um acerto garantido que troca uma jogada falha, até o fim do próximo descanso longo." },
  { slug: "biblioteca", nome: "Biblioteca", preco: 200000, dias: 3, semanal: 25000, ocupa: 1, beneficio: "Cartas e mapas na metade do tempo. Arqueólogo, caçador de recompensas ou navegador: +5 em Testes e Perícias Especiais de SAB feitos aqui depois de pesquisar." },
  { slug: "cela", nome: "Cela", preco: 220000, dias: 1, semanal: 5000, ocupa: 1, varios: true, beneficio: "Até 5 criaturas Médias ou 2 Grandes. Fugir sem alertar o navio: DES (Furtividade) CD 25." },
  { slug: "cozinha", nome: "Cozinha", preco: 300000, dias: 3, semanal: 25000, ocupa: 1, beneficio: "Obrigatória pra preparar comida; serve de refeitório. +5 no máximo de tripulantes." },
  { slug: "despensa", nome: "Despensa", preco: 150000, dias: 1, semanal: 10000, ocupa: 1, beneficio: "Comida demora o dobro pra estragar. Os cozinheiros alimentam +20 além do máximo do navio." },
  { slug: "dormitorio", nome: "Dormitório", preco: 100000, dias: 2, semanal: 10000, ocupa: 1, varios: true, beneficio: "Único lugar do navio com descanso longo, 1 h mais curto. 5 por dormitório; com mais gente, ninguém descansa." },
  { slug: "enfermaria", nome: "Enfermaria", preco: 350000, dias: 3, semanal: 40000, ocupa: 1, beneficio: "Médico: +5 em Testes e Perícias Especiais de SAB pra tratar ferida. Paciente: +5 em Salvaguardas de CON." },
  { slug: "laboratorio", nome: "Laboratório", preco: 400000, dias: 4, semanal: 35000, ocupa: 1, beneficio: "Médico ou engenheiro: +5 em Testes e Perícias Especiais de SAB." },
  { slug: "vigilancia", nome: "Quarto de Vigilância", preco: 250000, dias: 9, semanal: 5000, ocupa: 0, soMultiplo: true, beneficio: "Vigilância necessária cai pra 2 em qualquer tamanho. Fica no mastro múltiplo e não conta nos cômodos." },
  { slug: "refeitorio", nome: "Refeitório", preco: 200000, dias: 2, semanal: 10000, ocupa: 1, beneficio: "Os cozinheiros alimentam +20 além do máximo." },
  { slug: "maquinas", nome: "Sala das Máquinas", preco: 500000, dias: 6, semanal: 20000, ocupa: 3, beneficio: "Obrigatória pro motor a carvão ou de combustão." },
  { slug: "ferramentas", nome: "Sala de Ferramentas", preco: 200000, dias: 2, semanal: 15000, ocupa: 1, beneficio: "Carpinteiro e engenheiro: +5 em Testes e Perícias Especiais de SAB e DES." },
  { slug: "treinamento", nome: "Sala de Treinamento", preco: 450000, dias: 3, semanal: 30000, ocupa: 3, beneficio: "Tripulantes com ND +1. Um dia de treino aqui vale dois; um tripulante por vez." },
  { slug: "tesouro", nome: "Sala do Tesouro", preco: 600000, dias: 4, semanal: 10000, ocupa: 1, beneficio: "Abre só com duas chaves, em geral do capitão e do imediato; outro jeito aciona a proteção." },
];

export function comodoNavio(slug: string): ComodoNavio | undefined {
  return COMODOS_NAVIO.find((c) => c.slug === slug);
}

// Espaço que os cômodos ocupam (Vigilância fica de fora).
export function espacoDosComodos(comodos: string[]): number {
  return comodos.reduce((soma, slug) => soma + (comodoNavio(slug)?.ocupa ?? 0), 0);
}

// Munição de partida por canhão.
export const BOLA_DE_CHUMBO = { nome: "Bola de Chumbo", dano: "3d10", tipo: "Contundente" };
export const BOLAS_POR_CANHAO = 10;

export const TAMANHOS_VALIDOS = new Set<string>(TAMANHOS_NAVIO.map((t) => t.slug));
export const MADEIRAS_VALIDAS = new Set<string>(MADEIRAS_NAVIO.map((m) => m.slug));

export function statsTamanho(slug: string): StatsTamanho {
  return TAMANHOS_NAVIO.find((t) => t.slug === slug) ?? TAMANHOS_NAVIO[0];
}

export function statsMadeira(slug: string): StatsMadeira {
  return MADEIRAS_NAVIO.find((m) => m.slug === slug) ?? MADEIRAS_NAVIO[0];
}

export function statsCanhao(slug: string) {
  return CANHOES_NAVIO.find((c) => c.slug === slug) ?? CANHOES_NAVIO[0];
}

// O navio que o jogador monta ao criar a ficha.
export type MontagemNavio = {
  tamanho: TamanhoNavio;
  madeira: MadeiraNavio;
  mastro: TipoMastro;
  mastros: number;
  vela: MaterialVela;
  canhao: TipoCanhao;
  canhoes: number;
  fortificacao: Fortificacao;
  motor: Motor;
  leme: Leme;
  // Slugs de COMODOS_NAVIO; repete o que pode ter mais de um.
  comodos: string[];
};

// Modelos prontos do livro (cap. 14.8), um por tamanho.
const MODELOS: Record<TamanhoNavio, Omit<MontagemNavio, "tamanho" | "comodos">> = {
  pequeno: { madeira: "cedro", mastro: "multiplo", mastros: 1, vela: "lona", canhao: "canhao", canhoes: 1, fortificacao: "nenhuma", motor: "nenhum", leme: "tora" },
  medio: { madeira: "carvalho", mastro: "composto", mastros: 2, vela: "seda", canhao: "canhao", canhoes: 3, fortificacao: "nenhuma", motor: "nenhum", leme: "tora" },
  grande: { madeira: "cerejeira", mastro: "multiplo", mastros: 2, vela: "linho", canhao: "aprimorado", canhoes: 5, fortificacao: "nenhuma", motor: "nenhum", leme: "circular" },
  enorme: { madeira: "cerejeira", mastro: "multiplo", mastros: 3, vela: "lona", canhao: "aprimorado", canhoes: 8, fortificacao: "nenhuma", motor: "carvao", leme: "circular" },
  colossal: { madeira: "cerejeira", mastro: "multiplo", mastros: 3, vela: "seda", canhao: "aprimorado", canhoes: 12, fortificacao: "aco", motor: "combustao", leme: "circular" },
};

// O modelo do livro daquele tamanho: vem com âncora e cômodos vazios.
export function montagemPadrao(tamanho: string): MontagemNavio {
  const t = statsTamanho(tamanho);
  return { tamanho: t.slug, ...MODELOS[t.slug], comodos: [] };
}

// Cômodos válidos: conhecidos, um só dos que não repetem, Vigilância só em
// mastro múltiplo, e o que passar do espaço do tamanho fica de fora.
function lerComodos(raw: unknown, mastro: TipoMastro, espaco: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  let usado = 0;
  for (const slug of raw) {
    const c = typeof slug === "string" ? comodoNavio(slug) : undefined;
    if (!c || (!c.varios && out.includes(c.slug)) || (c.soMultiplo && mastro !== "multiplo")) continue;
    if (usado + c.ocupa > espaco) continue;
    usado += c.ocupa;
    out.push(c.slug);
  }
  return out;
}

// Do form, do cliente ou do banco: o que faltar vem do modelo do tamanho;
// números dentro do que o tamanho comporta.
export function lerMontagem(raw: unknown): MontagemNavio | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!TAMANHOS_VALIDOS.has(String(o.tamanho))) return null;
  const base = montagemPadrao(String(o.tamanho));
  const t = statsTamanho(base.tamanho);
  const inteiro = (v: unknown, min: number, max: number, padrao: number) => {
    const n = Math.trunc(Number(v));
    return v != null && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
  };
  const de = <T extends string>(lista: { slug: T }[], v: unknown, padrao: T): T =>
    lista.find((x) => x.slug === v)?.slug ?? padrao;
  const mastro = de(MASTROS_NAVIO, o.mastro, base.mastro);
  return {
    tamanho: base.tamanho,
    madeira: de(MADEIRAS_NAVIO, o.madeira, base.madeira),
    mastro,
    mastros: inteiro(o.mastros, 1, t.mastrosMax, base.mastros),
    vela: de(VELAS_NAVIO, o.vela, base.vela),
    canhao: de(CANHOES_NAVIO, o.canhao, base.canhao),
    canhoes: inteiro(o.canhoes, 0, t.canhoesMax, base.canhoes),
    fortificacao: de(FORTIFICACOES_NAVIO, o.fortificacao, base.fortificacao),
    motor: de(MOTORES_NAVIO, o.motor, base.motor),
    leme: de(LEMES_NAVIO, o.leme, base.leme),
    comodos: lerComodos(o.comodos, mastro, t.comodos),
  };
}

// O que mora em `Personagem.navio`: a montagem e quem comanda (salvaguarda de
// estrutura sai da VON dele).
export type DadosNavio = { montagem: MontagemNavio; comandanteId: string | null };

export function lerNavio(raw: unknown): DadosNavio | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const montagem = lerMontagem(o.montagem);
  if (!montagem) return null;
  return { montagem, comandanteId: typeof o.comandanteId === "string" && o.comandanteId ? o.comandanteId : null };
}

// Velocidade (cap. 14.6): soma das velas − desaceleração por peso, sem correnteza.
export function velocidadeDoNavio(m: MontagemNavio): { nos: number; velas: number; peso: number } {
  const vela = VELAS_NAVIO.find((v) => v.slug === m.vela) ?? VELAS_NAVIO[0];
  const velas = m.mastros * vela.nos[m.mastro];
  const peso = statsTamanho(m.tamanho).desaceleracaoNos;
  return { nos: Math.max(0, velas + peso), velas, peso };
}

// Deslocamento em combate: 1,5 m por rodada a cada 2 nós.
export function metrosPorRodada(nos: number): number {
  return Math.floor(Math.max(0, nos) / 2) * 1.5;
}

// Estado do navio pelos PV que restam.
export function estadoDoNavio(pvAtual: number, pvMax: number) {
  const fracao = pvMax > 0 ? Math.max(0, pvAtual) / pvMax : 1;
  return ESTADOS_NAVIO.find((e) => fracao <= e.ate) ?? ESTADOS_NAVIO[ESTADOS_NAVIO.length - 1];
}

// Velocidade máxima com o dano: a da ficha menos a redução do estado, sem passar de 8 nós pra baixo.
export function velocidadeComDano(nos: number, pvAtual: number, pvMax: number): number {
  const reducao = estadoDoNavio(pvAtual, pvMax).reducao;
  return reducao > 0 ? Math.min(nos, Math.max(8, nos - reducao)) : Math.max(0, nos);
}

// Ficha de partida de um navio do livro: PV do tamanho, velocidade das velas,
// casco da madeira (CR e redução de dano), fortificação, Proteger o Navio e
// a artilharia. Os canhões (arma, munição e ação) o servidor monta.
export function presetDeNavio(m: MontagemNavio) {
  const t = statsTamanho(m.tamanho);
  const madeira = statsMadeira(m.madeira);
  const vela = VELAS_NAVIO.find((v) => v.slug === m.vela) ?? VELAS_NAVIO[0];
  const mastro = MASTROS_NAVIO.find((x) => x.slug === m.mastro) ?? MASTROS_NAVIO[0];
  const motor = MOTORES_NAVIO.find((x) => x.slug === m.motor) ?? MOTORES_NAVIO[0];
  const fort = FORTIFICACOES_NAVIO.find((x) => x.slug === m.fortificacao) ?? FORTIFICACOES_NAVIO[0];
  const leme = LEMES_NAVIO.find((x) => x.slug === m.leme) ?? LEMES_NAVIO[0];
  const velocidade = velocidadeDoNavio(m);
  return {
    hpMax: t.pvMax,
    deslocamento: velocidade.nos,
    canhoes: m.canhoes,
    habilidades: [
      {
        nome: `Navio ${t.nome}`,
        tags: "Tamanho",
        descricao: [
          `**${t.dimensao}** · ${t.deques} ${t.deques === 1 ? "deque" : "deques"}`,
          `-:ship: Até **${t.comodos}** cômodos, **${t.tripulantes}** tripulantes e **${t.canhoesMax}** canhões.`,
          `-:wind: ${m.mastros} ${m.mastros === 1 ? `mastro ${mastro.nome.toLowerCase()}` : `mastros ${mastro.plural}`} com velas de ${vela.nome.toLowerCase()}: **+${velocidade.velas} nós**; peso: **${t.desaceleracaoNos} nós**.`,
          `-:compass: Leme ${leme.nome.toLowerCase()}.`,
          ...(motor.nos > 0 ? [`-:gear: Motor ${motor.nome.toLowerCase()}: **+${motor.nos} nós** sem vento.`] : []),
        ].join("\n"),
        efeitos: [],
      },
      {
        nome: `Casco de ${madeira.nome}`,
        tags: "Madeira",
        descricao:
          `CR **${madeira.cr}** e {{efeito:reducao_dano#1}} em todo dano recebido.` +
          (madeira.slug === "adam" ? "\n-:shield: **Resistência Anciã:** imune ao que aumenta o dano em construções." : ""),
        // A CR base do navio é 10 (sem atributo); o casco soma o resto.
        efeitos: [
          { tipo: "modificador", alvo: "cr", valor: madeira.cr - 10 },
          { tipo: "reducao_dano", valor: madeira.br },
        ],
      },
      ...(fort.cr > 0
        ? [
            {
              nome: `Fortificação de ${fort.nome}`,
              tags: "Fortificação",
              descricao:
                "{{efeito:modificador#0}}." +
                (fort.slug === "temperado"
                  ? "\n-:shield-halved: **Resistência Titânica:** resistência a {{dano:Contundente}}, {{dano:Cortante}} e {{dano:Perfurante}}."
                  : ""),
              efeitos: [
                { tipo: "modificador", alvo: "cr", valor: fort.cr },
                ...(fort.slug === "temperado"
                  ? ["Contundente", "Cortante", "Perfurante"].map((tipoDano) => ({ tipo: "resistencia", tipoDano }))
                  : []),
              ],
            },
          ]
        : []),
      ...habilidadesDosComodos(m.comodos),
      {
        nome: "Proteger o Navio",
        tags: "Tripulação",
        descricao: "Tripulante de nível 8 ou mais que pula o turno: **+1 de CR** no navio, até **+3**. Um passo por tripulante.",
        efeitos: [{ tipo: "progressivo", formula: "1", max: 3, em: "cr" }],
      },
      {
        nome: "Artilharia",
        tags: "Tripulação",
        descricao:
          "O acerto do navio soma o maior entre a **PRE do capitão** e a **DES dos atiradores**.\n-:crosshairs: **Homem das Armas:** +5 nos canhões.",
        efeitos: [{ tipo: "modificador", alvo: "ataque", valor: 0 }],
      },
    ],
  };
}

// Uma habilidade por cômodo ("Dormitório ×2"), com o benefício e a despesa.
function habilidadesDosComodos(comodos: string[]) {
  const vezes = new Map<string, number>();
  for (const slug of comodos) vezes.set(slug, (vezes.get(slug) ?? 0) + 1);
  return [...vezes].flatMap(([slug, n]) => {
    const c = comodoNavio(slug);
    if (!c) return [];
    return [
      {
        nome: n > 1 ? `${c.nome} ×${n}` : c.nome,
        tags: "Cômodo",
        descricao: `${c.beneficio}\n-:sack-dollar: Despesa: **฿ ${(c.semanal * n).toLocaleString("pt-BR")}** por semana.`,
        efeitos: [] as never[],
      },
    ];
  });
}

// A arma "canhão" do navio: quantidade = canhões; o dano é o da munição
// (Superior dobra, Longo Alcance divide por dois).
export function armaDosCanhoes(m: MontagemNavio) {
  const c = statsCanhao(m.canhao);
  return {
    nome: c.nome,
    modificador: c.bonus,
    alcanceMetros: c.alcance,
    descricao: `CR do navio **+${c.cr}**, **${c.pv} PV**. Dano: o da munição${c.dano > 1 ? " **×2**" : c.dano < 1 ? " **÷2**" : ""}.`,
    efeitos: c.dano !== 1 ? [{ tipo: "multiplicador", alvo: "dano", fator: c.dano }] : [],
  };
}

// Ação que dispara os canhões: uma jogada por canhão.
export function acaoDosCanhoes(m: MontagemNavio) {
  const c = statsCanhao(m.canhao);
  return {
    nome: "Disparar canhões",
    tipo: "padrao",
    alvo: "inimigo",
    alcance: `${c.alcance} m`,
    descricao:
      "No início do turno, **uma jogada de ataque por canhão** com efetivo e apontado pro alvo.\n" +
      "-:bomb: Além do 3º, cada canhão pode virar **Bombardeio** (soma metade do dano de um acerto) ou **Tiros de Teste** (+3 na próxima jogada).",
    efeitos: m.canhoes > 1 ? [{ tipo: "multi_ataque", vezes: Math.min(20, m.canhoes) }] : [],
  };
}

// ─── No combate ────────────────────────────────────────────────────────────

// Velocidade atual, rumo (graus, 0 = proa pro norte) e âncora; `danoAncora`
// soma o dano de tentar mover com ela baixada (a cada 80, ela pode soltar).
export type EstadoNavio = { velocidade: number; rumo: number; ancora: boolean; danoAncora: number };

export function lerEstadoNavio(raw: unknown, velocidadePadrao: number): EstadoNavio {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const n = (v: unknown, padrao: number) => (Number.isFinite(Number(v)) && v != null ? Number(v) : padrao);
  return {
    velocidade: Math.max(0, n(o.velocidade, velocidadePadrao)),
    rumo: ((Math.trunc(n(o.rumo, 0)) % 360) + 360) % 360,
    ancora: o.ancora === true,
    danoAncora: Math.max(0, Math.trunc(n(o.danoAncora, 0))),
  };
}

// Manobra (cap. 14.5): mudar a velocidade até 6 nós (entre 2 e o máximo), virar
// até 45° ou subir/baixar a âncora.
export const MANOBRA_NOS = 6;
export const MANOBRA_GRAUS = 45;
// Colisão só acima disso.
export const NOS_PRA_COLIDIR = 16;
// Âncora baixada: 8d10 contundente a cada 6 nós que tentar mover.
export const DANO_ANCORA = "8d10";
export const DANO_PRA_SOLTAR_ANCORA = 80;

// Dado da colisão: o da maior categoria envolvida.
export function danoDeColisao(a: string, b: string): string {
  const i = Math.max(
    TAMANHOS_NAVIO.findIndex((t) => t.slug === a),
    TAMANHOS_NAVIO.findIndex((t) => t.slug === b),
  );
  return TAMANHOS_NAVIO[Math.max(0, i)].colisao;
}

const RUMOS = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
export function textoRumo(graus: number): string {
  return RUMOS[Math.round((((graus % 360) + 360) % 360) / 45) % 8];
}
