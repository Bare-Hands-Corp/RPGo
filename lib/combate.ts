// Combate como o jogador vê: a iniciativa com todos os envolvidos, e de cada
// criatura só o que o narrador liberou. Puro (cliente e servidor).

import { lerCondicoesAplicadas, type CondicaoAplicada } from "./condicoes";

export type AcaoVista = {
  id: string;
  nome: string;
  // Bloco do statblock ("Ação Padrão", "Reações"…).
  categoria: string;
  descricao: string;
  // Linhas curtas: "Ataque +5", "Dano: 1d8 Cortante", "Alcance: 1,5 m".
  stats: string[];
};

export type ParticipanteVisto = {
  id: string;
  nome: string;
  foto: string | null;
  tipo: "personagem" | "criatura";
  // É o personagem desta ficha.
  voce: boolean;
  iniciativa: number;
  // null = o narrador não liberou (criatura) ou não se aplica.
  pv: { atual: number; max: number } | null;
  pp: { atual: number; max: number } | null;
  cr: number | null;
  // Prévia da ficha: as ações que a criatura já usou. null = fechada.
  acoes: AcaoVista[] | null;
  // Condições valendo nele. `sair` só vem pro próprio personagem: a
  // salvaguarda que ele pode repetir pra se livrar antes.
  condicoes: { id: string; nome: string; rodadas: number; sair: { atributo: string; cd: number } | null }[];
};

export type CombateVisto = {
  id: string;
  sessaoId: string;
  rodada: number;
  // Índice em `participantes` de quem está na vez.
  turno: number;
  participantes: ParticipanteVisto[];
  // O personagem desta ficha no combate; null = está só assistindo.
  voce: {
    instanciaId: string;
    naVez: boolean;
    gastas: AcoesGastas;
    // Ações com alvo que ele abriu e ainda têm rolagem pendente.
    resolucoes: ResolucaoVista[];
    // Salvaguardas que pediram dele.
    salvaguardas: SalvaguardaPedida[];
    // Testes de concentração que um dano pediu.
    concentracoes: ConcentracaoPedida[];
    // Acertos nele que esperam a decisão de reagir.
    reacoes: ReacaoPedida[];
  } | null;
};

// ─── Ações do turno ────────────────────────────────────────────────────────
// Uma de cada por turno (mais as extras de habilidade); voltam quando a vez do
// participante começa. Ação livre e movimento não contam.
export const TIPOS_ACAO_COMBATE = ["padrao", "bonus", "power", "react"] as const;
export type TipoAcaoCombate = (typeof TIPOS_ACAO_COMBATE)[number];

export const ACAO_COMBATE: Record<TipoAcaoCombate, { nome: string; cor: string }> = {
  padrao: { nome: "Padrão", cor: "var(--color-padrao)" },
  bonus: { nome: "Bônus", cor: "var(--color-bonus)" },
  power: { nome: "Poderosa", cor: "var(--color-power)" },
  react: { nome: "Reação", cor: "var(--color-react)" },
};

export type AcoesGastas = Partial<Record<TipoAcaoCombate, number>>;

export function ehAcaoDeCombate(tipo: string): tipo is TipoAcaoCombate {
  return (TIPOS_ACAO_COMBATE as readonly string[]).includes(tipo);
}

// Json do banco → contagem limpa.
export function lerAcoesGastas(raw: unknown): AcoesGastas {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: AcoesGastas = {};
  for (const tipo of TIPOS_ACAO_COMBATE) {
    const n = Math.trunc(Number(obj[tipo]) || 0);
    if (n > 0) out[tipo] = n;
  }
  return out;
}

// Quantas ações de cada tipo cabem num turno: uma, mais as extras.
export function maximoDeAcoes(
  extras: Partial<Record<TipoAcaoCombate, { valor: number }>> = {},
): Record<TipoAcaoCombate, number> {
  const max = {} as Record<TipoAcaoCombate, number>;
  for (const tipo of TIPOS_ACAO_COMBATE) max[tipo] = 1 + Math.max(0, extras[tipo]?.valor ?? 0);
  return max;
}

// Ordem do combate: a posição (`ordem`) manda. Ela nasce da iniciativa rolada
// (maior primeiro) e o narrador pode rearrumar arrastando.
export function ordenarParticipantes<T extends { iniciativa: number; ordem: number }>(participantes: T[]): T[] {
  return participantes.slice().sort((a, b) => a.ordem - b.ordem || b.iniciativa - a.iniciativa);
}

// O que o narrador pode mostrar de uma criatura.
export const CAMPOS_VISIVEIS = ["pvVisivel", "ppVisivel", "crVisivel", "fichaVisivel"] as const;
export type CampoVisivel = (typeof CAMPOS_VISIVEIS)[number];

