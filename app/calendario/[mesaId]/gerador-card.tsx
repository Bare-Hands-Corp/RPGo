"use client";

type Props = {
  estacao: string;
  totalTipos: number;
  onGerar: () => void;
  onEditarPerfil: () => void;
};

export function GeradorClimaCard({ estacao, totalTipos, onGerar, onEditarPerfil }: Props) {
  return (
    <div className="cal-gerador-card">
      <div className="cal-gerador-info">
        <div className="cal-gerador-icone">
          <i className="fas fa-cloud-sun-rain" />
        </div>
        <div>
          <div className="cal-gerador-titulo">Gerador climático</div>
          <div className="cal-gerador-sub">
            perfil: {estacao} · {totalTipos} tipo(s) de clima · sorteia por intervalo
          </div>
        </div>
      </div>
      <div className="cal-gerador-acoes">
        <button type="button" className="cal-btn-sm" onClick={onGerar}>
          <i className="fas fa-dice" /> Gerar
        </button>
        <button type="button" className="cal-btn-sm" onClick={onEditarPerfil}>
          <i className="fas fa-sliders" /> Editar perfil
        </button>
      </div>
    </div>
  );
}
