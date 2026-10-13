// Pastas: habilidades e ações guardadas pra reaproveitar em qualquer ficha.
// Puro (cliente e servidor).

export type TipoModelo = "habilidade" | "acao";

export type ModeloView = {
  id: string;
  pasta: string;
  tipo: TipoModelo;
  nome: string;
  dados: Record<string, unknown>;
};

export type RecursoRef = { id: string; nome: string };

export const MAX_NOME_PASTA = 40;
export const MAX_MODELOS = 300;

// O que vai pra pasta: sem vínculo com item, arma ou habilidade da ficha de origem.
const CAMPOS: Record<TipoModelo, readonly string[]> = {
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
    "duracao",
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
  tipo: TipoModelo,
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
  tipo: TipoModelo,
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

// Pastas em ordem, com o que cada uma guarda do tipo pedido.
export function agruparPastas(
  modelos: ModeloView[],
  tipo: TipoModelo,
): { pasta: string; modelos: ModeloView[]; total: number }[] {
  const mapa = new Map<string, { pasta: string; modelos: ModeloView[]; total: number }>();
  for (const m of modelos) {
    const atual = mapa.get(m.pasta) ?? { pasta: m.pasta, modelos: [], total: 0 };
    atual.total += 1;
    if (m.tipo === tipo) atual.modelos.push(m);
    mapa.set(m.pasta, atual);
  }
  return [...mapa.values()].sort((a, b) => a.pasta.localeCompare(b.pasta, "pt-BR"));
}
