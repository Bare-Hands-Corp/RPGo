import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { usuarioDaRequest } from "@/lib/supabase/server";
import { lerDuracao } from "@/lib/duracao";
import { lerEfeitos } from "@/lib/op-rpg";
import { catalogoTiposDoNarrador } from "@/lib/tipos-dano-servidor";
import { catalogoCondicoesDoNarrador } from "@/lib/combate-servidor";
import { DemoAcaoReal, type FichaDeTeste } from "./demo";

// Protótipo: a descrição gerada com o formulário real de ação e as ações reais
// dos personagens de teste. Só em desenvolvimento.
const NOMES = ["Rugo de Zou", "Kajiki", "Kanoa de Shandora"];

export default async function PrototipoAcaoRealPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const user = await usuarioDaRequest();
  if (!user) redirect("/login");

  const fichas = await prisma.personagem.findMany({
    where: { userId: user.id, nome: { in: NOMES } },
    select: {
      id: true,
      nome: true,
      nivel: true,
      atributoCdTecnicas: true,
      forca: true,
      destreza: true,
      constituicao: true,
      sabedoria: true,
      vontade: true,
      presenca: true,
      recursos: { select: { id: true, nome: true }, orderBy: { nome: "asc" } },
      habilidades: {
        select: {
          id: true,
          nome: true,
          tipo: true,
          descricao: true,
          custoPp: true,
          custoPa: true,
          usos: true,
          duracao: true,
          efeitos: true,
        },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      },
      acoes: {
        select: {
          id: true,
          nome: true,
          descricao: true,
          tipo: true,
          gatilho: true,
          tecnica: true,
          grau: true,
          efeitos: true,
          duracao: true,
          dano: true,
          tipoDano: true,
          alcance: true,
          atributoSalv: true,
          salvSucesso: true,
          atributoAtaque: true,
          custoPp: true,
          custoPa: true,
          ordem: true,
        },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      },
    },
  });

  const dados: FichaDeTeste[] = fichas
    .sort((a, b) => NOMES.indexOf(a.nome) - NOMES.indexOf(b.nome))
    .map((f) => ({
      id: f.id,
      nome: f.nome,
      nivel: f.nivel,
      atributoCd: f.atributoCdTecnicas,
      atributos: {
        forca: f.forca,
        destreza: f.destreza,
        constituicao: f.constituicao,
        sabedoria: f.sabedoria,
        vontade: f.vontade,
        presenca: f.presenca,
      },
      recursos: f.recursos,
      habilidades: f.habilidades.map((h) => ({
        id: h.id,
        nome: h.nome,
        tipo: h.tipo,
        descricao: h.descricao,
        custoPp: h.custoPp,
        custoPa: h.custoPa,
        usos: h.usos,
        duracao: lerDuracao(h.duracao),
        efeitos: lerEfeitos(h.efeitos),
      })),
      acoes: f.acoes.map((a) => ({
        id: a.id,
        nome: a.nome,
        descricao: a.descricao,
        tipo: a.tipo,
        gatilho: a.gatilho,
        tecnica: a.tecnica,
        grau: a.grau,
        efeitos: lerEfeitos(a.efeitos),
        duracao: lerDuracao(a.duracao),
        dano: a.dano,
        tipoDano: a.tipoDano,
        alcance: a.alcance,
        atributoSalv: a.atributoSalv,
        salvSucesso: a.salvSucesso,
        atributoAtaque: a.atributoAtaque,
        custoPp: a.custoPp,
        custoPa: a.custoPa,
      })),
    }));

  // Os tipos de dano vêm direto da Biblioteca do usuário: ícone, cor e efeito.
  const tiposDano = await catalogoTiposDoNarrador(user.id);
  const catalogoCondicoes = await catalogoCondicoesDoNarrador(user.id);
  return <DemoAcaoReal fichas={dados} tiposDano={tiposDano} catalogoCondicoes={catalogoCondicoes} />;
}
