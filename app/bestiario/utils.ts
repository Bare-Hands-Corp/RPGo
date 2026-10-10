import type { Criatura, Encontro, Esquadrao, Linhagem, TraitInstance, TraitTemplate } from "@prisma/client";
import type {
  AtributoSalvaguarda,
  CaracteristicasPayload,
  ComponenteCategoria,
  ComponentePayload,
  CriaturaPayload,
  CriaturaSerializada,
  EfeitoAcao,
  RecargaAcao,
  EncontroPayload,
  EncontroSerializado,
  EsquadraoPayload,
  EsquadraoSerializado,
  FormaArea,
  ItemComposicao,
  ResistenciasPayload,
  TemplateFormula,
  TemplatePayload,
  TemplateSerializado,
} from "./types";

// ND pode ser fracionário ("1/8", "1/4", "1/2") — converte pro float usado em
// filtro/ordenação (Criatura.ndValor). Aceita inteiro ou fração simples "N/M".
export function ndParaValor(nd: string): number {
  const texto = nd.trim();
  const fracao = texto.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fracao) {
    const numerador = Number(fracao[1]);
    const denominador = Number(fracao[2]);
    return denominador > 0 ? numerador / denominador : 0;
  }
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

function caracteristicasVazias(): CaracteristicasPayload {
  return { pericias: [], salvaguardas: [], percepcaoPassiva: null, sentidosExtras: "" };
}

function resistenciasVazias(): ResistenciasPayload {
  return { danoResistencia: [], danoImunidade: [], danoVulneravel: [], condicaoImunidade: [] };
}

export function criarComponenteVazio(categoria: ComponenteCategoria, ordem: number): ComponentePayload {
  return {
    id: crypto.randomUUID(),
    nome: "",
    categoria,
    ordem,
    descricao: "",
    efeitos: [],
    usos: null,
    recarga: null,
    alcance: "",
    custo: "",
  };
}

function comoRecarga(valor: unknown): RecargaAcao | null {
  if (!valor || typeof valor !== "object") return null;
  const objeto = valor as Record<string, unknown>;
  if (objeto.tipo === "dado") return { tipo: "dado", minimo: Number(objeto.minimo ?? 5) };
  if (objeto.tipo === "manual") return { tipo: "manual" };
  if (objeto.tipo === "combate") return { tipo: "combate" };
  return null;
}

export function draftDeCriatura(c: CriaturaSerializada): CriaturaPayload {
  const { id: _id, criadoEm: _criadoEm, atualizadoEm: _atualizadoEm, ...payload } = c;
  return payload;
}

export function criarCriaturaVazia(): CriaturaPayload {
  return {
    nome: "",
    categoria: "",
    tamanho: "medio",
    imagemUrl: null,
    tags: [],
    personalidade: null,
    linhagem: "",
    ordemTier: null,
    nd: "1",
    ndValor: 1,
    xp: 0,
    pontosPoder: 0,
    classeResistencia: 10,
    pvFormula: "",
    pvMedio: 0,
    bonusProficiencia: 2,
    classeDificuldade: 10,
    deslocamento: 9,
    deslocamentoNado: null,
    deslocamentoVoo: null,
    forca: 10,
    destreza: 10,
    constituicao: 10,
    sabedoria: 10,
    presenca: 10,
    vontade: 10,
    caracteristicas: caracteristicasVazias(),
    resistencias: resistenciasVazias(),
    anotacoesPrivadas: "",
    loot: "",
    componentes: [],
  };
}

function comoCaracteristicas(valor: unknown): CaracteristicasPayload {
  if (!valor || typeof valor !== "object") return caracteristicasVazias();
  const objeto = valor as Record<string, unknown>;
  return {
    pericias: Array.isArray(objeto.pericias)
      ? (objeto.pericias as Record<string, unknown>[]).map((p) => ({
          id: String(p.id ?? crypto.randomUUID()),
          nome: String(p.nome ?? ""),
          bonus: Number(p.bonus ?? 0),
        }))
      : [],
    salvaguardas: Array.isArray(objeto.salvaguardas)
      ? (objeto.salvaguardas as Record<string, unknown>[]).map((s) => ({
          id: String(s.id ?? crypto.randomUUID()),
          nome: String(s.nome ?? ""),
          bonus: Number(s.bonus ?? 0),
        }))
      : [],
    percepcaoPassiva:
      objeto.percepcaoPassiva === null || objeto.percepcaoPassiva === undefined
        ? null
        : Number(objeto.percepcaoPassiva),
    sentidosExtras: String(objeto.sentidosExtras ?? ""),
  };
}

