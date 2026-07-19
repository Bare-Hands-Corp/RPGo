"use client";

import { useState } from "react";
import {
  EFEITOS_COR,
  EFEITO_COR_PADRAO,
  estiloAplicado,
  lerEstilosTag,
  separarTags,
  varsEstiloCor,
  type EfeitoCor,
  type EstiloCor,
  type MapaEstilosTag,
} from "@/lib/estilos-cor";

// Paleta inicial dos pickers. Precisa ser hex — <input type="color"> não
// aceita var(), e os tons derivados (gradiente/metálico/holo) saem do hex.
export const SWATCHES_COR = [
  "#d4af37", // berries/ouro
  "#1f9eff", // azul
  "#27ae60", // verde
  "#e74c3c", // vermelho
  "#9b59b6", // roxo
  "#f39c12", // laranja
  "#ec4899", // rosa
  "#14b8a6", // turquesa
  "#64748b", // cinza
];

/**
 * Pinta um texto com o estilo escolhido, na família pedida. É o render
 * compartilhado: o `<span>` interno existe porque gradiente/metálico/holo
 * clipam o degradê no texto, e a pílula precisa sobrar no elemento de fora.
 */
export function TextoFx({
  texto,
  estilo,
  familia,
  className = "",
  title,
}: {
  texto: string;
  estilo: EstiloCor | null | undefined;
  familia: "chip" | "texto";
  className?: string;
  title?: string;
}) {
  const { className: fx, style } = estiloAplicado(
    estilo,
    familia === "chip" ? "chip" : "texto",
  );

  if (familia === "texto") {
    return (
      <span className={`${className} ${fx}`.trim()} style={style} title={title}>
        {texto}
      </span>
    );
  }

  return (
    <span className={`${className} ${fx}`.trim()} style={style} title={title}>
      <span className="fx-texto">{texto}</span>
    </span>
  );
}

/** Pílula de tag. Sem estilo configurado cai na classe padrão passada. */
export function TagChip({
  nome,
  estilo,
  classePadrao = "tag",
}: {
  nome: string;
  estilo: EstiloCor | null | undefined;
  classePadrao?: string;
}) {
  const semCor = !estilo?.cor;
  return (
    <TextoFx
      texto={nome}
      estilo={estilo}
      familia="chip"
      className={semCor ? classePadrao : "tag"}
    />
  );
}

/**
 * Picker de cor + efeito. Cor vazia = padrão do tema (aí o efeito não tem
 * o que pintar e o alvo fica no visual original).
 */
