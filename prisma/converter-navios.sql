-- Converte os navios antigos (tabela `navios`) em subfichas da mesa, com a
-- mesma ficha de partida de `presetDeNavio` (lib/navio.ts).
-- Rodar uma vez, junto do deploy:
--   npx prisma db execute --file prisma/converter-navios.sql
-- Navio já convertido fica como está; a tabela `navios` não é alterada.

WITH tamanhos (slug, nome, dimensao, deques, comodos, tripulantes, canhoes, pv, desaceleracao) AS (
  VALUES
    ('pequeno',  'Pequeno',  '6×15×18 m',   1,  4,  20,  3,  150,  -2),
    ('medio',    'Médio',    '15×36×39 m',  2, 10,  50, 10,  300, -10),
    ('grande',   'Grande',   '24×51×54 m',  3, 26, 130, 15,  500, -20),
    ('enorme',   'Enorme',   '36×72×75 m',  4, 48, 240, 25,  750, -30),
    ('colossal', 'Colossal', '48×120×90 m', 5, 90, 450, 45, 1000, -40)
),
madeiras (slug, nome, cr, br) AS (
  VALUES
    ('cedro',     'Cedro',     10,  5),
    ('carvalho',  'Carvalho',  12, 10),
    ('cerejeira', 'Cerejeira', 15, 15),
    ('adam',      'Adam',      18, 30)
),
origem AS (
  SELECT
    n.id,
    n.mesa_id,
    m.user_id AS narrador,
    COALESCE(NULLIF(trim(n.nome), ''), 'Navio') AS nome,
    n.pv_atual,
    n.velocidade_nos,
    n.canhoes,
    trim(n.descricao) AS descricao,
    t.slug AS tamanho_slug,
    t.nome AS tamanho,
    t.dimensao,
    t.deques,
    t.comodos,
    t.tripulantes,
    t.canhoes AS canhoes_max,
    t.pv,
    t.desaceleracao,
    c.slug AS madeira_slug,
    c.nome AS madeira,
    c.cr,
    c.br
  FROM navios n
  JOIN mesas m ON m.id = n.mesa_id
  JOIN tamanhos t
    ON t.slug = CASE WHEN n.tamanho IN (SELECT slug FROM tamanhos) THEN n.tamanho ELSE 'pequeno' END
  JOIN madeiras c
    ON c.slug = CASE WHEN n.madeira IN (SELECT slug FROM madeiras) THEN n.madeira ELSE 'cedro' END
),
fichas AS (
  INSERT INTO personagens (
    id, user_id, dono_mesa_id, mesa_id, perfil, nome, hp_max, hp_atual, deslocamento, nado, navio,
    forca, destreza, constituicao, sabedoria, vontade, presenca
  )
  SELECT
    id, narrador, mesa_id, mesa_id, 'veiculo', nome, pv, LEAST(GREATEST(pv_atual, 0), pv), velocidade_nos, 0,
    -- Montagem (lib/navio.ts lerMontagem): o que falta vem do modelo do livro do tamanho.
    jsonb_build_object(
      'montagem', jsonb_build_object(
        'tamanho', tamanho_slug, 'madeira', madeira_slug, 'canhao', 'canhao',
        'canhoes', LEAST(GREATEST(canhoes, 0), canhoes_max)
      ),
      'comandanteId', NULL
    ),
    10, 10, 10, 10, 10, 10
  FROM origem
  ON CONFLICT (id) DO NOTHING
  RETURNING id
),
habilidades_novas AS (
  INSERT INTO habilidades (id, personagem_id, nome, tipo, descricao, tags, ordem, efeitos)
  SELECT
    md5(o.id || ':tamanho')::uuid::text, o.id, 'Navio ' || o.tamanho, 'passiva',
    o.dimensao
      || ' · ' || o.deques || CASE WHEN o.deques = 1 THEN ' deque' ELSE ' deques' END
      || ' · até ' || o.comodos || ' cômodos'
      || ' · até ' || o.tripulantes || ' tripulantes'
      || ' · até ' || o.canhoes_max || ' canhões'
      || ' · ' || o.desaceleracao || ' nós por peso',
    'Tamanho', 0, '[]'::jsonb
  FROM origem o JOIN fichas f ON f.id = o.id
  UNION ALL
  -- A CR base do navio é 10 (sem atributo); o casco soma o resto.
  SELECT
    md5(o.id || ':madeira')::uuid::text, o.id, 'Casco de ' || o.madeira, 'passiva',
    'CR ' || o.cr || '. Bônus de Resistência ' || o.br || ': reduz todo dano recebido.',
    'Madeira', 1,
    jsonb_build_array(
      jsonb_build_object('tipo', 'modificador', 'alvo', 'cr', 'valor', o.cr - 10),
      jsonb_build_object('tipo', 'reducao_dano', 'valor', o.br)
    )
  FROM origem o JOIN fichas f ON f.id = o.id
  UNION ALL
  SELECT
    md5(o.id || ':proteger')::uuid::text, o.id, 'Proteger o Navio', 'passiva',
    'Tripulante de nível 8 ou mais que pula o turno dá +1 de CR ao navio, até +3. Um passo por tripulante protegendo.',
    'Tripulação', 2,
    jsonb_build_array(jsonb_build_object('tipo', 'progressivo', 'formula', '1', 'max', 3, 'em', 'cr'))
  FROM origem o JOIN fichas f ON f.id = o.id
  UNION ALL
  SELECT
    md5(o.id || ':artilharia')::uuid::text, o.id, 'Artilharia', 'passiva',
    'O acerto do navio soma o maior entre o modificador de PRE do capitão e o de DES dos atiradores. Homem das Armas: +5 nos canhões.',
    'Tripulação', 3,
    jsonb_build_array(jsonb_build_object('tipo', 'modificador', 'alvo', 'ataque', 'valor', 0))
  FROM origem o JOIN fichas f ON f.id = o.id
  UNION ALL
  SELECT
    md5(o.id || ':notas')::uuid::text, o.id, 'Notas', 'passiva', o.descricao, NULL, 4, '[]'::jsonb
  FROM origem o JOIN fichas f ON f.id = o.id
  WHERE o.descricao <> ''
  RETURNING id
),
-- Canhões (lib/navio.ts): a munição, a arma e a ação que dispara.
com_canhoes AS (
  SELECT o.id, LEAST(GREATEST(o.canhoes, 0), o.canhoes_max) AS n
  FROM origem o JOIN fichas f ON f.id = o.id
  WHERE o.canhoes > 0
),
bolas AS (
  INSERT INTO itens (id, personagem_id, nome, tipo, quantidade, dano)
  SELECT md5(c.id || ':bola')::uuid::text, c.id, 'Bola de Chumbo', 'municao', c.n * 10, '3d10 contundente'
  FROM com_canhoes c
  RETURNING id
),
armas AS (
  INSERT INTO itens (
    id, personagem_id, nome, tipo, quantidade, categoria, alcance, alcance_metros,
    modificador, propriedades, proficiente_arma, equipado, municao_id
  )
  SELECT
    md5(c.id || ':canhao')::uuid::text, c.id, 'Canhão', 'arma', c.n, 'fogo', 'distancia', '90/120',
    2, '["municao"]'::jsonb, false, true, md5(c.id || ':bola')::uuid::text
  FROM com_canhoes c
  RETURNING id
)
INSERT INTO acoes (id, personagem_id, nome, descricao, tipo, alcance, arma_ids, tipo_dano, arma_de_fogo, efeitos)
SELECT
  md5(c.id || ':disparar')::uuid::text, c.id, 'Disparar canhões',
  'No início do turno, uma jogada de ataque por canhão com efetivo e apontado pro alvo. '
    || 'Além do 3º, cada canhão pode virar Bombardeio (soma metade do dano de um acerto) ou Tiros de Teste (+3 na próxima jogada).',
  'padrao', '90/120 m', jsonb_build_array(md5(c.id || ':canhao')::uuid::text), 'Contundente', true,
  CASE WHEN c.n > 1
    THEN jsonb_build_array(jsonb_build_object('tipo', 'multi_ataque', 'vezes', LEAST(c.n, 20)))
    ELSE '[]'::jsonb END
FROM com_canhoes c;
