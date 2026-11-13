"use client";

import Link from "next/link";
import { useState } from "react";
import { AvisoAuth, type Aviso } from "@/components/auth/aviso-auth";
import { CampoCodigo } from "@/components/auth/campo-codigo";
import { useContagem } from "@/components/auth/use-contagem";
import { exigir } from "@/lib/acoes";
import { SENHA_MINIMA, TAMANHO_CODIGO } from "@/lib/auth";
import { conferirCodigoSenha, pedirCodigoSenha, trocarSenha } from "./actions";

type Passo = "email" | "codigo" | "senha" | "pronto";

export function RecuperarForm({ emailInicial }: { emailInicial: string }) {
  const [passo, setPasso] = useState<Passo>("email");
  const [email, setEmail] = useState(emailInicial);
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [contagem, setContagem] = useContagem(0);

  function mostrarErro(err: unknown) {
    setAviso({ msg: err instanceof Error ? err.message : String(err), tipo: "erro" });
  }

  async function pedirCodigo(reenvio = false) {
    if (!email.trim()) return mostrarErro("Informe o e-mail.");
    setCarregando(true);
    setAviso(null);
    try {
      const r = exigir(await pedirCodigoSenha(email));
      setContagem(r.espera);
      setCodigo("");
      setPasso("codigo");
      if (reenvio) setAviso({ msg: "Código novo enviado.", tipo: "sucesso" });
    } catch (err) {
      mostrarErro(err);
    } finally {
      setCarregando(false);
    }
  }

  async function conferir(valor = codigo) {
    if (valor.length !== TAMANHO_CODIGO || carregando) return;
    setCarregando(true);
    setAviso(null);
    try {
      exigir(await conferirCodigoSenha(email, valor));
      setPasso("senha");
    } catch (err) {
      mostrarErro(err);
      setCodigo("");
    } finally {
      setCarregando(false);
    }
  }

  async function salvar() {
    if (senha.length < SENHA_MINIMA) return mostrarErro(`A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`);
    if (senha !== confirmaSenha) return mostrarErro("As senhas não coincidem.");
    setCarregando(true);
    setAviso(null);
    try {
      const r = exigir(await trocarSenha(email, codigo, senha));
      setPasso("pronto");
      setTimeout(() => window.location.replace(r.entrou ? "/dashboard" : "/login"), 1200);
    } catch (err) {
      mostrarErro(err);
      setCarregando(false);
    }
  }

  if (passo === "pronto") {
    return (
      <div className="auth-card">
        <div className="auth-cabecalho">
          <span className="auth-icone sucesso"><i className="fa-solid fa-circle-check" /></span>
          <h1>Senha trocada!</h1>
          <p>Entrando...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AvisoAuth aviso={aviso} onFechar={() => setAviso(null)} />

      <form
        className="auth-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (passo === "email") void pedirCodigo();
          else if (passo === "codigo") void conferir();
          else void salvar();
        }}
      >
        {passo === "email" && (
          <>
            <div className="auth-cabecalho">
              <span className="auth-icone"><i className="fa-solid fa-key" /></span>
              <h1>Recuperar senha</h1>
              <p>Informe o e-mail da sua conta.</p>
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
                disabled={carregando}
                autoFocus
              />
            </div>
            <div className="auth-acoes">
              <button type="submit" className="btn-primary" disabled={carregando}>
                {carregando ? "Enviando..." : "Mandar código"}
              </button>
            </div>
          </>
        )}

        {passo === "codigo" && (
          <>
            <div className="auth-cabecalho">
              <span className="auth-icone"><i className="fa-solid fa-key" /></span>
              <h1>Recuperar senha</h1>
              <p>Se houver conta com <strong>{email.trim()}</strong>, o código chega lá.</p>
            </div>
            <CampoCodigo valor={codigo} onChange={setCodigo} onCompleto={conferir} disabled={carregando} />
            <div className="auth-acoes">
              <button type="submit" className="btn-primary" disabled={carregando || codigo.length !== TAMANHO_CODIGO}>
                {carregando ? "Conferindo..." : "Conferir"}
              </button>
            </div>
          </>
        )}

        {passo === "senha" && (
          <>
            <div className="auth-cabecalho">
              <span className="auth-icone"><i className="fa-solid fa-lock" /></span>
              <h1>Nova senha</h1>
              <p>{email.trim()}</p>
            </div>
            <input type="email" autoComplete="username" value={email} readOnly hidden />
            <div className="form-group">
              <label htmlFor="senha">Nova senha</label>
              <input
                id="senha"
                type="password"
                autoComplete="new-password"
                className="form-input"
                placeholder="******"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={carregando}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirmaSenha">Confirmar senha</label>
              <input
                id="confirmaSenha"
                type="password"
                autoComplete="new-password"
                className="form-input"
                placeholder="Repita a senha"
                value={confirmaSenha}
                onChange={(e) => setConfirmaSenha(e.target.value)}
                disabled={carregando}
              />
            </div>
            <div className="auth-acoes">
              <button type="submit" className="btn-primary" disabled={carregando}>
                {carregando ? "Salvando..." : "Salvar e entrar"}
              </button>
            </div>
          </>
        )}

        <div className="auth-rodape">
          {passo === "codigo" && (
            <>
              <button
                type="button"
                className="btn-text"
                onClick={() => pedirCodigo(true)}
                disabled={carregando || contagem > 0}
              >
                {contagem > 0 ? `Reenviar código em ${contagem}s` : "Reenviar código"}
              </button>
              <button
                type="button"
                className="btn-text sec"
                onClick={() => {
                  setPasso("email");
                  setAviso(null);
                }}
                disabled={carregando}
              >
                Trocar e-mail
              </button>
            </>
          )}
          <Link href="/login" className="btn-text sec">
            Voltar ao login
          </Link>
        </div>
      </form>
    </>
  );
}
