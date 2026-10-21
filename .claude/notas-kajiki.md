# Kajiki — notas da criação (2026-10-20)

Ficha: `/ficha/a5611574-98a1-4fb2-9124-c620acd47ae9` (conta de teste `claude.teste@rpgo.test`).
Povo do Mar (Homem-Peixe espadarte) · Espadachim 10 (Destreza, Lâmina Gentil → Forte) · Cozinheiro · Haki Armamento + Observação (9 PA).

## Fluxo

1. **UI** — `/criacao-personagem` no nível 5 (redirecionou normalmente).
2. **Script** — conteúdo dos níveis 1–5, incluindo **as katanas como itens de arma** (1d6 cortante, Acuidade, equipadas)
   e as ações/técnicas ligadas a elas.
3. **UI** — assistente "Subir de nível" 5× (PV fixo d10: 6 + CON = 8; DES 18→20 no 8º).
4. **Script** — conteúdo 6–10 (3ª katana, Lâmina Forte, Auras Bestiais, técnicas, Yakkodori como forma alternativa).
5. **UI** — recurso "Pontos de Ambição" `max(0, 3*NIVEL-21)` = 9, árvore pelo molde Haki com PA, vínculo e compra de 6 talentos.
6. **UI** — teste de desequipar/equipar a katana.

Estado final conferido: PV 108 (98 base + Touro 10), PP 20, CR 18, CD 17, iniciativa +5, deslocamento 15 m, nado 15 m,
ataque com katana +10 / 1d10+11, técnicas +13 com dados um passo acima (2d10 → 2d12) e +12 de dano.

## Escolhas

- Atributos: padrão → +2 DES (espécie) → AVA 4º DES+1, VON+1 → AVA 8º DES+2. Final FOR 13 · DES 20 · CON 14 · SAB 10 · VON 13 · PRE 8.
- Homem-Peixe espadarte: Corpo Marinho = Visão Noturna; Ancestralidade = Deslocamento Animal, Especialidade Animal (Atletismo) e Regeneração.
- Espadachim: Atletismo e Percepção; arma favorita Katana; HB inata Perito em Técnicas; HBs Defesa Ofensiva, Reflexo Afiado, Gerenciamento de Energia.
- Posturas: Ittoryu (1º), Nitoryu (3º), Santoryu (6º), Manobra Golpe Concentrado (9º). Empunhadura: Lâmina Gentil (e Forte no 6º).
- Auras Bestiais: Corvo (Ataque Extra, 6º), Gavião (+3 em técnicas, 8º), Touro (+10 PV, 10º).
- Técnicas: Ittoryu - Baki (1º grau) + Yakkodori (forma de 3º grau), Trueno Bastardo (2º) + corte voador (forma alternativa),
  Shishi Sonson (3º), 36 Pound Hou (4º); auxiliares Kiri Shigure e Clear Lance.
- Cozinheiro: Persuasão e Sobrevivência; perícia especial Gastronomia.
- Haki (Aptidão Armamento): Identificar Emoções 1, Previsão 2, Ataque Infuso 1, Fortalecimento 1, Endurecimento Ofensivo 2, Endurecimento Defensivo 2.

## O que funcionou bem

- **Armas como itens**: ataque e técnicas mostram "Usa Katana (Shiro)", usam Destreza pela Acuidade e somam o atributo.
- **Estabilidade (Lâmina Gentil)**: efeito `valor_fixo` no dado da arma trocou 1d6 por 1d10.
- **Habilidade travada por item**: desequipando a Shiro, a CR caiu de 18 para 15 (Defesa Ofensiva) e a Kuro voltou a 1d6; reequipando, voltou tudo.
- **Perito em Técnicas 10º** (`passo_dano`): dados das técnicas subiram de d10 para d12, d6 para d8.
- **Formas alternativas** (`formaDe`): Yakkodori aparece como aba do Ittoryu - Baki; corte voador como aba do Trueno Bastardo.
- **Regeneração** (`por_turno`) no bloco "A cada turno"; **Visão Noturna** em Sentidos; **Honra** em Redução de Dano −5.
- **Deslocamento Animal** (`valor_fixo` 15 m) e **Touro** (`min(40, 10+5*(NIVEL-10))`) calculados sozinhos.

## Limitações encontradas (Espadachim / Homem-Peixe / Cozinheiro)

1. **Trava por item aceita só um item.** Lâmina Gentil vale para qualquer arma cortante com Acuidade e Defesa Ofensiva para
   qualquer arma favorita; travei na Shiro, e com só a Kuro o bônus some indevidamente.
2. **Posturas dependem de quantas armas estão empunhadas** (1, 2, 3… espadas). Não há contagem de itens equipados por tipo/tag;
   ficou liga/desliga manual.
3. **Efeitos de área não reduzem modificadores.** Perito em Técnicas e Fortalecimento somam só metade em técnicas de vários
   alvos; o 36 Pound Hou (cone) mostra +12 inteiro.
4. **Bônus que valem "ao acertar com arma cortante"** (Lâmina Forte: Poder) entram como bônus de dano geral, inclusive em
   técnicas sem arma, se houvesse.
5. **Salvaguarda com desvantagem imposta ao alvo** (corte voador do Trueno Bastardo) não é modelável.
6. **Teto de cura por descanso** (Regeneração: máximo 3 × nível + 10) não é controlado; o "A cada turno" cura sempre.
7. **Ganho de PP condicionado** (Honra: +1 PP a cada 10 de dano aceito; Roubar Técnicas: +2 PP máximos por técnica roubada)
   ficou texto.
8. **Buffs de comida para o grupo** (Refeição do Chef, Preparo Perfeito): quem escolhe o benefício é cada comensal; o app só
   aplica efeitos da ficha do cozinheiro. Usei `descanso` com `quem: aliado`, não verificado na ficha de outro personagem.
9. **Usos com fórmula não acompanham o nível** (de novo): Perito em Técnicas ficou 3/3 com proficiência 4.
10. **Livro inconsistente**: a tabela do Espadachim lista "Zen Shuchu" como auxiliar do 6º nível, mas o texto descreve "Clear Lance"; usei Clear Lance.
11. **Ataque Infuso** só vale desarmado até a Forma Dominada (Treinado) — regra do livro, não do app, mas o talento fica inútil
    para um espadachim no Inexperiente.
12. **Interface**: o painel do talento fica sob a barra "Rolador" e, às vezes, sob o indicador do Next.js no canto; foi preciso
    rolar a página. Rolar com o mouse sobre a árvore dá zoom no canvas em vez de rolar a página.
