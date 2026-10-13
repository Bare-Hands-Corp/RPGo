import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { listarMensagensSessao } from "@/lib/mensagens";
import { carregarCalendario } from "@/lib/calendario/carregar";
import {
  agregarEfeitos,
  atributosEfetivos,
  comCustosResolvidos,
  contextoDasFormulas,
  efeitosDoContexto,
  fontesDeEfeitoDeItens,
  lerEfeitos,
  maximoDoRecurso,
} from "@/lib/op-rpg";
import { juntarTipos, tiposDoDano, tiposDosEfeitos } from "@/lib/dano";
import { carregarRecebidas, fonteRecebida } from "@/lib/efeitos-servidor";
import { habilidadesTravadas } from "@/lib/arvore";
import { acoesEmCurso, comAcoesEmCurso } from "@/lib/turno";
import { PerfilSidebar } from "./perfil-sidebar";
import { FichaTabs } from "./ficha-tabs";
import { RelogioMesa } from "../../calendario/[mesaId]/relogio";
import { FichaRealtime } from "./realtime-refresher";
import { Bandeja } from "@/components/bandeja/bandeja";
import { CatalogoTiposProvider } from "@/components/tipos-dano/tipos-dano";
import { catalogoTiposDoNarrador } from "@/lib/tipos-dano-servidor";
import { carregarCombateDoJogador, catalogoCondicoesDoNarrador } from "@/lib/combate-servidor";
import { CatalogoCondicoesProvider } from "@/components/tipos-dano/condicoes";
import { SessaoRealtime } from "@/app/narrador/[mesaId]/sessao/sessao-realtime";
import { IniciativaJogador } from "./iniciativa-jogador";
import { ThemeButton } from "@/components/temas/theme-button";
import "../../calendario/[mesaId]/calendario.css";
import "./ficha.css";

type Params = {
  params: Promise<{ uid: string }>;
  searchParams: Promise<{ aba?: string | string[] }>;
};

