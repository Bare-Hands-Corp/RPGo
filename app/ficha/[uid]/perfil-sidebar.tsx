"use client";

import { useEffect, useOptimistic, useState } from "react";
import Link from "next/link";
import { EditableStat } from "./editable-stat";
import { EditFichaModal } from "./edit-ficha-modal";
import { AvatarUploadModal } from "./avatar-upload-modal";
import { RecursosSidebar, type Recurso } from "./recursos-sidebar";
import { CrEditavel } from "./cr-editavel";
import { ExaustaoControle } from "./exaustao-controle";
import {
  bonusProficiencia,
  formatarMod,
  iniciativa,
  lerProficiencias,
  modificador,
  percepcaoPassiva,
  progresso,
  type Atributo,
  type EfeitosAgregados,
} from "@/lib/op-rpg";
import { empilharD20 } from "@/lib/empilhar-rolagem";

type Personagem = {
  id: string;
  nome: string;
  nivel: number;
  pe: number;
  fotoUrl: string | null;
  hpAtual: number;
  hpMax: number;
  hpTemp: number;
  ppAtual: number;
  ppMax: number;
  exaustao: number;
  forca: number;
  destreza: number;
  constituicao: number;
  sabedoria: number;
  vontade: number;
  presenca: number;
  proficiencias: unknown;
  berries: number;
  tipoDadoVida: string;
  dadosVidaGastos: number;
  crOutros: number;
  recursos: Recurso[];
  itens: Array<{
    tipo: string;
    equipado: boolean;
    ca: number;
    penalidadeDes: number;
  }>;
};

function pct(atual: number, max: number): number {
  if (!max) return 0;
  return Math.max(0, Math.min(100, (atual / max) * 100));
}

type PatchPersonagem = Partial<
  Pick<
    Personagem,
    | "hpAtual"
    | "hpTemp"
    | "hpMax"
    | "ppAtual"
    | "ppMax"
    | "tipoDadoVida"
    | "forca"
    | "destreza"
    | "constituicao"
    | "sabedoria"
    | "vontade"
    | "presenca"
  >
>;

// Patch cross-tab via CustomEvent `rpgo:patch-personagem`. Deltas (somam ao
// valor atual) em vez de absolutos pra evitar precisar do snapshot completo
// do personagem em quem dispara (ex: HabilidadesTab).
type DeltaPersonagem = Partial<{
  deltaHpAtual: number;
  deltaHpTemp: number;
  deltaPpAtual: number;
  deltaHpMax: number;
  deltaPpMax: number;
}>;

function aplicarDelta(
  shadow: PatchPersonagem,
  inicial: Personagem,
  delta: DeltaPersonagem,
): PatchPersonagem {
  const next = { ...shadow };
  const soma = (campo: "hpAtual" | "hpTemp" | "ppAtual" | "hpMax" | "ppMax", d?: number) => {
    if (!d) return;
    const base = next[campo] ?? inicial[campo];
    next[campo] = Math.max(0, base + d);
  };
  soma("hpAtual", delta.deltaHpAtual);
  soma("hpTemp", delta.deltaHpTemp);
  soma("ppAtual", delta.deltaPpAtual);
  soma("hpMax", delta.deltaHpMax);
  soma("ppMax", delta.deltaPpMax);
  return next;
}

