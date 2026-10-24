/** Tela onde a mudança aparece: dá a cor da miniatura. */
export type TelaNovidade = "ficha" | "subficha" | "navio" | "narrador" | "dashboard";

/** Parte da tela que o mini-mapa acende. */
export type ZonaNovidade = "lateral" | "topo" | "conteudo" | "bandeja";

export interface Mudanca {
  titulo: string;
  /** Uma ou duas frases. */
  texto?: string;
  tela: TelaNovidade;
  zona?: ZonaNovidade;
  /** Caminho até a mudança, ex.: ["Ficha", "Lateral", "Pontos"]. */
  trilha: string[];
  /** Arquivos em public/novidades/<data>/ (png, gif, webp). */
  midias: string[];
}

export interface Novidade {
  /** AAAA-MM-DD; também é o nome da pasta das mídias. */
  data: string;
  mudancas: Mudanca[];
}
