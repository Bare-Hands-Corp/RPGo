// Pastas: habilidades e ações guardadas pra reaproveitar em qualquer ficha.
// Puro (cliente e servidor).

export type TipoModelo = "habilidade" | "acao";

// O que se copia entre fichas: o modelo das pastas e o item (que só viaja por código).
export type TipoCopia = TipoModelo | "item";

export type ModeloView = {
  id: string;
  pasta: string;
  tipo: TipoModelo;
  nome: string;
  dados: Record<string, unknown>;
  // Personagem dono da pasta; null = vale em todas as fichas do usuário.
  personagemId: string | null;
};

export type RecursoRef = { id: string; nome: string };

export const MAX_NOME_PASTA = 40;
export const MAX_MODELOS = 300;

// O que vai pra pasta: sem vínculo com item, arma ou habilidade da ficha de origem.
const CAMPOS: Record<TipoCopia, readonly string[]> = {
  habilidade: [
    "nome",
    "origem",
    "tipo",
    "descricao",
    "custoPp",
    "custoPpFormula",
    "custoRecursoValor",
    "custoRecursoFormula",
    "usos",
    "usosFormula",
    "recarga",
    "tags",
    "tagsEstilo",
    "efeitos",
    "alternavel",
    "aliado",
    "duracao",
  ],
  acao: [
    "nome",
    "descricao",
    "tipo",
    "gatilho",
    "tag",
    "custoPp",
    "custoPpFormula",
    "custoRecursoValor",
    "custoRecursoFormula",
    "usos",
    "usosFormula",
    "recarga",
    "atributoAtaque",
    "bonusAcerto",
    "multiataque",
    "atributoSalv",
    "atributoCd",
    "dano",
    "tipoDano",
    "danosExtras",
    "salvSucesso",
    "alcance",
    "tecnica",
    "grau",
    "efeitos",
    "aliado",
    "alvo",
    "duracao",
  ],
  item: [
    "nome",
    "peso",
    "tipo",
    "quantidade",
    "tags",
    "tagsEstilo",
    "descricao",
    "dano",
    "modificador",
    "ca",
    "penalidadeDes",
    "categoria",
    "alcance",
    "alcanceMetros",
    "propriedades",
    "atributoAtaque",
    "proficienteArma",
    "armaFavorita",
    "danoBonus",
    "danoSomaAtributo",
    "danoSomaProficiencia",
    "efeitos",
  ],
};

// Recurso próprio viaja pelo nome, pra casar com o da ficha de destino.
const PREFIXO_NOME = "nome:";
const POOLS_FIXOS = new Set(["", "pp", "exaustao"]);

function chave(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export function mesmoNome(a: string, b: string): boolean {
  return chave(a) === chave(b);
}

// Nomes dos recursos próprios que o modelo cita (custo e efeitos).
export function recursosDoModelo(dados: Record<string, unknown>): string[] {
  const nomes: string[] = [];
  if (typeof dados.custoRecurso === "string" && dados.custoRecurso) nomes.push(dados.custoRecurso);
  for (const e of Array.isArray(dados.efeitos) ? dados.efeitos : []) {
    const ref = e && typeof e === "object" ? (e as Record<string, unknown>).recurso : null;
    if (typeof ref === "string" && ref.startsWith(PREFIXO_NOME)) nomes.push(ref.slice(PREFIXO_NOME.length));
  }
  return nomes;
}

export function nomeDePasta(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NOME_PASTA);
}

function trocarRecursos(efeitos: unknown, trocar: (id: string) => string): unknown[] {
  if (!Array.isArray(efeitos)) return [];
  return efeitos.map((e) => {
    if (!e || typeof e !== "object") return e;
    const obj = e as Record<string, unknown>;
    return typeof obj.recurso === "string" && !POOLS_FIXOS.has(obj.recurso)
      ? { ...obj, recurso: trocar(obj.recurso) }
      : obj;
  });
}

// Linha da ficha → dados do modelo.
export function paraModelo(
  tipo: TipoCopia,
  origem: Record<string, unknown>,
  recursos: RecursoRef[],
): Record<string, unknown> {
  const nomeDe = (id: string) => recursos.find((r) => r.id === id)?.nome;
  const dados: Record<string, unknown> = {};
  for (const campo of CAMPOS[tipo]) {
    if (origem[campo] !== undefined && origem[campo] !== null) dados[campo] = origem[campo];
  }
  dados.efeitos = trocarRecursos(origem.efeitos, (id) => {
    const nome = nomeDe(id);
    return nome ? PREFIXO_NOME + nome : id;
  });
  const custo = typeof origem.custoRecursoId === "string" ? nomeDe(origem.custoRecursoId) : undefined;
  if (custo) dados.custoRecurso = custo;
  else {
    delete dados.custoRecursoValor;
    delete dados.custoRecursoFormula;
  }
  return dados;
}

// Dados do modelo → input de criar na ficha de destino.
export function doModelo(
  tipo: TipoCopia,
  dados: Record<string, unknown>,
  recursos: RecursoRef[],
): Record<string, unknown> {
  const idDe = (nome: string) => recursos.find((r) => chave(r.nome) === chave(nome))?.id;
  const input: Record<string, unknown> = {};
  for (const campo of CAMPOS[tipo]) {
    if (dados[campo] !== undefined) input[campo] = dados[campo];
  }
  input.efeitos = trocarRecursos(dados.efeitos, (ref) =>
    ref.startsWith(PREFIXO_NOME) ? (idDe(ref.slice(PREFIXO_NOME.length)) ?? ref) : ref,
  );
  const custo = typeof dados.custoRecurso === "string" ? idDe(dados.custoRecurso) : undefined;
  input.custoRecursoId = custo ?? null;
  if (!custo) {
    input.custoRecursoValor = 0;
    input.custoRecursoFormula = null;
  }
  return input;
}

// `exclusiva`: a pasta é só de um personagem.
export type PastaGuardada = {
  pasta: string;
  modelos: ModeloView[];
  total: number;
  exclusiva: boolean;
};

// Pastas em ordem, com o que cada uma guarda do tipo pedido.
export function agruparPastas(modelos: ModeloView[], tipo: TipoModelo): PastaGuardada[] {
  const mapa = new Map<string, PastaGuardada>();
  for (const m of modelos) {
    const atual = mapa.get(m.pasta) ?? { pasta: m.pasta, modelos: [], total: 0, exclusiva: true };
    atual.total += 1;
    if (m.personagemId === null) atual.exclusiva = false;
    if (m.tipo === tipo) atual.modelos.push(m);
    mapa.set(m.pasta, atual);
  }
  return [...mapa.values()].sort((a, b) => a.pasta.localeCompare(b.pasta, "pt-BR"));
}
