"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { modificador } from "@/lib/op-rpg";
import { rolarDados } from "@/lib/dice";
import {
  iniciarSessao,
  encerrarSessao,
  iniciarCombate,
  adicionarParticipantes,
  removerParticipante,
  atualizarPvInstancia,
  atualizarPvPersonagem,
  atualizarPpInstancia,
  aplicarDanoInstancia,
  definirVisibilidade,
  revelarAcao,
  reordenarIniciativa,
  avancarTurno,
  encerrarCombate,
} from "./actions";
import { SessaoRealtime } from "./sessao-realtime";
import { EditavelComDelta } from "@/app/bestiario/inputs";
import { FichaCriaturaView } from "@/app/bestiario/ficha-view";
import { DanoCriaturaModal } from "./dano-criatura-modal";
import { moverNaLista, useArrastar } from "./use-arrastar";
import { CAMPOS_VISIVEIS, type CampoVisivel } from "@/lib/combate";
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
  const [criaturaAberta, setCriaturaAberta] = useState<CriaturaParaCombate | null>(null);
  const [criaturaAbertaInstanciaId, setCriaturaAbertaInstanciaId] = useState<string | null>(null);
  // Criatura recebendo dano com tipo (id da InstanciaCombate).
  const [danoEmInstanciaId, setDanoEmInstanciaId] = useState<string | null>(null);
  // Usos de ação gastos por cópia da criatura em combate (instanciaId ->
  // componenteId -> restantes). Só existe no navegador — não é persistido no
  // servidor (a InstanciaCombate já some quando o combate termina, então uma
  // combate novo já nasce com os usos cheios de novo sem precisar de reset).
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
    // rodada ao passar do fim). Mostra na hora, sem esperar o roundtrip.
    const total = combate.participantes.length;
    let turno = combate.turnoAtual + 1;
    let rodada = combate.rodadaAtual;
    if (total === 0 || turno >= total) {
      turno = 0;
      rodada += 1;
    }
    setSessao({ ...sessao, combateAtivo: { ...combate, turnoAtual: turno, rodadaAtual: rodada } });

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
  const danoEm = combate?.participantes.find((p) => p.id === danoEmInstanciaId && p.criaturaId) ?? null;
  const criaturaDoDano = danoEm ? criaturas.find((c) => c.id === danoEm.criaturaId) : null;

  const daVez = combate?.participantes[combate.turnoAtual] ?? null;

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
                    (arrastar.pega === p.id ? " arrastando" : "")
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
                        onClick={() => {
                          setCriaturaAberta(criatura);
                          setCriaturaAbertaInstanciaId(p.id);
                        }}
                        title="Abrir a ficha (ações roláveis)"
                      >
                        {p.nomeExibicao}
                      </button>
                    ) : (
                      p.nomeExibicao
                    )}
                    <small>{p.personagemId ? "Jogador" : "Criatura"}</small>
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
                      onChange={(novo) => {
                        setPvOverrides((atual) => ({ ...atual, [p.id]: novo }));
                        if (p.personagemId) void atualizarPvPersonagem(mesaId, p.personagemId, novo);
                        else void atualizarPvInstancia(mesaId, p.id, novo);
                      }}
                    />
                    <span className="sessao-iniciativa-pvmax">/ {pvMax}</span>
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

      {danoEm && (
        <DanoCriaturaModal
          nome={danoEm.nomeExibicao}
          pvAtual={pvOverrides[danoEm.id] ?? danoEm.pvAtual ?? 0}
          pvMax={danoEm.pvMax ?? 0}
          resistencias={
            criaturaDoDano?.resistencias ?? {
              danoResistencia: [],
              danoImunidade: [],
              danoVulneravel: [],
              condicaoImunidade: [],
            }
          }
          tiposDano={tiposDano}
          onAplicar={(partes, desligadas, pvDepois) => {
            const id = danoEm.id;
            setPvOverrides((atual) => ({ ...atual, [id]: pvDepois }));
            void comErro(() => aplicarDanoInstancia(mesaId, id, partes, desligadas));
          }}
          onFechar={() => setDanoEmInstanciaId(null)}
        />
      )}

      {criaturaAberta && criaturaAbertaInstanciaId && (
        <div
          className="modal-overlay"
          onClick={() => {
            setCriaturaAberta(null);
            setCriaturaAbertaInstanciaId(null);
          }}
        >
          <div className="modal-box modal-box-grande sessao-modal-ficha" onClick={(e) => e.stopPropagation()}>
            <FichaCriaturaView
              criatura={criaturaAberta}
              onFechar={() => {
                setCriaturaAberta(null);
                setCriaturaAbertaInstanciaId(null);
              }}
              permitirRolagem
              usosContexto={{
                usosAcoes: usosOverrides[criaturaAbertaInstanciaId] ?? {},
                onDefinir: (componenteId, novoValor) => {
                  const instanciaId = criaturaAbertaInstanciaId;
                  setUsosOverrides((atual) => ({
                    ...atual,
                    [instanciaId]: { ...(atual[instanciaId] ?? {}), [componenteId]: novoValor },
                  }));
                },
                revelacao: instanciaAberta
                  ? {
                      reveladas: instanciaAberta.acoesReveladas,
                      // Ação rolada entra sozinha na prévia dos jogadores.
                      onUsar: (componenteId) => {
                        if (instanciaAberta.autoRevelarAcoes && !instanciaAberta.acoesReveladas.includes(componenteId)) {
                          alternarAcaoRevelada(instanciaAberta.id, componenteId, true);
                        }
                      },
                      onRevelar: (componenteId, revelada) =>
                        alternarAcaoRevelada(instanciaAberta.id, componenteId, revelada),
                    }
                  : undefined,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
