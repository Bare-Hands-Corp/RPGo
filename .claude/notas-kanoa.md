# Kanoa de Shandora — notas da criação (2026-10-20)

## Escalado para o nível 10 (2026-10-20)

Estado final conferido na ficha: nível 10, PE 64.000, prof +4, PV 134 (104 base + Robusto 30),
PP 20, CR 19, CD das técnicas 18, acerto +10, FOR 22 · DES 14 · CON 16 · SAB 12 · VON 10 · PRE 8, carga 220.

**Pela UI:** assistente "Subir de nível" 5× (PV fixo de d10 + CON, +2 PP por nível, PV retroativo
da CON feito pelo app); árvore "Haki" pelo molde do app, recurso "Pontos de Ambição" (9), vínculo
de cada talento à sua habilidade e compra dos talentos; cura final até 134.
**Por script:** as características e técnicas novas (o app não tem catálogo do livro), PE e carga.

Escolhas:
- 6º: Atributos Aperfeiçoados FOR 18→20; Kamie e Geppo; Espionagem +3 (Ataques Incapacitantes,
  Infiltrador, Linguagem de Espião); técnicas Shigan: Oren (3º grau) e Kamisori (auxiliar);
  Arma Viva: Habilidades Dominadas.
- 7º: Ataque Extra; Arma Viva: Fôlego Treinado.
- 8º: AVA CON 14→16; Haki desperta.
- 9º: Atributos Aperfeiçoados FOR 20→22; técnica Rankyaku: Amanedachi (4º grau).
- 10º: Tekkai Kenpo (ação nova + forma alternativa "Shigan (Tekkai Kenpo)" com 4d10).
- Ataque desarmado (Corpo de Guerreiro) passou para 1d6 + FOR.
- **Haki:** Aptidão e Principal = Armamento. 9 PA = 1 (8º) + 3 (9º) + 3 (10º) + 2 (Aptidão).
  Gastos: Ataque Infuso (1), Fortalecimento (1), Endurecimento Ofensivo (2), Potencialização (3),
  Endurecimento Defensivo (2). Estágio Inexperiente (teste de VON (Haki) CD 15 por encontro).

Limitações novas (nível 10):
- **Arma Viva esgotou no 7º nível.** O livro dá "uma nova característica a cada nível posterior",
  mas só há 6 opções; nos níveis 8, 9 e 10 não sobrou nada para escolher.
- **Haki fraco no teste de ativação:** VON 10 e sem proficiência em Haki → o teste CD 15 é um d20 puro.
  Fortalecimento (soma mod. de VON) hoje soma +0. Foi a escolha coerente com o Rokushiki, mas vale rever.
- **Celestial "Haki da Observação Inato"** não foi usado: no nível 1 escolhi 2 perícias em vez da
  Singularidade (que dava 10 PA extras na Observação).
- **Atributos Aperfeiçoados (teto 30)** precisou de efeito "Limite de Atributo +10" na habilidade;
  o assistente de nível só aceitou FOR 22 depois disso.
- **Potencialização** (dados extras = grau da técnica) foi cadastrada como efeito `dados_extra` com
  `GRAU`, mas o card da técnica não mostra os dados a mais; não verifiquei numa rolagem.
- **"Não acumula" e "só dano Contundente/Cortante/Perfurante"** dos talentos de Haki não são
  filtrados: o +1 do Endurecimento Ofensivo aparece em todo dano.
- **Endurecimento Defensivo**: resistência enquanto houver os 20 PV temporários fica só no texto.
- **Habilidades Dominadas** (técnicas sem PP com mais da metade de PV/PP) e **Kamie/Geppo/Kamisori**
  (esquiva, voo) não têm mecânica automática; o desconto da Execução Impecável também cai nelas.
- **PA não cresce com o nível:** comprar talento desconta do recurso, mas o assistente de nível não
  dá os +3 PA por nível; nos próximos níveis, some no recurso "Pontos de Ambição" à mão.
- **UI:** o painel "Rolador" fixo cobre o botão "Liberar" dos talentos em telas estreitas
  (precisei rolar a página); o molde Haki pré-preenche o nome e, se digitar por cima, vira "HakiHaki".
- **PE não sobe com o nível** (o assistente só sugere); ajustei para 64.000 por script.

Ficha: `/ficha/ec2257ec-769b-4f79-9087-dcc4b0e5e3a2` (conta de teste `claude.teste@rpgo.test`).
Celestial (Shandian) · Usuário de Rokushiki 5 · Arqueólogo (Amador/Novato).

## O que foi feito

- **Pela UI** (`/criacao-personagem`): nome, nível 5, carga 180, PV 69, PP 10, atributos
  FOR 18 · DES 14 · CON 14 · SAB 12 · VON 10 · PRE 8.
- **Por script Prisma** (o formulário não tem esses campos): PE 6.500, d10, deslocamento 12 m,
  nado 3 m, CD das técnicas por Força, 124.000 berries (40.000 + 15d10×1000, rolagem 84),
  proficiências, perícia custom "História Perdida", 20 habilidades, 8 ações, 12 itens.
