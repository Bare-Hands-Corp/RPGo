"use client";

import Link from "next/link";
import { useState } from "react";
import { CardPersonagem } from "@/app/dashboard/card-personagem";
import { removerPersonagemDaMesa } from "./actions";
import Swal from "sweetalert2";
import type { MensagemSerializada } from "@/lib/mensagens";
import { CopyCodigoBadge } from "./copy-codigo-badge";
import { NarradorRealtime } from "./realtime-refresher";
import { Bandeja } from "@/components/bandeja/bandeja";
import { ThemeButton } from "@/components/temas/theme-button";
import { ModalSolicitarTeste } from "./modal-solicitar-teste";
import { CalendarioRealtime } from "@/app/calendario/[mesaId]/realtime-refresher";
import { CalendarioView } from "@/app/calendario/[mesaId]/calendario-view";
import type { CalendarioCarregado } from "@/lib/calendario/carregar";

type Personagem = {
  id: string;
  nome: string;
  nivel: number;
  fotoUrl: string | null;
  hpAtual: number;
  hpMax: number;
  ppAtual: number;
  ppMax: number;
};

type Mesa = {
  id: string;
  nome: string;
  codigoAcesso: string;
  bannerUrl: string | null;
  personagens: Personagem[];
};

type Props = {
  mesa: Mesa;
  userId: string;
  mensagensIniciais: MensagemSerializada[];
  calendario: CalendarioCarregado;
};

type Aba = "jogadores" | "acoes" | "calendario";

type AcaoNarrador = {
  id: string;
  titulo: string;
  icone: string;
  descricao: string;
  href?: (mesaId: string) => string;
};

const ACOES_PROTOTIPO: AcaoNarrador[] = [
  {
    id: "testes",
    titulo: "Pedir Testes",
    icone: "fa-dice-d20",
    descricao: "Solicitar rolagens diretas dos jogadores.",
  },
  {
    id: "iniciativa",
    titulo: "Gerenciar Iniciativa",
    icone: "fa-bolt",
    descricao: "Ordem de combate e estados do turno.",
  },
  {
    id: "encontros",
    titulo: "Encontros",
    icone: "fa-skull",
    descricao: "Preparar cenas, emboscadas e eventos da mesa.",
  },
  {
    id: "mesa",
    titulo: "Editar Mesa",
    icone: "fa-gear",
    descricao: "Banner, nome, acesso e ajustes gerais da mesa.",
  },
  {
    id: "ameacas",
    titulo: "Fichas de Ameaças",
    icone: "fa-skull",
    descricao: "Registro de inimigos, bosses e NPCs relevantes.",
    href: (mesaId: string) => `/narrador/${mesaId}/ameacas`,
  },
] as const;

