import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { listarMensagensSessao } from "@/lib/mensagens";
import { carregarCalendario } from "@/lib/calendario/carregar";
import { agregarEfeitos } from "@/lib/op-rpg";
import { habilidadesTravadas } from "@/lib/arvore";
import { PerfilSidebar } from "./perfil-sidebar";
import { FichaTabs } from "./ficha-tabs";
import { FichaRealtime } from "./realtime-refresher";
import { Bandeja } from "@/components/bandeja/bandeja";
import { ThemeButton } from "@/components/temas/theme-button";
import "../../calendario/[mesaId]/calendario.css";
import "./ficha.css";

type Params = {
  params: Promise<{ uid: string }>;
  searchParams: Promise<{ aba?: string | string[] }>;
};

export default async function FichaPage({ params, searchParams }: Params) {
  const [{ uid }, { aba }] = await Promise.all([params, searchParams]);

  const supabase = await createClient();

  // Auth (rede pro Supabase) e personagem (Postgres) são independentes — paralelo.
  const [
    {
      data: { user },
    },
    personagem,
  ] = await Promise.all([
    supabase.auth.getUser(),
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
  ]);
  if (!user) redirect("/login");
  if (!personagem) notFound();

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

  // Habilidade presa a nó não liberado não entra no agregador.
  const travadasPorArvore = habilidadesTravadas(
    personagem.arvores.flatMap((a) => a.nos),
  );
  const habilidadesAtivas = personagem.habilidades.filter(
    (h) => !travadasPorArvore.has(h.id),
  );

  // Agrega efeitos das habilidades (modificadores + proficiências) pra alvos
  // canônicos + perícias custom. Computado no servidor — frio, sem estado, barato.
  const efeitosAgregados = agregarEfeitos(habilidadesAtivas, slugsPericiaCustom);

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

  const penalidadeDesArmadura = personagem.itens.reduce(
    (acc, i) => (i.tipo === "armadura" && i.equipado ? acc + i.penalidadeDes : acc),
    0,
  );

  // Pré-carrega mensagens do chat + calendário + tripulação/navio (se houver
  // mesa) em paralelo. Tripulação = personagens que compartilham o mesaId.
  const [mensagensIniciais, calendario, tripulantes, navio, arvoresCopiaveis] =
    await Promise.all([
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
    <div className="ficha-layout">
      <FichaRealtime personagemId={personagem.id} mesaId={personagem.mesaId} />
      <PerfilSidebar
        personagem={personagem}
        habilidades={habilidadesAtivas}
        slugsPericiaCustom={[...slugsPericiaCustom]}
        penalidadeDesArmadura={penalidadeDesArmadura}
        camadasQueAbrem={camadasQueAbrem}
      />
      <FichaTabs
        personagemId={personagem.id}
        personagemNome={personagem.nome}
        abaInicial={typeof aba === "string" ? aba : null}
        mesaId={personagem.mesaId}
        nivel={personagem.nivel}
        exaustao={personagem.exaustao}
        penalidadeDesArmadura={penalidadeDesArmadura}
        atributos={{
          forca: personagem.forca + (efeitosAgregados.bonusAtributo.forca?.valor ?? 0),
          destreza:
            personagem.destreza + (efeitosAgregados.bonusAtributo.destreza?.valor ?? 0),
          constituicao:
            personagem.constituicao +
            (efeitosAgregados.bonusAtributo.constituicao?.valor ?? 0),
          sabedoria:
            personagem.sabedoria + (efeitosAgregados.bonusAtributo.sabedoria?.valor ?? 0),
          vontade:
            personagem.vontade + (efeitosAgregados.bonusAtributo.vontade?.valor ?? 0),
          presenca:
            personagem.presenca + (efeitosAgregados.bonusAtributo.presenca?.valor ?? 0),
        }}
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
      <div className="ficha-topo-acoes">
        <ThemeButton />
      </div>
      <Bandeja
        userId={user.id}
        userName={personagem.nome}
        sessionId={sessionId}
        personagemId={personagem.id}
        mensagensIniciais={mensagensIniciais}
        efeitosContexto={{
          contextuais: efeitosAgregados.contextuais,
          critRangeMinimo: efeitosAgregados.critRangeMinimo,
          floorD20: efeitosAgregados.floorD20,
          rerolls: efeitosAgregados.rerolls,
          danoMinMetade: efeitosAgregados.danoMinMetade,
          trocaDano: efeitosAgregados.trocaDano,
          ignora: efeitosAgregados.ignora,
          bonusAlcance: efeitosAgregados.bonusAlcance,
        }}
      />
    </div>
  );
}
