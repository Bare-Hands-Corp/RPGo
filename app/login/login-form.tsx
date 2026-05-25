"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Modo = "login" | "cadastro";
type ToastTipo = "erro" | "sucesso";

function traduzirErro(mensagem = ""): string {
  const m = mensagem.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid email or password"))
    return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed"))
    return "Confirme seu e-mail antes de entrar.";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "Este e-mail já está cadastrado.";
  if (m.includes("password should be at least"))
    return "Senha muito fraca (mínimo 6 caracteres).";
  if (m.includes("rate limit") || m.includes("too many requests"))
    return "Muitas tentativas. Tente novamente mais tarde.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Sem conexão com a internet.";
  if (m.includes("invalid email"))
    return "E-mail inválido.";
  return "Ocorreu um erro. Tente novamente.";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  // Rota pra onde voltar depois do login (preservada pelo proxy via ?next=).
  const destino = searchParams.get("next") || "/dashboard";

  const [modo, setModo] = useState<Modo>("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tipo: ToastTipo } | null>(null);

  const isCadastro = modo === "cadastro";

  function mostrarErro(msg: string) {
    setToast({ msg, tipo: "erro" });
  }
  function mostrarSucesso(msg: string) {
    setToast({ msg, tipo: "sucesso" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setToast(null);

    if (!email.trim() || !senha) {
      mostrarErro("Preencha todos os campos.");
      return;
    }
    if (isCadastro && senha !== confirmaSenha) {
      mostrarErro("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    if (isCadastro) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
      });
      if (error) {
        mostrarErro(traduzirErro(error.message));
        setLoading(false);
        return;
      }
      if (data?.user && !data?.session) {
        mostrarSucesso("Conta criada! Verifique seu e-mail para confirmar.");
        setLoading(false);
        return;
      }
      // signUp com sessão imediata (email confirmation off): cai no fluxo de login
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });
      if (error) {
        mostrarErro(traduzirErro(error.message));
        setLoading(false);
        return;
      }
    }

    // router.refresh() força os Server Components a re-renderizarem
    // com a sessão nova nos cookies; push leva pra rota protegida.
    router.refresh();
    router.push(destino);
  }

  function toggleModo() {
    setModo((m) => (m === "login" ? "cadastro" : "login"));
    setToast(null);
  }

  return (
    <>
      {toast && (
        <div
          className="auth-toast show"
          style={{ borderLeftColor: toast.tipo === "sucesso" ? "#27ae60" : "#e74c3c" }}
        >
          <span>{toast.msg}</span>
          <button
            type="button"
            className="close-toast"
            onClick={() => setToast(null)}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
      )}

      <form className="auth-card" onSubmit={handleSubmit}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 5 }}>
            {isCadastro ? "Cadastro" : "Hand Rolls"}
          </h1>
          <p style={{ color: "var(--text-sec)", fontSize: "0.9rem" }}>
            {isCadastro ? "Crie sua conta para jogar" : "Acesse sua conta para continuar"}
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            className="form-input"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            autoComplete={isCadastro ? "new-password" : "current-password"}
            className="form-input"
            placeholder="******"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            disabled={loading}
          />
        </div>

        {isCadastro && (
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirmar Senha</label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className="form-input"
              placeholder="Repita a senha"
              value={confirmaSenha}
              onChange={(e) => setConfirmaSenha(e.target.value)}
              disabled={loading}
            />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 25 }}>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Aguarde..." : isCadastro ? "Criar Conta" : "Entrar"}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 15 }}>
          <button type="button" className="btn-text" onClick={toggleModo} disabled={loading}>
            {isCadastro ? "Já tem conta? Faça login" : "Não tem conta? Cadastre-se"}
          </button>
        </div>
      </form>
    </>
  );
}
