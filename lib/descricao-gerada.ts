// Descrição automática de uma ação: monta a frase a partir dos efeitos, da
// duração e da condição de uso, com os chips ligados aos efeitos reais
// (`{{efeito:tipo#N}}`) e à duração (`{{duracao}}`). A pessoa pode editar o
// texto depois, e regenerar. Puro: só tipos de fora (erased), roda em script.
//
//   Ao ativar, {{duracao}} {{efeito:dano_extra#0}} e adiciona {{efeito:vantagem#1}}
//   na próxima jogada de ataque.
//
//   Ao ser ativada quando [[acao:a1|Agigantar]] está ativa, {{duracao}} adiciona
//   {{efeito:deslocamento#0}} e {{efeito:modificador#1}}.
//
// Os efeitos entram na ordem em que foram escolhidos (a ordem da lista).

import type { Duracao } from "./duracao";
import { alvoDaCura, type EfeitoHabilidade } from "./op-rpg";

export type EntradaGerador = {
  efeitos: EfeitoHabilidade[];
  duracao?: Duracao | null;
  // Dano da própria ação ("2d6+FOR", tipo "Fogo"): vira a primeira frase.
  dano?: { formula: string; tipo?: string } | null;
  // Reação: o que a dispara (slug de GATILHOS_REACAO). "outro"/vazio não entra.
  gatilho?: string | null;
  // Só pode ser usada com outra ação ativa (em curso).
  requerAcao?: { id: string; nome: string } | null;
  // Tem jogada de acerto (o atributo é o da ação).
  ataque?: { atributo?: string | null } | null;
  // Alcance como está escrito na ação ("Toque", "9 m", "cone 15 m", "linha 18 m").
  alcance?: string | null;
  // Salvaguarda da ação: o alvo rola e `sucesso` diz o que sobra do dano.
  salvaguarda?: { atributo: string; sucesso: "nada" | "metade" } | null;
  // Habilidade passiva: não se ativa, então abre com "Passivamente" e sem duração.
  passiva?: boolean;
};

// O que depende de tabelas do app entra por aqui (não importamos o op-rpg).
export type OpcoesGerador = {
  rotuloAlvo: (slug: string) => string;
  siglaAtributo?: (slug: string) => string;
  // "Toque" e "1,5 m" são o mesmo alcance (op-rpg `normalizarAlcance`).
  normalizarAlcance?: (alcance: string) => string;
};

// Gatilhos de reação (lib/combate.ts GATILHOS_REACAO) como parte de uma frase
// "Ao ser ativada quando …". null = não dá frase (usada à mão).
export const FRASE_GATILHO: Record<string, string | null> = {
  qualquer: "você é alvo de qualquer ação",
  ataque: "você é alvo de uma jogada de ataque",
  salvaguarda: "você é alvo de uma salvaguarda para evitar dano",
  dano: "você vai receber dano",
  voce_ou_aliado_dano: "você ou um aliado vai receber dano",
  aliado_ataque: "um ataque vai acertar um aliado",
  outro: null,
};

// Como a duração aparece no chip. Um turno vale "até o próximo turno" (a vez de
// quem usou volta e acaba).
export function rotuloDuracao(d: Duracao | null | undefined): string {
  if (!d) return "Duração";
  const n = d.quantidade ?? 1;
  const plural = (nome: string) => `${n} ${nome}${n === 1 ? "" : "s"}`;
  const base =
    d.unidade === "instantanea"
      ? "Imediatamente"
      : d.unidade === "turno"
        ? n === 1
          ? "Até o próximo turno"
          : `Por ${plural("turno")}`
        : d.unidade === "minuto"
          ? `Por ${plural("minuto")}`
          : d.unidade === "hora"
            ? `Por ${plural("hora")}`
            : d.unidade === "dia"
              ? `Por ${plural("dia")}`
              : d.unidade === "encontro"
                ? "Até o fim do encontro"
                : "Enquanto tiver PV temporário";
  return d.concentracao ? `${base} (concentração)` : base;
}

/* ─── Em que jogada o efeito vale ────────────────────────── */

const ATAQUES: Record<string, string> = {
  "ataque-cc": "ataque corpo a corpo",
  "ataque-distancia": "ataque à distância",
  "ataque-tecnica": "ataque de técnica",
  "ataque-comum": "ataque comum",
};

