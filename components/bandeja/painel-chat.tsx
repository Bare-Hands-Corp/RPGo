"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Swal from "sweetalert2";
import { formatarResultadoRolagemHtml, rolarDados, type DadoRolado } from "@/lib/dice";
import { EVENTO_PASSOS, type PassosDoRolador } from "@/lib/op-rpg";
import { createClient } from "@/lib/supabase/client";
import { canal } from "@/lib/supabase/canal";
import { sanitizarHtmlRolagem } from "@/lib/sanitizar-rolagem";
import {
  enviarMensagemTexto,
  limparMensagens,
  registrarRolagem,
  listarMensagens,
} from "./actions";
import type { MensagemSerializada } from "@/lib/mensagens";

// Fuso fixo: o servidor (UTC) e o navegador precisam gerar o mesmo texto na hidratação.
const FUSO = "America/Sao_Paulo";
const formatoHora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: FUSO,
});
const formatoChaveDia = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: FUSO,
});
const formatoDia = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  timeZone: FUSO,
});
const formatoDiaComAno = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: FUSO,
});

const LIMITE_MENSAGEM = 2000;
// Mensagens seguidas do mesmo autor dentro deste intervalo ficam sob um só cabeçalho.
const JANELA_AGRUPAR_MS = 5 * 60 * 1000;
// Distância do fim em que o chat ainda acompanha as mensagens novas.
const FOLGA_FIM = 56;

export type AbaConversa = "chat" | "rolagens";
export type NaoLidas = Record<AbaConversa, number>;

export type PainelChatHandle = {
  // Append local de uma mensagem já persistida (usado pelo rolador pra evitar
  // round-trip duplo: a action retorna a mensagem e a passamos pra cá).
  appendLocal: (msg: MensagemSerializada) => void;
};

type Props = {
  userId: string;
  userName: string;
  sessionId: string;
  personagemId: string | null;
  // Mensagens pré-carregadas no SSR. PainelChat usa como estado inicial,
  // evitando o round-trip de listarMensagens ao abrir a aba.
  mensagensIniciais: MensagemSerializada[];
  // Qual das duas listas está na tela: a conversa ou o registro de rolagens.
  aba: AbaConversa;
  // A lista está de fato visível (bandeja aberta numa das duas abas).
  visivel: boolean;
  onNaoLidas?: (n: NaoLidas) => void;
};

// uid de gente é um UUID; o que o sistema grava (combate, colaterais) não é.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

// Vai pro registro de rolagens tudo que não é conversa: rolagem, dano, cura,
// turno e os avisos do combate. Fala de jogador e pedido de teste ficam no chat.
function abaDaMensagem(m: MensagemSerializada): AbaConversa {
  if (m.tipo === "teste") return "chat";
  if (m.tipo === "rolagem" || m.tipo === "dano" || m.tipo === "cura" || m.tipo === "turno") {
    return "rolagens";
  }
  return UUID.test(m.uid) ? "chat" : "rolagens";
}

// Pedido de teste só aparece pro narrador e pra quem foi chamado.
function testeVisivel(m: MensagemSerializada, personagemId: string | null): boolean {
  if (m.tipo !== "teste") return true;
  if (!personagemId) return true;
  const alvos = (m.detalhes as { alvos?: unknown } | null)?.alvos;
  return alvos === "TODOS" || (Array.isArray(alvos) && alvos.includes(personagemId));
}

// Linha do realtime (colunas do banco) no formato que o chat usa. null = linha
// incompleta; quem chama recarrega a lista.
function mensagemDaLinha(linha: unknown): MensagemSerializada | null {
  if (!linha || typeof linha !== "object") return null;
  const l = linha as Record<string, unknown>;
  if (typeof l.id !== "string" || typeof l.session_id !== "string" || typeof l.timestamp !== "string") {
    return null;
  }
  // Coluna sem fuso: o banco guarda em UTC.
  let quando = l.timestamp.replace(" ", "T");
  if (!/(Z|[+-]\d{2}(:?\d{2})?)$/.test(quando)) quando += "Z";
  const data = new Date(quando);
  if (Number.isNaN(data.getTime())) return null;
  let detalhes: unknown = l.detalhes ?? null;
  if (typeof detalhes === "string") {
    try {
      detalhes = JSON.parse(detalhes);
    } catch {
      detalhes = null;
    }
  }
  return {
    id: l.id,
    sessionId: l.session_id,
    uid: typeof l.uid === "string" ? l.uid : "",
    nome: typeof l.nome === "string" ? l.nome : "",
    mensagem: typeof l.mensagem === "string" ? l.mensagem : null,
    timestamp: data.toISOString(),
    tipo: typeof l.tipo === "string" ? l.tipo : null,
    total: typeof l.total === "number" ? l.total : null,
    modificador: typeof l.modificador === "number" ? l.modificador : null,
    detalhes,
  };
}

function rotuloDoDia(chave: string, data: Date, hoje: string, ontem: string, anoAtual: string): string {
  if (chave === hoje) return "Hoje";
  if (chave === ontem) return "Ontem";
  return (chave.startsWith(anoAtual) ? formatoDia : formatoDiaComAno).format(data).replace(/\./g, "");
}

