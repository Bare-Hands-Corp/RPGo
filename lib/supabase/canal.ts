// Nome de canal do Realtime único por assinatura. `supabase.channel(nome)`
// devolve o canal antigo enquanto o servidor não confirma a saída dele, e o
// `subscribe()` num canal saindo não faz nada: reassinar com o mesmo nome
// (efeito que roda de novo) deixava a tela sem atualizar até recarregar.
export function canal(nome: string): string {
  return `${nome}:${crypto.randomUUID()}`;
}
