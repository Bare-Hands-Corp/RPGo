// Ícones simples só do protótipo (marca-d'água da arte e símbolo do banner).
const base = { viewBox: "0 0 64 64", fill: "currentColor" } as const;

export const IconeEspada = () => (
  <svg {...base}>
    <path d="M50 6 58 6 58 14 28 44 20 36Z" />
    <path d="M14 34 30 50 26 54 22 50 14 58 6 50 14 42 10 38Z" />
  </svg>
);

export const IconeChama = () => (
  <svg {...base}>
    <path d="M32 4C36 16 48 22 48 38A16 16 0 0 1 16 38C16 28 22 24 24 16 28 22 30 26 30 30 34 24 34 14 32 4Z" />
  </svg>
);

export const IconeEscudo = () => (
  <svg {...base}>
    <path d="M32 4 54 12V30C54 44 44 54 32 60 20 54 10 44 10 30V12Z" />
  </svg>
);

export const IconeOlho = () => (
  <svg {...base}>
    <path d="M32 14C18 14 8 26 4 32 8 38 18 50 32 50S56 38 60 32C56 26 46 14 32 14ZM32 44A12 12 0 1 1 32 20 12 12 0 0 1 32 44Z" />
    <circle cx="32" cy="32" r="6" />
  </svg>
);

export const IconeAncora = () => (
  <svg {...base}>
    <circle cx="32" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="4" />
    <path d="M30 16H34V52C42 51 48 46 50 38L44 38 54 28 60 40 55 39C52 50 43 58 32 58S12 50 9 39L4 40 10 28 20 38 14 38C16 46 22 51 30 52Z" />
    <path d="M22 24H42V28H22Z" />
  </svg>
);

export const IconeFrasco = () => (
  <svg {...base}>
    <path d="M26 4H38V10H36V22L50 44C54 52 50 60 42 60H22C14 60 10 52 14 44L28 22V10H26Z" />
  </svg>
);

export const IconePunho = () => (
  <svg {...base}>
    <path d="M14 22C14 18 18 16 22 18V14C22 10 28 10 30 13 32 9 38 9 40 13 42 10 48 11 48 16V22C52 22 54 26 52 30L48 44C46 52 40 58 30 58H26C18 58 14 52 14 44Z" />
  </svg>
);
