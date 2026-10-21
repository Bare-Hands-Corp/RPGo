# Limitações gerais do sistema (RPGo × OP RPG 1.5.7)

Levantadas criando e escalando três personagens até o nível 10:
**Kanoa de Shandora** (Celestial · Usuário de Rokushiki · Arqueólogo · Haki do Armamento),
**Rugo de Zou** (Mink · Lutador · Médico · Haki da Observação) e
**Kajiki** (Homem-Peixe · Espadachim · Cozinheiro · Haki misto). Detalhes em `notas-kanoa.md`, `notas-rugo.md` e `notas-kajiki.md`.

Legenda: 🔴 hoje não dá para reproduzir de forma alguma · 🟡 dá só "na mão" ou como texto.

---

## 1. Criação e progressão

| # | Limitação | Proposta de solução |
|---|---|---|
| 1.1 🔴 | **Não existe Espécie, Estilo de Combate nem Profissão como dado.** A criação pede só nome, nível, carga, PV, PP e atributos; o resto vira habilidade solta digitada à mão (precisei de script). | Catálogo do livro (tabelas `especies`, `estilos`, `profissoes` com traços por nível) e um assistente de criação em passos: espécie → estilo → profissão → atributos → escolhas. Cada traço vira Habilidade/Ação com `origem` + vínculo ao catálogo. |
| 1.2 🔴 | **Subir de nível não concede as características do nível.** O assistente só soma PV, PP e atributos. | Cada estilo com tabela "nível → características/técnicas/escolhas"; o assistente mostra o que chega e cria as fichas, pedindo as escolhas (ex.: Arma Viva, Posições, Espionagem). |
| 1.3 🔴 | **Contadores não acompanham o nível.** Usos com fórmula (`PROF`, `NIVEL`) e recursos com máximo por fórmula mostram o máximo novo, mas o valor atual não sobe (Bom de Briga ficou 3/4). | Ao subir de nível, recalcular todos os máximos com fórmula e somar a diferença ao atual (usos, recursos, PV de efeitos como Robusto). |
| 1.4 🟡 | **Pontos de Ambição.** Funciona criando um recurso "Pontos de Ambição" com máximo por fórmula (`max(0, 3*NIVEL-21)`, +2 de Aptidão) e apontando a árvore para ele; o máximo é contado sozinho. Mas, pelo item 1.3, o saldo não cresce ao subir. | Com a correção do 1.3 isso fica automático. Opcional: o molde "Haki" já criar o recurso com essa fórmula e perguntar a Aptidão (+2 PA). |
| 1.5 🟡 | **PE não acompanha o nível** (o assistente só sugere). | Mesma lógica: ao subir, PE vira o mínimo do nível (se for menor); ou PE como recurso com fórmula. |
| 1.6 🟡 | **PV vindo de efeito (Robusto)** aumenta o máximo mas não o atual ao subir. | Incluir no recálculo do 1.3 (somar a diferença do máximo efetivo ao atual). |
| 1.7 🟡 | **Teto de atributo de características** (Atributos Aperfeiçoados até 30) precisa de efeito manual "Limite +10". | Vem pronto quando a característica vier do catálogo (1.1). |
| 1.8 🔴 | **Escolhas com quantidade limitada não são controladas** (2 Arma Viva no 3º e 1 por nível; 2 Posições no 3º/5º/9º; 2+3 Espionagem). O catálogo de opções também acaba (Arma Viva esgota no 7º). | "Grupo de escolhas" por estilo: lista de opções + quantas escolher em cada nível, com validação. |

## 2. Mecânicas de combate

