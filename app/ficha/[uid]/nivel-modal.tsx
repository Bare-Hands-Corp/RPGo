"use client";

import { useMemo, useState, useTransition } from "react";
import Swal from "sweetalert2";
import { subirDeNivel } from "./actions";
import {
  PONTOS_APRIMORAMENTO,
  clampGanhoPv,
  montarProposta,
  validarAprimoramento,
  type Aprimoramento,
} from "@/lib/nivel";
import { ATRIBUTOS, formatarMod, modificador, type Atributo } from "@/lib/op-rpg";
import { rolarDados } from "@/lib/dice";
import { empilharRolagem } from "@/lib/empilhar-rolagem";

export type CamadaQueAbre = { arvore: string; camada: string };

export function NivelModal({
  personagemId,
  nivel,
  pe,
  tipoDadoVida,
  atributos,
  camadasQueAbrem,
  onFechar,
}: {
  personagemId: string;
  nivel: number;
  pe: number;
  tipoDadoVida: string;
  atributos: Record<Atributo, number>;
  camadasQueAbrem: CamadaQueAbre[];
  onFechar: () => void;
}) {
  const proposta = useMemo(
    () => montarProposta(nivel, pe, tipoDadoVida, atributos.constituicao),
    [nivel, pe, tipoDadoVida, atributos.constituicao],
  );

  const [pvGanho, setPvGanho] = useState(proposta.pvSugerido);
  const [rolado, setRolado] = useState<number | null>(null);
  const [apr, setApr] = useState<Aprimoramento>({});
  const [, startTransition] = useTransition();
  const [salvando, setSalvando] = useState(false);

  const gastos = Object.values(apr).reduce((t, v) => t + (v ?? 0), 0);
  const restantes = PONTOS_APRIMORAMENTO - gastos;

  const conDepois = atributos.constituicao + (apr.constituicao ?? 0);
  const retroativo =
    (modificador(conDepois) - modificador(atributos.constituicao)) *
    proposta.nivelNovo;

  function rolarPv() {
    const dado = { faces: proposta.faces, sinal: 1 as const };
    const r = rolarDados([dado], proposta.modCon);
    const total = clampGanhoPv(r.total);
    setRolado(total);
    setPvGanho(total);
    empilharRolagem({
      dados: [dado],
      modificador: proposta.modCon,
      nomePreset: `PV do nível ${proposta.nivelNovo}`,
    });
  }

  function ajustar(at: Atributo, delta: number) {
    setApr((curr) => {
      const atual = curr[at] ?? 0;
      const proximo = Math.max(0, atual + delta);
      if (delta > 0 && restantes <= 0) return curr;
      const novo = { ...curr, [at]: proximo };
      if (proximo === 0) delete novo[at];
      return novo;
    });
  }

  function confirmar() {
    const recusa = validarAprimoramento(apr, atributos);
    if (recusa) {
      Swal.fire({
        icon: "warning",
        title: "Aprimoramento inválido",
        text: recusa,
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
      return;
    }
    setSalvando(true);
    startTransition(async () => {
      try {
        await subirDeNivel(personagemId, { pvGanho, aprimoramento: apr });
        onFechar();
      } catch (err) {
        Swal.fire({
          icon: "error",
          title: "Erro",
          text: err instanceof Error ? err.message : "Falha ao subir de nível.",
          background: "var(--bg-card)",
          color: "var(--text-main)",
        });
      } finally {
        setSalvando(false);
      }
    });
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onFechar} aria-label="Fechar">
          <i className="fas fa-times" />
        </button>
        <h2>
          Nível {proposta.nivelAtual} → {proposta.nivelNovo}
        </h2>

        {!proposta.peAlcancado && (
          <p className="nivel-aviso">
            <i className="fas fa-triangle-exclamation" /> Faltam{" "}
            <strong>{proposta.peFaltando} PE</strong> pro limiar. Dá pra subir
            assim mesmo — mesa por marco narrativo não usa PE.
          </p>
        )}

        <h3 className="modal-secao" style={{ marginTop: 12 }}>
          <i className="fas fa-heart" /> Pontos de Vida
        </h3>
        <div className="nivel-pv">
          <input
            type="number"
            min={1}
            value={pvGanho}
            onChange={(e) => setPvGanho(clampGanhoPv(Number(e.target.value) || 1))}
          />
          <button type="button" className="btn-rect outline" onClick={rolarPv}>
            <i className="fas fa-dice" /> Rolar 1d{proposta.faces}
          </button>
        </div>
        <p className="campo-dica">
          Valor fixo do livro: <strong>{proposta.pvFixo}</strong>{" "}
          {proposta.modCon !== 0 && <>({formatarMod(proposta.modCon)} de CON) </>}
          = <strong>{proposta.pvSugerido}</strong>.
          {rolado !== null && <> Rolado: <strong>{rolado}</strong>.</>}
        </p>

        <h3 className="modal-secao">
          <i className="fas fa-arrow-up-right-dots" /> O que muda
        </h3>
        <ul className="nivel-mudancas">
          <li>
            <i className="fas fa-heart" /> PV máximo{" "}
            <strong>+{pvGanho + Math.max(0, retroativo)}</strong>
            {retroativo > 0 && (
              <span className="nivel-nota">
                {" "}
                (inclui +{retroativo} retroativo por CON par)
              </span>
            )}
          </li>
          <li>
            <i className="fas fa-dice-d20" /> Bônus de proficiência{" "}
            {proposta.profMudou ? (
              <strong>
                {formatarMod(proposta.profAntes)} → {formatarMod(proposta.profDepois)}
              </strong>
            ) : (
              <span className="nivel-nota">
                segue {formatarMod(proposta.profDepois)}
              </span>
            )}
          </li>
          <li>
            <i className="fas fa-dice" /> +1 Dado de Vida ({tipoDadoVida})
          </li>
          {camadasQueAbrem.map((c, i) => (
            <li key={i}>
              <i className="fas fa-sitemap" /> {c.arvore}: camada{" "}
              <strong>{c.camada}</strong> destrava
            </li>
          ))}
        </ul>

        <h3 className="modal-secao">
          <i className="fas fa-dumbbell" /> Aprimoramento de Atributo
        </h3>
        {!proposta.pedeAprimoramento && (
          <p className="campo-dica">
            O nível {proposta.nivelNovo} normalmente não dá aprimoramento — os
            níveis-chave dependem do Estilo de Combate. Distribua mesmo assim se
            a tua mesa mandar.
          </p>
        )}
        <div className="nivel-apr">
          {ATRIBUTOS.map((a) => {
            const ganho = apr[a.slug] ?? 0;
            const depois = atributos[a.slug] + ganho;
            return (
              <div key={a.slug} className={`nivel-apr-linha ${ganho > 0 ? "ativo" : ""}`}>
                <span className="nivel-apr-sigla">{a.sigla}</span>
                <span className="nivel-apr-valor">
                  {atributos[a.slug]}
                  {ganho > 0 && (
                    <>
                      {" → "}
                      <strong>{depois}</strong>
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => ajustar(a.slug, -1)}
                  disabled={ganho <= 0}
                  aria-label={`Menos ${a.nome}`}
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => ajustar(a.slug, +1)}
                  disabled={restantes <= 0}
                  aria-label={`Mais ${a.nome}`}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
        <p className="campo-dica">
          {restantes > 0
            ? `${restantes} ponto(s) por distribuir — +2 num atributo ou +1 em dois. Pode pular.`
            : "Pontos distribuídos."}
        </p>

        <div className="modal-actions">
          <button type="button" className="modal-btn-cancel" onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="modal-btn-save"
            onClick={confirmar}
            disabled={salvando}
          >
            {salvando ? "Subindo…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
