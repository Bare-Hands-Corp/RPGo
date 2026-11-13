import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { SO_PRINCIPAIS } from "@/lib/acesso-ficha";
import { catalogoTiposDoNarrador } from "@/lib/tipos-dano-servidor";
import { catalogoCondicoesDoNarrador } from "@/lib/combate-servidor";
import { clonarParaCartas } from "./actions";
import { DemoFichaCartas } from "./demo-ficha";
import "../cartas-demo.css";

// Protótipo: as ações, técnicas, habilidades e itens de uma ficha real como cartas.
// Sem ?id, lista as fichas do usuário pra clonar uma. Só em desenvolvimento.
export default async function PrototipoCartasFichaPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const user = await usuarioDaRequest();
  if (!user) redirect("/login?next=/prototipo/cartas/ficha");
  const { id } = await searchParams;

  if (!id) {
    const fichas = await prisma.personagem.findMany({
      where: { userId: user.id, ...SO_PRINCIPAIS },
      select: { id: true, nome: true, _count: { select: { acoes: true, habilidades: true, itens: true } } },
      orderBy: { nome: "asc" },
    });
    return (
      <div className="cartas-demo">
        <header className="cartas-demo-topo">
          <h1>Protótipo · Cartas da ficha</h1>
          <p>Escolha uma ficha: o protótipo usa um clone dela, a original não muda.</p>
        </header>
        <ul className="cartas-lista-fichas">
          {fichas.map((f) => (
            <li key={f.id}>
              <span>
                <strong>{f.nome}</strong>
                <small>
                  {f._count.acoes} ações · {f._count.habilidades} habilidades · {f._count.itens} itens
                </small>
              </span>
              {f.nome.endsWith("(cartas)") ? (
                <Link href={`/prototipo/cartas/ficha?id=${f.id}`}>Abrir</Link>
              ) : (
                <form action={clonarParaCartas}>
                  <input type="hidden" name="id" value={f.id} />
                  <button type="submit">Clonar e ver</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const p = await prisma.personagem.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      userId: true,
      nivel: true,
      forca: true,
      destreza: true,
      constituicao: true,
      sabedoria: true,
      vontade: true,
      presenca: true,
      atributoCdTecnicas: true,
      mesa: { select: { userId: true } },
      recursos: { select: { id: true, nome: true } },
      acoes: {
        orderBy: [{ tipo: "asc" }, { ordem: "asc" }],
        select: {
          id: true,
          nome: true,
          descricao: true,
          tipo: true,
          tecnica: true,
          grau: true,
          custoPp: true,
          custoPa: true,
          custoPpFormula: true,
          custoRecursoId: true,
          custoRecursoValor: true,
          dano: true,
          tipoDano: true,
          alcance: true,
          atributoSalv: true,
          usos: true,
          usosAtual: true,
          recarga: true,
          pasta: true,
          habilidadeIds: true,
          itemId: true,
          efeitos: true,
          duracao: true,
        },
      },
      habilidades: {
        orderBy: { ordem: "asc" },
        select: {
          id: true,
          nome: true,
          descricao: true,
          origem: true,
          tipo: true,
          custoPp: true,
          custoPa: true,
          custoPpFormula: true,
          custoRecursoId: true,
          custoRecursoValor: true,
          usos: true,
          usosAtual: true,
          recarga: true,
          tags: true,
          ligada: true,
          itemId: true,
        },
      },
      itens: {
        orderBy: { ordem: "asc" },
        select: {
          id: true,
          nome: true,
          descricao: true,
          tipo: true,
          categoria: true,
          quantidade: true,
          peso: true,
          dano: true,
          danoBonus: true,
          ca: true,
          alcanceMetros: true,
          equipado: true,
          propriedades: true,
        },
      },
    },
  });
  if (!p || p.userId !== user.id) notFound();
  // Tipos de dano com a cara que o narrador da mesa deu (sem mesa: os do livro).
  const [tiposDano, condicoes] = await Promise.all([
    catalogoTiposDoNarrador(p.mesa?.userId),
    catalogoCondicoesDoNarrador(p.mesa?.userId),
  ]);

  return (
    <DemoFichaCartas
      fichaId={p.id}
      condicoes={condicoes}
      ficha={{
        nivel: p.nivel,
        atributoCd: p.atributoCdTecnicas,
        atributos: {
          forca: p.forca,
          destreza: p.destreza,
          constituicao: p.constituicao,
          sabedoria: p.sabedoria,
          vontade: p.vontade,
          presenca: p.presenca,
        },
        recursos: p.recursos,
      }}
      contexto={{
        personagem: p.nome,
        recursos: Object.fromEntries(p.recursos.map((r) => [r.id, r.nome])),
        tiposDano,
        habilidades: Object.fromEntries(p.habilidades.map((h) => [h.id, { nome: h.nome, origem: h.origem }])),
        itens: Object.fromEntries(p.itens.map((i) => [i.id, { nome: i.nome, tipo: i.tipo, categoria: i.categoria }])),
      }}
      acoes={p.acoes}
      habilidades={p.habilidades}
      itens={p.itens}
    />
  );
}