function comoResistencias(valor: unknown): ResistenciasPayload {
  if (!valor || typeof valor !== "object") return resistenciasVazias();
  const objeto = valor as Record<string, unknown>;
  const lista = (chave: string) => (Array.isArray(objeto[chave]) ? (objeto[chave] as string[]) : []);
  return {
    danoResistencia: lista("danoResistencia"),
    danoImunidade: lista("danoImunidade"),
    danoVulneravel: lista("danoVulneravel"),
    condicaoImunidade: lista("condicaoImunidade"),
  };
}

function comoEfeito(e: Record<string, unknown>): EfeitoAcao | null {
  const id = String(e.id ?? crypto.randomUUID());
  switch (e.tipo) {
    case "ataque":
      return { id, tipo: "ataque", bonus: String(e.bonus ?? "") };
    case "salvaguarda":
      return {
        id,
        tipo: "salvaguarda",
        atributo: (e.atributo as AtributoSalvaguarda) ?? "destreza",
        cd: Number(e.cd ?? 10),
      };
    case "dano":
      return { id, tipo: "dano", formula: String(e.formula ?? ""), tipos: Array.isArray(e.tipos) ? (e.tipos as string[]) : [] };
    case "area":
      return { id, tipo: "area", forma: (e.forma as FormaArea) ?? "nenhuma", tamanho: String(e.tamanho ?? "") };
    case "movimento":
      return {
        id,
        tipo: "movimento",
        tipoMov: String(e.tipoMov ?? "caminhar"),
        valor: Number(e.valor ?? 0),
        duracao: String(e.duracao ?? ""),
      };
    case "bonus_numerico":
      return { id, tipo: "bonus_numerico", alvo: String(e.alvo ?? ""), valor: Number(e.valor ?? 0), duracao: String(e.duracao ?? "") };
    case "cura":
      return { id, tipo: "cura", formula: String(e.formula ?? "") };
    case "condicao":
      return {
        id,
        tipo: "condicao",
        condicaoId: String(e.condicaoId ?? ""),
        nome: String(e.nome ?? ""),
        descricao: String(e.descricao ?? ""),
        cor: String(e.cor ?? ""),
        duracaoTurnos: e.duracaoTurnos === null || e.duracaoTurnos === undefined ? null : Number(e.duracaoTurnos),
      };
    case "livre":
      return { id, tipo: "livre", texto: String(e.texto ?? "") };
    default:
      return null;
  }
}

function comoEfeitos(valor: unknown): EfeitoAcao[] {
  if (!Array.isArray(valor)) return [];
  return (valor as Record<string, unknown>[])
    .map((e) => comoEfeito(e))
    .filter((e): e is EfeitoAcao => e !== null);
}

// Converte o formato antigo (campos fixos: modoResolucao/bonusAtaque/cd/
// danos/area/condicoesImpostas) pra lista de efeitos, só na leitura — dados
// salvos antes dessa mudança continuam abrindo certo, sem precisar de
// migração no banco (parametrosResolvidos já era JSON solto).
function efeitosLegadoComponente(parametros: Record<string, unknown>): EfeitoAcao[] {
  const efeitos: EfeitoAcao[] = [];
  const modoResolucao =
    (parametros.modoResolucao as string) ?? (typeof parametros.acerto === "string" && parametros.acerto ? "ataque" : "nenhum");

  if (modoResolucao === "ataque") {
    const bonus = String(parametros.bonusAtaque ?? parametros.acerto ?? "");
    if (bonus) efeitos.push({ id: crypto.randomUUID(), tipo: "ataque", bonus });
  } else if (modoResolucao === "salvaguarda") {
    const cd = parametros.cd;
    efeitos.push({
      id: crypto.randomUUID(),
      tipo: "salvaguarda",
      atributo: (parametros.salvaguardaAtributo as AtributoSalvaguarda) ?? "destreza",
      cd: cd === null || cd === undefined ? 10 : Number(cd),
    });
  }

  const danosSalvos = Array.isArray(parametros.danos) ? (parametros.danos as Record<string, unknown>[]) : null;
  if (danosSalvos) {
    for (const d of danosSalvos) {
      efeitos.push({ id: crypto.randomUUID(), tipo: "dano", formula: String(d.formula ?? ""), tipos: Array.isArray(d.tipos) ? (d.tipos as string[]) : [] });
    }
  } else if (typeof parametros.dano === "string" && parametros.dano) {
    efeitos.push({ id: crypto.randomUUID(), tipo: "dano", formula: parametros.dano, tipos: [] });
  }

  const area = (parametros.area ?? {}) as Record<string, unknown>;
  if (area.forma && area.forma !== "nenhuma") {
    efeitos.push({ id: crypto.randomUUID(), tipo: "area", forma: area.forma as FormaArea, tamanho: String(area.tamanho ?? "") });
  }

  const condicoes = Array.isArray(parametros.condicoesImpostas) ? (parametros.condicoesImpostas as Record<string, unknown>[]) : [];
  for (const c of condicoes) {
    efeitos.push({
      id: crypto.randomUUID(),
      tipo: "condicao",
      condicaoId: String(c.condicaoId ?? ""),
      nome: String(c.nome ?? ""),
      descricao: String(c.descricao ?? ""),
      cor: String(c.cor ?? ""),
      duracaoTurnos: c.duracaoTurnos === null || c.duracaoTurnos === undefined ? null : Number(c.duracaoTurnos),
    });
  }

  return efeitos;
}

