"use client";

// Peças do navio (tamanho, casco, mastros, velas, canhões, fortificação, motor,
// leme e cômodos), na criação e na reforma.

import {
  CANHOES_NAVIO,
  COMODOS_NAVIO,
  FORTIFICACOES_NAVIO,
  LEMES_NAVIO,
  MADEIRAS_NAVIO,
  MASTROS_NAVIO,
  MOTORES_NAVIO,
  TAMANHOS_NAVIO,
  VELAS_NAVIO,
  espacoDosComodos,
  lerMontagem,
  metrosPorRodada,
  statsTamanho,
  velocidadeDoNavio,
  type MontagemNavio,
} from "@/lib/navio";
import { CampoPasso, Segmentos } from "./campos-modal";

export function CamposMontagemNavio({
  montagem,
  onChange,
  aoTrocarTamanho,
}: {
  montagem: MontagemNavio;
  onChange: (m: MontagemNavio) => void;
  // Outro tamanho: na criação vem o modelo do livro; sem isso, as peças ficam e
  // os números se ajustam ao tamanho novo.
  aoTrocarTamanho?: (slug: string) => MontagemNavio;
}) {
  const tamanho = statsTamanho(montagem.tamanho);
  const velocidade = velocidadeDoNavio(montagem);
  // O que sai daqui passa pelo `lerMontagem`: números e cômodos dentro do tamanho.
  const mudar = (patch: Partial<MontagemNavio>) => onChange(lerMontagem({ ...montagem, ...patch }) ?? montagem);
  const espaco = espacoDosComodos(montagem.comodos);
  const quantos = (slug: string) => montagem.comodos.filter((c) => c === slug).length;
  function mudarComodo(slug: string, n: number) {
    const outros = montagem.comodos.filter((c) => c !== slug);
    mudar({ comodos: [...outros, ...Array.from({ length: Math.max(0, n) }, () => slug)] });
  }

  return (
    <>
      <div className="subficha-campo">
        <label>Tamanho</label>
        <div className="opcoes-grade">
          {TAMANHOS_NAVIO.map((t) => (
            <button
              type="button"
              key={t.slug}
              className={`opcao-card${montagem.tamanho === t.slug ? " ativo" : ""}`}
              aria-pressed={montagem.tamanho === t.slug}
              onClick={() => (aoTrocarTamanho ? onChange(aoTrocarTamanho(t.slug)) : mudar({ tamanho: t.slug }))}
            >
              <strong>{t.nome}</strong>
              <span>{t.pvMax} PV</span>
              <span>{t.canhoesMax} canhões</span>
            </button>
          ))}
        </div>
      </div>
      <div className="subficha-campo">
        <label>Madeira</label>
        <div className="opcoes-grade">
          {MADEIRAS_NAVIO.map((m) => (
            <button
              type="button"
              key={m.slug}
              className={`opcao-card${montagem.madeira === m.slug ? " ativo" : ""}`}
              aria-pressed={montagem.madeira === m.slug}
              onClick={() => mudar({ madeira: m.slug })}
            >
              <strong>{m.nome}</strong>
              <span>CR {m.cr}</span>
              <span>Redução {m.br}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="subficha-campo">
        <label>Mastros</label>
        <div className="subficha-linha">
          <CampoPasso
            valor={montagem.mastros}
            onChange={(n) => mudar({ mastros: n })}
            rotulo="Mastros"
            min={1}
            max={tamanho.mastrosMax}
          />
          <Segmentos
            rotulo="Tipo de mastro"
            valor={montagem.mastro}
            opcoes={MASTROS_NAVIO.map((x) => ({ valor: x.slug, rotulo: x.nome }))}
            onChange={(v) => mudar({ mastro: v })}
          />
        </div>
      </div>
      <div className="subficha-campo">
        <label>Velas</label>
        <div className="opcoes-grade">
          {VELAS_NAVIO.map((v) => (
            <button
              type="button"
              key={v.slug}
              className={`opcao-card${montagem.vela === v.slug ? " ativo" : ""}`}
              aria-pressed={montagem.vela === v.slug}
              onClick={() => mudar({ vela: v.slug })}
            >
              <strong>{v.nome}</strong>
              <span>+{v.nos[montagem.mastro]} nós por mastro</span>
            </button>
          ))}
        </div>
      </div>
      <div className="subficha-campo">
        <label>Canhões</label>
        <CampoPasso valor={montagem.canhoes} onChange={(n) => mudar({ canhoes: n })} rotulo="Canhões" max={tamanho.canhoesMax} />
        <div className="opcoes-grade" style={{ marginTop: 6 }}>
          {CANHOES_NAVIO.map((c) => (
            <button
              type="button"
              key={c.slug}
              className={`opcao-card${montagem.canhao === c.slug ? " ativo" : ""}`}
              aria-pressed={montagem.canhao === c.slug}
              onClick={() => mudar({ canhao: c.slug })}
            >
              <strong>{c.nome}</strong>
              <span>
                +{c.bonus} · {c.alcance} m
              </span>
              <span>{c.dano === 1 ? "Dano da munição" : c.dano > 1 ? "Dobro da munição" : "Metade da munição"}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="subficha-campo">
        <label>Fortificação</label>
        <Segmentos
          rotulo="Fortificação"
          valor={montagem.fortificacao}
          opcoes={FORTIFICACOES_NAVIO.map((f) => ({ valor: f.slug, rotulo: f.nome, ...(f.cr ? { sub: `+${f.cr} CR` } : {}) }))}
          onChange={(v) => mudar({ fortificacao: v })}
        />
      </div>
      <div className="subficha-campo">
        <label>Motor</label>
        <Segmentos
          rotulo="Motor"
          valor={montagem.motor}
          opcoes={MOTORES_NAVIO.map((x) => ({ valor: x.slug, rotulo: x.nome, ...(x.nos ? { sub: `+${x.nos} nós` } : {}) }))}
          onChange={(v) => mudar({ motor: v })}
        />
      </div>
      <div className="subficha-campo">
        <label>Leme</label>
        <Segmentos
          rotulo="Leme"
          valor={montagem.leme}
          opcoes={LEMES_NAVIO.map((x) => ({ valor: x.slug, rotulo: x.nome }))}
          onChange={(v) => mudar({ leme: v })}
        />
      </div>
      <div className="subficha-campo">
        <label>
          Cômodos · {espaco}/{tamanho.comodos}
        </label>
        <div className="opcoes-grade">
          {COMODOS_NAVIO.map((c) => {
            const n = quantos(c.slug);
            const travado = !!c.soMultiplo && montagem.mastro !== "multiplo";
            const cabe = espaco + c.ocupa <= tamanho.comodos;
            return c.varios ? (
              <div key={c.slug} className={`opcao-card comodo-varios${n > 0 ? " ativo" : !cabe ? " cheio" : ""}`} title={c.beneficio}>
                <strong>{c.nome}</strong>
                <CampoPasso
                  valor={n}
                  onChange={(v) => mudarComodo(c.slug, v)}
                  rotulo={c.nome}
                  max={n + (cabe ? Math.floor((tamanho.comodos - espaco) / Math.max(1, c.ocupa)) : 0)}
                />
              </div>
            ) : (
              <button
                type="button"
                key={c.slug}
                className={`opcao-card${n > 0 ? " ativo" : ""}`}
                aria-pressed={n > 0}
                disabled={travado || (n === 0 && !cabe)}
                title={travado ? "Só em mastro múltiplo" : c.beneficio}
                onClick={() => mudarComodo(c.slug, n > 0 ? 0 : 1)}
              >
                <strong>{c.nome}</strong>
                <span>฿ {c.preco.toLocaleString("pt-BR")}</span>
                <span>{c.ocupa === 1 ? "1 cômodo" : c.ocupa === 0 ? "fora da conta" : `${c.ocupa} cômodos`}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="subficha-velocidade">
        <i className="fas fa-wind" /> {velocidade.nos} nós · {metrosPorRodada(velocidade.nos).toLocaleString("pt-BR")} m por
        rodada <small>(velas +{velocidade.velas}, peso {velocidade.peso})</small>
      </p>
    </>
  );
}
