"use client";

import { useState } from "react";
import type { MensagemSerializada } from "@/lib/mensagens";
import type { ResumoPersonagem } from "@/lib/resumo-personagem";
import { dataParaDias } from "@/lib/calendario/engine";
import { CopyCodigoBadge } from "./copy-codigo-badge";
import { NarradorRealtime } from "./realtime-refresher";
import { Bandeja } from "@/components/bandeja/bandeja";
import { ThemeButton } from "@/components/temas/theme-button";
import { BotaoVoltar } from "@/components/botao-voltar";
import { ModalSolicitarTeste } from "./modal-solicitar-teste";
import { CalendarioRealtime } from "@/app/calendario/[mesaId]/realtime-refresher";
import { CalendarioView } from "@/app/calendario/[mesaId]/calendario-view";
import { RelogioMesa } from "@/app/calendario/[mesaId]/relogio";
import type {
  CalendarioCarregado,
  ObjetivoPrazo,
} from "@/lib/calendario/carregar";
import { SessaoPainel } from "./sessao/sessao-painel";
import type { CriaturaParaCombate, EncontroParaCombate, SessaoSerializada } from "./sessao/types";
import { VisaoGeral } from "./visao-geral";
import { EditarMesaModal } from "./editar-mesa-modal";

type Mesa = {
  id: string;
  nome: string;
  codigoAcesso: string;
  bannerUrl: string | null;
  personagens: ResumoPersonagem[];
};

type Props = {
  mesa: Mesa;
  userId: string;
  mensagensIniciais: MensagemSerializada[];
  calendario: CalendarioCarregado;
  objetivosComPrazo: ObjetivoPrazo[];
  sessaoInicial: SessaoSerializada | null;
  criaturas: CriaturaParaCombate[];
  encontros: EncontroParaCombate[];
};

type Aba = "visao" | "sessao" | "calendario";