function componenteDeInstance(instancia: TraitInstance): ComponentePayload {
  const parametros = (instancia.parametrosResolvidos ?? {}) as Record<string, unknown>;
  const efeitos = Array.isArray(parametros.efeitos) ? comoEfeitos(parametros.efeitos) : efeitosLegadoComponente(parametros);

  return {
    id: instancia.id,
    nome: instancia.nome,
    categoria: instancia.categoria as ComponenteCategoria,
    ordem: instancia.ordem,
    descricao: instancia.textoRenderizado,
    efeitos,
    usos: parametros.usos === null || parametros.usos === undefined ? null : Number(parametros.usos),
    recarga: comoRecarga(parametros.recarga),
    alcance: String(parametros.alcance ?? ""),
    custo: String(parametros.custo ?? ""),
  };
}

export function serializarCriatura(
  criatura: Criatura & { componentes: TraitInstance[]; linhagem?: Linhagem | null },
): CriaturaSerializada {
  return {
    id: criatura.id,
    nome: criatura.nome,
    categoria: criatura.categoria,
    tamanho: criatura.tamanho,
    imagemUrl: criatura.imagemUrl,
    tags: criatura.tags,
    personalidade: criatura.personalidade,
    linhagem: criatura.linhagem?.nome ?? "",
    ordemTier: criatura.ordemTier,
    nd: criatura.nd,
    ndValor: criatura.ndValor,
    xp: criatura.xp,
    pontosPoder: criatura.pontosPoder,
    classeResistencia: criatura.classeResistencia,
    pvFormula: criatura.pvFormula,
    pvMedio: criatura.pvMedio,
    bonusProficiencia: criatura.bonusProficiencia,
    classeDificuldade: criatura.classeDificuldade,
    deslocamento: criatura.deslocamento,
    deslocamentoNado: criatura.deslocamentoNado,
    deslocamentoVoo: criatura.deslocamentoVoo,
    forca: criatura.forca,
    destreza: criatura.destreza,
    constituicao: criatura.constituicao,
    sabedoria: criatura.sabedoria,
    presenca: criatura.presenca,
    vontade: criatura.vontade,
    caracteristicas: comoCaracteristicas(criatura.caracteristicas),
    resistencias: comoResistencias(criatura.resistencias),
    anotacoesPrivadas: criatura.anotacoesPrivadas ?? "",
    loot: criatura.loot ?? "",
    componentes: criatura.componentes
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map(componenteDeInstance),
    criadoEm: criatura.criadoEm.toISOString(),
    atualizadoEm: criatura.atualizadoEm.toISOString(),
  };
}

// ─── Biblioteca de traits ─────────────────────────────────────────────────

function formulaVazia(): TemplateFormula {
  return { efeitos: [], usos: null, recarga: null, cor: "", alcance: "", custo: "" };
}

export function criarTemplateVazio(): TemplatePayload {
  return {
    nome: "",
    categoria: "aspecto",
    textoTemplate: "",
    formula: formulaVazia(),
    tagsProve: [],
    tagsConsome: [],
    tagsReageA: [],
  };
}

