"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Swal from "sweetalert2";
import type { ResumoPersonagem } from "@/lib/resumo-personagem";
import type { CalendarioCarregado, ObjetivoPrazo } from "@/lib/calendario/carregar";
import { dataParaDias, dataRelativa, fasesLua } from "@/lib/calendario/engine";
import { formatarMod } from "@/lib/op-rpg";
import { IconeCal } from "@/app/calendario/[mesaId]/icones";
import { RelogioControles } from "@/app/calendario/[mesaId]/relogio";
import { situacaoPrazo } from "@/app/calendario/[mesaId]/prazos-card";
import { removerPersonagemDaMesa } from "./actions";
import type { SessaoSerializada } from "./sessao/types";

type Aba = "visao" | "sessao" | "calendario";

type Props = {
  mesaId: string;
  personagens: ResumoPersonagem[];
  sessao: SessaoSerializada | null;
  calendario: CalendarioCarregado;
  objetivos: ObjetivoPrazo[];
  onIrPara: (aba: Aba) => void;
  onPedirTeste: (personagemId?: string) => void;
};

// ─── Estado de cada jogador ─────────────────────────────────

type Alerta = { rotulo: string; grave: boolean };

function alertasDe(p: ResumoPersonagem): Alerta[] {
  const lista: Alerta[] = [];
  if (p.hpAtual <= 0) lista.push({ rotulo: "Caído", grave: true });
  else if (p.hpMax > 0 && p.hpAtual / p.hpMax <= 0.25) lista.push({ rotulo: "Vida baixa", grave: true });
  if (p.exaustao > 0) lista.push({ rotulo: `Exaustão ${p.exaustao}`, grave: p.exaustao >= 3 });
  return lista;
}

const precisaAtencao = (p: ResumoPersonagem) => alertasDe(p).some((a) => a.grave);
const pctVida = (p: ResumoPersonagem) => (p.hpMax > 0 ? p.hpAtual / p.hpMax : 0);

