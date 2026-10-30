"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AvisoAuth, type Aviso } from "@/components/auth/aviso-auth";
import { exigir } from "@/lib/acoes";
import { destinoSeguro, traduzirErroAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { cadastrar } from "./actions";

type Modo = "login" | "cadastro";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Rota pra onde voltar depois do login (preservada pelo proxy via ?next=).
  const destino = destinoSeguro(searchParams.get("next"));

  const [modo, setModo] = useState<Modo>("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const isCadastro = modo === "cadastro";
  const telaDoCodigo = `/verificar-codigo?next=${encodeURIComponent(destino)}`;

  function mostrarErro(msg: string) {
    setAviso({ msg, tipo: "erro" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);

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
      // Conta nasce no servidor e entra direto; o código chega por e-mail.
      try {
        exigir(await cadastrar(email, senha));
      } catch (err) {
        mostrarErro((err as Error).message);
        setLoading(false);
        return;
      }
      router.refresh();
      router.push(telaDoCodigo);
      return;
    }

    const { data, error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });
    if (error) {
      mostrarErro(traduzirErroAuth(error.message, error.code));
      setLoading(false);
      return;
    }

    // router.refresh() força os Server Components a re-renderizarem
    // com a sessão nova nos cookies; push leva pra rota protegida.
    router.refresh();
    router.push(data.user?.app_metadata?.email_pendente === true ? telaDoCodigo : destino);
  }

  function toggleModo() {
    setModo((m) => (m === "login" ? "cadastro" : "login"));
    setAviso(null);
  }

  const linkSenha = `/recuperar-senha${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`;

  return (
    <>
      <AvisoAuth aviso={aviso} onFechar={() => setAviso(null)} />

      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-cabecalho">
          <h1>{isCadastro ? "Cadastro" : "Hand Rolls"}</h1>
          <p>{isCadastro ? "Crie sua conta para jogar" : "Acesse sua conta para continuar"}</p>
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
          {!isCadastro && (
            <Link href={linkSenha} className="btn-text auth-esqueci">
              Esqueci minha senha
            </Link>
          )}
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

        <div className="auth-acoes">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Aguarde..." : isCadastro ? "Criar Conta" : "Entrar"}
          </button>
        </div>

        <div className="auth-rodape">
          <button type="button" className="btn-text" onClick={toggleModo} disabled={loading}>
            {isCadastro ? "Já tem conta? Faça login" : "Não tem conta? Cadastre-se"}
          </button>
        </div>
      </form>
    </>
  );
}
