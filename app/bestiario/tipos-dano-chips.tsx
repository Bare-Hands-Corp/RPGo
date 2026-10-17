"use client";

// Escolhas em chips da criatura que vêm da Biblioteca do narrador, com a cor
// e o ícone de lá, iguais aos da ficha do jogador: tipos de dano e condições.
// Tipo de dano que falta é criado aqui mesmo e já entra na Biblioteca.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { useCatalogoCondicoes, useEstiloCondicao } from "@/components/tipos-dano/condicoes";
import { useCatalogoTipos, useEstiloTipoDano } from "@/components/tipos-dano/tipos-dano";
import { mesmaCondicao } from "@/lib/condicoes";
import { mesmoTipo } from "@/lib/dano";
import { criarTipoDano } from "./traits-actions";

type Cara = { className: string; style?: React.CSSProperties; icone?: string | null } | undefined;

type ChipsProps = {
  rotulo: string;
  opcoes: string[];
  value: string[];
  onChange: (valor: string[]) => void;
  igual: (a: string, b: string) => boolean;
  decorar: (opcao: string) => Cara;
  // O que dizer do valor escolhido que não está no catálogo.
  dicaDeFora: string;
  className?: string;
  children?: (fora: string[]) => React.ReactNode;
};

// Vários de uma lista: clicar marca e desmarca. O que já estava salvo e saiu
// do catálogo continua aparecendo, tracejado, pra não sumir calado.
function ChipsMultiplos({ rotulo, opcoes, value, onChange, igual, decorar, dicaDeFora, className, children }: ChipsProps) {
  const fora = value.filter((v) => !opcoes.some((o) => igual(o, v)));
  return (
    <div className={`chips-campo bestiario-tipos-dano${className ? ` ${className}` : ""}`}>
      <span className="bestiario-tipos-dano-rotulo">{rotulo}</span>
      <div className="sugestoes" role="group" aria-label={rotulo}>
        {opcoes.map((o) => {
          const ativo = value.some((v) => igual(v, o));
          const cara = decorar(o);
          return (
            <button
              type="button"
              key={o}
              className={`sugestao chip-opcao${ativo ? " ativo" : ""}${cara?.className ? ` ${cara.className}` : ""}`}
              style={cara?.style}
              aria-pressed={ativo}
              onClick={() => onChange(ativo ? value.filter((v) => !igual(v, o)) : [...value, o])}
            >
              {cara?.icone && <i className={`fas ${cara.icone}`} />}
              <span className="fx-texto">{o}</span>
            </button>
          );
        })}
        {fora.map((v) => (
          <button
            type="button"
            key={v}
            className="sugestao chip-opcao ativo bestiario-chip-fora"
            aria-pressed
            title={`${dicaDeFora} Clique pra tirar.`}
            onClick={() => onChange(value.filter((x) => x !== v))}
          >
            <span className="fx-texto">{v}</span> <i className="fas fa-xmark" />
          </button>
        ))}
        {children?.(fora)}
      </div>
    </div>
  );
}

type Props = {
  rotulo: string;
  value: string[];
  onChange: (valor: string[]) => void;
  className?: string;
};

export function TiposDanoChips({ rotulo, value, onChange, className }: Props) {
  const router = useRouter();
  const nomes = useCatalogoTipos();
  const estiloDoTipo = useEstiloTipoDano();
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Cadastra na pasta Tipos de dano e já deixa marcado aqui.
  async function cadastrar(novo: string) {
    if (!novo.trim() || salvando) return;
    setSalvando(true);
    try {
      const final = await criarTipoDano(novo);
      onChange([...value.filter((v) => !mesmoTipo(v, final)), final]);
      setNome("");
      setCriando(false);
      router.refresh();
    } catch (err) {
      void Swal.fire({
        icon: "error",
        title: "Não deu pra criar o tipo",
        text: err instanceof Error ? err.message : "Tente novamente.",
        background: "var(--bg-card)",
        color: "var(--text-main)",
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ChipsMultiplos
      rotulo={rotulo}
      opcoes={nomes}
      value={value}
      onChange={onChange}
      igual={mesmoTipo}
      decorar={estiloDoTipo}
      dicaDeFora="Tipo que não está na Biblioteca."
      className={className}
    >
      {(fora) => (
        <>
          {fora.map((v) => (
            <button
              type="button"
              key={`cadastrar-${v}`}
              className="sugestao sugestao-mais"
              disabled={salvando}
              onClick={() => void cadastrar(v)}
            >
              <i className="fas fa-plus" /> Cadastrar “{v}”
            </button>
          ))}
          {criando ? (
            <span className="bestiario-tipo-novo">
              <input
                type="text"
                value={nome}
                maxLength={40}
                autoFocus
                aria-label="Nome do novo tipo de dano"
                placeholder="Nome do tipo"
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void cadastrar(nome);
                  } else if (e.key === "Escape") {
                    setCriando(false);
                  }
                }}
              />
              <button type="button" className="sugestao sugestao-mais" disabled={salvando || !nome.trim()} onClick={() => void cadastrar(nome)}>
                <i className={`fas ${salvando ? "fa-spinner fa-spin" : "fa-check"}`} /> Criar
              </button>
              <button type="button" className="sugestao" onClick={() => setCriando(false)}>
                Cancelar
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="sugestao sugestao-mais"
              title="Cria o tipo na Biblioteca (pasta Tipos de dano); a cor e o ícone você escolhe por lá"
              onClick={() => setCriando(true)}
            >
              <i className="fas fa-plus" /> Novo tipo
            </button>
          )}
        </>
      )}
    </ChipsMultiplos>
  );
}

// Condições do catálogo do narrador (ex: a quais a criatura é imune).
export function CondicoesChips({ rotulo, value, onChange, className }: Props) {
  const nomes = useCatalogoCondicoes();
  const estilo = useEstiloCondicao();
  return (
    <ChipsMultiplos
      rotulo={rotulo}
      opcoes={nomes}
      value={value}
      onChange={onChange}
      igual={mesmaCondicao}
      decorar={estilo}
      dicaDeFora="Condição que não está na Biblioteca."
      className={className}
    />
  );
}

// Chip de leitura de um tipo, com a cara do catálogo; fora dele, o chip comum.
export function ChipTipoDano({ tipo, className = "" }: { tipo: string; className?: string }) {
  const cara = useEstiloTipoDano()(tipo);
  return (
    <span className={`${className} ${cara?.className ?? ""}`.trim()} style={cara?.style}>
      {cara?.icone && <i className={`fas ${cara.icone}`} />} <span className="fx-texto">{tipo}</span>
    </span>
  );
}
