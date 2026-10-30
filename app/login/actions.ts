"use server";

import { ErroDeUso, executar } from "@/lib/acoes";
import { SENHA_MINIMA, normalizarEmail, traduzirErroAuth } from "@/lib/auth";
import { mandarCodigo } from "@/lib/codigo-email";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Cria a conta já confirmada no Supabase (o código por e-mail faz o papel do link), entra e manda o código.
export async function cadastrar(emailBruto: string, senha: string) {
  return executar("cadastro", async () => {
    const email = normalizarEmail(emailBruto);
    if (!email.includes("@")) throw new ErroDeUso("E-mail inválido.");
    if (senha.length < SENHA_MINIMA) throw new ErroDeUso(`Senha muito fraca (mínimo ${SENHA_MINIMA} caracteres).`);

    const { data, error } = await supabaseAdmin().auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      app_metadata: { email_pendente: true },
    });
    if (error || !data.user) throw new ErroDeUso(traduzirErroAuth(error?.message, error?.code));

    const supabase = await createClient();
    const entrada = await supabase.auth.signInWithPassword({ email, password: senha });
    if (entrada.error) throw new ErroDeUso(traduzirErroAuth(entrada.error.message, entrada.error.code));

    // Falha no envio não desfaz a conta: a tela do código tem o reenviar.
    try {
      await mandarCodigo({ id: data.user.id, email }, "verificacao");
    } catch (e) {
      console.error("[cadastro] código não saiu:", e);
    }
  });
}
