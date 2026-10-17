"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { modificador } from "@/lib/op-rpg";
import { parseFormulaDados, rolarDados, type Dado, type ModoRolagem } from "@/lib/dice";
import { exigir } from "@/lib/acoes";
import { empilharRolagem } from "@/lib/empilhar-rolagem";
import {
  aplicarDanoDeCriatura,
  reagirComoCriatura,
  seguirSemReacao,
  resolverAtaqueDeCriatura,
  usarAcaoDeCriatura,
} from "@/app/ficha/[uid]/actions";
import { useEscolherAlvosCombate } from "@/app/ficha/[uid]/escolher-alvos-combate";
import type { ComponentePayload } from "@/app/bestiario/types";
import { ataquesPorTurno, ehAtaqueComum, extrasDeDano, type ExtraDeDano } from "@/app/bestiario/utils";
import { textoDanoPorTurno } from "@/lib/condicoes";
import {
  iniciarSessao,
  encerrarSessao,
  iniciarCombate,
  adicionarParticipantes,
  removerParticipante,
  atualizarPvInstancia,
  atualizarPvTempInstancia,
  atualizarPvPersonagem,
  atualizarPpInstancia,
  aplicarDanoInstancia,
  definirVisibilidade,
  revelarAcao,
  reordenarIniciativa,
  definirAcoesGastas,
  cancelarResolucao,
  aplicarCondicao,
  definirRolagensPrivadas,
  definirUsosAcao,
  removerCondicao,
  rolarSaidaDeCondicao,
  avancarTurno,
  encerrarCombate,
} from "./actions";
import { SessaoRealtime } from "./sessao-realtime";
import { HistoricoSessoes } from "./historico-sessoes";
import { aplicarCuraDeCriatura } from "@/app/ficha/[uid]/actions";
import { EditavelComDelta } from "@/app/bestiario/inputs";
import { FichaCombate } from "./ficha-combate";
import { DanoCriaturaModal } from "./dano-criatura-modal";
import { CondicaoModal } from "./condicao-modal";
import { ChipCondicao } from "@/components/tipos-dano/condicoes";
import { moverNaLista, useArrastar } from "./use-arrastar";
import {
  ACAO_COMBATE,

  CAMPOS_VISIVEIS,
  TIPOS_ACAO_COMBATE,
  type AcoesGastas,
  type CampoVisivel,
  type OpcaoReacao,
  type ParticipanteVisto,
  type ResultadoAlvo,
} from "@/lib/combate";
import type {
  CriaturaParaCombate,
  EncontroParaCombate,
  InstanciaCombateSerializada,
  NovoParticipante,
  PersonagemParaCombate,
  SessaoSerializada,
} from "./types";

type Props = {
  mesaId: string;
  // Catálogo de tipos de dano do narrador.
  tiposDano: string[];
  sessaoInicial: SessaoSerializada | null;
  criaturas: CriaturaParaCombate[];
  personagensMesa: PersonagemParaCombate[];
  encontros: EncontroParaCombate[];
};

function uuid() {
  return crypto.randomUUID();
}

const D20: Dado = { faces: 20, sinal: 1 };

// O que o narrador pode mostrar de uma criatura aos jogadores.
const OLHOS: Record<CampoVisivel, { rotulo: string; icone: string }> = {
  pvVisivel: { rotulo: "PV", icone: "fa-heart" },
  ppVisivel: { rotulo: "PP", icone: "fa-bolt" },
  crVisivel: { rotulo: "CR", icone: "fa-shield-halved" },
  fichaVisivel: { rotulo: "Ficha (ações já usadas)", icone: "fa-scroll" },
};

// Botões de revelação: de uma criatura ou, no topo, de todas.
function Olhos({
  ligado,
  onAlternar,
  alvo,
}: {
  ligado: (campo: CampoVisivel) => boolean;
  onAlternar: (campo: CampoVisivel, valor: boolean) => void;
  alvo: string;
}) {
  return (
    <span className="sessao-olhos" role="group" aria-label={`O que os jogadores veem de ${alvo}`}>
      {CAMPOS_VISIVEIS.map((campo) => {
        const on = ligado(campo);
        return (
          <button
            type="button"
            key={campo}
            className={on ? "ativo" : undefined}
            aria-pressed={on}
            title={`${OLHOS[campo].rotulo}: ${on ? "os jogadores veem" : "escondido dos jogadores"}`}
            onClick={() => onAlternar(campo, !on)}
          >
            <i className={`fas ${OLHOS[campo].icone}`} />
          </button>
        );
      })}
    </span>
  );
}

// `bonus` é o que soma no d20: a iniciativa da ficha (jogador) ou o
// modificador de Destreza (criatura).
type LinhaBuilder = NovoParticipante & { id: string; nome: string; bonus: number };

function rolarIniciativa(bonus: number): number {
  return rolarDados([{ faces: 20, sinal: 1 }], bonus).total;
}

const comSinal = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

// Alça de arrastar uma linha da iniciativa (mouse, dedo ou setas do teclado).
const escaparHtml = (t: string) =>
  t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// O narrador escolhe com qual reação a criatura responde: uma das que cabem
// na ação (pelo gatilho), mais a redução de dano que ele queira tirar à mão.
// null = desistiu.
async function escolherReacao(
  nome: string,
  opcoes: OpcaoReacao[],
): Promise<{ componenteId: string | null; reducao: number } | null> {
  const resposta = await Swal.fire({
    title: `${nome} reage`,
    html: `
      <label class="sessao-reacao-campo">Reação
        <select id="reacao-escolha" class="swal2-select">
          ${opcoes
            .map(
              (o) =>
                `<option value="${escaparHtml(o.id)}">${escaparHtml(o.nome)}${o.efeito ? ` — ${escaparHtml(o.efeito)}` : ""}</option>`,
            )
            .join("")}
          <option value="">Outra (só a redução abaixo)</option>
        </select>
      </label>
      <label class="sessao-reacao-campo">Redução de dano a mais (à mão)
        <input id="reacao-reducao" class="swal2-input" type="number" min="0" value="0" />
      </label>
      <p class="sessao-reacao-dica">Bônus na CR compara o ataque de novo; PV temporário entra antes do dano. Gasta a reação do turno e os custos dela.</p>`,
    showCancelButton: true,
    confirmButtonText: "Reagir",
    cancelButtonText: "Cancelar",
    background: "var(--bg-card)",
    color: "var(--text-main)",
    preConfirm: () => ({
      componenteId: (document.getElementById("reacao-escolha") as HTMLSelectElement | null)?.value || null,
      reducao: Math.max(0, Math.trunc(Number((document.getElementById("reacao-reducao") as HTMLInputElement | null)?.value) || 0)),
    }),
  });
  return resposta.isConfirmed ? (resposta.value ?? null) : null;
}

function Alca({ nome, ...props }: { nome: string } & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="sessao-alca"
      title="Arraste pra mudar a ordem (ou use as setas ↑ ↓)"
      aria-label={`Mudar ${nome} de posição`}
      {...props}
    >
      <i className="fas fa-grip-vertical" />
    </button>
  );
}