export function NarradorShell({
  mesa,
  userId,
  mensagensIniciais,
  calendario,
  objetivosComPrazo,
  sessaoInicial,
  criaturas,
  encontros,
}: Props) {
  // Sempre abre na visão geral.
  const [aba, setAba] = useState<Aba>("visao");
  const [modalTesteAberto, setModalTesteAberto] = useState(false);
  // Alvo já marcado quando o teste é pedido pela linha de um jogador.
  const [alvoTeste, setAlvoTeste] = useState<string | null>(null);
  const [mensagemCriada, setMensagemCriada] = useState<MensagemSerializada | null>(null);
  const [editandoMesa, setEditandoMesa] = useState(false);

  const combate = sessaoInicial?.combateAtivo ?? null;
  const hoje = dataParaDias(calendario.dataAtualDias, calendario.config);
  const qtd = mesa.personagens.length;

  function pedirTeste(personagemId?: string) {
    setAlvoTeste(personagemId ?? null);
    setModalTesteAberto(true);
  }

  const abas: { id: Aba; rotulo: string; icone: string; ponto?: boolean }[] = [
    { id: "visao", rotulo: "Visão geral", icone: "fa-house" },
    { id: "sessao", rotulo: "Sessão", icone: "fa-bolt", ponto: !!sessaoInicial },
    { id: "calendario", rotulo: "Calendário", icone: "fa-calendar-days" },
  ];

  return (
    <div className="narrador-container">
      <NarradorRealtime mesaId={mesa.id} />
      {/* Sempre montado: a visão geral também mostra a data e o clima do dia. */}
      <CalendarioRealtime mesaId={mesa.id} calendarioId={calendario.id} />

      <div className="narrador-pagina">
        <header className="narrador-topo">
          <BotaoVoltar fallbackHref="/dashboard" className="narrador-voltar" title="Voltar">
            <i className="fas fa-arrow-left" />
          </BotaoVoltar>

          <button
            type="button"
            className="narrador-miniatura"
            onClick={() => setEditandoMesa(true)}
            title={mesa.bannerUrl ? "Trocar a foto da mesa" : "Adicionar uma foto à mesa"}
            aria-label="Editar foto da mesa"
          >
            {mesa.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mesa.bannerUrl} alt="" />
            ) : (
              <i className="fas fa-map" />
            )}
            <span className="narrador-miniatura-editar" aria-hidden>
              <i className="fas fa-pen" />
            </span>
          </button>

          <div className="narrador-titulo">
            <span className="narrador-kicker">NARRADOR</span>
            <h1>{mesa.nome}</h1>
            <p className="narrador-status">
              <span>
                <i className="fas fa-users" /> {qtd} {qtd === 1 ? "jogador" : "jogadores"}
              </span>
              <span>
                <i className="fas fa-calendar-day" /> {hoje.dia} de {hoje.nomeMes}, {hoje.ano}
              </span>
              <span className={combate ? "combate" : sessaoInicial ? "ativa" : ""}>
                <i className="fas fa-circle" />{" "}
                {combate ? `Em combate · rodada ${combate.rodadaAtual}` : sessaoInicial ? "Sessão ativa" : "Sem sessão"}
              </span>
            </p>
          </div>

          <div className="narrador-topo-acoes">
            <RelogioMesa
              mesaId={mesa.id}
              relogio={calendario.relogio}
              config={calendario.config}
              dataAtualDias={calendario.dataAtualDias}
              isNarrador
            />
            <button
              type="button"
              className="narrador-editar"
              onClick={() => setEditandoMesa(true)}
              title="Editar nome e foto da mesa"
            >
              <i className="fas fa-pen" /> <span>Editar mesa</span>
            </button>
            <CopyCodigoBadge codigo={mesa.codigoAcesso} />
            <ThemeButton />
          </div>
        </header>

        <nav className="narrador-tabs" aria-label="Navegação do narrador">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              className={"narrador-tab" + (aba === a.id ? " active" : "")}
              onClick={() => setAba(a.id)}
              aria-current={aba === a.id ? "page" : undefined}
            >
              <i className={`fas ${a.icone}`} /> {a.rotulo}
              {a.ponto && <span className="narrador-tab-ponto" title="Sessão ativa" />}
            </button>
          ))}
        </nav>

        <main className="narrador-main">
          {aba === "visao" ? (
            <VisaoGeral
              mesaId={mesa.id}
              personagens={mesa.personagens}
              sessao={sessaoInicial}
              calendario={calendario}
              objetivos={objetivosComPrazo}
              onIrPara={setAba}
              onPedirTeste={pedirTeste}
            />
          ) : aba === "sessao" ? (
            <section className="narrador-sessao-embed">
              <SessaoPainel
                mesaId={mesa.id}
                sessaoInicial={sessaoInicial}
                criaturas={criaturas}
                personagensMesa={mesa.personagens.map((p) => ({
                  id: p.id,
                  nome: p.nome,
                  hpAtual: p.hpAtual,
                  hpMax: p.hpMax,
                  destreza: p.destreza,
                }))}
                encontros={encontros}
              />
            </section>
          ) : (
            <section className="narrador-calendario-embed">
              <CalendarioView
                mesaId={mesa.id}
                isNarrador={true}
                config={calendario.config}
                dataAtualDias={calendario.dataAtualDias}
                relogio={calendario.relogio}
                eventos={calendario.eventos}
                tiposClima={calendario.tiposClima}
                objetivos={objetivosComPrazo}
              />
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

      {editandoMesa && (
        <EditarMesaModal
          mesaId={mesa.id}
          nomeAtual={mesa.nome}
          bannerAtual={mesa.bannerUrl}
          onFechar={() => setEditandoMesa(false)}
        />
      )}

      <ModalSolicitarTeste
        // Remonta ao trocar o alvo pré-selecionado (o estado do modal é interno).
        key={alvoTeste ?? "todos"}
        alvoInicial={alvoTeste}
        mesaId={mesa.id}
        aberto={modalTesteAberto}
        onFechar={() => setModalTesteAberto(false)}
        onCriada={(msg) => setMensagemCriada(msg)}
        personagens={mesa.personagens.map((p) => ({ id: p.id, nome: p.nome, fotoUrl: p.fotoUrl }))}
      />
    </div>
  );
}