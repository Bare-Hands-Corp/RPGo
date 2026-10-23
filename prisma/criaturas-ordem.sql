-- Criaturas: posição na lista do bestiário (arrastar pra reordenar). Só
-- acrescenta a coluna e numera as que já existem em ordem alfabética, que é a
-- ordem em que apareciam; não apaga nada.
--   npx prisma db execute --file prisma/criaturas-ordem.sql
-- NÃO usar `prisma db push` neste banco: ele está diferente do schema e o push
-- apagaria tabelas e colunas (navios, colunas antigas de itens/ações).
-- Só age se a coluna ainda não existe, então rodar de novo não muda nada.
--
-- 0 = sem posição: a criatura vai pro fim, então as criadas depois não
-- precisam calcular nada.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'criaturas' AND column_name = 'ordem'
  ) THEN
    ALTER TABLE criaturas ADD COLUMN ordem INTEGER NOT NULL DEFAULT 0;

    UPDATE criaturas SET ordem = numeradas.n
    FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY nome) AS n
      FROM criaturas
    ) AS numeradas
    WHERE criaturas.id = numeradas.id;
  END IF;
END $$;