| # | Limitação | Proposta de solução |
|---|---|---|
| 2.1 🔴 | **Limites de ativação simultânea** (1/2/3 Posições ativas conforme o nível). | Campo "grupo exclusivo" com limite por fórmula; ligar uma além do limite pede para desligar outra. |
| 2.2 🔴 | **"Uma vez por turno/rodada"** (Electro, Predador, Foco de Batalha, Dados Brutais no máximo 3 por turno). | Recarga `turno`/`rodada` além de descanso/encontro, zerada pelo "Passar turno". |
| 2.3 🔴 | **Ação que só existe com outra habilidade ligada** (reação do Castigo de Ferro só na posição; Shigan com Tekkai Kenpo). | Condição de disponibilidade na Ação: "requer habilidade X ligada" (já existe `habilidadeIds`, falta travar por ela). |
| 2.4 🔴 | **Efeitos condicionais ao alvo/situação** (crítico 18-20 só contra Caído; −2 Acrobacia só abaixo de 5.000 m; vantagem só explorando ruínas). Hoje o `quando` é só texto e o efeito vale sempre. | `quando` estruturado: condição do alvo (Caído, Agarrado…), do ambiente (marcador ligável na ficha) ou da rolagem; o efeito só entra quando a condição for verdadeira, com chip para ligar no Rolador. |
| 2.5 🔴 | **Gatilhos de evento** (no acerto crítico: +nível de dano e d8 na tabela Golpe Brutal; ao causar dano: cura igual ao dano — Predador; ao sofrer 5+: +1 PP). | Efeito `gatilho` com evento (crítico, acerto, dano causado, dano sofrido, cair a 0 PV) + ação (dano extra, cura = dano, recurso ±, rolar tabela). |
| 2.6 🔴 | **Tabelas aleatórias** (Golpe Brutal, Tesouros Perdidos, Resposta Perfeita com 5 opções). | Tipo "tabela" (faixas do dado → efeito/texto), rolável pelo Rolador. |
| 2.7 🔴 | **Redução de dano em dados e com custo variável** (Hard Block 6d8, +2d8 por PP; Tekkai 6d10 só contra físico). | `reducao_dano` aceitar fórmula com dados e filtro de tipo; custo extra opcional "por passo". |
| 2.8 🔴 | **Escolha opcional no uso** (Execução Impecável "pode reduzir 2 PP"; Fortalecimento/Endurecimento só em dano Contundente/Cortante/Perfurante). Hoje o desconto e o +1 de dano valem sempre e em todo tipo. | Efeitos "opcionais" que aparecem como chip desligável na hora de usar; filtro por tipo de dano no modificador de dano. |
| 2.9 🔴 | **Movimento forçado e posição** (empurrar 6 m, lançar a 15 m de altura e cair no turno seguinte, voo que cai ao sofrer dano). | Fora do escopo sem grid; no mínimo, condições customizadas com duração ("No ar até o próximo turno") e lembrete no turno. |
| 2.10 🟡 | **Dano que muda por faixa de nível** (ataque desarmado 1d4→1d6, Castigo 3d8→9d8). Regravei à mão. | Aceitar `POR_NIVEL(1d4, 6: 1d6, …)` e siglas (`FOR`) no campo de dano da Ação, como já existe em custos e usos. |
| 2.11 🟡 | **Transformações completas** (Sulong: deslocamento e voo funcionam; exaustão a cada turno após 1 minuto, Electro ilimitado, perda de consciência não). | Combinar 2.5 (gatilho por turno após X turnos → exaustão) com "sobrescrever usos" de outra habilidade enquanto ligada. |
| 2.13 🔴 | **Condição de equipamento por tipo, não por item** (Lâmina Gentil: qualquer arma com Acuidade; Defesa Ofensiva: qualquer arma favorita; Posturas: exatamente N armas cortantes empunhadas). A trava atual liga a habilidade a **um** item. | Trava por regra: "empunhando ≥/= N itens com categoria/propriedade/tag X" (ex.: `cortante`, `acuidade`). |
| 2.14 🔴 | **Redução de modificadores em área** (Perito em Técnicas, Fortalecimento: metade com vários alvos). O 36 Pound Hou soma o bônus inteiro. | Marcar a ação como "vários alvos" (já se sabe pela salvaguarda/área) e aplicar `metade` nos modificadores marcados como tal. |
| 2.15 🔴 | **Impor desvantagem na salvaguarda do alvo** (corte voador do Trueno Bastardo). | Campo "salvaguarda com desvantagem/vantagem" na ação. |
| 2.12 🟡 | **Estágio do Haki** (teste de VON (Haki) CD 15 no início do encontro; falhar desliga o Haki). | Hook "início do encontro" que pede a rolagem e trava as habilidades de `origem: haki` se falhar. |

## 3. Profissões, itens e economia

| # | Limitação | Proposta de solução |
|---|---|---|
| 3.1 🔴 | **Custo em item do inventário** (2 kits médicos por Tratar Ferimentos, 1d6 kits, dials). | Custo "consome N do item X" (como a munição das armas), com N podendo ser dado. |
| 3.2 🔴 | **Perícia Especial do Ofício com graduação** (Amador/Profissional/Especialista/Mestre muda a cura de 2d10+10 para 3d10+30…). | Profissão com graduação na ficha; fórmulas podem ler `GRAD` (0–3). |
| 3.3 🔴 | **Proficiência em ferramentas e armas** (Armas Marciais, kits, Ferramentas de Arqueólogo). | Lista de proficiências de ferramenta/arma na ficha; testes com ferramenta somam a proficiência. |
| 3.4 🟡 | **Item sem tipo "ferramenta"/"dial"**. | Novos tipos de item ou categoria livre. |
| 3.5 🔴 | **Teto de cura por paciente ou por descanso** (Médico: 10 × nível; Regeneração: 3 × nível + 10). | Contador por alvo/efeito, zerado em descanso longo; o `por_turno` para quando atingir o teto. |
| 3.6 🔴 | **Benefícios escolhidos por outro jogador** (Refeição do Chef / Preparo Perfeito do Cozinheiro: cada comensal escolhe 1–2 de 4–9 opções até o descanso longo). | "Buff de mesa": o cozinheiro publica as opções; cada aliado escolhe na própria ficha e o efeito vale até o descanso longo. |

## 4. Interface (encontrado durante os testes)

- O painel fixo "Rolador" cobre o botão "Liberar" dos talentos em telas estreitas.
- O molde "Haki" já preenche o nome; digitar por cima gera "HakiHaki".
- Ligar cada posição/forma abre um modal de confirmação (6 posições = 6 confirmações).
- Rolar com o mouse sobre a árvore dá zoom no canvas em vez de rolar a página.
- O indicador do Next.js (dev) no canto inferior esquerdo também fica sobre os botões do painel do talento.
- Na primeira criação, "Criar Personagem" não redirecionou (dev server compilando a rota da ficha); na segunda, redirecionou.

## Prioridade sugerida

1. **Recalcular contadores ao subir de nível** (1.3 + 1.4 + 1.5 + 1.6) — mudança pequena e resolve PA, PE, usos e Robusto.
2. **Limite de ativação e recarga por turno** (2.1, 2.2) — destrava Posições, Electro, Predador.
   Junto: **trava por tipo de equipamento** (2.13) — destrava Posturas e Empunhaduras do Espadachim.
3. **`quando` estruturado e gatilhos de evento** (2.4, 2.5) — a maior fonte de "texto em vez de regra".
4. **Catálogo do livro + assistente de criação/nível** (1.1, 1.2, 1.8) — o maior trabalho, mas elimina o script.
