"use client";

import { useEffect, useMemo, useOptimistic, useState } from "react";
import Link from "next/link";
import { EditableStat } from "./editable-stat";
import { EditFichaModal } from "./edit-ficha-modal";
import { AvatarUploadModal } from "./avatar-upload-modal";
import { RecursosSidebar, type Recurso } from "./recursos-sidebar";
import { CrEditavel } from "./cr-editavel";
import { ExaustaoControle } from "./exaustao-controle";
import { MarcaExausto } from "./marca-exausto";
import {
  agregarEfeitos,
  atributoDeCalculo,
  bonusProficiencia,
  deslocamentoEfetivo,
  formatarMod,
  iniciativa,
  lerProficiencias,
  modificador,
  penalidadeD20Exaustao,
  percepcaoPassiva,
  estadoDefesa,
  progresso,
  type Atributo,
  type DefesaAgregada,
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
  nado: number;
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

// Habilidade crua o suficiente pra `agregarEfeitos` recomputar o agregado na
// sidebar (id pra casar com o overlay de `ligada`).
type HabSidebar = {
  id: string;
  nome: string;
  tipo: string;
  efeitos: unknown;
  ligada: boolean;
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

// Ícone/rótulo dos modos de deslocamento especial (alinhado com o select do
// editor de efeitos em habilidades-tab). Tipo livre cai no fallback.
const ICONE_MOV: Record<string, string> = {
  voar: "fa-dove",
  nadar: "fa-person-swimming",
  escalar: "fa-person-hiking",
  cavar: "fa-shovel",
};
const ROTULO_MOV: Record<string, string> = {
  voar: "Voar",
  nadar: "Nadar",
  escalar: "Escalar",
  cavar: "Cavar",
};

function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
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
    | "deslocamento"
    | "nado"
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
  habilidades,
  slugsPericiaCustom,
  penalidadeDesArmadura,
}: {
  personagem: Personagem;
  // Habilidades cruas — a sidebar recomputa o agregado client-side pra refletir
  // o toggle `ligada` na hora (defesas/atributos/etc.), sem esperar o server.
  habilidades: HabSidebar[];
  slugsPericiaCustom: string[];
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

  // Overlay otimista do estado `ligada` por habilidade. HabilidadesTab dispara
  // `rpgo:toggle-habilidade` ao ligar/desligar; a sidebar sobrescreve e recomputa
  // o agregado na hora.
  const [ligadaOverlay, setLigadaOverlay] = useState<Record<string, boolean>>({});
  // Reset do overlay quando as habilidades chegam frescas do server (revalidate)
  // — feito durante o render (padrão React), não em effect, pra não disparar
  // set-state-in-effect.
  const [habsAnterior, setHabsAnterior] = useState(habilidades);
  if (habsAnterior !== habilidades) {
    setHabsAnterior(habilidades);
    setLigadaOverlay({});
  }
  useEffect(() => {
    function ouvir(e: Event) {
      const det = (e as CustomEvent<{ id: string; ligada: boolean }>).detail;
      if (!det) return;
      setLigadaOverlay((o) => ({ ...o, [det.id]: det.ligada }));
    }
    window.addEventListener("rpgo:toggle-habilidade", ouvir);
    return () => window.removeEventListener("rpgo:toggle-habilidade", ouvir);
  }, []);

  // Agregado recomputado a partir das habilidades + overlay de `ligada`. Mesma
  // função pura do server (page.tsx) — barata, frio. Substitui a antiga prop
  // `efeitosAgregados`: agora reage ao toggle sem round-trip.
  const efeitosAgregados = useMemo(() => {
    const habs = habilidades.map((h) =>
      h.id in ligadaOverlay ? { ...h, ligada: ligadaOverlay[h.id] } : h,
    );
    return agregarEfeitos(habs, new Set(slugsPericiaCustom));
  }, [habilidades, ligadaOverlay, slugsPericiaCustom]);

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

  // Deslocamento: (base + bônus) × fator, reduzido pela exaustão. O multiplicador
  // entra antes da exaustão; a redução por exaustão é reaproveitada passando o
  // bruto já multiplicado como "base" (bonus 0) pra `deslocamentoEfetivo`.
  const deslocBonus = efeitosAgregados.bonusDeslocamento;
  const multDesloc = efeitosAgregados.multiplicadores["deslocamento"];
  const deslocSemMult = Math.max(0, p.deslocamento + deslocBonus.valor);
  const deslocBruto = multDesloc ? Math.round(deslocSemMult * multDesloc.fator) : deslocSemMult;
  const deslocEfetivo = deslocamentoEfetivo(deslocBruto, 0, p.exaustao);
  const deslocReduzido = deslocEfetivo !== deslocBruto;
  const deslocTitulo =
    [
      deslocBonus.fontes.length
        ? `${formatarMod(deslocBonus.valor)} de ${deslocBonus.fontes.join(", ")}`
        : null,
      multDesloc ? `×${multDesloc.fator} de ${multDesloc.fontes.join(", ")}` : null,
      deslocReduzido ? `Reduzido por exaustão (de ${deslocBruto} m)` : null,
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  // Nado: stat base de espécie (não reduzido pela exaustão). Um efeito que
  // concede nado (`deslocamento`/`nadar`) prevalece o maior contra o base.
  const nadarExtra = efeitosAgregados.deslocamentosExtra["nadar"];
  const nadoEfetivo = Math.max(p.nado, nadarExtra?.valor ?? 0);
  const nadoPorEfeito = (nadarExtra?.valor ?? 0) >= p.nado && !!nadarExtra?.fontes.length;

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
            nado: p.nado,
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

      {/* Deslocamento + Nado lado a lado: dois stats base de movimento na altura
          de uma linha só. */}
      <div className="recurso-dupla">
        <div className="recurso-linha" title={deslocTitulo}>
          <span className="recurso-icone"><i className="fas fa-person-running" /></span>
          <span className="recurso-nome">Deslocamento</span>
          <span className={`stat-values ${deslocReduzido ? "valor-exausto" : ""}`}>
            {deslocEfetivo.toLocaleString("pt-BR")} m
            {(deslocBonus.fontes.length > 0 || multDesloc) && (
              <i className="fas fa-link prof-fonte" />
            )}
            {deslocReduzido && (
              <MarcaExausto titulo={`Reduzido por exaustão (de ${deslocBruto} m)`} />
            )}
          </span>
        </div>

        {/* Nado: stat base de espécie, sempre exibido (igual ao deslocamento). */}
        <div
          className="recurso-linha"
          title={nadoPorEfeito ? `de ${nadarExtra!.fontes.join(", ")}` : undefined}
        >
          <span className="recurso-icone"><i className="fas fa-person-swimming" /></span>
          <span className="recurso-nome">Nadar</span>
          <span className="stat-values">
            {nadoEfetivo.toLocaleString("pt-BR")} m
            {nadoPorEfeito && <i className="fas fa-link prof-fonte" />}
          </span>
        </div>
      </div>

      {/* Deslocamentos especiais (voar/escalar/cavar) — modos próprios concedidos
          por habilidade, não reduzidos pela exaustão. Nado tem linha própria acima. */}
      {Object.entries(efeitosAgregados.deslocamentosExtra).map(([tipo, fv]) =>
        fv && tipo !== "nadar" ? (
          <div
            key={`mov-${tipo}`}
            className="recurso-linha"
            title={fv.fontes.length ? `de ${fv.fontes.join(", ")}` : undefined}
          >
            <span className="recurso-icone">
              <i className={`fas ${ICONE_MOV[tipo] ?? "fa-person-running"}`} />
            </span>
            <span className="recurso-nome">{ROTULO_MOV[tipo] ?? capitalizar(tipo)}</span>
            <span className="stat-values">
              {fv.valor.toLocaleString("pt-BR")} m
              {fv.fontes.length > 0 && <i className="fas fa-link prof-fonte" />}
            </span>
          </div>
        ) : null,
      )}

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

      {(() => {
        // Painel de defesas (read-only): lê do agregador recomputado, não muta
        // nada. Defesa só está aqui se vier de passiva OU de habilidade ligada
        // (o gate é no agregador) — então é sempre visível; `estadoDefesa` só
        // marca como condicional (esmaecida + legenda) quando vem de ligada.
        type Linha = [string, DefesaAgregada, ReturnType<typeof estadoDefesa>];
        const linhas = (entradas: [string, DefesaAgregada | undefined][]): Linha[] =>
          entradas
            .filter((e): e is [string, DefesaAgregada] => !!e[1])
            .map(([nome, d]) => [nome, d, estadoDefesa(d)] as Linha);
        const resist = linhas(Object.entries(efeitosAgregados.resistencias));
        const imun = linhas(Object.entries(efeitosAgregados.imunidades));
        const condImun = linhas(Object.entries(efeitosAgregados.condicoesImunes));
        const critImune = efeitosAgregados.critImune;
        const critSt = estadoDefesa(critImune);
        const critVis = critImune.fontes.length > 0;
        if (!resist.length && !imun.length && !condImun.length && !critVis) {
          return null;
        }
        const titulo = (fontes: string[], motivo?: string) =>
          [fontes.length ? `de ${fontes.join(", ")}` : null, motivo]
            .filter(Boolean)
            .join(" · ") || undefined;
        const grupo = (icone: string, rotulo: string, linhas: Linha[], prefixo: string) =>
          linhas.length > 0 && (
            <div className="defesa-grupo">
              <span className="defesa-rotulo">
                <i className={`fas ${icone}`} /> {rotulo}
              </span>
              <div className="defesa-valores">
                {linhas.map(([nome, d, st]) => (
                  <div
                    key={`${prefixo}-${nome}`}
                    className={`defesa-entrada${st.condicional ? " cond" : ""}`}
                    title={titulo(d.fontes, undefined)}
                  >
                    <div className="defesa-pills">
                      {nome
                        .split(/\s*,\s*/)
                        .filter(Boolean)
                        .map((v, j) => (
                          <span key={j} className="defesa-chip">
                            {v}
                          </span>
                        ))}
                    </div>
                    {st.condicional && st.motivo && (
                      <span className="defesa-cond-nota">{st.motivo}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        return (
          <>
            <div className="bar-label" style={{ marginTop: 15, color: "var(--color-react)" }}>
              DEFESAS
            </div>
            <div className="defesas-secao">
              {grupo("fa-shield-halved", "Resistência", resist, "res")}
              {grupo("fa-shield", "Imunidade", imun, "imu")}
              {grupo("fa-virus-slash", "Imune à condição", condImun, "cond")}
              {critVis && (
                <div className="defesa-grupo">
                  <span className="defesa-rotulo" title={titulo(critImune.fontes, undefined)}>
                    <i className="fas fa-burst" /> Imune a crítico
                  </span>
                  {critSt.condicional && critSt.motivo && (
                    <span className="defesa-cond-nota">{critSt.motivo}</span>
                  )}
                </div>
              )}
            </div>
          </>
        );
      })()}

      {(() => {
        // Sentidos especiais (visão no escuro, sentir presença…). Mesma fonte
        // do agregador (passiva ou habilidade ligada). Só exibição.
        const sentidos = Object.entries(efeitosAgregados.sentidos).filter(
          (e): e is [string, { valor: number; fontes: string[] }] => !!e[1],
        );
        if (!sentidos.length) return null;
        return (
          <>
            <div className="bar-label" style={{ marginTop: 15, color: "var(--color-react)" }}>
              SENTIDOS
            </div>
            <div className="defesas-secao">
              <div className="defesa-grupo">
                <div className="defesa-valores">
                  {sentidos.map(([nome, fv]) => (
                    <div
                      key={`sen-${nome}`}
                      className="defesa-entrada"
                      title={fv.fontes.length ? `de ${fv.fontes.join(", ")}` : undefined}
                    >
                      <div className="defesa-pills">
                        <span className="defesa-chip">
                          <i className="fas fa-eye" /> {capitalizar(nome)}
                          {fv.valor > 0 ? ` ${fv.valor} m` : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        );
      })()}

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