// ─── Resolução de ação com alvo ────────────────────────────────────────────
// Ataque: um alvo, rolagem contra a CR; 20 natural (ou crítico) sempre acerta
// e 1 natural sempre erra. Salvaguarda: vários alvos, cada um testa contra a
// CD; o dano é rolado uma vez. Direto: dano sem teste.
export type ModoResolucao = "ataque" | "salvaguarda" | "direto";

export type ResultadoAlvo = "acerto" | "critico" | "erro" | "sucesso" | "falha";

export type AlvoResolucao = {
  instanciaId: string;
  nome: string;
  // Jogador alvo (rola a própria salvaguarda); null = criatura.
  personagemId: string | null;
  // null = ainda não se sabe (ataque por rolar, salvaguarda por responder).
  resultado: ResultadoAlvo | null;
  // O dano desta resolução já foi descontado dele.
  danoAplicado: boolean;
  // Teste de concentração que o dano pediu e o jogador ainda não fez.
  concentracao?: { nome: string; cd: number } | null;
  // As condições da ação já foram postas nele.
  condicaoAplicada?: boolean;
  // Janela de reação do jogador atingido. "pendente": ele ainda não decidiu e
  // o dano espera; "nenhuma": não reagiu (ou não tinha como); objeto: reagiu,
  // e `reducao` sai do dano. Ausente = a janela não foi aberta.
  reacao?: "pendente" | "nenhuma" | { nome: string; reducao: number } | null;
  // No ataque, o dano rolado pra este acerto (cada acerto tem a própria rolagem).
  danoRolado?: { valor: number; tipo: string }[] | null;
};

export type Resolucao = {
  id: string;
  // InstanciaCombate de quem usou a ação.
  atacanteId: string;
  atacanteNome: string;
  acaoId: string | null;
  nome: string;
  modo: ModoResolucao;
  // O que falta quem usou fazer: rolar o ataque, rolar o dano, ou nada.
  etapa: "ataque" | "dano" | "feito";
  salvaguarda: { atributo: string; cd: number; emSucesso: "nada" | "metade" } | null;
  temDano: boolean;
  // Dano rolado; null = ainda não.
  dano: { valor: number; tipo: string }[] | null;
  // Condições que a ação põe em quem ela pega (acerto, falha na salvaguarda).
  condicoes: CondicaoAplicada[];
  alvos: AlvoResolucao[];
  criadaEm: number;
};

const RESULTADOS: readonly string[] = ["acerto", "critico", "erro", "sucesso", "falha"];

// Json do banco → lista limpa.
export function lerResolucoes(raw: unknown): Resolucao[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x): Resolucao[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.atacanteId !== "string" || !Array.isArray(o.alvos)) return [];
    const salv = o.salvaguarda as Record<string, unknown> | null | undefined;
    return [
      {
        id: o.id,
        atacanteId: o.atacanteId,
        atacanteNome: String(o.atacanteNome ?? ""),
        acaoId: typeof o.acaoId === "string" ? o.acaoId : null,
        nome: String(o.nome ?? ""),
        modo: o.modo === "salvaguarda" || o.modo === "direto" ? o.modo : "ataque",
        etapa: o.etapa === "ataque" || o.etapa === "dano" ? o.etapa : "feito",
        salvaguarda: salv
          ? {
              atributo: String(salv.atributo ?? ""),
              cd: Number(salv.cd) || 0,
              emSucesso: salv.emSucesso === "metade" ? "metade" : "nada",
            }
          : null,
        temDano: o.temDano === true,
        dano: Array.isArray(o.dano)
          ? (o.dano as Record<string, unknown>[]).map((p) => ({
              valor: Math.max(0, Math.trunc(Number(p?.valor) || 0)),
              tipo: String(p?.tipo ?? ""),
            }))
          : null,
        condicoes: lerCondicoesAplicadas(o.condicoes),
        alvos: (o.alvos as Record<string, unknown>[]).map((a) => ({
          instanciaId: String(a?.instanciaId ?? ""),
          nome: String(a?.nome ?? ""),
          personagemId: typeof a?.personagemId === "string" ? a.personagemId : null,
          resultado: RESULTADOS.includes(a?.resultado as string) ? (a.resultado as ResultadoAlvo) : null,
          danoAplicado: a?.danoAplicado === true,
          condicaoAplicada: a?.condicaoAplicada === true,
          reacao:
            a?.reacao === "pendente" || a?.reacao === "nenhuma"
              ? a.reacao
              : a?.reacao && typeof a.reacao === "object"
                ? {
                    nome: String((a.reacao as Record<string, unknown>).nome ?? ""),
                    reducao: Math.max(0, Math.trunc(Number((a.reacao as Record<string, unknown>).reducao) || 0)),
                  }
                : null,
          danoRolado: Array.isArray(a?.danoRolado)
            ? (a.danoRolado as Record<string, unknown>[]).map((p) => ({
                valor: Math.max(0, Math.trunc(Number(p?.valor) || 0)),
                tipo: String(p?.tipo ?? ""),
              }))
            : null,
          concentracao:
            a?.concentracao && typeof a.concentracao === "object"
              ? {
                  nome: String((a.concentracao as Record<string, unknown>).nome ?? ""),
                  cd: Number((a.concentracao as Record<string, unknown>).cd) || 10,
                }
              : null,
        })),
        criadaEm: Number(o.criadaEm) || 0,
      },
    ];
  });
}

