import type { Criatura, Encontro, Esquadrao, TraitInstance, TraitTemplate } from "@prisma/client";
import { modificador, formatarMod } from "@/lib/op-rpg";
import type {
  AtributoSalvaguarda,
  CaracteristicasPayload,
  ComponenteCategoria,
  ComponentePayload,
  CriaturaPayload,
  CriaturaSerializada,
  DanoEntrada,
  DerivacaoNumero,
  DerivacaoTexto,
  EncontroPayload,
  EncontroSerializado,
  EsquadraoPayload,
  EsquadraoSerializado,
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

export function criarCriaturaVazia(): CriaturaPayload {
  return {
    nome: "",
    categoria: "",
    tamanho: "medio",
    imagemUrl: null,
    tags: [],
    personalidade: null,
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

function componenteDeInstance(instancia: TraitInstance): ComponentePayload {
  const parametros = (instancia.parametrosResolvidos ?? {}) as Record<string, unknown>;

  // Compat com fichas criadas antes do modo ataque/salvaguarda + tipos de dano
  // existir (formato anterior: { acerto, dano, alcance, custo } em texto livre).
  const danosSalvos = Array.isArray(parametros.danos) ? (parametros.danos as Record<string, unknown>[]) : null;
  const danos: DanoEntrada[] = danosSalvos
    ? danosSalvos.map((d) => ({
        id: String(d.id ?? crypto.randomUUID()),
        formula: String(d.formula ?? ""),
        tipos: Array.isArray(d.tipos) ? (d.tipos as string[]) : [],
      }))
    : typeof parametros.dano === "string" && parametros.dano
      ? [{ id: crypto.randomUUID(), formula: parametros.dano, tipos: [] }]
      : [];

  const modoResolucao = (parametros.modoResolucao as string) ?? (typeof parametros.acerto === "string" && parametros.acerto ? "ataque" : "nenhum");

  return {
    id: instancia.id,
    nome: instancia.nome,
    categoria: instancia.categoria as ComponenteCategoria,
    ordem: instancia.ordem,
    descricao: instancia.textoRenderizado,
    modoResolucao: modoResolucao as ComponentePayload["modoResolucao"],
    bonusAtaque: String(parametros.bonusAtaque ?? parametros.acerto ?? ""),
    salvaguardaAtributo: (parametros.salvaguardaAtributo as ComponentePayload["salvaguardaAtributo"]) ?? "destreza",
    cd: parametros.cd === null || parametros.cd === undefined ? null : Number(parametros.cd),
    danos,
    area: {
      forma: ((parametros.area as Record<string, unknown>)?.forma as ComponentePayload["area"]["forma"]) ?? "nenhuma",
      tamanho: String((parametros.area as Record<string, unknown>)?.tamanho ?? ""),
    },
    alcance: String(parametros.alcance ?? ""),
    custo: String(parametros.custo ?? ""),
  };
}

export function serializarCriatura(
  criatura: Criatura & { componentes: TraitInstance[] },
): CriaturaSerializada {
  return {
    id: criatura.id,
    nome: criatura.nome,
    categoria: criatura.categoria,
    tamanho: criatura.tamanho,
    imagemUrl: criatura.imagemUrl,
    tags: criatura.tags,
    personalidade: criatura.personalidade,
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
  return {
    modoResolucao: "nenhum",
    bonusAtaque: { modo: "fixo", valor: "" },
    salvaguardaAtributo: "destreza",
    cd: { modo: "fixo", valor: 10 },
    danos: [],
    area: { forma: "nenhuma", tamanho: "" },
    alcance: "",
    custo: "",
  };
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

function comoDerivacaoTexto(valor: unknown): DerivacaoTexto {
  const objeto = (valor ?? {}) as Record<string, unknown>;
  if (objeto.modo === "padrao") {
    return { modo: "padrao", atributo: (objeto.atributo as AtributoSalvaguarda) ?? "destreza" };
  }
  return { modo: "fixo", valor: String(objeto.valor ?? "") };
}

function comoDerivacaoNumero(valor: unknown): DerivacaoNumero {
  const objeto = (valor ?? {}) as Record<string, unknown>;
  if (objeto.modo === "padrao") {
    return { modo: "padrao", atributo: (objeto.atributo as AtributoSalvaguarda) ?? "destreza" };
  }
  return { modo: "fixo", valor: Number(objeto.valor ?? 10) };
}

export function serializarTemplate(template: TraitTemplate): TemplateSerializado {
  const f = (template.formulaParametros ?? {}) as Record<string, unknown>;
  const danosSalvos = Array.isArray(f.danos) ? (f.danos as Record<string, unknown>[]) : [];
  const area = (f.area ?? {}) as Record<string, unknown>;

  return {
    id: template.id,
    nome: template.nome,
    categoria: template.categoria as ComponenteCategoria,
    textoTemplate: template.textoTemplate,
    formula: {
      modoResolucao: (f.modoResolucao as TemplateFormula["modoResolucao"]) ?? "nenhum",
      bonusAtaque: comoDerivacaoTexto(f.bonusAtaque),
      salvaguardaAtributo: (f.salvaguardaAtributo as AtributoSalvaguarda) ?? "destreza",
      cd: comoDerivacaoNumero(f.cd),
      danos: danosSalvos.map((d) => ({
        id: crypto.randomUUID(),
        formula: String(d.formula ?? ""),
        tipos: Array.isArray(d.tipos) ? (d.tipos as string[]) : [],
      })),
      area: {
        forma: (area.forma as TemplateFormula["area"]["forma"]) ?? "nenhuma",
        tamanho: String(area.tamanho ?? ""),
      },
      alcance: String(f.alcance ?? ""),
      custo: String(f.custo ?? ""),
    },
    tagsProve: template.tagsProve,
    tagsConsome: template.tagsConsome,
    tagsReageA: template.tagsReageA,
    criadoEm: template.criadoEm.toISOString(),
  };
}

// Deriva um valor de texto (bônus de ataque) contra os atributos/proficiência
// da criatura-alvo. "padrao" = mesmo cálculo que o jogo usa em toda parte:
// bônus de proficiência + modificador do atributo (ver lib/op-rpg.ts).
function resolverDerivacaoTexto(d: DerivacaoTexto, criatura: CriaturaPayload): string {
  if (d.modo === "fixo") return d.valor;
  return formatarMod(criatura.bonusProficiencia + modificador(criatura[d.atributo]));
}

// CD padrão = 8 + bônus de proficiência + modificador do atributo.
function resolverDerivacaoNumero(d: DerivacaoNumero, criatura: CriaturaPayload): number {
  if (d.modo === "fixo") return d.valor;
  return 8 + criatura.bonusProficiencia + modificador(criatura[d.atributo]);
}

function interpolarTexto(texto: string, valores: { cd: number | null; bonusAtaque: string }): string {
  return texto
    .replaceAll("{cd}", valores.cd !== null ? String(valores.cd) : "{cd}")
    .replaceAll("{bonus_ataque}", valores.bonusAtaque || "{bonus_ataque}");
}

// Aplica um template numa criatura, calculando os números pro ND/atributos
// dela. O mestre pode editar tudo depois — isso só evita começar do zero.
export function aplicarTemplate(
  template: TemplateSerializado,
  criatura: CriaturaPayload,
  ordem: number,
): ComponentePayload {
  const f = template.formula;
  const bonusAtaque = f.modoResolucao === "ataque" ? resolverDerivacaoTexto(f.bonusAtaque, criatura) : "";
  const cd = f.modoResolucao === "salvaguarda" ? resolverDerivacaoNumero(f.cd, criatura) : null;

  return {
    id: crypto.randomUUID(),
    nome: template.nome,
    categoria: template.categoria,
    ordem,
    descricao: interpolarTexto(template.textoTemplate, { cd, bonusAtaque }),
    modoResolucao: f.modoResolucao,
    bonusAtaque,
    salvaguardaAtributo: f.salvaguardaAtributo,
    cd,
    danos: f.danos.map((d) => ({ ...d, id: crypto.randomUUID() })),
    area: { ...f.area },
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
