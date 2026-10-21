# Rugo de Zou — notas da criação (2026-10-20)

Ficha: `/ficha/a854a6e7-5cf9-4f7a-807b-2fac861cb664` (conta de teste `claude.teste@rpgo.test`).
Mink (Leão, variante Robusto) · Lutador 10 · Médico (Amador/Novato) · Haki da Observação (9 PA).

## Fluxo

1. **UI** — `/criacao-personagem` no nível 5 (desta vez redirecionou para a ficha normalmente).
2. **Script** — conteúdo dos níveis 1–5 (o app não tem catálogo do livro).
3. **UI** — assistente "Subir de nível" 5× (PV fixo d12: 7 + CON = 9 por nível; FOR 18→20 no 8º).
4. **Script** — conteúdo dos níveis 6–10 + recurso "Dados Brutais" (máximo `NIVEL/2+FOR`).
5. **UI** — recurso "Pontos de Ambição" com **máximo por fórmula** `max(0, 3*NIVEL-21)` (= 9 no 10º),
   árvore pelo molde Haki já com PA como custo, vínculo talento → habilidade e compra dos 5 talentos.
6. **UI** — testes: ligar Posições (Descuidado, Músculo de Aço) e Forma Sulong.

Estado final conferido: PV 137 (107 base + Robusto 30), PP 20, CR 17, CD 17, acerto +10
(FOR 5 + prof 4 + Previsão 1), deslocamento 12 m, prof +4, PE 64.000, Dados Brutais 10/10, PA 0/9.

## Escolhas

- Atributos: padrão 15/14/13/12/10/8 → +2 FOR (Mink) → AVA 4º: FOR+1, CON+1 → AVA 8º: FOR+2.
  Final: FOR 20 · DES 13 · CON 15 · SAB 12 · VON 10 · PRE 8.
- Mink Leão (carnívoro caçador → Traço Especial Predador); variante Robusto (12 m, ignora terreno difícil).
- Lutador: Atletismo e Intimidação; arma favorita Corporal; HB inata Corpo de Guerreiro;
  HBs Robusto, Sortudo e Superando Limites.
- Posições: Músculo de Aço, Castigo de Ferro (3º); Descuidado, Foco de Batalha (5º); Imparável, Fanático (9º).
- Técnicas: Overthrow (1º grau), Power Shoot (2º), Kick Course (3º), Kick Overdrive (4º);
  auxiliares Hard Block e Rage Uppercut.
- Médico: Intuição e Percepção; perícia especial Medicina.
- Haki: Aptidão/Principal Observação → Identificar Emoções (1), Perceber Presença (1), Previsão (2),
  Antevisão (3), Clarividência (2).

## O que funcionou bem no app

- **Posições de Luta** como habilidades "liga/desliga": a resistência do Músculo de Aço aparece em
  Defesas "enquanto … estiver ativa".
- **Forma Sulong**: multiplicador ×2 no deslocamento (12 → 24 m) e "Voar = metade do deslocamento"
  (12 m), com contagem "faltam 10 turnos".
- **Resistência Sobrenatural** (`por_turno`): aparece no bloco "A cada turno" com 2d10+2 PV temporários.
- **Recursos com fórmula**: Dados Brutais (`NIVEL/2+FOR` = 10) e Pontos de Ambição
  (`max(0, 3*NIVEL-21)` = 9) calculam o máximo sozinhos.
- **Previsão** (+1 ataque) entrou no acerto de todas as ações; Truque Sujo virou "Dado Mínimo 1-2 → máximo".

## Limitações encontradas (Lutador / Mink / Médico)

1. **Usos e recursos não acompanham o nível.** O assistente de nível não recalcula os contadores:
   "Bom de Briga" (usos = PROF) ficou **3/4** depois do 9º nível; Electro (usos = NIVEL) e os recursos
   com fórmula só mostram o máximo novo, o valor atual não sobe. PV do Robusto também ficou 15 abaixo
   do máximo (122/137) e precisei curar.
2. **Escolhas exclusivas não são travadas.** Posições: no 5º só pode 1 ativa, 2 no 6º, 3 no 10º — o app
   deixa ligar todas. O mesmo para "uma vez por turno" (Electro, Predador) e "no máximo 3 Dados Brutais por turno".
3. **Efeitos condicionais aplicam sempre.** Tiro de Meta (crítico 18-20 só contra alvo Caído) virou
   crítico 18-20 em todo ataque corpo a corpo; "Truque Sujo" só em ataque comum funcionou pelo filtro
   `dano-comum`, mas Golpe Brutal ("+nível no crítico") ficou como bônus com `quando` descritivo.
4. **Reação ligada a postura.** "Castigo de Ferro" (ação de reação) existe mesmo com a posição desligada;
   não há como dizer "esta ação só aparece com tal habilidade ligada".
5. **Tabelas aleatórias** (Golpe Brutal d8 com 4 efeitos) não têm mecanismo; ficou texto.
6. **Dano que escala por nível** (Castigo de Ferro 3d8/6d8/9d8, ataque desarmado 1d4→1d6) foi
   regravado à mão a cada faixa; `POR_NIVEL(...)` existe nas fórmulas, mas não usei no campo de dano da ação.
7. **Custos em itens.** Tratar Ferimentos gasta 2 kits médicos, Paramedicina 1 kit de primeiros socorros:
   o custo de habilidade aceita PP/PA/recurso, não quantidade de item do inventário.
8. **Cura em outra criatura com teto por paciente** (10 × nível sem descanso) não é controlado.
9. **Sulong**: exaustão automática após 1 minuto, perda de consciência, Electro ilimitado e a onda
   de 5d12 não são modelados; só deslocamento/voo.
10. **Predador** (cura = dano causado, com teto por descanso) e **Hard Block** (redução em dados,
    +2d8 por PP extra) ficaram texto: `reducao_dano` aceita valor fixo, não dados nem custo variável.
11. **Kick Course / Power Shoot** (empurrar, lançar para o alto, cair no turno seguinte) — posição e
    movimento forçado não existem no app.
12. **Interface**: modais de confirmação ("Ligar") em cada interruptor; na tela estreita o painel do
    talento fica sob o "Rolador".
