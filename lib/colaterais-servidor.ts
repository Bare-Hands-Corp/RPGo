// Efeitos colaterais (Fase 2E): o que uma ação faz em quem usa, no uso ou
// quando ela acaba (encerrada, fim da duração, concentração perdida). Também as
// condições do Aplica Condição "em você". Só servidor.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INCLUDE_ACESSO, sessaoDoChat } from "@/lib/acesso-ficha";
import { lerConcentracao } from "@/lib/duracao";
import { lerRodadas, type CondicaoAplicada } from "@/lib/condicoes";
import { defesasDoAgregado, resolverDano } from "@/lib/dano";
import { rolarDados } from "@/lib/dice";
import { lerEfeitos, poolsEfetivos, resolverFormula, type QuandoColateral } from "@/lib/op-rpg";
import { lerBloqueios, RODADAS_POR_MINUTO, type Bloqueio } from "@/lib/colaterais";
import { carregarAgregado, soltarConcentracao } from "@/lib/efeitos-servidor";
import { aplicarCondicoesNoPersonagem } from "@/lib/combate-servidor";

// Quem assina no chat (como as mensagens do combate): chega a todos pelo realtime.
const UID_COLATERAL = "combate";

export async function aplicarColaterais(
  personagemId: string,
  acao: { nome: string; efeitos: unknown; grau: number },
  quando: QuandoColateral,
) {
  const efeitos = lerEfeitos(acao.efeitos);
  const colaterais = efeitos.flatMap((e) => (e.tipo === "colateral" && e.quando === quando ? [e] : []));
  const condicoes: CondicaoAplicada[] = efeitos.flatMap((e) =>
    e.tipo === "condicao_aplicar" && e.emVoce && (e.quando ?? "uso") === quando
      ? [
          {
            nome: e.condicao,
            rodadas: lerRodadas(e.rodadas),
            ...(e.rodadas ? {} : { usaPadroes: true }),
            salvaguarda: null,
            ...(e.mecanica ? { mecanica: e.mecanica } : {}),
          },
        ]
      : [],
  );
  if (condicoes.length > 0) await aplicarCondicoesNoPersonagem(personagemId, condicoes, acao.nome);
  if (colaterais.length === 0) return;

  const [personagem, { agg }] = await Promise.all([
    prisma.personagem.findUnique({ where: { id: personagemId }, include: INCLUDE_ACESSO }),
    carregarAgregado(personagemId),
  ]);
  if (!personagem) return;
  const ctx = agg.ctxFormula;
  const rolar = (formula: string) => {
    const f = ctx
      ? resolverFormula(formula, ctx.atributos, ctx.nivel, { grau: acao.grau })
      : { dados: [], modificador: Number(formula) || 0 };
    return Math.max(0, Math.trunc(f.dados.length > 0 ? rolarDados(f.dados, f.modificador).total : f.modificador));
  };

  const estado = {
    hpAtual: personagem.hpAtual,
    hpTemp: personagem.hpTemp,
    pvNegativos: personagem.pvNegativos,
    hpMax: poolsEfetivos(personagem, agg).hpMax,
  };
  let exaustao = personagem.exaustao;
  let temporaria = personagem.exaustaoTemporaria;
  const bloqueios: Bloqueio[] = lerBloqueios(personagem.bloqueios);
  const linhas: string[] = [];
  let caiu = false;

  const somarExaustao = (n: number, temp: boolean) => {
    const antes = exaustao;
    exaustao = Math.min(6, exaustao + n);
    if (temp) temporaria += exaustao - antes;
    return exaustao - antes;
  };

  for (const e of colaterais) {
    if (e.o === "dano") {
      const valor = e.valor ? rolar(e.valor) : 0;
      if (valor <= 0) continue;
      // Irredutível: sem resistência, redução nem PV temporário.
      const r = resolverDano(
        [{ valor, tipo: e.tipoDano ?? "" }],
        e.irredutivel ? [] : defesasDoAgregado(agg),
        estado,
        { semTemp: e.irredutivel === true, rolar: true },
      );
      estado.hpAtual = r.hpAtual.depois;
      estado.hpTemp = r.hpTemp.depois;
      estado.pvNegativos = r.pvNegativos.depois;
      caiu ||= r.hpAtual.depois <= 0;
      linhas.push(`${r.final} de dano${e.tipoDano ? ` ${e.tipoDano.toLowerCase()}` : ""}`);
    } else if (e.o === "exaustao") {
      const subiu = somarExaustao(Math.max(1, Number(e.valor) || 1), e.temporaria === true);
      if (subiu > 0) linhas.push(`+${subiu} de exaustão${e.temporaria ? " (até o descanso longo)" : ""}`);
    } else {
      const minutos = e.minutos ?? 1;
      bloqueios.push({ tipo: e.o === "sem_pp" ? "pp" : "haki", fonte: acao.nome, rodadas: minutos * RODADAS_POR_MINUTO });
      linhas.push(`${minutos} min ${e.o === "sem_pp" ? "sem PP" : "sem Haki"}`);
      // Debilitante: ficou sem PP depois do uso = 1 de exaustão.
      if (e.exaustaoSemPp && personagem.ppAtual <= 0 && somarExaustao(1, false) > 0) {
        linhas.push("+1 de exaustão (sem PP)");
      }
    }
  }
  if (linhas.length === 0) return;

  await prisma.$transaction([
    prisma.personagem.update({
      where: { id: personagemId },
      data: {
        hpAtual: estado.hpAtual,
        hpTemp: estado.hpTemp,
        pvNegativos: estado.pvNegativos,
        exaustao,
        exaustaoTemporaria: temporaria,
        bloqueios: bloqueios as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.mensagem.create({
      data: {
        sessionId: sessaoDoChat(personagem),
        uid: UID_COLATERAL,
        nome: personagem.nome,
        mensagem: `${acao.nome} (colateral): ${linhas.join(", ")}.`,
        tipo: "texto",
      },
    }),
  ]);
  // A 0 PV, a concentração acaba.
  if (caiu && personagem.concentracao) await soltarConcentracao(personagemId);
}

// Ações que acabaram (encerradas, fim da duração): os colaterais "no fim".
export async function colateraisDoFim(personagemId: string, acaoIds: string[]) {
  if (acaoIds.length === 0) return;
  const acoes = await prisma.acao.findMany({
    where: { personagemId, id: { in: acaoIds } },
    select: { nome: true, efeitos: true, grau: true },
  });
  for (const a of acoes) await aplicarColaterais(personagemId, a, "fim");
}

// A concentração acabou: se ela era numa ação, os colaterais "no fim" dela.
export async function colateraisDaConcentracao(personagemId: string, concentracaoAntes: unknown) {
  const c = lerConcentracao(concentracaoAntes);
  if (c?.tipo === "acao") await colateraisDoFim(personagemId, [c.id]);
}
