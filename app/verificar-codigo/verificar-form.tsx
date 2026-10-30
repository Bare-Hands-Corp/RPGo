"use client";

import { useEffect, useRef, useState } from "react";
import { AvisoAuth, type Aviso } from "@/components/auth/aviso-auth";
import { CampoCodigo } from "@/components/auth/campo-codigo";
import { useContagem } from "@/components/auth/use-contagem";
import { exigir } from "@/lib/acoes";
import { TAMANHO_CODIGO } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { confirmarEmail, reenviarCodigoVerificacao } from "./actions";

export function VerificarForm({
  email,
  destino,
  jaConfirmado,
  temCodigo,
  espera,
}: {
  email: string;
  destino: string;
  jaConfirmado: boolean;
  temCodigo: boolean;
  espera: number;
}) {
  const [codigo, setCodigo] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [confirmado, setConfirmado] = useState(jaConfirmado);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [contagem, setContagem] = useContagem(espera);
  const mandouNaChegada = useRef(false);

  // Já confirmado com JWT antigo: renova a sessão e segue. Sem código válido: manda um na chegada.
  useEffect(() => {
    if (jaConfirmado) {
      createClient().auth.refreshSession().finally(() => window.location.replace(destino));
      return;
    }
    if (temCodigo || mandouNaChegada.current) return;
    mandouNaChegada.current = true;
    reenviarCodigoVerificacao().then((r) => {
      if (r.ok) setContagem(r.espera);
      else setAviso({ msg: r.erro, tipo: "erro" });
    });
  }, [jaConfirmado, temCodigo, destino, setContagem]);

  async function confirmar(valor = codigo) {
    if (valor.length !== TAMANHO_CODIGO || carregando) return;
    setCarregando(true);
    setAviso(null);
    try {
      exigir(await confirmarEmail(valor));
      setConfirmado(true);
      setTimeout(() => window.location.replace(destino), 1200);
    } catch (err) {
      setAviso({ msg: (err as Error).message, tipo: "erro" });
      setCodigo("");
      setCarregando(false);
    }
  }

  async function reenviar() {
    if (contagem > 0 || reenviando) return;
    setReenviando(true);
    setAviso(null);
    try {
      const r = exigir(await reenviarCodigoVerificacao());
      setCodigo("");
      setContagem(r.espera);
      setAviso({ msg: "Código novo enviado.", tipo: "sucesso" });
    } catch (err) {
      setAviso({ msg: (err as Error).message, tipo: "erro" });
    } finally {
      setReenviando(false);
    }
  }

  async function sair() {
    await createClient().auth.signOut();
    window.location.replace("/login");
  }

  if (confirmado) {
    return (
      <div className="auth-card">
        <div className="auth-cabecalho">
          <span className="auth-icone sucesso"><i className="fa-solid fa-circle-check" /></span>
          <h1>E-mail confirmado!</h1>
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
          void confirmar();
        }}
      >
        <div className="auth-cabecalho">
          <span className="auth-icone"><i className="fa-solid fa-envelope-circle-check" /></span>
          <h1>Confirme seu e-mail</h1>
          <p>Mandamos um código para <strong>{email}</strong>.</p>
        </div>

        <CampoCodigo valor={codigo} onChange={setCodigo} onCompleto={confirmar} disabled={carregando} />

        <div className="auth-acoes">
          <button type="submit" className="btn-primary" disabled={carregando || codigo.length !== TAMANHO_CODIGO}>
            {carregando ? "Conferindo..." : "Confirmar"}
          </button>
        </div>

        <div className="auth-rodape">
          <button type="button" className="btn-text" onClick={reenviar} disabled={reenviando || contagem > 0}>
            {reenviando ? "Enviando..." : contagem > 0 ? `Reenviar código em ${contagem}s` : "Reenviar código"}
          </button>
          <button type="button" className="btn-text sec" onClick={sair}>
            Sair
          </button>
        </div>
      </form>
    </>
  );
}