function avisarErro(e: unknown, padrao: string) {
  Swal.fire({
    icon: "error",
    title: "Erro",
    text: e instanceof Error ? e.message : padrao,
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

export const PainelChat = forwardRef<PainelChatHandle, Props>(function PainelChat(
  { userId, userName, sessionId, personagemId, mensagensIniciais, aba, visivel, onNaoLidas },
  ref,
) {
  const [mensagens, setMensagens] = useState<MensagemSerializada[]>(mensagensIniciais);
  const [haNovas, setHaNovas] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const noFim = useRef(true);

  const recarregar = useCallback(async () => {
    try {
      const m = await listarMensagens(sessionId);
      setMensagens(m);
    } catch (e) {
      console.error(e);
    }
  }, [sessionId]);

  // Várias linhas apagadas de uma vez (o /limpar) viram uma recarga só.
  const recargaAgendada = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agendarRecarga = useCallback(() => {
    if (recargaAgendada.current) clearTimeout(recargaAgendada.current);
    recargaAgendada.current = setTimeout(() => {
      recargaAgendada.current = null;
      recarregar();
    }, 250);
  }, [recarregar]);
  useEffect(
    () => () => {
      if (recargaAgendada.current) clearTimeout(recargaAgendada.current);
    },
    [],
  );

  // Põe a mensagem na lista, ou troca a que já está lá (pedido de teste que
  // mudou de situação). Chega pela action e pelo realtime: não duplica.
  const appendLocal = useCallback((msg: MensagemSerializada) => {
    setMensagens((prev) => {
      const i = prev.findIndex((m) => m.id === msg.id);
      if (i === -1) return [...prev, msg];
      const copia = prev.slice();
      copia[i] = msg;
      return copia;
    });
  }, []);

  // Realtime fica sempre ativo (não depende da aba estar visível) porque
  // a carga inicial já veio pré-renderizada via SSR. Isso mantém o chat
  // sincronizado mesmo quando o rolador está em foco.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(canal(`chat-${sessionId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mensagens",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            agendarRecarga();
            return;
          }
          // A linha nova entra direto na lista; sem ela inteira, recarrega.
          const nova = mensagemDaLinha(payload.new);
          if (nova && nova.sessionId === sessionId) appendLocal(nova);
          else agendarRecarga();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, appendLocal, agendarRecarga]);

  useImperativeHandle(ref, () => ({ appendLocal }), [appendLocal]);

  // As duas listas: a conversa e o registro de rolagens.
  const listas = useMemo(() => {
    const porAba: Record<AbaConversa, MensagemSerializada[]> = { chat: [], rolagens: [] };
    for (const m of mensagens) {
      if (!testeVisivel(m, personagemId)) continue;
      porAba[abaDaMensagem(m)].push(m);
    }
    return porAba;
  }, [mensagens, personagemId]);
  const lista = listas[aba];
  const ultimaId = lista.length > 0 ? lista[lista.length - 1].id : null;
  const ultimaEhMinha = lista.length > 0 && lista[lista.length - 1].uid === userId;

  const irProFim = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    noFim.current = true;
    setHaNovas(false);
  }, []);

  // Abrir a bandeja ou trocar de aba mostra sempre o fim da lista.
  useLayoutEffect(() => {
    if (visivel) irProFim();
  }, [visivel, aba, irProFim]);

  // Mensagem nova: acompanha se o usuário está no fim (ou se é dele); lendo o
  // histórico, só avisa.
  const ultimaVista = useRef<string | null>(ultimaId);
  useLayoutEffect(() => {
    if (ultimaVista.current === ultimaId) return;
    ultimaVista.current = ultimaId;
    if (!visivel) return;
    if (noFim.current || ultimaEhMinha) irProFim();
    else setHaNovas(true);
  }, [ultimaId, ultimaEhMinha, visivel, irProFim]);

  function aoRolar() {
    const el = containerRef.current;
    if (!el) return;
    noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLGA_FIM;
    if (noFim.current && haNovas) setHaNovas(false);
  }

  // Não lidas: o que chegou de outra pessoa depois da última mensagem vista em
  // cada aba. Ao carregar a página, nada conta como novo.
  const vistas = useRef<Record<AbaConversa, string | null>>({
    chat: listas.chat.length ? listas.chat[listas.chat.length - 1].id : null,
    rolagens: listas.rolagens.length ? listas.rolagens[listas.rolagens.length - 1].id : null,
  });
  useEffect(() => {
    const v = vistas.current;
    if (visivel) v[aba] = listas[aba].length ? listas[aba][listas[aba].length - 1].id : null;
    const contar = (qual: AbaConversa) => {
      const l = listas[qual];
      const vista = v[qual];
      const i = vista ? l.findIndex((m) => m.id === vista) : -1;
      // Marca sumiu (lista limpa ou recarregada): recomeça do zero.
      if (vista && i === -1) {
        v[qual] = l.length ? l[l.length - 1].id : null;
        return 0;
      }
      return l.slice(i + 1).filter((m) => m.uid !== userId).length;
    };
    onNaoLidas?.({ chat: contar("chat"), rolagens: contar("rolagens") });
  }, [listas, aba, visivel, userId, onNaoLidas]);

  const enviar = useCallback(
    async (texto: string): Promise<boolean> => {
      if (texto.toLowerCase() === "/limpar") {
        const r = await Swal.fire({
          title: "Apagar mensagens",
          text: "Apagar TODAS as mensagens e rolagens? Esta ação não pode ser desfeita.",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Apagar",
          cancelButtonText: "Cancelar",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
        if (r.isConfirmed) {
          try {
            await limparMensagens(sessionId);
            setMensagens([]);
          } catch (e) {
            avisarErro(e, "Erro ao apagar.");
          }
        }
        return true;
      }
      try {
        const nova = await enviarMensagemTexto(sessionId, userName, texto);
        appendLocal(nova);
        return true;
      } catch (e) {
        avisarErro(e, "Erro ao enviar.");
        return false;
      }
    },
    [sessionId, userName, appendLocal],
  );

  // Separadores de dia e agrupamento por autor, calculados de uma vez.
  const agora = new Date();
  const hoje = formatoChaveDia.format(agora);
  const ontem = formatoChaveDia.format(new Date(agora.getTime() - 24 * 60 * 60 * 1000));
  const anoAtual = hoje.slice(0, 4);
  const { danoDe, consumidas } = emparelharAtaques(lista);
  const itens: ReactNode[] = [];
  let diaAnterior = "";
  let anterior: MensagemSerializada | null = null;
  for (const m of lista) {
    // O dano que já entrou no cartão do ataque não aparece de novo.
    if (consumidas.has(m.id)) continue;
    const data = new Date(m.timestamp);
    const dia = formatoChaveDia.format(data);
    if (dia !== diaAnterior) {
      itens.push(
        <div key={`dia-${dia}-${m.id}`} className="chat-dia" role="separator">
          <span>{rotuloDoDia(dia, data, hoje, ontem, anoAtual)}</span>
        </div>,
      );
      diaAnterior = dia;
      anterior = null;
    }
    const fala = (m.tipo ?? "texto") === "texto" || !m.detalhes;
    const continua =
      fala &&
      !!anterior &&
      ((anterior.tipo ?? "texto") === "texto" || !anterior.detalhes) &&
      anterior.uid === m.uid &&
      anterior.nome === m.nome &&
      data.getTime() - new Date(anterior.timestamp).getTime() < JANELA_AGRUPAR_MS;
    itens.push(
      <MensagemView
        key={m.id}
        msg={m}
        dano={danoDe.get(m.id) ?? null}
        continua={continua}
        jaRolou={m.tipo === "teste" ? respondeuAoTeste(mensagens, m.id, userId) : false}
        meuUid={userId}
        userName={userName}
        sessionId={sessionId}
        personagemId={personagemId}
        onMensagemAtualizada={appendLocal}
      />,
    );
    anterior = m;
  }

  return (
    <>
      <div className="chat-lista">
        <div
          className="chat-messages"
          ref={containerRef}
          onScroll={aoRolar}
          role="log"
          aria-live="polite"
          aria-label={aba === "chat" ? "Mensagens" : "Rolagens"}
        >
          {lista.length === 0 ? (
            <div className="chat-vazio">
              <i className={aba === "chat" ? "fas fa-comments" : "fas fa-dice-d20"} />
              <p>{aba === "chat" ? "Nenhuma mensagem ainda." : "Nenhuma rolagem ainda."}</p>
              <span>
                {aba === "chat"
                  ? "Escreva algo para a mesa."
                  : "Ataques, testes, dano e turnos aparecem aqui."}
              </span>
            </div>
          ) : (
            itens
          )}
        </div>
        {haNovas && (
          <button type="button" className="chat-novas" onClick={irProFim}>
            <i className="fas fa-arrow-down" /> {aba === "chat" ? "Novas mensagens" : "Novas rolagens"}
          </button>
        )}
      </div>
      {aba === "chat" && <CampoMensagem enviar={enviar} />}
    </>
  );
});