// Ações do turno de um jogador: bolinha na cor do tipo, cinza quando gasta.
// Clicar devolve a ação gasta (ou marca como gasta).
function AcoesDoParticipante({
  nome,
  gastas,
  onMudar,
}: {
  nome: string;
  gastas: AcoesGastas;
  onMudar: (gastas: AcoesGastas) => void;
}) {
  return (
    <span className="sessao-acoes" role="group" aria-label={`Ações do turno de ${nome}`}>
      {TIPOS_ACAO_COMBATE.map((tipo) => {
        const usadas = gastas[tipo] ?? 0;
        return (
          <button
            type="button"
            key={tipo}
            className={usadas > 0 ? "gasta" : undefined}
            style={{ "--acao-cor": ACAO_COMBATE[tipo].cor } as React.CSSProperties}
            title={
              usadas > 0
                ? `${ACAO_COMBATE[tipo].nome}: usada${usadas > 1 ? ` ${usadas}×` : ""}. Clique pra devolver.`
                : `${ACAO_COMBATE[tipo].nome}: disponível. Clique pra marcar como usada.`
            }
            aria-pressed={usadas > 0}
            onClick={() => onMudar({ ...gastas, [tipo]: usadas > 0 ? 0 : 1 })}
          />
        );
      })}
    </span>
  );
}

// Foto redonda (jogador) ou quadrada (criatura); sem imagem, um ícone.
function Retrato({ foto, criatura }: { foto: string | null | undefined; criatura: boolean }) {
  return (
    <span className={`sessao-retrato${criatura ? " criatura" : ""}`} aria-hidden>
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt="" />
      ) : (
        <i className={`fas ${criatura ? "fa-skull" : "fa-user"}`} />
      )}
    </span>
  );
}

// Maior iniciativa primeiro.
function porIniciativa(linhas: LinhaBuilder[]): LinhaBuilder[] {
  return linhas.slice().sort((a, b) => b.iniciativa - a.iniciativa);
}

// Põe a linha no lugar da iniciativa dela (antes da primeira que tem menos),
// sem mexer na ordem que o narrador já arrumou à mão.
function encaixar(linhas: LinhaBuilder[], linha: LinhaBuilder): LinhaBuilder[] {
  const resto = linhas.filter((l) => l.id !== linha.id);
  const i = resto.findIndex((l) => l.iniciativa < linha.iniciativa);
  resto.splice(i < 0 ? resto.length : i, 0, linha);
  return resto;
}

