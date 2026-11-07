import type { Novidade } from "./tipos";

// Rascunho do próximo patch: ainda não entra em lib/novidades/index.ts.
// Ao liberar, trocar a data (arquivo, `data` e pasta em public/novidades) e registrar no index.
export default {
  data: "2026-10-26",
  mudancas: [
    {
      topico: "Tags",
      titulo: "Tags da ficha num clique",
      texto: "No editor de tags de item e habilidade, as tags que a ficha já usa aparecem prontas. Um clique adiciona, com a cor que ela já tinha. Com muitas tags, o resto fica em ver mais e a lupa busca.",
      tela: "ficha",
      zona: "conteudo",
      trilha: ["Ficha", "Inventário", "Item", "Tags"],
      midias: ["tags-da-ficha.png"],
    },
    {
      topico: "Tags",
      titulo: "Filtro por tag",
      texto: "Inventário e Habilidades ganharam o grupo Tag nos filtros, com as tags da lista, recolhidas em ver mais, com lupa de busca.",
      tela: "ficha",
      zona: "conteudo",
      trilha: ["Ficha", "Inventário", "Filtros", "Tag"],
      midias: ["filtro-tag.png"],
    },
    {
      topico: "Conta",
      titulo: "Esqueci minha senha",
      texto: "No login, Esqueci minha senha manda um código de 6 dígitos pro seu e-mail. Com ele você cria uma senha nova e já entra.",
      tela: "conta",
      trilha: ["Login", "Esqueci minha senha"],
      midias: ["esqueci-senha.png", "recuperar-senha.png"],
    },
    {
      topico: "Conta",
      titulo: "Código no cadastro",
      texto: "Conta nova confirma o e-mail com um código de 6 dígitos, no lugar do link. Dá pra reenviar depois de 1 minuto.",
      tela: "conta",
      trilha: ["Login", "Cadastro", "Confirme seu e-mail"],
      midias: ["confirmar-email.png"],
    },
  ],
} satisfies Novidade;
