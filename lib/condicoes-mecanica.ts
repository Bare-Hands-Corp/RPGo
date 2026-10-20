// O que uma condição faz: efeitos na ficha de quem está com ela, regras do
// combate (ataques contra, ações, reação, concentração), dano com gatilho e as
// ações próprias dela (Apagar, Tratar). O narrador configura na Biblioteca; a
// condição do livro (cap. 10.3) sem configuração usa a tabela daqui, pela
// grafia do nome. Puro.

import { lerEfeitos, PERICIAS, type EfeitoHabilidade, type HabilidadeFonte, type ValeEfeito } from "./op-rpg";
import type { ModoRolagem } from "./dice";
import { mesmaCondicao, type CondicaoAplicada } from "./condicoes";

// Quando o dano da condição cai: no início ou no fim do turno de quem está com
// ela, no 1º ataque do turno ou quando ele se move (avisado num botão).
export type GatilhoDano = "inicio" | "fim" | "ataque" | "movimento";
export const GATILHOS_DANO: { slug: GatilhoDano; nome: string }[] = [
  { slug: "inicio", nome: "Início do turno" },
  { slug: "fim", nome: "Fim do turno" },
  { slug: "ataque", nome: "1º ataque do turno" },
  { slug: "movimento", nome: "Ao se mover" },
];

export type CustoAcaoCondicao = "padrao" | "bonus" | "power" | "livre";

// Ação que quem está com a condição pode fazer: tirar, trocar por outra
// condição (Apagar o fogo vira Queimadura) ou um teste de perícia que tira.
export type AcaoDaCondicao = {
  nome: string;
  custo: CustoAcaoCondicao;
  faz: "remover" | "trocar" | "teste";
  condicao?: string;
  teste?: { pericia: string; cd: number };
};

export type MecanicaCondicao = {
  // Valem na ficha de quem está com ela.
  efeitos: EfeitoHabilidade[];
  // Ataques contra ele: com vantagem, com desvantagem ou "perto" (vantagem a
  // 1,5 m, desvantagem de mais longe).
  contra?: "vantagem" | "desvantagem" | "perto";
  // Acerto a 1,5 m vira crítico.
  criticoPerto?: boolean;
  // Sem ações, ações poderosas, ações bônus nem reações.
  incapacita?: boolean;
  semReacao?: boolean;
  // A concentração acaba ao receber a condição.
  semConcentracao?: boolean;
  // Só uma entre ação, ação poderosa ou ação bônus por turno.
  umaAcao?: boolean;
  // PP de técnica que erra todos os alvos volta.
  ppDeErroVolta?: boolean;
  dano?: { formula: string; tipo: string; quando: GatilhoDano } | null;
  acoes?: AcaoDaCondicao[];
};

// `id` e `uso`: a de uso único (lib/condicoes.ts) some quando vale numa rolagem.
export type CondicaoComMecanica = { nome: string; mecanica?: unknown; id?: string; uso?: "proxima" };

export const MECANICA_VAZIA: MecanicaCondicao = { efeitos: [] };

const desv = (alvo: string): EfeitoHabilidade => ({ tipo: "desvantagem", alvo });
const vant = (alvo: string): EfeitoHabilidade => ({ tipo: "vantagem", alvo });
const falha = (alvo: string): EfeitoHabilidade => ({ tipo: "falha_auto", alvo });
const deslocamento = (fator: number): EfeitoHabilidade => ({ tipo: "multiplicador", alvo: "deslocamento", fator });
const tratar = (cd: number): AcaoDaCondicao => ({
  nome: "Tratar",
  custo: "padrao",
  faz: "teste",
  teste: { pericia: "sobrevivencia", cd },
});

const INDEFESO: MecanicaCondicao = {
  efeitos: [falha("salv-forca"), falha("salv-destreza")],
  contra: "vantagem",
  criticoPerto: true,
  incapacita: true,
};

