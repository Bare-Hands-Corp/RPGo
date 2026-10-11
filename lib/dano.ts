// Dano recebido: imunidade → redução → resistência → vulnerabilidade → PV temporário → PV → PV negativos.
// Puro (cliente e servidor), com as defesas como dado — o combate reaproveita.

import type { EfeitoHabilidade, EfeitosAgregados } from "@/lib/op-rpg";

// Tipos de dano do livro (cap. 12).
export const TIPOS_DANO: { nome: string }[] = [
  { nome: "Contundente" },
  { nome: "Cortante" },
  { nome: "Perfurante" },
  { nome: "Fogo" },
  { nome: "Frio" },
  { nome: "Elétrico" },
  { nome: "Ácido" },
  { nome: "Veneno" },
  { nome: "Psíquico" },
  { nome: "Trovejante" },
  { nome: "Energia" },
  { nome: "Verdadeiro" },
];

// Abreviações do livro ("Cont./Cort./Perf.") e sinônimos comuns.
const SINONIMOS: Record<string, string> = {
  cont: "contundente",
  cort: "cortante",
  perf: "perfurante",
  eletricidade: "eletrico",
  gelo: "frio",
};

const PALAVRAS_SOLTAS = new Set([
  "dano",
  "danos",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "a",
  "ao",
  "o",
  "os",
  "as",
  "e",
  "tipo",
  "tipos",
  "incluindo",
  "inclusive",
]);