export function EstiloPicker({
  cor,
  cor2 = "",
  efeito,
  onChange,
  amostra = "Aa",
  permitirSemCor = true,
}: {
  cor: string;
  /** 2ª cor do gradiente. "" = derivada da primeira. */
  cor2?: string;
  efeito: EfeitoCor;
  onChange: (patch: { cor?: string; cor2?: string; efeito?: EfeitoCor }) => void;
  amostra?: string;
  permitirSemCor?: boolean;
}) {
  // Prévia dos efeitos precisa de alguma cor pra mostrar diferença — quando
  // o usuário ainda não escolheu, mostra na primeira da paleta.
  const corPrevia = cor || SWATCHES_COR[0];
  const varsPrevia = varsEstiloCor(corPrevia, cor2 || null) ?? undefined;

  return (
    <div className="estilo-picker">
      <div>
        <div className="estilo-picker-titulo">Efeito</div>
        <div className="efeito-grade">
          {EFEITOS_COR.map((e) => (
              <button
                type="button"
                key={e.slug}
                className={`efeito-opcao ${efeito === e.slug ? "ativo" : ""}`}
                onClick={() => onChange({ efeito: e.slug })}
                title={e.dica}
                aria-pressed={efeito === e.slug}
              >
                <span
                  className={`fx-texto-solto fx-${e.slug}`}
                  style={varsPrevia}
                >
                  {amostra}
                </span>
                <div style={{ marginTop: 4, fontSize: "0.68rem" }}>{e.nome}</div>
              </button>
          ))}
        </div>
      </div>

      <div>
        <div className="estilo-picker-titulo">
          {efeito === "gradiente" ? "Cor 1" : "Cor"}
        </div>
        <div className="cor-picker">
          <input
            type="color"
            className="cor-picker-input"
            value={cor || SWATCHES_COR[0]}
            onChange={(ev) => onChange({ cor: ev.target.value })}
            aria-label="Escolher cor"
          />
          <div className="cor-swatches">
            {SWATCHES_COR.map((c) => (
              <button
                type="button"
                key={c}
                className={`cor-swatch ${cor.toLowerCase() === c.toLowerCase() ? "ativo" : ""}`}
                style={{ background: c }}
                onClick={() => onChange({ cor: c })}
                title={c}
                aria-label={`Cor ${c}`}
              />
            ))}
            {permitirSemCor && (
              <button
                type="button"
                className={`cor-swatch cor-swatch-limpar ${!cor ? "ativo" : ""}`}
                onClick={() => onChange({ cor: "" })}
                title="Sem cor (padrão do tema)"
                aria-label="Sem cor"
              >
                <i className="fas fa-ban" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* A 2ª cor só existe no gradiente — os outros efeitos derivam tudo da
          cor base, então mostrar aqui seria um controle que não faz nada. */}
      {efeito === "gradiente" && (
        <div>
          <div className="estilo-picker-titulo">Cor 2</div>
          <div className="cor-picker">
            <input
              type="color"
              className="cor-picker-input"
              value={cor2 || SWATCHES_COR[1]}
              onChange={(ev) => onChange({ cor2: ev.target.value })}
              aria-label="Escolher a segunda cor"
            />
            <div className="cor-swatches">
              {SWATCHES_COR.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`cor-swatch ${
                    cor2.toLowerCase() === c.toLowerCase() ? "ativo" : ""
                  }`}
                  style={{ background: c }}
                  onClick={() => onChange({ cor2: c })}
                  title={c}
                  aria-label={`Segunda cor ${c}`}
                />
              ))}
              <button
                type="button"
                className={`cor-swatch cor-swatch-limpar ${!cor2 ? "ativo" : ""}`}
                onClick={() => onChange({ cor2: "" })}
                title="Automática (derivada da Cor 1)"
                aria-label="Segunda cor automática"
              >
                <i className="fas fa-wand-magic-sparkles" />
              </button>
            </div>
          </div>
          {!cor2 && (
            <p className="campo-dica">
              Automática: matiz vizinha da Cor 1. Escolha uma pra fechar o par.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Campo de tags: continua sendo texto livre separado por vírgula, e embaixo
 * lista as tags como chips clicáveis. Clicar num chip abre o picker daquela
 * tag — o estilo vive no mapa `estilos` (nome da tag → cor + efeito), gravado
 * na coluna `tagsEstilo` do item/habilidade.
 */
export function TagsEditor({
  tags,
  estilos,
  onTags,
  onEstilos,
  placeholder,
  classePadraoChip = "tag",
}: {
  tags: string;
  estilos: MapaEstilosTag;
  onTags: (v: string) => void;
  onEstilos: (v: MapaEstilosTag) => void;
  placeholder?: string;
  classePadraoChip?: string;
}) {
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const lista = separarTags(tags);
  const alvo = selecionada && lista.includes(selecionada) ? selecionada : null;
  const estiloAlvo: EstiloCor = alvo
    ? estilos[alvo] ?? { cor: null, efeito: EFEITO_COR_PADRAO }
    : { cor: null, efeito: EFEITO_COR_PADRAO };

  function patchEstilo(patch: { cor?: string; cor2?: string; efeito?: EfeitoCor }) {
    if (!alvo) return;
    const atual = estilos[alvo] ?? { cor: null, efeito: EFEITO_COR_PADRAO };
    const proximo: EstiloCor = {
      cor: patch.cor !== undefined ? patch.cor || null : atual.cor,
      cor2: patch.cor2 !== undefined ? patch.cor2 || null : atual.cor2 ?? null,
      efeito: patch.efeito ?? atual.efeito,
    };
    const mapa = { ...estilos };
    // Sem cor e sem efeito não vale entrada — some do mapa.
    if (!proximo.cor && proximo.efeito === EFEITO_COR_PADRAO) delete mapa[alvo];
    else mapa[alvo] = proximo;
    onEstilos(mapa);
  }

  return (
    <div className="tags-editor">
      <input
        type="text"
        value={tags}
        onChange={(e) => onTags(e.target.value)}
        placeholder={placeholder}
      />

      {lista.length === 0 ? (
        <div className="tags-editor-vazio">
          Escreva as tags acima pra poder estilizar cada uma.
        </div>
      ) : (
        <>
          <div className="tags-editor-vazio">
            Clique numa tag pra escolher cor e brilho dela.
          </div>
          <div className="tags-editor-chips">
            {lista.map((t) => {
              const estilo = estilos[t];
              const semCor = !estilo?.cor;
              const { className: fx, style } = estiloAplicado(estilo, "chip");
              // <span> e não <button>: dentro de um <form> o botão herdaria
              // estilo do agente e competiria em especificidade com as classes
              // fx-*, que precisam pintar igualzinho ao chip do card.
              return (
                <span
                  key={t}
                  role="button"
                  tabIndex={0}
                  className={`tag ${semCor ? classePadraoChip : ""} ${fx} ${
                    alvo === t ? "selecionada" : ""
                  }`.replace(/\s+/g, " ").trim()}
                  style={style}
                  onClick={() => setSelecionada(alvo === t ? null : t)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setSelecionada(alvo === t ? null : t);
                    }
                  }}
                >
                  <span className="fx-texto">{t}</span>
                </span>
              );
            })}
          </div>
        </>
      )}

      {alvo && (
        <div className="tags-editor-painel">
          <div className="tags-editor-painel-topo">
            <span>
              Estilo de <strong>{alvo}</strong>
            </span>
            <button
              type="button"
              className="tags-editor-fechar"
              onClick={() => setSelecionada(null)}
              aria-label="Fechar estilo"
            >
              <i className="fas fa-times" />
            </button>
          </div>
          <EstiloPicker
            cor={estiloAlvo.cor ?? ""}
            cor2={estiloAlvo.cor2 ?? ""}
            efeito={estiloAlvo.efeito}
            onChange={patchEstilo}
            amostra={alvo.slice(0, 6)}
          />
        </div>
      )}
    </div>
  );
}

/** Re-export pra quem só precisa ler o Json do banco sem importar a lib. */
export { lerEstilosTag, separarTags };
