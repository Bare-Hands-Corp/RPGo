// Tipos compartilhados entre componentes da rota /calendario.

export type EventoCal = {
  id: string;
  tipo: "climatico" | "narrativo";
  titulo: string;
  descricao: string | null;
  dataDias: number;
  tipoClimaId: string | null;
  oculto: boolean;
};

export type TipoClima = {
  id: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
  pesosPorEstacao: Record<string, number>;
};