// A jogada a que o alvo do efeito se refere, no singular e no plural.
function jogadaDe(alvo: string, rot: (s: string) => string): { sing: string; plu: string; fem: boolean } {
  if (alvo === "ataque") return { sing: "jogada de ataque", plu: "jogadas de ataque", fem: true };
  if (ATAQUES[alvo]) return { sing: `jogada de ${ATAQUES[alvo]}`, plu: `jogadas de ${ATAQUES[alvo]}`, fem: true };
  if (alvo === "qualquer") return { sing: "jogada de d20", plu: "jogadas de d20", fem: true };
  // O atributo citado vira chip ({{attr:forca}}).
  const attr = /^(salv|teste)-(forca|destreza|constituicao|sabedoria|vontade|presenca)$/.exec(alvo);
  if (attr?.[1] === "salv") {
    const chip = `{{attr:${attr[2]}}}`;
    return { sing: `salvaguarda de ${chip}`, plu: `salvaguardas de ${chip}`, fem: true };
  }
  if (attr) {
    const chip = `{{attr:${attr[2]}}}`;
    return { sing: `teste de ${chip}`, plu: `testes de ${chip}`, fem: false };
  }
  if (alvo.startsWith("salv-")) {
    const nome = rot(alvo).replace(/^Salv\.\s*/i, "");
    return { sing: `salvaguarda de ${nome}`, plu: `salvaguardas de ${nome}`, fem: true };
  }
  // Teste de perícia ("Atletismo").
  const nome = rot(alvo).replace(/^Testes de\s*/i, "");
  return { sing: `teste de ${nome}`, plu: `testes de ${nome}`, fem: false };
}

// Quando o efeito vale, na frase ("na próxima jogada de ataque").
function momento(alvo: string, vale: string | undefined, rot: (s: string) => string): string {
  const j = jogadaDe(alvo, rot);
  if (vale === "proxima") return `${j.fem ? "na próxima" : "no próximo"} ${j.sing}`;
  const quais = `${j.fem ? "nas" : "nos"} ${j.plu}`;
  return vale === "turno" ? `${quais} durante o próximo turno` : quais;
}

/* ─── Uma frase por efeito ───────────────────────────────── */

// `verbo` null: a frase se basta (só o chip, ou texto pronto). Efeitos seguidos
// com o mesmo verbo dividem ele: "adiciona A e B".
type Frase = { verbo: string | null; resto: string };

const SO_CHIP = new Set([
  "dano_extra",
  "dados_extra",
  "passo_dano",
  "critico_extra",
  "dano_maximo",
  "piso_dado",
  "explosao",
  "dano_melhor_de",
  "dano_min",
  "multi_ataque",
  "ataque_poderoso",
  "por_turno",
  "trigger",
]);

// Tipos de efeito com frase pensada pra eles. Os outros caem no "ganha {chip}"
// genérico: a lista serve pra revisar, com fichas reais, quais merecem frase.
export const TIPOS_COM_FRASE_PROPRIA = new Set<string>([
  ...SO_CHIP,
  "vantagem",
  "desvantagem",
  "modificador",
  "deslocamento",
  "cura",
  "condicao_aplicar",
  "condicao_remover",
  "condicao_imune",
  "colateral",
  "recurso_delta",
  "livre",
]);

// `salvDaAcao`: a salvaguarda que a própria ação já anuncia; o efeito que evita
// com a mesma não repete ("(salvaguarda de CON evita)").
function frase(e: EfeitoHabilidade, i: number, op: OpcoesGerador, salvDaAcao?: string): Frase | null {
  const chip = `{{efeito:${e.tipo}#${i}}}`;
  const quem = e.quem;
  switch (e.tipo) {
    case "vantagem":
    case "desvantagem": {
      // Efeito ainda sem alvo (recém-adicionado no formulário): sem o "quando vale".
      const onde = e.alvo?.trim() ? momento(e.alvo, e.vale, op.rotuloAlvo) : "";
      const extra = [onde, e.quando?.trim()].filter(Boolean).join(", ");
      const quando = extra ? ` ${extra}` : "";
      if (quem === "aliado") return { verbo: "concede", resto: `${chip} a um aliado${quando}` };
      if (quem === "inimigo") {
        return e.tipo === "desvantagem"
          ? { verbo: "impõe", resto: `${chip} ao inimigo${quando}` }
          : { verbo: "concede", resto: `${chip} ao inimigo${quando}` };
      }
      return { verbo: "adiciona", resto: `${chip}${quando}` };
    }
    case "modificador":
      return quem === "aliado"
        ? { verbo: "concede", resto: `${chip} a um aliado` }
        : { verbo: "adiciona", resto: chip };
    case "deslocamento":
      return { verbo: "adiciona", resto: chip };
    case "cura": {
      // O chip já diz o pool: PV temporário se ganha, PP se recupera.
      const onde = alvoDaCura(e);
      if (onde === "hp") {
        return quem === "aliado"
          ? { verbo: "cura", resto: `um aliado em ${chip}` }
          : { verbo: "recupera", resto: `${chip} de vida` };
      }
      if (quem === "aliado") return { verbo: "concede", resto: `${chip} a um aliado` };
      return { verbo: onde === "hp-temp" ? "ganha" : "recupera", resto: chip };
    }
    case "condicao_aplicar": {
      const c = `{{cond:${e.condicao}}}`;
      if (e.emVoce) return { verbo: null, resto: `você fica ${c}${e.quando === "fim" ? " ao fim da ação" : ""}` };
      const dura = e.rodadas && e.rodadas > 1 && e.rodadas < 100 ? ` por ${e.rodadas} rodadas` : "";
      // A salvaguarda que evita vale mesmo sem CD escrita (a CD vem da técnica).
      // O chip diz só o atributo e a CD ("CON | CD 18"). Sem `evita` a CD fica
      // em texto, pois não há atributo pra ligar a ela.
      const salv = e.evita
        ? e.evita !== salvDaAcao
          ? ` {{salv:${e.evita}${e.cd ? `|${e.cd}` : ""}}}`
          : ""
        : e.cd
          ? ` (CD ${e.cd})`
          : "";
      return { verbo: "aplica", resto: `${c} ao alvo${dura}${salv}` };
    }
    case "condicao_remover":
      return { verbo: "remove", resto: `{{cond:${e.condicao}}}` };
    case "condicao_imune":
      return { verbo: "fica imune a", resto: `{{cond:${e.condicao}}}` };
    case "colateral":
      return { verbo: null, resto: `como custo, ${chip}` };
    case "recurso_delta":
      return { verbo: "recebe", resto: chip };
    case "livre":
      // Texto livre: escrito sem padrão, entra como a pessoa escreveu.
      return e.texto?.trim() ? { verbo: null, resto: e.texto.trim() } : null;
    default:
      return SO_CHIP.has(e.tipo) ? { verbo: null, resto: chip } : { verbo: "ganha", resto: chip };
  }
}

