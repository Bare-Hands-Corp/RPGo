"use client";

import { useMemo, useState } from "react";

// Font Awesome free-solid, agrupado por tema.
export const ICONES_CATALOGO: { grupo: string; icones: { slug: string; nome: string }[] }[] = [
  {
    grupo: "Combate",
    icones: [
      { slug: "fa-fist-raised", nome: "Punho" },
      { slug: "fa-hand-fist", nome: "Soco" },
      { slug: "fa-khanda", nome: "Lâminas" },
      { slug: "fa-gun", nome: "Arma de fogo" },
      { slug: "fa-crosshairs", nome: "Mira" },
      { slug: "fa-bullseye", nome: "Alvo" },
      { slug: "fa-shield-halved", nome: "Escudo" },
      { slug: "fa-shield", nome: "Defesa" },
      { slug: "fa-burst", nome: "Impacto" },
      { slug: "fa-bomb", nome: "Bomba" },
      { slug: "fa-explosion", nome: "Explosão" },
      { slug: "fa-gavel", nome: "Marreta" },
      { slug: "fa-hammer", nome: "Martelo" },
      { slug: "fa-person-falling-burst", nome: "Nocaute" },
    ],
  },
  {
    grupo: "Haki e poder",
    icones: [
      { slug: "fa-eye", nome: "Observação" },
      { slug: "fa-eye-low-vision", nome: "Premonição" },
      { slug: "fa-brain", nome: "Mente" },
      { slug: "fa-crown", nome: "Rei" },
      { slug: "fa-bolt", nome: "Raio" },
      { slug: "fa-bolt-lightning", nome: "Descarga" },
      { slug: "fa-fire", nome: "Fogo" },
      { slug: "fa-fire-flame-curved", nome: "Chama" },
      { slug: "fa-wind", nome: "Vento" },
      { slug: "fa-water", nome: "Água" },
      { slug: "fa-snowflake", nome: "Gelo" },
      { slug: "fa-star", nome: "Estrela" },
      { slug: "fa-wand-magic-sparkles", nome: "Manifestação" },
      { slug: "fa-ghost", nome: "Espectro" },
      { slug: "fa-skull", nome: "Caveira" },
      { slug: "fa-dragon", nome: "Dragão" },
    ],
  },
  {
    grupo: "Corpo e movimento",
    icones: [
      { slug: "fa-person-running", nome: "Corrida" },
      { slug: "fa-person-walking", nome: "Caminhada" },
      { slug: "fa-shoe-prints", nome: "Passos" },
      { slug: "fa-hand", nome: "Mão" },
      { slug: "fa-hand-back-fist", nome: "Punho fechado" },
      { slug: "fa-heart-pulse", nome: "Vitalidade" },
      { slug: "fa-lungs", nome: "Fôlego" },
      { slug: "fa-dumbbell", nome: "Treino" },
      { slug: "fa-shield-heart", nome: "Resistência" },
      { slug: "fa-user-ninja", nome: "Furtividade" },
      { slug: "fa-eye-slash", nome: "Oculto" },
    ],
  },
  {
    grupo: "Mar e tripulação",
    icones: [
      { slug: "fa-anchor", nome: "Âncora" },
      { slug: "fa-ship", nome: "Navio" },
      { slug: "fa-sailboat", nome: "Veleiro" },
      { slug: "fa-compass", nome: "Bússola" },
      { slug: "fa-map", nome: "Mapa" },
      { slug: "fa-flag", nome: "Bandeira" },
      { slug: "fa-users", nome: "Tripulação" },
      { slug: "fa-water-ladder", nome: "Mergulho" },
      { slug: "fa-fish", nome: "Peixe" },
      { slug: "fa-island-tropical", nome: "Ilha" },
    ],
  },
  {
    grupo: "Objetos",
    icones: [
      { slug: "fa-apple-whole", nome: "Akuma no Mi" },
      { slug: "fa-sack-dollar", nome: "Berries" },
      { slug: "fa-coins", nome: "Moedas" },
      { slug: "fa-gem", nome: "Joia" },
      { slug: "fa-key", nome: "Chave" },
      { slug: "fa-scroll", nome: "Pergaminho" },
      { slug: "fa-book", nome: "Livro" },
      { slug: "fa-flask", nome: "Frasco" },
      { slug: "fa-briefcase", nome: "Profissão" },
      { slug: "fa-utensils", nome: "Cozinha" },
      { slug: "fa-screwdriver-wrench", nome: "Ferramentas" },
      { slug: "fa-gear", nome: "Engrenagem" },
      { slug: "fa-microchip", nome: "Ciborgue" },
    ],
  },
  {
    grupo: "Estrutura",
    icones: [
      { slug: "fa-circle-nodes", nome: "Nó" },
      { slug: "fa-sitemap", nome: "Árvore" },
      { slug: "fa-diagram-project", nome: "Trilha" },
      { slug: "fa-code-branch", nome: "Ramificação" },
      { slug: "fa-layer-group", nome: "Camadas" },
      { slug: "fa-circle", nome: "Círculo" },
      { slug: "fa-certificate", nome: "Selo" },
      { slug: "fa-award", nome: "Medalha" },
      { slug: "fa-trophy", nome: "Troféu" },
      { slug: "fa-arrow-up", nome: "Avanço" },
      { slug: "fa-lock", nome: "Trava" },
      { slug: "fa-plus", nome: "Mais" },
    ],
  },
];

