"use client";

// Navios do narrador (inimigos): fichas da mesa que só ele vê. Entram no
// combate pela lista de participantes, como qualquer ficha.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { exigir } from "@/lib/acoes";
import { estadoDoNavio } from "@/lib/navio";
import { ModalSubficha } from "@/app/ficha/[uid]/subfichas-tab";
import { criarNavioDoNarrador } from "@/app/ficha/[uid]/actions";

export type NavioDoNarrador = { id: string; nome: string; hpAtual: number; hpMax: number };

export function NaviosDoNarrador({ mesaId, navios }: { mesaId: string; navios: NavioDoNarrador[] }) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [pendente, startTransition] = useTransition();

  return (
    <div className="navios-narrador">
      <span className="navios-narrador-titulo">
        <i className="fas fa-ship" /> Navios inimigos
      </span>
      {navios.map((n) => (
        <Link key={n.id} href={`/ficha/${n.id}`} className="navios-narrador-item">
          {n.nome}
          <small>
            {n.hpAtual}/{n.hpMax} PV · {estadoDoNavio(n.hpAtual, n.hpMax).nome}
          </small>
        </Link>
      ))}
      <button type="button" className="sessao-condicao-mais" disabled={pendente} onClick={() => setCriando(true)}>
        <i className="fas fa-plus" /> navio
      </button>
      {criando && (
        <ModalSubficha
          inicial={null}
          perfis={["veiculo"]}
          daMesa
          onCancelar={() => setCriando(false)}
          onSalvar={(d) => {
            setCriando(false);
            startTransition(async () => {
              try {
                exigir(
                  await criarNavioDoNarrador(mesaId, {
                    nome: d.nome,
                    perfil: "veiculo",
                    hpMax: d.hpMax,
                    navio: d.navio,
                  }),
                );
                router.refresh();
              } catch (err) {
                void Swal.fire({
                  icon: "error",
                  title: "Erro",
                  text: err instanceof Error ? err.message : "Operação falhou.",
                  background: "var(--bg-card)",
                  color: "var(--text-main)",
                });
              }
            });
          }}
        />
      )}
    </div>
  );
}
