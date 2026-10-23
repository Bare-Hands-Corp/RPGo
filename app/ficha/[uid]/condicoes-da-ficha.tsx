"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { ChipCondicao, useCatalogoCondicoes } from "@/components/tipos-dano/condicoes";
import { DURACOES_CONDICAO, type CondicaoAtiva } from "@/lib/condicoes";
import { exigir, type Resultado } from "@/lib/acoes";
import { adicionarCondicao, encerrarBloqueio, removerCondicao } from "./actions";
import { lerBloqueios, tempoDoBloqueio } from "@/lib/colaterais";
import { Tooltip } from "@/components/tooltip";
import { Segmentos } from "./campos-modal";

function mostrarErro(err: unknown) {
  Swal.fire({
    icon: "error",
    title: "Erro",
    text: err instanceof Error ? err.message : "Operação falhou.",
    background: "var(--bg-card)",
    color: "var(--text-main)",
  });
}

// Condições do personagem fora do combate: os chips (× tira) e o "+ condição".
// Contam rodada no Passar turno; as com duração somem no descanso longo. No
// combate elas vão pra lista do combate e voltam pra cá quando ele acaba.
export function CondicoesDaFicha({ personagemId, condicoes }: { personagemId: string; condicoes: CondicaoAtiva[] }) {
  const router = useRouter();
  const catalogo = useCatalogoCondicoes();
  const [pendente, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  // 0 = a duração padrão da condição na Biblioteca.
  const [rodadas, setRodadas] = useState(0);

  function rodar(acao: () => Promise<Resultado>) {
    startTransition(async () => {
      try {
        exigir(await acao());
        router.refresh();
      } catch (err) {
        mostrarErro(err);
      }
    });
  }

  function aplicar() {
    if (!nome) return;
    rodar(() => adicionarCondicao(personagemId, { nome, rodadas }));
    setAberto(false);
    setNome("");
    setRodadas(0);
  }

  return (
    <div className={`recurso-linha condicoes-ficha${condicoes.length > 0 ? " ativo" : ""}`}>
      <span className="recurso-icone">
        <i className="fas fa-triangle-exclamation" />
      </span>
      <span className="recurso-nome">Condições</span>
      <button
        type="button"
        className="recurso-btn"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-label="Pôr condição"
        title="Pôr condição"
        disabled={pendente}
      >
        +
      </button>
      {condicoes.length > 0 && (
        <div className="condicoes-ficha-lista">
          {condicoes.map((c) => (
            <ChipCondicao key={c.id} nome={c.nome} rodadas={c.rodadas} origem={c.origem} mecanica={c.mecanica}>
              <button
                type="button"
                className="condicao-chip-botao"
                aria-label={`Tirar ${c.nome}`}
                disabled={pendente}
                onClick={() => rodar(() => removerCondicao(personagemId, c.id))}
              >
                <i className="fas fa-xmark" />
              </button>
            </ChipCondicao>
          ))}
        </div>
      )}
      {aberto && (
        <div className="condicoes-ficha-nova">
          <select value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Condição">
            <option value="">Escolher…</option>
            {catalogo.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Segmentos
            rotulo="Duração"
            valor={rodadas}
            opcoes={[
              { valor: 0, rotulo: "Padrão", titulo: "A duração padrão da condição na Biblioteca" },
              ...DURACOES_CONDICAO.map((d) => ({ valor: d.rodadas, rotulo: d.nome })),
            ]}
            onChange={setRodadas}
          />
          <p className="campo-dica">Fora do combate, a rodada conta no Passar turno.</p>
          <button type="button" className="btn-rect" onClick={aplicar} disabled={!nome || pendente}>
            Pôr condição
          </button>
        </div>
      )}
    </div>
  );
}

// Bloqueios dos efeitos colaterais: sem PP / sem Haki, com o tempo que falta.
// Contam no Passar turno, somem no descanso; o × encerra antes.
export function BloqueiosDaFicha({ personagemId, bloqueios: raw }: { personagemId: string; bloqueios: unknown }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const bloqueios = lerBloqueios(raw);
  if (bloqueios.length === 0) return null;
  return (
    <div className="recurso-linha bloqueios-ficha">
      <span className="recurso-icone">
        <i className="fas fa-ban" />
      </span>
      <span className="recurso-nome">Bloqueios</span>
      <div className="condicoes-ficha-lista">
        {bloqueios.map((b, i) => (
          <Tooltip
            key={i}
            titulo={b.tipo === "pp" ? "Sem PP" : "Sem Haki"}
            icone="fa-ban"
            cor="var(--danger)"
            texto={[
              b.tipo === "pp"
                ? "Ações e habilidades que gastam PP ficam travadas."
                : "Habilidades de origem Haki (e ações que vêm delas) ficam travadas.",
              b.fonte && `Colateral de ${b.fonte}`,
              "Conta no Passar turno; o descanso acaba.",
            ]}
          >
            <span className="bloqueio-chip" tabIndex={0}>
              {b.tipo === "pp" ? "Sem PP" : "Sem Haki"} · {tempoDoBloqueio(b.rodadas)}
              <button
                type="button"
                className="condicao-chip-botao"
                aria-label={`Encerrar ${b.tipo === "pp" ? "sem PP" : "sem Haki"}`}
                disabled={pendente}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      exigir(await encerrarBloqueio(personagemId, i));
                      router.refresh();
                    } catch (err) {
                      mostrarErro(err);
                    }
                  })
                }
              >
                <i className="fas fa-xmark" />
              </button>
            </span>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