// Ainda tem o que fazer: rolagem de quem usou, salvaguarda por responder ou dano por descontar.
export function resolucaoAberta(r: Resolucao): boolean {
  if (r.etapa !== "feito") return true;
  return r.alvos.some(
    (a) =>
      a.resultado === null ||
      !!a.concentracao ||
      a.reacao === "pendente" ||
      (r.dano !== null && sofreDano(r, a) > 0 && !a.danoAplicado),
  );
}

// Quanto do dano rolado o alvo leva: 1 = tudo, 0.5 = metade, 0 = nada.
export function sofreDano(r: Resolucao, alvo: AlvoResolucao): number {
  if (r.modo === "direto") return 1;
  if (alvo.resultado === "acerto" || alvo.resultado === "critico" || alvo.resultado === "falha") return 1;
  if (alvo.resultado === "sucesso") return r.salvaguarda?.emSucesso === "metade" ? 0.5 : 0;
  return 0;
}

// Ataque contra CR: 20 natural ou crítico sempre acerta; 1 natural sempre erra.
export function resultadoDoAtaque(rolagem: { total: number; natural: number | null; critico: boolean }, cr: number): ResultadoAlvo {
  if (rolagem.natural === 1) return "erro";
  if (rolagem.critico || rolagem.natural === 20) return "critico";
  return rolagem.total >= cr ? "acerto" : "erro";
}

// Salvaguarda contra CD: 20 natural sempre passa e 1 natural sempre falha.
export function resultadoDaSalvaguarda(
  rolagem: { total: number; natural: number | null },
  cd: number,
): { resultado: "sucesso" | "falha"; critico: boolean } {
  if (rolagem.natural === 20) return { resultado: "sucesso", critico: true };
  if (rolagem.natural === 1) return { resultado: "falha", critico: true };
  return { resultado: rolagem.total >= cd ? "sucesso" : "falha", critico: false };
}

// "passou na salvaguarda (20 natural)".
export function textoDaSalvaguarda(s: { resultado: "sucesso" | "falha"; critico: boolean }): string {
  return TEXTO_RESULTADO[s.resultado] + (s.critico ? (s.resultado === "sucesso" ? " (20 natural)" : " (1 natural)") : "");
}

export const TEXTO_RESULTADO: Record<ResultadoAlvo, string> = {
  acerto: "acertou",
  critico: "acerto crítico",
  erro: "errou",
  sucesso: "passou na salvaguarda",
  falha: "falhou na salvaguarda",
};

// O que o jogador vê das resoluções: as que ele abriu e as salvaguardas que deve.
export type ResolucaoVista = {
  id: string;
  acaoId: string | null;
  nome: string;
  modo: ModoResolucao;
  etapa: Resolucao["etapa"];
  alvos: { nome: string; resultado: ResultadoAlvo | null; danoAplicado: boolean }[];
};

export type SalvaguardaPedida = {
  resolucaoId: string;
  de: string;
  nome: string;
  atributo: string;
  cd: number;
};

// Janela de reação: o personagem foi atingido e decide se reage antes do dano.
export type ReacaoPedida = { resolucaoId: string; de: string; nome: string };

// Teste de concentração que um dano do combate pediu.
export type ConcentracaoPedida = { resolucaoId: string; nome: string; cd: number };

// Danos a mais de uma ação (Acao.danosExtras): cada um com a própria fórmula e tipo.
export type DanoExtra = { formula: string; tipo: string };

export const MAX_DANOS_EXTRAS = 5;

export function lerDanosExtras(raw: unknown): DanoExtra[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((x): DanoExtra[] => {
      if (!x || typeof x !== "object") return [];
      const o = x as Record<string, unknown>;
      const formula = String(o.formula ?? "").trim().slice(0, 80);
      return formula ? [{ formula, tipo: String(o.tipo ?? "").trim().slice(0, 40) }] : [];
    })
    .slice(0, MAX_DANOS_EXTRAS);
}
