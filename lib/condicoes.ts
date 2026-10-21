// Condições: o catálogo do narrador (pasta Condições da Biblioteca) e as que
// estão valendo num participante do combate. Puro (cliente e servidor).

import { EFEITO_COR_PADRAO, corValida, normalizarEfeitoCor, type EfeitoCor } from "./estilos-cor";

// Condições do livro (cap. 10.3); valem enquanto o narrador não cadastra as dele.
export const CONDICOES_DO_LIVRO = [
  "Agarrado",
  "Amedrontado",
  "Atordoado",
  "Caído",
  "Cego",
  "Envenenado",
  "Bêbado",
  "Doente",
  "Empoderado",
  "Enfeitiçado",
  "Enfraquecido",
  "Enfurecido",
  "Estremecido",
  "Impedido",
  "Incapacitado",
  "Inconsciente",
  "Invisível",
  "Letárgico",
  "Paralisado",
  "Queimado",
  "Sangramento",
  "Sonolento",
  "Sufocado",
  "Surdo",
];

// Cor fixa por nome, pra condição sem cor escolhida ter sempre a mesma.
const PALETA = ["#e05555", "#e0a555", "#d4c445", "#6fbf6f", "#4fb8c4", "#5a8fe0", "#a06fe0", "#e068b8"];

export function corDaCondicao(nome: string): string {
  let hash = 0;
  for (let i = 0; i < nome.length; i += 1) hash = (hash * 31 + nome.charCodeAt(i)) >>> 0;
  return PALETA[hash % PALETA.length];
}

export type CondicaoCatalogo = {
  nome: string;
  // O que ela faz (vira a dica do chip).
  descricao: string;
  cor: string;
  cor2: string | null;
  efeito: EfeitoCor;
  // Mecânica configurada na Biblioteca, crua (lib/condicoes-mecanica.ts);
  // "nenhuma" = só texto; null = a do livro.
  mecanica: unknown;
  // Duração e salvaguarda pra sair padrão, crus (lerPadroes); null = sem.
  padroes: unknown;
};

export const CATALOGO_CONDICOES_PADRAO: CondicaoCatalogo[] = CONDICOES_DO_LIVRO.map((nome) => ({
  nome,
  descricao: "",
  cor: corDaCondicao(nome),
  cor2: null,
  efeito: EFEITO_COR_PADRAO,
  mecanica: null,
  padroes: null,
}));

const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

export function mesmaCondicao(a: string, b: string): boolean {
  return semAcento(a) === semAcento(b);
}

// Condição cadastrada (nome, descrição e estilo cru do Json) → entrada do catálogo.
export function condicaoDoCatalogo(nome: string, descricao: string, estilo: Record<string, unknown> = {}): CondicaoCatalogo {
  return {
    nome: nome.trim(),
    descricao,
    cor: corValida(estilo.cor) ?? corDaCondicao(nome.trim()),
    cor2: corValida(estilo.cor2),
    efeito: normalizarEfeitoCor(estilo.efeito),
    mecanica: mecanicaCrua(estilo.mecanica) ?? null,
    padroes: estilo.padroes && typeof estilo.padroes === "object" ? estilo.padroes : null,
  };
}

// Mecânica crua que vale guardar: a configurada ou "nenhuma" (só texto).
function mecanicaCrua(raw: unknown): unknown {
  return raw === "nenhuma" || (raw && typeof raw === "object") ? raw : undefined;
}

// Catálogo a partir das cadastradas; nenhuma = as do livro.
export function lerCatalogoCondicoes(condicoes: CondicaoCatalogo[]): CondicaoCatalogo[] {
  const lista: CondicaoCatalogo[] = [];
  for (const c of condicoes) {
    if (c.nome && !lista.some((x) => mesmaCondicao(x.nome, c.nome))) lista.push(c);
  }
  return lista.length > 0 ? lista : CATALOGO_CONDICOES_PADRAO;
}

export function condicaoNoCatalogo(catalogo: CondicaoCatalogo[], nome: string): CondicaoCatalogo | undefined {
  return catalogo.find((c) => mesmaCondicao(c.nome, nome));
}

// ─── Duração ───────────────────────────────────────────────────────────────
// Em rodadas. Uma rodada acaba quando a vez de quem aplicou a condição volta
// ("até o início do próximo turno"); um minuto são 10 rodadas.
export const RODADAS_PADRAO = 1;
// Também "até tirar": não conta rodada.
export const RODADAS_MAX = 100;

