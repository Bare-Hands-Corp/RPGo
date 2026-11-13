// Efeito na hora no servidor: recurso, cura e PV temporário em quem tem, com
// as fórmulas de dado roladas aqui (Gatilho e item usado por efeito).

import { Prisma, type Personagem, type Recurso } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rolarDados } from "@/lib/dice";
import { comAjuste, ehPonto } from "@/lib/pontos";
import {
  computarDeltasInstantaneos,
  maximoDoRecurso,
  poolsEfetivos,
  resolverFormula,
  type EfeitoHabilidade,
  type EfeitosAgregados,
} from "@/lib/op-rpg";

// Soma sem tirar o que já passou do máximo; gasto não passa de 0.
function somarAte(atual: number, delta: number, max: number): number {
  return delta > 0 ? Math.min(atual + delta, Math.max(atual, max)) : Math.max(0, atual + delta);
}

// Devolve o que gravar, o patch da ficha e quanto cada recurso mudou.
export function opsNaHora(
  personagem: Personagem,
  recursos: Recurso[],
  agg: EfeitosAgregados,
  efeitos: EfeitoHabilidade[],
  // Nome de quem deu o efeito: motivo do ajuste no ponto.
  fonte: string,
) {
  const ctx = agg.ctxFormula;
  const rolar = (formula: string) => {
    const f = ctx ? resolverFormula(formula, ctx.atributos, ctx.nivel) : { dados: [], modificador: Number(formula) || 0 };
    return Math.trunc(f.dados.length > 0 ? rolarDados(f.dados, f.modificador).total : f.modificador);
  };
  const instantaneos = efeitos.filter(
    (e) => e.tipo === "recurso_delta" || e.tipo === "cura" || (e.tipo === "modificador" && e.alvo === "hp-temp"),
  );
  const rolagens: Record<number, number> = {};
  instantaneos.forEach((e, i) => {
    if (e.tipo === "cura") rolagens[i] = rolar(e.valor);
    else if (e.tipo === "modificador" && e.formula) rolagens[i] = rolar(e.formula);
  });
  const d = computarDeltasInstantaneos(instantaneos, { incluirMax: false, rolagens, ctx });
  const pools = poolsEfetivos(personagem, agg);
  const dados: Prisma.PersonagemUpdateInput = {};
  if (d.hpAtual) dados.hpAtual = somarAte(personagem.hpAtual, d.hpAtual, pools.hpMax);
  if (d.hpTemp > personagem.hpTemp) {
    dados.hpTemp = d.hpTemp;
    dados.hpTempDuracao = d.hpTempDuracao ?? null;
  }
  if (d.ppAtual) dados.ppAtual = somarAte(personagem.ppAtual, d.ppAtual, pools.ppMax);
  if (d.exaustao) dados.exaustao = Math.min(6, Math.max(0, personagem.exaustao + d.exaustao));
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (Object.keys(dados).length > 0) ops.push(prisma.personagem.update({ where: { id: personagem.id }, data: dados }));
  const recursosDelta: Record<string, number> = {};
  for (const r of recursos) {
    const delta = d.recursos[r.id] ?? 0;
    if (!delta) continue;
    // Ponto não guarda saldo: o efeito vira ajuste com o nome da fonte.
    if (ehPonto(r)) {
      recursosDelta[r.id] = delta;
      ops.push(prisma.recurso.update({ where: { id: r.id }, data: { ajustes: comAjuste(r.ajustes, delta, fonte) } }));
      continue;
    }
    const novo = Math.min(maximoDoRecurso(r, ctx), Math.max(0, r.valorAtual + delta));
    if (novo === r.valorAtual) continue;
    recursosDelta[r.id] = novo - r.valorAtual;
    ops.push(prisma.recurso.update({ where: { id: r.id }, data: { valorAtual: novo } }));
  }
  return { ops, dados, recursosDelta };
}