function iniciais(nome: string): string {
  return (nome || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function VisaoGeral({ mesaId, personagens, sessao, calendario, objetivos, onIrPara, onPedirTeste }: Props) {
  return (
    <div className="nv-layout">
      <div className="nv-principal">
        <ResumoGrupo personagens={personagens} />
        <Grupo mesaId={mesaId} personagens={personagens} onPedirTeste={onPedirTeste} />
      </div>
      <aside className="nv-lateral">
        <CardSessao sessao={sessao} onAbrir={() => onIrPara("sessao")} />
        <CardHoje
          mesaId={mesaId}
          calendario={calendario}
          objetivos={objetivos}
          onAbrir={() => onIrPara("calendario")}
        />
        <CardAtalhos onPedirTeste={() => onPedirTeste()} />
      </aside>
    </div>
  );
}

// ─── Resumo ─────────────────────────────────────────────────

function ResumoGrupo({ personagens }: { personagens: ResumoPersonagem[] }) {
  if (personagens.length === 0) return null;
  const hpAtual = personagens.reduce((s, p) => s + Math.max(0, p.hpAtual), 0);
  const hpMax = personagens.reduce((s, p) => s + p.hpMax, 0);
  const vidaGrupo = hpMax > 0 ? Math.round((hpAtual / hpMax) * 100) : 0;
  const atento = personagens.reduce((a, b) => (b.percepcaoPassiva > a.percepcaoPassiva ? b : a));
  const emAlerta = personagens.filter(precisaAtencao).length;

  return (
    <div className="nv-resumo">
      <div className="nv-resumo-card">
        <span className="nv-rotulo">Vida do grupo</span>
        <strong>{vidaGrupo}%</strong>
        <div className="nv-trilho">
          <span style={{ width: `${vidaGrupo}%`, background: "var(--bar-hp)" }} />
        </div>
      </div>
      <div className="nv-resumo-card" title="Quem tem mais chance de notar algo sem rolar">
        <span className="nv-rotulo">Maior perc. passiva</span>
        <strong>{atento.percepcaoPassiva}</strong>
        <small>{atento.nome}</small>
      </div>
      <div className={`nv-resumo-card ${emAlerta ? "alerta" : ""}`} title="Caídos, com vida baixa ou exaustão 3+">
        <span className="nv-rotulo">Precisam de atenção</span>
        <strong>{emAlerta}</strong>
        <small>{emAlerta ? "veja os destacados" : "todos bem"}</small>
      </div>
    </div>
  );
}

// ─── Grupo ──────────────────────────────────────────────────

function Grupo({
  mesaId,
  personagens,
  onPedirTeste,
}: {
  mesaId: string;
  personagens: ResumoPersonagem[];
  onPedirTeste: (id: string) => void;
}) {
  const [ordem, setOrdem] = useState<"vida" | "nome">("vida");
  const [removidos, setRemovidos] = useState<Set<string>>(new Set());

  const lista = useMemo(() => {
    const visiveis = personagens.filter((p) => !removidos.has(p.id));
    if (ordem === "nome") return visiveis;
    return [...visiveis].sort((a, b) => pctVida(a) - pctVida(b) || a.nome.localeCompare(b.nome));
  }, [personagens, removidos, ordem]);

  async function remover(p: ResumoPersonagem) {
    const { isConfirmed } = await Swal.fire({
      title: "Tem certeza?",
      text: `Remover "${p.nome}" desta mesa? A ficha não é apagada, só sai da mesa.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "var(--danger)",
      cancelButtonColor: "var(--text-sec)",
      confirmButtonText: "Sim, remover!",
      cancelButtonText: "Cancelar",
      background: "var(--bg-card)",
      color: "var(--text-main)",
    });
    if (!isConfirmed) return;

    setRemovidos((s) => new Set(s).add(p.id));
    try {
      await removerPersonagemDaMesa(mesaId, p.id);
      Swal.fire({
        icon: "success",
        title: "Removido da mesa!",
        text: `${p.nome} foi removido desta mesa.`,
        timer: 1200,
        showConfirmButton: false,
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    } catch (err) {
      setRemovidos((s) => {
        const n = new Set(s);
        n.delete(p.id);
        return n;
      });
      Swal.fire({
        icon: "error",
        title: "Erro",
        text: err instanceof Error ? err.message : "Não foi possível remover.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    }
  }

  return (
    <section className="nv-card">
      <div className="nv-card-topo">
        <span className="nv-titulo">
          <i className="fas fa-users" /> Grupo <span className="nv-contagem">{lista.length}</span>
        </span>
        {lista.length > 1 && (
          <div className="nv-ordem" role="group" aria-label="Ordenar jogadores">
            <span>Ordenar:</span>
            <button type="button" className={ordem === "vida" ? "ativo" : ""} onClick={() => setOrdem("vida")}>
              Vida
            </button>
            <button type="button" className={ordem === "nome" ? "ativo" : ""} onClick={() => setOrdem("nome")}>
              Nome
            </button>
          </div>
        )}
      </div>

      {lista.length === 0 ? (
        <div className="nv-vazio">
          <i className="fas fa-user-plus" />
          <strong>Nenhum jogador na mesa ainda</strong>
          <span>Compartilhe o código de convite do topo da página com seus jogadores.</span>
        </div>
      ) : (
        <ul className="nv-jogadores">
          {lista.map((p) => (
            <LinhaJogador key={p.id} p={p} onPedirTeste={() => onPedirTeste(p.id)} onRemover={() => remover(p)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LinhaJogador({
  p,
  onPedirTeste,
  onRemover,
}: {
  p: ResumoPersonagem;
  onPedirTeste: () => void;
  onRemover: () => void;
}) {
  const alertas = alertasDe(p);
  const grave = alertas.some((a) => a.grave);
  const total = Math.max(p.hpMax, p.hpAtual + p.hpTemp, 1);
  const pctHp = Math.max(0, Math.min(100, (Math.max(0, p.hpAtual) / total) * 100));
  const pctTemp = Math.min(100 - pctHp, (p.hpTemp / total) * 100);
  const pctPp = p.ppMax > 0 ? Math.max(0, Math.min(100, (p.ppAtual / p.ppMax) * 100)) : 0;

  return (
    <li className={`nv-jogador ${grave ? "alerta" : ""}`}>
      <Link href={`/ficha/${p.id}`} className="nv-avatar" title={`Abrir a ficha de ${p.nome}`}>
        {p.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.fotoUrl} alt="" />
        ) : (
          <span>{iniciais(p.nome)}</span>
        )}
        <span className="nv-nivel" title={`Nível ${p.nivel}`}>
          {p.nivel}
        </span>
      </Link>

      <div className="nv-identidade">
        <Link href={`/ficha/${p.id}`} className="nv-nome">
          {p.nome}
        </Link>
        {alertas.length > 0 && (
          <div className="nv-alertas">
            {alertas.map((a) => (
              <span key={a.rotulo} className={`nv-alerta ${a.grave ? "grave" : ""}`}>
                {a.rotulo}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="nv-barras">
        <div className="nv-barra-rotulo">
          <span>
            <i className="fas fa-heart" style={{ color: "var(--bar-hp)" }} /> Vida
          </span>
          <span className="nv-num">
            {p.hpAtual}
            {p.hpTemp > 0 && <em style={{ color: "var(--bar-hp-temp)" }}> +{p.hpTemp}</em>} / {p.hpMax}
          </span>
        </div>
        <div className="nv-trilho grosso">
          <span style={{ width: `${pctHp}%`, background: "var(--bar-hp)" }} />
          {pctTemp > 0 && <span style={{ width: `${pctTemp}%`, background: "var(--bar-hp-temp)" }} />}
        </div>
        <div className="nv-barra-rotulo">
          <span>
            <i className="fas fa-bolt" style={{ color: "var(--bar-pp)" }} /> Energia
          </span>
          <span className="nv-num">
            {p.ppAtual} / {p.ppMax}
          </span>
        </div>
        <div className="nv-trilho">
          <span style={{ width: `${pctPp}%`, background: "var(--bar-pp)" }} />
        </div>
      </div>

      <div className="nv-stats">
        <div className="nv-stat" title="Classe de Resistência">
          <span>CR</span>
          <strong>{p.cr}</strong>
        </div>
        <div className="nv-stat" title="Iniciativa">
          <span>Inic.</span>
          <strong>{formatarMod(p.iniciativa)}</strong>
        </div>
        <div className="nv-stat" title="Percepção passiva">
          <span>Perc.</span>
          <strong>{p.percepcaoPassiva}</strong>
        </div>
      </div>

      <div className="nv-acoes">
        <button type="button" onClick={onPedirTeste} title={`Pedir teste para ${p.nome}`} aria-label={`Pedir teste para ${p.nome}`}>
          <i className="fas fa-dice-d20" />
        </button>
        <Link href={`/ficha/${p.id}`} title="Abrir ficha" aria-label={`Abrir a ficha de ${p.nome}`}>
          <i className="fas fa-file-lines" />
        </Link>
        <button type="button" className="perigo" onClick={onRemover} title="Remover da mesa" aria-label={`Remover ${p.nome} da mesa`}>
          <i className="fas fa-user-minus" />
        </button>
      </div>
    </li>
  );
}

// ─── Coluna lateral ─────────────────────────────────────────

function CardSessao({ sessao, onAbrir }: { sessao: SessaoSerializada | null; onAbrir: () => void }) {
  const combate = sessao?.combateAtivo ?? null;
  const participantes = combate?.participantes ?? [];
  const daVez = combate ? participantes[combate.turnoAtual] : undefined;
  const proximo = combate && participantes.length > 1 ? participantes[(combate.turnoAtual + 1) % participantes.length] : undefined;

  return (
    <section className="nv-card nv-card-lateral nv-card-sessao">
      <div className="nv-card-topo">
        <span className="nv-titulo">
          <i className={`fas ${combate ? "fa-khanda" : "fa-bolt"}`} /> Sessão
        </span>
        <span className={`nv-status ${combate ? "combate" : sessao ? "ativa" : ""}`}>
          {combate ? "Em combate" : sessao ? "Ativa" : "Parada"}
        </span>
      </div>

      {combate ? (
        <div className="nv-sessao-corpo">
          <span className="nv-rotulo">Rodada {combate.rodadaAtual}</span>
          <div className="nv-vez">
            <span>Vez de</span>
            <strong>{daVez?.nomeExibicao ?? "—"}</strong>
          </div>
          {proximo && (
            <p className="nv-sub">
              Próximo: <b>{proximo.nomeExibicao}</b> · {participantes.length} no combate
            </p>
          )}
        </div>
      ) : (
        <p className="nv-sub">
          {sessao
            ? "Sessão em andamento, sem combate no momento."
            : "Nenhuma sessão ativa. Inicie uma para controlar combate e iniciativa."}
        </p>
      )}

      <button type="button" className="nv-btn" onClick={onAbrir}>
        {sessao ? "Abrir sessão" : "Ir para a sessão"} <i className="fas fa-arrow-right" />
      </button>
    </section>
  );
}

function CardHoje({
  mesaId,
  calendario,
  objetivos,
  onAbrir,
}: {
  mesaId: string;
  calendario: CalendarioCarregado;
  objetivos: ObjetivoPrazo[];
  onAbrir: () => void;
}) {
  const { config, dataAtualDias } = calendario;
  const hoje = dataParaDias(dataAtualDias, config);
  const lua = fasesLua(dataAtualDias, config.cicloLuaDias);
  const climaHoje = calendario.eventos.find((e) => e.tipo === "climatico" && e.dataDias === dataAtualDias);
  const tipoClima = climaHoje?.tipoClimaId
    ? calendario.tiposClima.find((t) => t.id === climaHoje.tipoClimaId)
    : undefined;

  // Atrasados primeiro, depois os mais próximos.
  const prazos = [...objetivos].sort((a, b) => a.prazoDias - b.prazoDias).slice(0, 3);

  return (
    <section className="nv-card nv-card-lateral">
      <div className="nv-card-topo">
        <span className="nv-titulo">
          <i className="fas fa-calendar-day" /> Hoje na campanha
        </span>
      </div>

      <div className="nv-hoje">
        <strong>
          {hoje.dia} de {hoje.nomeMes}
        </strong>
        <span className="nv-sub">
          {hoje.diaSemana} · {hoje.estacao} · ano {hoje.ano}
        </span>
      </div>
      <div className="nv-hoje-extras">
        <span title="Clima de hoje">
          {tipoClima ? (
            <>
              <IconeCal icone={tipoClima.icone} fallback="fa-cloud-sun" /> {tipoClima.nome}
            </>
          ) : climaHoje ? (
            <>
              <i className="fas fa-cloud-sun" /> {climaHoje.titulo}
            </>
          ) : (
            <>
              <i className="fas fa-cloud" /> Clima não definido
            </>
          )}
        </span>
        <span title="Fase da lua">
          <IconeCal icone={lua.icone} /> {lua.nome}
        </span>
      </div>

      <RelogioControles mesaId={mesaId} relogio={calendario.relogio} config={config} compacto />

      {prazos.length > 0 && (
        <ul className="nv-prazos">
          {prazos.map((o) => {
            const situacao = situacaoPrazo(o.prazoDias, dataAtualDias);
            return (
              <li key={o.id} className={situacao}>
                <i className={`fas ${o.icone}`} />
                <div>
                  <strong>{o.titulo}</strong>
                  <small>
                    {o.personagemNome} · {dataRelativa(o.prazoDias, dataAtualDias)}
                  </small>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className="nv-btn" onClick={onAbrir}>
        Abrir calendário <i className="fas fa-arrow-right" />
      </button>
    </section>
  );
}

function CardAtalhos({ onPedirTeste }: { onPedirTeste: () => void }) {
  return (
    <section className="nv-card nv-card-lateral">
      <div className="nv-card-topo">
        <span className="nv-titulo">
          <i className="fas fa-bolt-lightning" /> Atalhos
        </span>
      </div>
      <div className="nv-atalhos">
        <button type="button" onClick={onPedirTeste}>
          <i className="fas fa-dice-d20" />
          <span>Pedir teste</span>
        </button>
        <Link href="/bestiario">
          <i className="fas fa-paw" />
          <span>Bestiário</span>
        </Link>
        <Link href="/bestiario/encontros">
          <i className="fas fa-people-group" />
          <span>Encontros</span>
        </Link>
      </div>
    </section>
  );
}
