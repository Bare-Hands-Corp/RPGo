-- Converte os navios antigos (tabela `navios`) em subfichas da mesa, com a
-- mesma ficha de partida de `presetDeNavio` (lib/navio.ts).
-- Rodar uma vez, junto do deploy:
--   npx prisma db execute --file prisma/converter-navios.sql
-- Navio já convertido fica como está; a tabela `navios` não é alterada.

WITH tamanhos (slug, nome, dimensao, deques, comodos, tripulantes, canhoes, pv, desaceleracao) AS (
  VALUES
    ('pequeno',  'Pequeno',  '6×15×18 m',   1,  3,  10,  4,  150,  -2),
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
    t.nome AS tamanho,
    t.dimensao,
    t.deques,
    t.comodos,
    t.tripulantes,
    t.canhoes AS canhoes_max,
    t.pv,
    t.desaceleracao,
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
    id, user_id, dono_mesa_id, perfil, nome, hp_max, hp_atual, deslocamento, nado,
    forca, destreza, constituicao, sabedoria, vontade, presenca
  )
  SELECT
    id, narrador, mesa_id, 'veiculo', nome, pv, LEAST(GREATEST(pv_atual, 0), pv), velocidade_nos, 0,
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
      || ' · ' || o.desaceleracao || ' nós por peso',
    'Tamanho', 0, '[]'::jsonb
  FROM origem o JOIN fichas f ON f.id = o.id
  UNION ALL
  SELECT
    md5(o.id || ':madeira')::uuid::text, o.id, 'Casco de ' || o.madeira, 'passiva',
    'CR ' || o.cr || '. Bônus de Resistência ' || o.br || ': reduz todo dano recebido.',
    'Madeira', 1,
    jsonb_build_array(
      jsonb_build_object('tipo', 'valor_fixo', 'alvo', 'cr', 'valor', o.cr::text),
      jsonb_build_object('tipo', 'reducao_dano', 'valor', o.br)
    )
  FROM origem o JOIN fichas f ON f.id = o.id
  UNION ALL
  SELECT
    md5(o.id || ':notas')::uuid::text, o.id, 'Notas', 'passiva', o.descricao, NULL, 2, '[]'::jsonb
  FROM origem o JOIN fichas f ON f.id = o.id
  WHERE o.descricao <> ''
  RETURNING id
)
INSERT INTO recursos (id, personagem_id, nome, valor_atual, valor_max)
SELECT md5(o.id || ':canhoes')::uuid::text, o.id, 'Canhões', GREATEST(o.canhoes, 0), o.canhoes_max
FROM origem o JOIN fichas f ON f.id = o.id;