// Campo de texto à parte: digitar não redesenha a lista de mensagens.
function CampoMensagem({ enviar }: { enviar: (texto: string) => Promise<boolean> }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function mandar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      if (await enviar(t)) setTexto("");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="chat-input-row">
      <input
        type="text"
        value={texto}
        maxLength={LIMITE_MENSAGEM}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Digite uma mensagem..."
        aria-label="Mensagem"
        enterKeyHint="send"
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            mandar();
          }
        }}
      />
      <button type="button" title="Enviar" aria-label="Enviar" onClick={mandar} disabled={enviando || !texto.trim()}>
        <i className="fas fa-paper-plane" />
      </button>
    </div>
  );
}

function respondeuAoTeste(mensagens: MensagemSerializada[], testeId: string, meuUid: string): boolean {
  return mensagens.some(
    (m) =>
      m.tipo === "rolagem" &&
      m.uid === meuUid &&
      (m.detalhes as { solicitacaoTesteId?: string | null } | null)?.solicitacaoTesteId === testeId,
  );
}

// ─── Cartão ──────────────────────────────────────────────────

type Tom = "ataque" | "dano" | "teste" | "cura" | "ferida" | "turno" | "preset" | "livre";

function Cartao({
  tom,
  estado,
  icone,
  titulo,
  sub,
  hora,
  chips,
  children,
}: {
  tom: Tom;
  estado?: "sucesso" | "falha" | null;
  icone: string;
  titulo: string;
  sub?: string | null;
  hora: string;
  chips?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`chat-message rc rc-${tom}${estado ? ` ${estado}` : ""}`}>
      <div className="rc-topo">
        <span className="rc-icone" aria-hidden="true">
          <i className={`fas ${icone}`} />
        </span>
        <div className="rc-titulos">
          <span className="rc-titulo">{titulo}</span>
          {sub && <span className="rc-sub">{sub}</span>}
        </div>
        <span className="chat-hora">{hora}</span>
      </div>
      {chips && <div className="rc-chips">{chips}</div>}
      {children}
    </div>
  );
}

// "Ataque com Katana (Katana (Shiro))" → ["Ataque com Katana", "Katana (Shiro)"].
function separarParenteses(s: string): [string, string | null] {
  const m = /^(.+?) \((.+)\)$/.exec(s);
  return m ? [m[1], m[2]] : [s, null];
}

