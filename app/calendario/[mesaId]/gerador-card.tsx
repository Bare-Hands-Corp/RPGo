"use client";

type Props = {
  estacao: string;
  totalTipos: number;
  onGerar: () => void;
  onEditarPerfil: () => void;
};

export function GeradorClimaCard({ estacao, totalTipos, onGerar, onEditarPerfil }: Props) {
  const semTipos = totalTipos === 0;
  const tipos = totalTipos === 1 ? "1 tipo de clima" : `${totalTipos} tipos de clima`;

  return (
    <div className="cal-gerador-card">
      <div className="cal-gerador-info">
        <div className="cal-gerador-icone">
          <i className="fas fa-cloud-sun-rain" />
        </div>
        <div>
          <div className="cal-gerador-titulo">Gerador de clima</div>
          <div className="cal-gerador-sub">
            {semTipos
              ? "Cadastre tipos de clima e o gerador sorteia um pra cada dia do intervalo."
              : `Sorteia o clima dia a dia num intervalo. ${tipos} cadastrados, com peso por estação — hoje é ${estacao}.`}
          </div>
        </div>
      </div>
      <div className="cal-gerador-acoes">
        <button
          type="button"
          className="btn-rect neutro sm"
          onClick={onGerar}
          disabled={semTipos}
          title={semTipos ? "Cadastre ao menos um tipo de clima primeiro" : undefined}
        >
          <i className="fas fa-dice" /> Gerar clima
        </button>
        <button type="button" className="btn-rect neutro sm" onClick={onEditarPerfil}>
          <i className="fas fa-sliders" /> Tipos de clima
        </button>
      </div>
    </div>
  );
}