export function NarradorShell({ mesa, userId, mensagensIniciais, calendario }: Props) {
  const [aba, setAba] = useState<Aba>("jogadores");
  const [modalTesteAberto, setModalTesteAberto] = useState(false);
  const [mensagemCriada, setMensagemCriada] = useState<MensagemSerializada | null>(null);

  return (
    <div className="narrador-container">
      <NarradorRealtime mesaId={mesa.id} />

      <div className="painel-central">
        <div className="narrador-topbar">
          <Link href="/dashboard" className="btn-voltar">
            <i className="fas fa-arrow-left" /> Voltar
          </Link>
          <ThemeButton />
        </div>

        <header className="mesa-header">
          {mesa.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="mesa-banner" src={mesa.bannerUrl} alt="Banner da mesa" />
          )}
          <div className="mesa-info">
            <div className="mesa-info-texto">
              <span className="mesa-kicker">VISÃO DO NARRADOR</span>
              <h1>{mesa.nome}</h1>
            </div>
            <div className="mesa-acoes">
              <div className="codigo-badge" aria-label="Calendário integrado">
                <i className="fas fa-calendar-days" /> Calendário integrado
              </div>
              <CopyCodigoBadge codigo={mesa.codigoAcesso} />
            </div>
          </div>
        </header>

        <nav className="narrador-tabs" aria-label="Navegação do narrador">
          <button
            type="button"
            className={"narrador-tab" + (aba === "jogadores" ? " active" : "")}
            onClick={() => setAba("jogadores")}
          >
            <i className="fas fa-users" /> Jogadores
          </button>
          <button
            type="button"
            className={"narrador-tab" + (aba === "acoes" ? " active" : "")}
            onClick={() => setAba("acoes")}
          >
            <i className="fas fa-sparkles" /> Ações do Narrador
          </button>
          <button
            type="button"
            className={"narrador-tab" + (aba === "calendario" ? " active" : "")}
            onClick={() => setAba("calendario")}
          >
            <i className="fas fa-calendar-days" /> Calendário
          </button>
        </nav>

        <main className="narrador-main">
          {aba === "jogadores" ? (
            <section className="grid-personagens narrador-grid-jogadores">
              {mesa.personagens.length === 0 ? (
                <p className="empty-msg">
                  Nenhum jogador conectado nesta mesa ainda. Compartilhe o código de acesso.
                </p>
              ) : (
                mesa.personagens.map((char) => {
                  // Reuse the dashboard card visuals. Provide a `mesa` field so
                  // the CardPersonagem renders consistently in the narrator view.
                  const personagemForCard = {
                    id: char.id,
                    nome: char.nome,
                    nivel: char.nivel,
                    fotoUrl: char.fotoUrl,
                    hpAtual: char.hpAtual,
                    hpMax: char.hpMax,
                    ppAtual: char.ppAtual,
                    ppMax: char.ppMax,
                    mesa: null,
                  };

                  return (
                    <CardPersonagem
                      key={char.id}
                      personagem={personagemForCard}
                      mostrarMesa={false}
                      deleteAction={{
                        onDelete: removerPersonagemDaMesa.bind(null, mesa.id, char.id),
                        confirmText: `Remover "${char.nome}" desta mesa?`,
                        iconClassName: "fa-solid fa-xmark",
                        title: "Remover da mesa",
                        confirmButtonText: "Sim, remover!",
                        successTitle: "Removido da mesa!",
                        successText: `${char.nome} foi removido desta mesa.`,
                      }}
                    />
                  );
                })
              )}
            </section>
          ) : aba === "calendario" ? (
            <section className="narrador-calendario-embed">
              <CalendarioRealtime mesaId={mesa.id} calendarioId={calendario.id} />
              <CalendarioView
                mesaId={mesa.id}
                isNarrador={true}
                config={calendario.config}
                dataAtualDias={calendario.dataAtualDias}
                eventos={calendario.eventos}
                tiposClima={calendario.tiposClima}
              />
            </section>
          ) : (
            <section className="acoes-narrador-grid">
              {ACOES_PROTOTIPO.map((acao) => {
                const conteudo = (
                  <>
                    <div className="acao-card-icone">
                      <i className={`fas ${acao.icone}`} />
                    </div>
                    <div className="acao-card-texto">
                      <h3>{acao.titulo}</h3>
                      <p>{acao.descricao}</p>
                    </div>
                    <div className="acao-card-rodape">
                      <span>{acao.href ? "Disponível agora" : "Protótipo"}</span>
                      <i className="fas fa-arrow-right" />
                    </div>
                  </>
                );

                if (acao.href) {
                  return (
                    <Link key={acao.id} href={acao.href(mesa.id)} className="acao-narrador-card">
                      {conteudo}
                    </Link>
                  );
                }

                return (
                  <button
                    key={acao.id}
                    type="button"
                    className="acao-narrador-card"
                    onClick={() => {
                      if (acao.id === "testes") {
                        setModalTesteAberto(true);
                        return;
                      }
                      void Swal.fire({
                        icon: "info",
                        title: "Protótipo",
                        text: "Esta ação faz parte do rework e será implementada em seguida.",
                        background: "var(--bg-card)",
                        color: "var(--text-main)",
                      });
                    }}
                  >
                    {conteudo}
                  </button>
                );
              })}
            </section>
          )}
        </main>
      </div>

      <Bandeja
        userId={userId}
        userName={`Narrador (${mesa.nome})`}
        sessionId={mesa.id}
        mensagensIniciais={mensagensIniciais}
        mensagemExternaCriada={mensagemCriada}
      />

      <ModalSolicitarTeste
        mesaId={mesa.id}
        aberto={modalTesteAberto}
        onFechar={() => setModalTesteAberto(false)}
        onCriada={(msg) => setMensagemCriada(msg)}
        personagens={mesa.personagens.map((p) => ({ id: p.id, nome: p.nome, fotoUrl: p.fotoUrl }))}
      />
    </div>
  );
}