type Rotulo = { tom: Tom; icone: string; titulo: string; sub: string | null };

// O rótulo que a ficha mandou ("Atacar X (arma)", "Dano X: 1d8 cortante",
// "Atletismo"…) vira título, detalhe e ícone do cartão.
function lerRotulo(nome: string | null, pericia: string | null, contexto: string | null): Rotulo {
  if (pericia) return { tom: "teste", icone: "fa-dice-d20", titulo: pericia, sub: null };
  if (!nome) return { tom: "livre", icone: "fa-dice", titulo: "Rolagem", sub: null };
  // Ação e arma vêm separadas por " · "; mensagem antiga (sem contexto gravado)
  // trazia a arma entre parênteses.
  const separar = (s: string): [string, string | null] => {
    const ponto = s.indexOf(" · ");
    if (ponto > 0) return [s.slice(0, ponto), s.slice(ponto + 3)];
    return contexto ? [s, null] : separarParenteses(s);
  };
  if (contexto === "ataque" || nome.startsWith("Atacar ")) {
    const [titulo, sub] = separar(nome.replace(/^Atacar /, ""));
    return { tom: "ataque", icone: "fa-crosshairs", titulo, sub: sub ? `Ataque · ${sub}` : "Ataque" };
  }
  if (contexto === "dano" || nome.startsWith("Dano ")) {
    const resto = nome.replace(/^Dano /, "");
    const dois = resto.indexOf(": ");
    const [titulo, sub] = dois > 0 ? [resto.slice(0, dois), resto.slice(dois + 2)] : separar(resto);
    return { tom: "dano", icone: "fa-burst", titulo, sub: sub ? `Dano · ${sub}` : "Dano" };
  }
  if (contexto === "cura" || nome.startsWith("Dado de Vida")) {
    const dois = nome.indexOf(": ");
    return dois > 0
      ? { tom: "cura", icone: "fa-heart", titulo: nome.slice(0, dois), sub: nome.slice(dois + 2) }
      : { tom: "cura", icone: "fa-heart", titulo: nome, sub: null };
  }
  if (contexto === "preset") return { tom: "preset", icone: "fa-bookmark", titulo: nome, sub: "Preset" };
  if (contexto === "iniciativa") return { tom: "teste", icone: "fa-bolt", titulo: nome, sub: null };
  return { tom: "teste", icone: "fa-dice-d20", titulo: nome, sub: null };
}

type DadoGravado = { faces: number; sinal: 1 | -1; resultado: number };

// HTML dos dados a partir do que está gravado. Passa pelo filtro mesmo sendo
// montado aqui: linha antiga pode ter texto onde se espera número.
function htmlDosDados(rolls: DadoGravado[] | null | undefined, modificador: number): string {
  return sanitizarHtmlRolagem(
    formatarResultadoRolagemHtml({
      detalhes: (Array.isArray(rolls) ? rolls : []) as DadoRolado[],
      modificador: Number(modificador) || 0,
    }),
  );
}

type MensagemProps = {
  msg: MensagemSerializada;
  // Dano rolado logo depois deste ataque, mostrado no mesmo cartão.
  dano: MensagemSerializada | null;
  continua: boolean;
  jaRolou: boolean;
  meuUid: string;
  userName: string;
  sessionId: string;
  personagemId: string | null;
  onMensagemAtualizada: (msg: MensagemSerializada) => void;
};

const MensagemView = memo(function MensagemView({
  msg,
  dano,
  continua,
  jaRolou,
  meuUid,
  userName,
  sessionId,
  personagemId,
  onMensagemAtualizada,
}: MensagemProps) {
  const hora = formatoHora.format(new Date(msg.timestamp));
  const minha = msg.uid === meuUid;
  const nome = minha ? "Você" : msg.nome;

  if (msg.tipo === "rolagem" && msg.detalhes) {
    return <RolagemView msg={msg} hora={hora} nome={nome} dano={dano} />;
  }

  if (msg.tipo === "teste" && msg.detalhes) {
    return (
      <TesteMensagemView
        msg={msg}
        hora={hora}
        jaRolou={jaRolou}
        userName={userName}
        sessionId={sessionId}
        personagemId={personagemId}
        onMensagemAtualizada={onMensagemAtualizada}
      />
    );
  }

  if ((msg.tipo === "dano" || msg.tipo === "cura" || msg.tipo === "turno") && msg.detalhes) {
    // O PV só aparece pra quem é o personagem (ou está na ficha dele).
    const de = (msg.detalhes as { personagemId?: unknown }).personagemId;
    const dono = minha || (typeof de === "string" && de === personagemId);
    return msg.tipo === "turno" ? (
      <TurnoMensagemView msg={msg} hora={hora} dono={dono} />
    ) : (
      <VidaMensagemView msg={msg} hora={hora} dono={dono} />
    );
  }

  // Aviso do sistema (combate): uma linha discreta no registro.
  if (!UUID.test(msg.uid)) {
    const texto = msg.mensagem ?? "";
    // "usou X em Y." continua a frase; "X: Y errou." é outra oração.
    const frase = /^\p{Ll}/u.test(texto);
    return (
      <div className="log-linha">
        <span className="chat-hora">{hora}</span>
        <span>
          <strong>{msg.nome}</strong>
          {frase ? " " : " · "}
          {texto}
        </span>
      </div>
    );
  }

  return (
    <div className={"chat-fala" + (minha ? " propria" : "") + (continua ? " continua" : "")}>
      {!continua && (
        <div className="chat-fala-topo">
          <strong>{nome}</strong>
          <span className="chat-hora">{hora}</span>
        </div>
      )}
      <div className="chat-fala-texto">{msg.mensagem}</div>
    </div>
  );
});