// Mesma ideia da compat de componente, adaptada pro shape antigo de template
// (bonusAtaque/cd eram "derivações" fixo|padrão — "padrão" não tem como
// resolver sem uma criatura, então vira um efeito vazio que o narrador
// preenche à mão uma vez, na próxima edição).
function efeitosLegadoTemplate(f: Record<string, unknown>): EfeitoAcao[] {
  const efeitos: EfeitoAcao[] = [];
  const modoResolucao = f.modoResolucao as string;

  if (modoResolucao === "ataque") {
    const ba = (f.bonusAtaque ?? {}) as Record<string, unknown>;
    efeitos.push({ id: crypto.randomUUID(), tipo: "ataque", bonus: ba.modo === "fixo" ? String(ba.valor ?? "") : "" });
  } else if (modoResolucao === "salvaguarda") {
    const cdObj = (f.cd ?? {}) as Record<string, unknown>;
    efeitos.push({
      id: crypto.randomUUID(),
      tipo: "salvaguarda",
      atributo: (f.salvaguardaAtributo as AtributoSalvaguarda) ?? "destreza",
      cd: cdObj.modo === "fixo" ? Number(cdObj.valor ?? 10) : 10,
    });
  }

  const danosSalvos = Array.isArray(f.danos) ? (f.danos as Record<string, unknown>[]) : [];
  for (const d of danosSalvos) {
    efeitos.push({ id: crypto.randomUUID(), tipo: "dano", formula: String(d.formula ?? ""), tipos: Array.isArray(d.tipos) ? (d.tipos as string[]) : [] });
  }

  const area = (f.area ?? {}) as Record<string, unknown>;
  if (area.forma && area.forma !== "nenhuma") {
    efeitos.push({ id: crypto.randomUUID(), tipo: "area", forma: area.forma as FormaArea, tamanho: String(area.tamanho ?? "") });
  }

  const condicoes = Array.isArray(f.condicoesImpostas) ? (f.condicoesImpostas as Record<string, unknown>[]) : [];
  for (const c of condicoes) {
    efeitos.push({
      id: crypto.randomUUID(),
      tipo: "condicao",
      condicaoId: String(c.condicaoId ?? ""),
      nome: String(c.nome ?? ""),
      descricao: String(c.descricao ?? ""),
      cor: String(c.cor ?? ""),
      duracaoTurnos: c.duracaoTurnos === null || c.duracaoTurnos === undefined ? null : Number(c.duracaoTurnos),
    });
  }

  return efeitos;
}

export function serializarTemplate(template: TraitTemplate): TemplateSerializado {
  const f = (template.formulaParametros ?? {}) as Record<string, unknown>;

  return {
    id: template.id,
    nome: template.nome,
    categoria: template.categoria as ComponenteCategoria,
    textoTemplate: template.textoTemplate,
    formula: {
      efeitos: Array.isArray(f.efeitos) ? comoEfeitos(f.efeitos) : efeitosLegadoTemplate(f),
      usos: f.usos === null || f.usos === undefined ? null : Number(f.usos),
      recarga: comoRecarga(f.recarga),
      cor: String(f.cor ?? ""),
      alcance: String(f.alcance ?? ""),
      custo: String(f.custo ?? ""),
    },
    tagsProve: template.tagsProve,
    tagsConsome: template.tagsConsome,
    tagsReageA: template.tagsReageA,
    criadoEm: template.criadoEm.toISOString(),
  };
}

// Aplica um template numa criatura — só copia os efeitos, literal (mesma
// filosofia de antes: o mestre ajusta os números pro ND dela na hora).
export function aplicarTemplate(template: TemplateSerializado, ordem: number): ComponentePayload {
  const f = template.formula;
  return {
    id: crypto.randomUUID(),
    nome: template.nome,
    categoria: template.categoria,
    ordem,
    descricao: template.textoTemplate,
    efeitos: f.efeitos.map((e) => ({ ...e, id: crypto.randomUUID() })),
    usos: f.usos,
    recarga: f.recarga,
    alcance: f.alcance,
    custo: f.custo,
  };
}

// ─── Esquadrões e Encontros ────────────────────────────────────────────────

function comoItens(valor: unknown): ItemComposicao[] {
  if (!Array.isArray(valor)) return [];
  return (valor as Record<string, unknown>[]).map((i) => ({
    criaturaId: String(i.criaturaId ?? ""),
    quantidade: Number(i.quantidade ?? 1),
  }));
}

export function criarEsquadraoVazio(): EsquadraoPayload {
  return { nome: "", itens: [] };
}

export function serializarEsquadrao(esquadrao: Esquadrao): EsquadraoSerializado {
  return {
    id: esquadrao.id,
    nome: esquadrao.nome,
    itens: comoItens(esquadrao.itens),
    criadoEm: esquadrao.criadoEm.toISOString(),
  };
}

export function criarEncontroVazio(): EncontroPayload {
  return { nome: "", tags: [], itens: [] };
}

export function serializarEncontro(encontro: Encontro): EncontroSerializado {
  return {
    id: encontro.id,
    nome: encontro.nome,
    tags: encontro.tags,
    itens: comoItens(encontro.itens),
    criadoEm: encontro.criadoEm.toISOString(),
  };
}
