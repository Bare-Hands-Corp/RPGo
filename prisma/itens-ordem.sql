-- Itens: posição na lista do inventário (arrastar pra reordenar). Só acrescenta
-- a coluna e numera os que já existem em ordem alfabética, que é a ordem em que
-- apareciam; não apaga nada.
--   npx prisma db execute --file prisma/itens-ordem.sql
-- NÃO usar `prisma db push` neste banco: ele está diferente do schema e o push
-- apagaria tabelas e colunas (navios, colunas antigas de itens/ações).
-- Só age se a coluna ainda não existe, então rodar de novo não muda nada.
--
-- 0 = sem posição: o item vai pro fim, então os criados depois não precisam
-- calcular nada.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'itens' AND column_name = 'ordem'
  ) THEN
    ALTER TABLE itens ADD COLUMN ordem INTEGER NOT NULL DEFAULT 0;

    UPDATE itens SET ordem = numerados.n
    FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY personagem_id ORDER BY nome) AS n
      FROM itens
    ) AS numerados
    WHERE itens.id = numerados.id;
  END IF;
END $$;