type DetalhesRolagem = {
  kind?: "rolagem" | "lote";
  rolls?: DadoGravado[] | null;
  execucoes?: Array<{
    total: number;
    modificador: number;
    modo?: "normal" | "vantagem" | "desvantagem";
    rolls?: DadoGravado[] | null;
    // Lote contextual: string HTML já formatada da linha (descartado/crit/piso).
    texto?: string | null;
  }>;
  quantidade?: number;
  modo?: "normal" | "vantagem" | "desvantagem";
  nomePreset?: string | null;
  // Rolagem contextual persiste a string já formatada (vantagem, crit, fontes).
  texto?: string | null;
  contexto?: string | null;
  pericia?: string | null;
  cd?: number | null;
  ocultarRolagem?: boolean | null;
  ocultarResultado?: boolean | null;
  sucesso?: boolean | null;
  privacidadeResultado?: boolean | null;
};

// Mensagem bem antiga guardava só a lista de dados.
function detalhesDaRolagem(msg: MensagemSerializada): DetalhesRolagem {
  return Array.isArray(msg.detalhes)
    ? { rolls: msg.detalhes as DadoGravado[] }
    : ((msg.detalhes ?? {}) as DetalhesRolagem);
}

function rotuloDaRolagem(msg: MensagemSerializada): Rotulo {
  const d = detalhesDaRolagem(msg);
  return lerRotulo(
    typeof d.nomePreset === "string" ? d.nomePreset : null,
    typeof d.pericia === "string" ? d.pericia : null,
    typeof d.contexto === "string" ? d.contexto : null,
  );
}

// O dano rolado logo depois de um ataque (mesma ação, mesmo jogador) entra no
// cartão do ataque, em vez de virar outra mensagem.
const JANELA_ATAQUE_MS = 5 * 60 * 1000;

function emparelharAtaques(lista: MensagemSerializada[]) {
  const danoDe = new Map<string, MensagemSerializada>();
  const consumidas = new Set<string>();
  lista.forEach((m, i) => {
    if (m.tipo !== "rolagem" || !m.detalhes) return;
    const r = rotuloDaRolagem(m);
    if (r.tom !== "ataque") return;
    const t0 = Date.parse(m.timestamp);
    for (let j = i + 1; j < lista.length; j++) {
      const n = lista[j];
      if (Date.parse(n.timestamp) - t0 > JANELA_ATAQUE_MS) break;
      // Aviso do combate e fala de outros não interrompem; a próxima rolagem do mesmo jogador decide.
      if (n.tipo !== "rolagem" || n.uid !== m.uid || !n.detalhes) continue;
      const rn = rotuloDaRolagem(n);
      if (rn.tom === "dano" && rn.titulo === r.titulo && !consumidas.has(n.id)) {
        danoDe.set(m.id, n);
        consumidas.add(n.id);
      }
      break;
    }
  });
  return { danoDe, consumidas };
}

function RolagemView({
  msg,
  hora,
  nome,
  dano,
}: {
  msg: MensagemSerializada;
  hora: string;
  nome: string;
  dano?: MensagemSerializada | null;
}) {
  const d = detalhesDaRolagem(msg);
  const ehLote = d.kind === "lote" && Array.isArray(d.execucoes);
  const execucoes = ehLote ? d.execucoes ?? [] : [];
  const quantidade = ehLote ? Number(d.quantidade) || execucoes.length : 0;
  const modo = d.modo === "vantagem" || d.modo === "desvantagem" ? d.modo : "normal";
  const resultadoOculto = d.ocultarResultado ?? d.privacidadeResultado === false;
  const sucesso = resultadoOculto ? null : d.sucesso ?? null;
  const rotulo = lerRotulo(
    typeof d.nomePreset === "string" ? d.nomePreset : null,
    typeof d.pericia === "string" ? d.pericia : null,
    typeof d.contexto === "string" ? d.contexto : null,
  );
  const sub = [nome, rotulo.sub].filter(Boolean).join(" · ");

  const chips = (
    <>
      {modo !== "normal" && (
        <span className={"rc-chip " + (modo === "vantagem" ? "bom" : "ruim")}>
          <i className={`fas ${modo === "vantagem" ? "fa-arrow-up" : "fa-arrow-down"}`} />
          {modo === "vantagem" ? "Vantagem" : "Desvantagem"}
        </span>
      )}
      {ehLote && (
        <span className="rc-chip">
          <i className="fas fa-layer-group" />
          {quantidade}×
        </span>
      )}
      {typeof d.cd === "number" && <span className="rc-chip">CD {d.cd}</span>}
      {sucesso === true && (
        <span className="rc-chip bom">
          <i className="fas fa-check" />
          Sucesso
        </span>
      )}
      {sucesso === false && (
        <span className="rc-chip ruim">
          <i className="fas fa-xmark" />
          Falha
        </span>
      )}
    </>
  );
  const temChips = modo !== "normal" || ehLote || typeof d.cd === "number" || sucesso !== null;
  const rotuloDano = dano ? rotuloDaRolagem(dano) : null;

  return (
    <Cartao
      tom={rotulo.tom}
      estado={sucesso === true ? "sucesso" : sucesso === false ? "falha" : null}
      icone={rotulo.icone}
      titulo={rotulo.titulo}
      sub={sub}
      hora={hora}
      chips={temChips ? chips : null}
    >
      <CorpoRolagem msg={msg} />
      {dano && rotuloDano && (
        <div className="rc-bloco-dano">
          <div className="rc-bloco-topo">
            <i className="fas fa-burst" aria-hidden="true" />
            <span>{rotuloDano.sub ?? "Dano"}</span>
            <span className="chat-hora">{formatoHora.format(new Date(dano.timestamp))}</span>
          </div>
          <CorpoRolagem msg={dano} />
        </div>
      )}
    </Cartao>
  );
}