// "A, B e C".
function lista(itens: string[]): string {
  return itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

// Junta frases seguidas do mesmo verbo: "adiciona A e B".
function agrupar(frases: Frase[]): string[] {
  const grupos: { verbo: string | null; restos: string[] }[] = [];
  for (const f of frases) {
    const ult = grupos[grupos.length - 1];
    if (f.verbo && ult && ult.verbo === f.verbo) ult.restos.push(f.resto);
    else grupos.push({ verbo: f.verbo, restos: [f.resto] });
  }
  return grupos.map((g) => (g.verbo ? `${g.verbo} ${lista(g.restos)}` : g.restos.join(" e ")));
}

const capitaliza = (s: string) => (/^\p{L}/u.test(s) ? s[0].toUpperCase() + s.slice(1) : s);

// Quando a ação pode ser usada: o gatilho da reação e/ou outra ação ativa.
function condicoesDeUso(entrada: EntradaGerador): string[] {
  const out: string[] = [];
  const g = entrada.gatilho ? FRASE_GATILHO[entrada.gatilho] : null;
  if (g) out.push(g);
  if (entrada.requerAcao) out.push(`[[acao:${entrada.requerAcao.id}|${entrada.requerAcao.nome}]] está ativa`);
  return out;
}

/* ─── Ataque, alcance e salvaguarda da ação ──────────────── */

// Corpo a corpo: "Toque" (já normalizado pra 1,5 m), "cc …", "corpo a corpo".
const RE_CORPO = new RegExp(String.raw`^(1,5 ?m|cc(?![\p{L}]).*|corpo.*|contato)$`, "iu");
// Alcance em forma de área.
const RE_AREA = new RegExp(String.raw`(^|[^\p{L}])(cone|linha|esfera|raio|área|area|círculo|circulo|cubo|explosão|explosao)([^\p{L}]|$)`, "iu");
// Alcance que não diz nada (o próprio usuário).
const RE_PESSOAL = new RegExp(String.raw`^(pessoal|você|voce|self|0 ?m?|—|-)$`, "iu");

type InfoAlcance = { texto: string; corpo: boolean; area: boolean };

function infoAlcance(bruto: string | null | undefined, op: OpcoesGerador): InfoAlcance | null {
  const t = (op.normalizarAlcance ? op.normalizarAlcance(bruto ?? "") : (bruto ?? "")).trim();
  if (!t || RE_PESSOAL.test(t)) return null;
  const corpo = RE_CORPO.test(t);
  // Corpo a corpo não precisa dos 1,5 m: "corpo a corpo" já diz tudo.
  return { texto: corpo ? "corpo a corpo" : t, corpo, area: RE_AREA.test(t) };
}

// "ataque corpo a corpo" / "ataque à distância (alcance 9 m)" / "ataque". O
// atributo do acerto não entra: a jogada já sabe qual é. Vira "Faz um …." ou
// entra como primeira ação da frase de uma reação.
function corpoDoAtaque(entrada: EntradaGerador, al: InfoAlcance | null): string | null {
  if (!entrada.ataque) return null;
  if (al?.corpo) return "ataque corpo a corpo";
  if (al) return `ataque à distância (${/^\d/.test(al.texto) ? `alcance ${al.texto}` : al.texto})`;
  return "ataque";
}

// Salvaguarda da ação. Com acerto ela é das condições, e o efeito já a cita; sem
// acerto o alvo rola contra o dano e `sucesso` diz o que sobra dele.
function fraseSalvaguarda(entrada: EntradaGerador, al: InfoAlcance | null, temDano: boolean): string | null {
  const s = entrada.salvaguarda;
  if (!s) return null;
  const sigla = `{{salv:${s.atributo}}}`;
  const quem = al?.area ? `Cada criatura na área (${al.texto})` : entrada.ataque ? "O alvo atingido" : "O alvo";
  if (entrada.ataque || !temDano) return `${quem} faz uma salvaguarda ${sigla}.`;
  const resultado = s.sucesso === "metade" ? "dano total se falhar, metade se passar" : "dano total se falhar, nenhum se passar";
  return `${quem} faz uma salvaguarda ${sigla}: ${resultado}.`;
}

// Efeitos sem nada pra dizer (sem efeitos, sem dano) devolvem "": a ação fica
// sem descrição automática.
export function gerarDescricao(entrada: EntradaGerador, op: OpcoesGerador): string {
  // Com acerto (ou sem dano) a salvaguarda da ação é a das condições: o chip
  // fica na condição que ela evita e a frase solta some. Senão a frase solta
  // leva o chip e a condição não repete.
  const salvAtr = entrada.salvaguarda?.atributo;
  const salvNaCondicao =
    !!salvAtr &&
    (!!entrada.ataque || !entrada.dano?.formula) &&
    entrada.efeitos.some((e) => e.tipo === "condicao_aplicar" && !e.emVoce && e.evita === salvAtr);
  const efeitos = entrada.efeitos.map((e, i) => frase(e, i, op, salvNaCondicao ? undefined : salvAtr)).filter((f): f is Frase => !!f);
  const condicoes = condicoesDeUso(entrada);
  const dano = entrada.dano?.formula
    ? `((${entrada.dano.formula}${entrada.dano.tipo ? `|${entrada.dano.tipo}` : ""}))`
    : null;
  const linhas: string[] = [];
  // Com condição de uso (reação, outra ação ativa) o ataque e o dano entram na
  // frase, sob a abertura "Ao ser ativada quando…"; sem ela são frases à parte.
  const emFrase = condicoes.length > 0;
  const al = infoAlcance(entrada.alcance, op);
  const ataque = corpoDoAtaque(entrada, al);
  if (ataque && !emFrase) linhas.push(`Faz um ${ataque}.`);
  // Sem ataque, o alcance só aparece se há mais o que dizer (senão seria uma
  // ação descrita só por "Alcance: 1,5 m") e a área já entra na salvaguarda.
  else if (!ataque && al && !(entrada.salvaguarda && al.area) && (dano || efeitos.length > 0 || entrada.salvaguarda)) {
    linhas.push(`Alcance: ${al.texto}.`);
  }
  if (dano && !emFrase) linhas.push(`Causa ${dano} de dano.`);
  const salvaguarda = salvNaCondicao ? null : fraseSalvaguarda(entrada, al, !!dano);
  if (salvaguarda) linhas.push(salvaguarda);
  const frases: Frase[] = [
    ...(emFrase && ataque ? [{ verbo: "faz", resto: `um ${ataque}` }] : []),
    ...(emFrase && dano ? [{ verbo: "causa", resto: `${dano} de dano` }] : []),
    ...efeitos,
  ];

  if (frases.length > 0) {
    const abertura = entrada.passiva
      ? "Passivamente"
      : condicoes.length > 0
        ? `Ao ser ativada quando ${condicoes.join(" e ")}`
        : "Ao ativar";
    const dur = entrada.duracao && !entrada.passiva ? " {{duracao}}" : "";
    if (frases.length > 3) {
      // Muitos efeitos: uma linha pra cada, sem agrupar.
      const itens = frases.map((f) => capitaliza(f.verbo ? `${f.verbo} ${f.resto}` : f.resto));
      linhas.push(`${abertura}${dur ? `,${dur}` : ""}:`, ...itens.map((t) => `-:skull: ${t}`));
    } else {
      linhas.push(`${abertura},${dur} ${lista(agrupar(frases))}.`);
    }
  } else if (entrada.duracao && entrada.duracao.unidade !== "instantanea" && linhas.length > 0) {
    // Só dano: a duração só importa quando não é instantânea.
    linhas.push("Duração: {{duracao}}.");
  }
  return linhas.join("\n");
}