const DO_LIVRO: [string, MecanicaCondicao][] = [
  ["Agarrado", { efeitos: [deslocamento(0)] }],
  ["Amedrontado", { efeitos: [desv("ataque"), desv("teste")] }],
  ["Atordoado", { efeitos: [falha("salv-forca"), falha("salv-destreza")], contra: "vantagem", incapacita: true }],
  ["Bêbado", { efeitos: [desv("salvaguarda"), desv("teste-destreza")] }],
  ["Caído", { efeitos: [desv("ataque")], contra: "perto" }],
  ["Cego", { efeitos: [desv("ataque")], contra: "vantagem" }],
  [
    "Empoderado",
    { efeitos: [{ tipo: "valor_fixo", alvo: "dado-arma", valor: "1d12" }], ppDeErroVolta: true },
  ],
  [
    "Enfraquecido",
    { efeitos: [deslocamento(0.5), desv("teste"), falha("salvaguarda")], contra: "vantagem", incapacita: true },
  ],
  [
    "Enfurecido",
    {
      efeitos: [desv("ataque"), { tipo: "dano_extra", formula: "1d4", em: "dano-cc", sempre: true }],
      semConcentracao: true,
    },
  ],
  ["Envenenado", { efeitos: [desv("ataque"), desv("teste")] }],
  ["Estremecido", { efeitos: [desv("ataque"), falha("concentracao")], semConcentracao: true }],
  ["Impedido", { efeitos: [deslocamento(0), desv("ataque"), desv("salv-destreza")], contra: "vantagem" }],
  ["Incapacitado", { efeitos: [], incapacita: true }],
  ["Inconsciente", INDEFESO],
  ["Invisível", { efeitos: [vant("ataque")], contra: "desvantagem" }],
  [
    "Letárgico",
    {
      efeitos: [deslocamento(0.5), { tipo: "multiplicador", alvo: "dano", fator: 0.5, armaDeFogo: "exceto" }],
      umaAcao: true,
    },
  ],
  ["Paralisado", INDEFESO],
  [
    "Queimado",
    {
      efeitos: [falha("concentracao")],
      semConcentracao: true,
      dano: { formula: "1d6", tipo: "Fogo", quando: "ataque" },
      acoes: [{ nome: "Apagar", custo: "padrao", faz: "trocar", condicao: "Queimadura" }],
    },
  ],
  // O que fica do Queimado depois de apagar, até tratar.
  ["Queimadura", { efeitos: [desv("concentracao")], acoes: [tratar(17)] }],
  ["Sangramento", { efeitos: [], dano: { formula: "1d6", tipo: "", quando: "movimento" }, acoes: [tratar(16)] }],
  ["Sonolento", { efeitos: [desv("teste-destreza"), desv("teste-sabedoria")], semReacao: true }],
];

export function mecanicaDoLivro(nome: string): MecanicaCondicao | null {
  return DO_LIVRO.find(([n]) => mesmaCondicao(n, nome))?.[1] ?? null;
}

const CUSTOS = new Set<string>(["padrao", "bonus", "power", "livre"]);
const PERICIAS_SET = new Set<string>(PERICIAS.map((p) => p.slug));

