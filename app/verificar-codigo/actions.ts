"use server";

import { ErroDeUso, executar } from "@/lib/acoes";
import {
  ESPERA_REENVIO_S,
  apagarCodigo,
  conferirCodigo,
  contaPorId,
  mandarCodigo,
  marcarEmailVerificado,
} from "@/lib/codigo-email";
import { createClient, usuarioDaRequest } from "@/lib/supabase/server";

async function contaLogada() {
  const usuario = await usuarioDaRequest();
  if (!usuario) throw new ErroDeUso("Sessão expirada. Entre de novo.");
  const conta = await contaPorId(usuario.id);
  if (!conta) throw new ErroDeUso("Conta não encontrada.");
  return conta;
}

export async function confirmarEmail(codigo: string) {
  return executar("verificar-codigo", async () => {
    const conta = await contaLogada();
    if (conta.pendente) {
      await conferirCodigo(conta.id, "verificacao", codigo);
      await marcarEmailVerificado(conta.id);
      await apagarCodigo(conta.id);
    }
    // Sessão nova: o JWT deixa de levar app_metadata.email_pendente.
    const supabase = await createClient();
    await supabase.auth.refreshSession();
  });
}

export async function reenviarCodigoVerificacao() {
  return executar("verificar-codigo", async () => {
    const conta = await contaLogada();
    if (!conta.pendente) throw new ErroDeUso("Seu e-mail já está confirmado.");
    await mandarCodigo(conta, "verificacao");
    return { espera: ESPERA_REENVIO_S };
  });
}
