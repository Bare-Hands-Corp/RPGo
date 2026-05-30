"use client";

import { useEffect, useOptimistic, useState } from "react";
import Link from "next/link";
import { EditableStat } from "./editable-stat";
import { EditFichaModal } from "./edit-ficha-modal";
import { AvatarUploadModal } from "./avatar-upload-modal";
import { RecursosSidebar, type Recurso } from "./recursos-sidebar";
import { CrEditavel } from "./cr-editavel";
import { ExaustaoControle } from "./exaustao-controle";
import { MarcaExausto } from "./marca-exausto";
import {
  atributoDeCalculo,
  bonusProficiencia,
  deslocamentoEfetivo,
  formatarMod,
  iniciativa,
  lerProficiencias,
  modificador,
  penalidadeD20Exaustao,
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
  deslocamento: number;
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

const SIGLA_ATRIBUTO: Record<Atributo, string> = {
  forca: "FOR",
  destreza: "DES",
  constituicao: "CON",
  sabedoria: "SAB",
  vontade: "VON",
  presenca: "PRE",
};

type PatchPersonagem = Partial<
  Pick<
    Personagem,
    | "hpAtual"
    | "hpTemp"
    | "hpMax"
    | "ppAtual"
    | "ppMax"
    | "tipoDadoVida"
    | "deslocamento"
    | "exaustao"
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
  // Absoluto (não delta) — o ExaustaoControle manda o nível novo direto.
  exaustao: number;
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
  penalidadeDesArmadura,
}: {
  personagem: Personagem;
  efeitosAgregados: EfeitosAgregados;
  penalidadeDesArmadura: number;
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
      setShadow((s) => {
        const next = aplicarDelta(s, inicial, det);
        // Exaustão vem absoluta (do ExaustaoControle), não como delta.
        if (typeof det.exaustao === "number") next.exaustao = det.exaustao;
        return next;
      });
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

  // CR ganha automaticamente o `ca` de cada armadura equipada. A penalidade de
  // DES NÃO entra aqui — é aplicada via `atributosParaTeste` (reduz o mod de DES),
  // pra também pegar iniciativa/salv/perícia e respeitar substituição de atributo.
  const caArmadura = p.itens.reduce(
    (acc, i) => (i.tipo === "armadura" && i.equipado ? acc + i.ca : acc),
    0,
  );

  // Atributos efetivos: valor base + bônus vindo de habilidades.
  // Usado pelos cards de atributo (exibição) e por derivados (Iniciativa,
  // Percepção Passiva).
  const atributosEfetivos: Record<Atributo, number> = {
    forca: p.forca + (efeitosAgregados.bonusAtributo.forca?.valor ?? 0),
    destreza: p.destreza + (efeitosAgregados.bonusAtributo.destreza?.valor ?? 0),
    constituicao:
      p.constituicao + (efeitosAgregados.bonusAtributo.constituicao?.valor ?? 0),
    sabedoria: p.sabedoria + (efeitosAgregados.bonusAtributo.sabedoria?.valor ?? 0),
    vontade: p.vontade + (efeitosAgregados.bonusAtributo.vontade?.valor ?? 0),
    presenca: p.presenca + (efeitosAgregados.bonusAtributo.presenca?.valor ?? 0),
  };

  // Atributos para TESTES de d20 e CR: igual aos efetivos, mas com a DES
  // reduzida pela penalidade da armadura. Reduzir a pontuação em 2× a penalidade
  // (do modificador) reduz o modificador em exatamente a penalidade. Cálculos
  // que usam outro atributo (substituição) leem o valor não-ajustado e escapam.
  const atributosParaTeste: Record<Atributo, number> = {
    ...atributosEfetivos,
    destreza: atributosEfetivos.destreza + 2 * penalidadeDesArmadura,
  };
  const subs = efeitosAgregados.substituicoesAtributo;
  const desReduz = penalidadeDesArmadura < 0;

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

  // Penalidade de exaustão em testes de d20 (−2 × nível). Some no acerto, nos
  // testes de atributo, na iniciativa, etc. — todos derivam dela aqui na ficha.
  const penD20 = penalidadeD20Exaustao(p.exaustao);

  // Deslocamento: base + bônus de habilidade, reduzido pela exaustão.
  const deslocBonus = efeitosAgregados.bonusDeslocamento;
  const deslocBruto = Math.max(0, p.deslocamento + deslocBonus.valor);
  const deslocEfetivo = deslocamentoEfetivo(p.deslocamento, deslocBonus.valor, p.exaustao);
  const deslocReduzido = deslocEfetivo !== deslocBruto;
  const deslocTitulo =
    [
      deslocBonus.fontes.length
        ? `${formatarMod(deslocBonus.valor)} de ${deslocBonus.fontes.join(", ")}`
        : null,
      deslocReduzido ? `Reduzido por exaustão (de ${deslocBruto} m)` : null,
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  return (
    <aside className="sidebar">
      <div className="sidebar-icons right">
        <EditFichaModal
          personagemId={p.id}
          inicial={{
            hpMax: p.hpMax,
            ppMax: p.ppMax,
            tipoDadoVida: p.tipoDadoVida,
            deslocamento: p.deslocamento,
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

      <div className="recurso-linha" title={deslocTitulo}>
        <span className="recurso-icone"><i className="fas fa-person-running" /></span>
        <span className="recurso-nome">Deslocamento</span>
        <span className={`stat-values ${deslocReduzido ? "valor-exausto" : ""}`}>
          {deslocEfetivo.toLocaleString("pt-BR")} m
          {deslocBonus.fontes.length > 0 && <i className="fas fa-link prof-fonte" />}
          {deslocReduzido && (
            <MarcaExausto titulo={`Reduzido por exaustão (de ${deslocBruto} m)`} />
          )}
        </span>
      </div>

      <RecursosSidebar personagemId={p.id} recursos={p.recursos} />

      <div className="derivados-grid">
        {(() => {
          const crAtrib = atributoDeCalculo("cr", "destreza", subs);
          const crDesReduz = crAtrib.atributo === "destreza" && desReduz;
          const titulo =
            [
              crAtrib.substituido
                ? `Usa ${SIGLA_ATRIBUTO[crAtrib.atributo]} por ${crAtrib.fontes.join(", ")}`
                : null,
              crDesReduz ? `−${Math.abs(penalidadeDesArmadura)} de DES (armadura)` : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined;
          return (
            <CrEditavel
              personagemId={p.id}
              atributoScore={atributosParaTeste[crAtrib.atributo]}
              crOutros={p.crOutros}
              bonusFixo={caArmadura + efeitosAgregados.bonusCR.valor}
              siglaSubstituida={
                crAtrib.substituido ? SIGLA_ATRIBUTO[crAtrib.atributo] : undefined
              }
              titulo={titulo}
              reduzido={crDesReduz}
            />
          );
        })()}
        {(() => {
          const iniAtrib = atributoDeCalculo("iniciativa", "destreza", subs);
          const iniDesReduz = iniAtrib.atributo === "destreza" && desReduz;
          const iniBruta =
            iniciativa(atributosParaTeste[iniAtrib.atributo]) +
            efeitosAgregados.bonusIniciativa.valor;
          const iniEf = iniBruta - penD20;
          const reduzido = penD20 > 0 || iniDesReduz;
          const titulo =
            [
              iniAtrib.substituido
                ? `Usa ${SIGLA_ATRIBUTO[iniAtrib.atributo]} por ${iniAtrib.fontes.join(", ")}`
                : null,
              efeitosAgregados.bonusIniciativa.fontes.length
                ? `+${efeitosAgregados.bonusIniciativa.valor} de ${efeitosAgregados.bonusIniciativa.fontes.join(", ")}`
                : null,
              iniDesReduz ? `−${Math.abs(penalidadeDesArmadura)} de DES (armadura)` : null,
              penD20 ? `−${penD20} de exaustão` : null,
            ]
              .filter(Boolean)
              .join(" · ");
          return (
            <div
              className="derivado-card derivado-rolar"
              title={`Empilhar Iniciativa no Rolador${titulo ? ` · ${titulo}` : ""}`}
              onClick={() => empilharD20(iniEf, "Iniciativa", { tipo: "iniciativa" })}
            >
              <div className="derivado-label">Iniciativa</div>
              <div className={`derivado-value ${reduzido ? "valor-exausto" : ""}`}>
                {formatarMod(iniEf)}
                {penD20 > 0 && <MarcaExausto titulo={`−${penD20} de exaustão`} />}
              </div>
            </div>
          );
        })()}
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
          const modEf = modificador(valor) - penD20;
          const titulo = [
            bonus ? `${formatarMod(bonus.valor)} de ${bonus.fontes.join(", ")}` : null,
            penD20 ? `−${penD20} de exaustão` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <div
              className="attr-card attr-rolar"
              key={label}
              title={`Empilhar Teste ${label} no Rolador${titulo ? ` · ${titulo}` : ""}`}
              onClick={() =>
                empilharD20(modEf, `Teste ${label}`, {
                  tipo: "teste-atributo",
                  atributo: slug,
                })
              }
            >
              <div className="attr-label">
                {label}
                {bonus && <i className="fas fa-link prof-fonte" />}
              </div>
              <div className={`attr-value ${penD20 > 0 ? "valor-exausto" : ""}`}>
                {formatarMod(modEf)}
                {penD20 > 0 && <MarcaExausto titulo={`−${penD20} de exaustão`} />}
              </div>
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