export default async function FichaPage({ params, searchParams }: Params) {
  const [{ uid }, { aba }] = await Promise.all([params, searchParams]);

  // Auth, personagem e efeitos de aliados (Postgres) são independentes — paralelo.
  const [user, carregado, recebidas] = await Promise.all([
    usuarioDaRequest(),
    prisma.personagem.findUnique({
      where: { id: uid },
      include: {
        mesa: true,
        itens: { orderBy: { nome: "asc" } },
        acoes: true,
        recursos: { orderBy: [{ ordem: "asc" }, { nome: "asc" }] },
        habilidades: { orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }] },
        periciasCustom: { orderBy: [{ ordem: "asc" }, { nome: "asc" }] },
        objetivos: { orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }] },
        arvores: {
          orderBy: [{ ordem: "asc" }, { nome: "asc" }],
          include: {
            camadas: { orderBy: { ordem: "asc" } },
            ramos: { orderBy: { ordem: "asc" } },
            nos: { orderBy: { ordem: "asc" } },
          },
        },
      },
    }),
    carregarRecebidas(uid),
  ]);
  if (!user) redirect("/login");
  if (!carregado) notFound();

  // Habilidades travadas por árvore ou por item desequipado ficam fora do agregado.
  const travadasPorArvore = habilidadesTravadas(carregado.arvores.flatMap((a) => a.nos));
  const itensEquipados = new Set(carregado.itens.filter((i) => i.equipado).map((i) => i.id));
  const estaAtiva = (h: { id: string; itemId: string | null }) =>
    !travadasPorArvore.has(h.id) && (!h.itemId || itensEquipados.has(h.itemId));
  const atributosBase = {
    forca: carregado.forca,
    destreza: carregado.destreza,
    constituicao: carregado.constituicao,
    sabedoria: carregado.sabedoria,
    vontade: carregado.vontade,
    presenca: carregado.presenca,
  };

  // Custo e máximo por fórmula ("PROF", "NIVEL/2") viram número aqui, com o nível
  // e os atributos da ficha; daqui pra frente a página só vê o número.
  const ctxFormula = contextoDasFormulas(
    [
      ...carregado.habilidades.filter(estaAtiva),
      ...fontesDeEfeitoDeItens(carregado.itens),
      ...recebidas.map(fonteRecebida),
    ],
    { nivel: carregado.nivel, atributos: atributosBase },
  );
  const personagem = {
    ...carregado,
    recursos: carregado.recursos.map((r) => ({ ...r, valorMax: maximoDoRecurso(r, ctxFormula) })),
    habilidades: carregado.habilidades.map((h) => comCustosResolvidos(h, ctxFormula)),
    acoes: carregado.acoes.map((a) => comCustosResolvidos(a, ctxFormula, a.grau)),
  };

  // Autorização: dono OU narrador da mesa.
  const isDono = personagem.userId === user.id;
  const isNarrador = personagem.mesa?.userId === user.id;
  if (!isDono && !isNarrador) {
    redirect("/dashboard");
  }

  // Bandeja: sessionId = mesa quando o personagem tá numa, senão usa o próprio personagem.
  const sessionId = personagem.mesaId || personagem.id;

  // Slugs das perícias customizadas — permite que efeitos de habilidade
  // (modificador/proficiência) mirem uma perícia custom e caiam no agregador.
  const slugsPericiaCustom = new Set(
    personagem.periciasCustom.map((p) => p.slug),
  );

  const habilidadesAtivas = personagem.habilidades.filter(estaAtiva);

  // Agrega efeitos das habilidades ativas, dos itens equipados, dos aliados e
  // os que as ações em curso mantêm.
  const efeitosAgregados = comAcoesEmCurso(
    agregarEfeitos(
      [
        ...habilidadesAtivas,
        ...fontesDeEfeitoDeItens(personagem.itens),
        ...recebidas.map(fonteRecebida),
      ],
      slugsPericiaCustom,
      undefined,
      {
        nivel: personagem.nivel,
        atributos: atributosBase,
        recursos: personagem.recursos.map((r) => ({
          id: r.id,
          nome: r.nome,
          valorAtual: r.valorAtual,
          valorMax: r.valorMax,
        })),
        ppAtual: personagem.ppAtual,
      },
    ),
    acoesEmCurso(personagem.acoes, personagem.concentracao),
    slugsPericiaCustom,
  );

  // Penalidade de DES das armaduras equipadas (geralmente negativa). Reduz o
  // modificador de DES em todos os cálculos derivados (CR, iniciativa, salv/
  // perícia de DES, ataque à distância) — não só na CR.
  // Camadas por "nivel" que abrem no próximo nível, pro assistente mostrar.
  const camadasQueAbrem = personagem.arvores.flatMap((a) => {
    if (a.criterio !== "nivel") return [];
    return a.camadas
      .filter(
        (c) => c.limiar > personagem.nivel && c.limiar <= personagem.nivel + 1,
      )
      .map((c) => ({ arvore: a.nome, camada: c.nome }));
  });

  // Tipos de dano dos ataques e efeitos, pras sugestões do dano recebido.
  const tiposDosAtaques = juntarTipos(
    ...personagem.acoes.map((a) => [...(a.tipoDano ? [a.tipoDano] : []), ...tiposDoDano(a.dano ?? "")]),
    ...personagem.itens.flatMap((i) => [tiposDoDano(i.dano ?? ""), tiposDoDano(i.danoBonus ?? "")]),
    ...[...personagem.habilidades, ...personagem.itens, ...personagem.acoes].map((f) =>
      tiposDosEfeitos(lerEfeitos(f.efeitos)),
    ),
  );

  const penalidadeDesArmadura = personagem.itens.reduce(
    (acc, i) => (i.tipo === "armadura" && i.equipado ? acc + i.penalidadeDes : acc),
    0,
  );

  // Pré-carrega mensagens do chat + calendário + tripulação/navio (se houver
  // mesa) em paralelo. Tripulação = personagens que compartilham o mesaId.
  const [catalogoTipos, catalogoCondicoes, { sessaoId, combate }, mensagensIniciais, calendario, tripulantes, navio, arvoresCopiaveis] =
    await Promise.all([
    // Tipos de dano do narrador da mesa (Biblioteca do bestiário).
    catalogoTiposDoNarrador(personagem.mesa?.userId),
    // Condições do narrador da mesa (Biblioteca).
    catalogoCondicoesDoNarrador(personagem.mesa?.userId),
    // Combate ativo da mesa, só com o que o narrador liberou das criaturas.
    carregarCombateDoJogador(personagem.mesaId, personagem.id),
    listarMensagensSessao(sessionId),
    personagem.mesaId
      ? carregarCalendario(personagem.mesaId, { isNarrador })
      : Promise.resolve(null),
    personagem.mesaId
      ? prisma.personagem.findMany({
          where: { mesaId: personagem.mesaId },
          select: { id: true, nome: true, fotoUrl: true, nivel: true, hpAtual: true, hpMax: true },
          orderBy: { nome: "asc" },
        })
      : Promise.resolve([]),
    personagem.mesaId
      ? prisma.navio.findUnique({ where: { mesaId: personagem.mesaId } })
      : Promise.resolve(null),
    // Árvores de qualquer personagem do mesmo dono, pra copiar.
    prisma.arvore.findMany({
      where: { personagem: { userId: user.id } },
      orderBy: [{ personagemId: "asc" }, { ordem: "asc" }],
      select: {
        id: true,
        nome: true,
        icone: true,
        personagemId: true,
        personagem: { select: { nome: true } },
        _count: { select: { nos: true, camadas: true } },
      },
    }),
  ]);

  return (
    <CatalogoCondicoesProvider condicoes={catalogoCondicoes}>
    {/* Fora do grid da ficha pra faixa grudar no topo ao rolar a página. */}
    {combate && (
      <IniciativaJogador
        combate={combate}
        personagemId={personagem.id}
      />
    )}
    <div className={"ficha-layout" + (calendario ? " com-relogio" : "")}>
      <FichaRealtime personagemId={personagem.id} mesaId={personagem.mesaId} />
      {personagem.mesaId && (
        <SessaoRealtime mesaId={personagem.mesaId} sessaoId={sessaoId} combateId={combate?.id ?? null} />
      )}
      <CatalogoTiposProvider tipos={catalogoTipos}>
      <PerfilSidebar
        personagem={personagem}
        habilidades={habilidadesAtivas}
        recebidas={recebidas.map((r) => ({
          id: r.id,
          nome: r.nome,
          de: r.personagem.nome,
          efeitos: r.efeitos,
        }))}
        slugsPericiaCustom={[...slugsPericiaCustom]}
        penalidadeDesArmadura={penalidadeDesArmadura}
        camadasQueAbrem={camadasQueAbrem}
        tiposDosAtaques={tiposDosAtaques}
        acoes={personagem.acoes.map((a) => ({
          id: a.id,
          nome: a.nome,
          efeitos: a.efeitos,
          grau: a.grau,
          duracao: a.duracao,
          aliado: a.aliado,
          emCurso: a.emCurso,
          turnosRestantes: a.turnosRestantes,
        }))}
      />
      <FichaTabs
        personagemId={personagem.id}
        personagemNome={personagem.nome}
        abaInicial={typeof aba === "string" ? aba : null}
        mesaId={personagem.mesaId}
        nivel={personagem.nivel}
        exaustao={personagem.exaustao}
        ppAtual={personagem.ppAtual}
        ppMax={personagem.ppMax}
        penalidadeDesArmadura={penalidadeDesArmadura}
        atributos={atributosEfetivos(personagem, efeitosAgregados)}
        proficienciasRaw={personagem.proficiencias}
        periciasCustom={personagem.periciasCustom.map((p) => ({
          id: p.id,
          nome: p.nome,
          slug: p.slug,
          atributo: p.atributo,
          origem: p.origem,
          proficiente: p.proficiente,
          dobrada: p.dobrada,
          bonusOutros: p.bonusOutros,
          ordem: p.ordem,
        }))}
        efeitosAgregados={efeitosAgregados}
        cargaMaxima={personagem.cargaMaxima}
        berries={personagem.berries}
        acoes={personagem.acoes}
        itens={personagem.itens}
        recursos={personagem.recursos.map((r) => ({
          id: r.id,
          nome: r.nome,
          cor: r.cor,
          cor2: r.cor2,
          efeito: r.efeito,
          valorAtual: r.valorAtual,
          valorMax: r.valorMax,
        }))}
        habilidades={personagem.habilidades}
        habilidadesTravadas={[...travadasPorArvore]}
        arvores={personagem.arvores}
        arvoresCopiaveis={arvoresCopiaveis.map((a) => ({
          id: a.id,
          nome: a.nome,
          icone: a.icone,
          personagemNome: a.personagem.nome,
          doProprio: a.personagemId === personagem.id,
          talentos: a._count.nos,
          camadas: a._count.camadas,
        }))}
        calendario={calendario}
        objetivos={personagem.objetivos.map((o) => ({
          id: o.id,
          titulo: o.titulo,
          descricao: o.descricao,
          estado: o.estado,
          icone: o.icone,
          prazoDias: o.prazoDias,
          ordem: o.ordem,
        }))}
        isNarradorDaMesa={isNarrador}
        tripulantes={tripulantes}
        turno={combate?.voce ?? null}
        alvosCombate={combate?.participantes ?? []}
        atributoCdTecnicas={personagem.atributoCdTecnicas}
        navio={
          navio
            ? {
                id: navio.id,
                nome: navio.nome,
                tamanho: navio.tamanho,
                madeira: navio.madeira,
                pvAtual: navio.pvAtual,
                velocidadeNos: navio.velocidadeNos,
                canhoes: navio.canhoes,
                descricao: navio.descricao,
              }
            : null
        }
      />
      </CatalogoTiposProvider>
      <div className="ficha-topo-acoes">
        {personagem.mesaId && calendario && (
          <RelogioMesa
            mesaId={personagem.mesaId}
            relogio={calendario.relogio}
            config={calendario.config}
            dataAtualDias={calendario.dataAtualDias}
            isNarrador={isNarrador}
          />
        )}
        <ThemeButton />
      </div>
      <Bandeja
        userId={user.id}
        userName={personagem.nome}
        sessionId={sessionId}
        personagemId={personagem.id}
        mensagensIniciais={mensagensIniciais}
        efeitosContexto={efeitosDoContexto(efeitosAgregados)}
      />
    </div>
    </CatalogoCondicoesProvider>
  );
}
