// Duração de técnica e habilidade, e em que o personagem está concentrando.
// Número + unidade (não texto) pra o combate poder contar os turnos depois.

export type UnidadeDuracao =
  | "instantanea"
  | "turno"
  | "minuto"
  | "hora"
  | "dia"
  | "encontro"
  | "pv_temp";

export type Duracao = { unidade: UnidadeDuracao; quantidade?: number; concentracao?: boolean };

// `nome` é o botão; `texto` é como aparece no card.
export const UNIDADES_DURACAO: {
  slug: UnidadeDuracao;
  nome: string;
  texto: string;
  comQuantidade: boolean;
}[] = [
  { slug: "instantanea", nome: "Instantânea", texto: "Instantânea", comQuantidade: false },
  { slug: "turno", nome: "Turnos", texto: "turno", comQuantidade: true },
  { slug: "minuto", nome: "Minutos", texto: "minuto", comQuantidade: true },
  { slug: "hora", nome: "Horas", texto: "hora", comQuantidade: true },
  { slug: "dia", nome: "Dias", texto: "dia", comQuantidade: true },
  { slug: "encontro", nome: "Encontro", texto: "Até o fim do encontro", comQuantidade: false },
  { slug: "pv_temp", nome: "PV temporário", texto: "Enquanto tiver PV temporário", comQuantidade: false },
];

const UNIDADES = new Map(UNIDADES_DURACAO.map((u) => [u.slug, u]));

// Nome antigo gravado no banco.
const APELIDOS: Record<string, UnidadeDuracao> = { rodada: "turno" };

// Aceita o que vem do banco ou do formulário; inválido vira null.
export function lerDuracao(raw: unknown): Duracao | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const slug = typeof obj.unidade === "string" ? APELIDOS[obj.unidade] ?? obj.unidade : "";
  const u = UNIDADES.get(slug as UnidadeDuracao);
  if (!u) return null;
  const d: Duracao = { unidade: u.slug };
  if (u.comQuantidade) d.quantidade = Math.min(9999, Math.max(1, Math.trunc(Number(obj.quantidade) || 1)));
  // Instantânea não segura concentração.
  if (obj.concentracao === true && u.slug !== "instantanea") d.concentracao = true;
  return d;
}

// "3 turnos · Concentração", "1 minuto", "Até o fim do encontro".
export function textoDuracao(d: Duracao | null): string | null {
  if (!d) return null;
  const u = UNIDADES.get(d.unidade)!;
  const n = d.quantidade ?? 1;
  const base = u.comQuantidade ? `${n} ${u.texto}${n === 1 ? "" : "s"}` : u.texto;
  return d.concentracao ? `${base} · Concentração` : base;
}

// Dura enquanto houver PV temporário: acaba quando ele zera.
export function acabaSemPvTemp(raw: unknown): boolean {
  return lerDuracao(raw)?.unidade === "pv_temp";
}

// Dura mais que o uso: dá pra efeito repetir ou ficar valendo.
export function duraAlemDoUso(raw: unknown): boolean {
  const d = lerDuracao(raw);
  return !!d && d.unidade !== "instantanea";
}

export function pedeConcentracao(raw: unknown): boolean {
  return lerDuracao(raw)?.concentracao === true;
}

// 1 rodada = 6 s: 1 minuto são 10 turnos.
const TURNOS_POR_MINUTO = 10;

// Turnos que a duração conta no Passar turno; null = não conta por turno.
export function turnosDaDuracao(d: Duracao | null): number | null {
  if (!d) return null;
  if (d.unidade === "turno") return d.quantidade ?? 1;
  if (d.unidade === "minuto") return (d.quantidade ?? 1) * TURNOS_POR_MINUTO;
  return null;
}

// "Falta 1 turno", "Faltam 3 turnos".
export function textoTurnosRestantes(n: number): string {
  return n === 1 ? "Falta 1 turno" : `Faltam ${n} turnos`;
}

// `turnos`: o que falta da técnica em concentração (habilidade conta na própria linha).
export type Concentracao = { tipo: "habilidade" | "acao"; id: string; nome: string; turnos?: number };

export function lerConcentracao(raw: unknown): Concentracao | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.tipo !== "habilidade" && obj.tipo !== "acao") return null;
  if (typeof obj.id !== "string" || !obj.id) return null;
  const turnos = Math.trunc(Number(obj.turnos));
  return {
    tipo: obj.tipo,
    id: obj.id,
    nome: typeof obj.nome === "string" ? obj.nome : "",
    ...(turnos > 0 ? { turnos } : {}),
  };
}

// Evento da ficha: começou (ou parou de) concentrar.
export const EVENTO_CONCENTRACAO = "rpgo:concentracao";

export function anunciarConcentracao(c: Concentracao | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Concentracao | null>(EVENTO_CONCENTRACAO, { detail: c }));
}

// ─── PV temporário ─────────────────────────────────────────
// Até quando dura o PV temporário que um efeito dá. "acabar": até o dano
// consumir; "combate": some quando o combate encerra; "turno": some quando a
// próxima vez de quem recebeu começa.
export type DuracaoPvTemp = "acabar" | "combate" | "turno";

export const DURACOES_PV_TEMP: { slug: DuracaoPvTemp; nome: string; texto: string }[] = [
  { slug: "acabar", nome: "Até acabar", texto: "até acabar" },
  { slug: "combate", nome: "Fim do combate", texto: "até o fim do combate" },
  { slug: "turno", nome: "Próximo turno", texto: "até o início do próximo turno" },
];

export function lerDuracaoPvTemp(raw: unknown): DuracaoPvTemp {
  return raw === "combate" || raw === "turno" ? raw : "acabar";
}

// Como fica no banco (Personagem.hpTempDuracao, InstanciaCombate.pvTempDuracao): "acabar" é null.
export function duracaoPvTempNoBanco(d: DuracaoPvTemp): string | null {
  return d === "acabar" ? null : d;
}