function CorpoRolagem({ msg }: { msg: MensagemSerializada }) {
  const d = detalhesDaRolagem(msg);
  const ehLote = d.kind === "lote" && Array.isArray(d.execucoes);
  const execucoes = ehLote ? d.execucoes ?? [] : [];
  const resultadoOculto = d.ocultarResultado ?? d.privacidadeResultado === false;
  const rolagemOculta = d.ocultarRolagem ?? false;
  const notas = ehLote && d.texto ? sanitizarHtmlRolagem(d.texto) : "";

  let corpo: ReactNode;
  if (resultadoOculto || rolagemOculta) {
    corpo = (
      <div className="rc-corpo">
        {!ehLote && <div className="rc-total">{resultadoOculto ? "?" : msg.total ?? "?"}</div>}
        <div className="rc-oculto">
          <i className="fas fa-eye-slash" /> {resultadoOculto ? "Resultado oculto" : "Rolagem privada"}
        </div>
      </div>
    );
  } else if (ehLote) {
    corpo = (
      <>
        <div className="rc-lote">
          {execucoes.map((e, i) => (
            <div key={i} className="rc-lote-linha">
              <span className="rc-lote-n">#{i + 1}</span>
              <span className="rc-lote-total">{Number(e.total) || 0}</span>
              <span
                className="rc-dados"
                dangerouslySetInnerHTML={{
                  __html: e.texto ? sanitizarHtmlRolagem(e.texto) : htmlDosDados(e.rolls, e.modificador),
                }}
              />
            </div>
          ))}
        </div>
        {notas && <div className="rc-notas" dangerouslySetInnerHTML={{ __html: notas }} />}
      </>
    );
  } else {
    corpo = (
      <div className="rc-corpo">
        <div className="rc-total">{msg.total ?? "?"}</div>
        <div
          className="rc-dados"
          dangerouslySetInnerHTML={{
            __html: d.texto ? sanitizarHtmlRolagem(d.texto) : htmlDosDados(d.rolls, msg.modificador || 0),
          }}
        />
      </div>
    );
  }
  return <>{corpo}</>;
}

// Dano recebido ou cura manual, gravados pela ficha (lib/dano.ts).
function VidaMensagemView({
  msg,
  hora,
  dono,
}: {
  msg: MensagemSerializada;
  hora: string;
  dono: boolean;
}) {
  const d = msg.detalhes as {
    partes?: { texto: string }[];
    final?: number;
    absorvido?: number;
    hpTemp?: [number, number];
    hpAtual?: [number, number];
    hpMax?: number;
    pvNegativos?: [number, number];
    caiu?: boolean;
    morreu?: boolean;
    concentracao?: { nome: string; cd: number } | null;
    perdeuConcentracao?: string | null;
    acabaram?: string[];
  };
  const dano = msg.tipo === "dano";
  const total = msg.total ?? 0;
  const [pvAntes, pvDepois] = d.hpAtual ?? [0, 0];
  const [tempAntes, tempDepois] = d.hpTemp ?? [0, 0];
  const [negAntes, negDepois] = d.pvNegativos ?? [0, 0];
  return (
    <Cartao
      tom={dano ? "ferida" : "cura"}
      icone={dano ? "fa-heart-crack" : "fa-heart"}
      titulo={dano ? "Dano recebido" : "Cura"}
      sub={msg.nome}
      hora={hora}
    >
      <div className="rc-corpo">
        <div className="rc-total">{dano ? `−${total}` : `+${total}`}</div>
        <div className="vida-linhas">
          {(d.partes ?? []).map((p, i) => (
            <div key={i}>{p.texto}</div>
          ))}
          {dono && dano && tempAntes !== tempDepois && (
            <div>
              PV temporário {tempAntes} → {tempDepois}
            </div>
          )}
          {dono && pvAntes !== pvDepois && (
            <div>
              PV {pvAntes} → {pvDepois}
              {d.hpMax ? ` / ${d.hpMax}` : ""}
            </div>
          )}
          {dono && dano && negDepois > 0 && (
            <div>
              PV negativos {negAntes} → {negDepois}
              {d.hpMax ? ` / ${d.hpMax}` : ""}
            </div>
          )}
          {d.morreu ? (
            <div className="vida-caiu">Morreu</div>
          ) : d.caiu ? (
            <div className="vida-caiu">Ficou incapacitado</div>
          ) : null}
          {(d.acabaram ?? []).map((nome) => (
            <div key={nome}>{nome} acabou</div>
          ))}
          {d.perdeuConcentracao && <div>Perdeu a concentração em {d.perdeuConcentracao}</div>}
          {d.concentracao && (
            <div>
              Concentração em {d.concentracao.nome}: salvaguarda de CON, CD {d.concentracao.cd}
            </div>
          )}
        </div>
      </div>
    </Cartao>
  );
}

const ICONE_TURNO: Record<string, string> = {
  cura: "fa-heart",
  pv_temp: "fa-shield-heart",
  dano: "fa-heart-crack",
  recurso: "fa-droplet",
  fim: "fa-hourglass-end",
};