- Conferido na ficha: PV 69 (54 base + Robusto 3×nível), CR 16, acerto +7, CD 15,
  Atletismo +12, Acrobacia 0, Percepção passiva 13, nadar/escalar 12 m.

## Escolhas que fiz (o livro deixa à escolha do jogador)

- Atributos: distribuição padrão 15/14/13/12/10/8 → +2 FOR (espécie) → AVA do 4º nível +1 FOR, +1 CON.
- Variante Shandian (+5 Atletismo). Herança Cultural: Percepção e Intuição.
- Rokushiki: perícias Atletismo e Furtividade; arma favorita Corporal; HB inata Corpo de Guerreiro.
- Arqueólogo: História e Investigação.
- HBs de 1º/2º/3º nível: Robusto, Retomar o Fôlego, Mente e Corpo.
- Espionagem: Aprendizado Rápido e Caminho das Sombras.
- Arma Viva (2 no 3º nível + 1 no 4º + 1 no 5º): Execução Impecável, Técnica Assassina,
  Reação Defensiva, Ataque de Oportunidade Traiçoeiro.
- Técnicas: Tobu Shigan (1º grau) e Rankyaku: Hakurai (2º grau); auxiliar Zanshin.
- Traços Culturais (1 Ponto de Treinamento): Afinidade Cultural.
- PV dos níveis 2–5 pelo valor fixo (6 + CON).

## O que não consegui fazer / limitações

### Do sistema (app)
1. **Formulário de criação só tem nome, nível, carga, PV, PP e atributos.** Espécie, estilo, profissão,
   deslocamento, nado, dado de vida, PE, perícias, técnicas e itens não existem na criação;
   precisei gravar direto no banco via script.
2. **Sem campos de Espécie / Estilo / Profissão na ficha.** Ficaram como habilidades com `origem`
   (especie/estilo/profissao), não como dados próprios do personagem.
3. **Redirecionamento após "Criar Personagem" não aconteceu.** O personagem foi gravado, mas a página
   ficou em `/criacao-personagem` com o botão "Criando…" (dev server compilando a rota `/ficha`).
4. **Item não tem tipo "ferramenta".** Ferramentas de Arqueólogo, kits do Rokushiki e dials ficaram
   como "Item Comum" com tag.
5. **Sem proficiência em ferramentas/armas.** Não há onde marcar Armas Marciais nem os kits
   (Abrir Cadeado, Disfarce, Falsificação); ficou só na descrição.
6. **Efeitos condicionais ficam ligados sempre:** Anjos Caídos (−2 Acrobacia só abaixo de 5.000 m)
   está sempre aplicado; vantagens de Afinidade Cultural e Explorador Atento só têm `quando` descritivo.
7. **Execução Impecável é opcional no livro** ("pode diminuir"), mas o efeito `desconto_tecnica`
   aplica sempre (2→1 PP, 5→3 PP). Também desconta as técnicas auxiliares.
8. **Técnica Assassina** (crítico 18-20 por 1 PP) ficou só como habilidade ativa com custo; o efeito
   de crítico não é automático ao pagar.
9. **6 Habilidades / Resposta Perfeita / Mente e Corpo** ficaram como contadores de uso com descrição;
   rerrolar salvaguarda, dobrar dados ou ignorar exaustão não são aplicados sozinhos.
10. **Tekkai** aparece como "Cura 6d10" no card (efeito `cura` em PV temporário); a restrição a
    dano contundente/cortante/perfurante e o deslocamento 0 não são modelados.
11. **Ataque desarmado com dano fixo `1d4+4`**: não acompanha o nível (1d6 no 6º) nem mudança de Força.
12. **Soru**: +6 m e vantagem no próximo ataque ficaram só como texto.
13. **Shigan**: Sangramento ficou com 1 rodada (o livro não dá duração).
14. **Aprendizado Rápido** (escolher 2 perícias por dia) não tem mecanismo; precisa marcar à mão.

### Do livro / ambiente
15. **PP por nível não aparece no texto extraído do PDF** (a tabela de progressão é imagem e não havia
    renderizador de PDF instalado). Usei 2 × nível = 10, deduzido do exemplo "9º nível recupera 18 PP".
16. **Classificação dos dials** (cotidiano × bélico) está no Guia do Narrador, que não tenho.
    Escolhi Flash, Breath e Tone (cotidianos) e Impact (bélico); confirme.
17. **Sessão do navegador** caiu no meio e precisei logar de novo; na primeira tentativa o dev
    server do preview não subiu porque já havia um `next dev` na porta 3000 (usei esse).
18. **Script de preenchimento**: a transação estourou o timeout padrão de 5 s do Prisma (banco remoto)
    e precisei aumentar para 60 s. A primeira execução foi interrompida sem gravar nada.