export function PerfilSidebar({
  personagem: inicial,
  efeitosAgregados,
}: {
  personagem: Personagem;
  efeitosAgregados: EfeitosAgregados;
}) {
  // useOptimistic do personagem inteiro: o EditFichaModal e qualquer outro
  // editor podem aplicar patches via `aplicarOtimista` pra refletir mudanças
  // antes do server responder.
  //
  // `shadow` é o canal de patch cross-tab — outros componentes (ex:
  // HabilidadesTab usando uma habilidade ativa) disparam o CustomEvent
  // `rpgo:patch-personagem` com deltas, e a sidebar reflete sem precisar de
  // prop drilling. Reseta quando inicial muda (Server Component re-renderizou
  // com a verdade).
  const [shadow, setShadow] = useState<PatchPersonagem>({});
  useEffect(() => {
    setShadow({});
  }, [inicial]);
  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<DeltaPersonagem>).detail;
      if (!det) return;
      setShadow((s) => aplicarDelta(s, inicial, det));
    }
    window.addEventListener("rpgo:patch-personagem", ouvir);
    return () => window.removeEventListener("rpgo:patch-personagem", ouvir);
  }, [inicial]);

  const [p, aplicarOtimista] = useOptimistic(
    { ...inicial, ...shadow },
    (state: Personagem, patch: PatchPersonagem) => ({ ...state, ...patch }),
  );

  const avatarSrc =
    p.fotoUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${p.id}`;

  const { peBase, peProximo } = progresso(p.pe);
  const pePct = peProximo
    ? Math.max(0, Math.min(100, ((p.pe - peBase) / (peProximo - peBase)) * 100))
    : 100;

  // CR ganha automaticamente o `ca` + `penalidadeDes` de cada armadura equipada.
  const bonusArmadura = p.itens.reduce(
    (acc, i) => (i.tipo === "armadura" && i.equipado ? acc + i.ca + i.penalidadeDes : acc),
    0,
  );

  // Atributos efetivos: valor base + bônus vindo de habilidades.
  // Usado pelos cards de atributo (exibição) e por derivados (Iniciativa,
  // Percepção Passiva). CR tem caminho próprio em CrEditavel (recebe DES).
  const atributosEfetivos: Record<Atributo, number> = {
    forca: p.forca + (efeitosAgregados.bonusAtributo.forca?.valor ?? 0),
    destreza: p.destreza + (efeitosAgregados.bonusAtributo.destreza?.valor ?? 0),
    constituicao:
      p.constituicao + (efeitosAgregados.bonusAtributo.constituicao?.valor ?? 0),
    sabedoria: p.sabedoria + (efeitosAgregados.bonusAtributo.sabedoria?.valor ?? 0),
    vontade: p.vontade + (efeitosAgregados.bonusAtributo.vontade?.valor ?? 0),
    presenca: p.presenca + (efeitosAgregados.bonusAtributo.presenca?.valor ?? 0),
  };

  // Percepção Passiva considera proficiência em Percepção, manual OU via habilidade.
  const profPercepcao =
    lerProficiencias(p.proficiencias).pericias.includes("percepcao") ||
    !!efeitosAgregados.proficienciasPericia.percepcao;

  // Pools efetivos: (base + aditivo) × fator. Mantém o banco como "valor base"
  // e a UI mostra o total. Arredondamento por Math.round (regra padrão do RPG).
  const multHpMax = efeitosAgregados.multiplicadores["hp-max"];
  const multPpMax = efeitosAgregados.multiplicadores["pp-max"];
  const hpMaxBase = p.hpMax + efeitosAgregados.bonusHpMax.valor;
  const ppMaxBase = p.ppMax + efeitosAgregados.bonusPpMax.valor;
  const hpMaxEfetivo = multHpMax ? Math.round(hpMaxBase * multHpMax.fator) : hpMaxBase;
  const ppMaxEfetivo = multPpMax ? Math.round(ppMaxBase * multPpMax.fator) : ppMaxBase;

  return (
    <aside className="sidebar">
      <div className="sidebar-icons right">
        <EditFichaModal
          personagemId={p.id}
          inicial={{
            hpMax: p.hpMax,
            ppMax: p.ppMax,
            tipoDadoVida: p.tipoDadoVida,
            forca: p.forca,
            destreza: p.destreza,
            constituicao: p.constituicao,
            sabedoria: p.sabedoria,
            vontade: p.vontade,
            presenca: p.presenca,
          }}
          onOtimista={aplicarOtimista}
        />
      </div>

      <div className="profile-header">
        <AvatarUploadModal personagemId={p.id} avatarAtual={avatarSrc} />
        <h2 className="char-name">{p.nome || "Sem Nome"}</h2>
        <span className="char-level">
          Nível{" "}
          <EditableStat personagemId={p.id} campo="nivel" valor={p.nivel} />
          <span className="char-prof">
            {" · Prof "}
            {formatarMod(bonusProficiencia(p.nivel))}
          </span>
        </span>
        <div className="pe-bar">
          <div className="pe-track">
            <div className="pe-fill" style={{ width: `${pePct}%` }} />
          </div>
          <div className="pe-label">
            <EditableStat personagemId={p.id} campo="pe" valor={p.pe} formato="milhar" />
            {peProximo && (
              <span className="pe-prox"> / {peProximo.toLocaleString("pt-BR")}</span>
            )}
          </div>
        </div>
      </div>

      <hr />

      <div className="bar-group bar-hp">
        <div className="bar-label">
          <span><i className="fas fa-heart" /> Vida</span>
          <div className="stat-values">
            <EditableStat
              personagemId={p.id}
              campo="hpAtual"
              valor={p.hpAtual}
              max={hpMaxEfetivo}
              onOtimista={(novo) => aplicarOtimista({ hpAtual: novo })}
            />
            {" / "}
            <span
              title={
                [
                  efeitosAgregados.bonusHpMax.fontes.length
                    ? `${formatarMod(efeitosAgregados.bonusHpMax.valor)} de ${efeitosAgregados.bonusHpMax.fontes.join(", ")}`
                    : null,
                  multHpMax
                    ? `×${multHpMax.fator} de ${multHpMax.fontes.join(", ")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            >
              {hpMaxEfetivo}
              {(efeitosAgregados.bonusHpMax.fontes.length > 0 || multHpMax) && (
                <i className="fas fa-link prof-fonte" />
              )}
            </span>
            <span className={`hp-temp ${p.hpTemp > 0 ? "ativo" : ""}`}>
              {" +"}
              <EditableStat
                personagemId={p.id}
                campo="hpTemp"
                valor={p.hpTemp}
                onOtimista={(novo) => aplicarOtimista({ hpTemp: novo })}
              />
            </span>
          </div>
        </div>
        {(() => {
          // Denominador escala quando atual+temp passa do max efetivo,
          // mantendo proporção visual coerente.
          const totalVisivel = Math.max(hpMaxEfetivo, p.hpAtual + p.hpTemp, 1);
          const hpPct = (Math.max(0, p.hpAtual) / totalVisivel) * 100;
          const tempPct = (Math.max(0, p.hpTemp) / totalVisivel) * 100;
          return (
            <div className="progress-track hp-track">
              <div className="progress-fill" style={{ width: `${hpPct}%` }} />
              <div className="progress-fill-temp" style={{ width: `${tempPct}%` }} />
            </div>
          );
        })()}
      </div>

      <div className="bar-group bar-en">
        <div className="bar-label">
          <span><i className="fas fa-bolt" /> Pontos de Poder</span>
          <div className="stat-values">
            <EditableStat
              personagemId={p.id}
              campo="ppAtual"
              valor={p.ppAtual}
              max={ppMaxEfetivo}
            />{" "}
            /{" "}
            <span
              title={
                [
                  efeitosAgregados.bonusPpMax.fontes.length
                    ? `${formatarMod(efeitosAgregados.bonusPpMax.valor)} de ${efeitosAgregados.bonusPpMax.fontes.join(", ")}`
                    : null,
                  multPpMax
                    ? `×${multPpMax.fator} de ${multPpMax.fontes.join(", ")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            >
              {ppMaxEfetivo}
              {(efeitosAgregados.bonusPpMax.fontes.length > 0 || multPpMax) && (
                <i className="fas fa-link prof-fonte" />
              )}
            </span>
          </div>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct(p.ppAtual, ppMaxEfetivo)}%` }} />
        </div>
      </div>

      <ExaustaoControle personagemId={p.id} exaustao={p.exaustao} />

      <div className="recurso-linha">
        <span className="recurso-icone"><i className="fas fa-dice" /></span>
        <span className="recurso-nome">Dado de Vida {p.tipoDadoVida}</span>
        <span className="stat-values">
          <span>{Math.max(0, p.nivel - p.dadosVidaGastos)}</span> /{" "}
          <span>{p.nivel}</span>
        </span>
      </div>

      <RecursosSidebar personagemId={p.id} recursos={p.recursos} />

      <div className="derivados-grid">
        <CrEditavel
          personagemId={p.id}
          destreza={atributosEfetivos.destreza}
          crOutros={p.crOutros}
          bonusArmadura={bonusArmadura + efeitosAgregados.bonusCR.valor}
        />
        <div
          className="derivado-card derivado-rolar"
          title={
            efeitosAgregados.bonusIniciativa.fontes.length
              ? `Empilhar Iniciativa · +${efeitosAgregados.bonusIniciativa.valor} de ${efeitosAgregados.bonusIniciativa.fontes.join(", ")}`
              : "Empilhar Iniciativa no Rolador"
          }
          onClick={() =>
            empilharD20(
              iniciativa(atributosEfetivos.destreza) +
                efeitosAgregados.bonusIniciativa.valor,
              "Iniciativa",
              { tipo: "iniciativa" },
            )
          }
        >
          <div className="derivado-label">Iniciativa</div>
          <div className="derivado-value">
            {formatarMod(
              iniciativa(atributosEfetivos.destreza) +
                efeitosAgregados.bonusIniciativa.valor,
            )}
          </div>
        </div>
        <div
          className="derivado-card"
          title={
            efeitosAgregados.bonusPercepcaoPassiva.fontes.length
              ? `${formatarMod(efeitosAgregados.bonusPercepcaoPassiva.valor)} de ${efeitosAgregados.bonusPercepcaoPassiva.fontes.join(", ")}`
              : undefined
          }
        >
          <div className="derivado-label">Perc. Pass.</div>
          <div className="derivado-value">
            {percepcaoPassiva({
              vontade: atributosEfetivos.vontade,
              nivel: p.nivel,
              proficienteEmPercepcao: profPercepcao,
            }) + efeitosAgregados.bonusPercepcaoPassiva.valor}
          </div>
        </div>
      </div>

      <div className="bar-label" style={{ marginTop: 15, color: "var(--color-power)" }}>
        ATRIBUTOS
      </div>
      <div className="attr-grid">
        {(
          [
            ["FOR", "forca"],
            ["DES", "destreza"],
            ["CON", "constituicao"],
            ["SAB", "sabedoria"],
            ["VON", "vontade"],
            ["PRE", "presenca"],
          ] as const
        ).map(([label, slug]) => {
          const valor = atributosEfetivos[slug];
          const bonus = efeitosAgregados.bonusAtributo[slug];
          return (
            <div
              className="attr-card attr-rolar"
              key={label}
              title={
                bonus
                  ? `Empilhar Teste ${label} · ${formatarMod(bonus.valor)} de ${bonus.fontes.join(", ")}`
                  : `Empilhar Teste ${label} no Rolador`
              }
              onClick={() =>
                empilharD20(modificador(valor), `Teste ${label}`, {
                  tipo: "teste-atributo",
                  atributo: slug,
                })
              }
            >
              <div className="attr-label">
                {label}
                {bonus && <i className="fas fa-link prof-fonte" />}
              </div>
              <div className="attr-value">{formatarMod(modificador(valor))}</div>
              <div className="attr-base">{valor}</div>
            </div>
          );
        })}
      </div>

      <Link href="/dashboard" className="btn-voltar-ficha">
        ← Voltar
      </Link>
    </aside>
  );
}