export const DURACOES_CONDICAO: { rodadas: number; nome: string }[] = [
  { rodadas: 1, nome: "1 rodada" },
  { rodadas: 3, nome: "3 rodadas" },
  { rodadas: 10, nome: "1 minuto" },
  { rodadas: RODADAS_MAX, nome: "Até tirar" },
];

export function lerRodadas(raw: unknown): number {
  const n = Math.trunc(Number(raw) || 0);
  return n > 0 ? Math.min(RODADAS_MAX, n) : RODADAS_PADRAO;
}

export function textoRodadas(rodadas: number): string {
  if (rodadas >= RODADAS_MAX) return "até tirar";
  return rodadas === 10 ? "1 minuto" : rodadas === 1 ? "1 rodada" : `${rodadas} rodadas`;
}

// ─── Condição valendo num participante ─────────────────────────────────────
export type CondicaoAtiva = {
  id: string;
  nome: string;
  // Rodadas que faltam.
  rodadas: number;
  // Participante (InstanciaCombate.id) cuja vez marca o fim de cada rodada:
  // quem aplicou. Se ele sair do combate, passa a valer a vez do afetado.
  fonteId: string | null;
  // De onde veio ("Bola de Fogo de Zoro"); vazio = posta pelo narrador.
  origem: string;
  // Salvaguarda que o afetado pode repetir pra sair antes; null = não pode.
  salvaguarda: { atributo: string; cd: number } | null;
  // Dano que o afetado leva a cada turno dele enquanto durar (sangramento,
  // veneno): rolado e descontado sozinho quando a vez dele começa ou acaba.
  porTurno?: DanoPorTurno | null;
  // O que ela faz (lib/condicoes-mecanica.ts), copiado do catálogo quando foi
  // aplicada; cru, lido por `mecanicaDa`. Ausente = a do livro pelo nome;
  // "nenhuma" = não faz nada.
  mecanica?: unknown;
  // Turno ("rodada:turno") em que o dano de gatilho já caiu.
  disparou?: string;
  // Some na primeira rolagem em que vale (vantagem ou desvantagem de uma técnica).
  uso?: "proxima";
  // Some no fim do próximo turno do afetado; guarda o turno ("rodada:turno")
  // em que entrou, pra não acabar no fim do turno em que foi posta.
  fimDoTurno?: string;
};

export type DanoPorTurno = { formula: string; tipo: string; quando: "inicio" | "fim" };

export function lerDanoPorTurno(raw: unknown): DanoPorTurno | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const formula = String(o.formula ?? "").trim().slice(0, 40);
  if (!formula) return null;
  return { formula, tipo: String(o.tipo ?? "").trim().slice(0, 40), quando: o.quando === "inicio" ? "inicio" : "fim" };
}

// "2d8 Verdadeiro no fim de cada turno".
export function textoDanoPorTurno(d: DanoPorTurno): string {
  return `${d.formula}${d.tipo ? ` ${d.tipo}` : ""} no ${d.quando === "inicio" ? "início" : "fim"} de cada turno`;
}

// O que uma ação aplica em quem ela pega. `ateOProximoTurno`: só até o fim do
// próximo turno do afetado. `evita`: salvaguarda que o alvo rola pra não
// receber (fora a da própria ação). `usaPadroes`: a duração e a salvaguarda
// pra sair vêm dos padrões da condição na Biblioteca (os campos ficam de
// reserva). `cdDaFonte`: a CD de quem aplicou, pra salvaguarda "CD da fonte".
export type CondicaoAplicada = Pick<CondicaoAtiva, "nome" | "rodadas" | "salvaguarda" | "porTurno" | "mecanica" | "uso"> & {
  ateOProximoTurno?: boolean;
  evita?: { atributo: string; cd: number } | null;
  usaPadroes?: boolean;
  cdDaFonte?: number;
};

export const MAX_CONDICOES = 12;

