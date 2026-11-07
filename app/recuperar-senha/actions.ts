"use server";

import { ErroDeUso, executar } from "@/lib/acoes";
import { SENHA_MINIMA, normalizarEmail } from "@/lib/auth";
import {
  ESPERA_REENVIO_S,
  apagarCodigo,
  conferirCodigo,
  contaPorEmail,
  mandarCodigo,
  marcarEmailVerificado,
} from "@/lib/codigo-email";
import { createClient } from "@/lib/supabase/server";

async function contaDoEmail(emailBruto: string) {
  const conta = await contaPorEmail(normalizarEmail(emailBruto));
  if (!conta) throw new ErroDeUso("Código não encontrado. Peça um novo.");
  return conta;
}

// Mesma resposta com ou sem conta: a tela não revela quem está cadastrado.
export async function pedirCodigoSenha(emailBruto: string) {
  return executar("recuperar-senha", async () => {
    const email = normalizarEmail(emailBruto);
    if (!email.includes("@")) throw new ErroDeUso("E-mail inválido.");
    const conta = await contaPorEmail(email);
    if (conta) await mandarCodigo(conta, "senha");
    return { espera: ESPERA_REENVIO_S };
  });
}

export async function conferirCodigoSenha(emailBruto: string, codigo: string) {
  return executar("recuperar-senha", async () => {
    const conta = await contaDoEmail(emailBruto);
    await conferirCodigo(conta.id, "senha", codigo);
  });
}

// Troca a senha e já entra. O código provou o e-mail, então a conta sai verificada também.
export async function trocarSenha(emailBruto: string, codigo: string, senha: string) {
  return executar("recuperar-senha", async () => {
    if (senha.length < SENHA_MINIMA) throw new ErroDeUso(`Senha muito fraca (mínimo ${SENHA_MINIMA} caracteres).`);
    const conta = await contaDoEmail(emailBruto);
    await conferirCodigo(conta.id, "senha", codigo);
    await marcarEmailVerificado(conta.id, { password: senha });
    await apagarCodigo(conta.id);

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: conta.email, password: senha });
    return { entrou: !error };
  });
}
