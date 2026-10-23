-- Ações: posição na lista da ficha (arrastar pra reordenar). Só acrescenta a
-- coluna e numera as que já existem na ordem em que apareciam; não apaga nada.
--   npx prisma db execute --file prisma/acoes-ordem.sql
-- NÃO usar `prisma db push` neste banco: ele está diferente do schema e o push
-- apagaria tabelas e colunas (navios, colunas antigas de itens/ações).
-- Só age se a coluna ainda não existe, então rodar de novo não muda nada.
--
-- A posição vale dentro do tipo (padrão, bônus…). 0 = sem posição: a ação vai
-- pro fim do tipo, então as criadas depois não precisam calcular nada.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acoes' AND column_name = 'ordem'
  ) THEN
    ALTER TABLE acoes ADD COLUMN ordem INTEGER NOT NULL DEFAULT 0;

    UPDATE acoes SET ordem = numeradas.n
    FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY personagem_id, tipo ORDER BY ctid) AS n
      FROM acoes
    ) AS numeradas
    WHERE acoes.id = numeradas.id;

    CREATE INDEX IF NOT EXISTS acoes_personagem_id_tipo_ordem_idx ON acoes (personagem_id, tipo, ordem);
  END IF;
END $$;