// Json do banco (InstanciaCombate.condicoesAtivas) → lista limpa.
export function lerCondicoesAtivas(raw: unknown): CondicaoAtiva[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((x): CondicaoAtiva[] => {
      if (!x || typeof x !== "object") return [];
      const o = x as Record<string, unknown>;
      const nome = String(o.nome ?? "").trim();
      if (!nome) return [];
      const salv = o.salvaguarda as Record<string, unknown> | null | undefined;
      return [
        {
          id: typeof o.id === "string" && o.id ? o.id : nome,
          nome,
          // `duracaoRodadas` é o nome antigo do campo.
          rodadas: lerRodadas(o.rodadas ?? o.duracaoRodadas),
          fonteId: typeof o.fonteId === "string" ? o.fonteId : null,
          origem: String(o.origem ?? ""),
          salvaguarda:
            salv && typeof salv === "object" && Number(salv.cd) > 0
              ? { atributo: String(salv.atributo ?? ""), cd: Math.trunc(Number(salv.cd)) }
              : null,
          porTurno: lerDanoPorTurno(o.porTurno),
          ...(mecanicaCrua(o.mecanica) ? { mecanica: o.mecanica } : {}),
          ...(typeof o.disparou === "string" ? { disparou: o.disparou } : {}),
          ...(o.uso === "proxima" ? { uso: "proxima" as const } : {}),
          ...(typeof o.fimDoTurno === "string" ? { fimDoTurno: o.fimDoTurno } : {}),
        },
      ];
    })
    .slice(0, MAX_CONDICOES);
}

// Evento do Rolador: rolou com a vantagem ou desvantagem de uso único dessas
// condições (ids); a ficha tira elas.
export const EVENTO_GASTAR_CONDICAO = "rpgo:gastar-condicao";

// Só os nomes das condições valendo.
export function nomesDasCondicoes(raw: unknown): string[] {
  return lerCondicoesAtivas(raw).map((c) => c.nome);
}

export function lerCondicoesAplicadas(raw: unknown): CondicaoAplicada[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x): CondicaoAplicada[] => {
    const lida = lerCondicoesAtivas([x])[0];
    if (!lida) return [];
    const { nome, rodadas, salvaguarda, porTurno, mecanica, uso } = lida;
    const o = x as Record<string, unknown>;
    const evita = o.evita as Record<string, unknown> | null | undefined;
    return [
      {
        nome,
        rodadas,
        salvaguarda,
        porTurno,
        ...(mecanica ? { mecanica } : {}),
        ...(uso ? { uso } : {}),
        ...(o.ateOProximoTurno === true ? { ateOProximoTurno: true } : {}),
        ...(o.usaPadroes === true ? { usaPadroes: true } : {}),
        ...(Number(o.cdDaFonte) > 0 ? { cdDaFonte: Math.trunc(Number(o.cdDaFonte)) } : {}),
        ...(evita && typeof evita === "object" && evita.atributo && Number(evita.cd) > 0
          ? { evita: { atributo: String(evita.atributo), cd: Math.trunc(Number(evita.cd)) } }
          : {}),
      },
    ];
  });
}

// Fim do turno de quem está com elas: soltam as que duravam até o fim do
// próximo turno dele (`turno` = o que está acabando, "rodada:turno").
export function fimDoTurnoDoAfetado(
  condicoes: CondicaoAtiva[],
  turno: string,
): { condicoes: CondicaoAtiva[]; acabaram: string[] } {
  const acabaram = condicoes.filter((c) => c.fimDoTurno && c.fimDoTurno !== turno).map((c) => c.nome);
  return { condicoes: condicoes.filter((c) => !c.fimDoTurno || c.fimDoTurno === turno), acabaram };
}

// Passa uma rodada pra quem a vez de `daVezId` marca: tira uma de cada
// condição dele e solta as que acabaram. `presentes` = quem ainda está no combate.
export function passarRodada(
  condicoes: CondicaoAtiva[],
  afetadoId: string,
  daVezId: string,
  presentes: Set<string>,
): { condicoes: CondicaoAtiva[]; acabaram: string[] } {
  const acabaram: string[] = [];
  const restam: CondicaoAtiva[] = [];
  for (const c of condicoes) {
    const marca = c.fonteId && presentes.has(c.fonteId) ? c.fonteId : afetadoId;
    // "Até tirar" não conta rodada.
    if (marca !== daVezId || c.rodadas >= RODADAS_MAX) {
      restam.push(c);
      continue;
    }
    if (c.rodadas - 1 <= 0) acabaram.push(c.nome);
    else restam.push({ ...c, rodadas: c.rodadas - 1 });
  }
  return { condicoes: restam, acabaram };
}