// Escolha de participantes, reaproveitada tanto pra preparar um combate
// quanto pra adicionar reforços no meio de um já em andamento (ex: Tropas
// Intermináveis, que spawna soldados quando um morre).
function ParticipanteBuilder({
  titulo,
  criaturas,
  personagensMesa,
  encontros,
  onConfirmar,
  onCancelar,
  textoBotao,
  processando,
  personagemIdsNoCombate = [],
}: {
  titulo: string;
  criaturas: CriaturaParaCombate[];
  personagensMesa: PersonagemParaCombate[];
  encontros: EncontroParaCombate[];
  onConfirmar: (participantes: NovoParticipante[]) => void;
  onCancelar: () => void;
  textoBotao: string;
  processando: boolean;
  // Jogadores já em combate (relevante só ao adicionar reforço no meio de um
  // combate ativo) — não aparecem nos seletores, pra não duplicar a entrada.
  personagemIdsNoCombate?: string[];
}) {
  const [linhas, setLinhas] = useState<LinhaBuilder[]>([]);
  const [criaturaEscolhida, setCriaturaEscolhida] = useState("");
  const [quantidade, setQuantidade] = useState(1);

  const jogadoresDisponiveis = personagensMesa.filter(
    (p) => !personagemIdsNoCombate.includes(p.id) && !linhas.some((l) => l.personagemId === p.id),
  );

  function adicionar(novas: LinhaBuilder[]) {
    setLinhas((atual) => novas.reduce(encaixar, atual));
  }

  function mudar(id: string, patch: Partial<LinhaBuilder>) {
    setLinhas((atual) => atual.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  // Jogador: d20 + a iniciativa da ficha.
  const linhaDoJogador = (p: PersonagemParaCombate): LinhaBuilder => ({
    id: uuid(),
    nome: p.nome,
    personagemId: p.id,
    quantidade: 1,
    bonus: p.iniciativa,
    iniciativa: rolarIniciativa(p.iniciativa),
    agrupar: true,
  });

  // Criatura: d20 + o modificador de Destreza.
  const linhaDaCriatura = (c: CriaturaParaCombate, qtd: number): LinhaBuilder => {
    const bonus = modificador(c.destreza);
    return {
      id: uuid(),
      nome: c.nome,
      criaturaId: c.id,
      quantidade: Math.max(1, qtd),
      bonus,
      iniciativa: rolarIniciativa(bonus),
      agrupar: true,
    };
  };

  function adicionarCriatura() {
    const criatura = criaturas.find((c) => c.id === criaturaEscolhida);
    if (!criatura) return;
    adicionar([linhaDaCriatura(criatura, quantidade)]);
    setCriaturaEscolhida("");
    setQuantidade(1);
  }

  function adicionarEncontro(encontroId: string) {
    const encontro = encontros.find((e) => e.id === encontroId);
    if (!encontro) return;
    adicionar(
      encontro.itens.flatMap((item) => {
        const criatura = criaturas.find((c) => c.id === item.criaturaId);
        return criatura ? [linhaDaCriatura(criatura, item.quantidade)] : [];
      }),
    );
  }

  // Rola de novo uma linha (ela vai pro lugar da iniciativa nova) ou todas
  // (a lista volta a ficar da maior pra menor).
  function rolarDeNovo(id?: string) {
    setLinhas((atual) => {
      const rolada = (l: LinhaBuilder) => ({ ...l, iniciativa: rolarIniciativa(l.bonus) });
      if (!id) return porIniciativa(atual.map(rolada));
      const linha = atual.find((l) => l.id === id);
      return linha ? encaixar(atual, rolada(linha)) : atual;
    });
  }

  // Cada cópia vira uma linha com a própria rolagem.
  function separarCopias(id: string) {
    setLinhas((atual) => {
      const linha = atual.find((l) => l.id === id);
      if (!linha || linha.quantidade < 2) return atual;
      const copias = Array.from({ length: linha.quantidade }, () => ({
        ...linha,
        id: uuid(),
        quantidade: 1,
        iniciativa: rolarIniciativa(linha.bonus),
      }));
      return copias.reduce(encaixar, atual.filter((l) => l.id !== id));
    });
  }

  const arrastar = useArrastar((de, para) =>
    setLinhas((atual) => {
      const a = atual.find((l) => l.id === de);
      const b = atual.find((l) => l.id === para);
      return a && b ? moverNaLista(atual, a, b) : atual;
    }),
  );

  const totalJogadores = linhas.filter((l) => l.personagemId).length;
  const totalCriaturas = linhas.reduce((t, l) => t + (l.criaturaId ? l.quantidade : 0), 0);

  return (
    <div className="sessao-builder">
      <div className="nv-card-topo">
        <span className="nv-titulo">
          <i className="fas fa-users-gear" /> {titulo}
        </span>
        <button type="button" className="nv-btn" onClick={onCancelar} disabled={processando}>
          Cancelar
        </button>
      </div>

      <div className="sessao-fontes">
        <div className="sessao-fonte">
          <span className="nv-rotulo">Jogadores</span>
          {jogadoresDisponiveis.length > 0 ? (
            <div className="sessao-fonte-chips">
              {jogadoresDisponiveis.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className="sessao-chip-jogador"
                  onClick={() => adicionar([linhaDoJogador(p)])}
                  title={`Adicionar ${p.nome}`}
                >
                  <Retrato foto={p.fotoUrl} criatura={false} />
                  {p.nome}
                </button>
              ))}
              {jogadoresDisponiveis.length > 1 && (
                <button
                  type="button"
                  className="sessao-chip-jogador todos"
                  onClick={() => adicionar(jogadoresDisponiveis.map(linhaDoJogador))}
                >
                  <i className="fas fa-plus" /> Todos
                </button>
              )}
            </div>
          ) : (
            <span className="nv-sub">
              {personagensMesa.length === 0 ? "A mesa ainda não tem jogadores." : "Todos os jogadores já estão na lista."}
            </span>
          )}
        </div>

        <div className="sessao-fonte">
          <span className="nv-rotulo">Criaturas do bestiário</span>
          {criaturas.length > 0 ? (
            <div className="sessao-fonte-linha">
              <select
                value={criaturaEscolhida}
                aria-label="Criatura"
                onChange={(e) => setCriaturaEscolhida(e.target.value)}
              >
                <option value="">Escolher criatura…</option>
                {criaturas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} (ND {c.nd})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={30}
                value={quantidade}
                aria-label="Quantidade"
                title="Quantidade"
                onChange={(e) => setQuantidade(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
              />
              <button type="button" className="nv-btn" onClick={adicionarCriatura} disabled={!criaturaEscolhida}>
                <i className="fas fa-plus" /> Adicionar
              </button>
            </div>
          ) : (
            <span className="nv-sub">Seu bestiário está vazio.</span>
          )}
          {encontros.length > 0 && (
            <select
              defaultValue=""
              aria-label="Encontro salvo"
              onChange={(e) => {
                if (e.target.value) adicionarEncontro(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                Ou inserir um encontro salvo…
              </option>
              {encontros.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="nv-card-topo">
        <span className="nv-rotulo">
          Ordem do combate
          {linhas.length > 0 && ` · ${totalJogadores} jogador${totalJogadores === 1 ? "" : "es"}, ${totalCriaturas} criatura${totalCriaturas === 1 ? "" : "s"}`}
        </span>
        {linhas.length > 1 && (
          <button type="button" className="nv-btn" onClick={() => rolarDeNovo()}>
            <i className="fas fa-dice-d20" /> Rolar todas de novo
          </button>
        )}
        {linhas.length > 1 && linhas.some((l, i) => i > 0 && linhas[i - 1].iniciativa < l.iniciativa) && (
          <button type="button" className="nv-btn" onClick={() => setLinhas(porIniciativa)}>
            <i className="fas fa-arrow-down-wide-short" /> Ordenar pela iniciativa
          </button>
        )}
      </div>

      {linhas.length === 0 ? (
        <div className="nv-vazio">
          <i className="fas fa-people-arrows" />
          <strong>Ninguém na lista ainda</strong>
          <span>
            Toque nos jogadores e adicione as criaturas acima. A iniciativa já sai rolada: d20 + a iniciativa da
            ficha (jogador) ou o modificador de Destreza (criatura).
          </span>
        </div>
      ) : (
        <div className="sessao-preparo-lista">
          {linhas.map((linha) => (
            <div
              key={linha.id}
              className={`sessao-preparo-linha${arrastar.pega === linha.id ? " arrastando" : ""}`}
              {...arrastar.linha(linha.id)}
            >
              <Alca nome={linha.nome} {...arrastar.alca(linha.id)} />
              <span className="sessao-preparo-iniciativa">
                <input
                  type="number"
                  value={linha.iniciativa}
                  aria-label={`Iniciativa de ${linha.nome}`}
                  title={`d20 ${comSinal(linha.bonus)}`}
                  onChange={(e) => mudar(linha.id, { iniciativa: Number(e.target.value) || 0 })}
                  // Vai pro lugar novo só ao sair do campo, pra linha não pular enquanto digita.
                  onBlur={() => setLinhas((atual) => encaixar(atual, atual.find((l) => l.id === linha.id) ?? linha))}
                />
                <button
                  type="button"
                  onClick={() => rolarDeNovo(linha.id)}
                  title={`Rolar de novo (d20 ${comSinal(linha.bonus)})`}
                  aria-label="Rolar de novo"
                >
                  <i className="fas fa-dice-d20" />
                </button>
              </span>
              <Retrato
                criatura={!!linha.criaturaId}
                foto={
                  linha.criaturaId
                    ? criaturas.find((c) => c.id === linha.criaturaId)?.imagemUrl
                    : personagensMesa.find((p) => p.id === linha.personagemId)?.fotoUrl
                }
              />
              <span className="sessao-preparo-nome">
                {linha.nome}
                <small>
                  {linha.criaturaId ? `Criatura · DES ${comSinal(linha.bonus)}` : `Jogador · ficha ${comSinal(linha.bonus)}`}
                </small>
              </span>
              {linha.criaturaId ? (
                <span className="sessao-preparo-qtd">
                  <label>
                    Qtd
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={linha.quantidade}
                      onChange={(e) =>
                        mudar(linha.id, { quantidade: Math.min(30, Math.max(1, Number(e.target.value) || 1)) })
                      }
                    />
                  </label>
                  {linha.quantidade > 1 && (
                    <button
                      type="button"
                      className="nv-btn"
                      onClick={() => separarCopias(linha.id)}
                      title="Hoje as cópias agem juntas, na mesma iniciativa. Separar dá uma rolagem pra cada."
                    >
                      <i className="fas fa-dice" /> Rolar cada uma
                    </button>
                  )}
                </span>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="sessao-icone-btn"
                onClick={() => setLinhas((atual) => atual.filter((l) => l.id !== linha.id))}
                title="Tirar da lista"
                aria-label={`Tirar ${linha.nome} da lista`}
              >
                <i className="fas fa-xmark" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="sessao-builder-rodape">
        <button
          type="button"
          className="nv-btn primario"
          disabled={linhas.length === 0 || processando}
          onClick={() =>
            onConfirmar(
              linhas.map((l) => ({
                criaturaId: l.criaturaId,
                personagemId: l.personagemId,
                quantidade: l.quantidade,
                iniciativa: l.iniciativa,
                agrupar: l.agrupar,
              })),
            )
          }
        >
          <i className="fas fa-khanda" /> {textoBotao}
        </button>
      </div>
    </div>
  );
}

export function SessaoPainel({ mesaId, tiposDano, sessaoInicial, criaturas, personagensMesa, encontros }: Props) {
  const router = useRouter();
  const [sessao, setSessao] = useState(sessaoInicial);
  const [sessaoPropSincronizada, setSessaoPropSincronizada] = useState(sessaoInicial);
  const [pvOverrides, setPvOverrides] = useState<Record<string, number>>({});
  const [mostrarBuilder, setMostrarBuilder] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [criaturaAbertaInstanciaId, setCriaturaAbertaInstanciaId] = useState<string | null>(null);
  // Criatura recebendo dano com tipo (id da InstanciaCombate).
  const [danoEmInstanciaId, setDanoEmInstanciaId] = useState<string | null>(null);
  // Participante recebendo uma condição do narrador (id da InstanciaCombate).
  const [condicaoEmInstanciaId, setCondicaoEmInstanciaId] = useState<string | null>(null);
  // Usos de ação que acabaram de mudar aqui (instanciaId -> componenteId ->
  // restantes), por cima do que o servidor guarda, pra tela não esperar a resposta.
  const [usosOverrides, setUsosOverrides] = useState<Record<string, Record<string, number>>>({});

  // `useState(sessaoInicial)` só usa o valor inicial no mount — sem isso, uma
  // atualização vinda de outra aba/realtime (router.refresh() troca a prop)
  // nunca chegaria aqui. Resincroniza durante o render, não em useEffect.
  if (sessaoInicial !== sessaoPropSincronizada) {
    setSessaoPropSincronizada(sessaoInicial);
    setSessao(sessaoInicial);
    setPvOverrides({});
    setUsosOverrides({});
  }

  async function comErro<T>(fn: () => Promise<T>): Promise<T | null> {
    setProcessando(true);
    try {
      return await fn();
    } catch (err) {
      void Swal.fire({
        icon: "error",
        title: "Erro",
        text: err instanceof Error ? err.message : "Tente novamente.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return null;
    } finally {
      setProcessando(false);
    }
  }

  async function handleIniciarSessao() {
    const nova = await comErro(() => iniciarSessao(mesaId));
    if (nova) {
      setSessao(nova);
      router.refresh();
    }
  }

  async function handleEncerrarSessao() {
    if (!sessao) return;
    const confirmacao = await Swal.fire({
      icon: "warning",
      title: "Encerrar sessão?",
      showCancelButton: true,
      confirmButtonText: "Sim, encerrar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirmacao.isConfirmed) return;
    await comErro(() => encerrarSessao(mesaId, sessao.id));
    setSessao(null);
    router.refresh();
  }

  async function handleIniciarCombate(participantes: NovoParticipante[]) {
    if (!sessao) return;
    const nova = await comErro(() => iniciarCombate(mesaId, sessao.id, participantes));
    if (nova) {
      setSessao(nova);
      setMostrarBuilder(false);
      router.refresh();
    }
  }

  async function handleAdicionarParticipantes(participantes: NovoParticipante[]) {
    if (!sessao?.combateAtivo) return;
    const nova = await comErro(() => adicionarParticipantes(mesaId, sessao.combateAtivo!.id, participantes));
    if (nova) {
      setSessao(nova);
      setMostrarBuilder(false);
      router.refresh();
    }
  }

  async function handleRemover(instanciaId: string) {
    const nova = await comErro(() => removerParticipante(mesaId, instanciaId));
    if (nova) setSessao(nova);
  }

  async function handleAvancarTurno() {
    const combate = sessao?.combateAtivo;
    if (!sessao || !combate) return;

    // Atualização otimista — mesma conta que o servidor faz (avança 1, vira
    // rodada ao passar do fim, e quem recebe a vez tem as ações de volta).
    const total = combate.participantes.length;
    let turno = combate.turnoAtual + 1;
    let rodada = combate.rodadaAtual;
    if (total === 0 || turno >= total) {
      turno = 0;
      rodada += 1;
    }
    setSessao({
      ...sessao,
      combateAtivo: {
        ...combate,
        turnoAtual: turno,
        rodadaAtual: rodada,
        participantes: combate.participantes.map((p, i) => (i === turno ? { ...p, acoesGastas: {} } : p)),
      },
    });

    const nova = await comErro(() => avancarTurno(mesaId, combate.id));
    if (nova) setSessao(nova);
  }

  async function handleEncerrarCombate() {
    if (!sessao?.combateAtivo) return;
    const confirmacao = await Swal.fire({
      icon: "warning",
      title: "Encerrar combate?",
      text: "As instâncias das criaturas serão removidas (um resumo fica salvo no histórico).",
      showCancelButton: true,
      confirmButtonText: "Sim, encerrar",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!confirmacao.isConfirmed) return;
    const nova = await comErro(() => encerrarCombate(mesaId, sessao.combateAtivo!.id));
    if (nova) setSessao(nova);
  }

  const combate = sessao?.combateAtivo ?? null;
  const criaturasEmCombate = combate?.participantes.filter((p) => p.criaturaId) ?? [];

  // Muda participantes na tela antes do servidor responder.
  function mudarLocal(mudar: (p: InstanciaCombateSerializada) => InstanciaCombateSerializada) {
    setSessao((s) =>
      s?.combateAtivo
        ? { ...s, combateAtivo: { ...s.combateAtivo, participantes: s.combateAtivo.participantes.map(mudar) } }
        : s,
    );
  }

  // `instanciaId` nulo = todas as criaturas do combate.
  function alternarVisivel(instanciaId: string | null, campo: CampoVisivel, valor: boolean) {
    if (!combate) return;
    mudarLocal((p) => (p.criaturaId && (!instanciaId || p.id === instanciaId) ? { ...p, [campo]: valor } : p));
    void comErro(() => definirVisibilidade(mesaId, combate.id, instanciaId, { [campo]: valor }));
  }

  function mudarAcoes(instanciaId: string, gastas: AcoesGastas) {
    if (!combate) return;
    mudarLocal((x) => (x.id === instanciaId ? { ...x, acoesGastas: gastas } : x));
    void comErro(() => definirAcoesGastas(mesaId, combate.id, instanciaId, gastas));
  }

  function alternarAcaoRevelada(instanciaId: string, componenteId: string, revelada: boolean) {
    if (!combate) return;
    mudarLocal((p) => {
      if (p.id !== instanciaId) return p;
      const sem = p.acoesReveladas.filter((x) => x !== componenteId);
      return { ...p, acoesReveladas: revelada ? [...sem, componenteId] : sem };
    });
    void comErro(() => revelarAcao(mesaId, combate.id, instanciaId, componenteId, revelada));
  }

  // Ordem arrumada à mão: a lista se rearruma durante o arrasto e vai pro
  // servidor ao soltar. A vez continua com quem já estava jogando.
  const ordemArrastada = useRef<string[] | null>(null);
  const arrastar = useArrastar(
    (de, para) => {
      if (!combate) return;
      const ids = moverNaLista(ordemArrastada.current ?? combate.participantes.map((p) => p.id), de, para);
      ordemArrastada.current = ids;
      setSessao((s) => {
        const c = s?.combateAtivo;
        if (!s || !c) return s;
        const daVezId = c.participantes[c.turnoAtual]?.id;
        const participantes = c.participantes.slice().sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
        const turnoAtual = Math.max(0, participantes.findIndex((p) => p.id === daVezId));
        return { ...s, combateAtivo: { ...c, participantes, turnoAtual } };
      });
    },
    () => {
      const ids = ordemArrastada.current;
      ordemArrastada.current = null;
      if (!ids || !combate) return;
      void comErro(() => reordenarIniciativa(mesaId, combate.id, ids)).then((nova) => nova && setSessao(nova));
    },
  );

  const instanciaAberta = combate?.participantes.find((p) => p.id === criaturaAbertaInstanciaId) ?? null;

  // Alvos pra ação de uma criatura: todo mundo que está no combate.
  const alvosDoCombate = useEscolherAlvosCombate(
    (combate?.participantes ?? []).map(
      (p): ParticipanteVisto => ({
        id: p.id,
        nome: p.nomeExibicao,
        foto: p.criaturaId
          ? (criaturas.find((c) => c.id === p.criaturaId)?.imagemUrl ?? null)
          : (personagensMesa.find((x) => x.id === p.personagemId)?.fotoUrl ?? null),
        tipo: p.criaturaId ? "criatura" : "personagem",
        voce: false,
        iniciativa: p.iniciativa,
        pv: null,
        pp: null,
        cr: null,
        acoes: null,
        condicoes: [],
      }),
    ),
  );

  function avisarErro(mensagem: string) {
    void Swal.fire({
      icon: "error",
      title: "Erro",
      text: mensagem,
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
  }

  // A criatura usa uma ação do statblock num alvo: o servidor gasta usos, PP
  // e a ação do turno e abre a resolução; daqui saem as rolagens. O acerto já
  // sai rolado (com a vantagem escolhida); o dano fica pronto no Rolador.
  async function usarAcaoDaCriatura(item: ComponentePayload, forcar = false) {
    if (!combate || !instanciaAberta) return;
    const combateId = combate.id;
    const instanciaId = instanciaAberta.id;
    const rotulo = `${instanciaAberta.nomeExibicao}: ${item.nome || "Ação"}`;
    const temAtaque = item.efeitos.some((e) => e.tipo === "ataque" && e.bonus.trim());
    const resolveEmAlvo = item.efeitos.some(
      (e) => e.tipo === "salvaguarda" || e.tipo === "condicao" || (e.tipo === "dano" && e.formula.trim()),
    );

    // Multiataque: os ataques comuns que ainda cabem na ação padrão deste turno,
    // cada um com o próprio alvo (linha sem alvo não é ataque feito).
    const cabem =
      fichaDe && ehAtaqueComum(item)
        ? Math.max(1, ataquesPorTurno(fichaDe.componentes) - (instanciaAberta.acoesGastas.padrao ?? 0))
        : 1;
    // Dano extra de aspecto (Crueldade Inata...) e da própria ação, por acerto.
    const extras = fichaDe && temAtaque ? extrasDeDano(fichaDe.componentes, item) : [];
    const usosAgora = { ...instanciaAberta.usosAcoes, ...usosOverrides[instanciaId] };
    const restam = new Map(
      extras.map((x) => [x.componenteId, x.usos === null ? Infinity : (usosAgora[x.componenteId] ?? x.usos)]),
    );

    // Quais extras entram neste acerto: os fixos sempre; os outros o narrador marca.
    async function escolherExtras(critico: boolean): Promise<ExtraDeDano[]> {
      const livres = extras.filter((x) => (restam.get(x.componenteId) ?? 0) > 0);
      const opcionais = livres.filter((x) => !x.sempre);
      if (opcionais.length === 0) return livres;
      const caixa = document.createElement("div");
      caixa.className = "sessao-extras";
      const marcas = opcionais.map((x) => {
        const linha = document.createElement("label");
        const marca = document.createElement("input");
        marca.type = "checkbox";
        const usos = restam.get(x.componenteId) ?? 0;
        linha.append(
          marca,
          ` ${x.nome}: +${x.formula}${x.tipo ? ` ${x.tipo}` : ""}${Number.isFinite(usos) ? ` (resta ${usos})` : ""}`,
        );
        caixa.append(linha);
        return marca;
      });
      const resposta = await Swal.fire({
        title: `${rotulo}: dano extra neste acerto${critico ? " crítico" : ""}?`,
        html: caixa,
        showCancelButton: true,
        confirmButtonText: "Rolar o dano",
        cancelButtonText: "Sem extra",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      const marcados = resposta.isConfirmed ? opcionais.filter((_, i) => marcas[i].checked) : [];
      return [...livres.filter((x) => x.sempre), ...marcados];
    }

    // Gasta o uso dos extras limitados ("uma vez por turno").
    function gastarExtras(usados: ExtraDeDano[]) {
      for (const id of new Set(usados.map((x) => x.componenteId))) {
        const antes = restam.get(id) ?? 0;
        if (!Number.isFinite(antes)) continue;
        const depois = Math.max(0, antes - 1);
        restam.set(id, depois);
        setUsosOverrides((atual) => ({ ...atual, [instanciaId]: { ...(atual[instanciaId] ?? {}), [id]: depois } }));
        void comErro(() => definirUsosAcao(mesaId, combateId, instanciaId, id, depois));
      }
    }

    let alvos: string[] = [];
    let modos: ModoRolagem[] = [];
    if (temAtaque) {
      const ataques = await alvosDoCombate.escolherAtaques(
        `${rotulo}: em quem?${cabem > 1 ? ` (até ${cabem} ataques)` : ""}`,
        cabem,
      );
      if (ataques === null) return;
      alvos = ataques.map((a) => a.alvo);
      modos = ataques.map((a) => a.modo);
    } else if (resolveEmAlvo) {
      const escolhidos = await alvosDoCombate.escolher(`${rotulo}: em quem?`);
      if (escolhidos === null) return;
      alvos = escolhidos;
    }

    const uso = await comErro(async () => exigir(await usarAcaoDeCriatura(mesaId, combateId, instanciaId, item.id, alvos, forcar)));
    if (!uso) return;
    router.refresh();
    const resolucaoId = uso.resolucaoId;

    // Ação que cura: o narrador diz quem recebe (ela mesma ou aliados), a cura
    // é rolada uma vez e entra nas estatísticas com quem curou e quem recebeu.
    const curas = item.efeitos.flatMap((e) => (e.tipo === "cura" && e.formula.trim() ? [e.formula.trim()] : []));
    if (curas.length > 0) {
      const alvosCura = await alvosDoCombate.escolher(`${rotulo}: curar quem?`);
      if (alvosCura && alvosCura.length > 0) {
        const f = curas.map((x) => parseFormulaDados(x));
        empilharRolagem({
          dados: f.flatMap((x) => x.dados),
          modificador: f.reduce((soma, x) => soma + x.modificador, 0),
          nomePreset: `${rotulo} (cura)`,
          aoConcluir: (lances) => {
            const total = lances[0]?.total ?? 0;
            void aplicarCuraDeCriatura(mesaId, combateId, instanciaId, alvosCura, total, item.nome || "Cura").then((r) => {
              if (!r.ok) return avisarErro(r.erro);
              router.refresh();
            });
          },
        });
      }
    }
    if (!resolucaoId) return;

    // Dano de cada acerto, um por vez. O 1º dano vai pelo Rolador; os outros
    // tipos são rolados junto. Crítico dobra os dados.
    const pedirDano = async (acertos: ResultadoAlvo[], comExtras = false) => {
      const [atual, ...resto] = acertos;
      const principal = uso.danos[0];
      if (!atual || !principal) return;
      const critico = atual === "critico";
      const somados = comExtras ? await escolherExtras(critico) : [];
      const formula = (texto: string) => {
        const f = parseFormulaDados(texto);
        return { dados: critico ? [...f.dados, ...f.dados] : f.dados, modificador: f.modificador };
      };
      const f = formula(principal.formula);
      empilharRolagem({
        dados: f.dados,
        modificador: f.modificador,
        nomePreset: `${rotulo} (dano${critico ? " crítico" : ""})`,
        contexto: { tipo: "dano", alcance: "corpo_a_corpo", tecnica: false, grau: 0, tiposDano: [] },
        aoConcluir: (lances) => {
          const lance = lances[0];
          if (!lance) return;
          const partes = [
            { valor: lance.total, tipo: principal.tipo },
            ...[...uso.danos.slice(1), ...somados.map((x) => ({ formula: x.formula, tipo: x.tipo || principal.tipo }))].map(
              (d) => {
                const x = formula(d.formula);
                return { valor: x.dados.length > 0 ? rolarDados(x.dados, x.modificador).total : x.modificador, tipo: d.tipo };
              },
            ),
          ];
          void aplicarDanoDeCriatura(mesaId, combateId, instanciaId, resolucaoId, partes).then((r) => {
            if (!r.ok) return avisarErro(r.erro);
            gastarExtras(somados);
            router.refresh();
            void pedirDano(resto, comExtras);
          });
        },
      });
    };

    if (uso.modo === "ataque" && uso.ataque) {
      const bonus = parseFormulaDados(uso.ataque);
      empilharRolagem({
        dados: [D20, ...bonus.dados],
        modificador: bonus.modificador,
        nomePreset: rotulo,
        contexto: { tipo: "ataque", alcance: "corpo_a_corpo" },
        modos,
        rolarAuto: true,
        aoConcluir: (lances) => {
          void resolverAtaqueDeCriatura(mesaId, combateId, instanciaId, resolucaoId, lances).then((r) => {
            if (!r.ok) return avisarErro(r.erro);
            router.refresh();
            void pedirDano(
              r.resultados.filter((x) => x !== "erro"),
              true,
            );
          });
        },
      });
    } else {
      void pedirDano(["acerto"]);
    }
  }
  const danoEm = combate?.participantes.find((p) => p.id === danoEmInstanciaId && p.criaturaId) ?? null;
  const criaturaDoDano = danoEm ? criaturas.find((c) => c.id === danoEm.criaturaId) : null;

  const daVez = combate?.participantes[combate.turnoAtual] ?? null;

  // Condições de um participante, com os botões de tirar, repetir a
  // salvaguarda e pôr outra. Vale na linha da iniciativa e na ficha.
  function condicoesDe(p: InstanciaCombateSerializada) {
    if (!combate) return null;
    return (
      <span className="sessao-condicoes">
        {p.condicoes.map((c) => (
          <ChipCondicao
            key={c.id}
            nome={c.nome}
            rodadas={c.rodadas}
            origem={[c.origem, c.porTurno ? textoDanoPorTurno(c.porTurno) : ""].filter(Boolean).join(" · ")}
          >
            {c.salvaguarda && p.criaturaId && (
              <button
                type="button"
                className="condicao-chip-botao"
                title={`Rolar a salvaguarda (CD ${c.salvaguarda.cd}) pra ${p.nomeExibicao} sair`}
                aria-label={`Rolar a salvaguarda de ${c.nome}`}
                onClick={async () => {
                  const nova = await comErro(() => rolarSaidaDeCondicao(mesaId, combate.id, p.id, c.id));
                  if (nova) setSessao(nova);
                }}
              >
                <i className="fas fa-dice-d20" />
              </button>
            )}
            <button
              type="button"
              className="condicao-chip-botao"
              title="Tirar a condição"
              aria-label={`Tirar ${c.nome} de ${p.nomeExibicao}`}
              onClick={async () => {
                const nova = await comErro(() => removerCondicao(mesaId, combate.id, p.id, c.id));
                if (nova) setSessao(nova);
              }}
            >
              <i className="fas fa-xmark" />
            </button>
          </ChipCondicao>
        ))}
        <button
          type="button"
          className="sessao-condicao-mais"
          onClick={() => setCondicaoEmInstanciaId(p.id)}
          title="Pôr uma condição"
        >
          <i className="fas fa-plus" /> condição
        </button>
      </span>
    );
  }

  // Ficha aberta ao lado: a criatura e a cópia dela no combate.
  const fichaDe = instanciaAberta?.criaturaId
    ? (criaturas.find((c) => c.id === instanciaAberta.criaturaId) ?? null)
    : null;
  function abrirFicha(instanciaId: string | null) {
    setCriaturaAbertaInstanciaId(instanciaId);
  }
  function trocarFicha(passo: number) {
    const ids = criaturasEmCombate.map((p) => p.id);
    if (ids.length === 0) return;
    const i = ids.indexOf(criaturaAbertaInstanciaId ?? "");
    abrirFicha(ids[(i + passo + ids.length) % ids.length]);
  }

  return (
    <div className="sessao-painel">
      <SessaoRealtime mesaId={mesaId} sessaoId={sessao?.id ?? null} combateId={combate?.id ?? null} />

      {!sessao ? (
        <section className="nv-card">
          <div className="nv-vazio">
            <i className="fas fa-bolt" />
            <strong>Nenhuma sessão ativa</strong>
            <span>Inicie a sessão pra abrir combates nesta mesa.</span>
            <button type="button" className="nv-btn primario" onClick={handleIniciarSessao} disabled={processando}>
              <i className="fas fa-play" /> Iniciar sessão
            </button>
          </div>
        </section>
      ) : !combate ? (
        <section className="nv-card">
          <div className="nv-card-topo">
            <span className="nv-titulo">
              <i className="fas fa-bolt" /> Sessão
              <span className="nv-status ativa">Ativa</span>
            </span>
            <button type="button" className="nv-btn perigo" onClick={handleEncerrarSessao} disabled={processando}>
              <i className="fas fa-stop" /> Encerrar sessão
            </button>
          </div>

          {!mostrarBuilder ? (
            <div className="nv-vazio">
              <i className="fas fa-khanda" />
              <strong>Nenhum combate em andamento</strong>
              <span>Monte a lista de quem vai lutar; a iniciativa de cada um já sai rolada.</span>
              <button type="button" className="nv-btn primario" onClick={() => setMostrarBuilder(true)}>
                <i className="fas fa-users-gear" /> Preparar combate
              </button>
            </div>
          ) : (
            <ParticipanteBuilder
              titulo="Preparar combate"
              criaturas={criaturas}
              personagensMesa={personagensMesa}
              encontros={encontros}
              onConfirmar={handleIniciarCombate}
              onCancelar={() => setMostrarBuilder(false)}
              textoBotao="Iniciar combate"
              processando={processando}
            />
          )}
        </section>
      ) : (
        <section className="nv-card">
          <div className="nv-card-topo">
            <span className="nv-titulo">
              <i className="fas fa-khanda" /> Combate
              <span className="nv-status combate">Rodada {combate.rodadaAtual}</span>
            </span>
            <div className="sessao-topo-botoes">
              <button
                type="button"
                className={`nv-btn${combate.rolagensPrivadas ? " ativo" : ""}`}
                aria-pressed={combate.rolagensPrivadas}
                title={
                  combate.rolagensPrivadas
                    ? "Suas rolagens vão pro chat sem os dados nem o total. Clique pra voltar a mostrar."
                    : "Suas rolagens aparecem no chat. Clique pra esconder os números dos jogadores."
                }
                onClick={() => {
                  const privadas = !combate.rolagensPrivadas;
                  setSessao((x) =>
                    x?.combateAtivo ? { ...x, combateAtivo: { ...x.combateAtivo, rolagensPrivadas: privadas } } : x,
                  );
                  void comErro(() => definirRolagensPrivadas(mesaId, combate.id, privadas)).then(() => router.refresh());
                }}
              >
                <i className={`fas ${combate.rolagensPrivadas ? "fa-eye-slash" : "fa-eye"}`} />{" "}
                {combate.rolagensPrivadas ? "Rolagens privadas" : "Rolagens abertas"}
              </button>
              <button type="button" className="nv-btn perigo" onClick={handleEncerrarCombate} disabled={processando}>
                <i className="fas fa-flag-checkered" /> Encerrar combate
              </button>
              <button type="button" className="nv-btn primario" onClick={handleAvancarTurno} disabled={processando}>
                <i className="fas fa-forward" /> Próximo turno
              </button>
            </div>
          </div>

          <div className="nv-vez">
            <span>Vez de</span>
            <strong>{daVez?.nomeExibicao ?? "—"}</strong>
          </div>

          {combate.resolucoes.length > 0 && (
            <div className="sessao-pendencias">
              <span className="nv-rotulo">Ações em andamento</span>
              {combate.resolucoes.map((r) => {
                const semResultado = r.alvos.filter((x) => x.resultado === null && r.modo === "salvaguarda");
                const reagindo = r.alvos.filter((x) => x.reacao === "pendente");
                const falta = [
                  r.etapa === "ataque" ? `${r.atacanteNome} rolar o acerto` : null,
                  r.etapa === "dano" ? `${r.atacanteNome} rolar o dano` : null,
                  semResultado.length > 0 ? `salvaguarda de ${semResultado.map((x) => x.nome).join(", ")}` : null,
                  reagindo.length > 0 ? `${reagindo.map((x) => x.nome).join(", ")} decidir se reage` : null,
                  r.alvos.some((x) => x.concentracao) ? "teste de concentração" : null,
                ]
                  .filter(Boolean)
                  .join("; ");
                return (
                  <div key={r.id} className="sessao-pendencia">
                    <span>
                      <strong>{r.nome}</strong> em {r.alvos.map((a) => a.nome).join(", ")} · falta {falta}
                    </span>
                    {reagindo
                      // No multiataque o mesmo alvo aparece uma vez por acerto: um botão só.
                      .filter((x, i, todos) => !x.personagemId && todos.findIndex((y) => y.instanciaId === x.instanciaId) === i)
                      .map((alvo) => (
                        <button
                          type="button"
                          key={alvo.instanciaId}
                          className="nv-btn"
                          title="Escolher uma das reações que cabem; gasta a reação do turno e os custos dela"
                          onClick={async () => {
                            const escolha = await escolherReacao(alvo.nome, alvo.reacoes ?? []);
                            if (!escolha) return;
                            const feito = await reagirComoCriatura(
                              mesaId,
                              combate.id,
                              r.id,
                              alvo.instanciaId,
                              escolha.componenteId,
                              escolha.reducao,
                            );
                            if (!feito.ok) return avisarErro(feito.erro);
                            router.refresh();
                          }}
                        >
                          {alvo.nome} reage…
                        </button>
                      ))}
                    {reagindo.length > 0 && (
                      <button
                        type="button"
                        className="nv-btn"
                        title="A ação segue sem reação de ninguém"
                        onClick={async () => {
                          for (const instanciaId of new Set(reagindo.map((x) => x.instanciaId))) {
                            const feito = await seguirSemReacao(mesaId, combate.id, r.id, instanciaId);
                            if (!feito.ok) return avisarErro(feito.erro);
                          }
                          router.refresh();
                        }}
                      >
                        Seguir sem reação
                      </button>
                    )}
                    <button
                      type="button"
                      className="sessao-icone-btn"
                      title="Descartar esta ação (o que já foi gasto continua gasto)"
                      aria-label={`Descartar ${r.nome}`}
                      onClick={async () => {
                        const nova = await comErro(() => cancelarResolucao(mesaId, combate.id, r.id));
                        if (nova) setSessao(nova);
                      }}
                    >
                      <i className="fas fa-xmark" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {criaturasEmCombate.length > 0 && (
            <div className="sessao-revelar-todas">
              <span className="nv-rotulo">Jogadores veem de todas as criaturas</span>
              <Olhos
                alvo="todas as criaturas"
                ligado={(campo) => criaturasEmCombate.every((p) => p[campo])}
                onAlternar={(campo, valor) => alternarVisivel(null, campo, valor)}
              />
            </div>
          )}

          <div className={"sessao-combate-corpo" + (fichaDe ? " com-ficha" : "")}>
          <div className="sessao-iniciativa-lista">
            <div className="sessao-linha-iniciativa cabecalho" aria-hidden>
              <span />
              <span>Inic.</span>
              <span />
              <span>Participante</span>
              <span>Jogadores veem</span>
              <span>PV</span>
              <span>PP</span>
              <span />
              <span />
            </div>
            {combate.participantes.map((p, indice) => {
              const personagem = p.personagemId ? personagensMesa.find((x) => x.id === p.personagemId) : null;
              const criatura = p.criaturaId ? criaturas.find((x) => x.id === p.criaturaId) : null;
              const pvServidor = p.personagemId ? personagem?.hpAtual ?? 0 : p.pvAtual ?? 0;
              // Override local otimista — o campo mostra o que o mestre acabou
              // de digitar em vez de esperar o roundtrip do servidor/realtime.
              const pvExibido = pvOverrides[p.id] ?? pvServidor;
              const pvMax = p.personagemId ? personagem?.hpMax ?? 0 : p.pvMax ?? 0;
              const ehTurnoAtual = indice === combate.turnoAtual;
              // PP só de criatura que tem PP (o máximo vem do bestiário).
              const ppMax = criatura?.pontosPoder ?? 0;

              return (
                <div
                  key={p.id}
                  className={
                    "sessao-linha-iniciativa" +
                    (ehTurnoAtual ? " ativo" : "") +
                    (arrastar.pega === p.id ? " arrastando" : "") +
                    (criaturaAbertaInstanciaId === p.id ? " selecionada" : "")
                  }
                  {...arrastar.linha(p.id)}
                >
                  <Alca nome={p.nomeExibicao} {...arrastar.alca(p.id)} />
                  <span className="sessao-iniciativa-valor">{p.iniciativa}</span>
                  <Retrato criatura={!!p.criaturaId} foto={p.criaturaId ? criatura?.imagemUrl : personagem?.fotoUrl} />
                  <span className="sessao-iniciativa-nome">
                    {criatura ? (
                      <button
                        type="button"
                        className="sessao-nome-link"
                        onClick={() => abrirFicha(criaturaAbertaInstanciaId === p.id ? null : p.id)}
                        aria-expanded={criaturaAbertaInstanciaId === p.id}
                        title="Abrir a ficha ao lado"
                      >
                        {p.nomeExibicao}
                      </button>
                    ) : (
                      p.nomeExibicao
                    )}
                    <small>
                      {p.personagemId ? "Jogador" : "Criatura"}
                      <AcoesDoParticipante
                        nome={p.nomeExibicao}
                        gastas={p.acoesGastas}
                        onMudar={(gastas) => mudarAcoes(p.id, gastas)}
                      />
                    </small>
                    {condicoesDe(p)}
                  </span>
                  {p.criaturaId ? (
                    <Olhos
                      alvo={p.nomeExibicao}
                      ligado={(campo) => p[campo]}
                      onAlternar={(campo, valor) => alternarVisivel(p.id, campo, valor)}
                    />
                  ) : (
                    <span />
                  )}
                  <span className="sessao-vital">
                    <EditavelComDelta
                      className="sessao-iniciativa-pv"
                      value={pvExibido}
                      max={pvMax || undefined}
                      min={p.personagemId ? -pvMax : 0}
                      onChange={(novo) => {
                        setPvOverrides((atual) => ({ ...atual, [p.id]: novo }));
                        if (p.personagemId) void atualizarPvPersonagem(mesaId, p.personagemId, novo);
                        else void atualizarPvInstancia(mesaId, p.id, novo);
                      }}
                    />
                    <span className="sessao-iniciativa-pvmax">/ {pvMax}</span>
                    {p.criaturaId && p.pvTemp > 0 && (
                      <button
                        type="button"
                        className="sessao-pv-temp"
                        title="PV temporário: o dano sai dele primeiro. Clique pra ajustar."
                        aria-label={`PV temporário de ${p.nomeExibicao}: ${p.pvTemp}`}
                        onClick={async () => {
                          const resposta = await Swal.fire({
                            title: `PV temporário de ${p.nomeExibicao}`,
                            input: "number",
                            inputValue: p.pvTemp,
                            inputAttributes: { min: "0" },
                            showCancelButton: true,
                            confirmButtonText: "Salvar",
                            cancelButtonText: "Cancelar",
                            background: "var(--bg-card)",
                            color: "var(--text-main)",
                          });
                          if (!resposta.isConfirmed) return;
                          const novo = Math.max(0, Math.trunc(Number(resposta.value) || 0));
                          mudarLocal((x) => (x.id === p.id ? { ...x, pvTemp: novo } : x));
                          void comErro(() => atualizarPvTempInstancia(mesaId, combate.id, p.id, novo));
                        }}
                      >
                        +{p.pvTemp}
                      </button>
                    )}
                  </span>
                  {ppMax > 0 ? (
                    <span className="sessao-vital">
                      <EditavelComDelta
                        className="sessao-iniciativa-pv sessao-iniciativa-pp"
                        value={Math.max(0, ppMax - p.ppGasto)}
                        max={ppMax}
                        onChange={(novo) => {
                          mudarLocal((x) => (x.id === p.id ? { ...x, ppGasto: ppMax - novo } : x));
                          void comErro(() => atualizarPpInstancia(mesaId, combate.id, p.id, novo));
                        }}
                      />
                      <span className="sessao-iniciativa-pvmax">/ {ppMax}</span>
                    </span>
                  ) : (
                    <span />
                  )}
                  {p.criaturaId ? (
                    <button
                      type="button"
                      className="sessao-icone-btn"
                      onClick={() => setDanoEmInstanciaId(p.id)}
                      title="Dano com tipo (aplica resistências)"
                      aria-label={`Dano com tipo em ${p.nomeExibicao}`}
                    >
                      <i className="fas fa-heart-crack" />
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    className="sessao-icone-btn"
                    onClick={() => handleRemover(p.id)}
                    title="Remover do combate"
                    aria-label={`Remover ${p.nomeExibicao} do combate`}
                  >
                    <i className="fas fa-xmark" />
                  </button>
                </div>
              );
            })}
          </div>

          {fichaDe && instanciaAberta && (
            <FichaCombate
              criatura={fichaDe}
              instancia={{
                ...instanciaAberta,
                usosAcoes: { ...instanciaAberta.usosAcoes, ...usosOverrides[instanciaAberta.id] },
              }}
              pv={pvOverrides[instanciaAberta.id] ?? instanciaAberta.pvAtual ?? 0}
              naVez={daVez?.id === instanciaAberta.id}
              ocupado={processando}
              bolinhas={
                <AcoesDoParticipante
                  nome={instanciaAberta.nomeExibicao}
                  gastas={instanciaAberta.acoesGastas}
                  onMudar={(gastas) => mudarAcoes(instanciaAberta.id, gastas)}
                />
              }
              condicoes={condicoesDe(instanciaAberta)}
              onPv={(novo) => {
                setPvOverrides((atual) => ({ ...atual, [instanciaAberta.id]: novo }));
                void atualizarPvInstancia(mesaId, instanciaAberta.id, novo);
              }}
              onPp={(novo) => {
                mudarLocal((x) => (x.id === instanciaAberta.id ? { ...x, ppGasto: fichaDe.pontosPoder - novo } : x));
                void comErro(() => atualizarPpInstancia(mesaId, combate.id, instanciaAberta.id, novo));
              }}
              onDano={() => setDanoEmInstanciaId(instanciaAberta.id)}
              onUsar={(item, forcar) => void usarAcaoDaCriatura(item, forcar)}
              onUsos={(componenteId, restantes) => {
                setUsosOverrides((atual) => ({
                  ...atual,
                  [instanciaAberta.id]: { ...(atual[instanciaAberta.id] ?? {}), [componenteId]: restantes },
                }));
                void comErro(() => definirUsosAcao(mesaId, combate.id, instanciaAberta.id, componenteId, restantes));
              }}
              onRevelar={(componenteId, revelada) => alternarAcaoRevelada(instanciaAberta.id, componenteId, revelada)}
              onFechar={() => abrirFicha(null)}
              onAnterior={() => trocarFicha(-1)}
              onProxima={() => trocarFicha(1)}
            />
          )}
          </div>

          {!mostrarBuilder ? (
            <button type="button" className="nv-btn sessao-reforco" onClick={() => setMostrarBuilder(true)}>
              <i className="fas fa-plus" /> Adicionar participante
            </button>
          ) : (
            <ParticipanteBuilder
              titulo="Adicionar participantes"
              criaturas={criaturas}
              personagensMesa={personagensMesa}
              encontros={encontros}
              onConfirmar={handleAdicionarParticipantes}
              onCancelar={() => setMostrarBuilder(false)}
              textoBotao="Adicionar ao combate"
              processando={processando}
              personagemIdsNoCombate={combate.participantes.filter((p) => p.personagemId).map((p) => p.personagemId!)}
            />
          )}
        </section>
      )}

      {!combate && <HistoricoSessoes mesaId={mesaId} />}

      {combate && condicaoEmInstanciaId && (
        <CondicaoModal
          nome={combate.participantes.find((p) => p.id === condicaoEmInstanciaId)?.nomeExibicao ?? ""}
          onFechar={() => setCondicaoEmInstanciaId(null)}
          onAplicar={async (condicao) => {
            const nova = await comErro(() => aplicarCondicao(mesaId, combate.id, condicaoEmInstanciaId, condicao));
            if (nova) setSessao(nova);
          }}
        />
      )}

      {danoEm && (
        <DanoCriaturaModal
          nome={danoEm.nomeExibicao}
          pvAtual={pvOverrides[danoEm.id] ?? danoEm.pvAtual ?? 0}
          pvMax={danoEm.pvMax ?? 0}
          pvTemp={danoEm.pvTemp}
          resistencias={
            criaturaDoDano?.resistencias ?? {
              danoResistencia: [],
              danoImunidade: [],
              danoVulneravel: [],
              condicaoImunidade: [],
            }
          }
          tiposDano={tiposDano}
          onAplicar={(partes, desligadas, pvDepois, pvTempDepois) => {
            const id = danoEm.id;
            setPvOverrides((atual) => ({ ...atual, [id]: pvDepois }));
            mudarLocal((x) => (x.id === id ? { ...x, pvTemp: pvTempDepois } : x));
            void comErro(() => aplicarDanoInstancia(mesaId, id, partes, desligadas));
          }}
          onFechar={() => setDanoEmInstanciaId(null)}
        />
      )}

      {alvosDoCombate.modal}
    </div>
  );
}