// Dados gravados no turno, só com números (vão pra HTML).
function dadosDoTurno(raw: unknown): { detalhes: DadoRolado[]; modificador: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { detalhes?: unknown; modificador?: unknown };
  if (!Array.isArray(obj.detalhes) || obj.detalhes.length === 0) return null;
  return {
    detalhes: obj.detalhes.map((x) => {
      const dado = (x ?? {}) as { faces?: unknown; sinal?: unknown; resultado?: unknown };
      return {
        faces: Math.trunc(Number(dado.faces) || 0),
        sinal: Number(dado.sinal) === -1 ? -1 : 1,
        resultado: Math.trunc(Number(dado.resultado) || 0),
      };
    }),
    modificador: Math.trunc(Number(obj.modificador) || 0),
  };
}

// Passar turno, gravado pela ficha (lib/turno.ts): cada efeito com a rolagem aberta.
function TurnoMensagemView({
  msg,
  hora,
  dono,
}: {
  msg: MensagemSerializada;
  hora: string;
  dono: boolean;
}) {
  const d = msg.detalhes as {
    linhas?: { fonte: string; texto: string; o?: string; rolagem?: unknown; detalhe?: string }[];
    hpAtual?: [number, number];
    hpMax?: number;
    caiu?: boolean;
    morreu?: boolean;
    perdeuConcentracao?: string | null;
    testes?: { nome: string; cds: number[] } | null;
  };
  const [pvAntes, pvDepois] = d.hpAtual ?? [0, 0];
  const linhas = d.linhas ?? [];
  const temRodape =
    (dono && pvAntes !== pvDepois) ||
    d.morreu ||
    d.caiu ||
    !!d.perdeuConcentracao ||
    (d.testes?.cds.length ?? 0) > 0;
  return (
    <Cartao tom="turno" icone="fa-hourglass-half" titulo="Passou o turno" sub={msg.nome} hora={hora}>
      {linhas.length > 0 && (
        <div className="turno-efeitos">
          {linhas.map((l, i) => {
            const rolagem = dadosDoTurno(l.rolagem);
            return (
              <div key={i} className={`turno-efeito ${ICONE_TURNO[l.o ?? ""] ? l.o : ""}`}>
                <div className="turno-efeito-fonte">
                  <i className={`fas ${ICONE_TURNO[l.o ?? ""] ?? "fa-clock-rotate-left"}`} /> {l.fonte}
                </div>
                <div className="turno-efeito-total">{l.texto}</div>
                {rolagem && (
                  <div
                    className="rc-dados"
                    dangerouslySetInnerHTML={{
                      __html: sanitizarHtmlRolagem(formatarResultadoRolagemHtml(rolagem)),
                    }}
                  />
                )}
                {l.detalhe && <div className="turno-efeito-detalhe">{l.detalhe}</div>}
              </div>
            );
          })}
        </div>
      )}
      {temRodape && (
        <div className="vida-linhas">
          {dono && pvAntes !== pvDepois && (
            <div>
              PV {pvAntes} → {pvDepois}
              {d.hpMax ? ` / ${d.hpMax}` : ""}
            </div>
          )}
          {d.morreu ? (
            <div className="vida-caiu">Morreu</div>
          ) : d.caiu ? (
            <div className="vida-caiu">Ficou incapacitado</div>
          ) : null}
          {d.perdeuConcentracao && <div>Perdeu a concentração em {d.perdeuConcentracao}</div>}
          {d.testes?.cds.map((cd, i) => (
            <div key={`cd-${i}`}>
              Concentração em {d.testes!.nome}: salvaguarda de CON, CD {cd}
            </div>
          ))}
        </div>
      )}
    </Cartao>
  );
}

function tomDoStatus(status: string): string {
  if (status.startsWith("Sucesso")) return " bom";
  if (status.startsWith("Falha")) return " ruim";
  return "";
}

