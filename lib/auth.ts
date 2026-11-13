// Regras e textos de conta usados no cliente e no servidor (login, cadastro, código por e-mail).

export const SENHA_MINIMA = 6;
export const TAMANHO_CODIGO = 6;

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Só caminho interno: `?next=` vindo de fora não leva pra outro site.
export function destinoSeguro(next: string | null | undefined, padrao = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return padrao;
  return next;
}

export function traduzirErroAuth(mensagem = "", codigo = ""): string {
  const m = mensagem.toLowerCase();
  if (codigo === "email_exists" || codigo === "user_already_exists" || m.includes("already been registered") || m.includes("user already registered"))
    return "Este e-mail já está cadastrado.";
  if (m.includes("invalid login credentials") || m.includes("invalid email or password"))
    return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed"))
    return "Confirme seu e-mail antes de entrar.";
  if (codigo === "weak_password" || m.includes("password should be at least"))
    return `Senha muito fraca (mínimo ${SENHA_MINIMA} caracteres).`;
  if (codigo === "same_password" || m.includes("different from the old"))
    return "A senha nova precisa ser diferente da antiga.";
  if (m.includes("rate limit") || m.includes("too many requests"))
    return "Muitas tentativas. Tente novamente mais tarde.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Sem conexão com a internet.";
  if (m.includes("invalid email") || m.includes("validate email"))
    return "E-mail inválido.";
  return "Ocorreu um erro. Tente novamente.";
}