const TODOS = ICONES_CATALOGO.flatMap((g) =>
  g.icones.map((i) => ({ ...i, grupo: g.grupo })),
);

export function IconePicker({
  valor,
  onChange,
  label = "Ícone",
}: {
  valor: string;
  onChange: (slug: string) => void;
  label?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");

  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return null;
    return TODOS.filter(
      (i) => i.nome.toLowerCase().includes(q) || i.slug.includes(q),
    );
  }, [busca]);

  const atual = TODOS.find((i) => i.slug === valor);

  return (
    <div className="icone-picker">
      <button
        type="button"
        className="icone-picker-atual"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        <i className={`fas ${valor || "fa-circle"}`} />
        <span>{atual?.nome ?? valor ?? "Escolher"}</span>
        <i className={`fas fa-chevron-${aberto ? "up" : "down"} icone-picker-seta`} />
      </button>

      {aberto && (
        <div className="icone-picker-painel">
          <input
            type="text"
            className="icone-picker-busca"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`Buscar ${label.toLowerCase()}…`}
            autoFocus
          />

          {resultados ? (
            resultados.length === 0 ? (
              <p className="icone-picker-vazio">Nada encontrado.</p>
            ) : (
              <div className="icone-picker-grade">
                {resultados.map((i) => (
                  <BotaoIcone
                    key={i.slug}
                    icone={i}
                    ativo={i.slug === valor}
                    onEscolher={() => {
                      onChange(i.slug);
                      setAberto(false);
                      setBusca("");
                    }}
                  />
                ))}
              </div>
            )
          ) : (
            ICONES_CATALOGO.map((g) => (
              <div key={g.grupo} className="icone-picker-grupo">
                <div className="icone-picker-grupo-nome">{g.grupo}</div>
                <div className="icone-picker-grade">
                  {g.icones.map((i) => (
                    <BotaoIcone
                      key={i.slug}
                      icone={i}
                      ativo={i.slug === valor}
                      onEscolher={() => {
                        onChange(i.slug);
                        setAberto(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BotaoIcone({
  icone,
  ativo,
  onEscolher,
}: {
  icone: { slug: string; nome: string };
  ativo: boolean;
  onEscolher: () => void;
}) {
  return (
    <button
      type="button"
      className={`icone-picker-item ${ativo ? "ativo" : ""}`}
      onClick={onEscolher}
      title={icone.nome}
      aria-label={icone.nome}
      aria-pressed={ativo}
    >
      <i className={`fas ${icone.slug}`} />
    </button>
  );
}