// Json do banco ou do form → mecânica limpa; null = não configurada.
export function lerMecanica(raw: unknown): MecanicaCondicao | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sim = (v: unknown) => v === true;
  const contra = o.contra === "vantagem" || o.contra === "desvantagem" || o.contra === "perto" ? o.contra : undefined;
  const d = o.dano as Record<string, unknown> | null | undefined;
  const formula = d && typeof d === "object" ? String(d.formula ?? "").trim().slice(0, 40) : "";
  const quando = GATILHOS_DANO.find((g) => g.slug === d?.quando)?.slug ?? "inicio";
  const acoes = (Array.isArray(o.acoes) ? o.acoes : []).flatMap((x): AcaoDaCondicao[] => {
    if (!x || typeof x !== "object") return [];
    const a = x as Record<string, unknown>;
    const nome = String(a.nome ?? "").trim().slice(0, 30);
    const faz = a.faz === "trocar" || a.faz === "teste" ? a.faz : "remover";
    const t = a.teste as Record<string, unknown> | undefined;
    const condicao = String(a.condicao ?? "").trim().slice(0, 40);
    if (!nome || (faz === "trocar" && !condicao)) return [];
    if (faz === "teste" && !PERICIAS_SET.has(String(t?.pericia))) return [];
    return [
      {
        nome,
        custo: CUSTOS.has(String(a.custo)) ? (a.custo as CustoAcaoCondicao) : "padrao",
        faz,
        ...(faz === "trocar" ? { condicao } : {}),
        ...(faz === "teste"
          ? { teste: { pericia: String(t!.pericia), cd: Math.min(40, Math.max(1, Math.trunc(Number(t!.cd)) || 10)) } }
          : {}),
      },
    ];
  });
  return {
    efeitos: lerEfeitos(o.efeitos),
    ...(contra ? { contra } : {}),
    ...(sim(o.criticoPerto) ? { criticoPerto: true } : {}),
    ...(sim(o.incapacita) ? { incapacita: true } : {}),
    ...(sim(o.semReacao) ? { semReacao: true } : {}),
    ...(sim(o.semConcentracao) ? { semConcentracao: true } : {}),
    ...(sim(o.umaAcao) ? { umaAcao: true } : {}),
    ...(sim(o.ppDeErroVolta) ? { ppDeErroVolta: true } : {}),
    ...(formula ? { dano: { formula, tipo: String(d?.tipo ?? "").trim().slice(0, 40), quando } } : {}),
    ...(acoes.length > 0 ? { acoes: acoes.slice(0, 4) } : {}),
  };
}

// A configurada; sem ela, a do livro pelo nome.
export function mecanicaDa(c: CondicaoComMecanica): MecanicaCondicao | null {
  return lerMecanica(c.mecanica) ?? mecanicaDoLivro(c.nome);
}

// As condições como fontes de efeito da ficha ("Cego (condição)"). A de uso
// único diz qual condição o chip gasta ao rolar.
export function fontesDasCondicoes(condicoes: CondicaoComMecanica[]): HabilidadeFonte[] {
  const vistas = new Set<string>();
  return condicoes.flatMap((c) => {
    const m = mecanicaDa(c);
    if (!m || m.efeitos.length === 0 || vistas.has(c.nome)) return [];
    vistas.add(c.nome);
    return [
      {
        nome: `${c.nome} (condição)`,
        tipo: "passiva",
        efeitos: m.efeitos,
        ...(c.uso === "proxima" && c.id ? { consome: c.id } : {}),
      },
    ];
  });
}

// As de uso único que valeram (gastam), sem repetir.
function gasta(c: CondicaoComMecanica, lista: string[]) {
  if (c.uso === "proxima" && c.id && !lista.includes(c.id)) lista.push(c.id);
}

type Regra = "incapacita" | "semReacao" | "semConcentracao" | "umaAcao" | "ppDeErroVolta";

// Primeira condição que liga a regra; null = nenhuma.
function quemTem(condicoes: CondicaoComMecanica[], regra: Regra): string | null {
  return condicoes.find((c) => mecanicaDa(c)?.[regra])?.nome ?? null;
}

// O que as condições somadas proíbem; cada campo diz a primeira que proíbe.
export function travasDasCondicoes(condicoes: CondicaoComMecanica[]): {
  incapacita: string | null;
  semReacao: string | null;
  semConcentracao: string | null;
  umaAcao: string | null;
  ppDeErroVolta: string | null;
} {
  const incapacita = quemTem(condicoes, "incapacita");
  return {
    incapacita,
    semReacao: incapacita ?? quemTem(condicoes, "semReacao"),
    semConcentracao: quemTem(condicoes, "semConcentracao"),
    umaAcao: quemTem(condicoes, "umaAcao"),
    ppDeErroVolta: quemTem(condicoes, "ppDeErroVolta"),
  };
}

