// Vocabulário de retorno das Server Actions.
//
// Erro lançado dentro de uma action tem a mensagem trocada pelo Next em
// produção ("An error occurred in the Server Components render..."), então o
// cliente nunca vê o motivo. Erro previsto volta como dado, não como throw.

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

// Erro com mensagem escrita pro usuário — só ela atravessa pro cliente.
// Qualquer outro erro vira mensagem genérica e fica no log do servidor.
export class ErroDeUso extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeUso";
  }
}
