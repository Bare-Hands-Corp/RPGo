import type { Criatura, Encontro, Esquadrao, Linhagem, TraitInstance, TraitTemplate } from "@prisma/client";
import { EFEITO_COR_PADRAO, normalizarEfeitoCor } from "@/lib/estilos-cor";
import { ATRIBUTOS, extraNoDano, lerEfeitos, nomeDoEfeito, resumoEfeito, type EfeitoHabilidade } from "@/lib/op-rpg";
import { lerDanoPorTurno, textoDanoPorTurno } from "@/lib/condicoes";
import { lerGatilho } from "@/lib/combate";
import { lerMecanicaSalva, lerPadroes } from "@/lib/condicoes-mecanica";
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
  OrigemTemplate,
  RecursoCriatura,
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
    efeitosExtras: [],
    templateId: null,
    usos: null,
    recarga: null,
    alcance: "",
    custo: "",
    tecnica: false,
    grau: 0,
    custoLendario: 1,
    gatilho: "qualquer",
  };
}

// Grau de técnica: 1 a 7; 0 = sem grau.
function comoGrau(valor: unknown): number {
  const n = Math.trunc(Number(valor) || 0);
  return n >= 1 && n <= 7 ? n : 0;
}

function comoCustoLendario(valor: unknown): number {
  return Math.min(9, Math.max(1, Math.trunc(Number(valor) || 1)));
}

export function criarRecursoVazio(): RecursoCriatura {
  return { id: crypto.randomUUID(), nome: "", valorMax: 1, cor: "", cor2: "", efeito: EFEITO_COR_PADRAO };
}

// Os recursos moram dentro do Json `caracteristicas` da criatura.
function comoRecursos(valor: unknown): RecursoCriatura[] {
  if (!Array.isArray(valor)) return [];
  return (valor as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? crypto.randomUUID()),
    nome: String(r.nome ?? ""),
    valorMax: Math.max(0, Math.trunc(Number(r.valorMax) || 0)),
    cor: String(r.cor ?? ""),
    cor2: String(r.cor2 ?? ""),
    efeito: normalizarEfeitoCor(r.efeito),
  }));
}

function comoOrigem(valor: unknown): OrigemTemplate | null {
  if (!valor || typeof valor !== "object") return null;
  const objeto = valor as Record<string, unknown>;
  if (typeof objeto.criaturaId !== "string" || !objeto.criaturaId) return null;
  return { criaturaId: objeto.criaturaId, nome: String(objeto.nome ?? "") };
}