// Por que a ação não pode ser usada com essas condições; null = pode.
// `gastas`: as ações do turno já usadas.
export function travaDaCondicaoNaAcao(
  condicoes: CondicaoComMecanica[],
  tipo: string,
  gastas: Partial<Record<string, number>>,
): string | null {
  const t = travasDasCondicoes(condicoes);
  if (t.incapacita && (tipo === "padrao" || tipo === "bonus" || tipo === "power" || tipo === "react")) {
    return `${t.incapacita}: sem ações nem reações.`;
  }
  if (tipo === "react" && t.semReacao) return `${t.semReacao}: sem reações.`;
  if (t.umaAcao && (tipo === "padrao" || tipo === "bonus" || tipo === "power")) {
    const usadas = (gastas.padrao ?? 0) + (gastas.bonus ?? 0) + (gastas.power ?? 0);
    if (usadas >= 1) return `${t.umaAcao}: só uma ação, ação poderosa ou ação bônus por turno.`;
  }
  return null;
}

// Vantagem e desvantagem que se anulam.
function juntarModos(vantagem: boolean, desvantagem: boolean): ModoRolagem {
  if (vantagem === desvantagem) return "normal";
  return vantagem ? "vantagem" : "desvantagem";
}

// Modo de um ataque pelas condições do alvo (e, pra quem não tem ficha, as do
// atacante). `motivos`: "Cego: vantagem". `gastas`: as de uso único do
// atacante que valeram.
export function modoDoAtaque(
  alvo: CondicaoComMecanica[],
  atacante: CondicaoComMecanica[] = [],
  corpoACorpo = true,
): { modo: ModoRolagem; motivos: string[]; gastas: string[] } {
  let vantagem = false;
  let desvantagem = false;
  const motivos: string[] = [];
  const gastas: string[] = [];
  const vistas = new Set<string>();
  for (const c of alvo) {
    const contra = mecanicaDa(c)?.contra;
    if (!contra || vistas.has(c.nome)) continue;
    vistas.add(c.nome);
    const v = contra === "vantagem" || (contra === "perto" && corpoACorpo);
    if (v) vantagem = true;
    else desvantagem = true;
    motivos.push(`${c.nome}: ${v ? "vantagem" : "desvantagem"}`);
  }
  for (const c of atacante) {
    for (const e of mecanicaDa(c)?.efeitos ?? []) {
      if ((e.tipo !== "vantagem" && e.tipo !== "desvantagem") || e.alvo !== "ataque") continue;
      if (e.tipo === "vantagem") vantagem = true;
      else desvantagem = true;
      motivos.push(`${c.nome}: ${e.tipo}`);
      gasta(c, gastas);
    }
  }
  return { modo: juntarModos(vantagem, desvantagem), motivos, gastas };
}

// Salvaguarda de quem não tem ficha (criatura): falha automática, vantagem ou
// desvantagem pelas condições. `gastas`: as de uso único que valeram.
export function modoDaSalvaguarda(
  condicoes: CondicaoComMecanica[],
  atributo: string,
): { falha: string | null; modo: ModoRolagem; gastas: string[] } {
  const cabe = (alvo: string) => alvo === "salvaguarda" || alvo === `salv-${atributo}`;
  let vantagem = false;
  let desvantagem = false;
  const gastas: string[] = [];
  for (const c of condicoes) {
    for (const e of mecanicaDa(c)?.efeitos ?? []) {
      if (e.tipo === "falha_auto" && cabe(e.alvo)) {
        gasta(c, gastas);
        return { falha: c.nome, modo: "normal", gastas };
      }
      if ((e.tipo === "vantagem" || e.tipo === "desvantagem") && cabe(e.alvo)) {
        if (e.tipo === "vantagem") vantagem = true;
        else desvantagem = true;
        gasta(c, gastas);
      }
    }
  }
  return { falha: null, modo: juntarModos(vantagem, desvantagem), gastas };
}