function TesteMensagemView({
  msg,
  hora,
  jaRolou,
  userName,
  sessionId,
  personagemId,
  onMensagemAtualizada,
}: {
  msg: MensagemSerializada;
  hora: string;
  jaRolou: boolean;
  userName: string;
  sessionId: string;
  personagemId: string | null;
  onMensagemAtualizada: (msg: MensagemSerializada) => void;
}) {
  const detalhes = msg.detalhes as {
    pericia?: string | null;
    cd?: number | null;
    cdInterna?: number | null;
    privacidadeCd?: boolean;
    privacidadeResultado?: boolean;
    ocultarCd?: boolean;
    ocultarRolagem?: boolean;
    ocultarResultado?: boolean;
    alvos?: string[] | "TODOS";
    alvosNomes?: string[];
    statusPorNome?: Record<string, string>;
    modosPorAlvo?: Record<string, "normal" | "vantagem" | "desvantagem">;
    bonusPorAlvo?: Record<string, number>;
    bonusDetalhesPorAlvo?: Record<string, string>;
    dadosPorAlvo?: Record<string, Array<{ faces: number; sinal: 1 | -1 }>>;
    progressivosPorAlvo?: Record<string, Array<{ fonte: string; formula: string; em: string; soma?: number; passos?: number }>>;
  };
  const [rolando, setRolando] = useState(false);

  const isNarrador = !personagemId;
  const isAlvo =
    !isNarrador &&
    (detalhes.alvos === "TODOS" ||
      (Array.isArray(detalhes.alvos) && !!personagemId && detalhes.alvos.includes(personagemId)));
  const envolvidos = detalhes.alvosNomes || [];
  const modoAtual = personagemId ? detalhes.modosPorAlvo?.[personagemId] ?? "normal" : "normal";
  const bonusAtual = personagemId ? detalhes.bonusPorAlvo?.[personagemId] ?? 0 : 0;
  const bonusDetalhado = personagemId ? detalhes.bonusDetalhesPorAlvo?.[personagemId] ?? null : null;
  // Dados a mais dos efeitos (ex.: +1d4 em testes), rolados junto do d20.
  const dadosExtras = personagemId ? detalhes.dadosPorAlvo?.[personagemId] ?? [] : [];
  // Bônus progressivos que sobem, perdem ou zeram a cada rolagem.
  const progressivos = personagemId ? detalhes.progressivosPorAlvo?.[personagemId] ?? [] : [];
  const cdInterna =
    typeof detalhes.cdInterna === "number"
      ? detalhes.cdInterna
      : typeof detalhes.cd === "number"
        ? detalhes.cd
        : null;
  const ocultarCd = detalhes.ocultarCd ?? (detalhes.privacidadeCd === false);
  const ocultarRolagem = detalhes.ocultarRolagem ?? false;
  const ocultarResultado = detalhes.ocultarResultado ?? (detalhes.privacidadeResultado === false);

  if (!isNarrador && !isAlvo) {
    return null;
  }

  async function resolverTeste() {
    if (rolando || !isAlvo || jaRolou) return;
    setRolando(true);
    try {
      const resultado = rolarDados([{ faces: 20, sinal: 1 }, ...dadosExtras], bonusAtual, modoAtual);
      const sucesso = typeof cdInterna === "number" ? resultado.total >= cdInterna : null;
      const mensagem = await registrarRolagem(
        sessionId,
        userName,
        {
          tipo: "rolagem",
          total: resultado.total,
          detalhes: resultado.detalhes,
          modificador: bonusAtual,
          modo: modoAtual,
          nomePreset: null,
          tipoTeste: true,
          pericia: detalhes.pericia || null,
          cd: ocultarCd ? null : detalhes.cd ?? null,
          sucesso,
          privacidadeResultado: !ocultarResultado,
          ocultarRolagem,
          ocultarResultado,
          bonusDetalhe: bonusDetalhado,
          bonusTotal: bonusAtual,
          solicitacaoTesteId: msg.id,
          alvoNome: userName,
        },
      );
      onMensagemAtualizada(mensagem);
      // A aba dona do efeito grava a contagem, como na rolagem do Rolador.
      for (const p of progressivos) {
        window.dispatchEvent(
          new CustomEvent<PassosDoRolador>(EVENTO_PASSOS, {
            detail:
              typeof p.passos === "number"
                ? { fonte: p.fonte, formula: p.formula, em: p.em, passos: p.passos }
                : { fonte: p.fonte, formula: p.formula, em: p.em, soma: p.soma ?? 1 },
          }),
        );
      }
    } catch (error) {
      console.error(error);
      avisarErro(error, "Erro ao rolar o teste.");
    } finally {
      setRolando(false);
    }
  }

  const titulo = detalhes.pericia || "Teste";
  const cdVisivel = typeof detalhes.cd === "number" && !ocultarCd;

  if (isNarrador) {
    return (
      <Cartao
        tom="teste"
        icone="fa-dice-d20"
        titulo={titulo}
        sub={`Teste pedido a ${envolvidos.length} ${envolvidos.length === 1 ? "personagem" : "personagens"}`}
        hora={hora}
        chips={typeof cdInterna === "number" ? <span className="rc-chip">CD {cdInterna}</span> : null}
      >
        <div className="teste-lista">
          {envolvidos.length === 0 ? (
            <div className="teste-lista-item vazia">Sem envolvidos</div>
          ) : (
            envolvidos.map((nome) => {
              const status = detalhes.statusPorNome?.[nome] || "Aguardando";
              return (
                <div key={nome} className="teste-lista-item">
                  <span className="nome">{nome}</span>
                  <span className={"status" + tomDoStatus(status)}>{status}</span>
                </div>
              );
            })
          )}
        </div>
      </Cartao>
    );
  }

  return (
    <Cartao
      tom="teste"
      icone="fa-dice-d20"
      titulo={titulo}
      sub="O narrador pediu um teste"
      hora={hora}
      chips={
        <>
          {cdVisivel && <span className="rc-chip">CD {detalhes.cd}</span>}
          <span className="rc-chip" title={bonusDetalhado ?? undefined}>
            Bônus {bonusAtual >= 0 ? "+" : "−"}
            {Math.abs(bonusAtual)}
          </span>
          {modoAtual !== "normal" && (
            <span className={"rc-chip " + (modoAtual === "vantagem" ? "bom" : "ruim")}>
              <i className={`fas ${modoAtual === "vantagem" ? "fa-arrow-up" : "fa-arrow-down"}`} />
              {modoAtual === "vantagem" ? "Vantagem" : "Desvantagem"}
            </span>
          )}
        </>
      }
    >
      {bonusDetalhado && !jaRolou && <div className="teste-bonus">{bonusDetalhado}</div>}
      {jaRolou ? (
        <div className="teste-feito">
          <i className="fas fa-check" /> Teste realizado
        </div>
      ) : (
        <button type="button" className="teste-btn" onClick={resolverTeste} disabled={rolando}>
          <i className="fas fa-dice-d20" /> {rolando ? "Rolando..." : "Rolar teste"}
        </button>
      )}
    </Cartao>
  );
}
