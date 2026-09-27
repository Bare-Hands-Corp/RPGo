// Retorno padrão das Server Actions: erro previsto volta como dado, não como throw.

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

// Erro com mensagem pro usuário; os outros viram mensagem genérica.
export class ErroDeUso extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeUso";
  }
}

export async function executar<T extends object = object>(
  area: string,
  corpo: () => Promise<T | void>,
): Promise<Resultado<T>> {
  try {
    const dados = await corpo();
    return { ok: true, ...(dados ?? ({} as T)) } as Resultado<T>;
  } catch (e) {
    if (e instanceof ErroDeUso) return { ok: false, erro: e.message };
    // Sem importar @prisma/client: este arquivo também vai pro bundle do cliente.
    if ((e as { code?: unknown })?.code === "P2025") {
      return { ok: false, erro: "Não encontrado. Pode ter sido apagado." };
    }
    console.error(`[${area}] action falhou:`, e);
    return { ok: false, erro: "Erro inesperado no servidor. Tenta de novo." };
  }
}

// Cliente: lança o erro do Resultado pro try/catch que mostra `err.message`.
export function exigir<T extends object>(r: Resultado<T>): T {
  if (!r.ok) throw new Error(r.erro);
  const { ok: _ok, ...dados } = r;
  return dados as unknown as T;
}

// Id provisório de item otimista.
export function idTemporario(): string {
  return "temp-" + Math.random().toString(36).slice(2);
}

export function ehTemporario(id: string): boolean {
  return id.startsWith("temp-");
}