// Acerto a 1,5 m em alvo indefeso (Inconsciente, Paralisado) é crítico.
export function viraCritico(condicoes: CondicaoComMecanica[], corpoACorpo: boolean): boolean {
  return corpoACorpo && condicoes.some((c) => mecanicaDa(c)?.criticoPerto);
}

// Resumo em linhas curtas: "Ataques contra: vantagem", "Sem reação", "1d6 Fogo no 1º ataque do turno".
export function linhasDaMecanica(m: MecanicaCondicao): string[] {
  const contra = { vantagem: "vantagem", desvantagem: "desvantagem", perto: "vantagem a 1,5 m" };
  const quando = GATILHOS_DANO.find((g) => g.slug === m.dano?.quando)?.nome.toLowerCase() ?? "";
  return [
    ...(m.efeitos.length > 0 ? [`${m.efeitos.length} ${m.efeitos.length === 1 ? "efeito" : "efeitos"} na ficha`] : []),
    ...(m.contra ? [`Ataques contra: ${contra[m.contra]}`] : []),
    ...(m.incapacita ? ["Sem ações"] : []),
    ...(m.semReacao && !m.incapacita ? ["Sem reação"] : []),
    ...(m.semConcentracao ? ["Sem concentração"] : []),
    ...(m.umaAcao ? ["Uma ação por turno"] : []),
    ...(m.criticoPerto ? ["Acerto a 1,5 m é crítico"] : []),
    ...(m.ppDeErroVolta ? ["PP de técnica que erra volta"] : []),
    ...(m.dano ? [`${m.dano.formula}${m.dano.tipo ? ` ${m.dano.tipo}` : ""}: ${quando}`] : []),
    ...(m.acoes ?? []).map(textoDaAcao),
  ];
}

// "Apagar (ação padrão): vira Queimadura".
export function textoDaAcao(a: AcaoDaCondicao): string {
  const custo = { padrao: "ação padrão", bonus: "ação bônus", power: "ação poderosa", livre: "livre" }[a.custo];
  const nomePericia = PERICIAS.find((p) => p.slug === a.teste?.pericia)?.nome ?? "";
  const faz =
    a.faz === "trocar" ? `vira ${a.condicao}` : a.faz === "teste" ? `${nomePericia} CD ${a.teste?.cd} tira` : "tira";
  return `${a.nome} (${custo}): ${faz}`;
}

// Efeitos de uma ação que valem em outro participante (vantagem no aliado,
// desvantagem no inimigo…) viram condições com o nome dela, uma por "Vale":
// - próxima rolagem: some ao valer, ou no início do próximo turno de quem usou;
// - próximo turno: até o fim do próximo turno do afetado;
// - sem "Vale": o que a ação dura (`rodadasDaAcao`), contado na vez de quem usou.
export function condicoesDosEfeitos(
  nome: string,
  efeitos: EfeitoHabilidade[],
  rodadasDaAcao: number,
): CondicaoAplicada[] {
  const grupos: { vale: ValeEfeito | undefined; efeitos: EfeitoHabilidade[] }[] = [];
  for (const e of efeitos) {
    let grupo = grupos.find((g) => g.vale === e.vale);
    if (!grupo) {
      grupo = { vale: e.vale, efeitos: [] };
      grupos.push(grupo);
    }
    const limpo = { ...e };
    delete limpo.quem;
    delete limpo.vale;
    grupo.efeitos.push(limpo);
  }
  const sufixo: Record<ValeEfeito, string> = { proxima: "próxima rolagem", turno: "próximo turno" };
  return grupos.map((g) => ({
    nome: grupos.length > 1 && g.vale ? `${nome} (${sufixo[g.vale]})` : nome,
    rodadas: g.vale === "proxima" ? 1 : g.vale === "turno" ? 2 : rodadasDaAcao,
    salvaguarda: null,
    mecanica: { efeitos: g.efeitos },
    ...(g.vale === "proxima" ? { uso: "proxima" as const } : {}),
    ...(g.vale === "turno" ? { ateOProximoTurno: true } : {}),
  }));
}