function comoRecarga(valor: unknown): RecargaAcao | null {
  if (!valor || typeof valor !== "object") return null;
  const objeto = valor as Record<string, unknown>;
  if (objeto.tipo === "dado") return { tipo: "dado", minimo: Number(objeto.minimo ?? 5) };
  if (objeto.tipo === "manual") return { tipo: "manual" };
  if (objeto.tipo === "turno") return { tipo: "turno" };
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
    recursos: [],
    acoesLendarias: 0,
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

export function comoResistencias(valor: unknown): ResistenciasPayload {
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
        ...(e.metade === true ? { metade: true } : {}),
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
        cor2: String(e.cor2 ?? ""),
        efeito: normalizarEfeitoCor(e.efeito),
        duracaoTurnos: e.duracaoTurnos === null || e.duracaoTurnos === undefined ? null : Number(e.duracaoTurnos),
        danoPorTurno: lerDanoPorTurno(e.danoPorTurno),
        evita: lerEvita(e.evita),
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
    efeitosExtras: lerEfeitos(parametros.efeitosExtras),
    templateId: instancia.traitTemplateId,
    usos: parametros.usos === null || parametros.usos === undefined ? null : Number(parametros.usos),
    recarga: comoRecarga(parametros.recarga),
    alcance: String(parametros.alcance ?? ""),
    custo: String(parametros.custo ?? ""),
    tecnica: parametros.tecnica === true,
    grau: parametros.tecnica === true ? comoGrau(parametros.grau) : 0,
    custoLendario: comoCustoLendario(parametros.custoLendario),
    gatilho: lerGatilho(parametros.gatilho),
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
    recursos: comoRecursos((criatura.caracteristicas as Record<string, unknown> | null)?.recursos),
    acoesLendarias: Math.min(
      9,
      Math.max(0, Math.trunc(Number((criatura.caracteristicas as Record<string, unknown> | null)?.acoesLendarias) || 0)),
    ),
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
  return { efeitos: [], efeitosExtras: [], origem: null, usos: null, recarga: null, cor: "", cor2: "", efeito: EFEITO_COR_PADRAO, icone: "", alcance: "", custo: "", tecnica: false, grau: 0, custoLendario: 1, gatilho: "qualquer", mecanica: null, padroes: null };
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
      efeitosExtras: lerEfeitos(f.efeitosExtras),
      origem: comoOrigem(f.origem),
      usos: f.usos === null || f.usos === undefined ? null : Number(f.usos),
      recarga: comoRecarga(f.recarga),
      cor: String(f.cor ?? ""),
      cor2: String(f.cor2 ?? ""),
      efeito: normalizarEfeitoCor(f.efeito),
      icone: String(f.icone ?? ""),
      alcance: String(f.alcance ?? ""),
      custo: String(f.custo ?? ""),
      tecnica: f.tecnica === true,
      grau: f.tecnica === true ? comoGrau(f.grau) : 0,
      custoLendario: comoCustoLendario(f.custoLendario),
      gatilho: lerGatilho(f.gatilho),
      mecanica: template.categoria === "condicao" ? lerMecanicaSalva(f.mecanica) : null,
      padroes: template.categoria === "condicao" ? lerPadroes(f.padroes) : null,
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
    efeitosExtras: structuredClone(f.efeitosExtras),
    templateId: template.id,
    usos: f.usos,
    recarga: f.recarga,
    alcance: f.alcance,
    custo: f.custo,
    tecnica: f.tecnica,
    grau: f.grau,
    custoLendario: f.custoLendario,
    gatilho: f.gatilho,
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

// ─── Efeito em texto ──────────────────────────────────────────────────────

function textoDano(formula: string, tipos: string[]) {
  const f = formula.trim();
  const t = tipos.filter(Boolean).join(" ou ");
  if (!f) return t;
  return t ? `${f} ${t}` : f;
}

const FORMA_LABEL: Record<string, string> = {
  cone: "Cone",
  linha: "Linha",
  esfera: "Esfera",
  emanacao: "Emanação",
  cilindro: "Cilindro",
};

// Versão em texto de um efeito, pra onde não dá pra rolar: a ficha de leitura
// da biblioteca e a prévia que o jogador vê em combate. Condição não vira
// linha aqui — ela é destacada dentro da descrição.
export function textoEfeitoAcao(e: EfeitoAcao): string | null {
  switch (e.tipo) {
    case "ataque":
      return e.bonus.trim() ? `Ataque ${e.bonus.trim()}` : null;
    case "salvaguarda":
      return `CD ${e.cd} (${e.atributo})${e.metade ? " · metade se passar" : ""}`;
    case "dano": {
      const t = textoDano(e.formula, e.tipos);
      return t ? `Dano: ${t}` : null;
    }
    case "area":
      return e.forma !== "nenhuma" ? `Área: ${FORMA_LABEL[e.forma]}${e.tamanho ? ` (${e.tamanho})` : ""}` : null;
    case "movimento":
      return `Movimento: ${e.valor}m ${e.tipoMov}${e.duracao ? ` (${e.duracao})` : ""}`;
    case "bonus_numerico":
      return e.alvo.trim() ? `${e.alvo}: ${e.valor >= 0 ? "+" : ""}${e.valor}${e.duracao ? ` (${e.duracao})` : ""}` : null;
    case "cura":
      return e.formula.trim() ? `Recupera ${e.formula.trim()} PV` : null;
    case "condicao": {
      // A condição em si é destacada na descrição; aqui o dano que ela traz e a salvaguarda que evita.
      const partes = [
        e.danoPorTurno ? textoDanoPorTurno(e.danoPorTurno) : null,
        e.evita ? `evita com salvaguarda de ${nomeDoAtributo(e.evita.atributo)} CD ${e.evita.cd}` : null,
      ].filter(Boolean);
      return partes.length > 0 ? `${e.nome || "Condição"}: ${partes.join("; ")}` : null;
    }
    case "livre":
      return e.texto.trim() || null;
  }
}

// Efeito de ficha de jogador em texto ("Vantagem: Ataque"), pros mesmos lugares.
export function textoEfeitoExtra(e: EfeitoHabilidade, recursos: { id: string; nome: string }[] = []): string {
  const resumo = resumoEfeito(e, (id) => recursos.find((r) => r.id === id)?.nome);
  return resumo ? `${nomeDoEfeito(e)}: ${resumo}` : nomeDoEfeito(e);
}

// PP que a ação custa. O custo é texto ("2", "2 PP"); número solto é PP.
export function ppDoCusto(custo: string): number {
  const texto = custo.trim();
  if (/^\d+$/.test(texto)) return Number(texto);
  return Number(/(\d+)\s*PP/i.exec(texto)?.[1]) || 0;
}

// O que a ação tira ou devolve ao ser usada, pelos efeitos de recurso dela:
// PP a mais no custo e a variação de cada recurso próprio da criatura.
export function gastosDaAcao(
  acao: Pick<ComponentePayload, "custo" | "efeitosExtras">,
  recursos: RecursoCriatura[],
): { pp: number; recursos: { recurso: RecursoCriatura; delta: number }[] } {
  let pp = ppDoCusto(acao.custo);
  const porRecurso = new Map<string, number>();
  for (const e of acao.efeitosExtras) {
    if (e.tipo !== "recurso_delta" || !e.valor) continue;
    if (e.recurso === "pp") pp -= e.valor;
    else porRecurso.set(e.recurso, (porRecurso.get(e.recurso) ?? 0) + e.valor);
  }
  return {
    pp: Math.max(0, pp),
    recursos: recursos.flatMap((recurso) => {
      const delta = porRecurso.get(recurso.id);
      return delta ? [{ recurso, delta }] : [];
    }),
  };
}

// ─── Regras de combate lidas da ficha ─────────────────────────────────────
// As mecânicas abaixo saem dos "efeitos de ficha" (os mesmos do jogador) das
// ações e aspectos da criatura; o combate do narrador aplica.

// Chave das ações lendárias que restam, junto dos usos (InstanciaCombate.estadoRecargas).
export const CHAVE_LENDARIAS = "lendarias";

// "Técnica 4º grau" / "Técnica" (sem grau), como no card de ação do jogador.
export function textoTecnica(c: Pick<ComponentePayload, "tecnica" | "grau">): string {
  return c.tecnica ? `Técnica${c.grau > 0 ? ` ${c.grau}º grau` : ""}` : "";
}

type ComEfeitos = Pick<ComponentePayload, "id" | "nome" | "categoria" | "efeitos" | "efeitosExtras" | "usos">;

// O que uma reação da criatura faz na janela de reação (lib/reacoes.ts): os
// efeitos de ficha dela (bônus de CR, PV temporário, redução de dano) e o
// "Bônus Numérico" que aponta pra CR.
export function efeitosDeReacaoDaCriatura(c: Pick<ComponentePayload, "efeitos" | "efeitosExtras">): EfeitoHabilidade[] {
  const naCr = c.efeitos.flatMap((e): EfeitoHabilidade[] =>
    e.tipo === "bonus_numerico" && /^(cr|classe de resist)/i.test(e.alvo.trim()) && e.valor > 0
      ? [{ tipo: "modificador", alvo: "cr", valor: Math.trunc(e.valor) }]
      : [],
  );
  return [...c.efeitosExtras, ...naCr];
}

// Ataque comum: ação padrão com jogada de ataque (é o que o multiataque repete).
export function ehAtaqueComum(c: Pick<ComponentePayload, "categoria" | "efeitos">): boolean {
  return c.categoria === "acao" && c.efeitos.some((e) => e.tipo === "ataque" && e.bonus.trim() !== "");
}

// Ataques comuns por turno: o efeito "Multiataque" de qualquer ação ou aspecto dela.
export function ataquesPorTurno(componentes: Pick<ComponentePayload, "efeitosExtras">[]): number {
  let vezes = 1;
  for (const c of componentes) {
    for (const e of c.efeitosExtras) {
      if (e.tipo === "multi_ataque") vezes = Math.max(vezes, e.soma ? 1 + e.vezes : e.vezes);
    }
  }
  return Math.min(12, Math.max(1, Math.trunc(vezes) || 1));
}

// Componente que só existe pra dizer quantos ataques ela faz ("Ataques Múltiplos").
export function soMultiataque(c: Pick<ComponentePayload, "efeitos" | "efeitosExtras">): boolean {
  return c.efeitos.length === 0 && c.efeitosExtras.some((e) => e.tipo === "multi_ataque");
}

// A partir de que número no d20 o ataque é crítico: "Crítico Expandido" e
// "Margem de Crítico" da própria ação e dos aspectos da criatura.
export function margemDeCritico(componentes: ComEfeitos[], acao: ComEfeitos): number {
  const fontes = [...componentes.filter((c) => c.categoria === "aspecto" && c.id !== acao.id), acao];
  let margem = 20;
  let soma = 0;
  for (const c of fontes) {
    for (const e of c.efeitosExtras) {
      if (e.tipo === "crit_range") margem = Math.min(margem, e.minimo);
      else if (e.tipo === "margem_critico") soma += e.valor;
    }
  }
  return Math.min(20, Math.max(2, Math.trunc(margem - soma) || 20));
}

// "10d6 Fogo" → a fórmula e o tipo (vazio = o do golpe).
export function separarFormulaETipo(texto: string): { formula: string; tipo: string } {
  const formula: string[] = [];
  const tipo: string[] = [];
  for (const parte of texto.trim().split(/\s+/)) {
    if (/^[+\-]?(\d*d\d+|\d+)([+\-](\d*d\d+|\d+))*$/i.test(parte) || /^[+\-]$/.test(parte)) formula.push(parte);
    else if (parte.toLowerCase() !== "de" && parte.toLowerCase() !== "dano") tipo.push(parte);
  }
  return { formula: formula.join(""), tipo: tipo.join(" ") };
}

// Dano a mais que um acerto pode levar: o efeito "Dano Extra" dos aspectos e
// da própria ação. `sempre` soma sozinho; o resto o narrador escolhe na hora.
// `usos` do componente limita (com recarga "a cada turno", é o "uma vez por turno").
export type ExtraDeDano = {
  chave: string;
  componenteId: string;
  nome: string;
  formula: string;
  tipo: string;
  sempre: boolean;
  // Máximo de usos do componente; null = sem limite.
  usos: number | null;
};

export function extrasDeDano(componentes: ComEfeitos[], acao: ComEfeitos): ExtraDeDano[] {
  const fontes = [...componentes.filter((c) => c.categoria === "aspecto" && c.id !== acao.id), acao];
  return fontes.flatMap((c) =>
    c.efeitosExtras.flatMap((e, i): ExtraDeDano[] => {
      if (e.tipo !== "dano_extra" || !extraNoDano(e.em)) return [];
      const { formula, tipo } = separarFormulaETipo(e.formula);
      if (!formula) return [];
      return [
        {
          chave: `${c.id}:${i}`,
          componenteId: c.id,
          nome: c.nome || "Dano extra",
          formula,
          tipo,
          sempre: e.sempre === true,
          // Na própria ação, os usos são dela (já gastos ao usar), não do extra.
          usos: c.id === acao.id ? null : c.usos,
        },
      ];
    }),
  );
}

const ATRIBUTOS_SALV = new Set<string>(["forca", "destreza", "constituicao", "sabedoria", "presenca", "vontade"]);

// Salvaguarda que evita a condição; inválida ou sem CD = nenhuma.
function lerEvita(raw: unknown): { atributo: AtributoSalvaguarda; cd: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const cd = Math.min(40, Math.trunc(Number(o.cd) || 0));
  return ATRIBUTOS_SALV.has(String(o.atributo)) && cd > 0 ? { atributo: o.atributo as AtributoSalvaguarda, cd } : null;
}

function nomeDoAtributo(slug: string): string {
  return ATRIBUTOS.find((a) => a.slug === slug)?.nome ?? slug;
}