// Palavras que mostram que o texto depois do dado não é um tipo ("+ 2 pra acertar").
const NAO_E_TIPO = new Set([
  "pra",
  "para",
  "acertar",
  "acerto",
  "ataque",
  "com",
  "no",
  "na",
  "em",
  "por",
  "contra",
  "cada",
  "turno",
  "turnos",
  "rodada",
  "rodadas",
  "nivel",
  "grau",
  "vezes",
  "se",
  "quando",
  "maximo",
  "minimo",
  "extra",
  "bonus",
  "mais",
  "menos",
  "potencializacao",
  "ou",
]);

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function palavras(bruto: string): string[] {
  return semAcento(bruto)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Só as letras e números, sem acento, maiúscula, espaço nem palavra solta.
export function letrasDoTipo(bruto: string): string {
  return palavras(bruto)
    .filter((p) => !PALAVRAS_SOLTAS.has(p))
    .join("");
}

// Chave de comparação ("Dano de Fogo", "fogo", "FOGO " → "fogo"; "Cort." → "cortante").
export function chaveTipoDano(bruto: string): string {
  const t = letrasDoTipo(bruto);
  return SINONIMOS[t] ?? t;
}

function mesmaChave(ka: string, kb: string): boolean {
  if (!ka || !kb) return false;
  return ka === kb || ka + "s" === kb || ka === kb + "s";
}

// Mesmo tipo pelas letras, com ou sem o "s" do plural.
export function mesmoTipo(a: string, b: string): boolean {
  return mesmaChave(chaveTipoDano(a), chaveTipoDano(b));
}

// Tipo como escrito, sem as palavras soltas ("Dano de Fogo" → "Fogo").
function grafiaDoTipo(bruto: string): string {
  return bruto
    .split(/\s+/)
    .map((p) => p.replace(/[^a-zA-Z0-9À-ÿ]/g, ""))
    .filter((p) => p && !PALAVRAS_SOLTAS.has(semAcento(p)))
    .join(" ");
}

// Pedaços de uma lista de tipos ("contundente, cortante e perfurante").
function pedacosDeTipos(texto: string): string[] {
  return texto
    .split(/[,;\/()]|\s(?:e|ou)\s/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

// Tipos que uma defesa cobre (chaves): lista, "todos" e "exceto".
export type Cobertura = { todos: boolean; tipos: string[]; exceto: string[] };

const TODOS = new Set(["todo", "todos", "tudo", "qualquer"]);
const EXCETO = /\b(?:exceto|menos|salvo)\b/i;

export function lerCobertura(texto: string): Cobertura {
  const [incluidos, excluidos = ""] = texto.split(EXCETO, 2);
  const chaves = (s: string) => pedacosDeTipos(s).map(chaveTipoDano).filter(Boolean);
  const cob: Cobertura = { todos: false, tipos: [], exceto: chaves(excluidos) };
  for (const k of chaves(incluidos)) {
    if (TODOS.has(k)) cob.todos = true;
    else if (!cob.tipos.includes(k)) cob.tipos.push(k);
  }
  return cob;
}

// Verdadeiro passa por resistência e imunidade, a não ser que a defesa o cite
// ("Defesa Suprema": exceto Verdadeiro; "Invencibilidade": incluindo Verdadeiro).
export function cobre(cob: Cobertura, tipoBruto: string, verdadeiroSoCitado = true): boolean {
  const tipo = chaveTipoDano(tipoBruto);
  const tem = (lista: string[]) => lista.some((k) => mesmaChave(k, tipo));
  if (tem(cob.exceto)) return false;
  if (tem(cob.tipos)) return true;
  return cob.todos && !(verdadeiroSoCitado && mesmaChave(tipo, "verdadeiro"));
}

// Junta listas de tipos sem repetir pelas letras; fica a primeira grafia.
export function juntarTipos(...listas: string[][]): string[] {
  const out: string[] = [];
  for (const bruto of listas.flat()) {
    const t = bruto.trim();
    if (t && chaveTipoDano(t) && !out.some((o) => mesmoTipo(o, t))) out.push(t);
  }
  return out;
}

// Tipos citados numa defesa, como escritos ("Todos, exceto Psíquico" → ["Psíquico"]).
export function tiposDaCobertura(texto: string): string[] {
  return juntarTipos(
    pedacosDeTipos(texto.replace(new RegExp(EXCETO.source, "gi"), ","))
      .map(grafiaDoTipo)
      .filter((t) => t && !TODOS.has(chaveTipoDano(t))),
  );
}

// Tipos escritos depois dos dados ("1d8 cortante + 1d6 fogo" → ["cortante", "fogo"]).
// Anotação entre parênteses fica de fora; "+ 2 pra acertar" não é tipo.
export function tiposDoDano(texto: string): string[] {
  const out: string[] = [];
  const semAnotacao = texto.replace(/\([^)]*\)/g, " ");
  for (const m of semAnotacao.matchAll(/\d+\s*[dD]\s*\d+(?:\s*[+-]\s*\d+)*\s+([^\d+\-,;]+)/g)) {
    const ps = m[1].trim().split(/\s+/);
    if (ps.length > 4 || ps.some((p) => NAO_E_TIPO.has(semAcento(p).replace(/[^a-z]/g, "")))) continue;
    const tipo = grafiaDoTipo(m[1]);
    if (tipo) out.push(tipo);
  }
  return juntarTipos(out);
}

// Tipos citados nos efeitos: dano extra, troca de dano e defesas.
export function tiposDosEfeitos(efeitos: EfeitoHabilidade[]): string[] {
  return juntarTipos(
    ...efeitos.map((e) => {
      if (e.tipo === "dano_extra") return tiposDoDano(e.formula);
      if (e.tipo === "trocar_dano") return [e.tipoDano];
      if (e.tipo === "resistencia" || e.tipo === "imunidade" || e.tipo === "vulnerabilidade") {
        return tiposDaCobertura(e.tipoDano);
      }
      if (e.tipo === "reducao_dano") return tiposDaCobertura(e.tipos ?? "");
      return [];
    }),
  );
}

// Lista salva de tipos digitados (Json do banco).
export function lerTiposSalvos(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return juntarTipos(
    raw.filter((t): t is string => typeof t === "string").map((t) => t.trim().slice(0, 40)),
  ).slice(0, MAX_TIPOS_SALVOS);
}

export const MAX_TIPOS_SALVOS = 30;

export type TipoDefesa = "imunidade" | "resistencia" | "vulnerabilidade" | "reducao";

// Defesa que pode valer num golpe. `id` é estável entre cliente e servidor.
export type DefesaDano = {
  id: string;
  tipo: TipoDefesa;
  // Tipos cobertos, como está no efeito ("contundente, cortante"); vazio = todos.
  cobre: string;
  fontes: string[];
  // Quanto a redução tira (0 nas outras).
  valor: number;
  quando?: string;
};

export function defesasDoAgregado(
  agg: Pick<EfeitosAgregados, "imunidades" | "resistencias" | "vulnerabilidades" | "reducoesDano">,
): DefesaDano[] {
  const out: DefesaDano[] = [];
  for (const [chave, d] of Object.entries(agg.imunidades)) {
    if (d) out.push({ id: `imu:${chave}`, tipo: "imunidade", cobre: chave, fontes: d.fontes, valor: 0 });
  }
  for (const [chave, d] of Object.entries(agg.resistencias)) {
    if (d) out.push({ id: `res:${chave}`, tipo: "resistencia", cobre: chave, fontes: d.fontes, valor: 0 });
  }
  for (const [chave, d] of Object.entries(agg.vulnerabilidades ?? {})) {
    if (d) out.push({ id: `vul:${chave}`, tipo: "vulnerabilidade", cobre: chave, fontes: d.fontes, valor: 0 });
  }
  for (const r of agg.reducoesDano) {
    out.push({
      id: `red:${r.fonte}:${r.valor}:${r.tipos}`,
      tipo: "reducao",
      cobre: r.tipos,
      fontes: [r.fonte],
      valor: r.valor,
      ...(r.quando ? { quando: r.quando } : {}),
    });
  }
  return out;
}

const TODAS: Cobertura = { todos: true, tipos: [], exceto: [] };

// Redução vale também no Verdadeiro (o livro só tira isso do Umidaiko).
export function defesaCobre(d: DefesaDano, tipo: string): boolean {
  const cob = d.cobre.trim() ? lerCobertura(d.cobre) : TODAS;
  return cobre(cob, tipo, d.tipo !== "reducao");
}

// Defesas com `quando` nascem desligadas.
export function defesasDesligadasDePadrao(defesas: DefesaDano[]): string[] {
  return defesas.filter((d) => d.quando).map((d) => d.id);
}

// Tipos citados nas defesas, como escritos.
export function tiposDasDefesas(defesas: DefesaDano[]): string[] {
  return juntarTipos(...defesas.map((d) => tiposDaCobertura(d.cobre)));
}

export type ParteDano = { valor: number; tipo: string };

export type PassoDano = { tipo: TipoDefesa; fontes: string[]; menos?: number; valor: number };

export type ParteResolvida = ParteDano & { final: number; passos: PassoDano[] };

export type ResultadoDano = {
  partes: ParteResolvida[];
  bruto: number;
  // Dano depois das defesas, antes do PV temporário.
  final: number;
  absorvido: number;
  hpTemp: { antes: number; depois: number };
  hpAtual: { antes: number; depois: number };
  // Dano sofrido a 0 PV (o golpe que derruba não conta, salvo se mata sozinho).
  pvNegativos: { antes: number; depois: number };
  caiu: boolean;
  // PV negativos chegaram ao PV máximo.
  morto: boolean;
  morreu: boolean;
};

// PV negativos que valem: só contam a 0 PV.
export function negativosAtuais(hpAtual: number, pvNegativos: number | null | undefined): number {
  return hpAtual > 0 ? 0 : Math.max(0, Math.trunc(Number(pvNegativos) || 0));
}

// PV como a ficha mostra: a 0 PV, os PV negativos aparecem com sinal.
export function pvComSinal(hpAtual: number, pvNegativos: number | null | undefined): number {
  return hpAtual > 0 ? hpAtual : 0 - negativosAtuais(hpAtual, pvNegativos);
}

// O caminho de volta: abaixo de 0 fica 0 PV e o resto vira PV negativo.
export function separarPv(valor: number): { hpAtual: number; pvNegativos: number } {
  const pv = Math.trunc(Number(valor) || 0);
  return { hpAtual: Math.max(0, pv), pvNegativos: Math.max(0, -pv) };
}

export function estaMorto(hpAtual: number, pvNegativos: number | null | undefined, hpMax: number): boolean {
  return hpAtual <= 0 && hpMax > 0 && negativosAtuais(hpAtual, pvNegativos) >= hpMax;
}

export function resolverDano(
  partes: ParteDano[],
  defesas: DefesaDano[],
  estado: { hpAtual: number; hpTemp: number; hpMax?: number; pvNegativos?: number | null },
  opcoes: { desligadas?: Iterable<string>; semTemp?: boolean } = {},
): ResultadoDano {
  const desligadas = new Set(opcoes.desligadas ?? []);
  const ativas = defesas.filter((d) => !desligadas.has(d.id));
  const res: ParteResolvida[] = partes.map((p) => {
    const valor = Math.max(0, Math.trunc(p.valor) || 0);
    return { valor, tipo: p.tipo.trim(), final: valor, passos: [] };
  });

  for (const p of res) {
    const imune = ativas.filter((d) => d.tipo === "imunidade" && defesaCobre(d, p.tipo));
    if (imune.length === 0 || p.final <= 0) continue;
    p.final = 0;
    p.passos.push({ tipo: "imunidade", fontes: imune.flatMap((d) => d.fontes), valor: 0 });
  }

  // Cada redução vale uma vez por golpe, nas partes que cobre, em ordem.
  for (const d of ativas) {
    if (d.tipo !== "reducao") continue;
    let resta = d.valor;
    for (const p of res) {
      if (resta <= 0) break;
      if (p.final <= 0 || !defesaCobre(d, p.tipo)) continue;
      const menos = Math.min(resta, p.final);
      p.final -= menos;
      resta -= menos;
      p.passos.push({ tipo: "reducao", fontes: d.fontes, menos, valor: p.final });
    }
  }

  // Resistência: metade, pra baixo, uma vez só mesmo com várias fontes.
  for (const p of res) {
    if (p.final <= 0) continue;
    const resist = ativas.filter((d) => d.tipo === "resistencia" && defesaCobre(d, p.tipo));
    if (resist.length === 0) continue;
    p.final = Math.floor(p.final / 2);
    p.passos.push({ tipo: "resistencia", fontes: resist.flatMap((d) => d.fontes), valor: p.final });
  }

  // Vulnerabilidade: dobro, uma vez só, depois da resistência.
  for (const p of res) {
    if (p.final <= 0) continue;
    const vul = ativas.filter((d) => d.tipo === "vulnerabilidade" && defesaCobre(d, p.tipo));
    if (vul.length === 0) continue;
    p.final *= 2;
    p.passos.push({ tipo: "vulnerabilidade", fontes: vul.flatMap((d) => d.fontes), valor: p.final });
  }

  const bruto = res.reduce((t, p) => t + p.valor, 0);
  const final = res.reduce((t, p) => t + p.final, 0);
  const hpTemp = Math.max(0, estado.hpTemp);
  const absorvido = opcoes.semTemp ? 0 : Math.min(hpTemp, final);
  const noPv = final - absorvido;
  const hpAtualDepois = Math.max(0, estado.hpAtual - noPv);
  const caiu = estado.hpAtual > 0 && hpAtualDepois === 0;

  const hpMax = Math.max(0, estado.hpMax ?? 0);
  const negativosAntes = negativosAtuais(estado.hpAtual, estado.pvNegativos);
  let negativosDepois = negativosAntes;
  if (caiu) {
    // Sobra do golpe que derruba: só conta se sozinha chega ao PV máximo.
    const excesso = noPv - estado.hpAtual;
    negativosDepois = hpMax > 0 && excesso >= hpMax ? excesso : 0;
  } else if (estado.hpAtual <= 0) {
    negativosDepois = negativosAntes + noPv;
  }
  const mortoAntes = estaMorto(estado.hpAtual, negativosAntes, hpMax);
  const morto = estaMorto(hpAtualDepois, negativosDepois, hpMax);

  return {
    partes: res,
    bruto,
    final,
    absorvido,
    hpTemp: { antes: hpTemp, depois: hpTemp - absorvido },
    hpAtual: { antes: estado.hpAtual, depois: hpAtualDepois },
    pvNegativos: { antes: negativosAntes, depois: negativosDepois },
    caiu,
    morto,
    morreu: morto && !mortoAntes,
  };
}

// CD do teste de concentração: max(10, metade do dano).
export function cdConcentracao(dano: number): number | null {
  return dano > 0 ? Math.max(10, Math.floor(dano / 2)) : null;
}

const ROTULO_PASSO: Record<TipoDefesa, string> = {
  imunidade: "imune",
  reducao: "redução",
  resistencia: "metade",
  vulnerabilidade: "dobro",
};

// "30 cortante → 12 (−5, metade)": as fontes ficam nos chips.
export function resumirParte(p: ParteResolvida): string {
  const inicio = `${p.valor}${p.tipo ? ` ${p.tipo.toLowerCase()}` : ""}`;
  if (p.passos.length === 0) return inicio;
  const passos = p.passos.map((s) => (s.tipo === "reducao" ? `−${s.menos}` : ROTULO_PASSO[s.tipo]));
  return `${inicio} → ${p.final} (${passos.join(", ")})`;
}

// "30 cortante → 25 (redução: Treino) → 12 (metade: Endurecimento)".
export function descreverParte(p: ParteResolvida): string {
  const inicio = `${p.valor}${p.tipo ? ` ${p.tipo.toLowerCase()}` : ""}`;
  return [
    inicio,
    ...p.passos.map((s) => {
      const fonte = s.fontes.length ? `: ${s.fontes.join(", ")}` : "";
      const menos = s.menos ? ` −${s.menos}` : "";
      return `${s.valor} (${ROTULO_PASSO[s.tipo]}${menos}${fonte})`;
    }),
  ].join(" → ");
}
